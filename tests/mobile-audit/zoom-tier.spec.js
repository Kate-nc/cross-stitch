/* Pinching and pressing the zoom buttons across the detail tiers on a phone
   — reports/track-zoom-tier-transition.md.
   ═══════════════════════════════════════════════════════════════════════════
   A zoom that crossed a tier threshold used to fade the symbols (or half
   stitches and backstitch) in or out by repainting the whole chart on every
   animation frame for 150-200 ms after the zoom's own repaint. Now each
   crossing paints the chart once, at the new tier, and nothing animates.

   The phone project (Pixel 5 emulation) at 4x CPU throttle, on the 400 x 500,
   60-colour fixture, asserting on counts; times are logged only and are
   emulated (the canvas is drawn in software), not a device measurement. The
   desktop half (keyboard, Ctrl + wheel, rapid flips, a mixed-stitch chart) is
   desktop-zoom-tier.spec.js. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { cpuThrottle, waitForSaved, chartBox } = require('../_helpers/perfProbes');
const { fixtureWith, zoomPercent, cellAt } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');
const { installZoomTierProbes, measureSteps, settledMatchesFreshPaint, zoomButton } = require('../_helpers/zoomTierProbes');

async function open(page, zoom) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await installZoomTierProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixtureFor('large', { doneFraction: 0.3 }), { savedZoom: zoom, savedScroll: { left: 1200, top: 1200 } }));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(12000);
  await waitForSaved(page);
}

/** Two fingers moving apart (or together) from `spread` to `spreadTo` px,
 *  optionally on to `back` px within the same gesture; `cancel` ends it with
 *  touchCancel instead of lifting the fingers. */
async function pinch(cdp, x, y, { moves = 20, spread, spreadTo, back, cancel }) {
  const at = (d) => [
    { x: x - d / 2, y, id: 1, radiusX: 6, radiusY: 6, force: 1 },
    { x: x + d / 2, y, id: 2, radiusX: 6, radiusY: 6, force: 1 },
  ];
  const path = [];
  for (let k = 0; k <= moves; k++) path.push(spread + (spreadTo - spread) * k / moves);
  if (back != null) for (let k = 1; k <= moves; k++) path.push(spreadTo + (back - spreadTo) * k / moves);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(path[0]) });
  for (const d of path.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(d) });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
}

function log(label, rows) {
  console.log(label + ' ' + JSON.stringify(rows.map(({ last, ...r }) => r)));
}

test('pinches across the symbol threshold paint once each, at the new tier, keeping the anchor', async ({ page }) => {
  test.setTimeout(300000);
  await open(page, 0.4);   // 8 px: the tracker starts in Tier 3 and drops to Tier 2
  const box = await chartBox(page);
  const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
  const cdp = await cpuThrottle(page, 4);
  const anchors = [];
  const withAnchor = (name, opts) => ({ name, run: async () => {
    const before = await cellAt(page, x, y);
    await pinch(cdp, x, y, opts);
    await page.waitForTimeout(1800);
    anchors.push({ name, before, after: await cellAt(page, x, y) });
  } });
  const rows = await measureSteps(page, [
    // 40% out to ~75% (Tier 3)...
    withAnchor('spread', { spread: 140, spreadTo: 260 }),
    // ...and back in to ~40% (Tier 2).
    withAnchor('pinch', { spread: 240, spreadTo: 130 }),
    // Out past the threshold and back in within one gesture: only where it ends counts.
    { name: 'spread, then back', run: () => pinch(cdp, x, y, { spread: 140, spreadTo: 260, back: 150 }) },
    // A gesture the browser cancels part-way still commits what it showed.
    { name: 'spread, cancelled', run: () => pinch(cdp, x, y, { spread: 140, spreadTo: 260, cancel: true }) },
  ], 1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  log('PINCH_TIER', rows);
  console.log('PINCH_ANCHOR ' + JSON.stringify(anchors));
  const fresh = await settledMatchesFreshPaint(page);
  const transform = await page.evaluate(() => document.querySelector('.tracker-chart-layer').style.transform);
  console.log('PINCH_FRESH ' + JSON.stringify(fresh));

  expect(rows[0].zoom, 'the spread did not cross into symbols').toBeGreaterThanOrEqual(65);
  expect(rows[0].tiers.slice(-1), 'the spread did not end in Tier 3').toBe('3');
  expect(rows[1].tiers.slice(-1), 'the pinch did not end in Tier 2').toBe('2');
  expect(rows[1].zoom, 'the pinch did not leave symbols').toBeLessThan(50);
  expect(rows[3].zoom, 'the cancelled spread did not commit').toBeGreaterThanOrEqual(65);
  for (const r of rows) {
    // A paint per preview rebase (at 1.6x) and one for the commit, each at a
    // new cell size: never a fade's worth on top.
    expect(r.repeats, `${r.step}: ${r.repeats} repaints at an unchanged cell size`).toBe(0);
    expect(r.paints, `${r.step}: ${r.paints} full paints`).toBeLessThanOrEqual(2);
    expect(r.wrongTier, `${r.step}: a paint drawn with another tier's detail`).toBe(0);
  }
  for (const a of anchors) {
    expect(Math.abs(a.after.cx - a.before.cx), `${a.name}: the stitch under the fingers moved`).toBeLessThan(1);
    expect(Math.abs(a.after.cy - a.before.cy)).toBeLessThan(1);
  }
  expect(transform, 'the zoom preview transform was left on the chart').toBe('');
  expect(fresh.diff, 'the settled chart differs from a fresh paint of it').toBe(0);
  await cdp.detach().catch(() => {});
});

test('zoom buttons across the symbol threshold paint once per press', async ({ page }) => {
  test.setTimeout(300000);
  await open(page, 0.4);
  const cdp = await cpuThrottle(page, 4);
  // 40% (Tier 2) > 65% (13 px, Tier 3) > 40% (Tier 2) > 15% (still 2) > 40% > 65% (Tier 3).
  const rows = await measureSteps(page, ['in', 'out', 'out', 'in', 'in'].map((w) => ({ name: 'button ' + w, run: () => zoomButton(page, w) })), 1500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  log('PHONE_BUTTON_TIER', rows);
  const fresh = await settledMatchesFreshPaint(page);
  expect(rows.map((r) => r.zoom)).toEqual([65, 40, 15, 40, 65]);
  expect(rows.map((r) => r.tiers).join(''), 'the presses did not cross the symbol threshold both ways').toBe('32223');
  for (const r of rows) {
    expect(r.paints, `${r.step} to ${r.zoom}%`).toBe(1);
    expect(r.wrongTier).toBe(0);
  }
  expect(fresh.diff).toBe(0);
  await cdp.detach().catch(() => {});
});
