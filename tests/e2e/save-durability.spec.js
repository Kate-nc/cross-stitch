/* Marked stitches survive a refresh, a tab switch and the flush that Backup and
   Sync run before reading the database (tracking audit TRACK-01).

   Before the fix: marks made in the last few seconds were lost on reload, the
   flush wrote the last autosave's `done` (or, before the first autosave, a record
   with no pattern at all), and a reload right after opening could leave a project
   that would not open. */
const { test, expect } = require('@playwright/test');
const {
  loadTrackerFixture,
  trackerCellPoint,
  trackerDoneCount,
  TRACKER_CANVAS,
} = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function markRow(page, row, from, to) {
  const a = await trackerCellPoint(page, from, row), b = await trackerCellPoint(page, to, row);
  await page.mouse.move(a.x - 3, a.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y);
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const stored = page => page.evaluate(async () => {
  const id = localStorage.getItem('crossstitch_active_project');
  const p = await ProjectStorage.get(id);
  return p ? { hasPattern: !!p.pattern, patternLen: p.pattern && p.pattern.length, done: p.done ? p.done.filter(v => v === 1).length : null } : null;
});
async function reopen(page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  const recap = page.locator('.resume-recap-overlay');
  if (await recap.count()) { await recap.getByRole('button', { name: /continue/i }).click(); await page.waitForTimeout(200); }
}

test.describe('Tracker saves', () => {
  test('marks made a moment before a reload are still there', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    expect(await trackerDoneCount(page)).toBe(10);
    await page.waitForTimeout(6500);                       // first autosave
    await markRow(page, 4, 2, 11);
    expect(await trackerDoneCount(page)).toBe(20);
    await reopen(page);                                    // well inside the next debounce
    expect(await trackerDoneCount(page)).toBe(20);
    expect((await stored(page)).done).toBe(20);
  });

  test('the flush Backup and Sync call saves what is on screen, and keeps the pattern', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.evaluate(() => window.__flushProjectToIDB());   // before any autosave has run
    let s = await stored(page);
    expect(s.hasPattern).toBe(true);
    expect(s.patternLen).toBe(3600);
    expect(s.done).toBe(10);
    await page.waitForTimeout(6500);
    await markRow(page, 4, 2, 11);
    await page.evaluate(() => window.__flushProjectToIDB());   // after one
    s = await stored(page);
    expect(s.done).toBe(20);
  });

  test('a backup taken right after marking includes the marks', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    const marked = await page.evaluate(async () => {
      const B = await window.loadBackupRestore();
      const backup = await B.createBackup();
      const id = localStorage.getItem('crossstitch_active_project');
      const entry = backup.databases.CrossStitchDB.projects.find(e => e.key === id);
      return entry && entry.value.pattern ? entry.value.done.filter(v => v === 1).length : -1;
    });
    expect(marked).toBe(10);
  });

  test('a project reloaded straight after opening still opens', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 6);
    await page.waitForTimeout(150);
    await reopen(page);
    await expect(page.locator(TRACKER_CANVAS)).toHaveCount(1);
    expect((await stored(page)).hasPattern).toBe(true);
    expect(await trackerDoneCount(page)).toBe(5);
  });

  test('hiding the tab saves unsaved marks at once', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await stored(page)).done, { timeout: 2000 }).toBe(10);
  });

  test('steady marking is saved at least every 10 seconds', async ({ page }) => {
    test.setTimeout(60000);
    await loadTrackerFixture(page);
    // A mark every 2 s restarts the 5 s debounce each time; the cap must still save.
    for (let i = 0; i < 7; i++) {
      await markRow(page, 3 + i, 2, 3);
      await page.waitForTimeout(1850);
    }
    expect((await stored(page)).done).toBeGreaterThan(0);
  });
});
