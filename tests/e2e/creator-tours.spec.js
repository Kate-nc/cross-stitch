// The Creator's tours follow the way in and the device (P2-9, audit
// COMMON-06): a blank grid gets the drawing tour, a picture gets the
// converting tour, and each names the buttons as they appear on that screen.
const { test, expect } = require('@playwright/test');
const { device, startBlankGrid, skipTourIfShown, LOGO } = require('./creator-helpers');

// Everything quiet except the Creator's own tours.
async function onlyCreatorTours(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      });
    } catch (e) {}
  });
}

function tourCard(page) {
  return page.locator('[role="dialog"]').filter({ has: page.getByRole('button', { name: 'Skip tour' }) });
}

test.describe('Creator tours on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('a blank grid opens the drawing tour, once', async function({ page }) {
    await onlyCreatorTours(page);
    await page.goto('/create.html?action=new-blank');
    await startBlankGrid(page, { navigate: false });

    const card = tourCard(page);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByRole('heading', { name: 'Draw your design' })).toBeVisible();
    const text = await card.innerText();
    expect(text).toMatch(/Tap a thread in the Palette/);
    expect(text).not.toMatch(/\b(picture|photo|image|Generate)\b/i);
    expect(text).not.toMatch(/\bclick\b/i);

    await card.getByRole('button', { name: 'Skip tour' }).click();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate(function() { return localStorage.getItem('cs_welcome_creator-scratch_done'); })).toBeTruthy();

    // Not again on the next visit.
    await page.reload();
    await page.waitForSelector('.creator-rail, .toolbar-row, .rpanel', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(1500);
    await expect(tourCard(page)).toHaveCount(0);
  });

  test('someone who finished the old Creator tour is not shown a new one', async function({ page }) {
    await onlyCreatorTours(page);
    await page.addInitScript(function() { try { localStorage.setItem('cs_welcome_creator_done', '1'); } catch (e) {} });
    await page.goto('/create.html?action=new-blank');
    await startBlankGrid(page, { navigate: false });
    await page.waitForTimeout(1500);
    await expect(tourCard(page)).toHaveCount(0);
  });
});

test.describe('Creator tours on a desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('a picture opens the converting tour, in desktop words', async function({ page }) {
    await onlyCreatorTours(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.locator('input.home-create-file-input').setInputFiles(LOGO);
    await page.waitForURL(/create\.html/);

    const card = tourCard(page);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByRole('heading', { name: 'Turn your picture into a pattern' })).toBeVisible();
    const text = await card.innerText();
    expect(text).toMatch(/the panel on the right/);
    expect(text).not.toMatch(/Settings sheet|\btap\b/i);

    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card.getByRole('heading', { name: 'Generate' })).toBeVisible();
    expect(await card.innerText()).toMatch(/click Generate/);
  });
});
