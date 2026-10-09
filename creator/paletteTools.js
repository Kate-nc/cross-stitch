/* creator/paletteTools.js — pure helpers for the Palette tab (audit DRAW-05).
 *
 *   PaletteTools.unusedSymbols(pal, syms)        symbols no palette colour uses
 *   PaletteTools.reassignSymbol(pal, id, sym)    give one colour a new symbol,
 *                                                refusing duplicates
 *   PaletteTools.stampSymbol(pat, id, sym)       copy of the pattern with that
 *                                                colour's cells carrying `sym`
 *   PaletteTools.colourFamily(lab)               "reds", "blues", "neutrals"…
 *   PaletteTools.nearestThreads(lab, list, n, exclude)
 *   PaletteTools.swatchInk(rgb)                  "black" or "white" for text
 *   PaletteTools.swatchLabel(entry)              "DMC 310 · Black · 1,204 stitches"
 *
 * Symbols live on the pattern's cells (buildPalette in colour-utils.js reads
 * them), so a changed symbol survives every palette rebuild. The project
 * saves the changed ones in its optional `symbols` map.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */

(function (root) {
  var FAMILIES = [
    { id: "reds", label: "Reds" },
    { id: "pinks", label: "Pinks" },
    { id: "oranges", label: "Oranges" },
    { id: "yellows", label: "Yellows" },
    { id: "greens", label: "Greens" },
    { id: "blues", label: "Blues" },
    { id: "purples", label: "Purples" },
    { id: "browns", label: "Browns" },
    { id: "neutrals", label: "Neutrals" }
  ];

  function unusedSymbols(pal, syms) {
    var used = Object.create(null);
    (pal || []).forEach(function (p) { if (p && p.symbol) used[p.symbol] = true; });
    return (syms || []).filter(function (s) { return !used[s]; });
  }

  // Returns { ok: true, pal, from } or { ok: false, reason }.
  function reassignSymbol(pal, id, sym) {
    if (!pal || !sym) return { ok: false, reason: "missing" };
    var idx = -1;
    for (var i = 0; i < pal.length; i++) if (pal[i] && pal[i].id === id) idx = i;
    if (idx < 0) return { ok: false, reason: "missing" };
    var from = pal[idx].symbol;
    if (from === sym) return { ok: false, reason: "same" };
    for (var j = 0; j < pal.length; j++) {
      if (j !== idx && pal[j] && pal[j].symbol === sym) return { ok: false, reason: "duplicate" };
    }
    var next = pal.slice();
    next[idx] = Object.assign({}, pal[idx], { symbol: sym });
    return { ok: true, pal: next, from: from };
  }

  function stampSymbol(pat, id, sym) {
    if (!pat) return pat;
    var out = new Array(pat.length);
    for (var i = 0; i < pat.length; i++) {
      var c = pat[i];
      out[i] = c && c.id === id ? Object.assign({}, c, { symbol: sym }) : c;
    }
    return out;
  }

  // A rough colour family from CIELAB lightness, chroma and hue, for the
  // All DMC filter chips.
  function colourFamily(lab) {
    if (!lab || lab.length < 3) return "neutrals";
    var L = lab[0], a = lab[1], b = lab[2];
    var C = Math.sqrt(a * a + b * b);
    if (C < 10) return "neutrals";
    var hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    if (hue >= 345 || hue < 35) return L >= 65 ? "pinks" : "reds";
    if (hue < 105) {
      if (C < 30 && L < 75) return "browns";
      return hue < 70 ? "oranges" : "yellows";
    }
    if (hue < 190) return "greens";
    if (hue < 290) return "blues";
    return "purples";
  }

  function deltaE(a, b) {
    if (typeof root.dE2000 === "function") return root.dE2000(a, b);
    var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2];
    return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2);
  }

  // The `n` threads in `list` closest to `lab`, nearest first, skipping ids
  // in `exclude` (an object or Set of ids).
  function nearestThreads(lab, list, n, exclude) {
    if (!lab || !list) return [];
    var has = exclude && typeof exclude.has === "function"
      ? function (id) { return exclude.has(id); }
      : function (id) { return !!(exclude && exclude[id]); };
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t || !t.lab || has(t.id)) continue;
      scored.push({ t: t, d: deltaE(lab, t.lab) });
    }
    scored.sort(function (x, y) { return x.d - y.d; });
    return scored.slice(0, n || 12).map(function (s) { return s.t; });
  }

  function swatchInk(rgb) {
    if (!rgb) return "black";
    var lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return lum > 140 ? "black" : "white";
  }

  function swatchLabel(p) {
    if (!p) return "";
    var parts = [(p.type === "blend" ? "Blend " : "DMC ") + p.id];
    if (p.name && p.name !== p.id) parts.push(p.name);
    if (p.count != null) {
      var n = Number(p.count) || 0;
      parts.push(n.toLocaleString("en-GB") + (n === 1 ? " stitch" : " stitches"));
    }
    return parts.join(" · ");
  }

  var api = {
    FAMILIES: FAMILIES,
    unusedSymbols: unusedSymbols,
    reassignSymbol: reassignSymbol,
    stampSymbol: stampSymbol,
    colourFamily: colourFamily,
    nearestThreads: nearestThreads,
    swatchInk: swatchInk,
    swatchLabel: swatchLabel
  };
  root.PaletteTools = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
