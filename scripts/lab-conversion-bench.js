#!/usr/bin/env node
/* scripts/lab-conversion-bench.js
 * ════════════════════════════════════════════════════════════════════════
 *   Phase 2 §6 — micro-benchmark for the per-cell d50RgbToLab conversion
 *   used in the raster-chart colour-mode pipeline.
 *
 *   Budget: 500 ms total Lab conversion for a typical chart (~80×100 cells
 *   averaged from a 640×480 working canvas → 8 000 cells × 1 Lab call).
 *
 *   We measure two workloads:
 *     A. "cell" workload — 8 000 conversions × 1 000 iterations (∼ a single
 *        import calling the function once per cell).
 *     B. "pixel" workload — 640×480 RGBA pixel-by-pixel × 10 iterations
 *        (worst-case if we ever skipped cell-averaging).
 *
 *   Usage: node scripts/lab-conversion-bench.js
 * ════════════════════════════════════════════════════════════════════════
 */
'use strict';

// Inlined copy of creator/rasterChartWorker.js#d50RgbToLab to keep the
// benchmark self-contained (no worker boot, no module system).
function d50RgbToLab(r, g, b) {
  function toLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  const rl = toLinear(r), gl = toLinear(g), bl = toLinear(b);
  const x = rl * 0.4360747 + gl * 0.3850649 + bl * 0.1430804;
  const y = rl * 0.2225045 + gl * 0.7168786 + bl * 0.0606169;
  const z = rl * 0.0139322 + gl * 0.0971045 + bl * 0.7141733;
  function f(t) { const d = 6 / 29; return t > d * d * d ? Math.cbrt(t) : t / (3 * d * d) + 4 / 29; }
  const fx = f(x / 0.96422), fy = f(y), fz = f(z / 0.82521);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function now() { return Number(process.hrtime.bigint()) / 1e6; }

function fmt(ms) { return ms.toFixed(2) + ' ms'; }

// ── Workload A: 8 000 cells × 1 000 iterations ───────────────────────────
function benchCells() {
  const N_CELLS = 8000;
  const N_ITERS = 1000;
  const cells = new Uint8Array(N_CELLS * 3);
  // Deterministic synthetic data spanning the RGB cube.
  for (let i = 0; i < cells.length; i++) cells[i] = (i * 37) & 0xff;

  // Warm-up
  for (let k = 0; k < 50; k++) {
    for (let i = 0; i < N_CELLS; i++) {
      d50RgbToLab(cells[i * 3], cells[i * 3 + 1], cells[i * 3 + 2]);
    }
  }

  const t0 = now();
  for (let k = 0; k < N_ITERS; k++) {
    for (let i = 0; i < N_CELLS; i++) {
      d50RgbToLab(cells[i * 3], cells[i * 3 + 1], cells[i * 3 + 2]);
    }
  }
  const total = now() - t0;
  const perImport = total / N_ITERS;
  console.log(`Workload A — ${N_CELLS} cells × ${N_ITERS} iterations`);
  console.log(`  total: ${fmt(total)}`);
  console.log(`  per-import (8 000 cells): ${fmt(perImport)}`);
  console.log(`  per-cell: ${(perImport * 1000 / N_CELLS).toFixed(3)} µs`);
  return perImport;
}

// ── Workload B: 640×480 pixels × 10 iterations ───────────────────────────
function benchPixels() {
  const W = 640, H = 480, N = W * H;
  const N_ITERS = 10;
  const rgba = new Uint8ClampedArray(N * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 53) & 0xff;

  // Warm-up
  for (let i = 0; i < N; i++) d50RgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);

  const t0 = now();
  for (let k = 0; k < N_ITERS; k++) {
    for (let i = 0; i < N; i++) {
      d50RgbToLab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    }
  }
  const total = now() - t0;
  const perImage = total / N_ITERS;
  console.log(`Workload B — 640×480 pixels × ${N_ITERS} iterations`);
  console.log(`  total: ${fmt(total)}`);
  console.log(`  per-image (307 200 px): ${fmt(perImage)}`);
  console.log(`  per-pixel: ${(perImage * 1000 / N).toFixed(3)} µs`);
  return perImage;
}

console.log('Lab conversion benchmark — d50RgbToLab (Bradford-adapted sRGB→Lab)\n');
const perImport = benchCells();
console.log();
const perImage = benchPixels();
console.log();
console.log('── Budget check ────────────────────────────────────────────────');
console.log(`  Phase 2 budget for Lab conversion: 500 ms per import`);
console.log(`  Measured per-import (cell workload): ${fmt(perImport)} → ` +
            (perImport < 500 ? 'OK (' + (perImport / 500 * 100).toFixed(1) + '% of budget)'
                             : 'OVER BUDGET'));
console.log(`  Per-pixel workload (informational only): ${fmt(perImage)}/image`);
