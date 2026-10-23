/* creator/generate.js — Pure pattern-generation pipeline.
   All inputs passed explicitly; returns { pat, pal, cmap, confettiData } or null.
   Uses globals: quantize, quantizeConstrained, doDither, doRiemersma, doMap, buildPalette, rgbToLab, dE,
                 foldRareColours, RARE_COLOUR_CONTRAST_GUARD_DE,
                 generateSaliencyMap, generateEdgeMap, labelConnectedComponents,
                 removeOrphanStitches, runConfettiCleanup, analyzeConfetti, findSolid,
                 applyGaussianBlur, applyMedianFilter, applyBilateralFilter,
                 disambiguateSimilarNeighbours, DISAMBIG_LEVEL_MAP, linearAreaDownscale, LINEAR_SHRINK_MAX_SOURCE_AREA,
                 applyUnsharpMask; _applyImageFilters (useCreatorState.js)
   (all defined in colour-utils.js / constants.js). */

// The averaged picture for each picture element, for the last few grid sizes
// asked of it (the chart, Compare options' sizes, the stash gallery), so
// moving Brightness, Contrast or Saturation, a Compare options batch and
// Generate don't each read the whole picture again (about 80 ms for a
// 2000-pixel photo, longer on a phone). Canvases are never cached: their
// pixels can change under the same object.
var _gridPixelsCache = typeof WeakMap === "function" ? new WeakMap() : null;
var GRID_PIXELS_CACHE_SIZES = 6;

/**
 * The picture at grid size: one RGBA pixel per stitch, each the light-correct
 * average of the picture under it (linearAreaDownscale, colour-utils.js), then
 * brightness / contrast / saturation applied to that stitch colour
 * (_applyImageFilters, the same formula as the CSS filters, on every
 * browser). The one place that turns a picture into stitch pixels, shared by
 * Generate, the preview, Compare options and the stash gallery so they all
 * see the same thing.
 * Each axis is averaged where it shrinks; where the grid is bigger than the
 * picture there is nothing to average and the browser's smooth scaling
 * enlarges it, as before. DOM-only.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source
 * @param {number} targetW  Grid width in stitches
 * @param {number} targetH  Grid height in stitches
 * @param {object} [opts]   { bri, con, sat (each -100..100, 0 = unchanged),
 *                            preSharpenOpts (applyUnsharpMask options or null) }
 * @returns {ImageData}
 */
function gridPixels(source, targetW, targetH, opts) {
  opts = opts || {};
  var bri = opts.bri || 0, con = opts.con || 0, sat = opts.sat || 0;
  // The picture's own size is part of the key, in case an element is ever
  // reused for another picture (the app makes a new one each time). Not its
  // src: reading a data URL of a few megabytes takes about 20 ms each time.
  var srcSize = source ? (source.naturalWidth || source.width) + "x" + (source.naturalHeight || source.height) : "";
  var key = targetW + "x" + targetH + "|" + (opts.preSharpenOpts ? JSON.stringify(opts.preSharpenOpts) : "") + "|" + srcSize;
  var cacheable = !!(_gridPixelsCache && source && typeof source === "object" && typeof source.getContext !== "function");
  var sizes = cacheable ? _gridPixelsCache.get(source) : null;
  var averaged = sizes ? sizes.get(key) : null;
  if (!averaged) {
    averaged = _averagedGridPixels(source, targetW, targetH, opts.preSharpenOpts);
    if (cacheable) {
      if (!sizes) { sizes = new Map(); _gridPixelsCache.set(source, sizes); }
      sizes.set(key, averaged);
      if (sizes.size > GRID_PIXELS_CACHE_SIZES) sizes.delete(sizes.keys().next().value);   // the oldest size
    }
  }
  var out = typeof ImageData === "function"
    ? new ImageData(new Uint8ClampedArray(averaged), targetW, targetH)
    : (function () { var id = document.createElement("canvas").getContext("2d").createImageData(targetW, targetH); id.data.set(averaged); return id; })();
  if ((bri !== 0 || con !== 0 || sat !== 0) && typeof _applyImageFilters === "function") _applyImageFilters(out, bri, con, sat);
  return out;
}

