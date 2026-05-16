/* tests/rasterChart-dbscan.test.js */
const { cluster, estimateEps, mergeByHashHamming, computeMedoids, l2 } =
  require('../creator/rasterChart/dbscan.js');

function makeGroup(centre, n, jitter) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(new Float32Array(centre.map(v => v + (Math.random() - 0.5) * jitter)));
  }
  return out;
}

describe('estimateEps', () => {
  test('returns positive number for non-trivial input', () => {
    const data = [];
    for (let i = 0; i < 30; i++) data.push(new Float32Array([Math.random(), Math.random()]));
    const eps = estimateEps(data);
    expect(eps).toBeGreaterThan(0);
  });
});

describe('cluster — synthetic K-cluster recovery', () => {
  test('recovers exactly 3 clusters on well-separated synthetic data', () => {
    const seed = 42;
    let s = seed;
    Math.random = function rng() { s = (s * 9301 + 49297) % 233280; return s / 233280; };

    const features = [
      ...makeGroup([0, 0],   8, 0.05),
      ...makeGroup([10, 10], 8, 0.05),
      ...makeGroup([0, 10],  8, 0.05),
    ];
    const result = cluster(features, { minPts: 2, eps: 1.0 });
    const ids = new Set(result.assignments.filter(a => a >= 0));
    expect(ids.size).toBe(3);
    expect(result.assignments.every(a => a >= 0)).toBe(true);
  });
});

describe('computeMedoids', () => {
  test('picks the most central point in each cluster', () => {
    const f = [new Float32Array([0, 0]), new Float32Array([1, 0]), new Float32Array([2, 0])];
    const a = [0, 0, 0];
    const m = computeMedoids(f, a);
    expect(m[0]).toBe(1);
  });
});

describe('mergeByHashHamming', () => {
  test('merges clusters with near-identical dHashes', () => {
    const f = [new Float32Array([0, 0]), new Float32Array([1, 1])];
    const assignments = [0, 1];
    const medoids = [0, 1];
    const dHashes = [0n, 1n]; // hamming 1
    const merged = mergeByHashHamming(assignments, medoids, dHashes, 4);
    expect(new Set(merged).size).toBe(1);
  });

  test('leaves dissimilar clusters apart', () => {
    const f = [new Float32Array([0, 0]), new Float32Array([1, 1])];
    const merged = mergeByHashHamming([0, 1], [0, 1], [0n, 0xFFFFFFFFn], 4);
    expect(new Set(merged).size).toBe(2);
  });
});

describe('l2', () => {
  test('zero for identical vectors', () => {
    expect(l2(new Float32Array([1, 2, 3]), new Float32Array([1, 2, 3]))).toBe(0);
  });
  test('matches Pythagorean expectation', () => {
    expect(l2(new Float32Array([0, 0]), new Float32Array([3, 4]))).toBe(5);
  });
});
