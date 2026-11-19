// A picture opened in the Stitch Tracker goes to the Pattern Creator's
// Convert, like one from Home (reports/create-from-image-workflow, Phase C),
// and "Your pattern is ready" then puts Open in Tracker first.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, continueFromFrame, clickGenerate, waitForEdit } = require('./creator-helpers');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test.describe('A picture opened in the Tracker', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('opens on Frame the picture, and the pattern goes back to the Tracker', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/stitch.html?from=home');
    await page.locator('input[type=file]').first().setInputFiles(LOGO);
    await page.waitForURL(/create\.html\?action=home-image-pending&from=tracker&handoff=/);
    await page.waitForSelector('[data-frame-view]');
    // No Tracker import dialog on the way.
    await expect(page.getByRole('dialog', { name: /Import Image Pattern/ })).toHaveCount(0);
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await expect(bar.locator('[data-ready-summary]')).toContainText('Open in Tracker to start stitching it');
    const actionPrimary = page.locator('.creator-actionbar__primary button');
    await expect(actionPrimary.first()).toHaveText('Open in Tracker');
    await expect(actionPrimary.first()).toHaveClass(/creator-actionbar__btn--primary/);
    await expect(page.getByRole('button', { name: 'Open in Tracker' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Print PDF' })).toHaveCount(1);
    // The handoff record is gone once the Creator has the picture.
    await expect.poll(function() {
      return page.evaluate(async function() { return (await BlobStore.list('handoff:')).length; });
    }).toBe(0);
  });

  test('from Home, Print PDF stays first', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await page.locator('input.home-create-file-input').setInputFiles(LOGO);
    await page.waitForURL(/from=home/);
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const actionPrimary = page.locator('.creator-actionbar__primary button');
    await expect(actionPrimary.first()).toHaveText('Print PDF');
    await expect(actionPrimary.first()).toHaveClass(/creator-actionbar__btn--primary/);
  });
});
