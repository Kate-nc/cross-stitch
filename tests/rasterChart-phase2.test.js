/* tests/rasterChart-phase2.test.js
 * Unit tests for Phase 2 additions:
 *   - cvPipeline.extractCellColors
 *   - dbscan.zScoreNormalize
 *   - dbscan.applyColumnWeight
 *   - dbscan.cluster  with opts.normalise
 */

// ── cvPipeline: extractCellColors ─────────────────────────────────────────
// The module uses `self` (worker global) to export, and depends on
// RasterChartProjection being present.  We stub the minimal surface
// needed and extract via module.exports path.
describe('cvPipeline.extractCellColors', () => {
  let extractCellColors;

  beforeAll(() => {
    // Stub dependency: RasterChartProjection.gridFromProfiles is not needed
    // for extractCellColors, but the IIFE references it during initialisation.
    global.RasterChartProjection = {
      gridFromProfiles: () => ({ cellPitch: 10, originRow: 0, originCol: 0, rows: 0, cols: 0 }),
    };
    // cv is also referenced but only inside function bodies that we won't call.
    global.cv = {};
    const mod = require('../creator/rasterChart/cvPipeline.js');
    extractCellColors = mod.extractCellColors;
  });

  test('exported from module', () => {
    expect(typeof extractCellColors).toBe('function');
  });

  test('returns Uint8Array of correct size', () => {
    const rows = 3, cols = 4, cellPitch = 10;
    // Solid red image 40×30
    const w = cols * cellPitch, h = rows * cellPitch;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 200;   // R
      rgba[i * 4 + 1] = 100; // G
      rgba[i * 4 + 2] = 50;  // B
      rgba[i * 4 + 3] = 255;
    }
    const grid = { cellPitch, originRow: 0, originCol: 0, rows, cols };
    const res = extractCellColors(rgba, w, h, grid);
    expect(res.rows).toBe(rows);
    expect(res.cols).toBe(cols);
    expect(res.cellColors).toBeInstanceOf(Uint8Array);
    expect(res.cellColors.length).toBe(rows * cols * 3);
  });

  test('captures average colour of uniform region correctly', () => {
    const rows = 2, cols = 2, cellPitch = 8;
    const w = cols * cellPitch, h = rows * cellPitch;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // All pixels are R=255, G=0, B=128
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 128;
      rgba[i * 4 + 3] = 255;
    }
    const grid = { cellPitch, originRow: 0, originCol: 0, rows, cols };
    const { cellColors } = extractCellColors(rgba, w, h, grid);
    // Every cell should have approximately R=255, G=0, B=128 (after inward padding)
    for (let i = 0; i < rows * cols; i++) {
      expect(cellColors[i * 3]).toBe(255);
      expect(cellColors[i * 3 + 1]).toBe(0);
      expect(cellColors[i * 3 + 2]).toBe(128);
    }
  });

  test('handles grid that goes to image edge without throwing', () => {
    const rows = 1, cols = 1, cellPitch = 16, w = 16, h = 16;
    const rgba = new Uint8ClampedArray(w * h * 4).fill(200);
    const grid = { cellPitch, originRow: 0, originCol: 0, rows, cols };
    expect(() => extractCellColors(rgba, w, h, grid)).not.toThrow();
  });
});

