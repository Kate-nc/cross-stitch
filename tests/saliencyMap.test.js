/**
 * Unit tests for Stage 1: generateSaliencyMap (colour-utils.js)
 *
 * Acceptance criteria from the brief:
 *   Given a test image with a sharp foreground subject and a smooth gradient
 *   background, the mean saliency score of pixels in the background region
 *   must be below 0.25, and the mean score of pixels on the subject's edges
 *   must be above 0.7.
 */

const fs = require('fs');

// ---------------------------------------------------------------------------
// Extract sobelMag from embroidery.js (avoids the React dependency at the top)
// ---------------------------------------------------------------------------
const embSrc = fs.readFileSync('./embroidery.js', 'utf8');

/**
 * Extract a top-level named function from source text.
 * Correctly handles destructuring parameters like `{ sigma = 3.0 } = {}` by
 * skipping the entire parameter list before counting body braces.
 */
function extractFn(src, name) {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) throw new Error(`Function ${name} not found in source`);

  let i = start;

  // Advance past the function keyword and name to the opening '('
  while (i < src.length && src[i] !== '(') i++;

  // Skip the parameter list by counting balanced parentheses
  let parenDepth = 0;
  while (i < src.length) {
    if (src[i] === '(') parenDepth++;
    else if (src[i] === ')') { parenDepth--; if (parenDepth === 0) { i++; break; } }
    i++;
  }

  // Skip whitespace/newlines to the opening '{' of the function body
  while (i < src.length && src[i] !== '{') i++;

  // Count body braces to find the matching closing '}'
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Unterminated function ${name}`);
}

eval(extractFn(embSrc, 'sobelMag')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Extract generateSaliencyMap and its private helper from colour-utils.js
// ---------------------------------------------------------------------------
const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');
eval(extractFn(cuSrc, '_gaussianBlur1')); // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'generateSaliencyMap')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Image construction helpers
// ---------------------------------------------------------------------------

/**
 * Build an RGBA Uint8ClampedArray.
 * @param {number} w
 * @param {number} h
 * @param {function(x:number, y:number): [number,number,number]} colorFn
 */
function makeImage(w, h, colorFn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colorFn(x, y);
      const i = (y * w + x) * 4;
      data[i]     = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

function meanOf(saliency, indices) {
  if (indices.length === 0) return 0;
  let sum = 0;
  for (const i of indices) sum += saliency[i];
  return sum / indices.length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateSaliencyMap — basic properties', () => {
  test('returns a Float32Array with length w*h', () => {
    const w = 10, h = 10;
    const data = makeImage(w, h, () => [128, 128, 128]);
    const map = generateSaliencyMap(data, w, h);
    expect(map).toBeInstanceOf(Float32Array);
    expect(map.length).toBe(w * h);
  });

  test('all values are in [0.0, 1.0]', () => {
    const w = 20, h = 20;
    const data = makeImage(w, h, (x, y) => [x * 12 % 255, y * 7 % 255, (x + y) * 3 % 255]);
    const map = generateSaliencyMap(data, w, h);
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBeGreaterThanOrEqual(0.0);
      expect(map[i]).toBeLessThanOrEqual(1.0);
    }
  });

  test('flat uniform image produces an all-zero saliency map', () => {
    const w = 10, h = 10;
    const data = makeImage(w, h, () => [100, 100, 100]);
    const map = generateSaliencyMap(data, w, h, { sigma: 0 });
    for (let i = 0; i < map.length; i++) {
      expect(map[i]).toBe(0);
    }
  });

  test('sigma=0 skips blurring (still normalizes correctly)', () => {
    const w = 8, h = 8;
    // Vertical stripe: left half white, right half black
    const data = makeImage(w, h, (x) => x < 4 ? [255, 255, 255] : [0, 0, 0]);
    const map = generateSaliencyMap(data, w, h, { sigma: 0 });
    expect(map).toBeInstanceOf(Float32Array);
    // Max value should be 1.0 (at the edge column)
    const maxVal = Math.max(...map);
    expect(maxVal).toBeCloseTo(1.0, 5);
  });
});

// ---------------------------------------------------------------------------
// Acceptance test: sharp subject + smooth gradient background
// ---------------------------------------------------------------------------
describe('generateSaliencyMap — acceptance criterion', () => {
  /**
   * Construct a 60×60 image:
   *   - Background (left 20 columns): smooth horizontal grey gradient, no edges
   *   - Subject edge band (columns 29-31): sharp black→white transition
   *   - Subject interior (columns 32-59): solid bright colour, no edges
   *
   * Expected outcome:
   *   mean saliency in background region < 0.25
   *   mean saliency on subject edge band > 0.70
   */
  test('background mean < 0.25, subject edge mean > 0.70', () => {
    const W = 60, H = 60;

    const data = makeImage(W, H, (x) => {
      if (x < 20) {
        // Smooth gradient: luminance goes from 80 to 100 — very low gradient
        const v = Math.round(80 + (x / 19) * 20);
        return [v, v, v];
      }
      if (x < 29) {
        // Interior background filler — constant
        return [100, 100, 100];
      }
      if (x <= 31) {
        // Sharp edge band: alternates between very dark and very bright
        return x === 30 ? [0, 0, 0] : [255, 255, 255];
      }
      // Subject interior — solid, no internal edges
      return [200, 80, 80];
    });

    // Use a non-zero blur to smooth the map as the brief specifies
    const map = generateSaliencyMap(data, W, H, { sigma: 3.0 });

    // Collect background pixel indices (columns 0–18, away from any edge)
    const bgIndices = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 18; x++) {
        bgIndices.push(y * W + x);
      }
    }

    // Collect edge pixel indices (columns 29–31)
    const edgeIndices = [];
    for (let y = 0; y < H; y++) {
      for (let x = 29; x <= 31; x++) {
        edgeIndices.push(y * W + x);
      }
    }

    const bgMean   = meanOf(map, bgIndices);
    const edgeMean = meanOf(map, edgeIndices);

    // Log for debugging if test fails
    if (bgMean >= 0.25 || edgeMean <= 0.70) {
      console.log(`bgMean=${bgMean.toFixed(4)}, edgeMean=${edgeMean.toFixed(4)}`);
    }

    expect(bgMean).toBeLessThan(0.25);
    expect(edgeMean).toBeGreaterThan(0.70);
  });
});

// ---------------------------------------------------------------------------
// Gaussian blur helper
// ---------------------------------------------------------------------------
describe('_gaussianBlur1', () => {
  test('does not change a uniform array', () => {
    const data = new Float32Array(25).fill(0.5);
    _gaussianBlur1(data, 5, 5, 1.0);
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeCloseTo(0.5, 4);
    }
  });

  test('smooths a step edge so the peak is lower after blurring', () => {
    const w = 20, h = 1;
    const data = new Float32Array(w);
    for (let x = 0; x < w; x++) data[x] = x >= 10 ? 1.0 : 0.0;
    const peakBefore = Math.max(...data);
    _gaussianBlur1(data, w, h, 2.0);
    const midVal = data[10];
    expect(midVal).toBeLessThan(peakBefore); // softened
    expect(midVal).toBeGreaterThan(0.3);     // but still non-trivial
  });
});
