'use strict';
// Same-process A/B timing and allocation harness for the two Creator draw
// pipelines. Base and head renderers are loaded into separate vm contexts and
// run in alternating order (ABBA...) so drift hits both equally. One sample is
// one full chart draw.
//
//   node --expose-gc --min-semi-space-size=256 --max-semi-space-size=256 \
//     reports/cleanup-15/bench-node.cjs <base canvasRenderer.js> <head canvasRenderer.js> [stubRounds] [canvasRounds] [out.json]
//
// The large semi-space keeps scavenges out of the allocation measurement:
// with no collection during a draw, the heapUsed delta is the bytes allocated.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { PerformanceObserver } = require('perf_hooks');
const root = path.resolve(__dirname, '..', '..');
const { createCanvas } = require(path.join(root, 'node_modules', 'canvas'));
const [, , baseFile, headFile, stubRoundsArg, canvasRoundsArg, outPath] = process.argv;
const STUB_ROUNDS = parseInt(stubRoundsArg || '30', 10), CANVAS_ROUNDS = parseInt(canvasRoundsArg || '8', 10), WARMUP = 3;
if (!baseFile || !headFile || typeof global.gc !== 'function') { console.error('usage: node --expose-gc ... bench-node.cjs <base.js> <head.js> [stubRounds] [canvasRounds] [out.json]'); process.exit(2); }

function load(file) {
  const c = vm.createContext({ console, Map, Set, Uint8Array, CK: 4, ProgressUnits: require(path.join(root, 'progress-units')),
    addEventListener() {}, document: { createElement: () => createCanvas(1, 1) } });
  c.window = c;
  for (const f of ['colour-utils.js', 'helpers.js', 'creator/symbolFontSpec.js'])
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), c, { filename: f });
  vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: file });
  return c;
}
const REV = { base: load(baseFile), head: load(headFile) };

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const PAL = [[220, 20, 20], [20, 40, 220], [20, 160, 40], [250, 250, 240], [10, 10, 10], [240, 200, 30]].map((rgb, i) => ({ id: 'abcdef'[i], rgb }));
const cmap = {}; PAL.forEach((p, i) => { cmap[p.id] = { id: p.id, rgb: p.rgb, symbol: 'ABCDEF'[i] }; });
const Q = ['TL', 'TR', 'BL', 'BR'];
function chart(W, H, density, seed) {
  const rnd = mulberry32(seed), pat = [], ps = new Map();
  for (let i = 0; i < W * H; i++) { const p = PAL[Math.floor(rnd() * PAL.length)]; pat.push({ id: p.id, rgb: p.rgb }); }
  for (let i = 0; i < W * H; i++) {
    if (rnd() >= density) continue;
    const e = {}, mask = 1 + Math.floor(rnd() * 15), c = PAL[Math.floor(rnd() * PAL.length)];
    for (let q = 0; q < 4; q++) if (mask & (1 << q)) e[Q[q]] = { id: c.id, rgb: c.rgb };
    ps.set(i, e);
  }
  return { W, H, pat, ps };
}

// A context whose methods do nothing: measures renderer JS (and allocation)
// without rasterisation. Property writes are plain stores.
function stubContext() {
  const real = createCanvas(1, 1).getContext('2d'), stub = {};
  for (let o = real; o && o !== Object.prototype; o = Object.getPrototypeOf(o))
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k === 'constructor' || k in stub) continue;
      let d; try { d = Object.getOwnPropertyDescriptor(o, k); } catch (e) { continue; }
      if (d && typeof d.value === 'function') stub[k] = k === 'measureText' ? () => ({ width: 0 }) : () => undefined;
      else stub[k] = undefined;
    }
  return stub;
}

const CASES = [
  { name: 'small 40x40, 5% fractional', chart: chart(40, 40, 0.05, 1), cSz: 12 },
  { name: 'large 300x300, 5% fractional', chart: chart(300, 300, 0.05, 2), cSz: 8 },
  { name: 'large 300x300, 40% fractional', chart: chart(300, 300, 0.40, 3), cSz: 8 },
  { name: 'large 300x300, no fractional', chart: chart(300, 300, 0, 4), cSz: 8 }
];
const PIPES = { full: 'drawPatternOnCanvas', base: 'drawPatternBaseOnCanvas' };
const CTXS = ['stub', 'canvas'];

let gcCount = 0;
new PerformanceObserver(list => { for (const e of list.getEntries()) if (e.detail ? e.detail.kind === 1 : e.kind === 1) gcCount++; }).observe({ entryTypes: ['gc'] });

function sample(revName, cs, pipe, ctxKind, view) {
  const ch = cs.chart, state = { sW: ch.W, sH: ch.H, view, showCtr: false, bsLines: [], fabricColour: '#ffffff', pat: ch.pat, cmap, partialStitches: ch.ps };
  const gut = 16, w = gut + ch.W * cs.cSz + 4, h = gut + ch.H * cs.cSz + 4;
  const ctx = ctxKind === 'stub' ? stubContext() : createCanvas(w, h).getContext('2d');
  const fn = REV[revName][PIPES[pipe]];
  global.gc(); global.gc();
  const g0 = gcCount, m0 = process.memoryUsage().heapUsed, t0 = process.hrtime.bigint();
  fn(ctx, 0, 0, ch.W, ch.H, cs.cSz, gut, state);
  const t1 = process.hrtime.bigint(), m1 = process.memoryUsage().heapUsed;
  return { ms: Number(t1 - t0) / 1e6, allocKiB: (m1 - m0) / 1024, minorGcs: gcCount - g0 };
}

const median = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const out = { node: process.version, stubRounds: STUB_ROUNDS, canvasRounds: CANVAS_ROUNDS, warmup: WARMUP, base: baseFile, head: headFile, cases: [] };
// CASE=<regex> limits the run to matching "case|pipeline|ctx" rows.
const only = process.env.CASE ? new RegExp(process.env.CASE) : null;
for (const cs of CASES) for (const pipe of Object.keys(PIPES)) for (const ctxKind of CTXS) {
  if (only && !only.test([cs.name, pipe, ctxKind].join('|'))) continue;
  const view = 'both', data = { base: [], head: [] }, rounds = ctxKind === 'stub' ? STUB_ROUNDS : CANVAS_ROUNDS;
  for (let r = 0; r < rounds + WARMUP; r++) {
    const order = r % 2 ? ['head', 'base'] : ['base', 'head']; // ABBA
    for (const rev of order) { const s = sample(rev, cs, pipe, ctxKind, view); if (r >= WARMUP) data[rev].push(s); }
  }
  const sum = rev => ({ medianMs: median(data[rev].map(s => s.ms)), minMs: Math.min(...data[rev].map(s => s.ms)), maxMs: Math.max(...data[rev].map(s => s.ms)),
    medianAllocKiB: median(data[rev].map(s => s.allocKiB)), minorGcsTotal: data[rev].reduce((a, s) => a + s.minorGcs, 0), samplesMs: data[rev].map(s => +s.ms.toFixed(3)) });
  const row = { case: cs.name, pipeline: pipe, ctx: ctxKind, view, cSz: cs.cSz, base: sum('base'), head: sum('head') };
  out.cases.push(row);
  console.log(`${cs.name.padEnd(32)} ${pipe.padEnd(4)} ${ctxKind.padEnd(6)} base ${row.base.medianMs.toFixed(2).padStart(8)} ms ${row.base.medianAllocKiB.toFixed(0).padStart(7)} KiB | head ${row.head.medianMs.toFixed(2).padStart(8)} ms ${row.head.medianAllocKiB.toFixed(0).padStart(7)} KiB`);
}
if (outPath) fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
