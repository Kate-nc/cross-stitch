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

// Unit conversion — exact, derived from 1 in = 2.54 cm.
const INCHES_PER_METRE  = 100 / 2.54; // 1 m = 100 cm
const FLOSS_STRANDS_PER_SKEIN = 6;    // standard stranded cotton skein

// Default waste factor — 15 %.  Applied as a MULTIPLIER: if you need X inches
// of thread, buy X × (1 + wasteFactor) worth of skein capacity.
// Convention: 10 % (experienced), 15–20 % (beginners).  Configurable.
const DEFAULT_WASTE_FACTOR = 0.15;

// Threads each stitch covers, when the caller doesn't say: stitchOverFor()
// from constants.js knows the "(over 2)" fabrics; without it, 1 (Aida).
function defaultStitchOver(fabricCount) {
  return (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
}

const BRAND_SKEIN_LENGTH = {
  DMC:     8.0,   // metres
  Anchor:  8.0,
  Madeira: 10.0,
  Cosmo:   8.0
};

function stitchesToSkeins({
  stitchCount,
  fabricCount = 14,
  stitchOver = defaultStitchOver(fabricCount),
  strandsUsed = 2,
  skeinLengthM = 8.0,
  wasteFactor = DEFAULT_WASTE_FACTOR,
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
  if (!Number.isFinite(wasteFactor) || wasteFactor < 0 || wasteFactor >= 1) {
    wasteFactor = DEFAULT_WASTE_FACTOR;
  }

  // Canonical unit: INCHES.
  // threadPerStitch scales inversely with the effective count (smaller
  // stitches use less thread) and linearly with strand count. 28-count over
  // 2 makes stitches the size of 14-count Aida, so it uses 28 / 2 = 14.
  const effectiveCount = fabricCount / (stitchOver === 2 ? 2 : 1);
  const threadCostIn   = BASE_THREAD_PER_STITCH_IN
                         * (BASE_FABRIC_COUNT / effectiveCount)
                         * (strandsUsed / BASE_STRANDS);  // in/stitch
  const flossLengthIn  = stitchCount * threadCostIn;      // in, no waste
  const totalWithWasteIn = flossLengthIn * (1 + wasteFactor);
  const skeinLengthIn  = skeinLengthM * INCHES_PER_METRE * FLOSS_STRANDS_PER_SKEIN;

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
  stitchOver = defaultStitchOver(fabricCount),
  strandsUsed = 2,
  skeinLengthM = 8.0,
  wasteFactor = DEFAULT_WASTE_FACTOR
}) {
  if (fabricCount <= 0) fabricCount = 14;
  if (strandsUsed <= 0) strandsUsed = 2;
  if (!Number.isFinite(wasteFactor) || wasteFactor < 0 || wasteFactor >= 1) {
    wasteFactor = DEFAULT_WASTE_FACTOR;
  }

  // Invert stitchesToSkeins: stitchCount = skeins × skeinLength / (threadCost × (1+waste))
  const threadCostIn      = BASE_THREAD_PER_STITCH_IN
                            * (BASE_FABRIC_COUNT / (fabricCount / (stitchOver === 2 ? 2 : 1)))
                            * (strandsUsed / BASE_STRANDS);
  const skeinLengthIn     = skeinLengthM * INCHES_PER_METRE * FLOSS_STRANDS_PER_SKEIN;
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
  var baseCostIn         = BASE_THREAD_PER_STITCH_IN * BASE_FABRIC_COUNT / (fc / defaultStitchOver(fc)) * strands / BASE_STRANDS;
  var tailWastePerStitch = (tailIn * 2) / runLen;
  return (baseCostIn + tailWastePerStitch) * genWaste;
}

// Real-time model (kept separate from the rounded shopping estimate above).
// 4.8 inches of stitch geometry per effective fabric count, per used strand.
// Capacity is 6 strands * 315 inches. Tails are the existing combined working
// thread allowance in inches per run; waste is a multiplier, not a percentage.
const RT_GEOMETRY_IN_PER_COUNT = 4.8;
const RT_SKEIN_SINGLE_STRAND_IN = 6 * 315;
function rtThreadUsage(pattern, done, fabricCount, prefs) {
  const wp = prefs || {};
  const fc = Number.isFinite(fabricCount) && fabricCount > 0 ? fabricCount : 14;
  const strands = Number.isFinite(wp.strandCountOverride) && wp.strandCountOverride > 0 ? wp.strandCountOverride : 2;
  const tail = Number.isFinite(wp.tailAllowanceIn) && wp.tailAllowanceIn >= 0 ? wp.tailAllowanceIn : 1.5;
  const run = Number.isFinite(wp.threadRunLength) && wp.threadRunLength > 0 ? wp.threadRunLength : 30;
  const waste = Number.isFinite(wp.generalWasteMultiplier) && wp.generalWasteMultiplier >= 0 ? wp.generalWasteMultiplier : 1.10;
  const cost = (RT_GEOMETRY_IN_PER_COUNT * strands / (fc / defaultStitchOver(fc)) + 2 * tail / run) * waste / RT_SKEIN_SINGLE_STRAND_IN;
  const out = {};
  (pattern || []).forEach(function(p, i) {
    if (!p || !p.id || p.id.startsWith('__')) return;
    const parts = p.type === 'blend' ? (p.threads || String(p.id).split('+').map(id => ({ id: id }))) : [p];
    // Constituent weights describe relative strands; an override scales the
    // total working strand count while retaining these proportions.
    const weights = parts.map((t, j) => {
      const n = (p.blendRatio && p.blendRatio[j]) != null ? p.blendRatio[j] : (t.strands != null ? t.strands : 1);
      return Number.isFinite(n) && n >= 0 ? n : 1;
    });
    const totalWeight = weights.reduce((sum, n) => sum + n, 0) || parts.length;
    parts.forEach(function(t, j) {
      const share = p.type === 'blend' ? (weights.some(n => n > 0) ? weights[j] : 1) / totalWeight : 1;
      const key = (t.brand || p.brand || 'dmc').toLowerCase() + ':' + t.id;
      if (!(key in out)) out[key] = 0;
      if (done && done[i] === 1) out[key] += cost * share;
    });
  });
  return out;
}

// ── Key rows: what a stitcher needs for one chart symbol (UX-014) ─────────────
// The Creator Palette tab, the Tracker colour list and the Materials thread
// list all show the same two figures for a symbol: the strands in the needle
// and the skeins of thread it takes. They come from stitchesToSkeins, with the
// 20 % allowance skeinEst() and the shopping list use.
//
// A blend stitch puts one strand of each of its two threads in the needle, so
// each thread costs half what a two-strand stitch of it would. That is why a
// blend row shows the skeins for EACH thread, not a total. The shopping list
// adds blends to the solids that share a thread, so it needs fewer skeins than
// the key rows added up.
const KEY_WASTE_FACTOR = 0.20;

// A brand's skein length in metres (BRAND_SKEIN_LENGTH, matched without regard to case: "madeira" and "Madeira"),
// or the 8 m default for a brand it does not list.
function skeinLengthForBrand(brand) {
  const want = String(brand == null ? '' : brand).toLowerCase();
  const key = Object.keys(BRAND_SKEIN_LENGTH).find(function (k) { return k.toLowerCase() === want; });
  return key ? BRAND_SKEIN_LENGTH[key] : 8.0;
}

// entry: a palette entry ({ count, type, blendRatio? }) or a library thread
// ({ qty... } is not read; pass count). opts: { fabricCount, strandsUsed,
// wasteFactor, skeinLengthM }. The skein length is opts.skeinLengthM when
// given (the Manager passes its own), else the entry's brand's (a Madeira
// skein is 10 m), else 8 m. Returns { isBlend, count, strands: [n] | [a, b],
// skeins: [exact] | [a, b], toBuy: [whole skeins, at least 1 once stitched] }.
function threadKeyUsage(entry, opts) {
  opts = opts || {};
  const e = entry || {};
  const fabricCount = Number.isFinite(opts.fabricCount) && opts.fabricCount > 0 ? opts.fabricCount : 14;
  const strandsUsed = Number.isFinite(opts.strandsUsed) && opts.strandsUsed > 0 ? opts.strandsUsed : BASE_STRANDS;
  const wasteFactor = opts.wasteFactor == null ? KEY_WASTE_FACTOR : opts.wasteFactor;
  const count = Number.isFinite(Number(e.count)) && Number(e.count) > 0 ? Number(e.count) : 0;
  const skeinLengthM = Number.isFinite(opts.skeinLengthM) && opts.skeinLengthM > 0 ? opts.skeinLengthM : skeinLengthForBrand(e.brand);
  const isBlend = e.type === 'blend' || !!e.is_blended || (typeof e.id === 'string' && e.id.indexOf('+') > 0);
  let strands;
  if (isBlend) {
    const r = e.blendRatio || e.blend_ratio;
    strands = Array.isArray(r) && r.length >= 2 && r[0] > 0 && r[1] > 0 ? [r[0], r[1]] : [strandsUsed / 2, strandsUsed / 2];
  } else {
    strands = [strandsUsed];
  }
  // A symbol with any stitches never reads as exactly zero skeins, however few (stitchesToSkeins rounds a tiny amount to 0).
  const skeins = strands.map(function (n) {
    const exact = stitchesToSkeins({ stitchCount: count, fabricCount: fabricCount, strandsUsed: n, wasteFactor: wasteFactor, skeinLengthM: skeinLengthM }).skeinsExact;
    return count > 0 ? Math.max(exact, 0.001) : exact;
  });
  const toBuy = skeins.map(function (x) { return count > 0 ? Math.max(1, Math.ceil(x)) : 0; });
  return { isBlend: isBlend, count: count, strands: strands, skeins: skeins, toBuy: toBuy };
}

// "1.3 skeins", "1 skein", "under 0.1 skein", "0 skeins".
function formatSkeins(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 skeins';
  if (n < 0.05) return 'under 0.1 skein';
  const r = Math.round(n * 10) / 10;
  return r + (r === 1 ? ' skein' : ' skeins');
}

function _strandsWord(n) { return n + (n === 1 ? ' strand' : ' strands'); }

// The two halves of a key row's usage line, for a table with a column for each:
// { strands: "2 strands" | "1 strand of each" | "1 + 2 strands",
//   skeins: "1.3 skeins" | "0.4 skeins each" | "0.4 skeins and 0.8 skeins" }.
function threadUsageParts(u) {
  if (!u) return { strands: '', skeins: '' };
  if (!u.isBlend) return { strands: _strandsWord(u.strands[0]), skeins: formatSkeins(u.skeins[0]) };
  const even = u.strands[0] === u.strands[1];
  return {
    strands: even ? _strandsWord(u.strands[0]) + ' of each' : u.strands[0] + ' + ' + u.strands[1] + ' strands',
    skeins: u.skeins[0] === u.skeins[1] ? formatSkeins(u.skeins[0]) + ' each' : formatSkeins(u.skeins[0]) + ' and ' + formatSkeins(u.skeins[1])
  };
}

// The key row's usage line: "2 strands · 1.3 skeins" for a solid,
// "1 strand of each · 0.4 skeins each" for a blend.
function threadUsageText(u) {
  if (!u) return '';
  const p = threadUsageParts(u);
  return p.strands + ' \u00B7 ' + p.skeins;
}

// "about 1.3 skeins", but "under 0.1 skein" rather than "about under 0.1 skein".
function _aboutSkeins(n) { return n < 0.05 && n > 0 ? formatSkeins(n) : 'about ' + formatSkeins(n); }

// The same figures in full, for a tooltip or screen reader.
function threadUsageTitle(u) {
  if (!u) return '';
  if (!u.isBlend) {
    return _strandsWord(u.strands[0]) + ' in the needle; ' + _aboutSkeins(u.skeins[0]) + ' of thread' + (u.toBuy[0] ? ' (buy ' + u.toBuy[0] + ')' : '');
  }
  const even = u.strands[0] === u.strands[1];
  const st = even ? 'One strand of each thread in the needle' : u.strands[0] + ' and ' + u.strands[1] + ' strands in the needle';
  const sk = u.skeins[0] === u.skeins[1]
    ? _aboutSkeins(u.skeins[0]) + ' of each thread'
    : _aboutSkeins(u.skeins[0]) + ' and ' + formatSkeins(u.skeins[1]) + ' of the two threads';
  return st + '; ' + sk;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BASE_THREAD_PER_STITCH_IN,
        BASE_FABRIC_COUNT,
        BASE_STRANDS,
        INCHES_PER_METRE,
        FLOSS_STRANDS_PER_SKEIN,
        DEFAULT_WASTE_FACTOR,
        BRAND_SKEIN_LENGTH,
        stitchesToSkeins,
        skeinsToStitches,
        threadCostPerStitch,
        rtThreadUsage,
        KEY_WASTE_FACTOR,
        skeinLengthForBrand,
        threadKeyUsage,
        formatSkeins,
        threadUsageParts,
        threadUsageText,
        threadUsageTitle
    };
}
