// Regression tests for sync fix #1 — imported projects must keep the
// authoring device's `updatedAt`.
//
// The bug: ProjectStorage.save() restamped `updatedAt` on every write. Because
// executeImport saves newRemote entries sequentially in newest-first order and
// listProjects() sorts newest-first again, the receiving device's library came
// out in exactly reverse order — the oldest patterns surfaced at the top and
// recent work sank to the bottom. It also made the `identical` classification
// unreachable, pinning every shared project in permanent merge-tracking.

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

// Stand-in for ProjectStorage that mirrors the two behaviours under test:
// save() restamps unless told otherwise (project-storage.js) and
// listProjects() sorts by updatedAt DESC.
let _clock;
const _db = new Map();
global.ProjectStorage = {
  listProjects: async () => [..._db.values()]
    .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
  get: async (id) => _db.get(id) || null,
  save: async (p, options) => {
    const opts = options || {};
    if (!(opts.preserveUpdatedAt && p.updatedAt)) {
      p.updatedAt = new Date((_clock += 37)).toISOString();
    }
    _db.set(p.id, p);
    return p.id;
  },
  markSynced: async () => {},
  delete: async (id) => { _db.delete(id); }
};

const code = fs.readFileSync('./sync-engine.js', 'utf8');
eval(code);
const SE = global.SyncEngine || global.window.SyncEngine;

// Suppress the expected "SyncEngine:" warnings from the IndexedDB-unavailable
// fallback paths (no IDB in Node), matching tests/sync-engine.test.js.
const _origWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    if (String(arguments[0] || '').indexOf('SyncEngine:') === 0) return;
    _origWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = _origWarn; });

function mkProject(id, name, updatedAt) {
  const pattern = [];
  for (let i = 0; i < 16; i++) pattern.push({ id: String(310 + (i % 3)) });
  return {
    id, name, updatedAt,
    settings: { sW: 4, sH: 4 }, w: 4, h: 4,
    pattern, done: new Array(16).fill(0)
  };
}

// Device A's library as exportSync would serialise it: newest first.
const LIBRARY = [
  ['proj_a', 'Books and Blossoms', '2026-08-23T14:12:36.486Z'],
  ['proj_b', 'Dulcianna',          '2026-08-23T13:06:56.327Z'],
  ['proj_c', 'peacock',            '2026-07-22T17:11:04.017Z'],
  ['proj_d', 'Peacock',            '2026-06-17T15:33:45.579Z'],
  ['proj_e', 'Corgi',              '2026-05-28T10:00:00.000Z'],
  ['proj_f', 'Cerbii',             '2026-05-24T10:00:00.000Z']
];

function freshPlan() {
  return {
    newRemote: LIBRARY.map(([id, name, at]) => ({ id, remote: { data: mkProject(id, name, at) } })),
    mergeTracking: [],
    conflicts: [],
    syncObj: { _deviceId: 'dev_A', _deviceName: 'Sziedem' }
  };
}

beforeEach(() => {
  _db.clear();
  _clock = Date.parse('2026-08-23T14:29:33.900Z');
  localStorage.clear();
});

describe('sync fix #1 — imported projects keep the authoring device edit time', () => {
  test('executeImport preserves each project\'s original updatedAt', async () => {
    await SE.executeImport(freshPlan());
    for (const [id, , originalAt] of LIBRARY) {
      expect(_db.get(id).updatedAt).toBe(originalAt);
    }
  });

  test('library order on the receiving device matches the sending device', async () => {
    await SE.executeImport(freshPlan());
    const onB = await ProjectStorage.listProjects();
    expect(onB.map(p => p.name)).toEqual(LIBRARY.map(([, name]) => name));
  });

  test('the newest pattern stays at the top, not the bottom (inversion regression)', async () => {
    await SE.executeImport(freshPlan());
    const onB = await ProjectStorage.listProjects();
    expect(onB[0].name).toBe('Books and Blossoms');
    expect(onB[onB.length - 1].name).toBe('Cerbii');
  });

  test('real edit dates survive — not collapsed into one import-moment band', async () => {
    await SE.executeImport(freshPlan());
    const onB = await ProjectStorage.listProjects();
    const spanMs = new Date(onB[0].updatedAt) - new Date(onB[onB.length - 1].updatedAt);
    // Genuine span across the library is ~91 days; the bug collapsed it to <1s.
    expect(spanMs).toBeGreaterThan(60 * 24 * 60 * 60 * 1000);
  });

  test('a merged project keeps the later of the two updatedAt values', async () => {
    const local = mkProject('proj_m', 'Shared', '2026-07-01T09:00:00.000Z');
    local.done[0] = 1;
    _db.set('proj_m', local);

    const remote = mkProject('proj_m', 'Shared', '2026-08-23T10:00:00.000Z');
    remote.done[1] = 1;

    await SE.executeImport({
      newRemote: [],
      mergeTracking: [{ id: 'proj_m', local, remote: { data: remote } }],
      conflicts: [],
      syncObj: { _deviceId: 'dev_A' }
    });

    const saved = _db.get('proj_m');
    expect(saved.updatedAt).toBe('2026-08-23T10:00:00.000Z');
    // and the union merge still happened
    expect(saved.done[0]).toBe(1);
    expect(saved.done[1]).toBe(1);
  });

  test('round-tripping a project makes it classify as identical, not merge-tracking', async () => {
    // This is what previously pinned every shared project in permanent
    // merge-tracking: the receiving device restamped updatedAt, so the two
    // sides could never compare equal again.
    await SE.executeImport(freshPlan());

    const localMap = {};
    for (const [id] of LIBRARY) localMap[id] = _db.get(id);

    const remoteProjects = LIBRARY.map(([id, name, at]) => {
      const p = mkProject(id, name, at);
      return { id, updatedAt: at, fingerprint: SE.computeFingerprint(p), data: p };
    });

    const classified = SE.classifyProjects(remoteProjects, localMap);
    expect(classified.every(c => c.classification === 'identical')).toBe(true);
  });

  test('a locally-authored save still gets a fresh timestamp', async () => {
    // preserveUpdatedAt must be strictly opt-in — normal app saves are untouched.
    const p = mkProject('proj_local', 'Local work', '2020-01-01T00:00:00.000Z');
    await ProjectStorage.save(p);
    expect(p.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });

  test('preserveUpdatedAt falls back to a fresh stamp when updatedAt is missing', async () => {
    const p = mkProject('proj_nots', 'No timestamp', undefined);
    delete p.updatedAt;
    await ProjectStorage.save(p, { preserveUpdatedAt: true });
    expect(typeof p.updatedAt).toBe('string');
    expect(p.updatedAt.length).toBeGreaterThan(0);
  });
});