// ── dbscan: zScoreNormalize ───────────────────────────────────────────────
describe('dbscan.zScoreNormalize', () => {
  let zScoreNormalize;

  beforeAll(() => {
    ({ zScoreNormalize } = require('../creator/rasterChart/dbscan.js'));
  });

  test('exported from module', () => {
    expect(typeof zScoreNormalize).toBe('function');
  });

  test('no-op on single-point feature set', () => {
    const f = [new Float32Array([1, 2, 3])];
    zScoreNormalize(f); // should not throw, and should leave values unchanged
    // With n < 2, the function returns early — original values preserved.
    expect(f[0][0]).toBe(1);
    expect(f[0][1]).toBe(2);
    expect(f[0][2]).toBe(3);
  });

  test('produces zero mean and unit variance for well-spread data', () => {
    const vals = [1, 2, 3, 4, 5];
    const features = vals.map(v => new Float32Array([v]));
    zScoreNormalize(features);
    const mean = features.reduce((s, f) => s + f[0], 0) / features.length;
    const variance = features.reduce((s, f) => s + (f[0] - mean) ** 2, 0) / features.length;
    expect(mean).toBeCloseTo(0, 5);
    expect(variance).toBeCloseTo(1, 5);
  });

  test('mutates in place', () => {
    const a = new Float32Array([10, 20]);
    const b = new Float32Array([20, 30]);
    const features = [a, b];
    zScoreNormalize(features);
    expect(features[0]).toBe(a); // same reference
  });

  test('handles constant dimension without NaN', () => {
    const features = [
      new Float32Array([5, 1]),
      new Float32Array([5, 3]),
      new Float32Array([5, 5]),
    ];
    zScoreNormalize(features);
    for (const f of features) {
      expect(isNaN(f[0])).toBe(false); // constant dim → guarded to std=1 → (5-5)/1 = 0
      expect(f[0]).toBeCloseTo(0, 5);
    }
  });
});

// ── dbscan: applyColumnWeight ─────────────────────────────────────────────
describe('dbscan.applyColumnWeight', () => {
  let applyColumnWeight;

  beforeAll(() => {
    ({ applyColumnWeight } = require('../creator/rasterChart/dbscan.js'));
  });

  test('exported from module', () => {
    expect(typeof applyColumnWeight).toBe('function');
  });

  test('multiplies specified columns by weight', () => {
    const features = [new Float32Array([1, 2, 3, 4])];
    applyColumnWeight(features, 1, 2, 0.5); // columns 1 and 2
    expect(features[0][0]).toBe(1);
    expect(features[0][1]).toBe(1); // 2 × 0.5
    expect(features[0][2]).toBe(1.5); // 3 × 0.5
    expect(features[0][3]).toBe(4); // untouched
  });

  test('defaults weight to 0.6 when not provided', () => {
    const features = [new Float32Array([10])];
    applyColumnWeight(features, 0, 1);
    expect(features[0][0]).toBeCloseTo(6, 5);
  });

  test('does not exceed array bounds', () => {
    const features = [new Float32Array([1, 2, 3])];
    // startIdx=2, count=5 should only touch column 2
    applyColumnWeight(features, 2, 5, 2.0);
    expect(features[0][0]).toBe(1);
    expect(features[0][1]).toBe(2);
    expect(features[0][2]).toBe(6);
  });
});

// ── dbscan: cluster with opts.normalise ───────────────────────────────────
describe('dbscan.cluster with opts.normalise', () => {
  let cluster;

  beforeAll(() => {
    ({ cluster } = require('../creator/rasterChart/dbscan.js'));
  });

  test('does not mutate caller feature arrays when normalise=true', () => {
    const original = [
      new Float32Array([0, 0, 10]),
      new Float32Array([0, 0, 20]),
      new Float32Array([100, 100, 100]),
      new Float32Array([100, 100, 110]),
      new Float32Array([100, 100, 120]),
    ];
    const snapshots = original.map(f => Float32Array.from(f));
    cluster(original, { normalise: true, labStartIdx: 0, labDims: 3, labWeight: 0.6 });
    for (let i = 0; i < original.length; i++) {
      for (let d = 0; d < 3; d++) {
        expect(original[i][d]).toBe(snapshots[i][d]);
      }
    }
  });

  test('returns expected shape', () => {
    const features = Array.from({ length: 10 }, (_, i) =>
      new Float32Array([i < 5 ? 0 : 100, 0, 0]));
    const res = cluster(features, { normalise: true, labStartIdx: 0, labDims: 3, labWeight: 0.6 });
    expect(res).toHaveProperty('assignments');
    expect(res).toHaveProperty('medoids');
    expect(res).toHaveProperty('eps');
    expect(res.assignments.length).toBe(10);
  });
});
