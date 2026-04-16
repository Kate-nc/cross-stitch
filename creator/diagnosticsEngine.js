/* creator/diagnosticsEngine.js — Pure computation functions for pattern diagnostics.
   Called from useDiagnostics (inside useCreatorState.js).
   No external dependencies — safe to call on main thread. */

// ─── Confetti / Isolation diagnostic ─────────────────────────────────────────
// Returns { severity: Uint8Array, count, byColor, score }
// severity[i]: 0=clean, 1=single stitch (high), 2=cluster of 2 (medium), 3=cluster ≤threshold (low)
function _computeConfettiDiagnostic(pat, sW, sH, threshold) {
  var n = pat.length;
  var visited = new Uint8Array(n);
  var severity = new Uint8Array(n);
  var countBySev = [0, 0, 0, 0];
  var colorCounts = {};

  for (var i = 0; i < n; i++) {
    if (visited[i]) continue;
    var cell = pat[i];
    if (!cell || cell.id === "__skip__" || cell.id === "__empty__") { visited[i] = 1; continue; }
    var colorId = cell.id;
    var cluster = [i];
    visited[i] = 1;
    var head = 0;
    while (head < cluster.length) {
      var ci = cluster[head++];
      var cx = ci % sW, cy = Math.floor(ci / sW);
      var n1 = ci - 1, n2 = ci + 1, n3 = ci - sW, n4 = ci + sW;
      if (cx > 0       && !visited[n1] && pat[n1] && pat[n1].id === colorId) { visited[n1] = 1; cluster.push(n1); }
      if (cx < sW - 1  && !visited[n2] && pat[n2] && pat[n2].id === colorId) { visited[n2] = 1; cluster.push(n2); }
      if (cy > 0       && !visited[n3] && pat[n3] && pat[n3].id === colorId) { visited[n3] = 1; cluster.push(n3); }
      if (cy < sH - 1  && !visited[n4] && pat[n4] && pat[n4].id === colorId) { visited[n4] = 1; cluster.push(n4); }
    }
    var sz = cluster.length;
    if (sz <= threshold) {
      var sev = sz === 1 ? 1 : sz === 2 ? 2 : 3;
      for (var k = 0; k < cluster.length; k++) {
        var ki = cluster[k];
        severity[ki] = sev;
        countBySev[sev]++;
        if (!colorCounts[colorId]) colorCounts[colorId] = { id: colorId, rgb: pat[ki].rgb || [128,128,128], count: 0 };
        colorCounts[colorId].count++;
      }
    }
  }

  var total = countBySev[1] + countBySev[2] + countBySev[3];
  var stitchable = 0;
  for (var j = 0; j < n; j++) { if (pat[j] && pat[j].id !== "__skip__" && pat[j].id !== "__empty__") stitchable++; }
  var score = stitchable > 0 ? total / stitchable * 100 : 0;
  var byColor = Object.values(colorCounts).sort(function(a,b){return b.count-a.count;}).slice(0, 5);
  return { severity: severity, count: total, byColor: byColor, score: score };
}

