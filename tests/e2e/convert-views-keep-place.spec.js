// Stage 3 (X6): Convert's views are named by what they show, and Close up
// and its scroll position carry across Stitched and Flat.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, openConvertWithLogo, previewView } = require('./creator-helpers');

test.describe('Convert preview views on a desktop', function() {
  test.use(device('desktop'));

  test('the views say what they show, and Close up keeps its place between Stitched and Flat', async function({ page }) {
    await openConvertWithLogo(page);
    const views = page.locator('.cvp-views [data-preview-view]');
    await expect(views).toHaveText(['Stitched', 'Flat', 'Picture and chart']);

    await page.getByRole('button', { name: 'Close up' }).click();
    const stitched = page.getByTestId('cvp-stitched');
    await expect(stitched).toHaveClass(/cvp-stitched--close/);
    await stitched.evaluate(function(el) { el.scrollLeft = 300; el.scrollTop = 250; el.dispatchEvent(new Event('scroll')); });
    const at = await stitched.evaluate(function(el) { return [el.scrollLeft, el.scrollTop]; });
    expect(at[0]).toBeGreaterThan(0);

    await previewView(page, 'flat');
    const flat = page.getByTestId('cvp-flat');
    await expect(flat).toHaveClass(/cvp-stitched--close/);
    await expect(page.getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true');
    expect(await flat.evaluate(function(el) { return [el.scrollLeft, el.scrollTop]; })).toEqual(at);

    await previewView(page, 'stitched');
    expect(await page.getByTestId('cvp-stitched').evaluate(function(el) { return [el.scrollLeft, el.scrollTop]; })).toEqual(at);

    await previewView(page, 'compare');
    await expect(page.locator('.cvp').getByText('Your picture', { exact: true }).first()).toBeVisible();
    await expect(page.locator('.cvp').getByText('Chart', { exact: true }).first()).toBeVisible();
  });
});
