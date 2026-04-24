// tests/rgb-to-lab-properties.test.js
// Property-based tests for the rgbToLab conversion in dmc-data.js.

const fc = require('fast-check');
const { rgbToLab } = require('../dmc-data.js');
const { fcRgb } = require('./arbitraries');

describe('rgbToLab — properties', () => {
  test('L is always in [0, 100]', () => {
    fc.assert(
      fc.property(fcRgb(), ([r, g, b]) => {
        const [L] = rgbToLab(r, g, b);
        return L >= 0 && L <= 100;
      }),
      { numRuns: 200 }
    );
  });

  test('monochrome input (r===g===b) has a ≈ 0 and b ≈ 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), (v) => {
        const [, a, bb] = rgbToLab(v, v, v);
        return Math.abs(a) < 1e-3 && Math.abs(bb) < 1e-3;
      }),
      { numRuns: 200 }
    );
  });

  test('output is finite (no NaN, no Infinity)', () => {
    fc.assert(
      fc.property(fcRgb(), ([r, g, b]) => {
        const lab = rgbToLab(r, g, b);
        return lab.length === 3 && lab.every(Number.isFinite);
      }),
      { numRuns: 200 }
    );
  });
});
