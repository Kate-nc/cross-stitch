/* Ctrl + wheel zoom settling on desktop, at DPR 1 and 2 — the desktop half of
   zoom-settle.spec.js (reports/track-zoom-settle.md).
   ═══════════════════════════════════════════════════════════════════════════
   A run of Ctrl + wheel events (or a trackpad pinch, which arrives as one) is
   previewed and committed 160 ms after the last event. The commit paints the
   view first and the rest of the tile in the frames after. Checked on the
   400 x 500, 60-colour fixture: no unpainted canvas in view after the commit
   or while panning straight after it, the tile finished, and the settled
   canvas pixel for pixel a fresh full paint, in and out, on a full-cross and
   a mixed-stitch chart. Counts and pixels only. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { waitForSaved, chartBox } = require('../_helpers/perfProbes');
const { fixtureWith, zoomPercent } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');
const Z = require('../_helpers/zoomSettleProbes');

async function open(page, mixed) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixtureFor('large', { doneFraction: 0.3, mixed }), { savedZoom: 0.3, savedScroll: { left: 720, top: 900 } }));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 90000 });
  await page.waitForTimeout(8000);
  await waitForSaved(page);
}

for (const dpr of [1, 2]) {
  test.describe(`DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    for (const mixed of [false, true]) {
      test(`Ctrl + wheel in and out settles exactly${mixed ? ' (mixed stitches)' : ''}`, async ({ page }) => {
        test.setTimeout(240000);
        await open(page, mixed);
        const box = await chartBox(page);
        const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
        const rows = [];
        for (const [name, dy, n] of [['in', -40, 8], ['out', 40, 8], ['in again', -40, 12]]) {
          await Z.recordPaints(page);
          await Z.ctrlWheel(page, x, y, dy, n);
          await page.waitForTimeout(200);   // the 160 ms idle commit
          const atCommit = await Z.blankInView(page);
          await page.waitForTimeout(1000);
          const paints = await Z.readPaints(page);
          const whole = await Z.blankInCanvas(page);
          const fresh = await Z.alignedFreshPaint(page);
          rows.push({ name, zoom: await zoomPercent(page), paints: paints.map((p) => p.cells), atCommit: atCommit.blank, whole: whole.blank, stale: fresh.diff, max: fresh.max });
        }
        // Zoom in, then pan inside the frames the rest of the tile is still being painted in.
        await Z.ctrlWheel(page, x, y, -40, 6);
        await page.waitForTimeout(180);
        const panBlank = await Z.panCheckingBlank(page);
        await page.waitForTimeout(1000);
        const afterPan = await Z.alignedFreshPaint(page);
        console.log(`WHEEL DPR ${dpr}${mixed ? ' mixed' : ''} ` + JSON.stringify({ rows, panBlank, afterPan: afterPan.diff }));
        for (const r of rows) {
          expect(r.atCommit, `${r.name}: unpainted canvas in view after the commit`).toBe(0);
          expect(r.whole, `${r.name}: tile not finished`).toBe(0);
          expect(r.stale, `${r.name}: settled canvas differs from a fresh paint`).toBe(0);
        }
        expect(panBlank, 'unpainted canvas in view while panning straight after the zoom').toBe(0);
        // afterPan is logged, not asserted: once the pan has moved the tile, the
        // strips a tile move paints leave a few pixels along the tile's last rows
        // and on some mixed-stitch objects a few levels off a fresh paint. That
        // predates this change (a plain pan with no zoom does the same) and is
        // reported in reports/track-zoom-settle.md, "Not covered".
      });
    }
  });
}
