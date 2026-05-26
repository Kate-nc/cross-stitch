'use strict';
// tests/size-calculator.test.js
// Phase 4: validation tests for pattern-size-calc.js and the corrected
// threadCalc.js thread-estimation model.

const path = require('path');
const fs   = require('fs');

// ── Load pattern-size-calc.js into this scope ────────────────────────────────
const sizeCalcSrc = fs.readFileSync(
  path.join(__dirname, '..', 'pattern-size-calc.js'),
  'utf8'
);
// eslint-disable-next-line no-new-func
const sizeCalcExports = (new Function(
  'module', 'exports', 'require', 'window',
  sizeCalcSrc + '\n return module.exports;'
))(
  { exports: {} },
  {},
  () => {},
  {}
);
const {
  CM_PER_INCH,
  DEFAULT_MARGIN_PER_SIDE_IN,
  STITCH_OVER_AIDA,
  STITCH_OVER_EVENWEAVE,
  calcEffectiveSPI,
  calcDesignSizeIn,
  calcCutSizeIn,
  toDisplayDimensions
} = sizeCalcExports;

// ── Load threadCalc.js ────────────────────────────────────────────────────────
const {
  stitchesToSkeins,
  skeinsToStitches,
  BASE_THREAD_PER_STITCH_IN,
  INCHES_PER_METRE,
  FLOSS_STRANDS_PER_SKEIN
} = require('../threadCalc.js');

// ════════════════════════════════════════════════════════════════════
// 1. calcEffectiveSPI
// ════════════════════════════════════════════════════════════════════
describe('calcEffectiveSPI', () => {
  test('14-ct Aida (over 1): SPI = 14', () => {
    expect(calcEffectiveSPI(14, 1)).toBeCloseTo(14, 6);
  });

  test('28-ct linen over 2: SPI = 14  (matches 14-ct Aida)', () => {
    expect(calcEffectiveSPI(28, 2)).toBeCloseTo(14, 6);
  });

  test('25-ct evenweave over 2: SPI = 12.5', () => {
    expect(calcEffectiveSPI(25, 2)).toBeCloseTo(12.5, 6);
  });

  test('32-ct linen over 2: SPI = 16', () => {
    expect(calcEffectiveSPI(32, 2)).toBeCloseTo(16, 6);
  });

  test('stitchOver defaults to 1 when not 2', () => {
    expect(calcEffectiveSPI(18)).toBeCloseTo(18, 6);
    expect(calcEffectiveSPI(18, 0)).toBeCloseTo(18, 6);
    expect(calcEffectiveSPI(18, null)).toBeCloseTo(18, 6);
  });

  test('invalid fabricCount returns sensible fallback (14)', () => {
    expect(calcEffectiveSPI(0,  1)).toBe(14);
    expect(calcEffectiveSPI(-5, 1)).toBe(14);
    expect(calcEffectiveSPI(NaN,1)).toBe(14);
  });
});

