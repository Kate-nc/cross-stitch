// Cancellable generation with progress (P2-8, audit IMG-07).
const { test, expect } = require('@playwright/test');
const { device, openConvertWithLogo, clickGenerate } = require('./creator-helpers');

function threadsSlider(page) {
  return page.locator('xpath=//span[normalize-space(text())="Threads (max)"]/ancestor::div[2]//input[@type="range"]').first();
}

test.describe('Generating on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('a 500 × 500, 60-thread generation shows its stage at once and can be cancelled, leaving Convert as it was', async function({ page }) {
    await openConvertWithLogo(page);
    const width = page.locator('.size-field').getByLabel('Width in stitches');
    await width.fill('500');
    await width.press('Enter');
    await expect(page.locator('.size-field').getByLabel('Height in stitches')).toHaveValue('500');
    await threadsSlider(page).fill('60');
    await expect(threadsSlider(page)).toHaveValue('60');

    const card = page.locator('.generate-busy');
    const t0 = Date.now();
    await clickGenerate(page);
    // Stage text within 300 ms.
    await expect(card.locator('.import-busy-label')).toHaveText(/(Preparing the picture|Choosing threads|Matching colours|Cleaning up stray stitches|Building the chart)…/, { timeout: 300 });
    const tStage = Date.now() - t0;
    expect(tStage).toBeLessThanOrEqual(300);
    await expect(card.getByRole('progressbar')).toBeVisible();
    // A modal dialog with focus on Cancel.
    await expect(page.getByRole('dialog', { name: 'Generating pattern' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Cancel' })).toBeFocused();

    // Cancel within 500 ms.
    const t1 = Date.now();
    await card.getByRole('button', { name: 'Cancel' }).click();
    await expect(card).toHaveCount(0, { timeout: 500 });
    expect(Date.now() - t1).toBeLessThanOrEqual(500);

    // Still on Convert, with the same settings and no pattern.
    await page.waitForTimeout(1500);
    await expect(page.locator('.rpanel--edit')).toHaveCount(0);
    await expect(width).toHaveValue('500');
    await expect(threadsSlider(page)).toHaveValue('60');
    expect(await page.evaluate(async function() { return !!(await ProjectStorage.getActiveProject()); })).toBe(false);

    // Escape cancels too.
    await clickGenerate(page);
    await expect(card).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0, { timeout: 500 });
    await expect(page.locator('.rpanel--edit')).toHaveCount(0);

    // And Generate works again afterwards.
    await width.fill('80');
    await width.press('Enter');
    await clickGenerate(page);
    await page.waitForSelector('.rpanel--edit', { state: 'attached', timeout: 30000 });
  });
});
