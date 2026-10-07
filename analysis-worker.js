/* analysis-worker.js — Spatial analysis Web Worker
   ═══════════════════════════════════════════════════════════════════════════
   Protocol (current — see reports/track-view-performance-plan.md, F2):

     { type: "setPattern", patternId, codes, ids, sW, sH }
         `codes` is a Uint16Array, one entry per stitch, indexing `ids`
         (DMC/blend ids); SKIP (0xFFFF) marks __skip__/__empty__ cells. Sent
         once per pattern, with the buffer transferred, so the main thread
         never structured-clones an object per stitch again.

     { type: "analyse", patternId, done, sW, sH, requestId, blockSize }
         `done` is the progress Uint8Array. Uses the stored pattern.

     -> { type: "result", requestId, patternId, result }
         `result` has perColour, perRegion, regionSize, regionCols,
         regionRows, sW, sH. The pattern-only per-stitch arrays
         (`result.perStitch`) are attached to the FIRST result for each
         patternId only, with their buffers transferred; the main thread
         keeps them. Every later result carries just the progress-dependent
         summaries, which are small.

   Everything that depends only on the pattern — clusters, neighbour counts,
   nearest-same-colour distances, per-colour shape metrics, per-region colour
   make-up — is computed once per pattern and cached. A progress change only
   re-counts completions and impact scores: one pass over `done`.

   Legacy: { type: "analyse", pat: [{id}], done, sW, sH, ... } still works and
   returns the full result, perStitch included.
*/

var SKIP = 0xFFFF;

// ── Pattern model ─────────────────────────────────────────────────────────
// Accepts a model ({codes, ids}) or the legacy array of {id} objects. The
// helpers below all take either, so callers (and the unit tests) need not
// care which they hold.
function toModel(pat, sW, sH) {
  if (pat && pat.codes) return pat;
  var n = pat.length, codes = new Uint16Array(n), ids = [], map = new Map();
  for (var i = 0; i < n; i++) {
    var id = pat[i] && pat[i].id;
    if (id == null || id === "__skip__" || id === "__empty__") { codes[i] = SKIP; continue; }
    var c = map.get(id);
    if (c === undefined) { c = ids.length; ids.push(id); map.set(id, c); }
    codes[i] = c;
  }
  return { codes: codes, ids: ids, sW: sW, sH: sH };
}

// ── Connected-component flood fill (4-connected) ───────────────────────────
function computeClusters(pat, sW, sH) {
  var codes = toModel(pat, sW, sH).codes;
  var n = codes.length;
  var clusterLabel = new Int32Array(n);  // 0 = unvisited
  var clusterSizes = [];  // clusterSizes[label-1] = size
  var label = 0;
  var queue = new Int32Array(n);

  for (var start = 0; start < n; start++) {
    if (clusterLabel[start] !== 0) continue;
    var code = codes[start];
    if (code === SKIP) { clusterLabel[start] = -1; continue; }

    label++;
    var head = 0, tail = 0;
    queue[tail++] = start;
    clusterLabel[start] = label;

    while (head < tail) {
      var idx = queue[head++];
      var x = idx % sW, y = (idx - x) / sW;
      if (y > 0)      { var nb = idx - sW; if (clusterLabel[nb] === 0 && codes[nb] === code) { clusterLabel[nb] = label; queue[tail++] = nb; } }
      if (y < sH - 1) { nb = idx + sW;     if (clusterLabel[nb] === 0 && codes[nb] === code) { clusterLabel[nb] = label; queue[tail++] = nb; } }
      if (x > 0)      { nb = idx - 1;      if (clusterLabel[nb] === 0 && codes[nb] === code) { clusterLabel[nb] = label; queue[tail++] = nb; } }
      if (x < sW - 1) { nb = idx + 1;      if (clusterLabel[nb] === 0 && codes[nb] === code) { clusterLabel[nb] = label; queue[tail++] = nb; } }
    }
    clusterSizes.push(tail);
  }

  return { clusterLabel: clusterLabel, clusterSizes: clusterSizes };
}

