// Tier 1 hardening tests for the sync subsystem.
//
// These tests pin down the post-audit guarantees from the
// "synciiiing-2" cleanup pass:
//
//   1. End-to-end Big1 unification — both manual file-pick paths
//      (header menu, home dashboard) feed SyncEngine.setPendingPlan
//      after preparing an import, so a sibling tab's "Review sync"
//      finds the cached plan instead of an empty state.
//   2. _hydratePendingPlan TTL — a persisted plan older than
//      PENDING_PLAN_TTL_MS (7 days) is dropped on hydrate and a
//      cs:syncPlanPending({plan:null,reason:'ttl-expired'}) event
//      is dispatched so any tab caches that referenced the stale
//      plan clear in step with the IDB drop.
//   3. _isProjectShapeValid rejection table — malformed project
//      entries (missing id, bad dims, truncated pattern) are
//      refused so a Big2 integrity-gated plan falls through to
//      manual review instead of corrupting local storage.
//   4. _recordDeviceImport LRU eviction — the per-device map is
//      bounded at 100 entries even when the current device's own
//      record is the oldest one (the "ancient current device"
//      edge case the audit caught).
//   5. Clock-skew clamp — the contention indicator on /home
//      uses Math.max(0, ageMs) so a future-dated lastLockHeldAt
//      doesn't pin the indicator on forever.

const fs = require('fs');
const path = require('path');
const pako = require('pako');

// --- Browser-global stubs (mirrors tests/sync-engine.test.js) ---

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
global.ProjectStorage = {
  listProjects: async () => [],
  get: async () => null,
  save: async (p) => p.id
};

// Provide a fake IndexedDB so the persistence path under test can
// actually run. fake-indexeddb gives us a real(ish) async store.
const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
global.indexedDB = new FDBFactory();

// CustomEvent is referenced by the engine's dispatchEvent calls —
// jsdom-less Node needs a minimal shim.
if (typeof global.CustomEvent === 'undefined') {
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = (init && init.detail) || null;
    }
  };
}

// Capture dispatched events (engine uses window.dispatchEvent for
// cs:syncPlanPending et al).
const dispatchedEvents = [];
global.window.dispatchEvent = function (ev) { dispatchedEvents.push(ev); return true; };

// Suppress the engine's expected console.warn fallbacks
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = function (msg) {
    if (typeof msg === 'string' && msg.indexOf('SyncEngine') === 0) return;
    originalWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = originalWarn; });

const enginePath = path.join(__dirname, '..', 'sync-engine.js');
const engineSrc = fs.readFileSync(enginePath, 'utf8');
eval(engineSrc);
const SE = global.SyncEngine || global.window.SyncEngine;

beforeEach(() => {
  dispatchedEvents.length = 0;
  global.localStorage.clear();
  SE.clearPendingPlan();
});

// ---------------------------------------------------------------------------
// 1. Big1 unification — manual import paths feed setPendingPlan
// ---------------------------------------------------------------------------

