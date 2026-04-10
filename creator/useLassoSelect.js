/* creator/useLassoSelect.js — Lasso / freehand / magnetic selection engine.
   Provides three lasso sub-modes that all produce a selectionMask compatible
   with the magic wand system (same Uint8Array format, same opMode merging).

   Sub-modes:
     "freehand"  — drag-paint: cells the cursor passes through are selected.
     "polygon"   — click to place anchor points; auto-closes when cursor nears
                   the starting point; finalises with a point-in-polygon test.
     "magnetic"  — like polygon but each step snaps to the nearest colour-edge
                   boundary as the user drags.

   Exposed via window.useLassoSelect(state).
   Depends on globals: React (CDN), rgbToLab (colour-utils.js) */

window.useLassoSelect = function useLassoSelect(state) {
  var useState = React.useState;
  var useMemo  = React.useMemo;

  // ─── Lasso state ─────────────────────────────────────────────────────────────
  // Which lasso sub-tool is active:  null | "freehand" | "polygon" | "magnetic"
  var _lm  = useState(null);
  var lassoMode = _lm[0], setLassoMode = _lm[1];

  // Points accumulated during the current in-progress lasso gesture.
  // For freehand: every cell coord touched.
  // For polygon/magnetic: the placed anchor points.
  var _pts = useState(null);   // null | Array<{x,y}>
  var lassoPoints = _pts[0], setLassoPoints = _pts[1];

  // Whether a drag/trace gesture is currently active (mousedown held).
  var _act = useState(false);
  var lassoActive = _act[0], setLassoActive = _act[1];

  // Cursor position (grid coords) for live preview line in polygon/magnetic mode.
  var _cur = useState(null);   // null | {x,y}
  var lassoCursor = _cur[0], setLassoCursor = _cur[1];

  // Live preview mask shown while the gesture is in progress.
  var _pv  = useState(null);   // Uint8Array | null
  var lassoPreviewMask = _pv[0], setLassoPreviewMask = _pv[1];

  // opMode to use when finalising (mirrors wandOpMode, defaults to "replace").
  var _op  = useState("replace");
  var lassoOpMode = _op[0], setLassoOpMode = _op[1];

  // ─── Grid helpers ─────────────────────────────────────────────────────────────

  // Bresenham line — returns all integer grid cells on the segment from (x0,y0) to (x1,y1)
  function bresenham(x0, y0, x1, y1) {
    var cells = [];
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    for (;;) {
      cells.push({ x: x0, y: y0 });
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }
    return cells;
  }

  // Point-in-polygon test for integer grid cell centres.
  // `poly` is an Array of {x,y} in grid coords.
  // Uses the ray-casting algorithm.
  function cellsInPolygon(poly, sW, sH) {
    var mask = new Uint8Array(sW * sH);
    if (poly.length < 3) return mask;

    // Axis-aligned bounding box to limit the scan
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var k = 0; k < poly.length; k++) {
      if (poly[k].x < minX) minX = poly[k].x;
      if (poly[k].x > maxX) maxX = poly[k].x;
      if (poly[k].y < minY) minY = poly[k].y;
      if (poly[k].y > maxY) maxY = poly[k].y;
    }
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(sW - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(sH - 1, Math.ceil(maxY));

    for (var cy = minY; cy <= maxY; cy++) {
      for (var cx = minX; cx <= maxX; cx++) {
        var px = cx + 0.5, py = cy + 0.5;  // cell centre
        var inside = false;
        var j = poly.length - 1;
        for (var i = 0; i < poly.length; i++) {
          var xi = poly[i].x, yi = poly[i].y;
          var xj = poly[j].x, yj = poly[j].y;
          if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
          }
          j = i;
        }
        if (inside) mask[cy * sW + cx] = 1;
      }
    }
    return mask;
  }

  // Merge newMask into an existing selection mask — matches useMagicWand.mergeMasks
  function mergeMasks(existing, newMask, opMode, size) {
    var out = new Uint8Array(size);
    for (var i = 0; i < size; i++) {
      var e = existing ? existing[i] : 0;
      var n = newMask[i];
      if (opMode === "add")        out[i] = (e || n) ? 1 : 0;
      else if (opMode === "subtract")  out[i] = (e && !n) ? 1 : 0;
      else if (opMode === "intersect") out[i] = (e && n)  ? 1 : 0;
      else                         out[i] = n;  // replace
    }
    return out;
  }

  // ─── Magnetic-lasso helpers ───────────────────────────────────────────────────

  // Returns a LAB value for a grid cell (uses cmap entry if available).
  function cellLab(pat, cmap, idx) {
    var cell = pat[idx];
    if (!cell || cell.id === "__skip__" || cell.id === "__empty__") return null;
    var entry = cmap ? cmap[cell.id] : null;
    if (entry && entry.lab) return entry.lab;
    var rgb = (entry && entry.rgb) ? entry.rgb : (cell.rgb || null);
    if (!rgb) return null;
    if (typeof rgbToLab === "function") return rgbToLab(rgb[0], rgb[1], rgb[2]);
    return { L: rgb[0], a: rgb[1], b: rgb[2] };
  }

  // Colour-edge strength at a position: maximum LAB ΔE to any 4-connected neighbour.
  // Higher value = stronger edge (bigger colour difference).
  function edgeStrength(pat, cmap, sW, sH, x, y) {
    var idx  = y * sW + x;
    var lab0 = cellLab(pat, cmap, idx);
    if (!lab0) return 0;
    var maxDE = 0;
    var nbrs = [];
    if (x > 0)      nbrs.push(y  * sW + (x - 1));
    if (x < sW - 1) nbrs.push(y  * sW + (x + 1));
    if (y > 0)      nbrs.push((y - 1) * sW + x);
    if (y < sH - 1) nbrs.push((y + 1) * sW + x);
    for (var n = 0; n < nbrs.length; n++) {
      var lab1 = cellLab(pat, cmap, nbrs[n]);
      if (!lab1) continue;
      var dL = lab0.L - lab1.L, da = lab0.a - lab1.a, db = lab0.b - lab1.b;
      var de = Math.sqrt(dL * dL + da * da + db * db);
      if (de > maxDE) maxDE = de;
    }
    return maxDE;
  }

  function buildEdgeWindow(sW, sH, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var pad = Math.max(8, Math.min(36, Math.ceil(Math.max(dx, dy) * 0.35)));
    return {
      minX: Math.max(0, Math.min(x0, x1) - pad),
      maxX: Math.min(sW - 1, Math.max(x0, x1) + pad),
      minY: Math.max(0, Math.min(y0, y1) - pad),
      maxY: Math.min(sH - 1, Math.max(y0, y1) + pad)
    };
  }

  // Intelligent scissors / magnetic lasso: finds the cost-minimal path between
  // two grid points that prefers to follow colour boundaries.
  // Uses A* on a bounded 8-connected window so longer segments still resolve.
  // Returns an array of {x,y} grid points on the path.
  function magneticPath(pat, cmap, sW, sH, x0, y0, x1, y1) {
    if (x0 === x1 && y0 === y1) return [{ x: x0, y: y0 }];
    var win = buildEdgeWindow(sW, sH, x0, y0, x1, y1);
    var size = sW * sH;
    var dist = new Float32Array(size).fill(Infinity);
    var prev = new Int32Array(size).fill(-1);
    var start = y0 * sW + x0;
    var end   = y1 * sW + x1;
    dist[start] = 0;

    function heuristic(x, y) {
      return Math.sqrt(Math.pow(x1 - x, 2) + Math.pow(y1 - y, 2)) * 0.35;
    }

    var heap = [{ idx: start, cost: heuristic(x0, y0) }];
    var closed = new Uint8Array(size);

    while (heap.length > 0) {
      heap.sort(function(a, b) { return a.cost - b.cost; });
      var top = heap.shift();
      var cur = top.idx;
      if (cur === end) break;
      if (closed[cur]) continue;
      closed[cur] = 1;

      var cx2 = cur % sW, cy2 = Math.floor(cur / sW);
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = cx2 + dx, ny = cy2 + dy;
          if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
          if (nx < win.minX || nx > win.maxX || ny < win.minY || ny > win.maxY) continue;
          var ni = ny * sW + nx;
          if (closed[ni]) continue;
          var es = edgeStrength(pat, cmap, sW, sH, nx, ny);
          var move = (dx !== 0 && dy !== 0) ? 1.41421356237 : 1.0;
          var edgeReward = Math.min(0.82, es / 36);
          var centerBias = 0;
          if (dx !== 0 && dy !== 0) centerBias = 0.04;
          var nd = dist[cur] + move * (1 - edgeReward) + centerBias;
          if (nd < dist[ni]) {
            dist[ni] = nd;
            prev[ni] = cur;
            heap.push({ idx: ni, cost: nd + heuristic(nx, ny) });
          }
        }
      }
    }

    if (prev[end] === -1) return bresenham(x0, y0, x1, y1);

    var path = [];
    var c = end;
    while (c !== -1 && c !== start) {
      path.push({ x: c % sW, y: Math.floor(c / sW) });
      c = prev[c];
    }
    path.push({ x: x0, y: y0 });
    path.reverse();
    return path;
  }

  function buildBoundaryPath(pts, mode, pat, cmap, sW, sH, includeClose) {
    var boundary = [];
    if (!pts || pts.length < 1) return boundary;
    if (mode === "freehand") return pts.slice();
    for (var s = 0; s < pts.length - 1; s++) {
      var seg = mode === "magnetic" && pat
        ? magneticPath(pat, cmap, sW, sH, pts[s].x, pts[s].y, pts[s + 1].x, pts[s + 1].y)
        : bresenham(pts[s].x, pts[s].y, pts[s + 1].x, pts[s + 1].y);
      for (var b = 0; b < seg.length; b++) {
        if (s > 0 && b === 0) continue;
        boundary.push(seg[b]);
      }
    }
    if (includeClose && pts.length > 1) {
      var closeSeg = mode === "magnetic" && pat
        ? magneticPath(pat, cmap, sW, sH, pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y)
        : bresenham(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
      for (var c2 = 1; c2 < closeSeg.length; c2++) boundary.push(closeSeg[c2]);
    }
    return boundary;
  }

  // Build a mask for a polygon-lasso from the current lassoPoints + snap path.
  // For magnetic: we expand each segment into a Bresenham/magnetic line first,
  //               building the full boundary polygon, then fill with ray-casting.
  function buildMaskFromPoints(pts, mode, pat, cmap, sW, sH) {
    if (!pts || pts.length < 2) return new Uint8Array(sW * sH);
    if (mode === "freehand") {
      // For freehand, pts contains every cell touched — mark them all selected
      var fm = new Uint8Array(sW * sH);
      for (var f = 0; f < pts.length; f++) {
        var fx = pts[f].x, fy = pts[f].y;
        if (fx >= 0 && fx < sW && fy >= 0 && fy < sH) fm[fy * sW + fx] = 1;
      }
      return fm;
    }
    // For polygon and magnetic: expand segments into dense boundary, then fill
    var boundary = buildBoundaryPath(pts, mode, pat, cmap, sW, sH, true);
    return cellsInPolygon(boundary, sW, sH);
  }

  // ─── Public actions ───────────────────────────────────────────────────────────

  // Called on mousedown when a lasso tool is active.
  function startLasso(gx, gy, opMode) {
    setLassoActive(true);
    setLassoCursor({ x: gx, y: gy });
    setLassoOpMode(opMode || "replace");
    var mode = lassoMode;
    if (mode === "freehand") {
      setLassoPoints([{ x: gx, y: gy }]);
      setLassoPreviewMask(null);
    } else {
      // polygon / magnetic: place first anchor
      var existing = lassoPoints;
      if (!existing || existing.length === 0) {
        setLassoPoints([{ x: gx, y: gy }]);
      } else {
        // Add another anchor to existing path
        setLassoPoints(function(prev) { return prev.concat([{ x: gx, y: gy }]); });
      }
      setLassoPreviewMask(null);
    }
  }

  // Called on mousemove when lasso is active.
  function extendLasso(gx, gy) {
    setLassoCursor({ x: gx, y: gy });
    var mode = lassoMode;
    var pts  = lassoPoints;
    if (!pts) return;

    if (mode === "freehand") {
      // Expand path with all cells on the line from last point to current
      var last = pts[pts.length - 1];
      if (last.x === gx && last.y === gy) return;
      var seg = bresenham(last.x, last.y, gx, gy);
      var newPts = pts.concat(seg.slice(1));
      setLassoPoints(newPts);
      // Update live preview mask
      var sW = state.sW, sH = state.sH;
      var pm = new Uint8Array(sW * sH);
      for (var i = 0; i < newPts.length; i++) {
        var nx = newPts[i].x, ny = newPts[i].y;
        if (nx >= 0 && nx < sW && ny >= 0 && ny < sH) pm[ny * sW + nx] = 1;
      }
      setLassoPreviewMask(pm);
    }
    // polygon/magnetic: just update cursor for live preview line — no preview mask
    // (mask is only built on finalize to keep it snappy)
  }

  // Finalise the current lasso gesture and commit to the selection mask.
  // For freehand: commits the painted cells.
  // For polygon/magnetic: performs point-in-polygon fill and commits.
  function finalizeLasso(overrideOpMode) {
    var mode = lassoMode;
    var pts  = lassoPoints;
    var pat  = state.pat, cmap = state.cmap, sW = state.sW, sH = state.sH;
    var opMode = overrideOpMode || lassoOpMode || "replace";
    if (!pts || pts.length < 2) {
      cancelLasso();
      return;
    }
    var newMask = buildMaskFromPoints(pts, mode, pat, cmap, sW, sH);
    var merged  = mergeMasks(state.selectionMask, newMask, opMode, sW * sH);
    state.setSelectionMask(merged);
    setLassoPoints(null);
    setLassoActive(false);
    setLassoCursor(null);
    setLassoPreviewMask(null);
  }

  // Discard the in-progress lasso gesture.
  function cancelLasso() {
    setLassoPoints(null);
    setLassoActive(false);
    setLassoCursor(null);
    setLassoPreviewMask(null);
  }

  // Check whether the cursor is close enough to the start point to auto-close
  // the polygon (used for click-placement polygon mode).
  function isNearStart(gx, gy, threshold) {
    var pts = lassoPoints;
    if (!pts || pts.length < 3) return false;
    var t = threshold === undefined ? 1.5 : threshold;
    var dx = gx - pts[0].x, dy = gy - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy) <= t;
  }

  // Derived: number of points in the current lasso path
  var lassoPointCount = useMemo(function() {
    return lassoPoints ? lassoPoints.length : 0;
  }, [lassoPoints]);

  var lassoInProgress = lassoActive || (lassoPoints && lassoPoints.length > 0 && (lassoMode === "polygon" || lassoMode === "magnetic"));

  return {
    lassoMode, setLassoMode,
    lassoPoints, setLassoPoints,
    lassoActive, setLassoActive,
    lassoCursor, setLassoCursor,
    lassoPreviewMask, setLassoPreviewMask,
    lassoOpMode, setLassoOpMode,
    lassoPointCount, lassoInProgress,
    startLasso, extendLasso, finalizeLasso, cancelLasso, isNearStart,
    // expose helpers for overlay rendering (called from canvasRenderer)
    bresenham: bresenham,
    magneticPath: magneticPath,
    buildBoundaryPath: buildBoundaryPath,
  };
};
