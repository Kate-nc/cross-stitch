const { test, expect } = require('@playwright/test');
const {
  FIXTURE_CELL_SIZE,
  GRID_GUTTER,
  chooseRedCreatorPaletteChip,
  dispatchPointerSequence,
  getCanvasCellPoint,
  getLargestCanvas,
  loadCreatorFixture,
  sampleCanvasPixel,
} = require('./touch-helpers');

test.describe('Creator Touch Automation', function() {
  test('supports single-finger panning and pinch zoom on the pattern canvas', async function({ page }) {
    await loadCreatorFixture(page);

    const canvas = await getLargestCanvas(page);
    const container = canvas.locator('xpath=..');
    const zoomPct = page.locator('.tb-zoom-pct');
    const box = await canvas.boundingBox();

    expect(box).not.toBeNull();
    await expect(canvas).toBeVisible();
    await expect(zoomPct).toHaveText(/%/);

    const zoomBefore = parseInt((await zoomPct.textContent()).replace('%', ''), 10);
    await dispatchPointerSequence(canvas, [
      { type: 'pointerdown', pointerId: 1, isPrimary: true, x: box.x + box.width * 0.35, y: box.y + box.height * 0.35 },
      { type: 'pointerdown', pointerId: 2, isPrimary: false, x: box.x + box.width * 0.55, y: box.y + box.height * 0.35 },
      { type: 'pointermove', pointerId: 1, isPrimary: true, x: box.x + box.width * 0.28, y: box.y + box.height * 0.35 },
      { type: 'pointermove', pointerId: 2, isPrimary: false, x: box.x + box.width * 0.72, y: box.y + box.height * 0.35 },
      { type: 'pointerup', pointerId: 2, isPrimary: false, x: box.x + box.width * 0.72, y: box.y + box.height * 0.35 },
      { type: 'pointerup', pointerId: 1, isPrimary: true, x: box.x + box.width * 0.28, y: box.y + box.height * 0.35 },
    ]);

    await expect.poll(async function() {
      return parseInt((await zoomPct.textContent()).replace('%', ''), 10);
    }).toBeGreaterThan(zoomBefore);

    const scrollBefore = await container.evaluate(function(el) { return el.scrollLeft; });
    await dispatchPointerSequence(canvas, [
      { type: 'pointerdown', pointerId: 1, x: box.x + box.width * 0.75, y: box.y + box.height * 0.5 },
      { type: 'pointermove', pointerId: 1, x: box.x + box.width * 0.35, y: box.y + box.height * 0.5 },
      { type: 'pointerup', pointerId: 1, x: box.x + box.width * 0.35, y: box.y + box.height * 0.5 },
    ]);

    await expect.poll(async function() {
      return container.evaluate(function(el) { return el.scrollLeft; });
    }).toBeGreaterThan(scrollBefore + 80);
  });

  test('supports touch palette selection and paint drags', async function({ page }) {
    await loadCreatorFixture(page);

    const canvas = await getLargestCanvas(page);
    const target = await getCanvasCellPoint(canvas, 10, 10, FIXTURE_CELL_SIZE, GRID_GUTTER);

    await expect(canvas).toBeVisible();

    await page.getByRole('button', { name: /^Cross$/i }).tap();
    await chooseRedCreatorPaletteChip(page);

    const before = await sampleCanvasPixel(canvas, target.localX, target.localY);
    expect(before[0]).toBeLessThan(80);

    await dispatchPointerSequence(canvas, [
      { type: 'pointerdown', pointerId: 1, x: target.clientX, y: target.clientY },
      { type: 'pointermove', pointerId: 1, x: target.clientX + 22, y: target.clientY },
      { type: 'pointerup', pointerId: 1, x: target.clientX + 22, y: target.clientY },
    ]);

    await expect.poll(async function() {
      const pixel = await sampleCanvasPixel(canvas, target.localX, target.localY);
      return pixel[0];
    }).toBeGreaterThan(180);
  });
});