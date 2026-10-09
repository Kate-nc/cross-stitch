// P0-1 (audit DRAW-01, first part): on touch screens a new pattern must not
// paint on the first swipe. Picking Paint still paints; desktop still arms
// Paint. (P1-1 made the touch default Navigate; see creator-draw-navigate.)
const { test, expect } = require('@playwright/test');
const { dispatchTouchSequence } = require('./touch-helpers');
const { device, generateLogo, zoomUntilScrollable, pickDarkSwatch, undoButton } = require('./creator-helpers');

test.describe('Creator on a phone: no automatic Paint', function() {
  test.use(device('Pixel 5'));

  test('a one-finger swipe on a new pattern scrolls instead of painting', async function({ page }) {
    await generateLogo(page);
    await expect(undoButton(page)).toBeDisabled();
    const box = await zoomUntilScrollable(page);
    const before = await box.evaluate(function(el) { return { l: el.scrollLeft, t: el.scrollTop }; });
    const b = await box.boundingBox();
    const x0 = b.x + b.width * 0.7, y0 = b.y + b.height * 0.6;
    const steps = [{ type: 'touchStart', touchPoints: [{ id: 1, x: x0, y: y0 }] }];
    for (let i = 1; i <= 12; i++) steps.push({ type: 'touchMove', touchPoints: [{ id: 1, x: x0 - i * 12, y: y0 - i * 6 }] });
    steps.push({ type: 'touchEnd', touchPoints: [] });
    await dispatchTouchSequence(page, steps);
    await expect.poll(async function() {
      const after = await box.evaluate(function(el) { return { l: el.scrollLeft, t: el.scrollTop }; });
      return after.l !== before.l || after.t !== before.t;
    }).toBe(true);
    await expect(undoButton(page)).toBeDisabled();
    await expect(page.locator('.tb-mode-toggle [data-mode="navigate"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('tapping Paint then a cell paints; tapping Paint again goes back to Navigate', async function({ page }) {
    await generateLogo(page);
    const undo = undoButton(page);
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
    await pickDarkSwatch(page);
    const cbox = await page.locator('.cs-chart-scroll canvas').first().boundingBox();
    for (const f of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.35], [0.35, 0.7]]) {
      if (!(await undo.isDisabled())) break;
      await page.touchscreen.tap(cbox.x + cbox.width * f[0], cbox.y + cbox.height * f[1]);
      await page.waitForTimeout(150);
    }
    await expect(undo).toBeEnabled();
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.tb-mode-toggle [data-mode="navigate"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Creator on desktop: Paint armed after generating', function() {
  test.use(device('desktop'));

  test('Paint is active after generation', async function({ page }) {
    await generateLogo(page);
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
  });
});