// ─── Stitch Density / Heat map diagnostic ────────────────────────────────────
// Returns { blocks: [{x,y,w,h,value}], maxValue, avgValue, worstBlock }
function _computeHeatmapDiagnostic(pat, sW, sH, blockSize, metric) {
  var blocksX = Math.ceil(sW / blockSize);
  var blocksY = Math.ceil(sH / blockSize);
  var blocks = [];
  var maxValue = 0, totalValue = 0, blockCount = 0;
  var worstBlock = null;

  for (var by = 0; by < blocksY; by++) {
    for (var bx = 0; bx < blocksX; bx++) {
      var x0 = bx * blockSize, y0 = by * blockSize;
      var x1 = Math.min(x0 + blockSize, sW), y1 = Math.min(y0 + blockSize, sH);
      var value = 0;

      if (metric === "fragmentation") {
        var bW = x1 - x0, bH = y1 - y0, bN = bW * bH;
        var bVis = new Uint8Array(bN);
        var clusters = 0;
        for (var iy = 0; iy < bH; iy++) {
          for (var ix = 0; ix < bW; ix++) {
            var bi = iy * bW + ix;
            if (bVis[bi]) continue;
            var pi = (y0 + iy) * sW + (x0 + ix);
            var pc = pat[pi];
            if (!pc || pc.id === "__skip__" || pc.id === "__empty__") { bVis[bi] = 1; continue; }
            clusters++;
            var cid = pc.id;
            var q = [bi]; bVis[bi] = 1; var qh = 0;
            while (qh < q.length) {
              var qi = q[qh++]; var qx = qi % bW, qy = Math.floor(qi / bW);
              var nb; var npi;
              if (qx > 0)     { nb = qi-1;   if (!bVis[nb]) { npi=(y0+Math.floor(nb/bW))*sW+(x0+nb%bW); if(pat[npi]&&pat[npi].id===cid){bVis[nb]=1;q.push(nb);} } }
              if (qx < bW-1)  { nb = qi+1;   if (!bVis[nb]) { npi=(y0+Math.floor(nb/bW))*sW+(x0+nb%bW); if(pat[npi]&&pat[npi].id===cid){bVis[nb]=1;q.push(nb);} } }
              if (qy > 0)     { nb = qi-bW;  if (!bVis[nb]) { npi=(y0+Math.floor(nb/bW))*sW+(x0+nb%bW); if(pat[npi]&&pat[npi].id===cid){bVis[nb]=1;q.push(nb);} } }
              if (qy < bH-1)  { nb = qi+bW;  if (!bVis[nb]) { npi=(y0+Math.floor(nb/bW))*sW+(x0+nb%bW); if(pat[npi]&&pat[npi].id===cid){bVis[nb]=1;q.push(nb);} } }
            }
          }
        }
        value = clusters;
      } else {
        // colorcount
        var colors = {};
        for (var cy2 = y0; cy2 < y1; cy2++) {
          for (var cx2 = x0; cx2 < x1; cx2++) {
            var c2 = pat[cy2 * sW + cx2];
            if (c2 && c2.id !== "__skip__" && c2.id !== "__empty__") colors[c2.id] = true;
          }
        }
        value = Object.keys(colors).length;
      }

      blocks.push({ x: x0, y: y0, w: x1-x0, h: y1-y0, value: value });
      if (value > maxValue) { maxValue = value; worstBlock = { x: x0, y: y0, value: value }; }
      totalValue += value; blockCount++;
    }
  }

  return { blocks: blocks, maxValue: maxValue, avgValue: blockCount > 0 ? totalValue / blockCount : 0, worstBlock: worstBlock };
}

// ─── Symbol Readability diagnostic ───────────────────────────────────────────
// Returns { failCells: number[], warnCells: number[], failCount, warnCount, byColor, score }
// Assumes symbols are black (#000000) — the dominant symbol color in cross-stitch charts.
function _computeReadabilityDiagnostic(pat, cmap, sW, sH) {
  function toLinear(c) { var s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
  function lum(rgb) { return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]); }
  function cr(l1, l2) { var hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }

  var symLum = 0; // black symbol
  var failCells = [], warnCells = [];
  var colorStats = {};

  for (var i = 0; i < pat.length; i++) {
    var cell = pat[i];
    if (!cell || cell.id === "__skip__" || cell.id === "__empty__") continue;
    var entry = cmap ? cmap[cell.id] : null;
    var rgb = (entry && entry.rgb) || cell.rgb || [128, 128, 128];
    var fillLum = lum(rgb);
    var ratio = cr(fillLum, symLum);
    if (ratio < 3.0) {
      failCells.push(i);
      if (!colorStats[cell.id]) colorStats[cell.id] = { id: cell.id, rgb: rgb, failCount: 0, warnCount: 0 };
      colorStats[cell.id].failCount++;
    } else if (ratio < 4.5) {
      warnCells.push(i);
      if (!colorStats[cell.id]) colorStats[cell.id] = { id: cell.id, rgb: rgb, failCount: 0, warnCount: 0 };
      colorStats[cell.id].warnCount++;
    }
  }

  var total = 0;
  for (var j = 0; j < pat.length; j++) { if (pat[j] && pat[j].id !== "__skip__" && pat[j].id !== "__empty__") total++; }
  var passCount = total - failCells.length - warnCells.length;
  var score = total > 0 ? passCount / total * 100 : 100;
  var byColor = Object.values(colorStats).sort(function(a,b){return (b.failCount+b.warnCount)-(a.failCount+a.warnCount);}).slice(0, 10);
  return { failCells: failCells, warnCells: warnCells, failCount: failCells.length, warnCount: warnCells.length, byColor: byColor, score: score };
}
