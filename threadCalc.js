// threadCalc.js

const BRAND_SKEIN_LENGTH = {
  DMC:     8.0,
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
  if (wasteFactor >= 1) wasteFactor = 0.20;
  const holePitchCm = 2.54 / fabricCount;
  const threadPerStitchCm = holePitchCm * 4.8 * strandsUsed;
  const totalThreadCm = stitchCount * threadPerStitchCm;
  const skeinLengthCm = skeinLengthM * 100;

  if (!isBlended) {
    const usablePerSkeinCm = skeinLengthCm * 6 * (1 - wasteFactor);
    let skeinsRaw = totalThreadCm / usablePerSkeinCm;
    // Epsilon guard: tiny patterns (e.g. a single pixel) should not demand a
    // full skein. Treat near-zero exact values as zero.
    if (skeinsRaw < 0.01) skeinsRaw = 0;
    return {
      skeinsExact: Math.round(skeinsRaw * 100) / 100,
      skeinsToBuy: Math.ceil(skeinsRaw),
      totalThreadM: Math.round(totalThreadCm / 10) / 10
    };
  }

  // Blended
  const [strandsA, strandsB] = blendRatio || [1, 1];
  const threadA_cm = totalThreadCm * (strandsA / strandsUsed);
  const threadB_cm = totalThreadCm * (strandsB / strandsUsed);
  const usableA_cm = skeinLengthCm * 6 * (1 - wasteFactor);
  const usableB_cm = skeinLengthCm * 6 * (1 - wasteFactor);

  const skeinsA = threadA_cm / usableA_cm;
  const skeinsB = threadB_cm / usableB_cm;

  return {
    colorA: {
      skeinsExact: Math.round(skeinsA * 100) / 100,
      skeinsToBuy: Math.ceil(skeinsA)
    },
    colorB: {
      skeinsExact: Math.round(skeinsB * 100) / 100,
      skeinsToBuy: Math.ceil(skeinsB)
    },
    totalThreadM: Math.round(totalThreadCm / 10) / 10
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
  if (wasteFactor >= 1) wasteFactor = 0.20;
  const holePitchCm = 2.54 / fabricCount;
  const threadPerStitchCm = holePitchCm * 4.8 * strandsUsed;
  const skeinLengthCm = skeinLengthM * 100;
  const usablePerSkeinCm = skeinLengthCm * 6 * (1 - wasteFactor);
  const totalUsableCm = skeinCount * usablePerSkeinCm;
  const stitches = Math.floor(totalUsableCm / threadPerStitchCm);

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
  var baseCostIn         = (4.8 * strands) / fc;
  var tailWastePerStitch = (tailIn * 2) / runLen;
  return (baseCostIn + tailWastePerStitch) * genWaste;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BRAND_SKEIN_LENGTH,
        stitchesToSkeins,
        skeinsToStitches,
        threadCostPerStitch
    };
}
