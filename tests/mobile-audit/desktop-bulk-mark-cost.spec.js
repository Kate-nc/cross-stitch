/* Cost of marking a whole colour done — the bulk-draw path.
   ═══════════════════════════════════════════════════════════════════════════
   `markColourDone` walks the pattern and calls `drawCellDirectly` for every
   cell it changed. That was reasonable when the chart canvas covered the whole
   pattern. Now that it covers only the visible tile, a draw for an off-tile
   cell is clipped away — pure waste, and on a 400x500 chart with 60 colours a
   single colour is ~3 300 cells of which a few dozen are on screen.

   Correctness is not at stake: the callers set skipNextFullRedrawRef, and
   scrolling into an off-tile region repaints it from `done`. So the cells are
   drawn when they become visible rather than never — which the second test
   here checks, because "we stopped drawing things" is only a fix if the
   things still appear.

   Counted work, not wall time (see §H of mobile-experience-audit.md). */
const { test, expect } = require('@playwright/test');
const { fixtureFor, fixturePalette, SIZES } = require('../_helpers/trackerFixture');
const { suppressOnboarding, SCROLLER_FN } = require('../_helpers/deviceEmulation');

async function openTracker(page) {
  await page.addInitScript(() => {
    // Count fills, and auto-accept the "mark all N stitches?" confirm.
    window.__fills = 0;
    const of = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function () { window.__fills++; return of.apply(this, arguments); };
    window.confirm = () => true;
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(3500);
}

/* The palette rail's per-colour "mark all done" control. On a phone the rail
   is collapsed behind a "Palette" chip, so open it first — otherwise the
   locator finds nothing and the test skips itself into being useless. */
async function markFirstColourDone(page) {
  if (await page.locator('.ppal-tile-done-btn').count() === 0) {
    // "Colours" in the phone mode strip opens the palette rail; the
    // "Palette" chip beside it does not.
    const colours = page.locator('.ppal-mode-btn', { hasText: /^Colours$/ }).first();
    if (await colours.count() > 0) {
      await colours.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  const btn = page.locator('.ppal-tile-done-btn').first();
  return { btn, count: await btn.count() };
}

test('marking a whole colour does not paint thousands of off-screen cells', async ({ page }) => {
  await suppressOnboarding(page);
  await openTracker(page);

  const { btn, count } = await markFirstColourDone(page);
  test.skip(count === 0, 'no per-colour complete control found in this build');

  await page.evaluate(() => { window.__fills = 0; });
  await btn.click({ force: true });
  await page.waitForTimeout(2500);

  const r = await page.evaluate(() => ({
    fills: window.__fills,
    tile: document.querySelector('canvas').__chartTile,
  }));
  console.log('BULK_MARK ' + JSON.stringify(r));

  // A colour on this fixture is ~3 300 cells. Only the on-tile ones should be
  // painted; the rest are clipped and were costing a fill each.
  expect(r.fills).toBeLessThan(2000);
});

test('cells marked off-screen still appear when scrolled to', async ({ page }) => {
  // The other half of the claim. Skipping off-tile draws is only correct if
  // the region repaints from `done` when it comes into view.
  //
  // Pixels are read through the chart's tile origin: the canvas covers only
  // the visible slice plus overscan, so chart pixel P sits at canvas pixel
  // (P - tile.x/y) * scale. An earlier version sampled whole-chart
  // coordinates, which since tiling lie past the canvas edge and read as
  // transparent both before and after — so it failed whatever the app drew.
  await suppressOnboarding(page);
  await openTracker(page);

  const { btn, count } = await markFirstColourDone(page);
  test.skip(count === 0, 'no per-colour complete control found in this build');

  // The colour that button completes, and a cell of it far down the chart
  // (the fixture cycles its palette: cell i has colour i % nColours).
  const id = (await page.locator('.ppal-tile').first().locator('.ppal-tile-id').textContent()).trim();
  const { sW, nColours } = SIZES.large;
  const k = fixturePalette(nColours).findIndex(c => c.id === id);
  expect(k, `DMC ${id} is not in the fixture palette`).toBeGreaterThanOrEqual(0);
  const y = 300;
  let x = 0;
  while ((y * sW + x) % nColours !== k) x++;

  const G = 28, scs = 20;
  const scrollTo = (top, left) => page.evaluate(({ fn, top, left }) => {
    const el = eval('(' + fn + ')')();
    el.scrollLeft = left; el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  }, { fn: SCROLLER_FN.toString(), top, left });
  const showTarget = () => scrollTo(G + y * scs - 200, Math.max(0, G + x * scs - 200));
  // A few pixels in from the cell's corner: clear of the grid line and of the
  // symbol glyph at the centre, so the sample is the cell's fill.
  const sample = () => page.evaluate(({ x, y, G, scs }) => {
    const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]');
    const t = c.__chartTile;
    const px = Math.round((G + x * scs + 4 - t.x) * t.scale);
    const py = Math.round((G + y * scs + 4 - t.y) * t.scale);
    if (px < 0 || py < 0 || px >= c.width || py >= c.height) return null;
    return Array.from(c.getContext('2d').getImageData(px, py, 1, 1).data);
  }, { x, y, G, scs });

  await showTarget();
  await page.waitForTimeout(1200);
  const before = await sample();

  // Off-tile again, then mark the colour: the target is now drawn by no one.
  await scrollTo(0, 0);
  await page.waitForTimeout(1200);
  await btn.click({ force: true });
  await page.waitForTimeout(2000);

  await showTarget();
  await page.waitForTimeout(1500);
  const after = await sample();

  console.log('BULK_MARK_SCROLLED ' + JSON.stringify({ id, cell: { x, y }, before, after }));
  expect(before, 'the target cell was not on the tile when sampled').not.toBeNull();
  expect(after, 'the target cell was not on the tile after scrolling back').not.toBeNull();
  expect(before[3], 'sampled a transparent pixel — the coordinates are wrong').toBe(255);
  expect(after.join(','), 'the scrolled-to cell did not repaint from its done state').not.toBe(before.join(','));
});
