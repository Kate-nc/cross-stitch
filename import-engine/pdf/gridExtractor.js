/* import-engine/pdf/gridExtractor.js — Detect chart grid + cells from fillRect events.
 *
 * Inputs: array of `fillRect` events from operator walker:
 *   { kind: 'fillRect', x, y, w, h, color: [r,g,b] }
 *
 * Pipeline:
 *   1. detectPitch(rects)       → { pitchX, pitchY, originX, originY, cols, rows }
 *   2. snapToGrid(rects, grid)  → cells: array of { col, row, color, type }
 *   3. matchToLegend(cells, legend) → cells with { code, matchKind, matchConfidence }
 */

(function () {
  'use strict';

  // Detect grid pitch by histogram of pairwise x-spacings between distinct
  // rect x-positions. Returns the most common spacing (modal pitch).
  function detectPitch(rects) {
    if (!Array.isArray(rects) || rects.length < 4) {
      return { pitchX: 0, pitchY: 0, originX: 0, originY: 0, cols: 0, rows: 0 };
    }
    const xs = uniqSorted(rects.map(r => r.x));
    const ys = uniqSorted(rects.map(r => r.y));
    const ws = rects.map(r => r.w).filter(v => v > 0);
    const hs = rects.map(r => r.h).filter(v => v > 0);

    const pitchX = modalSpacing(xs) || median(ws) || 0;
    const pitchY = modalSpacing(ys) || median(hs) || 0;
    const originX = xs[0];
    const originY = ys[0];

    const maxX = Math.max(...rects.map(r => r.x + r.w));
    const maxY = Math.max(...rects.map(r => r.y + r.h));
    const cols = pitchX ? Math.round((maxX - originX) / pitchX) : 0;
    const rows = pitchY ? Math.round((maxY - originY) / pitchY) : 0;

    return { pitchX, pitchY, originX, originY, cols, rows };
  }

  // Snap each rect to a (col, row) cell. Classify the cell's stitch type
  // by its aspect ratio relative to the grid pitch.
  function snapToGrid(rects, grid) {
    const out = [];
    if (!grid || !grid.pitchX || !grid.pitchY) return out;
    for (const r of rects) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const col = Math.round((cx - grid.originX - grid.pitchX / 2) / grid.pitchX);
      const row = Math.round((cy - grid.originY - grid.pitchY / 2) / grid.pitchY);
      if (col < 0 || row < 0) continue;
      const type = classifyCellType(r, grid);
      out.push({
        col, row,
        color: r.color || [0, 0, 0],
        type,
        rect: r,
      });
    }
    return out;
  }

  function classifyCellType(rect, grid) {
    const wRatio = rect.w / grid.pitchX;
    const hRatio = rect.h / grid.pitchY;
    if (wRatio > 0.9 && hRatio > 0.9) return 'full';
    if (wRatio > 0.4 && wRatio < 0.65 && hRatio > 0.9) return 'half';
    if (wRatio > 0.9 && hRatio > 0.4 && hRatio < 0.65) return 'half';
    if (wRatio < 0.65 && hRatio < 0.65) return 'quarter';
    return 'full';
  }

  // Match each cell colour to a legend code.
  // legend: { rows, codes (Set), byColor? } where each row optionally has rgb.
  // Returns cells with { code, matchKind, matchConfidence } added.
  // matchKind ∈ {'legend-exact', 'legend-nearest', 'dmc-fallback', 'unknown'}.
  function matchToLegend(cells, legend, dmcPalette) {
    const legendRows = (legend && legend.rows) || [];
    const legendByRGB = new Map();
    for (const r of legendRows) {
      if (Array.isArray(r.rgb)) legendByRGB.set(r.rgb.join(','), r);
    }
    const out = [];
    for (const cell of cells) {
      const key = (cell.color || []).join(',');
      let code = null, matchKind = 'unknown', matchConfidence = 0;
      if (legendByRGB.has(key)) {
        const lr = legendByRGB.get(key);
        code = lr.code;
        matchKind = 'legend-exact';
        matchConfidence = 1.0;
      } else if (legendRows.length) {
        const nearest = nearestColour(cell.color, legendRows.filter(r => r.rgb), r => r.rgb);
        if (nearest && nearest.dist < 25) {
          code = nearest.item.code;
          matchKind = 'legend-nearest';
          matchConfidence = 0.95;
        }
      }
      if (!code && dmcPalette && dmcPalette.length) {
        const nearest = nearestColour(cell.color, dmcPalette, p => p.rgb);
        if (nearest) {
          code = nearest.item.id;
          matchKind = 'dmc-fallback';
          matchConfidence = 0.5;
        }
      }
      out.push(Object.assign({}, cell, { code, matchKind, matchConfidence }));
    }
    return out;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  function uniqSorted(arr) {
    return Array.from(new Set(arr.map(v => Math.round(v * 100) / 100))).sort((a, b) => a - b);
  }

  function modalSpacing(sortedVals) {
    if (sortedVals.length < 3) return 0;
    const diffs = [];
    for (let i = 1; i < sortedVals.length; i++) {
      const d = sortedVals[i] - sortedVals[i - 1];
      if (d > 0.5) diffs.push(Math.round(d * 10) / 10);
    }
    if (!diffs.length) return 0;
    const counts = new Map();
    for (const d of diffs) counts.set(d, (counts.get(d) || 0) + 1);
    let best = 0, bestN = 0;
    for (const [d, n] of counts) {
      if (n > bestN) { bestN = n; best = d; }
    }
    return best;
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  function nearestColour(rgb, list, accessor) {
    if (!rgb || !list || !list.length) return null;
    let best = null, bestD = Infinity;
    for (const item of list) {
      const c = accessor(item);
      if (!Array.isArray(c)) continue;
      const d = colourDistance(rgb, c);
      if (d < bestD) { bestD = d; best = item; }
    }
    return best ? { item: best, dist: bestD } : null;
  }

  function colourDistance(a, b) {
    const dr = (a[0] || 0) - (b[0] || 0);
    const dg = (a[1] || 0) - (b[1] || 0);
    const db = (a[2] || 0) - (b[2] || 0);
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  const api = { detectPitch, snapToGrid, matchToLegend, classifyCellType };
  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
