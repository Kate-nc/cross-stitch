/* cleanup-worker.js — Web Worker for Cleanup Mode auto-detect algorithm.

   This worker is instantiated by useCleanupMode.js via `new Worker('cleanup-worker.js')`.

   Message in  → { type: 'autodetect', pat, sW, sH, targetLab, toleranceDe,
                    interiorCardinalThreshold, minForeignRatio, minRunLength }

     pat:  Array of {id, lab:[L,a,b]} one per cell (length sW*sH).
     sW, sH: pattern dimensions.
     targetLab: [L,a,b] of the colour being cleaned up.
     toleranceDe: ΔE threshold (CIEDE2000 units).
     interiorCardinalThreshold, minForeignRatio, minRunLength: tunable constants
       forwarded from useCleanupMode.js so the worker doesn't need its own copy.

   Message out → { type: 'result', selected: Array }
               | { type: 'error',  message: string }

   selected is a plain Array<number> (0|1), length sW*sH.
   Uint8Array cannot be posted from some older workers — plain Array is safe.
*/

importScripts('constants.js', 'dmc-data.js', 'colour-utils.js');

onmessage = function(e) {
  try {
    var msg = e.data;
    if (msg.type !== 'autodetect') return;

    var pat                       = msg.pat;
    var sW                        = msg.sW;
    var sH                        = msg.sH;
    var targetLab                 = msg.targetLab;
    var toleranceDe               = msg.toleranceDe;
    var INTERIOR_CARDINAL_THRESH  = (msg.interiorCardinalThreshold !== undefined) ? msg.interiorCardinalThreshold : 3;
    var MIN_FOREIGN_RATIO         = (msg.minForeignRatio          !== undefined) ? msg.minForeignRatio          : 0.35;
    var MIN_RUN_LENGTH            = (msg.minRunLength             !== undefined) ? msg.minRunLength             : 2;

    var n = sW * sH;

    // ── Phase 1: colour-match ───────────────────────────────────────────────
    // Mark all cells whose colour is within toleranceDe of targetLab.
    var candidate = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var cell = pat[i];
      if (!cell || !cell.lab) continue;
      if (cell.id === '__skip__' || cell.id === '__empty__') continue;
      var de = dE2000(targetLab, cell.lab);
      if (de <= toleranceDe) candidate[i] = 1;
    }

    // ── Phase 2: interior-block filter ─────────────────────────────────────
    // Cells fully surrounded by candidate neighbours on all four cardinal
    // sides cannot be lineart — they are interior fill pixels.  Remove them.
    var filtered = new Uint8Array(n);
    for (var j = 0; j < n; j++) {
      if (!candidate[j]) continue;
      var jx = j % sW;
      var jy = (j / sW) | 0;
      var cardinalCount = 0;
      if (jx > 0      && candidate[jy * sW + (jx - 1)]) cardinalCount++;
      if (jx < sW - 1 && candidate[jy * sW + (jx + 1)]) cardinalCount++;
      if (jy > 0      && candidate[(jy - 1) * sW + jx]) cardinalCount++;
      if (jy < sH - 1 && candidate[(jy + 1) * sW + jx]) cardinalCount++;
      if (cardinalCount >= INTERIOR_CARDINAL_THRESH) continue; // interior fill — drop
      filtered[j] = 1;
    }

    // ── Phase 3: boundary (foreign neighbour) filter ────────────────────────
    // Keep only cells where at least MIN_FOREIGN_RATIO of valid 8-connected
    // neighbours belong to a DIFFERENT colour (i.e., truly at a boundary).
    var boundary = new Uint8Array(n);
    for (var k = 0; k < n; k++) {
      if (!filtered[k]) continue;
      var kx = k % sW;
      var ky = (k / sW) | 0;
      var totalValid = 0;
      var foreignCount = 0;
      for (var ndy = -1; ndy <= 1; ndy++) {
        for (var ndx = -1; ndx <= 1; ndx++) {
          if (ndx === 0 && ndy === 0) continue;
          var nnx = kx + ndx, nny = ky + ndy;
          if (nnx < 0 || nnx >= sW || nny < 0 || nny >= sH) continue;
          var nni = nny * sW + nnx;
          var ncell = pat[nni];
          if (!ncell || ncell.id === '__skip__' || ncell.id === '__empty__') continue;
          totalValid++;
          if (!candidate[nni]) foreignCount++;
        }
      }
      if (totalValid === 0) continue; // isolated — skip
      if (foreignCount / totalValid >= MIN_FOREIGN_RATIO) boundary[k] = 1;
    }

    // ── Phase 4: connected-component min-size filter ─────────────────────────
    // Discard connected components (8-connected) smaller than MIN_RUN_LENGTH.
    // Uses iterative flood-fill via an explicit stack to avoid call-stack overflow
    // on large patterns.
    var visited = new Uint8Array(n);
    var selected = new Array(n).fill(0);

    for (var s = 0; s < n; s++) {
      if (!boundary[s] || visited[s]) continue;
      // BFS / iterative DFS to collect the component
      var component = [];
      var stack = [s];
      visited[s] = 1;
      while (stack.length > 0) {
        var cur = stack.pop();
        component.push(cur);
        var cx = cur % sW;
        var cy = (cur / sW) | 0;
        for (var cdy = -1; cdy <= 1; cdy++) {
          for (var cdx = -1; cdx <= 1; cdx++) {
            if (cdx === 0 && cdy === 0) continue;
            var cnx = cx + cdx, cny = cy + cdy;
            if (cnx < 0 || cnx >= sW || cny < 0 || cny >= sH) continue;
            var cni = cny * sW + cnx;
            if (!boundary[cni] || visited[cni]) continue;
            visited[cni] = 1;
            stack.push(cni);
          }
        }
      }
      if (component.length >= MIN_RUN_LENGTH) {
        for (var q = 0; q < component.length; q++) selected[component[q]] = 1;
      }
    }

    postMessage({ type: 'result', selected: selected });

  } catch (ex) {
    postMessage({ type: 'error', message: String(ex && ex.message || ex) });
  }
};
