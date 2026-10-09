// Large photos from Home, and Convert drafts that survive a reload
// (P2-3, audit COMMON-07).
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding, skipTourIfShown, LOGO } = require('./creator-helpers');

function slider(page, label) {
  return page.locator('xpath=//span[normalize-space(text())="' + label + '"]/ancestor::div[2]//input[@type="range"]').first();
}
function sliderValue(page, label) {
  return page.locator('xpath=//span[normalize-space(text())="' + label + '"]/ancestor::div[1]/span[2]').first();
}

async function openSettings(page) {
  const header = page.locator('.rpanel-drawer-header');
  if (await header.isVisible().catch(function() { return false; })) {
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  }
}

test.describe('Image handoff and drafts on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(120000);

  test('a photo of more than 10 MB from Home opens in Convert', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    // A 6000 x 4000 noisy JPEG at quality 0.97: well over the old 4 MB limit.
    const b64 = await page.evaluate(async function() {
      const c = document.createElement('canvas');
      c.width = 6000; c.height = 4000;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(6000, 4000);
      let seed = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        img.data[i] = seed & 255; img.data[i + 1] = (seed >> 8) & 255; img.data[i + 2] = (seed >> 16) & 255; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const blob = await new Promise(function(r) { c.toBlob(r, 'image/jpeg', 0.97); });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    });
    const buffer = Buffer.from(b64, 'base64');
    expect(buffer.length).toBeGreaterThan(10 * 1024 * 1024);
    await page.locator('input.home-create-file-input').setInputFiles({ name: 'IMG_2041.jpg', mimeType: 'image/jpeg', buffer: buffer });
    await page.waitForURL(/create\.html/, { timeout: 30000 });
    await expect(page.locator('.cc-generate')).toBeVisible({ timeout: 60000 });
    // The handoff record is gone once the Creator has the picture.
    await expect.poll(function() {
      return page.evaluate(async function() { return (await BlobStore.list('handoff:')).length; });
    }).toBe(0);
  });

  test('Convert settings survive a reload: "Continue setting up" restores them', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.locator('input.home-create-file-input').setInputFiles(LOGO);
    await page.waitForURL(/create\.html/);
    await expect(page.locator('.cc-generate')).toBeVisible({ timeout: 20000 });
    await openSettings(page);
    await slider(page, 'Size').fill('120');
    await slider(page, 'Max colours').fill('12');
    await expect(sliderValue(page, 'Size')).toHaveText('120 st');
    // Saved a second after the last change.
    await expect.poll(function() {
      return page.evaluate(async function() {
        const d = await BlobStore.list('draft:');
        return d.length === 1 && d[0].settings ? d[0].settings.sW + '/' + d[0].settings.maxC : null;
      });
    }, { timeout: 10000 }).toBe('120/12');

    await page.reload();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Continue setting up logo?');
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('.cc-generate')).toBeVisible({ timeout: 20000 });
    await openSettings(page);
    await expect(sliderValue(page, 'Size')).toHaveText('120 st');
    await expect(sliderValue(page, 'Max colours')).toHaveText('12');

    // The draft is gone once a pattern is made.
    await page.locator('.rpanel-drawer-header').click();
    await page.locator('.cc-generate').click();
    await page.waitForSelector('.creator-rail', { timeout: 30000 });
    await expect.poll(function() {
      return page.evaluate(async function() { return (await BlobStore.list('draft:')).length; });
    }, { timeout: 10000 }).toBe(0);
  });

  test('Home lists a draft with Continue and Discard', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.locator('input.home-create-file-input').setInputFiles(LOGO);
    await page.waitForURL(/create\.html/);
    await expect(page.locator('.cc-generate')).toBeVisible({ timeout: 20000 });
    await expect.poll(function() {
      return page.evaluate(async function() { return (await BlobStore.list('draft:')).length; });
    }, { timeout: 10000 }).toBe(1);

    await page.goto('/home.html?tab=projects');
    const row = page.locator('.home-draft-row');
    await expect(row).toContainText('Draft · logo · not generated yet');
    await row.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/create\.html/);
    await expect(page.locator('.cc-generate')).toBeVisible({ timeout: 20000 });

    await page.goto('/home.html?tab=projects');
    await page.locator('.home-draft-row').getByRole('button', { name: /Discard/ }).click();
    await expect(page.locator('.home-draft-row')).toHaveCount(0);
  });
});
