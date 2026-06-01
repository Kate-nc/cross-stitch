/**
 * PHASE A — CHARACTERIZATION TESTS
 *
 * These tests lock in the CURRENT behaviour of the pure/extractable functions
 * that underpin TrackerApp's progress-data integrity.  They are the regression
 * net for Phases B and C.  If any test here needs editing to pass after a
 * refactor, the refactor changed behaviour — revert and reconsider.
 *
 * Run: npm test -- --testPathPatterns="trackerPhaseA"
 *
 * NOTE: do NOT add 'use strict' to this file.  Jest's eval() approach for
 * extracting functions from source files requires sloppy mode so that function
 * declarations inside eval() leak into the surrounding module scope.  This is
 * the established pattern in this repo (see computeActiveMs.test.js,
 * helpers.test.js).  Strict mode silently breaks the extraction.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * INVARIANT INVENTORY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * INV-1 — Counter sync  (T-5 comment, tracker-app.js ~line 785-822)
 *   doneCountRef.current and colourDoneCountsRef.current MUST be derivable
 *   from (pat, done, halfStitches, halfDone) at all times.  Two valid paths:
 *   (a) Full rebuild:  recomputeAllCounts(pat, done, halfStitches, halfDone)
 *       — used after load, undo/redo, palette swap, halfStitches mutation.
 *   (b) Incremental:  applyDoneCountsDelta(changes, pat, newDone)
 *       — used for single-cell toggles and drag-bulk commits.
 *   Pre-condition: applyDoneCountsDelta is correct only when called AFTER a
 *   prior recomputeAllCounts that set the initial state of the refs.  Calling
 *   it on a zero-initialised counter (total=0) will produce done:1 / total:0
 *   which is inconsistent.  The useEffect([pat,halfStitches]) at ~line 1467
 *   enforces this by rebuilding counts whenever the pattern changes.
 *
 * INV-2 — stitchLog vs statsSessions  (tracker-app.js ~line 3801-3815)
 *   stitchLog in the saved project is DERIVED from statsSessions in
 *   buildSnapshot().  It groups netStitches by date (zero-sum dates omitted).
 *   Never mutated directly; always re-derived on every save.
 *   v3FieldsRef.current.stitchLog carries the last-computed value, but
 *   buildSnapshot() overwrites it before returning.
 *
 * INV-3 — RT stash snapshot baseline  (DEFECT-001, DEFECT-009)
 *   rtStashSnapshotRef.current is the per-project baseline for "skeins
 *   remaining".  __ensureRtStashSnapshot must NOT overwrite an existing
 *   snapshot.  __setRtStashSnapshot must NOT be called during re-enable if
 *   the snapshot already exists.  Violations silently reset waste tracking.
 *   Tested in rtSnapshotPersistence.test.js and rtExternalStashChange.test.js.
 *
 * INV-4 — prevAutoCountRef vs real counts after load
 *          (tracker-app.js ~line 1468-1470 and line 3447)
 *   processLoadedProject sets justLoadedRef.current=true and sentinel
 *   prevAutoCountRef={done:-1,halfDone:-1}.  The useEffect([countsVer]) fires
 *   after recomputeAllCounts and snaps prevAutoCountRef to the actual counts.
 *   Until that snap, the diff-based auto-session trigger cannot fire because
 *   prevDone=-1 never equals any real count.
 *
 * INV-5 — done array length vs pattern length  (tracker-app.js ~line 3269)
 *   On load: if project.done.length !== restored.length, a fresh zero array
 *   is used.  This handles patterns that were resized in the Creator between
 *   sessions.
 *
 * INV-6 — halfDone ⊆ halfStitches  (tracker-app.js recomputeAllCounts)
 *   recomputeAllCounts iterates halfStitches and looks up halfDone.get(idx).
 *   An entry in halfDone without a matching halfStitches entry is ignored —
 *   not an error.  Do not "fix" this.
 *
 * INV-7 — parkMarkers vs palette  (T-1, tracker-app.js ~line 3276)
 *   Park markers for colours no longer in the palette are dropped on load.
 *
 * INV-8 — statsSessions order for totalAtEnd backfill  (~line 3378)
 *   Pre-v9 sessions without totalAtEnd are backfilled by chronological
 *   cumulative sum of netStitches, capped at [0, totalStitchCount].
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'tracker-app.js'), 'utf8');
const helpersSrc = fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8');

// ─── Provide helpers.js globals (getStitchingDate, getSessionSeconds, etc.) ──
// Same pattern as stats-helpers.test.js
eval(helpersSrc);

// ─── Test stubs for the three names captured by the counter functions ─────────
// These are defined here at module scope so the eval'd functions below can
// reference them.  Tests call resetCounterStubs() before each assertion.
var doneCountRef = { current: 0 };
var colourDoneCountsRef = { current: {} };
function setCountsVer() { /* test stub — no-op */ }

function resetCounterStubs() {
  doneCountRef.current = 0;
  colourDoneCountsRef.current = {};
}

