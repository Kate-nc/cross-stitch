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

    // Swatch boxes drawn as an outline with nothing filled in: a black-and-white
    // key (KG-Chart) rules a square for each entry and draws the symbol in it,
    // in shapes rather than text for about half its symbols. The box's top
    // rule is short and horizontal, and was read as a backstitch sample: 48 of
    // the 103 entries came out as backstitch, with no symbol to match.
    const outlineBoxes = findOutlineBoxes(page.vectorPaths || [], boxOf, inside);
    const boxRules = new Set();
    for (const ob of outlineBoxes) for (const r of ob.rules) boxRules.add(r);

    const swatches = [];
    const samples = [];
    for (const p of page.vectorPaths || []) {
      if (!p.points || p.points.length < 2) continue;
      if (boxRules.has(p)) continue;
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

    // A filled shape well inside an outline box is the symbol drawn there, not
    // a swatch: its colour is the ink's. An outline box with no swatch filling
    // it is itself the swatch, with no colour of its own.
    const within = (a, o) => a.x0 >= o.x0 - 0.3 && a.x1 <= o.x1 + 0.3 && a.y0 >= o.y0 - 0.3 && a.y1 <= o.y1 + 0.3;
    for (const ob of outlineBoxes) {
      // A box framing a backstitch sample stays a backstitch entry.
      if (samples.some(s => within(s, ob) && s.w >= ob.w * 0.6)) continue;
      const filled = swatches.some(s => within(s, ob) && s.w * s.h >= ob.w * ob.h * 0.5);
      for (let i = swatches.length - 1; i >= 0; i--) {
        const s = swatches[i];
        if (within(s, ob) && s.w * s.h < ob.w * ob.h * 0.5) swatches.splice(i, 1);
      }
      if (!filled) swatches.push(Object.assign({}, ob, { rgb: null, wide: false, outline: true }));
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
      // A ruled square with no fill is only the swatch when no filled one is
      // there: a key laid out as colour, ruled symbol box, code would
      // otherwise lose its colour to the nearer box.
      let swatch = null;
      for (const outlines of [false, true]) {
        for (const s of swatches) {
          if (!!s.outline !== outlines) continue;
          if (s.x1 > c.x + 1 || s.x0 <= prevX) continue;
          if (c.x - s.x1 > 80) continue;
          if (!sameLine(s.cy, c.cy)) continue;
          if (!swatch || s.x1 > swatch.x1 + 0.5 ||
              (Math.abs(s.x1 - swatch.x1) <= 0.5 && s.w * s.h > swatch.w * swatch.h)) {
            swatch = s;
          }
        }
        if (swatch) break;
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

      const entry = {
        kind: a.sample ? 'backstitch' : 'cross',
        symbol: a.symbol ? a.symbol.s : null,
        symbolFontName: a.symbol ? (a.symbol.picture ? '' : (a.symbol.font || 'Unknown')) : null,
        threadCode: a.code,
        colorName: name,
        stitchCount: count,
        strands: strands,
        swatchRgb: a.swatch && a.swatch.rgb ? a.swatch.rgb.slice() : null,
        lineRgb: a.sample ? a.sample.rgb : null,
      };
      // A symbol drawn as shapes in the swatch, for pdf-vector-glyphs.js to
      // match against the chart's. Only where no text symbol was found there.
      if (a.swatch && !(a.symbol && a.symbol.x + a.symbol.w / 2 >= a.swatch.x0 - 1 && a.symbol.x + a.symbol.w / 2 <= a.swatch.x1 + 1)) {
        const ink = swatchInk(page.vectorPaths || [], a.swatch, boxRules, boxOf);
        if (ink.length) entry.glyphInk = { box: { x0: a.swatch.x0, y0: a.swatch.y0, x1: a.swatch.x1, y1: a.swatch.y1 }, shapes: ink };
      }
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Squares ruled as four separate strokes (or one stroked rectangle) with no
   * fill: { x0, y0, x1, y1, cx, cy, w, h, rules: [paths] }. Sides of 6 to 30
   * points, square to within 15%.
   */
  function findOutlineBoxes(paths, boxOf, inside) {
    const out = [];
    const hs = [], vs = [];
    for (const p of paths) {
      if (!p || !p.stroked || p.fillColor || !p.points || p.points.length < 2) continue;
      const b = boxOf(p.points);
      if (inside(b.cx, b.cy)) continue;
      if (p.type === 'rect') {
        if (b.w >= 6 && b.w <= 30 && Math.abs(b.h / b.w - 1) <= 0.15) out.push(Object.assign(b, { rules: [p] }));
        continue;
      }
      if (p.points.length !== 2) continue;
      if (b.h < 0.3 && b.w >= 6 && b.w <= 30) hs.push({ p, b });
      else if (b.w < 0.3 && b.h >= 6 && b.h <= 30) vs.push({ p, b });
    }
    if (!hs.length || !vs.length) return out;
    hs.sort((a, b) => a.b.cy - b.b.cy);
    const near = (a, b) => Math.abs(a - b) <= 0.6;
    // A rule may serve two boxes: a key ruled as a table shares each box's
    // bottom with the next one's top.
    for (let i = 0; i < hs.length; i++) {
      const top = hs[i];
      for (let j = i + 1; j < hs.length; j++) {
        const bot = hs[j];
        const d = bot.b.cy - top.b.cy;
        if (d > top.b.w * 1.15) break;
        if (d < top.b.w * 0.85) continue;
        if (!near(top.b.x0, bot.b.x0) || !near(top.b.x1, bot.b.x1)) continue;
        const side = (x) => vs.find(v => near(v.b.cx, x) && near(v.b.y0, top.b.cy) && near(v.b.y1, bot.b.cy));
        const left = side(top.b.x0), right = side(top.b.x1);
        if (!left || !right) continue;
        const x0 = top.b.x0, x1 = top.b.x1, y0 = top.b.cy, y1 = bot.b.cy;
        out.push({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0,
                   rules: [top.p, bot.p, left.p, right.p] });
        break;
      }
    }
    return out;
  }

  /**
   * The shapes drawn inside a swatch: everything wholly within it except the
   * swatch's own fill and ruling, as { pts, fill, pen, paint } with fresh point
   * arrays. A path with curves gives its traced outline.
   */
  function swatchInk(paths, sw, boxRules, boxOf) {
    const ink = [];
    for (const p of paths) {
      if (!p || boxRules.has(p)) continue;
      const pts = p.outline || p.points;
      if (!pts || pts.length < 2) continue;
      const b = boxOf(pts);
      if (b.x0 < sw.x0 - 0.3 || b.x1 > sw.x1 + 0.3 || b.y0 < sw.y0 - 0.3 || b.y1 > sw.y1 + 0.3) continue;
      // The swatch's own fill, or another the size of the box.
      if (b.w * b.h >= sw.w * sw.h * 0.8) continue;
      const fill = !!p.fillColor;
      if (fill && sw.rgb && p.fillColor.every((v, i) => Math.round(v) === sw.rgb[i])) continue;
      if (!fill && !p.stroked) continue;
      ink.push({ pts: pts.map(q => ({ x: q.x, y: q.y })), fill, pen: p.penWidth || 0, paint: p.paint });
    }
    return ink;
  }

  var api = { readKeyEntries: readKeyEntries };

  if (typeof window !== 'undefined') window.PdfKeyReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
