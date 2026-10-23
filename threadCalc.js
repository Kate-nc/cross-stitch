// threadCalc.js

// ════════════════════════════════════════════════════════════════════
// Module-root constants — named and commented. Never bury these in
// function bodies.
// ════════════════════════════════════════════════════════════════════

// Planning model: 0.5 inches per used strand at 14-count, including ordinary
// travel on the back (geometric path is about 0.345 inches). Add the chosen
// allowance once for tails, rework and other waste. With 20%, an 8 m skein
// covers about 1,575 full crosses using two strands. This is a planning
// benchmark, not a measured guarantee; see reports/thread-estimation-plan.md.
const BASE_THREAD_PER_STITCH_IN = 1.0; // aggregate SINGLE-STRAND inches, 14ct/2 strands
const BASE_FABRIC_COUNT         = 14;   // reference fabric count (count)
const BASE_STRANDS              = 2;    // reference strand count

// Unit conversion — exact, derived from 1 in = 2.54 cm.
const INCHES_PER_METRE  = 100 / 2.54; // 1 m = 100 cm
const FLOSS_STRANDS_PER_SKEIN = 6;    // standard stranded cotton skein

// Default waste factor — 20 %.  Applied as a MULTIPLIER: if you need X inches
// of thread, buy X × (1 + wasteFactor) worth of skein capacity.
// Convention: 10 % (experienced), 15–20 % (beginners).  Configurable.
const DEFAULT_WASTE_FACTOR = 0.20;

