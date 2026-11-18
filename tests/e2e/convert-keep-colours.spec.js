// Colours to keep: pick a colour on the preview (the picture at stitch size)
// and its nearest thread is always in the pattern (reports/photo-conversion-audit-2026-11.md).
const { test, expect } = require('@playwright/test');
const { createCanvas } = require('canvas');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, quietOnboarding, skipTourIfShown, convertStep } = require('./creator-helpers');

// Navy and a pale wall, with a small patch of a colour close to the wall (a
// "face"): the patch's thread is DMC 3893.
function patchPicture() {
  const w = 300, h = 300, c = createCanvas(w, h), cx = c.getContext('2d');
  cx.fillStyle = 'rgb(30,70,140)'; cx.fillRect(0, 0, 150, h);
  cx.fillStyle = 'rgb(235,225,200)'; cx.fillRect(150, 0, 150, h);
  cx.fillStyle = 'rgb(215,190,160)'; cx.fillRect(210, 210, 60, 60);
  return { name: 'patch.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') };
}

test.describe('Colours to keep', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('a colour picked on the preview is kept, and Esc cancels picking', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.locator('input.home-create-file-input').setInputFiles(patchPicture());
    await page.waitForURL(/create\.html/);
    await page.waitForSelector('.rpanel', { state: 'attached' });
    await skipTourIfShown(page);
    await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });

    await convertStep(page, 'threads');
    const section = page.locator('.cv-sec--keep');
    await expect(section).toContainText('None yet');

    // Esc backs out of picking.
    await section.getByRole('button', { name: 'Pick from picture' }).click();
    await expect(page.getByTestId('cvp-pick')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('cvp-pick')).toHaveCount(0);

    // Pick the patch: 80% across and down is inside it.
    await section.getByRole('button', { name: 'Pick from picture' }).click();
    // A locator click scrolls the (tall) preview into view first.
    const pick = page.getByTestId('cvp-pick').locator('img');
    const box = await pick.boundingBox();
    await pick.click({ position: { x: box.width * 0.8, y: box.height * 0.8 } });
    await expect(page.getByTestId('cvp-pick')).toHaveCount(0);
    await expect(section.locator('[data-keep-id]')).toHaveCount(1);
    await expect(section.locator('[data-keep-id="3893"]')).toBeVisible();
    await expect(page.locator('[data-preview-change]')).toContainText('Colours to keep', { timeout: 20000 });

    // Removing it empties the list.
    await section.getByRole('button', { name: /^Stop keeping DMC 3893/ }).click();
    await expect(section.locator('[data-keep-id]')).toHaveCount(0);
  });
});
