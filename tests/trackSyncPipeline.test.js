/** @jest-environment jsdom */
const fs = require('fs');
const { IDBFactory } = require('fake-indexeddb');
global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
global.structuredClone = v => require('v8').deserialize(require('v8').serialize(v));
global.pako = require('pako');
global.ensurePersistence = () => {};
eval(fs.readFileSync('./project-storage.js', 'utf8'));
window.ProjectStorage = ProjectStorage;
eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = window.SyncEngine;
const TS = global.TrackingSync;
SE.triggerAutoExport = () => {};
window.openManagerDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('stitch_manager_db');
  req.onupgradeneeded = () => req.result.createObjectStore('manager_state');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const proj = extra => Object.assign({ id: 'proj_sync', name: 'Sync test', settings: { sW: 2, sH: 1 }, pattern: [{ id: '310' }, { id: '550' }], done: [0, 0], halfDone: [], partialDone: [], knotsDone: [], bsDone: [], parkMarkers: [] }, extra);
const marks = { done: [1, 0], halfDone: [[0, { fwd: 1, bck: 1 }]], partialDone: [[0, ['TL']]], knotsDone: ['k0'], bsDone: ['b0'] };
const empty = { done: [0, 0], halfDone: [], partialDone: [], knotsDone: [], bsDone: [] };
const copy = p => JSON.parse(JSON.stringify(p));
async function exported() {
  const obj = await SE.exportSync();
  return SE.decompress(SE.compress(obj));
}
function file(p) {
  return { _format: SE.SYNC_FORMAT, _version: SE.SYNC_VERSION, _deviceId: 'peer', projects: [{ id: p.id, updatedAt: p.updatedAt, fingerprint: SE.computeFingerprint(p), data: p }] };
}
async function imported(obj) {
  const plan = await SE.prepareImport(obj);
  await SE.executeImport(plan);
  return { plan, saved: await ProjectStorage.get('proj_sync') };
}
beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  ProjectStorage._deletedIds.clear(); localStorage.clear();
});

test('actual export/classify/import/persist/reload pipeline preserves independent additions and unpicks', async () => {
  const seed = proj(Object.assign({ notes: 'keep me', customField: { preserved: true } }, marks));
  await ProjectStorage.save(seed);
  const base = copy(await ProjectStorage.get(seed.id));
  await ProjectStorage.save(proj(Object.assign({ notes: 'keep me', customField: { preserved: true } }, empty)));
  const a = await exported();
  const b = TS.record(base, Object.assign(copy(base), {
    done: [1, 1], halfDone: [[0, { fwd: 1, bck: 1 }], [1, { bck: 1 }]], partialDone: [[0, ['TL']], [1, ['BR']]], knotsDone: ['k0', 'k1'], bsDone: ['b0', 'b1']
  }), 'B');
  b.updatedAt = new Date().toISOString();
  const first = await imported(file(b));
  expect(first.plan.mergeTracking).toHaveLength(1);
  expect(first.saved.done).toEqual([0, 1]);
  expect(first.saved.halfDone).toEqual([[1, { bck: 1 }]]);
  expect(first.saved.partialDone).toEqual([[1, ['BR']]]);
  expect(first.saved.knotsDone).toEqual(['k1']); expect(first.saved.bsDone).toEqual(['b1']);
  expect(first.saved.notes).toBe('keep me'); expect(first.saved.customField).toEqual({ preserved: true });
  const second = await imported(file(b));
  expect(TS.merge(second.saved, proj())).toEqual(TS.merge(first.saved, proj()));
  // Simulate the other device's persisted copy, importing A's actual exported file.
  await ProjectStorage.save(copy(b), { preserveUpdatedAt: true });
  const reverse = await imported(a);
  expect(TS.merge(reverse.saved, proj())).toEqual(TS.merge(first.saved, proj()));
  // Export merged state, clear storage and import as a new project: reload sees the same marks and removals.
  const roundtrip = await exported();
  await ProjectStorage.clearAllProjects(); ProjectStorage._deletedIds.clear(); localStorage.clear();
  const reloaded = await imported(roundtrip);
  expect(TS.merge(reloaded.saved, proj())).toEqual(TS.merge(first.saved, proj()));
  const review = SE.analyseConflicts(first.plan, null);
  expect(review.conflicts.filter(c => c.type === 'stitch')).toEqual([]);
});

test('small progress writes retain removal evidence across exports and the following full save', async () => {
  await ProjectStorage.save(proj());
  const seed = await ProjectStorage.get('proj_sync');
  const data = x => Object.assign({ baseWriteAt: seed.lastWriteAt, tabId: 'tab-A' }, x);
  expect(await ProjectStorage.saveProgress(seed.id, data(marks))).toBe(true);
  const addition = await exported();
  expect(addition.projects[0].data.done).toEqual([1, 0]);
  expect(await ProjectStorage.saveProgress(seed.id, data(empty))).toBe(true);
  const unpick = await exported();
  expect(unpick.projects[0].data.done).toEqual([0, 0]);
  expect(TS.merge(unpick.projects[0].data, addition.projects[0].data).halfDone).toEqual([]);
  await ProjectStorage.save(proj(empty));
  const full = await ProjectStorage.get(seed.id);
  expect(TS.merge(full, addition.projects[0].data).done).toEqual([0, 0]);
  expect(TS.merge(full, addition.projects[0].data).knotsDone).toEqual([]);
});

