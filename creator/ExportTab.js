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
var EXPORT_PRESET_CARD_BASE = { flex: 1, padding: 14, borderRadius: 10, border: "1.5px solid #cbd5e1", background: "#fff", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 };
var EXPORT_PRESET_CARD_ACTIVE = { background: "#0d9488", color: "#fff", borderColor: "#0d9488" };
var EXPORT_CTA_STYLE = { padding: "14px 22px", fontSize: 16, borderRadius: 10, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 700, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
var EXPORT_DISABLED_CTA = Object.assign({}, EXPORT_CTA_STYLE, { background: "#94a3b8", cursor: "not-allowed" });
var EXPORT_SECTION_TOGGLE = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 13, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", fontWeight: 600, color: "#0f172a" };

window.CreatorExportTab = function CreatorExportTab() {
  var ctx = window.usePatternData();
  var app = window.useApp();
  var h = React.createElement;

  var UP = window.UserPrefs;
  function readPref(k, fallback) { return UP ? UP.get(k) : fallback; }
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
  var miniLegend   = React.useState(readPref("exportMiniLegend",      true));
  var settingsOpen = React.useState(false);
  var brandingOpen = React.useState(false);
  var exportFormat = React.useState("pdf"); // "pdf" | "png"

  function bind(pair, prefKey) {
    return function (v) { pair[1](v); if (prefKey) writePref(prefKey, v); };
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
  var setMiniLegend   = bind(miniLegend,   "exportMiniLegend");
  var setSettingsOpen = settingsOpen[1];
  var setBrandingOpen = brandingOpen[1];

  var progressState = React.useState(null);
  var setProgress = progressState[1];
  var errorState = React.useState(null);
  var setError = errorState[1];
  var runningRef = React.useRef(null);

  function applyPreset(name) {
    setPreset(name);
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
  }

  // Page-count preview
  var pageGeom = null, paged = null;
  if (ctx && ctx.pat && ctx.sW && ctx.sH) {
    try {
      pageGeom = window.PdfChartLayout.computePageGeometry({
        pageSize: pageSize[0], marginsMm: marginsMm[0],
        stitchesPerPage: stPerPg[0], customCols: customCols[0], customRows: customRows[0],
        locale: navigator.language,
      });
      paged = window.PdfChartLayout.paginate({
        patternW: ctx.sW, patternH: ctx.sH,
        colsPerPage: pageGeom.colsPerPage, rowsPerPage: pageGeom.rowsPerPage,
        overlap: overlap[0],
      });
    } catch (_) {}
  }
  var modesArr = [];
  if (modeBw[0]) modesArr.push("bw");
  if (modeColour[0]) modesArr.push("colour");
  var totalPagesPreview = (paged ? paged.length * Math.max(1, modesArr.length) : 0)
    + (includeCover[0] ? 1 : 0)
    + (includeInfo[0] ? 1 : 0)
    + (includeIndex[0] && paged && paged.length > 1 ? 1 : 0)
    + (ctx && ctx.pal ? Math.max(1, Math.ceil(ctx.pal.length / 32)) : 0);

  function doExport() {
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
    var branding = window.PdfExport.readBranding();
    // Per-project designer overrides global designer branding when set.
    if (app.projectDesigner) branding = Object.assign({}, branding, { designerName: app.projectDesigner });
    var opts = {
      pageSize: pageSize[0], marginsMm: marginsMm[0],
      stitchesPerPage: stPerPg[0], customCols: customCols[0], customRows: customRows[0],
      chartModes: modesArr, overlap: overlap[0],
      includeCover: includeCover[0], includeInfo: includeInfo[0],
      includeIndex: includeIndex[0], miniLegend: miniLegend[0],
      branding: branding,
      locale: navigator.language || "en-GB",
    };
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

  function doExportPng() {
    setError(null);
    if (!ctx || !ctx.pat || !ctx.sW || !ctx.sH) { setError("Nothing to export yet — create or open a pattern first."); return; }
    var CELL = 10;
    var c = document.createElement("canvas");
    c.width = ctx.sW * CELL;
    c.height = ctx.sH * CELL;
    var g = c.getContext("2d");
    g.fillStyle = "#ffffff";
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
    c.toBlob(function (blob) {
      if (!blob) { setError("Failed to create PNG."); return; }
      var name = ((app.projectName || "pattern") + "").replace(EXPORT_UNSAFE_FILENAME_CHARS, "_") + ".png";
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }, "image/png");
  }

  if (!(ctx && ctx.pat && ctx.pal)) return null;
  if (app.tab !== "export") return null;

  var presetCardActive = EXPORT_PRESET_CARD_ACTIVE;
  var presetCardBase = EXPORT_PRESET_CARD_BASE;
  var ctaStyle = EXPORT_CTA_STYLE;
  var disabledCta = EXPORT_DISABLED_CTA;
  var sectionToggle = EXPORT_SECTION_TOGGLE;

  return h("div", { style: { display: "flex", flexDirection: "column", gap: 14 } },
    app.copied && h("div", { style: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#16a34a", fontWeight: 600 } }, "Copied!"),

    h("button", {
      onClick: app.handleOpenInTracker,
      style: { padding: "12px 20px", fontSize: 15, borderRadius: 8, border: "none", background: "#0f766e", color: "#fff", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }
    }, window.Icons && Icons.thread && Icons.thread(), " Open in Stitch Tracker →"),

    h("div", null,
      h("h3", { style: { margin: "0 0 8px", fontSize: 14, color: "#0f172a" } }, "Quick presets"),
      h("div", { style: { display: "flex", gap: 10 } },
        h("button", { onClick: function () { applyPreset("patternKeeper"); },
          style: Object.assign({}, presetCardBase, presetState[0] === "patternKeeper" ? presetCardActive : {}) },
          h("strong", { style: { fontSize: 14 } }, "For Pattern Keeper"),
          h("span", { style: { fontSize: 11, opacity: 0.85 } },
            "Symbols + colour, medium print, 2-row overlap, cover page on. Customers can highlight and track stitches in Pattern Keeper.")
        ),
        h("button", { onClick: function () { applyPreset("homePrinting"); },
          style: Object.assign({}, presetCardBase, presetState[0] === "homePrinting" ? presetCardActive : {}) },
          h("strong", { style: { fontSize: 14 } }, "For printing (home)"),
          h("span", { style: { fontSize: 11, opacity: 0.85 } },
            "Colour + B&W charts, large print, no overlap, cover page off. Easier on the eyes when stitching from paper.")
        )
      )
    ),

    h("div", null,
      h("button", { onClick: function () { setSettingsOpen(!settingsOpen[0]); }, style: sectionToggle },
        h("span", null, "Format & settings"),
        h("span", { style: { color: "#64748b" } }, settingsOpen[0] ? "▲" : "▼")
      ),
      settingsOpen[0] && h("div", { style: { background: "#fff", border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: 14 } },

        h("div", { style: { marginBottom: 14 } },
          h("div", { style: { fontSize: 12, fontWeight: 600, color: "#3f3f46", marginBottom: 6 } }, "Format"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "radio", name: "expFmt", checked: exportFormat[0] === "pdf", onChange: function () { exportFormat[1]("pdf"); } }), "PDF"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "radio", name: "expFmt", checked: exportFormat[0] === "png", onChange: function () { exportFormat[1]("png"); } }), "PNG")
        ),

        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 } },
          h("div", null,
            h("div", { style: { fontSize: 12, fontWeight: 600, color: "#3f3f46", marginBottom: 4 } }, "Page size"),
            h("select", { value: pageSize[0], onChange: function (e) { setPageSize(e.target.value); }, style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12, width: "100%" } },
              h("option", { value: "auto" },   "Auto (A4 / Letter from locale)"),
              h("option", { value: "a4" },     "A4 (210 × 297 mm)"),
              h("option", { value: "letter" }, "US Letter (8.5 × 11 in)")
            )
          ),
          h("div", null,
            h("div", { style: { fontSize: 12, fontWeight: 600, color: "#3f3f46", marginBottom: 4 } }, "Page margin (mm)"),
            h("input", { type: "number", min: 10, max: 30, value: marginsMm[0], onChange: function (e) { setMarginsMm(Number(e.target.value)); },
              style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12, width: "100%" } })
          )
        ),

        h("div", { style: { marginBottom: 12 } },
          h("div", { style: { fontSize: 12, fontWeight: 600, color: "#3f3f46", marginBottom: 4 } }, "Stitches per page"),
          h("select", { value: stPerPg[0], onChange: function (e) { setStPerPg(e.target.value); }, style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12 } },
            h("option", { value: "small" },  "Small print (~80 × 100, ~2mm cells)"),
            h("option", { value: "medium" }, "Medium print (~60 × 70, ~2.8mm cells, ideal for PK)"),
            h("option", { value: "large" },  "Large print (~40 × 50, ~4mm cells, easier to read)"),
            h("option", { value: "custom" }, "Custom")
          ),
          stPerPg[0] === "custom" && h("div", { style: { display: "flex", gap: 8, marginTop: 6 } },
            h("input", { type: "number", min: 10, max: 200, step: 10, value: customCols[0], onChange: function (e) { setCustomCols(Number(e.target.value)); },
              style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12, width: 90 } }),
            h("span", { style: { fontSize: 12, alignSelf: "center" } }, "cols ×"),
            h("input", { type: "number", min: 10, max: 200, step: 10, value: customRows[0], onChange: function (e) { setCustomRows(Number(e.target.value)); },
              style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 12, width: 90 } }),
            h("span", { style: { fontSize: 12, alignSelf: "center" } }, "rows")
          )
        ),

        h("div", { style: { marginBottom: 12 } },
          h("div", { style: { fontSize: 12, fontWeight: 600, color: "#3f3f46", marginBottom: 4 } }, "Chart modes"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, marginRight: 16, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: modeBw[0], onChange: function (e) { setModeBw(e.target.checked); } }),
            "Symbols on white (B&W)"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: modeColour[0], onChange: function (e) { setModeColour(e.target.checked); } }),
            "Colour blocks with symbols")
        ),

        h("div", { style: { display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 6 } },
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: overlap[0], onChange: function (e) { setOverlap(e.target.checked); } }),
            "2-row/column overlap zone"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: includeCover[0], onChange: function (e) { setIncludeCover(e.target.checked); } }),
            "Cover page"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: includeInfo[0], onChange: function (e) { setIncludeInfo(e.target.checked); } }),
            "Info page"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: includeIndex[0], onChange: function (e) { setIncludeIndex(e.target.checked); } }),
            "Chart index"),
          h("label", { style: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" } },
            h("input", { type: "checkbox", checked: miniLegend[0], onChange: function (e) { setMiniLegend(e.target.checked); } }),
            "Mini-legend strip on each page")
        ),

        pageGeom && h("p", { style: { fontSize: 11, color: "#64748b", marginTop: 12, marginBottom: 0 } },
          "Will produce ~" + totalPagesPreview + " page" + (totalPagesPreview === 1 ? "" : "s") +
          " (chart grid: " + pageGeom.colsPerPage + " × " + pageGeom.rowsPerPage +
          " stitches per chart page, cell ≈ " + pageGeom.cellMm.toFixed(2) + " mm).")
      )
    ),

    h("div", { style: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#475569" } },
      "Designer branding (name, logo, copyright) is now in ",
      h("strong", null, "File → Preferences"),
      ". Settings there apply to every PDF you export."
    ),

    progressState[0] ? h("div", { style: { background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, padding: 16 } },
      h("div", { style: { fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 8 } },
        "Generating PDF… " + (progressState[0].current || 0) + " of " + (progressState[0].total || "?") + " pages"),
      h("div", { style: { background: "#e2e8f0", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 10 } },
        h("div", { style: {
          width: ((progressState[0].total ? Math.min(100, (progressState[0].current / progressState[0].total) * 100) : 30)) + "%",
          height: "100%", background: "#0d9488", transition: "width 120ms ease-out" } })
      ),
      h("button", { onClick: cancelExport, style: { padding: "8px 18px", fontSize: 13, borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", cursor: "pointer", fontWeight: 600 } }, "Cancel")
    ) : h("button", {
      onClick: exportFormat[0] === "png" ? doExportPng : doExport,
      style: (exportFormat[0] === "pdf" && modesArr.length === 0) ? disabledCta : ctaStyle,
      disabled: exportFormat[0] === "pdf" && modesArr.length === 0,
    }, exportFormat[0] === "png" ? "Export PNG" : "Export PDF"),

    errorState[0] && h("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, fontSize: 12, color: "#b91c1c" } }, errorState[0])
  );
};
