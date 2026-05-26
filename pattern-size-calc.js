// pattern-size-calc.js
// Pure, unit-testable functions for cross-stitch finished-size and
// cut-fabric (shopping) size.  No UI or browser dependencies.
//
// Canonical internal unit: INCHES.  All function return values are in inches
// unless noted otherwise.  Convert to cm at display time only (see
// toDisplayDimensions).
//
// ════════════════════════════════════════════════════════════════════
// Module-root constants — all named, all with source/units noted.
// Change these here; never bury magic numbers in function bodies.
// ════════════════════════════════════════════════════════════════════

// Exact cm→in factor (1 inch = 2.54 cm)
var CM_PER_INCH = 2.54;

// Default margin applied to each side when cutting fabric for framing.
// Cross-stitch convention: 2–3 in for hoops, 3 in for framing.
// Applied to BOTH width sides and BOTH height sides (so total extra = 2×).
var DEFAULT_MARGIN_PER_SIDE_IN = 3;

// Stitch-over values
var STITCH_OVER_AIDA      = 1;  // Aida: one stitch per square thread
var STITCH_OVER_EVENWEAVE = 2;  // Evenweave/linen: one stitch over 2 threads

// ════════════════════════════════════════════════════════════════════
// Pure functions
// ════════════════════════════════════════════════════════════════════

/**
 * Effective stitches per inch for a given fabric and stitch-over setting.
 *
 *   effectiveSPI = fabricCount / stitchOver
 *
 * For Aida (stitchOver = 1): effectiveSPI = fabricCount.
 * For 28-ct evenweave over 2: effectiveSPI = 14  (same as 14-ct Aida).
 *
 * @param {number} fabricCount  - threads/squares per inch (e.g. 14, 28)
 * @param {number} stitchOver   - 1 (Aida) or 2 (evenweave/linen)
 * @returns {number}
 */
function calcEffectiveSPI(fabricCount, stitchOver) {
  if (!Number.isFinite(fabricCount) || fabricCount <= 0) return 14;
  var so = (stitchOver === 2) ? 2 : 1;
  return fabricCount / so;
}

/**
 * Finished design size in inches (the area the stitching actually covers).
 *
 *   designWidthIn  = stitchesWide  / effectiveSPI
 *   designHeightIn = stitchesHigh  / effectiveSPI
 *
 * Returns { widthIn, heightIn }.  Both are raw (unrounded) so callers can
 * round to 1 dp for display.  An empty pattern returns { 0, 0 }.
 *
 * @param {number} stitchesWide
 * @param {number} stitchesHigh
 * @param {number} fabricCount
 * @param {number} stitchOver   - 1 or 2 (default 1)
 * @returns {{ widthIn: number, heightIn: number }}
 */
function calcDesignSizeIn(stitchesWide, stitchesHigh, fabricCount, stitchOver) {
  if (!Number.isFinite(stitchesWide) || stitchesWide < 0) stitchesWide = 0;
  if (!Number.isFinite(stitchesHigh) || stitchesHigh < 0) stitchesHigh = 0;
  if (stitchesWide === 0 || stitchesHigh === 0) return { widthIn: 0, heightIn: 0 };
  var spi = calcEffectiveSPI(fabricCount, stitchOver);
  return {
    widthIn:  stitchesWide  / spi,
    heightIn: stitchesHigh  / spi
  };
}

/**
 * Cut (shopping) fabric size in inches.
 *
 *   cutWidthIn  = designWidthIn  + 2 * marginPerSideIn
 *   cutHeightIn = designHeightIn + 2 * marginPerSideIn
 *
 * The margin is applied to BOTH sides of each dimension.  A 3-inch margin
 * adds 6 inches in total to the width (and 6 to the height).
 *
 * The cut size is rounded UP to the nearest quarter-inch because it is a
 * shopping target (you cannot buy a fraction of a centimetre in most shops).
 * The raw design size is kept unrounded; round it to 1 dp when displaying.
 *
 * @param {number} designWidthIn
 * @param {number} designHeightIn
 * @param {number} marginPerSideIn - default DEFAULT_MARGIN_PER_SIDE_IN
 * @returns {{ widthIn: number, heightIn: number }}
 */
function calcCutSizeIn(designWidthIn, designHeightIn, marginPerSideIn) {
  if (!Number.isFinite(marginPerSideIn) || marginPerSideIn < 0) {
    marginPerSideIn = DEFAULT_MARGIN_PER_SIDE_IN;
  }
  var rawW = designWidthIn  + 2 * marginPerSideIn;
  var rawH = designHeightIn + 2 * marginPerSideIn;
  // Round UP to nearest 0.25″ (shopping rounding)
  return {
    widthIn:  Math.ceil(rawW  * 4) / 4,
    heightIn: Math.ceil(rawH  * 4) / 4
  };
}

/**
 * Format a size pair for display.
 *
 * @param {number} widthIn
 * @param {number} heightIn
 * @param {'in'|'cm'} units
 * @returns {{ w: string, h: string }}
 */
function toDisplayDimensions(widthIn, heightIn, units) {
  if (units === 'cm') {
    return {
      w: (widthIn  * CM_PER_INCH).toFixed(1) + ' cm',
      h: (heightIn * CM_PER_INCH).toFixed(1) + ' cm'
    };
  }
  return {
    w: widthIn.toFixed(1)  + '\u2033',
    h: heightIn.toFixed(1) + '\u2033'
  };
}

// ════════════════════════════════════════════════════════════════════
// Export (CommonJS for tests; browser globals for in-page use)
// ════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CM_PER_INCH,
    DEFAULT_MARGIN_PER_SIDE_IN,
    STITCH_OVER_AIDA,
    STITCH_OVER_EVENWEAVE,
    calcEffectiveSPI,
    calcDesignSizeIn,
    calcCutSizeIn,
    toDisplayDimensions
  };
}
if (typeof window !== 'undefined') {
  window.calcEffectiveSPI    = calcEffectiveSPI;
  window.calcDesignSizeIn    = calcDesignSizeIn;
  window.calcCutSizeIn       = calcCutSizeIn;
  window.toDisplayDimensions = toDisplayDimensions;
}
