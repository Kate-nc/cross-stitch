const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise

test.describe('Manager Touch Automation', function() {
  test('supports touch taps for inventory toggles and pattern-library creation', async function({ page }) {
    await page.addInitScript(function() {
      try { ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); }); } catch (e) {}
    });
    await page.goto('/manager.html?from=home');   // how Home opens it; without this the page sends you to Home when no project is active
    await expect(page.getByRole('link', { name: /Thread Stash/i })).toBeVisible();
    // The Manager opens on Overview; its tiles and tabs respond to touch.
    await page.getByRole('button', { name: /^Threads/ }).tap();
    await expect(page.getByRole('radio', { name: /Owned/ })).toHaveAttribute('aria-checked', 'true');
    // Thread Stash filters respond to touch.
    await page.getByRole('radio', { name: /Every shade/ }).tap();
    await expect(page.getByRole('radio', { name: /Every shade/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('link', { name: /Pattern Library/i }).tap();
    await page.getByRole('button', { name: /\+ Add Pattern/i }).tap();
    await page.getByPlaceholder('Pattern Name').fill('Touch Automation Pattern');
    await page.getByPlaceholder('Creator/Shop').fill('Automation');
    await page.getByRole('button', { name: /Save Pattern/i }).tap();

    await expect(page.getByText('Touch Automation Pattern')).toBeVisible();
  });
});