/* pdf-export-worker.js — Web Worker that produces PK-compatible PDFs.
 *
 * Message protocol:
 *   Main → Worker:
 *     { type: "export", reqId, project, options }
 *
 *     project = {
 *       name, w, h,
 *       pattern,         // flat array of cells {id, type, rgb}
 *       palette,         // [{id, name, rgb, type, threads?}, ...]
 *       partialStitches, // [[index, {TL?,TR?,BL?,BR?}], ...] (optional)
 *       bsLines,         // backstitch lines (optional, used for legend stitch-types only)
 *       fabricCt,        // fabric count
 *       skeinPrice,      // GBP per skein (optional)
 *       coverPreviewJpeg // string data URL (optional, embedded on cover)
 *     }
 *
 *     options = {
 *       pageSize, marginsMm, locale,
 *       stitchesPerPage, customCols, customRows,
 *       chartModes,        // ["bw"], ["colour"], or both, in order
 *       overlap,           // boolean
 *       includeCover, includeInfo, includeIndex, miniLegend,
 *       branding: { designerName, designerLogo (data URL), designerLogoPosition,
 *                   designerCopyright, designerContact }
 *     }
 *
 *   Worker → Main:
 *     { type: "progress", reqId, stage, current, total }
 *     { type: "result",   reqId, pdfBytes (ArrayBuffer, transferred) }
 *     { type: "error",    reqId, message, stack? }
 *
 * Loads:
 *   creator/pdfChartLayout.js                 — pure helpers
 *   assets/fonts/CrossStitchSymbols.base64.js — symbol font bytes
 *   pdf-lib UMD bundle from cdnjs              — PDF builder
 */

importScripts(
  "creator/symbolFontSpec.js",
  "creator/pdfChartLayout.js",
  "assets/fonts/CrossStitchSymbols.base64.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  "assets/fontkit.umd.min.js"
);

var Layout = self.PdfChartLayout;
var FONT_B64 = self.CROSS_STITCH_SYMBOL_FONT_B64;
var FONT_SPEC = self.SYMBOL_FONT_SPEC;

// ─── helpers ─────────────────────────────────────────────────────────────
// Hoisted: data-URL parser regex (avoid recompiling per call).
var DATA_URL_REGEX = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/;

