/**
 * @jest-environment jsdom
 *
 * ProjectStorage.saveProgress keeps only the sync registers that differ from the
 * full save a progress record is based on (TrackingSync.recordDelta), instead of
 * one per finished stitch read back, rebuilt and rewritten on every write: the
 * freeze shortly after marking on a large chart. Readers rebuild the whole
 * trackingSync from the base and the delta. tests/progressDelta.test.js holds the
 * rebuilt metadata to what the full record held.
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
const SRC = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8'));
// eslint-disable-next-line no-eval
eval(SRC);
window.ProjectStorage = ProjectStorage;
// Another open page: its own module state, the same database. (The module assigns
// itself to window.ProjectStorage, which the bare name here resolves to: put it back.)
const ThisPage = window.ProjectStorage;
// eslint-disable-next-line no-new-func
const OtherPage = new Function(SRC + '\nreturn ProjectStorage;')();
window.ProjectStorage = ThisPage;

const N = 40;
const proj = (over) => Object.assign({ id: 'proj_s', name: 'S', settings: { sW: 8, sH: 5 }, pattern: Array.from({ length: N }, () => ({ id: '310' })), done: new Array(N).fill(0) }, over);
const marks = (...on) => { const d = new Uint8Array(N); on.forEach(i => { d[i] = 1; }); return d; };
async function stored() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('pendingImports', 'readonly').objectStore('pendingImports').get('progress:proj_s');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}

let calls;
const realRecord = TrackingSync.record;
beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  await ProjectStorage.clearAllProgress();
  ProjectStorage._deletedIds.clear();
  calls = [];
  TrackingSync.record = function (base, next, author, from) { calls.push({ from: from || null, base }); return realRecord.apply(this, arguments); };
});
afterAll(() => { TrackingSync.record = realRecord; });

test('the two pages really are separate instances', () => {
  expect(OtherPage).not.toBe(ThisPage);
  expect(ProjectStorage).toBe(ThisPage);
});

// The base has stitches 10-19 done, so the full trackingSync is larger than any delta.
const based = () => proj({ done: Array.from({ length: N }, (_, i) => (i >= 10 && i < 20 ? 1 : 0)) });
const withBase = (...on) => marks(...on, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19);
const keys = rec => Object.keys(rec.trackingSyncDelta.marks).sort();

test('each write stores only the marks changed since the full save, and never rebuilds them all', async () => {
  await ProjectStorage.save(based());
  const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  calls = [];
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1, 2), baseWriteAt: b, tabId: 'tab-1' });
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1, 2, 3), baseWriteAt: b, tabId: 'tab-1' });
  expect(calls).toEqual([]);                                  // no full TrackingSync.record on the write path
  const rec = await stored();
  expect(rec.trackingSync).toBeUndefined();
  expect(keys(rec)).toEqual(['d:1', 'd:2', 'd:3']);
  // Reading rebuilds every register: the base's and the new ones.
  const p = await ProjectStorage.get('proj_s');
  expect(Object.keys(p.trackingSync.marks).sort()).toEqual(['d:1', 'd:10', 'd:11', 'd:12', 'd:13', 'd:14', 'd:15', 'd:16', 'd:17', 'd:18', 'd:19', 'd:2', 'd:3']);
  expect(p.trackingSync.marks['d:3'][0].value).toBe(1);
  expect(p.done.slice(0, 5)).toEqual([0, 1, 1, 1, 0]);
  expect(TrackingSync.merge(p, {}).done).toEqual(Array.from(withBase(1, 2, 3)));
});

test('the rebuilt registers are what the full record would have held', async () => {
  await ProjectStorage.save(based());
  const base = await ProjectStorage.get('proj_s'), b = base.lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1, 2), baseWriteAt: b, tabId: 'tab-1' });
  await ProjectStorage.saveProgress('proj_s', { done: withBase(2, 4), baseWriteAt: b, tabId: 'tab-1' });
  const got = (await ProjectStorage.get('proj_s')).trackingSync;
  // The old path: each write's full trackingSync from the previous one.
  const empty = { halfDone: [], knotsDone: [], beadsDone: [], bsDone: [], partialDone: [], specialtyDone: [] };
  const s1 = realRecord(base, Object.assign({}, base, empty, { done: withBase(1, 2) }), 'x').trackingSync;
  const p1 = Object.assign({}, base, empty, { done: withBase(1, 2), trackingSync: s1 });
  const s2 = realRecord(p1, Object.assign({}, p1, { done: withBase(2, 4) }), 'x').trackingSync;
  const shape = ts => JSON.stringify(TrackingSync.merge({ pattern: base.pattern, done: withBase(2, 4), trackingSync: ts }, {}))
    .replace(/"tab-[0-9a-f-]+"/g, '"tab"').replace(/"x"/g, '"tab"');
  expect(shape(got)).toBe(shape(s2));
  expect(got.marks['d:1'][0].value).toBe(0);                  // the unpick is recorded
});

test('a write from another page in between is kept', async () => {
  await ProjectStorage.save(based());
  const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1), baseWriteAt: b, tabId: 'tab-1' });
  await OtherPage.saveProgress('proj_s', { done: withBase(1, 5), baseWriteAt: b, tabId: 'tab-2' });
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1, 5, 6), baseWriteAt: b, tabId: 'tab-1' });
  const rec = await stored();
  expect(keys(rec)).toEqual(['d:1', 'd:5', 'd:6']);
  expect(rec.trackingSyncDelta.marks['d:5'][0].value).toBe(1);   // the other page's mark is kept
  expect((await ProjectStorage.get('proj_s')).trackingSync.marks['d:6'][0].value).toBe(1);
});

test('after a full save the next record is a delta over the new base', async () => {
  await ProjectStorage.save(based());
  let b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1), baseWriteAt: b, tabId: 'tab-1' });
  await ProjectStorage.save(Object.assign(await ProjectStorage.get('proj_s'), { done: Array.from(withBase(1, 2)) }));
  b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1, 2, 3), baseWriteAt: b, tabId: 'tab-1' });
  expect(keys(await stored())).toEqual(['d:3']);
  const p = await ProjectStorage.get('proj_s');
  expect(p.done.slice(0, 5)).toEqual([0, 1, 1, 1, 0]);
  expect(p.trackingSync.marks['d:1'][0].value).toBe(1);
});

test('a full record from an older build is cut down to a delta by the next write', async () => {
  await ProjectStorage.save(based());
  const base = await ProjectStorage.get('proj_s'), b = base.lastWriteAt;
  // What an older build stored: every register, under trackingSync.
  const full = realRecord(base, Object.assign({}, base, { done: withBase(1, 2) }), 'tab-old').trackingSync;
  const db = await getDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('pendingImports', 'readwrite');
    tx.objectStore('pendingImports').put({ id: 'progress:proj_s', projectId: 'proj_s', v: 1, done: withBase(1, 2), halfDone: [], knotsDone: [], beadsDone: [], bsDone: [], partialDone: [], specialtyDone: [],
      baseWriteAt: b, tabId: 'tab-old', updatedAt: Date.now() - 1000, trackingSync: full });
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  await ProjectStorage.saveProgress('proj_s', { done: withBase(1, 2, 3), baseWriteAt: b, tabId: 'tab-1' });
  const rec = await stored();
  expect(rec.trackingSync).toBeUndefined();
  expect(keys(rec)).toEqual(['d:1', 'd:2', 'd:3']);
  expect(rec.trackingSyncDelta.marks['d:1'][0].clock['tab-old']).toBe(1);   // the old build's history is kept
});

test('saveProgress says false when nothing reloading would apply was written', async () => {
  // No stored project yet.
  expect(await ProjectStorage.saveProgress('proj_s', { done: marks(1), baseWriteAt: null, tabId: 'tab-1' })).toBe(false);
  // A record based on an older full save: stored, but reloading ignores it.
  await ProjectStorage.save(proj());
  const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  expect(await ProjectStorage.saveProgress('proj_s', { done: marks(1), baseWriteAt: b - 1, tabId: 'tab-1' })).toBe(false);
  // The current base: written and applied.
  expect(await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2), baseWriteAt: b, tabId: 'tab-1' })).toBe(true);
  expect((await ProjectStorage.get('proj_s')).done.slice(0, 3)).toEqual([0, 1, 1]);
});

describe('review of PR 405', () => {
  const Store = require('fake-indexeddb/lib/FDBObjectStore');
  const StoreClass = Store.default || Store;
  const realNow = Date.now;
  const realPut = StoreClass.prototype.put;
  afterEach(() => { Date.now = realNow; StoreClass.prototype.put = realPut; });

  test('a write turned away because a newer record is stored says false', async () => {
    await ProjectStorage.save(proj());
    const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
    const t = realNow();
    Date.now = () => t + 10000;                                     // the newer record
    expect(await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2), baseWriteAt: b, tabId: 'tab-1' })).toBe(true);
    Date.now = () => t;                                             // an older call arriving late
    expect(await ProjectStorage.saveProgress('proj_s', { done: marks(3), baseWriteAt: b, tabId: 'tab-1' })).toBe(false);
    Date.now = realNow;
    expect((await ProjectStorage.get('proj_s')).done.slice(0, 5)).toEqual([0, 1, 1, 0, 0]);
  });

  test('an aborted write leaves nothing for the next one to reuse, even with the same timestamp', async () => {
    await ProjectStorage.save(proj());
    const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
    const t = realNow();
    Date.now = () => t;
    expect(await ProjectStorage.saveProgress('proj_s', { done: marks(1), baseWriteAt: b, tabId: 'tab-1' })).toBe(true);
    // The removal of that mark is put, then its transaction aborts.
    let abortNext = true;
    StoreClass.prototype.put = function () {
      const r = realPut.apply(this, arguments);
      if (abortNext && this.name === 'pendingImports') { abortNext = false; this.transaction.abort(); }
      return r;
    };
    expect(await ProjectStorage.saveProgress('proj_s', { done: marks(), baseWriteAt: b, tabId: 'tab-1' })).toBe(false);
    StoreClass.prototype.put = realPut;
    expect(await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2), baseWriteAt: b, tabId: 'tab-1' })).toBe(true);
    Date.now = realNow;
    const p = await ProjectStorage.get('proj_s');
    expect(p.done.slice(0, 5)).toEqual([0, 1, 1, 0, 0]);
    // The sync metadata must agree with the marks: mark 1 is not recorded as removed.
    expect(TrackingSync.merge(p, {}).done.slice(0, 5)).toEqual([0, 1, 1, 0, 0]);
  });
});
