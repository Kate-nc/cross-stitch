'use strict';
// Real-Chromium check of the Creator's two draw pipelines, base against head.
// Each revision's canvasRenderer.js runs in its own page (same browser, same
// helper scripts). It
//   1. compares a 64-bit hash of the canvas pixels for a matrix of pipeline, view,
//      cell size, device pixel ratio and light/dark fabric, then
//   2. times full draws of large charts in alternating order, and samples
//      allocations with the CDP sampling heap profiler (minor and major GC
//      victims included) and the forced-GC retained heap.
//
//   node reports/cleanup-15/bench-browser.cjs <base canvasRenderer.js> <head canvasRenderer.js> [rounds] [out.json]
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(root, 'node_modules', 'playwright'));
const [, , baseFile, headFile, roundsArg, outPath] = process.argv;
const ROUNDS = parseInt(roundsArg || '10', 10), WARMUP = 3;
if (!baseFile || !headFile) { console.error('usage: bench-browser.cjs <base.js> <head.js> [rounds] [out.json]'); process.exit(2); }

const SUPPORT = ['constants.js', 'progress-units.js', 'colour-utils.js', 'helpers.js', 'creator/symbolFontSpec.js'];

// Runs inside the page. Mirrors bench-node.cjs / differential.cjs chart generation.
function pageSetup() {
  window.__mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const PAL = [[220, 20, 20], [20, 40, 220], [20, 160, 40], [250, 250, 240], [10, 10, 10], [240, 200, 30]].map((rgb, i) => ({ id: 'abcdef'[i], rgb }));
  const cmap = {}; PAL.forEach((p, i) => { cmap[p.id] = { id: p.id, rgb: p.rgb, symbol: 'ABCDEF'[i] }; });
  const Q = ['TL', 'TR', 'BL', 'BR'];
  window.__chart = function (W, H, density, seed) {
    const rnd = window.__mulberry(seed), pat = [], ps = new Map();
    for (let i = 0; i < W * H; i++) { const r = rnd(); if (r < 0.05) pat.push({ id: '__empty__' }); else { const p = PAL[Math.floor(rnd() * PAL.length)]; pat.push({ id: p.id, rgb: p.rgb }); } }
    for (let i = 0; i < W * H; i++) {
      if (rnd() >= density) continue;
      const e = {}, mask = 1 + Math.floor(rnd() * 15), c = PAL[Math.floor(rnd() * PAL.length)];
      for (let q = 0; q < 4; q++) if (mask & (1 << q)) e[Q[q]] = { id: c.id, rgb: c.rgb };
      ps.set(i, e);
    }
    return { W, H, pat, ps, cmap };
  };
  window.__charts = {};
  window.__render = async function (spec) {
    const key = spec.W + 'x' + spec.H + '@' + spec.density;
    const ch = window.__charts[key] || (window.__charts[key] = window.__chart(spec.W, spec.H, spec.density, spec.seed));
    const gut = 16, cw = Math.ceil((gut + ch.W * spec.cSz + 4) * spec.dpr), chh = Math.ceil((gut + ch.H * spec.cSz + 4) * spec.dpr);
    const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = chh;
    const ctx = canvas.getContext('2d', { willReadFrequently: !!spec.readback });
    ctx.scale(spec.dpr, spec.dpr);
    const state = { sW: ch.W, sH: ch.H, view: spec.view, showCtr: false, bsLines: [], fabricColour: spec.fabric, pat: ch.pat, cmap: ch.cmap, partialStitches: ch.ps };
    const fn = spec.pipe === 'full' ? window.drawPatternOnCanvas : window.drawPatternBaseOnCanvas;
    const t0 = performance.now();
    fn(ctx, 0, 0, ch.W, ch.H, spec.cSz, gut, state);
    if (spec.flush) ctx.getImageData(0, 0, 1, 1); // force the raster to complete inside the timing
    const ms = performance.now() - t0;
    let hash = null;
    if (spec.hash) {
      const px = ctx.getImageData(0, 0, cw, chh).data;
      // 64 bits from two independent hashes (crypto.subtle needs a secure context).
      let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
      for (let i = 0; i < px.length; i++) { h1 = Math.imul(h1 ^ px[i], 16777619); h2 = Math.imul(h2 + px[i] + 1, 2654435761) ^ (h2 >>> 15); }
      hash = (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + ':' + px.length;
    }
    return { ms, hash };
  };
}

const median = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
function sampledBytes(profile) { let t = 0; (function walk(n) { t += n.selfSize || 0; (n.children || []).forEach(walk); })(profile.head); return t; }

(async () => {
  // CHROMIUM_PATH points at a browser other than the one Playwright resolves for this lockfile.
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const rev = {};
  for (const [name, file] of [['base', baseFile], ['head', headFile]]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setContent('<!doctype html><html><body></body></html>');
    for (const f of SUPPORT) await page.addScriptTag({ path: path.join(root, f) });
    await page.addScriptTag({ path: file });
    await page.evaluate(pageSetup);
    rev[name] = { page, cdp: await context.newCDPSession(page), errors };
  }

  // 1. Pixel comparison
  const pixels = { configurations: 0, differences: [] };
  for (const pipe of ['full', 'base']) for (const view of ['color', 'symbol', 'both']) for (const cSz of [3, 4, 5, 6, 7.5, 10, 12, 20])
    for (const dpr of [1, 2]) for (const fabric of ['#ffffff', '#1f2430']) {
      const spec = { W: 30, H: 24, density: 0.4, seed: 99, pipe, view, cSz, dpr, fabric, hash: true, readback: true };
      const a = await rev.base.page.evaluate(s => window.__render(s), spec), b = await rev.head.page.evaluate(s => window.__render(s), spec);
      pixels.configurations++;
      if (a.hash !== b.hash) pixels.differences.push(spec);
    }
  console.log(`pixels: ${pixels.configurations} configurations, ${pixels.differences.length} differences`);

  // 2. Timing (alternating), allocations, retained heap
  const CASES = [
    { name: 'large 300x300, 5% fractional', W: 300, H: 300, density: 0.05, seed: 2, cSz: 8 },
    { name: 'large 300x300, 40% fractional', W: 300, H: 300, density: 0.40, seed: 3, cSz: 8 },
    { name: 'large 300x300, no fractional', W: 300, H: 300, density: 0, seed: 4, cSz: 8 },
    { name: 'small 40x40, 5% fractional', W: 40, H: 40, density: 0.05, seed: 1, cSz: 12 }
  ];
  const timing = [];
  for (const cs of CASES) for (const pipe of ['full', 'base']) {
    const spec = Object.assign({ pipe, view: 'both', dpr: 1, fabric: '#ffffff', flush: true, readback: false }, cs);
    const data = { base: [], head: [] };
    for (let r = 0; r < ROUNDS + WARMUP; r++) {
      const order = r % 2 ? ['head', 'base'] : ['base', 'head'];
      for (const name of order) { const s = await rev[name].page.evaluate(sp => window.__render(sp), spec); if (r >= WARMUP) data[name].push(s.ms); }
    }
    // Allocation: sampling heap profiler across 3 alternating draws per revision.
    const alloc = { base: [], head: [] };
    for (let r = 0; r < 3; r++) for (const name of (r % 2 ? ['head', 'base'] : ['base', 'head'])) {
      const { cdp, page } = rev[name];
      await cdp.send('HeapProfiler.enable');
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.evaluate(sp => window.__render(sp), spec);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      alloc[name].push(sampledBytes(profile) / 1024);
    }
    const row = { case: cs.name, pipeline: pipe, base: { medianMs: median(data.base), minMs: Math.min(...data.base), maxMs: Math.max(...data.base), samplesMs: data.base.map(x => +x.toFixed(2)), sampledAllocKiB: alloc.base.map(x => +x.toFixed(0)) },
      head: { medianMs: median(data.head), minMs: Math.min(...data.head), maxMs: Math.max(...data.head), samplesMs: data.head.map(x => +x.toFixed(2)), sampledAllocKiB: alloc.head.map(x => +x.toFixed(0)) } };
    timing.push(row);
    console.log(`${cs.name.padEnd(32)} ${pipe.padEnd(4)} base ${row.base.medianMs.toFixed(1).padStart(8)} ms ${median(alloc.base).toFixed(0).padStart(7)} KiB | head ${row.head.medianMs.toFixed(1).padStart(8)} ms ${median(alloc.head).toFixed(0).padStart(7)} KiB`);
  }

  // Retained heap after forced GC following 10 draws of the heaviest case.
  const retained = {};
  for (const name of ['base', 'head']) {
    const { cdp, page } = rev[name];
    const spec = Object.assign({ pipe: 'base', view: 'both', dpr: 1, fabric: '#ffffff', flush: true }, CASES[1]);
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); const { metrics } = await cdp.send('Performance.getMetrics'); return metrics.find(m => m.name === 'JSHeapUsedSize').value / 1048576; };
    await cdp.send('Performance.enable');
    const before = await heap();
    for (let i = 0; i < 10; i++) await page.evaluate(sp => window.__render(sp), spec);
    retained[name] = { beforeMiB: +before.toFixed(2), afterMiB: +(await heap()).toFixed(2) };
  }
  console.log('retained JS heap after forced GC (MiB):', JSON.stringify(retained));

  const out = { chromium: browser.version(), pixels, timing, retained, pageErrors: { base: rev.base.errors, head: rev.head.errors }, rounds: ROUNDS, warmup: WARMUP };
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
