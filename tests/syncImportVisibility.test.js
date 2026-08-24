// Repro for the "library count shows patterns but none are visible" sync bug.
//
// Symptom (reported 2026-08): export a .csync on device A, import it on
// device B → the Pattern Library count (Manager header badge, Home Stash KPI)
// shows N patterns, but no pattern cards render anywhere.
//
// Mechanism under test:
//   • The COUNT comes from the Stash Manager's manager_state "patterns" array,
//     which mergeStash upserts UNCONDITIONALLY from the remote stash — even
//     for entries whose linkedProjectId refers to a project that was never
//     imported.
//   • The VISIBLE CARDS come from ProjectStorage.listProjects() (plus
//     manual-only patterns, i.e. entries WITHOUT linkedProjectId — see
//     project-library.js useProjectLibrary/manualPatterns).
//   • classifyProjects skips any remote project whose id is tombstoned on the
//     importing device ("Delete all patterns" writes tombstones for every id,
//     see ProjectStorage.clearAllProjects({ tombstone: true })).
//   ⇒ After a local "Delete all patterns" + re-import, every project is
//     silently declined, but the linked stash entries come straight back and
//     get counted: count = N, visible = 0.

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

// Silence expected sync warnings
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    var msg = String(arguments[0] || '');
    if (msg.indexOf('SyncEngine:') === 0) return;
    originalWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = originalWarn; });

// ── In-memory ProjectStorage double (same contract sync-engine relies on) ──
function makeProjectStorage(initialProjects) {
  const store = new Map();
  (initialProjects || []).forEach(p => store.set(p.id, p));
  return {
    _store: store,
    async listProjects() {
      // Mirrors project-storage.js listProjects(): meta for proj_* ids only.
      return Array.from(store.values())
        .filter(p => p && typeof p.id === 'string' && p.id.startsWith('proj_'))
        .map(p => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }));
    },
    async get(id) { return store.get(id) || null; },
    async save(p) { store.set(p.id, p); return p.id; },
    async delete(id) { store.delete(id); },
    async markSynced() {}
  };
}

// ── Minimal fake stitch_manager_db exposing manager_state ──────────────────
function makeFakeManagerDB(state) {
  return {
    close() {},
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = function () {
        return {
          put(value, key) { state[key] = value; },
          get(key) {
            const r = {};
            setImmediate(() => { r.result = state[key]; if (r.onsuccess) r.onsuccess(); });
            return r;
          },
          openCursor() {
            const r = {};
            const entries = Object.entries(state);
            let i = 0;
            function step() {
              const pair = entries[i];
              const cursor = pair
                ? { key: pair[0], value: pair[1], continue() { i++; setImmediate(step); } }
                : null;
              if (r.onsuccess) r.onsuccess({ target: { result: cursor } });
            }
            setImmediate(step);
            return r;
          }
        };
      };
      setImmediate(() => { if (tx.oncomplete) tx.oncomplete(); });
      return tx;
    }
  };
}

// Load the engine once; per-test state is swapped via the globals it reads.
global.ProjectStorage = makeProjectStorage([]);
const code = fs.readFileSync('./sync-engine.js', 'utf8');
eval(code);
const SE = global.SyncEngine || global.window.SyncEngine;

