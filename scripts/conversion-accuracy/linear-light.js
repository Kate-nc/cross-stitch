'use strict';
// Candidate improvements, measured against the current default.
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');
const W = H.W;
const IMG = path.join(__dirname, 'img');
const LONG = +(process.env.LONG || 100);

const base = {
  maxC: 20, dith: true, dithAlgo: 'atkinson', dithStrength: 0.5, dithBayerSize: 4, allowBlends: true,
  skipBg: false, bgCol: [255, 255, 255], bgTh: 15, minSt: 6, smooth: 0, smoothType: 'median',
  stitchCleanup: { enabled: true, strength: 'balanced', protectDetails: true, smoothDithering: true },
  orphans: 2, disambig: false, disambigLevel: 'standard', allowedPalette: null, seed: 1337,
};
const v = (o) => Object.assign({}, base, o);
const sc = (o) => Object.assign({}, base.stitchCleanup, o);

// Atkinson diffusion in linear light (same structure as doDither, confetti rule kept).
const origDoDither = W.doDither;
function doDitherLinear(data, w, h, pal, allowBlends = true, saliencyMap = null, { confettiDitherThreshold = 4.0, ditherStrength = 1.0 } = {}) {
  if (allowBlends && typeof W.findBest.precomputeBlends === 'function') W.findBest.precomputeBlends(pal);
  const N = w * h, L = H.LIN, d = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) d[i * 3 + c] = L[data[i * 4 + c]];
  const palIdx = new Map(pal.map((p) => [p.id, p]));
  const linOf = (e) => e.type === 'blend' && e.threads ? [0, 1, 2].map((c) => (L[e.threads[0].rgb[c]] + L[e.threads[1].rgb[c]]) / 2) : [L[e.rgb[0]], L[e.rgb[1]], L[e.rgb[2]]];
  const r = new Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (data[idx * 4 + 3] < 128) { r[idx] = { type: 'skip', id: '__skip__', rgb: [255, 255, 255], lab: [100, 0, 0] }; continue; }
    const cr = Math.max(0, Math.min(1, d[idx * 3])), cg = Math.max(0, Math.min(1, d[idx * 3 + 1])), cb = Math.max(0, Math.min(1, d[idx * 3 + 2]));
    const t = H.linToLab(cr, cg, cb);
    const best = W.findBest(t, pal, allowBlends);
    let chosen = best;
    const thr = confettiDitherThreshold * (1 - (saliencyMap ? saliencyMap[idx] : 0));
    if (thr > 0) {
      const nbs = [];
      if (y > 0) { if (x > 0) nbs.push(r[idx - w - 1].id); nbs.push(r[idx - w].id); if (x < w - 1) nbs.push(r[idx - w + 1].id); }
      if (x > 0) nbs.push(r[idx - 1].id);
      if (nbs.indexOf(best.id) < 0) {
        let sb = null, sd = Infinity;
        for (const id of new Set(nbs)) { const e = palIdx.get(id); if (!e) continue; const dd = H.dE00(t, e.lab); if (dd < sd) { sd = dd; sb = e; } }
        if (sb && sd - H.dE00(t, best.lab) < thr) chosen = sb;
      }
    }
    r[idx] = chosen;
    const cl = linOf(chosen);
    const e = [(cr - cl[0]) * ditherStrength, (cg - cl[1]) * ditherStrength, (cb - cl[2]) * ditherStrength];
    const add = (i) => { for (let c = 0; c < 3; c++) d[i * 3 + c] += e[c] / 8; };
    if (x + 1 < w) add(idx + 1);
    if (x + 2 < w) add(idx + 2);
    if (y + 1 < h) { if (x > 0) add(idx + w - 1); add(idx + w); if (x + 1 < w) add(idx + w + 1); }
    if (y + 2 < h) add(idx + 2 * w);
  }
  return r;
}

const RUNS = [
  ['DEFAULT', 'gamma', v({}), false],
  ['DEFAULT, linear downscale', 'linear', v({}), false],
  ['DEFAULT, linear dither', 'gamma', v({}), true],
  ['DEFAULT, linear downscale + linear dither', 'linear', v({}), true],
  ['Shading balanced, linear both', 'linear', v({ dithStrength: 1.0 }), true],
  ['Shading off, linear downscale', 'linear', v({ dith: false, dithAlgo: 'off' }), false],
  ['Proposed: off, 24 thr, minSt 0, conf 0, cleanup balanced, linear', 'linear', v({ dith: false, dithAlgo: 'off', maxC: 24, minSt: 0, orphans: 0 }), false],
  ['Proposed: weak, 24 thr, minSt 0, conf 0, linear both', 'linear', v({ maxC: 24, minSt: 0, orphans: 0 }), true],
  ['Proposed: weak, 30 thr, blends off, minSt 0, conf 0, linear both', 'linear', v({ maxC: 30, minSt: 0, orphans: 0, allowBlends: false }), true],
];

(async () => {
  const files = fs.readdirSync(IMG).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((f) => path.join(IMG, f));
  const prepped = [];
  for (const f of files) prepped.push(await H.prepare(f, LONG));
  console.log(`grid long side ${LONG}, ${prepped.length} images`);
  console.log(['config', 'cellDE', 'viewDE', 'edgeDE', 'singles%', 'conf%', 'comps/100', 'chg%', 'symbols', 'threads'].join('\t'));
  const out = [];
  for (const [name, input, s, linDither] of RUNS) {
    W.doDither = linDither ? doDitherLinear : origDoDither;
    const acc = {}, per = {};
    for (const p of prepped) {
      const m = H.score(H.runWorker(p[input].data, p.w, p.h, s), p.ref, p.w, p.h);
      per[p.file] = m;
      for (const k in m) acc[k] = (acc[k] || 0) + m[k] / prepped.length;
    }
    out.push({ name, ...acc, per });
    const f = (x, dd = 2) => x.toFixed(dd);
    console.log([name.padEnd(64), f(acc.cellDE), f(acc.viewDE), f(acc.edgeDE), f(acc.singles), f(acc.small), f(acc.comps), f(acc.changes), f(acc.symbols, 1), f(acc.threads, 1)].join('\t'));
  }
  fs.writeFileSync(path.join(__dirname, `results2-${LONG}.json`), JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
