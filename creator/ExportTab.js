/* creator/ExportTab.js — Unified Export panel.
 *
 * Replaces the old jsPDF-based export UI. Sections:
 *   1. Quick presets — large one-tap buttons
 *   2. Format & settings — collapsible detailed controls
 *   3. Designer branding — settings persisted via UserPrefs
 *   4. Export action — triggers worker-backed PDF generation with progress UI
 *
 * Depends on:
 *   window.PdfExport          — runExport / downloadBytes / preset helpers (creator/pdfExport.js)
 *   window.PdfChartLayout     — page count preview (creator/pdfChartLayout.js)
 *   window.UserPrefs          — pref persistence
 *   window.CreatorDesignerBrandingSection — branding component
 */

// Module-scope hoisted values (regex / style objects).
var EXPORT_UNSAFE_FILENAME_CHARS = /[^\w\-]+/g;
var EXPORT_PRESET_CARD_BASE = { flex: 1, padding: 14, borderRadius:'var(--radius-lg)', borderWidth: 1.5, borderStyle: "solid", borderColor: "var(--border)", background: "var(--surface)", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap:'var(--s-1)' };
var EXPORT_PRESET_CARD_ACTIVE = { background: "var(--accent)", color: "var(--surface)", borderColor: "var(--accent)" };
var EXPORT_CTA_STYLE = { padding: "14px 22px", fontSize:'var(--text-xl)', borderRadius:'var(--radius-lg)', border: "none", background: "var(--accent)", color: "var(--surface)", cursor: "pointer", fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
var EXPORT_DISABLED_CTA = Object.assign({}, EXPORT_CTA_STYLE, { background: "var(--text-tertiary)", cursor: "not-allowed" });
var EXPORT_SECTION_TOGGLE = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius:'var(--radius-md)', padding: "10px 14px", fontSize:'var(--text-md)', cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", fontWeight: 600, color: "var(--text-primary)" };

window.CreatorExportTab = function CreatorExportTab() {
  var ctx = window.usePatternData();
  var app = window.useApp();
  var h = React.createElement;

  var UP = window.UserPrefs;
  function readPref(k, fallback) { var v = UP ? UP.get(k) : undefined; return v == null ? fallback : v; }
  function writePref(k, v) { try { UP && UP.set(k, v); } catch (_) {} }

  var presetState  = React.useState(readPref("exportPreset",          "patternKeeper"));
  var pageSize     = React.useState(readPref("exportPageSize",        "auto"));
  var marginsMm    = React.useState(readPref("exportMarginsMm",       12));
  var stPerPg      = React.useState(readPref("exportStitchesPerPage", "medium"));
  var customCols   = React.useState(readPref("exportCustomCols",      60));
  var customRows   = React.useState(readPref("exportCustomRows",      70));
  var modeBw       = React.useState(readPref("exportChartModeBw",     true));
  var modeColour   = React.useState(readPref("exportChartModeColour", true));
  var overlap      = React.useState(readPref("exportOverlap",         true));
  var includeCover = React.useState(readPref("exportIncludeCover",    true));
  var includeInfo  = React.useState(readPref("exportIncludeInfo",     true));
  var includeIndex = React.useState(readPref("exportIncludeIndex",    true));
  var includeLegend = React.useState(readPref("exportIncludeLegend", true));
  var includeBranding = React.useState(readPref("exportIncludeBranding", true));
  var namedPresets = React.useState(function () { return UP.namedExportPresets(); });
  var selectedPreset = React.useState("");
  var presetName = React.useState("");
  var previewPage = React.useState(0);
  var miniLegend   = React.useState(readPref("exportMiniLegend",      true));
  var workshopTheme = React.useState(readPref("creator.pdfWorkshopTheme", false));
  var settingsOpen = React.useState(false);
  var brandingOpen = React.useState(false);
  var exportFormat = React.useState("pdf"); // "pdf" | "png"

  function bind(pair, prefKey) {
    return function (v) { pair[1](v); if (prefKey) writePref(prefKey, v); if (prefKey && prefKey !== "exportPreset" && setPreset) setPreset("custom"); };
  }
  var setPreset       = bind(presetState,  "exportPreset");
  var setPageSize     = bind(pageSize,     "exportPageSize");
  var setMarginsMm    = bind(marginsMm,    "exportMarginsMm");
  var setStPerPg      = bind(stPerPg,      "exportStitchesPerPage");
  var setCustomCols   = bind(customCols,   "exportCustomCols");
  var setCustomRows   = bind(customRows,   "exportCustomRows");
  var setModeBw       = bind(modeBw,       "exportChartModeBw");
  var setModeColour   = bind(modeColour,   "exportChartModeColour");
  var setOverlap      = bind(overlap,      "exportOverlap");
  var setIncludeCover = bind(includeCover, "exportIncludeCover");
  var setIncludeInfo  = bind(includeInfo,  "exportIncludeInfo");
  var setIncludeIndex = bind(includeIndex, "exportIncludeIndex");
  var setIncludeLegend = bind(includeLegend, "exportIncludeLegend");
  var setIncludeBranding = bind(includeBranding, "exportIncludeBranding");
  var setMiniLegend   = bind(miniLegend,   "exportMiniLegend");
  var setWorkshopTheme = bind(workshopTheme, "creator.pdfWorkshopTheme");
  var setSettingsOpen = settingsOpen[1];
  var setBrandingOpen = brandingOpen[1];

  var progressState = React.useState(null);
  var setProgress = progressState[1];
  var errorState = React.useState(null);
  var setError = errorState[1];
  var runningRef = React.useRef(null);

  function applyPreset(name) {
    exportFormat[1]("pdf");
    var src = name === "homePrinting" ? window.PdfExport.presetHomePrinting()
                                      : window.PdfExport.presetPatternKeeper();
    setPageSize(src.pageSize); setMarginsMm(src.marginsMm);
    setStPerPg(src.stitchesPerPage);
    setModeBw(src.chartModes.indexOf("bw") >= 0);
    setModeColour(src.chartModes.indexOf("colour") >= 0);
    setOverlap(!!src.overlap);
    setIncludeCover(!!src.includeCover);
    setIncludeInfo(!!src.includeInfo);
    setIncludeIndex(!!src.includeIndex);
    setMiniLegend(!!src.miniLegend);
    setIncludeLegend(true); setIncludeBranding(true); setWorkshopTheme(false);
    setCustomCols(60); setCustomRows(70); selectedPreset[1](""); setPreset(name);
  }

  var presetPairs = {
    exportPageSize: pageSize, exportMarginsMm: marginsMm, exportStitchesPerPage: stPerPg,
    exportCustomCols: customCols, exportCustomRows: customRows, exportChartModeBw: modeBw,
    exportChartModeColour: modeColour, exportOverlap: overlap, exportIncludeCover: includeCover,
    exportIncludeInfo: includeInfo, exportIncludeIndex: includeIndex, exportIncludeLegend: includeLegend,
    exportMiniLegend: miniLegend, exportIncludeBranding: includeBranding, "creator.pdfWorkshopTheme": workshopTheme
  };
  function savePreset(edit) {
    try {
      var settings = {};
      Object.keys(presetPairs).forEach(function(k) { settings[k] = presetPairs[k][0]; });
      var item = UP.saveExportPreset(presetName[0], settings, edit ? selectedPreset[0] : null);
      namedPresets[1](UP.namedExportPresets()); selectedPreset[1](item.name); setError(null);
    } catch (err) { setError(err.message); }
  }
  function applyNamedPreset(name) {
    var item = UP.namedExportPresets().find(function(p) { return p.name === name; });
    if (!item) { setError("This preset was removed. Choose another preset."); namedPresets[1](UP.namedExportPresets()); return; }
    Object.keys(presetPairs).forEach(function(k) { bind(presetPairs[k], k)(item.settings[k]); });
    selectedPreset[1](item.name); presetName[1](item.name); exportFormat[1]("pdf"); setPreset("custom"); setError(null);
  }
  function deletePreset() {
    try {
      UP.deleteExportPreset(selectedPreset[0]); namedPresets[1](UP.namedExportPresets());
      selectedPreset[1](""); presetName[1](""); setError(null);
    } catch (err) { setError(err.message); }
  }
  function chartOnly() {
    exportFormat[1]("pdf");
    setIncludeCover(false); setIncludeInfo(false); setIncludeIndex(false);
    setIncludeLegend(false); setMiniLegend(false); setPreset("custom");
  }
  var modesArr = [];
  if (modeBw[0]) modesArr.push("bw");
  if (modeColour[0]) modesArr.push("colour");
  function currentOptions() {
    var branding = window.PdfExport.readBranding();
    if (app.projectDesigner) branding = Object.assign({}, branding, {designerName: app.projectDesigner});
    return {
      pageSize: pageSize[0], marginsMm: marginsMm[0], stitchesPerPage: stPerPg[0],
      customCols: customCols[0], customRows: customRows[0], chartModes: modesArr, overlap: overlap[0],
      includeCover: includeCover[0], includeInfo: includeInfo[0], includeIndex: includeIndex[0],
      includeLegend: includeLegend[0], miniLegend: miniLegend[0], includeBranding: includeBranding[0],
      branding: includeBranding[0] ? branding : {}, locale: navigator.language || "en-GB",
      theme: workshopTheme[0] ? "workshop" : "pk"
    };
  }
  var pageGeom = null, paged = null, plan = null, validationError = null;
  var exportProject = React.useMemo(function () { return ctx && ctx.pat ? window.PdfExport.buildExportProject(Object.assign({}, ctx, {
    projectName: app.projectName, projectDesigner: app.projectDesigner, projectDescription: app.projectDescription
  })) : null; }, [ctx, app.projectName, app.projectDesigner, app.projectDescription]);
  if (exportProject) {
    try {
      if ((ctx.specialtyStitches || []).length) throw new Error("PDF export does not support petite or long stitches.");
      plan = window.PdfChartLayout.planExport(exportProject, currentOptions());
      window.PdfChartLayout.buildCodepointMap(exportProject.palette, window.SYMBOL_FONT_SPEC,
        window.PdfChartLayout.usedThreadCounts(exportProject));
      pageGeom = plan.geom; paged = plan.pages;
    } catch (err) { validationError = err.message; plan = null; pageGeom = null; paged = null; }
  }
  var totalPagesPreview = plan ? plan.totalPages : 0;
  var previewImage = React.useMemo(function () {
    return ctx && ctx.pat ? window.generatePatternThumbnail(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches) : null;
  }, [ctx && ctx.pat, ctx && ctx.sW, ctx && ctx.sH, ctx && ctx.partialStitches]);
  function layoutPreview() {
    if (!plan) return h("p", {role: "alert"}, validationError);
    var g = plan.geom, pageIndex = Math.min(previewPage[0], plan.pages.length - 1), seg = plan.pages[pageIndex];
    var chartX = g.marginMm + 6, chartY = g.marginMm + g.chartHeaderMm;
    var cw = (seg.x1 - seg.x0) * g.cellMm, ch = (seg.y1 - seg.y0) * g.cellMm;
    return h("figure", {style: {margin: 0}, "aria-label": "PDF layout preview"},
      h("figcaption", null, plan.totalPages + " pages: " + plan.chartPages + " chart, " + plan.legendPages +
        " thread legend, " + (includeCover[0] ? 1 : 0) + " cover, " + (includeInfo[0] ? 1 : 0) + " info, " + plan.indexPages + " index."),
      h("p", null, g.pageWmm + " × " + g.pageHmm + " mm; margins " + g.marginMm + " mm. " +
        g.colsPerPage + " × " + g.rowsPerPage + " stitches per page; " + g.cellMm.toFixed(2) + " mm cells. " +
        (overlap[0] ? "Adjacent pages repeat 2 rows/columns." : "No overlap.") +
        (miniLegend[0] ? " Mini-legend on chart pages." : " No mini-legend.")),
      h("label", {style: {display: "block", marginBottom: 8}}, "Preview chart page ",
        h("select", {style: {minHeight: 44, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--text-primary)"}, "aria-label": "Preview chart page", value: pageIndex, onChange: function(e) { previewPage[1](Number(e.target.value)); }},
          plan.pages.map(function(p) { return h("option", {key: p.pageIndex, value: p.pageIndex}, (p.pageIndex + 1) + " of " + plan.pages.length); }))),
      h("svg", {viewBox: "0 0 " + g.pageWmm + " " + g.pageHmm, width: 210, role: "img", "aria-label": "Chart page " + (pageIndex+1) + ", to scale", style: {maxWidth: "100%", border: "1px solid var(--border)", background: "var(--surface)"}},
        h("rect", {x: g.marginMm, y: g.marginMm, width: g.contentWmm, height: g.contentHmm, fill: "none", stroke: "var(--border)", strokeDasharray: "2 2"}),
        h("text", {x: g.marginMm, y: g.marginMm + 6, fontSize: 4, fill: "var(--text-primary)"}, "Chart page " + (pageIndex+1)),
        h("svg", {x: chartX, y: chartY, width: cw, height: ch, viewBox: seg.x0 + " " + seg.y0 + " " + (seg.x1-seg.x0) + " " + (seg.y1-seg.y0), preserveAspectRatio: "none"},
          previewImage && h("image", {href: previewImage, width: ctx.sW, height: ctx.sH, preserveAspectRatio: "none"})),
        seg.overlapLeft > 0 && h("rect", {x: chartX, y: chartY, width: seg.overlapLeft*g.cellMm, height: ch, fill: "var(--text-primary)", opacity: 0.15}),
        seg.overlapTop > 0 && h("rect", {x: chartX, y: chartY, width: cw, height: seg.overlapTop*g.cellMm, fill: "var(--text-primary)", opacity: 0.15}),
        Array.from({length: seg.x1-seg.x0}, function(_,i) {return (seg.x0+i+1)%10 === 0 && h("line", {key: "x"+i, x1: chartX+(i+1)*g.cellMm, x2: chartX+(i+1)*g.cellMm, y1: chartY, y2: chartY+ch, stroke: "var(--text-primary)", strokeWidth: 0.2});}),
        Array.from({length: seg.y1-seg.y0}, function(_,i) {return (seg.y0+i+1)%10 === 0 && h("line", {key: "y"+i, x1: chartX, x2: chartX+cw, y1: chartY+(i+1)*g.cellMm, y2: chartY+(i+1)*g.cellMm, stroke: "var(--text-primary)", strokeWidth: 0.2});}),
        h("rect", {x: chartX, y: chartY, width: cw, height: ch, fill: "none", stroke: "var(--text-primary)", strokeWidth: 0.4}),
        miniLegend[0] && h("text", {x: chartX, y: g.pageHmm-g.marginMm-10, fontSize: 4, fill: "var(--text-primary)"}, "Mini-legend")),
      workshopTheme[0] && h("p", {role: "note"}, "Workshop print theme is selected. Use the standard black-grid output for Pattern Keeper; choose For Pattern Keeper to reset the theme."),
      h("p", null, "Layout illustration: chart colours and bounds; symbols and text are rendered in the PDF. " +
        (includeBranding[0] ? "Current profile branding is used on cover/info pages; the project designer takes precedence." : "Profile branding is excluded.") +
        " Chart pages do not print profile branding."),
      h("p", null, "Chart page regions (each selected mode uses this layout): " + paged.slice(0, 12).map(function(p) {
        return (p.pageIndex + 1) + ": cols " + (p.x0+1) + "–" + p.x1 + ", rows " + (p.y0+1) + "–" + p.y1;
      }).join("; ") + (paged.length > 12 ? "; plus " + (paged.length-12) + " more." : ""))
    );
  }

  function doExport() {
    if (validationError) { setError(validationError); return; }
    if((ctx.specialtyStitches||[]).length){setError("PDF export does not support petite or long stitches. Use native JSON or PNG; OXS supports petites and reports omitted long stitches.");return;}
    setError(null);
    if (!modesArr.length) { setError("Pick at least one chart mode (B&W or Colour)."); return; }
    // Merge app-level project metadata (name/designer/description live on AppContext, not PatternData).
    var exportCtx = Object.assign({}, ctx, {
      projectName: app.projectName,
      projectDesigner: app.projectDesigner,
      projectDescription: app.projectDescription,
    });
    var project = window.PdfExport.buildExportProject(exportCtx);
    if (!project) { setError("Nothing to export yet — create or open a pattern first."); return; }
    project.coverPreviewJpeg = window.generatePatternThumbnail(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches);
    var opts = currentOptions();
    setProgress({ stage: "init", current: 0, total: totalPagesPreview || 1 });
    var tag = {};
    runningRef.current = tag;
    window.PdfExport.runExport(project, opts, function (msg) {
      if (runningRef.current !== tag) return;
      setProgress({ stage: msg.stage, current: msg.current, total: msg.total || totalPagesPreview });
    }).then(function (bytes) {
      if (runningRef.current !== tag) return;
      setProgress(null); runningRef.current = null;
      var fname = (project.name || "pattern").replace(EXPORT_UNSAFE_FILENAME_CHARS, "_") + ".pdf";
      window.PdfExport.downloadBytes(bytes, fname);
    }).catch(function (err) {
      if (runningRef.current !== tag) return;
      setProgress(null); runningRef.current = null;
      var msg = err.message || "Export failed";
      setError(msg);
      // M9: Surface font-missing errors as a toast so users notice even
      // if the Export tab is scrolled away.
      try {
        if (typeof Toast !== 'undefined' && Toast.show && /symbol font/i.test(msg)) {
          Toast.show({ message: 'PDF export failed. Please refresh the page and try again.', type: 'error', duration: 6000 });
        }
      } catch (_) { /* best-effort */ }
    });
  }
  function cancelExport() {
    if (!runningRef.current) return;
    runningRef.current = null;
    window.PdfExport.cancelAll();
    setProgress(null);
  }

  // Render the pattern to a PNG Blob at CELL px per stitch (default 10).
  // Used by the standalone PNG export and by the C6 zip bundle.
  function renderPatternPng(cellPx) {
    return new Promise(function (resolve, reject) {
      if (!ctx || !ctx.pat || !ctx.sW || !ctx.sH) { reject(new Error("No pattern")); return; }
      var CELL = cellPx || 10;
      var c = document.createElement("canvas");
      c.width = ctx.sW * CELL;
      c.height = ctx.sH * CELL;
      var g = c.getContext("2d");
      g.fillStyle = app.fabricColour || "white";
      g.fillRect(0, 0, c.width, c.height);
      for (var y = 0; y < ctx.sH; y++) {
        for (var x = 0; x < ctx.sW; x++) {
          var cell = ctx.pat[y * ctx.sW + x];
          if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
          var rgb = cell.rgb;
          if (!rgb || rgb.length < 3) continue;
          g.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
          g.fillRect(x * CELL, y * CELL, CELL, CELL);
        }
      }
      ProgressUnits.specialty.draw(g,ctx.specialtyStitches||[],[],0,0,CELL);
      var _toBlobTimer = setTimeout(function () {
        reject(new Error("PNG creation timed out — try a smaller pattern or refresh the page."));
      }, 10000);
      c.toBlob(function (blob) {
        clearTimeout(_toBlobTimer);
        if (!blob) { reject(new Error("Failed to create PNG")); return; }
        resolve(blob);
      }, "image/png");
    });
  }

  function doExportPng() {
    setError(null);
    renderPatternPng(10).then(function (blob) {
      var name = ((app.projectName || "pattern") + "").replace(EXPORT_UNSAFE_FILENAME_CHARS, "_") + ".png";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    }).catch(function (err) {
      setError(err.message || "Failed to create PNG");
    });
  }

  // ── C6: Download bundle (PDF + OXS + PNG + JSON + manifest.json) ──────
  var bundleState = React.useState(null); // {stage, msg} or null
  var setBundleState = bundleState[1];

  function buildProjectJson() {
    // Mirrors the shape produced by useProjectIO.doSaveProject (version 11).
    // Kept inline (rather than refactored into useProjectIO) to keep C6 a
    // single-file change in ExportTab; can be lifted later.
    var psArr = [];
    if (ctx.partialStitches && typeof ctx.partialStitches.forEach === "function") {
      ctx.partialStitches.forEach(function (v, k) {
        var e = {};
        ["TL", "TR", "BL", "BR"].forEach(function (q) { if (v[q]) { e[q] = { id: v[q].id, rgb: v[q].rgb }; var qb = window.cellBrandForSave ? window.cellBrandForSave(v[q], ctx.threadBrand) : undefined; if (qb) e[q].brand = qb; } });
        psArr.push([k, e]);
      });
    }
    var pattern = (window.PatternIO && window.PatternIO.serializePattern)
      ? window.PatternIO.serializePattern(ctx.pat, ctx.threadBrand)
      : ctx.pat.map(function (m) { return m && m.id === "__skip__" ? { id: "__skip__" } : { id: m.id, type: m.type, rgb: m.rgb }; });
    return {
      version: 11,
      page: "creator",
      name: app.projectName || "Untitled pattern",
      designer: app.projectDesigner || "",
      description: app.projectDescription || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { sW: ctx.sW, sH: ctx.sH, fabricCt: ctx.fabricCt, threadBrand: window.threadBrandForSave ? window.threadBrandForSave(ctx.threadBrand) : undefined },
      pattern: pattern,
      bsLines: ctx.bsLines || [],
      specialtyVersion:1,specialtyStitches:ctx.specialtyStitches||[],specialtyDone:(app.trackerFieldsRef&&app.trackerFieldsRef.current&&app.trackerFieldsRef.current.specialtyDone)||[],
      partialStitches: psArr,
      knots: ctx.knots && ctx.knots.length ? (window.Knots ? window.Knots.forSave(ctx.knots, ctx.threadBrand) : ctx.knots.slice()) : undefined,
    };
  }

  function shareOrDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    function cleanup() { setTimeout(function () { URL.revokeObjectURL(url); }, 5000); }
    try {
      if (typeof navigator !== "undefined" && navigator.canShare && typeof File === "function") {
        var file = new File([blob], filename, { type: "application/zip" });
        if (navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: filename })
            .then(cleanup)
            .catch(function () {
              // User dismissed or share failed — fall back to download.
              var a = document.createElement("a");
              a.href = url; a.download = filename;
              document.body.appendChild(a); a.click(); document.body.removeChild(a);
              cleanup();
            });
        }
      }
    } catch (_) { /* fall through to download */ }
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    cleanup();
    return Promise.resolve();
  }

  function doExportBundle() {
    if((ctx.specialtyStitches||[]).length){setError("PDF export does not support petite or long stitches. Use native JSON or PNG; OXS supports petites and reports omitted long stitches.");return;}
    setError(null);
    if (!window.ZipBundle) { setError("Bundle export unavailable — JSZip failed to load."); return; }
    if (!ctx || !ctx.pat || !ctx.pal || !ctx.sW || !ctx.sH) {
      setError("Nothing to export yet — create or open a pattern first.");
      return;
    }
    setBundleState({ stage: "init", msg: "Preparing bundle…" });

    // Assemble project payload + PDF options (same as doExport).
    var exportCtx = Object.assign({}, ctx, {
      projectName: app.projectName,
      projectDesigner: app.projectDesigner,
      projectDescription: app.projectDescription,
    });
    var project = window.PdfExport.buildExportProject(exportCtx);
    if (!project) { setBundleState(null); setError("Nothing to export yet — create or open a pattern first."); return; }
    project.coverPreviewJpeg = window.generatePatternThumbnail(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches);
    if (validationError) { setError(validationError); setBundleState(null); return; }
    var pdfOpts = currentOptions();

    setBundleState({ stage: "pdf", msg: "Rendering PDF…" });
    var pdfPromise = window.PdfExport.runExport(project, pdfOpts).catch(function (err) {
      // PDF failure does not abort — bundle ships without it.
      console.warn("Bundle: PDF export failed, continuing without PDF:", err);
      return null;
    });
    var pngPromise = renderPatternPng(10).catch(function (err) {
      console.warn("Bundle: PNG render failed:", err);
      return null;
    });

    var oxsString = null;
    try {
      oxsString = window.ZipBundle._serializeOxs({
        width: ctx.sW, height: ctx.sH, threadBrand: ctx.threadBrand, pattern: ctx.pat,
        bsLines: ctx.bsLines || [], specialtyStitches:ctx.specialtyStitches||[],partialStitches: ctx.partialStitches, knots: ctx.knots || [],
        beads: (app.trackerFieldsRef && app.trackerFieldsRef.current && app.trackerFieldsRef.current.beads) || []
      }, function (warnings) {
        if (typeof Toast !== 'undefined' && Toast.show) Toast.show({ message: warnings.join(' '), type: 'warning', duration: 10000 });
      });
    } catch (e) {
      setError('Bundle OXS: ' + (e.message || e));
      console.warn("Bundle: OXS serialise failed:", e);
    }
    var jsonObj = null;
    try { jsonObj = buildProjectJson(); } catch (e) { console.warn("Bundle: JSON snapshot failed:", e); }

    Promise.all([pdfPromise, pngPromise]).then(function (parts) {
      var pdfBytes = parts[0];
      var pngBlob = parts[1];

      function runZip() {
        setBundleState({ stage: "zip", msg: "Compressing\u2026" });
        return window.ZipBundle.build({
          projectName: project.name,
          schemaVersion: 11,
          pdfBytes: pdfBytes,
          oxsString: oxsString,
          pngBlob: pngBlob,
          projectJson: jsonObj,
        }, {
          onProgress: function (stage, msg) { setBundleState({ stage: stage, msg: msg }); }
        });
      }

      // Mobile: warn before producing very large bundles.
      var estBytes = (pdfBytes ? pdfBytes.byteLength : 0)
        + (pngBlob ? pngBlob.size : 0)
        + (oxsString ? oxsString.length : 0)
        + (jsonObj ? JSON.stringify(jsonObj).length : 0);
      var isCoarse = (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      if (estBytes > 50 * 1024 * 1024 && isCoarse) {
        return window.ConfirmDialog.show({
          title: "Large bundle",
          message: "Bundle is roughly " + (estBytes / 1024 / 1024).toFixed(1)
            + " MB. Large bundles can be slow on phones. Continue?",
          confirmLabel: "Continue"
        }).then(function (ok) {
          if (!ok) { setBundleState(null); return null; }
          return runZip();
        });
      }
      return runZip();
    }).then(function (zipBlob) {
      if (!zipBlob) return;
      var filename = window.ZipBundle._filename(project.name, 11, new Date());
      setBundleState(null);
      try {
        if (typeof Toast !== "undefined" && Toast.show) {
          Toast.show({ message: "Bundle saved (" + (zipBlob.size / 1024 / 1024).toFixed(1) + " MB)", type: "success", duration: 3000 });
        }
      } catch (_) {}
      shareOrDownload(zipBlob, filename);
    }).catch(function (err) {
      setBundleState(null);
      setError("Bundle export failed: " + (err && err.message ? err.message : err));
    });
  }


  if (!(ctx && ctx.pat && ctx.pal)) return null;
  // B3/B4: rendered as the 'output' sub-tab inside MaterialsHub.
  if (app.tab !== "materials" || app.materialsTab !== "output") return null;

  var presetCardActive = EXPORT_PRESET_CARD_ACTIVE;
  var presetCardBase = EXPORT_PRESET_CARD_BASE;
  var ctaStyle = EXPORT_CTA_STYLE;
  var disabledCta = EXPORT_DISABLED_CTA;
  var sectionToggle = EXPORT_SECTION_TOGGLE;
  var savedControl = {minHeight: 44, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", color: "var(--text-primary)", fontSize: "var(--text-sm)", maxWidth: "100%"};

  return h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
    app.copied && h("div", { style: { background: "var(--success-soft)", border: "1px solid var(--success-soft)", borderRadius:'var(--radius-md)', padding: "8px 14px", fontSize:'var(--text-sm)', color: "var(--success)", fontWeight: 600 } }, "Copied!"),

    h("button", {
      onClick: app.handleOpenInTracker,
      style: { padding: "12px 20px", fontSize: 15, borderRadius:'var(--radius-md)', border: "none", background: "var(--accent-hover)", color: "var(--surface)", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap:'var(--s-2)' }
    }, window.Icons && Icons.thread && Icons.thread(), " Open in Stitch Tracker ", window.Icons && Icons.chevronRight && h("span", { 'aria-hidden': 'true', style: { display: 'inline-flex' } }, Icons.chevronRight())),

    h("div", null,
      h("h3", { style: { margin: "0 0 8px", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, "Quick presets"),
      h("div", { style: { display: "flex", gap: 10 } },
        h("button", { onClick: function () { applyPreset("patternKeeper"); },
          style: Object.assign({}, presetCardBase, presetState[0] === "patternKeeper" && !selectedPreset[0] && stPerPg[0] === "medium" && includeLegend[0] && includeCover[0] && !workshopTheme[0] ? presetCardActive : {}) },
          h("strong", { style: { fontSize:'var(--text-lg)' } }, "For Pattern Keeper"),
          h("span", { style: { display: "inline-block", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", background: "var(--success)", color: "#fff", borderRadius: 3, padding: "1px 5px", marginBottom: 2, alignSelf: "flex-start" } }, "PK Compatible"),
          h("span", { style: { fontSize:'var(--text-xs)', opacity: 0.85 } },
            "Symbols + colour, medium print, 2-row overlap, cover page on. Customers can highlight and track stitches in Pattern Keeper.")
        ),
        h("button", { onClick: function () { applyPreset("homePrinting"); },
          style: Object.assign({}, presetCardBase, presetState[0] === "homePrinting" && !selectedPreset[0] && stPerPg[0] === "large" && includeLegend[0] && !includeCover[0] && !workshopTheme[0] ? presetCardActive : {}) },
          h("strong", { style: { fontSize:'var(--text-lg)' } }, "For printing (home)"),
          h("span", { style: { fontSize:'var(--text-xs)', opacity: 0.85 } },
            "Colour + B&W charts, large print, no overlap, cover page off. Easier on the eyes when stitching from paper.")
        )
      )
    ),

    h("section", {"aria-label": "Reusable export presets", style: {background: "var(--surface-secondary)", padding: 14, borderRadius: "var(--radius-md)", border: "1px solid var(--border)"}},
      h("h3", null, "Saved export presets"),
      h("p", null, "Global on this browser, shared by all projects. Full backups preserve presets; project JSON and sync do not. Branding choices refer to your current profile; project names and designers are not saved in presets."),
      h("div", {style: {display: "flex", gap: 8, flexWrap: "wrap"}},
      h("select", {style: savedControl, "aria-label": "Saved export preset", value: selectedPreset[0], onChange: function(e) { selectedPreset[1](e.target.value); presetName[1](e.target.value); }},
        h("option", {value: ""}, "Choose a preset"), namedPresets[0].map(function(p) { return h("option", {key: p.name, value: p.name}, p.name); })),
      h("button", {style: savedControl, disabled: !selectedPreset[0], onClick: function() { applyNamedPreset(selectedPreset[0]); }}, "Apply preset"),
      h("label", null, "Preset name ", h("input", {style: savedControl, "aria-label": "Preset name", maxLength: 80, value: presetName[0], onChange: function(e) { presetName[1](e.target.value); }})),
      h("button", {style: savedControl, onClick: function() { savePreset(false); }}, "Save as new preset"),
      h("button", {style: savedControl, disabled: !selectedPreset[0], onClick: function() { savePreset(true); }}, "Update selected preset"),
      h("button", {style: savedControl, disabled: !selectedPreset[0], onClick: deletePreset}, "Delete preset")),
      h("p", null, "Adjust Format & settings below, then update the selected preset to save edits. Deleting a preset keeps the current export settings."),
      h("button", {style: savedControl, onClick: chartOnly}, "Chart only"),
      h("p", null, "Chart only removes cover, info, index, thread legend and mini-legends. Select chart modes below; include a thread legend when recipients need a key.")
    ),
    h("section", {"aria-label": "Layout preview", style: {fontSize: "var(--text-sm)", color: "var(--text-secondary)"}}, layoutPreview()),
    app.trackerFieldsRef && app.trackerFieldsRef.current && (app.trackerFieldsRef.current.beads || []).length > 0 && h("p", { role: "note" }, "PDF and PNG exports omit beads. OXS preserves bead appearance and position, but omits completion and object IDs. Use project saves or backups to retain bead progress."),
    h("div", null,
      h("button", { "aria-expanded":settingsOpen[0], onClick: function () { setSettingsOpen(!settingsOpen[0]); }, style: sectionToggle },
        h("span", null, "Format & settings"),
        h("span", { "aria-hidden": "true", style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, color: "var(--text-tertiary)" } },
          (typeof window !== "undefined" && window.Icons) ? (settingsOpen[0] ? window.Icons.chevronUp() : window.Icons.chevronDown()) : null)
      ),
      settingsOpen[0] && h("div", { style: { background: "var(--surface)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 14 } },

        h("div", { style: { marginBottom: 14 } },
          h("div", { style: { fontSize:'var(--text-sm)', fontWeight: 600, color: "#3f3f46", marginBottom: 6 } }, "Format"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "radio", name: "expFmt", checked: exportFormat[0] === "pdf", onChange: function () { exportFormat[1]("pdf"); } }), "PDF"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "radio", name: "expFmt", checked: exportFormat[0] === "png", onChange: function () { exportFormat[1]("png"); } }), "PNG")
        ),

        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap:'var(--s-3)', marginBottom:'var(--s-3)' } },
          h("div", null,
            h("div", { style: { fontSize:'var(--text-sm)', fontWeight: 600, color: "#3f3f46", marginBottom:'var(--s-1)' } }, "Page size"),
            h("select", { value: pageSize[0], onChange: function (e) { setPageSize(e.target.value); }, style: { padding: "6px 10px", borderRadius:'var(--radius-sm)', border: "1px solid #CFC4AC", fontSize:'var(--text-sm)', width: "100%" } },
              h("option", { value: "auto" },   "Auto (A4 / Letter from locale)"),
              h("option", { value: "a4" },     "A4 (210 × 297 mm)"),
              h("option", { value: "letter" }, "US Letter (8.5 × 11 in)")
            )
          ),
          h("div", null,
            h("div", { style: { fontSize:'var(--text-sm)', fontWeight: 600, color: "#3f3f46", marginBottom:'var(--s-1)' } }, "Page margin (mm)"),
            h("input", { type: "number", min: 10, max: 30, value: marginsMm[0], onChange: function (e) { setMarginsMm(Number(e.target.value)); },
              style: { padding: "6px 10px", borderRadius:'var(--radius-sm)', border: "1px solid #CFC4AC", fontSize:'var(--text-sm)', width: "100%" } })
          )
        ),

        h("div", { style: { marginBottom:'var(--s-3)' } },
          h("div", { style: { fontSize:'var(--text-sm)', fontWeight: 600, color: "#3f3f46", marginBottom:'var(--s-1)' } }, "Stitches per page"),
          h("select", { "aria-label":"Stitches per page", value: stPerPg[0], onChange: function (e) { setStPerPg(e.target.value); }, style: { padding: "6px 10px", borderRadius:'var(--radius-sm)', border: "1px solid #CFC4AC", fontSize:'var(--text-sm)' } },
            h("option", { value: "small" },  "Small print (~80 × 100, ~2mm cells)"),
            h("option", { value: "medium" }, "Medium print (~60 × 70, ~2.8mm cells, ideal for PK)"),
            h("option", { value: "large" },  "Large print (~40 × 50, ~4mm cells, easier to read)"),
            h("option", { value: "custom" }, "Custom")
          ),
          stPerPg[0] === "custom" && h("div", { style: { display: "flex", gap:'var(--s-2)', marginTop: 6 } },
            h("input", { type: "number", min: 10, max: 200, step: 10, "aria-label":"Custom columns per PDF page", value: customCols[0], onChange: function (e) { setCustomCols(Number(e.target.value)); },
              style: { padding: "6px 10px", borderRadius:'var(--radius-sm)', border: "1px solid #CFC4AC", fontSize:'var(--text-sm)', width: 90 } }),
            h("span", { style: { fontSize:'var(--text-sm)', alignSelf: "center" } }, "cols ×"),
            h("input", { type: "number", min: 10, max: 200, step: 10, "aria-label":"Custom rows per PDF page", value: customRows[0], onChange: function (e) { setCustomRows(Number(e.target.value)); },
              style: { padding: "6px 10px", borderRadius:'var(--radius-sm)', border: "1px solid #CFC4AC", fontSize:'var(--text-sm)', width: 90 } }),
            h("span", { style: { fontSize:'var(--text-sm)', alignSelf: "center" } }, "rows")
          )
        ),

        h("div", { style: { marginBottom:'var(--s-3)' } },
          h("div", { style: { fontSize:'var(--text-sm)', fontWeight: 600, color: "#3f3f46", marginBottom:'var(--s-1)' } }, "Chart modes"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: modeBw[0], onChange: function (e) { setModeBw(e.target.checked); } }),
            "Symbols on white (B&W)"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: modeColour[0], onChange: function (e) { setModeColour(e.target.checked); } }),
            "Colour blocks with symbols")
        ),

        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 6 } },
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: overlap[0], onChange: function (e) { setOverlap(e.target.checked); } }),
            "2-row/column overlap zone"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: includeCover[0], onChange: function (e) { setIncludeCover(e.target.checked); } }),
            "Cover page"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: includeInfo[0], onChange: function (e) { setIncludeInfo(e.target.checked); } }),
            "Info page"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: includeIndex[0], onChange: function (e) { setIncludeIndex(e.target.checked); } }),
            "Chart index"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize:'var(--text-sm)', cursor: "pointer" } },
            h("input", { type: "checkbox", checked: miniLegend[0], onChange: function (e) { setMiniLegend(e.target.checked); } }),
            "Mini-legend strip on each page")
        ),

        h("label", null, h("input", {type: "checkbox", checked: includeLegend[0], onChange: function(e) { setIncludeLegend(e.target.checked); }}), "Thread legend pages"),
        h("label", null, h("input", {type: "checkbox", checked: includeBranding[0], onChange: function(e) { setIncludeBranding(e.target.checked); }}), "Use current profile branding on cover/info pages"),
        h("div", { style: { marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--border)" } },
          h("label", { style: { display: "inline-flex", alignItems: "center", gap:'var(--s-2)', minHeight: 44, fontSize:'var(--text-sm)', cursor: "pointer", fontWeight: 600, color: "var(--text-primary)" } },
            h("input", {
              type: "checkbox",
              checked: workshopTheme[0],
              onChange: function (e) { setWorkshopTheme(e.target.checked); }
            }),
            "Workshop print theme (terracotta grid + linen background)"),
          h("p", { style: { fontSize:'var(--text-xs)', color: "var(--text-secondary)", margin: "4px 0 0 22px" } },
            "Off by default. Pattern Keeper compatibility uses the standard black-grid output.")
        ),

        pageGeom && h("p", { style: { fontSize:'var(--text-xs)', color: "var(--text-tertiary)", marginTop:'var(--s-3)', marginBottom: 0 } },
          "Will produce ~" + totalPagesPreview + " page" + (totalPagesPreview === 1 ? "" : "s") +
          " (chart grid: " + pageGeom.colsPerPage + " × " + pageGeom.rowsPerPage +
          " stitches per chart page, cell ≈ " + pageGeom.cellMm.toFixed(2) + " mm).")
      )
    ),

    h("div", { style: { background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius:'var(--radius-md)', padding: "10px 14px", fontSize:'var(--text-sm)', color: "var(--text-secondary)" } },
      "Designer branding (name, logo, copyright) is now in ",
      h("strong", null, "File > Preferences > Profile & branding"),
      ". Enable profile branding above to include it on cover/info pages. Project designer overrides the profile name."
    ),

    progressState[0] ? h("div", { style: { background: "var(--surface-tertiary)", border: "1px solid #CFC4AC", borderRadius:'var(--radius-lg)', padding:'var(--s-4)' } },
      h("div", { style: { fontSize:'var(--text-md)', fontWeight: 600, color: "var(--text-primary)", marginBottom:'var(--s-2)' } },
        "Generating PDF… " + (progressState[0].current || 0) + " of " + (progressState[0].total || "?") + " pages"),
      h("div", { style: { background: "var(--border)", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 } },
        h("div", { style: {
          width: ((progressState[0].total ? Math.min(100, (progressState[0].current / progressState[0].total) * 100) : 30)) + "%",
          height: "100%", background: "var(--accent)", transition: "width 120ms ease-out" } })
      ),
      h("button", { onClick: cancelExport, style: { padding: "8px 18px", fontSize:'var(--text-md)', borderRadius:'var(--radius-md)', border: "1px solid var(--danger-soft)", background: "var(--surface)", color: "var(--danger)", cursor: "pointer", fontWeight: 600 } }, "Cancel")
    ) : h("button", {
      onClick: exportFormat[0] === "png" ? doExportPng : doExport,
      style: (exportFormat[0] === "pdf" && !!validationError) ? disabledCta : ctaStyle,
      disabled: exportFormat[0] === "pdf" && !!validationError,
    }, exportFormat[0] === "png" ? "Export PNG" : "Export PDF"),

    // OXS export — standalone button for Open X-Stitch interop.
    h("div", { style: { borderTop: "1px solid var(--border)", marginTop:'var(--s-1)', paddingTop: 14, display: "flex", flexDirection: "column", gap:'var(--s-2)' } },
      h("div", { style: { fontSize:'var(--text-md)', fontWeight: 600, color: "var(--text-primary)" } }, "Open X-Stitch (.oxs)"),
      h("div", { style: { fontSize:'var(--text-xs)', color: "var(--text-tertiary)" } },
        "Compatible with MacStitch, WinStitch, FlossCross, and other Open X-Stitch apps."),
      h("button", {
        onClick: function () {
          if (typeof generateOXS !== 'function') { return; }
          var project = {
            w: ctx.sW, h: ctx.sH, threadBrand: ctx.threadBrand,
            name: app.projectName || 'pattern',
            pattern: ctx.pat,
            bsLines: ctx.bsLines || [],
            specialtyStitches:ctx.specialtyStitches||[],partialStitches: ctx.partialStitches,
            knots: ctx.knots || [],
            beads: (app.trackerFieldsRef && app.trackerFieldsRef.current && app.trackerFieldsRef.current.beads) || []
          };
          var result = generateOXS(project);
          if (result.warnings && result.warnings.length > 0) {
            if (typeof Toast !== 'undefined' && Toast.show) {
              Toast.show({ message: result.warnings.join(' '), type: 'warning', duration: 6000 });
            }
          }
          var blob = new Blob([result.xml], { type: 'application/xml' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = ((app.projectName || 'pattern').replace(/[^\w\-]+/g, '_') || 'pattern') + '.oxs';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        },
        style: Object.assign({}, ctaStyle, { display: "inline-flex", alignItems: "center", gap:'var(--s-2)', alignSelf: "flex-start", background: "var(--surface)", color: "var(--accent)", border: "1.5px solid var(--accent)", boxShadow: "none" }),
      },
        window.Icons && Icons.download && Icons.download(),
        h("span", null, "Export .oxs"))
    ),

    // C6: Download bundle (zip with PDF + OXS + PNG + JSON + manifest).
    h("div", { style: { borderTop: "1px solid var(--border)", marginTop:'var(--s-1)', paddingTop: 14, display: "flex", flexDirection: "column", gap:'var(--s-2)' } },
      h("div", { style: { fontSize:'var(--text-md)', fontWeight: 600, color: "var(--text-primary)" } }, "Download as bundle"),
      h("div", { style: { fontSize:'var(--text-xs)', color: "var(--text-tertiary)" } },
        "One .zip with the PDF chart, OXS pattern, PNG preview, JSON snapshot, and a manifest. Useful for archiving or sharing the finished project."),
      bundleState[0]
        ? h("div", { style: { background: "var(--surface-tertiary)", border: "1px solid #CFC4AC", borderRadius:'var(--radius-md)', padding: 10, fontSize:'var(--text-sm)', color: "var(--text-primary)" } },
            (bundleState[0].msg || "Working…"))
        : h("button", {
            onClick: doExportBundle,
            style: Object.assign({}, ctaStyle, { display: "inline-flex", alignItems: "center", gap:'var(--s-2)', alignSelf: "flex-start" }),
          },
          window.Icons && Icons.archive && Icons.archive(),
          h("span", null, "Download bundle"))
    ),

    errorState[0] && h("div", { style: { background: "var(--danger-soft)", border: "1px solid var(--danger-soft)", borderRadius:'var(--radius-md)', padding: 10, fontSize:'var(--text-sm)', color: "var(--danger)" } }, errorState[0])
  );
};
