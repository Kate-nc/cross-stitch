// Stash Manager navigation (hub plan, Phase 3).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ page, context }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
  });
});

const nav = page => page.getByRole('navigation', { name: 'Stash Manager' });

test('wide screens get a side menu with every section', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/manager.html?from=home');
  const box = await nav(page).boundingBox();
  expect(box.x).toBe(0);
  expect(box.width).toBe(228);
  expect(box.height).toBeGreaterThan(400);
  await nav(page).getByRole('link', { name: 'Import and export' }).click();
  await expect(page.getByRole('heading', { name: 'Import and export', level: 2 })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Import and export' })).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/[?&]tab=transfer/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Import and export', level: 2 })).toBeVisible();
  await nav(page).getByRole('link', { name: /Custom catalogues/ }).click();
  await expect(page.getByRole('heading', { name: 'Custom thread catalogues' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Catalogue CSV' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('number keys switch sections, but not while typing', async ({ page }) => {
  await page.goto('/manager.html?from=home');
  // Wait for the app (and its shortcuts) to mount before pressing keys.
  await expect(nav(page).getByRole('link', { name: /^Overview/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.stash-tile').first()).toBeVisible();
  await page.keyboard.press('2');
  await expect(nav(page).getByRole('link', { name: /Thread Stash/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('searchbox', { name: 'Search threads' }).fill('3');
  await page.getByRole('searchbox', { name: 'Search threads' }).press('4');
  await expect(page.getByRole('searchbox', { name: 'Search threads' })).toHaveValue('34');
  await expect(nav(page).getByRole('link', { name: /Thread Stash/ })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('searchbox', { name: 'Search threads' }).blur();
  await page.keyboard.press('4');
  await expect(nav(page).getByRole('link', { name: /Pattern Library/ })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('1');
  await expect(nav(page).getByRole('link', { name: /^Overview/ })).toHaveAttribute('aria-current', 'page');
});

test('narrow screens keep the tab bar and reach the extra pages from Add threads', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1000 });
  await page.goto('/manager.html?from=home&tab=inventory');
  await expect(nav(page).getByRole('link', { name: 'Import and export' })).toBeHidden();
  const box = await nav(page).boundingBox();
  expect(box.width).toBe(768);
  await page.getByRole('button', { name: 'Add threads', exact: true }).click();
  await page.getByRole('button', { name: /Custom thread catalogues/ }).click();
  await expect(page.getByRole('heading', { name: 'Custom thread catalogues' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=catalogues/);
});
