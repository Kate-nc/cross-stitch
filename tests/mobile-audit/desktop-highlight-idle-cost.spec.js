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
   fill counts do not depend on the device. Baseline only: Phase 1 turns it
   into a ceiling. */
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
});
