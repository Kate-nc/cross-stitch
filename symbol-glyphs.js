/* symbol-glyphs.js — the symbols a chart shows on screen (audit UX-001, UX-002).
 *
 * The printed PDF draws every thread with a glyph from the embedded
 * CrossStitchSymbols font (creator/symbolFontSpec.js), picked by
 * PdfChartLayout.buildCodepointMap from the thread's place in a fixed sort of
 * the threads in use. The screen uses that same assignment, read-only, so the
 * symbol you see on screen is the one on paper:
 *
 *   SymbolGlyphs.forPalette(entries)   { threadId: glyph } exactly as the PDF assigns them
 *   SymbolGlyphs.pool()                the font's glyphs, in assignment order
 *   SymbolGlyphs.freeSymbol(claimed)   a symbol not in `claimed`: a font glyph
 *                                      first, then the older shapes, then a number
 *   SymbolGlyphs.overflow(n)           how many of n symbols the PDF can't print
 *   SymbolGlyphs.fontStack             CSS font-family for anything drawing a symbol
 *   SymbolGlyphs.ensureFont()          registers the font with document.fonts
 *
 * Loaded after dmc-data.js (the older shapes, SYMS) and after
 * creator/symbolFontSpec.js + creator/pdfChartLayout.js. It also loads inside
 * generate-worker.js, which has no DOM, so ensureFont() is a no-op there.
 */
(function (root) {
  "use strict";

  var FAMILY = "CrossStitchSymbols";
  var fontPromise = null;
  var poolCache = null, poolSpec = null;

  function spec() { return root.SYMBOL_FONT_SPEC || null; }
  function layout() { return root.PdfChartLayout || null; }

  function pool() {
    var s = spec();
    if (!s) return [];
    if (poolSpec !== s) {
      poolSpec = s;
      poolCache = s.glyphs.map(function (g) { return String.fromCodePoint(g.codepoint); });
    }
    return poolCache;
  }

  function capacity() { var s = spec(); return s ? s.glyphs.length : 0; }

  // { threadId: glyph } for the entries, as pdf-export-worker.js assigns them.
  // Entries past the font's capacity are left out (the PDF refuses those).
  function forPalette(entries) {
    var s = spec(), L = layout();
    var out = Object.create(null);
    if (!s || !L || !entries || !entries.length) return out;
    var padded = s.glyphs;
    if (entries.length > padded.length) {
      padded = padded.concat(Array.apply(null, Array(entries.length - padded.length)).map(function () { return { codepoint: null }; }));
    }
    var r = L.buildCodepointMap(entries, { glyphs: padded });
    r.order.forEach(function (id) {
      var cp = r.map[id];
      if (cp != null) out[id] = String.fromCodePoint(cp);
    });
    return out;
  }

  // The next symbol that is not claimed: a font glyph, then the older shapes,
  // then plain numbers, so the answer is always new.
  function freeSymbol(claimed) {
    var p = pool(), i;
    for (i = 0; i < p.length; i++) if (!claimed[p[i]]) return p[i];
    var legacy = typeof SYMS !== "undefined" ? SYMS : [];
    for (i = 0; i < legacy.length; i++) if (!claimed[legacy[i]]) return legacy[i];
    var n = 1;
    while (claimed[String(n)]) n++;
    return String(n);
  }

  // How many of `n` chart symbols the PDF has no glyph for.
  function overflow(n) { return Math.max(0, (n || 0) - capacity()); }

  function b64ToBytes(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Registers the symbol font for canvas and DOM text. Safe to call again and
  // in a worker (no document: it resolves false). The bytes are in memory, so
  // it is ready long before a chart first draws.
  function ensureFont() {
    if (fontPromise) return fontPromise;
    var doc = root.document;
    // Nothing is remembered when the font bytes haven't loaded yet, so a later
    // call can still register them.
    if (!doc || !doc.fonts || typeof root.FontFace !== "function" || !root.CROSS_STITCH_SYMBOL_FONT_B64) {
      return Promise.resolve(false);
    }
    try {
      var face = new root.FontFace(FAMILY, b64ToBytes(root.CROSS_STITCH_SYMBOL_FONT_B64), { weight: "100 900" });
      fontPromise = face.load().then(function () {
        doc.fonts.add(face);
        return true;
      }).catch(function () { return false; });
    } catch (e) {
      fontPromise = Promise.resolve(false);
    }
    return fontPromise;
  }

  var api = {
    FAMILY: FAMILY,
    fontStack: '"' + FAMILY + '", monospace',
    pool: pool,
    capacity: capacity,
    forPalette: forPalette,
    freeSymbol: freeSymbol,
    overflow: overflow,
    ensureFont: ensureFont
  };

  root.SymbolGlyphs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  ensureFont();
})(typeof self !== "undefined" ? self : (typeof window !== "undefined" ? window : globalThis));
