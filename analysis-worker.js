/* analysis-worker.js — Spatial analysis Web Worker
   Receives: { type: "analyse", pat, done, sW, sH }
             { type: "analyse_incremental", pat, done, sW, sH, changedIdx }
   Posts back: { type: "result", perStitch, perColour, perRegion, regionSize, regionCols, regionRows }
*/

// ── Connected-component flood fill (4-connected) ───────────────────────────
function computeClusters(pat, sW, sH) {
  var n = pat.length;
  var clusterLabel = new Int32Array(n);  // 0 = unvisited
  var clusterSizes = [];  // clusterSizes[label-1] = size
  var label = 0;
  var queue = [];

  for (var start = 0; start < n; start++) {
    if (clusterLabel[start] !== 0) continue;
    var id = pat[start].id;
    if (id === "__skip__" || id === "__empty__") { clusterLabel[start] = -1; continue; }

    label++;
    var size = 0;
    queue.length = 0;
    queue.push(start);
    clusterLabel[start] = label;

    var qi = 0;
    while (qi < queue.length) {
      var idx = queue[qi++];
      size++;
      var x = idx % sW, y = Math.floor(idx / sW);
      // 4-connected neighbours
      var neighbors = [
        y > 0       ? idx - sW : -1,
        y < sH - 1  ? idx + sW : -1,
        x > 0       ? idx - 1  : -1,
        x < sW - 1  ? idx + 1  : -1
      ];
      for (var ni = 0; ni < 4; ni++) {
        var nb = neighbors[ni];
        if (nb < 0 || clusterLabel[nb] !== 0) continue;
        if (pat[nb].id === id) {
          clusterLabel[nb] = label;
          queue.push(nb);
        } else {
          clusterLabel[nb] = -2;  // different colour, mark visited
        }
      }
    }
    clusterSizes.push(size);
    // Fix: cells of different colour that were tentatively marked -2 need to be reset to 0
    // Actually the above approach has a bug: marking neighbors of wrong colour as -2 would
    // skip them in future visits. Use a separate visitedSet instead.
  }

  // Re-do properly: only mark same-colour cells with the label
  // Reset and redo without the -2 bug
  clusterLabel = new Int32Array(n);
  clusterSizes = [];
  label = 0;

  for (var start2 = 0; start2 < n; start2++) {
    if (clusterLabel[start2] !== 0) continue;
    var id2 = pat[start2].id;
    if (id2 === "__skip__" || id2 === "__empty__") { clusterLabel[start2] = -1; continue; }

    label++;
    var size2 = 0;
    queue.length = 0;
    queue.push(start2);
    clusterLabel[start2] = label;

    var qi2 = 0;
    while (qi2 < queue.length) {
      var idx2 = queue[qi2++];
      size2++;
      var x2 = idx2 % sW, y2 = Math.floor(idx2 / sW);
      if (y2 > 0)       { var nb2 = idx2 - sW; if (clusterLabel[nb2] === 0 && pat[nb2].id === id2) { clusterLabel[nb2] = label; queue.push(nb2); } }
      if (y2 < sH - 1)  { var nb3 = idx2 + sW; if (clusterLabel[nb3] === 0 && pat[nb3].id === id2) { clusterLabel[nb3] = label; queue.push(nb3); } }
      if (x2 > 0)       { var nb4 = idx2 - 1;  if (clusterLabel[nb4] === 0 && pat[nb4].id === id2) { clusterLabel[nb4] = label; queue.push(nb4); } }
      if (x2 < sW - 1)  { var nb5 = idx2 + 1;  if (clusterLabel[nb5] === 0 && pat[nb5].id === id2) { clusterLabel[nb5] = label; queue.push(nb5); } }
    }
    clusterSizes.push(size2);
  }

  return { clusterLabel: clusterLabel, clusterSizes: clusterSizes };
}

// ── Per-stitch nearest same-colour distance (approximate BFS from each stitch) ─
// For each stitch, scan expanding shells of the 8-neighbourhood until same colour found.
// Cap search at maxR=20 stitches for performance.
function computeNearestSameColour(pat, sW, sH) {
  var n = pat.length;
  var nearest = new Float32Array(n);
  nearest.fill(999);

  for (var i = 0; i < n; i++) {
    var id = pat[i].id;
    if (id === "__skip__" || id === "__empty__") { nearest[i] = 0; continue; }
    var x0 = i % sW, y0 = Math.floor(i / sW);
    var found = false;
    outer:
    for (var r = 1; r <= 20; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only shell
          var nx = x0 + dx, ny = y0 + dy;
          if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
          var ni = ny * sW + nx;
          if (pat[ni].id === id) {
            nearest[i] = Math.sqrt(dx * dx + dy * dy);
            found = true;
            break outer;
          }
        }
      }
    }
    if (!found) nearest[i] = 999; // completely alone in search radius
  }
  return nearest;
}

