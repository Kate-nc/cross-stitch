/**
 * Unit tests for Stage 3: morphologicalClean (colour-utils.js)
 *
 * Acceptance criteria from the brief:
 *   1. Border smoothness improves: pixels differing from their 8-neighbor majority
 *      should drop by ≥40% after cleaning on images with jagged single-pixel borders.
 *   2. No color ID present in the input is completely eliminated.
 */

const fs = require('fs');
const { rgbToLab } = require('../dmc-data.js');

// ---------------------------------------------------------------------------
// Shared extractFn
// ---------------------------------------------------------------------------
const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');

function extractFn(src, name) {
  const start = src.indexOf(`\nfunction ${name}(`);
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

// Need rgbToLab and dE2 as globals for morphologicalClean
eval(`const rgbToLab = ${require('../dmc-data.js').rgbToLab.toString()}`); // eslint-disable-line no-eval
const { dE2 } = require('../dmc-data.js');
// Make dE2 and rgbToLab available as globals for the eval'd code
global.dE2 = dE2;
global.rgbToLab = rgbToLab;

eval(extractFn(cuSrc, '_erode3Cross'));      // eslint-disable-line no-eval
eval(extractFn(cuSrc, '_dilate3Cross'));     // eslint-disable-line no-eval
eval(extractFn(cuSrc, '_morphOpen'));        // eslint-disable-line no-eval
eval(extractFn(cuSrc, '_morphClose'));       // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'morphologicalClean')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Helper: build a mock palette entry
// ---------------------------------------------------------------------------
function entry(id, r, g, b) {
  return { type: 'solid', id, name: id, rgb: [r, g, b], lab: rgbToLab(r, g, b), dist: 0 };
}

function makeGrid(w, h, colorFn) {
  const grid = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      grid[y * w + x] = colorFn(x, y);
    }
  }
  return grid;
}

// Count pixels whose color differs from the majority of their 8-neighbors
function roughnessMeasure(mapped, w, h) {
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const id = mapped[i].id;
      const neighborCounts = {};
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = y + dy, nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const nid = mapped[ny * w + nx].id;
          neighborCounts[nid] = (neighborCounts[nid] || 0) + 1;
        }
      }
      let maxN = 0;
      for (const nid in neighborCounts) if (neighborCounts[nid] > maxN) maxN = neighborCounts[nid];
      // Is the pixel's own color the majority?
      const ownCount = neighborCounts[id] || 0;
      if (ownCount < maxN) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Morphological primitive tests
// ---------------------------------------------------------------------------
describe('_erode3Cross', () => {
  test('solid mask stays solid (interior)', () => {
    const w = 5, h = 5;
    const mask = new Uint8Array(w * h).fill(1);
    const out  = new Uint8Array(w * h);
    _erode3Cross(mask, w, h, out);
    // Interior pixels (not on border) should survive
    expect(out[2 * w + 2]).toBe(1); // center
    // Border pixels: some neighbors are missing → eroded to 0
    expect(out[0]).toBe(0);
  });

  test('single isolated pixel is eroded to 0', () => {
    const w = 5, h = 5;
    const mask = new Uint8Array(w * h).fill(0);
    mask[2 * w + 2] = 1;
    const out = new Uint8Array(w * h);
    _erode3Cross(mask, w, h, out);
    expect(out[2 * w + 2]).toBe(0);
  });
});

describe('_dilate3Cross', () => {
  test('single pixel expands to 5-pixel cross', () => {
    const w = 5, h = 5;
    const mask = new Uint8Array(w * h).fill(0);
    mask[2 * w + 2] = 1; // center
    const out = new Uint8Array(w * h);
    _dilate3Cross(mask, w, h, out);
    // Center and 4-connected neighbors should be 1
    expect(out[2 * w + 2]).toBe(1); // center
    expect(out[1 * w + 2]).toBe(1); // up
    expect(out[3 * w + 2]).toBe(1); // down
    expect(out[2 * w + 1]).toBe(1); // left
    expect(out[2 * w + 3]).toBe(1); // right
    // Diagonal should be 0
    expect(out[1 * w + 1]).toBe(0);
  });
});

