/**
 * Unit tests for labToRgb() and applyUnsharpMask() (colour-utils.js).
 *
 * Extracts functions from source using the same regex+eval pattern as the
 * rest of the test suite — no module system, no DOM required.
 *
 * Key invariants tested:
 *   1. labToRgb(rgbToLab(r,g,b)) round-trips back to [r,g,b] within ±2.
 *   2. applyUnsharpMask mutates in-place and returns the same reference.
 *   3. A flat-colour image is NOT modified at all (flat areas gain no variance).
 *   4. An edge is sharpened when amount>0 and contrast exceeds threshold.
 *   5. A low-contrast edge below threshold is left unchanged.
 *   6. amount=0 is a no-op regardless of threshold.
 *   7. Alpha channel is preserved unchanged.
 */

const fs = require('fs');
const path = require('path');

// ── Extract functions from source files ───────────────────────────────────────

function extractFn(src, name) {
  // Handles `function name(` at top level
  let start = src.indexOf('\nfunction ' + name + '(');
  if (start === -1) start = src.indexOf('function ' + name + '(');
  else start += 1;
  if (start === -1) throw new Error('Function ' + name + ' not found');
  let i = start;
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error('Unterminated function ' + name);
}

const dmcSrc  = fs.readFileSync(path.join(__dirname, '..', 'dmc-data.js'),   'utf8');
const cuSrc   = fs.readFileSync(path.join(__dirname, '..', 'colour-utils.js'), 'utf8');

// We need rgbToLab (from dmc-data.js), labToRgb, _gaussianBlur1, and
// applyUnsharpMask (from colour-utils.js).
// _labCache is needed by rgbToLab.
const setup = `
var _labCache = { get: function() {}, set: function() {} };
`;

const code = setup
  + extractFn(dmcSrc, 'rgbToLab') + '\n'
  + extractFn(cuSrc,  '_gaussianBlur1') + '\n'
  + extractFn(cuSrc,  'labToRgb') + '\n'
  + extractFn(cuSrc,  'applyUnsharpMask') + '\n';

// eslint-disable-next-line no-eval
eval(code);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create an RGBA Uint8ClampedArray for a w×h image filled with a solid colour. */
function solid(w, h, r, g, b, a = 255) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4]     = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

/** Create a w×h image with a sharp vertical edge: left half is colA, right half colB. */
function edgeImage(w, h, colA, colB) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = x < w / 2 ? colA : colB;
      const idx = (y * w + x) * 4;
      out[idx]     = col[0];
      out[idx + 1] = col[1];
      out[idx + 2] = col[2];
      out[idx + 3] = 255;
    }
  }
  return out;
}

/** Compute variance of the L* channel of an RGBA buffer. */
function lVariance(data, w, h) {
  const n = w * h;
  let sum = 0, sum2 = 0;
  for (let i = 0; i < n; i++) {
    const l = rgbToLab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])[0];
    sum += l; sum2 += l * l;
  }
  return sum2 / n - (sum / n) ** 2;
}

// ── Tests: labToRgb round-trip ────────────────────────────────────────────────

describe('labToRgb', () => {
  const samples = [
    [0,   0,   0  ],   // black
    [255, 255, 255],   // white
    [255, 0,   0  ],   // red
    [0,   255, 0  ],   // green
    [0,   0,   255],   // blue
    [128, 64,  32 ],   // brown
    [100, 150, 200],   // sky blue
  ];

  samples.forEach(([r, g, b]) => {
    test(`round-trip [${r},${g},${b}]`, () => {
      const lab = rgbToLab(r, g, b);
      const back = labToRgb(lab[0], lab[1], lab[2]);
      expect(Math.abs(back[0] - r)).toBeLessThanOrEqual(2);
      expect(Math.abs(back[1] - g)).toBeLessThanOrEqual(2);
      expect(Math.abs(back[2] - b)).toBeLessThanOrEqual(2);
    });
  });

  test('clamps out-of-gamut values to [0, 255]', () => {
    // L=100 (max white) → should be close to white
    const w = labToRgb(100, 0, 0);
    expect(w[0]).toBeGreaterThanOrEqual(200);
    expect(w[1]).toBeGreaterThanOrEqual(200);
    expect(w[2]).toBeGreaterThanOrEqual(200);
    // L=0 → black
    const bl = labToRgb(0, 0, 0);
    expect(bl[0]).toBe(0);
    expect(bl[1]).toBe(0);
    expect(bl[2]).toBe(0);
  });
});

