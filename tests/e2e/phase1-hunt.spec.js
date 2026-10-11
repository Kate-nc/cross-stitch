/* Phase 1 end-of-phase bug hunt: situations that cut across the batches
   (restore while unsaved, a failing disk, offline, a Creator and a Tracker on one project). */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadTrackerFixture, trackerCellPoint, trackerDoneCount, TRACKER_CANVAS } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function markRow(page, row, from, to) {
  const a = await trackerCellPoint(page, from, row), b = await trackerCellPoint(page, to, row);
  await page.mouse.move(a.x - 3, a.y); await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y);
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const storedMarks = page => page.evaluate(async () => {
  const p = await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
  return p ? p.done.filter(v => v === 1).length : null;
});

test.describe('Phase 1 bug hunt', () => {
  test('restoring a backup while the Tracker has unsaved marks restores the backup, not the open page', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);                                    // 10 marks
    await page.evaluate(() => window.__flushProjectToIDB());
    const backup = await page.evaluate(async () => JSON.stringify(await (await window.loadBackupRestore()).createBackup()));
    const file = path.join(os.tmpdir(), 'phase1-hunt-backup.json');
    fs.writeFileSync(file, backup);
    await markRow(page, 4, 2, 11);                                    // 10 more, not yet fully saved
    expect(await trackerDoneCount(page)).toBe(20);
    await page.getByRole('button', { name: /^File/ }).click();
    await page.locator('input[type="file"]').last().setInputFiles(file);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(TRACKER_CANVAS, { timeout: 15000 });
    await page.waitForTimeout(1500);
    expect(await storedMarks(page)).toBe(10);                          // the backup's state
    await expect.poll(() => trackerDoneCount(page), { timeout: 10000 }).toBe(10);
  });

  test('a disk that is full fails the progress record quietly and the marks stay on screen', async ({ page }) => {
    await loadTrackerFixture(page);
    await page.evaluate(() => {
      const orig = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () { const e = new DOMException('full', 'QuotaExceededError'); throw e; };
      window.__restorePut = () => { IDBObjectStore.prototype.put = orig; };
    });
    await markRow(page, 3, 2, 11);
    await page.waitForTimeout(1500);
    expect(await trackerDoneCount(page)).toBe(10);                    // marking still works
    await page.evaluate(() => window.__restorePut());
    await page.evaluate(() => window.__flushProjectToIDB());
    expect(await storedMarks(page)).toBe(10);                          // and a later save lands
  });

  test('marking and saving work offline (everything is local)', async ({ page, context }) => {
    await loadTrackerFixture(page);
    await context.setOffline(true);
    await markRow(page, 3, 2, 11);
    await page.evaluate(() => window.__flushProjectToIDB());
    expect(await storedMarks(page)).toBe(10);
    await context.setOffline(false);
  });

  test('a rename in the Creator while the Tracker holds marks: the Tracker keeps its marks and asks', async ({ page, context }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.evaluate(() => window.__flushProjectToIDB());
    await markRow(page, 6, 2, 6);                                      // 5 more here, not yet saved
    const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
    const other = await context.newPage();
    await other.goto('/create.html');
    await other.waitForFunction(() => window.ProjectStorage);
    await other.evaluate(async id => {
      const p = await ProjectStorage.get(id);
      p.name = 'Renamed in the Creator';
      await ProjectStorage.save(p);
    }, id);
    await expect(page.getByText('Project changed in another tab')).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: 'Keep my edits' }).click();
    await page.evaluate(() => window.__flushProjectToIDB());
    expect(await storedMarks(page)).toBe(15);
  });
});
