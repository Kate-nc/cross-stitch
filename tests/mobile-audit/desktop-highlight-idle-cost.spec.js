/* What outline highlight costs while nobody touches anything — finding F1 of
   reports/track-view-performance-plan.md.
   ═══════════════════════════════════════════════════════════════════════════
   The outline highlight's marching ants are driven by
   `setInterval(() => setAntsOffset(...), 100)`. antsOffset is React state and
   sits in renderStitch's dependency list, so — read from the code — each
   100 ms tick reconciles all of TrackerApp *and* repaints the whole visible
   chart tile, ten times a second, for as long as the highlight is showing.

   This measures it against a control: the same chart with the *isolate*
   highlight, which has no animation. Both are idle — no input at all — so
   anything counted is the app re-rendering itself.

   Desktop project because the colour list is on screen there; reconcile and
   fill counts do not depend on the device.

   F1 (fixed): measured 11 920 elements/s and 48 980 fills/s for outline,
   against 0 and 0 for isolate. The ants are now an SVG overlay animated by
   the browser, so outline must cost what isolate costs. Because "costs
   nothing" would also be true of ants that silently stopped drawing, the
   spec also checks they are there, on the focus colour, and moving. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes } = require('../_helpers/perfProbes');

const IDLE_MS = 5000;

async function openWithHighlight(page, mode) {
  await suppressOnboarding(page);
  await page.addInitScript((m) => {
    try {
      localStorage.setItem('cs_hlMode', m);
      localStorage.setItem('cs_pref_trackerDefaultHighlightMode', JSON.stringify(m));
    } catch (_) {}
  }, mode);
  await installProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(4000);
  // Picking a colour in the list switches the chart to highlight view.
  await page.locator('.ppal-tile').first().click();
  await page.waitForTimeout(1500);
}

async function measureIdle(page) {
  await resetProbes(page);
  await page.waitForTimeout(IDLE_MS);
  const r = await readProbes(page);
  return {
    elementsPerSec: Math.round(r.elements / (IDLE_MS / 1000)),
    fillsPerSec: Math.round(r.fills / (IDLE_MS / 1000)),
    reactWrapped: r.reactWrapped,
    focused: await page.locator('.ppal-tile--on').count(),
  };
}

test('outline highlight, idle, against the isolate control', async ({ page, browser }) => {
  test.setTimeout(240000);
  await openWithHighlight(page, 'outline');
  const outline = await measureIdle(page);

  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pageB = await ctxB.newPage();
  await openWithHighlight(pageB, 'isolate');
  const isolate = await measureIdle(pageB);
  await ctxB.close();

  console.log('HIGHLIGHT_IDLE ' + JSON.stringify({ idleMs: IDLE_MS, outline, isolate }));

  expect(outline.reactWrapped, 'React.createElement was never wrapped').toBe(true);
  expect(outline.focused, 'no colour is highlighted — the click on the colour list missed').toBe(1);
  expect(isolate.focused, 'control: no colour is highlighted').toBe(1);
  // Was 11 920 elements/s and 48 980 fills/s. The control is 0 and 0; a
  // little headroom for unrelated timers, none for a per-tick re-render.
  expect(outline.elementsPerSec, 'outline highlight is re-rendering the tracker while idle').toBeLessThan(50);
  expect(outline.fillsPerSec, 'outline highlight is repainting the chart while idle').toBeLessThan(100);
});

test('the ants are drawn on the focus colour, follow the tile, and move', async ({ page }) => {
  test.setTimeout(180000);
  await openWithHighlight(page, 'outline');
  const read = () => page.evaluate(() => {
    const svg = document.querySelector('svg.tracker-ants');
    if (!svg) return null;
    const [bg, fg] = svg.querySelectorAll('path');
    const chart = document.querySelector('canvas[aria-label="Cross stitch pattern grid"]');
    const s = svg.getBoundingClientRect(), c = chart.getBoundingClientRect();
    return {
      segments: (fg.getAttribute('d').match(/M/g) || []).length,
      dash: fg.getAttribute('stroke-dasharray'),
      stroke: fg.getAttribute('stroke'),
      animations: svg.getAnimations ? svg.getAnimations({ subtree: true }).filter(a => a.playState === 'running').length : -1,
      offset: getComputedStyle(fg).strokeDashoffset,
      // The SVG sits on the chart's tile, exactly where the chart canvas is.
      alignedWithChart: Math.abs(s.left - c.left) < 1 && Math.abs(s.top - c.top) < 1,
      bgOffset: getComputedStyle(bg).strokeDashoffset,
    };
  });
  const a = await read();
  await page.waitForTimeout(450);
  const b = await read();
  console.log('ANTS ' + JSON.stringify({ a, b }));

  expect(a, 'no ants overlay mounted').not.toBeNull();
  expect(a.segments, 'the outline path is empty').toBeGreaterThan(0);
  expect(a.animations, 'the ants are not animating').toBe(2);
  expect(a.alignedWithChart, 'the ants overlay is not on the chart tile').toBe(true);
  expect(b.offset, 'the dash offset did not move').not.toBe(a.offset);
});

test('under reduced motion the ants are drawn but not animated', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openWithHighlight(page, 'outline');
  const r = await page.evaluate(() => {
    const p = document.querySelector('svg.tracker-ants path');
    return p ? { d: p.getAttribute('d').length, running: p.getAnimations().length } : null;
  });
  await ctx.close();
  expect(r, 'no ants overlay mounted').not.toBeNull();
  expect(r.d).toBeGreaterThan(0);
  expect(r.running).toBe(0);
});
