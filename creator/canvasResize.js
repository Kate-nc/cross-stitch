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