// ── Per-stitch nearest same-colour distance (approximate BFS from each stitch) ─
// For each stitch, scan expanding shells of the 8-neighbourhood until same colour found.
// Cap search at maxR=20 stitches for performance.
function computeNearestSameColour(pat, sW, sH) {
  var codes = toModel(pat, sW, sH).codes;
  var n = codes.length;
  var nearest = new Float32Array(n);
  nearest.fill(999);

  for (var i = 0; i < n; i++) {
    var code = codes[i];
    if (code === SKIP) { nearest[i] = 0; continue; }
    var x0 = i % sW, y0 = (i - x0) / sW;
    outer:
    for (var r = 1; r <= 20; r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only shell
          var nx = x0 + dx, ny = y0 + dy;
          if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
          if (codes[ny * sW + nx] === code) {
            nearest[i] = Math.sqrt(dx * dx + dy * dy);
            break outer;
          }
        }
      }
    }
  }
  return nearest;
}

// ── Per-stitch 8-neighbour same-colour count ──────────────────────────────
function computeNeighbourCounts(pat, sW, sH) {
  var codes = toModel(pat, sW, sH).codes;
  var n = codes.length;
  var counts = new Uint8Array(n);
  for (var i = 0; i < n; i++) {
    var code = codes[i];
    if (code === SKIP) continue;
    var x0 = i % sW, y0 = (i - x0) / sW;
    var c = 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = x0 + dx, ny = y0 + dy;
        if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
        if (codes[ny * sW + nx] === code) c++;
      }
    }
    counts[i] = c;
  }
  return counts;
}

// ── Pattern-only analysis (computed once per pattern) ─────────────────────
function computeStatics(model, postProgress) {
  var codes = model.codes, sW = model.sW, sH = model.sH, n = codes.length, nIds = model.ids.length;
  postProgress = postProgress || function () {};

  postProgress("clusters", "Detecting clusters…");
  var cc = computeClusters(model, sW, sH);
  var clusterLabel = cc.clusterLabel, clusterSizes = cc.clusterSizes;

  postProgress("neighbours", "Measuring neighbours…");
  var neighbourCounts = computeNeighbourCounts(model, sW, sH);
  var nearestDist = computeNearestSameColour(model, sW, sH);

  // Typed throughout: the sole consumer indexes them numerically, and a plain
  // Array here costs a per-element structured clone on the way back.
  var clusterSize = new Int32Array(n);
  var isConfetti = new Uint8Array(n);

  // Per-colour shape metrics, indexed by code.
  var total = new Int32Array(nIds), confetti = new Int32Array(nIds), largest = new Int32Array(nIds);
  var distSum = new Float64Array(nIds), lastCluster = new Int32Array(nIds), clusterCount = new Int32Array(nIds);
  var minX = new Int32Array(nIds).fill(sW), maxX = new Int32Array(nIds), minY = new Int32Array(nIds).fill(sH), maxY = new Int32Array(nIds);
  // Each colour's clusters are counted by distinct label; labels are assigned
  // in scan order, so a seen-flag per label is enough.
  var labelSeen = new Uint8Array(clusterSizes.length + 1);

  for (var i = 0; i < n; i++) {
    var code = codes[i];
    if (code === SKIP) continue;
    var lbl = clusterLabel[i];
    var sz = lbl > 0 ? clusterSizes[lbl - 1] : 0;
    clusterSize[i] = sz;
    var conf = neighbourCounts[i] === 0 ? 1 : 0;
    isConfetti[i] = conf;

    total[code]++;
    confetti[code] += conf;
    distSum[code] += nearestDist[i];
    if (lbl > 0) {
      if (!labelSeen[lbl]) { labelSeen[lbl] = 1; clusterCount[code]++; }
      if (sz > largest[code]) largest[code] = sz;
    }
    var x = i % sW, y = (i - x) / sW;
    if (x < minX[code]) minX[code] = x;
    if (x > maxX[code]) maxX[code] = x;
    if (y < minY[code]) minY[code] = y;
    if (y > maxY[code]) maxY[code] = y;
  }

  var colours = new Array(nIds);
  for (var c = 0; c < nIds; c++) {
    colours[c] = {
      id: model.ids[c],
      totalStitches: total[c],
      clusterCount: clusterCount[c],
      largestClusterSize: largest[c],
      confettiCount: confetti[c],
      averageNearestSameColour: total[c] > 0 ? distSum[c] / total[c] : 0,
      boundingBox: { x: minX[c], y: minY[c], w: maxX[c] - minX[c] + 1, h: maxY[c] - minY[c] + 1 }
    };
  }

  return {
    perStitch: {
      neighbourCount: neighbourCounts,
      nearestDist: nearestDist,
      clusterLabel: clusterLabel,
      clusterSize: clusterSize,
      isConfetti: isConfetti
    },
    colours: colours,
    regionsByBs: {}
  };
}

