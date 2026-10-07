/* pdf-axis-labels.js — locate each chart page within the finished design by
 * reading its printed axis rulers.
 *
 * Almost every published cross-stitch chart prints column numbers along the top
 * and row numbers down the side, in ABSOLUTE design coordinates. A page whose
 * top ruler reads 56…110 is declaring that it covers columns 56-110 of the
 * finished pattern. Reading that is strictly better than inferring a tiling from
 * the page count, because it:
 *   • needs no assumption about reading order (across-then-down or down-then-across),
 *   • handles remainder pages (a short last column / bottom row) for free,
 *   • makes page-edge overlap self-cancelling — a repeated column resolves to
 *     the same global coordinate instead of being appended twice,
 *   • yields the true finished size rather than a sum of page widths.
 *
 * ── How a ruler is turned into a position ──────────────────────────────────
 * A ruler is a set of numeric labels sharing a baseline, ascending along the
 * axis. Regressing label value against label position gives an affine map
 *
 *     value(pos) = base + pos / pitch
 *
 * where `pitch` is points-per-cell and `base` is the value the ruler projects to
 * position 0. Because every page of a chart shares the same page geometry, the
 * DIFFERENCE between two pages' `base` values is exactly the offset between them
 * in cells — so pages can be placed relative to one another without needing to
 * detect where each page's grid begins. That matters: grid detection on
 * glyph-style charts is unreliable (it misreads page furniture), whereas the
 * ruler is explicit.
 *
 * Verified against TestUploads/ (see tests/import/pdfAxisLabels.test.js):
 *   • gen-3-extended-pattern-colour.pdf (KG-Chart, 38pp): 36 chart pages resolve
 *     to a 6x6 tiling of a 309x467 design, including a 34-wide remainder column
 *     and a 67-tall remainder row. Page-count inference would have given 2x19.
 *   • gen1.pdf (Nitro Pro, 13pp): 12 chart pages resolve to 3x4 of 250x450, with
 *     rulers that label only multiples of ten and never the page's own first
 *     column — the case that defeats reading label extremes directly.
 *
 * Standalone by design: tracker-app.js drives pdf-importer.js directly via
 * loadPdfStack() with no import engine present, so this must not depend on
 * window.ImportEngine. Attaches to window.PdfAxisLabels; CommonJS-exported too.
 */

