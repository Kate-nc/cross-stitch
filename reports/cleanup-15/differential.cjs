'use strict';
// Renders a seeded matrix of Creator charts through a given canvasRenderer.js
// and writes a SHA-1 of every canvas operation (method calls and property
// writes, in order) and of the resulting pixels for each configuration.
// Run it once per renderer revision and compare the two JSON files with
// compare-differential.cjs; identical files mean identical operations and
// pixels for every configuration.
//
//   node reports/cleanup-15/differential.cjs <path/to/canvasRenderer.js> <out.json>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..', '..');
const { createCanvas } = require(path.join(root, 'node_modules', 'canvas'));

const [, , rendererPath, outPath] = process.argv;
if (!rendererPath || !outPath) { console.error('usage: differential.cjs <canvasRenderer.js> <out.json>'); process.exit(2); }

function load() {
  const c = vm.createContext({ console, Map, Set, Uint8Array, CK: 4, ProgressUnits: require(path.join(root, 'progress-units')),
    addEventListener() {}, document: { createElement: () => createCanvas(1, 1) } });
  c.window = c;
  for (const f of ['colour-utils.js', 'helpers.js', 'creator/symbolFontSpec.js'])
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c, { filename: f });
  vm.runInContext(fs.readFileSync(rendererPath, 'utf8'), c, { filename: rendererPath });
  return c;
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PALETTE = [
  { id: 'a', rgb: [220, 20, 20] }, { id: 'b', rgb: [20, 40, 220] }, { id: 'c', rgb: [20, 160, 40] },
  { id: 'd', rgb: [250, 250, 240] }, { id: 'e', rgb: [10, 10, 10] }, { id: 'f', rgb: [240, 200, 30] }
];
const cmap = {};
PALETTE.forEach((p, i) => { cmap[p.id] = { id: p.id, rgb: p.rgb, symbol: 'ABCDEF'[i] }; });
const GHOST = { id: 'ghost', rgb: [120, 90, 160] }; // not in cmap
const Q = ['TL', 'TR', 'BL', 'BR'];

function makeChart(seed, W, H, density) {
  const rnd = mulberry32(seed);
  const pat = [];
  for (let i = 0; i < W * H; i++) {
    const r = rnd();
    if (r < 0.08) pat.push({ id: '__skip__' });
    else if (r < 0.2) pat.push({ id: '__empty__' });
    else { const p = PALETTE[Math.floor(rnd() * PALETTE.length)]; pat.push({ id: p.id, rgb: p.rgb }); }
  }
  const ps = new Map();
  for (let i = 0; i < W * H; i++) {
    if (rnd() >= density) continue;
    const entry = {};
    const mask = 1 + Math.floor(rnd() * 15); // every non-empty quadrant subset
    const colours = PALETTE.concat([GHOST]);
    const main = colours[Math.floor(rnd() * colours.length)];
    for (let q = 0; q < 4; q++) if (mask & (1 << q)) entry[Q[q]] = rnd() < 0.75 ? { id: main.id, rgb: main.rgb } : colours[Math.floor(rnd() * colours.length)];
    ps.set(i, entry);
  }
  return { pat, ps };
}

function recorder(ctx, hash) {
  const plain = a => (a && typeof a === 'object' ? '[' + a.constructor.name + (a.width ? a.width + 'x' + a.height : '') + ']' : a);
  let n = 0;
  const proxy = new Proxy(ctx, {
    get(t, p) { const v = t[p]; if (typeof v !== 'function') return v; return function () { n++; hash.update(String(p) + JSON.stringify(Array.prototype.map.call(arguments, plain)) + ';'); return v.apply(t, arguments); }; },
    set(t, p, v) { n++; hash.update('=' + String(p) + JSON.stringify(plain(v)) + ';'); t[p] = v; return true; }
  });
  return { ctx: proxy, count: () => n };
}

