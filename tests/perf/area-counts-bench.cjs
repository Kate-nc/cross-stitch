/* area-counts-bench.cjs — the Stitch Tracker's work-area counts, per mark.
   ═══════════════════════════════════════════════════════════════════════════
   node tests/perf/area-counts-bench.cjs        (reports/track-work-area-counts.md)

   Marks stitches steadily inside work areas of several sizes on a 600 x 800
   chart, with and without half stitches, and counts the work each mark costs
   the area counts:

     before  what tracker-app.js did up to 1.0.243: after every mark, rescan
             the area for its progress (countRect) and again for its colour
             counts, each also walking every half stitch on the chart.
     after   WorkArea.buildCounts once, then WorkArea.applyDoneDelta /
             applyHalfDelta per mark.

   Cell reads (pattern entries) and half-stitch visits are deterministic;
   times are this machine's Node, with no browser, so they are JavaScript
   time only and not a device measurement. */
const WA = require('../../work-area.js');

const sW = 600, sH = 800, N = sW * sH, MARKS = 200;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function chart(halves) {
  const r = rng(1), pat = new Array(N), counter = { reads: 0, halfVisits: 0 };
  for (let i = 0; i < N; i++) pat[i] = { id: String(100 + (i % 80)), type: 'solid' };
  const done = new Uint8Array(N); for (let i = 0; i < N; i++) if (r() < 0.5) done[i] = 1;
  const hs = new Map(), hd = new Map();
  if (halves) for (let i = 0; i < N; i += 7) { hs.set(i, { fwd: { id: '310' } }); if (r() < 0.5) hd.set(i, { fwd: 1 }); }
  const counted = new Proxy(pat, { get(t, k) { if (typeof k === 'string' && k.charCodeAt(0) < 58) counter.reads++; return t[k]; } });
  return { pat, counted, done, hs, hd, counter };
}
function countHalves(hs, counter) { return { forEach(fn) { hs.forEach((v, k) => { counter.halfVisits++; fn(v, k); }); }, get size() { return hs.size; }, get: (k) => hs.get(k) }; }

// The two memo bodies as they were (tracker-app.js 1.0.243, areaStats and areaColourCounts).
function before(a, pat, sW, d, halfStitches, halfDone) {
  let total = 0, dn = 0;
  for (let y = a.y0; y < a.y1; y++) { const base = y * sW; for (let x = a.x0; x < a.x1; x++) { const m = pat[base + x]; if (!m || m.id === '__skip__' || m.id === '__empty__') continue; total++; if (d && d[base + x]) dn++; } }
  if (halfStitches && halfStitches.size) halfStitches.forEach((hs, idx) => { if (!WA.containsIndex(a, idx, sW)) return; const hd = halfDone && halfDone.get(idx); if (hs.fwd) { total += 0.5; if (hd && hd.fwd) dn += 0.5; } if (hs.bck) { total += 0.5; if (hd && hd.bck) dn += 0.5; } });
  const out = {}, get = (id) => out[id] || (out[id] = { total: 0, done: 0, halfTotal: 0, halfDone: 0 });
  for (let y = a.y0; y < a.y1; y++) { const base = y * sW; for (let x = a.x0; x < a.x1; x++) { const m = pat[base + x]; if (!m || m.id === '__skip__' || m.id === '__empty__') continue; const c = get(m.id); c.total++; if (d && d[base + x]) c.done++; } }
  if (halfStitches && halfStitches.size) halfStitches.forEach((hs, idx) => { if (!WA.containsIndex(a, idx, sW)) return; const hd = halfDone && halfDone.get(idx); if (hs.fwd) { const c = get(hs.fwd.id); c.halfTotal++; if (hd && hd.fwd) c.halfDone++; } if (hs.bck) { const c = get(hs.bck.id); c.halfTotal++; if (hd && hd.bck) c.halfDone++; } });
  return { total, done: dn, colours: out };
}

