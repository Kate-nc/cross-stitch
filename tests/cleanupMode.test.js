/**
 * tests/cleanupMode.test.js
 *
 * Unit tests for the Cleanup Mode feature.
 *
 * Extracts the pure functions from:
 *   creator/useCleanupMode.js  — neighbourVote, toleranceDe
 *   cleanup-worker.js          — auto-detect phases (phase 1–4)
 *
 * These are tested in isolation, without React, DOM, or IndexedDB.
 *
 * Test surface:
 *   1. Tolerance conversion (slider → ΔE)
 *   2. _neighbourVote — standard case (unambiguous winner)
 *   3. _neighbourVote — all neighbours selected → keep current colour
 *   4. _neighbourVote — edge cell (corner, fewer neighbours)
 *   5. Auto-detect Phase 1 only — colour match
 *   6. Auto-detect Phase 2 — interior fill excluded
 *   7. Auto-detect Phase 3 — boundary (foreign neighbour) filter
 *   8. Auto-detect Phase 4 — small component < minRunLength excluded
 *   9. Atomic replacement (apply) — neighbour vote computes replacement from
 *      pre-apply snapshot, not from live state
 */

// ─── Node-compatible stubs for browser globals used in source files ─────────

// Minimal dE2000 stub: returns |L1-L2| so tests can control the distance
// without needing the full CIEDE2000 math.
global.dE2000 = function(lab1, lab2) {
  if (!lab1 || !lab2) return 999;
  return Math.abs(lab1[0] - lab2[0]);
};

global.rgbToLab = function(r, g, b) {
  // Approximate: just use L = mean(r,g,b)/100 scaled to [0,100]
  return [(r + g + b) / 3 / 2.55, 0, 0];
};

// ─── Extract functions from source files via regex+eval ─────────────────────

const fs = require('fs');
const vm = require('vm');

// ── From creator/cleanupSharedHelpers.js (must load before useCleanupMode.js) ──
// The shared helpers assign to window.cleanupFindEntry / window.cleanupNeighbourVote.
// In Node.js, window doesn't exist, so we point window at global so those
// assignments land as global.cleanupFindEntry / global.cleanupNeighbourVote.
if (typeof global.window === 'undefined') global.window = global;
const sharedHelpersSrc = fs.readFileSync('./creator/cleanupSharedHelpers.js', 'utf8');
eval(sharedHelpersSrc); // eslint-disable-line no-eval

// ── From creator/useCleanupMode.js ──

const hookSrc = fs.readFileSync('./creator/useCleanupMode.js', 'utf8');

// Extract module-root constants (var NAME = VALUE;)
function extractVar(src, name) {
  const m = src.match(new RegExp(`var ${name}\\s*=\\s*([^;]+);`));
  return m ? `var ${name} = ${m[1]};` : '';
}

// Helper: extract a named var-function or named function from source
function extractFn(src, name) {
  // Try "function name(" form
  let idx = src.indexOf(`\nfunction ${name}(`);
  if (idx === -1) idx = src.indexOf(`function ${name}(`);
  if (idx !== -1) {
    let depth = 0, i = idx;
    while (i < src.length) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { if (--depth === 0) return src.slice(idx, i + 1); }
      i++;
    }
  }
  return '';
}

// Extract _neighbourVote — it's an inner function inside useCleanupMode
const nvMatch = hookSrc.match(/function _neighbourVote\s*\([^)]*\)\s*\{/);
if (!nvMatch) throw new Error('Could not find _neighbourVote in useCleanupMode.js');
const nvStart = hookSrc.indexOf(nvMatch[0]);
let nvDepth = 0, nvEnd = nvStart;
for (let i = nvStart; i < hookSrc.length; i++) {
  if (hookSrc[i] === '{') nvDepth++;
  else if (hookSrc[i] === '}') { if (--nvDepth === 0) { nvEnd = i; break; } }
}
const neighbourVoteSrc = hookSrc.slice(nvStart, nvEnd + 1);

// Extract _findEntry
const feSrc = extractFn(hookSrc, '_findEntry');

// Evaluate constants + helper functions in a Node-compatible way
const hookPreamble = `
${extractVar(hookSrc, 'CLEANUP_TOLERANCE_MAX_DE')}
${extractVar(hookSrc, 'CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS')}
${feSrc}
${neighbourVoteSrc}

function toleranceDe(sliderVal) {
  return (sliderVal / 100) * CLEANUP_TOLERANCE_MAX_DE;
}
`;
eval(hookPreamble); // eslint-disable-line no-eval

