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
    var MAX_PREVIEW_AREA = 40000;
    var pw = sW, ph = sH;
    if (pw * ph > MAX_PREVIEW_AREA) { var scale = Math.sqrt(MAX_PREVIEW_AREA / (pw * ph)); pw = Math.round(pw * scale); ph = Math.round(ph * scale); }
    if (pw < 10) pw = 10;
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
    var pipelineResult = runCleanupPipeline(raw, pw, ph, { maxC: maxC, dith: dith, allowBlends: allowBlends, skipBg: skipBg, bgCol: bgCol, bgTh: bgTh, stitchCleanup: stitchCleanup });
    if (!pipelineResult) return;
    var mapped = pipelineResult.mapped;
    var confettiRaw = pipelineResult.confettiRaw;
    var confettiClean = pipelineResult.confettiClean;

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
    pc.width = pw; pc.height = ph;
    var pcx = pc.getContext("2d");
    var imgData = pcx.createImageData(pw, ph);
    var d = imgData.data;
    for (var i = 0; i < mapped.length; i++) {
      var mm = mapped[i]; var idx = i * 4;
      if (mm.id === "__skip__") { d[idx] = 240; d[idx+1] = 240; d[idx+2] = 240; d[idx+3] = 255; }
      else { d[idx] = mm.rgb[0]; d[idx+1] = mm.rgb[1]; d[idx+2] = mm.rgb[2]; d[idx+3] = 255; }
    }
    pcx.putImageData(imgData, 0, 0);
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
