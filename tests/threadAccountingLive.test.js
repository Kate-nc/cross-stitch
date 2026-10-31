/* ThreadAccounting.live() (tap-lag audit, fix #6) must always hold exactly
   what ThreadAccounting.snapshot() would build from the same inputs, and
   report as changes exactly the units whose presence differs between the
   previous and the new snapshot — that is what the Tracker used to compute by
   diffing two snapshots on every mark. A seeded random walk over every kind of
   edit checks both after each step. */
global.ProgressUnits = require('../progress-units.js');
const A = require('../thread-accounting.js');

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const THREADS = [
  { id: '310', type: 'solid' }, { id: '321', type: 'solid', brand: 'dmc' }, { id: '666', type: 'solid' },
  { id: '310+321', type: 'blend', threads: [{ id: '310' }, { id: '321' }], blendRatio: [1, 2] },
  { id: '2000', type: 'solid', brand: 'anchor' }, { id: '__skip__' }, { id: '__empty__' },
];

function project(r, w, h, opts) {
  const pattern = Array.from({ length: w * h }, () => THREADS[Math.floor(r() * THREADS.length)]);
  const done = new Uint8Array(w * h);
  for (let i = 0; i < done.length; i++) done[i] = r() < 0.4 ? 1 : 0;
  const t = () => ({ ...THREADS[Math.floor(r() * 3)], rgb: [1, 2, 3] });
  const halfStitches = [], halfDone = [];
  for (let i = 0; i < 6; i++) { const idx = Math.floor(r() * w * h); halfStitches.push([idx, { fwd: t(), bck: r() < 0.5 ? t() : undefined }]); if (r() < 0.5) halfDone.push([idx, { fwd: 1, bck: r() < 0.5 ? 1 : 0 }]); }
  const partialStitches = [], partialDone = [];
  for (let i = 0; i < 4; i++) { const idx = Math.floor(r() * w * h); partialStitches.push([idx, { TL: t(), BR: t() }]); if (r() < 0.5) partialDone.push([idx, ['TL']]); }
  const knots = [], knotsDone = [];
  for (let i = 0; i < 5; i++) { const x = 2 * i + 1, y = 3; knots.push({ x, y, id: '666', rgb: [1, 2, 3] }); if (r() < 0.5) knotsDone.push(x + ',' + y); }
  const bsLines = [], bsDone = [];
  for (let i = 0; i < 5; i++) { bsLines.push({ x1: i, y1: 0, x2: i + 1, y2: 2, colorId: '310' }); if (r() < 0.5) bsDone.push([i, 0, i + 1, 2, '310'].join(',')); }
  const specialtyStitches = [{ uid: 'p1', type: 'petite', x: 1, y: 1, thread: t() }, { uid: 'l1', type: 'long_stitch', x1: 0, y1: 0, x2: 3, y2: 0, thread: t() }];
  const specialtyDone = r() < 0.5 ? ['p1'] : ['l1'];
  const p = { pattern, done, fabricCt: 14, settings: { threadBrand: 'dmc' }, halfStitches, halfDone, partialStitches, partialDone,
    knots, knotsDone, bsLines, bsDone, specialtyStitches, specialtyDone };
  if (opts.units) p.chartAccountingUnits = opts.units(w * h);
  return p;
}

function presence(a, b) {
  const out = [];
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach(u => { if (!!a[u] !== !!b[u]) out.push(u); });
  return out.sort();
}
const plain = o => JSON.parse(JSON.stringify(o));
const keysOf = m => { const s = new Set(); Object.values(m).forEach(e => Object.keys(e.amounts).forEach(k => s.add(k))); return [...s].sort(); };

const UNIT_MAPS = {
  none: null,
  // A chart update that shifted every full stitch by one: names shared with
  // nothing, plus shadow names, as chart-updates.js makes them.
  shifted: n => { const u = {}; for (let i = 0; i < n; i++) u['d:' + i] = 'd:' + (i + 1); u['h:0:fwd'] = 'h:0:fwd'; return u; },
  // Only some stitches mapped, so later unmapped stitches can share a name.
  partial: n => { const u = {}; for (let i = 0; i < n; i += 3) u['d:' + i] = 'd:' + (i + 1); u['k:1,3'] = 'pending:k:1,3'; return u; },
  // Two stitches mapped to one name: never incremental.
  manyToOne: () => ({ 'd:0': 'd:x', 'd:1': 'd:x' }),
};

