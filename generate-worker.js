/* generate-worker.js — Web Worker for the pattern-generation pipeline.
   Offloads the CPU-intensive work from the main thread so the UI (spinner)
   stays responsive during generation.

   Message protocol:
     Main → Worker:
       { type: 'generate', reqId: number, pixels: ArrayBuffer, width: number, height: number,
         settings: { maxC, dith, allowBlends, skipBg, bgCol, bgTh, minSt,
                     smooth, smoothType, stitchCleanup,
                     allowedPalette? } }  // allowedPalette: array of DMC entries or null

     Worker → Main:
       { type: 'result', reqId: number, mapped, pal, cmap, confettiData }
       { type: 'error',  message: string, stack?: string }

   Dependencies (imported via importScripts — all pure, no DOM):
     constants.js  → FABRIC_COUNTS, A4W, A4H, etc.
     dmc-data.js   → DMC_RAW, rgbToLab, dE, dE2, DMC, SYMS
     colour-utils.js → findSolid, findBest, quantize, doDither, doMap,
                       buildPalette, applyGaussianBlur, applyMedianFilter,
                       generateSaliencyMap, generateEdgeMap,
                       labelConnectedComponents, removeOrphanStitches,
                       analyzeConfetti
*/

importScripts('constants.js', 'dmc-data.js', 'colour-utils.js');

// STRENGTH_MAP mirrors window.STRENGTH_MAP in creator/generate.js.
// Duplicated here because creator/generate.js assigns via `window.*` and
// calls document.createElement, making it unsuitable for worker import.
var STRENGTH_MAP = {
  gentle:   { maxOrphanSize: 2, saliencyMultiplier: 1.0 },
  balanced: { maxOrphanSize: 3, saliencyMultiplier: 2.0 },
  thorough: { maxOrphanSize: 5, saliencyMultiplier: 3.0 },
};

self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type !== 'generate') return;

  var reqId    = msg.reqId;
  var pixels   = msg.pixels;   // ArrayBuffer transferred from main thread
  var width    = msg.width;
  var height   = msg.height;
  var settings = msg.settings;

  try {
    var raw = new Uint8ClampedArray(pixels);

    // ── 1. Pre-processing: image smoothing ───────────────────────────────────
    if (settings.smooth > 0) {
      if (settings.smoothType === 'gaussian') {
        applyGaussianBlur(raw, width, height, settings.smooth);
      } else {
        applyMedianFilter(raw, width, height, settings.smooth);
      }
    }

    // ── 2. Core pipeline (mirrors runCleanupPipeline in creator/generate.js) ─
    var maxC         = settings.maxC;
    var dith         = settings.dith;
    var allowBlends  = settings.allowBlends;
    var skipBg       = settings.skipBg;
    var bgCol        = settings.bgCol;
    var bgTh         = settings.bgTh;
    var stitchCleanup = settings.stitchCleanup;
    var orphansOpt = settings.orphans != null ? settings.orphans : null;

    var allowedPalette = settings.allowedPalette || null;
    var p = quantize(raw, width, height, maxC, allowedPalette, {seed: settings.seed});
    if (!p.length) {
      self.postMessage({ type: 'error', message: 'Could not find enough distinct colours in your image. Try increasing the maximum colours, or use a clearer image.' });
      return;
    }

    var saliencyMap = generateSaliencyMap(raw, width, height);
    var cdt = dith && stitchCleanup && stitchCleanup.smoothDithering ? 4.0 : 0.0;
    var mapped = dith
      ? doDither(raw, width, height, p, allowBlends, saliencyMap, { confettiDitherThreshold: cdt })
      : doMap(raw, width, height, p, allowBlends);

    if (skipBg) {
      var bl = rgbToLab(bgCol[0], bgCol[1], bgCol[2]);
      for (var i = 0; i < mapped.length; i++) {
        if (dE(rgbToLab(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]), bl) < bgTh) {
          mapped[i] = { type: 'skip', id: '__skip__', rgb: [255, 255, 255], lab: [100, 0, 0] };
        }
      }
    }

    var preLabels   = labelConnectedComponents(mapped, width, height);
    var confettiRaw = analyzeConfetti(mapped, width, height, preLabels);
    var confettiClean = null;
    var preCleanupIds = null;

    var runCleanup = orphansOpt != null ? (orphansOpt > 0) : (stitchCleanup && stitchCleanup.enabled);
    if (runCleanup) {
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

    // ── 3. Rarity removal (minSt pass) ───────────────────────────────────────
    var minSt = settings.minSt;
    if (minSt > 0) {
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

    // ── 4. maxC enforcement pass ──────────────────────────────────────────────
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
    });

  } catch (err) {
    self.postMessage({ type: 'error', message: err.message, stack: err.stack });
  }
};
