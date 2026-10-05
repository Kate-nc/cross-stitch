/* import-engine/pipeline/assemble.js — Multi-page chart assembly.
 *
 * Inputs:
 *   pages: array of { cells, grid, pageMarker?, pageNum }
 *   legend: { rows, codes, byGlyph, ... }
 *
 * Strategy:
 *   1. Detect page-coverage markers ("1/4", "2/4", "Page 1 of 4") to learn
 *      tile layout (e.g. 2×2).
 *   2. Edge-overlap fallback: align adjacent tiles by minimising the diff
 *      between the rightmost column of tile A and leftmost column of tile B.
 *   3. Stitch all tiles into a single { width, height, cells } grid.
 */

(function () {
  'use strict';

  // Parse "1/4", "2 of 4", "Page 3/8", "page 2 sur 4" → {idx, total}.
  function parsePageMarker(text) {
    if (!text) return null;
    const m = text.match(/(?:page\s*)?(\d+)\s*(?:\/|of|sur|de|von|aus)\s*(\d+)/i);
    if (!m) return null;
    const idx = parseInt(m[1], 10), total = parseInt(m[2], 10);
    if (!isFinite(idx) || !isFinite(total) || total < idx) return null;
    return { idx, total };
  }

  // Infer tile layout from N markers. For total=4 → 2×2; total=2 → 1×2;
  // total=6 → 2×3 or 3×2 (pick by chart aspect ratio).
  function inferTileLayout(total, sampleAspect) {
    if (total <= 1) return { rows: 1, cols: 1 };
    if (total === 2) return sampleAspect > 1 ? { rows: 1, cols: 2 } : { rows: 2, cols: 1 };
    // Find divisor pair closest to sqrt(total).
    const sq = Math.sqrt(total);
    let bestR = 1, bestC = total, bestDiff = Infinity;
    for (let r = 1; r <= total; r++) {
      if (total % r) continue;
      const c = total / r;
      const diff = Math.abs(r - sq) + Math.abs(c - sq);
      if (diff < bestDiff) { bestDiff = diff; bestR = r; bestC = c; }
    }
    return { rows: bestR, cols: bestC };
  }

  /* Assemble pages into a single grid.
   *
   * Each page provides { cells: [{col,row,...}], grid: {cols,rows} } plus, in
   * descending order of trust, one of:
   *   offset: {col,row}  — the page's absolute position, e.g. read from its axis
   *                        rulers (pdf-axis-labels.js). Used verbatim.
   *   marker: {idx,total}— "page 2 of 6" furniture, used only for ORDERING.
   *   nothing            — array order is taken as reading order.
   *
   * `opts`:
   *   layout:  {rows,cols} — an explicit tiling, e.g. confirmed by the user.
   *                          Preferred over inference, which cannot tell a 3x4
   *                          chart from a 4x3 one.
   *   overlap: {cols,rows} — repeated cells at each page break, removed so they
   *                          do not appear twice.
   *
   * Returns { width, height, cells, layout, layoutSource, warnings }.
   */
  function assembleTiles(pages, opts) {
    opts = opts || {};
    const warnings = [];
    const tiles = (pages || []).filter(p => p.cells && p.cells.length);
    if (!tiles.length) {
      return { width: 0, height: 0, cells: [], layout: null, layoutSource: 'none', warnings };
    }

    // Explicit per-page offsets need no layout inference at all: every page
    // already knows where it belongs, so remainder pages, unusual page order and
    // page-break overlap all resolve correctly by construction.
    if (tiles.every(t => t.offset && isFinite(t.offset.col) && isFinite(t.offset.row))) {
      return placeCells(tiles.map(t => ({
        tile: t, offsetCol: t.offset.col, offsetRow: t.offset.row,
      })), { rows: 0, cols: 0 }, 'offsets', warnings);
    }

    if (tiles.length === 1) {
      const t = tiles[0];
      return {
        width: t.grid.cols, height: t.grid.rows, cells: t.cells,
        layout: { rows: 1, cols: 1 }, layoutSource: 'single', warnings,
      };
    }

    /* Order the tiles. A page marker is a reliable ORDER but an unreliable
     * COUNT: "page 3 of 38" counts every sheet in the PDF — covers, legends,
     * instructions — not the chart tiles. Taking its total as the tile count is
     * how a 36-tile chart in a 38-page file gets read as a 2x19 grid, so the
     * count always comes from the tiles actually handed to us and the marker is
     * only cross-checked against it. */
    const withMarker = tiles.filter(t => t.marker);
    const total = tiles.length;
    let ordered = tiles;
    if (withMarker.length === tiles.length) {
      ordered = tiles.slice().sort((a, b) => a.marker.idx - b.marker.idx);
      const claimed = withMarker[0].marker.total;
      if (claimed !== total) {
        warnings.push('Page markers claim ' + claimed + ' pages but ' + total +
          ' chart tiles were extracted; using the tile count. The extra pages are ' +
          'probably covers or legends.');
      }
    } else if (withMarker.length) {
      warnings.push('Only ' + withMarker.length + ' of ' + tiles.length +
        ' tiles carry a page marker; falling back to document order.');
    }

    let layout, layoutSource;
    if (opts.layout && opts.layout.rows > 0 && opts.layout.cols > 0) {
      layout = { rows: opts.layout.rows, cols: opts.layout.cols };
      layoutSource = 'explicit';
      if (layout.rows * layout.cols < total) {
        warnings.push('The given ' + layout.cols + 'x' + layout.rows +
          ' layout has fewer cells than the ' + total + ' tiles to place.');
      }
    } else {
      const sampleAspect = tiles[0].grid.cols / Math.max(1, tiles[0].grid.rows);
      layout = inferTileLayout(total, sampleAspect);
      layoutSource = 'inferred';
      // Inference picks the divisor pair nearest square, so it cannot distinguish
      // 3x4 from 4x3 and has no way to express a non-rectangular tiling. Say so,
      // rather than presenting a guess as a reading.
      warnings.push('Page layout was inferred as ' + layout.cols + ' across x ' +
        layout.rows + ' down from ' + total + ' tiles. Confirm this if the chart ' +
        'looks wrong — the page count alone cannot distinguish ' + layout.cols +
        'x' + layout.rows + ' from ' + layout.rows + 'x' + layout.cols + '.');
    }

    /* Place tiles on a grid whose columns and rows size themselves to their
     * widest and tallest member. Assuming every tile matches the first one
     * misplaces every page after a short tile — and short tiles are the norm, not
     * the exception: the right-hand column and bottom row of almost every
     * multi-page chart are remainders. */
    const cols = Math.max(1, layout.cols);
    const colWidth = [], rowHeight = [];
    for (let i = 0; i < ordered.length; i++) {
      const tc = i % cols, tr = Math.floor(i / cols);
      const w = (ordered[i].grid && ordered[i].grid.cols) || 0;
      const h = (ordered[i].grid && ordered[i].grid.rows) || 0;
      if (!(colWidth[tc] > w)) colWidth[tc] = w;
      if (!(rowHeight[tr] > h)) rowHeight[tr] = h;
    }

    const overlapCols = Math.max(0, (opts.overlap && opts.overlap.cols) || 0);
    const overlapRows = Math.max(0, (opts.overlap && opts.overlap.rows) || 0);

    const colOffset = [], rowOffset = [];
    let acc = 0;
    for (let c = 0; c < colWidth.length; c++) {
      colOffset[c] = acc;
      acc += (colWidth[c] || 0) - overlapCols;
    }
    acc = 0;
    for (let r = 0; r < rowHeight.length; r++) {
      rowOffset[r] = acc;
      acc += (rowHeight[r] || 0) - overlapRows;
    }

    const placements = ordered.map(function (tile, i) {
      return {
        tile: tile,
        offsetCol: colOffset[i % cols] || 0,
        offsetRow: rowOffset[Math.floor(i / cols)] || 0,
      };
    });
    return placeCells(placements, layout, layoutSource, warnings);
  }

  /* Shift each tile's cells by its offset and merge. Where two tiles cover the
   * same cell — which is exactly what page-break overlap produces — the
   * better-matched reading wins. */
  function placeCells(placements, layout, layoutSource, warnings) {
    const byKey = new Map();
    let maxCol = -1, maxRow = -1;
    for (const p of placements) {
      for (const c of p.tile.cells) {
        const col = c.col + p.offsetCol;
        const row = c.row + p.offsetRow;
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
        const k = col + ',' + row;
        const prev = byKey.get(k);
        if (!prev || (c.matchConfidence || 0) > (prev.matchConfidence || 0)) {
          byKey.set(k, Object.assign({}, c, { col: col, row: row }));
        }
      }
    }
    return {
      width: maxCol + 1,
      height: maxRow + 1,
      cells: Array.from(byKey.values()),
      layout: layout,
      layoutSource: layoutSource,
      warnings: warnings,
    };
  }

  // Edge-overlap detection: compute average colour distance between the
  // rightmost `overlap` cols of tile A and the leftmost `overlap` cols of B.
  function edgeOverlapScore(tileA, tileB, overlap, axis /* 'horizontal'|'vertical' */) {
    if (!tileA || !tileB || !tileA.cells || !tileB.cells) return Infinity;
    const a = new Map(), b = new Map();
    if (axis === 'horizontal') {
      const aMax = tileA.grid.cols - 1;
      for (const c of tileA.cells) {
        if (c.col >= aMax - overlap + 1) a.set(`${c.col - (aMax - overlap + 1)},${c.row}`, c.color);
      }
      for (const c of tileB.cells) {
        if (c.col < overlap) b.set(`${c.col},${c.row}`, c.color);
      }
    } else {
      const aMax = tileA.grid.rows - 1;
      for (const c of tileA.cells) {
        if (c.row >= aMax - overlap + 1) a.set(`${c.col},${c.row - (aMax - overlap + 1)}`, c.color);
      }
      for (const c of tileB.cells) {
        if (c.row < overlap) b.set(`${c.col},${c.row}`, c.color);
      }
    }
    let total = 0, n = 0;
    for (const [k, ca] of a) {
      const cb = b.get(k);
      if (!cb) continue;
      const dr = ca[0] - cb[0], dg = ca[1] - cb[1], db = ca[2] - cb[2];
      total += Math.sqrt(dr * dr + dg * dg + db * db);
      n++;
    }
    return n ? total / n : Infinity;
  }

  /* Search for the page-break overlap between two adjacent tiles.
   *
   * Charts commonly repeat two or three rows/columns at a page break so the
   * stitcher can find their place across the join. Laid out side by side those
   * repeats are not wanted, and assuming zero leaves them duplicated — widening
   * the finished chart and doubling a band of stitches.
   *
   * Scores each candidate width by how closely the overlapping bands agree and
   * takes the best, requiring it to be clearly better than no overlap at all so
   * a chart printed without repeats is left alone.
   *
   * Returns { overlap, score } with overlap 0 when nothing scores convincingly.
   */
  function bestOverlap(tileA, tileB, axis, maxOverlap) {
    const limit = Math.max(0, maxOverlap === undefined ? 5 : maxOverlap);
    let best = 0, bestScore = Infinity;
    for (let k = 1; k <= limit; k++) {
      const score = edgeOverlapScore(tileA, tileB, k, axis);
      if (!isFinite(score)) continue;
      // Lowest score wins. A genuine repeat lines up only at its true width —
      // narrower or wider, the compared bands are offset and disagree — so the
      // minimum is the answer; on an exact tie the narrower width is kept.
      if (score < bestScore - 1e-9) { bestScore = score; best = k; }
    }
    // A genuine repeat is near-identical. Anything less is coincidence.
    if (!isFinite(bestScore) || bestScore > 12) return { overlap: 0, score: bestScore };
    return { overlap: best, score: bestScore };
  }

  const api = { parsePageMarker, inferTileLayout, assembleTiles, edgeOverlapScore, bestOverlap };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
