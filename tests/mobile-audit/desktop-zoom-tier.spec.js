/* Zooming across the detail tiers with a keyboard, the zoom buttons and
   Ctrl + wheel — reports/track-zoom-tier-transition.md.
   ═══════════════════════════════════════════════════════════════════════════
   When a zoom crossed a tier threshold (symbols, or half stitches and
   backstitch, appearing or going), the tracker faded them in or out by
   repainting the whole chart on every animation frame for 150-200 ms, on top
   of the zoom's own repaint: 4-13 full paints per crossing. Each crossing now
   paints the chart once, at the new tier.

   On the 400 x 500, 60-colour fixture (and its mixed-stitch twin), no CPU
   throttle, asserting on counts (zoomTierProbes.js): full paints per step,
   repeats (a paint at the same cell size as the one before it: a fade
   frame), paints whose detail does not match their tier, and the settled
   chart against a fresh paint of the same view. Times are logged only.

   Hysteresis matters for the scripts below: the tracker starts in Tier 3 and
   computeDetailTier only leaves a tier past its far threshold (Tier 2 to 3 at
   13 px, back below 10 px), so a 10% key step does not cross back on the
   next press. Starting zooms are chosen so each crossing step really crosses. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { waitForSaved } = require('../_helpers/perfProbes');
const { fixtureWith } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');
const { installZoomTierProbes, measureSteps, settledMatchesFreshPaint, zoomButton } = require('../_helpers/zoomTierProbes');

const SETTLE_MS = 900;

async function open(page, zoom, mixed) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await installZoomTierProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixtureFor('large', { doneFraction: 0.3, mixed: !!mixed }), { savedZoom: zoom, savedScroll: { left: 1200, top: 1200 } }));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(10000);
  await waitForSaved(page);
  await page.mouse.move(5, 5);
}

function log(label, rows) {
  console.log(label + ' ' + JSON.stringify(rows.map(({ last, ...r }) => r)));
}

/* The checks every step makes: no fade frames, every paint at its tier. */
function expectNoFade(rows) {
  for (const r of rows) {
    expect(r.repeats, `${r.step} to ${r.zoom}%: ${r.repeats} repaints at an unchanged cell size`).toBe(0);
    expect(r.wrongTier, `${r.step} to ${r.zoom}%: a paint drawn with another tier's detail`).toBe(0);
  }
}

const key = (page, k) => ({ name: k, run: () => page.keyboard.press(k) });
const button = (page, w) => ({ name: 'button ' + w, run: () => zoomButton(page, w) });

test('keyboard zoom across every tier, in and out, paints each step once at its tier', async ({ page }) => {
  test.setTimeout(300000);
  await open(page, 0.2);   // 4 px: Tier 2
  // Up to 140% (Tier 3 at 70%, Tier 4 at 130%), down to 10% (Tier 3 at 100%,
  // Tier 2 at 40%, Tier 1 at 10%) and back up to 30% (Tier 2).
  const keys = [...Array(12).fill('='), ...Array(13).fill('-'), '=', '='];
  const rows = await measureSteps(page, keys.map((k) => key(page, k)), SETTLE_MS);
  log('KEY_ZOOM', rows);
  const fresh = await settledMatchesFreshPaint(page);
  console.log('KEY_ZOOM_FRESH ' + JSON.stringify(fresh));

  expect(rows[11].zoom, 'did not reach 140%').toBe(140);
  expect(rows[24].zoom, 'did not reach 10%').toBe(10);
  // Every threshold was crossed, both ways.
  const seq = rows.map((r) => r.tiers).join('');
  for (const pair of ['23', '34', '43', '32', '21', '12']) expect(seq.includes(pair), `never crossed from Tier ${pair[0]} to ${pair[1]}`).toBe(true);
  for (const r of rows) expect(r.paints, `${r.step} to ${r.zoom}%: ${r.paints} full paints`).toBe(1);
  expectNoFade(rows);
  expect(fresh.diff, 'the settled chart differs from a fresh paint of it').toBe(0);
});

test('zoom buttons across the symbol threshold paint once per press', async ({ page }) => {
  test.setTimeout(240000);
  await open(page, 0.4);   // 8 px: Tier 2
  // 65% (13 px, Tier 3) > 40% (Tier 2) > 15% (3 px, still 2) > 40% > 65% (Tier 3).
  const rows = await measureSteps(page, ['in', 'out', 'out', 'in', 'in'].map((w) => button(page, w)), SETTLE_MS);
  log('BUTTON_ZOOM', rows);
  const fresh = await settledMatchesFreshPaint(page);
  expect(rows.map((r) => r.zoom)).toEqual([65, 40, 15, 40, 65]);
  expect(rows.map((r) => r.tiers).join(''), 'the presses did not cross the symbol threshold both ways').toBe('32223');
  for (const r of rows) expect(r.paints, `${r.step} to ${r.zoom}%`).toBe(1);
  expectNoFade(rows);
  expect(fresh.diff).toBe(0);
});

