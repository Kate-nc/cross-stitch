const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { loadTrackerFixture, trackerCellPoint, trackerDoneCount } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function markFive(page) {
  const a = await trackerCellPoint(page, 2, 3), b = await trackerCellPoint(page, 6, 3);
  await page.mouse.move(a.x - 3, a.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y);
  await page.mouse.up();
  await expect.poll(() => trackerDoneCount(page)).toBe(5);
}

async function failWrites(page, stores) {
  await page.evaluate(stores => {
    window.__failedWrites = [];
    window.__originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, ...args) {
      if (stores.includes(this.name)) {
        window.__failedWrites.push(this.name);
        throw new DOMException('Injected storage quota failure', 'QuotaExceededError');
      }
      return window.__originalPut.call(this, value, ...args);
    };
  }, stores);
}
async function exportBackup(page) {
  await page.getByRole('button', { name: /^File/ }).first().click();
  await page.getByText('Export Backup', { exact: true }).click();
}
async function readDownload(page, download) {
  const text = fs.readFileSync(await download.path(), 'utf8');
  return page.evaluate(async text => (await window.loadBackupRestore()).parseBackupText(text), text);
}

for (const stores of [['projects'], ['projects', 'pendingImports']]) {
  test(`refuses export after ${stores.join(' and ')} writes fail, then exports after recovery`, async ({ page }) => {
    await loadTrackerFixture(page);
    await page.evaluate(() => localStorage.setItem('cs_last_backup_at', '123456'));
    await failWrites(page, stores);
    await markFive(page);
    if (stores.includes('pendingImports')) {
      await expect.poll(() => page.evaluate(() => window.__failedWrites.includes('pendingImports'))).toBe(true);
    }
    const downloads = [];
    page.on('download', d => downloads.push(d));
    await exportBackup(page);
    await expect(page.getByText(/The latest changes could not be included/).first()).toBeVisible();
    expect(downloads).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('cs_last_backup_at'))).toBe('123456');
    expect(await trackerDoneCount(page)).toBe(5);
    const rawDone = await page.evaluate(async () => {
      const db = await getDB();
      const p = await new Promise((resolve, reject) => {
        const r = db.transaction('projects').objectStore('projects').get(localStorage.getItem('crossstitch_active_project'));
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
      return p.done.filter(v => v === 1).length;
    });
    expect(rawDone).toBe(0);
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.__originalPut; });
    const download = page.waitForEvent('download');
    // Use the real download method after dismissing the menu from the failed attempt.
    await page.evaluate(async () => (await window.loadBackupRestore()).downloadBackup());
    const backup = await readDownload(page, await download);
    const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
    expect(backup.databases.CrossStitchDB.projects.filter(e => e.key === id)).toHaveLength(1);
    expect(backup.databases.CrossStitchDB.projects.find(e => e.key === id).value.done.filter(v => v === 1)).toHaveLength(5);
    expect(Number(await page.evaluate(() => localStorage.getItem('cs_last_backup_at')))).toBeGreaterThan(Date.now() - 60000);
  });
}

test('a failed small progress write is recovered by a successful full flush', async ({ page }) => {
  await loadTrackerFixture(page);
  await failWrites(page, ['pendingImports']);
  await markFive(page);
  await expect.poll(() => page.evaluate(() => window.__failedWrites.includes('pendingImports'))).toBe(true);
  const download = page.waitForEvent('download');
  await exportBackup(page);
  const backup = await readDownload(page, await download);
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  expect(backup.databases.CrossStitchDB.projects.find(e => e.key === id).value.done.filter(v => v === 1)).toHaveLength(5);
  expect(Number(await page.evaluate(() => localStorage.getItem('cs_last_backup_at')))).toBeGreaterThan(Date.now() - 60000);
});

test('with no mounted project a backup includes valid persisted progress and matching summaries', async ({ page, context }) => {
  await loadTrackerFixture(page);
  await markFive(page);
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  await expect.poll(() => page.evaluate(async id => {
    const db = await getDB();
    return !!(await ProjectStorage._readProgress(db, id));
  }, id)).toBe(true);
  const home = await context.newPage();
  await home.goto('/home.html');
  await home.waitForFunction(() => window.ProjectStorage);
  const backup = await home.evaluate(async () => (await window.loadBackupRestore()).createBackup());
  const data = backup.databases.CrossStitchDB;
  expect(data.projects.filter(e => e.key === id)).toHaveLength(1);
  expect(data.projects.find(e => e.key === id).value.done.filter(v => v === 1)).toHaveLength(5);
  expect(data.project_meta.find(e => e.key === id).value.completedStitches).toBe(5);
});

test('Creator propagates a failed flush to Export Backup', async ({ page }) => {
  await loadTrackerFixture(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/create.html?from=home');
  await page.getByText('Touch Fixture', { exact: true }).first().waitFor();
  await page.waitForFunction(() => typeof window.__flushProjectToIDB === 'function');
  await failWrites(page, ['projects']);
  const downloads = [];
  page.on('download', d => downloads.push(d));
  await exportBackup(page);
  await expect(page.getByText(/The latest changes could not be included/).first()).toBeVisible();
  expect(downloads).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('cs_last_backup_at'))).toBeNull();
});

test('a failed legacy autosave record also refuses export', async ({ page }) => {
  await loadTrackerFixture(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (this.name === 'projects' && key === 'auto_save') throw new DOMException('Injected autosave failure', 'QuotaExceededError');
      return original.apply(this, arguments);
    };
  });
  await markFive(page);
  const downloads = [];
  page.on('download', d => downloads.push(d));
  await exportBackup(page);
  await expect(page.getByText(/The latest changes could not be included/).first()).toBeVisible();
  expect(downloads).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('cs_last_backup_at'))).toBeNull();
});

test('with no mounted project a navigation journal is included even when IDB recovery cannot write', async ({ page, context }) => {
  await loadTrackerFixture(page);
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  const home = await context.newPage();
  await home.goto('/home.html');
  await home.waitForFunction(() => window.ProjectStorage);
  await failWrites(home, ['projects', 'pendingImports']);
  await failWrites(page, ['projects', 'pendingImports']);
  await markFive(page);
  await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
  const journal = await page.evaluate(id => JSON.parse(localStorage.getItem('crossstitch_progress_recovery:' + id)), id);
  expect(journal.done.filter(v => v === 1)).toHaveLength(5);
  const backup = await home.evaluate(async () => (await window.loadBackupRestore()).createBackup());
  const data = backup.databases.CrossStitchDB;
  expect(data.projects.find(e => e.key === id).value.done.filter(v => v === 1)).toHaveLength(5);
  expect(data.project_meta.find(e => e.key === id).value.completedStitches).toBe(5);
});
