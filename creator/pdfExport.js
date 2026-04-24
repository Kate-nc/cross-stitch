/* creator/pdfExport.js — Main-thread façade for the new PDF export pipeline.
 *
 * Owns one shared Web Worker (pdf-export-worker.js), spawned lazily on first use.
 * Each call to runExport gets a unique reqId; stale results from cancelled jobs
 * are discarded. Progress messages are forwarded through onProgress.
 *
 * Exposes (window):
 *   PdfExport.runExport(project, options, onProgress) → Promise<Uint8Array>
 *   PdfExport.cancel(reqId)
 *   PdfExport.downloadBytes(bytes, filename)
 *   PdfExport.capturePreviewJpeg(canvas, quality)
 *
 *   // Back-compat: old call sites in creator-main.js / header.js still call
 *   // window.exportPDF(options, ctx). The shim below adapts those calls onto
 *   // the new pipeline using sensible defaults for headless invocations.
 *   window.exportPDF(options, ctx)
 *   window.generatePatternThumbnail(pat, sW, sH, partialStitches)  // unchanged-ish
 */
(function () {
  "use strict";

  // Hoisted: regex for sanitising filename characters; reused across runExport calls.
  var UNSAFE_FILENAME_CHARS = /[^\w\-]+/g;

  var workerRef = null;
  var nextReqId = 1;
  var pending = {}; // reqId → { resolve, reject, onProgress, cancelled }

  function getWorker() {
    if (workerRef) return workerRef;
    try {
      workerRef = new Worker("pdf-export-worker.js");
    } catch (e) {
      throw new Error("Failed to spawn PDF export worker: " + e.message);
    }
    workerRef.onmessage = function (e) {
      var msg = e.data || {};
      var slot = pending[msg.reqId];
      if (!slot || slot.cancelled) return;
      if (msg.type === "progress") {
        if (slot.onProgress) {
          try { slot.onProgress(msg); } catch (_) {}
        }
      } else if (msg.type === "result") {
        delete pending[msg.reqId];
        slot.resolve(new Uint8Array(msg.pdfBytes));
      } else if (msg.type === "error") {
        delete pending[msg.reqId];
        var err = new Error(msg.message || "PDF export failed");
        if (msg.stack) err.stack = msg.stack;
        slot.reject(err);
      }
    };
    workerRef.onerror = function (e) {
      // Reject every in-flight job and tear down the worker so a fresh one
      // is spawned next time.
      Object.keys(pending).forEach(function (id) {
        var slot = pending[id];
        delete pending[id];
        slot.reject(new Error("PDF worker crashed: " + (e.message || "unknown error")));
      });
      try { workerRef.terminate(); } catch (_) {}
      workerRef = null;
    };
    return workerRef;
  }

  function runExport(project, options, onProgress) {
    var w;
    try { w = getWorker(); } catch (e) { return Promise.reject(e); }
    var reqId = nextReqId++;
    return new Promise(function (resolve, reject) {
      pending[reqId] = { resolve: resolve, reject: reject, onProgress: onProgress, cancelled: false, reqId: reqId };
      try {
        w.postMessage({ type: "export", reqId: reqId, project: project, options: options || {} });
      } catch (postErr) {
        delete pending[reqId];
        reject(postErr);
      }
    });
  }

  function cancel(reqId) {
    var slot = pending[reqId];
    if (!slot) return;
    slot.cancelled = true;
    delete pending[reqId];
    // Easiest reliable cancellation: tear down the worker. Cheap to respawn.
    if (workerRef) { try { workerRef.terminate(); } catch (_) {} workerRef = null; }
    slot.reject(new Error("PDF export cancelled"));
  }

  function cancelAll() {
    var ids = Object.keys(pending);
    ids.forEach(function (id) { cancel(parseInt(id, 10)); });
  }

  function downloadBytes(bytes, filename) {
    var blob = new Blob([bytes], { type: "application/pdf" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "pattern.pdf";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { document.body.removeChild(a); } catch (_) {}
      URL.revokeObjectURL(url);
    }, 200);
  }

  /**
   * Capture a small JPEG of a canvas (e.g. RealisticCanvas offscreen) for the
   * cover page. Returns a data URL string, or null if the canvas isn't usable.
   */
  function capturePreviewJpeg(canvas, quality) {
    if (!canvas || typeof canvas.toDataURL !== "function") return null;
    try {
      // Downscale very large source canvases so the embedded JPEG stays small.
      var maxDim = 1400;
      if (canvas.width <= maxDim && canvas.height <= maxDim) {
        return canvas.toDataURL("image/jpeg", quality || 0.85);
      }
      var ratio = canvas.width / canvas.height;
      var nw = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
      var nh = ratio >= 1 ? Math.round(maxDim / ratio) : maxDim;
      var tmp = document.createElement("canvas");
      tmp.width = nw; tmp.height = nh;
      tmp.getContext("2d").drawImage(canvas, 0, 0, nw, nh);
      return tmp.toDataURL("image/jpeg", quality || 0.85);
    } catch (_) { return null; }
  }

  /**
   * Build a `project` payload suitable for runExport from the live editor
   * context (the merged ctx object passed to legacy exportPDF). This keeps
   * worker-bound data in plain JSON-serialisable form.
   */
  function buildExportProject(ctx) {
    if (!ctx) return null;
    var pal = (ctx.pal || ctx.palette || []).map(function (e) {
      return e ? {
        id: e.id,
        name: e.name,
        rgb: e.rgb,
        type: e.type,
        threads: e.threads ? e.threads.map(function (t) { return { id: t.id, name: t.name, rgb: t.rgb }; }) : undefined,
      } : null;
    }).filter(function (e) { return e && e.id; });

    var pattern = (ctx.pat || []).map(function (c) {
      if (!c) return { id: "__empty__", type: "solid", rgb: [255, 255, 255] };
      return { id: c.id, type: c.type || "solid", rgb: c.rgb || [128, 128, 128] };
    });

    var partialEntries = null;
    if (ctx.partialStitches && typeof ctx.partialStitches.forEach === "function") {
      partialEntries = [];
      ctx.partialStitches.forEach(function (v, k) { partialEntries.push([k, v]); });
    } else if (Array.isArray(ctx.partialStitches)) {
      partialEntries = ctx.partialStitches;
    }

    return {
      name: ctx.projectName || ctx.name || "Untitled pattern",
      designer: ctx.projectDesigner || ctx.designer || "",
      description: ctx.projectDescription || ctx.description || "",
      w: ctx.sW || ctx.w,
      h: ctx.sH || ctx.h,
      pattern: pattern,
      palette: pal,
      partialStitches: partialEntries,
      bsLines: ctx.bsLines || [],
      fabricCt: ctx.fabricCt || 14,
      skeinPrice: ctx.skeinPrice,
      coverPreviewJpeg: ctx.coverPreviewJpeg || null,
    };
  }

  /**
   * Pull designer branding values from UserPrefs.
   */
  function readBranding() {
    if (typeof window === "undefined" || !window.UserPrefs) return {};
    var UP = window.UserPrefs;
    return {
      designerName:         UP.get("designerName")         || "",
      designerLogo:         UP.get("designerLogo")         || null,
      designerLogoPosition: UP.get("designerLogoPosition") || "top-right",
      designerCopyright:    UP.get("designerCopyright")    || "",
      designerContact:      UP.get("designerContact")      || "",
    };
  }

  /**
   * Default options for the "Pattern Keeper" preset.
   */
  function presetPatternKeeper() {
    return {
      pageSize: "auto",
      marginsMm: 12,
      stitchesPerPage: "medium",
      chartModes: ["bw", "colour"],
      overlap: true,
      includeCover: true,
      includeInfo: true,
      includeIndex: true,
      miniLegend: true,
      locale: (typeof navigator !== "undefined" && navigator.language) || "en-GB",
    };
  }

  /**
   * Default options for the "Home printing" preset.
   */
  function presetHomePrinting() {
    return {
      pageSize: "auto",
      marginsMm: 12,
      stitchesPerPage: "large",
      chartModes: ["colour", "bw"],
      overlap: false,
      includeCover: false,
      includeInfo: true,
      includeIndex: true,
      miniLegend: true,
      locale: (typeof navigator !== "undefined" && navigator.language) || "en-GB",
    };
  }

  // ── Back-compat shim for old window.exportPDF(options, ctx) call sites ──
  // `options` from those callers is the legacy { displayMode, cellSize, singlePage }.
  // Map legacy options onto the new options shape conservatively.
  function legacyExportPDF(legacyOpts, ctx) {
    var legacy = legacyOpts || {};
    var modes;
    switch (legacy.displayMode) {
      case "color":        modes = ["colour"]; break;
      case "color_symbol": modes = ["colour"]; break;
      case "symbol":       modes = ["bw"]; break;
      default:             modes = ["bw", "colour"];
    }
    var stPerPg;
    if (legacy.cellSize >= 4) stPerPg = "large";
    else if (legacy.cellSize <= 2.5) stPerPg = "small";
    else stPerPg = "medium";

    var project = buildExportProject(ctx);
    if (!project) return Promise.reject(new Error("No pattern to export"));
    var opts = {
      pageSize: "auto",
      marginsMm: 12,
      stitchesPerPage: stPerPg,
      chartModes: modes,
      overlap: true,
      includeCover: true,
      includeInfo: true,
      includeIndex: true,
      miniLegend: true,
      branding: readBranding(),
      locale: (typeof navigator !== "undefined" && navigator.language) || "en-GB",
    };
    return runExport(project, opts).then(function (bytes) {
      downloadBytes(bytes, (project.name || "pattern").replace(UNSAFE_FILENAME_CHARS, "_") + ".pdf");
      return bytes;
    }).catch(function (err) {
      // M9: Surface font-missing errors via Toast for legacy callers
      // (Tracker PDF export, File menu) that don't otherwise render the
      // error message.
      try {
        var msg = (err && err.message) || String(err);
        if (typeof Toast !== 'undefined' && Toast.show && /symbol font/i.test(msg)) {
          Toast.show({ message: 'PDF export failed. Please refresh the page and try again.', type: 'error', duration: 6000 });
        }
      } catch (_) { /* best-effort */ }
      throw err;
    });
  }

  /** Legacy thumbnail generator — kept for any code still calling it. */
  function legacyGenerateThumbnail(pat, sW, sH, partialStitches) {
    if (!pat || !sW || !sH) return null;
    try {
      var canvas = document.createElement("canvas");
      canvas.width = sW; canvas.height = sH;
      var ctx = canvas.getContext("2d");
      var imgData = ctx.createImageData(sW, sH);
      var psMap = (partialStitches instanceof Map) ? partialStitches : null;
      var quads = ["TL", "TR", "BL", "BR"];
      for (var i = 0; i < pat.length; i++) {
        var c = pat[i];
        var off = i * 4;
        var isEmpty = !c || c.id === "__skip__" || c.id === "__empty__";
        var baseRgb = isEmpty ? [255, 255, 255] : (c.rgb || [128, 128, 128]);
        var rgb = baseRgb;
        if (psMap) {
          var psEntry = psMap.get(i);
          if (psEntry) {
            var r = 0, g = 0, b = 0;
            for (var q = 0; q < 4; q++) {
              var qs = psEntry[quads[q]];
              var qRgb = (qs && qs.rgb) ? qs.rgb : baseRgb;
              r += qRgb[0]; g += qRgb[1]; b += qRgb[2];
            }
            rgb = [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
          }
        }
        imgData.data[off] = rgb[0]; imgData.data[off + 1] = rgb[1]; imgData.data[off + 2] = rgb[2]; imgData.data[off + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (_) { return null; }
  }

  window.PdfExport = {
    runExport: runExport,
    cancel: cancel,
    cancelAll: cancelAll,
    downloadBytes: downloadBytes,
    capturePreviewJpeg: capturePreviewJpeg,
    buildExportProject: buildExportProject,
    readBranding: readBranding,
    presetPatternKeeper: presetPatternKeeper,
    presetHomePrinting: presetHomePrinting,
  };

  // Back-compat globals (used by header File menu and creator-main.js)
  window.exportPDF = legacyExportPDF;
  window.generatePatternThumbnail = legacyGenerateThumbnail;
  // exportCoverSheet was a separate jsPDF helper; route to the same pipeline
  // with cover-only options for back-compat.
  window.exportCoverSheet = function (ctx) {
    var project = buildExportProject(ctx);
    if (!project) return Promise.reject(new Error("No pattern to export"));
    var opts = Object.assign(presetPatternKeeper(), {
      chartModes: [], includeInfo: false, includeIndex: false, miniLegend: false, includeCover: true,
      branding: readBranding(),
    });
    return runExport(project, opts).then(function (bytes) {
      downloadBytes(bytes, (project.name || "pattern").replace(UNSAFE_FILENAME_CHARS, "_") + "_cover.pdf");
    });
  };
})();
