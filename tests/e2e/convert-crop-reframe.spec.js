// Frame the picture (creator/FrameView.js; reports/create-from-image-workflow):
// a new picture opens there to be cropped (with shapes) and turned, each
// applied at once with Undo; a crop looks at the cropped picture again; and
// Continue / Reframe move between it and Convert's steps.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, openConvertWithLogo, continueFromFrame, quietOnboarding } = require('./creator-helpers');

const PANORAMA = path.join(__dirname, '..', 'fixtures', 'panorama.jpg');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function openFrameWith(page, file) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await page.locator('input.home-create-file-input').setInputFiles(file);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('[data-frame-view]');
}
const size = (page) => page.locator('.fr-cropbar__size');

test.describe('Frame the picture on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('Square starts from the largest square, keeps a drag square, and Undo puts the whole picture back', async function({ page }) {
    await openFrameWith(page, PANORAMA);
    await expect(size(page)).toHaveText('2400×300px');
    await page.getByRole('radio', { name: 'Square' }).click();
    const rect = page.locator('[data-crop-rect]');
    const box = await rect.boundingBox();
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
    // A new drag stays square, however it is pulled.
    const img = await page.locator('.fr-picture__img').boundingBox();
    await page.mouse.move(img.x + 10, img.y + 5);
    await page.mouse.down();
    await page.mouse.move(img.x + 200, img.y + 20, { steps: 4 });
    await page.mouse.up();
    const dragged = await rect.boundingBox();
    expect(Math.abs(dragged.width - dragged.height)).toBeLessThan(2);
    await page.getByRole('button', { name: 'Apply crop' }).click();
    await expect(rect).toHaveCount(0);
    const m = (await size(page).innerText()).match(/(\d+)×(\d+)px/);
    expect(Math.abs(Number(m[1]) - Number(m[2]))).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Undo crop or turn' }).click();
    await expect(size(page)).toHaveText('2400×300px');
  });

  test('Escape clears a rectangle, and Continue applies one still drawn', async function({ page }) {
    await openFrameWith(page, PANORAMA);
    await page.getByRole('radio', { name: 'Square' }).click();
    await expect(page.locator('[data-crop-rect]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-crop-rect]')).toHaveCount(0);
    await expect(size(page)).toHaveText('2400×300px');
    await page.getByRole('radio', { name: 'Square' }).click();
    await continueFromFrame(page);
    await expect(page.locator('.cvp-source')).toContainText('300×300px');
  });

  test('turning applies at once, all of the picture on its side', async function({ page }) {
    await openFrameWith(page, PANORAMA);
    await page.getByRole('button', { name: 'Turn right' }).click();
    await expect(size(page)).toHaveText('300×2400px');
    await page.getByRole('button', { name: 'Turn left' }).click();
    await expect(size(page)).toHaveText('2400×300px');
  });

  test('cropping inside the logo stitches the background again, since there is no plain border left', async function({ page }) {
    await openConvertWithLogo(page, { frame: true });
    // The logo's white border is left unstitched on upload.
    const bg = page.getByRole('checkbox', { name: 'Leave background unstitched' });
    await expect(bg).toBeChecked();
    const img = await page.locator('.fr-picture__img').boundingBox();
    const k = img.width / 400;
    // Red circle and the tip of the yellow triangle only.
    await page.mouse.move(img.x + 150 * k, img.y + 110 * k);
    await page.mouse.down();
    await page.mouse.move(img.x + 250 * k, img.y + 210 * k, { steps: 4 });
    await page.mouse.up();
    await page.getByRole('button', { name: 'Apply crop' }).click();
    await expect(bg).not.toBeChecked();
    await expect(page.getByText('The cropped picture has no plain border, so its background is stitched.')).toBeVisible();
  });

  test('Continue goes to the steps, and Reframe comes back', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(page.locator('#convert-tab-size')).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-reframe]').click();
    await expect(page.locator('[data-frame-view]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate pattern' })).toHaveCount(0);
  });
});

test.describe('Frame the picture on a phone', function() {
  test.use(device('Pixel 7'));
  test.setTimeout(90000);

  test('Continue is in the top bar in place of Generate', async function({ page }) {
    await openConvertWithLogo(page, { frame: true });
    await expect(page.locator('.cc-continue')).toBeVisible();
    await expect(page.locator('.cc-generate:not(.cc-continue)')).toHaveCount(0);
    await page.locator('.cc-continue').click();
    await expect(page.locator('[data-frame-view]')).toHaveCount(0);
    await expect(page.locator('.cc-generate')).toHaveAccessibleName('Generate pattern');
  });
});
