/* tests/rasterChartStrategy-silhouette.test.js
 * Phase 2 §5 — verify computeSilhouetteProxy returns a sane medoid-based
 * silhouette score from rasterChartStrategy.js.  The function lives inside
 * a single IIFE with no exports, so we extract it with regex+new Function.
 */
const fs = require('fs');
const path = require('path');

function extractSilhouetteFn() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'import-engine', 'strategies', 'rasterChartStrategy.js'),
    'utf8'
  );
  // Capture `function computeSilhouetteProxy(...) { ... }` body. Match the
  // opening line then scan brace depth.
  const m = src.match(/function\s+computeSilhouetteProxy\s*\(/);
  if (!m) throw new Error('computeSilhouetteProxy not found');
  let i = src.indexOf('{', m.index);
  let depth = 0, start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  const fnSrc = src.slice(m.index, i);
  // Wrap as expression
  // eslint-disable-next-line no-new-func
  return new Function(fnSrc + '; return computeSilhouetteProxy;')();
}

describe('rasterChartStrategy.computeSilhouetteProxy', () => {
  let silhouette;
  beforeAll(() => { silhouette = extractSilhouetteFn(); });

  test('returns 0 when fewer than 2 clusters', () => {
    expect(silhouette(null, null)).toBe(0);
    expect(silhouette({ assignments: [0, 0], medoids: [0] }, { features: [new Float32Array([1, 2])] })).toBe(0);
  });

  test('returns positive score on well-separated clusters', () => {
    // Two tight clusters far apart in 2D feature space.
    const features = [
      new Float32Array([0, 0]),
      new Float32Array([0.1, 0]),
      new Float32Array([0, 0.1]),
      new Float32Array([10, 10]),
      new Float32Array([10.1, 10]),
      new Float32Array([10, 10.1]),
    ];
    const assignments = [0, 0, 0, 1, 1, 1];
    const medoids = [0, 3]; // index into features
    const score = silhouette({ assignments, medoids }, { features });
    expect(score).toBeGreaterThan(0.9);
  });

  test('overlapping clusters score lower than well-separated', () => {
    // Tight clusters far apart.
    const sepFeat = [
      new Float32Array([0, 0]),
      new Float32Array([0.1, 0]),
      new Float32Array([10, 10]),
      new Float32Array([10.1, 10]),
    ];
    const sepScore = silhouette(
      { assignments: [0, 0, 1, 1], medoids: [0, 2] },
      { features: sepFeat }
    );
    // Clusters that interleave: medoids close together.
    const ovFeat = [
      new Float32Array([0, 0]),
      new Float32Array([0.4, 0]),
      new Float32Array([0.5, 0]),
      new Float32Array([0.9, 0]),
    ];
    const ovScore = silhouette(
      { assignments: [0, 1, 0, 1], medoids: [0, 1] },
      { features: ovFeat }
    );
    expect(sepScore).toBeGreaterThan(ovScore);
  });

  test('skips noise points (assignment < 0)', () => {
    const features = [
      new Float32Array([0, 0]),
      new Float32Array([0.1, 0]),
      new Float32Array([5, 5]),     // noise
      new Float32Array([10, 10]),
      new Float32Array([10.1, 10]),
    ];
    const assignments = [0, 0, -1, 1, 1];
    const medoids = [0, 3];
    const score = silhouette({ assignments, medoids }, { features });
    expect(score).toBeGreaterThan(0.9);
  });
});
