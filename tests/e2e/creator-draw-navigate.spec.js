// P1-1 (audit DRAW-01): Navigate | Draw in the Creator, matching the
// Tracker's Mark | Navigate.
const { test, expect } = require('@playwright/test');
const { dispatchTouchSequence } = require('./touch-helpers');
const { device, generateLogo, zoomUntilScrollable, pickDarkSwatch, undoButton } = require('./creator-helpers');

async function swipe(page, box) {
  const b = await box.boundingBox();
  const x0 = b.x + b.width * 0.7, y0 = b.y + b.height * 0.6;
  const steps = [{ type: 'touchStart', touchPoints: [{ id: 1, x: x0, y: y0 }] }];
  for (let i = 1; i <= 12; i++) steps.push({ type: 'touchMove', touchPoints: [{ id: 1, x: x0 - i * 12, y: y0 - i * 6 }] });
  steps.push({ type: 'touchEnd', touchPoints: [] });
  await dispatchTouchSequence(page, steps);
}
const scrollPos = (box) => box.evaluate(function(el) { return el.scrollLeft + ',' + el.scrollTop; });
const toggle = (page, mode) => page.locator('.tb-mode-toggle [data-mode="' + mode + '"]');

async function tapUntilEdited(page) {
  const undo = undoButton(page);
  const cbox = await page.locator('.cs-chart-scroll canvas').first().boundingBox();
  for (const f of [[0.3, 0.3], [0.5, 0.5], [0.7, 0.35], [0.35, 0.7]]) {
    if (!(await undo.isDisabled())) break;
    await page.touchscreen.tap(cbox.x + cbox.width * f[0], cbox.y + cbox.height * f[1]);
    await page.waitForTimeout(150);
  }
}

test.describe('Navigate | Draw on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('opens in Navigate; a swipe scrolls without an edit', async function({ page }) {
    await generateLogo(page);
    await expect(toggle(page, 'navigate')).toHaveAttribute('aria-pressed', 'true');
    const tb = await toggle(page, 'navigate').boundingBox();
    expect(tb.height).toBeGreaterThanOrEqual(44);
    const box = await zoomUntilScrollable(page);
    const before = await scrollPos(box);
    await swipe(page, box);
    await expect.poll(function() { return scrollPos(box); }).not.toBe(before);
    await expect(undoButton(page)).toBeDisabled();
  });

  test('tapping Paint switches to Draw and a tap paints; Navigate then scrolls again', async function({ page }) {
    await generateLogo(page);
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(toggle(page, 'draw')).toHaveAttribute('aria-pressed', 'true');
    await pickDarkSwatch(page);
    await tapUntilEdited(page);
    await expect(undoButton(page)).toBeEnabled();

    await toggle(page, 'navigate').tap();
    await expect(toggle(page, 'navigate')).toHaveAttribute('aria-pressed', 'true');
    const box = await zoomUntilScrollable(page);
    const before = await scrollPos(box);
    await swipe(page, box);
    await expect.poll(function() { return scrollPos(box); }).not.toBe(before);
  });
});

test.describe('Desktop', function() {
  test.use(device('desktop'));

  test('starts in Draw with Paint armed; the toggle is in the Tools tab', async function({ page }) {
    await generateLogo(page);
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tb-mode-toggle')).toHaveCount(0);
    await page.locator('.creator-sidebar-tab[data-tab-id="tools"]').click();
    await expect(page.getByRole('group', { name: 'Chart mode' }).locator('[data-mode="draw"]')).toHaveAttribute('aria-pressed', 'true');
  });
});
