// P0-4 (audit IMG-01 defaults, IMG-06): with default preferences, logo.png
// converts to a handful of colours with its white background left unstitched,
// and the Convert panel opens with Size & fabric first.
const path = require('path');
const { test, expect } = require('@playwright/test');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');
const SECTION_TITLES = ['Size & fabric', 'Colours', 'Background', 'Quality', 'Adjust image', 'Project'];

async function openConvertWithLogo(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      });
    } catch (e) {}
  });
  await page.goto('/home.html?tab=create');
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(function() { return false; })) await skip.click();
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel');
}

// The value under an estimate label in the Preview Estimates card.
async function estimate(page, label) {
  return page.evaluate(function(l) {
    const labels = Array.from(document.querySelectorAll('.card div')).filter(function(d) { return d.textContent === l && d.nextElementSibling; });
    return labels.length ? labels[0].nextElementSibling.textContent : null;
  }, label);
}

test.describe('Convert defaults on desktop', function() {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('logo.png: background skipped, 8 or fewer colours', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(page.getByText('Background left unstitched.')).toBeVisible({ timeout: 15000 });
    await expect.poll(function() { return estimate(page, 'Skipped'); }, { timeout: 20000 }).not.toBeNull();
    const skipped = parseInt((await estimate(page, 'Skipped')).replace(/\D/g, ''), 10);
    expect(skipped).toBeGreaterThan(0);
    const colours = parseInt(await estimate(page, 'Colours'), 10);
    expect(colours).toBeLessThanOrEqual(8);

    await page.getByRole('button', { name: 'Generate pattern' }).first().click();
    await page.waitForSelector('.rpanel--edit', { timeout: 20000 });
  });

  test('the first Convert section is Size & fabric, then Colours', async function({ page }) {
    await openConvertWithLogo(page);
    const titles = await page.locator('.rpanel button').evaluateAll(function(btns, known) {
      return btns.map(function(b) { return b.textContent.trim(); }).filter(function(t) { return known.indexOf(t) !== -1; });
    }, SECTION_TITLES);
    expect(titles[0]).toBe('Size & fabric');
    expect(titles[1]).toBe('Colours');
  });
});
