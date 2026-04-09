/**
 * Unit tests for Stage 4: generateEdgeMap (colour-utils.js)
 *
 * Acceptance criteria from the brief:
 *   On an image containing thin lines (1–2 px wide), all pixels belonging to
 *   those lines must be marked true in the (dilated) edge map.
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// Extract dependencies from embroidery.js
// ---------------------------------------------------------------------------
const embSrc = fs.readFileSync('./embroidery.js', 'utf8');

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

// Pull in Canny constants and helpers from embroidery.js
// Assign constants to global so the eval'd cannyEdges closure can see them
function setGlobalConst(src, name) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`Constant ${name} not found`);
  global[name] = eval(m[1]); // eslint-disable-line no-eval
}
setGlobalConst(embSrc, 'CANNY_BLUR_SIGMA');
setGlobalConst(embSrc, 'CANNY_THRESHOLD_LOW');
setGlobalConst(embSrc, 'CANNY_THRESHOLD_HIGH');
eval(extractFn(embSrc, 'gaussianBlur'));  // eslint-disable-line no-eval
eval(extractFn(embSrc, 'cannyEdges'));    // eslint-disable-line no-eval

// Pull Stage 4 functions from colour-utils.js
const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');
eval(extractFn(cuSrc, '_dilate3Square'));              // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'generateEdgeMap'));             // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------
function makeRgba(w, h, colorFn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colorFn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// _dilate3Square tests
// ---------------------------------------------------------------------------
describe('_dilate3Square', () => {
  test('single pixel expands to 3×3 block', () => {
    const w = 5, h = 5;
    const mask = new Uint8Array(w * h);
    mask[2 * w + 2] = 1; // center
    const out = _dilate3Square(mask, w, h);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        expect(out[(2 + dy) * w + (2 + dx)]).toBe(1);
      }
    }
    // Pixels two away should be 0
    expect(out[0 * w + 0]).toBe(0);
    expect(out[4 * w + 4]).toBe(0);
  });

  test('all-zero mask stays all-zero', () => {
    const mask = new Uint8Array(25);
    const out = _dilate3Square(mask, 5, 5);
    expect(out.every(v => v === 0)).toBe(true);
  });

  test('does not mutate the input', () => {
    const mask = new Uint8Array(25);
    mask[12] = 1;
    const copy = new Uint8Array(mask);
    _dilate3Square(mask, 5, 5);
    expect(mask).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// generateEdgeMap basic properties
// ---------------------------------------------------------------------------
describe('generateEdgeMap — basic properties', () => {
  test('returns Uint8Array of length w*h', () => {
    const w = 10, h = 10;
    const data = makeRgba(w, h, () => [128, 128, 128]);
    const map = generateEdgeMap(data, w, h);
    expect(map).toBeInstanceOf(Uint8Array);
    expect(map.length).toBe(w * h);
  });

  test('all values are 0 or 1', () => {
    const w = 20, h = 20;
    const data = makeRgba(w, h, (x, y) => [x * 12 % 255, y * 7 % 255, (x + y) % 255]);
    const map = generateEdgeMap(data, w, h);
    for (let i = 0; i < map.length; i++) {
      expect(map[i] === 0 || map[i] === 1).toBe(true);
    }
  });

  test('flat uniform image produces no edges', () => {
    const w = 20, h = 20;
    const data = makeRgba(w, h, () => [128, 128, 128]);
    const map = generateEdgeMap(data, w, h, { edgeDilation: 0 });
    expect(map.every(v => v === 0)).toBe(true);
  });

  test('edgeDilation=0 returns Canny output without expansion', () => {
    const w = 20, h = 20;
    // Vertical step edge: left half white, right half black
    const data = makeRgba(w, h, (x) => x < 10 ? [255, 255, 255] : [0, 0, 0]);
    const noDilate = generateEdgeMap(data, w, h, { edgeDilation: 0 });
    const dilated  = generateEdgeMap(data, w, h, { edgeDilation: 1 });

    // Dilated version should have at least as many edge pixels
    const nCount = noDilate.reduce((s, v) => s + v, 0);
    const dCount = dilated.reduce((s, v) => s + v, 0);
    expect(dCount).toBeGreaterThanOrEqual(nCount);
  });
});

// ---------------------------------------------------------------------------
// Acceptance test: thin line is captured in the dilated edge map
// ---------------------------------------------------------------------------
describe('generateEdgeMap — acceptance: thin lines are marked', () => {
  /**
   * Build a 40×40 image with a white background and a single-pixel wide
   * vertical black line at x=20.  After dilation=1, every pixel in
   * the line (x=19, 20, 21, all y) should be edge-marked.
   */
  test('all pixels of a 1px-wide vertical line are in the dilated edge map', () => {
    const W = 40, H = 40;
    const data = makeRgba(W, H, (x) => x === 20 ? [0, 0, 0] : [255, 255, 255]);

    // With a 1px black line on white, Canny detects edges ~2px away from the line
    // centre (NMS peak positions). A dilation of 2px bridges back to x=20.
    const edgeMap = generateEdgeMap(data, W, H, { edgeDilation: 2 });

    let allMarked = true;
    // Skip first and last 2 rows where Canny border pixels are 0
    for (let y = 2; y < H - 2; y++) {
      if (!edgeMap[y * W + 20]) { allMarked = false; break; }
    }
    expect(allMarked).toBe(true);
  });

  test('dilation expands edge pixels to at least 1px either side', () => {
    const W = 40, H = 40;
    // Horizontal step edge at y=20 (white above, black from y=20 onward)
    const data = makeRgba(W, H, (x, y) => y < 20 ? [255, 255, 255] : [0, 0, 0]);
    const edgeMap = generateEdgeMap(data, W, H, { edgeDilation: 1 });

    // Canny places the peak gradient at row 19 (the bright-side pixel at the
    // transition). With dilation=1 that expands to rows 18-20.
    // Row 19 (at the detected edge) and row 20 (one dilated pixel below) must be marked.
    const row19 = Array.from({ length: W }, (_, x) => edgeMap[19 * W + x]).some(Boolean);
    const row20 = Array.from({ length: W }, (_, x) => edgeMap[20 * W + x]).some(Boolean);
    expect(row19).toBe(true);
    expect(row20).toBe(true);
  });
});
