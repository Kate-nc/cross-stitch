// P0-4 (audit IMG-01 defaults, IMG-06): with default preferences, logo.png
// converts to a handful of colours with its white background left unstitched,
// and the Convert panel opens with Size & fabric first.
const { test, expect } = require('@playwright/test');

const { device, openConvertWithLogo, clickGenerate, waitForEdit } = require('./creator-helpers');
const SECTION_TITLES = ['Size & fabric', 'Colours', 'Background', 'Quality', 'Adjust image', 'Project'];

// The value under an estimate label in the Preview Estimates card.
async function estimate(page, label) {
  return page.evaluate(function(l) {
    const labels = Array.from(document.querySelectorAll('.card div')).filter(function(d) { return d.textContent === l && d.nextElementSibling; });
    return labels.length ? labels[0].nextElementSibling.textContent : null;
  }, label);
}

test.describe('Convert defaults on desktop', function() {
  test.use(device('desktop'));

  test('logo.png: background skipped, 8 or fewer colours', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(page.getByText('Background left unstitched.')).toBeVisible({ timeout: 15000 });
    await expect.poll(function() { return estimate(page, 'Skipped'); }, { timeout: 20000 }).not.toBeNull();
    const skipped = parseInt((await estimate(page, 'Skipped')).replace(/\D/g, ''), 10);
    expect(skipped).toBeGreaterThan(0);
    const colours = parseInt(await estimate(page, 'Colours'), 10);
    expect(colours).toBeLessThanOrEqual(8);

    await clickGenerate(page);
    await waitForEdit(page);
  });

  test('the first Convert section is Size & fabric, then Colours', async function({ page }) {
    await openConvertWithLogo(page);
    const titles = await page.locator('.rpanel button').evaluateAll(function(btns, known) {
      // A heading button can carry a badge after its title.
      return btns.map(function(b) { const t = b.textContent.trim(); return known.find(function(k) { return t.indexOf(k) === 0; }) || null; })
        .filter(Boolean);
    }, SECTION_TITLES);
    expect(titles[0]).toBe('Size & fabric');
    expect(titles[1]).toBe('Colours');
  });
});
