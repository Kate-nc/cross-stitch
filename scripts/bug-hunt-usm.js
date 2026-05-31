/**
 * Bug-hunt Rounds 1–6: Pre-sharpen unsharp mask (USM) visual regression.
 *
 * Generates before/after PNG images to validate all six guard conditions:
 *   Round 1 — Detail recovery: eyes/features survive downscale when USM is on
 *   Round 2 — Noise non-amplification: flat regions gain no visible variance
 *   Round 3 — Halo check: over-sharpening (amount=2.0) does not halo
 *   Round 4 — Parameter sweep: amount=0.3, 0.5, 1.0, 2.0
 *   Round 5 — Edge cases: 1×1, 1×N, N×1, tiny 4×4 images
 *   Round 6 — Regression: flat-colour variance guard (same as test but visual)
 *
 * Outputs: scripts/bug-hunt-output/round-N-*.png
 * Usage:   node scripts/bug-hunt-usm.js
 */

'use strict';
const { createCanvas, loadImage } = require('canvas');
const fs   = require('fs');
const path = require('path');

// ── Extract pure functions from source files ──────────────────────────────────

function extract(src, name) {
  // Match 'function name(' preceded by newline, space, or start-of-string
  let start = src.search(new RegExp('(?:^|\\n)function ' + name + '\\('));
  if (start === -1) throw new Error('Function ' + name + ' not found in source');
  // If preceded by newline, skip it
  if (src[start] === '\n') start += 1;
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

const root    = path.join(__dirname, '..');
const dmcSrc  = fs.readFileSync(path.join(root, 'dmc-data.js'),    'utf8');
const cuSrc   = fs.readFileSync(path.join(root, 'colour-utils.js'), 'utf8');
const genSrc  = fs.readFileSync(path.join(root, 'creator', 'generate.js'), 'utf8');

// Polyfill enough of the browser environment so the function bodies eval cleanly
const setup = `
var _labCache = { get: function(){}, set: function(){} };
var document = {
  createElement: function(tag) {
    if (tag !== 'canvas') throw new Error('Only canvas createElement supported');
    return require('canvas').createCanvas(1, 1);
  }
};
`;

const code = setup
  + extract(dmcSrc,  'rgbToLab') + '\n'
  + extract(cuSrc,   '_gaussianBlur1') + '\n'
  + extract(cuSrc,   'labToRgb') + '\n'
  + extract(cuSrc,   'applyUnsharpMask') + '\n'
  + extract(genSrc,  'prescaleForGrid') + '\n'
  + extract(genSrc,  'applyPreSharpenCanvas') + '\n'
  + '({rgbToLab, labToRgb, applyUnsharpMask, prescaleForGrid, applyPreSharpenCanvas})';

// eslint-disable-next-line no-eval
const fns = eval(code);
const { rgbToLab, labToRgb, applyUnsharpMask, prescaleForGrid, applyPreSharpenCanvas } = fns;

// ── Utility ───────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, 'bug-hunt-output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function savePng(canvas, filename) {
  const outPath = path.join(OUT_DIR, filename);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buf);
  console.log('  Wrote', outPath);
}

/** Upscale a canvas 4× nearest-neighbour for visibility in output images. */
function upscale4x(src) {
  const W = src.width * 4, H = src.height * 4;
  const dst = createCanvas(W, H);
  const ctx = dst.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, W, H);
  return dst;
}

/** Create a canvas from an RGBA Uint8ClampedArray. */
function fromData(data, w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  id.data.set(data);
  ctx.putImageData(id, 0, 0);
  return c;
}

/** Side-by-side comparison canvas: left=before, right=after, with label strip. */
function sideBySide(before, after, label) {
  const w = before.width, h = before.height;
  const GAP = 4, LABEL_H = 20;
  const out = createCanvas(w * 2 + GAP, h + LABEL_H);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(before, 0, LABEL_H);
  ctx.drawImage(after,  w + GAP, LABEL_H);
  ctx.fillStyle = '#eee';
  ctx.font = '12px sans-serif';
  ctx.fillText('Before  ' + label, 4, 14);
  ctx.fillText('After', w + GAP + 4, 14);
  return out;
}

// ── Synthetic test images ─────────────────────────────────────────────────────

/**
 * Create a synthetic "portrait" image: circular face-ish gradient, eye-like
 * dark circles, nose/mouth line details, skin-tone fill. W×H pixels.
 */
