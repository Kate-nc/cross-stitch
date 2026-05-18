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
   * Sample up to N points if features is larger; compute all-pairs L2 then
   * find the first "valley" in the histogram.
   */
  function estimateEps(features, opts) {
    opts = opts || {};
    const sampleCap = opts.sampleCap || 500;
    const bins = opts.bins || 40;
    const n = features.length;
    if (n < 4) return 1.0;

    let sample = features;
    if (n > sampleCap) {
      sample = [];
      const step = n / sampleCap;
      for (let i = 0; i < sampleCap; i++) sample.push(features[Math.floor(i * step)]);
    }

    const m = sample.length;
    const dists = [];
    let dmax = 0;
    for (let i = 0; i < m; i++) {
      for (let j = i + 1; j < m; j++) {
        const d = l2(sample[i], sample[j]);
        dists.push(d);
        if (d > dmax) dmax = d;
      }
    }
    if (dmax === 0) return 1.0;

    const hist = new Uint32Array(bins);
    for (const d of dists) {
      const b = Math.min(bins - 1, Math.floor((d / dmax) * bins));
      hist[b]++;
    }

    // Find first local maximum, then first local minimum after it.
    // Special-case bin[0]: on clean digital charts every cell of a given
    // glyph type is pixel-identical, so ALL intra-cluster distances land at
    // exactly 0 and produce a spike in bin[0]. The original loop started at
    // i=1 and could not nominate bin[0] as a peak, causing the first real
    // inter-cluster distance (e.g. ring vs dot) to be mistaken for the
    // intra-cluster peak and eps to be set far too high. Checking bin[0] as
    // a candidate fixes this without changing behaviour on noisy-real-world
    // data where bin[0] is empty.
    let firstPeak = 0;
    if (hist[0] > 0 && hist[0] >= hist[1]) {
      firstPeak = 0; // intra-cluster spike at zero distance
    } else {
      for (let i = 1; i < bins - 1; i++) {
        if (hist[i] > hist[i - 1] && hist[i] >= hist[i + 1]) { firstPeak = i; break; }
      }
    }
    let valley = firstPeak + 1;
    for (let i = firstPeak + 1; i < bins - 1; i++) {
      if (hist[i] <= hist[i - 1] && hist[i] < hist[i + 1]) { valley = i; break; }
    }
    // eps = valley centre in distance units. Floor to avoid touching 0.
    return Math.max(1e-3, (valley + 0.5) / bins * dmax);
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
    for (const cid of sortedIds) {
      const members = groups.get(cid);
      let best = members[0], bestSum = Infinity;
      for (const i of members) {
        let s = 0;
        for (const j of members) s += l2(features[i], features[j]);
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
    threshold = threshold == null ? 4 : threshold;
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
    const reclassified = reclusterNoise(workFeatures, assignments, medoids, eps, 1.5);
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
