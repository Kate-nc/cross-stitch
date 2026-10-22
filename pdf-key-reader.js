/* pdf-key-reader.js: the code-anchored colour key reader, lifted out of pdf-importer.js.
 *
 * readKeyEntries(page, exclude) turns the text, filled shapes, stroked lines and symbol pictures of ONE extracted
 * PDF page into the key entries printed on it: { kind, symbol, symbolFontName, threadCode, colorName, stitchCount,
 * strands, swatchRgb, lineRgb }, in the order the page's text items list their thread codes. exclude is null or a
 * { x0, y0, x1, y1 } box whose contents are ignored (the importer masks the chart out when a key shares its page).
 * It reads only its two arguments, never writes to the page, and returns a new array of new entries (the swatch and
 * sample colours are fresh arrays, not the page's own). It reads no pdf.js, DOM, storage or timer, is not
 * asynchronous, and holds no state between calls. The code ran in a class body before, which is strict mode, so the
 * module is strict too.
 *
 * pdf-importer.js keeps parseKeyEntries as a one-line call to this, and keeps parseLegend (which pools this
 * reader's output with parseLegendLegacy's per page, drops repeated entries and carries the brand),
 * parseLegendLegacy and linkSymbolsToThreads, so which reading wins, the confidence thresholds and the order
 * presented to callers are unchanged. Loaded as a plain <script> before pdf-importer.js by every page that
 * lazy-loads the importer and by import-engine/strategies/pdfGlyphStrategy.js, from sw.js's precache list, and
 * by require() in tests.
 */
