/* creator/generate.js — Pure pattern-generation pipeline.
   All inputs passed explicitly; returns { pat, pal, cmap, confettiData } or null.
   Uses globals: quantize, quantizeConstrained, doDither, doRiemersma, doMap, buildPalette, rgbToLab, dE,
                 generateSaliencyMap, generateEdgeMap, labelConnectedComponents,
                 removeOrphanStitches, analyzeConfetti, findSolid,
                 applyGaussianBlur, applyMedianFilter, applyBilateralFilter,
                 disambiguateSimilarNeighbours, DISAMBIG_LEVEL_MAP
   (all defined in colour-utils.js / constants.js). */

/**
 * Progressive area-averaging downscale for large reduction ratios.
 *
 * A single canvas drawImage at 'low' quality (bilinear) discards most source
 * pixels at ratios above ~2:1, producing speckle noise in flat regions.
 * This helper steps the image down in 2:1 halvings until within 2× of the
 * target.  At each 2:1 step bilinear sampling covers every source pixel
 * (equivalent to area averaging), so the chain produces a clean mean for
 * any reduction ratio.
 *
 * Returns the source unchanged when the ratio is already ≤ 2:1 in both
 * dimensions — the caller's final drawImage with 'high' quality suffices.
 *
 * Used by runGenerationPipeline, startGeneration (useCreatorState), and
 * generatePreview (usePreview).  Defined here because generate.js is the
 * first entry in the bundle ORDER so the function is in scope for all three.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {number} targetW
 * @param {number} targetH
 * @returns {HTMLImageElement|HTMLCanvasElement}
 */
function prescaleForGrid(source, targetW, targetH) {
  var srcW = (source.naturalWidth || source.width) | 0;
  var srcH = (source.naturalHeight || source.height) | 0;
  if (!srcW || !srcH || (srcW <= targetW * 2 && srcH <= targetH * 2)) return source;
  var cur = source;
  var w = srcW, h = srcH;
  while (w > targetW * 2 || h > targetH * 2) {
    w = Math.max(targetW, Math.ceil(w / 2));
    h = Math.max(targetH, Math.ceil(h / 2));
    var tc = document.createElement('canvas');
    tc.width = w; tc.height = h;
    var tcx = tc.getContext('2d');
    tcx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in tcx) tcx.imageSmoothingQuality = 'high';
    tcx.drawImage(cur, 0, 0, w, h);
    cur = tc;
  }
  return cur;
}

/**
 * Apply a pre-downscale luminance unsharp mask to a source image/canvas.
 *
 * Works at a fixed "working resolution" of 8× the target grid dimensions
 * (capped at the source size) so the filter parameters (radius, threshold)
 * are image-size-independent — a 50×50 target sharpens at ≤400×400,
 * a 120×80 target at ≤960×640.  The sharpened canvas is then passed
 * through prescaleForGrid so the preserved edge signal survives the
 * area-average chain.
 *
 * Delegates pixel manipulation to applyUnsharpMask() in colour-utils.js.
 * DOM-only — cannot be called inside a Web Worker.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {number} targetW  Pattern grid width in stitches
 * @param {number} targetH  Pattern grid height in stitches
 * @param {object} [opts]   Forwarded verbatim to applyUnsharpMask
 *   @param {number} [opts.radius=2.0]    Gaussian sigma in working-res pixels
 *   @param {number} [opts.amount=0.5]    USM strength (0–2); 0.5 is conservative
 *   @param {number} [opts.threshold=8]   min |L − blur(L)| in Lab L units
 * @returns {HTMLCanvasElement}  canvas containing the sharpened image
 */
function applyPreSharpenCanvas(source, targetW, targetH, opts) {
  var srcW = (source.naturalWidth  || source.width)  | 0;
  var srcH = (source.naturalHeight || source.height) | 0;
  if (!srcW || !srcH) return source;
  // Work at 8× the target dimensions (capped at source size so we never
  // upscale — upscaling would invent detail that doesn't exist).
  var wW = Math.min(srcW, targetW * 8);
  var wH = Math.min(srcH, targetH * 8);
  // Never go below the target size itself
  if (wW < targetW) wW = Math.min(srcW, targetW);
  if (wH < targetH) wH = Math.min(srcH, targetH);
  var c = document.createElement('canvas');
  c.width = wW; c.height = wH;
  var cx = c.getContext('2d');
  cx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in cx) cx.imageSmoothingQuality = 'high';
  cx.drawImage(source, 0, 0, wW, wH);
  var id = cx.getImageData(0, 0, wW, wH);
  applyUnsharpMask(id.data, wW, wH, opts);
  cx.putImageData(id, 0, 0);
  return c;
}