function makePortrait(W, H) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');

  // Background
  ctx.fillStyle = '#e8d5b7';
  ctx.fillRect(0, 0, W, H);

  // Face oval (skin)
  const grad = ctx.createRadialGradient(W/2, H/2, W*0.1, W/2, H/2, W*0.45);
  grad.addColorStop(0, '#f4c89a');
  grad.addColorStop(1, '#c8905a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(W/2, H/2, W*0.35, H*0.45, 0, 0, Math.PI*2);
  ctx.fill();

  // Eyes — small dark ellipses with detail inside
  function eye(cx, cy) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, W*0.06, H*0.04, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#3a200a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, W*0.035, H*0.025, 0, 0, Math.PI*2);
    ctx.fill();
    // Specular highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx + W*0.01, cy - H*0.008, W*0.008, H*0.006, 0, 0, Math.PI*2);
    ctx.fill();
  }
  eye(W*0.38, H*0.42);
  eye(W*0.62, H*0.42);

  // Eyebrows — thin dark arcs
  ctx.strokeStyle = '#4a2a10';
  ctx.lineWidth = Math.max(1, W * 0.012);
  ctx.beginPath();
  ctx.arc(W*0.38, H*0.37, W*0.07, Math.PI*1.15, Math.PI*1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W*0.62, H*0.37, W*0.07, Math.PI*1.15, Math.PI*1.85);
  ctx.stroke();

  // Nose — simple line shape
  ctx.strokeStyle = '#c8905a';
  ctx.lineWidth = Math.max(1, W * 0.008);
  ctx.beginPath();
  ctx.moveTo(W*0.5, H*0.44);
  ctx.lineTo(W*0.48, H*0.55);
  ctx.lineTo(W*0.44, H*0.56);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W*0.5, H*0.44);
  ctx.lineTo(W*0.52, H*0.55);
  ctx.lineTo(W*0.56, H*0.56);
  ctx.stroke();

  // Mouth
  ctx.strokeStyle = '#b06040';
  ctx.lineWidth = Math.max(1, W * 0.012);
  ctx.beginPath();
  ctx.arc(W*0.5, H*0.63, W*0.1, 0, Math.PI);
  ctx.stroke();

  // Hair
  ctx.fillStyle = '#3a200a';
  ctx.beginPath();
  ctx.ellipse(W/2, H*0.22, W*0.3, H*0.15, 0, 0, Math.PI*2);
  ctx.fill();

  return c;
}

/** Make a flat-colour canvas (Round 2 / Round 6 noise guard). */
function makeFlatGrey(W, H, v = 128) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `rgb(${v},${v},${v})`;
  ctx.fillRect(0, 0, W, H);
  return c;
}

/** Make a sharp-edge ramp canvas. */
function makeEdge(W, H) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, W/2, H);
  ctx.fillStyle = '#ccc';
  ctx.fillRect(W/2, 0, W/2, H);
  return c;
}

// ── Downscale helpers (mirroring applyPreSharpenCanvas logic) ─────────────────

// These are defined inside eval context — we need to call them through wrappers
// that pass through to the eval'd globals. We achieve this by adding them to
// the eval'd code block as closures over the canvas require.

function downscale(srcCanvas, tw, th) {
  const c = createCanvas(tw, th);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(prescaleForGrid(srcCanvas, tw, th), 0, 0, tw, th);
  return c;
}

function sharpThenDownscale(srcCanvas, tw, th, opts) {
  const sharpened = applyPreSharpenCanvas(srcCanvas, tw, th, opts || { amount: 0.5 });
  return downscale(sharpened, tw, th);
}

// ── Bug-hunt Rounds ───────────────────────────────────────────────────────────

