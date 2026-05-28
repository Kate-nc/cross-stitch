/**
 * tests/cleanupSharedHelpers.test.js
 *
 * Unit tests for creator/cleanupSharedHelpers.js — the shared helpers used by
 * both useCleanupMode.js and useDenoiseMode.js.
 *
 * Verifies:
 *   1. cleanupFindEntry — finds a cell by id
 *   2. cleanupNeighbourVote — unambiguous winner
 *   3. cleanupNeighbourVote — all neighbours selected (fall-back to null)
 *   4. cleanupNeighbourVote — corner cell (fewer than 8 neighbours)
 *   5. cleanupNeighbourVote — tie-break via wider neighbourhood
 *   6. Consistency: produces the same result as _neighbourVote from useCleanupMode.js
 */

// ─── Stubs for browser globals ───────────────────────────────────────────────

// Minimal dE2000 stub: distance = |L1 − L2|
global.dE2000 = function(lab1, lab2) {
  if (!lab1 || !lab2) return 999;
  return Math.abs(lab1[0] - lab2[0]);
};

if (typeof global.window === 'undefined') global.window = global;

// ─── Load shared helpers ─────────────────────────────────────────────────────

const fs = require('fs');
const sharedSrc = fs.readFileSync('./creator/cleanupSharedHelpers.js', 'utf8');
eval(sharedSrc); // eslint-disable-line no-eval
// After eval, window.cleanupFindEntry and window.cleanupNeighbourVote are set.

// ─── Also load useCleanupMode.js to extract the original _neighbourVote ──────
// This is used in test 6 (consistency check).
const hookSrc = fs.readFileSync('./creator/useCleanupMode.js', 'utf8');

function extractFn(src, name) {
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

// _neighbourVote is an inner function inside useCleanupMode — extract it.
const nvMatch = hookSrc.match(/function _neighbourVote\s*\([^)]*\)\s*\{/);
if (!nvMatch) throw new Error('Could not find _neighbourVote in useCleanupMode.js');
const nvStart = hookSrc.indexOf(nvMatch[0]);
let nvDepth = 0, nvEnd = nvStart;
for (let i = nvStart; i < hookSrc.length; i++) {
  if (hookSrc[i] === '{') nvDepth++;
  else if (hookSrc[i] === '}') { if (--nvDepth === 0) { nvEnd = i; break; } }
}
const neighbourVoteSrc = hookSrc.slice(nvStart, nvEnd + 1);

// Also need CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS which _neighbourVote references.
function extractVar(src, name) {
  const m = src.match(new RegExp(`var ${name}\\s*=\\s*([^;]+);`));
  return m ? `var ${name} = ${m[1]};` : '';
}

eval(`${extractVar(hookSrc, 'CLEANUP_WIDE_NEIGHBOURHOOD_RADIUS')}\n${neighbourVoteSrc}`); // eslint-disable-line no-eval
// _neighbourVote is now in scope.

// ─── Test helpers ────────────────────────────────────────────────────────────

function makePat(sW, sH, defaultId = 'bg', defaultLab = [50, 0, 0]) {
  const n = sW * sH;
  const pat = new Array(n);
  for (let i = 0; i < n; i++) pat[i] = { id: defaultId, lab: [...defaultLab] };
  return pat;
}

// ─── 1. cleanupFindEntry ─────────────────────────────────────────────────────

describe('cleanupFindEntry()', () => {
  test('finds first cell with matching id', () => {
    const pat = [
      { id: 'a', lab: [10, 0, 0] },
      { id: 'b', lab: [20, 0, 0] },
      { id: 'a', lab: [30, 0, 0] },
    ];
    const result = window.cleanupFindEntry(pat, 'b');
    expect(result).not.toBeNull();
    expect(result.id).toBe('b');
    expect(result.lab[0]).toBe(20);
  });

  test('returns null when id not found', () => {
    const pat = [{ id: 'a', lab: [10, 0, 0] }];
    expect(window.cleanupFindEntry(pat, 'z')).toBeNull();
  });

  test('skips null slots and returns first matching cell', () => {
    const pat = [null, null, { id: 'x', lab: [0, 0, 0] }];
    const result = window.cleanupFindEntry(pat, 'x');
    expect(result).not.toBeNull();
    expect(result.id).toBe('x');
  });
});

// ─── 2. cleanupNeighbourVote — unambiguous winner ────────────────────────────

describe('cleanupNeighbourVote() — unambiguous winner', () => {
  test('returns the most frequent unselected neighbour colour', () => {
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'red', [80, 20, 5]);
    pat[4] = { id: 'target', lab: [10, 0, 0] }; // centre
    pat[3] = { id: 'blue', lab: [40, -5, -20] }; // one blue neighbour
    // 7 red neighbours, 1 blue neighbour

    const selectedSet = new Set([4]);
    const result = window.cleanupNeighbourVote(4, pat, selectedSet, sW, sH);
    expect(result).not.toBeNull();
    expect(result.id).toBe('red');
  });
});

