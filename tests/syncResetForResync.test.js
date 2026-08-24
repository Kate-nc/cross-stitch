// Tests for the "clear this device's library and rebuild it from a peer" path.
//
// Clearing the library alone is not enough. ProjectStorage.delete() writes a
// tombstone per id and adds it to a session-delete guard, and the sync cursors
// mark the peer's existing file as already seen — so a naive wipe-and-resync
// imports nothing at all and looks exactly like sync being broken.

const fs = require('fs');
const pako = require('pako');
const { IDBFactory } = require('fake-indexeddb');

global.window = global.window || {};
global.pako = pako;
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');

let CLOCK = Date.parse('2026-08-24T09:00:00.000Z');
const tick = () => new Date((CLOCK += 1000)).toISOString();

function makeDevice(deviceId, deviceName) {
  const store = {};
  const ls = {
    getItem: k => (store[k] !== undefined ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => Object.keys(store).forEach(k => delete store[k])
  };
  const db = new Map();
  const deletedIds = new Set();
  const ps = {
    _deletedIds: deletedIds,
    listProjects: async () => [...db.values()]
      .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)),
    get: async id => (db.has(id) ? JSON.parse(JSON.stringify(db.get(id))) : null),
    save: async (p, options) => {
      const opts = options || {};
      if (deletedIds.has(p.id)) return p.id; // mirrors the real session guard
      if (!(opts.preserveUpdatedAt && p.updatedAt)) p.updatedAt = tick();
      db.set(p.id, JSON.parse(JSON.stringify(p)));
      return p.id;
    },
    markSynced: async () => {},
    // Mirrors the real delete(): tombstones AND sets the session guard.
    delete: async id => {
      db.delete(id);
      deletedIds.add(id);
      const raw = ls.getItem('cs_deleted_project_ids');
      const t = raw ? JSON.parse(raw) : [];
      if (!t.includes(id)) t.push(id);
      ls.setItem('cs_deleted_project_ids', JSON.stringify(t));
    },
    clearAllProjects: async () => {
      const n = db.size;
      db.clear();
      // No tombstones written, and the session-delete guard is released so
      // ids deleted earlier this session can be re-imported.
      deletedIds.clear();
      return n;
    },
    getProjectStates: () => ({}),
    clearActiveProject: () => {}
  };
  ls.setItem('cs_sync_deviceId', deviceId);
  ls.setItem('cs_sync_deviceName', deviceName);
  return { ls, db, ps, deletedIds, idb: new IDBFactory() };
}

const deviceA = makeDevice('dev_A', 'Sziedem');
const deviceB = makeDevice('dev_B', 'osiem');

function use(dev) {
  global.localStorage = dev.ls;
  global.ProjectStorage = dev.ps;
  global.indexedDB = dev.idb;
}
use(deviceA);

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

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
  for (let i = 0; i < 100; i++) pattern.push({ id: String(310 + (i % 3)) });
  return {
    id, name, updatedAt, settings: { sW: 10, sH: 10 }, pattern,
    done: new Array(100).fill(0), statsSessions: [], sessions: [], totalTime: 0
  };
}

const LIBRARY = [
  ['proj_1', 'Cerbii', '2026-05-24T10:00:00.000Z'],
  ['proj_2', 'Corgi',  '2026-06-17T10:00:00.000Z'],
  ['proj_3', 'Books',  '2026-08-23T14:12:36.486Z']
];

async function syncAtoB() {
  use(deviceA);
  const syncObj = await SE.exportSync();
  use(deviceB);
  const plan = await SE.prepareImport(syncObj);
  const parts = SE._test.partitionPlan(plan);
  if (parts.autoPlan) await SE.executeImport(parts.autoPlan);
  return plan;
}

beforeEach(() => {
  deviceA.db.clear();
  deviceB.db.clear();
  deviceB.deletedIds.clear();
  deviceB.ls.clear();
  deviceB.ls.setItem('cs_sync_deviceId', 'dev_B');
  for (const [id, name, at] of LIBRARY) deviceA.db.set(id, mkProject(id, name, at));
});