// Threads each stitch covers, when the caller doesn't say: stitchOverFor()
// from constants.js knows the "(over 2)" fabrics; without it, 1 (Aida).
function defaultStitchOver(fabricCount) {
  return (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : 1;
}
// Planning also works when required directly by Node without constants.js.
// Keep the legacy helper's fallback separate so consumption is unchanged.
function planningStitchOver(fabricCount) {
  return (typeof stitchOverFor === 'function') ? stitchOverFor(fabricCount) : ([25, 28, 32].includes(Number(fabricCount)) ? 2 : 1);
}

const BRAND_SKEIN_LENGTH = {
  DMC:     8.0,   // metres
  Anchor:  8.0,
  Madeira: 10.0,
  Cosmo:   8.0
};

// Ignore floating-point noise only, never a percentage or a display rounding.
function wholeSkeins(amount) { return Math.max(0, Math.ceil(amount - 1e-12)); }

// Ratios on imported blends are actual strand counts (2+1 means three in the
// needle). Otherwise split the chosen total equally. Preserve component brands.
function threadConstituents(entry, strandsUsed) {
  const e = entry || {}, brand = String(e.brand || 'dmc').toLowerCase();
  const blend = e.type === 'blend' || e.is_blended || (!e.type && ['dmc','anchor'].includes(brand) && String(e.id || '').includes('+'));
  let parts = blend ? (e.threads && e.threads.length ? e.threads :
    (e.blend_id ? [e.id, e.blend_id] : e.id == null ? [null, null] : String(e.id).split('+')).map(id => ({id: id}))) : [e];
  const ratio = e.blendRatio || e.blend_ratio;
  return parts.map(function(t, i) {
    const n = ratio && ratio[i] != null ? ratio[i] : t.strands;
    return Object.assign({}, t, {brand: String(t.brand || brand).toLowerCase(),
      strands: Number.isFinite(n) && n > 0 ? n : (strandsUsed || 2) / parts.length});
  });
}

// Shared purchasing model. Entries may carry fractional full-cross equivalents,
// or an explicit skein requirement from a library key. Never round demand before
// aggregating a physical thread and subtracting usable stock.
function threadDemandRows(entries, opts) {
  opts = opts || {};
  const byKey = new Map(), stash = opts.stash || {};
  (entries || []).forEach(function(e) {
    if (!e || e.id == null || String(e.id) === '' || String(e.id).startsWith('__')) return;
    const count = Number(e.count != null ? e.count : e.qty) || 0;
    if (count <= 0) return;
    threadConstituents(e, opts.strandsUsed).forEach(function(t) {
      const key = t.brand + ':' + t.id;
      let r = byKey.get(key);
      if (!r) {
        r = {p: {id: t.id, brand: t.brand, type: 'solid', name: t.name || '', rgb: t.rgb, count: 0},
          key: key, estimatedNeeded: 0, threadStitches: 0};
        byKey.set(key, r);
      }
      r.p.count += count;
      r.threadStitches += count * t.strands / 2;
      if (!r.p.name && t.name) r.p.name = t.name;
      r.estimatedNeeded += e.unit === 'skeins' ? count : stitchesToSkeins({stitchCount: count,
        fabricCount: opts.fabricCount || opts.fabricCt || 14, stitchOver: opts.stitchOver,
        strandsUsed: t.strands, skeinLengthM: opts.skeinLengthM || skeinLengthForBrand(t.brand),
        wasteFactor: opts.wasteFactor == null ? DEFAULT_WASTE_FACTOR : opts.wasteFactor}).skeinsRaw;
    });
  });
  return Array.from(byKey.values()).map(function(r) {
    if (!Number.isFinite(r.estimatedNeeded)) throw new Error('Cannot estimate thread demand with these settings');
    const e = stash[r.key];
    r.owned = typeof stashEffectiveQty === 'function' ? stashEffectiveQty(e) :
      (e && Number.isFinite(e.owned) ? Math.max(0, e.owned) : 0) +
      ({'mostly-full': .75, 'about-half': .5, remnant: .25}[e && e.partialStatus] || 0);
    r.needed = wholeSkeins(r.estimatedNeeded); // whole skeins from scratch
    r.missing = wholeSkeins(Math.max(0, r.estimatedNeeded - r.owned));
    r.status = r.missing === 0 ? 'owned' : r.owned > 0 ? 'partial' : 'needed';
    r.name = r.p.name || String(r.p.id);
    return r;
  });
}

// Convert chart units to fractional full-cross equivalents for planning. This
// never edits progress or consumption events. Backstitch/long stitches use
// twice their path length (front and return), relative to seven widths per
// full cross in the planning model. Knots use one cross equivalent; petite
// crosses use half, matching the existing material geometry convention.
function projectThreadEntries(project, remaining) {
  const p = project || {}, out = [], groups = new Map();
  const brand = p.threadBrand || (p.settings && p.settings.threadBrand) || 'dmc';
  function add(t, weight, marked) {
    if (!t || (remaining && marked)) return;
    if (Array.isArray(t)) t = {id: t[1] === 'k' ? '__skip__' : t[0], type: t[1] === 'b' ? 'blend' : 'solid'};
    if (t.id == null || String(t.id) === '' || String(t.id).startsWith('__') || !(weight > 0)) return;
    t = Object.assign({}, t, {brand: t.brand || brand});
    const key = JSON.stringify([t.id, t.brand, t.type, t.blendRatio, t.blend_ratio, t.threads, t.strands]);
    let e = groups.get(key);
    if (!e) { e = Object.assign({}, t, {count: 0}); groups.set(key, e); out.push(e); }
    e.count += weight;
  }
  const map = x => x instanceof Map ? x : new Map(x || []);
  (p.pattern || p.pat || p.p || []).forEach((t, i) => add(t, 1, p.done && p.done[i] === 1));
  const halves = map(p.halfStitches), hd = map(p.halfDone), pd = map(p.partialDone);
  halves.forEach((c, i) => ['fwd', 'bck'].forEach(side => add(c[side], .5, (hd.get(i) || {})[side])));
  let partials = map(p.partialStitches);
  if (typeof ProgressUnits !== 'undefined') partials = ProgressUnits.partialWithoutLegacyHalves(partials, halves, brand);
  partials.forEach((c, i) => ['TL', 'TR', 'BL', 'BR'].forEach(pos => {
    const marks = pd.get(i) || [];
    add(c[pos], .25, marks instanceof Set ? marks.has(pos) : marks.includes(pos));
  }));
  const sd = new Set(p.specialtyDone || []), kd = new Set(p.knotsDone || []), bd = new Set(p.bsDone || []);
  (p.specialtyStitches || []).forEach(st => {
    const weight = st.type === 'petite' ? .5 : st.type === 'long_stitch' ? 2 * Math.hypot(st.x2-st.x1, st.y2-st.y1) / 7 : 0;
    add(st.thread, weight, sd.has(st.uid));
  });
  (p.knots || []).forEach(k => add(k, 1, kd.has(k.x + ',' + k.y)));
  (p.bsLines || []).forEach(l => {
    let {x1, y1, x2, y2} = l;
    if (![x1,y1,x2,y2].every(Number.isFinite)) return;
    const distance = Math.hypot(x2-x1, y2-y1);
    if (x2 < x1 || (x2 === x1 && y2 < y1)) { [x1,x2] = [x2,x1]; [y1,y2] = [y2,y1]; }
    const id = l.colorId != null ? l.colorId : l.color;
    // Backstitch is normally one strand; an explicit line strand count wins.
    add({id: id, brand: l.brand || brand, strands: l.strands || 1}, 2 * distance / 7, bd.has([x1,y1,x2,y2,id].join(',')));
  });
  return out;
}

function stitchesToSkeins({
  stitchCount,
  fabricCount = 14,
  stitchOver = planningStitchOver(fabricCount),
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
  if (!Number.isFinite(strandsUsed) || strandsUsed <= 0) strandsUsed = 2;
  if (!Number.isFinite(skeinLengthM) || skeinLengthM <= 0) skeinLengthM = 8;
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
    const skeinsRaw = totalWithWasteIn / skeinLengthIn;
    return {
      skeinsExact:  Math.round(skeinsRaw * 100) / 100, // legacy display precision
      skeinsRaw: skeinsRaw, // use this unrounded value for all planning arithmetic
      skeinsToBuy:  wholeSkeins(skeinsRaw),
      totalThreadM: Math.round(flossLengthIn / INCHES_PER_METRE * 10) / 10
    };
  }

  // Blended — split floss proportionally by strand ratio before applying waste.
  const validRatio = Array.isArray(blendRatio) && blendRatio.length === 2 && blendRatio.every(n => Number.isFinite(n) && n > 0);
  const [strandsA, strandsB] = validRatio ? blendRatio : [strandsUsed / 2, strandsUsed / 2];
  const threadA_in = flossLengthIn * (strandsA / strandsUsed);
  const threadB_in = flossLengthIn * (strandsB / strandsUsed);

  const skeinsA = threadA_in * (1 + wasteFactor) / skeinLengthIn;
  const skeinsB = threadB_in * (1 + wasteFactor) / skeinLengthIn;

  return {
    colorA: {
      skeinsExact: Math.round(skeinsA * 100) / 100,
      skeinsRaw: skeinsA,
      skeinsToBuy: wholeSkeins(skeinsA)
    },
    colorB: {
      skeinsExact: Math.round(skeinsB * 100) / 100,
      skeinsRaw: skeinsB,
      skeinsToBuy: wholeSkeins(skeinsB)
    },
    totalThreadM: Math.round((threadA_in + threadB_in) / INCHES_PER_METRE * 10) / 10
  };
}

function skeinsToStitches({
  skeinCount,
  fabricCount = 14,
  stitchOver = planningStitchOver(fabricCount),
  strandsUsed = 2,
  skeinLengthM = 8.0,
  wasteFactor = DEFAULT_WASTE_FACTOR
}) {
  if (fabricCount <= 0) fabricCount = 14;
  if (!Number.isFinite(strandsUsed) || strandsUsed <= 0) strandsUsed = 2;
  if (!Number.isFinite(skeinLengthM) || skeinLengthM <= 0) skeinLengthM = 8;
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
  // Legacy helper: retain its original 1.4 anchor for compatibility. Durable
  // recorded consumption uses thread-accounting.js model 2; recalibrating
  // future shopping estimates must never revalue historical debits.
  var baseCostIn         = 1.4 * BASE_FABRIC_COUNT / (fc / defaultStitchOver(fc)) * strands / BASE_STRANDS;
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
// given, else each constituent brand's (a Madeira
// skein is 10 m), else 8 m. Returns { isBlend, count, strands: [n] | [a, b],
// skeins: [exact] | [a, b], toBuy: [whole skeins, at least 1 once stitched] }.
function threadKeyUsage(entry, opts) {
  opts = opts || {};
  const e = entry || {};
  const fabricCount = Number.isFinite(opts.fabricCount) && opts.fabricCount > 0 ? opts.fabricCount : 14;
  const strandsUsed = Number.isFinite(opts.strandsUsed) && opts.strandsUsed > 0 ? opts.strandsUsed : BASE_STRANDS;
  const wasteFactor = opts.wasteFactor == null ? KEY_WASTE_FACTOR : opts.wasteFactor;
  const count = Number.isFinite(Number(e.count)) && Number(e.count) > 0 ? Number(e.count) : 0;
  const parts = threadConstituents(e, strandsUsed);
  const isBlend = parts.length > 1;
  const strands = parts.map(function(t) { return t.strands; });
  const skeins = parts.map(function (t) {
    return stitchesToSkeins({ stitchCount: count, fabricCount: fabricCount, stitchOver: opts.stitchOver,
      strandsUsed: t.strands, wasteFactor: wasteFactor,
      skeinLengthM: opts.skeinLengthM || skeinLengthForBrand(t.brand) }).skeinsRaw;
  });
  const toBuy = skeins.map(wholeSkeins);
  return { isBlend: isBlend, count: count, strands: strands, skeins: skeins, toBuy: toBuy };
}

// "1.3 skeins", "1 skein", "under 0.1 skein", "0 skeins".
function formatSkeins(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 skeins';
  if (n < 0.05) return 'under 0.1 skein';
  const r = Math.round(n * 10) / 10;
  if (r >= 1 && Number.isInteger(r) && n > r + 1e-12) return 'just over ' + r + (r === 1 ? ' skein' : ' skeins');
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
function _aboutSkeins(n) { return (n < 0.05 && n > 0) || formatSkeins(n).indexOf('just over') === 0 ? formatSkeins(n) : 'about ' + formatSkeins(n); }

// The same figures in full, for a tooltip or screen reader.
function threadUsageTitle(u) {
  if (!u) return '';
  if (!u.isBlend) {
    return _strandsWord(u.strands[0]) + ' in the needle; ' + _aboutSkeins(u.skeins[0]) + ' of thread' + (u.toBuy[0] ? ' (from scratch: buy ' + u.toBuy[0] + ')' : '');
  }
  const even = u.strands[0] === u.strands[1];
  const st = even ? (u.strands[0] === 1 ? 'One strand' : _strandsWord(u.strands[0])) + ' of each thread in the needle' : u.strands[0] + ' and ' + u.strands[1] + ' strands in the needle';
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
        wholeSkeins,
        threadConstituents,
        threadDemandRows,
        projectThreadEntries,
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
