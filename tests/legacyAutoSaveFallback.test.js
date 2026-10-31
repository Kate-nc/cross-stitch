/**
 * @jest-environment jsdom
 *
 * The Tracker's periodic autosave no longer writes a second copy of the whole
 * project under the legacy "auto_save" key (tap-lag audit, fix #4): on a large
 * chart that clone cost ~350 ms of main thread per autosave. The legacy copy is
 * therefore often older than the project record, so loadProjectFromDB() — the
 * fallback the Creator and Stash Manager use when no active project is set —
 * must open the project record when the legacy copy names one.
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

const TRACKER = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const proj = (over) => Object.assign({ id: 'proj_a', name: 'A', settings: { sW: 3, sH: 2 }, pattern: Array.from({ length: 6 }, () => ({ id: '310' })), done: [0, 0, 0, 0, 0, 0] }, over);

beforeEach(async () => { await ProjectStorage.clearAllProjects(); ProjectStorage._deletedIds.clear(); window.__restoringBackup = 0; });

test('a stale legacy copy of a stored project opens the stored project instead', async () => {
  await saveProjectToDB(proj({ done: [1, 0, 0, 0, 0, 0] }));
  await ProjectStorage.save(proj({ done: [1, 1, 1, 0, 0, 0] }));
  expect((await loadProjectFromDB()).done).toEqual([1, 1, 1, 0, 0, 0]);
});

test('a legacy copy with no stored project of its own is still returned', async () => {
  await saveProjectToDB(proj({ id: 'proj_gone', done: [1, 0, 0, 0, 0, 0] }));
  expect((await loadProjectFromDB()).done).toEqual([1, 0, 0, 0, 0, 0]);
  await saveProjectToDB(proj({ id: undefined, done: [0, 1, 0, 0, 0, 0] }));
  expect((await loadProjectFromDB()).done).toEqual([0, 1, 0, 0, 0, 0]);
});

test('a stored project in the compact .p form is preferred too', async () => {
  await saveProjectToDB(proj({ done: [1, 0, 0, 0, 0, 0] }));
  const compact = proj({ done: [1, 1, 0, 0, 0, 0] });
  compact.p = compact.pattern.map(c => [c.id]); delete compact.pattern;
  await ProjectStorage.save(compact);
  const got = await loadProjectFromDB();
  expect(got.p).toBeTruthy();
  expect(got.done).toEqual([1, 1, 0, 0, 0, 0]);
});

test('no legacy copy is still nothing', async () => {
  await clearProjectFromDB();
  expect(await loadProjectFromDB()).toBeUndefined();
});

test('the periodic autosave writes only the project record; unload and flush still refresh the legacy copy', () => {
  const start = TRACKER.indexOf('const project = buildSnapshot();\n    if (!project) {');
  expect(start).toBeGreaterThan(0);
  const body = TRACKER.slice(start, TRACKER.indexOf('}, _autoSaveDelay);', start));
  expect(body).toMatch(/persistProjectRecord\(project\)/);
  expect(body).not.toMatch(/saveProjectToDB\(/);
  expect(body).toMatch(/__updateCreatorTrackerFields/);   // the Creator hand-over still runs
  expect(TRACKER).toMatch(/const handleBeforeUnload = \(\) => \{[\s\S]*?saveProjectToDB\(projectToSave\)/);
  expect(TRACKER).toMatch(/window\.__flushProjectToIDB = async function\(\) \{[\s\S]*?await saveProjectToDB\(project, \{ strict: true \}\)/);
});