// One pass of MARKS marks. `counted` reads the pattern through a counting
// proxy (for the work counts); otherwise plain arrays (for the times).
function pass(mode, a, halves, counted) {
  const c = chart(halves);
  const pat = counted ? c.counted : c.pat, hs = counted ? countHalves(c.hs, c.counter) : c.hs;
  let done = c.done;
  const r = rng(7);
  const pts = Array.from({ length: MARKS }, () => (a.y0 + Math.floor(r() * (a.y1 - a.y0))) * sW + a.x0 + Math.floor(r() * (a.x1 - a.x0)));
  const tb = process.hrtime.bigint();
  const st = mode === 'after' ? WA.buildCounts(a, pat, sW, done, hs, c.hd) : null;
  const buildMs = Number(process.hrtime.bigint() - tb) / 1e6;
  const buildReads = c.counter.reads, buildHalf = c.counter.halfVisits;
  c.counter.reads = 0; c.counter.halfVisits = 0;
  const times = [];
  let last;
  for (const idx of pts) {
    const nd = new Uint8Array(done), ch = [{ idx, oldVal: nd[idx] }]; nd[idx] = nd[idx] ? 0 : 1;   // the tap's own copy, as the tracker makes
    const t = process.hrtime.bigint();
    if (mode === 'before') last = before(a, pat, sW, nd, hs, c.hd);
    else { WA.applyDoneDelta(st, ch, nd); last = { total: st.total, done: st.done, colours: st.colours }; }
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
    done = nd;
  }
  times.sort((x, y) => x - y);
  return {
    readsPerMark: c.counter.reads / MARKS, halfVisitsPerMark: c.counter.halfVisits / MARKS,
    buildReads, buildHalfVisits: buildHalf, buildMs: +buildMs.toFixed(2),
    msP50: +times[MARKS >> 1].toFixed(3), msP95: +times[Math.floor(MARKS * 0.95)].toFixed(3),
    result: { total: last.total, done: last.done },
  };
}

function run(areaSide, halves) {
  const a = areaSide >= sW
    ? { x0: 0, y0: 0, x1: sW, y1: sH }
    : { x0: 200, y0: 300, x1: 200 + areaSide, y1: 300 + areaSide };
  const res = {};
  for (const mode of ['before', 'after']) {
    const w = pass(mode, a, halves, true), t = pass(mode, a, halves, false);
    res[mode] = { readsPerMark: w.readsPerMark, halfVisitsPerMark: w.halfVisitsPerMark,
      buildReads: mode === 'after' ? w.buildReads : null, buildHalfVisits: mode === 'after' ? w.buildHalfVisits : null,
      buildMs: mode === 'after' ? t.buildMs : null, msP50: t.msP50, msP95: t.msP95, result: t.result };
    if (JSON.stringify(w.result) !== JSON.stringify(t.result)) throw new Error('counted and timed passes differ');
  }
  if (JSON.stringify(res.before.result) !== JSON.stringify(res.after.result)) throw new Error('results differ for ' + areaSide);
  return { area: areaSide >= sW ? `${sW}x${sH} (whole chart)` : `${areaSide}x${areaSide}`, halves: halves ? N / 7 | 0 : 0, ...res };
}

const rows = [];
for (const halves of [false, true]) for (const side of [10, 50, 100, 300, 600]) rows.push(run(side, halves));
console.log('area                       halves   reads/mark before -> after   half visits/mark before -> after   ms p50 before -> after   (p95)      one build (after): reads, half visits, ms');
for (const r of rows) {
  console.log(`${r.area.padEnd(26)} ${String(r.halves).padStart(6)}   ${String(r.before.readsPerMark).padStart(10)} -> ${String(r.after.readsPerMark).padEnd(6)}   ${String(r.before.halfVisitsPerMark).padStart(12)} -> ${String(r.after.halfVisitsPerMark).padEnd(14)}   ${String(r.before.msP50).padStart(8)} -> ${String(r.after.msP50).padEnd(8)}  (${r.before.msP95} -> ${r.after.msP95})   ${r.after.buildReads}, ${r.after.buildHalfVisits}, ${r.after.buildMs}`);
}
if (process.env.JSON) console.log(JSON.stringify(rows, null, 1));
