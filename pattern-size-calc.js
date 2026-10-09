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

// Suggested cut-size margin per side by unit system (P2-2): 5 cm, or 2 in.
var CUT_MARGIN_PER_SIDE_IN = { metric: 5 / CM_PER_INCH, imperial: 2 };

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

/**
 * Finished size as shown in the Creator. In the browser this is in both unit
 * systems, the preferred one first ("14.5 × 14.5 cm (5.7 × 5.7 in)"); pass
 * units explicitly to choose, or where there is no browser it falls back to
 * inches only ("5.7 × 5.7 in").
 *
 * stitchOver defaults to the fabric's own setting: stitchOverFor() in
 * constants.js returns 2 for the "(over 2)" counts in FABRIC_COUNTS.
 *
 * @param {number} stitchesWide
 * @param {number} stitchesHigh
 * @param {number} fabricCount
 * @param {number} [stitchOver]
 * @returns {string}
 */
function finishedSizeText(stitchesWide, stitchesHigh, fabricCount, stitchOver, units) {
  if (stitchOver == null) {
    stitchOver = (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
  }
  var d = calcDesignSizeIn(stitchesWide, stitchesHigh, fabricCount, stitchOver);
  if (!units && typeof window !== 'undefined' && window.UserPrefs) units = preferredUnits();
  if (units) return dualSizeText(d.widthIn, d.heightIn, units);
  return d.widthIn.toFixed(1) + ' × ' + d.heightIn.toFixed(1) + ' in';
}

/**
 * The unit system a locale expects when the user hasn't chosen one: inches
 * for US English only, centimetres for everyone else (en-GB, other English
 * locales and every non-English locale).
 *
 * @param {string} lang - e.g. navigator.language
 * @returns {'metric'|'imperial'}
 */
function defaultUnitsForLocale(lang) {
  return /^en-US\b/i.test(String(lang || '')) ? 'imperial' : 'metric';
}

/**
 * The user's unit system: the `units` preference, else the locale's default.
 * @returns {'metric'|'imperial'}
 */
function preferredUnits() {
  try {
    var v = (typeof window !== 'undefined' && window.UserPrefs) ? window.UserPrefs.get('units') : null;
    if (v === 'metric' || v === 'imperial') return v;
  } catch (_) {}
  var lang = (typeof navigator !== 'undefined' && navigator.language) || '';
  return defaultUnitsForLocale(lang);
}

/**
 * A size in both unit systems, the preferred one first:
 * "14.5 × 14.5 cm (5.7 × 5.7 in)" or "5.7 × 5.7 in (14.5 × 14.5 cm)".
 *
 * @param {number} widthIn
 * @param {number} heightIn
 * @param {'metric'|'imperial'} [units] - default preferredUnits()
 * @returns {string}
 */
function dualSizeText(widthIn, heightIn, units) {
  if (!units) units = preferredUnits();
  var cm = (widthIn * CM_PER_INCH).toFixed(1) + ' × ' + (heightIn * CM_PER_INCH).toFixed(1) + ' cm';
  var inch = widthIn.toFixed(1) + ' × ' + heightIn.toFixed(1) + ' in';
  return units === 'imperial' ? inch + ' (' + cm + ')' : cm + ' (' + inch + ')';
}

/**
 * Finished and suggested cut size of a pattern, as text in both units.
 * The cut size adds 5 cm (metric) or 2 in (imperial) on every side.
 *
 * @returns {{ finished: string, cut: string, units: string }}
 */
function fabricSizes(stitchesWide, stitchesHigh, fabricCount, units) {
  if (!units) units = preferredUnits();
  var over = (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
  var d = calcDesignSizeIn(stitchesWide, stitchesHigh, fabricCount, over);
  var c = calcCutSizeIn(d.widthIn, d.heightIn, CUT_MARGIN_PER_SIDE_IN[units] || 2);
  return { finished: dualSizeText(d.widthIn, d.heightIn, units), cut: dualSizeText(c.widthIn, c.heightIn, units), units: units };
}

// ════════════════════════════════════════════════════════════════════
// Sizing a pattern from a picture (P2-6, audit IMG-03)
// ════════════════════════════════════════════════════════════════════

// Pattern sizes are kept between these, in stitches.
var PATTERN_MIN_STITCHES = 10;
var PATTERN_MAX_STITCHES = 500;
// A new picture's long side starts at this many stitches.
var INITIAL_LONG_SIDE_STITCHES = 100;
// Below this many stitches the short side of a very wide or tall picture
// is too thin to show much; the Creator suggests cropping.
var SHORT_SIDE_NOTE_STITCHES = 20;

function clampStitches(n) {
  return Math.max(PATTERN_MIN_STITCHES, Math.min(PATTERN_MAX_STITCHES, Math.round(n)));
}

/**
 * Scale a picture of srcW x srcH by `scale`, keeping its shape inside the
 * 10-500 stitch limits: a picture too small for the 10-stitch minimum is
 * scaled up evenly until its short side reaches 10, rather than having one
 * side stretched. Only very long, thin pictures (more than 50:1) still lose
 * their shape at the limits.
 *
 * @returns {{ w: number, h: number }}
 */
function scaleKeepingShape(srcW, srcH, scale) {
  var shortPx = Math.min(srcW, srcH);
  if (shortPx * scale < PATTERN_MIN_STITCHES) scale = PATTERN_MIN_STITCHES / shortPx;
  return { w: clampStitches(srcW * scale), h: clampStitches(srcH * scale) };
}

/**
 * Starting size for a picture of srcW x srcH pixels: the long side fitted to
 * 100 stitches, but never more stitches than the picture has pixels (a
 * picture under 10 pixels across is scaled up evenly to the 10-stitch
 * minimum).
 *
 * @returns {{ w: number, h: number }}
 */
function initialPatternSize(srcW, srcH) {
  if (!(srcW > 0) || !(srcH > 0)) return { w: 80, h: 80 };
  var longPx = Math.max(srcW, srcH);
  var longSt = Math.min(INITIAL_LONG_SIDE_STITCHES, longPx);
  return scaleKeepingShape(srcW, srcH, longSt / longPx);
}

/**
 * The Picture size preset: one stitch per pixel, scaled down evenly to fit
 * 500 or up evenly to reach the 10-stitch minimum.
 *
 * @returns {{ w: number, h: number } | null}
 */
function pictureStitchSize(srcW, srcH) {
  if (!(srcW > 0) || !(srcH > 0)) return null;
  return scaleKeepingShape(srcW, srcH, Math.min(1, PATTERN_MAX_STITCHES / Math.max(srcW, srcH)));
}

/**
 * Stitches needed to cover `length` (in 'cm' or 'in') on a fabric.
 * 18 cm on 14-count: 18 / 2.54 x 14 = 99.2, so 99.
 */
function stitchesForLength(length, unit, fabricCount, stitchOver) {
  var inches = unit === 'cm' ? length / CM_PER_INCH : length;
  if (!(inches > 0)) return 0;
  if (stitchOver == null) stitchOver = (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
  return Math.round(inches * calcEffectiveSPI(fabricCount, stitchOver));
}

/**
 * Length (in 'cm' or 'in') that `stitches` cover on a fabric.
 */
function lengthForStitches(stitches, unit, fabricCount, stitchOver) {
  if (stitchOver == null) stitchOver = (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
  var inches = stitches / calcEffectiveSPI(fabricCount, stitchOver);
  return unit === 'cm' ? inches * CM_PER_INCH : inches;
}

/**
 * The largest pattern with aspect ratio `ar` (width / height) that fits a
 * frame of frameW x frameH (in 'cm' or 'in'). The frame is turned to match
 * the picture: a landscape picture uses the frame's long side across.
 *
 * @returns {{ w: number, h: number }}
 */
function fitPatternToFrame(frameW, frameH, unit, ar, fabricCount, stitchOver) {
  var a = Math.min(frameW, frameH), b = Math.max(frameW, frameH);
  var landscape = ar >= 1;
  if (stitchOver == null) stitchOver = (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
  var spi = calcEffectiveSPI(fabricCount, stitchOver);
  function toIn(v) { return unit === 'cm' ? v / CM_PER_INCH : v; }
  // Whole stitches that fit: rounded down, so the pattern never comes out
  // larger than the frame (a tiny epsilon absorbs floating-point error).
  function fits(len) { return Math.floor(toIn(len) * spi + 1e-9); }
  var maxW = fits(landscape ? b : a), maxH = fits(landscape ? a : b);
  // Only the 10-stitch minimum can push a pattern past a very small frame.
  function clampDown(n) { return Math.max(PATTERN_MIN_STITCHES, Math.min(PATTERN_MAX_STITCHES, Math.floor(n + 1e-9))); }
  if (!(ar > 0)) return { w: clampDown(maxW), h: clampDown(maxH) };
  var w = maxW, h = maxW / ar;
  if (h > maxH) { h = maxH; w = maxH * ar; }
  return { w: clampDown(w), h: clampDown(h) };
}

/**
 * Notes about a size for a picture of srcW x srcH pixels:
 *   shortSide  — the short side is under 20 stitches on a very wide (or
 *                tall) picture: { stitches, orientation: 'wide' | 'tall' }
 *   enlarged   — the pattern has more stitches than the picture has pixels
 *                across (or down): { px, block, axis: 'wide' | 'tall' }
 */
function patternSizeNotes(sW, sH, srcW, srcH) {
  var out = { shortSide: null, enlarged: null };
  if (!(srcW > 0) || !(srcH > 0)) return out;
  var ratio = srcW / srcH;
  if (Math.min(sW, sH) < SHORT_SIDE_NOTE_STITCHES && (ratio >= 2 || ratio <= 0.5)) {
    out.shortSide = { stitches: Math.min(sW, sH), orientation: ratio >= 1 ? 'wide' : 'tall' };
  }
  var fx = sW / srcW, fy = sH / srcH;
  if (fx > 1 || fy > 1) {
    var acrossFirst = fx >= fy;
    out.enlarged = {
      px: acrossFirst ? srcW : srcH,
      block: Math.max(1, Math.round(Math.max(fx, fy))),
      axis: acrossFirst ? 'wide' : 'tall'
    };
  }
  return out;
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
    toDisplayDimensions,
    finishedSizeText,
    CUT_MARGIN_PER_SIDE_IN,
    defaultUnitsForLocale,
    preferredUnits,
    dualSizeText,
    fabricSizes,
    PATTERN_MIN_STITCHES,
    PATTERN_MAX_STITCHES,
    initialPatternSize,
    pictureStitchSize,
    stitchesForLength,
    lengthForStitches,
    fitPatternToFrame,
    patternSizeNotes
  };
}
if (typeof window !== 'undefined') {
  window.calcEffectiveSPI    = calcEffectiveSPI;
  window.calcDesignSizeIn    = calcDesignSizeIn;
  window.calcCutSizeIn       = calcCutSizeIn;
  window.toDisplayDimensions = toDisplayDimensions;
  window.finishedSizeText    = finishedSizeText;
  window.defaultUnitsForLocale = defaultUnitsForLocale;
  window.preferredUnits      = preferredUnits;
  window.dualSizeText        = dualSizeText;
  window.fabricSizes         = fabricSizes;
  window.initialPatternSize  = initialPatternSize;
  window.pictureStitchSize   = pictureStitchSize;
  window.stitchesForLength   = stitchesForLength;
  window.lengthForStitches   = lengthForStitches;
  window.fitPatternToFrame   = fitPatternToFrame;
  window.patternSizeNotes    = patternSizeNotes;
}