// ── From cleanup-worker.js ──

const workerSrc = fs.readFileSync('./cleanup-worker.js', 'utf8');
const workerSandbox = {
  importScripts: function() {},
  dE2000: global.dE2000,
  Uint8Array,
  Array,
  console,
  __lastMessage: null,
  postMessage: function(msg) {
    workerSandbox.__lastMessage = msg;
  }
};
workerSandbox.self = workerSandbox;
vm.createContext(workerSandbox);
vm.runInContext(workerSrc, workerSandbox);
if (typeof workerSandbox.onmessage !== 'function') {
  throw new Error('Could not load cleanup-worker.js onmessage handler');
}

function runAutodetectAlgo(pat, sW, sH, targetLab, toleranceDe, opts) {
  opts = opts || {};
  workerSandbox.__lastMessage = null;
  workerSandbox.onmessage({
    data: {
      type: 'autodetect',
      pat,
      sW,
      sH,
      targetLab,
      toleranceDe,
      interiorCardinalThreshold: opts.interiorCardinalThreshold,
      minForeignRatio: opts.minForeignRatio,
      minRunLength: opts.minRunLength
    }
  });
  if (!workerSandbox.__lastMessage) throw new Error('Worker did not post a message');
  if (workerSandbox.__lastMessage.type === 'error') throw new Error(workerSandbox.__lastMessage.message);
  return workerSandbox.__lastMessage.selected;
}

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Build a flat pat array of sW×sH cells, all with id='bg' and lab=[50,0,0]. */
function makePat(sW, sH, defaultId = 'bg', defaultLab = [50, 0, 0]) {
  const n = sW * sH;
  const pat = new Array(n);
  for (let i = 0; i < n; i++) {
    pat[i] = { id: defaultId, lab: [...defaultLab] };
  }
  return pat;
}

