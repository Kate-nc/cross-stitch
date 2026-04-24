// tests/colour-distance-properties.test.js
// Property-based tests for the CIEDE2000 colour distance function.

const fc = require('fast-check');
const { dE2000 } = require('../colour-utils.js');
const { fcLab } = require('./arbitraries');

describe('dE2000 — properties', () => {
  test('reflexivity: dE2000(lab, lab) ≈ 0', () => {
    fc.assert(
      fc.property(fcLab(), (lab) => {
        const d = dE2000(lab, lab);
        return Math.abs(d) < 1e-6;
      }),
      { numRuns: 200 }
    );
  });

  test('symmetry: dE2000(a, b) ≈ dE2000(b, a)', () => {
    fc.assert(
      fc.property(fcLab(), fcLab(), (a, b) => {
        const ab = dE2000(a, b);
        const ba = dE2000(b, a);
        return Math.abs(ab - ba) < 1e-6;
      }),
      { numRuns: 200 }
    );
  });

  test('non-negative: dE2000(a, b) >= 0', () => {
    fc.assert(
      fc.property(fcLab(), fcLab(), (a, b) => {
        const d = dE2000(a, b);
        return Number.isFinite(d) && d >= 0;
      }),
      { numRuns: 200 }
    );
  });
});
