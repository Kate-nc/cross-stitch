/* pdf-chart-geometry.js: the arithmetic that places a chart page on the finished design from its printed rulers.
 *
 * chartContentBox bounds a page's chart content (stitched cells and single glyphs, not the sheet, furniture or
 * ruler bands); rulerCellSpan maps that box through a page's ruler onto absolute cells; anchorGridToRuler reads
 * which absolute column and row a measured grid starts at from the ruler's labels; gridFromRuler rebuilds a grid
 * from a ruler alone; samplingGrid picks which of those a placed page is read through. Every function takes its
 * inputs as arguments and returns a result. None reads pdf.js, the DOM, storage or timers, none is asynchronous,
 * and none writes to the pages, grids, rulers or spans it is given (samplingGrid returns the measured grid itself
 * when there is no ruler, as it always has).
 *
 * pdf-importer.js keeps methods of the same names that delegate here, so the vector, scanned and legend paths and
 * anything that reaches the importer's methods are unchanged. Loaded as a plain <script> before pdf-importer.js
 * (after pdf-axis-labels.js, which produces the rulers) by every page that lazy-loads the importer and by
 * import-engine/strategies/pdfGlyphStrategy.js, from sw.js's precache list, and by require() in tests.
 */
(function () {

  /**
   * Give a page's measured grid its absolute position from the ruler labels.
   *
   * Each label is placed in the measured column (or row) under its centre, and
   * the label's value minus that index is a vote for the grid's first column.
   * The most common vote wins, so a stray or misread label cannot move it.
   *
   * Only used when the measured grid agrees with the ruler on cell pitch to
   * within 4% — otherwise the measurement is suspect and the ruler-derived
   * span is used instead.
   *
   * @returns {{colStart,rowStart,columns,rows}|null} 0-based span
   */
  function anchorGridToRuler(grid, ruler, limitCols, limitRows) {
    if (!grid || !ruler || !(grid.cellWidth > 0) || !(grid.cellHeight > 0)) return null;
    if (!ruler.colLabels || !ruler.rowLabels) return null;
    if (Math.abs(grid.cellWidth / ruler.pitchX - 1) > 0.04) return null;
    if (Math.abs(grid.cellHeight / ruler.pitchY - 1) > 0.04) return null;

    /* Publishers place labels two ways, and the two read differently:
     *   centred on its cell — gen-3: label N sits in the middle of cell N;
     *   on a ruled line   — gen1: label N sits on the line that ends cell N
     *                        (the bold tenth line).
     * Taking every label as cell-centred put gen1's tiles a row early, since
     * its row labels sit a hair past the line, in the next cell down. The
     * style is read from the labels themselves: where they sit relative to the
     * cell boundaries, on average. */
    const vote = (labels, centreOf, origin, pitch, count) => {
      const pos = [];
      for (const l of labels) {
        const c = centreOf(l);
        if (isFinite(c)) pos.push({ l, p: (c - origin) / pitch });
      }
      if (!pos.length) return null;
      const offLine = pos.reduce((n, e) => n + Math.abs(e.p - Math.round(e.p)), 0) / pos.length;
      const onLines = offLine < 0.15;
      const tally = new Map();
      for (const e of pos) {
        // The cell a label names: under it, or the one ending at its line.
        const idx = onLines ? Math.round(e.p) - 1 : Math.floor(e.p);
        if (idx < 0 || idx >= count) continue;      // a label outside the grid votes for nothing
        const first = e.l.value - idx;               // 1-based absolute index of column/row 0
        tally.set(first, (tally.get(first) || 0) + 1);
      }
      let best = null, bestN = 0;
      for (const [k, n] of tally) if (n > bestN) { bestN = n; best = k; }
      return bestN >= 2 ? best : null;
    };

    // A label's centre. Rotated labels — gen1 prints its row numbers reading
    // upwards — run along y from their origin, so their length is in width.
    const colCentre = l => l.rotated ? l.x - l.height / 2 : l.x + l.width / 2;
    const rowCentre = l => l.rotated ? l.y - l.width / 2 : l.y - l.height / 2;
    const firstCol = vote(ruler.colLabels, colCentre, grid.originX, grid.cellWidth, grid.columns);
    const firstRow = vote(ruler.rowLabels, rowCentre, grid.originY, grid.cellHeight, grid.rows);
    if (firstCol === null || firstRow === null || firstCol < 1 || firstRow < 1) return null;

    const colStart = firstCol - 1, rowStart = firstRow - 1;
    // The ruler can prove a cell the measurement missed. gen1's bottom pages
    // label row 450, but grid detection found 108 rows there (342-449) — the
    // outermost line of a chart is often its border, drawn differently from
    // the rules inside — so the design imported a row short of the 256 x 450
    // it states. A last label up to two cells past the measured grid extends
    // it; further than that, the measurement is trusted over the ruler.
    const lastCol = Math.max.apply(null, ruler.colLabels.map(l => l.value));
    const lastRow = Math.max.apply(null, ruler.rowLabels.map(l => l.value));
    let cols = grid.columns, rowsN = grid.rows;
    if (lastCol - firstCol + 1 > cols && lastCol - firstCol + 1 - cols <= 2) cols = lastCol - firstCol + 1;
    if (lastRow - firstRow + 1 > rowsN && lastRow - firstRow + 1 - rowsN <= 2) rowsN = lastRow - firstRow + 1;
    const columns = Math.max(1, Math.min(cols, limitCols - colStart));
    const rows = Math.max(1, Math.min(rowsN, limitRows - rowStart));
    return { colStart, rowStart, columns, rows };
  }

  /**
   * Work out which absolute cells a ruler-bearing page covers, by mapping the
   * page's drawable area through the ruler and clamping to cells that exist.
   * Coordinates returned are 0-based; the ruler's own labels are 1-based.
   */
  function rulerCellSpan(page, ruler, limitCols, limitRows) {
    const colAt = (x) => Math.round(ruler.colBase + x / ruler.pitchX);
    const rowAt = (y) => Math.round(ruler.rowBase + y / ruler.pitchY);

    // Bound the span by the chart's CONTENT, not the sheet. Mapping the whole
    // page box in would pull in margins, rulers and headers — which inflates the
    // finished size and shifts every page's start.
    const box = chartContentBox(page, ruler.pitchX, ruler.pitchY);
    const x0 = box ? box.x0 : 0;
    const x1 = box ? box.x1 : (page.width || 612);
    const y0 = box ? box.y0 : 0;
    const y1 = box ? box.y1 : (page.height || 792);

    // Clamp into the design the rulers describe. Labels are 1-based, so there is
    // no column 0 and nothing may extend past the finished size.
    let c0 = Math.min(Math.max(colAt(x0), 1), limitCols);
    let c1 = Math.min(Math.max(colAt(x1), 1), limitCols);
    let r0 = Math.min(Math.max(rowAt(y0), 1), limitRows);
    let r1 = Math.min(Math.max(rowAt(y1), 1), limitRows);
    if (c1 < c0) c1 = c0;
    if (r1 < r0) r1 = r0;
    return {
      colStart: c0 - 1,
      rowStart: r0 - 1,
      columns: c1 - c0 + 1,
      rows: r1 - r0 + 1,
    };
  }

  /**
   * Bounding box of a page's chart content — colour-filled cells and the
   * single-character symbols drawn in them. Multi-character text (titles, ruler
   * labels of two digits or more, page furniture) is excluded, so the box hugs
   * the chart rather than the sheet.
   *
   * Only stitched cells matter: an unstitched margin inside the page's slice
   * carries no data, so a tight box loses nothing and keeps the derived finished
   * size honest.
   *
   * Ruler furniture is kept out as well. gen-3 prints each ruler on a pale
   * band one cell thick running the full length of the chart, with its numbers
   * in white on top; counting the band and the single-digit label "1" as
   * content stretched the sampled grid a column and a row over the rulers,
   * where the band read as 6,499 stitches of DMC 415 and the labels as digits.
   * So a fill one cell thick and twenty or more long is skipped, and a lone
   * digit only counts when it lies among the rest of the content. pitchX and
   * pitchY are optional; without them the band test is skipped.
   *
   * @returns {{x0:number,x1:number,y0:number,y1:number}|null}
   */
  function chartContentBox(page, pitchX, pitchY) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    let seen = 0;
    const digits = [];

    const paths = page.vectorPaths || [];
    const pageW = page.width || 0, pageH = page.height || 0;
    for (let i = 0; i < paths.length; i++) {
      const pa = paths[i];
      if (!pa.fillColor || !pa.points || !pa.points.length) continue;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const pt of pa.points) {
        if (pt.x < bx0) bx0 = pt.x; if (pt.x > bx1) bx1 = pt.x;
        if (pt.y < by0) by0 = pt.y; if (pt.y > by1) by1 = pt.y;
      }
      const bw = bx1 - bx0, bh = by1 - by0;
      // The sheet itself, and anything reaching its edge: MacStitch paints the
      // whole page white, then masks the margins with white strips running to
      // the paper's edge, which put every chart's edge at the paper's. A chart
      // never touches the edge of the sheet.
      if (pageW > 0 && pageH > 0 && bw >= pageW * 0.9 && bh >= pageH * 0.9) continue;
      if (pageW > 0 && pageH > 0 && (bx0 <= 1 || by0 <= 1 || bx1 >= pageW - 1 || by1 >= pageH - 1)) continue;
      // A white backdrop under the grid is paper, not stitches: a white
      // stitch fills one cell, not many. MacStitch lays one under every page's
      // full-size grid, even a page of nine columns.
      const fc = pa.fillColor;
      if (fc[0] >= 245 && fc[1] >= 245 && fc[2] >= 245 && pitchX > 0 && pitchY > 0 &&
          bw > pitchX * 4 && bh > pitchY * 4) continue;
      // A triangle is a ¾ or ¼ stitch only if it has a right angle, two sides
      // along the grid. The arrowheads marking a chart's centre row sit just
      // outside it, with one straight side, and widened the chart by a column.
      if (pa.points.length <= 4) {
        const corners = [];
        for (const pt of pa.points) if (!corners.some(q => Math.abs(q.x - pt.x) < 0.2 && Math.abs(q.y - pt.y) < 0.2)) corners.push(pt);
        if (corners.length === 3) {
          let straight = 0;
          for (let k = 0; k < 3; k++) {
            const a = corners[k], b = corners[(k + 1) % 3];
            if (Math.abs(a.x - b.x) < 0.3 || Math.abs(a.y - b.y) < 0.3) straight++;
          }
          if (straight < 2) continue;
        }
      }
      if (pitchX > 0 && pitchY > 0) {
        if ((bh <= pitchY * 1.5 && bw >= pitchX * 20) || (bw <= pitchX * 1.5 && bh >= pitchY * 20)) continue;
      }
      for (let q = 0; q < pa.points.length; q++) {
        const pt = pa.points[q];
        if (pt.x < x0) x0 = pt.x;
        if (pt.x > x1) x1 = pt.x;
        if (pt.y < y0) y0 = pt.y;
        if (pt.y > y1) y1 = pt.y;
      }
      seen++;
    }

    // Symbols drawn as pictures (readSymbolPictures) fill their cells.
    for (const im of page.images || []) {
      if (!im.pic) continue;
      if (im.x0 < x0) x0 = im.x0;
      if (im.x1 > x1) x1 = im.x1;
      if (im.y0 < y0) y0 = im.y0;
      if (im.y1 > y1) y1 = im.y1;
      seen++;
    }

    const texts = page.textItems || [];
    for (let j = 0; j < texts.length; j++) {
      const t = texts[j];
      const s = (t.str || '').trim();
      // A chart symbol is one glyph. Two-digit ruler labels and prose are not,
      // A lone digit is held back for now: it may be a ruler's "1", or a
      // symbol (gen1 uses digits as symbols).
      if (s.length !== 1) continue;
      const cy = t.y - (t.height || 0) / 2;
      if (/^\d$/.test(s)) { digits.push({ x: t.x, cy }); continue; }
      if (t.x < x0) x0 = t.x;
      if (t.x > x1) x1 = t.x;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      seen++;
    }

    // A digit counts as content only if it falls within what everything else
    // already marks out as the chart. A ruler's "1" sits outside, on its band;
    // a digit symbol sits among the other symbols. With nothing else to go by,
    // every digit counts.
    const haveBox = seen > 0 && isFinite(x0) && isFinite(y0);
    const slackX = pitchX > 0 ? pitchX : 0, slackY = pitchY > 0 ? pitchY : 0;
    for (const d of digits) {
      if (haveBox && (d.x < x0 - slackX || d.x > x1 + slackX || d.cy < y0 - slackY || d.cy > y1 + slackY)) continue;
      if (d.x < x0) x0 = d.x;
      if (d.x > x1) x1 = d.x;
      if (d.cy < y0) y0 = d.cy;
      if (d.cy > y1) y1 = d.cy;
      seen++;
    }

    if (!seen || !isFinite(x0) || !isFinite(y0)) return null;
    return { x0, y0, x1, y1 };
  }

  /**
   * The grid to read a placed page through: the measured grid when the ruler
   * anchored it (trimmed to the design's extent), the ruler-derived grid when
   * only the ruler could be trusted, and otherwise the measured grid as is.
   */
  function samplingGrid(pInfo) {
    if (pInfo.ruler && pInfo.anchoredToGrid && pInfo.rulerSpan) {
      return Object.assign({}, pInfo.grid, { columns: pInfo.rulerSpan.columns, rows: pInfo.rulerSpan.rows });
    }
    if (pInfo.ruler) return gridFromRuler(pInfo.ruler, pInfo.rulerSpan, pInfo.grid);
    return pInfo.grid;
  }

  /**
   * Build a cell grid from a page's axis rulers. The ruler gives the pitch
   * directly and, with the page's absolute span, fixes the origin: the cell for
   * absolute column N starts where the ruler projects N.
   *
   * `fallback` supplies boldLineInterval only — its geometry is what we are
   * replacing.
   */
  function gridFromRuler(ruler, span, fallback) {
    // x of the leading edge of absolute column `col` (1-based), inverting
    // col = colBase + x / pitch.
    const xOfCol = (col) => (col - ruler.colBase) * ruler.pitchX;
    const yOfRow = (row) => (row - ruler.rowBase) * ruler.pitchY;
    return {
      originX: xOfCol(span.colStart + 1) - ruler.pitchX / 2,
      originY: yOfRow(span.rowStart + 1) - ruler.pitchY / 2,
      cellWidth: ruler.pitchX,
      cellHeight: ruler.pitchY,
      columns: span.columns,
      rows: span.rows,
      boldLineInterval: (fallback && fallback.boldLineInterval) || 10,
    };
  }

  var api = {
    chartContentBox: chartContentBox, rulerCellSpan: rulerCellSpan, anchorGridToRuler: anchorGridToRuler,
    gridFromRuler: gridFromRuler, samplingGrid: samplingGrid
  };

  if (typeof window !== 'undefined') window.PdfChartGeometry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
