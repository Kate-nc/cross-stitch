// threadCalc.js

// ════════════════════════════════════════════════════════════════════
// Module-root constants — named and commented. Never bury these in
// function bodies.
// ════════════════════════════════════════════════════════════════════

// Base thread per full cross stitch in inches, at the reference
// parameters (14-count, 2 strands, no waste).  Calibrated to satisfy
// the published stitches-per-skein reference ranges:
//   14-ct ≈ 200–250, 16-ct ≈ 250–280, 18-ct ≈ 280–300 (all 2 strands).
// Community references cite "~1.5 inches"; 1.4 satisfies all three
// ranges simultaneously at no-waste baseline.
const BASE_THREAD_PER_STITCH_IN = 1.4;  // inches, 14-ct, 2 strands, no waste
const BASE_FABRIC_COUNT         = 14;   // reference fabric count (count)
const BASE_STRANDS              = 2;    // reference strand count

// Unit conversion — exact, do not approximate.
const INCHES_PER_METRE  = 39.3701;   // 1 m = 39.3701 in  (1 in = 2.54 cm)

// Default waste factor — 15 %.  Applied as a MULTIPLIER: if you need X inches
// of thread, buy X × (1 + wasteFactor) worth of skein capacity.
// Convention: 10 % (experienced), 15–20 % (beginners).  Configurable.
const DEFAULT_WASTE_FACTOR = 0.15;

const BRAND_SKEIN_LENGTH = {
  DMC:     8.0,   // metres
  Anchor:  8.0,
  Madeira: 10.0,
  Cosmo:   8.0
};

function stitchesToSkeins({
  stitchCount,
  fabricCount = 14,
  strandsUsed = 2,
  skeinLengthM = 8.0,
  wasteFactor = 0.20,
  isBlended = false,
  blendRatio = null
}) {
  // Validate numeric inputs at the boundary so callers see a clear error
  // instead of NaN propagating into the UI ("NaN skeins").
  if (!Number.isFinite(stitchCount) || stitchCount < 0) {
    throw new Error("stitchesToSkeins: stitchCount must be a non-negative finite number");
  }
  if (!Number.isFinite(fabricCount) || fabricCount <= 0) {
    throw new Error("stitchesToSkeins: fabricCount must be a positive finite number");
  }
  if (strandsUsed <= 0) strandsUsed = 2;
  if (wasteFactor >= 1) wasteFactor = DEFAULT_WASTE_FACTOR;

  // Canonical unit: INCHES.
  // threadPerStitch scales inversely with fabric count (smaller stitches use
  // less thread) and linearly with strand count.
  const threadCostIn   = BASE_THREAD_PER_STITCH_IN
                         * (BASE_FABRIC_COUNT / fabricCount)
                         * (strandsUsed / BASE_STRANDS);  // in/stitch
  const flossLengthIn  = stitchCount * threadCostIn;      // in, no waste
  const totalWithWasteIn = flossLengthIn * (1 + wasteFactor);
  const skeinLengthIn  = skeinLengthM * INCHES_PER_METRE;

  if (!isBlended) {
    let skeinsRaw = totalWithWasteIn / skeinLengthIn;
    // Epsilon guard: tiny patterns (e.g. a single pixel) should not demand a
    // full skein. Treat near-zero exact values as zero.
    if (skeinsRaw < 0.01) skeinsRaw = 0;
    return {
      skeinsExact:  Math.round(skeinsRaw * 100) / 100,
      skeinsToBuy:  Math.ceil(skeinsRaw),
      totalThreadM: Math.round(flossLengthIn / INCHES_PER_METRE * 10) / 10
    };
  }

  // Blended — split floss proportionally by strand ratio before applying waste.
  const [strandsA, strandsB] = blendRatio || [1, 1];
  const threadA_in = flossLengthIn * (strandsA / strandsUsed);
  const threadB_in = flossLengthIn * (strandsB / strandsUsed);

  const skeinsA = threadA_in * (1 + wasteFactor) / skeinLengthIn;
  const skeinsB = threadB_in * (1 + wasteFactor) / skeinLengthIn;

  return {
    colorA: {
      skeinsExact: Math.round(skeinsA * 100) / 100,
      skeinsToBuy: Math.ceil(skeinsA)
    },
    colorB: {
      skeinsExact: Math.round(skeinsB * 100) / 100,
      skeinsToBuy: Math.ceil(skeinsB)
    },
    totalThreadM: Math.round(flossLengthIn / INCHES_PER_METRE * 10) / 10
  };
}

