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
  const holePitchCm = 2.54 / fabricCount;
  const threadPerStitchCm = holePitchCm * 4.8 * strandsUsed;
  const totalThreadCm = stitchCount * threadPerStitchCm;
  const skeinLengthCm = skeinLengthM * 100;

  if (!isBlended) {
    const usablePerSkeinCm = skeinLengthCm * 6 * (1 - wasteFactor);
    const skeinsExact = totalThreadCm / usablePerSkeinCm;
    return {
      skeinsExact: Math.round(skeinsExact * 100) / 100,
      skeinsToBuy: Math.ceil(skeinsExact),
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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BRAND_SKEIN_LENGTH,
        stitchesToSkeins,
        skeinsToStitches
    };
}
