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
     colour-utils.js → findSolid, findBest, quantize, quantizeConstrained, doDither, doRiemersma, doMap,
                       buildPalette, applyGaussianBlur, applyMedianFilter, applyBilateralFilter,
                       generateSaliencyMap, generateEdgeMap,
                       labelConnectedComponents, removeOrphanStitches,
                       analyzeConfetti, disambiguateSimilarNeighbours, DISAMBIG_LEVEL_MAP
*/

importScripts('constants.js', 'dmc-data.js', 'colour-utils.js');

// STRENGTH_MAP mirrors window.STRENGTH_MAP in creator/generate.js.
// Duplicated here because creator/generate.js assigns via `window.*` and
// calls document.createElement, making it unsuitable for worker import.
var STRENGTH_MAP = {
  gentle:   { maxOrphanSize: 2, saliencyMultiplier: 1.0 },
  balanced: { maxOrphanSize: 4, saliencyMultiplier: 2.0 },
  thorough: { maxOrphanSize: 6, saliencyMultiplier: 3.0 },
};

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
    var skipBg       = settings.skipBg;
    var bgCol        = settings.bgCol;
    var bgTh         = settings.bgTh;
    var stitchCleanup = settings.stitchCleanup;
    var orphansOpt = settings.orphans != null ? settings.orphans : null;

    var allowedPalette = settings.allowedPalette || null;
    postProgress('quantizing', 'Choosing colours…');
    var p = quantizeConstrained(raw, width, height, maxC, allowedPalette, {seed: settings.seed});
    if (!p.length) {
      self.postMessage({ type: 'error', reqId: reqId, message: 'Could not find enough distinct colours in your image. Try increasing the maximum colours, or use a clearer image.' });
      return;
    }

    var saliencyMap = generateSaliencyMap(raw, width, height);
    var cdt = dith && dithAlgo === "atkinson" && stitchCleanup && stitchCleanup.smoothDithering ? 4.0 : 0.0;
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

    if (skipBg) {
      var bl = rgbToLab(bgCol[0], bgCol[1], bgCol[2]);
      for (var i = 0; i < mapped.length; i++) {
        if (dE(rgbToLab(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]), bl) < bgTh) {
          mapped[i] = { type: 'skip', id: '__skip__', rgb: [255, 255, 255], lab: [100, 0, 0] };
        }
      }
    }

    // ── 3. Rarity removal (minSt pass) ───────────────────────────────────────
    // Applied before confetti analysis so stats reflect the post-minSt palette,
    // matching the ordering in runCleanupPipeline (creator/generate.js).
    var minSt = settings.minSt;
    if (minSt > 0) {
      postProgress('rarity', 'Removing rare colours…');
      for (var pass = 0; pass < 3; pass++) {
        var ep   = buildPalette(mapped);
        var rare = ep.pal.filter(function(e) { return e.count < minSt; });
        var keep = ep.pal.filter(function(e) { return e.count >= minSt; });
        if (!rare.length || !keep.length) break;
        var rm = {};
        rare.forEach(function(r) {
          var b = null, bd = 1e9;
          keep.forEach(function(k) {
            var d = dE(r.lab, k.lab);
            if (d < bd) { bd = d; b = k.id; }
          });
          if (b) rm[r.id] = b;
        });
        var changed = false;
        var keepMap = {};
        keep.forEach(function(k) { keepMap[k.id] = k; });
        for (var j = 0; j < mapped.length; j++) {
          if (mapped[j].id !== '__skip__' && rm[mapped[j].id]) {
            mapped[j] = Object.assign({}, keepMap[rm[mapped[j].id]]);
            changed = true;
          }
        }
        if (!changed) break;
      }
    }

    // ── Auto-coverage post-pass (mirrors runCleanupPipeline) ─────────────────
    // Remove colours covering < 0.5% of non-skip cells (cap 15) to prevent
    // 1–3 stitch stragglers from consuming palette slots.
    {
      var _atTotal = 0;
      for (var _ati = 0; _ati < mapped.length; _ati++) { if (mapped[_ati].id !== '__skip__') _atTotal++; }
      var _autoThresh = Math.max(2, Math.min(15, Math.floor(_atTotal * 0.005)));
      if (_autoThresh > (minSt || 0)) {
        postProgress('rarity', 'Removing rare colours…');
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

    var preLabels   = labelConnectedComponents(mapped, width, height);
    var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
    var confettiClean = null;
    var preCleanupIds = null;

    // Mirror the engine fix: cleanup runs if EITHER orphans > 0 OR the Stitch
    // Cleanup toggle is on. The previous condition treated orphans === 0 as
    // "explicitly off" and suppressed the separate toggle. Keep `orphansOpt`
    // as the existing variable name so the branch below still compiles.
    var cleanupEnabled = !!(stitchCleanup && stitchCleanup.enabled);
    var runCleanup = (orphansOpt != null && orphansOpt > 0) || cleanupEnabled;
    if (orphansOpt != null && orphansOpt === 0 && cleanupEnabled) orphansOpt = null;
    if (runCleanup) {
      postProgress('cleanup', 'Cleaning up stitches…');
      var maxOrphanSize, saliencyMult;
      if (orphansOpt != null) {
        maxOrphanSize = orphansOpt;
        var _csMap = stitchCleanup && STRENGTH_MAP[stitchCleanup.strength] ? STRENGTH_MAP[stitchCleanup.strength] : STRENGTH_MAP.balanced;
        saliencyMult = _csMap.saliencyMultiplier;
      } else {
        var strengthKey = Object.prototype.hasOwnProperty.call(STRENGTH_MAP, stitchCleanup.strength)
          ? stitchCleanup.strength : 'balanced';
        var sp = STRENGTH_MAP[strengthKey];
        maxOrphanSize = sp.maxOrphanSize;
        saliencyMult = sp.saliencyMultiplier;
      }
      var edgeMap = (stitchCleanup && stitchCleanup.protectDetails) ? generateEdgeMap(raw, width, height) : null;
      preCleanupIds = mapped.map(function(m) { return m.id; });
      mapped = removeOrphanStitches(
        mapped, width, height, maxOrphanSize,
        edgeMap, saliencyMap,
        { saliencyMultiplier: saliencyMult },
        preLabels
      );
      var postLabels = labelConnectedComponents(mapped, width, height);
      confettiClean = analyzeConfetti(mapped, width, height, postLabels);
    }

    // ── Stage 9: Adjacent-cell colour disambiguation ────────────────────────
    var disambigData = null;
    if (settings.disambig && settings.disambigLevel && settings.disambigLevel !== 'off') {
      postProgress('disambiguating', 'Separating similar neighbours…');
      var dlvl = (typeof DISAMBIG_LEVEL_MAP !== 'undefined' ? DISAMBIG_LEVEL_MAP : {})[settings.disambigLevel] || { threshold: 15, maxDegradation: 20 };
      var disambigEdgeMap = (typeof edgeMap !== 'undefined' ? edgeMap : null) || generateEdgeMap(raw, width, height);
      var solidPalette = p.filter(function(e) { return e.type !== 'blend' && e.lab; });
      var dr = disambiguateSimilarNeighbours(mapped, width, height, disambigEdgeMap, saliencyMap, solidPalette, {
        threshold:      dlvl.threshold,
        maxDegradation: dlvl.maxDegradation,
        maxIterations:  5,
      });
      disambigData = { swaps: dr.totalSwaps, iterations: dr.iterations };
    }

    // ── maxC enforcement pass ──────────────────────────────────────────────────
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
        }
      }
    }

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
      confettiData: { raw: confettiRaw, clean: confettiClean || confettiRaw },
      preCleanupIds: preCleanupIds,
      disambigData: disambigData,
    });

  } catch (err) {
    self.postMessage({ type: 'error', reqId: reqId, message: err.message, stack: err.stack });
  }
};
