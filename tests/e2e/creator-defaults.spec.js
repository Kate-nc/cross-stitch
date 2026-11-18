// P0-4 (audit IMG-01 defaults, IMG-06): with default preferences, logo.png
// converts to a handful of colours, its plain white background is offered
// but stitched until the stitcher accepts, and the Convert panel opens on its
// first step, Picture.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise

const { device, openConvertWithLogo, clickGenerate, waitForEdit } = require('./creator-helpers');

// The value under an estimate label in the Preview Estimates card.
async function estimate(page, label) {
  return page.evaluate(function(l) {
    const labels = Array.from(document.querySelectorAll('.cv-estimates dt')).filter(function(d) { return d.textContent === l && d.nextElementSibling; });
    return labels.length ? labels[0].nextElementSibling.textContent : null;
  }, label);
}

test.describe('Convert defaults on desktop', function() {
  test.use(device('desktop'));

  test('logo.png: background offered, 8 or fewer colours', async function({ page }) {
    await openConvertWithLogo(page);
    const offer = page.locator('.creator-toast-container').filter({ hasText: 'This picture has a plain background' });
    await expect(offer).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('checkbox', { name: 'Leave background unstitched' })).not.toBeChecked();
    await offer.getByRole('button', { name: 'Leave it unstitched' }).click();
    await expect.poll(function() { return estimate(page, 'Skipped'); }, { timeout: 20000 }).not.toBeNull();
    const skipped = parseInt((await estimate(page, 'Skipped')).replace(/\D/g, ''), 10);
    expect(skipped).toBeGreaterThan(0);
    // Counted as chart symbols (blends included) since P2-7.
    const symbols = parseInt(await estimate(page, 'Chart symbols'), 10);
    expect(symbols).toBeLessThanOrEqual(8);

    await clickGenerate(page);
    await waitForEdit(page);
  });

  test('Convert opens on the Picture step: picture type, background, then picture fixes', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(page.locator('#convert-tab-picture')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#convert-panel h3')).toHaveText(['Picture type', 'Background', 'Adjust picture']);
    // The background was found and only offered, so the switch is off.
    await expect(page.getByRole('checkbox', { name: 'Leave background unstitched' })).not.toBeChecked();
  });
});
