/* creator/rasterChart/dbscan.js
 * ════════════════════════════════════════════════════════════════════════
 *   DBSCAN cluster pass for cross-stitch symbol cells, with automatic eps
 *   estimation from the valley of the all-pairs-distance histogram.
 *
 *   This module is independent of OpenCV. The caller provides a list of
 *   feature vectors (Float32Array each, same length) and we return cluster
 *   assignments + medoid indices. If `density-clustering` is loaded as a
 *   global (via the CDN script), we delegate to it; otherwise we use a
 *   small built-in DBSCAN implementation so unit tests don't need a CDN.
 *
 *   Public API:
 *     estimateEps(features, opts) → number
 *     cluster(features, opts) → {
 *       assignments: number[] (cluster id per point, -1 = noise),
 *       medoids: number[] (one feature index per cluster id),
 *       eps: number, minPts: number,
 *     }
 *     mergeByHashHamming(clusters, dHashes, threshold) → updated clusters
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  function l2(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  /**
   * Estimate DBSCAN epsilon using the Kneedle-style k-NN elbow method.
   *
   * For each sampled point we compute the distance to its k-th nearest
   * neighbour (k = minPts, default 2).  Sorting these distances ascending
   * gives a curve that transitions from small intra-cluster values to large
   * inter-cluster values.  The "knee" of this curve — found via the point of
   * maximum perpendicular distance from the chord connecting the first and
   * last points — is a robust automatic eps estimate.
   *
   * This replaces the earlier all-pairs histogram-valley approach which
   * failed on monotonically-decreasing pairwise-distance distributions
   * (a common shape for real HOG features) and produced either a
   * pathologically small eps (all cells become noise) or one so large that
   * all cells collapsed into a single cluster.
   */
  function estimateEps(features, opts) {
    opts = opts || {};
    const sampleCap = opts.sampleCap || 500;
    const minPts = opts.minPts || 2;
    const n = features.length;
    if (n < 4) return 1.0;

    let sample = features;
    if (n > sampleCap) {
      sample = [];
      const step = n / sampleCap;
      for (let i = 0; i < sampleCap; i++) sample.push(features[Math.floor(i * step)]);
    }

    const m = sample.length;
    const k = Math.min(minPts, m - 1);

    // For each sampled point, find the distance to its k-th nearest neighbour.
    const knnDists = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const row = [];
      for (let j = 0; j < m; j++) {
        if (j !== i) row.push(l2(sample[i], sample[j]));
      }
      row.sort((a, b) => a - b);
      knnDists[i] = row[k - 1] !== undefined ? row[k - 1] : 0;
    }
    // Sort ascending to build the k-NN distance curve.
    knnDists.sort((a, b) => a - b);

    // Kneedle: find the index with maximum signed perpendicular distance from
    // the chord connecting (0, knnDists[0]) to (m-1, knnDists[m-1]).
    // On a flat-then-steep k-NN curve this is the intra/inter-cluster boundary.
    const x0 = 0,     y0 = knnDists[0];
    const x1 = m - 1, y1 = knnDists[m - 1];
    const dx = x1 - x0, dy = y1 - y0;
    let elbowIdx = Math.floor(m / 2); // fallback: median
    const lineLen2 = dx * dx + dy * dy;
    if (lineLen2 > 0) {
      let maxCross = -Infinity;
      for (let i = 0; i < m; i++) {
        const cross = (i - x0) * dy - (knnDists[i] - y0) * dx;
        if (cross > maxCross) { maxCross = cross; elbowIdx = i; }
      }
    }
    return Math.max(1e-3, knnDists[elbowIdx]);
  }

  /**
   * Tiny DBSCAN. O(n²) which is fine for a few thousand cells; the proper
   * `density-clustering` global is preferred when available.
   */
  function dbscanLocal(features, eps, minPts) {
    const n = features.length;
    const assign = new Int32Array(n).fill(-1);
    const visited = new Uint8Array(n);
    let cluster = -1;
    const neighbours = (idx) => {
      const out = [];
      for (let j = 0; j < n; j++) if (j !== idx && l2(features[idx], features[j]) <= eps) out.push(j);
      return out;
    };
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      visited[i] = 1;
      const N = neighbours(i);
      if (N.length + 1 < minPts) continue; // noise (for now)
      cluster++;
      assign[i] = cluster;
      const queue = N.slice();
      while (queue.length) {
        const j = queue.shift();
        if (!visited[j]) {
          visited[j] = 1;
          const Nj = neighbours(j);
          if (Nj.length + 1 >= minPts) for (const k of Nj) if (queue.indexOf(k) === -1) queue.push(k);
        }
        if (assign[j] === -1) assign[j] = cluster;
      }
    }
    return Array.from(assign);
  }

  function computeMedoids(features, assignments) {
    const groups = new Map();
    for (let i = 0; i < assignments.length; i++) {
      const c = assignments[i];
      if (c < 0) continue;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(i);
    }
    const medoids = [];
    const sortedIds = Array.from(groups.keys()).sort((a, b) => a - b);
    // Cap per-cluster sample to avoid O(n²) stalls in the worker when
    // DBSCAN produces a large single cluster before Fix D has a chance to
    // gate reclusterNoise. 200 evenly-spaced members give a representative
    // medoid and keep the cost at O(40 000) L2 calls per cluster regardless
    // of the total cell count.
    const MEDOID_SAMPLE_CAP = 200;
    for (const cid of sortedIds) {
      const members = groups.get(cid);
      let sample = members;
      if (members.length > MEDOID_SAMPLE_CAP) {
        sample = [];
        const step = members.length / MEDOID_SAMPLE_CAP;
        for (let k = 0; k < MEDOID_SAMPLE_CAP; k++) sample.push(members[Math.floor(k * step)]);
      }
      let best = sample[0], bestSum = Infinity;
      for (const i of sample) {
        let s = 0;
        for (const j of sample) s += l2(features[i], features[j]);
        if (s < bestSum) { bestSum = s; best = i; }
      }
      medoids[cid] = best;
    }
    return medoids;
  }

  /**
   * Re-cluster noise points by 1-NN against existing medoids if distance ≤
   * factor × eps.
   */
  function reclusterNoise(features, assignments, medoids, eps, factor) {
    factor = factor || 1.5;
    const out = assignments.slice();
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== -1) continue;
      let bestC = -1, bestD = Infinity;
      for (let c = 0; c < medoids.length; c++) {
        if (medoids[c] == null) continue;
        const d = l2(features[i], features[medoids[c]]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (bestC >= 0 && bestD <= factor * eps) out[i] = bestC;
    }
    return out;
  }

  /**
   * Merge clusters whose medoid dHashes have Hamming distance ≤ threshold.
   * dHashes: BigInt[] parallel to features; medoids: cluster→featureIdx.
   */
  function mergeByHashHamming(assignments, medoids, dHashes, threshold) {
    // Default threshold reduced from 4 to 2: a 64-bit dHash at typical
    // cross-stitch cell sizes (8–25 px) has many distinct symbols within
    // 3–4 Hamming bits, so 4 caused aggressive over-merging. Threshold 2
    // still catches true same-symbol sub-cluster splits (0–1 bits of noise)
    // while preserving genuinely different symbols that differ by 3+ bits.
    threshold = threshold == null ? 2 : threshold;
    const out = assignments.slice();
    const remap = medoids.map((_, i) => i);

    function hamm(a, b) {
      let x = a ^ b, n = 0;
      while (x) { x &= x - 1n; n++; }
      return n;
    }

    for (let i = 0; i < medoids.length; i++) {
      for (let j = i + 1; j < medoids.length; j++) {
        if (medoids[i] == null || medoids[j] == null) continue;
        const h = hamm(dHashes[medoids[i]], dHashes[medoids[j]]);
        if (h <= threshold) {
          // merge j into i (root union)
          let ri = i; while (remap[ri] !== ri) ri = remap[ri];
          let rj = j; while (remap[rj] !== rj) rj = remap[rj];
          if (ri !== rj) remap[rj] = ri;
        }
      }
    }
    // resolve
    const resolved = remap.map((_, i) => {
      let r = i; while (remap[r] !== r) r = remap[r];
      return r;
    });
    for (let i = 0; i < out.length; i++) {
      if (out[i] >= 0) out[i] = resolved[out[i]];
    }
    // compact cluster ids so they're contiguous 0..K-1
    const seen = new Map();
    let next = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] < 0) continue;
      if (!seen.has(out[i])) seen.set(out[i], next++);
      out[i] = seen.get(out[i]);
    }
    return out;
  }

  /**
   * Full clustering pass. If `clustering` (density-clustering) is loaded as
   * a global, we use it; otherwise the built-in fallback runs.
   *
   * Phase 2 options:
   *   opts.normalise     {boolean}  z-score each dimension before clustering
   *   opts.labStartIdx   {number}   first Lab dimension index (post-normalise)
   *   opts.labDims       {number}   number of Lab dimensions (usually 3: L, a, b)
   *   opts.labWeight     {number}   multiplier for Lab columns; default 0.6
   *
   * Normalisation operates on a CLONE of the feature arrays so the caller's
   * data is never mutated.
   */
  function cluster(features, opts) {
    opts = opts || {};
    const minPts = opts.minPts || 2;

    // Phase 2: optional z-score + Lab-column weighting.
    let workFeatures = features;
    if (opts.normalise && features.length > 1) {
      workFeatures = features.map(f => Float32Array.from(f)); // deep clone
      zScoreNormalize(workFeatures);
      if (opts.labStartIdx != null && opts.labDims != null) {
        applyColumnWeight(workFeatures, opts.labStartIdx, opts.labDims,
          opts.labWeight != null ? opts.labWeight : 0.6);
      }
    }

    const eps = opts.eps != null ? opts.eps : estimateEps(workFeatures, opts);

    let assignments;
    const globalDB = (typeof clustering !== 'undefined' && clustering.DBSCAN) ? clustering : null;
    if (globalDB) {
      const arrays = workFeatures.map(f => Array.from(f));
      const dbs = new globalDB.DBSCAN();
      const groups = dbs.run(arrays, eps, minPts, l2);
      const noise = dbs.noise || [];
      assignments = new Array(workFeatures.length).fill(-1);
      for (let c = 0; c < groups.length; c++) for (const i of groups[c]) assignments[i] = c;
      void noise;
    } else {
      assignments = dbscanLocal(workFeatures, eps, minPts);
    }

    const medoids = computeMedoids(workFeatures, assignments);

    // Skip noise re-absorption when DBSCAN found at most 1 valid cluster.
    // With only one cluster, reclusterNoise would pull all noise points into
    // it (within 1.5×eps), creating one giant cluster that hides every symbol
    // distinction. Adding noise to a single cluster can never improve
    // separation, so we leave those cells as noise (-1) instead.
    const numDbscanClusters = new Set(assignments.filter(a => a >= 0)).size;
    let reclassified;
    if (numDbscanClusters <= 1) {
      reclassified = assignments.slice();
    } else {
      reclassified = reclusterNoise(workFeatures, assignments, medoids, eps, 1.5);
    }

    const medoids2 = computeMedoids(workFeatures, reclassified);
    return { assignments: reclassified, medoids: medoids2, eps, minPts };
  }

  /**
   * Z-score normalise feature vectors in place. Each dimension is centred
   * at 0 and scaled to unit variance. Dimensions with zero variance are left
   * unchanged (effectively weight 0).
   *
   * @param {Float32Array[]} features  Mutated in place.
   */
  function zScoreNormalize(features) {
    if (!features || features.length < 2) return;
    const dims = features[0].length;
    const n = features.length;
    const means = new Float64Array(dims);
    const stds  = new Float64Array(dims);
    for (let d = 0; d < dims; d++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += features[i][d];
      means[d] = sum / n;
    }
    for (let d = 0; d < dims; d++) {
      let sq = 0;
      for (let i = 0; i < n; i++) { const diff = features[i][d] - means[d]; sq += diff * diff; }
      stds[d] = Math.sqrt(sq / n) || 1; // 1 avoids division-by-zero on constant dims
    }
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < dims; d++) {
        features[i][d] = (features[i][d] - means[d]) / stds[d];
      }
    }
  }

  /**
   * Multiply a contiguous block of feature columns by `weight` in place.
   * Called after z-score normalisation to up-weight Lab channels (0.6 per
   * Phase 2 spec, range 0.5–0.7).
   *
   * @param {Float32Array[]} features  Mutated in place.
   * @param {number} startIdx   First column to weight.
   * @param {number} count      Number of columns to weight.
   * @param {number} [weight=0.6]
   */
  function applyColumnWeight(features, startIdx, count, weight) {
    weight = weight == null ? 0.6 : weight;
    const end = startIdx + count;
    for (const f of features) {
      for (let d = startIdx; d < end && d < f.length; d++) f[d] *= weight;
    }
  }

  const api = { estimateEps, cluster, mergeByHashHamming, computeMedoids, reclusterNoise,
    zScoreNormalize, applyColumnWeight, l2 };
  if (typeof globalThis !== 'undefined') globalThis.RasterChartDBSCAN = api;
  if (typeof self !== 'undefined' && typeof window === 'undefined') self.RasterChartDBSCAN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
