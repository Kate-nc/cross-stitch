/* pdf-vector-glyphs.js: chart symbols drawn as vector shapes, and which key symbol each one is.
 *
 * Some charting programs print a symbol as a character in a font, which the importer reads as text; others draw
 * it as filled and stroked shapes. KG-Chart does both in one chart: about half its symbols are text and the rest
 * shapes. A colour chart survives that, because each cell is also filled in its thread's colour; a black-and-white
 * copy has nothing but the shape, and without reading the shape every such cell imported empty (about three
 * quarters of a 256 x 450 chart).
 *
 * The same symbol is drawn at different sizes in the chart and in the key (KG-Chart: half of a 7.9pt cell, and
 * two thirds of an 11.3pt key box), but always centred in its box and at a fixed share of it — a symbol "em". So
 * each symbol is turned into a bitmap of its em square around the box centre, and the em is measured on each side
 * separately as the commonest extent of the symbols there: most symbols fill their em in at least one direction.
 *
 *   emOf(groups)                     the em, in points, from symbol extents measured against their boxes
 *   bitmap(shapes, cx, cy, em)       the symbol's shapes as an N x N bitmap of its em square
 *   pixelSize(em)                    one bitmap pixel in points
 *   keyOf(bits)                      a short id for a bitmap ('vec:...'), equal for equal bitmaps
 *   similarity(a, b)                 0..1, how alike two bitmaps are, allowing a pixel of drift
 *   bestMatch(bits, candidates)      the candidate most like bits, or null when none is close or two tie
 *   toRgba(bits)                     the bitmap drawn black on white, for the import review to show
 *
 * A shape is { pts: [{x,y}], fill: bool, pen: number, paint: id }: a closed outline to fill, or a line to
 * stroke with a pen of that width, in page points. Subpaths sharing a paint id are one shape, filled even-odd
 * (so an O keeps its hole); separate shapes are combined.
 *
 * Every function takes its inputs as arguments and returns a new result; none reads pdf.js, the DOM, storage or
 * timers, and none is asynchronous. Loaded as a plain <script> after pdf-key-reader.js and before pdf-importer.js
 * by every page that lazy-loads the importer and by import-engine/strategies/pdfGlyphStrategy.js, from sw.js's
 * precache list, and by require() in tests.
 */
