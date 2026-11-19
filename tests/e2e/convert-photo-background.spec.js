// A photo's plain background is offered, not applied, and what is left out
// can be seen (reports/photo-conversion-audit-2026-11.md, recommendation 2).
const { test, expect } = require('@playwright/test');
const { createCanvas } = require('canvas');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, quietOnboarding, skipTourIfShown, convertStep, continueFromFrame } = require('./creator-helpers');

// A photo-like picture: a shaded, grainy subject on a plain pale frame (10%
// on each side), so the upload check finds a plain border but guesses Photo.
function framedPhoto() {
  const w = 300, h = 240, c = createCanvas(w, h), cx = c.getContext('2d');
  cx.fillStyle = 'rgb(236,234,230)';
  cx.fillRect(0, 0, w, h);
  const img = cx.getImageData(0, 0, w, h), d = img.data;
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 24; y < h - 24; y++) for (let x = 30; x < w - 30; x++) {
    const i = (y * w + x) * 4, n = (rnd() - 0.5) * 40;
    d[i] = Math.max(0, Math.min(255, 70 + x * 0.5 + n));
    d[i + 1] = Math.max(0, Math.min(255, 40 + y * 0.6 + n));
    d[i + 2] = Math.max(0, Math.min(255, 150 - x * 0.2 + n));
  }
  cx.putImageData(img, 0, 0);
  return { name: 'framed-photo.png', mimeType: 'image/png', buffer: c.toBuffer('image/png') };
}

test.describe('A photo with a plain background', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('is offered, shown and kept steady by the picture adjustments', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.locator('input.home-create-file-input').setInputFiles(framedPhoto());
    await page.waitForURL(/create\.html/);
    // A new picture opens on Frame the picture.
    await page.waitForSelector('[data-frame-view]', { timeout: 15000 });
    await skipTourIfShown(page);

    await expect(page.getByRole('radiogroup', { name: 'What kind of picture is this?' }).getByRole('radio', { name: 'Photo' }))
      .toHaveAttribute('aria-checked', 'true');
    // Offered, not applied.
    const offer = page.locator('.creator-toast-container').filter({ hasText: 'This picture has a plain background' });
    await expect(offer).toBeVisible();
    const leave = page.getByRole('checkbox', { name: 'Leave background unstitched' });
    await expect(leave).not.toBeChecked();

    await offer.getByRole('button', { name: 'Leave it unstitched' }).click();
    await expect(leave).toBeChecked();
    // Frame stripes what is left out and counts it.
    const count = page.locator('[data-bg-count]');
    await expect(count).toBeVisible({ timeout: 20000 });
    const before = await count.getAttribute('data-bg-count');
    expect(Number(before)).toBeGreaterThan(0);

    // Brightness doesn't move the background.
    await page.locator('[data-frame-view] details[data-cv-fix] summary').click();
    const bri = page.getByRole('slider', { name: 'Brightness' });
    await bri.focus();
    for (let i = 0; i < 10; i++) await bri.press('ArrowLeft');
    await expect(page.locator('[data-bg-key][aria-busy]')).toHaveCount(0, { timeout: 20000 });
    await expect(count).toHaveAttribute('data-bg-count', before);

    // On to the preview, which marks the left-out stitches.
    await continueFromFrame(page);
    await skipTourIfShown(page);
    await expect(page.locator('[data-testid="cvp-background"], [data-testid="cmp-background"]').first()).toBeAttached({ timeout: 20000 });

    // A photo keeps its in-between shades: the Detail step says so.
    await convertStep(page, 'detail');
    await expect(page.locator('.cv-sec--tidying')).toContainText('Merges confetti stitches into the colour around them.');
  });
});