// gridPixels before the adjustments: a new Uint8ClampedArray (w * h * 4).
function _averagedGridPixels(source, targetW, targetH, preSharpenOpts) {
  var src = preSharpenOpts ? applyPreSharpenCanvas(source, targetW, targetH, preSharpenOpts) : source;
  var sw = (src.naturalWidth || src.width) | 0, sh = (src.naturalHeight || src.height) | 0;
  function read(w, h) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in cx) cx.imageSmoothingQuality = 'high';
    cx.drawImage(src, 0, 0, w, h);
    return cx.getImageData(0, 0, w, h).data;
  }
  if (!sw || !sh) return new Uint8ClampedArray(read(targetW, targetH));
  // Each axis at the picture's own size where it shrinks (to be averaged),
  // at the grid's size where it enlarges.
  var dw = Math.max(targetW, sw), dh = Math.max(targetH, sh);
  if (dw * dh > LINEAR_SHRINK_MAX_SOURCE_AREA) {
    var k = Math.sqrt(LINEAR_SHRINK_MAX_SOURCE_AREA / (dw * dh));
    dw = Math.max(targetW, Math.floor(dw * k)); dh = Math.max(targetH, Math.floor(dh * k));
  }
  var px = read(dw, dh);
  return dw === targetW && dh === targetH ? new Uint8ClampedArray(px) : linearAreaDownscale(px, dw, dh, targetW, targetH);
}

/**
 * Apply a pre-downscale luminance unsharp mask to a source image/canvas.
 *
 * Works at a fixed "working resolution" of 8× the target grid dimensions
 * (capped at the source size) so the filter parameters (radius, threshold)
 * are image-size-independent — a 50×50 target sharpens at ≤400×400,
 * a 120×80 target at ≤960×640.  The sharpened canvas then goes through
 * gridPixels' light-correct area average like any other picture.
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

// Reduce confetti's settings (sizes, the contrast guard, edge protection) live
// in colour-utils.js (confettiCleanupPlan) so this file and generate-worker.js
// cannot drift apart.

/**
 * Shared coverage mask → quantize → map/dither → confetti → orphan-removal pipeline.
 * Called by both generatePreview and runGenerationPipeline so the two stay in sync.
 *
 * @param {Uint8ClampedArray} raw    RGBA pixel data at target grid size
 * @param {number}            width  Grid width in stitches
 * @param {number}            height Grid height in stitches
 * @param {object}            opts   Pipeline settings
 * @returns {{ mapped, palette, confettiRaw, confettiClean, confettiFinal, saliencyMap, preCleanupIds, disambigData }} or null
 *   confettiRaw/confettiClean are measured before and after Reduce confetti
 *   (for cleanup comparisons); confettiFinal is the finished chart's, after
 *   look-alike separation and the thread limit, which can change stitches.
 */
