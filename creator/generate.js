/* creator/generate.js — Pure pattern-generation pipeline.
   All inputs passed explicitly; returns { pat, pal, cmap, confettiData } or null.
   Uses globals: quantize, doDither, doMap, buildPalette, rgbToLab, dE,
                 generateSaliencyMap, generateEdgeMap, labelConnectedComponents,
                 removeOrphanStitches, analyzeConfetti, findSolid,
                 applyGaussianBlur, applyMedianFilter
   (all defined in colour-utils.js / constants.js). */

// Strength → numeric pipeline parameters for the Stitch Cleanup pipeline.
// (Originally defined inline in index.html; moved here because generate uses it.)
window.STRENGTH_MAP = {
  gentle:   { maxOrphanSize: 2, saliencyMultiplier: 1.0 },
  balanced: { maxOrphanSize: 3, saliencyMultiplier: 2.0 },
  thorough: { maxOrphanSize: 5, saliencyMultiplier: 3.0 },
};

/**
 * Shared quantize → map/dither → bg-removal → confetti → orphan-removal pipeline.
 * Called by both generatePreview and runGenerationPipeline so the two stay in sync.
 *
 * @param {Uint8ClampedArray} raw    RGBA pixel data (smoothing already applied)
 * @param {number}            width  Grid width in stitches
 * @param {number}            height Grid height in stitches
 * @param {object}            opts   Pipeline settings
 * @returns {{ mapped, palette, confettiRaw, confettiClean, saliencyMap }} or null
 */
window.runCleanupPipeline = function runCleanupPipeline(raw, width, height, opts) {
  var maxC = opts.maxC, dith = opts.dith, allowBlends = opts.allowBlends;
  var skipBg = opts.skipBg, bgCol = opts.bgCol, bgTh = opts.bgTh;
  var stitchCleanup = opts.stitchCleanup;
  var dithStrength = (typeof opts.dithStrength === "number") ? opts.dithStrength : 1.0;
  var minSt = (typeof opts.minSt === "number" && opts.minSt > 0) ? opts.minSt : 0;

  var p = quantize(raw, width, height, maxC, opts.allowedPalette, {seed: opts.seed});
  if (!p.length) return null;

  var saliencyMap = generateSaliencyMap(raw, width, height);
  var cdt = dith && stitchCleanup && stitchCleanup.smoothDithering ? 4.0 : 0.0;
  var mapped = dith
    ? doDither(raw, width, height, p, allowBlends, saliencyMap, { confettiDitherThreshold: cdt, ditherStrength: dithStrength })
    : doMap(raw, width, height, p, allowBlends);

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

  var preLabels = labelConnectedComponents(mapped, width, height);
  var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
  var confettiClean = null;
  var preCleanupIds = null;

  var orphansOpt = opts.orphans != null ? opts.orphans : null;
  var runCleanup = orphansOpt != null ? (orphansOpt > 0) : (stitchCleanup && stitchCleanup.enabled);
  if (runCleanup) {
    var maxOrphanSize, saliencyMult;
    if (orphansOpt != null) {
      maxOrphanSize = orphansOpt;
      var _csMap = stitchCleanup && STRENGTH_MAP[stitchCleanup.strength] ? STRENGTH_MAP[stitchCleanup.strength] : STRENGTH_MAP.balanced;
      saliencyMult = _csMap.saliencyMultiplier;
    } else {
      var cleanupStrength = Object.prototype.hasOwnProperty.call(STRENGTH_MAP, stitchCleanup.strength)
        ? stitchCleanup.strength : "balanced";
      var sp = STRENGTH_MAP[cleanupStrength];
      maxOrphanSize = sp.maxOrphanSize;
      saliencyMult = sp.saliencyMultiplier;
    }
    var edgeMap = (stitchCleanup && stitchCleanup.protectDetails) ? generateEdgeMap(raw, width, height) : null;
    preCleanupIds = mapped.map(function(m) { return m.id; });
    mapped = removeOrphanStitches(mapped, width, height, maxOrphanSize, edgeMap, saliencyMap, { saliencyMultiplier: saliencyMult }, preLabels);
    var postLabels = labelConnectedComponents(mapped, width, height);
    confettiClean = analyzeConfetti(mapped, width, height, postLabels);
  }

  return { mapped: mapped, palette: p, confettiRaw: confettiRaw, confettiClean: confettiClean, saliencyMap: saliencyMap, preCleanupIds: preCleanupIds };
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
  cx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)";
  cx.drawImage(img, 0, 0, sW, sH);
  cx.filter = "none";
  var raw = cx.getImageData(0, 0, sW, sH).data;

  if (smooth > 0) {
    if (smoothType === "gaussian") applyGaussianBlur(raw, sW, sH, smooth);
    else applyMedianFilter(raw, sW, sH, smooth);
  }

  var pipelineResult = runCleanupPipeline(raw, sW, sH, {
    maxC: maxC, dith: dith, dithStrength: opts.dithStrength,
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
  };
};
