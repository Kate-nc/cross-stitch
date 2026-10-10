/* creator/selectionTransforms.js — copy, paste, flip and rotate for a
 * selection (audit DRAW-04 items 1–2). Pure functions, no React or DOM.
 *
 * A "clip" is the selected part of a pattern, cut out of its bounding box:
 *
 *   { w, h,                 size of the bounding box in stitches
 *     sel:   Uint8Array(w*h)   1 where the cell was selected (the clip's shape)
 *     cells: Array(w*h)        the full or blend stitch there, or null (an
 *                              empty or background cell, pasted as nothing)
 *     ps:    Array(w*h)        the cell's part stitches {TL,TR,BL,BR}, or null
 *     bs:    [lines]           backstitch lines with both ends inside the box,
 *                              in clip-local grid-vertex units (0..w, 0..h);
 *                              any other fields on a line (a thread id) are kept
 *     srcX, srcY }            where the box's top-left cell was copied from
 *
 * Part stitches are quadrants: a half stitch "/" is BL+TR and "\" is TL+BR,
 * so mapping the quadrants flips a half stitch's direction as it should.
 *
 *   extractClip(pat, ps, bsLines, mask, sW, sH)  -> clip | null
 *   transformClip(clip, op)       op: "flipH" | "flipV" | "rotCW" | "rotCCW"
 *   rotatedOrigin(clip, ox, oy)   top-left that keeps a rotated clip centred
 *   liftSelection(pat, ps, bsLines, mask, sW, sH)
 *                                 the pattern with the selection taken out
 *   placeClip(base, clip, ox, oy, sW, sH)
 *                                 base {pat, ps, bsLines} with the clip on top:
 *                                 { pat, ps, bsLines, mask, clipped }
 *   diffForHistory(before, after) one undo entry's changes between two states
 *   clipStitchCount(clip)         full stitches in the clip
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js); also
 * require()-able for tests.
 */