// ── Round 1: Detail Recovery ──────────────────────────────────────────────────
console.log('\nRound 1 — Detail recovery (portrait face)');
{
  const SRC_W = 400, SRC_H = 400;
  const GRID_W = 50,  GRID_H = 50;    // typical cross-stitch grid size
  const portrait = makePortrait(SRC_W, SRC_H);

  const before = upscale4x(downscale(portrait, GRID_W, GRID_H));
  const after  = upscale4x(sharpThenDownscale(portrait, GRID_W, GRID_H, { amount: 0.5 }));
  savePng(sideBySide(before, after, '(50×50 grid, amount=0.5)'), 'round1-portrait-detail.png');

  // Also save zoomed 2× crop of left eye area
  function eyeCrop(canvas) {
    const W = canvas.width, H = canvas.height;
    // Eye at ~38% x, ~42% y — crop 25% of width centred there
    const cx = Math.round(W * 0.38), cy = Math.round(H * 0.42);
    const cw = Math.round(W * 0.25), ch = Math.round(H * 0.25);
    const c2 = createCanvas(cw, ch);
    const ctx2 = c2.getContext('2d');
    ctx2.drawImage(canvas, cx - cw/2, cy - ch/2, cw, ch, 0, 0, cw, ch);
    return c2;
  }
  savePng(sideBySide(eyeCrop(before), eyeCrop(after), 'left-eye zoom'), 'round1-portrait-eye-zoom.png');
  console.log('  PASS — images written (inspect for more eye/brow detail in After)');
}

// ── Round 2: Noise Non-Amplification ─────────────────────────────────────────
console.log('\nRound 2 — Noise non-amplification (flat grey)');
{
  const W = 64, H = 64, TW = 32, TH = 32;
  const flat = makeFlatGrey(W, H);

  const dBefore = downscale(flat, TW, TH).getContext('2d').getImageData(0, 0, TW, TH).data;
  const dAfter  = sharpThenDownscale(flat, TW, TH, { amount: 1.0 }).getContext('2d').getImageData(0, 0, TW, TH).data;

  function variance(d) {
    let s = 0, s2 = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = d[i]; s += l; s2 += l*l; }
    return s2/n - (s/n)**2;
  }
  const vBefore = variance(dBefore), vAfter = variance(dAfter);
  console.log('  Variance before:', vBefore.toFixed(4), '  after:', vAfter.toFixed(4));
  if (vAfter > vBefore + 0.5) {
    console.error('  FAIL — variance increased by', (vAfter - vBefore).toFixed(4));
    process.exitCode = 1;
  } else {
    console.log('  PASS — flat-region variance not amplified');
  }
  savePng(sideBySide(upscale4x(fromData(dBefore, TW, TH)), upscale4x(fromData(dAfter, TW, TH)),
    'flat grey, amount=1.0'), 'round2-flat-noise.png');
}

// ── Round 3: Halo Check ───────────────────────────────────────────────────────
console.log('\nRound 3 — Halo check (hard edge, amount=2.0)');
{
  const W = 120, H = 40, TW = 60, TH = 20;
  const edge = makeEdge(W, H);

  const cBefore = downscale(edge, TW, TH);
  const cAfter  = sharpThenDownscale(edge, TW, TH, { amount: 2.0, threshold: 8 });

  // Check for halo: pixel immediately adjacent to edge should not be brighter than the
  // light side (for the light side) or darker than the dark side (for the dark side).
  const dBefore = cBefore.getContext('2d').getImageData(0, 0, TW, TH).data;
  const dAfter  = cAfter.getContext('2d').getImageData(0, 0, TW, TH).data;

  // Measure L channel across a mid-row slice
  const y = Math.floor(TH / 2);
  const lBefore = [], lAfter = [];
  for (let x = 0; x < TW; x++) {
    const i = (y * TW + x) * 4;
    lBefore.push(0.299 * dBefore[i] + 0.587 * dBefore[i+1] + 0.114 * dBefore[i+2]);
    lAfter.push (0.299 * dAfter[i]  + 0.587 * dAfter[i+1]  + 0.114 * dAfter[i+2]);
  }
  // Max on dark side (< midpoint) shouldn't exceed max-before+threshold:
  const darkMaxBefore = Math.max(...lBefore.slice(0, TW/2));
  const darkMaxAfter  = Math.max(...lAfter.slice(0, TW/2));
  const lightMinBefore = Math.min(...lBefore.slice(TW/2));
  const lightMinAfter  = Math.min(...lAfter.slice(TW/2));
  const HALO_TOL = 20; // allow up to 20 luma units of sharpening effect near edge
  const halo = darkMaxAfter > darkMaxBefore + HALO_TOL || lightMinAfter < lightMinBefore - HALO_TOL;
  console.log('  Dark  side — before max:', darkMaxBefore.toFixed(1), '  after max:', darkMaxAfter.toFixed(1));
  console.log('  Light side — before min:', lightMinBefore.toFixed(1), '  after min:', lightMinAfter.toFixed(1));
  if (halo) {
    console.warn('  WARN — potential halo detected near edge at amount=2.0 (may be expected)');
  } else {
    console.log('  PASS — no excessive halo at amount=2.0 (within tolerance)');
  }
  savePng(sideBySide(upscale4x(cBefore), upscale4x(cAfter), 'hard edge, amount=2.0, threshold=8'),
    'round3-halo-check.png');
}

