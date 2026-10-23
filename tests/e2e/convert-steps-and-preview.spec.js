// Convert laid out like Edit (step tabs that fall through with Next), and a
// preview that shows the finished piece: stitched on the fabric by default,
// whole, saying what each change did, and still live once a chart exists.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });
const { device, openConvertWithLogo, clickGenerate, waitForEdit, convertStep, previewView } = require('./creator-helpers');

const settled = (page) => expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });

test.describe('Convert steps and preview on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('the steps run Picture, Size, Threads, Detail, and Next falls through them', async function({ page }) {
    await openConvertWithLogo(page);
    const tabs = page.getByRole('tablist', { name: 'Convert steps' }).getByRole('tab');
    await expect(tabs).toHaveText(['Picture', 'Size', 'Threads', 'Detail', 'Project']);
    await expect(page.locator('#convert-tab-picture')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('radiogroup', { name: 'What kind of picture is this?' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Size and fabric' }).click();
    await expect(page.locator('.size-field').getByLabel('Width in stitches')).toBeVisible();
    await page.getByRole('button', { name: 'Next: Threads' }).click();
    await expect(page.getByRole('slider', { name: 'Threads (max)' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Detail and tidiness' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Detail and tidiness' })).toBeVisible();
    // Generate stays at the foot with what it will make.
    await expect(page.locator('[data-convert-summary]')).toContainText('stitches');
    await expect(page.locator('[data-convert-summary]')).toContainText('DMC threads');
  });

  test('the preview is stitched on the fabric by default, and Flat and Before / after show the same chart', async function({ page }) {
    await page.addInitScript(function() { try { localStorage.setItem('cs_pref_creatorFabricColour', JSON.stringify('#1F2A44')); } catch (e) {} });
    await openConvertWithLogo(page);
    await settled(page);
    const stitched = page.getByTestId('cvp-stitched').locator('canvas');
    await expect(stitched).toBeVisible();
    // Drawn, at the width it is shown, with the navy fabric between stitches.
    const px = await stitched.evaluate(function(c) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let navy = 0, other = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - 31) < 12 && Math.abs(d[i + 1] - 42) < 12 && Math.abs(d[i + 2] - 68) < 12) navy++; else other++;
      }
      return { navy, other, cssW: c.getBoundingClientRect().width, boxW: c.parentNode.parentNode.clientWidth };
    });
    // The logo's background is left unstitched, so much of it is fabric; the
    // rest is stitches.
    expect(px.navy).toBeGreaterThan(0);
    expect(px.other).toBeGreaterThan((px.navy + px.other) * 0.1);
    expect(Math.abs(px.cssW - px.boxW)).toBeLessThan(4);
    await previewView(page, 'flat');
    await expect(page.getByTestId('cvp-flat').locator('img[alt="Preview"]')).toBeVisible();
    await previewView(page, 'compare');
    await expect(page.getByTestId('cmp-preview-layer')).toBeVisible();
    // The choice is remembered for next time.
    expect(await page.evaluate(function() { return window.UserPrefs.get('creator.convertPreviewView'); })).toBe('compare');
  });

  test('a change says what it did to the preview', async function({ page }) {
    await openConvertWithLogo(page);
    await settled(page);
    await convertStep(page, 'threads');
    await page.getByRole('slider', { name: 'Threads (max)' }).fill('3');
    await settled(page);
    const line = page.locator('[data-preview-change]');
    await expect(line).toContainText('Threads (max):');
    await expect(line).toContainText(/stitch(es)? changed|no stitches changed/);
    await expect(page.locator('[data-threads-used]')).toContainText(/In the preview: [1-3] threads?/);
  });

  test('once a chart exists, Convert still shows the live preview and says when it differs', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.getByRole('button', { name: 'Back to Convert' }).click();
    await expect(page.locator('.cvp')).toBeVisible();
    await expect(page.locator('.cs-chart-scroll')).toHaveCount(0);
    await settled(page);
    await expect(page.locator('.cv-footer__state')).toHaveText('Your chart matches these settings.');
    await convertStep(page, 'threads');
    await page.getByRole('slider', { name: 'Threads (max)' }).fill('3');
    await expect(page.getByText('This preview shows your new settings. Your chart changes when you Regenerate.')).toBeVisible();
    await expect(page.locator('.cv-footer__state')).toContainText('Regenerate to replace your chart');
  });
});
