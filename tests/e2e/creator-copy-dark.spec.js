// Audit B-07 (welcome card unreadable in dark mode) and B-17 (the Colour
// Breakdown highlight only worked on mouse hover).
const path = require('path');
const { test, expect, devices } = require('@playwright/test');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');
const pixel5 = Object.assign({}, devices['Pixel 5']);
delete pixel5.defaultBrowserType;

async function quietOnboarding(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
    } catch (e) {}
  });
}

// WCAG contrast ratio of two CSS colours, computed in the page.
async function headingContrast(page, selector) {
  return page.evaluate(function(sel) {
    function rgb(c) { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3); }
    function lum(c) {
      return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
      function ch(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    }
    const el = document.querySelector(sel);
    let bgEl = el, bg = 'rgba(0, 0, 0, 0)';
    while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; }
    if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = getComputedStyle(document.body).backgroundColor;
    const a = lum(rgb(getComputedStyle(el).color)), b = lum(rgb(bg));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, selector);
}

test.describe('Creator welcome card in dark mode', function() {
  test.use({ colorScheme: 'dark', viewport: { width: 1280, height: 860 } });

  test('headings are readable', async function({ page }) {
    await quietOnboarding(page);
    await page.addInitScript(function() {
      try { localStorage.setItem('cs_pref_theme', JSON.stringify('dark')); } catch (e) {}
    });
    // ?from=home: without it create.html with no project sends you to Home.
    await page.goto('/create.html?from=home');
    const heading = page.getByRole('heading', { name: 'Start a new pattern' });
    await expect(heading).toBeVisible({ timeout: 15000 });
    await page.evaluate(function() { document.documentElement.setAttribute('data-theme', 'dark'); });
    await page.waitForTimeout(200);
    expect(await headingContrast(page, 'h1')).toBeGreaterThanOrEqual(4.5);
    // A tile title too.
    await page.evaluate(function() {
      const el = Array.from(document.querySelectorAll('div')).find(function(d) { return d.textContent === 'Design from Scratch'; });
      if (el) el.id = 'tile-title-check';
    });
    expect(await headingContrast(page, '#tile-title-check')).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('Colour Breakdown on Pixel 5', function() {
  test.use(pixel5);

  test('tapping a colour highlights it in the preview', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await page.locator('input.home-create-file-input').setInputFiles(LOGO);
    await page.waitForURL(/create\.html/);
    const row = page.locator('.convert-breakdown-row').nth(1);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('(tap a colour to highlight)')).toBeVisible();
    await row.tap();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('img[aria-hidden="true"][src^="data:image/png"]').first()).toBeAttached();
    // Tapping it again clears the highlight.
    await row.tap();
    await expect(row).toHaveAttribute('aria-pressed', 'false');
  });
});
