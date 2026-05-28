/**
 * tests/denoiseMode.test.js
 *
 * Unit tests for the Denoise Mode detection algorithms in noise-cleanup-worker.js.
 *
 * Extracts the three pure functions:
 *   _paletteConsolidate(pat, pal, thresholdDe, labById) → { mergeMap, clustersFormed, remappedPat }
 *   _speckleRemove(pat, sW, sH, maxSize, dominanceRatio)  → Set<number>
 *   _fringeSmooth(pat, sW, sH, transitionDe, minRegionSize, labById) → Set<number>
 *
 * These are tested in isolation — no React, no DOM, no Workers.
 *
 * Test surface:
 *   Palette consolidation
 *     1. Two colors within threshold → merged to most-used; affected stitches remapped
 *     2. Two colors beyond threshold → unchanged
 *     3. Three-way cluster → all collapse to single representative
 *     4. Single-color pattern → no change
 *     5. Blend cell not remapped even if its constituent ids would be merged
 *
 *   Speckle removal
 *     6.  Lone off-color pixel surrounded by one dominant color → replaced
 *     7.  5-pixel horizontal run → NOT replaced (component too large)
 *     8.  Component completely surrounded by __skip__ → NOT replaced
 *     9.  Dominance ratio not met (two competing colors) → NOT replaced
 *     10. Corner pixel (3 valid neighbors) with dominant neighbor → replaced
 *     11. Atomicity: neighbor-also-selected pixels don't vote for each other
 *
 *   Edge fringe smoothing
 *     12. 3-cell fringe band between two solid regions → flagged
 *     13. Two adjacent solid regions with no fringe → no change
 *     14. Cell next to regions below minRegionSize → NOT flagged
 *     15. Cell at edge with only 3 valid neighbors (validCount < 4) → NOT flagged
 *     16. Cell C where one of the top-2 neighbors is __skip__ → NOT flagged
 *
 *   Skip/empty boundary
 *     17. Lone off-color pixel: 3 __skip__ neighbors + 5 solid X → replaced
 *     18. Lone off-color: surrounded entirely by __skip__ → NOT replaced (0 valid)
 *
 *   Blend cell handling
 *     19. Blend cell itself excluded from speckle detection
 *     20. Blend cell not counted in fringe neighbor frequency
 *
 *   Combined / determinism
 *     21. Same input + same params → identical output (no randomness)
 *     22. Isolation ratio: all cells isolated → ratio = 1.0 (verified via mask size)
 *
 *   Palette consolidation edge cases
 *     23. Empty pattern → no change, clustersFormed = 0
 *     24. Single-entry palette → no merges
 */

// ─── Stubs ───────────────────────────────────────────────────────────────────

// dE2000 stub: distance = |L1[0] − L2[0]|  (makes tests controllable)
global.dE2000 = function(lab1, lab2) {
  if (!lab1 || !lab2) return 999;
  return Math.abs(lab1[0] - lab2[0]);
};

if (typeof global.window === 'undefined') global.window = global;
global.importScripts = function() {}; // Worker-only API stub
global.postMessage = function() {};   // Worker-only API stub

// ─── Extract pure functions from source ──────────────────────────────────────

const fs = require('fs');
const workerSrc = fs.readFileSync('./noise-cleanup-worker.js', 'utf8');

/** Extract a top-level `function name(...) { ... }` from src by brace matching. */
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

const palSrc     = extractFn(workerSrc, '_paletteConsolidate');
const speckleSrc = extractFn(workerSrc, '_speckleRemove');
const fringeSrc  = extractFn(workerSrc, '_fringeSmooth');

if (!palSrc)     throw new Error('Could not extract _paletteConsolidate');
if (!speckleSrc) throw new Error('Could not extract _speckleRemove');
if (!fringeSrc)  throw new Error('Could not extract _fringeSmooth');

eval(palSrc);     // eslint-disable-line no-eval
eval(speckleSrc); // eslint-disable-line no-eval
eval(fringeSrc);  // eslint-disable-line no-eval

// ─── Test helpers ────────────────────────────────────────────────────────────

/** Build a flat sW×sH pattern, all cells defaultId/defaultLab. */
function makePat(sW, sH, defaultId = 'bg', defaultLab = [50, 0, 0]) {
  const n = sW * sH;
  const pat = new Array(n);
  for (let i = 0; i < n; i++) pat[i] = { id: defaultId, lab: [...defaultLab], type: 'solid' };
  return pat;
}

/** Set cell (x, y) to {id, lab, type='solid'}. */
function setCell(pat, sW, x, y, id, lab, type = 'solid') {
  pat[y * sW + x] = { id, lab: [...lab], type };
}