test('Ctrl + wheel across the symbol threshold commits at the new tier, without fade repaints', async ({ page }) => {
  test.setTimeout(240000);
  await open(page, 0.4);   // 8 px: Tier 2
  const box = await page.evaluate(() => { const b = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  const wheel = (dy, n) => async () => {
    await page.keyboard.down('Control');
    for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(16); }
    await page.keyboard.up('Control');
  };
  const rows = await measureSteps(page, [
    { name: 'wheel in', run: wheel(-20, 8) },
    { name: 'wheel out', run: wheel(20, 10) },
    { name: 'wheel in, then out before it commits', run: async () => { await wheel(-20, 8)(); await wheel(20, 8)(); } },
  ], SETTLE_MS);
  log('WHEEL_ZOOM', rows);
  const fresh = await settledMatchesFreshPaint(page);
  expect(rows[0].zoom, 'the wheel did not zoom in past the symbol threshold').toBeGreaterThanOrEqual(65);
  expect(rows[1].zoom, 'the wheel did not zoom out past it').toBeLessThan(40);
  expect(rows.map((r) => r.tiers.slice(-1)).join(''), 'the commits did not land in Tiers 3, 2, 2').toBe('322');
  // A paint per preview rebase (every 1.6x) and one for the commit, each at
  // a new cell size: nothing repainted for a fade.
  expectNoFade(rows);
  expect(fresh.diff).toBe(0);
});

test('rapid direction changes across a threshold settle on the right tier', async ({ page }) => {
  test.setTimeout(240000);
  // 40% (Tier 2) and 65% (Tier 3) alternately by the zoom buttons, as fast as
  // they can be pressed: each press lands inside the last one's old fade.
  await open(page, 0.4);
  const flips = async () => { for (let i = 0; i < 7; i++) { await zoomButton(page, i % 2 ? 'out' : 'in'); await page.waitForTimeout(30); } };
  const rows = await measureSteps(page, [
    { name: 'seven flips, ending in', run: flips },
    ...['out', 'out', 'in', 'in'].map((w) => button(page, w)),
  ], 1200);
  log('FLIP_ZOOM', rows);
  const fresh = await settledMatchesFreshPaint(page);
  expect(rows.map((r) => r.zoom)).toEqual([65, 40, 15, 40, 65]);
  // At most one paint per press (two presses can share a render).
  expect(rows[0].paints, 'seven presses').toBeLessThanOrEqual(7);
  expect(rows[0].tiers.slice(-1), 'the flips ended at 65%, in Tier 3').toBe('3');
  expect(rows[0].last.text, 'no symbols after the flips ended in Tier 3').toBeGreaterThan(0);
  for (const r of rows.slice(1)) expect(r.paints, `${r.step} to ${r.zoom}%`).toBe(1);
  expectNoFade(rows);
  expect(fresh.diff).toBe(0);
});

test('a mixed-stitch chart crosses the half-stitch and backstitch threshold in one paint', async ({ page }) => {
  test.setTimeout(240000);
  await open(page, 0.3, true);   // 6 px: Tier 2
  // Down to 10% (Tier 1: half stitches and backstitch go), up to 30% (they
  // come back), on across the symbol threshold at 70% and back to 40%.
  const keys = ['-', '-', '=', '=', '=', '=', '=', '=', '-', '-', '-'];
  const rows = await measureSteps(page, keys.map((k) => key(page, k)), SETTLE_MS);
  log('MIXED_ZOOM', rows);
  const fresh = await settledMatchesFreshPaint(page);
  expect(rows.map((r) => r.zoom)).toEqual([20, 10, 20, 30, 40, 50, 60, 70, 60, 50, 40]);
  expect(rows.map((r) => r.tiers).join('')).toBe('21122223332');
  // The lines drawn (backstitch from Tier 2, half-stitch diagonals from Tier
  // 3, petites and long stitches throughout) at the same zoom in two tiers.
  // Totals depend mostly on how much chart is in view, so only the same zoom
  // is compared: 20% in Tier 2 and Tier 1, 50% and 60% in Tier 2 and 3, and
  // 40% twice in Tier 2 as a control.
  const strokes = rows.map((r) => r.last.strokes);
  console.log('MIXED_STROKES ' + JSON.stringify(strokes));
  expect(strokes[2], 'backstitch still drawn at 20% in Tier 1').toBeLessThan(strokes[0]);
  expect(strokes[9], 'no extra detail at 50% in Tier 3').toBeGreaterThan(strokes[5]);
  expect(strokes[8], 'no extra detail at 60% in Tier 3').toBeGreaterThan(strokes[6]);
  expect(strokes[10], '40% drew different lines on the way back in the same tier').toBe(strokes[4]);
  for (const r of rows) expect(r.paints, `${r.step} to ${r.zoom}%`).toBe(1);
  expectNoFade(rows);
  expect(fresh.diff).toBe(0);
});