for (const [mapName, units] of Object.entries(UNIT_MAPS)) {
  test(`live marks equal snapshot() through a random walk (units map: ${mapName})`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed * 7919 + mapName.length);
      const w = 9, h = 7;
      let p = project(r, w, h, { units });
      let prefs = { tailAllowanceIn: 1.5 };
      const live = A.live();
      live.adopt(p, prefs, A.snapshot(p, prefs));
      let prev = A.snapshot(p, prefs);
      for (let step = 0; step < 60; step++) {
        const next = { ...p };
        const roll = r();
        if (roll < 0.55) {                         // tap or stroke
          const d = new Uint8Array(p.done), n = 1 + Math.floor(r() * 4);
          for (let k = 0; k < n; k++) { const i = Math.floor(r() * d.length); d[i] = d[i] ? 0 : 1; }
          next.done = d;
        } else if (roll < 0.75) {                  // another kind of stitch marked or unmarked
          const f = ['halfDone', 'partialDone', 'knotsDone', 'bsDone', 'specialtyDone'][Math.floor(r() * 5)];
          const fresh = project(r, w, h, { units });
          next[f] = fresh[f];
          if (f === 'halfDone') next.halfStitches = r() < 0.3 ? fresh.halfStitches : p.halfStitches;
        } else if (roll < 0.82) {                  // a waste setting or fabric change
          if (r() < 0.5) prefs = { ...prefs, tailAllowanceIn: Math.round(r() * 30) / 10 };
          else next.fabricCt = [14, 16, 18, 28][Math.floor(r() * 4)];
        } else if (roll < 0.86) {                  // a chart edit
          next.pattern = p.pattern.map(c => (r() < 0.1 ? THREADS[Math.floor(r() * THREADS.length)] : c));
        } else if (roll < 0.9) {                   // brand
          next.settings = { threadBrand: r() < 0.5 ? 'dmc' : 'anchor' };
        } else {                                   // nothing changed (a re-render)
        }
        const changes = live.sync(next, prefs);
        const want = A.snapshot(next, prefs);
        expect(plain(live.marks())).toEqual(plain(want));
        expect(changes.map(c => c.unit).sort()).toEqual(presence(prev, want));
        changes.forEach(c => {
          expect(c.before ? plain(c.before) : null).toEqual(prev[c.unit] ? plain(prev[c.unit]) : null);
          expect(c.after ? plain(c.after) : null).toEqual(want[c.unit] ? plain(want[c.unit]) : null);
        });
        expect(live.threadKeys().sort()).toEqual(keysOf(want));
        prev = want; p = next;
      }
    }
  });
}

test('adopt reports nothing and later syncs report only what changed since', () => {
  const r = rng(42), p = project(r, 6, 6, {});
  const live = A.live();
  live.adopt(p, {});
  expect(live.sync(p, {})).toEqual([]);
  const d = new Uint8Array(p.done); const i = p.pattern.findIndex(c => c.id === '310'); d[i] = d[i] ? 0 : 1;
  const changes = live.sync({ ...p, done: d }, {});
  expect(changes.map(c => c.unit)).toEqual(['d:' + i]);
  // Progress merged from another tab is adopted, not reported.
  const merged = { ...p, done: new Uint8Array(p.done.length).fill(1) };
  live.adopt(merged, {});
  expect(live.sync(merged, {})).toEqual([]);
});

test('the marks adopt() starts from are copied, not edited later', () => {
  const r = rng(7), p = project(r, 6, 6, {});
  const initial = A.snapshot(p, {}), keys = Object.keys(initial).sort();
  const live = A.live();
  live.adopt(p, {}, initial);
  live.sync({ ...p, done: new Uint8Array(p.done.length) }, {});
  expect(Object.keys(initial).sort()).toEqual(keys);
});

test('a tap re-estimates only the stitch that changed', () => {
  const r = rng(3), base = project(r, 200, 200, {});
  let reads = 0;
  const pattern = new Proxy(base.pattern, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) reads++; return t[k]; } });
  const p = { ...base, pattern };
  const live = A.live();
  live.adopt(p, {});
  reads = 0;
  const d = new Uint8Array(p.done); d[123] = d[123] ? 0 : 1;
  live.sync({ ...p, done: d }, {});
  expect(reads).toBeLessThanOrEqual(2);          // the tapped cell, not 40 000
  reads = 0;
  live.sync({ ...p, done: d, fabricCt: 18 }, {}); // a fabric change re-estimates everything
  expect(reads).toBeGreaterThan(1000);
});

test('a project saved without a brand does not rebuild on its first sync as dmc', () => {
  const r = rng(11), p = project(r, 8, 8, {});
  const loaded = { ...p, settings: {} };
  const live = A.live();
  live.adopt(loaded, {});
  const d = new Uint8Array(p.done); d[5] = d[5] ? 0 : 1;
  live.sync({ ...p, done: d, settings: { threadBrand: 'dmc' } }, {});
  expect(live.rebuilds()).toBe(0);
  expect(plain(live.marks())).toEqual(plain(A.snapshot({ ...p, done: d }, {})));
  live.sync({ ...p, done: d, settings: { threadBrand: 'anchor' } }, {});
  expect(live.rebuilds()).toBe(1);
});