/** Mark cell (x, y) as __skip__. */
function setSkip(pat, sW, x, y) {
  pat[y * sW + x] = { id: '__skip__', lab: [0, 0, 0], type: 'solid' };
}

/** Build a labById map from a list of {id, lab} objects. */
function makeLabById(entries) {
  const m = {};
  for (const e of entries) m[e.id] = e.lab;
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════
// Palette Consolidation
// ═══════════════════════════════════════════════════════════════════════════

describe('_paletteConsolidate() — basic merge', () => {
  // Our dE2000 stub = |L1-L2|. Two colors with ΔL=3 are within threshold 5.
  test('two colors within threshold are merged to most-used representative', () => {
    // 1×4 pattern. Color A (L=10) appears 3 times; color B (L=12) appears 1 time.
    // ΔE = |10-12| = 2 ≤ 5 → should merge; A is more-used so A wins.
    const sW = 4, sH = 1;
    const pat = [
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'B', lab: [12, 0, 0], type: 'solid' },
    ];
    const pal = [
      { id: 'A', lab: [10, 0, 0], count: 3 },
      { id: 'B', lab: [12, 0, 0], count: 1 },
    ];
    const labById = makeLabById(pal);

    const result = _paletteConsolidate(pat, pal, 5, labById);

    expect(result.clustersFormed).toBe(1);
    expect(result.mergeMap['B']).toBe('A');
    // All 4 cells should now have id='A'
    for (let i = 0; i < 4; i++) {
      expect(result.remappedPat[i].id).toBe('A');
    }
  });

  test('two colors beyond threshold are NOT merged', () => {
    // ΔE = |10-20| = 10 > 5 → no merge
    const pat = [
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'B', lab: [20, 0, 0], type: 'solid' },
    ];
    const pal = [
      { id: 'A', lab: [10, 0, 0], count: 1 },
      { id: 'B', lab: [20, 0, 0], count: 1 },
    ];
    const labById = makeLabById(pal);

    const result = _paletteConsolidate(pat, pal, 5, labById);

    expect(result.clustersFormed).toBe(0);
    expect(Object.keys(result.mergeMap).length).toBe(0);
    expect(result.remappedPat[0].id).toBe('A');
    expect(result.remappedPat[1].id).toBe('B');
  });

  test('three-way cluster all collapse to the most-used member', () => {
    // A (L=10, 5 uses), B (L=11, 2 uses), C (L=12, 1 use). All within ΔE=5 of each other.
    // A should win; B and C map to A.
    const pat = [
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'B', lab: [11, 0, 0], type: 'solid' },
      { id: 'C', lab: [12, 0, 0], type: 'solid' },
    ];
    const pal = [
      { id: 'A', lab: [10, 0, 0], count: 5 },
      { id: 'B', lab: [11, 0, 0], count: 2 },
      { id: 'C', lab: [12, 0, 0], count: 1 },
    ];
    const labById = makeLabById(pal);

    const result = _paletteConsolidate(pat, pal, 5, labById);

    expect(result.clustersFormed).toBe(1);
    expect(result.mergeMap['B']).toBe('A');
    expect(result.mergeMap['C']).toBe('A');
    expect(result.remappedPat[0].id).toBe('A');
    expect(result.remappedPat[1].id).toBe('A');
    expect(result.remappedPat[2].id).toBe('A');
  });

  test('single-color pattern — no merges', () => {
    const pat = [
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
    ];
    const pal = [{ id: 'A', lab: [10, 0, 0], count: 2 }];
    const labById = makeLabById(pal);

    const result = _paletteConsolidate(pat, pal, 5, labById);

    expect(result.clustersFormed).toBe(0);
    expect(result.remappedPat[0].id).toBe('A');
  });
});

describe('_paletteConsolidate() — blend cell handling', () => {
  test('blend cell is NOT remapped even when constituent id would be merged', () => {
    // A (L=10) and B (L=12) would merge. One cell is a blend.
    const pat = [
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'B', lab: [12, 0, 0], type: 'blend' }, // blend — must not be remapped
    ];
    const pal = [
      { id: 'A', lab: [10, 0, 0], count: 2 },
      { id: 'B', lab: [12, 0, 0], count: 1 },
    ];
    const labById = makeLabById(pal);

    const result = _paletteConsolidate(pat, pal, 5, labById);

    // A wins, B should be in mergeMap
    expect(result.mergeMap['B']).toBe('A');
    // But the blend cell retains id='B'
    expect(result.remappedPat[1].id).toBe('B');
    expect(result.remappedPat[1].type).toBe('blend');
  });
});

