/* creator/rasterChart/hog.js
 * ════════════════════════════════════════════════════════════════════════
 *   Histogram-of-Oriented-Gradients descriptor for a 32×32 grayscale patch.
 *
 *   Pure JS — no OpenCV dependency. Exported as window.RasterChartHOG
 *   in the browser and as a CommonJS module for Jest.
 *
 *   Default config: 32×32 patch, 8×8 cells, 2×2 block, 9 orientation bins
 *   (unsigned, 0..π). Output ≈ 324 dims (4 blocks × 9 bins × 9 per-block).
 *
 *   Algorithm:
 *     1. Sobel-like gradient (centred differences) → mag, angle
 *     2. Per-cell soft-vote into 9 unsigned-angle bins, weighted by mag
 *     3. L2-Hys-normalise overlapping 2×2 blocks of cells
 *     4. Concatenate
 * ════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    patch: 32,
    cell: 8,
    block: 2,
    bins: 9,
    eps: 1e-6,
    clip: 0.2,
  });

  /**
   * @param {Uint8Array|Uint8ClampedArray|number[]} pixels  length = patch * patch, grayscale 0..255
   * @param {object} [cfg]
   * @returns {Float32Array}
   */
  function hog(pixels, cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const P = cfg.patch, C = cfg.cell, B = cfg.block, BINS = cfg.bins;
    if (pixels.length !== P * P) {
      throw new Error('hog: expected ' + (P * P) + ' pixels, got ' + pixels.length);
    }
    const nCells = P / C;
    if (!Number.isInteger(nCells)) throw new Error('hog: patch not divisible by cell');

    // --- gradients ----------------------------------------------------------
    const mag = new Float32Array(P * P);
    const ang = new Float32Array(P * P);
    for (let y = 0; y < P; y++) {
      for (let x = 0; x < P; x++) {
        const xm = x === 0 ? 0 : x - 1;
        const xp = x === P - 1 ? P - 1 : x + 1;
        const ym = y === 0 ? 0 : y - 1;
        const yp = y === P - 1 ? P - 1 : y + 1;
        const gx = pixels[y * P + xp] - pixels[y * P + xm];
        const gy = pixels[yp * P + x] - pixels[ym * P + x];
        const i = y * P + x;
        mag[i] = Math.hypot(gx, gy);
        // unsigned angle 0..π
        let a = Math.atan2(gy, gx);
        if (a < 0) a += Math.PI;
        if (a >= Math.PI) a -= Math.PI;
        ang[i] = a;
      }
    }

    // --- per-cell histograms ------------------------------------------------
    const binWidth = Math.PI / BINS;
    const hist = new Float32Array(nCells * nCells * BINS);
    for (let cy = 0; cy < nCells; cy++) {
      for (let cx = 0; cx < nCells; cx++) {
        const base = (cy * nCells + cx) * BINS;
        for (let dy = 0; dy < C; dy++) {
          for (let dx = 0; dx < C; dx++) {
            const i = (cy * C + dy) * P + (cx * C + dx);
            const m = mag[i];
            if (m === 0) continue;
            const a = ang[i];
            // Soft vote into the two adjacent bins.
            const t = a / binWidth;
            const lo = Math.floor(t) % BINS;
            const hi = (lo + 1) % BINS;
            const wHi = t - Math.floor(t);
            hist[base + lo] += m * (1 - wHi);
            hist[base + hi] += m * wHi;
          }
        }
      }
    }

    // --- L2-Hys-normalised overlapping blocks ------------------------------
    const nBlocks = nCells - B + 1;
    const blockDim = B * B * BINS;
    const out = new Float32Array(nBlocks * nBlocks * blockDim);
    let off = 0;
    for (let by = 0; by < nBlocks; by++) {
      for (let bx = 0; bx < nBlocks; bx++) {
        // gather
        const v = new Float32Array(blockDim);
        let k = 0;
        for (let dy = 0; dy < B; dy++) {
          for (let dx = 0; dx < B; dx++) {
            const cellOff = ((by + dy) * nCells + (bx + dx)) * BINS;
            for (let b = 0; b < BINS; b++) v[k++] = hist[cellOff + b];
          }
        }
        // L2 norm
        let n = 0;
        for (let i = 0; i < blockDim; i++) n += v[i] * v[i];
        n = Math.sqrt(n + cfg.eps * cfg.eps);
        for (let i = 0; i < blockDim; i++) v[i] /= n;
        // Hys: clip + renormalise
        for (let i = 0; i < blockDim; i++) if (v[i] > cfg.clip) v[i] = cfg.clip;
        n = 0;
        for (let i = 0; i < blockDim; i++) n += v[i] * v[i];
        n = Math.sqrt(n + cfg.eps * cfg.eps);
        for (let i = 0; i < blockDim; i++) v[i] /= n;
        // copy
        for (let i = 0; i < blockDim; i++) out[off++] = v[i];
      }
    }
    return out;
  }

  /** L2 distance between two equal-length Float32 vectors. */
  function l2(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
    return Math.sqrt(s);
  }

  /** Hamming distance between two BigInts representing dHashes (≤ 64-bit). */
  function hammingBigInt(a, b) {
    let x = a ^ b;
    let n = 0;
    while (x) { x &= x - 1n; n++; }
    return n;
  }

  /**
   * 64-bit dHash. Works on a 9×8 downsampled patch — we accept the 32×32
   * input and do a cheap box-average down to 9×8 in-place.
   * @param {Uint8Array|Uint8ClampedArray|number[]} pixels  32×32 grayscale
   * @returns {bigint}
   */
  function dHash(pixels) {
    const P = 32;
    if (pixels.length !== P * P) throw new Error('dHash: expected 32×32 input');
    // Bilinear-ish: each output pixel averages a (P/9)×(P/8) box.
    const small = new Uint8Array(9 * 8);
    const bw = P / 9, bh = P / 8;
    for (let yy = 0; yy < 8; yy++) {
      for (let xx = 0; xx < 9; xx++) {
        let sum = 0, cnt = 0;
        const x0 = Math.floor(xx * bw), x1 = Math.floor((xx + 1) * bw);
        const y0 = Math.floor(yy * bh), y1 = Math.floor((yy + 1) * bh);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          sum += pixels[y * P + x]; cnt++;
        }
        small[yy * 9 + xx] = cnt ? Math.round(sum / cnt) : 0;
      }
    }
    let h = 0n;
    for (let yy = 0; yy < 8; yy++) {
      for (let xx = 0; xx < 8; xx++) {
        const left = small[yy * 9 + xx];
        const right = small[yy * 9 + xx + 1];
        h = (h << 1n) | (left > right ? 1n : 0n);
      }
    }
    return h;
  }

  const api = { hog, l2, dHash, hammingBigInt, DEFAULTS };
  if (typeof window !== 'undefined') window.RasterChartHOG = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
