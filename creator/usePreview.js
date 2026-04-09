/* creator/usePreview.js — Generates a fast preview thumbnail and stats while
   the user adjusts settings. Debounced 400 ms.
   Expects state object from useCreatorState. */

window.usePreview = function usePreview(state) {
  var generatePreview = React.useCallback(function() {
    var img = state.img, sW = state.sW, sH = state.sH;
    var maxC = state.maxC, bri = state.bri, con = state.con, sat = state.sat;
    var dith = state.dith, skipBg = state.skipBg, bgCol = state.bgCol, bgTh = state.bgTh;
    var smooth = state.smooth, smoothType = state.smoothType;
    var stitchCleanup = state.stitchCleanup, fabricCt = state.fabricCt;
    var allowBlends = state.allowBlends, confettiData = state.confettiData;

    if (!img || !img.src) return;
    var pw = Math.min(100, sW), ph = Math.round(pw / (sW / sH));
    if (ph < 1) ph = 1;
    var c = document.createElement("canvas"); c.width = pw; c.height = ph;
    var cx = c.getContext("2d");
    cx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)";
    cx.drawImage(img, 0, 0, pw, ph); cx.filter = "none";
    var raw = cx.getImageData(0, 0, pw, ph).data;
    if (smooth > 0) {
      if (smoothType === "gaussian") applyGaussianBlur(raw, pw, ph, smooth);
      else applyMedianFilter(raw, pw, ph, smooth);
    }
    var p = quantize(raw, pw, ph, maxC); if (!p.length) return;
    var saliencyMapPrev = generateSaliencyMap(raw, pw, ph);
    var cdt = dith && stitchCleanup.smoothDithering ? 4.0 : 0.0;
    var mapped = dith
      ? doDither(raw, pw, ph, p, allowBlends, saliencyMapPrev, { confettiDitherThreshold: cdt })
      : doMap(raw, pw, ph, p, allowBlends);
    if (skipBg) {
      var bl = rgbToLab(bgCol[0], bgCol[1], bgCol[2]);
      for (var i = 0; i < mapped.length; i++) {
        if (dE(rgbToLab(raw[i * 4], raw[i * 4 + 1], raw[i * 4 + 2]), bl) < bgTh) {
          mapped[i] = { type: "skip", id: "__skip__", rgb: [255, 255, 255] };
        }
      }
    }
    var confettiRaw = analyzeConfetti(mapped, pw, ph);
    if (stitchCleanup.enabled) {
      var cleanupStrength = Object.prototype.hasOwnProperty.call(STRENGTH_MAP, stitchCleanup.strength)
        ? stitchCleanup.strength : "balanced";
      var sp = STRENGTH_MAP[cleanupStrength];
      var edgeMapPrev = stitchCleanup.protectDetails ? generateEdgeMap(raw, pw, ph) : null;
      mapped = removeOrphanStitches(mapped, pw, ph, sp.maxOrphanSize, edgeMapPrev, saliencyMapPrev, { saliencyMultiplier: sp.saliencyMultiplier });
    }
    var confettiClean = stitchCleanup.enabled ? analyzeConfetti(mapped, pw, ph) : null;

    var stitchable = 0, skipped = 0, colorCounts = {};
    for (var j = 0; j < mapped.length; j++) {
      var m = mapped[j];
      if (m.id === "__skip__") { skipped++; }
      else { stitchable++; colorCounts[m.id] = (colorCounts[m.id] || 0) + 1; }
    }
    var uniqueColors = Object.keys(colorCounts).length;
    var scaleFactor = (sW * sH) / (pw * ph);
    var estSkeins = 0;
    Object.values(colorCounts).forEach(function(ct) { estSkeins += skeinEst(Math.round(ct * scaleFactor), fabricCt); });

    state.setPreviewStats({
      stitchable: Math.round(stitchable * scaleFactor),
      skipped: Math.round(skipped * scaleFactor),
      uniqueColors: uniqueColors,
      estSkeins: estSkeins,
      confettiPct: confettiRaw.pct,
      confettiSingles: Math.round(confettiRaw.singles * scaleFactor),
      confettiCleanSingles: confettiClean ? Math.round(confettiClean.singles * scaleFactor) : null,
    });

    var pc = document.createElement("canvas");
    var pcs = Math.max(3, Math.floor(260 / pw));
    pc.width = pw * pcs; pc.height = ph * pcs;
    var pcx = pc.getContext("2d");
    for (var row = 0; row < ph; row++) {
      for (var col = 0; col < pw; col++) {
        var mm = mapped[row * pw + col];
        pcx.fillStyle = mm.id === "__skip__" ? "#f0f0f0" : "rgb(" + mm.rgb[0] + "," + mm.rgb[1] + "," + mm.rgb[2] + ")";
        pcx.fillRect(col * pcs, row * pcs, pcs, pcs);
      }
    }
    state.setPreviewUrl(pc.toDataURL());
  }, [
    state.img, state.sW, state.sH, state.maxC, state.bri, state.con, state.sat,
    state.dith, state.skipBg, state.bgCol, state.bgTh, state.smooth, state.smoothType,
    state.stitchCleanup, state.fabricCt, state.allowBlends,
  ]);

  React.useEffect(function() {
    if (!state.img) return;
    var timer = state.previewTimerRef.current;
    if (timer) clearTimeout(timer);
    state.previewTimerRef.current = setTimeout(function() { generatePreview(); }, 400);
    return function() {
      if (state.previewTimerRef.current) clearTimeout(state.previewTimerRef.current);
    };
  }, [generatePreview]); // eslint-disable-line react-hooks/exhaustive-deps

  return { generatePreview: generatePreview };
};
