// tests/colour-matching-properties.test.js
// Property-based tests for findSolid (nearest-DMC matcher) in colour-utils.js.

const fc = require('fast-check');
const fs = require('fs');
const { rgbToLab, dE2 } = require('../dmc-data.js');

// findSolid in colour-utils.js references the bare global `dE2` (defined in
// dmc-data.js at runtime in the browser). Re-evaluate the function in this
// scope so it picks up the locally-imported dE2.
const _coSrc = fs.readFileSync('./colour-utils.js', 'utf8');
const _findSolidSrc = _coSrc.match(/function findSolid\s*\([^)]*\)\s*\{[^\n]*\}/);
if (!_findSolidSrc) throw new Error('Could not extract findSolid from colour-utils.js');
eval(_findSolidSrc[0]);

// Small fixed palette — enough variety to make matches non-trivial.
const PALETTE = [
  { id: '310',   rgb: [0, 0, 0]       },
  { id: 'blanc', rgb: [252, 251, 248] },
  { id: '666',   rgb: [227, 29, 66]   },
  { id: '699',   rgb: [5, 101, 23]    },
  { id: '798',   rgb: [70, 106, 188]  },
  { id: '725',   rgb: [255, 200, 64]  },
  { id: '947',   rgb: [255, 123, 77]  },
  { id: '550',   rgb: [92, 24, 78]    }
].map(t => ({ ...t, name: t.id, lab: rgbToLab(t.rgb[0], t.rgb[1], t.rgb[2]) }));

const PALETTE_IDS = new Set(PALETTE.map(t => t.id));

describe('findSolid — properties', () => {
  test('result.id is always one of the palette ids', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b) => {
          const lab = rgbToLab(r, g, b);
          const m = findSolid(lab, PALETTE);
          return m != null && PALETTE_IDS.has(m.id);
        }
      ),
      { numRuns: 200 }
    );
  });

  test('identity: an exact palette colour matches itself with dist ≈ 0', () => {
    for (const p of PALETTE) {
      const m = findSolid(p.lab, PALETTE);
      expect(m.id).toBe(p.id);
      expect(m.dist).toBeLessThan(1e-6);
    }
  });

  test('result is always defined for any RGB input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (r, g, b) => {
          const m = findSolid(rgbToLab(r, g, b), PALETTE);
          return m != null && typeof m.id === 'string' && Number.isFinite(m.dist);
        }
      ),
      { numRuns: 200 }
    );
  });
});
