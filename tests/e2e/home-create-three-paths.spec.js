// Three clear ways to start; actions only when they make sense
// (P2-1, audit COMMON-04, COMMON-10).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding, skipTourIfShown, LOGO, startBlankGrid } = require('./creator-helpers');

const PDF = path.join(__dirname, '..', '..', 'TestUploads', 'PAT1968_2.pdf');

async function openCreateTab(page) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
}

test.describe('Starting a pattern on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('Home shows three tiles', async function({ page }) {
    await openCreateTab(page);
    await expect(page.getByRole('button', { name: /Turn a photo into a pattern/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Draw on a blank grid/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Import a chart/ })).toBeVisible();
    // Each picker accepts its own kind of file.
    await expect(page.locator('input.home-create-file-input')).toHaveAttribute('accept', 'image/*');
    await expect(page.locator('input.home-import-file-input')).toHaveAttribute('accept', '.pdf,.oxs,.xml,.json');
  });

  test('a picture on the import tile is offered to Convert, and accepting opens it', async function({ page }) {
    await openCreateTab(page);
    await page.locator('input.home-import-file-input').setInputFiles(LOGO);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This is a picture. Turn it into a pattern instead?');
    await dialog.getByRole('button', { name: 'Turn into a pattern' }).click();
    await page.waitForURL(/create\.html/);
    await expect(page.locator('.cc-generate')).toBeVisible({ timeout: 15000 });
  });

  test('a chart on the photo tile is offered to import, not rerouted', async function({ page }) {
    await openCreateTab(page);
    await page.locator('input.home-create-file-input').setInputFiles(PDF);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('This looks like a chart file. Import it instead?');
    await expect(dialog.getByRole('button', { name: 'Import' })).toBeVisible();
    // Cancel leaves the user on Home, with nothing imported.
    await dialog.getByRole('button', { name: 'Cancel' }).first().click();
    await expect(page.locator('.import-review-modal')).toHaveCount(0);
    expect(page.url()).toMatch(/home\.html/);
  });

  test('opening the Creator with nothing to open lands on Home > Create', async function({ page }) {
    await page.goto('/create.html?from=home');
    await page.waitForURL(/home\.html\?tab=create/, { timeout: 15000 });
  });

  test('a blank grid shows only tools, and its first tab is Canvas', async function({ page }) {
    await openCreateTab(page);
    await page.getByRole('link', { name: /Draw on a blank grid/ }).click();
    await startBlankGrid(page, { navigate: false });
    await page.waitForSelector('.creator-rail', { timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Canvas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Convert' })).toHaveCount(0);
    await page.locator('.cc-more').click();
    const sheet = page.getByRole('dialog', { name: 'Pattern actions' });
    await expect(sheet.getByRole('button', { name: 'Help' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Print PDF' })).toHaveCount(0);
    await expect(sheet.getByRole('button', { name: 'Open in Tracker' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Canvas: the grid's size and fabric.
    await page.getByRole('tab', { name: 'Canvas' }).click();
    const header = page.locator('.rpanel-drawer-header');
    if (await header.isVisible()) await header.click();
    await expect(page.locator('.creator-canvas-panel')).toContainText('100 × 100 stitches');
    await expect(page.getByRole('button', { name: /Resize canvas/ })).toBeVisible();
  });
});

test.describe('Starting a pattern on desktop', function() {
  test.use(device('desktop'));

  test('the action bar of an empty grid has no Print, Export or Tracker', async function({ page }) {
    await quietOnboarding(page);
    await startBlankGrid(page);
    await page.waitForSelector('.toolbar-row', { timeout: 15000 });
    const bar = page.locator('.creator-actionbar');
    await expect(bar.getByRole('tab', { name: 'Canvas' })).toBeVisible();
    await expect(bar.getByRole('button', { name: /Print PDF/ })).toHaveCount(0);
    await expect(bar.getByRole('button', { name: /Export/ })).toHaveCount(0);
    await expect(bar.getByRole('button', { name: 'Open in Tracker' })).toHaveCount(0);
    await expect(bar.locator('.creator-actionbar__difficulty-chip')).toHaveCount(0);
  });
});
