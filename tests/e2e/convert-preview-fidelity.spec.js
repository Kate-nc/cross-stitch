// The Convert preview must show what the pattern will be: skipped (background)
// cells are the fabric colour, not the original picture showing through; the
// "what changed" overlay is opt-in and covers only the preview half; and the
// comparison box keeps the shape of the picture on screen while a size change
// is still being worked out.
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });
const { device, quietOnboarding, skipTourIfShown } = require('./creator-helpers');

const FABRIC = '#E8D9B5';
const FABRIC_RGB = 'rgb(232, 217, 181)';

// A 160x100 picture: plain white border round a colourful middle. The Creator
// leaves a plain border unstitched, so the preview has skipped cells.
function borderedPng() {
  const w = 160, h = 100, border = 14;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4;
      const inside = x >= border && x < w - border && y >= border && y < h - border;
      raw[o] = inside ? (x * 255 / w) | 0 : 255;
      raw[o + 1] = inside ? (y * 255 / h) | 0 : 255;
      raw[o + 2] = inside ? 160 : 255;
      raw[o + 3] = 255;
    }
  }
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function openConvert(page) {
  await quietOnboarding(page);
  await page.addInitScript(function(c) { try { localStorage.setItem('cs_pref_creatorFabricColour', JSON.stringify(c)); } catch (e) {} }, FABRIC);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles({ name: 'bordered.png', mimeType: 'image/png', buffer: borderedPng() });
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel', { state: 'attached' });
  await skipTourIfShown(page);
  await expect(page.getByTestId('cmp-preview-layer')).toBeVisible({ timeout: 20000 });
  // The first pass is the quick one; wait for the settled picture and spinner.
  await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
}

const previewPixels = (page) => page.evaluate(async function() {
  const img = document.querySelector('img[alt="Preview"]');
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) clear++;
  return { w: c.width, h: c.height, clear };
});

test.describe('Convert preview fidelity', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('skipped cells are the fabric colour, not the original picture', async function({ page }) {
    await openConvert(page);
    const px = await previewPixels(page);
    expect(px.clear).toBeGreaterThan(0);   // the border really is skipped, so this matters
    await expect(page.getByTestId('cmp-preview-layer')).toHaveCSS('background-color', FABRIC_RGB);
  });

  test('the what-changed overlay never appears on its own, and covers only the preview half', async function({ page }) {
    await openConvert(page);
    await page.getByLabel('Width in stitches').fill('70');
    await page.keyboard.press('Tab');
    for (let i = 0; i < 22; i++) {            // 2.2 s: past the debounce and the full pass
      await expect(page.getByTestId('cmp-diff')).toHaveCount(0);
      await page.waitForTimeout(100);
    }
    await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
    const toggle = page.getByRole('button', { name: 'Show what changed' });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    const diff = page.getByTestId('cmp-diff');
    await expect(diff).toHaveCount(1);
    await expect(diff).toHaveCSS('clip-path', /inset\(0px 0px 0px 50%\)/);
    await page.getByRole('button', { name: 'Hide what changed' }).click();
    await expect(diff).toHaveCount(0);
  });

  test('the comparison box keeps the picture\'s shape while a size change is pending', async function({ page }) {
    await openConvert(page);
    const shape = () => page.evaluate(function() {
      const img = document.querySelector('img[alt="Preview"]');
      const box = document.querySelector('[data-testid="cmp-box"]').getBoundingClientRect();
      return { box: box.width / box.height, picture: img.naturalWidth / img.naturalHeight };
    });
    const before = await shape();
    await page.getByLabel('Lock aspect ratio').uncheck();
    await page.getByLabel('Height in stitches').fill('10');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);            // inside the 400 ms debounce: the old picture is still showing
    const during = await shape();
    expect(Math.abs(during.box / during.picture - 1)).toBeLessThan(0.03);
    expect(Math.abs(during.box / before.box - 1)).toBeLessThan(0.03);
    await expect(page.getByRole('status', { name: 'Updating preview' })).toHaveCount(0, { timeout: 20000 });
    const after = await shape();
    expect(Math.abs(after.box / after.picture - 1)).toBeLessThan(0.03);
  });
});