describe('Big1 unification — manual import paths populate the canonical pending-plan cache', () => {
  test('header.js calls SyncEngine.setPendingPlan after prepareImport', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'header.js'), 'utf8');
    expect(src).toMatch(/SyncEngine\.setPendingPlan\s*\(\s*plan\s*\)/);
  });

  test('home-screen.js folder-import handler calls SyncEngine.setPendingPlan', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'), 'utf8');
    // Two call sites: manual file picker + handleImportFromFolder.
    const matches = src.match(/SyncEngine\.setPendingPlan\s*\(\s*plan\s*\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('setPendingPlan dispatches cs:syncPlanPending with the plan in detail', () => {
    const plan = { newRemote: [{ remote: { data: { id: 'p1', w: 2, h: 2, pattern: [{ id: '310' }, {}, {}, {}] } } }] };
    SE.setPendingPlan(plan);
    expect(SE.getPendingPlan()).toBe(plan);
    const evt = dispatchedEvents.find(e => e.type === 'cs:syncPlanPending');
    expect(evt).toBeDefined();
    expect(evt.detail.plan).toBe(plan);
  });

  test('setPendingPlan(null) clears the cache and emits a clear event', () => {
    SE.setPendingPlan({ newRemote: [] });
    dispatchedEvents.length = 0;
    SE.setPendingPlan(null);
    expect(SE.getPendingPlan()).toBeNull();
    const evt = dispatchedEvents.find(e => e.type === 'cs:syncPlanPending');
    expect(evt).toBeDefined();
    expect(evt.detail.plan).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. _hydratePendingPlan TTL
// ---------------------------------------------------------------------------

describe('_hydratePendingPlan TTL', () => {
  // Persist a plan record straight into the sync-meta store so we can
  // forge the `at` timestamp.
  async function seedPersistedPlan({ at, plan }) {
    return new Promise((resolve, reject) => {
      const req = global.indexedDB.open('cross_stitch_sync_meta', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sync_state')) db.createObjectStore('sync_state');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('sync_state', 'readwrite');
        tx.objectStore('sync_state').put({ at: at, plan: plan }, 'pendingPlan');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }

  beforeEach(() => {
    // Wipe IDB between tests so each starts fresh.
    global.indexedDB = new FDBFactory();
  });

  test('stale plan (>7 days) is dropped and a clear event is dispatched', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    await seedPersistedPlan({ at: eightDaysAgo, plan: { newRemote: [{ remote: { data: { id: 'old' } } }] } });
    // In-memory cache is already null (outer beforeEach cleared it).
    // Don't call clearPendingPlan here — it would also delete the IDB
    // record we just seeded.
    dispatchedEvents.length = 0;

    const result = await SE.hydratePendingPlan();
    expect(result).toBeNull();
    expect(SE.getPendingPlan()).toBeNull();

    const ttlEvent = dispatchedEvents.find(
      e => e.type === 'cs:syncPlanPending' && e.detail && e.detail.reason === 'ttl-expired'
    );
    expect(ttlEvent).toBeDefined();
    expect(ttlEvent.detail.plan).toBeNull();
  });

  test('fresh plan (<7 days) is rehydrated', async () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const fresh = { newRemote: [{ remote: { data: { id: 'fresh', w: 1, h: 1, pattern: [{ id: '310' }] } } }] };
    await seedPersistedPlan({ at: oneDayAgo, plan: fresh });

    const result = await SE.hydratePendingPlan();
    expect(result).not.toBeNull();
    expect(result.newRemote[0].remote.data.id).toBe('fresh');
  });

  test('record missing `at` field is treated as fresh (rollout-safety)', async () => {
    const legacyPlan = { newRemote: [{ remote: { data: { id: 'legacy' } } }] };
    await seedPersistedPlan({ at: null, plan: legacyPlan });

    const result = await SE.hydratePendingPlan();
    expect(result).not.toBeNull();
    expect(result.newRemote[0].remote.data.id).toBe('legacy');
  });
});

// ---------------------------------------------------------------------------
// 3. _isProjectShapeValid rejection table
// ---------------------------------------------------------------------------

describe('_isProjectShapeValid rejection table', () => {
  const isValid = SE._test.isProjectShapeValid;

  const rejectionCases = [
    ['null',                       null],
    ['undefined',                  undefined],
    ['non-object (string)',        'oops'],
    ['empty object',               {}],
    ['missing id',                 { w: 10, h: 10, pattern: [] }],
    ['empty-string id',            { id: '', w: 10, h: 10, pattern: [] }],
    ['non-string id',              { id: 42, w: 10, h: 10, pattern: [] }],
    ['missing w',                  { id: 'p', h: 10, pattern: [] }],
    ['missing h',                  { id: 'p', w: 10, pattern: [] }],
    ['zero w',                     { id: 'p', w: 0, h: 10, pattern: [] }],
    ['negative h',                 { id: 'p', w: 10, h: -1, pattern: [] }],
    ['absurd w (>10000)',          { id: 'p', w: 99999, h: 10, pattern: [] }],
    ['absurd h (>10000)',          { id: 'p', w: 10, h: 99999, pattern: [] }],
    ['pattern not array',          { id: 'p', w: 4, h: 4, pattern: 'oops' }],
    ['pattern truncated to <half', { id: 'p', w: 10, h: 10, pattern: new Array(40) }]
  ];

  test.each(rejectionCases)('rejects %s', (_label, project) => {
    expect(isValid(project)).toBe(false);
  });

  const acceptanceCases = [
    ['minimal 1x1',     { id: 'p', w: 1, h: 1, pattern: [{ id: '310' }] }],
    ['10x10 full',      { id: 'p', w: 10, h: 10, pattern: new Array(100).fill({ id: '310' }) }],
    ['empty pattern',   { id: 'p', w: 10, h: 10, pattern: [] }],
    ['10001 boundary',  { id: 'p', w: 10000, h: 1, pattern: [] }]
  ];

  test.each(acceptanceCases)('accepts %s', (_label, project) => {
    expect(isValid(project)).toBe(true);
  });
});

describe('_isPlanAutoApplicable integrity gate', () => {
  const auto = SE._test.isPlanAutoApplicable;

  test('plan with valid newRemote is auto-applicable', () => {
    const plan = {
      conflicts: [],
      mergeTracking: [],
      newRemote: [{ remote: { data: { id: 'p1', w: 2, h: 2, pattern: [{ id: '310' }, {}, {}, {}] } } }]
    };
    expect(auto(plan)).toBe(true);
  });

  test('plan with malformed newRemote falls through to manual review', () => {
    const plan = {
      conflicts: [],
      mergeTracking: [],
      newRemote: [{ remote: { data: { id: '', w: -1, h: -1, pattern: 'corrupt' } } }]
    };
    expect(auto(plan)).toBe(false);
  });

  test('plan with conflicts is never auto-applicable', () => {
    expect(auto({ conflicts: [{}], mergeTracking: [], newRemote: [] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. _recordDeviceImport LRU eviction stress
// ---------------------------------------------------------------------------

describe('_recordDeviceImport LRU eviction', () => {
  const recordImport = SE._test.recordDeviceImport;

  beforeEach(() => { global.localStorage.clear(); });

  function recordWithAt(deviceId, atIsoString) {
    recordImport({ _deviceId: deviceId, _deviceName: 'dev-' + deviceId, projects: [] }, null);
    // Forge `at` into the persisted record so the next eviction sort
    // sees the timestamp we want, not Date.now() at insertion time.
    const raw = JSON.parse(global.localStorage.getItem('cs_sync_lastImportPerDevice'));
    raw[deviceId].at = atIsoString;
    global.localStorage.setItem('cs_sync_lastImportPerDevice', JSON.stringify(raw));
  }

  test('caps map at 100 entries after recording 1000 distinct devices', () => {
    for (let i = 0; i < 1000; i++) {
      recordImport({ _deviceId: 'dev-' + i, _deviceName: 'd' + i, projects: [] }, null);
    }
    const map = SE.getLastImportPerDevice();
    expect(Object.keys(map).length).toBeLessThanOrEqual(100);
  });

  test('eviction removes the oldest entries first', () => {
    // Seed 5 entries with controlled timestamps.
    recordWithAt('a', '2020-01-01T00:00:00.000Z'); // oldest
    recordWithAt('b', '2021-01-01T00:00:00.000Z');
    recordWithAt('c', '2022-01-01T00:00:00.000Z');
    recordWithAt('d', '2023-01-01T00:00:00.000Z');
    recordWithAt('e', '2024-01-01T00:00:00.000Z'); // newest

    // Push the map over 100 entries so eviction kicks in.
    for (let i = 0; i < 100; i++) {
      recordImport({ _deviceId: 'filler-' + i, _deviceName: 'f' + i, projects: [] }, null);
    }

    const map = SE.getLastImportPerDevice();
    expect(Object.keys(map).length).toBeLessThanOrEqual(100);
    // 'a' (oldest by far) must be gone; 'e' (most recent of the seeded
    // batch, but still older than the fillers) is also a likely casualty
    // — what matters is that the eviction is timestamp-ordered, not that
    // any specific entry survives. Pin down the strongest invariant:
    expect(map['a']).toBeUndefined();
  });

  test('current device is preserved even when its own record is the oldest', () => {
    // Seed 100 freshly-timestamped entries.
    for (let i = 0; i < 100; i++) {
      recordImport({ _deviceId: 'fresh-' + i, _deviceName: 'f' + i, projects: [] }, null);
    }
    // Now write an "ancient" record for the device we're about to use,
    // then re-record it. The eviction loop should recognise it as the
    // current insert and keep it, even though its sort key is oldest.
    const ancient = '1990-01-01T00:00:00.000Z';
    recordWithAt('me', ancient);

    // Re-record 'me' — this is the canonical "I just synced" path.
    // The forced ancient `at` would normally make 'me' the eviction
    // target, but the while-style counter (dropped < needToDrop) skips
    // the current device and drops the next-oldest non-current entry.
    recordImport({ _deviceId: 'me', _deviceName: 'me', projects: [] }, null);

    const map = SE.getLastImportPerDevice();
    expect(map.me).toBeDefined();
    expect(Object.keys(map).length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// 5. Clock-skew clamp on the contention indicator (source-level guard)
// ---------------------------------------------------------------------------

describe('Clock-skew clamp on contention indicator', () => {
  test('home-screen.js wraps the lastLockHeldAt age in Math.max(0, ...)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'), 'utf8');
    // The exact expression — pin it down so the audit-follow-up fix
    // can't silently regress to an unclamped subtraction.
    expect(src).toMatch(/Math\.max\(0, Date\.now\(\) - new Date\(d\.lastLockHeldAt\)\.getTime\(\)\)/);
  });

  test('the >60s gate sits below the clamp so a future timestamp never pins the indicator', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'), 'utf8');
    const idx = src.indexOf('var ageMs = Math.max(0, Date.now() - new Date(d.lastLockHeldAt).getTime())');
    expect(idx).toBeGreaterThan(0);
    const after = src.slice(idx, idx + 200);
    expect(after).toMatch(/if \(ageMs > 60000\) return null/);
  });
});
