// Tests for sync fix #8 — deletion records.
//
// Tombstones were bare id strings, so a deletion was permanent and
// unconditional: classifyProjects skipped that id on every future import from
// every device, forever, with nothing anywhere explaining why. A user who
// deleted a pattern on one device months ago silently never received the
// peer's ongoing work on it. Field data showed exactly this — 4 tombstones
// from April/May blocking 2 of the peer's 17 live patterns.

const fs = require('fs');
const pako = require('pako');

global.window = global.window || {};
global.localStorage = (() => {
  const store = {};
  return {
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
})();
global.pako = pako;
global.indexedDB = undefined;
global.ProjectStorage = { listProjects: async () => [], get: async () => null, save: async p => p.id };

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

const KEY = 'cs_deleted_project_ids';

const _origWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    if (String(arguments[0] || '').indexOf('SyncEngine:') === 0) return;
    _origWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = _origWarn; });

function mkProject(id, updatedAt) {
  const pattern = [];
  for (let i = 0; i < 100; i++) pattern.push({ id: String(310 + (i % 3)) });
  return { id, name: id, updatedAt, settings: { sW: 10, sH: 10 }, pattern, done: new Array(100).fill(0) };
}
const remoteEntry = (id, updatedAt) => ({
  id, updatedAt, fingerprint: SE.computeFingerprint(mkProject(id, updatedAt)), data: mkProject(id, updatedAt)
});

beforeEach(() => localStorage.clear());

describe('fix #8 — record format', () => {
  test('legacy bare-string entries are normalised with a null deletedAt', () => {
    // The exact shape read off the affected device.
    localStorage.setItem(KEY, JSON.stringify([
      'proj_1775374136858', 'proj_1777122095759_is4gi',
      'proj_1779108218098_2xouy', 'proj_1779815746050_pjg94'
    ]));
    const records = SE.getTombstones();
    expect(records.length).toBe(4);
    expect(records[0]).toEqual({ id: 'proj_1775374136858', deletedAt: null });
    // The id-only view still works for the wire format.
    expect(SE.getTombstones().map(r => r.id)).toContain('proj_1779815746050_pjg94');
  });

  test('mixed legacy and timestamped entries both read back', () => {
    localStorage.setItem(KEY, JSON.stringify([
      'proj_old',
      { id: 'proj_new', deletedAt: '2026-08-01T00:00:00.000Z' }
    ]));
    expect(SE.getTombstones()).toEqual([
      { id: 'proj_old', deletedAt: null },
      { id: 'proj_new', deletedAt: '2026-08-01T00:00:00.000Z' }
    ]);
  });

  test('corrupt entries are ignored', () => {
    localStorage.setItem(KEY, JSON.stringify(['ok', null, 42, {}, { id: 'fine' }]));
    expect(SE.getTombstones().map(r => r.id)).toEqual(['ok', 'fine']);
  });
});

describe('fix #8 — a deletion no longer outranks later peer work', () => {
  test('a pattern edited AFTER our deletion comes back', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'proj_x', deletedAt: '2026-05-18T12:43:38.098Z' }
    ]));
    const classified = SE.classifyProjects([remoteEntry('proj_x', '2026-08-23T14:12:36.486Z')], {});
    expect(classified.length).toBe(1);
    expect(classified[0].classification).toBe('new-remote');
    expect(classified[0].releasedTombstone).toBe(true);
    expect(classified.skippedTombstoned).toEqual([]);
  });

  test('a pattern untouched since our deletion stays blocked', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'proj_x', deletedAt: '2026-08-23T00:00:00.000Z' }
    ]));
    const classified = SE.classifyProjects([remoteEntry('proj_x', '2026-05-01T00:00:00.000Z')], {});
    expect(classified.length).toBe(0);
    expect(classified.skippedTombstoned.length).toBe(1);
    expect(classified.skippedTombstoned[0].reason).toBe('deleted-after-remote-edit');
  });

  test('legacy tombstones stay conservative — still blocked, but now explained', () => {
    // We can't know when these were deleted, so silently resurrecting
    // months-old deletions would be the worse surprise.
    localStorage.setItem(KEY, JSON.stringify(['proj_x']));
    const classified = SE.classifyProjects([remoteEntry('proj_x', '2026-08-23T14:12:36.486Z')], {});
    expect(classified.length).toBe(0);
    expect(classified.skippedTombstoned[0].reason).toBe('legacy-tombstone');
    expect(classified.skippedTombstoned[0].remoteUpdatedAt).toBe('2026-08-23T14:12:36.486Z');
  });

  test('untombstoned projects are unaffected', () => {
    localStorage.setItem(KEY, JSON.stringify([{ id: 'proj_other', deletedAt: '2026-08-23T00:00:00.000Z' }]));
    const classified = SE.classifyProjects([remoteEntry('proj_x', '2026-05-01T00:00:00.000Z')], {});
    expect(classified.length).toBe(1);
    expect(classified.skippedTombstoned).toEqual([]);
  });
});

