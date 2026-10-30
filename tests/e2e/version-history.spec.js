// Version history (Preferences) loads changelog.js only when it is opened,
// so pages don't download the whole list up front.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { quietOnboarding, skipTourIfShown } = require('./creator-helpers');

test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await quietOnboarding(page);
});

async function openVersionHistory(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('cs:openPreferences')));
  const toggle = page.getByRole('button', { name: /Version history/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  return toggle;
}

test('the list is fetched only when Version history is opened', async ({ page }) => {
  const requested = [];
  page.on('request', req => { if (/\/changelog\.js$/.test(req.url())) requested.push(req.url()); });
  await page.goto('/home.html');
  await skipTourIfShown(page);
  await expect.poll(() => page.evaluate(() => typeof window.APP_VERSION)).toBe('string');
  expect(await page.evaluate(() => typeof window.APP_CHANGELOG)).toBe('undefined');
  expect(requested).toEqual([]);

  await openVersionHistory(page);
  await expect(page.getByText('vUnreleased')).toBeVisible();
  await expect(page.getByText('v1.0.132')).toBeVisible();
  expect(requested).toHaveLength(1);
});

test('a failed load says so, and reopening tries again', async ({ page }) => {
  await page.route(/\/changelog\.js$/, route => route.abort());
  await page.goto('/home.html');
  await skipTourIfShown(page);
  const toggle = await openVersionHistory(page);
  await expect(page.getByText("Version history couldn't be loaded.", { exact: false })).toBeVisible();

  await page.unroute(/\/changelog\.js$/);
  await toggle.click();
  await toggle.click();
  await expect(page.getByText('vUnreleased')).toBeVisible();
});
