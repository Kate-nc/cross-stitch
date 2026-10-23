/* generate-worker.js — Web Worker for the pattern-generation pipeline.
   Offloads the CPU-intensive work from the main thread so the UI (spinner)
   stays responsive during generation.

   Message protocol:
     Main → Worker:
       { type: 'generate', reqId: number, pixels: ArrayBuffer, width: number, height: number,
         settings: { maxC, dith, allowBlends, skipBg, bgCol, bgTh, minSt,
                     smooth, smoothType, stitchCleanup,
                     disambig?: boolean, disambigLevel?: 'gentle'|'standard'|'strong',
                     allowedPalette? } }  // allowedPalette: array of DMC entries or null
       { type: 'disambiguate', reqId: number, mapped: Array, palette: Array,
         settings: { disambigLevel?: string, maxIterations?: number } }

     Worker → Main:
       { type: 'result', reqId: number, mapped, pal, cmap, confettiData, disambigData }
       { type: 'disambiguate-result', reqId: number, mapped: Array, disambigData: object }
       { type: 'progress', reqId: number, stage: string, message: string }
       { type: 'error',  reqId: number, message: string, stack?: string }

   Dependencies (imported via importScripts — all pure, no DOM):
     constants.js  → FABRIC_COUNTS, A4W, A4H, etc.
     dmc-data.js   → DMC_RAW, rgbToLab, dE, dE2, DMC, SYMS
     creator/symbolFontSpec.js, creator/pdfChartLayout.js, symbol-glyphs.js
                   → SymbolGlyphs (the chart symbols buildPalette assigns)
     colour-utils.js → findSolid, findBest, quantize, quantizeConstrained, doDither, doRiemersma, doMap,
                       buildPalette, applyGaussianBlur, applyMedianFilter, applyBilateralFilter,
                       foldRareColours, RARE_COLOUR_CONTRAST_GUARD_DE,
                       generateSaliencyMap, generateEdgeMap,
                       labelConnectedComponents, removeOrphanStitches, runConfettiCleanup,
                       analyzeConfetti, disambiguateSimilarNeighbours, DISAMBIG_LEVEL_MAP
*/

importScripts('constants.js', 'dmc-data.js', 'creator/symbolFontSpec.js', 'creator/pdfChartLayout.js', 'symbol-glyphs.js', 'colour-utils.js');

// Reduce confetti's settings (sizes, the contrast guard, edge protection) come
// from colour-utils.js (confettiCleanupPlan / runConfettiCleanup), shared with
// creator/generate.js.