window.runCleanupPipeline = function runCleanupPipeline(raw, width, height, opts) {
  var maxC = opts.maxC, dith = opts.dith, allowBlends = opts.allowBlends;
  var stitchCleanup = opts.stitchCleanup;
  var dithStrength = (typeof opts.dithStrength === "number") ? opts.dithStrength : 1.0;
  var dithAlgo = opts.dithAlgo || (dith ? "atkinson" : "off");
  var dithBayerSize = opts.dithBayerSize || 4;
  var minSt = (typeof opts.minSt === "number" && opts.minSt > 0) ? opts.minSt : 0;

  // Work on a private copy: preview runs multiple passes over cached RGBA.
  raw = new Uint8ClampedArray(raw);
  var coverageMask = prepareConversionPixels(raw, width, height, opts);
  if (opts.preSmooth) applyBilateralFilter(raw, width, height);
  if (opts.smooth > 0) {
    if (opts.smoothType === "gaussian") applyGaussianBlur(raw, width, height, opts.smooth);
    else if (opts.smoothType === "bilateral") applyBilateralFilter(raw, width, height);
    else applyMedianFilter(raw, width, height, opts.smooth);
  }

  // blends: the palette will be used with blends (only shading draws them
  // here; doMap is not given a blend table), so threads a blend needs stay.
  var p = quantizeConstrained(raw, width, height, maxC, opts.allowedPalette, {seed: opts.seed, blends: !!(allowBlends && dith)});
  // An all-transparent image is a valid empty pattern, not a quantiser error.
  if (!p.length && coverageMask.some(function(v) { return v !== 0; })) return null;

  var saliencyMap = generateSaliencyMap(raw, width, height);
  // The confetti-aware choice in Smooth blend is always on: its own control
  // ("Fewer confetti stitches in shading") measured no effect and was removed,
  // so a stored "off" (stitchCleanup.smoothDithering) must not linger unseen.
  var cdt = dith && dithAlgo === "atkinson" ? 4.0 : 0.0;
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

  // ── Rare colours (C5 + auto-coverage) ────────────────────────────────────
  // foldRareColours (colour-utils.js) redraws each patch of a rare colour in
  // the closest colour it touches. Mirrored in generate-worker.js.
  // 1. The user's "minimum stitches per colour": every colour under it goes.
  if (minSt > 0) foldRareColours(mapped, width, height, minSt);
  // 2. Automatic: colours covering under 0.5% of the stitches (capped at 15)
  //    are quantisation stragglers that would take a palette slot, unless they
  //    stand out from everything they touch (a catchlight, a pupil): the
  //    contrast guard keeps those. Runs only when its threshold is above minSt.
  {
    var _atTotal = 0;
    for (var _ati = 0; _ati < mapped.length; _ati++) { if (mapped[_ati].id !== '__skip__') _atTotal++; }
    var _autoThresh = Math.max(2, Math.min(15, Math.floor(_atTotal * 0.005)));
    if (_autoThresh > minSt) foldRareColours(mapped, width, height, _autoThresh, { contrastGuard: RARE_COLOUR_CONTRAST_GUARD_DE });
  }

  // ── Edge-blend fold (audit IMG-01) ───────────────────────────────────────
  // Thin anti-aliasing shades between two main stitched colours are folded
  // into them. The coverage mask alone determines empty cells. Part of Stitch Cleanup.
  // Without dithering a thin in-between shade is anti-aliasing, so the fold
  // allows more (EDGE_BLEND_MAX_DE_NO_DITHER, colour-utils.js). Mirrored in
  // generate-worker.js.
  if (stitchCleanup && stitchCleanup.enabled && typeof mergeEdgeBlendColours === "function") {
    mergeEdgeBlendColours(mapped, width, height, {
      // Coverage is already decided. Colour cleanup must not create new holes.
      preserveCoverage: true,
      bgLab: (!dith || dithAlgo === 'off') && opts.skipBg ? rgbToLab(opts.bgCol[0], opts.bgCol[1], opts.bgCol[2]) : null,
      // Undithered, an edge shade is also judged by the pixels it was drawn from.
      // (Dithered stitches all lie between their neighbours' colours, so not then.)
      source: (!dith || dithAlgo === "off") ? raw : null,
      maxDeltaE: (!dith || dithAlgo === "off") && typeof EDGE_BLEND_MAX_DE_NO_DITHER === "number" ? EDGE_BLEND_MAX_DE_NO_DITHER : undefined
    });
  }

  var preLabels = labelConnectedComponents(mapped, width, height);
  var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
  var confettiClean = null;
  var preCleanupIds = null;

  // Reduce confetti (colour-utils.js runConfettiCleanup): runs when Stitch
  // Cleanup is on and the Reduce confetti level is above 0.
  var cleaned = runConfettiCleanup(mapped, raw, width, height, saliencyMap, preLabels, stitchCleanup, opts.orphans);
  if (cleaned) {
    mapped = cleaned.mapped;
    preCleanupIds = cleaned.preCleanupIds;
    confettiClean = cleaned.confettiClean;
  }

  // ── Stage 9: Adjacent-cell colour disambiguation ────────────────────────────
  // Prevents adjacent cells from being assigned perceptually indistinguishable
  // thread colours (dE2000 < threshold). Off by default (opts.disambig falsy).
  var disambigData = null;
  if (opts.disambig && opts.disambigLevel && opts.disambigLevel !== 'off') {
    var dlevel = (typeof DISAMBIG_LEVEL_MAP !== 'undefined' ? DISAMBIG_LEVEL_MAP : {})[opts.disambigLevel] || { threshold: 15, maxDegradation: 20 };
    // Its own edge map, dilated by one stitch as before: Reduce confetti's is
    // not dilated, and this pass has always protected the stitches beside an edge.
    var disambigEdgeMap = generateEdgeMap(raw, width, height);
    // Solid palette entries only — blend entries don't have a single .lab value
    var solidPalette = p.filter(function(e) { return e.type !== 'blend' && e.lab; });
    var dr = disambiguateSimilarNeighbours(mapped, width, height, disambigEdgeMap, saliencyMap, solidPalette, {
      threshold:      dlevel.threshold,
      maxDegradation: dlevel.maxDegradation,
      maxIterations:  5,
    });
    disambigData = { swaps: dr.totalSwaps, iterations: dr.iterations };
  }

  // Threads (max) is a hard limit: a chart over it keeps its most used
  // threads and redraws the rest in the closest of them. Here, not only in
  // runGenerationPipeline, so the preview on the page is the chart Generate
  // makes (generate-worker.js does the same).
  var limited = enforceMaxColours(mapped, p, raw, maxC);

  // The finished chart's confetti. Measured again only when a stage after
  // Reduce confetti changed stitches.
  var confettiFinal = (disambigData && disambigData.swaps > 0) || limited
    ? analyzeConfetti(mapped, width, height)
    : (confettiClean || confettiRaw);

  return { mapped: mapped, palette: p, confettiRaw: confettiRaw, confettiClean: confettiClean, confettiFinal: confettiFinal, saliencyMap: saliencyMap, preCleanupIds: preCleanupIds, disambigData: disambigData };
};