function skeinsToStitches({
  skeinCount,
  fabricCount = 14,
  strandsUsed = 2,
  skeinLengthM = 8.0,
  wasteFactor = 0.20
}) {
  if (fabricCount <= 0) fabricCount = 14;
  if (strandsUsed <= 0) strandsUsed = 2;
  if (wasteFactor >= 1) wasteFactor = DEFAULT_WASTE_FACTOR;

  // Invert stitchesToSkeins: stitchCount = skeins × skeinLength / (threadCost × (1+waste))
  const threadCostIn      = BASE_THREAD_PER_STITCH_IN
                            * (BASE_FABRIC_COUNT / fabricCount)
                            * (strandsUsed / BASE_STRANDS);
  const skeinLengthIn     = skeinLengthM * INCHES_PER_METRE;
  const usablePerSkeinIn  = skeinLengthIn / (1 + wasteFactor);
  const totalUsableIn     = skeinCount * usablePerSkeinIn;
  const stitches          = Math.floor(totalUsableIn / threadCostIn);

  return {
    stitchesApprox: stitches,
    isApproximate: true
  };
}

// threadCostPerStitch — returns the effective thread consumption per single full
// cross stitch in INCHES, accounting for per-run tail waste and a general waste
// multiplier. Used by the real-time stash deduction feature.
//
// wastePrefs (all optional, defaults match the RT_WASTE_DEFAULTS in tracker-app.js):
//   tailAllowanceIn     — inches wasted per tail (start + end of each thread run)
//   threadRunLength     — average stitches per thread run (determines how often tails fire)
//   generalWasteMultiplier — catch-all waste factor (1.10 = 10% waste on top)
//   strandCountOverride — override strand count (null = use strandCount param)
//
// "Thread run length" is the number of stitches you stitch consecutively with the
// same piece of thread before cutting it and starting a fresh length. Shorter runs
// mean more cuts and therefore more tail waste per stitch; longer runs mean fewer
// cuts and lower waste per stitch. At the default of 30 stitches/run with 1.5 in
// tails: (1.5 × 2) / 30 = 0.10 in/stitch of amortised tail waste.
function threadCostPerStitch(fabricCount, strandCount, wastePrefs) {
  var fc = (typeof fabricCount === 'number' && fabricCount > 0) ? fabricCount : 14;
  var sc = (typeof strandCount === 'number' && strandCount > 0) ? strandCount : 2;
  var wp = wastePrefs || {};
  var tailIn   = typeof wp.tailAllowanceIn === 'number'         ? wp.tailAllowanceIn         : 1.5;
  var runLen   = typeof wp.threadRunLength === 'number'         ? wp.threadRunLength          : 30;
  var genWaste = typeof wp.generalWasteMultiplier === 'number'  ? wp.generalWasteMultiplier   : 1.10;
  var strands  = typeof wp.strandCountOverride === 'number'
                   ? wp.strandCountOverride
                   : sc;
  if (runLen <= 0) runLen = 30;
  // Same calibrated anchor as stitchesToSkeins (BASE_THREAD_PER_STITCH_IN,
  // BASE_FABRIC_COUNT, BASE_STRANDS); tail waste and general waste are added
  // on top for the real-time tracker's finer-grained model.
  var baseCostIn         = BASE_THREAD_PER_STITCH_IN * BASE_FABRIC_COUNT / fc * strands / BASE_STRANDS;
  var tailWastePerStitch = (tailIn * 2) / runLen;
  return (baseCostIn + tailWastePerStitch) * genWaste;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BASE_THREAD_PER_STITCH_IN,
        BASE_FABRIC_COUNT,
        BASE_STRANDS,
        INCHES_PER_METRE,
        DEFAULT_WASTE_FACTOR,
        BRAND_SKEIN_LENGTH,
        stitchesToSkeins,
        skeinsToStitches,
        threadCostPerStitch
    };
}
