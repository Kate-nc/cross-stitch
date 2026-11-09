/**
 * @jest-environment jsdom
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

test('an unchanged chart is not rewritten: marks and a rename land in small rows and read back', async () => {
  const loaded = await opened();
  const before = await raw('projects', 'proj_o');
  const n = spyProjects();
  try {
    const done = loaded.done.slice(); done[2] = 1; done[5] = 1;
    await ProjectStorage.save(snapshot(loaded, { done, name: 'Renamed', notes: 'second' }), OVERLAY);
    expect(n.puts).toBe(0);
  } finally { n.restore(); }
  const stored = await raw('projects', 'proj_o');
  expect(stored.lastWriteAt).toBe(before.lastWriteAt);      // the full record is as it was
  expect(stored.name).toBe('O');
  const ov = await raw('pendingImports', 'overlay:proj_o');
  expect(ov.baseWriteAt).toBe(before.lastWriteAt);
  expect(ov.fields.pattern).toBeUndefined();               // never the chart
  expect(ov.fields.done).toBeUndefined();                  // nor the marks (progress record)
  const p = await ProjectStorage.get('proj_o');
  expect(p.name).toBe('Renamed');
  expect(p.notes).toBe('second');
  expect(p.done.filter(Boolean)).toHaveLength(2);
  expect(p.pattern).toHaveLength(N);
  expect(p.lastWriteAt).toBeGreaterThan(before.lastWriteAt); // its own write stamp, for conflicts
  expect(p.lastWriteTabId).toBe('tab-A');
  // Summaries follow the save.
  const meta = (await ProjectStorage.listProjects()).find(m => m.id === 'proj_o');
  expect(meta.name).toBe('Renamed');
  expect(meta.completedStitches).toBe(2);
  expect(meta.lastWriteAt).toBe(p.lastWriteAt);
  expect(meta.baseWriteAt).toBe(before.lastWriteAt);
});

test('after the first overlay save, later ones read nothing of the chart', async () => {
  const loaded = await opened();
  let s = snapshot(loaded);
  s.done = s.done.slice(); s.done[0] = 1;
  await ProjectStorage.save(s, OVERLAY);
  const n = spyProjects();
  try {
    for (let i = 1; i < 4; i++) {
      s = Object.assign({}, s, { done: s.done.slice(), navigationAt: Date.now() }); s.done[i] = 1;
      await ProjectStorage.save(s, OVERLAY);
    }
    expect(n.gets).toBe(0);
    expect(n.puts).toBe(0);
  } finally { n.restore(); }
  expect((await ProjectStorage.get('proj_o')).done.slice(0, 5)).toEqual([1, 1, 1, 1, 0]);
});

test('reads back the same marks, sync registers and values as a full save of the same snapshot', async () => {
  const edits = (loaded) => {
    const done = loaded.done.slice(); done[1] = 1; done[7] = 1;
    return { done, halfDone: [[3, { fwd: 1 }]], knotsDone: ['1,1'], name: 'Same', statsSessions: [{ id: 's1', date: '2026-11-01', durationSeconds: 60, netStitches: 2 }] };
  };
  const a = await opened({ id: 'proj_a' });
  await tick();
  await ProjectStorage.save(snapshot(a, edits(a)), OVERLAY);
  const b = await opened({ id: 'proj_b' });
  await tick();
  await ProjectStorage.save(snapshot(b, edits(b)));         // full save
  const ra = await ProjectStorage.get('proj_a'), rb = await ProjectStorage.get('proj_b');
  expect(marksOf(ra)).toEqual(marksOf(rb));
  expect(TrackingSync.mergeValues(ra, {}).values).toEqual(TrackingSync.mergeValues(rb, {}).values);
  expect(ra.statsSessions).toEqual(rb.statsSessions);
  // Unmarking (undo) records a removal register that wins over the earlier mark.
  const ua = Object.assign({}, ra, { done: ra.done.slice(), pattern: pattern(), navigationAt: Date.now() }); ua.done[7] = 0;
  const ub = Object.assign({}, rb, { done: rb.done.slice(), pattern: pattern(), navigationAt: Date.now() }); ub.done[7] = 0;
  await tick();
  await ProjectStorage.save(ua, OVERLAY);
  await ProjectStorage.save(ub);
  const ra2 = await ProjectStorage.get('proj_a'), rb2 = await ProjectStorage.get('proj_b');
  expect(ra2.done[7]).toBe(0);
  expect(marksOf(ra2)).toEqual(marksOf(rb2));
  expect(ra2.trackingSync.marks['d:7'][0].value).toBe(0);
});

test('a changed chart is written in full, and retires the overlay', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'Overlay' }), OVERLAY);
  expect(await raw('pendingImports', 'overlay:proj_o')).toBeTruthy();
  const changed = pattern(); changed[0] = { id: '666', type: 'solid' };
  const n = spyProjects();
  try {
    await ProjectStorage.save(snapshot(loaded, { pattern: changed, name: 'Edited' }), OVERLAY);
    expect(n.puts).toBe(1);
  } finally { n.restore(); }
  expect(await raw('pendingImports', 'overlay:proj_o')).toBeUndefined();
  const p = await ProjectStorage.get('proj_o');
  expect(p.pattern[0].id).toBe('666');
  expect(p.name).toBe('Edited');
});

test('any other full write (a sync import, a restore, the Creator) supersedes the overlay', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'From the Tracker' }), OVERLAY);
  await tick();
  // A sync import writes the whole record with its own updatedAt.
  await ProjectStorage.save(proj({ name: 'From another device', updatedAt: '2026-11-01T00:00:00.000Z' }), { preserveUpdatedAt: true });
  const p = await ProjectStorage.get('proj_o');
  expect(p.name).toBe('From another device');
});

test('a chart race is refused and writes nothing', async () => {
  const loaded = await opened({ chartRevision: 'r1' });
  await expect(ProjectStorage.save(snapshot(loaded, { chartRevision: 'r2', name: 'Stale' }), OVERLAY)).rejects.toThrow(/chart was updated/);
  expect(await raw('pendingImports', 'overlay:proj_o')).toBeUndefined();
  expect((await ProjectStorage.get('proj_o')).name).toBe('O');
});

test('a progress write named against the overlay stamp (what the Tracker last saw) still applies', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'X' }), OVERLAY);
  const stamp = seen.get('proj_o').lastWriteAt;               // noted by the save
  expect(stamp).toBe((await ProjectStorage.get('proj_o')).lastWriteAt);
  const done = new Uint8Array(N); done[9] = 1;
  expect(await ProjectStorage.saveProgress('proj_o', { done, baseWriteAt: stamp, tabId: 'tab-A' })).toBe(true);
  const p = await ProjectStorage.get('proj_o');
  expect(p.done[9]).toBe(1);
  expect(p.name).toBe('X');                                   // the overlay still stands
  expect(ProjectStorage.loadedWithProgress(p)).toBe(true);    // marks newer than the overlay's save
});

test('marks this tab wrote after the snapshot are kept; marks captured before it are turned away', async () => {
  const loaded = await opened();
  const base = seen.get('proj_o').lastWriteAt;
  const oldSnap = snapshot(loaded, { navigationAt: Date.now() - 1000, name: 'Older snapshot' });
  // A mark made while the save waited: written to the progress record first.
  const newer = new Uint8Array(N); newer[4] = 1;
  await ProjectStorage.saveProgress('proj_o', { done: newer, baseWriteAt: base, tabId: 'tab-A' });
  await ProjectStorage.save(oldSnap, OVERLAY);
  let p = await ProjectStorage.get('proj_o');
  expect(p.done[4]).toBe(1);                                  // not lost to the older snapshot
  expect(p.name).toBe('Older snapshot');
  // Another tab's progress record does not outrank this tab's save.
  const other = new Uint8Array(N); other[11] = 1;
  await ProjectStorage.saveProgress('proj_o', { done: other, baseWriteAt: seen.get('proj_o').lastWriteAt, tabId: 'tab-B' });
  await ProjectStorage.save(snapshot(p, { navigationAt: Date.now() - 1000 }), OVERLAY);
  p = await ProjectStorage.get('proj_o');
  expect(p.done[11]).toBe(0);
  expect(p.done[4]).toBe(1);
});

test('another tab\'s overlay save is a cross-tab conflict for saveChecked, read from metadata alone', async () => {
  const loaded = await opened();
  const mySeen = seen.get('proj_o');
  tabId = 'tab-B';
  await ProjectStorage.save(snapshot(loaded, { name: 'B' }), OVERLAY);
  tabId = 'tab-A';
  seen.set('proj_o', mySeen);                                 // tab A has not seen B's write
  const n = spyProjects();
  let res;
  try { res = await ProjectStorage.saveChecked(snapshot(loaded, { name: 'A' }), OVERLAY); }
  finally { n.restore(); }
  expect(res.ok).toBe(false);
  expect(res.reason).toBe('conflict');
  expect(res.remoteWriteTabId).toBe('tab-B');
  expect(n.gets).toBe(0);                                     // stamps from the metadata row
  expect((await ProjectStorage.get('proj_o')).name).toBe('B');
});

test('a navigation journal after an overlay save is recovered on top of it', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'Kept' }), OVERLAY);
  const stamp = seen.get('proj_o').lastWriteAt;
  const done = new Array(N).fill(0); done[6] = 1; done[8] = 1;
  ProjectStorage.saveProgressRecovery('proj_o', { done, baseWriteAt: stamp });
  const p = await ProjectStorage.get('proj_o');
  expect(p.done[6]).toBe(1);
  expect(p.done[8]).toBe(1);
  expect(p.name).toBe('Kept');
  // Materialised once: the full record now holds the overlay's fields too.
  expect((await raw('projects', 'proj_o')).name).toBe('Kept');
  expect((await ProjectStorage.get('proj_o')).name).toBe('Kept');
});

test('backups hold whole, current records (an older build can restore them)', async () => {
  const loaded = await opened();
  const done = loaded.done.slice(); done[3] = 1;
  await ProjectStorage.save(snapshot(loaded, { done, name: 'Backed up' }), OVERLAY);
  const rec = await raw('pendingImports', 'progress:proj_o');
  const ov = await raw('pendingImports', 'overlay:proj_o');
  const stored = await raw('projects', 'proj_o');
  const rows = ProjectStorage.backupProgressRows(stored, rec, null, ov);
  const live = await ProjectStorage.get('proj_o');
  expect(rows.project.name).toBe('Backed up');
  expect(rows.project.done[3]).toBe(1);
  expect(rows.project.pattern).toHaveLength(N);
  expect(rows.project.lastWriteAt).toBe(live.lastWriteAt);
  expect(rows.meta.name).toBe('Backed up');
  expect(marksOf(rows.project)).toEqual(marksOf(live));
  // Restored as a plain record (no overlay row), it reads back the same.
  await ProjectStorage.clearAllProgress();
  const db = await getDB();
  await new Promise((res, rej) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(rows.project, 'proj_o'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  const restored = await ProjectStorage.get('proj_o');
  expect(restored.name).toBe('Backed up');
  expect(restored.done[3]).toBe(1);
});

test('an older build, which applies only the progress record, still sees the marks', async () => {
  const loaded = await opened();
  const done = loaded.done.slice(); done[10] = 1;
  await ProjectStorage.save(snapshot(loaded, { done }), OVERLAY);
  const rec = await raw('pendingImports', 'progress:proj_o');
  const stored = await raw('projects', 'proj_o');
  expect(rec.v).toBe(1);
  expect(rec.baseWriteAt).toBe(stored.lastWriteAt);           // the rule older builds check
  expect(rec.done[10]).toBe(1);
});

test('sync status, summaries, material planning and chart updates see the overlay', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'Seen everywhere' }), OVERLAY);
  await ProjectStorage.markSynced(['proj_o'], '2026-11-09T10:00:00.000Z');
  const p = await ProjectStorage.get('proj_o');
  expect(p.syncMeta.lastSyncedAt).toBe('2026-11-09T10:00:00.000Z');
  expect(p.name).toBe('Seen everywhere');
  const [mat] = await ProjectStorage.listMaterialProjects(['proj_o']);
  expect(mat.name).toBe('Seen everywhere');
  const review = await ProjectStorage.prepareChartUpdate('proj_o');
  expect(review.project.name).toBe('Seen everywhere');
  const summaries = await ProjectStorage.buildAllStatsSummaries();
  expect(summaries.find(s => s.id === 'proj_o').name).toBe('Seen everywhere');
});

test('deleting the project or clearing progress removes the overlay', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'Gone' }), OVERLAY);
  await ProjectStorage.clearAllProgress();
  expect(await raw('pendingImports', 'overlay:proj_o')).toBeUndefined();
  const again = await opened({ id: 'proj_d' });
  await ProjectStorage.save(snapshot(again, { name: 'Gone too' }), OVERLAY);
  await ProjectStorage.delete('proj_d');
  expect(await raw('pendingImports', 'overlay:proj_d')).toBeUndefined();
});

test('without the option, or for sync writes, the whole record is written as before', async () => {
  const loaded = await opened();
  const n = spyProjects();
  try {
    await ProjectStorage.save(snapshot(loaded, { name: 'Full' }));
    await ProjectStorage.save(snapshot(loaded, { name: 'Sync', updatedAt: new Date().toISOString() }), { overlay: true, preserveUpdatedAt: true });
    expect(n.puts).toBe(2);
  } finally { n.restore(); }
  expect(await raw('pendingImports', 'overlay:proj_o')).toBeUndefined();
});

test('library thread demand is counted once per chart', async () => {
  window.StashBridge = global.StashBridge = { syncProjectToLibrary: jest.fn().mockResolvedValue() };
  try {
    const loaded = await opened();
    const s = snapshot(loaded);
    await ProjectStorage.save(s, OVERLAY);
    await ProjectStorage.save(Object.assign({}, s, { name: 'Again' }), OVERLAY);
    await ProjectStorage.save(Object.assign({}, s, { name: 'And again', done: s.done.map(() => 1) }), OVERLAY);
    await tick();
    const calls = StashBridge.syncProjectToLibrary.mock.calls;
    expect(calls.length).toBe(4);                             // the opening full save, then three
    // Same chart (the Tracker's one pattern array): the very same rows, not recounted,
    // whatever the marks.
    expect(calls[2][2]).toBe(calls[1][2]);
    expect(calls[3][2]).toBe(calls[1][2]);
    expect(calls[1][2]).toEqual(calls[0][2]);
    expect(calls[1][2].length).toBeGreaterThan(0);
    // A different stitch list is a different chart.
    await ProjectStorage.save(Object.assign({}, s, { knots: [{ x: 1, y: 1, id: '310' }] }), OVERLAY);
    await tick();
    expect(StashBridge.syncProjectToLibrary.mock.calls[4][2]).not.toBe(calls[1][2]);
  } finally { delete window.StashBridge; delete global.StashBridge; }
});

test('a full record written by a build that does not know overlays retires the overlay by its stamp', async () => {
  const loaded = await opened();
  await ProjectStorage.save(snapshot(loaded, { name: 'Overlay name' }), OVERLAY);
  // An older build saves the whole project: a new lastWriteAt, the overlay row left in place.
  const stored = await raw('projects', 'proj_o');
  const db = await getDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(Object.assign({}, stored, { name: 'Older build', lastWriteAt: Date.now() + 1000 }), 'proj_o');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  expect(await raw('pendingImports', 'overlay:proj_o')).toBeTruthy();
  const p = await ProjectStorage.get('proj_o');
  expect(p.name).toBe('Older build');
  // Its backup and summaries agree.
  const rows = ProjectStorage.backupProgressRows(await raw('projects', 'proj_o'), await raw('pendingImports', 'progress:proj_o'), null, await raw('pendingImports', 'overlay:proj_o'));
  expect(rows === null || rows.project.name === 'Older build').toBe(true);
});