// Keep at most maxC threads (a blend counts its two). Mutates mapped; true
// when any stitch changed.
function enforceMaxColours(mapped, p, raw, maxC) {
  var changed = false;
  for (var safe = 0; safe < 5; safe++) {
    var ids = collectPaletteIds(mapped);
    if (ids.size <= maxC) break;
    var tu = buildPaletteUsageMap(mapped);
    var ks = findTopThreads(tu, maxC);
    var kp = p.filter(function(t) { return ks.has(t.id); });
    if (!kp.length) break;
    migrateNonKeptColors(mapped, ks, kp, raw);
    changed = true;
  }
  return changed;
}

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
  if (opts.exactPixelArt) return runExactPixelPipeline(img, opts);
  var sW = opts.sW, sH = opts.sH, maxC = opts.maxC;
  var bri = opts.bri, con = opts.con, sat = opts.sat;
  var dith = opts.dith, skipBg = opts.skipBg, bgCol = opts.bgCol, bgTh = opts.bgTh;
  var minSt = opts.minSt, smooth = opts.smooth, smoothType = opts.smoothType;
  var stitchCleanup = opts.stitchCleanup, allowBlends = opts.allowBlends;

  // Boundary validation: a 0-width or 0-height grid produces no stitches and
  // would crash quantize() when it indexes data[i*4]. Bail out early so the
  // caller can surface a friendly error.
  if (!Number.isFinite(sW) || !Number.isFinite(sH) || sW <= 0 || sH <= 0) return null;

  var raw = gridPixels(img, sW, sH, { bri: bri, con: con, sat: sat, preSharpenOpts: opts.preSharpenOpts }).data;

  var pipelineResult = runCleanupPipeline(raw, sW, sH, {
    maxC: maxC, dith: dith, dithStrength: opts.dithStrength,
    dithAlgo: opts.dithAlgo, dithBayerSize: opts.dithBayerSize,
    allowBlends: allowBlends, allowedPalette: opts.allowedPalette || null,
    skipBg: skipBg, bgCol: bgCol, bgTh: bgTh,
    stitchCleanup: stitchCleanup, orphans: opts.orphans,
    minSt: minSt, seed: opts.seed, smooth: smooth, smoothType: smoothType,
    preSmooth: opts.preSmooth, disambig: opts.disambig, disambigLevel: opts.disambigLevel,
  });
  if (!pipelineResult) return null;

  var mapped = pipelineResult.mapped;
  var rawConfetti = pipelineResult.confettiRaw;
  var cleanConfetti = pipelineResult.confettiClean || pipelineResult.confettiRaw;

  // (minSt rebucket and the Threads (max) limit live inside
  // runCleanupPipeline so the preview honours them too.)

  var palResult = buildPalette(mapped);
  return {
    pat: mapped,
    pal: palResult.pal,
    cmap: palResult.cmap,
    confettiData: { raw: rawConfetti, clean: cleanConfetti, final: pipelineResult.confettiFinal },
    preCleanupIds: pipelineResult.preCleanupIds,
    disambigData: pipelineResult.disambigData,
  };
};

