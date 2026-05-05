/* creator/useMagicWand.js — Magic Wand selection engine.
   Provides flood-fill + global colour selection, modifier key modes,
   and all Phase-2/3 selection-based operations.
   Depends on globals: React, skeinEst (helpers.js), rgbToLab (colour-utils.js), DMC */

window.useMagicWand = function useMagicWand(state) {
  var useMemo = React.useMemo;

  // ─── Wand UI state (owned here, exposed via return) ──────────────────────────
  var _mask       = React.useState(null);    // Uint8Array|null, length = sW*sH
  var selectionMask = _mask[0], setSelectionMask = _mask[1];
  var _tol        = React.useState(0);
  var wandTolerance = _tol[0], setWandTolerance = _tol[1];
  var _contiguous = React.useState(true);
  var wandContiguous = _contiguous[0], setWandContiguous = _contiguous[1];
  var _opMode     = React.useState("replace"); // "replace"|"add"|"subtract"|"intersect"
  var wandOpMode  = _opMode[0], setWandOpMode = _opMode[1];

  // Panel for Phase-2/3 operations
  var _panel      = React.useState(null);    // null|"confetti"|"reduce"|"replace"|"info"|"outline"
  var wandPanel   = _panel[0], setWandPanel = _panel[1];

  // sub-state for confetti-in-selection
  var _cfThresh   = React.useState(2);
  var confettiThreshold = _cfThresh[0], setConfettiThreshold = _cfThresh[1];
  var _cfPreview  = React.useState(null);    // Set of indices flagged for replacement
  var confettiPreview = _cfPreview[0], setConfettiPreview = _cfPreview[1];

  // sub-state for colour reduction
  var _redTarget  = React.useState(3);
  var reduceTarget = _redTarget[0], setReduceTarget = _redTarget[1];
  var _redPreview = React.useState(null);    // [{from, to, count}]
  var reducePreview = _redPreview[0], setReducePreview = _redPreview[1];

  // sub-state for colour replacement
  var _repSrc     = React.useState(null);    // color id
  var replaceSource = _repSrc[0], setReplaceSource = _repSrc[1];
  var _repDst     = React.useState(null);    // color id
  var replaceDest = _repDst[0], setReplaceDest = _repDst[1];
  var _repFuzz    = React.useState(false);
  var replaceFuzzy = _repFuzz[0], setReplaceFuzzy = _repFuzz[1];
  var _repFuzzTol = React.useState(5);
  var replaceFuzzyTol = _repFuzzTol[0], setReplaceFuzzyTol = _repFuzzTol[1];

  // sub-state for outline generation
  var _outlineColor = React.useState("310");
  var outlineColor  = _outlineColor[0], setOutlineColor = _outlineColor[1];

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function labFromEntry(entry) {
    if (entry && entry.lab) {
      var l = entry.lab;
      return Array.isArray(l) ? l : [l.L || 0, l.a || 0, l.b || 0];
    }
    if (entry && entry.rgb) {
      if (typeof rgbToLab === "function") return rgbToLab(entry.rgb[0], entry.rgb[1], entry.rgb[2]);
      return [0, 0, 0];
    }
    return [0, 0, 0];
  }

  function deltaE(la, lb) {
    var dL = la[0] - lb[0], da = la[1] - lb[1], db = la[2] - lb[2];
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  function getCellLab(idx, pat, cmap) {
    var cell = pat[idx];
    if (!cell || cell.id === "__skip__" || cell.id === "__empty__") return null;
    var entry = cmap ? cmap[cell.id] : null;
    return labFromEntry(entry || cell);
  }

  // ─── Core selection operations ───────────────────────────────────────────────

  // Flood-fill BFS from (startX,startY), selects all 4-connected cells within tolerance
  function floodSelect(pat, cmap, sW, sH, startX, startY, tolerance) {
    var mask = new Uint8Array(sW * sH);
    var startIdx = startY * sW + startX;
    var startCell = pat[startIdx];
    if (!startCell || startCell.id === "__skip__" || startCell.id === "__empty__") return mask;
    var startLab = getCellLab(startIdx, pat, cmap);
    if (!startLab) return mask;

    var visited = new Uint8Array(sW * sH);
    var queue = [startIdx];
    visited[startIdx] = 1;

    while (queue.length) {
      var idx = queue.pop();
      var lab = getCellLab(idx, pat, cmap);
      if (!lab) continue;
      if (deltaE(startLab, lab) > tolerance) continue;
      mask[idx] = 1;
      var x = idx % sW, y = (idx - x) / sW;
      if (x > 0)      { var ni = idx - 1;  if (!visited[ni]) { visited[ni] = 1; queue.push(ni); } }
      if (x < sW - 1) { var ni = idx + 1;  if (!visited[ni]) { visited[ni] = 1; queue.push(ni); } }
      if (y > 0)      { var ni = idx - sW; if (!visited[ni]) { visited[ni] = 1; queue.push(ni); } }
      if (y < sH - 1) { var ni = idx + sW; if (!visited[ni]) { visited[ni] = 1; queue.push(ni); } }
    }
    return mask;
  }

  // Global scan: selects ALL cells matching startCell within tolerance
  function globalSelect(pat, cmap, sW, sH, startX, startY, tolerance) {
    var mask = new Uint8Array(sW * sH);
    var startIdx = startY * sW + startX;
    var startCell = pat[startIdx];
    if (!startCell || startCell.id === "__skip__" || startCell.id === "__empty__") return mask;
    var startLab = getCellLab(startIdx, pat, cmap);
    if (!startLab) return mask;
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var lab = getCellLab(i, pat, cmap);
      if (!lab) continue;
      if (deltaE(startLab, lab) <= tolerance) mask[i] = 1;
    }
    return mask;
  }

  // Merge newMask into existing mask using the specified operation mode
  // Merge two selection masks (delegates to shared global if available).
  function mergeMasks(existing, newMask, opMode, size) {
    if (typeof window !== 'undefined' && typeof window.mergeMasks === 'function') {
      return window.mergeMasks(existing, newMask, opMode, size);
    }
    var out = new Uint8Array(size);
    for (var i = 0; i < size; i++) {
      var e = existing ? existing[i] : 0;
      var n = newMask[i];
      if (opMode === "add")        out[i] = (e || n) ? 1 : 0;
      else if (opMode === "subtract")  out[i] = (e && !n) ? 1 : 0;
      else if (opMode === "intersect") out[i] = (e && n) ? 1 : 0;
      else                         out[i] = n; // replace
    }
    return out;
  }

  // ─── Actions: plain functions (no useCallback — matches codebase pattern) ────

  function applyWandSelect(gx, gy, opMode) {
    var pat = state.pat, cmap = state.cmap, sW = state.sW, sH = state.sH;
    if (!pat || !cmap) return;
    if (gx < 0 || gx >= sW || gy < 0 || gy >= sH) return;
    var idx = gy * sW + gx;
    var cell = pat[idx];
    if (!cell || cell.id === "__skip__" || cell.id === "__empty__") {
      if (state.addToast) state.addToast("That cell is empty \u2014 nothing to select.", {type:"warning", duration:1500});
      return;
    }
    var newMask = wandContiguous
      ? floodSelect(pat, cmap, sW, sH, gx, gy, wandTolerance)
      : globalSelect(pat, cmap, sW, sH, gx, gy, wandTolerance);
    var merged = mergeMasks(selectionMask, newMask, opMode, sW * sH);
    setSelectionMask(merged);

    // Toast feedback
    var newCount = 0;
    for (var i = 0; i < merged.length; i++) if (merged[i]) newCount++;
    var entry = cmap[cell.id];
    var label = entry ? "DMC " + entry.id + (entry.name ? " (" + entry.name + ")" : "") : cell.id;
    if (state.addToast) state.addToast(
      newCount.toLocaleString() + " stitch" + (newCount !== 1 ? "es" : "") + " selected \u2014 " + label,
      {type:"success", duration:2000}
    );
  }

  function clearSelection() {
    setSelectionMask(null);
    setConfettiPreview(null);
    setReducePreview(null);
    setWandPanel(null);
  }

  function invertSelection() {
    var pat = state.pat, sW = state.sW, sH = state.sH;
    if (!pat) return;
    var out = new Uint8Array(sW * sH);
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      out[i] = selectionMask && selectionMask[i] ? 0 : 1;
    }
    setSelectionMask(out);
  }

  function selectAll() {
    var pat = state.pat, sW = state.sW, sH = state.sH;
    if (!pat) return;
    var out = new Uint8Array(sW * sH);
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      out[i] = 1;
    }
    setSelectionMask(out);
  }

  function selectAllOfColorId(colorId, opMode) {
    var pat = state.pat, cmap = state.cmap, sW = state.sW, sH = state.sH;
    if (!pat || !cmap) return;
    var entry = cmap[colorId];
    if (!entry) return;
    var startLab = labFromEntry(entry);
    var newMask = new Uint8Array(sW * sH);
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var lab = getCellLab(i, pat, cmap);
      if (!lab) continue;
      if (deltaE(startLab, lab) <= wandTolerance) newMask[i] = 1;
    }
    var merged = mergeMasks(selectionMask, newMask, opMode || "replace", sW * sH);
    setSelectionMask(merged);
  }

  // ─── Derived: selection count ────────────────────────────────────────────────
  var selectionCount = 0;
  if (selectionMask) {
    for (var _si = 0; _si < selectionMask.length; _si++) if (selectionMask[_si]) selectionCount++;
  }
  var hasSelection = selectionCount > 0;

  // ─── Phase 2.1: Confetti cleanup in selection ────────────────────────────────

  function buildConfettiPreview(threshold) {
    var pat = state.pat, mask = selectionMask, sW = state.sW, sH = state.sH;
    if (!pat || !mask) return null;
    var flagged = new Set();
    var visited = new Uint8Array(pat.length);

    for (var start = 0; start < pat.length; start++) {
      if (!mask[start] || visited[start]) continue;
      var cell = pat[start];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var tid = cell.id;
      var cluster = [];
      var q = [start];
      visited[start] = 1;
      while (q.length) {
        var idx = q.pop();
        cluster.push(idx);
        var x = idx % sW, y = (idx - (idx % sW)) / sW;
        if (x > 0)      { var ni = idx - 1;  if (!visited[ni] && mask[ni] && pat[ni] && pat[ni].id === tid) { visited[ni] = 1; q.push(ni); } }
        if (x < sW - 1) { var ni = idx + 1;  if (!visited[ni] && mask[ni] && pat[ni] && pat[ni].id === tid) { visited[ni] = 1; q.push(ni); } }
        if (y > 0)      { var ni = idx - sW; if (!visited[ni] && mask[ni] && pat[ni] && pat[ni].id === tid) { visited[ni] = 1; q.push(ni); } }
        if (y < sH - 1) { var ni = idx + sW; if (!visited[ni] && mask[ni] && pat[ni] && pat[ni].id === tid) { visited[ni] = 1; q.push(ni); } }
      }
      if (cluster.length < threshold) cluster.forEach(function(i) { flagged.add(i); });
    }
    return flagged;
  }

  function previewConfettiCleanup() {
    var flagged = buildConfettiPreview(confettiThreshold);
    setConfettiPreview(flagged);
  }

  function applyConfettiCleanup() {
    var pat = state.pat, cmap = state.cmap, sW = state.sW, sH = state.sH;
    if (!pat || !selectionMask) return;
    var flagged = buildConfettiPreview(confettiThreshold);
    if (!flagged || flagged.size === 0) return;

    var np = pat.slice();
    var changes = [];
    flagged.forEach(function(idx) {
      var x = idx % sW, y = (idx - (idx % sW)) / sW;
      var freq = {};
      var nbrs = [];
      if (x > 0)      nbrs.push(idx - 1);
      if (x < sW - 1) nbrs.push(idx + 1);
      if (y > 0)      nbrs.push(idx - sW);
      if (y < sH - 1) nbrs.push(idx + sW);
      nbrs.forEach(function(ni) {
        var nc = pat[ni];
        if (nc && nc.id !== "__skip__" && nc.id !== "__empty__") {
          freq[nc.id] = (freq[nc.id] || 0) + 1;
        }
      });
      var best = null, bestCt = -1;
      Object.keys(freq).forEach(function(id) {
        if (freq[id] > bestCt) { bestCt = freq[id]; best = id; }
      });
      var current = pat[idx];
      if (best && cmap && cmap[best] && (!current || current.id !== best)) {
        changes.push({ idx: idx, old: Object.assign({}, pat[idx]) });
        np[idx] = Object.assign({}, cmap[best]);
      }
    });
    if (!changes.length) return;

    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: "confettiCleanup", changes: changes }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);
    state.setPat(np);
    var r = state.buildPaletteWithScratch(np);
    state.setPal(r.pal); state.setCmap(r.cmap);
    setConfettiPreview(null);
  }

  // ─── Phase 2.2: Colour reduction in selection ────────────────────────────────

  function previewColorReduction() {
    var pat = state.pat, cmap = state.cmap, mask = selectionMask;
    if (!pat || !cmap || !mask) return;
    var target = reduceTarget;
    var counts = {};
    for (var i = 0; i < pat.length; i++) {
      if (!mask[i]) continue;
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      counts[cell.id] = (counts[cell.id] || 0) + 1;
    }
    var ids = Object.keys(counts);
    if (ids.length <= target) { setReducePreview([]); return; }

    var labs = {};
    ids.forEach(function(id) {
      var e = cmap[id];
      labs[id] = e ? labFromEntry(e) : [0, 0, 0];
    });

    var activeIds = ids.slice();
    var merges = [];

    while (activeIds.length > target) {
      var bestDE = Infinity, bestI = -1, bestJ = -1;
      for (var a = 0; a < activeIds.length; a++) {
        for (var b = a + 1; b < activeIds.length; b++) {
          var de = deltaE(labs[activeIds[a]], labs[activeIds[b]]);
          if (de < bestDE) { bestDE = de; bestI = a; bestJ = b; }
        }
      }
      if (bestI < 0) break;
      var idA = activeIds[bestI], idB = activeIds[bestJ];
      var cntA = counts[idA] || 0, cntB = counts[idB] || 0;
      var fromId, toId;
      if (cntA <= cntB) { fromId = idA; toId = idB; }
      else              { fromId = idB; toId = idA; }
      merges.push({ from: fromId, to: toId, count: counts[fromId] || 0,
        fromName: (cmap[fromId] ? cmap[fromId].name : fromId),
        toName:   (cmap[toId]   ? cmap[toId].name   : toId) });
      counts[toId] = (counts[toId] || 0) + (counts[fromId] || 0);
      delete counts[fromId];
      activeIds.splice(activeIds.indexOf(fromId), 1);
    }
    setReducePreview(merges);
  }

  function applyColorReduction() {
    var pat = state.pat, cmap = state.cmap, mask = selectionMask;
    var merges = reducePreview;
    if (!pat || !cmap || !mask || !merges || !merges.length) return;

    var remap = {};
    merges.forEach(function(m) { remap[m.from] = m.to; });
    function resolve(id) { var seen = new Set(); while (remap[id] && !seen.has(id)) { seen.add(id); id = remap[id]; } return id; }

    var np = pat.slice();
    var changes = [];
    for (var i = 0; i < np.length; i++) {
      if (!mask[i]) continue;
      var cell = np[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      if (remap[cell.id]) {
        var newId = resolve(cell.id);
        var newEntry = cmap[newId];
        if (newEntry) {
          changes.push({ idx: i, old: Object.assign({}, cell) });
          np[i] = Object.assign({}, newEntry);
        }
      }
    }
    if (!changes.length) return;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: "colorReduction", changes: changes }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);
    state.setPat(np);
    var r = state.buildPaletteWithScratch(np);
    state.setPal(r.pal); state.setCmap(r.cmap);
    setReducePreview(null);
  }

  // ─── Phase 2.3: Colour replacement in selection ──────────────────────────────

  var selectionReplaceColorCount = useMemo(function() {
    var pat = state.pat, cmap = state.cmap;
    if (!pat || !selectionMask || !replaceSource || !cmap) return 0;
    var srcEntry = cmap[replaceSource];
    if (!srcEntry) return 0;
    var srcLab = labFromEntry(srcEntry);
    var tol = replaceFuzzy ? replaceFuzzyTol : 0;
    var c = 0;
    for (var i = 0; i < pat.length; i++) {
      if (!selectionMask[i]) continue;
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var lab = getCellLab(i, pat, cmap);
      if (!lab) continue;
      if (deltaE(srcLab, lab) <= tol) c++;
    }
    return c;
  }, [selectionMask, replaceSource, replaceFuzzy, replaceFuzzyTol, state.pat, state.cmap]);

  function applyColorReplacement() {
    var pat = state.pat, cmap = state.cmap;
    if (!pat || !cmap || !selectionMask || !replaceSource || !replaceDest) return;
    var srcEntry = cmap[replaceSource], dstEntry = cmap[replaceDest];
    if (!srcEntry || !dstEntry) return;
    var srcLab = labFromEntry(srcEntry);
    var tol = replaceFuzzy ? replaceFuzzyTol : 0;
    var np = pat.slice();
    var changes = [];
    for (var i = 0; i < np.length; i++) {
      if (!selectionMask[i]) continue;
      var cell = np[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      var lab = getCellLab(i, pat, cmap);
      if (!lab) continue;
      if (deltaE(srcLab, lab) <= tol) {
        changes.push({ idx: i, old: Object.assign({}, cell) });
        np[i] = Object.assign({}, dstEntry);
      }
    }
    if (!changes.length) return;
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: "colorReplace", changes: changes }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);
    state.setPat(np);
    var r = state.buildPaletteWithScratch(np);
    state.setPal(r.pal); state.setCmap(r.cmap);
  }

  // ─── Direct global colour replacement (whole pattern or active selection) ────

  function applyGlobalColourReplacement(srcId, dstId) {
    var pat = state.pat, cmap = state.cmap;
    if (!pat || !cmap || !srcId || !dstId || srcId === dstId) return;
    var dstEntry = cmap[dstId];
    if (!dstEntry) {
      if (typeof findThreadInCatalog === 'function') dstEntry = findThreadInCatalog('dmc', dstId);
      if (!dstEntry && typeof DMC !== 'undefined') dstEntry = DMC.find(function(d) { return d.id === dstId; });
    }
    if (!dstEntry) {
      // DEFECT-002: surface to the user instead of silently no-opping. Reachable
      // when a future entry point passes a non-DMC id (e.g. 'anchor:403') or if
      // the DMC catalog data is corrupt at runtime.
      if (state.addToast) state.addToast("Replacement colour not found.", {type: "error", duration: 3500});
      return;
    }
    var np = pat.slice();
    var changes = [];
    for (var i = 0; i < np.length; i++) {
      if (selectionMask && !selectionMask[i]) continue;
      var cell = np[i];
      if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
      if (cell.id !== srcId) continue;
      changes.push({ idx: i, old: Object.assign({}, cell) });
      np[i] = Object.assign({}, dstEntry);
    }
    if (!changes.length) {
      // DEFECT-002 (related): selection mask may have hidden every match.
      if (state.addToast) state.addToast("No matching cells to replace.", {type: "info", duration: 2500});
      return;
    }
    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: 'colourReplace', changes: changes }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);
    state.setPat(np);
    var r = state.buildPaletteWithScratch(np);
    state.setPal(r.pal); state.setCmap(r.cmap);
  }

  // ─── Phase 3.1: Selection stats ─────────────────────────────────────────────

  var selectionStats = useMemo(function() {
    var pat = state.pat, cmap = state.cmap, fabricCt = state.fabricCt;
    if (!pat || !cmap) return null;
    var counts = {};
    var total = 0;
    for (var i = 0; i < pat.length; i++) {
      var inSel = selectionMask ? selectionMask[i] : 1;
      if (!inSel) continue;
      var cell = pat[i];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
      counts[cell.id] = (counts[cell.id] || 0) + 1;
      total++;
    }
    var rows = Object.entries(counts).sort(function(a, b) { return b[1] - a[1]; })
      .map(function(e) {
        var id = e[0], ct = e[1];
        var entry = cmap[id] || {};
        return { id: id, name: entry.name || id, rgb: entry.rgb || [128, 128, 128],
          count: ct, skeins: skeinEst(ct, fabricCt || 14) };
      });
    var totalSkeins = rows.reduce(function(s, r) { return s + r.skeins; }, 0);
    return { rows: rows, total: total, totalSkeins: totalSkeins, colors: rows.length };
  }, [selectionMask, state.pat, state.cmap, state.fabricCt]);

  // ─── Phase 3.2: Auto backstitch outline ─────────────────────────────────────

  function applyOutlineGeneration() {
    var pat = state.pat, mask = selectionMask;
    var sW = state.sW, sH = state.sH, bsLines = state.bsLines;
    var colorId = outlineColor;
    if (!pat || !mask) return;

    var newLines = [];
    var edgeSet = new Set();

    for (var idx = 0; idx < pat.length; idx++) {
      if (!mask[idx]) continue;
      var x = idx % sW, y = (idx - (idx % sW)) / sW;
      var edges = [
        { nx: x,   ny: y-1, ex: x,   ey: y,   ex2: x+1, ey2: y   },
        { nx: x+1, ny: y,   ex: x+1, ey: y,   ex2: x+1, ey2: y+1 },
        { nx: x,   ny: y+1, ex: x,   ey: y+1, ex2: x+1, ey2: y+1 },
        { nx: x-1, ny: y,   ex: x,   ey: y,   ex2: x,   ey2: y+1 },
      ];
      for (var e = 0; e < edges.length; e++) {
        var edge = edges[e];
        var ni = edge.ny * sW + edge.nx;
        var isBoundary = (edge.nx < 0 || edge.nx >= sW || edge.ny < 0 || edge.ny >= sH) || !mask[ni];
        if (!isBoundary) continue;
        var key = edge.ex + "," + edge.ey + "-" + edge.ex2 + "," + edge.ey2;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        newLines.push({ x1: edge.ex, y1: edge.ey, x2: edge.ex2, y2: edge.ey2, colorId: colorId });
      }
    }
    if (!newLines.length) return;

    var dmcEntry = findThreadInCatalog('dmc', colorId);
    var rgb = dmcEntry ? dmcEntry.rgb : [0, 0, 0];
    var coloredLines = newLines.map(function(l) {
      return { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, color: rgb };
    });

    var EDIT_HISTORY_MAX = state.EDIT_HISTORY_MAX;
    var prevBs = bsLines;
    state.setEditHistory(function(prev) {
      var n = prev.concat([{ type: "outlineGeneration", bsLines: prevBs }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    state.setRedoHistory([]);
    state.setBsLines(function(prev) { return prev.concat(coloredLines); });
  }

  // ─── Return ──────────────────────────────────────────────────────────────────
  return {
    selectionMask, setSelectionMask,
    wandTolerance, setWandTolerance,
    wandContiguous, setWandContiguous,
    wandOpMode, setWandOpMode,
    wandPanel, setWandPanel,
    confettiThreshold, setConfettiThreshold,
    confettiPreview, setConfettiPreview,
    reduceTarget, setReduceTarget,
    reducePreview, setReducePreview,
    replaceSource, setReplaceSource,
    replaceDest, setReplaceDest,
    replaceFuzzy, setReplaceFuzzy,
    replaceFuzzyTol, setReplaceFuzzyTol,
    outlineColor, setOutlineColor,
    // Actions
    applyWandSelect, clearSelection, invertSelection, selectAll, selectAllOfColorId,
    // Phase 2
    previewConfettiCleanup, applyConfettiCleanup,
    previewColorReduction, applyColorReduction,
    selectionReplaceColorCount, applyColorReplacement,
    applyGlobalColourReplacement,
    // Back-compat alias for any external caller still using the misspelled name.
    applyGlobalColorReplacement: applyGlobalColourReplacement,
    // Phase 3
    selectionStats, applyOutlineGeneration,
    // Derived
    selectionCount, hasSelection,
  };
};
