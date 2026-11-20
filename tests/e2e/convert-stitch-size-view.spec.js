// Picture and chart can put the chart beside the picture at stitch size (one
// colour per stitch, before threads are chosen), to tell detail lost to the
// chart's size from detail lost in matching (reports/photo-conversion-audit-2026-11.md).
// Compare options' size cards give the finished size.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, openConvertWithLogo, previewView } = require('./creator-helpers');

// The picture drawn in the comparison's "before" half, at its own size.
async function beforePixels(page) {
  return page.getByTestId('cmp-original').evaluate(async function(img) {
    if (!img.complete) await new Promise(function(r) { img.onload = r; });
    return { w: img.naturalWidth, h: img.naturalHeight, rendering: getComputedStyle(img).imageRendering, src: img.src.slice(0, 22) };
  });
}

test.describe('At stitch size', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('compares the chart with the picture at one colour per stitch', async function({ page }) {
    await openConvertWithLogo(page);
    await previewView(page, 'compare');
    await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
    const group = page.getByRole('radiogroup', { name: 'Picture beside the chart' });
    await expect(group.getByRole('radio', { name: 'Your picture' })).toHaveAttribute('aria-checked', 'true');
    const picture = await beforePixels(page);

    await group.getByRole('radio', { name: 'At stitch size' }).click();
    await expect(page.locator('[data-compare-before-caption]')).toContainText('Detail already gone here is lost to the chart');
    const size = (await page.locator('[data-preview-size]').textContent()).match(/(\d+) × (\d+) stitches/);
    await expect.poll(async function() { return (await beforePixels(page)).w; }).toBe(Number(size[1]));
    const sampled = await beforePixels(page);
    expect(sampled.h).toBe(Number(size[2]));
    expect(sampled.rendering).toBe('pixelated');
    expect(sampled.w).toBeLessThan(picture.w);

    // Remembered, like the view itself.
    expect(await page.evaluate(function() { return window.UserPrefs.get('creator.convertCompareBefore'); })).toBe('sampled');
    await group.getByRole('radio', { name: 'Your picture' }).click();
    await expect.poll(async function() { return (await beforePixels(page)).w; }).toBe(picture.w);
  });

  test('Compare options gives each size its finished size', async function({ page }) {
    await openConvertWithLogo(page);
    const toggle = page.locator('.compare-strip__toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.locator('[data-compare-dim="size"]').click();
    const cards = page.locator('.compare-strip__option');
    await expect(cards).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toContainText(/finished/, { timeout: 30000 });
  });
});
