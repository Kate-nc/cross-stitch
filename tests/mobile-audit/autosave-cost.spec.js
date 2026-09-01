/* Autosave allocation cost while stitching — R7 (cheap half) in
   reports/mobile-freeze-large-patterns.md, and the "allocation count on
   autosave" guard its Part 5 asked for.
   ═══════════════════════════════════════════════════════════════════════════
   The tracker rebuilds a full project snapshot on a 5 s debounce whenever
   anything in its dependency list changes — which, while someone is actually
   stitching, means `done` and nothing else. `buildSnapshot` nonetheless ran
   `serializePattern(pat)` every time, allocating one fresh object per cell:
   200 000 of them on a 400x500 pattern, several times a minute, purely to
   produce a byte-identical array.

   `pat` is replaced wholesale on any pattern edit and is never mutated in
   place, so its identity is a sound cache key. This asserts the consequence:
   no matter how many saves a stitching session triggers, the pattern is
   serialised **once**.

   Counted work, not wall time — per the §H warning in
   mobile-experience-audit.md, timings on this harness vary 4-5x between
   identical runs. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');

async function openTracker(page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['tracker', 'creator', 'manager', 'home']) localStorage.setItem('cs_welcome_' + k + '_done', '1');
      localStorage.setItem('cs_stitchStyle', 'block');
      for (const k of ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator',
        'import', 'undo', 'progress', 'save']) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      }
    } catch (e) {}
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(3000);
}

/* Count how many *distinct* arrays serializePattern hands back. The tracker
   calls it through window.PatternIO, so wrapping that property intercepts the
   real call site rather than a copy of it. A fresh array means the 200 000
   allocations actually happened; the same array means they were skipped. */
async function instrument(page) {
  const ok = await page.evaluate(() => {
    if (!window.PatternIO || typeof window.PatternIO.serializePattern !== 'function') return false;
    window.__serCalls = 0;
    window.__serDistinct = 0;
    const seen = new Set();
    const orig = window.PatternIO.serializePattern;
    window.PatternIO.serializePattern = function (p) {
      window.__serCalls++;
      const out = orig.call(this, p);
      if (!seen.has(out)) { seen.add(out); window.__serDistinct++; }
      return out;
    };
    return true;
  });
  expect(ok, 'PatternIO.serializePattern not found — nothing was instrumented').toBe(true);
}

const scroller = () => {
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  return all.find(e => e.scrollWidth > e.clientWidth + 50 || e.scrollHeight > e.clientHeight + 50) || null;
};

test('a stitching session serialises the pattern once, not once per save', async ({ page }) => {
  await openTracker(page);
  await instrument(page);

  // Mark a few stitches with enough of a gap that the 5 s autosave debounce
  // fires between them — otherwise one save would cover the lot and the test
  // would pass without the memoisation doing anything.
  const box = await page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, scroller.toString());

  for (let i = 0; i < 3; i++) {
    await page.mouse.click(Math.round(box.x + 60 + i * 40), Math.round(box.y + 80));
    await page.waitForTimeout(6000);
  }

  const r = await page.evaluate(() => ({ calls: window.__serCalls, distinct: window.__serDistinct }));
  console.log('AUTOSAVE_SER ' + JSON.stringify(r));

  // The saves really did happen — otherwise `calls` would be 0 and `distinct`
  // trivially 1, and the test would prove nothing.
  expect(r.calls, 'no autosave ran, so this test is vacuous').toBeGreaterThan(1);
  // ...and every one of them reused the same serialised pattern.
  expect(r.distinct).toBe(1);
});
