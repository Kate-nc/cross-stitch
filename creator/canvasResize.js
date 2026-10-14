/* creator/canvasResize.js ─────────────────────────────────────────────────
   Pure canvas-resize / crop transform for cross-stitch patterns.
   No DOM, no React, no side effects.

   Exposed as window.applyCanvasResize for use by ResizeCanvasModal.

   Spec:
     { newW, newH, offsetX, offsetY }

   offsetX / offsetY define where the OLD grid origin (0,0) appears in the
   NEW grid.  Positive values shift the old content right/down (expand or pad
   on top/left); negative values crop from the top/left.

   Examples:
     Crop 5 cols from the left:     offsetX = -5
     Add 10 blank rows above:       offsetY = +10
     Centre old 80×80 in new 100×100:  offsetX = 10, offsetY = 10

   Returns null when validation fails, otherwise:
     {
       newPat, newBsLines, newDone, newPartialStitches, newParkMarkers,
       deletedStitchCount, deletedBsCount, progressAffected
     }
   ────────────────────────────────────────────────────────────────────────── */

window.applyCanvasResize = function applyCanvasResize(
  pat, bsLines, done, partialStitches, parkMarkers, sW, sH, spec
) {
  // ── Validation ─────────────────────────────────────────────────────────────
  if (!spec) return null;
  var newW = spec.newW, newH = spec.newH;
  var offsetX = spec.offsetX || 0, offsetY = spec.offsetY || 0;

  if (
    !Number.isInteger(newW) || newW < 1 ||
    !Number.isInteger(newH) || newH < 1 ||
    !Number.isInteger(offsetX) ||
    !Number.isInteger(offsetY)
  ) return null;

  if (!pat || !Array.isArray(pat)) return null;

  // ── Pattern transform ───────────────────────────────────────────────────────
  var newPat = new Array(newW * newH);
  // Fill all cells with __empty__ first
  for (var fi = 0; fi < newPat.length; fi++) {
    newPat[fi] = { id: "__empty__" };
  }

  var deletedStitchCount = 0;
  var newDone = null;
  var progressAffected = false;

  var hasDone = done !== null && done !== undefined;
  if (hasDone) {
    newDone = new Uint8Array(newW * newH); // initialises to 0
  }

  var newPartialStitches = new Map();
  var hasParts = partialStitches instanceof Map && partialStitches.size > 0;

  for (var oldRow = 0; oldRow < sH; oldRow++) {
    for (var oldCol = 0; oldCol < sW; oldCol++) {
      var newCol = oldCol + offsetX;
      var newRow = oldRow + offsetY;

      var oldIdx = oldRow * sW + oldCol;
      var cell = pat[oldIdx];

      var withinBounds =
        newCol >= 0 && newCol < newW &&
        newRow >= 0 && newRow < newH;

      if (withinBounds) {
        var newIdx = newRow * newW + newCol;
        newPat[newIdx] = cell;

        if (hasDone) {
          newDone[newIdx] = done[oldIdx] ? 1 : 0;
        }

        if (hasParts && partialStitches.has(oldIdx)) {
          newPartialStitches.set(newIdx, partialStitches.get(oldIdx));
        }
      } else {
        // Cell is being cropped out
        if (cell && cell.id !== "__skip__" && cell.id !== "__empty__") {
          deletedStitchCount++;
          if (hasDone && done[oldIdx]) {
            progressAffected = true;
          }
        }
      }
    }
  }

  // ── Backstitch transform ────────────────────────────────────────────────────
  var newBsLines = [];
  var deletedBsCount = 0;

  for (var bi = 0; bi < bsLines.length; bi++) {
    var ln = bsLines[bi];
    var nx1 = ln.x1 + offsetX;
    var ny1 = ln.y1 + offsetY;
    var nx2 = ln.x2 + offsetX;
    var ny2 = ln.y2 + offsetY;

    // Lattice space: x in [0, newW], y in [0, newH] (inclusive upper bound)
    var kept =
      nx1 >= 0 && nx1 <= newW &&
      ny1 >= 0 && ny1 <= newH &&
      nx2 >= 0 && nx2 <= newW &&
      ny2 >= 0 && ny2 <= newH;

    if (kept) {
      // Rebuild entry with remapped coordinates; preserve any extra fields
      var newLn = { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
      if (ln.colorId !== undefined) newLn.colorId = ln.colorId;
      if (ln.color !== undefined)   newLn.color   = ln.color;
      newBsLines.push(newLn);
    } else {
      deletedBsCount++;
    }
  }

  // ── Park markers transform ──────────────────────────────────────────────────
  var newParkMarkers = [];
  for (var pi = 0; pi < parkMarkers.length; pi++) {
    var pm = parkMarkers[pi];
    var pmX = pm.x + offsetX;
    var pmY = pm.y + offsetY;
    if (pmX >= 0 && pmX < newW && pmY >= 0 && pmY < newH) {
      newParkMarkers.push({ x: pmX, y: pmY, colorId: pm.colorId });
    }
  }

  return {
    newPat: newPat,
    newBsLines: newBsLines,
    newDone: newDone,
    newPartialStitches: newPartialStitches,
    newParkMarkers: newParkMarkers,
    deletedStitchCount: deletedStitchCount,
    deletedBsCount: deletedBsCount,
    progressAffected: progressAffected
  };
};

// Remap Tracker's sparse arrays with the same origin as the pattern. Kept
// threads are copied intact (including blend, brand and direction metadata).
window.remapCanvasTracking = function(halfStitches, halfDone, partialDone, partialStitches, oldW, oldH, spec, defaultBrand) {
  var halves = new Map(), marks = new Map(), quarters = new Map();
  function move(idx) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= oldW * oldH) return null;
    var x = idx % oldW + (spec.offsetX || 0), y = Math.floor(idx / oldW) + (spec.offsetY || 0);
    return x >= 0 && x < spec.newW && y >= 0 && y < spec.newH ? y * spec.newW + x : null;
  }
  (halfStitches || []).forEach(function(e) {
    var idx = move(e[0]);
    if (idx === null || !e[1]) return;
    var cell = {};
    ["fwd", "bck"].forEach(function(side) {
      if (e[1][side]) cell[side] = Object.assign({}, e[1][side]);
    });
    if (cell.fwd || cell.bck) halves.set(idx, cell);
  });
  (halfDone || []).forEach(function(e) {
    var idx = move(e[0]), cell = halves.get(idx);
    if (!cell || !e[1]) return;
    var done = {};
    ["fwd", "bck"].forEach(function(side) { if (cell[side] && e[1][side]) done[side] = true; });
    if (done.fwd || done.bck) marks.set(idx, done);
  });
  (partialDone || []).forEach(function(e) {
    var idx = move(e[0]), cell = partialStitches.get(idx);
    if (!cell || !Array.isArray(e[1])) return;
    var kept = e[1].filter(function(q) { return ["TL", "TR", "BL", "BR"].indexOf(q) !== -1 && cell[q]; });
    if (kept.length) quarters.set(idx, new Set(kept));
  });
  // The legacy mark is authoritative for equivalent quarters. Keep the modern
  // save consistent even when an older project only carried halfDone.
  halves.forEach(function(hs, idx) {
    var cell = partialStitches.get(idx), hd = marks.get(idx) || {};
    if (!cell) return;
    var set = quarters.get(idx) || new Set();
    ["fwd", "bck"].forEach(function(side) {
      var thread = hs[side], pair = side === "fwd" ? ["BL", "TR"] : ["TL", "BR"];
      if (!thread || !pair.every(function(q) { return cell[q] && cell[q].id === thread.id && (cell[q].brand || defaultBrand || "dmc") === (thread.brand || defaultBrand || "dmc"); })) return;
      pair.forEach(function(q) { if (hd[side]) set.add(q); else set.delete(q); });
    });
    if (set.size) quarters.set(idx, set); else quarters.delete(idx);
  });
  return {
    halfStitches: Array.from(halves), halfDone: Array.from(marks),
    partialDone: Array.from(quarters, function(e) { return [e[0], ["TL", "TR", "BL", "BR"].filter(function(q) { return e[1].has(q); })]; })
  };
};