describe('fix #8 — releasing a tombstone', () => {
  test('forgetTombstone unblocks exactly one id', () => {
    localStorage.setItem(KEY, JSON.stringify(['proj_a', 'proj_b']));
    expect(SE.forgetTombstone('proj_a')).toBe(true);
    expect(SE.getTombstones().map(r => r.id)).toEqual(['proj_b']);

    const classified = SE.classifyProjects(
      [remoteEntry('proj_a', '2026-08-01T00:00:00.000Z'), remoteEntry('proj_b', '2026-08-01T00:00:00.000Z')], {});
    expect(classified.map(c => c.id)).toEqual(['proj_a']);
  });

  test('forgetTombstone reports false for an unknown id', () => {
    localStorage.setItem(KEY, JSON.stringify(['proj_a']));
    expect(SE.forgetTombstone('proj_zzz')).toBe(false);
    expect(SE.getTombstones().length).toBe(1);
  });

  test('clearTombstones removes them all and reports the count', () => {
    localStorage.setItem(KEY, JSON.stringify(['proj_a', 'proj_b', 'proj_c']));
    expect(SE.clearTombstones()).toBe(3);
    expect(SE.getTombstones()).toEqual([]);
  });

  test('releases are recorded in the activity log', () => {
    localStorage.setItem(KEY, JSON.stringify(['proj_a']));
    SE.forgetTombstone('proj_a');
    expect(SE.getEventLog().some(e => e.type === 'tombstone-released')).toBe(true);
  });
});

describe('fix #8 — deletion times survive the wire', () => {
  test('exportSync emits both the legacy id list and timestamped records', async () => {
    localStorage.setItem(KEY, JSON.stringify([
      'proj_legacy', { id: 'proj_new', deletedAt: '2026-08-01T00:00:00.000Z' }
    ]));
    const syncObj = await SE.exportSync();
    // Legacy consumers keep working.
    expect(syncObj.deletedProjectIds).toEqual(['proj_legacy', 'proj_new']);
    // New consumers get the timestamp.
    expect(syncObj.deletedProjects).toEqual([
      { id: 'proj_legacy', deletedAt: null },
      { id: 'proj_new', deletedAt: '2026-08-01T00:00:00.000Z' }
    ]);
  });

  test('absorbing a peer\'s timestamped tombstones preserves deletedAt', async () => {
    await SE.executeImport({
      newRemote: [], mergeTracking: [], conflicts: [],
      remoteTombstones: ['proj_p'],
      remoteTombstoneRecords: [{ id: 'proj_p', deletedAt: '2026-08-10T00:00:00.000Z' }],
      syncObj: { _deviceId: 'dev_A' }
    });
    expect(SE.getTombstones()).toEqual([{ id: 'proj_p', deletedAt: '2026-08-10T00:00:00.000Z' }]);
  });

  test('an older peer sending only ids degrades to a legacy tombstone', async () => {
    await SE.executeImport({
      newRemote: [], mergeTracking: [], conflicts: [],
      remoteTombstones: ['proj_p'],
      syncObj: { _deviceId: 'dev_A' }
    });
    expect(SE.getTombstones()).toEqual([{ id: 'proj_p', deletedAt: null }]);
  });
});

describe('fix #8 — declined imports are visible', () => {
  test('executeImport logs why patterns were skipped', async () => {
    localStorage.setItem(KEY, JSON.stringify(['proj_x', 'proj_y']));
    await SE.executeImport({
      newRemote: [], mergeTracking: [], conflicts: [],
      skippedTombstoned: [
        { id: 'proj_x', reason: 'legacy-tombstone' },
        { id: 'proj_y', reason: 'legacy-tombstone' }
      ],
      syncObj: { _deviceId: 'dev_A', _deviceName: 'Sziedem' }
    });
    const entry = SE.getEventLog().find(e => e.type === 'tombstone-skipped');
    expect(entry).toBeTruthy();
    expect(entry.projectCount).toBe(2);
    expect(entry.message).toContain('forgetTombstone');
  });

  test('a resurrected project has its tombstone released on import', async () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'proj_x', deletedAt: '2026-05-01T00:00:00.000Z' }
    ]));
    await SE.executeImport({
      newRemote: [{ id: 'proj_x', releasedTombstone: true, remote: { data: mkProject('proj_x', '2026-08-01T00:00:00.000Z') } }],
      mergeTracking: [], conflicts: [],
      syncObj: { _deviceId: 'dev_A' }
    });
    expect(SE.getTombstones()).toEqual([]);
  });
});