// Per-region colour make-up for one block size: also pattern-only, cached.
function regionStatics(model, statics, bs) {
  var hit = statics.regionsByBs[bs];
  if (hit) return hit;
  var codes = model.codes, sW = model.sW, sH = model.sH, n = codes.length, nIds = model.ids.length;
  var cols = Math.ceil(sW / bs), rows = Math.ceil(sH / bs), nRegions = cols * rows;
  var regionOf = new Int32Array(n);
  var total = new Int32Array(nRegions);
  var countsByRegion = new Array(nRegions);
  for (var i = 0; i < n; i++) {
    var x = i % sW, y = (i - x) / sW;
    var r = Math.floor(y / bs) * cols + Math.floor(x / bs);
    regionOf[i] = r;
    var code = codes[i];
    if (code === SKIP) continue;
    total[r]++;
    var regionCounts = countsByRegion[r];
    if (!regionCounts) regionCounts = countsByRegion[r] = new Map();
    var colour = regionCounts.get(code);
    if (colour) colour.count++;
    else regionCounts.set(code, { count: 1, firstSeen: i });
  }
  // Ties go to whichever colour came first in the order the previous
  // implementation iterated, Object.keys() of a per-region map: integer-like
  // ids ("310") ascending first, then the rest in the order they were first
  // seen in that region. Reproduced exactly so results are unchanged.
  var intKey = new Array(nIds);
  for (var c0 = 0; c0 < nIds; c0++) {
    var s = String(model.ids[c0]), v = Number(s);
    intKey[c0] = (/^(0|[1-9]\d*)$/.test(s) && v < 4294967295) ? v : -1;
  }
  function before(a, b, regionCounts) {
    var ka = intKey[a], kb = intKey[b];
    if (ka >= 0 && kb >= 0) return ka < kb;
    if (ka >= 0 || kb >= 0) return ka >= 0;
    return regionCounts.get(a).firstSeen < regionCounts.get(b).firstSeen;
  }
  var dominant = new Array(nRegions), dominantCount = new Int32Array(nRegions), colourCount = new Int32Array(nRegions);
  for (var r2 = 0; r2 < nRegions; r2++) {
    var best = 0, domCode = -1, regionCounts = countsByRegion[r2];
    if (regionCounts) {
      regionCounts.forEach(function (colour, code) {
        if (colour.count > best || (colour.count === best && before(code, domCode, regionCounts))) {
          best = colour.count;
          domCode = code;
        }
      });
    }
    dominant[r2] = domCode >= 0 ? model.ids[domCode] : null; dominantCount[r2] = best; colourCount[r2] = regionCounts ? regionCounts.size : 0;
  }
  hit = { bs: bs, cols: cols, rows: rows, regionOf: regionOf, total: total, dominant: dominant, dominantCount: dominantCount, colourCount: colourCount };
  statics.regionsByBs[bs] = hit;
  return hit;
}