const HIGHLIGHTS = {
  none: {},
  isolate: { hiId: 'a', highlightMode: 'isolate', dimFraction: 1 },
  isolateHalf: { hiId: 'b', highlightMode: 'isolate', dimFraction: 0.5, bgDimOpacity: 0.3 },
  spotlight: { hiId: 'c', highlightMode: 'spotlight', dimFraction: 1 },
  outline: { hiId: 'd', highlightMode: 'outline', dimFraction: 1 },
  tint: { hiId: 'e', highlightMode: 'tint', dimFraction: 1 }
};

const r = load();
const out = { renderer: path.basename(rendererPath), node: process.version, results: {} };
const W = 14, H = 10;
const chart = makeChart(12345, W, H, 0.45);
const sparse = makeChart(777, W, H, 0.1);
const overlayImg = createCanvas(40, 40); overlayImg.src = 'overlay';

let total = 0;
for (const pathName of ['full', 'base', 'baseBanded']) {
  for (const view of ['color', 'symbol', 'both']) {
    for (const cSz of [3, 4, 5, 6, 7.5, 10, 12, 20]) {
      for (const dpr of [1, 2]) {
        for (const hlName of Object.keys(HIGHLIGHTS)) {
          for (const fabric of ['#ffffff', '#1f2430']) { // light / dark fabric
            for (const variant of ['plain', 'texture', 'overlayCrop']) {
              if ((variant !== 'plain') && (hlName !== 'none' && hlName !== 'isolate')) continue;
              const ch = variant === 'overlayCrop' ? sparse : chart;
              const offX = variant === 'overlayCrop' ? 3 : 0, offY = variant === 'overlayCrop' ? 2 : 0;
              const dW = W - offX, dH = H - offY, gut = 16;
              const state = Object.assign({ sW: W, sH: H, view, showCtr: variant !== 'plain', bsLines: [], fabricColour: fabric,
                pat: ch.pat, cmap, partialStitches: ch.ps, canvasTexture: variant === 'texture',
                showOverlay: variant === 'overlayCrop', img: variant === 'overlayCrop' ? overlayImg : undefined }, HIGHLIGHTS[hlName]);
              const cw = Math.ceil((gut + dW * cSz + 4) * dpr), chh = Math.ceil((gut + dH * cSz + 4) * dpr);
              const canvas = createCanvas(cw, chh), raw = canvas.getContext('2d');
              raw.scale(dpr, dpr);
              const opHash = crypto.createHash('sha1');
              const rec = recorder(raw, opHash);
              if (pathName === 'full') r.drawPatternOnCanvas(rec.ctx, offX, offY, dW, dH, cSz, gut, state);
              else if (pathName === 'base') r.drawPatternBaseOnCanvas(rec.ctx, offX, offY, dW, dH, cSz, gut, state);
              else {
                // PatternCanvas paints large charts in bands: frame, then rows, then lines.
                const b = (cells) => r.drawPatternBaseOnCanvas(rec.ctx, offX, offY, dW, dH, cSz, gut, state, cells);
                b({ x0: 0, y0: 0, x1: 0, y1: 0, fill: 'all', lines: false });
                for (let y = 0; y < dH; y += 3) b({ x0: 0, y0: y, x1: dW, y1: Math.min(dH, y + 3), frame: false, lines: false, fill: false });
                b({ x0: 0, y0: 0, x1: 0, y1: 0, frame: false, fill: false });
              }
              const px = crypto.createHash('sha1').update(Buffer.from(canvas.getContext('2d').getImageData(0, 0, cw, chh).data)).digest('hex');
              out.results[[pathName, view, cSz, 'dpr' + dpr, hlName, fabric, variant].join('|')] = { ops: rec.count(), opHash: opHash.digest('hex'), pixelHash: px };
              total++;
            }
          }
        }
      }
    }
  }
}
out.total = total;
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log('wrote', total, 'configurations to', outPath);
