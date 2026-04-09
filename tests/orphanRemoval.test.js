/**
 * Unit tests for Stage 5: removeOrphanStitches (colour-utils.js)
 *
 * Acceptance criteria from the brief:
 *   1. Edge protection: clusters overlapping the edge map survive unchanged.
 *   2. Perceptual selection: orphan replaced by perceptually closest neighbor,
 *      not merely most-frequent (verifiable with synthetic test case).
 *   3. Saliency scaling: effective orphan size threshold is larger in low-saliency
 *      regions than in high-saliency regions.
 *   4. Backward compatibility: calling with only (mapped, w, h, maxOrphanSize)
 *      still removes orphans correctly.
 */

const fs = require('fs');
const { rgbToLab, dE2 } = require('../dmc-data.js');

// Make globals available for eval'd code
global.dE2 = dE2;
global.rgbToLab = rgbToLab;

// ---------------------------------------------------------------------------
// Shared extractFn
// ---------------------------------------------------------------------------
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

eval(extractFn(cuSrc, 'removeOrphanStitches')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Palette entry factory
// ---------------------------------------------------------------------------
function entry(id, r, g, b) {
  return { type: 'solid', id, name: id, rgb: [r, g, b], lab: rgbToLab(r, g, b), dist: 0 };
}

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------
describe('removeOrphanStitches — backward compatible (4-arg call)', () => {
  test('removes a single isolated pixel surrounded by one color', () => {
    const W = 5, H = 5;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    // Fill everything with A, place one B in the center
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[2 * W + 2] = { ...B };

    removeOrphanStitches(mapped, W, H, 3);

    // The lone B should have been replaced by A
    expect(mapped[2 * W + 2].id).toBe('A');
  });

  test('large connected region is not touched', () => {
    const W = 6, H = 6;
    const A = entry('A', 200, 50, 50);
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    removeOrphanStitches(mapped, W, H, 3);
    expect(mapped.every(m => m.id === 'A')).toBe(true);
  });

  test('maxOrphanSize=0 is a no-op', () => {
    const W = 4, H = 4;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[0] = { ...B }; // isolated B
    removeOrphanStitches(mapped, W, H, 0);
    expect(mapped[0].id).toBe('B'); // unchanged
  });
});

// ---------------------------------------------------------------------------
// Acceptance 1: Edge protection
// ---------------------------------------------------------------------------
describe('removeOrphanStitches — edge protection', () => {
  test('cluster overlapping edgeMap is not removed', () => {
    const W = 7, H = 7;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    // Fill with A, place 2-pixel B cluster at (3,3)-(3,4) — size ≤ maxOrphanSize=3
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[3 * W + 3] = { ...B };
    mapped[3 * W + 4] = { ...B };

    // Edge map marks the first B pixel
    const edgeMap = new Uint8Array(W * H);
    edgeMap[3 * W + 3] = 1;

    removeOrphanStitches(mapped, W, H, 3, edgeMap);

    // Both B pixels should survive because the cluster overlaps an edge
    expect(mapped[3 * W + 3].id).toBe('B');
    expect(mapped[3 * W + 4].id).toBe('B');
  });

  test('cluster NOT on edge is still removed normally', () => {
    const W = 7, H = 7;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[3 * W + 3] = { ...B };

    const edgeMap = new Uint8Array(W * H); // all zero — no edges

    removeOrphanStitches(mapped, W, H, 3, edgeMap);

    expect(mapped[3 * W + 3].id).toBe('A'); // replaced
  });
});

// ---------------------------------------------------------------------------
// Acceptance 2: Perceptual replacement selection
// ---------------------------------------------------------------------------
describe('removeOrphanStitches — perceptual replacement', () => {
  /**
   * Synthetic test from the brief:
   *   A 5×5 region where the orphan pixel (color A, in the center of a 3×3 grid)
   *   is surrounded by:
   *     - 5 pixels of color B (frequent, but perceptually distant, ΔE > 15)
   *     - 3 pixels of color C (less frequent, but perceptually close, ΔE < 3)
   *   Verify orphan is replaced with C, not B.
   */
  test('chooses perceptually closer neighbor over more-frequent one', () => {
    const W = 7, H = 7;

    // A: neutral grey 128,128,128 (the orphan)
    const A = entry('A', 128, 128, 128);
    // B: vivid red — far from grey
    const B = entry('B', 220, 30, 30);
    // C: near-grey — close to A
    const C = entry('C', 132, 132, 132);

    // Verify ΔE distances are as expected
    const deAB = Math.sqrt(dE2(A.lab, B.lab));
    const deAC = Math.sqrt(dE2(A.lab, C.lab));
    expect(deAB).toBeGreaterThan(15);
    expect(deAC).toBeLessThan(3);

    // Build a 7×7 grid: fill with background color (not A/B/C), place orphan + neighbors
    const BG = entry('BG', 50, 150, 50); // green background
    const mapped = Array.from({ length: W * H }, () => ({ ...BG }));

    // Orphan A at center (3,3)
    const cx = 3, cy = 3;
    mapped[cy * W + cx] = { ...A };

    // 5 B neighbors (top, top-left, top-right, left, bottom)
    const bPositions = [
      [cy - 1, cx], [cy - 1, cx - 1], [cy - 1, cx + 1], [cy, cx - 1], [cy + 1, cx],
    ];
    for (const [r, c] of bPositions) mapped[r * W + c] = { ...B };

    // 3 C neighbors (right, bottom-left, bottom-right)
    const cPositions = [
      [cy, cx + 1], [cy + 1, cx - 1], [cy + 1, cx + 1],
    ];
    for (const [r, c] of cPositions) mapped[r * W + c] = { ...C };

    removeOrphanStitches(mapped, W, H, 3);

    // Orphan should be replaced with C (perceptually closer), not B (more frequent)
    expect(mapped[cy * W + cx].id).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// Acceptance 3: Saliency-scaled effective threshold
// ---------------------------------------------------------------------------
describe('removeOrphanStitches — saliency scaling', () => {
  /**
   * Create two 3-pixel clusters of the same size (3 px):
   *   - Cluster in a "flat background" region: saliency ≈ 0  → effectiveMaxSize = 9
   *   - Cluster in a "foreground" region: saliency ≈ 1 → effectiveMaxSize = 3
   *
   * Set maxOrphanSize = 3, test with a 4-pixel cluster in each region.
   * A 4-px cluster should be removed in the background zone but kept in the high-saliency zone.
   */
  test('4-pixel orphan removed in background (low saliency) but kept in foreground (high saliency)', () => {
    const W = 20, H = 5;
    const A = entry('A', 200, 50, 50);  // dominant color
    const B = entry('B', 50, 50, 200);  // orphan color

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));

    // 4-pixel cluster on the left (background zone): cols 1-4, row 2
    const bgIndices = [2 * W + 1, 2 * W + 2, 2 * W + 3, 2 * W + 4];
    for (const i of bgIndices) mapped[i] = { ...B };

    // 4-pixel cluster on the right (foreground zone): cols 15-18, row 2
    const fgIndices = [2 * W + 15, 2 * W + 16, 2 * W + 17, 2 * W + 18];
    for (const i of fgIndices) mapped[i] = { ...B };

    // Saliency map: left half ≈ 0 (flat), right half ≈ 1 (detailed)
    const saliencyMap = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      saliencyMap[i] = (i % W) >= 10 ? 1.0 : 0.0;
    }

    // maxOrphanSize=3, saliencyMultiplier=2.0
    // effectiveMaxSize for bg cluster (meanSaliency=0): 3 * (1 + (1-0)*2) = 9  → 4-px qualifies
    // effectiveMaxSize for fg cluster (meanSaliency=1): 3 * (1 + (1-1)*2) = 3  → 4-px does NOT qualify
    removeOrphanStitches(mapped, W, H, 3, null, saliencyMap, { saliencyMultiplier: 2.0 });

    // Background cluster should be removed
    for (const i of bgIndices) {
      expect(mapped[i].id).toBe('A');
    }

    // Foreground cluster should be preserved
    for (const i of fgIndices) {
      expect(mapped[i].id).toBe('B');
    }
  });

  test('without saliency map, behavior matches plain maxOrphanSize cutoff', () => {
    const W = 10, H = 5;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    // 3-pixel cluster — exactly at maxOrphanSize=3, should be removed
    mapped[2 * W + 4] = { ...B };
    mapped[2 * W + 5] = { ...B };
    mapped[2 * W + 6] = { ...B };

    removeOrphanStitches(mapped, W, H, 3, null, null);

    expect(mapped[2 * W + 4].id).toBe('A');
    expect(mapped[2 * W + 5].id).toBe('A');
    expect(mapped[2 * W + 6].id).toBe('A');
  });
});