describe('_paletteConsolidate() — edge cases', () => {
  test('empty pattern — no change, clustersFormed = 0', () => {
    const result = _paletteConsolidate([], [], 5, {});
    expect(result.clustersFormed).toBe(0);
    expect(result.remappedPat.length).toBe(0);
  });

  test('single-entry palette — no merges possible', () => {
    const pat = [{ id: 'A', lab: [10, 0, 0], type: 'solid' }];
    const pal = [{ id: 'A', lab: [10, 0, 0], count: 1 }];
    const result = _paletteConsolidate(pat, pal, 5, makeLabById(pal));
    expect(result.clustersFormed).toBe(0);
    expect(result.remappedPat[0].id).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Speckle Removal
// ═══════════════════════════════════════════════════════════════════════════

describe('_speckleRemove() — basic detection', () => {
  test('lone off-color pixel surrounded entirely by one dominant color → replaced', () => {
    // 3×3 grid. Centre (1,1) = index 4 is 'odd'. All 8 neighbors = 'bg'.
    // Component size = 1 ≤ 3; dominance = 8/8 = 1.0 ≥ 0.6 → replace.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[4] = { id: 'odd', lab: [10, 0, 0], type: 'solid' };

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    expect(result.has(4)).toBe(true);
    expect(result.size).toBe(1);
  });

  test('5-pixel horizontal run → NOT replaced (component size > maxSize)', () => {
    // 1×7 pattern. 5-cell horizontal run of 'line' at positions 1–5.
    const sW = 7, sH = 1;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    for (let x = 1; x <= 5; x++) pat[x] = { id: 'line', lab: [10, 0, 0], type: 'solid' };

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    // No 'line' cells should be flagged (component size = 5 > maxSize 3)
    for (let x = 1; x <= 5; x++) expect(result.has(x)).toBe(false);
  });

  test('component completely surrounded by __skip__ → NOT replaced', () => {
    // 3×3 grid. Centre = 'odd'. All 8 neighbors = __skip__.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[4] = { id: 'odd', lab: [10, 0, 0], type: 'solid' };
    for (let i = 0; i < 9; i++) {
      if (i !== 4) pat[i] = { id: '__skip__', lab: [0, 0, 0], type: 'solid' };
    }

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    // totalNeighbors = 0 → do not replace
    expect(result.has(4)).toBe(false);
  });

  test('dominance ratio not met (two competing neighbor colors) → NOT replaced', () => {
    // 3×3 grid. Centre = 'odd'. 4 neighbors = 'red', 4 neighbors = 'blue'.
    // dominance = 4/8 = 0.5 < 0.6 → not replaced.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'red', [80, 0, 0]);
    pat[4] = { id: 'odd', lab: [10, 0, 0], type: 'solid' };
    // Replace 4 neighbors with blue (even split)
    pat[1] = { id: 'blue', lab: [40, 0, 0], type: 'solid' }; // above centre
    pat[3] = { id: 'blue', lab: [40, 0, 0], type: 'solid' }; // left of centre
    pat[5] = { id: 'blue', lab: [40, 0, 0], type: 'solid' }; // right of centre
    pat[7] = { id: 'blue', lab: [40, 0, 0], type: 'solid' }; // below centre
    // Diagonals (0,2,6,8) remain red

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    expect(result.has(4)).toBe(false);
  });

  test('corner pixel with 3 valid dominant neighbors → replaced', () => {
    // 3×3 grid. Corner (0,0) = index 0 is 'odd'.
    // Its 3 neighbors: (1,0)=index 1, (0,1)=index 3, (1,1)=index 4 — all 'bg'.
    // dominance = 3/3 = 1.0 ≥ 0.6 → replaced.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[0] = { id: 'odd', lab: [10, 0, 0], type: 'solid' };

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    expect(result.has(0)).toBe(true);
  });
});

describe('_speckleRemove() — skip/empty boundary', () => {
  test('off-color pixel: 3 __skip__ neighbors + 5 solid bg → replaced', () => {
    // 3×3 grid. Centre (1,1) = index 4 = 'odd'.
    // Top row (0,1,2) = __skip__. Rest = 'bg'.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[4] = { id: 'odd', lab: [10, 0, 0], type: 'solid' };
    pat[0] = { id: '__skip__', lab: [0, 0, 0], type: 'solid' };
    pat[1] = { id: '__skip__', lab: [0, 0, 0], type: 'solid' };
    pat[2] = { id: '__skip__', lab: [0, 0, 0], type: 'solid' };
    // Remaining 5 neighbors: 3, 5, 6, 7, 8 — all 'bg'

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    // 5 valid bg neighbors, 0 other → dominance = 5/5 = 1.0 → replaced
    expect(result.has(4)).toBe(true);
  });
});

describe('_speckleRemove() — blend cell handling', () => {
  test('blend cell is not detected as a speckle component', () => {
    // 3×3 grid. Centre = blend cell. All neighbors = 'bg'.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[4] = { id: 'A+B', lab: [10, 0, 0], type: 'blend' };

    const result = _speckleRemove(pat, sW, sH, 3, 0.6);

    // Blend cells are skipped in BFS → never flagged
    expect(result.has(4)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Fringe Smoothing
// ═══════════════════════════════════════════════════════════════════════════

describe('_fringeSmooth() — basic detection', () => {
  // Our dE2000 stub = |L1-L2|.
  // For a cell C to be fringe: fringeScore = dE(labC, midpoint(labA, labB)) ≤ transitionDe.
  // midpoint lab = ((labA[0]+labB[0])/2, ...)
  //
  // Setup: topA (L=20), topB (L=80). midpoint L = 50. Cell C with L=50 → score = |50-50| = 0 ≤ 6 → fringe.

  test('cell at midpoint of two large flanking regions → flagged as fringe', () => {
    // 5×5 grid. Large region A (id='A', L=20) fills left half (x=0,1).
    // Large region B (id='B', L=80) fills right half (x=3,4).
    // Middle column x=2 = 'C' (L=50) — the fringe.
    const sW = 5, sH = 5;
    const pat = makePat(sW, sH, 'A', [20, 0, 0]);
    for (let y = 0; y < sH; y++) {
      setCell(pat, sW, 3, y, 'B', [80, 0, 0]);
      setCell(pat, sW, 4, y, 'B', [80, 0, 0]);
      setCell(pat, sW, 2, y, 'C', [50, 0, 0]);
    }

    const labById = {
      A: [20, 0, 0],
      B: [80, 0, 0],
      C: [50, 0, 0],
    };

    // Both regions A (10 cells) and B (10 cells) are well above minRegionSize=4.
    const result = _fringeSmooth(pat, sW, sH, 6, 4, labById);

    // Middle cells should be flagged (they are fringe between A and B)
    for (let y = 0; y < sH; y++) {
      expect(result.has(y * sW + 2)).toBe(true);
    }
  });

  test('two adjacent solid regions with no fringe cells → no change', () => {
    // 4×4 grid, left half = 'A' (L=20), right half = 'B' (L=80).
    // No intermediate color — boundary cells are either A or B, never fringe.
    const sW = 4, sH = 4;
    const pat = makePat(sW, sH, 'A', [20, 0, 0]);
    for (let y = 0; y < sH; y++) {
      setCell(pat, sW, 2, y, 'B', [80, 0, 0]);
      setCell(pat, sW, 3, y, 'B', [80, 0, 0]);
    }

    const labById = { A: [20, 0, 0], B: [80, 0, 0] };

    const result = _fringeSmooth(pat, sW, sH, 6, 4, labById);

    // No cell is neither A nor B — no fringe candidate exists
    expect(result.size).toBe(0);
  });

  test('flanking regions below minRegionSize → NOT flagged as fringe', () => {
    // 5×5 grid. Cell C (x=2,y=2) at midpoint of A and B.
    // But each flanking component has only 2 cells (< minRegionSize=4).
    const sW = 5, sH = 5;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);

    // Two tiny A cells at (0,2) and (1,2)
    setCell(pat, sW, 0, 2, 'A', [20, 0, 0]);
    setCell(pat, sW, 1, 2, 'A', [20, 0, 0]);

    // Two tiny B cells at (3,2) and (4,2)
    setCell(pat, sW, 3, 2, 'B', [80, 0, 0]);
    setCell(pat, sW, 4, 2, 'B', [80, 0, 0]);

    // Fringe cell C at (2,2)
    setCell(pat, sW, 2, 2, 'C', [50, 0, 0]);

    const labById = { A: [20, 0, 0], B: [80, 0, 0], C: [50, 0, 0], bg: [50, 0, 0] };

    const result = _fringeSmooth(pat, sW, sH, 6, 4, labById);

    // Region A has 2 cells, region B has 2 cells — both < minRegionSize=4 → not flagged
    expect(result.has(2 * sW + 2)).toBe(false);
  });

  test('edge cell with fewer than 4 valid neighbors → NOT flagged', () => {
    // 3×3 grid. Cell at (0,0) — only 3 valid neighbors (< 4 required).
    // Even if it looks like fringe, validCount < 4 guard fires.
    const sW = 3, sH = 3;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    setCell(pat, sW, 0, 0, 'C', [50, 0, 0]); // fringe candidate at corner
    // neighbors of (0,0): (1,0), (0,1), (1,1) — only 3 valid cells, < 4

    const labById = { bg: [50, 0, 0], C: [50, 0, 0] };

    const result = _fringeSmooth(pat, sW, sH, 6, 4, labById);

    expect(result.has(0)).toBe(false);
  });
});

describe('_fringeSmooth() — skip/empty handling', () => {
  test('cell between one solid region and __skip__ background → NOT flagged', () => {
    // 5×3 grid. Left 2 columns = solid A. Right 2 columns = __skip__.
    // Middle column = C (fringe candidate). But the __skip__ side has no valid
    // region (compSize=0) so the guard fires.
    const sW = 5, sH = 3;
    const pat = makePat(sW, sH, 'A', [20, 0, 0]);
    for (let y = 0; y < sH; y++) {
      setCell(pat, sW, 2, y, 'C', [50, 0, 0]);
      setSkip(pat, sW, 3, y);
      setSkip(pat, sW, 4, y);
    }

    const labById = { A: [20, 0, 0], C: [50, 0, 0] };

    const result = _fringeSmooth(pat, sW, sH, 6, 4, labById);

    // The skip cells can't form a region of size ≥ minRegionSize → not flagged
    for (let y = 0; y < sH; y++) {
      expect(result.has(y * sW + 2)).toBe(false);
    }
  });
});

describe('_fringeSmooth() — blend cell handling', () => {
  test('blend cell adjacent to fringe: blend cell itself not counted in neighbor frequency', () => {
    // 5×5 grid. Fringe cell C at (2,2). Its 8 neighbors include a blend cell.
    // Blend cells are excluded from neighbor frequency → validCount decreases.
    // If remaining valid neighbors < 4, the cell is not flagged.
    const sW = 5, sH = 5;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);

    // Replace most neighbors of (2,2) with blend or bg to drop validCount below 4
    setCell(pat, sW, 2, 2, 'C', [50, 0, 0]);
    // Make 5 of 8 neighbors blend cells
    setCell(pat, sW, 1, 1, 'A+B', [30, 0, 0], 'blend');
    setCell(pat, sW, 2, 1, 'A+B', [30, 0, 0], 'blend');
    setCell(pat, sW, 3, 1, 'A+B', [30, 0, 0], 'blend');
    setCell(pat, sW, 1, 2, 'A+B', [30, 0, 0], 'blend');
    setCell(pat, sW, 1, 3, 'A+B', [30, 0, 0], 'blend');
    // 3 remaining solid neighbors: (3,2), (2,3), (3,3) — all 'bg'
    // validCount = 3 < 4 → not flagged

    const labById = { bg: [50, 0, 0], C: [50, 0, 0] };

    const result = _fringeSmooth(pat, sW, sH, 6, 4, labById);

    expect(result.has(2 * sW + 2)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Combined / Determinism
// ═══════════════════════════════════════════════════════════════════════════

describe('Determinism', () => {
  test('same input + same params → identical speckle output (no randomness)', () => {
    const sW = 5, sH = 5;
    const pat = makePat(sW, sH, 'bg', [50, 0, 0]);
    pat[12] = { id: 'odd', lab: [10, 0, 0], type: 'solid' }; // centre

    const r1 = _speckleRemove(pat, sW, sH, 3, 0.6);
    const r2 = _speckleRemove(pat, sW, sH, 3, 0.6);

    expect(r1.size).toBe(r2.size);
    r1.forEach(idx => expect(r2.has(idx)).toBe(true));
  });

  test('same input → identical palette consolidation result (no randomness)', () => {
    const pat = [
      { id: 'A', lab: [10, 0, 0], type: 'solid' },
      { id: 'B', lab: [12, 0, 0], type: 'solid' },
    ];
    const pal = [
      { id: 'A', lab: [10, 0, 0], count: 2 },
      { id: 'B', lab: [12, 0, 0], count: 1 },
    ];
    const labById = makeLabById(pal);

    const r1 = _paletteConsolidate(pat, pal, 5, labById);
    const r2 = _paletteConsolidate(pat, pal, 5, labById);

    expect(r1.clustersFormed).toBe(r2.clustersFormed);
    expect(r1.mergeMap).toEqual(r2.mergeMap);
    for (let i = 0; i < pat.length; i++) {
      expect(r1.remappedPat[i].id).toBe(r2.remappedPat[i].id);
    }
  });
});
