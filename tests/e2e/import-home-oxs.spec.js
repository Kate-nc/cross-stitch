// Audit B-03 and B-09: importing an .oxs chart from Home failed outright
// ("parseOXS not loaded"), and Anchor threads were silently swapped for DMC.
const path = require('path');
const { test, expect, devices } = require('@playwright/test');

const pixel5 = Object.assign({}, devices['Pixel 5']);
delete pixel5.defaultBrowserType;

test.describe('OXS import from Home on Pixel 5', function() {
  test.use(pixel5);

  test('opens the review and flags the Anchor substitution', async function({ page }) {
    await page.addInitScript(function() {
      try {
        ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      } catch (e) {}
    });
    await page.goto('/home.html?tab=create');
    await page.locator('input.home-create-file-input')
      .setInputFiles(path.join(__dirname, '..', 'fixtures', 'sampler-color.oxs'));
    await expect(page.getByText('Review imported pattern').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.import-warnings')).toContainText('Anchor 400');
    await expect(page.getByText(/Import failed/)).toHaveCount(0);
  });
});
