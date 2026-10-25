/* Compact colour list in the Stitch Tracker: one slim line per colour, the selected colour's buttons in the card
   above the list, and the choice kept on this device across reloads. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerMarkAllAs', JSON.stringify('today'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i < 200 ? '310' : '321', type: 'solid', rgb: i < 200 ? [0, 0, 0] : [200, 0, 0] }));
    const done = new Array(W * H).fill(0);
    for (let i = 0; i < 20; i++) done[300 + i] = 1;
    const id = await ProjectStorage.save({ id: 'proj_compact', name: 'Compact', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, halfStitches: [], halfDone: [], bsLines: [],
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 200, symbol: 'A' }, { id: '321', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 200, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
// The phone-sized palette chip cycles closed, narrow and open; press it until the colour list is there.
async function openPalette(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.locator('.ppal-tile').count()) break;
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Open colour palette panel"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(300);
}
async function openTracker(page) {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  await openPalette(page);
}
const row = (page, id) => page.locator('.ppal-tile', { has: page.locator('.ppal-tile-id', { hasText: new RegExp('^DMC ' + id + '$') }) });

test('Compact list gives one line per colour with no buttons, and comes back after a reload', async ({ page }) => {
  await openTracker(page);
  const compactBtn = page.getByRole('button', { name: 'Compact list' });
  await expect(compactBtn).toHaveAttribute('aria-pressed', 'false');
  await compactBtn.click();
  await expect(compactBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.ppal-tile--compact')).toHaveCount(2);
  await expect(page.locator('.ppal-tile-list .ppal-tile-done-btn')).toHaveCount(0);
  // The notes above the list are hidden.
  await expect(page.getByRole('group', { name: 'Key to stitch colours' })).toHaveCount(0);
  const h = (await row(page, '321').boundingBox()).height;
  expect(h).toBeLessThan(60);
  expect(await page.evaluate(() => localStorage.getItem('cs_trackerCompactColours'))).toBe('1');

  await page.reload();
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  await openPalette(page);
  await expect(page.locator('.ppal-tile--compact')).toHaveCount(2);

  await page.getByRole('button', { name: 'Comfortable list' }).click();
  await expect(page.locator('.ppal-tile--compact')).toHaveCount(0);
  await expect(page.locator('.ppal-tile-list .ppal-tile-done-btn')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('cs_trackerCompactColours'))).toBe('0');
});

test('in the compact list the selected colour\'s card holds Mark all done, which still asks first', async ({ page }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'Compact list' }).click();
  await row(page, '321').locator('.ppal-tile-select').click();
  await openPalette(page);   // on a narrow screen choosing a colour closes the list
  await expect(row(page, '321')).toHaveClass(/ppal-tile--on/);
  const card = page.locator('.ppal-active-tile--compact');
  await expect(card).toContainText('DMC 321');
  await expect(card).toContainText('20/200');
  const chip = card.locator('.ppal-tile-done-btn');
  await expect(chip).toHaveText('Mark all done');
  await chip.click();
  await expect(page.getByRole('dialog')).toContainText('Mark all 180 stitches of DMC 321 Christmas Red as done?');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test.describe('dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test('the selected list size looks different from the other one', async ({ page }) => {
    await openTracker(page);
    await expect(page.locator('html')).toHaveClass(/pref-dark/);
    const look = (name) => page.getByRole('button', { name }).evaluate(b => { const s = getComputedStyle(b); return s.backgroundColor + ' ' + s.color; });
    await page.getByRole('button', { name: 'Compact list' }).click();
    await expect(page.getByRole('button', { name: 'Compact list' })).toHaveAttribute('aria-pressed', 'true');
    expect(await look('Compact list')).not.toBe(await look('Comfortable list'));
    await page.getByRole('button', { name: 'Comfortable list' }).click();
    await expect(page.getByRole('button', { name: 'Comfortable list' })).toHaveAttribute('aria-pressed', 'true');
    expect(await look('Comfortable list')).not.toBe(await look('Compact list'));
  });
});
