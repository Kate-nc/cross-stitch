// Measurement harness: runs the real generate-worker.js pipeline on test photos
// and scores colour accuracy and noise. Run from the repo root.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const REPO = process.cwd();

function runtime() {
  const messages = [];
  const c = { console, postMessage: (m) => messages.push(m) };
  c.window = c; c.self = c; c.globalThis = c;
  vm.createContext(c);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), c, { filename: f });
  c.importScripts = (...files) => files.forEach(load);
  load('generate-worker.js');
  c.messages = messages;
  return c;
}
const W = runtime();

// ── colour maths ────────────────────────────────────────────────────────────
const toLin = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
const LIN = new Float64Array(256); for (let i = 0; i < 256; i++) LIN[i] = toLin(i);
const toSrgb = (l) => { l = Math.max(0, Math.min(1, l)); const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055; return v * 255; };
function linToLab(r, g, b) {
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE00 = (a, b) => W._dE2000Core(a[0], a[1], a[2], b[0], b[1], b[2]);

// ── image loading and downscaling ───────────────────────────────────────────
async function loadRGBA(file) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height);
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  return { w: img.width, h: img.height, data: cx.getImageData(0, 0, img.width, img.height).data };
}
// Exact area-average downscale. linear=false averages the encoded sRGB values
// (what the browser canvas chain does); linear=true averages light.
function areaDownscale(src, tw, th, linear) {
  const { w, h, data } = src;
  const out = new Uint8ClampedArray(tw * th * 4);
  const lin = new Float64Array(tw * th * 3);
  const sx = w / tw, sy = h / th;
  for (let ty = 0; ty < th; ty++) {
    const y0 = ty * sy, y1 = y0 + sy;
    for (let tx = 0; tx < tw; tx++) {
      const x0 = tx * sx, x1 = x0 + sx;
      let r = 0, g = 0, b = 0, wsum = 0;
      for (let y = Math.floor(y0); y < Math.min(h, Math.ceil(y1 - 1e-9)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(w, Math.ceil(x1 - 1e-9)); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0), wt = wx * wy, i = (y * w + x) * 4;
          if (linear) { r += LIN[data[i]] * wt; g += LIN[data[i + 1]] * wt; b += LIN[data[i + 2]] * wt; }
          else { r += data[i] * wt; g += data[i + 1] * wt; b += data[i + 2] * wt; }
          wsum += wt;
        }
      }
      r /= wsum; g /= wsum; b /= wsum;
      const o = (ty * tw + tx);
      if (linear) { lin[o * 3] = r; lin[o * 3 + 1] = g; lin[o * 3 + 2] = b; out[o * 4] = Math.round(toSrgb(r)); out[o * 4 + 1] = Math.round(toSrgb(g)); out[o * 4 + 2] = Math.round(toSrgb(b)); }
      else { out[o * 4] = Math.round(r); out[o * 4 + 1] = Math.round(g); out[o * 4 + 2] = Math.round(b); lin[o * 3] = LIN[out[o * 4]]; lin[o * 3 + 1] = LIN[out[o * 4 + 1]]; lin[o * 3 + 2] = LIN[out[o * 4 + 2]]; }
      out[o * 4 + 3] = 255;
    }
  }
  return { data: out, lin };
}

// Gaussian blur of a linear-light 3-channel float image (sigma in cells).
function blurLin(lin, w, h, sigma) {
  const rad = Math.ceil(sigma * 3), k = [];
  let ks = 0; for (let i = -rad; i <= rad; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); ks += v; }
  const tmp = new Float64Array(lin.length), out = new Float64Array(lin.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0, ws = 0;
    for (let i = -rad; i <= rad; i++) { const xx = x + i; if (xx < 0 || xx >= w) continue; s += lin[(y * w + xx) * 3 + c] * k[i + rad]; ws += k[i + rad]; }
    tmp[(y * w + x) * 3 + c] = s / ws;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0, ws = 0;
    for (let i = -rad; i <= rad; i++) { const yy = y + i; if (yy < 0 || yy >= h) continue; s += tmp[(yy * w + x) * 3 + c] * k[i + rad]; ws += k[i + rad]; }
    out[(y * w + x) * 3 + c] = s / ws;
  }
  return out;
}
function labImage(lin, n) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = linToLab(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2]); return a; }

