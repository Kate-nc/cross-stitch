/* creator/pdfChartLayout.js — Pure helpers for PDF chart pagination & palette mapping.
 *
 * Loaded both:
 *   • Inside pdf-export-worker.js via importScripts() — must work without DOM/window.
 *   • As a regular <script> on the main thread (so the Export panel can preview
 *     page counts before kicking off generation).
 *
 * Exports (browser): window.PdfChartLayout = { ... }
 * Exports (CommonJS): module.exports = { ... }   ← used by Jest tests.
 */
(function (root) {
  "use strict";

  // mm → PDF points (1pt = 1/72 inch, 25.4mm = 1in)
  function mmToPt(mm) { return mm * 72 / 25.4; }
  function ptToMm(pt) { return pt * 25.4 / 72; }

  // Page sizes in mm (portrait).
  var PAGE_SIZES_MM = {
    a4:     { w: 210,    h: 297 },
    letter: { w: 215.9,  h: 279.4 },
  };

  /**
   * Resolve "auto" page size based on locale (A4 unless en-US / en-CA).
   */
  function resolvePageSize(pageSize, locale) {
    if (pageSize === "a4" || pageSize === "letter") return pageSize;
    var loc = (locale || "").toLowerCase();
    if (loc === "en-us" || loc === "en-ca" || loc.indexOf("en-us-") === 0 || loc.indexOf("en-ca-") === 0) {
      return "letter";
    }
    return "a4";
  }

  /**
   * Compute usable chart geometry for one page.
   *
   * Inputs:
   *   pageSize:        "a4" | "letter" | "auto"
   *   marginsMm:       page margin in mm (all four sides)
   *   stitchesPerPage: "small" | "medium" | "large" | "custom"
   *   customCols / customRows: target cells when "custom"
   *   chartHeaderMm / chartFooterMm: vertical space reserved for column/row
   *      labels and the mini-legend strip.
   *   locale:          for resolving "auto" page size.
   *
   * Returns:
   *   {
   *     pageSize:    "a4" | "letter",
   *     pageWmm, pageHmm,
   *     marginMm,
   *     contentWmm, contentHmm,        // body area minus margins
   *     chartAreaWmm, chartAreaHmm,    // body area minus chart header/footer
   *     cellMm,                        // chosen cell size, snapped to fit grid
   *     colsPerPage, rowsPerPage,      // BOTH multiples of 10 (>= 10)
   *   }
   */
  function computePageGeometry(opts) {
    opts = opts || {};
    var pageSize = resolvePageSize(opts.pageSize || "auto", opts.locale);
    var sz = PAGE_SIZES_MM[pageSize];
    var marginMm = (opts.marginsMm != null) ? opts.marginsMm : 12;
    if (marginMm < 10) marginMm = 10;
    var headerMm = opts.chartHeaderMm != null ? opts.chartHeaderMm : 14;
    var footerMm = opts.chartFooterMm != null ? opts.chartFooterMm : 22;

    var contentW = sz.w - 2 * marginMm;
    var contentH = sz.h - 2 * marginMm;
    var chartW = contentW - 6;          // 6mm gutter for row numbers
    var chartH = contentH - headerMm - footerMm;

    // Target cell size by preset (mm).
    var targetCell;
    var targetCols = null, targetRows = null;
    switch (opts.stitchesPerPage || "medium") {
      case "small":  targetCell = 2.0; break;
      case "large":  targetCell = 4.0; break;
      case "custom":
        targetCols = Math.max(10, opts.customCols || 60);
        targetRows = Math.max(10, opts.customRows || 70);
        targetCell = Math.min(chartW / targetCols, chartH / targetRows);
        break;
      case "medium":
      default:       targetCell = 2.8; break;
    }

    var cols, rows;
    if (targetCols && targetRows) {
      cols = Math.floor(targetCols / 10) * 10 || 10;
      rows = Math.floor(targetRows / 10) * 10 || 10;
    } else {
      cols = Math.floor(chartW / targetCell / 10) * 10 || 10;
      rows = Math.floor(chartH / targetCell / 10) * 10 || 10;
    }

    // Re-fit cell size so the chosen cols/rows fit perfectly.
    var cellMm = Math.min(chartW / cols, chartH / rows);

    return {
      pageSize: pageSize,
      pageWmm: sz.w,
      pageHmm: sz.h,
      marginMm: marginMm,
      contentWmm: contentW,
      contentHmm: contentH,
      chartAreaWmm: chartW,
      chartAreaHmm: chartH,
      chartHeaderMm: headerMm,
      chartFooterMm: footerMm,
      cellMm: cellMm,
      colsPerPage: cols,
      rowsPerPage: rows,
    };
  }

  /**
   * Paginate a pattern of width × height into chart segments.
   *
   * Each break is aligned to the next 10-stitch boundary, so 10×10 blocks
   * never split. When `overlap` is truthy the previous page's last 2 rows/cols
   * are repeated at the start of the next page (and tagged as overlap zones).
   *
   * Returns an array of { pageIndex, gridRow, gridCol, x0, y0, x1, y1,
   *                      overlapLeft, overlapTop, gridCols, gridRows }
   *   - x0/y0 inclusive, x1/y1 exclusive (in stitch coordinates)
   *   - overlapLeft/Top: number of overlap stitches on the leading edge (0 or 2)
   */
  function paginate(opts) {
    var W = opts.patternW;
    var H = opts.patternH;
    var colsPerPage = opts.colsPerPage;
    var rowsPerPage = opts.rowsPerPage;
    var overlap = opts.overlap ? 2 : 0;

    if (!W || !H || !colsPerPage || !rowsPerPage) return [];

    // Effective stride: each page advances by (colsPerPage - overlap), but the
    // FIRST page always starts at 0 with no overlap.
    var strideX = Math.max(10, colsPerPage - overlap);
    var strideY = Math.max(10, rowsPerPage - overlap);

    // Build column anchors then row anchors.
    var anchorsX = [0];
    while (anchorsX[anchorsX.length - 1] + colsPerPage < W) {
      anchorsX.push(anchorsX[anchorsX.length - 1] + strideX);
    }
    var anchorsY = [0];
    while (anchorsY[anchorsY.length - 1] + rowsPerPage < H) {
      anchorsY.push(anchorsY[anchorsY.length - 1] + strideY);
    }

    var pages = [];
    var pageIndex = 0;
    for (var ry = 0; ry < anchorsY.length; ry++) {
      for (var rx = 0; rx < anchorsX.length; rx++) {
        var x0 = anchorsX[rx];
        var y0 = anchorsY[ry];
        var x1 = Math.min(W, x0 + colsPerPage);
        var y1 = Math.min(H, y0 + rowsPerPage);
        pages.push({
          pageIndex: pageIndex++,
          gridCol: rx,
          gridRow: ry,
          x0: x0, y0: y0, x1: x1, y1: y1,
          overlapLeft: rx > 0 ? overlap : 0,
          overlapTop:  ry > 0 ? overlap : 0,
          gridCols: anchorsX.length,
          gridRows: anchorsY.length,
        });
      }
    }
    return pages;
  }

  /**
   * Build a deterministic palette → codepoint map.
   *
   * Sort order:
   *   1. solid threads first (sorted numerically by id where possible, else lexically),
   *   2. then blends (sorted lexically by id).
   *
   * Codepoints are assigned starting at spec.baseCodepoint (U+E000).
   * Blends past the end of the spec wrap around (worst case: very rare patterns
   * with > 96 colours fall back to repeated symbols — visually distinguished by
   * the colour swatch in the legend).
   */
  function buildCodepointMap(palette, spec) {
    var base = spec.baseCodepoint;
    var capacity = spec.glyphs.length;
    var solids = [], blends = [];
    palette.forEach(function (e) {
      if (!e || !e.id) return;
      if (e.id === "__skip__" || e.id === "__empty__") return;
      if (e.type === "blend") blends.push(e); else solids.push(e);
    });
    function numericKey(id) {
      var m = String(id).match(/^(\d+)/);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    }
    solids.sort(function (a, b) {
      var ka = numericKey(a.id), kb = numericKey(b.id);
      if (ka !== kb) return ka - kb;
      return String(a.id).localeCompare(String(b.id));
    });
    blends.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });

    var map = {};
    var ordered = solids.concat(blends);
    for (var i = 0; i < ordered.length; i++) {
      map[ordered[i].id] = base + (i % capacity);
    }
    return { map: map, order: ordered.map(function (e) { return e.id; }) };
  }

  /**
   * Choose a contrasting symbol colour for a swatch RGB.
   * Returns [r,g,b] in 0..1 (PDF colour space).
   *
   * Uses the perceived luminance threshold described in the spec (>55% → black,
   * else white).
   */
  function contrastColor(rgb) {
    if (!rgb || rgb.length < 3) return [0, 0, 0];
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    // Standard relative luminance (sRGB approximation).
    var y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return y > 0.55 ? [0, 0, 0] : [1, 1, 1];
  }

  var api = {
    PAGE_SIZES_MM: PAGE_SIZES_MM,
    mmToPt: mmToPt,
    ptToMm: ptToMm,
    resolvePageSize: resolvePageSize,
    computePageGeometry: computePageGeometry,
    paginate: paginate,
    buildCodepointMap: buildCodepointMap,
    contrastColor: contrastColor,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PdfChartLayout = api;
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
