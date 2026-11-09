/* A pinch settling on a phone: the view is painted first, the rest of the
   chart tile in the frames after — reports/track-zoom-settle.md.
   ═══════════════════════════════════════════════════════════════════════════
   The tile reaches 300 px past the view on every side, about three screens of
   stitches on a phone, and all of it used to be painted in the task that ends
   the pinch. Now that task paints the view and 100 px around it, and up to four
   strips follow, one a frame. These check, on the 400 x 500, 60-colour fixture
   (Pixel 5 emulation, 4x CPU), that:

     - the settling paint covers well under the tile, and the strips finish it;
     - no unpainted canvas is ever in view: one frame after the pinch, and on
       every frame of a pan started straight after it;
     - once settled, the canvas is pixel for pixel a fresh full paint, after a
       plain pinch, a reversal within a pinch, and two pinches back to back,
       on a full-cross chart, a mixed-stitch chart and a work area;
     - the stitch under the fingers stays there.

   Asserts on counts and pixels; times are not asserted (emulated, software
   raster). The desktop half (Ctrl + wheel at DPR 1 and 2) is
   desktop-zoom-settle.spec.js. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { cpuThrottle, waitForSaved, chartBox } = require('../_helpers/perfProbes');
const { fixtureWith, cellAt, zoomPercent } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');
const Z = require('../_helpers/zoomSettleProbes');

const AREA = { blockW: 10, blockH: 10, workArea: { active: true, x0: 100, y0: 100, x1: 300, y1: 400, bw: 20, bh: 30, setAt: 1 } };

async function open(page, { zoom = 0.3, mixed = false, fields = {} } = {}) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixtureFor('large', { doneFraction: 0.3, mixed }), { savedZoom: zoom, savedScroll: { left: 2400 * zoom, top: 3000 * zoom }, ...fields }));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 90000 });
  await page.waitForTimeout(8000);
  await waitForSaved(page);
}

test('a pinch paints the view first and finishes the tile after, with nothing blank or stale', async ({ page }) => {
  test.setTimeout(240000);
  await open(page);
  const full = await Z.tileCells(page);
  const box = await chartBox(page);
  const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
  const before = await cellAt(page, x, y);
  const cdp = await cpuThrottle(page, 4);
  // 140 to 200 px: x1.43, under the 1.6 rebase, so one settling paint.
  await Z.recordPaints(page);
  await Z.pinch(cdp, x, y, 140, 200);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const atCommit = await Z.blankInView(page);
  const settling = (await page.evaluate(() => window.__chartPaintPhases.paints.map((p) => p.cells)));
  await page.waitForTimeout(1500);
  const paints = await Z.readPaints(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const whole = await Z.blankInCanvas(page);
  const after = await cellAt(page, x, y);
  const fullAfter = await Z.tileCells(page);   // a fresh full paint at the new zoom, for scale
  console.log('PINCH SETTLE ' + JSON.stringify({ full, fullAfter, settling, paints: paints.map((p) => p.cells), atCommit, whole, before, after }));

  expect(atCommit.blank, 'unpainted canvas in view one frame after the pinch').toBe(0);
  // The paint in the task that ended the pinch: the view and its margin, not the tile.
  expect(settling[0], 'the settling paint covered the whole tile').toBeLessThan(fullAfter * 0.6);
  // The strips (at most four) then finish the tile: nothing left unpainted anywhere on the canvas.
  expect(paints.length).toBeLessThanOrEqual(5);
  expect(paints.slice(1).every((p) => p.cells < fullAfter * 0.5)).toBe(true);
  expect(whole.blank, 'the tile was never finished').toBe(0);
  expect(Math.abs(after.cx - before.cx)).toBeLessThan(1);
  expect(Math.abs(after.cy - before.cy)).toBeLessThan(1);
  await cdp.detach().catch(() => {});
});

test('the settled canvas matches a fresh paint after reversals and back-to-back pinches, and a pan straight after shows no blank', async ({ page }) => {
  test.setTimeout(300000);
  await open(page);
  const box = await chartBox(page);
  const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
  const cdp = await cpuThrottle(page, 4);
  const rows = [];
  const check = async (name, run) => {
    await run();
    const atCommit = await Z.blankInView(page);
    await page.waitForTimeout(1500);
    const fresh = await Z.alignedFreshPaint(page);
    rows.push({ name, zoom: await zoomPercent(page), atCommit: atCommit.blank, stale: fresh.diff, max: fresh.max, shift: fresh.shift });
  };
  await check('spread x2 (a rebase on the way)', () => Z.pinch(cdp, x, y, 120, 240));
  await check('pinch x0.5', () => Z.pinch(cdp, x, y, 240, 120));
  await check('spread, then back within the pinch', () => Z.pinch(cdp, x, y, 140, 280, 150));
  await check('two pinches 40 ms apart', async () => { await Z.pinch(cdp, x, y, 240, 140, null, 15); await page.waitForTimeout(40); await Z.pinch(cdp, x, y, 140, 240, null, 15); });
  let panBlank = null;
  await check('spread, then a pan at once', async () => { await Z.pinch(cdp, x, y, 140, 200); panBlank = await Z.panCheckingBlank(page); });
  console.log('PINCH ROWS ' + JSON.stringify({ rows, panBlank }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  for (const r of rows) {
    expect(r.atCommit, `${r.name}: unpainted canvas in view after the commit`).toBe(0);
    expect(r.stale, `${r.name}: settled canvas differs from a fresh paint`).toBe(0);
  }
  expect(panBlank, 'unpainted canvas in view while panning straight after a pinch').toBe(0);
  await cdp.detach().catch(() => {});
});

for (const [name, opts] of [['a mixed-stitch chart', { mixed: true }], ['a work area', { fields: AREA }], ['symbols (100%)', { zoom: 1 }]]) {
  test(`${name}: a pinch in and out settles exactly`, async ({ page }) => {
    test.setTimeout(240000);
    await open(page, opts);
    const box = await chartBox(page);
    const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
    const cdp = await cpuThrottle(page, 4);
    const out = [];
    for (const [a, b] of [[140, 200], [200, 140]]) {
      await Z.pinch(cdp, x, y, a, b);
      const atCommit = await Z.blankInView(page);
      await page.waitForTimeout(1500);
      out.push({ atCommit: atCommit.blank, whole: (await Z.blankInCanvas(page)).blank, fresh: await Z.alignedFreshPaint(page) });
    }
    console.log('PINCH ' + name + ' ' + JSON.stringify(out));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    for (const r of out) {
      expect(r.atCommit).toBe(0);
      expect(r.whole).toBe(0);
      expect(r.fresh.diff).toBe(0);
    }
    await cdp.detach().catch(() => {});
  });
}