// Local-contrast mask on the reference: cells where a 3x3 neighbourhood spans > 15 ΔE00.
function edgeMask(refLab, w, h) {
  const m = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; let mx = 0;
    for (const j of [i - 1, i + 1, i - w, i + w]) mx = Math.max(mx, dE00(refLab[i], refLab[j]));
    if (mx > 15) m[i] = 1;
  }
  return m;
}

// ── run the worker pipeline ─────────────────────────────────────────────────
function runWorker(rgba, w, h, settings) {
  W.messages.length = 0;
  const buf = new Uint8ClampedArray(rgba).buffer;
  W.self.onmessage({ data: { type: 'generate', reqId: 1, pixels: buf, width: w, height: h, settings } });
  const res = W.messages.find((m) => m.type === 'result' || m.type === 'error');
  if (!res || res.type === 'error') throw new Error(res ? res.message : 'no result');
  return res;
}

function score(res, ref, w, h) {
  const n = w * h;
  const chartLin = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const c = res.mapped[i].rgb; chartLin[i * 3] = LIN[c[0]]; chartLin[i * 3 + 1] = LIN[c[1]]; chartLin[i * 3 + 2] = LIN[c[2]]; }
  // Blends: rgb is the gamma-space mean of the two threads; a fairer model is the linear mean.
  for (let i = 0; i < n; i++) { const m = res.mapped[i]; if (m.type === 'blend' && m.threads) { for (let c = 0; c < 3; c++) chartLin[i * 3 + c] = (LIN[m.threads[0].rgb[c]] + LIN[m.threads[1].rgb[c]]) / 2; } }
  const chartLab = labImage(chartLin, n);
  let cell = 0, edgeSum = 0, edgeN = 0;
  for (let i = 0; i < n; i++) { const d = dE00(chartLab[i], ref.lab[i]); cell += d; if (ref.edge[i]) { edgeSum += d; edgeN++; } }
  const chartBl = labImage(blurLin(chartLin, w, h, 1.0), n);
  let viewed = 0; for (let i = 0; i < n; i++) viewed += dE00(chartBl[i], ref.blLab[i]);
  // Fragmentation: 4-connected same-colour components per 100 cells; colour changes per 100 adjacent pairs.
  const labels = W.labelConnectedComponents(res.mapped, w, h);
  let changes = 0, pairs = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x < w - 1) { pairs++; if (res.mapped[i].id !== res.mapped[i + 1].id) changes++; } if (y < h - 1) { pairs++; if (res.mapped[i].id !== res.mapped[i + w].id) changes++; } }
  const conf = res.confettiData.clean;
  const threads = new Set(); res.pal.forEach((p) => { if (p.type === 'blend' && p.threads) p.threads.forEach((t) => threads.add(t.id)); else threads.add(p.id); });
  return {
    cellDE: cell / n, viewDE: viewed / n, edgeDE: edgeN ? edgeSum / edgeN : 0,
    singles: conf.singlesPct, small: conf.pct, comps: labels.components.size / n * 100,
    changes: changes / pairs * 100, symbols: res.pal.length, threads: threads.size,
  };
}

async function prepare(file, longSide) {
  const src = await loadRGBA(file);
  const s = longSide / Math.max(src.w, src.h);
  const w = Math.max(1, Math.round(src.w * s)), h = Math.max(1, Math.round(src.h * s));
  const gamma = areaDownscale(src, w, h, false);
  const linear = areaDownscale(src, w, h, true);
  const lab = labImage(linear.lin, w * h);
  const blLab = labImage(blurLin(linear.lin, w, h, 1.0), w * h);
  return { file: path.basename(file), w, h, gamma, linear, ref: { lab, blLab, edge: edgeMask(lab, w, h) } };
}

module.exports = { W, prepare, runWorker, score, areaDownscale, labImage, dE00, LIN, linToLab, blurLin };
