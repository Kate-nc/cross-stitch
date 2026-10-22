/* creator/usePreview.js — Generates the preview picture and stats while
   the user adjusts settings. Debounced 400 ms.
   Expects state object from useCreatorState. The single source of truth for
   what settings affect the preview is state.conversionSettings (built by
   useCreatorState) — see CONVERSION_STATE_KEYS in useCreatorState.js.

   The conversion runs in a background worker (generate-worker.js, the one
   Generate uses) at the chart's own size, so the page never freezes while it
   works (about 1 s for 40 000 stitches, 3 s for 500 x 333 in Chromium) and
   the preview is the chart Generate will make, counts and all. Without
   workers (file://) it runs on the page, at most PREVIEW_PAGE_MAX_AREA
   stitches, scaled up for the counts. */

// Stitches the preview converts on the page when there is no worker. A
// bigger chart is previewed smaller, so its counts are estimates.
var PREVIEW_PAGE_MAX_AREA = 40000;

window.usePreview = function usePreview(state) {
  var rawCacheRef = React.useRef(null); // { sig, raw, pw, ph } — geometric cache
  var fullPassTimerRef = React.useRef(null); // pending setTimeout for full dither pass
  var sourceRef = React.useRef(state.img);
  // The preview worker: null (not made yet), a Worker, or 'unavailable'.
  var workerRef = React.useRef(null);
  var busyRef = React.useRef(false);      // a job is running in the worker
  var jobRef = React.useRef(0);           // id of the latest job; older results are ignored
  var failuresRef = React.useRef(0);

  function getWorker() {
    if (workerRef.current === 'unavailable') return null;
    if (workerRef.current) return workerRef.current;
    if (typeof Worker === 'undefined') { workerRef.current = 'unavailable'; return null; }
    try { workerRef.current = new Worker('generate-worker.js'); }
    catch (_) { workerRef.current = 'unavailable'; return null; }
    return workerRef.current;
  }
  // Stop the worker (a job for old settings is no longer wanted). Handlers are
  // detached first so a stopped worker never reaches the page's error handler.
  function stopWorker() {
    var w = workerRef.current;
    if (w && w !== 'unavailable') {
      w.onmessage = null;
      w.onerror = function (ev) { if (ev && typeof ev.preventDefault === 'function') ev.preventDefault(); };
      try { w.terminate(); } catch (_) {}
      workerRef.current = null;
    }
    busyRef.current = false;
  }

  function clearDetails() {
    ['Stats', 'Colors', 'Mapped', 'Heatmap', 'Highlight'].forEach(function(key) {
      if (state['setPreview' + key]) state['setPreview' + key](null);
    });
  }
  function clearPreview() {
    clearDetails();
    state.setPreviewUrl(null);
    state.setPreviewDims(null);
  }

  var generatePreview = React.useCallback(function() {
    if (state.previewTimerRef.current) { clearTimeout(state.previewTimerRef.current); state.previewTimerRef.current = null; }
    if (fullPassTimerRef.current) { clearTimeout(fullPassTimerRef.current); fullPassTimerRef.current = null; }
    var img = state.img;
    var settings = state.conversionSettings;
    // Every early return clears the loading flag the scheduling effect set, so
    // the spinner can't be left running with nothing pending.
    function stopLoading() { if (state.setPreviewLoading) state.setPreviewLoading(false); }
    function failPreview() {
      rawCacheRef.current = null;
      clearPreview();
      if (state.setPreviewError) state.setPreviewError('Could not update the preview. Try again, adjust the settings or choose another image.');
      stopLoading();
    }
    if (state.setPreviewError) state.setPreviewError(null);
    // Any result still on its way is for older settings.
    var job = ++jobRef.current;
    if (busyRef.current) stopWorker();
    if (!settings || !img || !img.src) { clearPreview(); stopLoading(); return; }
    if (state.setPreviewLoading) state.setPreviewLoading(true);
    try {
      // Local aliases for the geometric/cache step (these are pure image-prep
      // values, not pipeline values).
      var sW = settings.sW, sH = settings.sH;
      var bri = settings.bri, con = settings.con, sat = settings.sat;
      var smooth = settings.smooth, smoothType = settings.smoothType;
      var preSharpen = settings.preSharpen, preSharpenAmount = settings.preSharpenAmount;
      var fabricCt = settings.fabricCt;
      var stashConstrained = settings.stashConstrained;
      var globalStash = state.globalStash;
      var orphans = settings.orphans;
      var stitchCleanup = settings.stitchCleanup;
      var dith = settings.dith;
      var showCleanupDiff = state.showCleanupDiff;

      // The chart's own size in the worker; on the page, at most
      // PREVIEW_PAGE_MAX_AREA stitches.
      var worker = settings.exactPixelArt ? null : getWorker();
      var pw = sW, ph = sH;
      if (!worker && !settings.exactPixelArt && pw * ph > PREVIEW_PAGE_MAX_AREA) { var scale = Math.sqrt(PREVIEW_PAGE_MAX_AREA / (pw * ph)); pw = Math.round(pw * scale); ph = Math.round(ph * scale); }
      if (pw < 1) pw = 1;
      if (ph < 1) ph = 1;

      // --- Geometric (image-drawing) cache: skip canvas if only pipeline settings changed ---
      var raw, exactResult;
      if (settings.exactPixelArt) {
        exactResult = runExactPixelPipeline(img, settings);
      }
      var geoSig = img.src + '|' + pw + '|' + ph + '|' + bri + '|' + con + '|' + sat + '|' + smooth + '|' + smoothType + '|' + (preSharpen ? preSharpenAmount : '0');
      if (exactResult) { pw = exactResult.width; ph = exactResult.height;
      } else if (rawCacheRef.current && rawCacheRef.current.sig === geoSig) {
        raw = rawCacheRef.current.raw;
      } else {
        var previewImageData = gridPixels(img, pw, ph, { bri: bri, con: con, sat: sat, preSharpenOpts: preSharpen ? { amount: preSharpenAmount } : null });
        raw = previewImageData.data;
        rawCacheRef.current = { sig: geoSig, raw: new Uint8ClampedArray(raw), pw: pw, ph: ph };
      }

      // Pipeline options come straight from the canonical settings bundle. The
      // ONLY caller-side overrides are the geometric step we already did above
      // (image filters), so we strip those keys and forward everything else.
      function pipelineOpts(overrides) {
        var o = {
          maxC: settings.maxC, dith: settings.dith, dithStrength: settings.dithStrength,
          dithAlgo: settings.dithAlgo, dithBayerSize: settings.dithBayerSize,
          allowBlends: settings.allowBlends, allowedPalette: settings.allowedPalette,
          skipBg: settings.skipBg, bgCol: settings.bgCol, bgTh: settings.bgTh,
          stitchCleanup: settings.stitchCleanup, orphans: settings.orphans,
          minSt: settings.minSt, seed: settings.seed,
          smooth: smooth, smoothType: smoothType,
          disambig: settings.disambig, disambigLevel: settings.disambigLevel,
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
          if (mm.id === "__skip__") { d[idx]=240; d[idx+1]=240; d[idx+2]=240; d[idx+3]=0; }
          else { d[idx]=mm.rgb[0]; d[idx+1]=mm.rgb[1]; d[idx+2]=mm.rgb[2]; d[idx+3]=255; }
        }
        pcx.putImageData(imgData, 0, 0); return pc.toDataURL();
      }

      // In the worker: the same job Generate posts, at the chart's size. The
      // picture shown until it answers is the previous one, with the
      // Updating preview status.
      if (worker && !exactResult) {
        var pixels = new Uint8ClampedArray(raw);   // the cached copy stays here
        busyRef.current = true;
        worker.onmessage = function (e) {
          var msg = e.data || {};
          if (msg.reqId !== job) return;
          if (msg.type === 'progress') return;
          busyRef.current = false;
          if (job !== jobRef.current) return;
          if (msg.type === 'error') { failPreview(); return; }
          try {
            runFull({
              mapped: msg.mapped,
              confettiRaw: msg.confettiData.raw,
              // The worker reports the raw counts as "clean" when nothing was tidied.
              confettiClean: msg.preCleanupIds ? msg.confettiData.clean : null,
              preCleanupIds: msg.preCleanupIds || null
            });
          } catch (err) { failPreview(); }
        };
        // A worker that fails (a script that didn't load) is handled here; after
        // two failures the preview runs on the page instead.
        worker.onerror = function (ev) {
          if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
          stopWorker();
          failuresRef.current++;
          if (failuresRef.current >= 2) workerRef.current = 'unavailable';
          if (job === jobRef.current) failPreview();
        };
        worker.postMessage({ type: 'generate', reqId: job, pixels: pixels.buffer, width: pw, height: ph, settings: pipelineOpts() }, [pixels.buffer]);
        return;
      }

      // Progressive preview: if dithering is on, show a fast map-only result immediately,
      // then let React commit that frame before running the full dither pass.
      if (dith && !exactResult) {
        var fastResult = runCleanupPipeline(raw, pw, ph, pipelineOpts({
          // Fast pre-pass: skip the slow stages (dither, cleanup, orphans) but
          // honour the user's blend preference so the preview is bit-faithful
          // (see C4 in reports/preview-3-diagnosis.md).
          dith: false, stitchCleanup: null, orphans: 0,
        }));
        if (fastResult) {
          // The size travels with the picture: the slider shapes itself from
          // previewDims, so a new-size frame must not be paired with old dims.
          var fastUrl = renderUrl(fastResult.mapped);
          clearDetails();
          state.setPreviewDims({ pw: pw, ph: ph });
          state.setPreviewUrl(fastUrl);
        }
        fullPassTimerRef.current = setTimeout(function() {
          try { runFull(); } catch (err) { failPreview(); }
        }, 0);
        return;
      }
      runFull();

      function runFull(workerResult) {
        fullPassTimerRef.current = null;
        var pipelineResult = workerResult || exactResult || runCleanupPipeline(raw, pw, ph, pipelineOpts());
        if (!pipelineResult) { failPreview(); return; }
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
          // Threads of the brand being converted to (P4-5); bare keys are DMC.
          var stashBrand = settings.convertBrand || 'dmc';
          Object.keys(globalStash).forEach(function(id) {
            var keyBrand = id.indexOf(':') < 0 ? 'dmc' : id.slice(0, id.indexOf(':'));
            if (keyBrand === stashBrand && isColorOwned(globalStash[id])) availableCount++;
          });
          stashUsage = { used: uniqueColors, available: availableCount };
        }

        state.setPreviewStats({
          stitchable: Math.round(stitchable * scaleFactor),
          skipped: Math.round(skipped * scaleFactor),
          uniqueColors: uniqueColors,
          estSkeins: estSkeins,
          confettiPct: confettiRaw.pct,
          confettiSingles: Math.round(confettiRaw.singles * scaleFactor),
          confettiSinglesPct: confettiRaw.singlesPct,
          confettiCleanSingles: confettiClean ? Math.round(confettiClean.singles * scaleFactor) : null,
          stashUsage: stashUsage,
          exactMappings: exactResult ? exactResult.mappings : null,
        });

        var colorList = Object.keys(colorCounts).map(function(id) {
          return { id: id, rgb: colorRgbs[id], count: colorCounts[id] };
        }).sort(function(a, b) { return b.count - a.count; });
        state.setPreviewColors(colorList);
        state.setPreviewMapped(mapped);
        state.setPreviewDims({ pw: pw, ph: ph });
        if (state.setPreviewHighlight) state.setPreviewHighlight(null);

        // Render preview canvas and compute confetti heatmap in same loop
        var pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
        var pcx = pc.getContext("2d");
        var imgData = pcx.createImageData(pw, ph); var d = imgData.data;
        var hData = pcx.createImageData(pw, ph); var hd = hData.data;
        var hasHeat = false;
        for (var i = 0; i < mapped.length; i++) {
          var mm = mapped[i]; var idx = i * 4;
          if (mm.id === "__skip__") { d[idx]=240; d[idx+1]=240; d[idx+2]=240; d[idx+3]=0; }
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
        stopLoading();
      }
    } catch (err) { failPreview(); }
  }, [
    state.img, state.conversionSettings, state.showCleanupDiff, state.globalStash,
  ]);

  React.useEffect(function() {
    return function() {
      if (fullPassTimerRef.current) { clearTimeout(fullPassTimerRef.current); fullPassTimerRef.current = null; }
      jobRef.current++;
      stopWorker();
    };
  }, []);

  React.useEffect(function() {
    // A crop or replacement source must never be compared with the old image's
    // converted pixels, stats or cached overlays during the debounce.
    if (sourceRef.current !== state.img) {
      sourceRef.current = state.img;
      rawCacheRef.current = null;
      clearPreview();
    }
    if (state.setPreviewError) state.setPreviewError(null);
    if (!state.img || !state.img.src || !state.conversionSettings) {
      clearPreview();
      if (state.setPreviewLoading) state.setPreviewLoading(false);
      return;
    }
    var timer = state.previewTimerRef.current;
    if (timer) clearTimeout(timer);
    // Mark loading immediately so the spinner appears during the debounce
    // window — keeps the UI honest about pending work.
    if (state.setPreviewLoading) state.setPreviewLoading(true);
    state.previewTimerRef.current = setTimeout(function() {
      generatePreview();
    }, 400);
    return function() {
      if (state.previewTimerRef.current) { clearTimeout(state.previewTimerRef.current); state.previewTimerRef.current = null; }
      // A full pass queued by the previous settings must not land after they
      // changed: it would commit a stale picture and drop the spinner while
      // the new pass is still waiting out its debounce. The same goes for a
      // job in the worker: its result is ignored and the worker is stopped.
      if (fullPassTimerRef.current) { clearTimeout(fullPassTimerRef.current); fullPassTimerRef.current = null; }
      jobRef.current++;
      if (busyRef.current) stopWorker();
    };
  }, [generatePreview]); // eslint-disable-line react-hooks/exhaustive-deps

  return { generatePreview: generatePreview };
};
