// Materials & Output (creator/extras-bundle.js) is downloaded the first time it
// opens, not on every Creator load. Phone-sized touch device: desktop would
// also prefetch it in the background.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, generateLogo, isCompact } = require('./creator-helpers');

test.use(device('Pixel 5'));
test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await quietOnboarding(page);
});

const EXTRAS = /\/creator\/extras-bundle\.js(\?|$)/;

async function openMaterials(page) {
  if (await isCompact(page)) {
    const backdrop = page.locator('.rpanel-backdrop');
    if (await backdrop.isVisible().catch(() => false)) await backdrop.click({ position: { x: 10, y: 10 } });
  }
  await page.getByRole('tab', { name: 'Materials' }).first().click();
}

test('the Creator opens without it, and Materials & Output loads it on first open', async ({ page }) => {
  const requested = [];
  page.on('request', req => { if (EXTRAS.test(req.url())) requested.push(req.url()); });
  await generateLogo(page);
  expect(requested).toEqual([]);
  expect(await page.evaluate(() => typeof window.CreatorMaterialsHub)).toBe('undefined');

  await openMaterials(page);
  await expect(page.getByRole('tab', { name: 'Threads', exact: true })).toBeVisible({ timeout: 15000 });
  expect(requested).toHaveLength(1);

  // Coming back later reuses the loaded code.
  await page.getByRole('tab', { name: 'Edit' }).first().click();
  await openMaterials(page);
  await expect(page.getByRole('tab', { name: 'Threads', exact: true })).toBeVisible();
  expect(requested).toHaveLength(1);
});

test('a failed load says so, and opening Materials again retries', async ({ page }) => {
  await page.route(EXTRAS, route => route.abort());
  await generateLogo(page);
  await openMaterials(page);
  await expect(page.getByRole('status').filter({ hasText: "Materials & Output couldn't be loaded." })).toBeVisible();

  await page.unroute(EXTRAS);
  await page.getByRole('tab', { name: 'Edit' }).first().click();
  await openMaterials(page);
  await expect(page.getByRole('tab', { name: 'Threads', exact: true })).toBeVisible({ timeout: 15000 });
});
