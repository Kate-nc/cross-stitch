const { test, expect } = require('@playwright/test');

test.describe('Manager Touch Automation', function() {
  test('supports touch taps for inventory toggles and pattern-library creation', async function({ page }) {
    await page.goto('/manager.html');
    await expect(page.getByRole('button', { name: /Thread Inventory/i })).toBeVisible();

    const toBuyButton = page.locator('button[title="Add to to-buy list"]').first();
    await expect(toBuyButton).toBeVisible();
    await toBuyButton.tap();
    await expect(page.getByText(/^1 to buy$/)).toBeVisible();

    await page.getByRole('button', { name: /Pattern Library/i }).tap();
    await page.getByRole('button', { name: /\+ Add Pattern/i }).tap();
    await page.getByPlaceholder('Pattern Name').fill('Touch Automation Pattern');
    await page.getByPlaceholder('Creator/Shop').fill('Automation');
    await page.getByRole('button', { name: /Save Pattern/i }).tap();

    await expect(page.getByText('Touch Automation Pattern')).toBeVisible();
  });
});