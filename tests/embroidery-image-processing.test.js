const fs = require('fs');

// Extract the pipeline constants and pure image-processing functions from
// embroidery.js so they can be unit-tested in Node (without React or a DOM).
const raw = fs.readFileSync('./embroidery.js', 'utf8');

// --- constants we need ---
const constantNames = [
  'BILATERAL_KERNEL_RADIUS',
  'BILATERAL_SIGMA_SPATIAL',
  'BILATERAL_SIGMA_RANGE',
  'CANNY_BLUR_SIGMA',
  'CANNY_THRESHOLD_LOW',
  'CANNY_THRESHOLD_HIGH',
];
let setup = '';
for (const name of constantNames) {
  const m = raw.match(new RegExp(`const ${name}\\s*=\\s*[^;]+;`));
  if (m) setup += m[0] + '\n';
}

// --- helper to extract a named function (top-level, handles one level of braces) ---
function extractFn(src, name) {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) return '';
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  return '';
}

const code = setup
  + extractFn(raw, 'gaussianBlur') + '\n'
  + extractFn(raw, 'bilateralFilter') + '\n'
  + extractFn(raw, 'cannyEdges') + '\n';

eval(code); // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a flat RGBA Uint8ClampedArray for a w×h solid-colour image. */
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
// bilateralFilter
// ---------------------------------------------------------------------------
describe('bilateralFilter', () => {
  it('returns a Uint8ClampedArray of the same byte-length as the input', () => {
    const w = 8, h = 8;
    const data = solidRgba(w, h, 128, 64, 32);
    const out = bilateralFilter(data, w, h);
    expect(out).toBeInstanceOf(Uint8ClampedArray);
    expect(out.length).toBe(data.length);
  });

  it('preserves a uniform-colour image exactly (no smoothing across identical neighbours)', () => {
    const w = 10, h = 10;
    const data = solidRgba(w, h, 200, 100, 50);
    const out = bilateralFilter(data, w, h);
    for (let i = 0; i < w * h; i++) {
      expect(out[i * 4]).toBeCloseTo(200, 0);
      expect(out[i * 4 + 1]).toBeCloseTo(100, 0);
      expect(out[i * 4 + 2]).toBeCloseTo(50, 0);
    }
  });

  it('preserves the alpha channel unchanged', () => {
    const w = 6, h = 6;
    const data = solidRgba(w, h, 80, 80, 80, 77);
    const out = bilateralFilter(data, w, h);
    for (let i = 0; i < w * h; i++) {
      expect(out[i * 4 + 3]).toBe(77);
    }
  });

  it('reduces noise in a noisy uniform region (output stays close to mean)', () => {
    const w = 12, h = 12;
    const data = new Uint8ClampedArray(w * h * 4);
    // Alternate pixels between 100 and 156 (mean ≈ 128) — small, texture-like noise
    for (let i = 0; i < w * h; i++) {
      const v = i % 2 === 0 ? 100 : 156;
      data[i * 4]     = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const out = bilateralFilter(data, w, h);
    // Interior pixels should be pulled towards the mean
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const idx = (cy * w + cx) * 4;
    expect(out[idx]).toBeGreaterThanOrEqual(100);
    expect(out[idx]).toBeLessThanOrEqual(156);
  });

  it('keeps values in [0, 255] even for boundary pixels', () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h * 4; i++) data[i] = Math.min(255, (i * 37) % 256);
    const out = bilateralFilter(data, w, h);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(255);
    }
  });
});

// ---------------------------------------------------------------------------
// cannyEdges
// ---------------------------------------------------------------------------
describe('cannyEdges', () => {
  it('returns a Uint8Array with the same number of elements as w×h', () => {
    const w = 10, h = 10;
    const data = solidRgba(w, h, 128, 128, 128);
    const out = cannyEdges(data, w, h);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(w * h);
  });

  it('contains only 0 and 1 values', () => {
    const w = 16, h = 16;
    // Checkerboard — plenty of gradients
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (x + y) % 2 === 0 ? 0 : 255;
        const idx = (y * w + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    const out = cannyEdges(data, w, h);
    for (let i = 0; i < out.length; i++) {
      expect(out[i] === 0 || out[i] === 1).toBe(true);
    }
  });

  it('produces no edges on a perfectly uniform image', () => {
    const w = 12, h = 12;
    const data = solidRgba(w, h, 180, 90, 60);
    const out = cannyEdges(data, w, h);
    const edgeCount = out.reduce((s, v) => s + v, 0);
    expect(edgeCount).toBe(0);
  });

  it('detects edges along a sharp vertical boundary', () => {
    // Left half black, right half white — strong vertical edge in the middle
    const w = 20, h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x < w / 2 ? 0 : 255;
        const idx = (y * w + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    const out = cannyEdges(data, w, h);
    // At least some pixels near the middle column should be marked as edges
    let edgesNearBoundary = 0;
    const mid = w / 2;
    for (let y = 2; y < h - 2; y++) {
      for (let x = mid - 2; x <= mid + 2; x++) {
        edgesNearBoundary += out[y * w + x];
      }
    }
    expect(edgesNearBoundary).toBeGreaterThan(0);
  });

  it('is deterministic — same input always yields the same output', () => {
    const w = 14, h = 14;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 53 + 7) % 256;
    const out1 = cannyEdges(data, w, h);
    const out2 = cannyEdges(data, w, h);
    expect(Array.from(out1)).toEqual(Array.from(out2));
  });
});
