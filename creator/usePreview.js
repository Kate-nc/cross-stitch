/* creator/usePreview.js — Generates a fast preview thumbnail and stats while
   the user adjusts settings. Debounced 400 ms.
   Expects state object from useCreatorState. The single source of truth for
   what settings affect the preview is state.conversionSettings (built by
   useCreatorState) — see CONVERSION_STATE_KEYS in useCreatorState.js. */

window.usePreview = function usePreview(state) {
  var rawCacheRef = React.useRef(null); // { sig, raw, pw, ph } — geometric cache
  var fullPassTimerRef = React.useRef(null); // pending setTimeout for full dither pass

  var generatePreview = React.useCallback(function() {
    if (fullPassTimerRef.current) { clearTimeout(fullPassTimerRef.current); fullPassTimerRef.current = null; }
    var img = state.img;
    var settings = state.conversionSettings;
    if (!settings) return;
    // Local aliases for the geometric/cache step (these are pure image-prep
    // values, not pipeline values).
    var sW = settings.sW, sH = settings.sH;
    var bri = settings.bri, con = settings.con, sat = settings.sat;
    var smooth = settings.smooth, smoothType = settings.smoothType;
    var fabricCt = settings.fabricCt;
    var stashConstrained = settings.stashConstrained;
    var globalStash = state.globalStash;
    var orphans = settings.orphans;
    var stitchCleanup = settings.stitchCleanup;
    var dith = settings.dith;
    var showCleanupDiff = state.showCleanupDiff;

    if (!img || !img.src) return;
    var MAX_PREVIEW_AREA = 40000;
    var pw = sW, ph = sH;
    if (pw * ph > MAX_PREVIEW_AREA) { var scale = Math.sqrt(MAX_PREVIEW_AREA / (pw * ph)); pw = Math.round(pw * scale); ph = Math.round(ph * scale); }
    if (pw < 10) pw = 10;
    if (ph < 1) ph = 1;

    // --- Geometric (image-drawing) cache: skip canvas if only pipeline settings changed ---
    var raw;
    var geoSig = img.src + '|' + pw + '|' + ph + '|' + bri + '|' + con + '|' + sat + '|' + smooth + '|' + smoothType;
    if (rawCacheRef.current && rawCacheRef.current.sig === geoSig) {
      raw = rawCacheRef.current.raw;
    } else {
      var c = document.createElement("canvas"); c.width = pw; c.height = ph;
      var cx = c.getContext("2d");
      cx.filter = "brightness(" + (100 + bri) + "%) contrast(" + (100 + con) + "%) saturate(" + (100 + sat) + "%)";
      cx.drawImage(img, 0, 0, pw, ph); cx.filter = "none";
      raw = cx.getImageData(0, 0, pw, ph).data;
      if (smooth > 0) {
        if (smoothType === "gaussian") applyGaussianBlur(raw, pw, ph, smooth);
        else applyMedianFilter(raw, pw, ph, smooth);
      }
      rawCacheRef.current = { sig: geoSig, raw: new Uint8ClampedArray(raw), pw: pw, ph: ph };
    }

    // Pipeline options come straight from the canonical settings bundle. The
    // ONLY caller-side overrides are the geometric step we already did above
    // (image filters), so we strip those keys and forward everything else.
    function pipelineOpts(overrides) {
      var o = {
        maxC: settings.maxC, dith: settings.dith, dithStrength: settings.dithStrength,
        allowBlends: settings.allowBlends, allowedPalette: settings.allowedPalette,
        skipBg: settings.skipBg, bgCol: settings.bgCol, bgTh: settings.bgTh,
        stitchCleanup: settings.stitchCleanup, orphans: settings.orphans,
        minSt: settings.minSt, seed: settings.seed,
      };
      if (overrides) Object.keys(overrides).forEach(function(k) { o[k] = overrides[k]; });
      return o;
    }

    // Helper: render a mapped array to a data URL
    function renderUrl(mapped) {
      var pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
      var pcx = pc.getContext("2d"); var imgData = pcx.createImageData(pw, ph); var d = imgData.data;
      for (var i = 0; i < mapped.length; i++) {
        var mm = mapped[i]; var idx = i * 4;
        if (mm.id === "__skip__") { d[idx]=240; d[idx+1]=240; d[idx+2]=240; d[idx+3]=255; }
        else { d[idx]=mm.rgb[0]; d[idx+1]=mm.rgb[1]; d[idx+2]=mm.rgb[2]; d[idx+3]=255; }
      }
      pcx.putImageData(imgData, 0, 0); return pc.toDataURL();
    }

    // Progressive preview: if dithering is on, show a fast map-only result immediately,
    // then let React commit that frame before running the full dither pass.
    if (dith) {
      var fastResult = runCleanupPipeline(raw, pw, ph, pipelineOpts({
        // Fast pre-pass: skip the slow stages (dither, cleanup, orphans) but
        // honour the user's blend preference so the preview is bit-faithful
        // (see C4 in reports/preview-3-diagnosis.md).
        dith: false, stitchCleanup: null, orphans: 0,
      }));
      if (fastResult) state.setPreviewUrl(renderUrl(fastResult.mapped));
      fullPassTimerRef.current = setTimeout(runFull, 0);
      return;
    }
    runFull();

    function runFull() {
      fullPassTimerRef.current = null;
      var pipelineResult = runCleanupPipeline(raw, pw, ph, pipelineOpts());
      if (!pipelineResult) return;
      var mapped = pipelineResult.mapped;
      var confettiRaw = pipelineResult.confettiRaw;
      var confettiClean = pipelineResult.confettiClean;
      var preCleanupIds = pipelineResult.preCleanupIds || null;

      var stitchable = 0, skipped = 0, colorCounts = {}, colorRgbs = {};
      for (var j = 0; j < mapped.length; j++) {
        var m = mapped[j];
        if (m.id === "__skip__") { skipped++; }
        else { stitchable++; colorCounts[m.id] = (colorCounts[m.id] || 0) + 1; if (!colorRgbs[m.id]) colorRgbs[m.id] = m.rgb; }
      }
      var uniqueColors = Object.keys(colorCounts).length;
      var scaleFactor = (sW * sH) / (pw * ph);
      var estSkeins = 0;
      Object.values(colorCounts).forEach(function(ct) { estSkeins += skeinEst(Math.round(ct * scaleFactor), fabricCt); });

      // QW2: Stash usage stat
      var stashUsage = null;
      if (stashConstrained && globalStash) {
        var availableCount = 0;
        Object.keys(globalStash).forEach(function(id) { if ((globalStash[id].owned || 0) > 0) availableCount++; });
        stashUsage = { used: uniqueColors, available: availableCount };
      }

      state.setPreviewStats({
        stitchable: Math.round(stitchable * scaleFactor),
        skipped: Math.round(skipped * scaleFactor),
        uniqueColors: uniqueColors,
        estSkeins: estSkeins,
        confettiPct: confettiRaw.pct,
        confettiSingles: Math.round(confettiRaw.singles * scaleFactor),
        confettiCleanSingles: confettiClean ? Math.round(confettiClean.singles * scaleFactor) : null,
        stashUsage: stashUsage,
      });

      var colorList = Object.keys(colorCounts).map(function(id) {
        return { id: id, rgb: colorRgbs[id], count: colorCounts[id] };
      }).sort(function(a, b) { return b.count - a.count; });
      state.setPreviewColors(colorList);
      state.setPreviewMapped(mapped);
      state.setPreviewDims({ pw: pw, ph: ph });

      // Render preview canvas and compute confetti heatmap in same loop
      var pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
      var pcx = pc.getContext("2d");
      var imgData = pcx.createImageData(pw, ph); var d = imgData.data;
      var hData = pcx.createImageData(pw, ph); var hd = hData.data;
      var hasHeat = false;
      for (var i = 0; i < mapped.length; i++) {
        var mm = mapped[i]; var idx = i * 4;
        if (mm.id === "__skip__") { d[idx]=240; d[idx+1]=240; d[idx+2]=240; d[idx+3]=255; }
        else {
          d[idx]=mm.rgb[0]; d[idx+1]=mm.rgb[1]; d[idx+2]=mm.rgb[2]; d[idx+3]=255;
          var row = Math.floor(i / pw), col = i % pw;
          var isolated = true;
          if (col > 0 && mapped[i - 1].id === mm.id) isolated = false;
          if (isolated && col < pw - 1 && mapped[i + 1].id === mm.id) isolated = false;
          if (isolated && row > 0 && mapped[i - pw].id === mm.id) isolated = false;
          if (isolated && row < ph - 1 && mapped[i + pw].id === mm.id) isolated = false;
          if (isolated) { hd[idx]=255; hd[idx+1]=60; hd[idx+2]=0; hd[idx+3]=220; hasHeat = true; }
        }
      }
      pcx.putImageData(imgData, 0, 0);
      // Diff overlay on preview thumbnail
      if (showCleanupDiff && ((stitchCleanup && stitchCleanup.enabled) || orphans > 0) && preCleanupIds) {
        pcx.fillStyle = "rgba(255,0,255,0.45)";
        for (var pi = 0; pi < mapped.length; pi++) {
          if (preCleanupIds[pi] !== mapped[pi].id && preCleanupIds[pi] !== "__skip__") {
            var pcs2 = 1; // each preview pixel is 1px
            pcx.fillRect(pi % pw, Math.floor(pi / pw), pcs2, pcs2);
          }
        }
      }
      state.setPreviewUrl(pc.toDataURL());
      if (hasHeat) {
        var hc = document.createElement("canvas"); hc.width = pw; hc.height = ph;
        var hcx = hc.getContext("2d"); hcx.putImageData(hData, 0, 0);
        state.setPreviewHeatmap(hc.toDataURL());
      } else {
        state.setPreviewHeatmap(null);
      }
    }
  }, [
    state.img, state.conversionSettings, state.showCleanupDiff, state.globalStash,
  ]);

  React.useEffect(function() {
    return function() { if (fullPassTimerRef.current) { clearTimeout(fullPassTimerRef.current); fullPassTimerRef.current = null; } };
  }, []);

  React.useEffect(function() {
    if (!state.img) return;
    var timer = state.previewTimerRef.current;
    if (timer) clearTimeout(timer);
    // Mark loading immediately so the spinner appears during the debounce
    // window — keeps the UI honest about pending work.
    if (state.setPreviewLoading) state.setPreviewLoading(true);
    state.previewTimerRef.current = setTimeout(function() {
      try { generatePreview(); }
      finally { if (state.setPreviewLoading) state.setPreviewLoading(false); }
    }, 400);
    return function() {
      if (state.previewTimerRef.current) clearTimeout(state.previewTimerRef.current);
    };
  }, [generatePreview]); // eslint-disable-line react-hooks/exhaustive-deps

  return { generatePreview: generatePreview };
};