// ════════════════════════════════════════════════════════════════════
// 2. calcDesignSizeIn — canonical Phase 4 anchor values
// ════════════════════════════════════════════════════════════════════
describe('calcDesignSizeIn', () => {
  // ── Anchor 1: 140×200 on 14-ct Aida ──────────────────────────────
  test('140×200 on 14-ct Aida → 10.0″ × 14.286″', () => {
    const { widthIn, heightIn } = calcDesignSizeIn(140, 200, 14, 1);
    expect(widthIn ).toBeCloseTo(10.0,   4);
    expect(heightIn).toBeCloseTo(14.286, 3);
  });

  // ── Anchor 2: 140×200 on 28-ct linen over 2 = same as 14-ct Aida ─
  test('28-ct over 2 produces identical result to 14-ct Aida (anchor equivalence)', () => {
    const aida = calcDesignSizeIn(140, 200, 14, 1);
    const linen = calcDesignSizeIn(140, 200, 28, 2);
    expect(linen.widthIn ).toBeCloseTo(aida.widthIn,  10);
    expect(linen.heightIn).toBeCloseTo(aida.heightIn, 10);
  });

  // ── Anchor 3: 25-ct evenweave over 2 ─────────────────────────────
  test('140 stitches on 25-ct over 2 → 11.2″ (not 5.6″)', () => {
    // 25/2 = 12.5 SPI → 140/12.5 = 11.2
    const { widthIn } = calcDesignSizeIn(140, 1, 25, 2);
    expect(widthIn).toBeCloseTo(11.2, 4);
    // Old buggy result: 140/25 = 5.6 — assert it is NOT that
    expect(widthIn).not.toBeCloseTo(5.6, 0);
  });

  // ── Zero pattern ─────────────────────────────────────────────────
  test('zero-stitch pattern returns { 0, 0 }', () => {
    const r = calcDesignSizeIn(0, 0, 14, 1);
    expect(r.widthIn ).toBe(0);
    expect(r.heightIn).toBe(0);
  });

  test('zero width only → { 0, 0 }', () => {
    const r = calcDesignSizeIn(0, 200, 14, 1);
    expect(r.widthIn ).toBe(0);
    expect(r.heightIn).toBe(0);
  });

  // ── Guard against NaN/negative inputs ─────────────────────────────
  test('negative stitch count treated as 0', () => {
    const r = calcDesignSizeIn(-10, 200, 14, 1);
    expect(r.widthIn).toBe(0);
  });

  test('NaN stitch count treated as 0', () => {
    const r = calcDesignSizeIn(NaN, 200, 14, 1);
    expect(r.widthIn).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// 3. calcCutSizeIn — margin is per-side (×2 total)
// ════════════════════════════════════════════════════════════════════
describe('calcCutSizeIn', () => {
  // Anchor: 10.0″ design width + 3″ each side = 16.0″
  test('10.0″ design + 3″ margin each side → cut ≥ 16″', () => {
    const { widthIn } = calcCutSizeIn(10.0, 14.286, 3);
    expect(widthIn).toBeGreaterThanOrEqual(16.0);
    expect(widthIn).toBeLessThan(16.25); // rounded up to nearest ¼″
  });

  test('margin-is-per-side: 3″ margin adds 6″ total per dimension', () => {
    const design = 10.0;
    const { widthIn } = calcCutSizeIn(design, design, 3);
    expect(widthIn).toBeGreaterThanOrEqual(design + 6);
  });

  test('cut size is strictly greater than design size (margin > 0)', () => {
    const { widthIn, heightIn } = calcCutSizeIn(10.0, 14.286, 3);
    expect(widthIn ).toBeGreaterThan(10.0);
    expect(heightIn).toBeGreaterThan(14.286);
  });

  test('zero margin → cut size equals design size (ceiled to ¼″)', () => {
    // 10.0 → ceil(40/4)/4 = 10.0; 14.286 → ceil(57.144/4) = ceil(14.286) = 14.5
    const { widthIn, heightIn } = calcCutSizeIn(10.0, 14.286, 0);
    expect(widthIn ).toBeCloseTo(10.0,  2);
    expect(heightIn).toBeCloseTo(14.5,  2);
  });

  test('default margin applied when no margin provided', () => {
    const { widthIn } = calcCutSizeIn(10.0, 10.0);
    expect(widthIn).toBeGreaterThanOrEqual(10.0 + 2 * DEFAULT_MARGIN_PER_SIDE_IN);
  });

  test('cut size rounded UP to nearest ¼″ (shopping rounding)', () => {
    // design 10.001″ + 6″ margin = 16.001″ → ceil to 16.25″
    const { widthIn } = calcCutSizeIn(10.001, 10.0, 3);
    expect(widthIn % 0.25).toBeCloseTo(0, 6);    // must be a ¼″ multiple
    expect(widthIn).toBeGreaterThanOrEqual(16.001);
  });

  // Old buggy code added +2 total (1″/side). Verify fix is in the right direction.
  test('new code adds more than the old 2″ total for a 3″/side default', () => {
    const design = 10.0;
    const { widthIn } = calcCutSizeIn(design, design, 3);
    expect(widthIn).toBeGreaterThan(design + 2);   // old code gave design+2 = 12
    expect(widthIn).toBeGreaterThanOrEqual(design + 6); // new code: design+6 = 16
  });
});

// ════════════════════════════════════════════════════════════════════
// 4. cm conversions
// ════════════════════════════════════════════════════════════════════
describe('toDisplayDimensions', () => {
  test('10″ in inches → "10.0″"', () => {
    const { w } = toDisplayDimensions(10, 10, 'in');
    expect(w).toBe('10.0\u2033');
  });

  test('10″ in cm → "25.4 cm" (exact)', () => {
    const { w } = toDisplayDimensions(10, 10, 'cm');
    expect(w).toBe('25.4 cm');
  });

  test('CM_PER_INCH is exactly 2.54', () => {
    expect(CM_PER_INCH).toBe(2.54);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. Thread / skein estimation — calibration ranges
// (No-waste sanity checks against published stitches-per-skein ranges)
// ════════════════════════════════════════════════════════════════════
describe('stitchesToSkeins calibration (no waste)', () => {
  // stitches per skein = skeinLength / threadPerStitch
  // For an 8 m DMC skein split into 6 strands with 0% waste:

  test('14-ct 2 strands: stitches/skein in 1200–1500', () => {
    const skeinLen = 8.0 * INCHES_PER_METRE * FLOSS_STRANDS_PER_SKEIN;
    const tps = BASE_THREAD_PER_STITCH_IN;      // 1.4 in/stitch at 14-ct 2s
    const stitchesPerSkein = skeinLen / tps;
    expect(stitchesPerSkein).toBeGreaterThanOrEqual(1200);
    expect(stitchesPerSkein).toBeLessThanOrEqual(1500);
  });

  test('16-ct 2 strands: stitches/skein in 1500–1680', () => {
    const skeinLen = 8.0 * INCHES_PER_METRE * FLOSS_STRANDS_PER_SKEIN;
    const tps = BASE_THREAD_PER_STITCH_IN * (14 / 16);   // 1.225 in/stitch
    const stitchesPerSkein = skeinLen / tps;
    expect(stitchesPerSkein).toBeGreaterThanOrEqual(1500);
    expect(stitchesPerSkein).toBeLessThanOrEqual(1680);
  });

  test('18-ct 2 strands: stitches/skein in 1680–1800', () => {
    const skeinLen = 8.0 * INCHES_PER_METRE * FLOSS_STRANDS_PER_SKEIN;
    const tps = BASE_THREAD_PER_STITCH_IN * (14 / 18);   // 1.089 in/stitch
    const stitchesPerSkein = skeinLen / tps;
    expect(stitchesPerSkein).toBeGreaterThanOrEqual(1680);
    expect(stitchesPerSkein).toBeLessThanOrEqual(1800);
  });

  test('2→3 strand scaling ≈ +50% (linearity)', () => {
    const r2 = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 2, wasteFactor: 0 });
    const r3 = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 3, wasteFactor: 0 });
    const ratio = r3.skeinsExact / r2.skeinsExact;
    expect(ratio).toBeCloseTo(1.5, 2);
  });

  test('waste factor applied as multiplier (1 + wasteFactor)', () => {
    const noWaste   = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, wasteFactor: 0 });
    const tenPct    = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, wasteFactor: 0.10 });
    const twentyPct = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, wasteFactor: 0.20 });
    // 1.10 / 1.00 = 1.10; 1.20 / 1.00 = 1.20
    expect(tenPct.skeinsExact   / noWaste.skeinsExact).toBeCloseTo(1.10, 2);
    expect(twentyPct.skeinsExact / noWaste.skeinsExact).toBeCloseTo(1.20, 2);
  });

  test('zero-stitch pattern → 0 skeins', () => {
    const r = stitchesToSkeins({ stitchCount: 0, fabricCount: 14, wasteFactor: 0 });
    expect(r.skeinsExact).toBe(0);
    expect(r.skeinsToBuy).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════
// 6. Per-colour ceil: blended stitches
// ════════════════════════════════════════════════════════════════════
describe('stitchesToSkeins blended — per-colour split', () => {
  test('1+1 blend at 14-ct: each colour gets approximately half the total', () => {
    const solid  = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 2, wasteFactor: 0.20 });
    const blended = stitchesToSkeins({
      stitchCount: 5000, fabricCount: 14, strandsUsed: 2, wasteFactor: 0.20,
      isBlended: true, blendRatio: [1, 1]
    });
    // Each colour ≈ half the solid skeins (within 1 %)
    const halfSolid = solid.skeinsExact / 2;
    expect(blended.colorA.skeinsExact).toBeCloseTo(halfSolid, 1);
    expect(blended.colorB.skeinsExact).toBeCloseTo(halfSolid, 1);
  });

  test('2+1 blend: colour A uses 2/3, colour B uses 1/3', () => {
    const blended = stitchesToSkeins({
      stitchCount: 6000, fabricCount: 14, strandsUsed: 3, wasteFactor: 0,
      isBlended: true, blendRatio: [2, 1]
    });
    // Ratio should be 2:1 (within rounding of the 2dp skeinsExact values)
    const ratio = blended.colorA.skeinsExact / blended.colorB.skeinsExact;
    expect(ratio).toBeCloseTo(2.0, 1);
  });

  test('no top-level skeinsExact/skeinsToBuy when blended', () => {
    const r = stitchesToSkeins({
      stitchCount: 1000, fabricCount: 14, strandsUsed: 2, wasteFactor: 0.20,
      isBlended: true, blendRatio: [1, 1]
    });
    expect(r.skeinsExact).toBeUndefined();
    expect(r.skeinsToBuy).toBeUndefined();
    expect(r.colorA).toBeDefined();
    expect(r.colorB).toBeDefined();
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. Round-trip: skeinsToStitches(stitchesToSkeins(n)) ≈ n
// ════════════════════════════════════════════════════════════════════
describe('round-trip skeinsToStitches ↔ stitchesToSkeins', () => {
  test('round-trip within 1% for 5000 stitches (wasteFactor = 0)', () => {
    const stitches = 5000;
    const fwd = stitchesToSkeins({ stitchCount: stitches, fabricCount: 14, wasteFactor: 0 });
    const inv = skeinsToStitches({ skeinCount: fwd.skeinsExact, fabricCount: 14, wasteFactor: 0 });
    expect(inv.stitchesApprox).toBeGreaterThan(stitches * 0.99);
    expect(inv.stitchesApprox).toBeLessThan(stitches * 1.01);
  });
});
