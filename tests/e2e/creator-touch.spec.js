const { test, expect, devices } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
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
  // A touch tablet, whichever config runs this: playwright.creator.config.js
  // matches creator-*.spec.js too, and its mouse desktop can't tap and its
  // phone layout has no zoom label. (Chromium: the device's default is WebKit.)
  const { defaultBrowserType, ...ipadMini } = devices['iPad Mini'];   // eslint-disable-line no-unused-vars
  test.use(ipadMini);
  test('supports single-finger panning and pinch zoom on the pattern canvas', async function({ page }) {
    await loadCreatorFixture(page);

    const canvas = await getLargestCanvas(page);
    const container = canvas.locator('xpath=..');
    // Zoom shows as the chart's size on screen: touch layouts are compact and
    // have no zoom percentage.
    const shownWidth = function() { return canvas.evaluate(function(el) { return el.getBoundingClientRect().width; }); };
    const box = await canvas.boundingBox();

    expect(box).not.toBeNull();
    await expect(canvas).toBeVisible();

    const zoomBefore = await shownWidth();
    await dispatchPointerSequence(canvas, [
      { type: 'pointerdown', pointerId: 1, isPrimary: true, x: box.x + box.width * 0.35, y: box.y + box.height * 0.35 },
      { type: 'pointerdown', pointerId: 2, isPrimary: false, x: box.x + box.width * 0.55, y: box.y + box.height * 0.35 },
      { type: 'pointermove', pointerId: 1, isPrimary: true, x: box.x + box.width * 0.28, y: box.y + box.height * 0.35 },
      { type: 'pointermove', pointerId: 2, isPrimary: false, x: box.x + box.width * 0.72, y: box.y + box.height * 0.35 },
      { type: 'pointerup', pointerId: 2, isPrimary: false, x: box.x + box.width * 0.72, y: box.y + box.height * 0.35 },
      { type: 'pointerup', pointerId: 1, isPrimary: true, x: box.x + box.width * 0.28, y: box.y + box.height * 0.35 },
    ]);

    await expect.poll(shownWidth).toBeGreaterThan(zoomBefore);

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

    // The compact (touch) layout: Draw starts on the Paint tool (tapping
    // Paint again would turn it off); the thread comes from the palette,
    // which the colour button opens.
    await page.getByRole('button', { name: 'Draw', exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Colour .* open the palette$/ }).tap();
    await chooseRedCreatorPaletteChip(page);
    await expect(page.getByRole('button', { name: /^Colour DMC 606 / }).first()).toBeVisible();

    // The chosen thread is highlighted and the others faded, so a black cell
    // reads lighter: check it is not red yet rather than that it is dark.
    const isRed = function(px) { return px[0] > 180 && px[1] < 110 && px[2] < 110; };
    const before = await sampleCanvasPixel(canvas, target.localX, target.localY);
    expect(isRed(before)).toBe(false);

    await dispatchPointerSequence(canvas, [
      { type: 'pointerdown', pointerId: 1, x: target.clientX, y: target.clientY },
      { type: 'pointermove', pointerId: 1, x: target.clientX + 22, y: target.clientY },
      { type: 'pointerup', pointerId: 1, x: target.clientX + 22, y: target.clientY },
    ]);

    await expect.poll(async function() {
      return isRed(await sampleCanvasPixel(canvas, target.localX, target.localY));
    }).toBe(true);
  });
});