self.onmessage = function(e) {
  var msg = e.data;

  // ── Post-hoc disambiguation (from PatternTab "Re-apply" button) ────────────
  // Derives edge map from pattern boundaries (conservative: all colour-boundary
  // cells are protected). No saliency scaling — flat threshold only.
  if (msg.type === 'disambiguate') {
    try {
      var reqId2 = msg.reqId;
      var mapped2 = msg.mapped;
      var palette2 = msg.palette;
      var s2 = msg.settings || {};
      var dlvl2 = (typeof DISAMBIG_LEVEL_MAP !== 'undefined' ? DISAMBIG_LEVEL_MAP : {})[s2.disambigLevel] || { threshold: 15, maxDegradation: 20 };
      var solidPalette2 = palette2.filter(function(e) { return e.type !== 'blend' && e.lab; });
      var mapped2work = mapped2.slice();
      var dr2 = disambiguateSimilarNeighbours(
        mapped2work,
        msg.width, msg.height,
        null, null, solidPalette2,
        { threshold: dlvl2.threshold, maxDegradation: dlvl2.maxDegradation,
          maxIterations: typeof s2.maxIterations === 'number' ? s2.maxIterations : 5,
          deriveBoundaryEdges: true }
      );
      self.postMessage({ type: 'disambiguate-result', reqId: reqId2, mapped: mapped2work, disambigData: { swaps: dr2.totalSwaps, iterations: dr2.iterations } });
    } catch (err2) {
      self.postMessage({ type: 'error', reqId: msg.reqId, message: err2.message, stack: err2.stack });
    }
    return;
  }

  if (msg.type !== 'generate') return;

  var reqId    = msg.reqId;
  var pixels   = msg.pixels;   // ArrayBuffer transferred from main thread
  var width    = msg.width;
  var height   = msg.height;
  var settings = msg.settings;

  try {
    var raw = new Uint8ClampedArray(pixels);

    function postProgress(stage, message) {
      try { self.postMessage({ type: 'progress', reqId: reqId, stage: stage, message: message }); } catch (_) {}
    }

    var coverageMask = prepareConversionPixels(raw, width, height, settings);

    // ── 1. Pre-processing: image smoothing ─────────────────────────────────
    if (settings.preSmooth) {
      postProgress('smoothing', 'Pre-smoothing image…');
      applyBilateralFilter(raw, width, height);
    }
    if (settings.smooth > 0) {
      postProgress('smoothing', 'Smoothing image…');
      if (settings.smoothType === 'gaussian') {
        applyGaussianBlur(raw, width, height, settings.smooth);
      } else if (settings.smoothType === 'bilateral') {
        applyBilateralFilter(raw, width, height);
      } else {
        applyMedianFilter(raw, width, height, settings.smooth);
      }
    }

    // ── 2. Core pipeline (mirrors runCleanupPipeline in creator/generate.js) ─
    var maxC         = settings.maxC;
    var dith         = settings.dith;
    var dithStrength = (typeof settings.dithStrength === "number") ? settings.dithStrength : 1.0;
    var dithAlgo     = settings.dithAlgo || (dith ? "atkinson" : "off");
    var dithBayerSize = settings.dithBayerSize || 4;
    var allowBlends  = settings.allowBlends;
    var stitchCleanup = settings.stitchCleanup;

    var allowedPalette = settings.allowedPalette || null;
    postProgress('quantizing', 'Choosing colours…');
    // blends: as in runCleanupPipeline, only shading draws blends here.
    var p = quantizeConstrained(raw, width, height, maxC, allowedPalette, {seed: settings.seed, blends: !!(allowBlends && dith)});
    if (!p.length && coverageMask.some(function(v) { return v !== 0; })) {
      self.postMessage({ type: 'error', reqId: reqId, message: 'Could not find enough distinct colours in your image. Try increasing the maximum colours, or use a clearer image.' });
      return;
    }

    var saliencyMap = generateSaliencyMap(raw, width, height);
    // Always on in Smooth blend (mirrors runCleanupPipeline).
    var cdt = dith && dithAlgo === "atkinson" ? 4.0 : 0.0;
    postProgress(dith ? 'dithering' : 'mapping', dith ? 'Dithering colours…' : 'Mapping colours…');
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

    // ── 3. Rare colours (mirrors runCleanupPipeline) ─────────────────────────
    // Applied before confetti analysis so stats reflect the folded palette.
    // The user's minimum removes every colour under it; the automatic pass
    // (0.5% of stitches, cap 15) keeps patches that stand out from all they touch.
    var minSt = settings.minSt;
    if (minSt > 0) {
      postProgress('rarity', 'Removing rare colours…');
      foldRareColours(mapped, width, height, minSt);
    }
    {
      var _atTotal = 0;
      for (var _ati = 0; _ati < mapped.length; _ati++) { if (mapped[_ati].id !== '__skip__') _atTotal++; }
      var _autoThresh = Math.max(2, Math.min(15, Math.floor(_atTotal * 0.005)));
      if (_autoThresh > (minSt || 0)) {
        postProgress('rarity', 'Removing rare colours…');
        foldRareColours(mapped, width, height, _autoThresh, { contrastGuard: RARE_COLOUR_CONTRAST_GUARD_DE });
      }
    }

    // ── Edge-blend fold (mirrors runCleanupPipeline, audit IMG-01) ───────────
    // Without dithering the fold allows more (EDGE_BLEND_MAX_DE_NO_DITHER).
    if (stitchCleanup && stitchCleanup.enabled && typeof mergeEdgeBlendColours === 'function') {
      mergeEdgeBlendColours(mapped, width, height, {
        // Coverage is already decided. Colour cleanup must not create new holes.
        bgLab: null,
        // Undithered, an edge shade is also judged by the pixels it was drawn from.
        // (Dithered stitches all lie between their neighbours' colours, so not then.)
        source: (!dith || dithAlgo === 'off') ? raw : null,
        maxDeltaE: (!dith || dithAlgo === 'off') && typeof EDGE_BLEND_MAX_DE_NO_DITHER === 'number' ? EDGE_BLEND_MAX_DE_NO_DITHER : undefined
      });
    }

    var preLabels   = labelConnectedComponents(mapped, width, height);
    var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
    var confettiClean = null;
    var preCleanupIds = null;

    // Reduce confetti: runs when Stitch Cleanup is on and the level is above 0
    // (mirrors runCleanupPipeline).
    if (confettiCleanupPlan(stitchCleanup, settings.orphans)) postProgress('cleanup', 'Cleaning up stitches…');
    var cleaned = runConfettiCleanup(mapped, raw, width, height, saliencyMap, preLabels, stitchCleanup, settings.orphans);
    if (cleaned) {
      mapped = cleaned.mapped;
      preCleanupIds = cleaned.preCleanupIds;
      confettiClean = cleaned.confettiClean;
    }

    // ── Stage 9: Adjacent-cell colour disambiguation ────────────────────────
    var disambigData = null;
    if (settings.disambig && settings.disambigLevel && settings.disambigLevel !== 'off') {
      postProgress('disambiguating', 'Separating similar neighbours…');
      var dlvl = (typeof DISAMBIG_LEVEL_MAP !== 'undefined' ? DISAMBIG_LEVEL_MAP : {})[settings.disambigLevel] || { threshold: 15, maxDegradation: 20 };
      // Dilated by one stitch, as before (Reduce confetti's map is not).
      var disambigEdgeMap = generateEdgeMap(raw, width, height);
      var solidPalette = p.filter(function(e) { return e.type !== 'blend' && e.lab; });
      var dr = disambiguateSimilarNeighbours(mapped, width, height, disambigEdgeMap, saliencyMap, solidPalette, {
        threshold:      dlvl.threshold,
        maxDegradation: dlvl.maxDegradation,
        maxIterations:  5,
      });
      disambigData = { swaps: dr.totalSwaps, iterations: dr.iterations };
    }

    // ── maxC enforcement pass ──────────────────────────────────────────────────
    var limited = false;
    for (var safe = 0; safe < 5; safe++) {
      var ids = new Set();
      for (var k = 0; k < mapped.length; k++) {
        var m = mapped[k];
        if (m.id === '__skip__') continue;
        if (m.type === 'blend' && m.threads) {
          m.threads.forEach(function(t) { ids.add(t.id); });
        } else {
          ids.add(m.id);
        }
      }
      if (ids.size <= maxC) break;
      var tu = {};
      for (var k2 = 0; k2 < mapped.length; k2++) {
        var m2 = mapped[k2];
        if (m2.id === '__skip__') continue;
        if (m2.type === 'blend' && m2.threads) {
          m2.threads.forEach(function(t) { tu[t.id] = (tu[t.id] || 0) + 1; });
        } else {
          tu[m2.id] = (tu[m2.id] || 0) + 1;
        }
      }
      var sorted = Object.entries(tu).sort(function(a, b) { return b[1] - a[1]; });
      var ks = new Set(sorted.slice(0, maxC).map(function(e2) { return e2[0]; }));
      var kp = p.filter(function(t) { return ks.has(t.id); });
      if (!kp.length) break;
      for (var k3 = 0; k3 < mapped.length; k3++) {
        var m3 = mapped[k3];
        if (m3.id === '__skip__') continue;
        var nr = (m3.type === 'blend' && m3.threads)
          ? m3.threads.some(function(t) { return !ks.has(t.id); })
          : !ks.has(m3.id);
        if (nr) {
          mapped[k3] = findSolid(m3.lab || rgbToLab(raw[k3 * 4], raw[k3 * 4 + 1], raw[k3 * 4 + 2]), kp);
          limited = true;
        }
      }
    }

    // The finished chart's confetti (runCleanupPipeline's confettiFinal):
    // look-alike separation and the thread limit can change stitches after
    // Reduce confetti was measured.
    var confettiFinal = (disambigData && disambigData.swaps > 0) || limited
      ? analyzeConfetti(mapped, width, height)
      : (confettiClean || confettiRaw);

    // ── 5. Build final palette ────────────────────────────────────────────────
    postProgress('finalizing', 'Building palette\u2026');
    var palResult = buildPalette(mapped);

    // ── 6. Send result to main thread ─────────────────────────────────────────
    self.postMessage({
      type: 'result',
      reqId: reqId,
      mapped: mapped,
      pal: palResult.pal,
      cmap: palResult.cmap,
      confettiData: { raw: confettiRaw, clean: confettiClean || confettiRaw, final: confettiFinal },
      preCleanupIds: preCleanupIds,
      disambigData: disambigData,
    });

  } catch (err) {
    self.postMessage({ type: 'error', reqId: reqId, message: err.message, stack: err.stack });
  }
};
