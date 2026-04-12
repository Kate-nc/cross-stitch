/* creator/exportPdf.js — PDF generation logic extracted from CreatorApp.
   Uses globals: skeinEst, fmtTimeL, luminance, drawPDFSymbol, stitchesToSkeins,
                 rgbToLab, dE, DMC_RAW (defined in helpers.js / constants.js).
   Requires jsPDF to be loaded (lazy-loaded via window.loadScript). */

/**
 * Generate a pixel-art thumbnail of the pattern as a JPEG data URL.
 * Used by exportPDF and exportCoverSheet for cover page.
 */
window.generatePatternThumbnail = function generatePatternThumbnail(pat, sW, sH, partialStitches) {
  var c = document.createElement("canvas");
  c.width = sW; c.height = sH;
  var ctx = c.getContext("2d");
  var imgData = ctx.createImageData(sW, sH);
  var d = imgData.data;
  var pqKeys = ["TL", "TR", "BL", "BR"];
  for (var i = 0; i < pat.length; i++) {
    var m = pat[i];
    var idx = i * 4;
    var ps = partialStitches && partialStitches.get(i);
    if (ps) {
      var r = 0, g = 0, b = 0, cnt = 0;
      for (var qi = 0; qi < pqKeys.length; qi++) { var qe = ps[pqKeys[qi]]; if (qe) { r += qe.rgb[0]; g += qe.rgb[1]; b += qe.rgb[2]; cnt++; } }
      if (cnt > 0) { d[idx] = Math.round(r / cnt); d[idx + 1] = Math.round(g / cnt); d[idx + 2] = Math.round(b / cnt); d[idx + 3] = 255; continue; }
    }
    if (!m || m.id === "__skip__" || m.id === "__empty__") {
      d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255; d[idx + 3] = 255;
    } else {
      d[idx] = m.rgb[0]; d[idx + 1] = m.rgb[1]; d[idx + 2] = m.rgb[2]; d[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c.toDataURL("image/jpeg", 0.85);
};

/**
 * Build and download a full cross-stitch pattern PDF.
 * @param {object} options  { displayMode, cellSize, singlePage }
 * @param {object} data     Snapshot of CreatorContext (or equivalent state)
 */
window.exportPDF = async function exportPDF(options, data) {
  var displayMode = options.displayMode || "color_symbol";
  var cellMM = options.cellSize || 3;
  var isSinglePage = options.singlePage === true;

  var pat = data.pat, pal = data.pal, cmap = data.cmap;
  var sW = data.sW, sH = data.sH;
  var fabricCt = data.fabricCt, skeinPrice = data.skeinPrice, stitchSpeed = data.stitchSpeed;
  var totalStitchable = data.totalStitchable, blendCount = data.blendCount, totalSkeins = data.totalSkeins;
  var threadOwned = data.threadOwned || {}, done = data.done;
  var totalTime = data.totalTime || 0, sessions = data.sessions || [];
  var skeinData = data.skeinData || [], bsLines = data.bsLines || [];
  var difficulty = data.difficulty;
  var doneCount = data.doneCount || 0;
  var partialStitches = data.partialStitches || new Map();

  if (!pat || !pal || !cmap) return;
  if (!window.jspdf) await window.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  var jsPDF = window.jspdf.jsPDF;
  var mg = 12;
  var cW2 = 186;
  var gridColsA4 = Math.floor(cW2 / cellMM), gridRowsA4 = Math.floor(275 / cellMM);

  var pdf;
  if (isSinglePage) {
    var singleW = mg * 2 + sW * cellMM;
    var singleH = mg * 2 + 10 + sH * cellMM;
    pdf = new jsPDF("portrait", "mm", [Math.max(210, singleW), Math.max(297, singleH)]);
  } else {
    pdf = new jsPDF("portrait", "mm", "a4");
  }

  // ─── Cover Sheet ────────────────────────────────────────────────────────────
  (function() {
    var cmg = 15, y = cmg;
    pdf.setFontSize(26); pdf.setTextColor(30, 30, 30); pdf.text("Cross Stitch Project", cmg, y + 10); y += 18;
    pdf.setDrawColor(91, 123, 179); pdf.setLineWidth(0.8); pdf.line(cmg, y, 195, y); y += 10;

    var thumbData = generatePatternThumbnail(pat, sW, sH, partialStitches);
    var thumbW = 60, thumbH = (sH / sW) * 60;
    if (thumbH > 80) { thumbH = 80; thumbW = (sW / sH) * 80; }
    pdf.addImage(thumbData, "JPEG", (210 - thumbW) / 2, y, thumbW, thumbH);
    y += thumbH + 10;

    pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("PATTERN SUMMARY", cmg, y); y += 7;
    pdf.setFontSize(10); pdf.setTextColor(40);
    var div2 = fabricCt === 28 ? 14 : fabricCt;
    var wIn2 = sW / div2, hIn2 = sH / div2;
    var coverRows = [
      ["Pattern size", sW + " \xd7 " + sH + " stitches"],
      ["Stitchable stitches", totalStitchable.toLocaleString()],
      ["Colours", pal.length + " (" + blendCount + " blend" + (blendCount !== 1 ? "s" : "") + ")"],
      ["Skeins needed", String(totalSkeins)],
      ["Fabric", fabricCt + " count"],
      ["Finished size", wIn2.toFixed(1) + "\u2033 \xd7 " + hIn2.toFixed(1) + "\u2033 (" + (wIn2 * 2.54).toFixed(1) + " \xd7 " + (hIn2 * 2.54).toFixed(1) + " cm)"],
      ["With 1\u2033 margin", (wIn2 + 2).toFixed(0) + "\u2033 \xd7 " + (hIn2 + 2).toFixed(0) + "\u2033"],
      ["Est. time", fmtTimeL(Math.round(totalStitchable / stitchSpeed * 3600)) + " (at " + stitchSpeed + " st/hr)"],
      ["Difficulty", difficulty ? difficulty.label : "\u2014"],
      ["Est. thread cost", "\xa3" + (totalSkeins * skeinPrice).toFixed(2) + " (at \xa3" + skeinPrice.toFixed(2) + "/skein)"],
    ];
    if (partialStitches.size > 0) coverRows.push(["Partial stitches", partialStitches.size + " cells"]);
    coverRows.forEach(function(row) {
      pdf.setTextColor(120); pdf.text(row[0] + ":", cmg, y);
      pdf.setTextColor(40); pdf.text(row[1], cmg + 50, y); y += 5.5;
    });
    y += 6;

    if (done && totalStitchable > 0 && doneCount > 0) {
      var localPct = Math.round(doneCount / totalStitchable * 1000) / 10;
      pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("PROGRESS", cmg, y); y += 7;
      pdf.setFontSize(10); pdf.setTextColor(40);
      pdf.text(localPct + "% complete \u2014 " + doneCount.toLocaleString() + " of " + totalStitchable.toLocaleString() + " stitches", cmg, y); y += 8;
      if (totalTime > 0) {
        pdf.text("Time stitched: " + fmtTimeL(totalTime) + " (" + sessions.length + " session" + (sessions.length !== 1 ? "s" : "") + ")", cmg, y); y += 5.5;
        pdf.text("Actual speed: " + Math.round(doneCount / (totalTime / 3600)) + " stitches/hr", cmg, y); y += 5.5;
      }
      y += 4;
    }

    pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("THREAD LIST", cmg, y); y += 7;
    pdf.setFontSize(8); pdf.setTextColor(80);
    pdf.text("DMC", cmg, y); pdf.text("Name", cmg + 20, y); pdf.text("Skeins", cmg + 100, y); pdf.text("Status", cmg + 120, y); y += 2;
    pdf.setDrawColor(200); pdf.line(cmg, y, 180, y); y += 4;
    pdf.setFontSize(9);
    skeinData.forEach(function(d) {
      if (y > 275) { pdf.addPage(); y = cmg + 8; }
      pdf.setFillColor(d.rgb[0], d.rgb[1], d.rgb[2]); pdf.circle(cmg + 3, y - 1.2, 1.8, "F");
      pdf.setTextColor(40); pdf.text(d.id, cmg + 8, y); pdf.text(d.name, cmg + 20, y); pdf.text(String(d.skeins), cmg + 104, y);
      var st = threadOwned[d.id] || "";
      if (st === "owned") { pdf.setTextColor(22, 163, 74); pdf.text("Owned", cmg + 120, y); }
      else { pdf.setTextColor(234, 88, 12); pdf.text("To buy", cmg + 120, y); }
      pdf.setTextColor(40); y += 5;
    });
    y += 6;
    if (y < 240) {
      pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("NOTES", cmg, y); y += 4;
      pdf.setDrawColor(220);
      for (var nl = 0; nl < 8; nl++) { y += 7; pdf.line(cmg, y, 180, y); }
    }
  }());
  // ─── End Cover Sheet ────────────────────────────────────────────────────────

  // ─── Thread Legend ───────────────────────────────────────────────────────────
  pdf.addPage();
  var ty = mg + 10;
  pdf.setTextColor(0); pdf.setFontSize(14); pdf.text("Thread Legend", mg, ty); ty += 10;
  pdf.setFontSize(9); pdf.setTextColor(80);
  pdf.text("Symbol", mg, ty); pdf.text("Color", mg + 15, ty); pdf.text("DMC", mg + 30, ty);
  pdf.text("Name", mg + 45, ty); pdf.text("Stitches", mg + 110, ty, { align: "right" });
  pdf.text("Length", mg + 135, ty, { align: "right" }); pdf.text("Skeins", mg + 155, ty, { align: "right" });
  ty += 2; pdf.setDrawColor(200); pdf.setLineWidth(0.3); pdf.line(mg, ty, mg + 155, ty); ty += 6;
  pdf.setFontSize(8);
  pal.forEach(function(p) {
    if (ty > 285) { pdf.addPage(); ty = mg + 8; }
    pdf.setFillColor(p.rgb[0], p.rgb[1], p.rgb[2]); pdf.setDrawColor(150);
    pdf.rect(mg + 15, ty - 3, 6, 4, "DF");
    pdf.setTextColor(40); pdf.setDrawColor(40); pdf.setFillColor(40);
    if (typeof drawPDFSymbol === "function") { drawPDFSymbol(pdf, p.symbol, mg + 5, ty - 1, 3.5); }
    else { pdf.text(p.symbol, mg + 3, ty); }
    var isBlend = p.type === "blend";
    var nameStr = isBlend ? p.threads[0].name + " + " + p.threads[1].name : p.name;
    var usg;
    if (typeof stitchesToSkeins === "function") {
      usg = stitchesToSkeins({ stitchCount: p.count, fabricCount: fabricCt, strandsUsed: 2, isBlended: isBlend });
    }
    pdf.text(p.id, mg + 30, ty); pdf.text(nameStr, mg + 45, ty);
    pdf.text(String(p.count), mg + 110, ty, { align: "right" });
    if (usg) {
      pdf.text(String(usg.totalThreadM) + "m", mg + 135, ty, { align: "right" });
      var skDisplay = isBlend ? Math.max(usg.colorA.skeinsToBuy, usg.colorB.skeinsToBuy) : usg.skeinsToBuy;
      pdf.text(String(skDisplay), mg + 155, ty, { align: "right" });
    } else {
      pdf.text("-", mg + 135, ty, { align: "right" });
      pdf.text(String(skeinEst(p.count, fabricCt)), mg + 155, ty, { align: "right" });
    }
    ty += 6;
  });

  // Backstitch legend
  if (bsLines && bsLines.length > 0) {
    var bsUsed = {};
    bsLines.forEach(function(l) {
      var col = l.color || "#000000";
      if (!bsUsed[col]) bsUsed[col] = { count: 0, dmc: "Unknown", name: "Black" };
      bsUsed[col].count++;
    });
    Object.keys(bsUsed).forEach(function(hex) {
      var mm = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
      if (mm && typeof rgbToLab === "function" && typeof DMC_RAW !== "undefined") {
        var lr = parseInt(mm[1], 16), lg = parseInt(mm[2], 16), lb = parseInt(mm[3], 16);
        var lab = rgbToLab(lr, lg, lb);
        var best = DMC_RAW[0], bDist = Infinity;
        for (var i = 0; i < DMC_RAW.length; i++) {
          var dr = DMC_RAW[i][2], dg = DMC_RAW[i][3], db2 = DMC_RAW[i][4];
          var dist = dE(lab, rgbToLab(dr, dg, db2));
          if (dist < bDist) { bDist = dist; best = DMC_RAW[i]; }
        }
        bsUsed[hex].dmc = best[0]; bsUsed[hex].name = best[1];
      }
    });
    ty += 8;
    if (ty > 280) { pdf.addPage(); ty = mg + 8; }
    pdf.setTextColor(0); pdf.setFontSize(14); pdf.text("Backstitch Lines", mg, ty); ty += 10;
    pdf.setFontSize(9); pdf.setTextColor(80);
    pdf.text("Line", mg, ty); pdf.text("DMC", mg + 30, ty); pdf.text("Name", mg + 45, ty);
    pdf.text("Segments", mg + 110, ty, { align: "right" }); ty += 2;
    pdf.setDrawColor(200); pdf.setLineWidth(0.3); pdf.line(mg, ty, mg + 155, ty); ty += 6;
    pdf.setFontSize(8);
    Object.keys(bsUsed).forEach(function(hex) {
      if (ty > 285) { pdf.addPage(); ty = mg + 8; }
      pdf.setDrawColor(hex); pdf.setLineWidth(0.8);
      pdf.line(mg + 2, ty - 1, mg + 15, ty - 1);
      pdf.setTextColor(40);
      pdf.text(String(bsUsed[hex].dmc), mg + 30, ty);
      pdf.text(String(bsUsed[hex].name || "Black"), mg + 45, ty);
      pdf.text(String(bsUsed[hex].count), mg + 110, ty, { align: "right" });
      ty += 6;
    });
  }

  // ─── Partial Stitch Guide ──────────────────────────────────────────────────
  if (partialStitches.size > 0) {
    ty += 8;
    if (ty > 240) { pdf.addPage(); ty = mg + 8; }
    pdf.setTextColor(0); pdf.setFontSize(14); pdf.text("Partial Stitches", mg, ty); ty += 8;
    pdf.setFontSize(8); pdf.setTextColor(80);
    pdf.text("Partial stitches occupy one or more quadrants of a cell (TL, TR, BL, BR), shown as coloured sub-squares.", mg, ty, {maxWidth: 180}); ty += 12;
    var exMM = 8, exGap = 30, eY = ty;
    // Quarter stitch — TL only
    var e1x = mg;
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(200); pdf.setLineWidth(0.2); pdf.rect(e1x, eY, exMM, exMM, "DF");
    pdf.setFillColor(91, 123, 179); pdf.rect(e1x, eY, exMM / 2, exMM / 2, "F");
    pdf.setDrawColor(180); pdf.setLineWidth(0.08);
    pdf.line(e1x + exMM / 2, eY, e1x + exMM / 2, eY + exMM); pdf.line(e1x, eY + exMM / 2, e1x + exMM, eY + exMM / 2);
    pdf.setTextColor(80); pdf.setFontSize(7); pdf.text("Quarter", e1x + exMM / 2, eY + exMM + 4, {align: "center"});
    // Half stitch — TL + BR (diagonal pair)
    var e2x = mg + exGap;
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(200); pdf.setLineWidth(0.2); pdf.rect(e2x, eY, exMM, exMM, "DF");
    pdf.setFillColor(91, 123, 179); pdf.rect(e2x, eY, exMM / 2, exMM / 2, "F");
    pdf.setFillColor(200, 80, 80); pdf.rect(e2x + exMM / 2, eY + exMM / 2, exMM / 2, exMM / 2, "F");
    pdf.setDrawColor(180); pdf.setLineWidth(0.08);
    pdf.line(e2x + exMM / 2, eY, e2x + exMM / 2, eY + exMM); pdf.line(e2x, eY + exMM / 2, e2x + exMM, eY + exMM / 2);
    pdf.setTextColor(80); pdf.setFontSize(7); pdf.text("Half", e2x + exMM / 2, eY + exMM + 4, {align: "center"});
    // Three-quarter stitch — TL + TR + BL
    var e3x = mg + exGap * 2;
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(200); pdf.setLineWidth(0.2); pdf.rect(e3x, eY, exMM, exMM, "DF");
    pdf.setFillColor(91, 123, 179);
    pdf.rect(e3x, eY, exMM / 2, exMM / 2, "F");
    pdf.rect(e3x + exMM / 2, eY, exMM / 2, exMM / 2, "F");
    pdf.rect(e3x, eY + exMM / 2, exMM / 2, exMM / 2, "F");
    pdf.setDrawColor(180); pdf.setLineWidth(0.08);
    pdf.line(e3x + exMM / 2, eY, e3x + exMM / 2, eY + exMM); pdf.line(e3x, eY + exMM / 2, e3x + exMM, eY + exMM / 2);
    pdf.setTextColor(80); pdf.setFontSize(7); pdf.text("Three-quarter", e3x + exMM / 2, eY + exMM + 4, {align: "center"});
    ty = eY + exMM + 10;
    pdf.setFontSize(8); pdf.setTextColor(80);
    pdf.text("This pattern contains " + partialStitches.size + " partial stitch cell" + (partialStitches.size !== 1 ? "s" : "") + ".", mg, ty);
    ty += 6;
  }

  // ─── Chart Pages ─────────────────────────────────────────────────────────────
  var gridCols = isSinglePage ? sW : gridColsA4;
  var gridRows = isSinglePage ? sH : gridRowsA4;
  var pagesX = Math.ceil(sW / gridCols), pagesY = Math.ceil(sH / gridRows);

  // Draw a ¾ stitch triangle fill + symbol for PDF.
  function drawPdfThreeQuarter(px3, py3, emptyCorner, rgb, symbol) {
    var mx = px3 + cellMM / 2, my = py3 + cellMM / 2;
    if (displayMode === "color_symbol" || displayMode === "color") {
      pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
      switch (emptyCorner) {
        case "TL": pdf.triangle(px3 + cellMM, py3, px3 + cellMM, py3 + cellMM, px3, py3 + cellMM, "F"); break;
        case "TR": pdf.triangle(px3, py3, px3, py3 + cellMM, px3 + cellMM, py3 + cellMM, "F"); break;
        case "BL": pdf.triangle(px3, py3, px3 + cellMM, py3, px3 + cellMM, py3 + cellMM, "F"); break;
        case "BR": pdf.triangle(px3, py3, px3 + cellMM, py3, px3, py3 + cellMM, "F"); break;
      }
    }
    if (symbol && (displayMode === "color_symbol" || displayMode === "symbol") && cellMM >= 3) {
      var sx, sy;
      switch (emptyCorner) {
        case "TL": sx = px3 + cellMM * 0.6; sy = py3 + cellMM * 0.6; break;
        case "TR": sx = px3 + cellMM * 0.4; sy = py3 + cellMM * 0.6; break;
        case "BL": sx = px3 + cellMM * 0.6; sy = py3 + cellMM * 0.4; break;
        case "BR": sx = px3 + cellMM * 0.4; sy = py3 + cellMM * 0.4; break;
      }
      var isLight = displayMode === "color_symbol" && luminance(rgb) <= 128;
      pdf.setTextColor(isLight ? 255 : 0); pdf.setDrawColor(isLight ? 255 : 0); pdf.setFillColor(isLight ? 255 : 0);
      if (typeof drawPDFSymbol === "function") drawPDFSymbol(pdf, symbol, sx, sy, cellMM * 0.7);
      else { pdf.setFontSize(Math.max(3, cellMM * 1.2)); pdf.text(symbol, sx, sy + cellMM * 0.15, { align: "center" }); }
    }
  }

  // Draw a ¼ stitch complementary triangle fill + symbol for PDF.
  function drawPdfQuarter(px3, py3, corner, rgb, symbol) {
    if (displayMode === "color_symbol" || displayMode === "color") {
      pdf.setFillColor(rgb[0], rgb[1], rgb[2]);
      switch (corner) {
        case "TL": pdf.triangle(px3, py3, px3 + cellMM, py3, px3, py3 + cellMM, "F"); break;
        case "TR": pdf.triangle(px3 + cellMM, py3, px3 + cellMM, py3 + cellMM, px3, py3, "F"); break;
        case "BL": pdf.triangle(px3, py3 + cellMM, px3, py3, px3 + cellMM, py3 + cellMM, "F"); break;
        case "BR": pdf.triangle(px3 + cellMM, py3 + cellMM, px3 + cellMM, py3, px3, py3 + cellMM, "F"); break;
      }
    }
    if (symbol && (displayMode === "color_symbol" || displayMode === "symbol") && cellMM >= 3) {
      var sx, sy;
      switch (corner) {
        case "TL": sx = px3 + cellMM * 0.25; sy = py3 + cellMM * 0.3; break;
        case "TR": sx = px3 + cellMM * 0.75; sy = py3 + cellMM * 0.3; break;
        case "BL": sx = px3 + cellMM * 0.25; sy = py3 + cellMM * 0.75; break;
        case "BR": sx = px3 + cellMM * 0.75; sy = py3 + cellMM * 0.75; break;
      }
      var isLight = displayMode === "color_symbol" && luminance(rgb) <= 128;
      pdf.setTextColor(isLight ? 255 : 0); pdf.setDrawColor(isLight ? 255 : 0); pdf.setFillColor(isLight ? 255 : 0);
      if (cellMM >= 2.5) {
        if (typeof drawPDFSymbol === "function") drawPDFSymbol(pdf, symbol, sx, sy, cellMM * 0.5);
        else { pdf.setFontSize(Math.max(2.5, cellMM * 0.8)); pdf.text(symbol, sx, sy + cellMM * 0.1, { align: "center" }); }
      }
    }
  }

  function clipLine(x1, y1, x2, y2, xmin, ymin, xmax, ymax) {
    var INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;
    function code(x, y) {
      var c = INSIDE;
      if (x < xmin) c |= LEFT; else if (x > xmax) c |= RIGHT;
      if (y < ymin) c |= TOP; else if (y > ymax) c |= BOTTOM;
      return c;
    }
    var o0 = code(x1, y1), o1 = code(x2, y2), accept = false;
    while (true) {
      if (!(o0 | o1)) { accept = true; break; }
      else if (o0 & o1) { break; }
      else {
        var x, y, oOut = o0 ? o0 : o1;
        if (oOut & TOP) { x = x1 + (x2 - x1) * (ymin - y1) / (y2 - y1); y = ymin; }
        else if (oOut & BOTTOM) { x = x1 + (x2 - x1) * (ymax - y1) / (y2 - y1); y = ymax; }
        else if (oOut & RIGHT) { y = y1 + (y2 - y1) * (xmax - x1) / (x2 - x1); x = xmax; }
        else { y = y1 + (y2 - y1) * (xmin - x1) / (x2 - x1); x = xmin; }
        if (oOut === o0) { x1 = x; y1 = y; o0 = code(x1, y1); }
        else { x2 = x; y2 = y; o1 = code(x2, y2); }
      }
    }
    return accept ? [x1, y1, x2, y2] : null;
  }

  function drawChartPages(isBackstitchOnly) {
    for (var py2 = 0; py2 < pagesY; py2++) {
      for (var px2 = 0; px2 < pagesX; px2++) {
        pdf.addPage();
        var x0 = px2 * gridCols, y0 = py2 * gridRows;
        var mainW = Math.min(gridCols, sW - x0), mainH = Math.min(gridRows, sH - y0);
        var overlapRight = (x0 + mainW < sW) ? 2 : 0, overlapBottom = (y0 + mainH < sH) ? 2 : 0;
        var dW = mainW + overlapRight, dH = mainH + overlapBottom;
        pdf.setFontSize(8); pdf.setTextColor(100);
        var headerText = (isBackstitchOnly ? "Backstitch Chart - " : "") + "Page " + (py2 * pagesX + px2 + 1) + "/" + (pagesX * pagesY);
        pdf.text(headerText, mg, mg + 4);

        if (pagesX > 1 || pagesY > 1) {
          var mmW = 3, mmMapW = pagesX * mmW;
          var mmX = mg + dW * cellMM - mmMapW, mmY = mg + 2;
          for (var my = 0; my < pagesY; my++) {
            for (var mx = 0; mx < pagesX; mx++) {
              if (mx === px2 && my === py2) { pdf.setFillColor(100); pdf.rect(mmX + mx * mmW, mmY + my * mmW, mmW, mmW, "F"); }
              else { pdf.setDrawColor(200); pdf.rect(mmX + mx * mmW, mmY + my * mmW, mmW, mmW, "S"); }
            }
          }
        }

        for (var gy = 0; gy < dH; gy++) {
          for (var gx = 0; gx < dW; gx++) {
            var m = pat[(y0 + gy) * sW + (x0 + gx)];
            var px3 = mg + gx * cellMM, py3 = mg + 8 + gy * cellMM;
            var isOverlap = gx >= mainW || gy >= mainH;
            if (isOverlap) { pdf.setGState(new pdf.GState({ opacity: 0.4 })); pdf.setFillColor(200, 200, 200); pdf.rect(px3, py3, cellMM, cellMM, "F"); }
            var psEntry = !isBackstitchOnly ? partialStitches.get((y0 + gy) * sW + (x0 + gx)) : null;
            if (psEntry) {
              pdf.setFillColor(255, 255, 255); pdf.rect(px3, py3, cellMM, cellMM, "F");
              if (cellMM < 2.5) {
                // Too small for triangles — blend colours into a solid block
                var _r = 0, _g = 0, _b = 0, _cnt = 0;
                var _psk = ["TL","TR","BL","BR"];
                for (var _qi = 0; _qi < _psk.length; _qi++) { var _qe = psEntry[_psk[_qi]]; if (_qe) { _r += _qe.rgb[0]; _g += _qe.rgb[1]; _b += _qe.rgb[2]; _cnt++; } }
                if (_cnt > 0) { pdf.setFillColor(Math.round(_r/_cnt), Math.round(_g/_cnt), Math.round(_b/_cnt)); pdf.rect(px3, py3, cellMM, cellMM, "F"); }
              } else {
                var _psinstr = analysePartialStitches(psEntry, m);
                _psinstr.forEach(function(inst) {
                  var _pssi = cmap[inst.colour.id];
                  var _pssym = _pssi ? _pssi.symbol : null;
                  switch (inst.type) {
                    case "three-quarter": drawPdfThreeQuarter(px3, py3, inst.emptyCorner, inst.colour.rgb, _pssym); break;
                    case "quarter":       drawPdfQuarter(px3, py3, inst.corner, inst.colour.rgb, _pssym); break;
                    case "half":
                      if (displayMode === "color_symbol" || displayMode === "color") {
                        pdf.setFillColor(inst.colour.rgb[0], inst.colour.rgb[1], inst.colour.rgb[2]);
                        if (inst.direction === "fwd") {
                          pdf.triangle(px3, py3 + cellMM, px3 + cellMM, py3, px3 + cellMM, py3 + cellMM, "F");
                          pdf.triangle(px3, py3, px3 + cellMM, py3, px3, py3 + cellMM, "F");
                        } else {
                          pdf.triangle(px3, py3, px3 + cellMM, py3, px3, py3 + cellMM, "F");
                          pdf.triangle(px3 + cellMM, py3, px3 + cellMM, py3 + cellMM, px3, py3 + cellMM, "F");
                        }
                      }
                      if (_pssym && (displayMode === "color_symbol" || displayMode === "symbol") && cellMM >= 3) {
                        var _hsl = displayMode === "color_symbol" && luminance(inst.colour.rgb) <= 128;
                        pdf.setTextColor(_hsl ? 255 : 0); pdf.setDrawColor(_hsl ? 255 : 0); pdf.setFillColor(_hsl ? 255 : 0);
                        if (typeof drawPDFSymbol === "function") drawPDFSymbol(pdf, _pssym, px3 + cellMM / 2, py3 + cellMM / 2, cellMM);
                        else { pdf.setFontSize(Math.max(3, cellMM * 1.0)); pdf.text(_pssym, px3 + cellMM / 2, py3 + cellMM * 0.6, { align: "center" }); }
                      }
                      break;
                  }
                });
                // Thin diagonal separator line through centre
                pdf.setDrawColor(180); pdf.setLineWidth(0.08);
                var _hasFwd = _psinstr.some(function(i) { return (i.type === "three-quarter" && (i.emptyCorner === "TL" || i.emptyCorner === "BR")) || (i.type === "half" && i.direction === "fwd"); });
                var _hasBck = _psinstr.some(function(i) { return (i.type === "three-quarter" && (i.emptyCorner === "TR" || i.emptyCorner === "BL")) || (i.type === "half" && i.direction === "bck"); });
                if (_hasFwd) pdf.line(px3, py3 + cellMM, px3 + cellMM, py3);
                if (_hasBck) pdf.line(px3, py3, px3 + cellMM, py3 + cellMM);
              }
              pdf.setDrawColor(displayMode === "symbol" ? 150 : 200); pdf.setLineWidth(0.2); pdf.rect(px3, py3, cellMM, cellMM, "S");
              if (isOverlap) pdf.setGState(new pdf.GState({ opacity: 1.0 }));
              continue;
            }
            if (!m || m.id === "__skip__" || m.id === "__empty__") {
              pdf.setDrawColor(220); pdf.rect(px3, py3, cellMM, cellMM, "S");
              if (isOverlap) pdf.setGState(new pdf.GState({ opacity: 1.0 }));
              continue;
            }
            var info = cmap[m.id];
            if (!isBackstitchOnly) {
              if (displayMode === "color_symbol" || displayMode === "color") {
                pdf.setFillColor(m.rgb[0], m.rgb[1], m.rgb[2]); pdf.rect(px3, py3, cellMM, cellMM, "F");
              } else {
                pdf.setFillColor(255, 255, 255); pdf.rect(px3, py3, cellMM, cellMM, "F");
              }
            }
            pdf.setDrawColor(isBackstitchOnly ? 220 : (displayMode === "symbol" ? 150 : 200));
            pdf.rect(px3, py3, cellMM, cellMM, "S");
            if (!isBackstitchOnly && info) {
              if (displayMode === "color_symbol" || displayMode === "symbol") {
                var isLight = displayMode === "color_symbol" && luminance(m.rgb) <= 128;
                pdf.setTextColor(isLight ? 255 : 0); pdf.setDrawColor(isLight ? 255 : 0); pdf.setFillColor(isLight ? 255 : 0);
                if (typeof drawPDFSymbol === "function") drawPDFSymbol(pdf, info.symbol, px3 + cellMM / 2, py3 + cellMM / 2, cellMM);
                else { pdf.setFontSize(5); pdf.text(info.symbol, px3 + cellMM / 2, py3 + cellMM * 0.7, { align: "center" }); }
              }
            }
            if (isOverlap) pdf.setGState(new pdf.GState({ opacity: 1.0 }));
          }
        }

        pdf.setDrawColor(80); pdf.setLineWidth(0.2);
        for (var gx2 = 0; gx2 <= dW; gx2++) {
          if (gx2 % 10 === 0) {
            pdf.line(mg + gx2 * cellMM, mg + 8, mg + gx2 * cellMM, mg + 8 + dH * cellMM);
            if (gx2 < dW || x0 + gx2 === sW) { pdf.setFontSize(6); pdf.setTextColor(150); pdf.text(String(x0 + gx2 + 1), mg + gx2 * cellMM, mg + 7, { align: "center" }); }
          }
        }
        if (dW % 10 !== 0) pdf.line(mg + dW * cellMM, mg + 8, mg + dW * cellMM, mg + 8 + dH * cellMM);
        for (var gy2 = 0; gy2 <= dH; gy2++) {
          if (gy2 % 10 === 0) {
            pdf.line(mg, mg + 8 + gy2 * cellMM, mg + dW * cellMM, mg + 8 + gy2 * cellMM);
            if (gy2 < dH || y0 + gy2 === sH) { pdf.setFontSize(6); pdf.setTextColor(150); pdf.text(String(y0 + gy2 + 1), mg - 1, mg + 8 + gy2 * cellMM + 1, { align: "right" }); }
          }
        }
        if (dH % 10 !== 0) pdf.line(mg, mg + 8 + dH * cellMM, mg + dW * cellMM, mg + 8 + dH * cellMM);

        if (overlapRight > 0) { pdf.setLineWidth(0.3); pdf.setDrawColor(120, 120, 120); pdf.setLineDash([2, 2]); pdf.line(mg + mainW * cellMM, mg + 8, mg + mainW * cellMM, mg + 8 + dH * cellMM); pdf.setLineDash([]); }
        if (overlapBottom > 0) { pdf.setLineWidth(0.3); pdf.setDrawColor(120, 120, 120); pdf.setLineDash([2, 2]); pdf.line(mg, mg + 8 + mainH * cellMM, mg + dW * cellMM, mg + 8 + mainH * cellMM); pdf.setLineDash([]); }

        if (bsLines && bsLines.length > 0) {
          pdf.setLineWidth(0.6); pdf.setDrawColor(0, 0, 0);
          bsLines.forEach(function(ln) {
            var clipped = clipLine(ln.x1, ln.y1, ln.x2, ln.y2, x0, y0, x0 + dW, y0 + dH);
            if (clipped) pdf.line(mg + (clipped[0] - x0) * cellMM, mg + 8 + (clipped[1] - y0) * cellMM, mg + (clipped[2] - x0) * cellMM, mg + 8 + (clipped[3] - y0) * cellMM);
          });
        }

        pdf.setDrawColor(0); pdf.setLineWidth(0.4); pdf.rect(mg, mg + 8, dW * cellMM, dH * cellMM, "S");

        var centerX = Math.floor(sW / 2), centerY = Math.floor(sH / 2);
        if (centerX >= x0 && centerX < x0 + dW) {
          var ccx = mg + (centerX - x0) * cellMM + (cellMM / 2);
          if (py2 === 0) pdf.triangle(ccx, mg + 8 - 3, ccx - 2, mg + 8 - 6, ccx + 2, mg + 8 - 6, "F");
          if (py2 === pagesY - 1 && mainH === dH) { var bY2 = mg + 8 + dH * cellMM; pdf.triangle(ccx, bY2 + 3, ccx - 2, bY2 + 6, ccx + 2, bY2 + 6, "F"); }
        }
        if (centerY >= y0 && centerY < y0 + dH) {
          var ccy = mg + 8 + (centerY - y0) * cellMM + (cellMM / 2);
          if (px2 === 0) pdf.triangle(mg - 3, ccy, mg - 6, ccy - 2, mg - 6, ccy + 2, "F");
          if (px2 === pagesX - 1 && mainW === dW) { var rX = mg + dW * cellMM; pdf.triangle(rX + 3, ccy, rX + 6, ccy - 2, rX + 6, ccy + 2, "F"); }
        }
      }
    }
  }

  drawChartPages(false);
  if (bsLines && bsLines.length > 0) drawChartPages(true);

  pdf.save("cross-stitch-pattern.pdf");
};

/**
 * Generate and download a standalone cover sheet PDF.
 * @param {object} data  Snapshot of CreatorContext (or equivalent state)
 */
window.exportCoverSheet = async function exportCoverSheet(data) {
  var pat = data.pat, pal = data.pal, cmap = data.cmap;
  var sW = data.sW, sH = data.sH;
  var fabricCt = data.fabricCt, skeinPrice = data.skeinPrice, stitchSpeed = data.stitchSpeed;
  var totalStitchable = data.totalStitchable, blendCount = data.blendCount, totalSkeins = data.totalSkeins;
  var threadOwned = data.threadOwned || {}, done = data.done;
  var totalTime = data.totalTime || 0, sessions = data.sessions || [];
  var skeinData = data.skeinData || [];
  var difficulty = data.difficulty;
  var doneCount = data.doneCount || 0;
  var partialStitches = data.partialStitches || new Map();

  if (!pat || !pal || !cmap) return;
  if (!window.jspdf) await window.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  var jsPDF = window.jspdf.jsPDF;
  var pdf = new jsPDF("portrait", "mm", "a4");
  var mg = 15, y = mg;

  pdf.setFontSize(26); pdf.setTextColor(30, 30, 30); pdf.text("Cross Stitch Project", mg, y + 10); y += 18;
  pdf.setDrawColor(91, 123, 179); pdf.setLineWidth(0.8); pdf.line(mg, y, 195, y); y += 10;

  var thumbData = generatePatternThumbnail(pat, sW, sH, partialStitches);
  var thumbW = 60, thumbH = (sH / sW) * 60;
  if (thumbH > 80) { thumbH = 80; thumbW = (sW / sH) * 80; }
  pdf.addImage(thumbData, "JPEG", (210 - thumbW) / 2, y, thumbW, thumbH);
  y += thumbH + 10;

  pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("PATTERN SUMMARY", mg, y); y += 7;
  pdf.setFontSize(10); pdf.setTextColor(40);
  var div2 = fabricCt === 28 ? 14 : fabricCt;
  var wIn2 = sW / div2, hIn2 = sH / div2;
  var csRows = [
    ["Pattern size", sW + " \xd7 " + sH + " stitches"],
    ["Stitchable stitches", totalStitchable.toLocaleString()],
    ["Colours", pal.length + " (" + blendCount + " blend" + (blendCount !== 1 ? "s" : "") + ")"],
    ["Skeins needed", String(totalSkeins)],
    ["Fabric", fabricCt + " count"],
    ["Finished size", wIn2.toFixed(1) + "\u2033 \xd7 " + hIn2.toFixed(1) + "\u2033 (" + (wIn2 * 2.54).toFixed(1) + " \xd7 " + (hIn2 * 2.54).toFixed(1) + " cm)"],
    ["With 1\u2033 margin", (wIn2 + 2).toFixed(0) + "\u2033 \xd7 " + (hIn2 + 2).toFixed(0) + "\u2033"],
    ["Est. time", fmtTimeL(Math.round(totalStitchable / stitchSpeed * 3600)) + " (at " + stitchSpeed + " st/hr)"],
    ["Difficulty", difficulty ? difficulty.label : "\u2014"],
    ["Est. thread cost", "\xa3" + (totalSkeins * skeinPrice).toFixed(2) + " (at \xa3" + skeinPrice.toFixed(2) + "/skein)"],
  ];
  if (partialStitches.size > 0) csRows.push(["Partial stitches", partialStitches.size + " cells"]);
  csRows.forEach(function(row) {
    pdf.setTextColor(120); pdf.text(row[0] + ":", mg, y);
    pdf.setTextColor(40); pdf.text(row[1], mg + 50, y); y += 5.5;
  });
  y += 6;

  if (done && totalStitchable > 0 && doneCount > 0) {
    var localPct = Math.round(doneCount / totalStitchable * 1000) / 10;
    pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("PROGRESS", mg, y); y += 7;
    pdf.setFontSize(10); pdf.setTextColor(40);
    pdf.text(localPct + "% complete \u2014 " + doneCount.toLocaleString() + " of " + totalStitchable.toLocaleString() + " stitches", mg, y); y += 8;
    if (totalTime > 0) {
      pdf.text("Time stitched: " + fmtTimeL(totalTime) + " (" + sessions.length + " session" + (sessions.length !== 1 ? "s" : "") + ")", mg, y); y += 5.5;
      pdf.text("Actual speed: " + Math.round(doneCount / (totalTime / 3600)) + " stitches/hr", mg, y); y += 5.5;
    }
    y += 4;
  }

  pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("THREAD LIST", mg, y); y += 7;
  pdf.setFontSize(8); pdf.setTextColor(80);
  pdf.text("DMC", mg, y); pdf.text("Name", mg + 20, y); pdf.text("Skeins", mg + 100, y); pdf.text("Status", mg + 120, y); y += 2;
  pdf.setDrawColor(200); pdf.line(mg, y, 180, y); y += 4;
  pdf.setFontSize(9);
  skeinData.forEach(function(d) {
    if (y > 275) { pdf.addPage(); y = mg + 8; }
    pdf.setFillColor(d.rgb[0], d.rgb[1], d.rgb[2]); pdf.circle(mg + 3, y - 1.2, 1.8, "F");
    pdf.setTextColor(40); pdf.text(d.id, mg + 8, y); pdf.text(d.name, mg + 20, y); pdf.text(String(d.skeins), mg + 104, y);
    var st = threadOwned[d.id] || "";
    if (st === "owned") { pdf.setTextColor(22, 163, 74); pdf.text("Owned", mg + 120, y); }
    else { pdf.setTextColor(234, 88, 12); pdf.text("To buy", mg + 120, y); }
    pdf.setTextColor(40); y += 5;
  });
  y += 6;
  if (y < 240) {
    pdf.setFontSize(11); pdf.setTextColor(100); pdf.text("NOTES", mg, y); y += 4;
    pdf.setDrawColor(220);
    for (var nl = 0; nl < 8; nl++) { y += 7; pdf.line(mg, y, 180, y); }
  }

  pdf.save("cross-stitch-cover-sheet.pdf");
};
