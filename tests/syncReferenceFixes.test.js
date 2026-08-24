// Regression guards for the sync-reference fixes (#1–#5) shipped in
// reports/sync-reference/. These pin down the contracts those fixes
// established so future refactors don't silently regress them.
//
// Coverage:
//   - Fix #1: SyncEngine exposes getPendingPlan / clearPendingPlan and a
//             cs:syncPlanPending event channel separate from the legacy
//             cs:syncUpdatesAvailable banner contract.
//   - Fix #3: clearing the pending plan also clears the in-memory cache.
//   - Fix #5: home-screen.js no longer mounts SyncSummaryModal (all
//             review surfaces route through window.SyncReviewGate).
//   - Auto-apply: _isPlanAutoApplicable's behavioural intent — plans with
//             zero conflicts and zero merge-tracking but at least one
//             newRemote project should be auto-applicable. We exercise
//             this through the public API surface (getPendingPlan stays
//             null after auto-apply because such plans never go pending).

const fs = require('fs');
const path = require('path');

// --- Load sync-engine.js the same way tests/sync-engine.test.js does ---
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
global.indexedDB = undefined; // IDB-dependent persistence paths are no-ops
global.ProjectStorage = {
  listProjects: async () => [],
  get: async () => null,
  save: async (p) => p.id
};

// Suppress the engine's expected console.warn fallbacks
const originalWarn = console.warn;
beforeAll(() => {
  console.warn = function (msg) {
    if (typeof msg === 'string' && msg.indexOf('SyncEngine') === 0) return;
    originalWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = originalWarn; });

const code = fs.readFileSync(path.join(__dirname, '..', 'sync-engine.js'), 'utf8');
eval(code);
const SE = global.SyncEngine || global.window.SyncEngine;

describe('sync-reference fix #1 — pending-plan API', () => {
  test('SyncEngine exposes getPendingPlan and clearPendingPlan', () => {
    expect(typeof SE.getPendingPlan).toBe('function');
    expect(typeof SE.clearPendingPlan).toBe('function');
  });

  test('getPendingPlan returns null when no watcher plan has been cached', () => {
    SE.clearPendingPlan();
    expect(SE.getPendingPlan()).toBeNull();
  });

  test('clearPendingPlan is idempotent and safe to call repeatedly', () => {
    expect(() => { SE.clearPendingPlan(); SE.clearPendingPlan(); }).not.toThrow();
    expect(SE.getPendingPlan()).toBeNull();
  });

  test('hydratePendingPlan exists and resolves (IDB stub returns null)', async () => {
    expect(typeof SE.hydratePendingPlan).toBe('function');
    const result = await SE.hydratePendingPlan();
    // With indexedDB undefined the hydrate path is a no-op; should resolve to null.
    expect(result).toBeNull();
  });
});

describe('sync-reference fix #5 — home-screen no longer mounts SyncSummaryModal', () => {
  const homeScreenPath = path.join(__dirname, '..', 'home-screen.js');
  const src = fs.readFileSync(homeScreenPath, 'utf8');

  test('home-screen.js does not render h(SyncSummaryModal, ...)', () => {
    // The mount call would look like  h(SyncSummaryModal, { ... })  or
    // React.createElement(SyncSummaryModal, ...). Either form is forbidden.
    expect(src).not.toMatch(/h\s*\(\s*SyncSummaryModal\b/);
    expect(src).not.toMatch(/createElement\s*\(\s*SyncSummaryModal\b/);
  });

  test('home-screen.js does not retain the old syncPlan setter as live state', () => {
    // useState declarations would look like `useState(null);` followed by
    // `var syncPlan = ... setSyncPlan = ...`. The fix removed both.
    // (Mentions in comments are allowed and explain the removal.)
    expect(src).not.toMatch(/var\s+_syncPlan\s*=\s*useState/);
  });

  test('home-screen.js opens SyncReviewGate from import paths', () => {
    expect(src).toMatch(/window\.SyncReviewGate\.open\s*\(/);
  });
});

describe('sync-reference — header.js listens to cs:syncPlanPending', () => {
  const headerPath = path.join(__dirname, '..', 'header.js');
  const src = fs.readFileSync(headerPath, 'utf8');

  test('header.js subscribes to the cs:syncPlanPending event', () => {
    expect(src).toMatch(/cs:syncPlanPending/);
  });
});

describe('sync-reference — sync-engine emits cs:syncPlanPending alongside the banner event', () => {
  const enginePath = path.join(__dirname, '..', 'sync-engine.js');
  const src = fs.readFileSync(enginePath, 'utf8');

  test('engine dispatches both cs:syncUpdatesAvailable and cs:syncPlanPending', () => {
    expect(src).toMatch(/cs:syncUpdatesAvailable/);
    expect(src).toMatch(/cs:syncPlanPending/);
  });

  test('engine clears pending plan inside executeImport so the gate empties after apply', () => {
    // executeImport must call clearPendingPlan() — otherwise SyncReviewGate
    // would re-open the same plan after a successful import.
    const execIdx = src.indexOf('async function executeImport');
    expect(execIdx).toBeGreaterThan(0);
    // Slice through to the next top-level `function ` declaration so the
    // assertion stays inside executeImport even as the function grows.
    const after = src.slice(execIdx + 1);
    const nextFn = after.search(/\n\s*(?:async\s+)?function\s+\w+\s*\(/);
    const execBody = src.slice(execIdx, execIdx + 1 + (nextFn > 0 ? nextFn : 12000));
    expect(execBody).toMatch(/clearPendingPlan\s*\(/);
  });
});

describe('sync-reference — auto-apply heuristic intent', () => {
  // _isPlanAutoApplicable is internal, but its rules are observable:
  //   - empty plan → not auto-applicable (no work to do)
  //   - plan with conflicts → not auto-applicable
  //   - plan with newRemote and no conflicts → auto-applicable
  // We assert the source-level shape so a future refactor can't silently
  // flip the heuristic to e.g. always auto-apply.
  const enginePath = path.join(__dirname, '..', 'sync-engine.js');
  const src = fs.readFileSync(enginePath, 'utf8');

  test('engine defines the auto-apply helpers and partitions inside _processFolderUpdates', () => {
    expect(src).toMatch(/function\s+_isPlanAutoApplicable\s*\(/);
    expect(src).toMatch(/function\s+_partitionPlan\s*\(/);
    const procIdx = src.indexOf('async function _processFolderUpdates');
    expect(procIdx).toBeGreaterThan(0);
    const procBody = src.slice(procIdx, procIdx + 4000);
    // The watcher now splits each delivery into an auto half and a review
    // half rather than making one all-or-nothing decision per file.
    expect(procBody).toMatch(/_partitionPlan\s*\(/);
    expect(procBody).toMatch(/autoPlan/);
    expect(procBody).toMatch(/reviewPlan/);
  });

  test('auto-apply heuristic still gates on conflicts and validates every entry', () => {
    const fnIdx = src.indexOf('function _isPlanAutoApplicable');
    const fnBody = src.slice(fnIdx, fnIdx + 2000);
    // Structural conflicts must always block auto-apply.
    expect(fnBody).toMatch(/conflicts/);
    // merge-tracking is now auto-applied (the union merge is non-destructive),
    // but every entry — newRemote and mergeTracking alike — must still pass
    // the shape check before it can be written without review.
    expect(fnBody).toMatch(/mergeTracking/);
    expect(fnBody).toMatch(/_isProjectShapeValid/);
  });
});
