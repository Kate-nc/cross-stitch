const { test, expect } = require('@playwright/test');
const {
  dispatchTouchSequence,
  dispatchSyntheticTouchSequence,
  FIXTURE_CELL_SIZE,
  GRID_GUTTER,
  getCanvasCellPoint,
  loadTrackerFixture,
} = require('./touch-helpers');

test.describe('Tracker Touch Automation', function() {
  test('supports touch marking, panning, and pinch zoom on the stitch canvas', async function({ page }) {
    await loadTrackerFixture(page);

    const canvas = page.locator('canvas').first();
    const container = canvas.locator('xpath=../../..');
    const zoomPct = page.locator('.tb-zoom-pct');
    const progressText = page.locator('.tb-progress-txt');
    const canvasBox = await canvas.boundingBox();
    const cellPoint = await getCanvasCellPoint(canvas, 5, 5, FIXTURE_CELL_SIZE, GRID_GUTTER);

    expect(canvasBox).not.toBeNull();
    expect(await container.boundingBox()).not.toBeNull();

    await dispatchTouchSequence(page, [
      { type: 'touchStart', touchPoints: [{ id: 1, x: cellPoint.clientX, y: cellPoint.clientY }] },
      { type: 'touchEnd', touchPoints: [] },
    ]);

    await expect(progressText).toContainText('1 / 3,600');

    const scrollBefore = await container.evaluate(function(el) { return el.scrollLeft; });
    await dispatchSyntheticTouchSequence(canvas, [
      { type: 'touchstart', touchPoints: [{ id: 1, x: canvasBox.x + canvasBox.width * 0.75, y: canvasBox.y + canvasBox.height * 0.5 }] },
      { type: 'touchmove', touchPoints: [{ id: 1, x: canvasBox.x + canvasBox.width * 0.3, y: canvasBox.y + canvasBox.height * 0.5 }] },
      { type: 'touchend', touchPoints: [] },
    ]);

    await expect.poll(async function() {
      return container.evaluate(function(el) { return el.scrollLeft; });
    }).toBeGreaterThan(scrollBefore + 80);

    const zoomBefore = parseInt((await zoomPct.textContent()).replace('%', ''), 10);
    await dispatchSyntheticTouchSequence(canvas, [
      { type: 'touchstart', touchPoints: [
        { id: 1, x: canvasBox.x + canvasBox.width * 0.35, y: canvasBox.y + canvasBox.height * 0.35 },
        { id: 2, x: canvasBox.x + canvasBox.width * 0.55, y: canvasBox.y + canvasBox.height * 0.35 },
      ] },
      { type: 'touchmove', touchPoints: [
        { id: 1, x: canvasBox.x + canvasBox.width * 0.28, y: canvasBox.y + canvasBox.height * 0.35 },
        { id: 2, x: canvasBox.x + canvasBox.width * 0.72, y: canvasBox.y + canvasBox.height * 0.35 },
      ] },
      { type: 'touchend', touchPoints: [] },
    ]);

    await expect.poll(async function() {
      return parseInt((await zoomPct.textContent()).replace('%', ''), 10);
    }).toBeGreaterThan(zoomBefore);
  });
});