/* import-engine/pdf/textBands.js — group text events into Y-aligned rows.
 *
 * Two consumers:
 *   • the legend extractor (each legend row is a band)
 *   • the metadata extractor (title block, designer line, etc.)
 *
 * The grouper takes either:
 *   • an array of text events from operatorWalker.js
 *   • or a pdfjs-dist textContent.items array (each has { str, transform })
 *
 * and returns an array of bands sorted top-to-bottom:
 *   [ { y, height, items: [{ x, text, font }, ...] }, ... ]
 *
 * Items inside a band are sorted left-to-right.
 */

(function () {
  'use strict';

  function groupTextBands(items, opts) {
    opts = opts || {};
    const tolerance = opts.tolerance || 2.5; // points
    const norm = items.map(normalise).filter(Boolean);
    norm.sort(function (a, b) { return b.y - a.y; }); // PDF Y goes up

    const bands = [];
    for (const it of norm) {
      const last = bands[bands.length - 1];
      if (last && Math.abs(last.y - it.y) <= tolerance) {
        last.items.push(it);
        last.height = Math.max(last.height, it.height);
      } else {
        bands.push({ y: it.y, height: it.height, items: [it] });
      }
    }
    for (const band of bands) {
      band.items.sort(function (a, b) { return a.x - b.x; });
      band.text = band.items.map(function (i) { return i.text; }).join(' ').replace(/\s+/g, ' ').trim();
    }
    return bands;
  }

  function normalise(item) {
    if (!item) return null;
    // operatorWalker text event
    if (item.type === 'text') {
      return {
        x: item.x, y: item.y,
        text: item.text || '',
        font: item.font && item.font.name || null,
        height: item.font && item.font.size || 10,
      };
    }
    // pdfjs textContent item
    if (typeof item.str === 'string' && Array.isArray(item.transform)) {
      return {
        x: item.transform[4],
        y: item.transform[5],
        text: item.str,
        font: item.fontName || null,
        height: item.height || Math.abs(item.transform[3]) || 10,
      };
    }
    if (typeof item.x === 'number' && typeof item.y === 'number' && typeof item.text === 'string') {
      return { x: item.x, y: item.y, text: item.text, font: item.font || null, height: item.height || 10 };
    }
    return null;
  }

  // Convenience: collapse a band's text into one normalised string.
  function bandText(band) {
    if (!band || !band.items) return '';
    return band.items.map(function (i) { return i.text; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  const api = { groupTextBands, bandText };

  if (typeof window !== 'undefined') {
    window.ImportEngine = Object.assign(window.ImportEngine || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
