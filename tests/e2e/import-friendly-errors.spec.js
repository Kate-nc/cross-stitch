// P0-3 (audit IMPORT-05): failed imports show plain-English messages with a
// next step and a help link, and files the app can't read (.xsd, .pat …)
// never reach the image converter.
const path = require('path');
const { test, expect, devices } = require('@playwright/test');

const pixel5 = Object.assign({}, devices['Pixel 5']);
delete pixel5.defaultBrowserType;
const FIX = (name) => path.join(__dirname, '..', 'fixtures', name);

async function openHomeCreate(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
    } catch (e) {}
  });
  await page.goto('/home.html?tab=create');
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(function() { return false; })) await skip.click();
}

const CASES = [
  { file: 'broken.pdf', message: 'This PDF couldn’t be read. It may be damaged or password-protected.' },
  { file: 'not-a-pattern.json', message: 'This .json file isn’t a stitchx pattern or backup.' },
  { file: 'pattern.xsd', message: 'Files from Pattern Maker (.xsd) can’t be opened here yet. In Pattern Maker, export the chart as OXS or PDF and import that file.' },
];

test.describe('Import errors on Pixel 5', function() {
  test.use(pixel5);

  for (const c of CASES) {
    test(c.file + ' shows a plain-English message and stays on Home', async function({ page }) {
      await openHomeCreate(page);
      await page.locator('input.home-import-file-input').setInputFiles(FIX(c.file));
      const toast = page.locator('[data-toast-id]').filter({ hasText: c.message });
      await expect(toast).toBeVisible({ timeout: 20000 });
      // No code paths or stack details in what the user sees.
      const texts = await page.locator('[data-toast-id]').allInnerTexts();
      for (const t of texts) expect(t).not.toMatch(/\.js\b|Error:|Import failed/);
      await expect(toast.getByRole('button', { name: 'What can I import?' })).toBeVisible();
      expect(page.url()).toMatch(/home\.html/);

      await toast.getByRole('button', { name: 'What can I import?' }).tap();
      await expect(page.getByRole('heading', { name: 'What can I import?' })).toBeVisible();
    });
  }
});