// Exact geometry, explicit solid-thread remapping. No quantisation, dithering,
// filtering or small-region cleanup: even a single source pixel is deliberate.
window.runExactPixelPipeline = function runExactPixelPipeline(img, opts) {
  var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  if (!w || !h || w > 500 || h > 500) throw new Error("Exact pixel art supports source images up to 500 by 500 pixels; resize the source explicitly first.");
  if ((opts.allowedPalette && !opts.allowedPalette.length) || (opts.stashConstrained && !opts.allowedPalette) || (opts.convertBrand && opts.convertBrand !== "dmc" && !opts.allowedPalette)) throw new Error("No threads are available for exact pixel-art remapping.");
  var c = document.createElement("canvas"); c.width = w; c.height = h;
  var cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0);
  var raw = cx.getImageData(0, 0, w, h).data;
  // Reuse the corrected alpha cutoff and hidden-RGB handling. Pixel art uses
  // source alpha alone; opaque background pixels remain deliberate stitches.
  var coverage = prepareConversionPixels(raw, w, h, { skipBg: false });
  var pool = opts.allowedPalette || DMC, byRgb = new Map(), mappings = [];
  var mapped = new Array(w * h);
  for (var i = 0; i < mapped.length; i++) {
    if (!coverage[i]) { mapped[i] = { id: "__skip__" }; continue; }
    var rgb = [raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]], key = rgb.join(",");
    var row = byRgb.get(key);
    if (!row) {
      var thread = findSolid(rgbToLab(rgb[0], rgb[1], rgb[2]), pool);
      row = { source: rgb, thread: thread, count: 0 };
      byRgb.set(key, row); mappings.push(row);
    }
    row.count++; mapped[i] = row.thread;
  }
  var palette = buildPalette(mapped), labels = labelConnectedComponents(mapped, w, h);
  var confetti = analyzeConfetti(mapped, w, h, labels);
  return { pat: mapped, mapped: mapped, pal: palette.pal, cmap: palette.cmap,
    width: w, height: h, mappings: mappings,
    confettiRaw: confetti, confettiClean: null,
    confettiData: { raw: confetti, clean: confetti } };
};