(function () {
  'use strict';

  /**
   * Code-anchored key reader.
   *
   * Every key entry, whatever the publisher's layout, has a thread code, and
   * almost every one has a swatch or a symbol immediately to its left. So rather
   * than treating each printed line as one entry — which is what silently
   * discarded most of a multi-column key — this finds each code and builds its
   * entry from what sits around it:
   *
   *   swatch   the filled square just left of the code. Its exact fill colour
   *            is what the chart's cells are painted with, so it links cells to
   *            threads even when the symbol is drawn as vector art rather than
   *            text — true of 84 of gen-3's 102 key symbols.
   *   symbol   a text glyph inside the swatch, or the nearest one to the left.
   *   sample   for a backstitch entry, the stroked line drawn instead of a swatch.
   *   name     the first descriptive text to the right, before the next entry.
   *   count    "(10511 ct)" or similar, kept apart from the name.
   *
   * A code with none of swatch, symbol or sample beside it is not an entry —
   * which is what rejects page numbers, quantities like "x1" and stray numbers.
   *
   * @param {Object} page
   * @param {{x0:number,y0:number,x1:number,y1:number}|null} exclude region to ignore
   * @returns {Array<Object>} entries
   */
  function readKeyEntries(page, exclude) {
    const inside = (x, y) => !!exclude &&
      x >= exclude.x0 && x <= exclude.x1 && y >= exclude.y0 && y <= exclude.y1;

    // At least two characters: DMC writes its low numbers as 01-09, so a lone
    // digit is always a symbol. gen1 uses digits as symbols, and treating "4"
    // as a code made it block the very entry it belongs to.
    const CODE_RE = /^(?:DMC\s*)?([A-Z]{1,2}\d{1,4}|\d{2,4}|B5200|BLANC|ECRU)$/i;
    const COUNT_RE = /^\(?\s*(\d[\d,.]*)\s*(?:ct|sts?|stitches|pts?)\.?\s*\)?$/i;
    const STRANDS_RE = /^\[(\d)\]$/;
    const SKEIN_RE = /^x\s*\d+$/i;

    const texts = [];
    for (const t of page.textItems || []) {
      const s = (t.str || '').trim();
      if (!s) continue;
      const h = t.height || t.fontSize || 8;
      const cy = t.y - h / 2;
      if (inside(t.x, cy)) continue;
      texts.push({ s, x: t.x, y: t.y, w: t.width || 0, h, cy, font: t.fontName });
    }
    if (!texts.length) return [];

    const boxOf = (pts) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
      }
      return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    };

    const swatches = [];
    const samples = [];
    for (const p of page.vectorPaths || []) {
      if (!p.points || p.points.length < 2) continue;
      const b = boxOf(p.points);
      if (inside(b.cx, b.cy)) continue;
      if (p.fillColor && p.points.length >= 3) {
        const rgb = Array.from(p.fillColor).map(v => Math.round(v));
        // A thin wide bar is a backstitch sample drawn as a filled shape (DMC
        // draws them this way, with rounded ends that leave only 3 points once
        // curves are dropped), not a swatch.
        if (b.h <= 4 && b.w >= 8 && b.w <= 70) { samples.push(Object.assign(b, { rgb })); continue; }
        if (p.points.length < 4) continue;
        if (b.w < 3 || b.h < 3 || b.h > 30) continue;
        // A square swatch, or a whole table cell filled with the thread's
        // colour (MacStitch: a cell some 100pt wide). A wide fill is only a
        // swatch if it ends before the code it belongs to; row striping runs
        // across the code and is ruled out below.
        const wide = b.w > 30 || b.w / b.h > 2.2;
        if (wide && b.w > 160) continue;
        if (!wide && b.h / b.w > 2.2) continue;
        swatches.push(Object.assign(b, { rgb, wide }));
      } else if (p.stroked && p.strokeColor && p.points.length === 2) {
        // A key's backstitch sample is a short horizontal stroke.
        if (b.h > 3 || b.w < 8 || b.w > 70) continue;
        samples.push(Object.assign(b, { rgb: Array.from(p.strokeColor).map(v => Math.round(v)) }));
      }
    }

    // Symbols drawn as pictures (readSymbolPictures), placed as glyphs are.
    const pictures = [];
    for (const im of page.images || []) {
      if (!im.pic) continue;
      const cx = (im.x0 + im.x1) / 2, cy = (im.y0 + im.y1) / 2;
      if (inside(cx, cy)) continue;
      pictures.push({ s: im.pic, x: im.x0, y: im.y1, w: im.x1 - im.x0, h: im.y1 - im.y0, cy, font: '', picture: true });
    }

    const sameLine = (a, cy) => Math.abs(a - cy) <= 7;
    const codes = texts.filter(t => CODE_RE.test(t.s));
    const anchored = [];

    for (const c of codes) {
      const onLine = codes.filter(o => o !== c && sameLine(o.cy, c.cy));
      const prevX = onLine.filter(o => o.x < c.x).reduce((m, o) => Math.max(m, o.x + o.w), -Infinity);

      // Swatch: the filled square whose right edge is nearest the code, between
      // the previous code on this line and this one. Publishers space these
      // differently — KG-Chart leaves ~6pt, DMC ~45pt — and the reach is safe to
      // widen because nothing past the previous code can be chosen.
      let swatch = null;
      for (const s of swatches) {
        if (s.x1 > c.x + 1 || s.x0 <= prevX) continue;
        if (c.x - s.x1 > 80) continue;
        if (!sameLine(s.cy, c.cy)) continue;
        if (!swatch || s.x1 > swatch.x1 + 0.5 ||
            (Math.abs(s.x1 - swatch.x1) <= 0.5 && s.w * s.h > swatch.w * swatch.h)) {
          swatch = s;
        }
      }

      // Symbol: a glyph drawn inside the swatch, else the nearest one to the left.
      const glyphs = texts.filter(t => (t.s.length === 1 || /^U\+[0-9A-F]{4}$/.test(t.s)) &&
        t.x < c.x && t.x > prevX && sameLine(t.cy, c.cy))
        .concat(pictures.filter(t => t.x < c.x && t.x > prevX && sameLine(t.cy, c.cy)));
      // gen1 prints its symbol beside the swatch rather than in it, and its
      // chart is drawn in text alone, so the symbol is the only link for those
      // cells — it must be kept even when a swatch is found.
      let symbol = null;
      if (swatch) {
        symbol = glyphs.find(t => t.x + t.w / 2 >= swatch.x0 - 1 && t.x + t.w / 2 <= swatch.x1 + 1) || null;
      }
      if (!symbol) {
        symbol = glyphs.filter(t => c.x - t.x <= 90).sort((a, b) => b.x - a.x)[0] || null;
      }

      let sample = null;
      if (!swatch && !symbol) {
        sample = samples
          .filter(s => s.x1 <= c.x + 1 && c.x - s.x1 <= 40 && s.x0 > prevX && sameLine(s.cy, c.cy))
          .sort((a, b) => b.x1 - a.x1)[0] || null;
        if (!sample) continue;
      }

      const code = c.s.replace(/^DMC\s*/i, '');
      anchored.push({
        c, code, swatch, symbol, sample,
        prefixX: Math.min(c.x, swatch ? swatch.x0 : Infinity, symbol ? symbol.x : Infinity,
                          sample ? sample.x0 : Infinity),
      });
    }

    // A key laid out as a table names its columns. Values are then read by
    // the column they sit under: MacStitch prints strands, length and stitch
    // count as bare numbers ("2", "0.2 Skeins", "947"), and read by position
    // alone the strands passed for a symbol and the length for a name.
    const HEADS = [
      { re: /^(?:stitches|stitch\s*count|count|sts\.?)$/i, col: 'count' },
      { re: /^strands?$/i, col: 'strands' },
      { re: /^(?:length|skeins?|amount|qty|quantity|metres|meters|yards)$/i, col: 'skip' },
      { re: /^(?:name|description|colou?r\s*name)$/i, col: 'name' },
    ];
    const heads = [];
    for (const t of texts) for (const hd of HEADS) if (hd.re.test(t.s)) heads.push({ x: t.x, cy: t.cy, col: hd.col });
    const columnOf = (t, rowCy) => {
      const above = heads.filter(hd => hd.cy < rowCy - 2);
      if (!above.length) return null;
      const rowY = Math.max(...above.map(hd => hd.cy));
      const row = above.filter(hd => Math.abs(hd.cy - rowY) <= 3 && hd.x <= t.x + 4);
      if (!row.length) return null;
      return row.reduce((m, hd) => (hd.x > m.x ? hd : m)).col;
    };

    const entries = [];
    for (const a of anchored) {
      const next = anchored
        .filter(o => o !== a && sameLine(o.c.cy, a.c.cy) && o.prefixX > a.c.x)
        .reduce((m, o) => Math.min(m, o.prefixX), Infinity);

      let name = null, count = null, strands = null;
      const right = texts
        .filter(t => t !== a.c && t.x > a.c.x && t.x < next && sameLine(t.cy, a.c.cy))
        .sort((p, q) => p.x - q.x);
      for (const t of right) {
        const col = heads.length ? columnOf(t, a.c.cy) : null;
        if (col === 'skip') continue;
        if (col === 'count' && /^\d[\d,.]*$/.test(t.s)) { if (count === null) count = parseInt(t.s.replace(/[,.]/g, ''), 10); continue; }
        if (col === 'strands' && /^\d$/.test(t.s)) { if (strands === null) strands = parseInt(t.s, 10); continue; }
        if (col === 'name') { if (name === null && /[a-z]/i.test(t.s)) name = t.s; continue; }
        const cm = t.s.match(COUNT_RE);
        if (cm) { if (count === null) count = parseInt(cm[1].replace(/[,.]/g, ''), 10); continue; }
        const sm = t.s.match(STRANDS_RE);
        if (sm) { if (strands === null) strands = parseInt(sm[1], 10); continue; }
        if (SKEIN_RE.test(t.s) || CODE_RE.test(t.s) || /^dmc$/i.test(t.s) || t.s.length === 1) continue;
        if (name === null && t.s.length > 1) name = t.s;
      }
      // Strands are sometimes printed before the code, as in "Ø [2] DMC 155".
      if (strands === null) {
        const before = texts.find(t => STRANDS_RE.test(t.s) && t.x < a.c.x && t.x > a.prefixX - 1 &&
          sameLine(t.cy, a.c.cy));
        if (before) strands = parseInt(before.s.match(STRANDS_RE)[1], 10);
      }

      entries.push({
        kind: a.sample ? 'backstitch' : 'cross',
        symbol: a.symbol ? a.symbol.s : null,
        symbolFontName: a.symbol ? (a.symbol.picture ? '' : (a.symbol.font || 'Unknown')) : null,
        threadCode: a.code,
        colorName: name,
        stitchCount: count,
        strands: strands,
        swatchRgb: a.swatch ? a.swatch.rgb : null,
        lineRgb: a.sample ? a.sample.rgb : null,
      });
    }
    return entries;
  }

  var api = { readKeyEntries: readKeyEntries };

  if (typeof window !== 'undefined') window.PdfKeyReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
