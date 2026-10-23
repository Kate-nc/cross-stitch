// tests/skein-calculation-properties.test.js
// Property-based tests for stitchesToSkeins in threadCalc.js.

const fc = require('fast-check');
const { stitchesToSkeins } = require('../threadCalc.js');
const { fcStitchCount, fcFabricCt, fcStrandCount } = require('./arbitraries');

describe('stitchesToSkeins — properties', () => {
  test('raw demand is non-negative and buying uses raw demand', () => {
    fc.assert(
      fc.property(fcStitchCount(), fcFabricCt(), fcStrandCount(), (stitchCount, fabricCount, strandsUsed) => {
        const r = stitchesToSkeins({ stitchCount, fabricCount, strandsUsed });
        return r.skeinsRaw >= 0 && r.skeinsToBuy === Math.ceil(r.skeinsRaw - 1e-12);
      }),
      { numRuns: 200 }
    );
  });

  test('monotonic in stitchCount: more stitches → equal-or-more skeinsExact', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 500_000 }),
        fc.integer({ min: 1, max: 500_000 }),
        fcFabricCt(),
        fcStrandCount(),
        (a, delta, fabricCount, strandsUsed) => {
          const r1 = stitchesToSkeins({ stitchCount: a, fabricCount, strandsUsed });
          const r2 = stitchesToSkeins({ stitchCount: a + delta, fabricCount, strandsUsed });
          return r2.skeinsExact >= r1.skeinsExact;
        }
      ),
      { numRuns: 200 }
    );
  });

  test('linearity: doubling stitches roughly doubles skeinsExact (within 5%)', () => {
    fc.assert(
      fc.property(
        // Use a high lower bound so the epsilon clamp (skeinsRaw < 0.01 → 0)
        // and 2dp rounding do not dominate the comparison.
        fc.integer({ min: 5_000, max: 250_000 }),
        fcFabricCt(),
        fcStrandCount(),
        (stitchCount, fabricCount, strandsUsed) => {
          const r1 = stitchesToSkeins({ stitchCount, fabricCount, strandsUsed });
          const r2 = stitchesToSkeins({ stitchCount: stitchCount * 2, fabricCount, strandsUsed });
          if (r1.skeinsExact <= 0) return true; // skip degenerate clamp cases
          const ratio = r2.skeinsExact / r1.skeinsExact;
          return ratio >= 1.95 && ratio <= 2.05;
        }
      ),
      { numRuns: 200 }
    );
  });
});
