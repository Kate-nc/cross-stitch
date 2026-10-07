/* work-area.js — the Stitch Tracker's work area: pure geometry and rules.
   ═══════════════════════════════════════════════════════════════════════════
   A work area is one rectangle of the pattern the stitcher is working on. The
   chart clips to it (plus a faded margin), and the colour list, counts and
   "mark all done" cover only it. It is a group of whole Spotlight sections:
   always aligned to the blockW x blockH section grid, so Spotlight steps
   through the sections inside it. See reports/work-area-prototype.html and
   reports/track-view-performance-plan.md (Phase 3).

   Stored on the project, saved and synced:

     workArea: null                       never used on this project
             | { active, x0, y0, x1, y1, bw, bh, gridW, gridH, setAt }

   Cell coordinates, x1/y1 exclusive. bw/bh are the area's size in sections
   as chosen: an area at the right or bottom edge is clipped by the pattern,
   so its rectangle alone would understate the size the next area should be. `active: false` keeps the last area so
   the picker can offer it again. `setAt` (epoch ms) is when the stitcher last
   chose or left an area: sync keeps whichever device's choice is newer.

   No DOM, no React: loaded as a plain script (window.WorkArea) by the tracker
   and evaluated directly by the Jest suite. */
(function (root) {
  'use strict';

  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  /** A stored work area made safe for a pattern of sW x sH: clamped to the
   *  pattern, or null if nothing usable is left. Never throws on bad input —
   *  this reads whatever a project file or another device wrote. */
  function normalise(raw, sW, sH) {
    if (!raw || typeof raw !== 'object' || !sW || !sH) return null;
    var x0 = raw.x0, y0 = raw.y0, x1 = raw.x1, y1 = raw.y1;
    if (!isInt(x0) || !isInt(y0) || !isInt(x1) || !isInt(y1)) return null;
    x0 = Math.max(0, Math.min(sW, x0)); x1 = Math.max(0, Math.min(sW, x1));
    y0 = Math.max(0, Math.min(sH, y0)); y1 = Math.max(0, Math.min(sH, y1));
    if (x1 <= x0 || y1 <= y0) return null;
    var out = {
      active: !!raw.active,
      x0: x0, y0: y0, x1: x1, y1: y1,
      setAt: isInt(raw.setAt) && raw.setAt > 0 ? raw.setAt : 0
    };
    if (isInt(raw.bw) && raw.bw > 0 && isInt(raw.bh) && raw.bh > 0) { out.bw = raw.bw; out.bh = raw.bh; }
    if (isInt(raw.gridW) && raw.gridW > 0 && isInt(raw.gridH) && raw.gridH > 0) { out.gridW = raw.gridW; out.gridH = raw.gridH; }
    return out;
  }

  /** Rectangle covering sections [bx0, bx0+bw) x [by0, by0+bh), clipped to
   *  the pattern. */
  function fromSections(bx0, by0, bw, bh, blockW, blockH, sW, sH) {
    return {
      x0: Math.max(0, bx0 * blockW),
      y0: Math.max(0, by0 * blockH),
      x1: Math.min(sW, (bx0 + bw) * blockW),
      y1: Math.min(sH, (by0 + bh) * blockH),
      bw: bw, bh: bh
    };
  }

  /** The sections an area covers, as a section-grid rectangle (exclusive
   *  ends). An area whose edges are off the grid (block size changed since it
   *  was chosen) covers every section it touches. */
  function sectionRange(area, blockW, blockH) {
    return {
      bx0: Math.floor(area.x0 / blockW),
      by0: Math.floor(area.y0 / blockH),
      bx1: Math.ceil(area.x1 / blockW),
      by1: Math.ceil(area.y1 / blockH)
    };
  }

  /** Grow an area outward to whole sections. */
  function snapToSections(area, blockW, blockH, sW, sH) {
    var r = sectionRange(area, blockW, blockH);
    return fromSections(r.bx0, r.by0, r.bx1 - r.bx0, r.by1 - r.by0, blockW, blockH, sW, sH);
  }

  /** The area plus `margin` stitches of context on each side, clipped to the
   *  pattern. This is what the chart shows. */
  function bounds(area, margin, sW, sH) {
    var m = Math.max(0, margin | 0);
    return {
      x0: Math.max(0, area.x0 - m),
      y0: Math.max(0, area.y0 - m),
      x1: Math.min(sW, area.x1 + m),
      y1: Math.min(sH, area.y1 + m)
    };
  }

  function contains(area, x, y) {
    return !!area && x >= area.x0 && x < area.x1 && y >= area.y0 && y < area.y1;
  }

  function containsIndex(area, idx, sW) {
    var y = Math.floor(idx / sW);
    return contains(area, idx - y * sW, y);
  }

  function sameRect(a, b) {
    return !!a && !!b && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
  }

  /** "Columns 101–150 · Rows 151–200": the same numbers as the chart rulers. */
  function describe(area) {
    return 'Columns ' + (area.x0 + 1) + '–' + area.x1 + ' · Rows ' + (area.y0 + 1) + '–' + area.y1;
  }

  /** The next (dir = 1) or previous (dir = -1) area of the same size in
   *  reading order, on a grid aligned to this area, skipping any for which
   *  `isFinished(rect)` is true. Null when there is none. Edge areas are
   *  clipped to the pattern, so they can be smaller; the size stepped by is
   *  the area's own bw/bh when it has them, so a clipped edge area does not
   *  shrink every area after it. The result carries bw/bh for the same
   *  reason. */
  function step(area, dir, blockW, blockH, sW, sH, isFinished) {
    var r = sectionRange(area, blockW, blockH);
    var bw = isInt(area.bw) && area.bw > 0 ? area.bw : Math.max(1, r.bx1 - r.bx0);
    var bh = isInt(area.bh) && area.bh > 0 ? area.bh : Math.max(1, r.by1 - r.by0);
    var nbx = Math.ceil(sW / blockW), nby = Math.ceil(sH / blockH);
    var cols = [], rows = [];
    for (var x = r.bx0 % bw; x < nbx; x += bw) cols.push(x);
    for (var y = r.by0 % bh; y < nby; y += bh) rows.push(y);
    var at = -1, list = [];
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < cols.length; i++) {
      if (cols[i] === r.bx0 && rows[j] === r.by0) at = list.length;
      list.push([cols[i], rows[j]]);
    }
    for (var k = at + dir; k >= 0 && k < list.length; k += dir) {
      var cand = fromSections(list[k][0], list[k][1], bw, bh, blockW, blockH, sW, sH);
      cand.bw = bw; cand.bh = bh;
      if (cand.x1 > cand.x0 && cand.y1 > cand.y0 && !(isFinished && isFinished(cand))) return cand;
    }
    return null;
  }

  /** Sync: the newer choice wins. Either side may be null (never used); a
   *  missing setAt counts as oldest, and a tie keeps the local value so a
   *  repeated merge is a no-op. */
  function merge(local, remote) {
    if (!remote) return local || null;
    if (!local) return remote;
    var lt = isInt(local.setAt) ? local.setAt : 0;
    var rt = isInt(remote.setAt) ? remote.setAt : 0;
    return rt > lt ? remote : local;
  }

  var api = {
    normalise: normalise,
    fromSections: fromSections,
    sectionRange: sectionRange,
    snapToSections: snapToSections,
    bounds: bounds,
    contains: contains,
    containsIndex: containsIndex,
    sameRect: sameRect,
    describe: describe,
    step: step,
    merge: merge,
    DEFAULT_MARGIN: 3
  };
  root.WorkArea = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
