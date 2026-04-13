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

  var p = opts.allowedPalette
    ? quantizeConstrained(raw, width, height, maxC, opts.allowedPalette, {seed: opts.seed})
    : quantize(raw, width, height, maxC, {seed: opts.seed});
  if (!p.length) return null;

  var saliencyMap = generateSaliencyMap(raw, width, height);
  var cdt = dith && stitchCleanup && stitchCleanup.smoothDithering ? 4.0 : 0.0;
  var mapped = dith
    ? doDither(raw, width, height, p, allowBlends, saliencyMap, { confettiDitherThreshold: cdt })
    : doMap(raw, width, height, p, allowBlends);

  if (skipBg) {
    var bl = rgbToLab(bgCol[0], bgCol[1], bgCol[2]);
    for (var i = 0; i < mapped.length; i++) {
      if (dE(rgbToLab(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]), bl) < bgTh) {
        mapped[i] = { type: "skip", id: "__skip__", rgb: [255, 255, 255], lab: [100, 0, 0] };
      }
    }
  }

  var preLabels = labelConnectedComponents(mapped, width, height);
  var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
  var confettiClean = null;
  var preCleanupIds = null;

  if (stitchCleanup && stitchCleanup.enabled) {
    var cleanupStrength = Object.prototype.hasOwnProperty.call(STRENGTH_MAP, stitchCleanup.strength)
      ? stitchCleanup.strength : "balanced";
    var sp = STRENGTH_MAP[cleanupStrength];
    var edgeMap = stitchCleanup.protectDetails ? generateEdgeMap(raw, width, height) : null;
    preCleanupIds = mapped.map(function(m) { return m.id; });
    mapped = removeOrphanStitches(mapped, width, height, sp.maxOrphanSize, edgeMap, saliencyMap, { saliencyMultiplier: sp.saliencyMultiplier }, preLabels);
    var postLabels = labelConnectedComponents(mapped, width, height);
    confettiClean = analyzeConfetti(mapped, width, height, postLabels);
  }

  return { mapped: mapped, palette: p, confettiRaw: confettiRaw, confettiClean: confettiClean, saliencyMap: saliencyMap, preCleanupIds: preCleanupIds };
};

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

  var pipelineResult = runCleanupPipeline(raw, sW, sH, { maxC: maxC, dith: dith, allowBlends: allowBlends, skipBg: skipBg, bgCol: bgCol, bgTh: bgTh, stitchCleanup: stitchCleanup, allowedPalette: opts.allowedPalette || null, seed: opts.seed });
  if (!pipelineResult) return null;

  var mapped = pipelineResult.mapped;
  var p = pipelineResult.palette;
  var rawConfetti = pipelineResult.confettiRaw;
  var cleanConfetti = pipelineResult.confettiClean || pipelineResult.confettiRaw;

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

  // Safety check: enforce maxC
  for (var safe = 0; safe < 5; safe++) {
    var ids = new Set();
    for (var k = 0; k < mapped.length; k++) {
      var m = mapped[k];
      if (m.id === "__skip__") continue;
      if (m.type === "blend" && m.threads) m.threads.forEach(function(t) { ids.add(t.id); });
      else ids.add(m.id);
    }
    if (ids.size <= maxC) break;
    var tu = {};
    for (var k2 = 0; k2 < mapped.length; k2++) {
      var m2 = mapped[k2];
      if (m2.id === "__skip__") continue;
      if (m2.type === "blend" && m2.threads) m2.threads.forEach(function(t) { tu[t.id] = (tu[t.id] || 0) + 1; });
      else tu[m2.id] = (tu[m2.id] || 0) + 1;
    }
    var sorted = Object.entries(tu).sort(function(a, b) { return b[1] - a[1]; });
    var ks = new Set(sorted.slice(0, maxC).map(function(e) { return e[0]; }));
    var kp = p.filter(function(t) { return ks.has(t.id); });
    if (!kp.length) break;
    for (var k3 = 0; k3 < mapped.length; k3++) {
      var m3 = mapped[k3];
      if (m3.id === "__skip__") continue;
      var nr = m3.type === "blend" && m3.threads
        ? m3.threads.some(function(t) { return !ks.has(t.id); })
        : !ks.has(m3.id);
      if (nr) mapped[k3] = findSolid(m3.lab || rgbToLab(raw[k3 * 4], raw[k3 * 4 + 1], raw[k3 * 4 + 2]), kp);
    }
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
