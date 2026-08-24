/**
 * @jest-environment jsdom
 *
 * Integration tests for the sync-import visibility fixes
 * (reports/sync-import-visibility-analysis.md):
 *
 *   1. Declined imports are surfaced with a Restore toast, and
 *      SyncEngine.restoreSkippedPatterns brings the projects back.
 *   2. mergeStash skips remote library entries linked to projects that won't
 *      exist locally after the import (no more phantom Pattern Library counts).
 *   3. ProjectStorage.save({ resurrect: true }) bypasses the session-delete
 *      guard so a same-session re-import actually lands; plain save() still
 *      refuses (autosave-resurrection protection intact).
 *   4. Compact `.p` projects pass the auto-apply shape gate and get real
 *      stitch counts in their metadata.
 *
 * Runs the REAL project-storage.js against fake-indexeddb and the REAL
 * sync-engine.js on top of it — no ProjectStorage stubs.
 */
const fs = require('fs');
const path = require('path');
const pako = require('pako');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
window.indexedDB = global.indexedDB;
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
global.ensurePersistence = () => {};
global.structuredClone = global.structuredClone || (v => JSON.parse(JSON.stringify(v)));
global.pako = pako;
window.pako = pako;

const STORAGE_SRC = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');
const ENGINE_SRC = fs.readFileSync(path.join(__dirname, '..', 'sync-engine.js'), 'utf8');

eval(STORAGE_SRC);
window.ProjectStorage = ProjectStorage;
global.ProjectStorage = ProjectStorage;
eval(ENGINE_SRC);
const SE = window.SyncEngine;

// ── Fake stitch_manager_db (manager_state store) ───────────────────────────
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
            setTimeout(() => { r.result = state[key]; if (r.onsuccess) r.onsuccess(); });
            return r;
          },
          openCursor() {
            const r = {};
            const entries = Object.entries(state);
            let i = 0;
            function step() {
              const pair = entries[i];
              const cursor = pair
                ? { key: pair[0], value: pair[1], continue() { i++; setTimeout(step); } }
                : null;
              if (r.onsuccess) r.onsuccess({ target: { result: cursor } });
            }
            setTimeout(step);
            return r;
          }
        };
      };
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); });
      return tx;
    }
  };
}

function makeRemoteProject(id, updatedAt, overrides) {
  return Object.assign({
    id,
    name: 'Rose sampler',
    updatedAt,
    createdAt: '2026-08-01T00:00:00.000Z',
    settings: { sW: 2, sH: 2 },
    pattern: [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
    done: [0, 0, 0, 0]
  }, overrides || {});
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
    stash: { threads: {}, patterns: stashPatterns || [] }
  };
}

let managerState;
let toasts;

beforeEach(async () => {
  // Reset per test THROUGH ProjectStorage (its module-level connection cache
  // means swapping IDBFactory instances would leave it talking to the old DB).
  await ProjectStorage.clearAllProjects();
  localStorage.clear();
  ProjectStorage._deletedIds.clear();
  ProjectStorage._allFullCache = null;
  managerState = { threads: {}, patterns: [] };
  window.openManagerDB = () => Promise.resolve(makeFakeManagerDB(managerState));
  toasts = [];
  window.Toast = { show: t => toasts.push(t) };
  // Never let a save trigger a real auto-export in tests.
  SE.triggerAutoExport && (SE.triggerAutoExport = () => {});
});

// ---------------------------------------------------------------------------
// Fix 3 — session-delete guard vs deliberate resurrection
// ---------------------------------------------------------------------------

