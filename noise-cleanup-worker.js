/* noise-cleanup-worker.js — Web Worker for Denoise Mode detection.

   Instantiated by useDenoiseMode.js via `new Worker('noise-cleanup-worker.js')`.

   Message in:
     { type: 'detect',
       pat: Array<{id, lab, type}>,  // slim cells: id, lab from cmap, type
       pal: Array<{id, lab, count}>, // palette entries with counts
       sW, sH,
       paletteThresholdDe,           // CIEDE2000 threshold for palette merge
       speckleMaxSize,               // max component size for speckle
       speckleDominanceRatio,        // fraction of neighbors that must agree
       fringeTransitionDe,           // max dE2000 from midpoint to be fringe
       fringeMinRegionSize,          // min region size for flanking regions
       enablePalette,                // boolean — run Op 1
       enableSpeckle,                // boolean — run Op 2
       enableFringe }                // boolean — run Op 3

   Message out:
     { type: 'result',
       mask: Array<0|1>,             // cells to replace (speckle + fringe)
       report: { paletteCount, speckleCount, fringeCount,
                 mergeMap, isolationRatio } }
   | { type: 'error', message: string }

   mergeMap: { [removedId]: representativeId } — used by applyDenoise to
     remap palette entries without re-running detection.
   isolationRatio: fraction of non-skip cells fully surrounded by other
     colors; if > DENOISE_DITHER_WARN_RATIO the hook shows a dither warning.

   See reports/conversion-noise-cleanup-plan.md §6.4 for the full spec.
*/

importScripts('constants.js', 'dmc-data.js', 'colour-utils.js');