// ── Tests: applyUnsharpMask ───────────────────────────────────────────────────

describe('applyUnsharpMask', () => {
  // Round 6 guard: flat-colour region must NOT gain variance
  test('flat region: zero variance after sharpening (noise not amplified)', () => {
    const w = 16, h = 16;
    const data = solid(w, h, 120, 80, 40);
    const varBefore = lVariance(data, w, h);
    applyUnsharpMask(data, w, h, { amount: 1.0, threshold: 0 });
    const varAfter = lVariance(data, w, h);
    // Variance must not increase (tolerance of 0.01 for floating-point)
    expect(varAfter).toBeLessThanOrEqual(varBefore + 0.01);
  });

  test('flat region: pixel values unchanged when contrast is below threshold (default threshold)', () => {
    const w = 20, h = 20;
    const data = solid(w, h, 150, 100, 60);
    const before = new Uint8ClampedArray(data);
    applyUnsharpMask(data, w, h, { amount: 1.0, threshold: 8 });
    for (let i = 0; i < data.length; i += 4) {
      expect(Math.abs(data[i]     - before[i]    )).toBeLessThanOrEqual(1);
      expect(Math.abs(data[i + 1] - before[i + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(data[i + 2] - before[i + 2])).toBeLessThanOrEqual(1);
    }
  });

  test('returns same Uint8ClampedArray reference (in-place mutation)', () => {
    const data = solid(10, 10, 100, 100, 100);
    const ref = data;
    const result = applyUnsharpMask(data, 10, 10);
    expect(result).toBe(ref);
  });

  test('alpha channel is preserved', () => {
    const data = solid(8, 8, 200, 150, 100, 128);
    applyUnsharpMask(data, 8, 8, { amount: 1.0, threshold: 0 });
    for (let i = 3; i < data.length; i += 4) {
      expect(data[i]).toBe(128);
    }
  });

  test('amount=0 is a strict no-op', () => {
    const data = edgeImage(20, 20, [50, 50, 50], [200, 200, 200]);
    const before = new Uint8ClampedArray(data);
    applyUnsharpMask(data, 20, 20, { amount: 0, threshold: 0 });
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBe(before[i]);
    }
  });

  test('edge is sharpened: pixels near edge become more extreme', () => {
    // A dark-to-light edge: after sharpening the dark side should get darker
    // and/or the light side lighter near the boundary.
    const w = 30, h = 10;
    const data = edgeImage(w, h, [60, 60, 60], [180, 180, 180]);
    const lBefore = [];
    for (let x = 0; x < w; x++) {
      lBefore.push(rgbToLab(data[x * 4], data[x * 4 + 1], data[x * 4 + 2])[0]);
    }
    applyUnsharpMask(data, w, h, { radius: 1.5, amount: 1.0, threshold: 5 });
    const lAfter = [];
    for (let x = 0; x < w; x++) {
      lAfter.push(rgbToLab(data[x * 4], data[x * 4 + 1], data[x * 4 + 2])[0]);
    }
    // Pixels near the edge centre (x = w/2 ± 2) should differ from before
    const mid = Math.floor(w / 2);
    const edgeChanged = [mid - 2, mid - 1, mid, mid + 1, mid + 2].some(
      x => Math.abs(lAfter[x] - lBefore[x]) > 1
    );
    expect(edgeChanged).toBe(true);
  });

  test('low-contrast edge below threshold is not modified', () => {
    // A very subtle luminance step that stays below the default threshold
    const w = 20, h = 10;
    const data = edgeImage(w, h, [128, 128, 128], [132, 132, 132]); // ΔL ≈ 1.5
    const before = new Uint8ClampedArray(data);
    // threshold=8 means the ~1.5 Lab unit step won't be touched
    applyUnsharpMask(data, w, h, { radius: 2, amount: 1.0, threshold: 8 });
    for (let i = 0; i < data.length; i += 4) {
      expect(Math.abs(data[i]     - before[i]    )).toBeLessThanOrEqual(1);
      expect(Math.abs(data[i + 1] - before[i + 1])).toBeLessThanOrEqual(1);
      expect(Math.abs(data[i + 2] - before[i + 2])).toBeLessThanOrEqual(1);
    }
  });

  test('output is bounded to valid [0, 255] for high-amount sharpening', () => {
    const data = edgeImage(20, 10, [0, 0, 0], [255, 255, 255]);
    applyUnsharpMask(data, 20, 10, { radius: 1.5, amount: 2.0, threshold: 0 });
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });
});