describe('ProjectStorage.save resurrect flag', () => {
  test('plain save() still refuses ids deleted this session (autosave guard intact)', async () => {
    ProjectStorage._deletedIds.add('proj_dead');
    await ProjectStorage.save(makeRemoteProject('proj_dead', '2026-08-10T00:00:00.000Z'));
    expect(await ProjectStorage.get('proj_dead')).toBe(null);
    expect(ProjectStorage._deletedIds.has('proj_dead')).toBe(true);
  });

  test('save({ resurrect: true }) bypasses and releases the guard', async () => {
    ProjectStorage._deletedIds.add('proj_back');
    await ProjectStorage.save(
      makeRemoteProject('proj_back', '2026-08-10T00:00:00.000Z'),
      { preserveUpdatedAt: true, resurrect: true });
    const saved = await ProjectStorage.get('proj_back');
    expect(saved).not.toBe(null);
    expect(saved.updatedAt).toBe('2026-08-10T00:00:00.000Z'); // preserveUpdatedAt honoured
    expect(ProjectStorage._deletedIds.has('proj_back')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix 2 — mergeStash consistency guard
// ---------------------------------------------------------------------------

describe('mergeStash presentProjectIds guard', () => {
  const local = {
    threads: {},
    patterns: [
      { id: 'loc-manual', title: 'Local manual' },
      { id: 'loc-linked', title: 'Local linked', linkedProjectId: 'proj_local' }
    ]
  };
  const remote = {
    threads: {},
    patterns: [
      { id: 'rem-manual', title: 'Remote manual' },
      { id: 'rem-ok', title: 'Remote linked ok', linkedProjectId: 'proj_ok' },
      { id: 'rem-orphan', title: 'Remote orphan', linkedProjectId: 'proj_gone' }
    ]
  };

  test('skips remote entries linked to projects absent from the allowed set', () => {
    const merged = SE.mergeStash(local, remote, {
      presentProjectIds: { proj_local: true, proj_ok: true }
    });
    const ids = merged.patterns.map(p => p.id).sort();
    // Local entries and remote manual/allowed entries survive; the orphan doesn't.
    expect(ids).toEqual(['loc-linked', 'loc-manual', 'rem-manual', 'rem-ok']);
  });

  test('without opts the old permissive behaviour is unchanged', () => {
    const merged = SE.mergeStash(local, remote);
    expect(merged.patterns.map(p => p.id).sort())
      .toEqual(['loc-linked', 'loc-manual', 'rem-manual', 'rem-ok', 'rem-orphan']);
  });
});

describe('prepareImport builds the allowed set from local + classified projects', () => {
  test('a stash entry linked to an EXISTING local project still merges', async () => {
    await ProjectStorage.save(makeRemoteProject('proj_here', '2026-08-01T00:00:00.000Z'));
    // Remote file has no project record for proj_here — only the library entry.
    const syncObj = makeSyncObj([], [
      { id: 'lib-1', linkedProjectId: 'proj_here', title: 'Linked to local' },
      { id: 'lib-2', linkedProjectId: 'proj_missing', title: 'Orphan' }
    ]);
    const plan = await SE.prepareImport(syncObj);
    const ids = plan.stashMerge.patterns.map(p => p.id);
    expect(ids).toContain('lib-1');
    expect(ids).not.toContain('lib-2');
  });
});

// ---------------------------------------------------------------------------
// Fix 1 — declined imports are surfaced and restorable
// ---------------------------------------------------------------------------

describe('declined imports: toast + restoreSkippedPatterns', () => {
  async function importAfterDeleteAll() {
    // Seed the project, wipe it deliberately (tombstone + session guard),
    // then import a file exported BEFORE the wipe.
    const remote = makeRemoteProject('proj_100', '2026-08-10T00:00:00.000Z');
    await ProjectStorage.save({ ...remote });
    await ProjectStorage.clearAllProjects({ tombstone: true });
    expect(ProjectStorage._deletedIds.has('proj_100')).toBe(true);

    const syncObj = makeSyncObj([remote], [
      { id: 'lib-1', linkedProjectId: 'proj_100', title: 'Rose sampler', tags: ['auto-synced'] }
    ]);
    const plan = await SE.prepareImport(syncObj);
    expect(plan.skippedTombstoned.length).toBe(1);
    const result = await SE.executeImport(plan);
    return { plan, result };
  }

  test('executeImport reports the skips and shows a warning toast with Restore', async () => {
    const { result } = await importAfterDeleteAll();
    expect(result.imported).toBe(0);
    expect(result.skippedTombstoned).toBe(1);

    const warning = toasts.find(t => t.type === 'warning' && t.actionLabel === 'Restore');
    expect(warning).toBeTruthy();
    expect(warning.message).toMatch(/skipped/);
    expect(typeof warning.action).toBe('function');
  });

  test('restoreSkippedPatterns releases tombstones and re-saves the declined projects', async () => {
    const { plan } = await importAfterDeleteAll();
    expect(await ProjectStorage.listProjects()).toEqual([]);

    const r = await SE.restoreSkippedPatterns(plan);
    expect(r.restored).toBe(1);

    // Restored despite the same-session delete guard, tombstone released.
    const projects = await ProjectStorage.listProjects();
    expect(projects.length).toBe(1);
    expect(projects[0].id).toBe('proj_100');
    expect(SE.getTombstones().map(t => t.id)).not.toContain('proj_100');
  });

  test('the toast Restore action performs the same restore', async () => {
    await importAfterDeleteAll();
    const warning = toasts.find(t => t.type === 'warning' && t.actionLabel === 'Restore');
    warning.action();
    // The action chains async work; give it a couple of macrotask turns.
    await new Promise(res => setTimeout(res, 20));
    const projects = await ProjectStorage.listProjects();
    expect(projects.map(p => p.id)).toContain('proj_100');
  });

  test('a peer edit AFTER the local deletion imports directly, even in the same session', async () => {
    const remote = makeRemoteProject('proj_200', '2026-08-10T00:00:00.000Z');
    await ProjectStorage.save({ ...remote });
    await ProjectStorage.clearAllProjects({ tombstone: true });

    // The other device kept stitching: updatedAt is newer than our deletion.
    const edited = makeRemoteProject('proj_200', '2100-01-01T00:00:00.000Z', { done: [1, 0, 0, 0] });
    const plan = await SE.prepareImport(makeSyncObj([edited], []));
    expect(plan.skippedTombstoned.length).toBe(0);
    expect(plan.newRemote.length).toBe(1);

    const result = await SE.executeImport(plan);
    expect(result.imported).toBe(1);
    // Without the resurrect flag this save was silently swallowed by the
    // session-delete guard while the result still claimed success.
    const projects = await ProjectStorage.listProjects();
    expect(projects.map(p => p.id)).toContain('proj_200');
  });
});

// ---------------------------------------------------------------------------
// Fix 5 — compact `.p` projects flow through unattended
// ---------------------------------------------------------------------------

describe('compact .p projects', () => {
  test('auto-apply end-to-end: partition accepts, import lands, meta has real counts', async () => {
    const compact = {
      id: 'proj_compact',
      name: 'URL share',
      updatedAt: '2026-08-10T00:00:00.000Z',
      settings: { sW: 2, sH: 2 },
      p: [['310'], ['550'], ['310'], ['550']]
    };
    const plan = await SE.prepareImport(makeSyncObj([compact], []));
    expect(plan.newRemote.length).toBe(1);

    const parts = SE._test.partitionPlan(plan);
    expect(parts.autoPlan).not.toBe(null);
    expect(parts.reviewPlan).toBe(null);

    await SE.executeImport(parts.autoPlan);
    const metas = await ProjectStorage.listProjects();
    expect(metas.length).toBe(1);
    // buildMeta now counts `.p` grids instead of reporting 0 stitches.
    expect(metas[0].totalStitches).toBe(4);
  });
});
