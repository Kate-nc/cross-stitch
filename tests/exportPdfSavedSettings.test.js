// tests/exportPdfSavedSettings.test.js — File > Export PDF… and Print PDF
// use the Export tab's saved settings (export-pdf.js).
//
// They used to ignore them: the Creator passed fixed defaults (colour
// charts only, and no project name, so every PDF was "Untitled pattern")
// and the Tracker had its own older, non-Pattern Keeper exporter.

const fs = require("fs");
const path = require("path");

const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

function load(prefs, pdfExport) {
  const toasts = [];
  const win = {
    UserPrefs: { get: (k) => (Object.prototype.hasOwnProperty.call(prefs, k) ? prefs[k] : undefined) },
    Toast: { show: (t) => toasts.push(t) },
    PdfExport: pdfExport,
    generatePatternThumbnail: () => "thumb"
  };
  const nav = { language: "en-GB" };
  new Function("window", "navigator", read("export-pdf.js"))(win, nav);
  return { ExportPdf: win.ExportPdf, toasts };
}

function fakePdfExport() {
  const calls = [];
  return {
    calls,
    buildExportProject: (ctx) => ({ name: ctx.projectName || "Untitled pattern", designer: ctx.projectDesigner || "", w: ctx.sW, h: ctx.sH }),
    readBranding: () => ({ designerName: "Global name", copyrightLine: "(c)" }),
    runExport: (project, opts) => { calls.push({ project, opts }); return Promise.resolve(new Uint8Array([1])); },
    downloadBytes: (bytes, name) => calls.push({ download: name })
  };
}

describe("ExportPdf.optionsFromPrefs", () => {
  test("uses the Export tab's saved choices", () => {
    const { ExportPdf } = load({
      exportPageSize: "a4", exportMarginsMm: 15, exportStitchesPerPage: "large",
      exportCustomCols: 50, exportCustomRows: 60,
      exportChartModeBw: true, exportChartModeColour: false,
      exportOverlap: false, exportIncludeCover: false, exportIncludeInfo: true,
      exportIncludeIndex: false, exportMiniLegend: false,
      "creator.pdfWorkshopTheme": true
    }, fakePdfExport());
    expect(ExportPdf.optionsFromPrefs()).toEqual({
      pageSize: "a4", marginsMm: 15, stitchesPerPage: "large", customCols: 50, customRows: 60,
      chartModes: ["bw"], overlap: false, includeCover: false, includeInfo: true,
      includeIndex: false, miniLegend: false, locale: "en-GB", theme: "workshop"
    });
  });

  test("falls back to the Pattern Keeper defaults", () => {
    const o = load({}, fakePdfExport()).ExportPdf.optionsFromPrefs();
    expect(o.chartModes).toEqual(["bw", "colour"]);
    expect(o.stitchesPerPage).toBe("medium");
    expect(o.theme).toBe("pk");
    expect(o.overlap && o.includeCover && o.includeInfo && o.includeIndex && o.miniLegend).toBe(true);
  });

  test("never exports with no chart mode", () => {
    const o = load({ exportChartModeBw: false, exportChartModeColour: false }, fakePdfExport()).ExportPdf.optionsFromPrefs();
    expect(o.chartModes).toEqual(["bw", "colour"]);
  });

  test("reads the same preference keys as the Export tab", () => {
    const tab = read("creator/ExportTab.js");
    const keys = (read("export-pdf.js").match(/pref\("([^"]+)"/g) || []).map(s => s.slice(6, -1));
    expect(keys.length).toBeGreaterThan(10);
    keys.forEach(k => expect(tab).toContain('"' + k + '"'));
  });
});

describe("ExportPdf.run", () => {
  test("exports with saved settings, the project name and the project designer", async () => {
    const pe = fakePdfExport();
    const { ExportPdf } = load({ exportStitchesPerPage: "small" }, pe);
    const ok = await ExportPdf.run({ pat: [], sW: 10, sH: 10, projectName: "My Rose", projectDesigner: "Kate" });
    expect(ok).toBe(true);
    const run = pe.calls.find(c => c.opts);
    expect(run.project.name).toBe("My Rose");
    expect(run.opts.stitchesPerPage).toBe("small");
    expect(run.opts.branding.designerName).toBe("Kate");
    expect(run.opts.branding.copyrightLine).toBe("(c)");
    expect(pe.calls.find(c => c.download).download).toBe("My_Rose.pdf");
  });

  test("reports failure instead of throwing", async () => {
    const pe = fakePdfExport();
    pe.runExport = () => Promise.reject(new Error("boom"));
    const { ExportPdf, toasts } = load({}, pe);
    await expect(ExportPdf.run({ pat: [], sW: 5, sH: 5 })).resolves.toBe(false);
    expect(toasts.some(t => t.type === "error" && /boom/.test(t.message))).toBe(true);
  });
});

describe("callers", () => {
  test("Creator File menu and Print PDF use ExportPdf, not the fixed-default shim", () => {
    const src = read("creator-main.js");
    // Both go through the one-time name nudge (P0-2), which then calls
    // exportPdfWithSavedSettings.
    expect(src).toMatch(/onExportPDF=\{state\.pat\?printPdfWithNameNudge:null\}/);
    expect(src).toMatch(/onPrintPdf=\{printPdfWithNameNudge\}/);
    expect(src).toMatch(/if \(key === 'pdf'\) exportPdfWithSavedSettings\(\);/);
    expect(src).not.toMatch(/exportPDF\(\{displayMode/);
  });

  test("Tracker exports through ExportPdf and no longer bundles jsPDF", () => {
    const src = read("tracker-app.js");
    expect(src).toMatch(/window\.ExportPdf\.run\(\{pat,pal,sW,sH/);
    expect(src).not.toMatch(/jspdf/i);
  });

  test("pages that can export load export-pdf.js", () => {
    ["create.html", "index.html", "stitch.html"].forEach(f => {
      expect(read(f)).toMatch(/<script src="export-pdf\.js"><\/script>/);
    });
  });
});
