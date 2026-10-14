/**
 * @jest-environment jsdom
 *
 * The Tracker's small progress record (ProjectStorage.saveProgress): marked stitches
 * written about every 400 ms, in pendingImports as "progress:<id>", and believed only
 * while it is newer than the project record (tracking audit TRACK-01).
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
global.ensurePersistence = () => {};
// A real structured clone: the progress record holds a typed array, which a JSON round trip would turn into a plain object.
const v8 = require('v8');
global.structuredClone = v => v8.deserialize(v8.serialize(v));

// project-storage.js gets its DB through helpers.js getDB; use the real one.
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8'));
window.ProjectStorage = ProjectStorage;

const N = 6;
const pattern = () => Array.from({ length: N }, () => ({ id: '310' }));
const proj = (over) => Object.assign({ id: 'proj_p', name: 'P', settings: { sW: 3, sH: 2 }, pattern: pattern(), done: [0, 0, 0, 0, 0, 0] }, over);
const base = async (id) => (await ProjectStorage.get(id)).lastWriteAt;

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  await ProjectStorage.clearAllProgress();
  ProjectStorage._deletedIds.clear();
});

test('progress newer than the project record is applied by get()', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  expect(await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 0, 0, 0, 1]), baseWriteAt: b })).toBe(true);
  const p = await ProjectStorage.get('proj_p');
  expect(p.done).toEqual([1, 1, 0, 0, 0, 1]);
  expect(p.pattern).toHaveLength(N);                    // everything else comes from the project record
});

test('half-stitch and knot marks come with it; empty knot marks read as absent', async () => {
  await ProjectStorage.save(proj({ halfDone: [], knotsDone: ['1,1'] }));
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), halfDone: [[2, { fwd: true }]], knotsDone: [], baseWriteAt: b });
  const p = await ProjectStorage.get('proj_p');
  expect(p.halfDone).toEqual([[2, { fwd: true }]]);
  expect(p.knotsDone).toBeUndefined();
});

test('a later write to the project retires the progress record', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: b });
  await new Promise(r => setTimeout(r, 5));
  await ProjectStorage.save(proj({ done: [1, 0, 0, 0, 0, 0] }));   // full save, or a sync import, restore or rename
  expect((await ProjectStorage.get('proj_p')).done).toEqual([1, 0, 0, 0, 0, 0]);
});

test('a record for a different pattern size is ignored', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1]), baseWriteAt: b });
  expect((await ProjectStorage.get('proj_p')).done).toEqual([0, 0, 0, 0, 0, 0]);
});

test('a project that has no write time yet matches a record written with none', async () => {
  const id = 'proj_legacy';
  // Put a record straight into the store without ProjectStorage.save (no lastWriteAt).
  const db = await getDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(proj({ id }), id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  await ProjectStorage.saveProgress(id, { done: Uint8Array.from([1, 0, 0, 0, 0, 0]), baseWriteAt: null });
  expect((await ProjectStorage.get(id)).done).toEqual([1, 0, 0, 0, 0, 0]);
});

test('deleting a project deletes its progress record, and none is written for a deleted id', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: b });
  await ProjectStorage.delete('proj_p');
  const db = await getDB();
  const rec = await ProjectStorage._readProgress(db, 'proj_p');
  expect(rec).toBeNull();
  expect(await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: b })).toBe(false);
});

test('clearAllProjects and clearAllProgress remove progress records', async () => {
  await ProjectStorage.save(proj());
  await ProjectStorage.save(proj({ id: 'proj_q' }));
  const bp = await base('proj_p'), bq = await base('proj_q');
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: bp });
  await ProjectStorage.saveProgress('proj_q', { done: new Uint8Array(N), baseWriteAt: bq });
  expect(await ProjectStorage.clearAllProgress()).toBe(2);
  const db = await getDB();
  expect(await ProjectStorage._readProgress(db, 'proj_p')).toBeNull();
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: bp });
  await ProjectStorage.clearAllProjects();
  expect(await ProjectStorage._readProgress(db, 'proj_p')).toBeNull();
});

test('progress records never show up as projects', async () => {
  await ProjectStorage.save(proj());
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: await base('proj_p') });
  expect((await ProjectStorage.listProjects()).map(m => m.id)).toEqual(['proj_p']);
});

test('the full save of the project does not need to know about the record (the stale record is just ignored)', async () => {
  await ProjectStorage.save(proj());
  await ProjectStorage.saveProgress('proj_p', { done: Uint8Array.from([1, 1, 1, 1, 1, 1]), baseWriteAt: 12345 });  // based on some other write
  expect((await ProjectStorage.get('proj_p')).done).toEqual([0, 0, 0, 0, 0, 0]);
});

const journalKey = id => 'crossstitch_progress_recovery:' + id;
const rawProject = async id => {
  const db = await getDB();
  return new Promise(resolve => {
    const req = db.transaction('projects').objectStore('projects').get(id);
    req.onsuccess = () => resolve(req.result);
  });
};
test('navigation journal alone recovers all mark types into the full record once', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  expect(ProjectStorage.saveProgressRecovery('proj_p', {
    done: [1, 0, 1, 0, 0, 0], halfDone: [[1, { fwd: true }]], knotsDone: ['1,1'],
    bsDone: ['line'], partialDone: [[3, ['tl']]], baseWriteAt: b
  })).toBe(true);
  expect((await rawProject('proj_p')).done).toEqual([0, 0, 0, 0, 0, 0]);
  const p = await ProjectStorage.get('proj_p');
  expect(p).toMatchObject({ done: [1, 0, 1, 0, 0, 0], halfDone: [[1, { fwd: true }]], knotsDone: ['1,1'], bsDone: ['line'], partialDone: [[3, ['tl']]], lastWriteAt: b });
  expect((await rawProject('proj_p')).done).toEqual(p.done);
  expect(localStorage.getItem(journalKey('proj_p'))).toBeNull();
});
test('stale navigation journal cannot override a full save or another project', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: b - 1 });
  await ProjectStorage.save(proj({ id: 'proj_q' }));
  expect((await ProjectStorage.get('proj_p')).done).toEqual(new Array(N).fill(0));
  expect((await ProjectStorage.get('proj_q')).done).toEqual(new Array(N).fill(0));
});
test('newer IndexedDB progress wins over a journal, including unpicks', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: b });
  const rec = JSON.parse(localStorage.getItem(journalKey('proj_p')));
  rec.updatedAt -= 1000;
  localStorage.setItem(journalKey('proj_p'), JSON.stringify(rec));
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: b });
  expect((await ProjectStorage.get('proj_p')).done).toEqual(new Array(N).fill(0));
  expect((await rawProject('proj_p')).done).toEqual(new Array(N).fill(0));
});
test('restore and deletion clear navigation journals', async () => {
  await ProjectStorage.save(proj());
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: await base('proj_p') });
  await ProjectStorage.clearAllProgress();
  expect(localStorage.getItem(journalKey('proj_p'))).toBeNull();
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: await base('proj_p') });
  await ProjectStorage.delete('proj_p');
  expect(localStorage.getItem(journalKey('proj_p'))).toBeNull();
  expect(ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1) })).toBe(false);
});

test('a delayed older progress write cannot undo recovered marks', async () => {
  await ProjectStorage.save(proj());
  const b = await base('proj_p');
  ProjectStorage.saveProgressRecovery('proj_p', { done: new Array(N).fill(1), baseWriteAt: b });
  const rec = JSON.parse(localStorage.getItem(journalKey('proj_p')));
  rec.updatedAt += 1000; // stand in for a snapshot taken after the delayed caller
  localStorage.setItem(journalKey('proj_p'), JSON.stringify(rec));
  await ProjectStorage.get('proj_p');
  await ProjectStorage.saveProgress('proj_p', { done: new Uint8Array(N), baseWriteAt: b });
  expect((await ProjectStorage.get('proj_p')).done).toEqual(new Array(N).fill(1));
});

test('backup progress rows use the same validity checks and rebuild both summaries without mutating the source', () => {
  const p = proj({ lastWriteAt: 10 });
  const rec = { v: 1, baseWriteAt: 10, done: new Uint8Array([1, 1, 0, 0, 0, 1]) };
  const rows = ProjectStorage.backupProgressRows(p, rec);
  expect(rows.project.done).toEqual([1, 1, 0, 0, 0, 1]);
  expect(rows.meta.completedStitches).toBe(3);
  expect(rows.stats.completedStitches).toBe(3);
  expect(p.done).toEqual([0, 0, 0, 0, 0, 0]);
  expect(ProjectStorage.backupProgressRows(p, { ...rec, baseWriteAt: 9 })).toBeNull();
  expect(ProjectStorage.backupProgressRows(p, { ...rec, done: new Uint8Array(5) })).toBeNull();
});

test('strict backup flush propagates a legacy record write failure', async () => {
  const { IDBObjectStore } = require('fake-indexeddb');
  const original = IDBObjectStore.prototype.put;
  const failure = new DOMException('Injected quota failure', 'QuotaExceededError');
  const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, key) {
    if (key === 'auto_save') throw failure;
    return original.apply(this, arguments);
  });
  try {
    await expect(saveProjectToDB(proj(), { strict: true })).rejects.toBe(failure);
  } finally { spy.mockRestore(); }
});

test('strict backup flush rejects a transaction aborted after its write request', async () => {
  const { IDBObjectStore } = require('fake-indexeddb');
  const original = IDBObjectStore.prototype.put;
  const spy = jest.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(value, key) {
    const req = original.apply(this, arguments);
    if (key === 'auto_save') this.transaction.abort();
    return req;
  });
  try {
    await expect(saveProjectToDB(proj(), { strict: true })).rejects.toBeTruthy();
  } finally { spy.mockRestore(); }
});
