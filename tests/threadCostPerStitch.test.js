// tests/threadCostPerStitch.test.js
// Unit tests for the pure helper added by commit 7e34511 (live stash deduction).
// Closes part of DEFECT-015 (test gap on the live-stash math).
const { threadCostPerStitch } = require('../threadCalc.js');

describe('threadCostPerStitch — defaults', () => {
  // baseCostIn = (4.8 * 2) / 14 = 0.685714…
  // tailWaste  = (1.5 * 2) / 30 = 0.10
  // genWaste   = 1.10
  // total      = (0.685714 + 0.10) * 1.10 = 0.864286 in/stitch
  test('14ct, 2 strands, all defaults → ~0.864 in/stitch', () => {
    const v = threadCostPerStitch(14, 2, {});
    expect(v).toBeCloseTo(0.8643, 3);
  });

  test('null wastePrefs treated like {}', () => {
    const a = threadCostPerStitch(14, 2, null);
    const b = threadCostPerStitch(14, 2, {});
    expect(a).toBeCloseTo(b, 6);
  });

  test('higher fabric count lowers per-stitch cost', () => {
    const c14 = threadCostPerStitch(14, 2, {});
    const c18 = threadCostPerStitch(18, 2, {});
    const c28 = threadCostPerStitch(28, 2, {});
    expect(c18).toBeLessThan(c14);
    expect(c28).toBeLessThan(c18);
  });

  test('more strands raises per-stitch cost roughly linearly in base term', () => {
    const c2 = threadCostPerStitch(14, 2, {});
    const c3 = threadCostPerStitch(14, 3, {});
    expect(c3).toBeGreaterThan(c2);
    // Tail term doesn't scale with strands so the ratio is < 1.5
    expect(c3 / c2).toBeLessThan(1.5);
    expect(c3 / c2).toBeGreaterThan(1.2);
  });
});

describe('threadCostPerStitch — wastePrefs overrides', () => {
  test('strandCountOverride takes precedence over strandCount param', () => {
    const fromParam   = threadCostPerStitch(14, 1, {});
    const fromOverride = threadCostPerStitch(14, 2, { strandCountOverride: 1 });
    expect(fromOverride).toBeCloseTo(fromParam, 6);
  });

  test('larger tailAllowance increases cost', () => {
    const c1 = threadCostPerStitch(14, 2, { tailAllowanceIn: 1.0 });
    const c2 = threadCostPerStitch(14, 2, { tailAllowanceIn: 3.0 });
    expect(c2).toBeGreaterThan(c1);
  });

  test('shorter run length amortises tails over fewer stitches → higher cost', () => {
    const long  = threadCostPerStitch(14, 2, { threadRunLength: 60 });
    const short = threadCostPerStitch(14, 2, { threadRunLength: 10 });
    expect(short).toBeGreaterThan(long);
  });

  test('generalWasteMultiplier scales the result linearly', () => {
    const w110 = threadCostPerStitch(14, 2, { generalWasteMultiplier: 1.10 });
    const w130 = threadCostPerStitch(14, 2, { generalWasteMultiplier: 1.30 });
    // Ratio should equal the multiplier ratio because gen-waste applies to both terms.
    expect(w130 / w110).toBeCloseTo(1.30 / 1.10, 6);
  });

  test('runLength <= 0 falls back to default 30', () => {
    const fallback = threadCostPerStitch(14, 2, { threadRunLength: 0 });
    const explicit = threadCostPerStitch(14, 2, { threadRunLength: 30 });
    expect(fallback).toBeCloseTo(explicit, 6);
  });
});

describe('threadCostPerStitch — input validation', () => {
  test('non-positive fabricCount falls back to 14ct', () => {
    const fallback = threadCostPerStitch(0, 2, {});
    const explicit = threadCostPerStitch(14, 2, {});
    expect(fallback).toBeCloseTo(explicit, 6);
  });

  test('non-positive strandCount falls back to 2', () => {
    const fallback = threadCostPerStitch(14, 0, {});
    const explicit = threadCostPerStitch(14, 2, {});
    expect(fallback).toBeCloseTo(explicit, 6);
  });

  test('result is always a positive finite number for sensible inputs', () => {
    for (let fc = 11; fc <= 32; fc += 3) {
      for (let s = 1; s <= 4; s++) {
        const v = threadCostPerStitch(fc, s, {});
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThan(0);
      }
    }
  });
});
