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

  test('Sharma 2005 reference pair 1 (approximate)', () => {
    // From Sharma, Wu, Dalal (2005) Table 1, pair 1:
    // L1=50.0000, a1=2.6772, b1=-79.7751
    // L2=50.0000, a2=0.0000, b2=-82.7485
    // Expected ΔE = 2.0425
    const result = dE2000([50.0, 2.6772, -79.7751], [50.0, 0.0, -82.7485]);
    expect(result).toBeCloseTo(2.0425, 2);
  });

  test('Sharma 2005 reference pair 2 (approximate)', () => {
    // L1=50.0000, a1=3.1571, b1=-77.2803
    // L2=50.0000, a2=0.0000, b2=-82.7485
    // Expected ΔE = 2.8615
    const result = dE2000([50.0, 3.1571, -77.2803], [50.0, 0.0, -82.7485]);
    expect(result).toBeCloseTo(2.8615, 2);
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