// Strength → numeric pipeline parameters for the Stitch Cleanup pipeline.
// (Originally defined inline in index.html; moved here because generate uses it.)
window.STRENGTH_MAP = {
  gentle:   { maxOrphanSize: 2, saliencyMultiplier: 1.0 },
  balanced: { maxOrphanSize: 4, saliencyMultiplier: 2.0 },
  thorough: { maxOrphanSize: 6, saliencyMultiplier: 3.0 },
};

// Maximum passes for the orphan-removal stability loop.
// The loop also exits early when no change occurs or orphan count stops decreasing.
// 8 is a conservative upper cap; normal images typically stabilise in 1–3 passes.
var ORPHAN_MAX_ITERATIONS = 8;

// ΔE2000 contrast guard for orphan removal.
// A small region whose nearest-neighbour palette colour differs by more than this
// value is treated as a deliberate high-contrast feature (e.g. a white catchlight
// in a dark eye, ΔE ≈ 70) and is NOT merged regardless of its size.
// Noise artefacts typically differ from their surroundings by ΔE < 20;
// intentional accents are reliably above ΔE 30.  Set to 0 to disable.
var ORPHAN_CONTRAST_GUARD_DE = 30;

/**
 * Shared quantize → map/dither → bg-removal → confetti → orphan-removal pipeline.
 * Called by both generatePreview and runGenerationPipeline so the two stay in sync.
 *
 * @param {Uint8ClampedArray} raw    RGBA pixel data (smoothing already applied)
 * @param {number}            width  Grid width in stitches
 * @param {number}            height Grid height in stitches
 * @param {object}            opts   Pipeline settings
 * @returns {{ mapped, palette, confettiRaw, confettiClean, saliencyMap, preCleanupIds, disambigData }} or null
 */
