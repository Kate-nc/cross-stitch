// Framing the picture in Convert (reports/create-from-image-workflow,
// Phase A): the crop dialog has shapes and turning, closes on Escape, and a
// crop looks at the cropped picture again instead of keeping what was worked
// out from the whole one.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, openConvertWithLogo, quietOnboarding } = require('./creator-helpers');

const PANORAMA = path.join(__dirname, '..', 'fixtures', 'panorama.jpg');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function openCrop(page) {
  await page.locator('.cvp-source').getByRole('button', { name: 'Crop', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Crop image' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Framing the picture on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('Escape closes the crop dialog and leaves the picture as it was', async function({ page }) {
    await openConvertWithLogo(page);
    const dialog = await openCrop(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.cvp-source')).toContainText('400×400px');
  });

  test('Square starts from the largest square and keeps a drag square', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await page.locator('input.home-create-file-input').setInputFiles(PANORAMA);
    await page.waitForURL(/create\.html/);
    await page.waitForSelector('.rpanel', { state: 'attached' });
    const dialog = await openCrop(page);
    await dialog.getByRole('radio', { name: 'Square' }).click();
    const rect = dialog.locator('[data-crop-rect]');
    const box = await rect.boundingBox();
    expect(Math.abs(box.width - box.height)).toBeLessThan(2);
    // A new drag stays square, however it is pulled.
    const img = await dialog.locator('img').boundingBox();
    await page.mouse.move(img.x + 10, img.y + 5);
    await page.mouse.down();
    await page.mouse.move(img.x + 200, img.y + 20, { steps: 4 });
    await page.mouse.up();
    const dragged = await rect.boundingBox();
    expect(Math.abs(dragged.width - dragged.height)).toBeLessThan(2);
    await dialog.getByRole('button', { name: 'Apply crop' }).click();
    await expect(dialog).toHaveCount(0);
    const dims = await page.locator('.cvp-source').innerText();
    const m = dims.match(/(\d+)×(\d+)px/);
    expect(Math.abs(Number(m[1]) - Number(m[2]))).toBeLessThanOrEqual(1);
  });

  test('turning the picture without cropping keeps all of it, on its side', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await page.locator('input.home-create-file-input').setInputFiles(PANORAMA);
    await page.waitForURL(/create\.html/);
    await page.waitForSelector('.rpanel', { state: 'attached' });
    await expect(page.locator('.cvp-source')).toContainText('2400×300px');
    const dialog = await openCrop(page);
    await dialog.getByRole('button', { name: 'Turn right' }).click();
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.cvp-source')).toContainText('300×2400px');
  });

  test('cropping inside the logo stitches the background again, since there is no plain border left', async function({ page }) {
    await openConvertWithLogo(page);
    // The logo's white border is left unstitched on upload.
    await page.locator('#convert-tab-picture').click();
    const bg = page.getByRole('checkbox', { name: 'Leave background unstitched' });
    await expect(bg).toBeChecked();
    const dialog = await openCrop(page);
    const img = await dialog.locator('img').boundingBox();
    const k = img.width / 400;
    // Red circle and the tip of the yellow triangle only.
    await page.mouse.move(img.x + 150 * k, img.y + 110 * k);
    await page.mouse.down();
    await page.mouse.move(img.x + 250 * k, img.y + 210 * k, { steps: 4 });
    await page.mouse.up();
    await dialog.getByRole('button', { name: 'Apply crop' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(bg).not.toBeChecked();
    await expect(page.getByText('The cropped picture has no plain border, so its background is stitched.')).toBeVisible();
  });
});
