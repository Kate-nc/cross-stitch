/* Unpicking and catch-up (tracking audit STATS-04 and STATS-07), in the Tracker. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, pref) {
  await page.addInitScript((p) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    if (p) localStorage.setItem('cs_pref_trackerMarkAllAs', JSON.stringify(p));
  } catch (_) {} }, pref || null);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i < 200 ? '310' : '321', type: 'solid', rgb: i < 200 ? [0, 0, 0] : [200, 0, 0] }));
    const done = new Array(W * H).fill(0);
    for (let i = 0; i < 20; i++) done[300 + i] = 1;            // 20 stitches of earlier days
    const id = await ProjectStorage.save({ id: 'proj_b3', name: 'Batch3', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 200, symbol: 'A' }, { id: '321', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 200, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
// The phone-sized palette chip cycles closed, narrow and open; press it until the colour list is there.
async function openPalette(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.locator('.ppal-tile-done-btn').count()) break;
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Open colour palette panel"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
}
const popoverRow = async (page, label) => {
  await page.evaluate(() => { const c = document.querySelector('.ppal-close'); if (c) c.click(); });
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /Progress info/ }).click();
  const txt = await page.locator('.app-info-popover').innerText();
  await page.keyboard.press('Escape');
  const m = txt.match(new RegExp(label + '\\s*\\n?\\s*([^\\n]+)'));
  return m ? m[1].trim() : null;
};

test('marking a whole colour asks once; as catch-up it raises progress but not Today', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  page.on('dialog', d => d.accept());                                    // "Mark all 200 stitches ... as done?"
  await openPalette(page);
  await page.locator('.ppal-tile-done-btn').first().click();
  await expect(page.getByText("Count these as today's stitching?")).toBeVisible();
  await page.getByRole('button', { name: 'Count as catch-up' }).click();
  await page.waitForTimeout(600);
  await expect(page.locator('.info-strip-counts')).toHaveText(/^2\d\d done/);       // progress rose by the colour
  expect(await popoverRow(page, 'Today')).toBe('0');                    // ...but Today did not
  const pref = await page.evaluate(() => window.UserPrefs.get('trackerMarkAllAs'));
  expect(pref).toBe('catchup');
});

test('once chosen, it is not asked again', async ({ page }) => {
  const id = await seed(page, 'catchup');
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  page.on('dialog', d => d.accept());
  await openPalette(page);
  await page.locator('.ppal-tile-done-btn').first().click();
  await page.waitForTimeout(600);
  await expect(page.getByText("Count these as today's stitching?")).toHaveCount(0);
  expect(await popoverRow(page, 'Today')).toBe('0');
});

test('counted as today\'s stitching, a whole-colour Done adds to Today', async ({ page }) => {
  const id = await seed(page, 'today');
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  page.on('dialog', d => d.accept());
  await openPalette(page);
  await page.locator('.ppal-tile-done-btn').first().click();
  await page.waitForTimeout(600);
  expect(await popoverRow(page, 'Today')).toBe('200');
});

test('unpicking earlier stitches shows as Unpicked and Today does not go negative', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  // Cells 300..319 are the 20 stitches done earlier: row 15, columns 0..19. Unmark three of them.
  for (const gx of [0, 1, 2]) { const p = await trackerCellPoint(page, gx, 15); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); }
  expect(await popoverRow(page, 'Today')).toBe('0');
  expect(await popoverRow(page, 'Unpicked today')).toBe('3');
});

test('Preferences has the catch-up choice and it is saved', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.dispatchEvent(new Event('cs:openPreferences')));
  await page.getByRole('button', { name: /Stitch Tracker/ }).first().click();
  await expect(page.getByText('Marking a whole colour done counts as')).toBeVisible();
  await page.getByRole('button', { name: 'Today\'s stitching' }).click();
  await expect.poll(() => page.evaluate(() => window.UserPrefs.get('trackerMarkAllAs'))).toBe('today');
});
