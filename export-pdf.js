/* export-pdf.js — "Export PDF" using the stitcher's saved export settings.
 *
 * The Export tab (Materials & Output > Export) stores its choices in
 * UserPrefs (export* keys + creator.pdfWorkshopTheme). Every other way of
 * making a PDF — File > Export PDF… in the Creator and the Tracker, and the
 * Creator's Print PDF button — goes through here, so they produce the same
 * PDF the Export tab would. They used to ignore those settings: the Creator
 * used fixed defaults (colour charts only) and the Tracker a separate,
 * older exporter that was not Pattern Keeper-compatible.
 *
 * Uses the PdfExport pipeline (creator/pdfExport.js) unchanged; on pages
 * that don't bundle it (the Tracker) it is loaded on first use.
 *
 *   window.ExportPdf.optionsFromPrefs()  → PdfExport.runExport options
 *   window.ExportPdf.run(ctx)            → Promise<boolean> (true = downloaded)
 *     ctx: as for PdfExport.buildExportProject — pat, pal, sW, sH, bsLines,
 *          partialStitches, fabricCt, skeinPrice, projectName,
 *          projectDesigner, projectDescription.
 */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  var UNSAFE_FILENAME_CHARS = /[^\w\-]+/g;
  var PDF_EXPORT_SRC = "creator/pdfExport.js";

  function pref(key, fallback) {
    try {
      if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
        var v = window.UserPrefs.get(key);
        if (v !== undefined && v !== null) return v;
      }
    } catch (_) {}
    return fallback;
  }

  // Mirrors ExportTab.doExport's options. Defaults match UserPrefs.DEFAULTS.
  function optionsFromPrefs() {
    var modes = [];
    if (pref("exportChartModeBw", true)) modes.push("bw");
    if (pref("exportChartModeColour", true)) modes.push("colour");
    // The Export tab refuses to export with neither ticked; here there is no
    // control to fix it from, so fall back to both rather than failing.
    if (!modes.length) modes = ["bw", "colour"];
    return {
      pageSize: pref("exportPageSize", "auto"),
      marginsMm: pref("exportMarginsMm", 12),
      stitchesPerPage: pref("exportStitchesPerPage", "medium"),
      customCols: pref("exportCustomCols", 60),
      customRows: pref("exportCustomRows", 70),
      chartModes: modes,
      overlap: !!pref("exportOverlap", true),
      includeCover: !!pref("exportIncludeCover", true),
      includeInfo: !!pref("exportIncludeInfo", true),
      includeIndex: !!pref("exportIncludeIndex", true),
      miniLegend: !!pref("exportMiniLegend", true),
      locale: (typeof navigator !== "undefined" && navigator.language) || "en-GB",
      theme: pref("creator.pdfWorkshopTheme", false) === true ? "workshop" : "pk"
    };
  }

  function toast(message, type, duration) {
    try {
      if (window.Toast && typeof window.Toast.show === "function") {
        window.Toast.show({ message: message, type: type || "info", duration: duration || 3000 });
      }
    } catch (_) {}
  }

  function ensureLoaded() {
    if (window.PdfExport && typeof window.PdfExport.runExport === "function") return Promise.resolve();
    if (typeof window.loadScript !== "function") {
      return Promise.reject(new Error("PDF export is not available on this page."));
    }
    return window.loadScript(PDF_EXPORT_SRC, {
      test: function () { return !!(window.PdfExport && window.PdfExport.runExport); }
    });
  }

  var running = null;

  function run(ctx) {
    if (running) {
      toast("A PDF is already being made.", "info");
      return running;
    }
    running = ensureLoaded().then(function () {
      var PE = window.PdfExport;
      var project = PE.buildExportProject(ctx);
      if (!project || !project.w || !project.h) throw new Error("Nothing to export yet — create or open a pattern first.");
      if (!project.coverPreviewJpeg && typeof window.generatePatternThumbnail === "function") {
        try { project.coverPreviewJpeg = window.generatePatternThumbnail(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches); } catch (_) {}
      }
      var opts = optionsFromPrefs();
      var branding = typeof PE.readBranding === "function" ? PE.readBranding() : {};
      // Per-project designer overrides the global designer branding, as on the Export tab.
      if (ctx && ctx.projectDesigner) branding = Object.assign({}, branding, { designerName: ctx.projectDesigner });
      opts.branding = branding;
      toast("Making your PDF…", "info", 2500);
      return PE.runExport(project, opts, null).then(function (bytes) {
        var fname = (project.name || "pattern").replace(UNSAFE_FILENAME_CHARS, "_") + ".pdf";
        PE.downloadBytes(bytes, fname);
        toast("PDF saved as " + fname, "success", 3000);
        return true;
      });
    }).catch(function (err) {
      toast("PDF export failed: " + ((err && err.message) || err), "error", 6000);
      return false;
    }).then(function (ok) {
      running = null;
      return ok;
    });
    return running;
  }

  window.ExportPdf = {
    optionsFromPrefs: optionsFromPrefs,
    run: run
  };
})();
