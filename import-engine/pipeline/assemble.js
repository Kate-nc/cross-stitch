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

  // Assemble pages into a single grid. Each page object provides:
  //   { cells: [{col,row,...}], grid: {cols,rows}, marker: {idx,total} }
  // Returns { width, height, cells }.
  function assembleTiles(pages) {
    const tiles = pages.filter(p => p.cells && p.cells.length);
    if (!tiles.length) return { width: 0, height: 0, cells: [] };
    if (tiles.length === 1) {
      const t = tiles[0];
      return { width: t.grid.cols, height: t.grid.rows, cells: t.cells };
    }
    // Sort by page marker if available.
    const withMarker = tiles.filter(t => t.marker);
    const total = withMarker.length ? withMarker[0].marker.total : tiles.length;
    const sampleAspect = tiles[0].grid.cols / Math.max(1, tiles[0].grid.rows);
    const layout = inferTileLayout(total, sampleAspect);
    const ordered = withMarker.length === total
      ? withMarker.slice().sort((a, b) => a.marker.idx - b.marker.idx)
      : tiles;

    const tileWidth = ordered[0].grid.cols;
    const tileHeight = ordered[0].grid.rows;
    const totalWidth = tileWidth * layout.cols;
    const totalHeight = tileHeight * layout.rows;
    const allCells = [];
    for (let i = 0; i < ordered.length; i++) {
      const tileRow = Math.floor(i / layout.cols);
      const tileCol = i % layout.cols;
      const offsetCol = tileCol * tileWidth;
      const offsetRow = tileRow * tileHeight;
      for (const c of ordered[i].cells) {
        allCells.push(Object.assign({}, c, {
          col: c.col + offsetCol,
          row: c.row + offsetRow,
        }));
      }
    }
    // Edge-overlap dedupe: if two cells map to same (col,row), prefer the
    // one with higher matchConfidence.
    const byKey = new Map();
    for (const c of allCells) {
      const k = `${c.col},${c.row}`;
      const prev = byKey.get(k);
      if (!prev || (c.matchConfidence || 0) > (prev.matchConfidence || 0)) {
        byKey.set(k, c);
      }
    }
    return { width: totalWidth, height: totalHeight, cells: Array.from(byKey.values()) };
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

  const api = { parsePageMarker, inferTileLayout, assembleTiles, edgeOverlapScore };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
