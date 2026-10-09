// P0-5 (audit COMMON-06 hint part, COMMON-11 contrast part).
const path = require('path');
const { test, expect } = require('@playwright/test');

const { device, openConvertWithLogo, clickGenerate, waitForEdit } = require('./creator-helpers');
const pixel5 = device('Pixel 5');
const openConvert = (page) => openConvertWithLogo(page);
async function generate(page) { await clickGenerate(page); await waitForEdit(page); }

test.describe('Touch hints on Pixel 5', function() {
  test.use(pixel5);

  test('no mouse or keyboard instructions after generating', async function({ page }) {
    await openConvert(page);
    await expect(page.getByText('Hold Alt to zoom')).toHaveCount(0);
    await generate(page);
    await page.waitForTimeout(1000);
    const mouseHints = page.getByText(/Press \?|Right-click|Hold Alt/i);
    const n = await mouseHints.count();
    for (let i = 0; i < n; i++) await expect(mouseHints.nth(i)).toBeHidden();
    // A new pattern opens in Navigate on touch (P1-1).
    await expect(page.getByText(/Tap a stitch to see its thread/)).toBeVisible();
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(page.getByText('Long-press a stitch for more options.')).toBeVisible();
  });
});

test.describe('Desktop keeps keyboard hints', function() {
  test.use(device('desktop'));

  test('the shortcuts hint still shows', async function({ page }) {
    await openConvert(page);
    await generate(page);
    await expect(page.getByText('for keyboard shortcuts')).toBeVisible();
  });

  for (const theme of ['light', 'dark']) {
    test('estimate labels pass AA contrast (' + theme + ')', async function({ page }) {
      await openConvert(page);
      await page.evaluate(function(t) { document.documentElement.setAttribute('data-theme', t); }, theme);
      await expect(page.getByText('Preview Estimates')).toBeVisible({ timeout: 20000 });
      const worst = await page.evaluate(function() {
        function parse(c) { const m = c.match(/[\d.]+/g).map(Number); return m; }
        function lum(rgb) {
          return [0, 1, 2].map(function(i) { const v = rgb[i] / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
            .reduce(function(s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
        }
        function bgOf(el) {
          for (let e = el; e; e = e.parentElement) {
            const c = parse(getComputedStyle(e).backgroundColor);
            if (c.length < 4 || c[3] > 0.5) { if (!(c.length >= 4 && c[3] === 0)) return c; }
          }
          return [255, 255, 255];
        }
        const card = Array.from(document.querySelectorAll('.card')).find(function(c) { return /Preview Estimates/.test(c.textContent); });
        // The estimate labels and values (the confetti tier keeps its own colours).
        const grid = card.querySelector('div[style*="grid"]');
        let min = 99;
        grid.querySelectorAll('div').forEach(function(el) {
          const own = Array.from(el.childNodes).some(function(n) { return n.nodeType === 3 && n.textContent.trim(); });
          if (!own) return;
          const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
          const a = lum(fg), b = lum(bg);
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < min) min = ratio;
        });
        return min;
      });
      expect(worst).toBeGreaterThanOrEqual(4.5);
    });
  }
});
