/**
 * @jest-environment jsdom
 *
 * Tap-lag audit, fix #7: ProjectStorage.saveProgress lets TrackingSync.record reuse
 * the registers of this page's previous progress write, instead of re-reading one
 * per finished stitch, but only when the record it reads back is provably that
 * write (same tab, time and base) and is what the write is based on. Another
 * page's write, or a full save in between, must read the stored copy.
 * tests/trackingSyncEquivalence.test.js holds the reused path to the same bytes.
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

test('the second write from this page reuses the first; the result is what reading would give', async () => {
  await ProjectStorage.save(proj());
  const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  calls = [];
  await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2), baseWriteAt: b, tabId: 'tab-1' });
  await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2, 3), baseWriteAt: b, tabId: 'tab-1' });
  expect(calls.map(c => !!c.from)).toEqual([false, true]);
  // The reused result equals reading the stored copy of the first write.
  const second = calls[1];
  const reread = realRecord(second.base, Object.assign({}, second.base, { done: marks(1, 2, 3) }), 'tab-x');
  const got = (await stored()).trackingSync.marks;
  expect(Object.keys(got)).toEqual(Object.keys(reread.trackingSync.marks));
  expect(got['d:1']).toEqual(reread.trackingSync.marks['d:1']);
  expect(got['d:3'][0].value).toBe(1);
  expect((await ProjectStorage.get('proj_s')).done.slice(0, 5)).toEqual([0, 1, 1, 1, 0]);
});

test('a write from another page in between makes the next one read the stored copy', async () => {
  await ProjectStorage.save(proj());
  const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: marks(1), baseWriteAt: b, tabId: 'tab-1' });
  await OtherPage.saveProgress('proj_s', { done: marks(1, 5), baseWriteAt: b, tabId: 'tab-2' });
  calls = [];
  await ProjectStorage.saveProgress('proj_s', { done: marks(1, 5, 6), baseWriteAt: b, tabId: 'tab-1' });
  expect(calls.map(c => !!c.from)).toEqual([false]);
  const rec = await stored();
  expect(rec.trackingSync.marks['d:5'][0].value).toBe(1);   // the other page's mark is kept
  expect(rec.trackingSync.marks['d:6'][0].value).toBe(1);
});

test('a full save in between (a new base) reads the stored copy', async () => {
  await ProjectStorage.save(proj());
  let b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: marks(1), baseWriteAt: b, tabId: 'tab-1' });
  await ProjectStorage.save(proj({ done: Array.from(marks(1, 2)) }));
  b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  calls = [];
  await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2, 3), baseWriteAt: b, tabId: 'tab-1' });
  expect(calls.map(c => !!c.from)).toEqual([false]);
});

test('without a tab id nothing is reused', async () => {
  await ProjectStorage.save(proj());
  const b = (await ProjectStorage.get('proj_s')).lastWriteAt;
  await ProjectStorage.saveProgress('proj_s', { done: marks(1), baseWriteAt: b });
  calls = [];
  await ProjectStorage.saveProgress('proj_s', { done: marks(1, 2), baseWriteAt: b });
  expect(calls.map(c => !!c.from)).toEqual([false]);
});