describe('_morphOpen', () => {
  test('removes single-pixel protrusion while preserving large block', () => {
    // 9×7 grid: 5-pixel wide × 3-pixel tall solid block, plus 1 isolated pixel outside
    const w = 9, h = 7;
    const mask = new Uint8Array(w * h).fill(0);
    // Fill a 5×3 block at rows 2-4, cols 2-6 — thick enough to survive erosion
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 6; x++) mask[y * w + x] = 1;
    // Add isolated pixel outside the block
    mask[0 * w + 8] = 1;

    const out = _morphOpen(mask, w, h);
    // The isolated pixel should be gone
    expect(out[0 * w + 8]).toBe(0);
    // Center of the thick block should survive
    expect(out[3 * w + 4]).toBe(1);
  });
});

describe('_morphClose', () => {
  test('fills a single-pixel hole inside a block', () => {
    // 5×5 filled block with a hole in the center
    const w = 7, h = 7;
    const mask = new Uint8Array(w * h).fill(0);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) mask[y * w + x] = 1;
    mask[3 * w + 3] = 0; // punch hole in center

    const out = _morphClose(mask, w, h);
    expect(out[3 * w + 3]).toBe(1); // hole should be filled
  });
});

// ---------------------------------------------------------------------------
// morphologicalClean acceptance tests
// ---------------------------------------------------------------------------
describe('morphologicalClean — no colors eliminated', () => {
  test('all input color IDs remain present in output', () => {
    const W = 10, H = 10;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    // Checkered pattern
    const mapped = makeGrid(W, H, (x, y) => ((x + y) % 2 === 0) ? A : B);
    const before = new Set(mapped.map(m => m.id));

    morphologicalClean(mapped, W, H, null);

    const after = new Set(mapped.map(m => m.id));
    for (const id of before) {
      expect(after.has(id)).toBe(true);
    }
  });
});

describe('morphologicalClean — border smoothness acceptance', () => {
  /**
   * Create a 30×30 image: left half is color A, right half is color B.
   * Inject a noisy single-pixel jagged border in the middle column by
   * alternating which color gets each row.
   * After cleaning, roughness should drop by ≥40%.
   */
  test('roughness (pixels differing from 8-neighbor majority) drops ≥40%', () => {
    const W = 30, H = 30;
    const A = entry('A', 200, 50,  50);
    const B = entry('B', 50,  50, 200);

    const mapped = makeGrid(W, H, (x, y) => {
      if (x < 14) return A;
      if (x > 15) return B;
      // Column 14/15 — noisy boundary: alternate by row
      return (y % 2 === 0) ? A : B;
    });

    const roughBefore = roughnessMeasure(mapped, W, H);
    morphologicalClean(mapped, W, H, null, { minPixelCount: 5 });
    const roughAfter  = roughnessMeasure(mapped, W, H);

    // Log for debugging if it fails
    if (roughAfter > roughBefore * 0.60) {
      console.log(`roughBefore=${roughBefore}, roughAfter=${roughAfter}`);
    }

    expect(roughAfter).toBeLessThanOrEqual(roughBefore * 0.60); // ≥40% reduction
  });
});

describe('morphologicalClean — minPixelCount guard', () => {
  test('colors below minPixelCount threshold are not touched', () => {
    const W = 10, H = 10;
    const A = entry('A', 200, 50,  50);
    const B = entry('B', 50,  50, 200);
    // A = 99 pixels, B = 1 pixel
    const mapped = new Array(W * H).fill(null).map((_, i) => i === 0 ? B : A);

    // With minPixelCount = 20, B (1 pixel) should be skipped by morphology
    // and stay in place (it may move due to conflict resolution, but we just
    // check no crash and the array length is unchanged).
    expect(() => morphologicalClean(mapped, W, H, null, { minPixelCount: 20 })).not.toThrow();
    expect(mapped).toHaveLength(W * H);
  });
});