// ── Progress-dependent analysis (one pass over `done`) ────────────────────
function analyseProgress(model, statics, done, bs) {
  var codes = model.codes, sW = model.sW, sH = model.sH, n = codes.length, nIds = model.ids.length;
  var reg = regionStatics(model, statics, bs);
  var colourDone = new Int32Array(nIds);
  var regionDone = new Int32Array(reg.total.length);
  if (done) {
    for (var i = 0; i < n; i++) {
      if (!done[i]) continue;
      var code = codes[i];
      if (code === SKIP) continue;
      colourDone[code]++;
      regionDone[reg.regionOf[i]]++;
    }
  }

  var perColour = {};
  for (var c = 0; c < nIds; c++) {
    var s = statics.colours[c];
    if (!s.totalStitches) continue;
    perColour[s.id] = {
      id: s.id,
      totalStitches: s.totalStitches,
      completedStitches: colourDone[c],
      clusterCount: s.clusterCount,
      largestClusterSize: s.largestClusterSize,
      confettiCount: s.confettiCount,
      averageNearestSameColour: s.averageNearestSameColour,
      boundingBox: { x: s.boundingBox.x, y: s.boundingBox.y, w: s.boundingBox.w, h: s.boundingBox.h }
    };
  }

  var regionCols = reg.cols, regionRows = reg.rows, nRegions = regionCols * regionRows;
  var regions = new Array(nRegions);
  for (var r = 0; r < nRegions; r++) {
    var t = reg.total[r];
    regions[r] = t === 0
      ? { totalStitches: 0, completedStitches: 0, colourCounts: {}, dominantColour: null, colourCount: 0, completionPercentage: 0, impactScore: 0 }
      : { totalStitches: t, completedStitches: regionDone[r], dominantColour: reg.dominant[r], colourCount: reg.colourCount[r],
          completionPercentage: regionDone[r] / t, impactScore: 0, dominantCount: reg.dominantCount[r] };
  }

  // Impact scores
  var patCentreX = sW / 2, patCentreY = sH / 2;
  var maxCentreDist = Math.sqrt(patCentreX * patCentreX + patCentreY * patCentreY);

  for (var ri3 = 0; ri3 < nRegions; ri3++) {
    var reg3 = regions[ri3];
    if (reg3.totalStitches === 0 || reg3.completionPercentage >= 1.0) { reg3.impactScore = -1; continue; }

    var rCol3 = ri3 % regionCols, rRow3 = Math.floor(ri3 / regionCols);
    var regCX = (rCol3 + 0.5) * bs;
    var regCY = (rRow3 + 0.5) * bs;

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
    perColour: perColour,
    perRegion: regions,
    regionSize: bs,
    regionCols: regionCols,
    regionRows: regionRows,
    sW: sW,
    sH: sH
  };
}

// ── Full analysis (legacy messages and tests) ─────────────────────────────
function runAnalysis(pat, done, sW, sH, REGION_SIZE, postProgress) {
  if (!pat || !sW || !sH) return null;
  var model = toModel(pat, sW, sH);
  var statics = computeStatics(model, postProgress);
  var result = analyseProgress(model, statics, done, REGION_SIZE);
  var ps = statics.perStitch;
  result.perStitch = {
    neighbourCount: ps.neighbourCount,
    nearestDist: ps.nearestDist,
    clusterLabel: ps.clusterLabel,
    clusterSize: ps.clusterSize,
    isConfetti: ps.isConfetti,
    isCompleted: done ? new Uint8Array(done) : new Uint8Array(model.codes.length)
  };
  return result;
}

// ── Message handler ───────────────────────────────────────────────────────
var REGION_SIZE = 10;
var current = null;  // { id, model, statics, staticsSent }

function handleMessage(msg, post) {
  if (msg.type === "setPattern") {
    current = { id: msg.patternId, model: { codes: msg.codes, ids: msg.ids, sW: msg.sW, sH: msg.sH }, statics: null, staticsSent: false };
    return;
  }
  if (msg.type !== "analyse" && msg.type !== "analyse_incremental") return;
  var requestId = msg.requestId;
  try {
    var bs = (msg.blockSize >= 5 && msg.blockSize <= 100) ? msg.blockSize : REGION_SIZE;
    var postProgress = function (stage, message) {
      try { post({ type: "progress", stage: stage, message: message, requestId: requestId }); } catch (_) {}
    };

    if (msg.pat) {
      postProgress("start", "Analysing pattern…");
      post({ type: "result", result: runAnalysis(msg.pat, msg.done, msg.sW, msg.sH, bs, postProgress), requestId: requestId });
      return;
    }

    if (!current || current.id !== msg.patternId) {
      post({ type: "error", message: "analyse: no pattern loaded for id " + msg.patternId, requestId: requestId });
      return;
    }
    if (!current.statics) {
      postProgress("start", "Analysing pattern…");
      current.statics = computeStatics(current.model, postProgress);
    }
    var result = analyseProgress(current.model, current.statics, msg.done, bs);
    var transfer = [];
    if (!current.staticsSent) {
      var ps = current.statics.perStitch;
      result.perStitch = ps;
      transfer = [ps.neighbourCount.buffer, ps.nearestDist.buffer, ps.clusterLabel.buffer, ps.clusterSize.buffer, ps.isConfetti.buffer];
      // Transferred, so detached here; nothing in this worker reads them again.
      current.statics.perStitch = null;
      current.staticsSent = true;
    }
    post({ type: "result", result: result, requestId: requestId, patternId: current.id }, transfer);
  } catch (err) {
    post({ type: "error", message: err.message, requestId: requestId });
  }
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = function (e) {
    handleMessage(e.data, function (m, transfer) { self.postMessage(m, transfer || []); });
  };
}
