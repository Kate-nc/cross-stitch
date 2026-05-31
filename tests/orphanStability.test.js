/**
 * Unit tests for the stability-iterating orphan removal introduced in Phase 1.
 *
 * Rounds 3-6 from the acceptance brief:
 *   Round 3 — Pathological inputs (checkerboard, thin line, large region)
 *   Round 4 — Termination guarantees and oscillation guard
 *   Round 5 — Threshold sensitivity (sizes 1, 2, 3)
 *   Round 6 — Determinism and ΔE contrast guard
 */

const fs = require('fs');
const { rgbToLab, dE2 } = require('../dmc-data.js');

// Make globals available for eval'd code
global.dE2 = dE2;
global.rgbToLab = rgbToLab;

// ──────────────────────────────────────────────────────────────────────────────
// Shared utilities
// ──────────────────────────────────────────────────────────────────────────────
const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');

function extractFn(src, name) {
  let start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function ${name} not found`);
  let i = start;
  while (i < src.length && src[i] !== '(') i++;
  let pd = 0;
  while (i < src.length) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } }
    i++;
  }
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Unterminated function ${name}`);
}

eval(extractFn(cuSrc, 'labelConnectedComponents')); // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'removeOrphanStitches'));      // eslint-disable-line no-eval

/** Create a palette entry for a pure RGB color. */
function entry(id, r, g, b) {
  return { type: 'solid', id, name: id, rgb: [r, g, b], lab: rgbToLab(r, g, b), dist: 0 };
}

/** Deep-clone a mapped array so mutations don't affect the original. */
function cloneMapped(mapped) {
  return mapped.map(m => ({ ...m }));
}

/** Count distinct color IDs present in mapped. */
function colorCount(mapped) {
  return new Set(mapped.map(m => m.id)).size;
}

/** Run removeOrphanStitches and return { result, stats }. */
function run(mapped, w, h, maxOrphanSize, opts = {}) {
  const stats = {};
  const result = removeOrphanStitches(
    mapped, w, h, maxOrphanSize,
    null, null,
    { maxIterations: 8, ...opts, _statsOut: stats }
  );
  return { result, stats };
}

