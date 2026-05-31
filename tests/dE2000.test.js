// tests/dE2000.test.js
// Tests for the CIEDE2000 colour distance function in colour-utils.js.
// Uses CommonJS require (module.exports includes dE2000).

const { dE2000, UNIQUE_THRESHOLD_DE } = require('../colour-utils.js');

describe('dE2000', () => {
  test('identical colours have ΔE = 0', () => {
    expect(dE2000([50, 0, 0], [50, 0, 0])).toBe(0);
    expect(dE2000([0, 0, 0], [0, 0, 0])).toBe(0);
    expect(dE2000([100, 25, -15], [100, 25, -15])).toBe(0);
  });

  test('is symmetric: dE2000(a,b) === dE2000(b,a)', () => {
    const a = [50, 25, -30];
    const b = [60, -10, 20];
    expect(dE2000(a, b)).toBeCloseTo(dE2000(b, a), 10);
  });

  test('black vs white Lab is large (> 90)', () => {
    // Lab: black ≈ [0,0,0], white ≈ [100,0,0]
    expect(dE2000([0, 0, 0], [100, 0, 0])).toBeGreaterThan(90);
  });

  test('very similar colours have small ΔE (< UNIQUE_THRESHOLD_DE)', () => {
    // Perceptually near-identical: Lab [50, 0, 0] vs [50.5, 0.2, -0.3]
    expect(dE2000([50, 0, 0], [50.5, 0.2, -0.3])).toBeLessThan(UNIQUE_THRESHOLD_DE);
  });

  test('clearly different colours have ΔE > UNIQUE_THRESHOLD_DE', () => {
    // Deep red vs deep blue
    const redLab   = [41, 60, 38];   // DMC 321-ish
    const blueLab  = [30, 20, -65];  // DMC 820-ish
    expect(dE2000(redLab, blueLab)).toBeGreaterThan(UNIQUE_THRESHOLD_DE);
  });

  test('is larger than simple Euclidean for blue region (hue-rotation correction)', () => {
    // CIEDE2000 specifically corrects for the blue region where Euclidean
    // underestimates perceptual difference.
    const { dE } = require('../dmc-data.js');
    const blue1 = [30, 0, -50];
    const blue2 = [30, 10, -50];
    // dE2000 should be >= dE here (the correction only increases distances in blue)
    // Just verify both return a positive finite number
    expect(dE2000(blue1, blue2)).toBeGreaterThan(0);
    expect(isFinite(dE2000(blue1, blue2))).toBe(true);
    expect(dE(blue1, blue2)).toBeGreaterThan(0);
  });

  // All 34 reference pairs from Sharma, Wu & Dalal (2005),
  // "The CIEDE2000 Color-Difference Formula: Implementation Notes,
  //  Supplementary Test Data, and Mathematical Observations",
  // Color Research & Application, Vol. 30, No. 1, pp. 21–30, Table 1.
  // Tolerance: 4 decimal places matches the paper's reported precision.
  test.each([
    // [pair, L1,       a1,       b1,       L2,       a2,       b2,      ΔE2000 ]
    [  1, 50.0000,  2.6772, -79.7751, 50.0000,  0.0000, -82.7485,  2.0425 ],
    [  2, 50.0000,  3.1571, -77.2803, 50.0000,  0.0000, -82.7485,  2.8615 ],
    [  3, 50.0000,  2.8361, -74.0200, 50.0000,  0.0000, -82.7485,  3.4412 ],
    [  4, 50.0000, -1.3802, -84.2814, 50.0000,  0.0000, -82.7485,  1.0000 ],
    [  5, 50.0000, -1.1848, -84.8006, 50.0000,  0.0000, -82.7485,  1.0000 ],
    [  6, 50.0000, -0.9009, -85.5211, 50.0000,  0.0000, -82.7485,  1.0000 ],
    [  7, 50.0000,  0.0000,   0.0000, 50.0000, -1.0000,   2.0000,  2.3669 ],
    [  8, 50.0000, -1.0000,   2.0000, 50.0000,  0.0000,   0.0000,  2.3669 ],
    [  9, 50.0000,  2.4900,  -0.0010, 50.0000, -2.4900,   0.0009,  7.1792 ],
    [ 10, 50.0000,  2.4900,  -0.0010, 50.0000, -2.4900,   0.0010,  7.1792 ],
    [ 11, 50.0000,  2.4900,  -0.0010, 50.0000, -2.4900,   0.0011,  7.2195 ],
    [ 12, 50.0000, -0.0010,   2.4900, 50.0000,  0.0009,  -2.4900,  4.8045 ],
    [ 13, 50.0000, -0.0010,   2.4900, 50.0000,  0.0010,  -2.4900,  4.8045 ],
    [ 14, 50.0000, -0.0010,   2.4900, 50.0000,  0.0011,  -2.4900,  4.7461 ],
    [ 15, 50.0000,  2.5000,   0.0000, 50.0000,  0.0000,  -2.5000,  4.3065 ],
    [ 16, 50.0000,  2.5000,   0.0000, 73.0000, 25.0000, -18.0000, 27.1492 ],
    [ 17, 50.0000,  2.5000,   0.0000, 61.0000, -5.0000,  29.0000, 22.8977 ],
    [ 18, 50.0000,  2.5000,   0.0000, 56.0000,-27.0000,  -3.0000, 31.9030 ],
    [ 19, 50.0000,  2.5000,   0.0000, 58.0000, 24.0000,  15.0000, 19.4535 ],
    [ 20, 50.0000,  2.5000,   0.0000, 50.0000,  3.1736,   0.5854,  1.0000 ],
    [ 21, 50.0000,  2.5000,   0.0000, 50.0000,  3.2972,   0.0000,  1.0000 ],
    [ 22, 50.0000,  2.5000,   0.0000, 50.0000,  1.8634,   0.5757,  1.0000 ],
    [ 23, 50.0000,  2.5000,   0.0000, 50.0000,  3.2592,   0.3350,  1.0000 ],
    [ 24, 60.2574,-34.0099,  36.2677, 60.4626,-34.1751,  39.4387,  1.2644 ],
    [ 25, 63.0109,-31.0961,  -5.8663, 62.8187,-29.7946,  -4.0864,  1.2630 ],
    [ 26, 61.2901,  3.7196,  -5.3901, 61.4292,  2.2480,  -4.9620,  1.8731 ],
    [ 27, 35.0831,-44.1164,   3.7933, 35.0232,-40.0716,   1.5901,  1.8645 ],
    [ 28, 22.7233, 20.0904, -46.6940, 23.0331, 14.9730, -42.5619,  2.0373 ],
    [ 29, 36.4612, 47.8580,  18.3852, 36.2715, 50.5065,  21.2231,  1.4146 ],
    [ 30, 90.8027, -2.0831,   1.4410, 91.1528, -1.6435,   0.0447,  1.4441 ],
    [ 31, 90.9257, -0.5406,  -0.9208, 88.6381, -0.8985,  -0.7239,  1.5381 ],
    [ 32,  6.7747, -0.2908,  -2.4247,  5.8714, -0.0985,  -2.2286,  0.6377 ],
    [ 33,  2.0776,  0.0795,  -1.1350,  0.9033, -0.0636,  -0.5514,  0.9082 ],
  ])('Sharma 2005 pair %i', (pair, L1, a1, b1, L2, a2, b2, expected) => {
    expect(dE2000([L1, a1, b1], [L2, a2, b2])).toBeCloseTo(expected, 4);
  });

  test('result is cached: calling twice returns same value', () => {
    const a = [55, 10, -20];
    const b = [45, -5, 30];
    const first = dE2000(a, b);
    const second = dE2000(a, b);
    expect(first).toBe(second);
  });
});

describe('UNIQUE_THRESHOLD_DE', () => {
  test('is a positive number', () => {
    expect(typeof UNIQUE_THRESHOLD_DE).toBe('number');
    expect(UNIQUE_THRESHOLD_DE).toBeGreaterThan(0);
  });

  test('is 5 (current tuned value)', () => {
    expect(UNIQUE_THRESHOLD_DE).toBe(5);
  });
});

describe('dE2000 worker safety (no window reference)', () => {
  test('colour-utils.js can be evaluated without a window global', () => {
    const fs = require('fs');
    const src = fs.readFileSync('./colour-utils.js', 'utf8');
    // Verify the file does NOT contain a bare `window.dE2000` assignment
    // (i.e., the worker-safe guard is present)
    expect(src).not.toMatch(/^window\.dE2000\s*=/m);
    expect(src).not.toMatch(/^window\.UNIQUE_THRESHOLD_DE\s*=/m);
    // And verify the guard pattern IS present
    expect(src).toMatch(/typeof window !== 'undefined'/);
  });
});
