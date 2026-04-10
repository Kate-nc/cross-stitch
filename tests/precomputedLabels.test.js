/**
 * Parity tests for precomputed-labels fast path in:
 *   - removeOrphanStitches (colour-utils.js)
 *   - analyzeConfetti      (colour-utils.js)
 *
 * Each test runs both the BFS (standard) path and the precomputed-labels fast
 * path on the same input and asserts identical results.
 */

const fs = require('fs');
const { rgbToLab, dE2 } = require('../dmc-data.js');

// Make globals available for eval'd code
global.dE2 = dE2;
global.rgbToLab = rgbToLab;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');

function extractFn(src, name) {
  let start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function ${name} not found`);
  let i = start;
  while (i < src.length && src[i] !== '(') i++;
  let pd = 0;
  while (i < src.length) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } }
    i++;
  }
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Unterminated function ${name}`);
}

eval(extractFn(cuSrc, 'labelConnectedComponents')); // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'removeOrphanStitches'));     // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'analyzeConfetti'));           // eslint-disable-line no-eval

function entry(id, r, g, b) {
  return { type: 'solid', id, name: id, rgb: [r, g, b], lab: rgbToLab(r, g, b), dist: 0 };
}

// Deep-clone a mapped array so we can run both paths on identical inputs.
function cloneMapped(mapped) {
  return mapped.map(m => ({ ...m }));
}

// ===========================================================================
// removeOrphanStitches — precomputed-labels parity
// ===========================================================================
describe('removeOrphanStitches — precomputed-labels parity', () => {
  test('single isolated pixel: precomputed path matches BFS path', () => {
    const W = 5, H = 5;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const base = Array.from({ length: W * H }, () => ({ ...A }));
    base[2 * W + 2] = { ...B };

    const m1 = cloneMapped(base);
    const m2 = cloneMapped(base);

    // BFS (standard) path
    removeOrphanStitches(m1, W, H, 3);

    // Precomputed-labels fast path
    const labels = labelConnectedComponents(m2, W, H);
    removeOrphanStitches(m2, W, H, 3, null, null, {}, labels);

    expect(m2.map(e => e.id)).toEqual(m1.map(e => e.id));
  });

  test('large connected region preserved: precomputed path matches BFS path', () => {
    const W = 6, H = 6;
    const A = entry('A', 200, 50, 50);
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));

    const m1 = cloneMapped(mapped);
    const m2 = cloneMapped(mapped);

    removeOrphanStitches(m1, W, H, 3);

    const labels = labelConnectedComponents(m2, W, H);
    removeOrphanStitches(m2, W, H, 3, null, null, {}, labels);

    expect(m2.map(e => e.id)).toEqual(m1.map(e => e.id));
  });

  test('edge protection: precomputed path matches BFS path', () => {
    const W = 7, H = 7;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const base = Array.from({ length: W * H }, () => ({ ...A }));
    base[3 * W + 3] = { ...B };
    base[3 * W + 4] = { ...B };

    const edgeMap = new Uint8Array(W * H);
    edgeMap[3 * W + 3] = 1;

    const m1 = cloneMapped(base);
    const m2 = cloneMapped(base);

    removeOrphanStitches(m1, W, H, 3, edgeMap);

    const labels = labelConnectedComponents(m2, W, H);
    removeOrphanStitches(m2, W, H, 3, edgeMap, null, {}, labels);

    expect(m2.map(e => e.id)).toEqual(m1.map(e => e.id));
  });

  test('saliency scaling: precomputed path matches BFS path', () => {
    const W = 20, H = 5;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const base = Array.from({ length: W * H }, () => ({ ...A }));
    const bgIndices = [2 * W + 1, 2 * W + 2, 2 * W + 3, 2 * W + 4];
    const fgIndices = [2 * W + 15, 2 * W + 16, 2 * W + 17, 2 * W + 18];
    for (const i of bgIndices) base[i] = { ...B };
    for (const i of fgIndices) base[i] = { ...B };

    const saliencyMap = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) saliencyMap[i] = (i % W) >= 10 ? 1.0 : 0.0;

    const m1 = cloneMapped(base);
    const m2 = cloneMapped(base);

    removeOrphanStitches(m1, W, H, 3, null, saliencyMap, { saliencyMultiplier: 2.0 });

    const labels = labelConnectedComponents(m2, W, H);
    removeOrphanStitches(m2, W, H, 3, null, saliencyMap, { saliencyMultiplier: 2.0 }, labels);

    expect(m2.map(e => e.id)).toEqual(m1.map(e => e.id));
  });

  test('perceptual replacement: precomputed path matches BFS path', () => {
    const W = 7, H = 7;
    const A = entry('A', 128, 128, 128);
    const B = entry('B', 220, 30, 30);
    const C = entry('C', 132, 132, 132);
    const BG = entry('BG', 50, 150, 50);

    const base = Array.from({ length: W * H }, () => ({ ...BG }));
    const cx = 3, cy = 3;
    base[cy * W + cx] = { ...A };
    const bPos = [[cy-1,cx],[cy-1,cx-1],[cy-1,cx+1],[cy,cx-1],[cy+1,cx]];
    const cPos = [[cy,cx+1],[cy+1,cx-1],[cy+1,cx+1]];
    for (const [r, c] of bPos) base[r * W + c] = { ...B };
    for (const [r, c] of cPos) base[r * W + c] = { ...C };

    const m1 = cloneMapped(base);
    const m2 = cloneMapped(base);

    removeOrphanStitches(m1, W, H, 3);

    const labels = labelConnectedComponents(m2, W, H);
    removeOrphanStitches(m2, W, H, 3, null, null, {}, labels);

    expect(m2.map(e => e.id)).toEqual(m1.map(e => e.id));
    // Both paths should choose C (perceptually closer)
    expect(m2[cy * W + cx].id).toBe('C');
  });

  test('skip cells are not modified by either path', () => {
    const W = 4, H = 4;
    const A = entry('A', 200, 50, 50);
    const SK = { type: 'skip', id: '__skip__', rgb: [255, 255, 255], lab: [100, 0, 0], dist: 0 };

    const base = Array.from({ length: W * H }, () => ({ ...A }));
    base[0] = { ...SK };
    base[W * H - 1] = { ...SK };

    const m1 = cloneMapped(base);
    const m2 = cloneMapped(base);

    removeOrphanStitches(m1, W, H, 3);

    const labels = labelConnectedComponents(m2, W, H);
    removeOrphanStitches(m2, W, H, 3, null, null, {}, labels);

    expect(m2.map(e => e.id)).toEqual(m1.map(e => e.id));
    expect(m2[0].id).toBe('__skip__');
    expect(m2[W * H - 1].id).toBe('__skip__');
  });
});

