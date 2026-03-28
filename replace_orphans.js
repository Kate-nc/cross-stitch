const fs = require('fs');
let code = fs.readFileSync('colour-utils.js', 'utf8');

const search = `function removeOrphanStitches(mapped, w, h, maxOrphanSize) {
  if (maxOrphanSize <= 0) return mapped;
  let len = mapped.length;
  let vis = new Uint8Array(len);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = y * w + x;
      if (vis[idx] || mapped[idx].id === "__skip__") continue;

      let tid = mapped[idx].id;
      let comp = [];
      let q = [idx];
      vis[idx] = 1;

      while (q.length > 0) {
        let curr = q.pop();
        comp.push(curr);
        if (comp.length > maxOrphanSize) break;

        let cx = curr % w;
        let cy = Math.floor(curr / w);

        let neighbors = [
          [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]
        ];

        for (let i = 0; i < neighbors.length; i++) {
          let nx = neighbors[i][0];
          let ny = neighbors[i][1];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            let nidx = ny * w + nx;
            if (!vis[nidx] && mapped[nidx].id === tid) {
              vis[nidx] = 1;
              q.push(nidx);
            }
          }
        }
      }

      if (comp.length <= maxOrphanSize) {
        // Find most common surrounding color
        let counts = {};
        for (let i = 0; i < comp.length; i++) {
          let cidx = comp[i];
          let cx = cidx % w;
          let cy = Math.floor(cidx / w);
          let neighbors = [
            [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
            [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]
          ];
          for (let j = 0; j < neighbors.length; j++) {
            let nx = neighbors[j][0];
            let ny = neighbors[j][1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              let nidx = ny * w + nx;
              if (mapped[nidx].id !== tid && mapped[nidx].id !== "__skip__") {
                let nid = mapped[nidx].id;
                counts[nid] = (counts[nid] || 0) + 1;
              }
            }
          }
        }

        let bestId = null;
        let bestCount = -1;
        for (let nid in counts) {
          if (counts[nid] > bestCount) {
            bestCount = counts[nid];
            bestId = nid;
          }
        }

        if (bestId) {
          // Find the object for bestId
          let replacement = null;
          for (let j = 0; j < len; j++) {
            if (mapped[j].id === bestId) {
              replacement = mapped[j];
              break;
            }
          }
          if (replacement) {
            for (let i = 0; i < comp.length; i++) {
              mapped[comp[i]] = replacement;
            }
          }
        }
      }
    }
  }
  return mapped;
}`;

const replace = `function removeOrphanStitches(mapped, w, h, maxOrphanSize) {
  if (maxOrphanSize <= 0) return mapped;
  let len = mapped.length;
  let vis = new Uint8Array(len);

  // Pre-allocate queue to avoid small array allocations
  // The max queue size inside an orphan search is very small, but we use a safely sized queue
  let q = new Uint32Array(maxOrphanSize * 4 + 10);
  let comp = new Uint32Array(maxOrphanSize + 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx = y * w + x;
      if (vis[idx] || mapped[idx].id === "__skip__") continue;

      let tid = mapped[idx].id;
      let qHead = 0;
      let qTail = 0;
      let compCount = 0;

      q[qTail++] = idx;
      vis[idx] = 1;

      while (qHead < qTail) {
        let curr = q[qHead++];
        if (compCount <= maxOrphanSize) {
            comp[compCount++] = curr;
        }
        if (compCount > maxOrphanSize) break;

        let cx = curr % w;
        let cy = Math.floor(curr / w);

        // unrolled neighbors: left, right, up, down
        if (cx > 0) {
            let nidx = curr - 1;
            if (!vis[nidx] && mapped[nidx].id === tid) { vis[nidx] = 1; q[qTail++] = nidx; }
        }
        if (cx < w - 1) {
            let nidx = curr + 1;
            if (!vis[nidx] && mapped[nidx].id === tid) { vis[nidx] = 1; q[qTail++] = nidx; }
        }
        if (cy > 0) {
            let nidx = curr - w;
            if (!vis[nidx] && mapped[nidx].id === tid) { vis[nidx] = 1; q[qTail++] = nidx; }
        }
        if (cy < h - 1) {
            let nidx = curr + w;
            if (!vis[nidx] && mapped[nidx].id === tid) { vis[nidx] = 1; q[qTail++] = nidx; }
        }
      }

      if (compCount <= maxOrphanSize) {
        let counts = {};
        for (let i = 0; i < compCount; i++) {
          let cidx = comp[i];
          let cx = cidx % w;
          let cy = Math.floor(cidx / w);

          let l = cx > 0, r = cx < w - 1, u = cy > 0, d = cy < h - 1;

          if (l) { let nid = mapped[cidx - 1].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
          if (r) { let nid = mapped[cidx + 1].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
          if (u) { let nid = mapped[cidx - w].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
          if (d) { let nid = mapped[cidx + w].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }

          if (l && u) { let nid = mapped[cidx - w - 1].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
          if (r && u) { let nid = mapped[cidx - w + 1].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
          if (l && d) { let nid = mapped[cidx + w - 1].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
          if (r && d) { let nid = mapped[cidx + w + 1].id; if (nid !== tid && nid !== "__skip__") counts[nid] = (counts[nid] || 0) + 1; }
        }

        let bestId = null;
        let bestCount = -1;
        for (let nid in counts) {
          if (counts[nid] > bestCount) {
            bestCount = counts[nid];
            bestId = nid;
          }
        }

        if (bestId) {
          let replacement = null;
          for (let j = 0; j < len; j++) {
            if (mapped[j].id === bestId) {
              replacement = mapped[j];
              break;
            }
          }
          if (replacement) {
            for (let i = 0; i < compCount; i++) {
              mapped[comp[i]] = replacement;
            }
          }
        }
      }
    }
  }
  return mapped;
}`;

const newCode = code.replace(search, replace);
if (newCode !== code) {
  fs.writeFileSync('colour-utils.js', newCode, 'utf8');
  console.log('Replaced successfully');
} else {
  console.log('Search string not found');
}