(function () {
  'use strict';

  /** Bitmap side, and how far it reaches from the box centre in ems (a little past the em for wide symbols). */
  var N = 32;
  var REACH = 0.6;

  /**
   * A symbol's em in points, from the extents of many symbols each measured in its own box: the commonest share
   * of its box that a symbol's larger side covers, times the box size. groups: [{ w, h, box }], w and h the
   * symbol's ink extent and box the side of the cell or key box it sits in. Returns 0 when there is nothing to go on.
   */
  function emOf(groups) {
    var bins = new Map();
    for (var i = 0; i < (groups || []).length; i++) {
      var g = groups[i];
      if (!(g.box > 0)) continue;
      var share = Math.max(g.w, g.h) / g.box;
      if (!(share > 0.05) || share > 1.2) continue;
      var k = Math.round(share * 50);
      if (!bins.has(k)) bins.set(k, []);
      bins.get(k).push(share);
    }
    var best = null;
    bins.forEach(function (list, k) {
      // Neighbouring bins count too, so a share sitting on a bin edge is not split in two.
      var n = list.length + ((bins.get(k - 1) || []).length + (bins.get(k + 1) || []).length) / 2;
      if (!best || n > best.n || (n === best.n && k > best.k)) best = { k: k, n: n, list: list };
    });
    if (!best) return 0;
    var list = best.list.slice().sort(function (a, b) { return a - b; });
    return list[Math.floor(list.length / 2)];
  }

  /** Sample points per pixel side: a pixel is inked when at least half of its SS x SS samples are. */
  var SS = 3;

  /**
   * A stroked line as filled quadrilaterals, one per segment, each its own
   * shape: the pen's width either side of the segment.
   */
  function strokeQuads(pts, half) {
    var out = [];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
      var nx, ny;
      if (len > 0) { nx = -dy / len * half; ny = dx / len * half; } else { nx = half; ny = 0; }
      var ex = len > 0 ? dx / len * half : 0, ey = len > 0 ? dy / len * half : half;
      out.push([
        { x: a.x - ex + nx, y: a.y - ey + ny }, { x: b.x + ex + nx, y: b.y + ey + ny },
        { x: b.x + ex - nx, y: b.y + ey - ny }, { x: a.x - ex - nx, y: a.y - ey - ny },
      ]);
    }
    return out;
  }

  /**
   * The shapes as an N x N bitmap (Uint8Array of 0/1, row by row) of the square REACH ems either side of
   * (cx, cy). Filled scanline by scanline at SS x SS samples a pixel: each shape even-odd over its subpaths,
   * shapes combined. A pixel is inked when half its samples are, so a thin stroke stays thinner than a bold one.
   */
  function bitmap(shapes, cx, cy, em) {
    var bits = new Uint8Array(N * N);
    if (!(em > 0) || !shapes || !shapes.length) return bits;
    var groups = new Map();
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      if (!s || !s.pts || s.pts.length < 2) continue;
      if (s.fill && s.pts.length >= 3) {
        var id = s.paint === undefined ? 'shape' + i : 'paint' + s.paint;
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(s.pts);
      } else if (!s.fill) {
        var quads = strokeQuads(s.pts, Math.max((s.pen || 0) / 2, em * 0.02));
        for (var k = 0; k < quads.length; k++) groups.set('stroke' + i + '.' + k, [quads[k]]);
      }
    }
    var fills = Array.from(groups.values());
    var S = N * SS;
    var step = 2 * REACH * em / S;
    var left = cx - REACH * em, top = cy - REACH * em;
    var count = new Uint8Array(N * N);
    var row = new Uint8Array(S);
    var xs = [];
    for (var sr = 0; sr < S; sr++) {
      var y = top + (sr + 0.5) * step;
      row.fill(0);
      for (var f = 0; f < fills.length; f++) {
        xs.length = 0;
        var subs = fills[f];
        for (var q = 0; q < subs.length; q++) {
          var pts = subs[q];
          for (var m = 0, n = pts.length - 1; m < pts.length; n = m++) {
            var y1 = pts[m].y, y2 = pts[n].y;
            if ((y1 > y) !== (y2 > y)) xs.push(pts[m].x + (y - y1) * (pts[n].x - pts[m].x) / (y2 - y1));
          }
        }
        if (xs.length < 2) continue;
        xs.sort(function (u, v) { return u - v; });
        for (var e = 0; e + 1 < xs.length; e += 2) {
          var c0 = Math.max(0, Math.ceil((xs[e] - left) / step - 0.5));
          var c1 = Math.min(S - 1, Math.floor((xs[e + 1] - left) / step - 0.5));
          for (var c = c0; c <= c1; c++) row[c] = 1;
        }
      }
      var pr = Math.floor(sr / SS) * N;
      for (var sc = 0; sc < S; sc++) if (row[sc]) count[pr + Math.floor(sc / SS)]++;
    }
    var half = Math.ceil(SS * SS / 2);
    for (var p = 0; p < N * N; p++) if (count[p] >= half) bits[p] = 1;
    return bits;
  }

  /** The side of one bitmap pixel, in points, for a symbol of this em. */
  function pixelSize(em) {
    return 2 * REACH * em / N;
  }

  /** A short id for a bitmap, the same for the same bits. */
  function keyOf(bits) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < bits.length; i++) { h ^= bits[i]; h = Math.imul(h, 16777619) >>> 0; }
    var n = 0;
    for (var j = 0; j < bits.length; j++) n += bits[j];
    return 'vec:' + n + ':' + h.toString(16);
  }

  var dilated = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function dilate(bits) {
    var hit = dilated && dilated.get(bits);
    if (hit) return hit;
    var out = new Uint8Array(N * N);
    for (var r = 0; r < N; r++) {
      for (var c = 0; c < N; c++) {
        if (!bits[r * N + c]) continue;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            var rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < N && cc >= 0 && cc < N) out[rr * N + cc] = 1;
          }
        }
      }
    }
    if (dilated) dilated.set(bits, out);
    return out;
  }

  /**
   * How alike two bitmaps are, 0 to 1: the share of each one's ink that the other covers once grown by a pixel.
   * The pixel of slack absorbs where a symbol's edge falls between pixels; it does not hide a missing or extra
   * stroke, or a bold stroke drawn thin, which are several pixels of ink. The grown copies are kept, as one
   * bitmap is compared with many.
   */
  function similarity(a, b) {
    var na = 0, nb = 0, ab = 0, ba = 0;
    var da = dilate(a), db = dilate(b);
    for (var i = 0; i < a.length; i++) {
      if (a[i]) { na++; if (db[i]) ab++; }
      if (b[i]) { nb++; if (da[i]) ba++; }
    }
    return na + nb ? (ab + ba) / (na + nb) : 0;
  }

  /**
   * The candidate most like bits: { index, score }, or null. A match must be close (0.8), and clearly closer than
   * the runner-up, unless the runner-up is the same thread (same `id`); two symbols that look alike to within a
   * pixel are not guessed between.
   *
   * @param {Uint8Array} bits
   * @param {Array<{bits: Uint8Array, id: string}>} candidates
   */
  function bestMatch(bits, candidates) {
    var scores = [];
    var best = -1;
    for (var i = 0; i < (candidates || []).length; i++) {
      scores.push(similarity(bits, candidates[i].bits));
      if (best < 0 || scores[i] > scores[best]) best = i;
    }
    if (best < 0) return null;
    var bestS = scores[best], second = 0;
    for (var j = 0; j < scores.length; j++) {
      if (candidates[j].id !== candidates[best].id && scores[j] > second) second = scores[j];
    }
    if (bestS < 0.8 || bestS - second < 0.02) return null;
    return { index: best, score: bestS };
  }

  /** The bitmap drawn black on white as RGBA, { w, h, data }, for the review's picture of an unmatched symbol. */
  function toRgba(bits) {
    var data = new Uint8ClampedArray(N * N * 4);
    for (var i = 0; i < N * N; i++) {
      var v = bits[i] ? 0 : 255;
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    return { w: N, h: N, data: data };
  }

  var api = {
    N: N, emOf: emOf, bitmap: bitmap, pixelSize: pixelSize, keyOf: keyOf, similarity: similarity, bestMatch: bestMatch,
    toRgba: toRgba,
  };

  if (typeof window !== 'undefined') window.PdfVectorGlyphs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