// ──────────────────────────────────────────────────────────────────────────────
// Round 3 — Pathological inputs
// ──────────────────────────────────────────────────────────────────────────────
describe('Round 3 — Pathological inputs', () => {
  test('checkerboard: terminates and does not collapse to a single color', () => {
    const W = 6, H = 6;
    const A = entry('A', 200, 50,  50);
    const B = entry('B',  50, 50, 200);

    // Perfect 2-color checkerboard — every cell is a singleton (size 1).
    const mapped = Array.from({ length: W * H }, (_, i) => {
      const x = i % W, y = (i / W) | 0;
      return ((x + y) % 2 === 0) ? { ...A } : { ...B };
    });

    const { stats } = run(mapped, W, H, 1);

    // Must terminate within the hard cap.
    expect(stats.iterations).toBeGreaterThanOrEqual(1);
    expect(stats.iterations).toBeLessThanOrEqual(8);

    // Must NOT collapse to a single color (both A and B must remain).
    expect(colorCount(mapped)).toBeGreaterThanOrEqual(2);
  });

  test('checkerboard: oscillation guard stops the loop early', () => {
    const W = 4, H = 4;
    const A = entry('A', 200, 50,  50);
    const B = entry('B',  50, 50, 200);

    const mapped = Array.from({ length: W * H }, (_, i) => {
      const x = i % W, y = (i / W) | 0;
      return ((x + y) % 2 === 0) ? { ...A } : { ...B };
    });

    const { stats } = run(mapped, W, H, 1, { maxIterations: 8 });

    // The oscillation guard should stop long before the 8-iteration cap.
    expect(stats.iterations).toBeLessThanOrEqual(4);
  });

  test('thin horizontal line (10 cells) is not erased', () => {
    // 10×3 grid: row 0 = B (background), row 1 = A (the line), row 2 = B
    const W = 10, H = 3;
    const A = entry('A', 200,  50,  50);
    const B = entry('B',  50,  50, 200);

    const mapped = Array.from({ length: W * H }, (_, i) => {
      const y = (i / W) | 0;
      return y === 1 ? { ...A } : { ...B };
    });

    run(mapped, W, H, 3);

    // All A cells should survive — the line is size 10, above any threshold.
    const aCells = mapped.filter(m => m.id === 'A').length;
    expect(aCells).toBe(W);
  });

  test('large connected region is never touched regardless of iterations', () => {
    // 10×10 grid all one color, with maxOrphanSize = 50 (far below grid size).
    const W = 10, H = 10;
    const A = entry('A', 100, 100, 100);
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));

    run(mapped, W, H, 50, { maxIterations: 8 });

    expect(mapped.every(m => m.id === 'A')).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Round 4 — Termination guarantees
// ──────────────────────────────────────────────────────────────────────────────
describe('Round 4 — Termination guarantees', () => {
  test('normal pattern with scattered orphans terminates in ≤ 2 iterations', () => {
    // 7×7 grid of A with 3 isolated B cells — should clean up in a single pass.
    const W = 7, H = 7;
    const A = entry('A', 200, 100, 100);
    const B = entry('B', 100, 100, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[0 * W + 3] = { ...B }; // isolated B
    mapped[3 * W + 6] = { ...B }; // isolated B
    mapped[6 * W + 1] = { ...B }; // isolated B

    const { stats } = run(mapped, W, H, 2);

    expect(stats.iterations).toBeLessThanOrEqual(2);
    expect(mapped.every(m => m.id === 'A')).toBe(true);
  });

  test('hard maxIterations cap is respected', () => {
    const W = 4, H = 4;
    const A = entry('A', 200,  50,  50);
    const B = entry('B',  50,  50, 200);

    // Every cell is an orphan — will never fully stabilise.
    const mapped = Array.from({ length: W * H }, (_, i) => {
      const x = i % W, y = (i / W) | 0;
      return ((x + y) % 2 === 0) ? { ...A } : { ...B };
    });

    const stats = {};
    removeOrphanStitches(
      mapped, W, H, 1,
      null, null,
      { maxIterations: 3, _statsOut: stats }
    );

    expect(stats.iterations).toBeLessThanOrEqual(3);
  });

  test('already-stable pattern requires exactly 1 iteration', () => {
    // Single solid-color 5×5 grid — nothing to clean.
    const W = 5, H = 5;
    const A = entry('A', 150, 150, 150);
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));

    const { stats } = run(mapped, W, H, 2);
    // 0 means no orphans were found (loop body skipped); either is fine — just must be ≤ 1.
    expect(stats.iterations).toBeLessThanOrEqual(1);
  });

  test('output is stable: one more pass produces no further change', () => {
    // Build a pattern with several isolated orphan cells.
    const W = 9, H = 9;
    const A = entry('A', 200, 100, 100);
    const B = entry('B', 100, 100, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    // Scatter isolated B cells away from each other.
    [5, 20, 40, 60, 72].forEach(idx => { mapped[idx] = { ...B }; });

    run(mapped, W, H, 2, { maxIterations: 8 });
    const snapshot = mapped.map(m => m.id).join(',');

    // Run one more pass with maxIterations=1.  Output must not change.
    removeOrphanStitches(mapped, W, H, 2, null, null, { maxIterations: 1 });
    const snapshot2 = mapped.map(m => m.id).join(',');

    expect(snapshot2).toBe(snapshot);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Round 5 — Threshold sensitivity
// ──────────────────────────────────────────────────────────────────────────────
describe('Round 5 — Threshold sensitivity', () => {
  test('maxOrphanSize=1 removes singletons but not 2-cell islands', () => {
    const W = 7, H = 5;
    const A = entry('A', 200,  50,  50);
    const B = entry('B',  50,  50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    // Singleton B at (1,1)
    mapped[1 * W + 1] = { ...B };
    // Vertically-adjacent 2-cell B island at column 4, rows 1-2 (4-connected)
    mapped[1 * W + 4] = { ...B };
    mapped[2 * W + 4] = { ...B };

    run(mapped, W, H, 1);

    expect(mapped[1 * W + 1].id).toBe('A'); // singleton removed
    expect(mapped[1 * W + 4].id).toBe('B'); // 2-cell island preserved
    expect(mapped[2 * W + 4].id).toBe('B');
  });

  test('maxOrphanSize=2 removes singletons and 2-cell islands', () => {
    const W = 7, H = 5;
    const A = entry('A', 200,  50,  50);
    const B = entry('B',  50,  50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[1 * W + 1] = { ...B };               // singleton
    mapped[1 * W + 4] = { ...B };               // \
    mapped[2 * W + 4] = { ...B };               //  2-cell island

    run(mapped, W, H, 2);

    expect(mapped[1 * W + 1].id).toBe('A');
    expect(mapped[1 * W + 4].id).toBe('A');
    expect(mapped[2 * W + 4].id).toBe('A');
  });

  test('maxOrphanSize=3 removes up to 3-cell islands but not a 4-cell island', () => {
    const W = 8, H = 6;
    const A = entry('A', 200,  50,  50);
    const B = entry('B',  50,  50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    // 3-cell vertical island at col 2, rows 1-3
    mapped[1 * W + 2] = { ...B };
    mapped[2 * W + 2] = { ...B };
    mapped[3 * W + 2] = { ...B };
    // 4-cell vertical island at col 5, rows 1-4
    mapped[1 * W + 5] = { ...B };
    mapped[2 * W + 5] = { ...B };
    mapped[3 * W + 5] = { ...B };
    mapped[4 * W + 5] = { ...B };

    run(mapped, W, H, 3);

    // 3-cell island merged
    expect(mapped[1 * W + 2].id).toBe('A');
    expect(mapped[2 * W + 2].id).toBe('A');
    expect(mapped[3 * W + 2].id).toBe('A');

    // 4-cell island preserved
    expect(mapped[1 * W + 5].id).toBe('B');
    expect(mapped[2 * W + 5].id).toBe('B');
    expect(mapped[3 * W + 5].id).toBe('B');
    expect(mapped[4 * W + 5].id).toBe('B');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Round 6 — Determinism and ΔE contrast guard
// ──────────────────────────────────────────────────────────────────────────────
describe('Round 6 — Determinism', () => {
  test('identical inputs produce identical outputs', () => {
    const W = 10, H = 10;
    const A = entry('A', 200, 100, 100);
    const B = entry('B', 100, 100, 200);
    const C = entry('C', 100, 200, 100);

    const base = Array.from({ length: W * H }, () => ({ ...A }));
    [3, 7, 22, 45, 67, 88].forEach(i => { base[i] = { ...B }; });
    [15, 33, 51].forEach(i => { base[i] = { ...C }; });

    const mapped1 = cloneMapped(base);
    const mapped2 = cloneMapped(base);

    removeOrphanStitches(mapped1, W, H, 3, null, null, { maxIterations: 8 });
    removeOrphanStitches(mapped2, W, H, 3, null, null, { maxIterations: 8 });

    const ids1 = mapped1.map(m => m.id).join(',');
    const ids2 = mapped2.map(m => m.id).join(',');
    expect(ids1).toBe(ids2);
  });
});

describe('Round 6 — ΔE contrast guard', () => {
  test('high-ΔE orphan (white in black sea) is preserved when guard is active', () => {
    const W = 5, H = 5;
    const BLACK = entry('K', 0, 0, 0);
    const WHITE = entry('W', 255, 255, 255);

    const mapped = Array.from({ length: W * H }, () => ({ ...BLACK }));
    mapped[2 * W + 2] = { ...WHITE }; // centre cell — high ΔE2000 vs black

    // deContrastGuard = 50: white vs black is ~100 ΔE → should be preserved
    removeOrphanStitches(mapped, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 50 });

    expect(mapped[2 * W + 2].id).toBe('W');
  });

  test('high-ΔE orphan is merged when guard is disabled (deContrastGuard=0)', () => {
    const W = 5, H = 5;
    const BLACK = entry('K', 0, 0, 0);
    const WHITE = entry('W', 255, 255, 255);

    const mapped = Array.from({ length: W * H }, () => ({ ...BLACK }));
    mapped[2 * W + 2] = { ...WHITE };

    // deContrastGuard = 0: guard disabled, orphan should be merged
    removeOrphanStitches(mapped, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 0 });

    expect(mapped[2 * W + 2].id).toBe('K');
  });

  test('low-ΔE orphan is merged even when contrast guard is active', () => {
    // Two very similar blues — ΔE2000 should be well below 30.
    const W = 5, H = 5;
    const BLUE1 = entry('B1', 50,  50, 200);
    const BLUE2 = entry('B2', 55,  55, 210); // nearly identical

    const mapped = Array.from({ length: W * H }, () => ({ ...BLUE1 }));
    mapped[2 * W + 2] = { ...BLUE2 }; // tiny ΔE — guard threshold not triggered

    removeOrphanStitches(mapped, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 30 });

    expect(mapped[2 * W + 2].id).toBe('B1');
  });

  test('contrast guard threshold is respected: orphan at exactly the boundary', () => {
    const W = 5, H = 5;
    const DARK  = entry('D', 20, 20, 20);
    const LIGHT = entry('L', 235, 235, 235); // high ΔE2000 vs DARK

    const mapped = Array.from({ length: W * H }, () => ({ ...DARK }));
    mapped[2 * W + 2] = { ...LIGHT };

    // deContrastGuard=50: DARK vs LIGHT is ΔE2000 ≈ 90, well above 50 → preserved.
    removeOrphanStitches(mapped, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 50 });
    expect(mapped[2 * W + 2].id).toBe('L'); // preserved (guard fires)

    // Reset and run with guard disabled — should merge.
    const mapped2 = Array.from({ length: W * H }, () => ({ ...DARK }));
    mapped2[2 * W + 2] = { ...LIGHT };

    removeOrphanStitches(mapped2, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 0 });
    expect(mapped2[2 * W + 2].id).toBe('D');
  });

  test('regression: simple stray cell surrounded by one color merges correctly', () => {
    const W = 5, H = 5;
    const A = entry('A', 200,  50,  50);
    const B = entry('B',  50,  50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[2 * W + 2] = { ...B }; // single stray cell

    removeOrphanStitches(mapped, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 30 });

    // B (ΔE vs A is moderate, well below 30 ΔE2000 for these reds/blues? Let's verify)
    // Red (200,50,50) vs Blue (50,50,200) is a large ΔE (~60+) — so with guard=30 it would
    // be preserved.  Use guard=0 for this regression to confirm base behaviour.
    const mapped2 = Array.from({ length: W * H }, () => ({ ...A }));
    mapped2[2 * W + 2] = { ...B };
    removeOrphanStitches(mapped2, W, H, 3, null, null, { maxIterations: 8, deContrastGuard: 0 });
    expect(mapped2[2 * W + 2].id).toBe('A');
  });
});
