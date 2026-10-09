// Size by finished dimensions, fitted to the picture (P2-6, audit IMG-03).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { device, openConvertWithLogo, quietOnboarding, skipTourIfShown } = require('./creator-helpers');

const PANORAMA = path.join(__dirname, '..', 'fixtures', 'panorama.jpg');
const TINY = path.join(__dirname, '..', 'fixtures', 'tiny.png');

function field(page) { return page.locator('.size-field'); }

async function openWith(page, file) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles(file);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.size-field', { state: 'attached' });
  await skipTourIfShown(page);
}

test.describe('Size field on desktop', function() {
  test.use(Object.assign({}, device('desktop'), { locale: 'en-GB' }));
  test.setTimeout(60000);

  test('a new picture starts with its long side at 100 stitches; the readout shows stitches and finished size', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(field(page).getByLabel('Width in stitches')).toHaveValue('100');
    await expect(field(page).getByLabel('Height in stitches')).toHaveValue('100');
    await expect(field(page).locator('[data-size-readout]')).toHaveText(/^100 × 100 stitches · [\d.]+ × [\d.]+ cm \([\d.]+ × [\d.]+ in\)$/);
  });

  test('18 cm wide at 14-count is 99 stitches', async function({ page }) {
    await openConvertWithLogo(page);
    await page.locator('.fabric-block__select').first().selectOption('14');
    await field(page).getByRole('radio', { name: 'Finished size' }).click();
    const w = field(page).getByLabel('Finished width in cm');
    await w.fill('18');
    await w.press('Enter');
    await field(page).getByRole('radio', { name: 'Stitches' }).click();
    await expect(field(page).getByLabel('Width in stitches')).toHaveValue('99');
    // The aspect lock keeps the square logo square.
    await expect(field(page).getByLabel('Height in stitches')).toHaveValue('99');
  });

  test('a Card preset fits the picture into 5 × 7 in', async function({ page }) {
    await openConvertWithLogo(page);
    await page.locator('.fabric-block__select').first().selectOption('14');
    await field(page).getByRole('button', { name: 'Card' }).click();
    // Square logo in a 5 × 7 in card at 14-count: 70 × 70.
    await expect(field(page).getByLabel('Width in stitches')).toHaveValue('70');
    await expect(field(page).getByLabel('Height in stitches')).toHaveValue('70');
  });

  test('a panorama suggests cropping its thin short side', async function({ page }) {
    await openWith(page, PANORAMA);
    await expect(field(page).getByLabel('Width in stitches')).toHaveValue('100');
    await expect(field(page).getByLabel('Height in stitches')).toHaveValue('13');
    await expect(field(page).locator('[data-size-note="short-side"]'))
      .toHaveText('This picture is very wide. The short side will only be 13 stitches; consider cropping.');
  });

  test('enlarging a small picture says how big each pixel becomes', async function({ page }) {
    await openWith(page, TINY);
    // Pixel art keeps the picture's own size.
    await expect(field(page).getByLabel('Width in stitches')).toHaveValue('24');
    await expect(field(page).locator('[data-size-note="enlarged"]')).toHaveCount(0);
    const w = field(page).getByLabel('Width in stitches');
    await w.fill('72');
    await w.press('Enter');
    await expect(field(page).locator('[data-size-note="enlarged"]'))
      .toHaveText('Your picture is only 24 px wide; each pixel will become a 3 × 3 block.');
    await field(page).getByRole('button', { name: 'Picture size' }).click();
    await expect(w).toHaveValue('24');
  });
});