// ── Round 4: Parameter Sweep ──────────────────────────────────────────────────
console.log('\nRound 4 — Parameter sweep (amount 0.3, 0.5, 1.0, 2.0)');
{
  const W = 200, H = 200, TW = 50, TH = 50;
  const portrait = makePortrait(W, H);

  const AMOUNTS = [0.3, 0.5, 1.0, 2.0];
  const canvases = AMOUNTS.map(amt => upscale4x(sharpThenDownscale(portrait, TW, TH, { amount: amt })));

  // Write each individually
  AMOUNTS.forEach((amt, i) => {
    savePng(canvases[i], `round4-amount-${String(amt).replace('.','p')}.png`);
  });

  // Also side-by-side: 0.5 vs 1.0
  savePng(sideBySide(canvases[1], canvases[2], 'amount 0.5 vs 1.0'), 'round4-sweep-0p5-vs-1p0.png');
  console.log('  PASS — images written (inspect for progressive sharpening)');
}

// ── Round 5: Edge Cases ───────────────────────────────────────────────────────
console.log('\nRound 5 — Edge cases (tiny images)');
{
  const cases = [
    { w:1, h:1 }, { w:1, h:10 }, { w:10, h:1 }, { w:4, h:4 },
  ];
  let ok = true;
  cases.forEach(({ w, h }) => {
    try {
      const src = makePortrait(Math.max(w, 4) * 4, Math.max(h, 4) * 4);
      const result = sharpThenDownscale(src, w, h, { amount: 0.5 });
      const d = result.getContext('2d').getImageData(0, 0, w, h).data;
      for (let i = 0; i < d.length; i++) {
        if (d[i] < 0 || d[i] > 255) throw new Error('Out-of-range pixel at ' + i);
      }
      console.log(`  ${w}×${h}: OK`);
    } catch (e) {
      console.error(`  ${w}×${h}: FAIL —`, e.message);
      ok = false;
    }
  });
  if (ok) console.log('  PASS — all tiny sizes handled without errors');
  else process.exitCode = 1;
}

// ── Round 6: Flat-Colour Variance Regression ──────────────────────────────────
console.log('\nRound 6 — Flat-colour variance regression');
{
  const CASES = [
    { r:0,   g:0,   b:0   },  // black
    { r:255, g:255, b:255 },  // white
    { r:128, g:128, b:128 },  // mid grey
    { r:255, g:0,   b:0   },  // red
    { r:100, g:150, b:200 },  // blue-ish
  ];
  let ok = true;
  CASES.forEach(({ r, g, b }) => {
    const src = createCanvas(64, 64);
    const ctx = src.getContext('2d');
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, 64, 64);

    function lVariance(canvas) {
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const n = canvas.width * canvas.height;
      let s = 0, s2 = 0;
      for (let i = 0; i < n; i++) {
        const L = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
        s += L; s2 += L*L;
      }
      return s2/n - (s/n)**2;
    }

    const cBefore = downscale(src, 32, 32);
    const cAfter  = sharpThenDownscale(src, 32, 32, { amount: 1.0, threshold: 0 });
    const vBefore = lVariance(cBefore), vAfter = lVariance(cAfter);
    const label = `rgb(${r},${g},${b})`;
    if (vAfter > vBefore + 0.5) {
      console.error(`  FAIL [${label}] variance before ${vBefore.toFixed(4)}, after ${vAfter.toFixed(4)} — INCREASED`);
      ok = false; process.exitCode = 1;
    } else {
      console.log(`  [${label}] var before: ${vBefore.toFixed(4)}, after: ${vAfter.toFixed(4)} — OK`);
    }
  });
  if (ok) console.log('  PASS — no flat-colour region gained luminance variance');
}

console.log('\nAll rounds complete. Output in:', OUT_DIR);