(function () {
  'use strict';

  // A ruler needs enough labels to be a deliberate scale rather than stray
  // digits in the artwork. Charts label every 5th or 10th cell, so even a narrow
  // page carries several.
  var MIN_RUN = 4;

  // "Sits on the same baseline", in points. Labels are typeset together, so this
  // can be tight; loosening it starts pulling in body text.
  var ALIGN_TOL = 1.5;

  function textOf(item) {
    var s = item && (item.str !== undefined ? item.str : item.s);
    return typeof s === 'string' ? s.trim() : '';
  }

  // A candidate label is a bare 1-4 digit integer. Leading zeros, punctuation
  // and letters mean page furniture or a thread code, not a scale.
  function asLabelValue(s) {
    if (!/^[1-9]\d{0,3}$/.test(s)) return null;
    return parseInt(s, 10);
  }

  /* Group numeric items into runs sharing a near-constant cross-axis coordinate,
   * keeping only those whose values ascend along the axis. `keyFn` picks the
   * cross-axis coordinate, `posFn` the along-axis one. */
  function findRuns(items, keyFn, posFn, minRun) {
    var need = minRun || MIN_RUN;
    var buckets = [];
    for (var i = 0; i < items.length; i++) {
      var v = asLabelValue(textOf(items[i]));
      if (v === null) continue;
      var key = keyFn(items[i]);
      var placed = false;
      for (var b = 0; b < buckets.length; b++) {
        if (Math.abs(buckets[b].key - key) <= ALIGN_TOL) {
          buckets[b].members.push({ v: v, pos: posFn(items[i]), item: items[i] });
          placed = true;
          break;
        }
      }
      if (!placed) buckets.push({ key: key, members: [{ v: v, pos: posFn(items[i]), item: items[i] }] });
    }

    var runs = [];
    for (var j = 0; j < buckets.length; j++) {
      var m = buckets[j].members;
      if (m.length < need) continue;
      m.sort(function (a, b) { return a.pos - b.pos; });
      var ascending = true;
      for (var k = 1; k < m.length; k++) {
        if (m[k].v <= m[k - 1].v) { ascending = false; break; }
      }
      if (!ascending) continue;
      runs.push({
        key: buckets[j].key,
        values: m.map(function (e) { return e.v; }),
        positions: m.map(function (e) { return e.pos; }),
        items: m.map(function (e) { return e.item; }),
      });
    }
    // Longest run first — the real scale beats an accidental ascending pair.
    runs.sort(function (a, b) { return b.values.length - a.values.length; });
    return runs;
  }

  /* Regress value against position. A genuine ruler is near-perfectly linear;
   * an ascending sequence that happens to appear inside the artwork is not.
   * Returns { pitch, base, maxResidual } in cells, or null if not ruler-like. */
  function fitRuler(values, positions, minRun, expectPitch) {
    var n = values.length;
    if (n < (minRun || MIN_RUN)) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      sx += positions[i]; sy += values[i];
      sxx += positions[i] * positions[i];
      sxy += positions[i] * values[i];
    }
    var denom = n * sxx - sx * sx;
    if (Math.abs(denom) < 1e-9) return null;
    var slope = (n * sxy - sx * sy) / denom;       // cells per point
    var intercept = (sy - slope * sx) / n;          // value at position 0
    if (!isFinite(slope) || slope <= 0) return null;

    // Every label must sit within half a cell of the fit, or this is not a ruler.
    var maxResidual = 0;
    for (var k = 0; k < n; k++) {
      var r = Math.abs(slope * positions[k] + intercept - values[k]);
      if (r > maxResidual) maxResidual = r;
    }
    if (maxResidual > 0.5) return null;
    // With only two or three labels the residual test proves little, so a
    // short ruler must also agree with the pitch the rest of the chart uses.
    if (expectPitch > 0 && Math.abs((1 / slope) / expectPitch - 1) > 0.03) return null;

    return { pitch: 1 / slope, base: intercept, maxResidual: maxResidual, count: n };
  }

  /* The labelling stride — how many cells apart the printed labels sit. Taken as
   * the most common gap across every ruler, so an irregular end label (charts
   * often print the page's own first and last cell alongside the round numbers)
   * does not shift it. Returns 0 when there is no consistent gap. */
  function modalStride(valueLists) {
    var counts = {};
    for (var i = 0; i < valueLists.length; i++) {
      var vals = valueLists[i];
      if (!vals) continue;
      for (var j = 1; j < vals.length; j++) {
        var d = vals[j] - vals[j - 1];
        if (d > 0) counts[d] = (counts[d] || 0) + 1;
      }
    }
    var best = 0, bestN = 0;
    for (var k in counts) {
      if (counts[k] > bestN) { bestN = counts[k]; best = parseInt(k, 10); }
    }
    return best;
  }

  function labelsOf(run) {
    return run.values.map(function (v, i) {
      var it = run.items[i] || {};
      return { value: v, x: it.x, y: it.y, width: it.width || 0, height: it.height || 0, rotated: !!it.rotated };
    });
  }

  /* Read one page's rulers.
   *
   * `textItems` is [{ str|s, x, y }, ...]. Set `yDown: true` when y grows
   * downward (pdf.js viewport space — what pdf-importer.js produces); leave it
   * false for raw PDF user space where y grows upward.
   *
   * Returns { h, v, firstLabelCol, lastLabelCol, firstLabelRow, lastLabelRow,
   *           confidence } or null when either axis has no ruler. `h`/`v` are
   * the fits; `base` on each is what positions pages relative to one another. */
  function readPageRulers(textItems, opts) {
    opts = opts || {};
    if (!textItems || !textItems.length) return null;
    var yDown = !!opts.yDown;

    var minRun = opts.minRun || MIN_RUN;
    var hRuns = findRuns(textItems, function (i) { return i.y; }, function (i) { return i.x; }, minRun);
    // Row numbers ascend DOWN the page: increasing y in viewport space,
    // decreasing y in PDF user space. They are usually aligned against the
    // grid, so a right-aligned column of '70', '80', '90', '100' shares a right
    // edge but not a left one; grouping only by left edge split it into runs
    // too short to count. Try each alignment and keep whatever reads best.
    var vPos = function (i) { return yDown ? i.y : -i.y; };
    var vRuns = [].concat(
      findRuns(textItems, function (i) { return i.x; }, vPos, minRun),
      findRuns(textItems, function (i) { return i.x + (i.width || 0); }, vPos, minRun),
      findRuns(textItems, function (i) { return i.x + (i.width || 0) / 2; }, vPos, minRun)
    ).sort(function (a, b) { return b.values.length - a.values.length; });

    var h = null, v = null, hRun = null, vRun = null;
    for (var a = 0; a < hRuns.length && !h; a++) {
      h = fitRuler(hRuns[a].values, hRuns[a].positions, minRun, opts.expectPitchX);
      if (h) hRun = hRuns[a];
    }
    for (var b = 0; b < vRuns.length && !v; b++) {
      v = fitRuler(vRuns[b].values, vRuns[b].positions, minRun, opts.expectPitchY);
      if (v) vRun = vRuns[b];
    }
    if (!h || !v) {
      // A caller placing a page by other means can use one axis on its own:
      // the last page of each row often prints row numbers only, its few
      // columns holding no multiple of ten (MacStitch, 9 columns of 299).
      if (!opts.allowOneAxis || (!h && !v)) return null;
      return {
        h: h, v: v, oneAxis: true,
        colValues: h ? hRun.values : [], rowValues: v ? vRun.values : [],
        colLabels: h ? labelsOf(hRun) : [], rowLabels: v ? labelsOf(vRun) : [],
        firstLabelRow: v ? vRun.values[0] : null, lastLabelRow: v ? vRun.values[vRun.values.length - 1] : null,
        firstLabelCol: h ? hRun.values[0] : null, lastLabelCol: h ? hRun.values[hRun.values.length - 1] : null,
        confidence: 0.4,
      };
    }

    // Confidence rises with the evidence on the weaker axis. Charts typically
    // print 6-10 labels per axis per page; treat 8 as full marks.
    var evidence = Math.min(h.count, v.count);
    var confidence = Math.max(0.4, Math.min(0.97, 0.5 + (evidence - MIN_RUN) * 0.08));

    return {
      h: h,
      v: v,
      firstLabelCol: hRun.values[0],
      lastLabelCol: hRun.values[hRun.values.length - 1],
      firstLabelRow: vRun.values[0],
      lastLabelRow: vRun.values[vRun.values.length - 1],
      colValues: hRun.values,
      rowValues: vRun.values,
      // The labels themselves, so a caller holding a measured grid can place
      // each one in a column by its centre instead of trusting the fit's
      // intercept (see readRulerLayout in pdf-importer.js).
      colLabels: labelsOf(hRun),
      rowLabels: labelsOf(vRun),
      confidence: confidence,
    };
  }

  /* Place a set of pages relative to one another from their rulers.
   *
   * `pages` is [{ pageIndex, textItems }] and should contain CHART pages only —
   * a cover or legend page has no ruler and is reported with offsets === null.
   *
   * Returns:
   *   {
   *     pages: [{ pageIndex, offsetCol, offsetRow, rulers } | { pageIndex, offsets: null }],
   *     tiling: { across, down } | null,
   *     totalColumns, totalRows,
   *     complete,        // every page placed AND the placements fill the rectangle
   *     warnings: []
   *   }
   *
   * Offsets are 0-based cell positions of each page's leading edge within the
   * design, derived from differences between ruler `base` values — so they are
   * exact even when a ruler never labels its page's own first column. */
  function readLayout(pages, opts) {
    opts = opts || {};
    var warnings = [];
    var read = [];
    for (var i = 0; i < pages.length; i++) {
      read.push({
        pageIndex: pages[i].pageIndex,
        rulers: readPageRulers(pages[i].textItems, opts),
      });
    }

    /* Second pass for pages that did not read. A narrow remainder page — the
     * last column of a chart, say 25 cells wide with a label every ten — prints
     * only two or three column labels, under the four a ruler needs on its own.
     * Left unread it would be dropped from the layout. Once other pages have
     * fixed the chart's cell pitch, two labels that agree with it are enough. */
    var firstPass = read.filter(function (p) { return p.rulers; });
    if (firstPass.length && firstPass.length < read.length) {
      var median = function (xs) { xs = xs.slice().sort(function (a, b) { return a - b; }); return xs[Math.floor(xs.length / 2)]; };
      var pitchX = median(firstPass.map(function (p) { return p.rulers.h.pitch; }));
      var pitchY = median(firstPass.map(function (p) { return p.rulers.v.pitch; }));
      for (var r2 = 0; r2 < read.length; r2++) {
        if (read[r2].rulers) continue;
        var retry = readPageRulers(pages[r2].textItems, {
          yDown: opts.yDown, minRun: 2, expectPitchX: pitchX, expectPitchY: pitchY,
        });
        if (retry) { retry.shortRuler = true; read[r2].rulers = retry; }
      }
    }

    var placed = read.filter(function (p) { return p.rulers; });
    if (!placed.length) {
      return {
        pages: read.map(function (p) { return { pageIndex: p.pageIndex, offsets: null }; }),
        tiling: null, totalColumns: 0, totalRows: 0, complete: false,
        warnings: ['No axis rulers found on any chart page.'],
      };
    }

    /* Each page's ruler is already expressed in absolute design coordinates, so
     * its fit is used as-is rather than being normalised against the other
     * pages. That matters for remainder pages: a short last column is often
     * laid out at a different x on the sheet than the full-width pages
     * (gen-3 puts it at x=247 instead of x=148), so any scheme that assumes a
     * shared page geometry misplaces it. Mapping each page through its own
     * ruler is immune to where the chart sits on the paper. */
    var out = [];
    var colGroups = {}, rowGroups = {};
    for (var k = 0; k < read.length; k++) {
      var r = read[k].rulers;
      if (!r) { out.push({ pageIndex: read[k].pageIndex, offsets: null }); continue; }
      // Pages sharing a column of the tiling share a ruler origin; rounding to
      // whole cells makes that an exact grouping key.
      var colGroup = Math.round(r.h.base);
      var rowGroup = Math.round(r.v.base);
      colGroups[colGroup] = true;
      rowGroups[rowGroup] = true;
      out.push({
        pageIndex: read[k].pageIndex,
        offsets: {
          // Affine maps from page position to absolute design cell. A cell whose
          // centre sits at page x belongs to column
          //   Math.round(colBase + x / pitchX)
          // and likewise for rows. 1-based, matching the printed labels.
          pitchX: r.h.pitch,
          pitchY: r.v.pitch,
          colBase: r.h.base,
          rowBase: r.v.base,
          // Which column/row of the page tiling this page occupies.
          colGroup: colGroup,
          rowGroup: rowGroup,
          firstLabelCol: r.firstLabelCol,
          lastLabelCol: r.lastLabelCol,
          firstLabelRow: r.firstLabelRow,
          lastLabelRow: r.lastLabelRow,
          colLabels: r.colLabels,
          rowLabels: r.rowLabels,
          confidence: r.confidence,
        },
      });
    }

    var across = Object.keys(colGroups).length;
    var down = Object.keys(rowGroups).length;

    // Labels are absolute design coordinates, so the largest label on any axis
    // is the finished size — exactly, when the chart labels its own last cell.
    var totalColumns = 0, totalRows = 0;
    for (var m = 0; m < placed.length; m++) {
      if (placed[m].rulers.lastLabelCol > totalColumns) totalColumns = placed[m].rulers.lastLabelCol;
      if (placed[m].rulers.lastLabelRow > totalRows) totalRows = placed[m].rulers.lastLabelRow;
    }

    /* A chart that labels only multiples of ten stops short of its true last
     * column, so the largest label is a lower bound rather than the answer. The
     * two cases are told apart by whether that largest label is itself a
     * multiple of the labelling stride:
     *   • 309 against a stride of 10 — not a multiple, so the designer printed
     *     the real end (gen-3 does this) and the total is exact.
     *   • 250 against a stride of 10 — a multiple, so the ruler probably ran out
     *     before the design did (gen1) and up to stride-1 cells follow.
     * The upper bound lets callers include those trailing cells without
     * inventing blank columns on charts that were already exact. */
    var strideCol = modalStride(placed.map(function (p) { return p.rulers.colValues; }));
    var strideRow = modalStride(placed.map(function (p) { return p.rulers.rowValues; }));
    var totalColumnsMax = (strideCol > 1 && totalColumns % strideCol === 0)
      ? totalColumns + strideCol - 1 : totalColumns;
    var totalRowsMax = (strideRow > 1 && totalRows % strideRow === 0)
      ? totalRows + strideRow - 1 : totalRows;
    // Sanity: the largest label must not fall short of the furthest page's own
    // first labelled cell, or the rulers disagree with themselves.
    var maxFirstCol = 0, maxFirstRow = 0;
    for (var p2 = 0; p2 < placed.length; p2++) {
      if (placed[p2].rulers.firstLabelCol > maxFirstCol) maxFirstCol = placed[p2].rulers.firstLabelCol;
      if (placed[p2].rulers.firstLabelRow > maxFirstRow) maxFirstRow = placed[p2].rulers.firstLabelRow;
    }
    if (totalColumns < maxFirstCol) {
      warnings.push('Column rulers end at ' + totalColumns + ' but a page begins labelling at ' +
        maxFirstCol + '; the finished width may be under-read.');
    }
    if (totalRows < maxFirstRow) {
      warnings.push('Row rulers end at ' + totalRows + ' but a page begins labelling at ' +
        maxFirstRow + '; the finished height may be under-read.');
    }

    var unplaced = read.length - placed.length;
    if (unplaced) {
      warnings.push(unplaced + ' of ' + read.length + ' chart pages carry no readable ruler.');
    }
    if (placed.length !== across * down) {
      warnings.push('Placed ' + placed.length + ' pages but the rulers describe an ' +
        across + 'x' + down + ' grid (' + (across * down) + ' tiles).');
    }

    return {
      pages: out,
      tiling: { across: across, down: down },
      totalColumns: totalColumns,
      totalRows: totalRows,
      // Upper bound on the finished size: equal to total* when the rulers label
      // their own last cell, otherwise total* plus the labelling stride minus one.
      totalColumnsMax: totalColumnsMax,
      totalRowsMax: totalRowsMax,
      strideCol: strideCol,
      strideRow: strideRow,
      complete: unplaced === 0 && placed.length === across * down && !!totalColumns && !!totalRows,
      warnings: warnings,
    };
  }

  var api = {
    readPageRulers: readPageRulers,
    readLayout: readLayout,
    // exposed for tests
    _findRuns: findRuns,
    _fitRuler: fitRuler,
    _modalStride: modalStride,
  };

  if (typeof window !== 'undefined') {
    window.PdfAxisLabels = api;
    // Surface through the import engine too when it is present, so the engine's
    // assemble stage can use the same reader.
    if (window.ImportEngine) {
      window.ImportEngine = Object.assign(window.ImportEngine, {
        readPageRulers: readPageRulers,
        readAxisLayout: readLayout,
      });
    }
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
