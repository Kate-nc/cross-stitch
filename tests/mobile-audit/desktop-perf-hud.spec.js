/* The ?perf=1 readout (perf-hud.js) — Phase 0 of
   reports/track-view-performance-plan.md.
   ═══════════════════════════════════════════════════════════════════════════
   Two properties matter: it is completely absent unless asked for, and when
   asked for its counters actually move. A readout that loads but reads zero
   would send someone measuring on a real phone home with wrong numbers. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding, SCROLLER_FN } = require('../_helpers/deviceEmulation');

async function open(page, query) {
  await suppressOnboarding(page);
  await page.goto('/stitch.html?from=home' + query, { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('medium'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(2500);
}

test('without ?perf=1 nothing is loaded or wrapped', async ({ page }) => {
  await open(page, '');
  const r = await page.evaluate(() => ({
    script: !!document.querySelector('script[src="perf-hud.js"]'),
    panel: !!document.getElementById('perf-hud'),
    api: typeof window.__perfHud,
    wrapped: !!(window.React && window.React.__perfHudWrapped),
  }));
  expect(r).toEqual({ script: false, panel: false, api: 'undefined', wrapped: false });
});

test('with ?perf=1 the readout appears and its counters move', async ({ page }) => {
  await open(page, '&perf=1');
  await expect(page.locator('#perf-hud')).toBeVisible();

  await page.evaluate(() => window.__perfHud.reset());
  // A tap on the chart: should register as a tap, a re-render and a worker
  // post (the analysis re-run, 500 ms after the change).
  const box = await page.evaluate((src) => {
    const el = (new Function('return (' + src + ')()'))();
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, SCROLLER_FN.toString());
  await page.mouse.click(Math.round(box.x + box.w * 0.4), Math.round(box.y + box.h * 0.4));
  await page.waitForTimeout(2500);

  const s = await page.evaluate(() => window.__perfHud.snapshot());
  console.log('PERF_HUD_SNAPSHOT ' + JSON.stringify({ now: s.now, taps: s.taps, posts: s.workerPosts }));
  expect(s.device.reactWrapped).toBe(true);
  expect(s.now.fps, 'the frame meter is not running').toBeGreaterThan(0);
  expect(s.taps.length, 'the tap was not timed').toBeGreaterThan(0);
  expect(s.workerPosts.length, 'the analysis post was not seen').toBeGreaterThan(0);
  expect(s.perSecond.some(p => p.elements > 0), 'no re-render was counted').toBe(true);
  await expect(page.locator('#perf-hud')).toContainText('Last tap');
});