// ─── 3. cleanupNeighbourVote — all neighbours selected ───────────────────────

describe('cleanupNeighbourVote() — all neighbours selected', () => {
  test('returns null when all 8 neighbours are in the selectedSet', () => {
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'red', [80, 20, 5]);
    // All 9 cells selected
    const selectedSet = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const result = window.cleanupNeighbourVote(4, pat, selectedSet, sW, sH);
    // Returns null — no unselected neighbours to vote
    expect(result).toBeNull();
  });
});

// ─── 4. cleanupNeighbourVote — corner cell ───────────────────────────────────

describe('cleanupNeighbourVote() — corner cell', () => {
  test('correctly handles fewer than 8 neighbours at grid corner', () => {
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[0] = { id: 'target', lab: [10, 0, 0] };
    // Neighbours of (0,0): (1,0), (0,1), (1,1) — all 'bg'
    const selectedSet = new Set([0]);
    const result = window.cleanupNeighbourVote(0, pat, selectedSet, sW, sH);
    expect(result).not.toBeNull();
    expect(result.id).toBe('bg');
  });
});

// ─── 5. cleanupNeighbourVote — tie-break ─────────────────────────────────────

describe('cleanupNeighbourVote() — tie-break via wider neighbourhood', () => {
  test('breaks a 2-way tie using the wider (5×5) neighbourhood', () => {
    // 7×7 grid. Centre cell (3,3) = index 24 is selected.
    // Immediate 8-neighbours are split 4 red / 4 blue (equal tie).
    // Fill the outer ring (5×5) heavily with 'red' to break the tie.
    const sW = 7, sH = 7;
    const pat = makePat(sW, sH, 'red', [80, 20, 5]);

    // Centre cell (selected)
    pat[3 * sW + 3] = { id: 'target', lab: [10, 0, 0] };

    // 4 immediate neighbours to blue, 4 to red (equal split)
    pat[2 * sW + 3] = { id: 'blue', lab: [40, 0, 0] }; // above
    pat[4 * sW + 3] = { id: 'blue', lab: [40, 0, 0] }; // below
    pat[3 * sW + 2] = { id: 'blue', lab: [40, 0, 0] }; // left
    pat[3 * sW + 4] = { id: 'blue', lab: [40, 0, 0] }; // right
    // diagonals remain 'red' (4 red)

    const selectedSet = new Set([3 * sW + 3]);
    const result = window.cleanupNeighbourVote(3 * sW + 3, pat, selectedSet, sW, sH, 2);
    // Outer ring is all 'red' → tie-break favours 'red'
    expect(result).not.toBeNull();
    expect(result.id).toBe('red');
  });
});

// ─── 6. Consistency: shared helper vs original _neighbourVote ────────────────

describe('cleanupNeighbourVote() — consistency with _neighbourVote', () => {
  test('both produce the same replacement id when a clear winner exists', () => {
    const sW = 5, sH = 5;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    // A 3-cell cluster at centre, with one orange outlier
    pat[2 * sW + 2] = { id: 'orange', lab: [65, 10, 40] }; // (2,2) selected
    pat[2 * sW + 1] = { id: 'blue', lab: [30, -10, -20] };  // left neighbour
    pat[1 * sW + 2] = { id: 'blue', lab: [30, -10, -20] };  // above neighbour

    const selectedSet = new Set([2 * sW + 2]);
    const idx = 2 * sW + 2;

    const sharedResult = window.cleanupNeighbourVote(idx, pat, selectedSet, sW, sH, 2);
    const originalResult = _neighbourVote(idx, pat, selectedSet, sW, sH);

    expect(sharedResult).not.toBeNull();
    expect(originalResult).not.toBeNull();
    expect(sharedResult.id).toBe(originalResult.id);
  });

  test('both return a non-null result for a corner cell with clear dominant neighbors', () => {
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'red', [80, 0, 0]);
    pat[0] = { id: 'target', lab: [10, 0, 0] }; // corner (0,0) = index 0

    const selectedSet = new Set([0]);

    const sharedResult = window.cleanupNeighbourVote(0, pat, selectedSet, sW, sH, 2);
    const originalResult = _neighbourVote(0, pat, selectedSet, sW, sH);

    // Both should pick 'red' as the winner (all 3 neighbors are red)
    expect(sharedResult).not.toBeNull();
    expect(originalResult).not.toBeNull();
    expect(sharedResult.id).toBe('red');
    expect(originalResult.id).toBe('red');
  });
});
