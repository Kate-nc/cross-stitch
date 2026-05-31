/**
 * Unit tests for applyBilateralFilter in colour-utils.js.
 *
 * Extracts the function from source (same pattern as quantize.test.js) so the
 * tests run in Node without a DOM or worker context.
 */

const fs = require('fs');

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

eval(extractFn(cuSrc, 'applyBilateralFilter')); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function solidRgba(w, h, r, g, b, a = 255) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4]     = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyBilateralFilter', () => {
  it('modifies data in-place and returns it (same reference)', () => {
    const w = 8, h = 8;
    const data = solidRgba(w, h, 128, 64, 32);
    const result = applyBilateralFilter(data, w, h);
    expect(result).toBe(data);
  });

  it('output is same byte-length as input', () => {
    const w = 8, h = 8;
    const data = solidRgba(w, h, 100, 150, 200);
    applyBilateralFilter(data, w, h);
    expect(data.length).toBe(w * h * 4);
  });

  it('preserves a uniform-colour image exactly', () => {
    const w = 10, h = 10;
    const data = solidRgba(w, h, 200, 100, 50);
    applyBilateralFilter(data, w, h);
    for (let i = 0; i < w * h; i++) {
      expect(data[i * 4]).toBeCloseTo(200, 0);
      expect(data[i * 4 + 1]).toBeCloseTo(100, 0);
      expect(data[i * 4 + 2]).toBeCloseTo(50, 0);
    }
  });

  it('preserves the alpha channel unchanged', () => {
    const w = 6, h = 6;
    const data = solidRgba(w, h, 80, 80, 80, 77);
    applyBilateralFilter(data, w, h);
    for (let i = 0; i < w * h; i++) {
      expect(data[i * 4 + 3]).toBe(77);
    }
  });

  it('reduces noise in an alternating-pixel uniform region', () => {
    const w = 12, h = 12;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const v = i % 2 === 0 ? 100 : 156;
      data[i * 4]     = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    applyBilateralFilter(data, w, h);
    // Interior pixel should be pulled towards the mean (128), away from 100/156
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const idx = (cy * w + cx) * 4;
    expect(data[idx]).toBeGreaterThan(100);
    expect(data[idx]).toBeLessThan(156);
  });

  it('keeps all output values in [0, 255]', () => {
    const w = 6, h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i++) data[i] = Math.min(255, (i * 37) % 256);
    applyBilateralFilter(data, w, h);
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(255);
    }
  });

  it('accepts custom opts (sigmaS, sigmaR, radius) without throwing', () => {
    const w = 8, h = 8;
    const data = solidRgba(w, h, 120, 80, 40);
    expect(() => applyBilateralFilter(data, w, h, { sigmaS: 4, sigmaR: 30, radius: 3 })).not.toThrow();
  });
});
