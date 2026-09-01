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
const { fixtureFor } = require('../_helpers/trackerFixture');
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
  await suppressOnboarding(page);
  await openTracker(page);

  const { btn, count } = await markFirstColourDone(page);
  test.skip(count === 0, 'no per-colour complete control found in this build');
  await btn.click({ force: true });
  await page.waitForTimeout(2000);

  // Scroll well beyond the tile, into a region whose cells were never drawn.
  await page.evaluate((fn) => {
    const el = eval('(' + fn + ')')();
    el.scrollLeft = 3000; el.scrollTop = 4000;
    el.dispatchEvent(new Event('scroll'));
  }, SCROLLER_FN.toString());
  await page.waitForTimeout(1500);

  // The done colour renders as a distinct fill, so the newly-exposed region
  // must show more than a single flat colour.
  const distinct = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const w = Math.min(200, c.width), h = Math.min(200, c.height);
    const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), w, h).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size;
  });
  console.log('BULK_MARK_SCROLLED distinctColours=' + distinct);
  expect(distinct, 'the scrolled-to region did not repaint').toBeGreaterThan(2);
});
