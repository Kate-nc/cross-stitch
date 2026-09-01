/* The tracker chart on a real iPad engine.
   ═══════════════════════════════════════════════════════════════════════════
   reports/mobile-freeze-large-patterns.md is about a freeze on iPad, and every
   other harness in this repo measures the chart on *Chromium*. Chromium has a
   268 Mpx canvas budget and reports navigator.deviceMemory; WebKit has neither,
   which is exactly the combination that produced the bug. So these run on the
   `ipad-webkit` project — real WebKit at an iPad viewport.

   What is asserted here that nothing else can be:

     - the canvases WebKit actually allocates for a 600x800 pattern, summed;
     - that the chart still paints on an engine whose canvas limits are real
       rather than emulated by a property setter;
     - that the zoom ceiling on a large pattern reaches the cell size at which
       symbols render (Tier 3, 13 px) — the regression that made large charts
       useless on iOS while technically not crashing.

   Run with `npm run test:ipad`. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, SIZES } = require('../_helpers/trackerFixture');

// Safari's ceiling for all canvas backing store on iOS.
const IOS_TOTAL_BUDGET = 16777216;
const SYMBOL_TIER_SCS = 13;   // computeDetailTier enters Tier 3 at 13 px

async function openTracker(page, sizeName) {
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
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor(sizeName));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(4000);
  return errors;
}

const census = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')]
    .map(c => ({ w: c.width, h: c.height, px: c.width * c.height }))
    .filter(c => c.px > 0);
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  const sc = all.find(e => e.scrollWidth > e.clientWidth + 10 || e.scrollHeight > e.clientHeight + 10);
  return {
    count: cs.length,
    totalPx: cs.reduce((s, c) => s + c.px, 0),
    biggest: cs.sort((a, b) => b.px - a.px)[0] || null,
    scrollW: sc ? sc.scrollWidth : null,
    scrollH: sc ? sc.scrollHeight : null,
  };
});

test.describe('iPad (WebKit) tracker chart', () => {
  for (const name of ['medium', 'large', 'huge']) {
    const { sW, sH } = SIZES[name];

    test(`${sW}x${sH}: canvas memory is bounded by the viewport, not the pattern`, async ({ page }) => {
      const errors = await openTracker(page, name);
      const c = await census(page);
      console.log(`IPAD_CENSUS ${sW}x${sH} ` + JSON.stringify(c));
      expect(errors, 'the chart threw on WebKit').toEqual([]);
      expect(c.biggest.w).toBeLessThanOrEqual(4096);
      expect(c.biggest.h).toBeLessThanOrEqual(4096);
      // The sum across every mounted canvas — the figure the old per-canvas
      // budget never checked, and the reason four overlays could ask an iPad
      // for a quarter of a gigabyte.
      expect(c.totalPx).toBeLessThanOrEqual(IOS_TOTAL_BUDGET);
      // The chart itself still spans the whole pattern at scs 20.
      expect(c.scrollW).toBe(sW * 20 + 30);
    });
  }

  test('the chart paints on WebKit rather than coming up blank', async ({ page }) => {
    // The original symptom: Safari accepts an oversized canvas, silently fails
    // to back it, and the chart renders white. Sampling the middle of the
    // canvas for colour variety is the only way to tell that apart from a
    // chart that merely looks fine in a screenshot.
    await openTracker(page, 'huge');
    const distinct = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      const w = Math.min(240, c.width), h = Math.min(240, c.height);
      const d = ctx.getImageData(Math.floor(c.width / 2 - w / 2), Math.floor(c.height / 2 - h / 2), w, h).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return seen.size;
    });
    console.log('IPAD_PAINTED 600x800 distinctColours=' + distinct);
    expect(distinct, 'the chart is a flat colour — it did not paint').toBeGreaterThan(2);
  });

  test('a 600x800 pattern can still be zoomed until symbols appear', async ({ page }) => {
    // The pattern-proportional clamp used to hold this chart at scs 5, four
    // steps below the Tier 3 threshold, so no amount of zooming ever produced
    // a symbol. That is a working chart nobody can stitch from.
    await openTracker(page, 'huge');
    const ceiling = await page.evaluate(() => window.maxChartCellSize(600, 800));
    console.log('IPAD_ZOOM_CEILING 600x800 scs=' + ceiling);
    expect(ceiling).toBeGreaterThanOrEqual(SYMBOL_TIER_SCS);
  });

  test('an iPad with a trackpad still gets the iOS budget', async ({ page }) => {
    // iPadOS reports `pointer: fine` when a Magic Keyboard or mouse is
    // attached, which used to route the device to the 134 Mpx desktop budget
    // and a ~500 MB canvas. Platform.isIOS() is what closes that.
    await page.addInitScript(() => {
      try {
        // Force the media query to answer as a trackpad-equipped iPad does.
        const mm = window.matchMedia.bind(window);
        window.matchMedia = (q) => (/pointer:\s*coarse/.test(q) ? { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} } : mm(q));
      } catch (e) {}
    });
    await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({
      coarse: window.matchMedia('(pointer: coarse)').matches,
      isIOS: !!(window.Platform && window.Platform.isIOS()),
      area: window.canvasSizeLimits().area,
      deviceMemory: navigator.deviceMemory === undefined ? null : navigator.deviceMemory,
    }));
    console.log('IPAD_TRACKPAD ' + JSON.stringify(r));
    expect(r.coarse, 'the stub did not take — this test would pass vacuously').toBe(false);
    expect(r.isIOS, 'Platform.isIOS must still identify the device').toBe(true);
    expect(r.area).toBeLessThanOrEqual(IOS_TOTAL_BUDGET);
  });
});