/** Set a specific cell (x, y) in pat to {id, lab}. */
function setCell(pat, sW, x, y, id, lab) {
  pat[y * sW + x] = { id, lab: [...lab] };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// 1. Tolerance conversion
// ────────────────────────────────────────────────────────────────────────────
describe('toleranceDe()', () => {
  test('slider 0 → ΔE 0', () => {
    expect(toleranceDe(0)).toBe(0);
  });

  test('slider 100 → ΔE CLEANUP_TOLERANCE_MAX_DE', () => {
    expect(toleranceDe(100)).toBe(CLEANUP_TOLERANCE_MAX_DE);
  });

  test('slider 50 → ΔE half of max', () => {
    expect(toleranceDe(50)).toBeCloseTo(CLEANUP_TOLERANCE_MAX_DE / 2);
  });

  test('slider 20 → correct proportion', () => {
    expect(toleranceDe(20)).toBeCloseTo(CLEANUP_TOLERANCE_MAX_DE * 0.2);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. _neighbourVote — standard unambiguous winner
// ────────────────────────────────────────────────────────────────────────────
describe('_neighbourVote() — unambiguous winner', () => {
  test('returns the most frequent neighbour colour', () => {
    // 3×3 grid, centre cell at (1,1) is "target" (selected).
    // 7 out of 8 neighbours have id='red', 1 has id='blue'.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'red', [80, 20, 5]);
    // Centre cell (index 4) is the selected one
    pat[4] = { id: 'target', lab: [10, 0, 0] };
    // Give one neighbour a different colour
    pat[3] = { id: 'blue', lab: [40, -5, -20] }; // (0,1)

    const selectedSet = new Set([4]);
    const prePat = pat.slice();

    const result = _neighbourVote(4, prePat, selectedSet, sW, sH);
    // 'red' should win (7 vs 1)
    expect(result).not.toBeNull();
    expect(result.id).toBe('red');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. _neighbourVote — all 8 neighbours also selected → keep current colour
// ────────────────────────────────────────────────────────────────────────────
describe('_neighbourVote() — all neighbours selected', () => {
  test('returns the current cell colour when no unselected neighbours exist', () => {
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'red', [80, 20, 5]);
    // Mark all 9 cells (including centre) as selected
    const selectedSet = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const prePat = pat.slice();

    const result = _neighbourVote(4, prePat, selectedSet, sW, sH);
    // Should fall back to the cell's own colour
    expect(result.id).toBe('red');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. _neighbourVote — corner cell (only 3 valid neighbours)
// ────────────────────────────────────────────────────────────────────────────
describe('_neighbourVote() — corner cell', () => {
  test('works correctly with fewer than 8 neighbours at corner', () => {
    // 3×3 grid, cell at (0,0) = index 0. Valid neighbours: (1,0), (0,1), (1,1).
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[0] = { id: 'target', lab: [10, 0, 0] };
    // All valid neighbours are 'bg'
    const selectedSet = new Set([0]);
    const prePat = pat.slice();

    const result = _neighbourVote(0, prePat, selectedSet, sW, sH);
    expect(result.id).toBe('bg');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Auto-detect Phase 1 — colour-match
// ────────────────────────────────────────────────────────────────────────────
describe('runAutodetectAlgo() — Phase 1 colour match', () => {
  test('selects cells within tolerance of the target lab', () => {
    // 5×5 grid. Target L=10. Our dE2000 stub = |L1-L2|.
    // Cells at known positions have L=10 (match), rest L=50 (no match).
    const sW = 5, sH = 5;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    // 5-cell thin horizontal line y=2 (indices 10–14)
    for (let x = 0; x < 5; x++) setCell(pat, sW, x, 2, 'target', [10, 0, 0]);

    const targetLab = [10, 0, 0];
    const toleranceDe = 5; // ΔE 5; distance to bg = |50-10| = 40 → excluded

    const result = runAutodetectAlgo(pat, sW, sH, targetLab, toleranceDe, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.0, // disable phase 3
      minRunLength: 1       // disable phase 4
    });

    // All 5 cells in row y=2 should be selected
    for (let x = 0; x < 5; x++) {
      expect(result[2 * sW + x]).toBe(1);
    }
    // Background cells should not be selected
    expect(result[0]).toBe(0);
    expect(result[sW * sH - 1]).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. Auto-detect Phase 2 — interior fill excluded
// ────────────────────────────────────────────────────────────────────────────
describe('runAutodetectAlgo() — Phase 2 interior fill excluded', () => {
  test('a cell surrounded on all 4 cardinal sides by candidates is excluded', () => {
    // 3×3 grid, all cells are 'target' → centre cell has 4 cardinal candidate neighbours
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'target', [10, 0, 0]);
    const targetLab = [10, 0, 0];

    const result = runAutodetectAlgo(pat, sW, sH, targetLab, 1, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.0, // disable phase 3
      minRunLength: 1       // disable phase 4
    });

    // Centre cell (1,1 = index 4) has 4 cardinal neighbours → excluded
    expect(result[4]).toBe(0);
  });

  test('a cell on the edge (only 3 cardinal neighbours) is NOT excluded by phase 2', () => {
    // Edge cell at (1,0) in a 3×3 all-target grid: only 3 cardinal neighbours max
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'target', [10, 0, 0]);
    const targetLab = [10, 0, 0];

    const result = runAutodetectAlgo(pat, sW, sH, targetLab, 1, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.0,
      minRunLength: 1
    });

    // Cell (1,0) = index 1: only has 3 cardinal neighbours max → not excluded
    // (left, right, below = 3 cardinal neighbours max when on top edge)
    expect(result[1]).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. Auto-detect Phase 3 — foreign neighbour boundary filter
// ────────────────────────────────────────────────────────────────────────────
describe('runAutodetectAlgo() — Phase 3 boundary filter', () => {
  test('a thin line of target cells on a background is kept by phase 3', () => {
    // 7×5 grid. Single pixel horizontal line at y=2. Target cells have L=10;
    // background cells have L=50. Each target cell has mostly bg neighbours.
    const sW = 7, sH = 5;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    for (let x = 0; x < sW; x++) setCell(pat, sW, x, 2, 'target', [10, 0, 0]);

    const result = runAutodetectAlgo(pat, sW, sH, [10, 0, 0], 5, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.5,
      minRunLength: 1  // disable phase 4 to isolate phase 3
    });

    // The centre of the line should survive phase 3 (surrounded mostly by bg)
    expect(result[2 * sW + 3]).toBe(1);
  });

  test('an isolated target cell with no foreign neighbours is excluded by phase 3', () => {
    // 3×3 all-target grid; centre cell has zero foreign neighbours after phase 2
    // (phase 2 excluded centre; edges are kept). Edges with 0 foreign neighbours
    // also get excluded by phase 3 in this all-same configuration.
    // Use a corner cell which has <4 cardinal neighbours so phase 2 passes it.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'target', [10, 0, 0]);
    const targetLab = [10, 0, 0];

    // All neighbours of corner (0,0) are also target → foreignCount = 0 → excluded
    const result = runAutodetectAlgo(pat, sW, sH, targetLab, 1, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.01, // very low threshold: even 0/n fails 0 > 0
      minRunLength: 1
    });

    // With minForeignRatio=0.01, a cell needs at least 1 foreign neighbour to pass.
    // Corner cell (0,0) has 3 neighbours, all 'target' → foreignCount=0 → excluded.
    expect(result[0]).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 8. Auto-detect Phase 4 — small connected components excluded
// ────────────────────────────────────────────────────────────────────────────
describe('runAutodetectAlgo() — Phase 4 min run length', () => {
  test('component smaller than minRunLength is excluded', () => {
    // 7×7 grid with bg. A 2-cell horizontal run at y=3 (will be excluded with minRunLength=3).
    // A 4-cell horizontal run at y=1 (will be kept).
    const sW = 7, sH = 7;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    // 4-cell line at y=1, x=1..4
    for (let x = 1; x <= 4; x++) setCell(pat, sW, x, 1, 'target', [10, 0, 0]);
    // 2-cell line at y=5, x=2..3
    for (let x = 2; x <= 3; x++) setCell(pat, sW, x, 5, 'target', [10, 0, 0]);

    const result = runAutodetectAlgo(pat, sW, sH, [10, 0, 0], 5, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.5,
      minRunLength: 3
    });

    // 4-cell line cells should be selected (component size 4 >= 3)
    expect(result[1 * sW + 2]).toBe(1);
    // 2-cell line cells should be excluded (component size 2 < 3)
    expect(result[5 * sW + 2]).toBe(0);
    expect(result[5 * sW + 3]).toBe(0);
  });

  test('component exactly at minRunLength is kept', () => {
    const sW = 7, sH = 7;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    // Exactly 3 cells in a row at y=3 (minRunLength=3)
    for (let x = 2; x <= 4; x++) setCell(pat, sW, x, 3, 'target', [10, 0, 0]);

    const result = runAutodetectAlgo(pat, sW, sH, [10, 0, 0], 5, {
      interiorCardinalThreshold: 4,
      minForeignRatio: 0.5,
      minRunLength: 3
    });

    // All 3 cells should survive (size == minRunLength)
    expect(result[3 * sW + 2]).toBe(1);
    expect(result[3 * sW + 3]).toBe(1);
    expect(result[3 * sW + 4]).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 9. Atomic replacement — vote reads from pre-apply snapshot
// ────────────────────────────────────────────────────────────────────────────
describe('_neighbourVote() — atomic (snapshot-based) replacement', () => {
  test('two adjacent selected cells each vote from the pre-apply snapshot', () => {
    // Layout: 5-cell row.
    //   idx 0: 'red'   (not selected)
    //   idx 1: 'target' (selected) — neighbours: 0='red', 2='target'(sel)
    //   idx 2: 'target' (selected) — neighbours: 1='target'(sel), 3='red', 4='red'
    //   idx 3: 'red'   (not selected)
    //   idx 4: 'red'   (not selected)
    const sW = 5, sH = 1;
    const pat = [
      { id: 'red',    lab: [80, 20, 5] },
      { id: 'target', lab: [10, 0, 0] },
      { id: 'target', lab: [10, 0, 0] },
      { id: 'red',    lab: [80, 20, 5] },
      { id: 'red',    lab: [80, 20, 5] },
    ];
    const selectedSet = new Set([1, 2]);
    const prePat = pat.slice();

    // idx 1: unselected neighbours = idx 0 ('red') only (idx 2 is selected)
    const v1 = _neighbourVote(1, prePat, selectedSet, sW, sH);
    expect(v1.id).toBe('red');

    // idx 2: unselected neighbours = idx 3 ('red'), idx 4 ('red') → both red
    const v2 = _neighbourVote(2, prePat, selectedSet, sW, sH);
    expect(v2.id).toBe('red');

    // Crucially: if we had mutated pat[1] to 'red' before voting for idx 2,
    // then idx 2 would see 'red' from idx 1 AND idx 3,4 — but the SNAPSHOT
    // should not include that mutation. Since we're calling from prePat (pre-apply),
    // idx 1 is still 'target' and thus excluded from the vote (it's in selectedSet).
    // So idx 2's vote relies only on idx 3 and idx 4 = both 'red'. ✓
  });
});
