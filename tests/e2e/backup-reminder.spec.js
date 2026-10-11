/* The File menu says when you last backed up, and the Tracker offers a backup after
   14 days (tracking audit TRACK-03, recommendation 3). */
const { test, expect } = require('@playwright/test');
const { loadTrackerFixture, trackerCellPoint, TRACKER_CANVAS } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function markRow(page, row, from, to) {
  const a = await trackerCellPoint(page, from, row), b = await trackerCellPoint(page, to, row);
  await page.mouse.move(a.x - 3, a.y); await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y);
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test.describe('Backup reminder', () => {
  test('after 14 days without a backup, marking offers one; Not now holds it back', async ({ page }) => {
    await loadTrackerFixture(page);
    await page.evaluate(() => { localStorage.setItem('cs_last_backup_at', String(Date.now() - 20 * 86400000)); sessionStorage.removeItem('cs_backup_reminded'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(TRACKER_CANVAS);
    await page.waitForTimeout(800);
    const recap = page.locator('.resume-recap-overlay');
    if (await recap.count()) { await recap.getByRole('button', { name: /continue/i }).click(); }
    await markRow(page, 3, 2, 6);
    await expect(page.getByText(/Your last backup was 20 days ago/)).toBeVisible({ timeout: 9000 });
    await page.getByRole('button', { name: 'Not now' }).click();
    expect(Number(await page.evaluate(() => localStorage.getItem('cs_backup_snooze_until')))).toBeGreaterThan(Date.now() + 6 * 86400000);
  });

  test('a recent backup shows no offer, and the File menu says when it was', async ({ page }) => {
    await loadTrackerFixture(page);
    await page.evaluate(() => { localStorage.setItem('cs_last_backup_at', String(Date.now() - 3 * 86400000)); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(TRACKER_CANVAS);
    await page.waitForTimeout(800);
    const recap = page.locator('.resume-recap-overlay');
    if (await recap.count()) { await recap.getByRole('button', { name: /continue/i }).click(); }
    await markRow(page, 3, 2, 6);
    await page.waitForTimeout(5000);
    await expect(page.getByText(/Your last backup was/)).toHaveCount(0);
    await page.getByRole('button', { name: /^File/ }).click();
    await expect(page.getByText('Last backed up 3 days ago')).toBeVisible();
  });

  test('Export Backup records the time', async ({ page }) => {
    await loadTrackerFixture(page);
    await page.getByRole('button', { name: /^File/ }).click();
    await expect(page.getByText('Not backed up yet')).toBeVisible();
    const dl = page.waitForEvent('download', { timeout: 15000 });
    await page.getByText('Export Backup').click();
    await dl;
    await expect.poll(() => page.evaluate(() => Number(localStorage.getItem('cs_last_backup_at')))).toBeGreaterThan(Date.now() - 60000);
  });
});