function makeRemoteProject(id, updatedAt) {
  return {
    id,
    name: 'Rose sampler',
    updatedAt,
    createdAt: '2026-08-01T00:00:00.000Z',
    settings: { sW: 2, sH: 2 },
    pattern: [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
    done: [0, 0, 0, 0]
  };
}

function makeSyncObj(projects, stashPatterns) {
  return {
    _format: SE.SYNC_FORMAT,
    _version: SE.SYNC_VERSION,
    _createdAt: '2026-08-15T12:00:00.000Z',
    _deviceId: 'device-A',
    _deviceName: 'Browser A',
    _mode: 'full',
    deletedProjectIds: [],
    deletedProjects: [],
    projects: projects.map(p => ({
      id: p.id,
      updatedAt: p.updatedAt,
      fingerprint: SE.computeFingerprint(p),
      data: p
    })),
    stash: {
      threads: {},
      patterns: stashPatterns
    }
  };
}

beforeEach(() => {
  global.localStorage.clear();
  global.ProjectStorage = makeProjectStorage([]);
});

describe('control: import onto a genuinely fresh device works', () => {
  test('project and its linked stash entry both arrive', async () => {
    const managerState = { threads: {}, patterns: [] };
    global.window.openManagerDB = () => Promise.resolve(makeFakeManagerDB(managerState));

    const remote = makeRemoteProject('proj_100_aaa', '2026-08-10T00:00:00.000Z');
    const syncObj = makeSyncObj([remote], [
      { id: 'lib-uuid-1', linkedProjectId: 'proj_100_aaa', title: 'Rose sampler', tags: ['auto-synced'], updatedAt: '2026-08-10T00:00:00.000Z' }
    ]);

    const plan = await SE.prepareImport(syncObj);
    expect(plan.newRemote.length).toBe(1);
    expect(plan.skippedTombstoned.length).toBe(0);

    const result = await SE.executeImport(plan);
    expect(result.imported).toBe(1);

    // Both data sources agree: 1 counted, 1 visible.
    const visibleProjects = await global.ProjectStorage.listProjects();
    expect(visibleProjects.length).toBe(1);
    expect(managerState.patterns.length).toBe(1);
  });
});

describe('fixed: tombstoned projects no longer leave phantom stash entries behind', () => {
  test('after "Delete all patterns" + re-import: count matches visible (both 0)', async () => {
    // Device B previously imported proj_100_aaa, then the user ran
    // Settings ▸ Delete all patterns (clearAllProjects tombstone:true):
    // the project row, its meta, and its manager library entry are gone,
    // and a tombstone is written for the id.
    global.localStorage.setItem('cs_deleted_project_ids', JSON.stringify([
      { id: 'proj_100_aaa', deletedAt: '2026-08-14T00:00:00.000Z' }
    ]));
    const managerState = { threads: {}, patterns: [] };
    global.window.openManagerDB = () => Promise.resolve(makeFakeManagerDB(managerState));

    // Device A never deleted anything: its export still carries both the
    // project (last edited BEFORE B's deletion) and the linked library entry.
    const remote = makeRemoteProject('proj_100_aaa', '2026-08-10T00:00:00.000Z');
    const syncObj = makeSyncObj([remote], [
      { id: 'lib-uuid-1', linkedProjectId: 'proj_100_aaa', title: 'Rose sampler', tags: ['auto-synced'], updatedAt: '2026-08-10T00:00:00.000Z' }
    ]);

    const plan = await SE.prepareImport(syncObj);

    // The project is declined (deletion is newer than the remote edit)…
    expect(plan.newRemote.length).toBe(0);
    expect(plan.skippedTombstoned.length).toBe(1);
    expect(plan.skippedTombstoned[0].id).toBe('proj_100_aaa');

    // …and mergeStash now declines the linked library entry with it: the
    // project won't exist after the import, so importing the entry would only
    // inflate the count badge without ever rendering a card.
    expect(plan.stashMerge.patterns.length).toBe(0);

    const result = await SE.executeImport(plan);
    expect(result.imported).toBe(0);
    expect(result.skippedTombstoned).toBe(1);

    // Count and cards agree again: both zero.
    const visibleProjects = await global.ProjectStorage.listProjects();
    expect(managerState.patterns.length).toBe(0);  // badge
    expect(visibleProjects.length).toBe(0);        // card grid
  });

  test('compact .p projects now pass shape validation (no more review-gate stranding)', () => {
    // Compact/legacy projects store their grid in `.p`, not `.pattern`
    // (see project-storage.js countTotalStitches). The auto-apply gate used
    // to reject them outright, shunting whole deliveries to manual review.
    const compact = {
      id: 'proj_200_bbb',
      updatedAt: '2026-08-10T00:00:00.000Z',
      settings: { sW: 2, sH: 2 },
      p: [['310'], ['550'], ['310'], ['550']]
    };
    expect(SE._test.isProjectShapeValid(compact)).toBe(true);
    // Truncation is still rejected in either encoding.
    const truncated = { ...compact, p: [['310']] };
    expect(SE._test.isProjectShapeValid(truncated)).toBe(false);
  });
});

describe('partition: a declined-everything plan can no longer smuggle phantom entries through review', () => {
  test('review-applied stash from a declined plan imports zero orphaned entries', async () => {
    global.localStorage.setItem('cs_deleted_project_ids', JSON.stringify([
      { id: 'proj_100_aaa', deletedAt: '2026-08-14T00:00:00.000Z' }
    ]));
    const managerState = { threads: {}, patterns: [] };
    global.window.openManagerDB = () => Promise.resolve(makeFakeManagerDB(managerState));

    const remote = makeRemoteProject('proj_100_aaa', '2026-08-10T00:00:00.000Z');
    const syncObj = makeSyncObj([remote], [
      { id: 'lib-uuid-1', linkedProjectId: 'proj_100_aaa', title: 'Rose sampler', tags: ['auto-synced'] }
    ]);

    const plan = await SE.prepareImport(syncObj);
    expect(SE._test.planHasProjectWork(plan)).toBe(false);

    const parts = SE._test.partitionPlan(plan);
    // Nothing auto-applies, but the plan is NOT dropped: the declined
    // projects are a side effect worth surfacing, so a review half survives
    // and its executeImport can show the skip toast with Restore.
    expect(parts.autoPlan).toBe(null);
    expect(parts.reviewPlan).not.toBe(null);

    const result = await SE.executeImport(parts.reviewPlan);
    expect(result.imported).toBe(0);
    expect(result.skippedTombstoned).toBe(1);
    // The merge preview no longer contains the orphaned linked entry, so
    // clicking through the gate cannot inflate the count.
    expect(managerState.patterns.length).toBe(0);
  });
});