test('navigation recovery after an exported progress addition preserves the later unpick', async () => {
  await ProjectStorage.save(proj());
  const base = await ProjectStorage.get('proj_sync');
  const data = x => Object.assign({ baseWriteAt: base.lastWriteAt, tabId: 'A' }, x);
  await ProjectStorage.saveProgress(base.id, data(marks));
  const addition = (await exported()).projects[0].data;
  ProjectStorage.saveProgressRecovery(base.id, data(empty));
  const recovered = await ProjectStorage.get(base.id);
  const merged = TS.merge(recovered, addition);
  expect(merged.done).toEqual([0, 0]); expect(merged.halfDone).toEqual([]);
  expect(merged.partialDone).toEqual([]); expect(merged.knotsDone).toEqual([]); expect(merged.bsDone).toEqual([]);
});

test('legacy files load and distinct parking/half marks survive actual repeated imports', async () => {
  await ProjectStorage.save(proj({ halfDone: [[0, { fwd: 1 }]], parkMarkers: [{ x: 0, y: 0, colorId: '310' }] }), { preserveUpdatedAt: true });
  const legacy = proj({ halfDone: [[1, { bck: 1 }]], parkMarkers: [{ x: 1, y: 0, colorId: '550', corner: 'TR' }] });
  await imported(file(legacy));
  const { saved } = await imported(file(legacy));
  expect(saved.halfDone).toEqual([[0, { fwd: 1 }], [1, { bck: 1 }]]);
  expect(saved.parkMarkers).toHaveLength(2);
});

test('structural changes with equal timestamps still require chart review', async () => {
  await ProjectStorage.save(proj());
  const remote = await ProjectStorage.get('proj_sync');
  remote.pattern[0] = { id: '666' };
  const plan = await SE.prepareImport(file(remote));
  expect(plan.conflicts).toHaveLength(1);
  expect(SE._test.isPlanAutoApplicable(plan)).toBe(false);
  expect(SE.analyseConflicts(plan, null).conflicts.some(c => c.type === 'chart')).toBe(true);
});

test('full writes in one millisecond retire the old progress overlay', async () => {
  const now = jest.spyOn(Date, 'now').mockReturnValue(10000);
  try {
    await ProjectStorage.save(proj());
    const base = await ProjectStorage.get('proj_sync');
    await ProjectStorage.saveProgress(base.id, Object.assign({ baseWriteAt: base.lastWriteAt }, marks));
    await ProjectStorage.save(proj(empty));
    const reloaded = await ProjectStorage.get(base.id);
    expect(reloaded.done).toEqual([0, 0]);
    expect(reloaded.lastWriteAt).toBeGreaterThan(base.lastWriteAt);
  } finally { now.mockRestore(); }
});

test.each(['halfStitches', 'partialStitches'])('%s structure differs: review even with a stale advertised fingerprint', async field => {
  const side = field === 'halfStitches' ? 'fwd' : 'TL';
  const local = proj({ [field]: [[0, { [side]: { id: '310' } }]] });
  await ProjectStorage.save(local);
  const remote = await ProjectStorage.get(local.id);
  const sync = file(remote);
  remote[field] = [[0, { [side]: { id: '550' } }]];
  const plan = await SE.prepareImport(sync);
  expect(plan.conflicts).toHaveLength(1);
  expect(SE._test.isPlanAutoApplicable(plan)).toBe(false);
});

test('an older progress writer omitting completion types preserves prior additions and removals', async () => {
  await ProjectStorage.save(proj(marks));
  const base = await ProjectStorage.get('proj_sync');
  const data = x => Object.assign({ baseWriteAt: base.lastWriteAt }, x);
  await ProjectStorage.saveProgress(base.id, data({ done: [1, 1] }));
  let loaded = await ProjectStorage.get(base.id);
  expect(loaded.halfDone).toEqual(marks.halfDone);
  expect(loaded.knotsDone).toEqual(['k0']); expect(loaded.bsDone).toEqual(['b0']);
  await ProjectStorage.saveProgress(base.id, data(empty));
  await ProjectStorage.saveProgress(base.id, data({ done: [0, 1] }));
  loaded = await ProjectStorage.get(base.id);
  expect(loaded.halfDone || []).toEqual([]); expect(loaded.knotsDone || []).toEqual([]);
  expect(TS.merge(loaded, proj(marks)).halfDone).toEqual([]);
});