(function (root) {
  var EMPTY = { id: "__empty__", rgb: [255, 255, 255] };
  var QUADS = ["TL", "TR", "BL", "BR"];
  var QUAD_MAP = {
    flipH:  { TL: "TR", TR: "TL", BL: "BR", BR: "BL" },
    flipV:  { TL: "BL", BL: "TL", TR: "BR", BR: "TR" },
    rotCW:  { TL: "TR", TR: "BR", BR: "BL", BL: "TL" },
    rotCCW: { TL: "BL", BL: "BR", BR: "TR", TR: "TL" }
  };

  function isStitch(cell) {
    return !!cell && cell.id !== "__skip__" && cell.id !== "__empty__";
  }
  function copy(o) { return o ? Object.assign({}, o) : o; }

  function bboxOf(mask, sW, sH) {
    var minX = sW, minY = sH, maxX = -1, maxY = -1;
    for (var i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      var x = i % sW, y = (i - x) / sW;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return maxX < 0 ? null : { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  // A line belongs to the box when both ends are on or inside its edges
  // (the same rule Move uses).
  function lineInBox(ln, b) {
    return ln && ln.x1 >= b.minX && ln.x1 <= b.maxX + 1 && ln.y1 >= b.minY && ln.y1 <= b.maxY + 1 &&
      ln.x2 >= b.minX && ln.x2 <= b.maxX + 1 && ln.y2 >= b.minY && ln.y2 <= b.maxY + 1;
  }

  function extractClip(pat, ps, bsLines, mask, sW, sH) {
    if (!pat || !mask) return null;
    var b = bboxOf(mask, sW, sH);
    if (!b) return null;
    var w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1, n = w * h;
    var clip = { w: w, h: h, sel: new Uint8Array(n), cells: new Array(n), ps: new Array(n), bs: [], srcX: b.minX, srcY: b.minY };
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var li = y * w + x, gi = (b.minY + y) * sW + b.minX + x;
        clip.cells[li] = null; clip.ps[li] = null;
        if (!mask[gi]) continue;
        clip.sel[li] = 1;
        if (isStitch(pat[gi])) clip.cells[li] = copy(pat[gi]);
        var p = ps && ps.get ? ps.get(gi) : null;
        if (p) clip.ps[li] = copy(p);
      }
    }
    (bsLines || []).forEach(function (ln) {
      if (!lineInBox(ln, b)) return;
      clip.bs.push(Object.assign({}, ln, { x1: ln.x1 - b.minX, y1: ln.y1 - b.minY, x2: ln.x2 - b.minX, y2: ln.y2 - b.minY }));
    });
    return clip;
  }

  // Where cell (x, y) of a w × h clip lands, and the new size.
  function cellMap(op, w, h) {
    switch (op) {
      case "flipH":  return { w: w, h: h, f: function (x, y) { return [w - 1 - x, y]; } };
      case "flipV":  return { w: w, h: h, f: function (x, y) { return [x, h - 1 - y]; } };
      case "rotCW":  return { w: h, h: w, f: function (x, y) { return [h - 1 - y, x]; } };
      case "rotCCW": return { w: h, h: w, f: function (x, y) { return [y, w - 1 - x]; } };
    }
    throw new Error("Unknown transform " + op);
  }
  // The same for a grid vertex (0..w, 0..h), used by backstitch ends.
  function vertexMap(op, w, h) {
    switch (op) {
      case "flipH":  return function (x, y) { return [w - x, y]; };
      case "flipV":  return function (x, y) { return [x, h - y]; };
      case "rotCW":  return function (x, y) { return [h - y, x]; };
      case "rotCCW": return function (x, y) { return [y, w - x]; };
    }
  }

  function transformPartial(p, op) {
    if (!p) return null;
    var m = QUAD_MAP[op], out = {};
    Object.keys(p).forEach(function (k) {
      if (QUADS.indexOf(k) === -1) out[k] = p[k];
    });
    QUADS.forEach(function (q) { if (p[q]) out[m[q]] = copy(p[q]); });
    return out;
  }

  function transformClip(clip, op) {
    var cm = cellMap(op, clip.w, clip.h), vm = vertexMap(op, clip.w, clip.h);
    var n = cm.w * cm.h;
    var out = { w: cm.w, h: cm.h, sel: new Uint8Array(n), cells: new Array(n), ps: new Array(n), bs: [], srcX: clip.srcX, srcY: clip.srcY };
    for (var i = 0; i < n; i++) { out.cells[i] = null; out.ps[i] = null; }
    for (var y = 0; y < clip.h; y++) {
      for (var x = 0; x < clip.w; x++) {
        var li = y * clip.w + x;
        if (!clip.sel[li]) continue;
        var t = cm.f(x, y), ni = t[1] * cm.w + t[0];
        out.sel[ni] = 1;
        out.cells[ni] = copy(clip.cells[li]);
        out.ps[ni] = transformPartial(clip.ps[li], op);
      }
    }
    clip.bs.forEach(function (ln) {
      var a = vm(ln.x1, ln.y1), b = vm(ln.x2, ln.y2);
      out.bs.push(Object.assign({}, ln, { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
    });
    return out;
  }

  // A quarter turn swaps width and height; move the top-left so the clip
  // turns about its centre rather than its corner.
  function rotatedOrigin(clip, ox, oy) {
    return { x: ox + Math.round((clip.w - clip.h) / 2), y: oy + Math.round((clip.h - clip.w) / 2) };
  }

  function liftSelection(pat, ps, bsLines, mask, sW, sH) {
    var np = pat.slice(), nps = new Map(ps || []);
    for (var i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      if (isStitch(pat[i])) np[i] = copy(EMPTY);
      nps.delete(i);
    }
    var b = bboxOf(mask, sW, sH);
    var nbs = b ? (bsLines || []).filter(function (ln) { return !lineInBox(ln, b); }) : (bsLines || []).slice();
    return { pat: np, ps: nps, bsLines: nbs };
  }

  function placeClip(base, clip, ox, oy, sW, sH) {
    var np = base.pat.slice(), nps = new Map(base.ps || []);
    var mask = new Uint8Array(sW * sH), clipped = false;
    for (var y = 0; y < clip.h; y++) {
      for (var x = 0; x < clip.w; x++) {
        var li = y * clip.w + x;
        if (!clip.sel[li]) continue;
        var gx = ox + x, gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= sW || gy >= sH) {
          if (clip.cells[li] || clip.ps[li]) clipped = true;
          continue;
        }
        var gi = gy * sW + gx;
        mask[gi] = 1;
        if (clip.cells[li]) np[gi] = copy(clip.cells[li]);
        if (clip.ps[li]) nps.set(gi, copy(clip.ps[li]));
      }
    }
    var nbs = (base.bsLines || []).slice();
    clip.bs.forEach(function (ln) {
      var l = Object.assign({}, ln, { x1: ln.x1 + ox, y1: ln.y1 + oy, x2: ln.x2 + ox, y2: ln.y2 + oy });
      var inside = [l.x1, l.x2].every(function (v) { return v >= 0 && v <= sW; }) &&
        [l.y1, l.y2].every(function (v) { return v >= 0 && v <= sH; });
      if (inside) nbs.push(l); else clipped = true;
    });
    return { pat: np, ps: nps, bsLines: nbs, mask: mask, clipped: clipped };
  }

  // Whole stored values are compared, so a paste that swaps a stitch for
  // one with the same id but another colour or extra fields is still undone.
  function sameValue(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }
  var sameCell = sameValue, samePartial = sameValue;
  function sameLines(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false;
    }
    return true;
  }

  // The fields of a generic useEditHistory entry: changes [{idx, old}],
  // psChanges [{idx, old|null}] and the old bsLines when they changed.
  function diffForHistory(before, after) {
    var changes = [], psChanges = [];
    for (var i = 0; i < before.pat.length; i++) {
      if (!sameCell(before.pat[i], after.pat[i])) changes.push({ idx: i, old: copy(before.pat[i]) });
    }
    var seen = {};
    function cmp(idx) {
      if (seen[idx]) return;
      seen[idx] = true;
      var a = before.ps ? before.ps.get(idx) : null, b = after.ps ? after.ps.get(idx) : null;
      if (!samePartial(a, b)) psChanges.push({ idx: idx, old: a ? copy(a) : null });
    }
    if (before.ps) before.ps.forEach(function (_, idx) { cmp(idx); });
    if (after.ps) after.ps.forEach(function (_, idx) { cmp(idx); });
    var bsChanged = !sameLines(before.bsLines, after.bsLines);
    return {
      changes: changes,
      psChanges: psChanges.length ? psChanges : undefined,
      bsLines: bsChanged ? (before.bsLines || []).slice() : undefined,
      empty: !changes.length && !psChanges.length && !bsChanged
    };
  }

  function clipStitchCount(clip) {
    var n = 0;
    for (var i = 0; i < clip.cells.length; i++) if (clip.cells[i]) n++;
    return n;
  }

  var api = {
    extractClip: extractClip, transformClip: transformClip, rotatedOrigin: rotatedOrigin,
    liftSelection: liftSelection, placeClip: placeClip, diffForHistory: diffForHistory,
    clipStitchCount: clipStitchCount, selectionBBox: bboxOf
  };
  root.SelectionTransforms = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