// ─── Extract and eval the two counter functions ───────────────────────────────
// Both functions live between "function recomputeAllCounts" and
// "const[statsSessions" in tracker-app.js.  They reference doneCountRef,
// colourDoneCountsRef, and setCountsVer by name — the module-scope stubs above
// satisfy those references.
const counterBlockMatch = trackerSrc.match(
  /function recomputeAllCounts\(patArr,doneArr,hs,hd\)[\s\S]+?(?=const\[statsSessions)/
);
if (!counterBlockMatch) throw new Error('Could not extract counter functions from tracker-app.js');
eval(counterBlockMatch[0]); // defines recomputeAllCounts and applyDoneCountsDelta

// ─── Extract and wrap the stitchLog derivation as a pure function ─────────────
// The block lives inside buildSnapshot() and closes over `statsSessions`.
// We wrap it so `statsSessions` is a parameter.
const stitchLogBlockMatch = trackerSrc.match(
  /const _logMap = \{\};[\s\S]+?\.sort\(\(a, b\) => a\.date < b\.date \? -1 : 1\)/
);
if (!stitchLogBlockMatch) throw new Error('Could not extract stitchLog derivation from tracker-app.js');
eval(
  'function deriveStitchLog(statsSessions) {\n' +
  stitchLogBlockMatch[0] + ';\n' +
  'return _derivedLog;\n' +
  '}'
);

// ─── Extract the session migration block from processLoadedProject ────────────
// The block starts with "var rawStatsSessions=" and ends just before
// "setStatsSessions(rawStatsSessions)".  It references `project`, `restored`,
// and `getStitchingDate` (provided by the helpers.js eval above), plus
// `localStorage` (mocked per-test below).
const migrationBlockMatch = trackerSrc.match(
  /var rawStatsSessions=\(project\.statsSessions\|\|\[\]\)\.filter[\s\S]+?(?=\s*setStatsSessions\(rawStatsSessions\);)/
);
if (!migrationBlockMatch) throw new Error('Could not extract session migration block from tracker-app.js');

// Wrap the migration block as a callable function.
// `localStorageMock` replaces the global `localStorage` used inside the block.
eval(
  'function runSessionMigration(project, restored, localStorageMock) {\n' +
  '  var localStorage = localStorageMock || { getItem: function(){ return null; }, removeItem: function(){} };\n' +
  migrationBlockMatch[0] + ';\n' +
  '  return rawStatsSessions;\n' +
  '}'
);

// ─────────────────────────────────────────────────────────────────────────────
// Helper builders
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal pattern cell for a given colour id. */
function cell(id) { return { id, type: 'solid', rgb: [0, 0, 0] }; }

/** Build a minimal stats session. */
function makeSession(opts) {
  return Object.assign({
    id: 'sess_' + Math.random(),
    date: '2024-01-15',
    startTime: '2024-01-15T10:00:00.000Z',
    endTime: '2024-01-15T11:00:00.000Z',
    durationSeconds: 3600,
    durationMinutes: 60,
    stitchesCompleted: 10,
    stitchesUndone: 0,
    netStitches: 10,
    totalAtEnd: 10,
    percentAtEnd: 0,
    note: '',
    coloursWorked: [],
  }, opts || {});
}

// ══════════════════════════════════════════════════════════════════════════════
// recomputeAllCounts
// ══════════════════════════════════════════════════════════════════════════════

describe('recomputeAllCounts', () => {
  beforeEach(resetCounterStubs);

  it('null/empty pattern → doneCount=0, colourDoneCounts={}', () => {
    recomputeAllCounts(null, null, null, null);
    expect(doneCountRef.current).toBe(0);
    expect(colourDoneCountsRef.current).toEqual({});
  });

  it('pattern with no done → doneCount=0, all totals correct', () => {
    const pat = [cell('310'), cell('310'), cell('550'), cell('__skip__')];
    const done = new Uint8Array(4); // all 0
    recomputeAllCounts(pat, done, null, null);
    expect(doneCountRef.current).toBe(0);
    expect(colourDoneCountsRef.current['310'].total).toBe(2);
    expect(colourDoneCountsRef.current['310'].done).toBe(0);
    expect(colourDoneCountsRef.current['550'].total).toBe(1);
    expect(colourDoneCountsRef.current['550'].done).toBe(0);
    expect(colourDoneCountsRef.current['__skip__']).toBeUndefined();
  });

  it('pattern with some done → doneCount and per-colour done counts correct', () => {
    const pat = [cell('310'), cell('310'), cell('550'), cell('550')];
    const done = new Uint8Array([1, 0, 1, 1]);
    recomputeAllCounts(pat, done, null, null);
    expect(doneCountRef.current).toBe(3);
    expect(colourDoneCountsRef.current['310'].done).toBe(1);
    expect(colourDoneCountsRef.current['310'].total).toBe(2);
    expect(colourDoneCountsRef.current['550'].done).toBe(2);
    expect(colourDoneCountsRef.current['550'].total).toBe(2);
  });

  it('__skip__ and __empty__ cells are not counted in totals', () => {
    const pat = [cell('310'), cell('__skip__'), cell('__empty__')];
    const done = new Uint8Array([1, 1, 1]); // done flag set even for background cells
    recomputeAllCounts(pat, done, null, null);
    expect(doneCountRef.current).toBe(1); // only the real stitch counts
    expect(colourDoneCountsRef.current['__skip__']).toBeUndefined();
    expect(colourDoneCountsRef.current['__empty__']).toBeUndefined();
  });

  it('half-stitches: halfTotal and halfDone counted separately from full stitches', () => {
    const pat = [cell('310'), cell('310')];
    const done = new Uint8Array([1, 0]);
    // Cell 0 has a fwd half-stitch that is done, bck not done
    const halfStitches = new Map([
      [0, { fwd: { id: '310', rgb: [0,0,0] }, bck: { id: '550', rgb: [0,0,0] } }],
    ]);
    const halfDone = new Map([
      [0, { fwd: true }], // fwd done, bck not done
    ]);
    recomputeAllCounts(pat, done, halfStitches, halfDone);
    // Full stitch counts
    expect(doneCountRef.current).toBe(1);
    // Half stitch counts for '310' (fwd)
    expect(colourDoneCountsRef.current['310'].halfTotal).toBe(1);
    expect(colourDoneCountsRef.current['310'].halfDone).toBe(1);
    // Half stitch counts for '550' (bck — not done)
    expect(colourDoneCountsRef.current['550'].halfTotal).toBe(1);
    expect(colourDoneCountsRef.current['550'].halfDone).toBe(0);
  });

  it('halfDone entry without matching halfStitches entry is silently ignored (INV-6)', () => {
    const pat = [cell('310')];
    const done = new Uint8Array([0]);
    const halfStitches = new Map(); // no half-stitches defined
    const halfDone = new Map([[0, { fwd: true }]]); // orphan halfDone — no halfStitch at index 0
    recomputeAllCounts(pat, done, halfStitches, halfDone);
    // Should not throw, halfDone entry silently ignored
    expect(doneCountRef.current).toBe(0);
    expect(colourDoneCountsRef.current['310'].halfTotal).toBe(0);
    expect(colourDoneCountsRef.current['310'].halfDone).toBe(0);
  });

  it('all done → doneCount equals stitchable cell count', () => {
    const pat = [cell('310'), cell('550'), cell('__skip__'), cell('310')];
    const done = new Uint8Array([1, 1, 1, 1]);
    recomputeAllCounts(pat, done, null, null);
    expect(doneCountRef.current).toBe(3); // 3 real cells (__skip__ excluded)
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// applyDoneCountsDelta
// ══════════════════════════════════════════════════════════════════════════════

describe('applyDoneCountsDelta', () => {
  beforeEach(resetCounterStubs);

  it('empty changes → no-op', () => {
    const pat = [cell('310')];
    const nd = new Uint8Array([0]);
    applyDoneCountsDelta([], pat, nd);
    expect(doneCountRef.current).toBe(0);
  });

  it('null changes → no-op', () => {
    const pat = [cell('310')];
    const nd = new Uint8Array([0]);
    applyDoneCountsDelta(null, pat, nd);
    expect(doneCountRef.current).toBe(0);
  });

  it('mark one cell done: doneCount increments, per-colour done increments', () => {
    const pat = [cell('310'), cell('550')];
    // Prime refs as recomputeAllCounts would have:
    doneCountRef.current = 0;
    colourDoneCountsRef.current = {
      '310': { total: 1, done: 0, halfTotal: 0, halfDone: 0 },
      '550': { total: 1, done: 0, halfTotal: 0, halfDone: 0 },
    };
    const nd = new Uint8Array([1, 0]);
    applyDoneCountsDelta([{ idx: 0, oldVal: 0 }], pat, nd);
    expect(doneCountRef.current).toBe(1);
    expect(colourDoneCountsRef.current['310'].done).toBe(1);
    expect(colourDoneCountsRef.current['550'].done).toBe(0);
  });

  it('unmark one cell: doneCount decrements, per-colour done decrements', () => {
    const pat = [cell('310')];
    doneCountRef.current = 1;
    colourDoneCountsRef.current = {
      '310': { total: 1, done: 1, halfTotal: 0, halfDone: 0 },
    };
    const nd = new Uint8Array([0]);
    applyDoneCountsDelta([{ idx: 0, oldVal: 1 }], pat, nd);
    expect(doneCountRef.current).toBe(0);
    expect(colourDoneCountsRef.current['310'].done).toBe(0);
  });

  it('change where oldVal == newDoneArr[idx] → no-op (delta skips unchanged cells)', () => {
    const pat = [cell('310')];
    doneCountRef.current = 1;
    colourDoneCountsRef.current = { '310': { total: 1, done: 1, halfTotal: 0, halfDone: 0 } };
    // oldVal=1, nd[0]=1 → no change
    const nd = new Uint8Array([1]);
    applyDoneCountsDelta([{ idx: 0, oldVal: 1 }], pat, nd);
    expect(doneCountRef.current).toBe(1); // unchanged
    expect(colourDoneCountsRef.current['310'].done).toBe(1);
  });

  it('__skip__ cells ignored by delta', () => {
    const pat = [cell('__skip__')];
    doneCountRef.current = 0;
    colourDoneCountsRef.current = {};
    const nd = new Uint8Array([1]);
    applyDoneCountsDelta([{ idx: 0, oldVal: 0 }], pat, nd);
    expect(doneCountRef.current).toBe(0); // skip cell never counted
  });

  it('shallow-copies touched colour entry (does not mutate original object)', () => {
    const pat = [cell('310')];
    const original = { total: 5, done: 2, halfTotal: 0, halfDone: 0 };
    colourDoneCountsRef.current = { '310': original };
    doneCountRef.current = 2;
    const nd = new Uint8Array([1]);
    applyDoneCountsDelta([{ idx: 0, oldVal: 0 }], pat, nd);
    // original object must not be mutated
    expect(original.done).toBe(2);
    // but the ref now has the updated copy
    expect(colourDoneCountsRef.current['310'].done).toBe(3);
  });

  it('multiple changes across different colours in one call', () => {
    const pat = [cell('310'), cell('550'), cell('310')];
    doneCountRef.current = 0;
    colourDoneCountsRef.current = {
      '310': { total: 2, done: 0, halfTotal: 0, halfDone: 0 },
      '550': { total: 1, done: 0, halfTotal: 0, halfDone: 0 },
    };
    const nd = new Uint8Array([1, 1, 0]); // mark idx 0, mark idx 1, unmark idx 2 (was 0)
    applyDoneCountsDelta(
      [{ idx: 0, oldVal: 0 }, { idx: 1, oldVal: 0 }],
      pat, nd
    );
    expect(doneCountRef.current).toBe(2);
    expect(colourDoneCountsRef.current['310'].done).toBe(1);
    expect(colourDoneCountsRef.current['550'].done).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INV-1 invariant: delta after changes == full recompute (T-5)
// ══════════════════════════════════════════════════════════════════════════════

describe('Counter invariant: applyDoneCountsDelta agrees with recomputeAllCounts (INV-1)', () => {
  /** Apply recompute + delta and return a deep copy of the ref state. */
  function stateAfterDelta(pat, initDone, changes, finalDone) {
    resetCounterStubs();
    recomputeAllCounts(pat, initDone, null, null);
    applyDoneCountsDelta(changes, pat, finalDone);
    return {
      doneCount: doneCountRef.current,
      colourDoneCounts: JSON.parse(JSON.stringify(colourDoneCountsRef.current)),
    };
  }
  /** Full recompute on final state. */
  function stateAfterRecompute(pat, finalDone) {
    resetCounterStubs();
    recomputeAllCounts(pat, finalDone, null, null);
    return {
      doneCount: doneCountRef.current,
      colourDoneCounts: JSON.parse(JSON.stringify(colourDoneCountsRef.current)),
    };
  }

  it('single-cell mark: delta == recompute', () => {
    const pat = [cell('310'), cell('550'), cell('310')];
    const initDone = new Uint8Array([0, 0, 0]);
    const finalDone = new Uint8Array([1, 0, 0]);
    const changes = [{ idx: 0, oldVal: 0 }];

    const delta = stateAfterDelta(pat, initDone, changes, finalDone);
    const recomp = stateAfterRecompute(pat, finalDone);
    expect(delta).toEqual(recomp);
  });

  it('single-cell unmark: delta == recompute', () => {
    const pat = [cell('310'), cell('310'), cell('550')];
    const initDone = new Uint8Array([1, 1, 1]);
    const finalDone = new Uint8Array([1, 0, 1]);
    const changes = [{ idx: 1, oldVal: 1 }];

    const delta = stateAfterDelta(pat, initDone, changes, finalDone);
    const recomp = stateAfterRecompute(pat, finalDone);
    expect(delta).toEqual(recomp);
  });

  it('bulk mark (multiple cells, multiple colours): delta == recompute', () => {
    const pat = [cell('310'), cell('550'), cell('550'), cell('310'), cell('321')];
    const initDone = new Uint8Array([0, 0, 1, 0, 0]);
    const finalDone = new Uint8Array([1, 1, 1, 1, 0]);
    const changes = [
      { idx: 0, oldVal: 0 },
      { idx: 1, oldVal: 0 },
      { idx: 3, oldVal: 0 },
    ];

    const delta = stateAfterDelta(pat, initDone, changes, finalDone);
    const recomp = stateAfterRecompute(pat, finalDone);
    expect(delta).toEqual(recomp);
  });

  it('rapid successive deltas agree with a single recompute on final state', () => {
    // Simulates toggling 5 cells in sequence (fast-tap scenario)
    const pat = [cell('310'), cell('310'), cell('550'), cell('550'), cell('321')];
    const done = new Uint8Array(5);

    resetCounterStubs();
    recomputeAllCounts(pat, done, null, null); // prime refs

    // Simulate 5 mark operations
    const marks = [0, 1, 2, 3, 4];
    for (const idx of marks) {
      const nd = new Uint8Array(done);
      nd[idx] = 1;
      applyDoneCountsDelta([{ idx, oldVal: 0 }], pat, nd);
      done[idx] = 1; // update the "current" done array
    }

    // Final state from delta chain
    const deltaState = {
      doneCount: doneCountRef.current,
      colourDoneCounts: JSON.parse(JSON.stringify(colourDoneCountsRef.current)),
    };

    // Full recompute on the same final done array
    resetCounterStubs();
    recomputeAllCounts(pat, done, null, null);
    const recompState = {
      doneCount: doneCountRef.current,
      colourDoneCounts: JSON.parse(JSON.stringify(colourDoneCountsRef.current)),
    };

    expect(deltaState).toEqual(recompState);
  });

  it('total is never modified by applyDoneCountsDelta (only done changes)', () => {
    const pat = [cell('310'), cell('310'), cell('550')];
    const initDone = new Uint8Array([0, 0, 0]);
    resetCounterStubs();
    recomputeAllCounts(pat, initDone, null, null);

    const initTotals = {
      '310': colourDoneCountsRef.current['310'].total,
      '550': colourDoneCountsRef.current['550'].total,
    };

    // Mark all cells
    const finalDone = new Uint8Array([1, 1, 1]);
    applyDoneCountsDelta(
      [{ idx: 0, oldVal: 0 }, { idx: 1, oldVal: 0 }, { idx: 2, oldVal: 0 }],
      pat, finalDone
    );

    // Totals must be unchanged
    expect(colourDoneCountsRef.current['310'].total).toBe(initTotals['310']);
    expect(colourDoneCountsRef.current['550'].total).toBe(initTotals['550']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// stitchLog derivation (buildSnapshot)  — INV-2
// ══════════════════════════════════════════════════════════════════════════════

describe('deriveStitchLog (stitchLog derivation from statsSessions, INV-2)', () => {
  it('empty / null sessions → []', () => {
    expect(deriveStitchLog([])).toEqual([]);
    expect(deriveStitchLog(null)).toEqual([]);
    expect(deriveStitchLog(undefined)).toEqual([]);
  });

  it('session without a date is skipped', () => {
    const sessions = [
      makeSession({ date: null }),
      makeSession({ date: '2024-01-15', netStitches: 5 }),
    ];
    const log = deriveStitchLog(sessions);
    expect(log).toHaveLength(1);
    expect(log[0].date).toBe('2024-01-15');
  });

  it('sessions on the same date: netStitches are summed', () => {
    const sessions = [
      makeSession({ date: '2024-01-15', netStitches: 10 }),
      makeSession({ date: '2024-01-15', netStitches: 5 }),
      makeSession({ date: '2024-01-15', netStitches: 3 }),
    ];
    const log = deriveStitchLog(sessions);
    expect(log).toHaveLength(1);
    expect(log[0]).toEqual({ date: '2024-01-15', count: 18 });
  });

  it('sessions on different dates produce separate sorted entries', () => {
    const sessions = [
      makeSession({ date: '2024-01-17', netStitches: 7 }),
      makeSession({ date: '2024-01-15', netStitches: 10 }),
      makeSession({ date: '2024-01-16', netStitches: 5 }),
    ];
    const log = deriveStitchLog(sessions);
    expect(log).toHaveLength(3);
    expect(log[0].date).toBe('2024-01-15');
    expect(log[1].date).toBe('2024-01-16');
    expect(log[2].date).toBe('2024-01-17');
  });

  it('date where netStitches sum to zero is excluded (done = undone)', () => {
    const sessions = [
      makeSession({ date: '2024-01-15', netStitches: 5 }),
      makeSession({ date: '2024-01-16', netStitches: 3, stitchesCompleted: 3 }),
      makeSession({ date: '2024-01-16', netStitches: -3, stitchesUndone: 3 }), // cancel out
    ];
    const log = deriveStitchLog(sessions);
    expect(log).toHaveLength(1);
    expect(log[0].date).toBe('2024-01-15');
  });

  it('negative netStitches (net undo session) appears with negative count', () => {
    // A session where more was undone than done is kept as-is (negative)
    const sessions = [
      makeSession({ date: '2024-01-15', netStitches: -3 }),
    ];
    const log = deriveStitchLog(sessions);
    expect(log).toHaveLength(1);
    expect(log[0].count).toBe(-3);
  });

  it('sessions with undefined netStitches are treated as 0', () => {
    const sessions = [
      makeSession({ date: '2024-01-15', netStitches: undefined }),
    ];
    const log = deriveStitchLog(sessions);
    // 0 sum → filtered out
    expect(log).toHaveLength(0);
  });

  it('null session entries are skipped', () => {
    const sessions = [
      null,
      makeSession({ date: '2024-01-15', netStitches: 5 }),
    ];
    const log = deriveStitchLog(sessions);
    expect(log).toHaveLength(1);
  });

  it('stitchLog agrees with statsSessions after round-trip (INV-2 property)', () => {
    // Build sessions, derive log, then re-derive and assert identity
    const sessions = [
      makeSession({ date: '2024-01-14', netStitches: 20 }),
      makeSession({ date: '2024-01-15', netStitches: 15 }),
      makeSession({ date: '2024-01-15', netStitches: 5 }), // same day
      makeSession({ date: '2024-01-16', netStitches: 0 }), // zero — excluded
    ];
    const log1 = deriveStitchLog(sessions);
    const log2 = deriveStitchLog(sessions); // idempotent
    expect(log1).toEqual(log2);
    expect(log1).toHaveLength(2); // day 16 (zero) excluded
    expect(log1[0]).toEqual({ date: '2024-01-14', count: 20 });
    expect(log1[1]).toEqual({ date: '2024-01-15', count: 20 }); // 15+5 summed
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Session migration (processLoadedProject pure block)
// ══════════════════════════════════════════════════════════════════════════════

describe('Session migration (processLoadedProject)', () => {
  // A minimal restored pattern for totalAtEnd backfill tests
  const restoredPattern = [
    cell('310'), cell('310'), cell('550'), cell('550'),
    cell('__skip__'), // background — not counted in totalStitchCount
  ];

  describe('session filter', () => {
    it('clean v11 sessions with valid startTime pass through unchanged', () => {
      const sessions = [makeSession({ startTime: '2024-01-15T10:00:00.000Z' })];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result).toHaveLength(1);
    });

    it('session with valid date but no startTime passes through', () => {
      const sessions = [makeSession({ startTime: null, date: '2024-01-15' })];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result).toHaveLength(1);
    });

    it('null session is removed', () => {
      const result = runSessionMigration(
        { statsSessions: [null, makeSession()] },
        restoredPattern
      );
      expect(result).toHaveLength(1);
    });

    it('session with NaN startTime is removed', () => {
      const sessions = [
        makeSession({ startTime: 'not-a-date' }),
        makeSession({ startTime: '2024-01-15T10:00:00.000Z' }),
      ];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result).toHaveLength(1);
      expect(result[0].startTime).toBe('2024-01-15T10:00:00.000Z');
    });

    it('session with both null startTime and null date passes through', () => {
      // A session with no time data is still kept (considered valid)
      const sessions = [makeSession({ startTime: null, date: null })];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result).toHaveLength(1);
    });
  });

  describe('legacy migration (totalTime → synthetic session)', () => {
    it('project with totalTime and no sessions → creates synthetic sess_legacy session', () => {
      const project = {
        id: 'proj_test',
        totalTime: 3600,
        createdAt: '2024-01-10T08:00:00.000Z',
        updatedAt: '2024-01-10T09:00:00.000Z',
        done: new Uint8Array([1, 1, 0, 0, 0]),
        statsSessions: [],
      };
      const result = runSessionMigration(project, restoredPattern);
      expect(result).toHaveLength(1);
      const s = result[0];
      expect(s.id).toBe('sess_legacy');
      expect(s.durationSeconds).toBe(3600);
      expect(s.note).toMatch(/legacy/i);
      expect(s.coloursWorked).toEqual([]);
    });

    it('legacy session date comes from createdAt, not today', () => {
      const pastDate = '2023-06-01';
      const project = {
        id: 'proj_test',
        totalTime: 1800,
        createdAt: pastDate + 'T10:00:00.000Z',
        done: [],
        statsSessions: [],
      };
      const result = runSessionMigration(project, restoredPattern);
      expect(result[0].date).toBe(pastDate);
    });

    it('legacy session date is never today (pushed back 24h if createdAt is today)', () => {
      const today = getStitchingDate(new Date(), 0);
      const project = {
        id: 'proj_test',
        totalTime: 1800,
        createdAt: new Date().toISOString(), // today
        done: [],
        statsSessions: [],
      };
      const result = runSessionMigration(project, restoredPattern);
      expect(result[0].date).not.toBe(today);
    });

    it('legacy stitchesCompleted comes from the done array', () => {
      const project = {
        id: 'proj_test',
        totalTime: 3600,
        createdAt: '2023-01-01T00:00:00.000Z',
        done: [1, 1, 0, 0, 0], // 2 done
        statsSessions: [],
      };
      const result = runSessionMigration(project, restoredPattern);
      expect(result[0].stitchesCompleted).toBe(2);
      expect(result[0].netStitches).toBe(2);
    });

    it('project with statsSessions already present → no synthetic session created', () => {
      const project = {
        id: 'proj_test',
        totalTime: 3600,
        createdAt: '2024-01-10T08:00:00.000Z',
        done: [],
        statsSessions: [makeSession()],
      };
      const result = runSessionMigration(project, restoredPattern);
      expect(result).toHaveLength(1);
      expect(result[0].id).not.toBe('sess_legacy');
    });

    it('project with zero totalTime and no sessions → empty result', () => {
      const project = {
        id: 'proj_test',
        totalTime: 0,
        done: [],
        statsSessions: [],
      };
      const result = runSessionMigration(project, restoredPattern);
      expect(result).toHaveLength(0);
    });
  });

  describe('durationMinutes → durationSeconds backfill', () => {
    it('session missing durationSeconds gets durationSeconds = durationMinutes * 60', () => {
      const sessions = [makeSession({ durationSeconds: null, durationMinutes: 45 })];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result[0].durationSeconds).toBe(2700);
    });

    it('session with existing durationSeconds is not overwritten', () => {
      const sessions = [makeSession({ durationSeconds: 3600, durationMinutes: 45 })];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result[0].durationSeconds).toBe(3600); // original preserved
    });
  });

  describe('totalAtEnd backfill', () => {
    it('sessions missing totalAtEnd get cumulative backfill (INV-8)', () => {
      const sessions = [
        makeSession({
          startTime: '2024-01-14T10:00:00.000Z', date: '2024-01-14',
          netStitches: 2, totalAtEnd: null,
        }),
        makeSession({
          startTime: '2024-01-15T10:00:00.000Z', date: '2024-01-15',
          netStitches: 2, totalAtEnd: null,
        }),
      ];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      // The sessions should be backfilled cumulatively
      // restoredPattern has 4 stitchable cells (excluding __skip__)
      const sorted = result.slice().sort((a, b) =>
        a.startTime < b.startTime ? -1 : 1
      );
      expect(sorted[0].totalAtEnd).toBe(2); // running: 2
      expect(sorted[1].totalAtEnd).toBe(4); // running: 2+2=4
    });

    it('totalAtEnd is capped at totalStitchCount', () => {
      const sessions = [
        makeSession({
          startTime: '2024-01-14T10:00:00.000Z', date: '2024-01-14',
          netStitches: 100, // more than pattern has
          totalAtEnd: null,
        }),
      ];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      // restoredPattern has 4 stitchable cells
      expect(result[0].totalAtEnd).toBe(4);
    });

    it('sessions already having totalAtEnd are not backfilled', () => {
      const sessions = [
        makeSession({ netStitches: 5, totalAtEnd: 99 }), // already set
      ];
      const result = runSessionMigration({ statsSessions: sessions }, restoredPattern);
      expect(result[0].totalAtEnd).toBe(99); // not overwritten
    });
  });

  describe('pending session recovery', () => {
    it('pending session in localStorage is recovered and added (not duplicated)', () => {
      const existing = makeSession({ id: 'sess_existing', netStitches: 5 });
      const pending = makeSession({ id: 'sess_pending', netStitches: 3 });
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue(JSON.stringify(pending)),
        removeItem: jest.fn(),
      };
      const project = { id: 'proj_123', statsSessions: [existing] };
      const result = runSessionMigration(project, restoredPattern, mockLocalStorage);
      expect(result).toHaveLength(2);
      expect(result.some(s => s.id === 'sess_pending')).toBe(true);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('cs_pending_session_proj_123');
    });

    it('pending session already in statsSessions is not duplicated', () => {
      const sess = makeSession({ id: 'sess_dupe', netStitches: 5 });
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue(JSON.stringify(sess)),
        removeItem: jest.fn(),
      };
      const project = { id: 'proj_123', statsSessions: [sess] };
      const result = runSessionMigration(project, restoredPattern, mockLocalStorage);
      expect(result).toHaveLength(1); // not duplicated
    });

    it('corrupt localStorage value is silently ignored', () => {
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue('{invalid json'),
        removeItem: jest.fn(),
      };
      const project = { id: 'proj_123', statsSessions: [makeSession()] };
      expect(() =>
        runSessionMigration(project, restoredPattern, mockLocalStorage)
      ).not.toThrow();
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Round-trip serialization
// ══════════════════════════════════════════════════════════════════════════════

describe('Round-trip serialization (INV-1, INV-2)', () => {
  // The serialization format for each field as it appears in buildSnapshot()
  // and how processLoadedProject() reads it back.

  it('done array: Array.from() → Uint8Array round-trip preserves all values', () => {
    const original = new Uint8Array([1, 0, 1, 1, 0, 0, 1]);
    const serialised = Array.from(original); // as buildSnapshot does
    const restored = new Uint8Array(serialised); // as processLoadedProject does
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('done array length mismatch → fresh zero array (INV-5)', () => {
    // processLoadedProject line ~3269: if lengths differ, use new Uint8Array(restored.length)
    const projDone = [1, 1, 1, 1]; // saved with 4 cells
    const patternLength = 6; // pattern has 6 cells now (was resized in Creator)
    // Simulate the processLoadedProject guard
    const result = (projDone.length === patternLength)
      ? new Uint8Array(projDone)
      : new Uint8Array(patternLength);
    expect(result).toHaveLength(6);
    expect(Array.from(result)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('halfStitches: Map → entry array → Map round-trip preserves structure', () => {
    const original = new Map([
      [3, { fwd: { id: '310', rgb: [0, 0, 0] }, bck: undefined }],
      [7, { fwd: undefined, bck: { id: '550', rgb: [128, 0, 0] } }],
    ]);
    // Serialise as buildSnapshot does
    const serialised = [...original.entries()].map(([idx, hs]) => [idx, {
      fwd: hs.fwd ? { id: hs.fwd.id, rgb: hs.fwd.rgb } : undefined,
      bck: hs.bck ? { id: hs.bck.id, rgb: hs.bck.rgb } : undefined,
    }]);
    // Restore as processLoadedProject does (simple new Map)
    const restored = new Map(serialised);
    expect(restored.size).toBe(2);
    expect(restored.get(3).fwd.id).toBe('310');
    expect(restored.get(7).bck.id).toBe('550');
  });

  it('halfDone: Map → entry array → Map round-trip preserves structure', () => {
    const original = new Map([
      [3, { fwd: true }],
      [7, { bck: true }],
    ]);
    const serialised = [...original.entries()];
    const restored = new Map(serialised);
    expect(restored.get(3)).toEqual({ fwd: true });
    expect(restored.get(7)).toEqual({ bck: true });
  });

  it('singleStitchEdits: Map → entry array → Map round-trip preserves structure', () => {
    const original = new Map([
      [10, { id: '310', type: 'solid', rgb: [0, 0, 0] }],
      [20, { id: '__skip__' }],
    ]);
    const serialised = [...original.entries()];
    const restored = new Map(serialised);
    expect(restored.get(10).id).toBe('310');
    expect(restored.get(20).id).toBe('__skip__');
  });

  it('statsSessions pass-through for v11: runSessionMigration is identity on clean sessions', () => {
    const sessions = [
      makeSession({ id: 'sess_1', netStitches: 10, totalAtEnd: 10 }),
      makeSession({ id: 'sess_2', netStitches: 5, totalAtEnd: 15 }),
    ];
    const project = { statsSessions: sessions };
    const result = runSessionMigration(project, [] /* restored — totalAtEnd already set, backfill won't run */);
    expect(result).toHaveLength(2);
    // All fields preserved (totalAtEnd already set → no backfill)
    expect(result[0].id).toBe('sess_1');
    expect(result[1].id).toBe('sess_2');
  });

  it('stitchLog derived from statsSessions round-trips through derive → same result', () => {
    const sessions = [
      makeSession({ date: '2024-01-14', netStitches: 20 }),
      makeSession({ date: '2024-01-15', netStitches: 15 }),
      makeSession({ date: '2024-01-15', netStitches: 5 }),
    ];
    // Simulate buildSnapshot: derive stitchLog
    const stitchLog = deriveStitchLog(sessions);
    // Simulate save: stitchLog is stored in the project object
    // Simulate load: processLoadedProject would use statsSessions, NOT stitchLog directly.
    //   Re-derive from the same statsSessions to confirm identity.
    const rederived = deriveStitchLog(sessions);
    expect(stitchLog).toEqual(rederived);

    // stitchLog is also tested for correctness:
    expect(stitchLog).toHaveLength(2);
    expect(stitchLog[0]).toEqual({ date: '2024-01-14', count: 20 });
    expect(stitchLog[1]).toEqual({ date: '2024-01-15', count: 20 });
  });

  it('full snapshot field presence (version 11 shape)', () => {
    // Verify that buildSnapshot returns the v11 field set.
    // This is a structural test — checks the RETURN object literal in source.
    const snapshotReturnMatch = trackerSrc.match(
      /const buildSnapshot = \(\) => \{[\s\S]+?return \{([\s\S]+?)\};\s*\};\s*buildSnapshotRef/
    );
    expect(snapshotReturnMatch).not.toBeNull();
    const body = snapshotReturnMatch[1];

    const requiredFields = [
      'version', 'id', 'page', 'name', 'createdAt', 'updatedAt',
      'settings', 'pattern', 'bsLines', 'done', 'parkMarkers',
      'halfStitches', 'halfDone', 'singleStitchEdits',
      'statsSessions', 'statsSettings', 'achievedMilestones', 'doneSnapshots',
      'breadcrumbs', 'stitchingStyle', 'blockW', 'blockH',
    ];

    for (const field of requiredFields) {
      expect(body).toMatch(new RegExp('\\b' + field + '\\b'));
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Structural safeguards (source shape)
// ══════════════════════════════════════════════════════════════════════════════

describe('Structural safeguards', () => {
  it('T-5 comment and doneCountRef invariant block is present in source', () => {
    expect(trackerSrc).toMatch(/T-5 invariant/);
    expect(trackerSrc).toMatch(/recomputeAllCounts/);
    expect(trackerSrc).toMatch(/applyDoneCountsDelta/);
    expect(trackerSrc).toMatch(/doneCountRef/);
    expect(trackerSrc).toMatch(/colourDoneCountsRef/);
  });

  it('recomputeAllCounts is called in useEffect([pat, halfStitches]) to enforce INV-1', () => {
    // The useEffect that rebuilds counts on pattern/halfStitch change must exist.
    expect(trackerSrc).toMatch(
      /useEffect\(\(\)=>\{recomputeAllCounts\(pat,done,halfStitches,halfDone\);/
    );
  });

  it('prevAutoCountRef is set to sentinel {done:-1} on processLoadedProject (INV-4)', () => {
    expect(trackerSrc).toMatch(/prevAutoCountRef\.current=\{done:-1,halfDone:-1\}/);
  });

  it('justLoadedRef is set to true in processLoadedProject before auto-session guard', () => {
    expect(trackerSrc).toMatch(/justLoadedRef\.current=true/);
  });

  it('park markers are filtered on load (T-1 / INV-7)', () => {
    // The filter must appear inside processLoadedProject, before setParkMarkers
    const loadFnIdx = trackerSrc.indexOf('function processLoadedProject(project)');
    const filterIdx = trackerSrc.indexOf('liveParkMarkers.length !== rawParkMarkers.length', loadFnIdx);
    const setIdx = trackerSrc.indexOf('setParkMarkers(liveParkMarkers)', loadFnIdx);
    expect(loadFnIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(loadFnIdx);
    expect(setIdx).toBeGreaterThan(filterIdx);
  });

  it('buildSnapshot derives stitchLog from statsSessions (not from v3FieldsRef directly)', () => {
    // The derivation must appear INSIDE buildSnapshot, before the return
    const buildIdx = trackerSrc.indexOf('const buildSnapshot = () => {');
    const logMapIdx = trackerSrc.indexOf('const _logMap = {};', buildIdx);
    const returnIdx = trackerSrc.indexOf('return {\n    version: 11', buildIdx);
    expect(buildIdx).toBeGreaterThan(-1);
    expect(logMapIdx).toBeGreaterThan(buildIdx);
    expect(returnIdx).toBeGreaterThan(logMapIdx);
  });
});
