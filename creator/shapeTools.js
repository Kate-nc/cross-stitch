/* creator/shapeTools.js — line, rectangle and ellipse cells, and mirror
 * drawing (audit DRAW-04 items 3–4). Pure functions, no React or DOM.
 *
 *   snapLineEnd(x0, y0, x1, y1)        the end moved onto the nearest 0°, 45°
 *                                      or 90° line from the start
 *   shapeLineCells(x0, y0, x1, y1, snap)
 *   rectCells(x0, y0, x1, y1, filled)  the box with those two corners
 *   ellipseCells(x0, y0, x1, y1, filled)
 *                                      the ellipse inside that box
 *   shapeCells(tool, start, end, opts) one of the three, by tool name
 *                                      ("line" | "rect" | "ellipse")
 *
 * Mirror drawing. `mirror` is { on, axis: "v" | "h" | "both", ax, ay }: ax is
 * the vertical axis's x and ay the horizontal axis's y, in grid-line units,
 * so a half-way value (7.5) runs through the middle of a column.
 *
 *   mirrorPoints(x, y, mirror)         the cell and its mirror images:
 *                                      [{ x, y, flipH, flipV }], the cell
 *                                      itself first; images that land on a
 *                                      cell already in the list are dropped
 *   mirrorQuadrant(q, flipH, flipV)    "TL" etc. as seen in a mirror image
 *   mirrorHalf(action, flipH, flipV)   "half-fwd" / "half-bck" as seen in it
 *                                      (one mirror swaps / and \, two don't)
 *   centredMirror(sW, sH, axis)        a mirror about the pattern's centre
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js); also
 * require()-able for tests.
 */
(function (root) {
  function bresenham(x0, y0, x1, y1) {
    var cells = [];
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx + dy;
    for (;;) {
      cells.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return cells;
  }
  // The same Bresenham line a paint stroke follows (useCanvasInteraction).
  var lineCells = root.lineCells || bresenham;

  function snapLineEnd(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0, ax = Math.abs(dx), ay = Math.abs(dy);
    // tan(22.5°) ≈ 0.414: nearer the axis than the diagonal snaps to the axis.
    if (ay <= ax * 0.414) return { x: x1, y: y0 };
    if (ax <= ay * 0.414) return { x: x0, y: y1 };
    var d = Math.round((ax + ay) / 2);
    return { x: x0 + (dx < 0 ? -d : d), y: y0 + (dy < 0 ? -d : d) };
  }

  function shapeLineCells(x0, y0, x1, y1, snap) {
    if (snap) { var e = snapLineEnd(x0, y0, x1, y1); x1 = e.x; y1 = e.y; }
    return lineCells(x0, y0, x1, y1);
  }

  function rectCells(x0, y0, x1, y1, filled) {
    var minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    var out = [];
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        if (filled || x === minX || x === maxX || y === minY || y === maxY) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function ellipseCells(x0, y0, x1, y1, filled) {
    var minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    var w = maxX - minX + 1, h = maxY - minY + 1;
    var cx = minX + w / 2, cy = minY + h / 2, rx = w / 2, ry = h / 2;
    function inside(x, y) {
      if (x < minX || x > maxX || y < minY || y > maxY) return false;
      var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      return nx * nx + ny * ny <= 1.0001;
    }
    var out = [];
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        if (!inside(x, y)) continue;
        // Outline: a cell of the ellipse with a side open to the outside.
        if (filled || !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) out.push({ x: x, y: y });
      }
    }
    return out;
  }

  function shapeCells(tool, start, end, opts) {
    opts = opts || {};
    if (tool === "line") return shapeLineCells(start.x, start.y, end.x, end.y, !!opts.snap);
    if (tool === "rect") return rectCells(start.x, start.y, end.x, end.y, !!opts.filled);
    if (tool === "ellipse") return ellipseCells(start.x, start.y, end.x, end.y, !!opts.filled);
    return [];
  }

  function mirrorPoints(x, y, mirror) {
    var out = [{ x: x, y: y, flipH: false, flipV: false }];
    if (!mirror || !mirror.on) return out;
    var mx = Math.round(2 * mirror.ax - x - 1), my = Math.round(2 * mirror.ay - y - 1);
    var axis = mirror.axis;
    if (axis === "v" || axis === "both") out.push({ x: mx, y: y, flipH: true, flipV: false });
    if (axis === "h" || axis === "both") out.push({ x: x, y: my, flipH: false, flipV: true });
    if (axis === "both") out.push({ x: mx, y: my, flipH: true, flipV: true });
    var seen = {};
    return out.filter(function (p) {
      var k = p.x + "," + p.y;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  var FLIP_H = { TL: "TR", TR: "TL", BL: "BR", BR: "BL" };
  var FLIP_V = { TL: "BL", BL: "TL", TR: "BR", BR: "TR" };
  function mirrorQuadrant(q, flipH, flipV) {
    if (flipH) q = FLIP_H[q];
    if (flipV) q = FLIP_V[q];
    return q;
  }
  function mirrorHalf(action, flipH, flipV) {
    if (flipH === flipV) return action;
    if (action === "half-fwd") return "half-bck";
    if (action === "half-bck") return "half-fwd";
    return action;
  }

  function centredMirror(sW, sH, axis) {
    return { on: true, axis: axis || "v", ax: sW / 2, ay: sH / 2 };
  }

  var api = {
    snapLineEnd: snapLineEnd, shapeLineCells: shapeLineCells, rectCells: rectCells,
    ellipseCells: ellipseCells, shapeCells: shapeCells,
    mirrorPoints: mirrorPoints, mirrorQuadrant: mirrorQuadrant, mirrorHalf: mirrorHalf,
    centredMirror: centredMirror
  };
  root.ShapeTools = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
