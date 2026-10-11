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
// The project record as stored (not as ProjectStorage.get() presents it, which also applies the
// small progress record): these tests are about what the full save has written.
const stored = page => page.evaluate(async () => {
  const id = localStorage.getItem('crossstitch_active_project');
  const db = await getDB();
  const p = await new Promise(r => { const q = db.transaction('projects').objectStore('projects').get(id); q.onsuccess = () => r(q.result); });
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

  test('a drag that has not been released yet is included when the tab is hidden', async ({ page }) => {
    await loadTrackerFixture(page);
    const a = await trackerCellPoint(page, 2, 3), b = await trackerCellPoint(page, 7, 3);
    await page.mouse.move(a.x - 3, a.y);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 10, a.y);
    // Still holding the button: nothing committed yet.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await stored(page)).done, { timeout: 2000 }).toBe(6);   // cells 2..7
    await page.mouse.up();
    await page.waitForTimeout(200);
    expect(await trackerDoneCount(page)).toBe(6);
  });

  test('hiding the tab twice writes once', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    const hide = () => page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(() => {
      window.__puts = 0;
      const orig = ProjectStorage.save.bind(ProjectStorage);
      ProjectStorage.save = function () { window.__puts++; return orig.apply(null, arguments); };
    });
    await hide();
    await expect.poll(() => page.evaluate(() => window.__puts), { timeout: 2000 }).toBe(1);
    await hide(); await hide();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__puts)).toBe(1);
  });

  test('marks survive a hard close half a second after marking (no unload handler runs)', async ({ page, context }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.waitForTimeout(700);                         // the progress record, not the full save (5 s)
    const other = await context.newPage();
    await other.goto('/home.html');
    await other.waitForFunction(() => window.ProjectStorage);
    const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
    // The full project record still has no marks...
    const raw = await other.evaluate(async id => {
      const db = await getDB();
      const p = await new Promise(r => { const q = db.transaction('projects').objectStore('projects').get(id); q.onsuccess = () => r(q.result); });
      return p.done.filter(v => v === 1).length;
    }, id);
    expect(raw).toBe(0);
    await page.close({ runBeforeUnload: false });
    // ...but the project as loaded has them.
    const loaded = await other.evaluate(async id => (await ProjectStorage.get(id)).done.filter(v => v === 1).length, id);
    expect(loaded).toBe(10);
    await other.goto('/stitch.html?id=' + id);
    await other.waitForSelector(TRACKER_CANVAS);
    await other.waitForTimeout(600);
    expect(await trackerDoneCount(other)).toBe(10);
  });

  test('a later full save retires the progress record, and marks made after it are kept too', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.waitForTimeout(6500);                        // full save has run
    await markRow(page, 4, 2, 6);                           // 5 more: only the progress record has them
    await page.waitForTimeout(700);
    const loaded = await page.evaluate(async () => {
      const id = localStorage.getItem('crossstitch_active_project');
      return (await ProjectStorage.get(id)).done.filter(v => v === 1).length;
    });
    expect(loaded).toBe(15);
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