window.runCleanupPipeline = function runCleanupPipeline(raw, width, height, opts) {
  var maxC = opts.maxC, dith = opts.dith, allowBlends = opts.allowBlends;
  var skipBg = opts.skipBg, bgCol = opts.bgCol, bgTh = opts.bgTh;
  var stitchCleanup = opts.stitchCleanup;
  var dithStrength = (typeof opts.dithStrength === "number") ? opts.dithStrength : 1.0;
  var dithAlgo = opts.dithAlgo || (dith ? "atkinson" : "off");
  var dithBayerSize = opts.dithBayerSize || 4;
  var minSt = (typeof opts.minSt === "number" && opts.minSt > 0) ? opts.minSt : 0;

  if (opts.preSmooth) applyBilateralFilter(raw, width, height);

  var p = quantizeConstrained(raw, width, height, maxC, opts.allowedPalette, {seed: opts.seed});
  if (!p.length) return null;

  var saliencyMap = generateSaliencyMap(raw, width, height);
  var cdt = dith && dithAlgo === "atkinson" && stitchCleanup && stitchCleanup.smoothDithering ? 4.0 : 0.0;
  var mapped;
  if (!dith) {
    mapped = doMap(raw, width, height, p, allowBlends);
  } else if (dithAlgo === "bayer") {
    mapped = doBayerDither(raw, width, height, p, allowBlends, dithBayerSize);
  } else if (dithAlgo === "riemersma") {
    mapped = doRiemersma(raw, width, height, p, allowBlends, saliencyMap, {});
  } else {
    mapped = doDither(raw, width, height, p, allowBlends, saliencyMap, { confettiDitherThreshold: cdt, ditherStrength: dithStrength });
  }

  if (skipBg) {
    var bl = rgbToLab(bgCol[0], bgCol[1], bgCol[2]);
    for (var i = 0; i < mapped.length; i++) {
      if (dE(rgbToLab(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]), bl) < bgTh) {
        mapped[i] = { type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0] };
      }
    }
  }

  // ── Min-stitches rebucket (C5) ───────────────────────────────────────────
  // Collapse any colour with fewer than `minSt` cells into its nearest
  // surviving colour. Up to 3 passes — a freshly-collapsed cell may itself
  // tip another colour below threshold.
  if (minSt > 0) {
    for (var pass = 0; pass < 3; pass++) {
      var ep = buildPalette(mapped);
      var rare = ep.pal.filter(function(e) { return e.count < minSt; });
      var keep = ep.pal.filter(function(e) { return e.count >= minSt; });
      if (!rare.length || !keep.length) break;
      var rm2 = {};
      rare.forEach(function(r) {
        var b = null, bd = 1e9;
        keep.forEach(function(k) { var d = dE(r.lab, k.lab); if (d < bd) { bd = d; b = k.id; } });
        if (b) rm2[r.id] = b;
      });
      var changed = false;
      var keepMap = {};
      keep.forEach(function(k) { keepMap[k.id] = k; });
      for (var j = 0; j < mapped.length; j++) {
        if (mapped[j].id !== "__skip__" && rm2[mapped[j].id]) {
          mapped[j] = Object.assign({}, keepMap[rm2[mapped[j].id]]);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  // ── Auto-coverage post-pass ──────────────────────────────────────────────
  // Remove colours that cover less than 0.5% of non-skip cells (capped at 15
  // stitches) regardless of whether minSt was set. This prevents one or two
  // quantisation stragglers from consuming palette slots. Only runs when its
  // threshold would exceed the user's explicit minSt setting, so the two
  // passes are never redundant.
  {
    var _atTotal = 0;
    for (var _ati = 0; _ati < mapped.length; _ati++) { if (mapped[_ati].id !== '__skip__') _atTotal++; }
    var _autoThresh = Math.max(2, Math.min(15, Math.floor(_atTotal * 0.005)));
    if (_autoThresh > minSt) {
      for (var _apass = 0; _apass < 3; _apass++) {
        var _aep = buildPalette(mapped);
        var _arare = _aep.pal.filter(function(e) { return e.count < _autoThresh; });
        var _akeep = _aep.pal.filter(function(e) { return e.count >= _autoThresh; });
        if (!_arare.length || !_akeep.length) break;
        var _arm = {};
        _arare.forEach(function(r) {
          var _ab = null, _abd = 1e9;
          _akeep.forEach(function(k) { var d = dE(r.lab, k.lab); if (d < _abd) { _abd = d; _ab = k.id; } });
          if (_ab) _arm[r.id] = _ab;
        });
        var _akm = {};
        _akeep.forEach(function(k) { _akm[k.id] = k; });
        var _achanged = false;
        for (var _aj = 0; _aj < mapped.length; _aj++) {
          if (mapped[_aj].id !== '__skip__' && _arm[mapped[_aj].id]) {
            mapped[_aj] = Object.assign({}, _akm[_arm[mapped[_aj].id]]);
            _achanged = true;
          }
        }
        if (!_achanged) break;
      }
    }
  }

  var preLabels = labelConnectedComponents(mapped, width, height);
  var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
  var confettiClean = null;
  var preCleanupIds = null;

  // Cleanup runs if EITHER the user moved the Remove-Orphans slider above 0
  // OR they enabled the Stitch Cleanup toggle. Treating `orphans === 0` as
  // "explicitly off" (the previous behaviour) silently suppressed the separate
  // Stitch Cleanup toggle and all its sub-options, since the orphans slider
  // defaults to 0.
  var orphansOpt = (typeof opts.orphans === 'number' && opts.orphans > 0) ? opts.orphans : 0;
  var cleanupEnabled = !!(stitchCleanup && stitchCleanup.enabled);
  var runCleanup = orphansOpt > 0 || cleanupEnabled;
  if (runCleanup) {
    var cleanupStrength = stitchCleanup && Object.prototype.hasOwnProperty.call(STRENGTH_MAP, stitchCleanup.strength)
      ? stitchCleanup.strength : 'balanced';
    var sp = STRENGTH_MAP[cleanupStrength];
    // Orphans slider is the explicit override when set; otherwise use the
    // strength preset's maxOrphanSize.
    var maxOrphanSize = orphansOpt > 0 ? orphansOpt : sp.maxOrphanSize;
    var saliencyMult = sp.saliencyMultiplier;
    var edgeMap = (stitchCleanup && stitchCleanup.protectDetails) ? generateEdgeMap(raw, width, height) : null;
    // The ΔE contrast guard is a sibling of edge protection: both guard deliberate
    // small features.  Disable it when the user has turned off protectDetails.
    var contrastGuard = (stitchCleanup && stitchCleanup.protectDetails) ? ORPHAN_CONTRAST_GUARD_DE : 0;
    preCleanupIds = mapped.map(function(m) { return m.id; });
    mapped = removeOrphanStitches(mapped, width, height, maxOrphanSize, edgeMap, saliencyMap, { saliencyMultiplier: saliencyMult, deContrastGuard: contrastGuard, maxIterations: ORPHAN_MAX_ITERATIONS }, preLabels);
    var postLabels = labelConnectedComponents(mapped, width, height);
    confettiClean = analyzeConfetti(mapped, width, height, postLabels);
  }

  // ── Stage 9: Adjacent-cell colour disambiguation ────────────────────────────
  // Prevents adjacent cells from being assigned perceptually indistinguishable
  // thread colours (dE2000 < threshold). Off by default (opts.disambig falsy).
  var disambigData = null;
  if (opts.disambig && opts.disambigLevel && opts.disambigLevel !== 'off') {
    var dlevel = (typeof DISAMBIG_LEVEL_MAP !== 'undefined' ? DISAMBIG_LEVEL_MAP : {})[opts.disambigLevel] || { threshold: 15, maxDegradation: 20 };
    // Reuse edgeMap from Stage 8 cleanup if available; otherwise compute now.
    // `edgeMap` is var-scoped so it's accessible here (undefined if cleanup didn't run).
    var disambigEdgeMap = (typeof edgeMap !== 'undefined' ? edgeMap : null) || generateEdgeMap(raw, width, height);
    // Solid palette entries only — blend entries don't have a single .lab value
    var solidPalette = p.filter(function(e) { return e.type !== 'blend' && e.lab; });
    var dr = disambiguateSimilarNeighbours(mapped, width, height, disambigEdgeMap, saliencyMap, solidPalette, {
      threshold:      dlevel.threshold,
      maxDegradation: dlevel.maxDegradation,
      maxIterations:  5,
    });
    disambigData = { swaps: dr.totalSwaps, iterations: dr.iterations };
  }

  return { mapped: mapped, palette: p, confettiRaw: confettiRaw, confettiClean: confettiClean, saliencyMap: saliencyMap, preCleanupIds: preCleanupIds, disambigData: disambigData };
};

// Collect the unique set of thread ids referenced by a mapped pattern.
// Blend cells expand to their constituent thread ids.
function collectPaletteIds(mapped) {
  var ids = new Set();
  for (var i = 0; i < mapped.length; i++) {
    var m = mapped[i];
    if (m.id === "__skip__") continue;
    if (m.type === "blend" && m.threads) m.threads.forEach(function(t) { ids.add(t.id); });
    else ids.add(m.id);
  }
  return ids;
}

// Build an id → usage-count map for a mapped pattern.
function buildPaletteUsageMap(mapped) {
  var tu = {};
  for (var i = 0; i < mapped.length; i++) {
    var m = mapped[i];
    if (m.id === "__skip__") continue;
    if (m.type === "blend" && m.threads) m.threads.forEach(function(t) { tu[t.id] = (tu[t.id] || 0) + 1; });
    else tu[m.id] = (tu[m.id] || 0) + 1;
  }
  return tu;
}

// Pick the top `maxC` thread ids by usage. Returns a Set of id strings.
function findTopThreads(usageMap, maxC) {
  var sorted = Object.entries(usageMap).sort(function(a, b) { return b[1] - a[1]; });
  return new Set(sorted.slice(0, maxC).map(function(e) { return e[0]; }));
}

// In-place: rewrite any cell whose colour isn't in `keptIds` to its nearest
// solid in `keptPalette`. Mutates `mapped`.
function migrateNonKeptColors(mapped, keptIds, keptPalette, raw) {
  for (var i = 0; i < mapped.length; i++) {
    var m = mapped[i];
    if (m.id === "__skip__") continue;
    var notRetained = m.type === "blend" && m.threads
      ? m.threads.some(function(t) { return !keptIds.has(t.id); })
      : !keptIds.has(m.id);
    if (notRetained) {
      mapped[i] = findSolid(m.lab || rgbToLab(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]), keptPalette);
    }
  }
}

/**
 * Run the full image-to-pattern generation pipeline.
 *
 * @param {HTMLImageElement} img  - Source image
 * @param {object} opts           - Generation parameters
 * @returns {{ pat, pal, cmap, confettiData }} or null if no palette found
 */
window.runGenerationPipeline = function runGenerationPipeline(img, opts) {
  var sW = opts.sW, sH = opts.sH, maxC = opts.maxC;
  var bri = opts.bri, con = opts.con, sat = opts.sat;
  var dith = opts.dith, skipBg = opts.skipBg, bgCol = opts.bgCol, bgTh = opts.bgTh;
  var minSt = opts.minSt, smooth = opts.smooth, smoothType = opts.smoothType;
  var stitchCleanup = opts.stitchCleanup, allowBlends = opts.allowBlends;

  // Boundary validation: a 0-width or 0-height grid produces no stitches and
  // would crash quantize() when it indexes data[i*4]. Bail out early so the
  // caller can surface a friendly error.
  if (!Number.isFinite(sW) || !Number.isFinite(sH) || sW <= 0 || sH <= 0) return null;

  var c = document.createElement("canvas");
  c.width = sW; c.height = sH;
  var cx = c.getContext("2d");
  cx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in cx) cx.imageSmoothingQuality = 'high';
  cx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)";
  var _preSrc = opts.preSharpenOpts ? applyPreSharpenCanvas(img, sW, sH, opts.preSharpenOpts) : img;
  cx.drawImage(prescaleForGrid(_preSrc, sW, sH), 0, 0, sW, sH);
  cx.filter = "none";
  var raw = cx.getImageData(0, 0, sW, sH).data;

  if (smooth > 0) {
    if (smoothType === "gaussian") applyGaussianBlur(raw, sW, sH, smooth);
    else if (smoothType === "bilateral") applyBilateralFilter(raw, sW, sH);
    else applyMedianFilter(raw, sW, sH, smooth);
  }

  var pipelineResult = runCleanupPipeline(raw, sW, sH, {
    maxC: maxC, dith: dith, dithStrength: opts.dithStrength,
    dithAlgo: opts.dithAlgo, dithBayerSize: opts.dithBayerSize,
    allowBlends: allowBlends, allowedPalette: opts.allowedPalette || null,
    skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
    stitchCleanup: stitchCleanup, orphans: opts.orphans,
    minSt: minSt, seed: opts.seed,
  });
  if (!pipelineResult) return null;

  var mapped = pipelineResult.mapped;
  var p = pipelineResult.palette;
  var rawConfetti = pipelineResult.confettiRaw;
  var cleanConfetti = pipelineResult.confettiClean || pipelineResult.confettiRaw;

  // (minSt rebucket lives inside runCleanupPipeline so the preview honours it too.)

  // Safety check: enforce maxC
  for (var safe = 0; safe < 5; safe++) {
    var ids = collectPaletteIds(mapped);
    if (ids.size <= maxC) break;
    var tu = buildPaletteUsageMap(mapped);
    var ks = findTopThreads(tu, maxC);
    var kp = p.filter(function(t) { return ks.has(t.id); });
    if (!kp.length) break;
    migrateNonKeptColors(mapped, ks, kp, raw);
  }

  var palResult = buildPalette(mapped);
  return {
    pat: mapped,
    pal: palResult.pal,
    cmap: palResult.cmap,
    confettiData: { raw: rawConfetti, clean: cleanConfetti },
    preCleanupIds: pipelineResult.preCleanupIds,
    disambigData: pipelineResult.disambigData,
  };
};
