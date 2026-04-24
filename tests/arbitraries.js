// tests/arbitraries.js
// Shared fast-check arbitraries for property-based tests.
// CommonJS so tests can `require('./arbitraries')`.

const fc = require('fast-check');

// ──────────────────────────────────────────────────────────────────────────
// Colour-space arbitraries
// ──────────────────────────────────────────────────────────────────────────

// 8-bit RGB triple: [r,g,b] each in 0..255.
function fcRgb() {
  return fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  );
}

// CIE Lab triple: [L,a,b]. L in 0..100, a/b in -128..127.
// Use floats with no NaN/Infinity so downstream colour maths stays defined.
function fcLab() {
  return fc.tuple(
    fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -128, max: 127, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -128, max: 127, noNaN: true, noDefaultInfinity: true })
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Thread / pattern arbitraries
// ──────────────────────────────────────────────────────────────────────────

// Small fixed list of known DMC ids covering numeric and named cases.
const _DMC_IDS = [
  '310', '550', '666', '699', '725', '798', '906', '947',
  '3865', '3866', '3705', '3801', '3823', '5200', 'blanc', 'ecru',
  'B5200', '224', '433', '740'
];

function fcDmcId() {
  return fc.constantFrom(..._DMC_IDS);
}

// Canonical blend id: two DMC ids joined by '+', lexicographically sorted
// so the same pair always produces the same id.
function fcBlendId() {
  return fc.tuple(fcDmcId(), fcDmcId())
    .filter(([a, b]) => a !== b)
    .map(([a, b]) => {
      const sorted = [a, b].slice().sort();
      return sorted[0] + '+' + sorted[1];
    });
}

// ──────────────────────────────────────────────────────────────────────────
// Stitch / fabric arbitraries
// ──────────────────────────────────────────────────────────────────────────

function fcStitchCount() {
  return fc.integer({ min: 1, max: 1_000_000 });
}

function fcFabricCt() {
  return fc.constantFrom(11, 14, 16, 18, 22, 25, 28, 32);
}

function fcStrandCount() {
  return fc.integer({ min: 1, max: 6 });
}

module.exports = {
  fcRgb,
  fcLab,
  fcDmcId,
  fcBlendId,
  fcStitchCount,
  fcFabricCt,
  fcStrandCount,
  _DMC_IDS
};
