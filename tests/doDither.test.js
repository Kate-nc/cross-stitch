/**
 * Unit tests for Stage 2: confetti-aware doDither (colour-utils.js)
 *
 * Acceptance criteria from the brief:
 *   1. Smooth gradient test image: modified dithering produces ≥30% fewer single-pixel
 *      color isolates than the unmodified version.
 *   2. High-frequency detail image (saliency ≈ 1 everywhere): output visually matches
 *      the unmodified version (threshold is suppressed to near zero).
 */

const fs   = require('fs');
const { rgbToLab, dE2 } = require('../dmc-data.js');

// ---------------------------------------------------------------------------
// Extract sobelMag from embroidery.js (needed by generateSaliencyMap)
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

eval(extractFn(embSrc, 'sobelMag')); // eslint-disable-line no-eval

const cuSrc = fs.readFileSync('./colour-utils.js', 'utf8');
eval(extractFn(cuSrc, 'findSolid'));           // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'findBest'));            // eslint-disable-line no-eval
eval(extractFn(cuSrc, '_gaussianBlur1'));       // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'generateSaliencyMap')); // eslint-disable-line no-eval
eval(extractFn(cuSrc, 'doDither'));            // eslint-disable-line no-eval

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImage(w, h, colorFn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [rv, gv, bv] = colorFn(x, y);
      const i = (y * w + x) * 4;
      data[i]     = rv;
      data[i + 1] = gv;
      data[i + 2] = bv;
      data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * Build a minimal palette of N distinct solid colors covering a spectrum.
 * Each entry matches the shape expected by findBest (id, rgb, lab, type, name, dist).
 */
function makeRainbowPalette(n) {
  const pal = [];
  for (let i = 0; i < n; i++) {
    const hue = (i / n) * 360;
    // Simple HSL→RGB (s=0.8 l=0.5)
    const h = hue / 60;
    const c = 0.8 * (1 - Math.abs(2 * 0.5 - 1)); // chroma
    const x = c * (1 - Math.abs(h % 2 - 1));
    let r = 0, g = 0, b = 0;
    if (h < 1) { r = c; g = x; }
    else if (h < 2) { r = x; g = c; }
    else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; }
    else if (h < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = 0.5 - c / 2;
    const rv = Math.round((r + m) * 255);
    const gv = Math.round((g + m) * 255);
    const bv = Math.round((b + m) * 255);
    const lab = rgbToLab(rv, gv, bv);
    pal.push({ type: 'solid', id: `color${i}`, name: `color${i}`, rgb: [rv, gv, bv], lab, dist: 0 });
  }
  return pal;
}

/** Count single-pixel isolates (4-connected components of size 1). */
function countIsolates(mapped, w, h) {
  const N = w * h;
  const vis = new Uint8Array(N);
  let isolates = 0;
  const q = new Uint32Array(N);

  for (let start = 0; start < N; start++) {
    if (vis[start]) continue;
    vis[start] = 1;
    const tid = mapped[start].id;
    if (tid === '__skip__' || tid === '__empty__') continue;

    let head = 0, tail = 0;
    q[tail++] = start;
    let size = 0;

    while (head < tail) {
      const curr = q[head++];
      size++;
      if (size > 1) break; // early-exit; only care about size-1 components
      const cx = curr % w, cy = (curr / w) | 0;
      if (cx > 0)     { const n = curr - 1;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
      if (cx < w - 1) { const n = curr + 1;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
      if (cy > 0)     { const n = curr - w;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
      if (cy < h - 1) { const n = curr + w;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
    }

    // Drain remaining queue for vis tracking
    while (head < tail) {
      const curr = q[head++];
      const cx = curr % w, cy = (curr / w) | 0;
      if (cx > 0)     { const n = curr - 1;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
      if (cx < w - 1) { const n = curr + 1;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
      if (cy > 0)     { const n = curr - w;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
      if (cy < h - 1) { const n = curr + w;  if (!vis[n] && mapped[n].id === tid) { vis[n] = 1; q[tail++] = n; } }
    }

    if (size === 1) isolates++;
  }
  return isolates;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('doDither — backward compatibility (no saliency map)', () => {
  test('returns array of length w*h', () => {
    const w = 4, h = 4;
    const data = makeImage(w, h, (x, y) => [x * 20, y * 20, 128]);
    const pal  = makeRainbowPalette(4);
    const out  = doDither(data, w, h, pal);
    expect(out).toHaveLength(w * h);
  });

  test('each cell has id, rgb, lab', () => {
    const w = 4, h = 4;
    const data = makeImage(w, h, () => [100, 150, 200]);
    const pal  = makeRainbowPalette(4);
    const out  = doDither(data, w, h, pal);
    for (const cell of out) {
      expect(cell).toHaveProperty('id');
      expect(cell).toHaveProperty('rgb');
      expect(cell).toHaveProperty('lab');
    }
  });
});

describe('doDither — Stage 2 acceptance: smooth gradient → fewer isolates', () => {
  /**
   * Six closely-spaced grey shades (≈1.2 ΔE apart) palette over a smooth ramp.
   * Standard FS dithering scatters isolates at shade boundaries; the confetti-aware
   * variant suppresses them because the penalty for choosing a neighboring shade
   * is well within the 4 ΔE threshold.
   */
  test('≥30% fewer single-pixel isolates with confetti-aware dithering', () => {
    const W = 60, H = 20;

    // Six grey shades, ~1.2 ΔE apart — penalty between adjacent shades << threshold²
    const shades = [
      [110, 110, 110],
      [113, 113, 113],
      [116, 116, 116],
      [119, 119, 119],
      [122, 122, 122],
      [125, 125, 125],
    ];
    const pal = shades.map(([r, g, b], i) => ({
      type: 'solid', id: `g${i}`, name: `g${i}`,
      rgb: [r, g, b], lab: rgbToLab(r, g, b), dist: 0,
    }));

    // Smooth ramp across the shade range
    const data = makeImage(W, H, (x) => {
      const t = x / (W - 1);
      const v = Math.round(110 + t * 15);
      return [v, v, v];
    });

    // Baseline: disable confetti awareness entirely
    const unmodified = doDither(data, W, H, pal, false, null, { confettiDitherThreshold: 0 });

    // Modified: zero saliency → full threshold everywhere
    const noSaliency = new Float32Array(W * H).fill(0);
    const modified   = doDither(data, W, H, pal, false, noSaliency, { confettiDitherThreshold: 4.0 });

    const isoUnmod = countIsolates(unmodified, W, H);
    const isoMod   = countIsolates(modified,   W, H);

    if (isoUnmod > 0) {
      expect(isoMod).toBeLessThanOrEqual(isoUnmod * 0.70);
    } else {
      expect(isoMod).toBe(0);
    }
  });
});

describe('doDither — Stage 2: saliency suppresses threshold in high-detail areas', () => {
  /**
   * A palette with two colors that are far apart.
   * When saliency = 1 everywhere (high-detail), the effective threshold = 0 and
   * behavior should be identical to unmodified (always pick the best color).
   */
  test('all-1 saliency map → output identical to threshold=0 version', () => {
    const W = 10, H = 10;
    const pal = [
      { type:'solid', id:'red',   name:'red',   rgb:[200,50,50],  lab: rgbToLab(200,50,50),  dist:0 },
      { type:'solid', id:'blue',  name:'blue',  rgb:[50,50,200],  lab: rgbToLab(50,50,200),  dist:0 },
    ];
    const data = makeImage(W, H, (x, y) => [(x + y) % 2 === 0 ? 200 : 50, 50, 50]);

    const fullSaliency = new Float32Array(W * H).fill(1.0);
    const noThresh     = doDither(data, W, H, pal, false, null, { confettiDitherThreshold: 0 });
    const fullSal      = doDither(data, W, H, pal, false, fullSaliency, { confettiDitherThreshold: 4.0 });

    // Both should yield identical results since threshold is suppressed to 0
    for (let i = 0; i < W * H; i++) {
      expect(fullSal[i].id).toBe(noThresh[i].id);
    }
  });
});
