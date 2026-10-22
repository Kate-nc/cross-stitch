'use strict';
const path = require('path');
const fs = require('fs');
const H = require('./harness.js');
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
const CONFIGS = {
  'DEFAULT (Photo preset)': v({}),
  'Prefs only (no guess)': v({ maxC: 15, dith: false, dithAlgo: 'off' }),
  'Shading off': v({ dith: false, dithAlgo: 'off' }),
  'Shading balanced': v({ dithStrength: 1.0 }),
  'Shading strong': v({ dithStrength: 1.5 }),
  'Pattern blend (bayer4)': v({ dithAlgo: 'bayer' }),
  'Riemersma (not in UI)': v({ dithAlgo: 'riemersma' }),
  'Blends off': v({ allowBlends: false }),
  'Fewer-confetti-shading off': v({ stitchCleanup: sc({ smoothDithering: false }) }),
  'Reduce confetti 0': v({ orphans: 0 }),
  'Reduce confetti 3': v({ orphans: 3 }),
  'Cleanup off + confetti 0': v({ orphans: 0, stitchCleanup: sc({ enabled: false }) }),
  'Strength gentle': v({ stitchCleanup: sc({ strength: 'gentle' }) }),
  'Strength thorough': v({ stitchCleanup: sc({ strength: 'thorough' }) }),
  'Strength gentle, confetti 0': v({ orphans: 0, stitchCleanup: sc({ strength: 'gentle' }) }),
  'Strength thorough, confetti 0': v({ orphans: 0, stitchCleanup: sc({ strength: 'thorough' }) }),
  'Protect details off': v({ stitchCleanup: sc({ protectDetails: false }) }),
  'Min stitches 0': v({ minSt: 0 }),
  'Min stitches 20': v({ minSt: 20 }),
  'Threads 15': v({ maxC: 15 }),
  'Threads 24': v({ maxC: 24 }),
  'Threads 30': v({ maxC: 30 }),
  'Threads 40': v({ maxC: 40 }),
  'Soften median 1': v({ smooth: 1 }),
  'Soften gaussian 1': v({ smooth: 1, smoothType: 'gaussian' }),
  'Look-alike apart (standard)': v({ disambig: true }),
  'No dither, no cleanup, no minSt (raw)': v({ dith: false, dithAlgo: 'off', orphans: 0, minSt: 0, stitchCleanup: sc({ enabled: false }) }),
};

(async () => {
  const files = fs.readdirSync(IMG).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((f) => path.join(IMG, f));
  const prepped = [];
  for (const f of files) prepped.push(await H.prepare(f, LONG));
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const rows = [];
  for (const [name, s] of Object.entries(CONFIGS)) {
    if (only && !only.test(name)) continue;
    for (const input of (process.env.LINEAR ? ['gamma', 'linear'] : ['gamma'])) {
      const acc = {}; const per = {};
      const t0 = Date.now();
      for (const p of prepped) {
        const res = H.runWorker(p[input].data, p.w, p.h, s);
        const m = H.score(res, p.ref, p.w, p.h);
        per[p.file] = m;
        for (const k in m) acc[k] = (acc[k] || 0) + m[k] / prepped.length;
      }
      rows.push({ name: name + (input === 'linear' ? ' [linear input]' : ''), ms: (Date.now() - t0) / prepped.length, ...acc, per });
    }
  }
  const fmt = (x, d = 2) => (typeof x === 'number' ? x.toFixed(d) : x);
  console.log(`grid long side ${LONG}, ${prepped.length} images`);
  console.log(['config', 'cellDE', 'viewDE', 'edgeDE', 'singles%', 'conf%', 'comps/100', 'chg%', 'symbols', 'threads', 'ms'].join('\t'));
  for (const r of rows) console.log([r.name.padEnd(40), fmt(r.cellDE), fmt(r.viewDE), fmt(r.edgeDE), fmt(r.singles), fmt(r.small), fmt(r.comps), fmt(r.changes), fmt(r.symbols, 1), fmt(r.threads, 1), fmt(r.ms, 0)].join('\t'));
  fs.writeFileSync(path.join(__dirname, `results-${LONG}${process.env.LINEAR ? '-lin' : ''}.json`), JSON.stringify(rows, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
