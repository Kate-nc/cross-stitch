/**
 * @jest-environment jsdom
 *
 * Backups and restores of projects saved with an overlay (see
 * projectStorageOverlay.test.js). Each restore that succeeds publishes a new
 * storage generation, which this file's ProjectStorage connection does not
 * follow, so the restore that must be refused runs first.
 *
 * The overlay save (ProjectStorage.save(project, { overlay: true })): a Tracker
 * save whose chart is unchanged writes the marks to the progress record and
 * everything else to "overlay:<id>", both fenced to the full record, instead of
 * rewriting the whole project. What is read back (get, backups, chart updates,
 * summaries, material planning) must be what a full save of the same snapshot
 * would have stored, and every durability and conflict rule of the full save
 * must still hold.
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
eval(fs.readFileSync(path.join(__dirname, '..', 'threadCalc.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const seen = new Map();
let tabId = 'tab-A';
window.CrossTabCoord = {
  get tabId() { return tabId; },
  noteSeen: (id, at, tab) => seen.set(id, { lastWriteAt: at, lastWriteTabId: tab }),
  getSeen: id => seen.get(id) || null,
  broadcastProjectSaved: () => {},
};

const N = 12;
const pattern = () => Array.from({ length: N }, (_, i) => ({ id: i % 3 ? '310' : '550', type: 'solid' }));
const proj = (over) => Object.assign({
  id: 'proj_o', name: 'O', settings: { sW: 4, sH: 3, fabricCt: 14 }, pattern: pattern(),
  done: new Array(N).fill(0), halfDone: [], knotsDone: [], beadsDone: [], bsDone: [], partialDone: [], specialtyDone: [],
  statsSessions: [], notes: 'first',
}, over);
const OVERLAY = { overlay: true };
const tick = () => new Promise(r => setTimeout(r, 3));

async function raw(store, key) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
// Count project-record reads and writes from here on.
function spyProjects() {
  const Store = require('fake-indexeddb/lib/FDBObjectStore');
  const get = Store.prototype.get, put = Store.prototype.put;
  const n = { gets: 0, puts: 0 };
  const g = jest.spyOn(Store.prototype, 'get').mockImplementation(function (k) { if (this.name === 'projects') n.gets++; return get.call(this, k); });
  const p = jest.spyOn(Store.prototype, 'put').mockImplementation(function (v, k) { if (this.name === 'projects') n.puts++; return put.call(this, v, k); });
  n.restore = () => { g.mockRestore(); p.mockRestore(); };
  return n;
}
// The marks a project's sync registers stand for, and its value registers' values.
const marksOf = p => {
  const m = TrackingSync.merge(p, {});
  return { done: m.done, half: m.halfDone, knots: m.knotsDone };
};

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  await ProjectStorage.clearAllProgress();
  ProjectStorage._deletedIds.clear();
  seen.clear();
  tabId = 'tab-A';
});

// A project as the Tracker holds it: saved once in full, then read back as the
// Tracker loads it (get() remembers the stored record as the base).
async function opened(over) {
  const p = proj(over);
  await ProjectStorage.save(p);
  const loaded = await ProjectStorage.get(p.id);
  seen.set(p.id, { lastWriteAt: loaded.lastWriteAt, lastWriteTabId: loaded.lastWriteTabId });
  return loaded;
}
// The Tracker's next snapshot: the loaded fields, its own (serialised) pattern array.
const snapshot = (loaded, over) => Object.assign({}, loaded, { pattern: pattern(), navigationAt: Date.now() }, over);

test('a backup whose project really differs is still refused as a collision', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'Here' }), OVERLAY);
  const { load } = require('./setup/backup-harness');
  const harness = load(global.indexedDB, { storage: window.localStorage, ProjectStorage, ThreadAccounting: require('../thread-accounting.js') });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const backup = await harness.api.createBackup();
  // Renamed again after the backup: the backup's copy is a different version.
  const now = await ProjectStorage.get('proj_o');
  await ProjectStorage.save(Object.assign({}, now, { pattern: pattern(), name: 'Renamed since', navigationAt: Date.now() }), OVERLAY);
  await expect(harness.api.restore(backup)).rejects.toThrow(/Identifier collision in projects: proj_o/);
  expect((await ProjectStorage.get('proj_o')).name).toBe('Renamed since');
});

// Backup creation folds the overlay (and progress) into each project; restore
// compares the backup with this device's projects read the same way, so a
// backup restored unchanged is not an identifier collision.
test('a backup of an overlay-saved project restores unchanged, without a collision', async () => {
  const loaded = await opened();
  const done = loaded.done.slice(); done[1] = 1;
  await ProjectStorage.save(snapshot(loaded, { name: 'Renamed in the Tracker', done }), OVERLAY);
  // A later mark only the progress record holds, too.
  const d2 = new Uint8Array(N); d2[1] = 1; d2[2] = 1;
  await ProjectStorage.saveProgress('proj_o', { done: d2, baseWriteAt: seen.get('proj_o').lastWriteAt, tabId: 'tab-A' });
  const { load } = require('./setup/backup-harness');
  const harness = load(global.indexedDB, { storage: window.localStorage, ProjectStorage, ThreadAccounting: require('../thread-accounting.js') });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  const backup = await harness.api.createBackup();
  const entry = backup.databases.CrossStitchDB.projects.find(e => e.key === 'proj_o');
  expect(entry.value.name).toBe('Renamed in the Tracker');
  expect(entry.value.done.slice(0, 3)).toEqual([0, 1, 1]);
  // No identifier collision, and the project counts as the same one (this
  // harness republishes for its other stores, as for any project).
  const result = await harness.api.restore(backup);
  expect(result.duplicateProjects).toBe(1);
  const p = await ProjectStorage.get('proj_o');
  expect(p.name).toBe('Renamed in the Tracker');
  expect(p.done.slice(0, 3)).toEqual([0, 1, 1]);
});

