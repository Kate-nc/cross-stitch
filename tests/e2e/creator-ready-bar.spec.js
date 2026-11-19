// "Your pattern is ready" (creator/ReadyBar.js): after Generate, one bar says
// what was made and offers the next steps, instead of a toast arriving with
// the editing tips (reports/create-from-image-workflow, decision 3).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, generateLogo } = require('./creator-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test.describe('After Generate on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('one bar says what was made, with Print PDF, Open in Tracker and Threads to buy', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-ready-summary]')).toContainText('stitches');
    await expect(bar.locator('[data-ready-summary]')).toContainText('saved in your library');
    for (const name of ['Print PDF', 'Open in Tracker', 'Threads to buy']) {
      await expect(bar.getByRole('button', { name })).toBeVisible();
    }
    // Nothing else competes with it.
    await expect(page.getByText(/Pattern generated and saved/)).toHaveCount(0);
    await expect(page.getByText('Tools and View are now unlocked')).toHaveCount(0);
    await expect(page.locator('.ready-review-note')).toHaveCount(0);
  });

  test('Threads to buy opens Materials on its Threads list and closes the bar', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await bar.getByRole('button', { name: 'Threads to buy' }).click();
    await expect(page.getByRole('tab', { name: /Threads/, selected: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Edit' }).first().click();
    await expect(bar).toHaveCount(0);
  });

  test('closing the bar brings back the review note', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await bar.getByRole('button', { name: 'Close: keep editing' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.locator('.ready-review-note')).toBeVisible();
  });
});