describe('the trap: a naive wipe with delete() breaks the rebuild', () => {
  test('deleting every project blocks the re-sync entirely', async () => {
    await syncAtoB();
    expect(deviceB.db.size).toBe(3);

    // Wipe the "obvious" way.
    use(deviceB);
    for (const [id] of LIBRARY) await deviceB.ps.delete(id);
    expect(deviceB.db.size).toBe(0);

    // A re-publishes everything; B imports nothing, because every id is now
    // tombstoned and classifyProjects skips them.
    const plan = await syncAtoB();
    expect(plan.newRemote.length).toBe(0);
    expect(deviceB.db.size).toBe(0);
  });
});

describe('resetForResync rebuilds cleanly', () => {
  test('it refuses to run without the confirmation token', async () => {
    use(deviceB);
    await expect(SE.resetForResync()).rejects.toThrow(/DELETE_LOCAL_LIBRARY/);
    await expect(SE.resetForResync({ confirm: 'yes' })).rejects.toThrow(/DELETE_LOCAL_LIBRARY/);
  });

  test('it removes the library and reports the count', async () => {
    await syncAtoB();
    use(deviceB);
    const result = await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });
    expect(result.removed).toBe(3);
    expect(deviceB.db.size).toBe(0);
  });

  test('it leaves no tombstones behind', async () => {
    await syncAtoB();
    use(deviceB);
    // Pre-existing tombstones must go too — they would block those ids.
    deviceB.ls.setItem('cs_deleted_project_ids', JSON.stringify(['proj_2']));
    await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });
    expect(deviceB.ls.getItem('cs_deleted_project_ids')).toBeNull();
  });

  test('it clears the per-device and global import cursors', async () => {
    await syncAtoB();
    use(deviceB);
    expect(deviceB.ls.getItem('cs_sync_lastImportPerDevice')).not.toBeNull();
    await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });
    expect(deviceB.ls.getItem('cs_sync_lastImportPerDevice')).toBeNull();
    expect(deviceB.ls.getItem('cs_sync_lastImportAt')).toBeNull();
  });

  test('the whole library comes back on the next sync, including ids deleted before', async () => {
    await syncAtoB();
    use(deviceB);
    // Simulate B having previously deleted one of A's patterns.
    await deviceB.ps.delete('proj_2');
    expect(JSON.parse(deviceB.ls.getItem('cs_deleted_project_ids'))).toContain('proj_2');

    await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });

    const plan = await syncAtoB();
    expect(plan.newRemote.length).toBe(3);
    expect(deviceB.db.size).toBe(3);
    expect(deviceB.db.has('proj_2')).toBe(true);
  });

  test('rebuilt projects keep A\'s real edit times and ordering', async () => {
    await syncAtoB();
    use(deviceB);
    await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });
    await syncAtoB();

    for (const [id, , at] of LIBRARY) {
      expect(deviceB.db.get(id).updatedAt).toBe(at);
    }
    use(deviceB);
    const order = (await deviceB.ps.listProjects()).map(p => p.name);
    expect(order).toEqual(['Books', 'Corgi', 'Cerbii']);
  });

  test('it records the reset in the activity log', async () => {
    await syncAtoB();
    use(deviceB);
    await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });
    const entry = SE.getEventLog().find(e => e.type === 'library-reset');
    expect(entry).toBeTruthy();
    expect(entry.message).toContain('3 patterns');
  });

  test('it does not touch the thread stash', async () => {
    use(deviceB);
    deviceB.ls.setItem('some_unrelated_key', 'keep me');
    await SE.resetForResync({ confirm: 'DELETE_LOCAL_LIBRARY' });
    expect(deviceB.ls.getItem('some_unrelated_key')).toBe('keep me');
  });
});