// ═══════════════════════════════════════════════════════════════════════════════
onmessage = function(e) {
  try {
    var msg = e.data;
    if (msg.type !== 'detect') return;

    var pat    = msg.pat;   // [{id, lab, type}]  length = sW*sH
    var pal    = msg.pal;   // [{id, lab, count}]  palette entries
    var sW     = msg.sW;
    var sH     = msg.sH;
    var total  = sW * sH;

    // Defaults match §4.2 constants
    var paletteThresholdDe   = msg.paletteThresholdDe   !== undefined ? msg.paletteThresholdDe   : 5.0;
    var speckleMaxSize        = msg.speckleMaxSize        !== undefined ? msg.speckleMaxSize        : 3;
    var speckleDominanceRatio = msg.speckleDominanceRatio !== undefined ? msg.speckleDominanceRatio : 0.6;
    var fringeTransitionDe    = msg.fringeTransitionDe    !== undefined ? msg.fringeTransitionDe    : 6.0;
    var fringeMinRegionSize   = msg.fringeMinRegionSize   !== undefined ? msg.fringeMinRegionSize   : 4;
    var enablePalette = msg.enablePalette !== false;
    var enableSpeckle = !!msg.enableSpeckle;
    var enableFringe  = msg.enableFringe  !== false;

    // ── Pre-build LAB lookup from palette ─────────────────────────────────────
    // O(|pal|) once — avoids repeated O(sW*sH) scans inside fringe per cell.
    var labById = {};
    if (pal) {
      for (var pi = 0; pi < pal.length; pi++) {
        labById[pal[pi].id] = pal[pi].lab;
      }
    }
    // Fill in any ids found in pat but not in pal (e.g. after consolidation)
    for (var fi2 = 0; fi2 < total; fi2++) {
      var fc = pat[fi2];
      if (fc && fc.lab && !labById[fc.id]) labById[fc.id] = fc.lab;
    }

    // ── Step 0: isolation ratio (dither-warning heuristic) ───────────────────
    var isolationCount = 0, totalValid = 0;
    for (var ii = 0; ii < total; ii++) {
      var ic = pat[ii];
      if (!ic || ic.id === '__skip__' || ic.id === '__empty__') continue;
      totalValid++;
      var ix = ii % sW, iy = (ii / sW) | 0;
      var allDiff = true;
      outer: for (var idy = -1; idy <= 1; idy++) {
        for (var idx = -1; idx <= 1; idx++) {
          if (idy === 0 && idx === 0) continue;
          var inx = ix + idx, iny = iy + idy;
          if (inx < 0 || inx >= sW || iny < 0 || iny >= sH) continue;
          var ini = iny * sW + inx;
          var inc = pat[ini];
          if (!inc || inc.id === '__skip__' || inc.id === '__empty__') continue;
          if (inc.id === ic.id) { allDiff = false; break outer; }
        }
      }
      if (allDiff) isolationCount++;
    }
    var isolationRatio = totalValid > 0 ? isolationCount / totalValid : 0;

    // ── Op 1: Palette Consolidation ───────────────────────────────────────────
    var mergeMap = {};
    var paletteCount = 0;
    var workingPat = pat;

    if (enablePalette && pal && pal.length > 1) {
      var consResult = _paletteConsolidate(pat, pal, paletteThresholdDe, labById);
      mergeMap    = consResult.mergeMap;
      paletteCount = consResult.clustersFormed;
      workingPat  = consResult.remappedPat;
      // Update labById with new mappings so fringe/speckle see the merged palette
      var rmKeys = Object.keys(mergeMap);
      for (var rki = 0; rki < rmKeys.length; rki++) {
        labById[rmKeys[rki]] = labById[mergeMap[rmKeys[rki]]] || labById[rmKeys[rki]];
      }
    }

    // ── Op 2: Speckle Removal ─────────────────────────────────────────────────
    var speckleSet = new Set();
    if (enableSpeckle) {
      speckleSet = _speckleRemove(workingPat, sW, sH, speckleMaxSize, speckleDominanceRatio);
    }

    // ── Op 3: Edge Fringe Smoothing ───────────────────────────────────────────
    var fringeSet = new Set();
    if (enableFringe) {
      fringeSet = _fringeSmooth(workingPat, sW, sH, fringeTransitionDe, fringeMinRegionSize, labById);
    }

    // ── Combine masks → plain Array for safe postMessage ──────────────────────
    var mask = new Array(total);
    for (var mi = 0; mi < total; mi++) {
      mask[mi] = (speckleSet.has(mi) || fringeSet.has(mi)) ? 1 : 0;
    }

    postMessage({
      type: 'result',
      mask: mask,
      report: {
        paletteCount:   paletteCount,
        speckleCount:   speckleSet.size,
        fringeCount:    fringeSet.size,
        mergeMap:       mergeMap,
        isolationRatio: isolationRatio,
      }
    });

  } catch (err) {
    postMessage({ type: 'error', message: err && err.message ? err.message : String(err) });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Op 1 — Palette Consolidation
// ═══════════════════════════════════════════════════════════════════════════════
function _paletteConsolidate(pat, pal, thresholdDe, labById) {
  var n = pal.length;

  // Pairwise CIEDE2000 matrix (upper triangle, mirrored)
  var dist = new Float32Array(n * n);
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      var d = dE2000(pal[i].lab, pal[j].lab);
      dist[i * n + j] = d;
      dist[j * n + i] = d;
    }
  }

  // Union-Find (path-compressed)
  var parent = new Int32Array(n);
  for (var pi = 0; pi < n; pi++) parent[pi] = pi;
  function find(x) {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  }

  for (var ui = 0; ui < n; ui++) {
    for (var uj = ui + 1; uj < n; uj++) {
      if (dist[ui * n + uj] <= thresholdDe) {
        var ra = find(ui), rb = find(uj);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }

  // Group by cluster root
  var clusters = {};
  for (var ci = 0; ci < n; ci++) {
    var root = find(ci);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(ci);
  }

  // Most-used member wins (never introduces DMC not already in palette)
  var mergeMap = {};
  var clustersFormed = 0;
  var cKeys = Object.keys(clusters);
  for (var ck = 0; ck < cKeys.length; ck++) {
    var members = clusters[cKeys[ck]];
    if (members.length === 1) continue;
    clustersFormed++;
    var repIdx = members[0];
    for (var mi = 1; mi < members.length; mi++) {
      if (pal[members[mi]].count > pal[repIdx].count) repIdx = members[mi];
    }
    var repId = pal[repIdx].id;
    for (var mi2 = 0; mi2 < members.length; mi2++) {
      if (members[mi2] !== repIdx) mergeMap[pal[members[mi2]].id] = repId;
    }
  }

  // Remap pattern cells (blends are opaque — never remapped)
  var remappedPat = new Array(pat.length);
  for (var ri = 0; ri < pat.length; ri++) {
    var cell = pat[ri];
    if (!cell || cell.id === '__skip__' || cell.id === '__empty__' || cell.type === 'blend') {
      remappedPat[ri] = cell;
      continue;
    }
    var mapped = mergeMap[cell.id];
    if (mapped) {
      remappedPat[ri] = { id: mapped, lab: labById[mapped] || cell.lab, type: cell.type };
    } else {
      remappedPat[ri] = cell;
    }
  }

  return { mergeMap: mergeMap, clustersFormed: clustersFormed, remappedPat: remappedPat };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Op 2 — Speckle Removal
// ═══════════════════════════════════════════════════════════════════════════════
// Returns Set<number> of flat indices to replace.
function _speckleRemove(pat, sW, sH, maxSize, dominanceRatio) {
  var total = sW * sH;
  var label = new Int32Array(total); // 0 = unlabeled/skip
  var compCells = [null]; // 1-indexed; index 0 unused
  var nextLabel = 1;

  // BFS flood-fill: label connected components per solid color
  for (var si = 0; si < total; si++) {
    var sc = pat[si];
    if (!sc || sc.id === '__skip__' || sc.id === '__empty__' || sc.type === 'blend') continue;
    if (label[si] !== 0) continue;

    var colorId = sc.id;
    var queue = [si], head = 0, cells = [si];
    label[si] = nextLabel;

    while (head < queue.length) {
      var cur = queue[head++];
      var cx = cur % sW, cy = (cur / sW) | 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
          var ni = ny * sW + nx;
          if (label[ni] !== 0) continue;
          var nc = pat[ni];
          if (!nc || nc.id === '__skip__' || nc.id === '__empty__' || nc.type === 'blend') continue;
          if (nc.id !== colorId) continue;
          label[ni] = nextLabel;
          cells.push(ni);
          queue.push(ni);
        }
      }
    }

    compCells[nextLabel] = cells;
    nextLabel++;
  }

  // Identify small components that are "surrounded" by a single dominant color
  var toReplace = new Set();

  for (var lbl = 1; lbl < nextLabel; lbl++) {
    var compArr = compCells[lbl];
    if (!compArr || compArr.length > maxSize) continue;

    // Collect neighbor IDs (exclude cells in this component)
    var compSet = new Set(compArr);
    var neighborFreq = {};
    var totalNeighbors = 0;

    for (var ci = 0; ci < compArr.length; ci++) {
      var cidx = compArr[ci];
      var ccx = cidx % sW, ccy = (cidx / sW) | 0;
      for (var ndy = -1; ndy <= 1; ndy++) {
        for (var ndx = -1; ndx <= 1; ndx++) {
          if (ndx === 0 && ndy === 0) continue;
          var nnx = ccx + ndx, nny = ccy + ndy;
          if (nnx < 0 || nnx >= sW || nny < 0 || nny >= sH) continue;
          var nni = nny * sW + nnx;
          if (compSet.has(nni)) continue;
          var nnc = pat[nni];
          if (!nnc || nnc.id === '__skip__' || nnc.id === '__empty__') continue;
          neighborFreq[nnc.id] = (neighborFreq[nnc.id] || 0) + 1;
          totalNeighbors++;
        }
      }
    }

    if (totalNeighbors === 0) continue; // surrounded only by skip — do not replace

    // Find top 2 neighbor frequencies
    var maxCount = 0, dominantId = null, secondCount = 0;
    var nkeys = Object.keys(neighborFreq);
    for (var nki = 0; nki < nkeys.length; nki++) {
      var nc3 = neighborFreq[nkeys[nki]];
      if (nc3 > maxCount) { secondCount = maxCount; maxCount = nc3; dominantId = nkeys[nki]; }
      else if (nc3 > secondCount) { secondCount = nc3; }
    }

    // Dominance ratio check
    if (maxCount / totalNeighbors < dominanceRatio) continue;

    // If the top two are tied, this is likely an edge vertex — skip
    if (secondCount === maxCount) continue;

    // Mark all component cells for replacement
    for (var ci2 = 0; ci2 < compArr.length; ci2++) {
      toReplace.add(compArr[ci2]);
    }
  }

  return toReplace;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Op 3 — Edge Fringe Smoothing
// ═══════════════════════════════════════════════════════════════════════════════
// Returns Set<number> of flat indices to replace.
function _fringeSmooth(pat, sW, sH, transitionDe, minRegionSize, labById) {
  var total = sW * sH;

  // Pre-compute connected component sizes (solid colors only, 8-connected)
  var compLabel = new Int32Array(total); // 0 = skip/empty/blend
  var compSize  = [0]; // 1-indexed
  var nextLbl   = 1;

  for (var si = 0; si < total; si++) {
    var sc = pat[si];
    if (!sc || sc.id === '__skip__' || sc.id === '__empty__' || sc.type === 'blend') continue;
    if (compLabel[si] !== 0) continue;
    var scId = sc.id;
    var queue = [si], head = 0, cnt = 1;
    compLabel[si] = nextLbl;
    while (head < queue.length) {
      var cur = queue[head++];
      var cx = cur % sW, cy = (cur / sW) | 0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
          var ni = ny * sW + nx;
          if (compLabel[ni] !== 0) continue;
          var nc = pat[ni];
          if (!nc || nc.id === '__skip__' || nc.id === '__empty__' || nc.type === 'blend') continue;
          if (nc.id !== scId) continue;
          compLabel[ni] = nextLbl;
          cnt++;
          queue.push(ni);
        }
      }
    }
    compSize[nextLbl] = cnt;
    nextLbl++;
  }

  var toReplace = new Set();

  for (var idx = 0; idx < total; idx++) {
    var cell = pat[idx];
    if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;

    var x = idx % sW, y = (idx / sW) | 0;

    // Collect neighbor color frequencies (skip/empty excluded from pool)
    var freq = {};
    var validCount = 0;
    for (var dy2 = -1; dy2 <= 1; dy2++) {
      for (var dx2 = -1; dx2 <= 1; dx2++) {
        if (dx2 === 0 && dy2 === 0) continue;
        var nx2 = x + dx2, ny2 = y + dy2;
        if (nx2 < 0 || nx2 >= sW || ny2 < 0 || ny2 >= sH) continue;
        var ni2 = ny2 * sW + nx2;
        var nc2 = pat[ni2];
        if (!nc2 || nc2.id === '__skip__' || nc2.id === '__empty__') continue;
        freq[nc2.id] = (freq[nc2.id] || 0) + 1;
        validCount++;
      }
    }

    if (validCount < 4) continue; // not enough context

    // Find top 2 colors
    var topA = null, cntA = 0, topB = null, cntB = 0;
    var fkeys = Object.keys(freq);
    for (var fki = 0; fki < fkeys.length; fki++) {
      var fv = freq[fkeys[fki]];
      if (fv > cntA) { topB = topA; cntB = cntA; topA = fkeys[fki]; cntA = fv; }
      else if (fv > cntB) { topB = fkeys[fki]; cntB = fv; }
    }

    if (!topA || !topB) continue; // need two dominant colors

    // Cell must not already be one of the top 2
    if (cell.id === topA || cell.id === topB) continue;

    // Three-way tie in top 2: if a third color equals the second count → corner, skip
    if (fkeys.length >= 3) {
      var thirdMax = 0;
      for (var fki2 = 0; fki2 < fkeys.length; fki2++) {
        if (fkeys[fki2] !== topA && fkeys[fki2] !== topB) {
          if (freq[fkeys[fki2]] > thirdMax) thirdMax = freq[fkeys[fki2]];
        }
      }
      if (thirdMax >= cntB) continue;
    }

    // Get LAB values
    var labA = labById[topA], labB = labById[topB], labC = labById[cell.id] || cell.lab;
    if (!labA || !labB || !labC) continue;

    // Fringe score: how close is C to the midpoint of A and B?
    var midLab = [(labA[0] + labB[0]) / 2, (labA[1] + labB[1]) / 2, (labA[2] + labB[2]) / 2];
    var fringeScore = dE2000(labC, midLab);
    if (fringeScore > transitionDe) continue;

    // Flanking region size guard: find adjacent components of topA and topB
    var adjLblA = 0, adjLblB = 0;
    outer2: for (var dy3 = -1; dy3 <= 1; dy3++) {
      for (var dx3 = -1; dx3 <= 1; dx3++) {
        if (dx3 === 0 && dy3 === 0) continue;
        var nx3 = x + dx3, ny3 = y + dy3;
        if (nx3 < 0 || nx3 >= sW || ny3 < 0 || ny3 >= sH) continue;
        var ni3 = ny3 * sW + nx3;
        var nc3 = pat[ni3];
        if (!nc3) continue;
        if (!adjLblA && nc3.id === topA) adjLblA = compLabel[ni3];
        if (!adjLblB && nc3.id === topB) adjLblB = compLabel[ni3];
        if (adjLblA && adjLblB) break outer2;
      }
    }
    if (!adjLblA || !adjLblB) continue;
    if ((compSize[adjLblA] || 0) < minRegionSize) continue;
    if ((compSize[adjLblB] || 0) < minRegionSize) continue;

    toReplace.add(idx);
  }

  return toReplace;
}