// ===========================================================================
// analyzeConfetti — precomputed-labels parity
// ===========================================================================
describe('analyzeConfetti — precomputed-labels parity', () => {
  test('no confetti: precomputed path returns same result as BFS path', () => {
    const W = 5, H = 5;
    const A = entry('A', 200, 50, 50);
    const mapped = Array.from({ length: W * H }, () => ({ ...A }));

    const bfs    = analyzeConfetti(mapped, W, H);
    const labels = labelConnectedComponents(mapped, W, H);
    const fast   = analyzeConfetti(mapped, W, H, labels);

    expect(fast).toEqual(bfs);
  });

  test('single isolated pixel (singleton): parity', () => {
    const W = 5, H = 5;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[2 * W + 2] = { ...B };

    const bfs    = analyzeConfetti(mapped, W, H);
    const labels = labelConnectedComponents(mapped, W, H);
    const fast   = analyzeConfetti(mapped, W, H, labels);

    expect(fast.singles).toBe(bfs.singles);
    expect(fast.smallClusters).toBe(bfs.smallClusters);
    expect(fast.total).toBe(bfs.total);
    expect(fast.pct).toBeCloseTo(bfs.pct, 5);
    expect(fast.colorConfetti).toEqual(bfs.colorConfetti);
  });

  test('small cluster (2 pixels): parity', () => {
    const W = 6, H = 6;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[2 * W + 2] = { ...B };
    mapped[2 * W + 3] = { ...B };

    const bfs    = analyzeConfetti(mapped, W, H);
    const labels = labelConnectedComponents(mapped, W, H);
    const fast   = analyzeConfetti(mapped, W, H, labels);

    expect(fast.singles).toBe(bfs.singles);
    expect(fast.smallClusters).toBe(bfs.smallClusters);
    expect(fast.total).toBe(bfs.total);
    expect(fast.pct).toBeCloseTo(bfs.pct, 5);
    expect(fast.colorConfetti).toEqual(bfs.colorConfetti);
  });

  test('mixed singles and small clusters: parity', () => {
    const W = 10, H = 10;
    const A = entry('A', 200, 50, 50);
    const B = entry('B', 50, 50, 200);
    const C = entry('C', 50, 200, 50);

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    // Single B pixel
    mapped[1 * W + 1] = { ...B };
    // 3-pixel C cluster
    mapped[5 * W + 5] = { ...C };
    mapped[5 * W + 6] = { ...C };
    mapped[5 * W + 7] = { ...C };
    // 4-pixel B cluster (not confetti)
    mapped[8 * W + 1] = { ...B };
    mapped[8 * W + 2] = { ...B };
    mapped[8 * W + 3] = { ...B };
    mapped[8 * W + 4] = { ...B };

    const bfs    = analyzeConfetti(mapped, W, H);
    const labels = labelConnectedComponents(mapped, W, H);
    const fast   = analyzeConfetti(mapped, W, H, labels);

    expect(fast.singles).toBe(bfs.singles);
    expect(fast.smallClusters).toBe(bfs.smallClusters);
    expect(fast.total).toBe(bfs.total);
    expect(fast.pct).toBeCloseTo(bfs.pct, 5);
    expect(fast.colorConfetti).toEqual(bfs.colorConfetti);
  });

  test('skip cells are excluded from analysis: parity', () => {
    const W = 5, H = 5;
    const A = entry('A', 200, 50, 50);
    const SK = { type: 'skip', id: '__skip__', rgb: [255, 255, 255], lab: [100, 0, 0], dist: 0 };

    const mapped = Array.from({ length: W * H }, () => ({ ...A }));
    mapped[0] = { ...SK };
    mapped[1] = { ...SK };
    // Isolated A surrounded mostly by skip — still one big A component
    mapped[2 * W + 2] = { ...SK };

    const bfs    = analyzeConfetti(mapped, W, H);
    const labels = labelConnectedComponents(mapped, W, H);
    const fast   = analyzeConfetti(mapped, W, H, labels);

    expect(fast.singles).toBe(bfs.singles);
    expect(fast.smallClusters).toBe(bfs.smallClusters);
    expect(fast.total).toBe(bfs.total);
    expect(fast.pct).toBeCloseTo(bfs.pct, 5);
    expect(fast.colorConfetti).toEqual(bfs.colorConfetti);
  });
});
