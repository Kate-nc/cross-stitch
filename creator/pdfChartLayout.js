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

  // Hoisted: leading-digits regex used for stable palette sort by numeric id prefix.
  var LEADING_DIGITS = /^(\d+)/;

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
   * Density is snapped to tens. Without overlap, breaks align to 10-stitch
   * boundaries. With overlap, the previous page's last 2 rows/cols
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
    var strideX = Math.max(1, colsPerPage - overlap);
    var strideY = Math.max(1, rowsPerPage - overlap);

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

  // Reject malformed persisted/preset values before either preview or export.
  function validateOptions(opts) {
    opts = opts || {};
    function choice(key, allowed) {
      if (opts[key] != null && allowed.indexOf(opts[key]) < 0) throw new Error("Invalid PDF " + key + ".");
    }
    choice("pageSize", ["auto", "a4", "letter"]);
    choice("stitchesPerPage", ["small", "medium", "large", "custom"]);
    choice("theme", ["pk", "workshop"]);
    ["marginsMm", "customCols", "customRows"].forEach(function (k) {
      if (opts[k] == null) return;
      var min = 10, max = k === "marginsMm" ? 30 : 200;
      if (!Number.isFinite(opts[k]) || opts[k] < min || opts[k] > max ||
          !Number.isInteger(opts[k])) throw new Error("PDF " + k + " must be " + min + "–" + max + (k === "marginsMm" ? " mm." : " stitches (rounded down to tens)."));
    });
    ["overlap", "includeCover", "includeInfo", "includeIndex", "includeLegend", "miniLegend", "includeBranding"].forEach(function (k) {
      if (opts[k] != null && typeof opts[k] !== "boolean") throw new Error("Invalid PDF " + k + ".");
    });
    if (opts.chartModes != null && (!Array.isArray(opts.chartModes) || !opts.chartModes.length ||
        opts.chartModes.some(function (m) { return m !== "bw" && m !== "colour"; }) || new Set(opts.chartModes).size !== opts.chartModes.length)) throw new Error("Pick at least one valid chart mode.");
  }

  // Full stitches per thread. A cell with part stitches over it is drawn as
  // part stitches (partStitchInstructions), so its full stitch isn't
  // counted, and threads used only in part stitches are listed with 0 so
  // they get a symbol and a key row. Without part stitches this is exactly
  // the full-stitch count it always was.
  function usedThreadCounts(project) {
    var counts = Object.create(null);
    var parts = partStitchEntries(project), drawnAsParts = null;
    if (parts.length) {
      drawnAsParts = Object.create(null);
      parts.forEach(function (e) { drawnAsParts[e[0]] = true; });
    }
    (project.pattern || []).forEach(function (c, i) {
      if (drawnAsParts && drawnAsParts[i]) return;
      if (c && c.id && c.id !== "__skip__" && c.id !== "__empty__") counts[c.id] = (counts[c.id] || 0) + 1;
    });
    parts.forEach(function (e) {
      partStitchInstructions(e[1], (project.pattern || [])[e[0]]).forEach(function (ins) {
        if (ins.type === "full") counts[ins.id] = (counts[ins.id] || 0) + 1;
        else if (!(ins.id in counts)) counts[ins.id] = 0;
      });
    });
    return counts;
  }

  // ─── Part stitches (half, quarter, three-quarter) ─────────────────────────
  var PS_QUADS = ["TL", "TR", "BL", "BR"];
  var PS_OPP = { TL: "BR", TR: "BL", BL: "TR", BR: "TL" };

  /**
   * The project's part stitches as [[cellIndex, { TL?, TR?, BL?, BR? }], ...]
   * (from a Map or the saved array), keeping only cells inside the chart
   * with at least one stitched quadrant. [] when there are none.
   */
  function partStitchEntries(project) {
    var src = project && project.partialStitches, out = [];
    if (!src) return out;
    var n = (project.w | 0) * (project.h | 0);
    function add(idx, e) {
      idx = Number(idx);
      if (!e || !Number.isInteger(idx) || idx < 0 || (n && idx >= n)) return;
      if (PS_QUADS.some(function (q) { return e[q] && e[q].id != null; })) out.push([idx, e]);
    }
    if (Array.isArray(src)) src.forEach(function (p) { if (p) add(p[0], p[1]); });
    else if (typeof src.forEach === "function") src.forEach(function (v, k) { add(k, v); });
    return out;
  }

  /**
   * What to draw in a cell with part stitches, as the chart on screen does
   * (helpers.js analysePartialStitches): a quadrant without a part stitch
   * takes the cell's full stitch, if any. Returns, largest first,
   *   { type: "full", id, rgb }                         all four the same
   *   { type: "threeQuarter", id, rgb, emptyCorner }    three the same
   *   { type: "half", id, rgb, dir: "fwd" | "bck" }     a diagonal pair: / or \
   *   { type: "quarter", id, rgb, corner }              anything left
   */
  function partStitchInstructions(ps, base) {
    var b = base && base.id && base.id !== "__skip__" && base.id !== "__empty__" ? base : null;
    var filled = {}, groups = {}, order = [];
    PS_QUADS.forEach(function (q) {
      var src = (ps && ps[q] && ps[q].id != null) ? ps[q] : b;
      if (!src) return;
      filled[q] = src;
      var id = String(src.id);
      if (!groups[id]) { groups[id] = { src: src, corners: [] }; order.push(id); }
      groups[id].corners.push(q);
    });
    var out = [], handled = {};
    function take(id, extra) {
      var g = groups[id];
      g.corners.forEach(function (q) { handled[q] = true; });
      out.push(Object.assign({ id: id, rgb: g.src.rgb || [128, 128, 128] }, extra));
    }
    order.forEach(function (id) {
      var c = groups[id].corners;
      if (c.length === 4) take(id, { type: "full" });
      else if (c.length === 3) take(id, { type: "threeQuarter", emptyCorner: PS_QUADS.filter(function (q) { return c.indexOf(q) === -1; })[0] });
    });
    order.forEach(function (id) {
      var c = groups[id].corners;
      if (c.length !== 2 || handled[c[0]]) return;
      var key = c.slice().sort().join(",");
      if (key === "BL,TR") take(id, { type: "half", dir: "fwd" });
      else if (key === "BR,TL") take(id, { type: "half", dir: "bck" });
    });
    PS_QUADS.forEach(function (q) {
      if (handled[q] || !filled[q]) return;
      out.push({ type: "quarter", id: String(filled[q].id), rgb: filled[q].rgb || [128, 128, 128], corner: q });
    });
    return out;
  }

  /**
   * Where each part stitch's symbol goes, as fractions of the cell from its
   * top-left (x right, y down), and its size (fraction of the cell). Drawn
   * as charting software draws them (and the importer reads them,
   * pdf-importer.js fractionalShape): a 3/4 stitch covers the half of the
   * cell on its side of a diagonal, a 1/4 the small triangle from its corner
   * to the middles of its two sides. Each symbol sits at the centre of its
   * triangle, the biggest spot clear of the lines. A half stitch is its
   * stitch line: its symbol sits in an open corner beside the line, or,
   * where two half stitches cross, in the wedges either side.
   */
  var PS_TRI = { TL: [0.293, 0.293], TR: [0.707, 0.293], BL: [0.293, 0.707], BR: [0.707, 0.707] };
  var PS_SMALL = { TL: [0.146, 0.146], TR: [0.854, 0.146], BL: [0.146, 0.854], BR: [0.854, 0.854] };
  function partStitchSymbolSpots(instructions) {
    var spots = [], taken = [];
    function free(p) { return !taken.some(function (t) { return Math.abs(t[0] - p[0]) < 0.2 && Math.abs(t[1] - p[1]) < 0.2; }); }
    function put(i, p, size) { spots[i] = { x: p[0], y: p[1], size: size }; taken.push(p); }
    var halves = instructions.filter(function (ins) { return ins.type === "half"; });
    var crossing = halves.length === 2 && halves[0].dir !== halves[1].dir;
    instructions.forEach(function (ins, i) {
      if (ins.type === "threeQuarter") put(i, PS_TRI[PS_OPP[ins.emptyCorner]], 0.44);
      else if (ins.type === "quarter") put(i, PS_SMALL[ins.corner], 0.28);
      else if (ins.type === "full") put(i, [0.5, 0.5], 0.78);
    });
    instructions.forEach(function (ins, i) {
      if (ins.type !== "half") return;
      if (crossing) { put(i, ins.dir === "fwd" ? [0.17, 0.5] : [0.83, 0.5], 0.28); return; }
      var options = ins.dir === "fwd" ? [PS_TRI.TL, PS_TRI.BR] : [PS_TRI.TR, PS_TRI.BL];
      put(i, options.filter(free)[0] || [0.5, 0.5], 0.34);
    });
    return spots;
  }

  /**
   * The part stitch covering a point of the cell (fractions from its top-
   * left), for the colour a symbol sits on: a 3/4 stitch covers the half of
   * the cell on its side of a diagonal, a 1/4 the small triangle in its
   * corner. Null for bare fabric.
   */
  function partStitchAt(instructions, fx, fy) {
    var hit = null;
    instructions.forEach(function (ins) {
      var q = ins.type === "threeQuarter" ? PS_OPP[ins.emptyCorner] : ins.type === "quarter" ? ins.corner : null;
      if (!q) return;
      var u = q === "TL" || q === "BL" ? fx : 1 - fx;     // distance from the corner's sides
      var v = q === "TL" || q === "TR" ? fy : 1 - fy;
      if (u + v < (ins.type === "quarter" ? 0.5 : 1)) hit = ins;
    });
    return hit;
  }

  /** Part stitches per thread: { id: { threeQuarter, half, quarter } }. */
  function partStitchCounts(project) {
    var out = Object.create(null);
    partStitchEntries(project).forEach(function (e) {
      partStitchInstructions(e[1], (project.pattern || [])[e[0]]).forEach(function (ins) {
        if (ins.type === "full") return;
        var t = out[ins.id] || (out[ins.id] = { threeQuarter: 0, half: 0, quarter: 0 });
        t[ins.type]++;
      });
    });
    return out;
  }

  /** "42 ¾, 12 ½, 3 ¼" for a thread's part stitches. */
  function partStitchLabel(c) {
    if (!c) return "";
    var bits = [];
    if (c.threeQuarter) bits.push(c.threeQuarter + " \u00BE");
    if (c.half) bits.push(c.half + " \u00BD");
    if (c.quarter) bits.push(c.quarter + " \u00BC");
    return bits.join(", ");
  }

  function legendRowsPerPage(geom) {
    return Math.min(32, Math.floor((mmToPt(geom.pageHmm - 2 * geom.marginMm) - 52) / 18));
  }

  // A single plan drives the preview and the worker's progress totals.
  function planExport(project, opts) {
    validateOptions(opts);
    if (!project || !Number.isInteger(project.w) || !Number.isInteger(project.h) || project.w < 1 || project.h < 1) throw new Error("PDF chart dimensions must be positive whole stitches.");
    var geom = computePageGeometry(opts);
    var pages = paginate({patternW: project.w, patternH: project.h, colsPerPage: geom.colsPerPage,
      rowsPerPage: geom.rowsPerPage, overlap: opts.overlap});
    var n = Object.keys(usedThreadCounts(project)).length;
    var rows = legendRowsPerPage(geom);
    var legends = opts.includeLegend === false ? 0 : Math.max(1, Math.ceil(n / rows));
    if (legends && opts.theme === "workshop" && project.knots && project.knots.length) {
      var knotThreads = new Set(project.knots.map(function (k) { return k.id; })).size;
      var lastRows = n - (legends - 1) * rows;
      var remaining = mmToPt(geom.pageHmm - 2 * geom.marginMm) - 52 - lastRows * 18 - 14;
      // Match the worker: keep a short knot key together, otherwise paginate it.
      if (remaining - (knotThreads + 1) * 18 < 0) {
        var knotRows = Math.floor((mmToPt(geom.pageHmm - 2 * geom.marginMm) - 40) / 18) + 1;
        legends += Math.ceil(knotThreads / knotRows);
      }
    }
    var charts = pages.length * (opts.chartModes || ["bw"]).length;
    var index = opts.includeIndex && pages.length > 1 ? 1 : 0;
    return {geom: geom, pages: pages, legendPages: legends, chartPages: charts, indexPages: index,
      totalPages: charts + legends + index + (opts.includeCover ? 1 : 0) + (opts.includeInfo ? 1 : 0)};
  }

  /**
   * Build a deterministic palette → codepoint map.
   *
   * Sort order:
   *   1. solid threads first (sorted numerically by id where possible, else lexically),
   *   2. then blends (sorted lexically by id).
   *
   * Only used IDs consume capacity when supplied by the export worker.
   * Editor symbol overrides belong to the screen font; PDFs deliberately use
   * this embedded font's deterministic assignment instead (see in-app help).
   * Never wrap: a monochrome chart must identify every thread unambiguously.
   */
  function buildCodepointMap(palette, spec, usedIds) {
    if (!spec || !spec.glyphs || !spec.glyphs.length) {
      throw new Error("PDF symbol font specification is missing or empty.");
    }
    var capacity = spec.glyphs.length;
    var seen = Object.create(null);
    var solids = [], blends = [];
    palette.forEach(function (e) {
      if (!e || !e.id) return;
      if (e.id === "__skip__" || e.id === "__empty__") return;
      if (usedIds && !Object.prototype.hasOwnProperty.call(usedIds, e.id)) return;
      if (seen[e.id]) return;
      seen[e.id] = true;
      if (e.type === "blend") blends.push(e); else solids.push(e);
    });
    function numericKey(id) {
      var m = String(id).match(LEADING_DIGITS);
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    }
    solids.sort(function (a, b) {
      var ka = numericKey(a.id), kb = numericKey(b.id);
      if (ka !== kb) return ka - kb;
      return String(a.id).localeCompare(String(b.id));
    });
    blends.sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); });

    var map = Object.create(null);
    var ordered = solids.concat(blends);
    if (usedIds) Object.keys(usedIds).forEach(function (id) {
      if (!seen[id]) throw new Error("PDF export: used thread " + id + " is missing from the palette.");
    });
    if (ordered.length > capacity) {
      throw new Error("PDF export needs " + ordered.length + " distinct symbols; the verified capacity is " + capacity + ". Reduce the used threads or blends before exporting.");
    }
    for (var i = 0; i < ordered.length; i++) {
      map[ordered[i].id] = spec.glyphs[i].codepoint;
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

  /**
   * UX-12 PR #14 — colour palette for chart pages, gated by `theme`.
   *
   * theme === 'workshop' opts the user into the Workshop print theme:
   *   - majorGrid: terracotta (matches in-app --accent ≈ rgb(184,92,56))
   *   - pageBg:    linen      (rgb(251,248,243))
   *
   * theme === 'pk' (default, or any other value) returns NULL for both
   * channels so callers fall through to their existing legacy literals
   * — guaranteeing the PK-compat path is bit-identical to today.
   */
  function themeColors(theme) {
    if (theme === "workshop") {
      return {
        majorGrid: [0.722, 0.361, 0.220], // terracotta
        pageBg:    [0.984, 0.973, 0.953], // linen
      };
    }
    // pk / default: signal "do not change anything"
    return { majorGrid: null, pageBg: null };
  }

  var api = {
    validateOptions: validateOptions,
    usedThreadCounts: usedThreadCounts,
    partStitchEntries: partStitchEntries,
    partStitchInstructions: partStitchInstructions,
    partStitchSymbolSpots: partStitchSymbolSpots,
    partStitchAt: partStitchAt,
    partStitchCounts: partStitchCounts,
    partStitchLabel: partStitchLabel,
    legendRowsPerPage: legendRowsPerPage,
    planExport: planExport,
    PAGE_SIZES_MM: PAGE_SIZES_MM,
    mmToPt: mmToPt,
    ptToMm: ptToMm,
    resolvePageSize: resolvePageSize,
    computePageGeometry: computePageGeometry,
    paginate: paginate,
    buildCodepointMap: buildCodepointMap,
    contrastColor: contrastColor,
    themeColors: themeColors,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PdfChartLayout = api;
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