// ── Per-stitch 8-neighbour same-colour count ──────────────────────────────
function computeNeighbourCounts(pat, sW, sH) {
  var n = pat.length;
  var counts = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    var id = pat[i].id;
    if (id === "__skip__" || id === "__empty__") continue;
    var x0 = i % sW, y0 = Math.floor(i / sW);
    var c = 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = x0 + dx, ny = y0 + dy;
        if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
        if (pat[ny * sW + nx].id === id) c++;
      }
    }
    counts[i] = c;
  }
  return counts;
}

// ── Full analysis ─────────────────────────────────────────────────────────
function runAnalysis(pat, done, sW, sH, REGION_SIZE) {
  if (!pat || !sW || !sH) return null;
  var n = pat.length;

  var cc = computeClusters(pat, sW, sH);
  var clusterLabel = cc.clusterLabel;
  var clusterSizes = cc.clusterSizes;

  var neighbourCounts = computeNeighbourCounts(pat, sW, sH);
  var nearestDist = computeNearestSameColour(pat, sW, sH);

  // Per-stitch output arrays (typed for memory efficiency)
  // We return lightweight objects for transfer
  var perStitch = {
    neighbourCount: Array.from(neighbourCounts),
    nearestDist:    Array.from(nearestDist),
    clusterLabel:   Array.from(clusterLabel),
    clusterSize:    new Array(n),
    isConfetti:     new Uint8Array(n),
    isCompleted:    done ? Array.from(done) : new Array(n).fill(0)
  };

  for (var i = 0; i < n; i++) {
    var lbl = clusterLabel[i];
    perStitch.clusterSize[i] = lbl > 0 ? clusterSizes[lbl - 1] : 0;
    perStitch.isConfetti[i] = neighbourCounts[i] === 0 && pat[i].id !== "__skip__" && pat[i].id !== "__empty__" ? 1 : 0;
  }

  // Per-colour metrics
  var colourMap = {};
  for (var i2 = 0; i2 < n; i2++) {
    var id = pat[i2].id;
    if (id === "__skip__" || id === "__empty__") continue;
    if (!colourMap[id]) {
      colourMap[id] = {
        id: id,
        totalStitches: 0,
        completedStitches: 0,
        clusterSet: new Set(),
        largestClusterSize: 0,
        confettiCount: 0,
        nearestDistSum: 0,
        minX: sW, maxX: 0, minY: sH, maxY: 0
      };
    }
    var c = colourMap[id];
    c.totalStitches++;
    if (done && done[i2]) c.completedStitches++;
    if (perStitch.isConfetti[i2]) c.confettiCount++;
    c.nearestDistSum += nearestDist[i2];

    var cl = clusterLabel[i2];
    if (cl > 0) {
      c.clusterSet.add(cl);
      var cs = clusterSizes[cl - 1];
      if (cs > c.largestClusterSize) c.largestClusterSize = cs;
    }

    var x = i2 % sW, y = Math.floor(i2 / sW);
    if (x < c.minX) c.minX = x;
    if (x > c.maxX) c.maxX = x;
    if (y < c.minY) c.minY = y;
    if (y > c.maxY) c.maxY = y;
  }

  var perColour = {};
  for (var id in colourMap) {
    var c2 = colourMap[id];
    perColour[id] = {
      id: id,
      totalStitches: c2.totalStitches,
      completedStitches: c2.completedStitches,
      clusterCount: c2.clusterSet.size,
      largestClusterSize: c2.largestClusterSize,
      confettiCount: c2.confettiCount,
      averageNearestSameColour: c2.totalStitches > 0 ? c2.nearestDistSum / c2.totalStitches : 0,
      boundingBox: { x: c2.minX, y: c2.minY, w: c2.maxX - c2.minX + 1, h: c2.maxY - c2.minY + 1 }
    };
  }

  // Per-region metrics (10×10 blocks)
  var regionCols = Math.ceil(sW / REGION_SIZE);
  var regionRows = Math.ceil(sH / REGION_SIZE);
  var nRegions = regionCols * regionRows;
  var regions = new Array(nRegions);
  for (var ri = 0; ri < nRegions; ri++) {
    regions[ri] = { totalStitches: 0, completedStitches: 0, colourCounts: {}, dominantColour: null, colourCount: 0, completionPercentage: 0, impactScore: 0 };
  }

  for (var i3 = 0; i3 < n; i3++) {
    var id3 = pat[i3].id;
    if (id3 === "__skip__" || id3 === "__empty__") continue;
    var x3 = i3 % sW, y3 = Math.floor(i3 / sW);
    var rCol = Math.floor(x3 / REGION_SIZE), rRow = Math.floor(y3 / REGION_SIZE);
    var rIdx = rRow * regionCols + rCol;
    var reg = regions[rIdx];
    reg.totalStitches++;
    if (done && done[i3]) reg.completedStitches++;
    reg.colourCounts[id3] = (reg.colourCounts[id3] || 0) + 1;
  }

  // Resolve dominant colour and completion %
  for (var ri2 = 0; ri2 < nRegions; ri2++) {
    var reg2 = regions[ri2];
    if (reg2.totalStitches === 0) continue;
    reg2.completionPercentage = reg2.completedStitches / reg2.totalStitches;
    var maxC = 0, dom = null;
    var colIds = Object.keys(reg2.colourCounts);
    reg2.colourCount = colIds.length;
    for (var ci = 0; ci < colIds.length; ci++) {
      var cnt = reg2.colourCounts[colIds[ci]];
      if (cnt > maxC) { maxC = cnt; dom = colIds[ci]; }
    }
    reg2.dominantColour = dom;
    reg2.dominantCount = maxC;
    delete reg2.colourCounts; // don't send large map across wire
  }

  // Compute impact scores
  var patCentreX = sW / 2, patCentreY = sH / 2;
  var maxCentreDist = Math.sqrt(patCentreX * patCentreX + patCentreY * patCentreY);

  for (var ri3 = 0; ri3 < nRegions; ri3++) {
    var reg3 = regions[ri3];
    if (reg3.totalStitches === 0 || reg3.completionPercentage >= 1.0) { reg3.impactScore = -1; continue; }

    var rCol3 = ri3 % regionCols, rRow3 = Math.floor(ri3 / regionCols);
    var regCX = (rCol3 + 0.5) * REGION_SIZE;
    var regCY = (rRow3 + 0.5) * REGION_SIZE;

    // Factor 1: border completion (avg completion of 4 adjacent regions)
    var adjTotal = 0, adjCount = 0;
    if (rCol3 > 0)             { adjTotal += regions[rRow3 * regionCols + rCol3 - 1].completionPercentage; adjCount++; }
    if (rCol3 < regionCols-1)  { adjTotal += regions[rRow3 * regionCols + rCol3 + 1].completionPercentage; adjCount++; }
    if (rRow3 > 0)             { adjTotal += regions[(rRow3-1) * regionCols + rCol3].completionPercentage; adjCount++; }
    if (rRow3 < regionRows-1)  { adjTotal += regions[(rRow3+1) * regionCols + rCol3].completionPercentage; adjCount++; }
    var borderFactor = adjCount > 0 ? adjTotal / adjCount : 0;

    // Factor 2: cluster dominance
    var clusterFactor = reg3.totalStitches > 0 ? (reg3.dominantCount || 0) / reg3.totalStitches : 0;

    // Factor 3: near completion (exponential)
    var nearCompletionFactor = reg3.completionPercentage * reg3.completionPercentage;

    // Factor 4: visual centrality
    var dx4 = regCX - patCentreX, dy4 = regCY - patCentreY;
    var distNorm = maxCentreDist > 0 ? Math.sqrt(dx4*dx4 + dy4*dy4) / maxCentreDist : 0;
    var centralityFactor = 1.0 - distNorm * 0.3;

    // Factor 5: effort (fewer remaining = quicker win)
    var remaining = reg3.totalStitches - reg3.completedStitches;
    var effortFactor = 1.0 / (1.0 + remaining / 20);

    reg3.impactScore = borderFactor * 0.30
                     + clusterFactor * 0.20
                     + nearCompletionFactor * 0.25
                     + centralityFactor * 0.10
                     + effortFactor * 0.15;
  }

  return {
    perStitch: perStitch,
    perColour: perColour,
    perRegion: regions,
    regionSize: REGION_SIZE,
    regionCols: regionCols,
    regionRows: regionRows,
    sW: sW,
    sH: sH
  };
}

// ── Message handler ───────────────────────────────────────────────────────
var REGION_SIZE = 10;

self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type === "analyse" || msg.type === "analyse_incremental") {
    try {
      var result = runAnalysis(msg.pat, msg.done, msg.sW, msg.sH, REGION_SIZE);
      self.postMessage({ type: "result", result: result, requestId: msg.requestId });
    } catch (err) {
      self.postMessage({ type: "error", message: err.message, requestId: msg.requestId });
    }
  }
};