function base64ToUint8(b64) {
  var bin = atob(b64);
  var len = bin.length;
  var arr = new Uint8Array(len);
  for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function dataUrlToBytes(dataUrl) {
  if (!dataUrl) return null;
  var m = DATA_URL_REGEX.exec(dataUrl);
  if (!m) return null;
  var isB64 = !!m[2];
  var data = m[3];
  if (isB64) return { mime: m[1] || "application/octet-stream", bytes: base64ToUint8(data) };
  // Plain text data URL — uncommon for images.
  var bytes = new Uint8Array(data.length);
  for (var i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff;
  return { mime: m[1] || "text/plain", bytes: bytes };
}

function progress(reqId, stage, current, total) {
  self.postMessage({ type: "progress", reqId: reqId, stage: stage, current: current || 0, total: total || 0 });
}

// ─── main entry ──────────────────────────────────────────────────────────
self.onmessage = function (e) {
  var msg = e.data;
  if (!msg || msg.type !== "export") return;
  var reqId = msg.reqId;
  try {
    buildPdf(msg.project, msg.options || {}, reqId).then(function (bytes) {
      var ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      self.postMessage({ type: "result", reqId: reqId, pdfBytes: ab }, [ab]);
    }).catch(function (err) {
      self.postMessage({ type: "error", reqId: reqId, message: err && err.message ? err.message : String(err), stack: err && err.stack });
    });
  } catch (err) {
    self.postMessage({ type: "error", reqId: reqId, message: err && err.message ? err.message : String(err), stack: err && err.stack });
  }
};

// ─── build pipeline ──────────────────────────────────────────────────────
async function buildPdf(project, options, reqId) {
  var PDFLib = self.PDFLib;
  if (!PDFLib) throw new Error("pdf-lib failed to load");
  var rgbColor = PDFLib.rgb;

  progress(reqId, "init", 0, 0);

  var pdfDoc = await PDFLib.PDFDocument.create();
  pdfDoc.setTitle(project.name || "Cross-stitch pattern");
  pdfDoc.setCreator("Cross Stitch Pattern Generator");
  pdfDoc.setProducer("Cross Stitch Pattern Generator (pdf-lib)");

  // Register fontkit so pdf-lib can embed custom (non-standard) fonts.
  if (self.fontkit) pdfDoc.registerFontkit(self.fontkit);

  // Embed the symbol font once, no subsetting (Pattern Keeper needs the full cmap).
  // M9: Surface a clear error if the font bytes failed to load — otherwise
  // pdf-lib will throw a cryptic base64 decode error and Pattern Keeper
  // silently rejects the resulting file.
  if (!FONT_B64 || typeof FONT_B64 !== 'string' || FONT_B64.length < 1000) {
    throw new Error("Symbol font missing — the Cross Stitch symbol font failed to load. Please reload the page and try again.");
  }
  var fontBytes = base64ToUint8(FONT_B64);
  var symbolFont;
  try {
    symbolFont = await pdfDoc.embedFont(fontBytes, { subset: false });
  } catch (fontErr) {
    throw new Error("Symbol font failed to embed: " + (fontErr && fontErr.message ? fontErr.message : String(fontErr)));
  }
  var helvetica = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  var helveticaBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

  // Resolve geometry once — every chart page uses identical cell size.
  var geom = Layout.computePageGeometry({
    pageSize: options.pageSize,
    marginsMm: options.marginsMm,
    stitchesPerPage: options.stitchesPerPage,
    customCols: options.customCols,
    customRows: options.customRows,
    locale: options.locale,
  });

  var pageWpt = Layout.mmToPt(geom.pageWmm);
  var pageHpt = Layout.mmToPt(geom.pageHmm);

  // Build palette → codepoint mapping (deterministic).
  var paletteMap = Layout.buildCodepointMap(project.palette || [], FONT_SPEC || { baseCodepoint: 0xE000, glyphs: new Array(96) });
  var codepoints = paletteMap.map;

  // Compute per-thread stitch counts.
  var counts = countPalette(project);

  // Pagination plan.
  var pages = Layout.paginate({
    patternW: project.w,
    patternH: project.h,
    colsPerPage: geom.colsPerPage,
    rowsPerPage: geom.rowsPerPage,
    overlap: options.overlap,
  });

  // Estimate total pages we are about to draw, for progress reporting.
  var chartModes = (options.chartModes && options.chartModes.length) ? options.chartModes : ["bw"];
  var totalPages =
    (options.includeCover ? 1 : 0) +
    (options.includeInfo  ? 1 : 0) +
    legendPageCount(project.palette, codepoints) +
    pages.length * chartModes.length +
    (options.includeIndex ? 1 : 0);

  var pageDone = 0;
  function bumpPage(stage) {
    pageDone++;
    progress(reqId, stage, pageDone, totalPages);
  }

  // 1. Cover page
  if (options.includeCover) {
    progress(reqId, "cover", pageDone, totalPages);
    await drawCoverPage(pdfDoc, project, options, helvetica, helveticaBold, rgbColor, pageWpt, pageHpt, geom);
    bumpPage("cover");
  }

  // 2. Info page
  if (options.includeInfo) {
    progress(reqId, "info", pageDone, totalPages);
    drawInfoPage(pdfDoc, project, options, helvetica, helveticaBold, rgbColor, pageWpt, pageHpt, geom, counts);
    bumpPage("info");
  }

  // 3. Thread legend (one or more pages)
  progress(reqId, "legend", pageDone, totalPages);
  var legendPages = drawLegendPages(pdfDoc, project, paletteMap, counts, helvetica, helveticaBold, symbolFont, rgbColor, pageWpt, pageHpt, geom);
  for (var lp = 0; lp < legendPages; lp++) bumpPage("legend");

  // 4. Chart pages — one section per mode
  for (var m = 0; m < chartModes.length; m++) {
    var mode = chartModes[m];
    for (var i = 0; i < pages.length; i++) {
      var seg = pages[i];
      progress(reqId, "chart-" + mode, pageDone, totalPages);
      drawChartPage(pdfDoc, project, seg, mode, geom, codepoints, counts,
                    symbolFont, helvetica, helveticaBold, rgbColor,
                    pageWpt, pageHpt, options.miniLegend !== false, i, pages.length);
      bumpPage("chart-" + mode);
    }
  }

  // 5. Chart index thumbnail
  if (options.includeIndex && pages.length > 1) {
    progress(reqId, "index", pageDone, totalPages);
    drawChartIndexPage(pdfDoc, project, pages, geom, helvetica, helveticaBold, rgbColor, pageWpt, pageHpt);
    bumpPage("index");
  }

  progress(reqId, "saving", totalPages, totalPages);
  // useObjectStreams=false makes the PDF strictly older-spec friendly (some
  // older PK builds had trouble with object streams).
  var bytes = await pdfDoc.save({ useObjectStreams: false });
  return bytes;
}

function countPalette(project) {
  var counts = {};
  if (!project.pattern) return counts;
  for (var i = 0; i < project.pattern.length; i++) {
    var c = project.pattern[i];
    if (!c || !c.id || c.id === "__skip__" || c.id === "__empty__") continue;
    counts[c.id] = (counts[c.id] || 0) + 1;
  }
  return counts;
}

function filterValidPaletteEntries(palette) {
  if (!palette) return [];
  var out = [];
  for (var i = 0; i < palette.length; i++) {
    var p = palette[i];
    if (p && p.id && p.id !== "__skip__" && p.id !== "__empty__") out.push(p);
  }
  return out;
}

function legendPageCount(palette, codepoints) {
  var n = filterValidPaletteEntries(palette).length;
  if (!n) return 0;
  return Math.max(1, Math.ceil(n / 32));   // 32 rows per legend page
}

// ─── cover page ──────────────────────────────────────────────────────────
function computeLogoPosition(branding, marginPt, pageW, pageH, logoW, logoH) {
  if (branding.designerLogoPosition === "top-left") {
    return { x: marginPt, y: pageH - marginPt - logoH };
  }
  return { x: pageW - marginPt - logoW, y: pageH - marginPt - logoH };
}

async function embedAndPlaceLogoImage(pdfDoc, page, branding, marginPt, pageW, pageH) {
  if (!branding.designerLogo) return;
  try {
    var d = dataUrlToBytes(branding.designerLogo);
    if (!d) return;
    var img = /png/i.test(d.mime) ? await pdfDoc.embedPng(d.bytes) : await pdfDoc.embedJpg(d.bytes);
    var maxLogoMm = 28;
    var ratio = img.width / img.height;
    var logoH = Layout.mmToPt(maxLogoMm);
    var logoW = logoH * ratio;
    var pos = computeLogoPosition(branding, marginPt, pageW, pageH, logoW, logoH);
    page.drawImage(img, { x: pos.x, y: pos.y, width: logoW, height: logoH });
  } catch (_) { /* logo failures shouldn't kill the export */ }
}

async function drawCoverPage(pdfDoc, project, options, font, bold, rgbColor, pageW, pageH, geom) {
  var page = pdfDoc.addPage([pageW, pageH]);
  var marginPt = Layout.mmToPt(geom.marginMm);
  var branding = options.branding || {};

  // Designer logo
  await embedAndPlaceLogoImage(pdfDoc, page, branding, marginPt, pageW, pageH);

  // Title
  var titleSize = 28;
  var title = project.name || "Cross-stitch pattern";
  page.drawText(title, {
    x: marginPt,
    y: pageH - marginPt - 36,
    size: titleSize,
    font: bold,
    color: rgbColor(0, 0, 0),
    maxWidth: pageW - 2 * marginPt - Layout.mmToPt(35),
  });

  // Designer name under title
  if (branding.designerName) {
    page.drawText(branding.designerName, {
      x: marginPt, y: pageH - marginPt - 60,
      size: 13, font: font, color: rgbColor(0.3, 0.3, 0.3),
    });
  }

  // Cover preview image
  if (project.coverPreviewJpeg) {
    try {
      var p = dataUrlToBytes(project.coverPreviewJpeg);
      if (p) {
        var pimg;
        if (/png/i.test(p.mime)) pimg = await pdfDoc.embedPng(p.bytes);
        else                    pimg = await pdfDoc.embedJpg(p.bytes);
        var maxW = pageW - 2 * marginPt;
        var maxH = pageH * 0.45;
        var pr = pimg.width / pimg.height;
        var iw = maxW, ih = maxW / pr;
        if (ih > maxH) { ih = maxH; iw = maxH * pr; }
        var ix = marginPt + (maxW - iw) / 2;
        var iy = (pageH * 0.4) - ih / 2 + 20;
        page.drawImage(pimg, { x: ix, y: iy, width: iw, height: ih });
      }
    } catch (_) {}
  }

  // Metadata block (bottom)
  var metaY = Layout.mmToPt(60);
  var rows = [
    ["Dimensions",       project.w + " × " + project.h + " stitches"],
    ["Finished size",    finishedSize(project.w, project.h, project.fabricCt || 14)],
    ["Colours",          countDistinctColours(project.palette) + " threads"],
    ["Total stitches",   totalStitches(project.pattern).toLocaleString("en-GB")],
  ];
  for (var i = 0; i < rows.length; i++) {
    page.drawText(rows[i][0] + ":", { x: marginPt, y: metaY - i * 18, size: 11, font: bold, color: rgbColor(0, 0, 0) });
    page.drawText(rows[i][1], { x: marginPt + Layout.mmToPt(40), y: metaY - i * 18, size: 11, font: font, color: rgbColor(0.15, 0.15, 0.15) });
  }

  // Copyright + contact
  if (branding.designerCopyright) {
    page.drawText(branding.designerCopyright, {
      x: marginPt, y: marginPt + 28,
      size: 9, font: font, color: rgbColor(0.4, 0.4, 0.4),
      maxWidth: pageW - 2 * marginPt,
    });
  }
  if (branding.designerContact) {
    page.drawText(branding.designerContact, {
      x: marginPt, y: marginPt + 14,
      size: 9, font: font, color: rgbColor(0.4, 0.4, 0.4),
    });
  }
}

function finishedSize(w, h, fabricCt) {
  // 28ct evenweave is stitched over 2 threads, giving the same finished size as 14ct
  var effectiveCt = fabricCt === 28 ? 14 : fabricCt;
  var inW = w / effectiveCt;
  var inH = h / effectiveCt;
  var cmW = inW * 2.54;
  var cmH = inH * 2.54;
  return cmW.toFixed(1) + " \xD7 " + cmH.toFixed(1) + " cm (" + inW.toFixed(1) + "\" \xD7 " + inH.toFixed(1) + "\") on " + fabricCt + "ct";
}

function countDistinctColours(palette) {
  if (!palette) return 0;
  var n = 0;
  for (var i = 0; i < palette.length; i++) {
    var p = palette[i];
    if (p && p.id && p.id !== "__skip__" && p.id !== "__empty__") n++;
  }
  return n;
}

function totalStitches(pattern) {
  if (!pattern) return 0;
  var t = 0;
  for (var i = 0; i < pattern.length; i++) {
    var c = pattern[i];
    if (c && c.id && c.id !== "__skip__" && c.id !== "__empty__") t++;
  }
  return t;
}

// ─── info page ───────────────────────────────────────────────────────────
function drawInfoPage(pdfDoc, project, options, font, bold, rgbColor, pageW, pageH, geom, counts) {
  var page = pdfDoc.addPage([pageW, pageH]);
  var marginPt = Layout.mmToPt(geom.marginMm);
  var branding = options.branding || {};
  var y = pageH - marginPt - 22;

  page.drawText("Pattern Information", { x: marginPt, y: y, size: 18, font: bold, color: rgbColor(0, 0, 0) });
  y -= 28;

  // Fabric recommendations
  page.drawText("Fabric Recommendations", { x: marginPt, y: y, size: 12, font: bold, color: rgbColor(0, 0, 0) });
  y -= 16;
  var fabricCounts = [11, 14, 16, 18, 22];
  for (var i = 0; i < fabricCounts.length; i++) {
    var fc = fabricCounts[i];
    page.drawText(fc + "ct Aida or evenweave: " + finishedSize(project.w, project.h, fc).split(" on ")[0], {
      x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15),
    });
    y -= 13;
  }
  y -= 8;

  // Thread summary
  var totalThreads = countDistinctColours(project.palette);
  var totalStitchesN = totalStitches(project.pattern);
  page.drawText("Thread Summary", { x: marginPt, y: y, size: 12, font: bold, color: rgbColor(0, 0, 0) });
  y -= 16;
  page.drawText("Total colours: " + totalThreads, { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
  y -= 13;
  page.drawText("Total stitches: " + totalStitchesN.toLocaleString("en-GB"), { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
  y -= 13;
  page.drawText("Suggested strands: 2 over 1", { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
  y -= 24;

  // Stitch types used
  page.drawText("Stitch Types Used", { x: marginPt, y: y, size: 12, font: bold, color: rgbColor(0, 0, 0) });
  y -= 16;
  var hasFull = totalStitchesN > 0;
  var hasPartial = project.partialStitches && project.partialStitches.length > 0;
  var hasBs = project.bsLines && project.bsLines.length > 0;
  if (hasFull)    { page.drawText("• Full cross-stitch", { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) }); y -= 13; }
  if (hasPartial) { page.drawText("• Partial / quarter stitches", { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) }); y -= 13; }
  if (hasBs)      { page.drawText("• Backstitch", { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) }); y -= 13; }
  y -= 16;

  // Designer notes / contact
  if (branding.designerName) {
    page.drawText("Designer", { x: marginPt, y: y, size: 12, font: bold, color: rgbColor(0, 0, 0) });
    y -= 16;
    page.drawText(branding.designerName, { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
    y -= 16;
  }
  if (branding.designerContact) {
    page.drawText(branding.designerContact, { x: marginPt + 10, y: y, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
    y -= 13;
  }
  if (branding.designerCopyright) {
    page.drawText(branding.designerCopyright, {
      x: marginPt, y: marginPt + 12, size: 9, font: font, color: rgbColor(0.4, 0.4, 0.4),
      maxWidth: pageW - 2 * marginPt,
    });
  }
}

// ─── legend pages ────────────────────────────────────────────────────────
function drawLegendPages(pdfDoc, project, paletteMap, counts, font, bold, symbolFont, rgbColor, pageW, pageH, geom) {
  var marginPt = Layout.mmToPt(geom.marginMm);
  var rowsPerPage = 32;
  // Build sorted entries (matches the codepoint assignment order).
  var orderedIds = paletteMap.order;
  var entries = orderedIds.map(function (id) {
    var pe = (project.palette || []).find(function (p) { return p && p.id === id; }) || { id: id, name: id, rgb: [128, 128, 128], type: "solid" };
    return { entry: pe, codepoint: paletteMap.map[id], count: counts[id] || 0 };
  });

  var pages = Math.max(1, Math.ceil(entries.length / rowsPerPage));
  for (var pi = 0; pi < pages; pi++) {
    var page = pdfDoc.addPage([pageW, pageH]);
    var y = pageH - marginPt - 22;
    var title = "Thread Legend" + (pages > 1 ? " (" + (pi + 1) + " of " + pages + ")" : "");
    page.drawText(title, { x: marginPt, y: y, size: 16, font: bold, color: rgbColor(0, 0, 0) });
    y -= 18;

    // Header row
    var colSym  = marginPt;
    var colSwatch = marginPt + 18;
    var colCode = marginPt + 50;
    var colName = marginPt + 130;
    var colStr  = pageW - marginPt - 110;
    var colCnt  = pageW - marginPt - 60;
    page.drawText("Sym", { x: colSym,    y: y, size: 9, font: bold, color: rgbColor(0.3, 0.3, 0.3) });
    page.drawText("",     { x: colSwatch, y: y, size: 9, font: bold });
    page.drawText("Brand & no.", { x: colCode, y: y, size: 9, font: bold, color: rgbColor(0.3, 0.3, 0.3) });
    page.drawText("Name", { x: colName, y: y, size: 9, font: bold, color: rgbColor(0.3, 0.3, 0.3) });
    page.drawText("Str",  { x: colStr,  y: y, size: 9, font: bold, color: rgbColor(0.3, 0.3, 0.3) });
    page.drawText("Stitches", { x: colCnt, y: y, size: 9, font: bold, color: rgbColor(0.3, 0.3, 0.3) });
    y -= 12;

    var slice = entries.slice(pi * rowsPerPage, (pi + 1) * rowsPerPage);
    for (var i = 0; i < slice.length; i++) {
      var ent = slice[i];
      var rowY = y - i * 18;
      // Symbol (embedded font)
      try {
        page.drawText(String.fromCodePoint(ent.codepoint), {
          x: colSym, y: rowY, size: 12, font: symbolFont, color: rgbColor(0, 0, 0),
        });
      } catch (_) {}
      // Swatch
      var rgb = ent.entry.rgb || [128, 128, 128];
      page.drawRectangle({
        x: colSwatch, y: rowY - 1, width: 20, height: 12,
        color: rgbColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255),
        borderColor: rgbColor(0.3, 0.3, 0.3), borderWidth: 0.4,
      });
      // Brand & number
      var brand = brandLabel(ent.entry);
      page.drawText(brand, { x: colCode, y: rowY, size: 10, font: font, color: rgbColor(0, 0, 0) });
      // Name
      var name = (ent.entry.name || "").substring(0, 28);
      page.drawText(name, { x: colName, y: rowY, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
      // Strands
      page.drawText("2", { x: colStr + 6, y: rowY, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
      // Count
      page.drawText(String(ent.count), { x: colCnt, y: rowY, size: 10, font: font, color: rgbColor(0.15, 0.15, 0.15) });
    }
  }
  return pages;
}

function brandLabel(entry) {
  if (!entry) return "";
  if (entry.type === "blend" && entry.threads && entry.threads.length === 2) {
    return "DMC " + entry.threads[0].id + " + " + entry.threads[1].id;
  }
  // Brand inferred from id prefix or default DMC.
  if (typeof entry.id === "string" && entry.id.indexOf(":") >= 0) {
    var parts = entry.id.split(":");
    return parts[0].toUpperCase() + " " + parts.slice(1).join(":");
  }
  return "DMC " + entry.id;
}

// ─── chart pages ─────────────────────────────────────────────────────────
function drawChartPage(pdfDoc, project, seg, mode, geom, codepoints, counts,
                       symbolFont, font, bold, rgbColor, pageW, pageH,
                       miniLegend, segIndex, segTotal) {
  var page = pdfDoc.addPage([pageW, pageH]);
  var marginPt = Layout.mmToPt(geom.marginMm);
  var headerPt = Layout.mmToPt(geom.chartHeaderMm);
  var footerPt = Layout.mmToPt(geom.chartFooterMm);
  var cellPt = Layout.mmToPt(geom.cellMm);
  var rowGutterPt = Layout.mmToPt(6);

  var chartX0 = marginPt + rowGutterPt;
  var chartY1 = pageH - marginPt - headerPt;
  var chartY0 = chartY1 - (seg.y1 - seg.y0) * cellPt;

  // ── Header (top): position text + page number ────────────────────────
  var headerText = "Columns " + (seg.x0 + 1) + "–" + seg.x1 + ", Rows " + (seg.y0 + 1) + "–" + seg.y1
                 + "    [" + (mode === "bw" ? "B&W" : "Colour") + "]";
  page.drawText(headerText, {
    x: marginPt, y: pageH - marginPt - 12,
    size: 10, font: bold, color: rgbColor(0, 0, 0),
  });
  page.drawText("Page " + (seg.pageIndex + 1) + " of " + segTotal, {
    x: pageW - marginPt - 60, y: pageH - marginPt - 12,
    size: 10, font: font, color: rgbColor(0.3, 0.3, 0.3),
  });

  // ── Overlap zone tint (10% black) drawn first so cells/grid sit on top
  if (seg.overlapLeft > 0) {
    page.drawRectangle({
      x: chartX0, y: chartY0,
      width: seg.overlapLeft * cellPt, height: (seg.y1 - seg.y0) * cellPt,
      color: rgbColor(0, 0, 0), opacity: 0.08, borderWidth: 0,
    });
  }
  if (seg.overlapTop > 0) {
    page.drawRectangle({
      x: chartX0, y: chartY1 - seg.overlapTop * cellPt,
      width: (seg.x1 - seg.x0) * cellPt, height: seg.overlapTop * cellPt,
      color: rgbColor(0, 0, 0), opacity: 0.08, borderWidth: 0,
    });
  }

  // ── Cells ─────────────────────────────────────────────────────────────
  var pat = project.pattern;
  var W = project.w;
  var symSize = cellPt * 0.78;
  for (var ry = seg.y0; ry < seg.y1; ry++) {
    for (var rx = seg.x0; rx < seg.x1; rx++) {
      var cell = pat[ry * W + rx];
      if (!cell || !cell.id || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var cx = chartX0 + (rx - seg.x0) * cellPt;
      var cy = chartY1 - (ry - seg.y0 + 1) * cellPt;     // pdf-lib y is bottom-left
      var cp = codepoints[cell.id];
      var rgb = cell.rgb || [128, 128, 128];
      // Colour fill
      if (mode === "colour") {
        page.drawRectangle({
          x: cx, y: cy, width: cellPt, height: cellPt,
          color: rgbColor(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255), borderWidth: 0,
        });
      }
      // Symbol
      if (cp != null) {
        var symColor;
        if (mode === "colour") {
          var c = Layout.contrastColor(rgb);
          symColor = rgbColor(c[0], c[1], c[2]);
        } else {
          symColor = rgbColor(0, 0, 0);
        }
        var ch;
        try { ch = String.fromCodePoint(cp); } catch (_) { ch = ""; }
        if (ch) {
          // Centre the glyph in the cell — symbolFont em=1000 with ascent 800,
          // so visual centre is at (size * 0.4) above baseline.
          var tx = cx + (cellPt - symSize) / 2 + symSize * 0.10;
          var ty = cy + (cellPt - symSize) / 2 + symSize * 0.10;
          try {
            page.drawText(ch, { x: tx, y: ty, size: symSize, font: symbolFont, color: symColor });
          } catch (_) { /* skip un-renderable */ }
        }
      }
    }
  }

  // ── Grid lines ────────────────────────────────────────────────────────
  var nx = seg.x1 - seg.x0;
  var ny = seg.y1 - seg.y0;
  var minor = rgbColor(0, 0, 0);
  var major = rgbColor(0, 0, 0);
  for (var gx = 0; gx <= nx; gx++) {
    var x = chartX0 + gx * cellPt;
    var absCol = seg.x0 + gx;
    var isMajor = absCol % 10 === 0;
    page.drawLine({
      start: { x: x, y: chartY0 }, end: { x: x, y: chartY1 },
      thickness: isMajor ? 0.6 : 0.18,
      color: minor, opacity: isMajor ? 0.85 : 0.55,
    });
  }
  for (var gy = 0; gy <= ny; gy++) {
    var yy = chartY1 - gy * cellPt;
    var absRow = seg.y0 + gy;
    var isMajor2 = absRow % 10 === 0;
    page.drawLine({
      start: { x: chartX0, y: yy }, end: { x: chartX0 + nx * cellPt, y: yy },
      thickness: isMajor2 ? 0.6 : 0.18,
      color: major, opacity: isMajor2 ? 0.85 : 0.55,
    });
  }

  // ── Row / col numbers ────────────────────────────────────────────────
  for (var gx2 = 0; gx2 <= nx; gx2 += 10) {
    var absC = seg.x0 + gx2;
    if (absC === 0 || absC % 10 !== 0) continue;
    page.drawText(String(absC), {
      x: chartX0 + gx2 * cellPt - 5, y: chartY1 + 3,
      size: 7, font: font, color: rgbColor(0.2, 0.2, 0.2),
    });
  }
  for (var gy2 = 0; gy2 <= ny; gy2 += 10) {
    var absR = seg.y0 + gy2;
    if (absR === 0 || absR % 10 !== 0) continue;
    page.drawText(String(absR), {
      x: chartX0 - rowGutterPt + 1, y: chartY1 - gy2 * cellPt - 3,
      size: 7, font: font, color: rgbColor(0.2, 0.2, 0.2),
    });
  }

  // ── Mini legend strip in footer ──────────────────────────────────────
  if (miniLegend) {
    var stripY = marginPt + footerPt - 28;
    var pageCounts = {};
    for (var ry2 = seg.y0; ry2 < seg.y1; ry2++) {
      for (var rx2 = seg.x0; rx2 < seg.x1; rx2++) {
        var cc = pat[ry2 * W + rx2];
        if (!cc || !cc.id || cc.id === "__skip__" || cc.id === "__empty__") continue;
        pageCounts[cc.id] = (pageCounts[cc.id] || 0) + 1;
      }
    }
    var topIds = Object.keys(pageCounts).sort(function (a, b) { return pageCounts[b] - pageCounts[a]; }).slice(0, 10);
    page.drawText("On this page:", { x: marginPt, y: stripY + 14, size: 9, font: bold, color: rgbColor(0.3, 0.3, 0.3) });
    var sx = marginPt;
    for (var ti = 0; ti < topIds.length; ti++) {
      var id = topIds[ti];
      var pe = (project.palette || []).find(function (p) { return p && p.id === id; }) || { rgb: [128, 128, 128] };
      var cp2 = codepoints[id];
      var rgb2 = pe.rgb || [128, 128, 128];
      page.drawRectangle({
        x: sx, y: stripY, width: 10, height: 10,
        color: rgbColor(rgb2[0] / 255, rgb2[1] / 255, rgb2[2] / 255),
        borderColor: rgbColor(0.3, 0.3, 0.3), borderWidth: 0.3,
      });
      if (cp2 != null) {
        try {
          page.drawText(String.fromCodePoint(cp2), { x: sx + 12, y: stripY, size: 9, font: symbolFont, color: rgbColor(0, 0, 0) });
        } catch (_) {}
      }
      page.drawText(brandLabel(pe).replace(/^DMC\s+/, ""), { x: sx + 22, y: stripY + 1, size: 8, font: font, color: rgbColor(0.2, 0.2, 0.2) });
      sx += 60;
      if (sx > pageW - marginPt - 60) break;
    }
  }
}

// ─── chart index ─────────────────────────────────────────────────────────
function drawChartIndexPage(pdfDoc, project, pages, geom, font, bold, rgbColor, pageW, pageH) {
  var page = pdfDoc.addPage([pageW, pageH]);
  var marginPt = Layout.mmToPt(geom.marginMm);
  page.drawText("Chart Index", { x: marginPt, y: pageH - marginPt - 18, size: 16, font: bold, color: rgbColor(0, 0, 0) });
  page.drawText("Each numbered region below corresponds to a chart page.", {
    x: marginPt, y: pageH - marginPt - 36, size: 10, font: font, color: rgbColor(0.3, 0.3, 0.3),
  });

  // Thumbnail box
  var maxW = pageW - 2 * marginPt;
  var maxH = pageH - 2 * marginPt - 60;
  var ratio = project.w / project.h;
  var tw = maxW, th = maxW / ratio;
  if (th > maxH) { th = maxH; tw = maxH * ratio; }
  var tx = marginPt + (maxW - tw) / 2;
  var ty = marginPt + 20;

  // Background fill
  page.drawRectangle({ x: tx, y: ty, width: tw, height: th, color: rgbColor(0.96, 0.96, 0.96), borderColor: rgbColor(0.5, 0.5, 0.5), borderWidth: 0.5 });

  for (var i = 0; i < pages.length; i++) {
    var s = pages[i];
    var px = tx + (s.x0 / project.w) * tw;
    var py = ty + th - ((s.y1 / project.h) * th);
    var pw = ((s.x1 - s.x0) / project.w) * tw;
    var ph = ((s.y1 - s.y0) / project.h) * th;
    page.drawRectangle({ x: px, y: py, width: pw, height: ph, borderColor: rgbColor(0, 0, 0), borderWidth: 0.6, opacity: 1 });
    page.drawText(String(s.pageIndex + 1), { x: px + pw / 2 - 4, y: py + ph / 2 - 4, size: 11, font: bold, color: rgbColor(0, 0, 0) });
  }
}
