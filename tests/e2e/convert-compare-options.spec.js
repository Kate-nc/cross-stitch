// Compare options before generating (P2-7, audit IMG-05).
const { test, expect } = require('@playwright/test');
const { device, openConvertWithLogo } = require('./creator-helpers');

function strip(page) { return page.locator('.compare-strip'); }
function option(page, id) { return strip(page).locator('[data-compare-option="' + id + '"]'); }

test.describe('Compare options on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(60000);

  test('three size options appear within 3 s, and choosing +25% sets the size', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(strip(page)).toBeVisible({ timeout: 15000 });
    // Open by default on wide screens.
    await expect(strip(page).getByRole('button', { name: 'Compare options' })).toHaveAttribute('aria-expanded', 'true');
    await expect(strip(page).locator('.compare-strip__option img')).toHaveCount(3, { timeout: 3000 + 500 });
    await expect(option(page, 'current')).toContainText('100 × 100');
    await expect(option(page, 'plus')).toContainText(/[\d,]+ stitches \(125 × 125\)/);
    await expect(option(page, 'plus')).toContainText(/\d+ threads? · (about \d+ hrs?|under 1 hr)/);
    await expect(option(page, 'plus')).toContainText(/Confetti: \w+/);
    await option(page, 'plus').click();
    await expect(page.locator('.size-field').getByLabel('Width in stitches')).toHaveValue('125');
    // The strip moves on: 125 is now current.
    await expect(option(page, 'current')).toContainText('125 × 125');
  });

  test('Threads compares −5 and +5 threads; choosing one sets Threads (max)', async function({ page }) {
    await openConvertWithLogo(page);
    await strip(page).getByRole('radio', { name: 'Threads' }).click();
    await expect(option(page, 'plus')).toContainText('+5 threads');
    await expect(strip(page).locator('.compare-strip__option img')).toHaveCount(3, { timeout: 5000 });
    const slider = page.locator('xpath=//span[normalize-space(text())="Threads (max)"]/ancestor::div[2]//input[@type="range"]').first();
    const before = Number(await slider.inputValue());
    await option(page, 'plus').click();
    await expect(slider).toHaveValue(String(before + 5));
  });
});

test.describe('Compare options on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(60000);

  test('collapsed by default; opens into a row that scrolls sideways', async function({ page }) {
    await openConvertWithLogo(page);
    const toggle = strip(page).getByRole('button', { name: 'Compare options' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 15000 });
    await expect(strip(page).locator('.compare-strip__option')).toHaveCount(0);
    await toggle.click();
    await expect(strip(page).locator('.compare-strip__option img')).toHaveCount(3, { timeout: 5000 });
    const scrolls = await strip(page).locator('.compare-strip__row').evaluate(function(el) {
      return getComputedStyle(el).overflowX === 'auto' && el.scrollWidth > el.clientWidth;
    });
    expect(scrolls).toBe(true);
    expect(await page.evaluate(function() { return document.documentElement.scrollWidth - window.innerWidth; })).toBe(0);
  });
});
