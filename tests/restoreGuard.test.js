/**
 * @jest-environment jsdom
 *
 * While a backup is being restored the page must not write projects: it reloads afterwards, and
 * its unload save would put the open (old) project back over the restored one
 * (tracking audit Phase 1 bug hunt).
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const proj = (over) => Object.assign({ id: 'proj_r', name: 'R', settings: { sW: 3, sH: 2 }, pattern: Array.from({ length: 6 }, () => ({ id: '310' })), done: [0, 0, 0, 0, 0, 0] }, over);

beforeEach(async () => { await ProjectStorage.clearAllProjects(); ProjectStorage._deletedIds.clear(); window.__restoringBackup = 0; });

test('save and saveProgress write nothing while a restore is under way, and write again when the mark expires', async () => {
  await ProjectStorage.save(proj());
  window.__restoringBackup = Date.now() + 5000;
  expect(await ProjectStorage.save(proj({ done: [1, 1, 1, 1, 1, 1] }))).toBe('proj_r');
  expect(await ProjectStorage.saveProgress('proj_r', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: null })).toBe(false);
  expect((await ProjectStorage.get('proj_r')).done).toEqual([0, 0, 0, 0, 0, 0]);
  window.__restoringBackup = Date.now() - 1;                           // expired: saving works again
  await ProjectStorage.save(proj({ done: [1, 1, 1, 1, 1, 1] }));
  expect((await ProjectStorage.get('proj_r')).done).toEqual([1, 1, 1, 1, 1, 1]);
});

test('the legacy auto-save is held too', async () => {
  window.__restoringBackup = Date.now() + 5000;
  await saveProjectToDB(proj());
  window.__restoringBackup = 0;
  expect(await loadProjectFromDB()).toBeUndefined();
});

test('restore() sets the mark after the cancel checks and clears it if the restore fails', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'backup-restore.js'), 'utf8');
  expect(src).toMatch(/window\.__restoringBackup = Number\.MAX_SAFE_INTEGER;\s*\n\s*\n\s*\/\/ 1\. CrossStitchDB/);
  expect(src).toContain('if (typeof window !== "undefined") window.__restoringBackup = 0;');
  expect(src).toContain('catch (_) { window.__restoringBackup = Number.MAX_SAFE_INTEGER; }');
  expect(src.indexOf('Restore cancelled')).toBeLessThan(src.indexOf('window.__restoringBackup = Number.MAX_SAFE_INTEGER', src.indexOf('async _restoreWithoutGuard')));
});
