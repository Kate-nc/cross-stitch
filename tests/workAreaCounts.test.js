/**
 * @jest-environment jsdom
 *
 * Work-area counts (work-area.js buildCounts / applyDoneDelta / applyHalfDelta,
 * wired through useStitchCounts.js areaCountsFor). See
 * reports/track-work-area-counts.md.
 *
 * The tracker used to rescan the whole work area twice after every mark (the
 * area's progress and its per-colour counts). Now the counts are built once
 * and updated from the changed cells. These tests hold the incremental counts
 * to a reference full recount after every step of mixed marking, and check
 * that a mark reads only the cells it changed, and that every way the marks
 * can be replaced without a delta rebuilds instead of drifting.
 */
const fs = require('fs');
const path = require('path');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');

global.IS_REACT_ACT_ENVIRONMENT = true;
window.React = React;
const WA = require('../work-area.js');
window.WorkArea = WA;
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(__dirname, '..', 'useStitchCounts.js'), 'utf8'));

/* ── Reference: a full recount, written independently of the code under test
   (the tracker's own countRect plus a per-colour scan, as they were). ─────── */
function reference(area, pat, sW, done, hs, hd) {
  let total = 0, dn = 0;
  const colours = {};
  const get = (id) => colours[id] || (colours[id] = { total: 0, done: 0, halfTotal: 0, halfDone: 0 });
  for (let y = area.y0; y < area.y1; y++) for (let x = area.x0; x < area.x1; x++) {
    const i = y * sW + x, m = pat[i];
    if (!m || m.id === '__skip__' || m.id === '__empty__') continue;
    total++; get(m.id).total++;
    if (done && done[i]) { dn++; get(m.id).done++; }
  }
  if (hs) hs.forEach((v, idx) => {
    const y = Math.floor(idx / sW), x = idx % sW;
    if (x < area.x0 || x >= area.x1 || y < area.y0 || y >= area.y1) return;
    const h = hd && hd.get(idx);
    for (const side of ['fwd', 'bck']) {
      if (!v[side]) continue;
      total += 0.5; get(v[side].id).halfTotal++;
      if (h && h[side]) { dn += 0.5; get(v[side].id).halfDone++; }
    }
  });
  return { total, done: dn, colours };
}
const view = (st) => ({ total: st.total, done: st.done, colours: st.colours });

/* Deterministic pseudo-random numbers, so a failure reproduces. */
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function makeChart(sW, sH, seed) {
  const r = rng(seed), ids = ['310', '321', '699', '3865', 'blank', '415'];
  const pat = Array.from({ length: sW * sH }, () => {
    const k = r();
    if (k < 0.08) return { id: '__skip__' };
    if (k < 0.12) return { id: '__empty__' };
    return { id: ids[Math.floor(r() * ids.length)], type: 'solid' };
  });
  const hs = new Map();
  for (let i = 0; i < sW * sH; i++) {
    if (r() < 0.06) {
      const v = {};
      if (r() < 0.8) v.fwd = { id: ids[Math.floor(r() * ids.length)] };
      if (r() < 0.5 || !v.fwd) v.bck = { id: ids[Math.floor(r() * ids.length)] };
      hs.set(i, v);
    }
  }
  const done = new Uint8Array(sW * sH);
  for (let i = 0; i < done.length; i++) if (r() < 0.3) done[i] = 1;
  const hd = new Map();
  hs.forEach((v, idx) => { const h = {}; if (v.fwd && r() < 0.4) h.fwd = 1; if (v.bck && r() < 0.4) h.bck = 1; if (h.fwd || h.bck) hd.set(idx, h); });
  return { pat, hs, done, hd };
}

/* A pattern array that counts reads of its entries. */
function countingPattern(pat) {
  const counter = { reads: 0 };
  const proxy = new Proxy(pat, {
    get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) counter.reads++; return t[k]; }
  });
  return { proxy, counter };
}

describe('WorkArea counts (pure)', () => {
  const sW = 37, sH = 29;
  const area = { x0: 5, y0: 4, x1: 30, y1: 22 };

  test('buildCounts matches a full recount, including half-stitch weighting', () => {
    const c = makeChart(sW, sH, 7);
    const st = WA.buildCounts(area, c.pat, sW, c.done, c.hs, c.hd);
    expect(view(st)).toEqual(reference(area, c.pat, sW, c.done, c.hs, c.hd));
    // A half stitch with both sides counts as one stitch; one side as a half.
    const one = WA.buildCounts({ x0: 0, y0: 0, x1: 1, y1: 1 }, [{ id: '__skip__' }], 1, new Uint8Array(1),
      new Map([[0, { fwd: { id: 'a' }, bck: { id: 'b' } }]]), new Map([[0, { fwd: 1 }]]));
    expect(one.total).toBe(1); expect(one.done).toBe(0.5);
    expect(one.colours.a).toEqual({ total: 0, done: 0, halfTotal: 1, halfDone: 1 });
    expect(one.colours.b).toEqual({ total: 0, done: 0, halfTotal: 1, halfDone: 0 });
  });

  test('2 000 mixed steps (marks, unmarks, bulk, reversals, halves) stay equal to a full recount', () => {
    const c = makeChart(sW, sH, 11), r = rng(99);
    let done = c.done, hd = c.hd;
    const st = WA.buildCounts(area, c.pat, sW, done, c.hs, hd);
    const history = [];
    const halfIdx = [...c.hs.keys()];
    for (let step = 0; step < 2000; step++) {
      const k = r();
      if (k < 0.45) {                                   // one tap, anywhere on the chart
        const idx = Math.floor(r() * done.length), nd = new Uint8Array(done);
        const ch = [{ idx, oldVal: nd[idx] }]; nd[idx] = nd[idx] ? 0 : 1;
        WA.applyDoneDelta(st, ch, nd); history.push(ch); done = nd;
      } else if (k < 0.6) {                             // a drag or range: a run of cells, some unchanged
        const nd = new Uint8Array(done), ch = [], want = r() < 0.5 ? 1 : 0;
        const start = Math.floor(r() * done.length), n = 1 + Math.floor(r() * 60);
        for (let i = start; i < Math.min(done.length, start + n); i++) { ch.push({ idx: i, oldVal: nd[i] }); nd[i] = want; }
        WA.applyDoneDelta(st, ch, nd); history.push(ch); done = nd;
      } else if (k < 0.75 && history.length) {          // undo: the last step's cells back to oldVal
        const last = history.pop(), nd = new Uint8Array(done);
        const ch = last.map((x) => ({ idx: x.idx, oldVal: nd[x.idx] }));
        for (const x of last) nd[x.idx] = x.oldVal;
        WA.applyDoneDelta(st, ch, nd); done = nd;
      } else if (halfIdx.length) {                      // one side of a half stitch
        const idx = halfIdx[Math.floor(r() * halfIdx.length)], v = c.hs.get(idx);
        const dir = v.fwd && (!v.bck || r() < 0.5) ? 'fwd' : 'bck';
        const was = (hd.get(idx) || {})[dir] ? 1 : 0, next = new Map(hd), h = { ...(next.get(idx) || {}) };
        h[dir] = was ? 0 : 1;
        if (!h.fwd && !h.bck) next.delete(idx); else next.set(idx, h);
        WA.applyHalfDelta(st, idx, dir, was, !was); hd = next;
      }
      if (step % 50 === 0 || step === 1999) expect(view(st)).toEqual(reference(area, c.pat, sW, done, c.hs, hd));
    }
  });

  test('a mark reads only the cells it changed, whatever the area size', () => {
    const big = 300;
    const c = makeChart(big, big, 3);
    const { proxy, counter } = countingPattern(c.pat);
    const whole = { x0: 0, y0: 0, x1: big, y1: big };
    const st = WA.buildCounts(whole, proxy, big, c.done, c.hs, c.hd);
    expect(counter.reads).toBe(big * big);              // the one scan
    counter.reads = 0;
    let done = c.done;
    for (let i = 0; i < 100; i++) {
      const idx = (i * 977) % done.length, nd = new Uint8Array(done);
      const ch = [{ idx, oldVal: nd[idx] }]; nd[idx] = nd[idx] ? 0 : 1;
      WA.applyDoneDelta(st, ch, nd); done = nd;
    }
    expect(counter.reads).toBeLessThanOrEqual(100);
    expect(view(st)).toEqual(reference(whole, c.pat, big, done, c.hs, c.hd));
  });

  test('a delta replaces the colour objects it changes and leaves the rest shared', () => {
    const c = makeChart(sW, sH, 5);
    const st = WA.buildCounts(area, c.pat, sW, c.done, c.hs, c.hd);
    const before = st.colours, snapshot = JSON.parse(JSON.stringify(before));
    let idx = area.y0 * sW + area.x0; while (!/^\d+$/.test(c.pat[idx].id)) idx++;
    const nd = new Uint8Array(c.done); nd[idx] = nd[idx] ? 0 : 1;
    WA.applyDoneDelta(st, [{ idx, oldVal: c.done[idx] }], nd);
    expect(st.colours).not.toBe(before);
    expect(before).toEqual(snapshot);                   // what an earlier render saw is untouched
    const id = c.pat[idx].id;
    Object.keys(before).filter((k) => k !== id).forEach((k) => expect(st.colours[k]).toBe(before[k]));
    // Changes outside the area, or with no net change, leave the object alone.
    const same = st.colours, out = new Uint8Array(nd);
    WA.applyDoneDelta(st, [{ idx: 0, oldVal: out[0] }], out);
    expect(st.colours).toBe(same);
  });
});

/* ── Through the hook, the way tracker-app.js uses it ─────────────────────── */
function mountHook(pat, sW, hs) {
  const el = document.createElement('div'), root = createRoot(el);
  const h = { counts: null, st: null, root };
  function Harness({ done, hd, area, patArr, halfStitches }) {
    h.counts = window.useStitchCounts({ pat: patArr, done, halfStitches, halfDone: hd, sW });
    h.st = h.counts.areaCountsFor(area, done, hd);
    return null;
  }
  // `before` runs in the same batch as the render, as a tracker handler's
  // counter call and setDone do.
  h.render = (props, before) => act(() => { if (before) before(); root.render(React.createElement(Harness, { patArr: pat, halfStitches: hs, ...props })); });
  return h;
}
const builds = (h) => h.counts.areaCountsRef.builds || 0;

describe('useStitchCounts work-area counts', () => {
  const sW = 40, sH = 30;
  const area = { x0: 10, y0: 5, x1: 30, y1: 25 };

  test('marks, bulk, undo and redo update by delta with no rebuild, and match a recount', () => {
    const c = makeChart(sW, sH, 21);
    const h = mountHook(c.pat, sW, c.hs);
    let done = c.done;
    h.render({ done, hd: c.hd, area });
    const b0 = builds(h);
    const hist = [];
    const commit = (nd, changes) => { h.render({ done: nd, hd: c.hd, area }, () => h.counts.applyDoneCountsDelta(changes, c.pat, nd, done)); done = nd; };
    for (let i = 0; i < 40; i++) {                       // single taps inside and outside the area
      const idx = (i * 131) % done.length, nd = new Uint8Array(done), ch = [{ idx, oldVal: nd[idx] }];
      nd[idx] = nd[idx] ? 0 : 1; hist.push(ch); commit(nd, ch);
    }
    { const nd = new Uint8Array(done), ch = [];          // a bulk range across the area edge
      for (let i = 8 * sW; i < 12 * sW; i++) { ch.push({ idx: i, oldVal: nd[i] }); nd[i] = 1; }
      hist.push(ch); commit(nd, ch); }
    const redo = [];
    for (let k = 0; k < 5; k++) {                        // undo five steps
      const last = hist.pop(), nd = new Uint8Array(done), ch = last.map((x) => ({ idx: x.idx, oldVal: nd[x.idx] }));
      for (const x of last) nd[x.idx] = x.oldVal; redo.push(ch); commit(nd, ch);
    }
    for (let k = 0; k < 3; k++) {                        // redo three
      const last = redo.pop(), nd = new Uint8Array(done), ch = last.map((x) => ({ idx: x.idx, oldVal: nd[x.idx] }));
      for (const x of last) nd[x.idx] = x.oldVal; commit(nd, ch);
    }
    expect(builds(h)).toBe(b0);
    expect(view(h.st)).toEqual(reference(area, c.pat, sW, done, c.hs, c.hd));
    // The whole-pattern counter agrees with the same marks.
    expect(h.counts.doneCountRef.current).toBe(c.pat.reduce((n, m, i) => n + (/^__/.test(m.id) || !done[i] ? 0 : 1), 0));
    act(() => h.root.unmount());
  });

  test('half-stitch marks, one side or several into one map, update by delta (fractional weighting kept)', () => {
    const c = makeChart(sW, sH, 22);
    const h = mountHook(c.pat, sW, c.hs);
    let hd = c.hd;
    h.render({ done: c.done, hd, area });
    const b0 = builds(h);
    const inArea = [...c.hs.keys()].filter((i) => WA.containsIndex(area, i, sW));
    expect(inArea.length).toBeGreaterThan(3);
    // One side at a time (setHalfHistoryState).
    for (const idx of inArea.slice(0, 6)) {
      const dir = c.hs.get(idx).fwd ? 'fwd' : 'bck', was = (hd.get(idx) || {})[dir];
      const next = new Map(hd); next.set(idx, { ...(hd.get(idx) || {}), [dir]: was ? 0 : 1 });
      h.render({ done: c.done, hd: next, area }, () => h.counts.applyHalfDoneDelta(idx, dir, was, !was, c.hs, hd, next)); hd = next;
    }
    // Several sides into one new map (unpick).
    const next = new Map(hd);
    const sides = [];
    for (const idx of inArea.slice(6)) for (const dir of ['fwd', 'bck']) if (c.hs.get(idx)[dir]) sides.push([idx, dir]);
    for (const [idx, dir] of sides) { const v = { ...(next.get(idx) || {}) }; v[dir] = 0; next.set(idx, v); }
    h.render({ done: c.done, hd: next, area }, () => {
      for (const [idx, dir] of sides) h.counts.applyHalfDoneDelta(idx, dir, (hd.get(idx) || {})[dir], 0, c.hs, hd, next);
    });
    hd = next;
    expect(builds(h)).toBe(b0);
    expect(view(h.st)).toEqual(reference(area, c.pat, sW, c.done, c.hs, hd));
    expect(h.st.done % 0.5).toBe(0);
    act(() => h.root.unmount());
  });

  test('a mark reads only the changed cells of a large area (no rescan)', () => {
    const big = 250, c = makeChart(big, big, 4);
    const { proxy, counter } = countingPattern(c.pat);
    const whole = { x0: 0, y0: 0, x1: big, y1: big };
    const h = mountHook(proxy, big, c.hs);
    let done = c.done;
    h.render({ done, hd: c.hd, area: whole });
    counter.reads = 0;
    for (let i = 0; i < 50; i++) {
      const idx = (i * 7919) % done.length, nd = new Uint8Array(done), ch = [{ idx, oldVal: nd[idx] }];
      nd[idx] = nd[idx] ? 0 : 1;
      h.render({ done: nd, hd: c.hd, area: whole }, () => h.counts.applyDoneCountsDelta(ch, proxy, nd, done)); done = nd;
    }
    // applyDoneCountsDelta reads each changed cell once for the whole pattern and once for the area.
    expect(counter.reads).toBeLessThanOrEqual(100);
    expect(view(h.st)).toEqual(reference(whole, c.pat, big, done, c.hs, c.hd));
    act(() => h.root.unmount());
  });

  test('deliberate rebuilds: area switch, pattern edit, external replacement, unknown paths', () => {
    const c = makeChart(sW, sH, 23);
    const h = mountHook(c.pat, sW, c.hs);
    let done = c.done, hd = c.hd;
    h.render({ done, hd, area });
    let b = builds(h);
    const check = (a, p = c.pat, hs = c.hs) => expect(view(h.st)).toEqual(reference(a, p, sW, done, hs, hd));

    // Switching areas.
    const area2 = { x0: 0, y0: 0, x1: 20, y1: 10 };
    h.render({ done, hd, area: area2 }); expect(builds(h)).toBe(++b); check(area2);
    // Leaving the area: no counts, and deltas while off do nothing.
    h.render({ done, hd, area: null }); expect(h.st).toBeNull();
    { const nd = new Uint8Array(done); nd[0] = nd[0] ? 0 : 1; h.render({ done: nd, hd, area: null }, () => h.counts.applyDoneCountsDelta([{ idx: 0, oldVal: done[0] }], c.pat, nd, done)); done = nd; }
    h.render({ done, hd, area }); expect(builds(h)).toBe(++b); check(area);

    // Another tab's progress merged in (recomputeAllCounts, then new marks rendered).
    { const nd = new Uint8Array(done).map((v, i) => (i % 3 ? v : 1)), nhd = new Map();
      h.render({ done: nd, hd: nhd, area }, () => h.counts.recomputeAllCounts(c.pat, nd, c.hs, nhd)); done = nd; hd = nhd; }
    expect(builds(h)).toBe(++b); check(area);

    // A path that replaced the marks without telling the counters.
    done = new Uint8Array(done.length).fill(1);
    h.render({ done, hd, area }); expect(builds(h)).toBe(++b); check(area);

    // A delta without its starting marks: rebuilt on the next read, not trusted.
    { const idx = 12 * sW + 15, nd = new Uint8Array(done); nd[idx] = 0;
      h.render({ done: nd, hd, area }, () => h.counts.applyDoneCountsDelta([{ idx, oldVal: 1 }], c.pat, nd)); done = nd; }
    expect(builds(h)).toBe(++b); check(area);

    // A delta from marks the counts do not reflect (stale base): rebuilt.
    { const other = new Uint8Array(done), idx = 12 * sW + 16, nd = new Uint8Array(other); nd[idx] = 0;
      h.render({ done: nd, hd, area }, () => h.counts.applyDoneCountsDelta([{ idx, oldVal: 1 }], c.pat, nd, other)); done = nd; }
    expect(builds(h)).toBe(++b); check(area);

    // A half delta from a stale map: rebuilt.
    { const idx = [...c.hs.keys()].find((i) => WA.containsIndex(area, i, sW)), dir = c.hs.get(idx).fwd ? 'fwd' : 'bck';
      const stale = new Map(hd), next = new Map(hd); next.set(idx, { [dir]: 1 });
      h.render({ done, hd: next, area }, () => h.counts.applyHalfDoneDelta(idx, dir, 0, 1, c.hs, stale, next)); hd = next; }
    expect(builds(h)).toBe(++b); check(area);

    // A pattern edit (new pattern array; a cell emptied) and a half-stitch layout change.
    const pat2 = c.pat.slice(); pat2[12 * sW + 20] = { id: '__empty__' };
    h.render({ done, hd, area, patArr: pat2 }); check(area, pat2);
    const hs2 = new Map(c.hs); hs2.delete([...c.hs.keys()].find((i) => WA.containsIndex(area, i, sW)));
    h.render({ done, hd, area, patArr: pat2, halfStitches: hs2 }); check(area, pat2, hs2);
    act(() => h.root.unmount());
  });
});

describe('tracker-app.js wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
  test('the area counts come from the hook, not a rescan per mark', () => {
    expect(src).toMatch(/areaCountsFor\(workArea,doneRef\.current\|\|done,halfDoneRef\.current\|\|halfDone\)/);
    expect(src).not.toMatch(/countRect\(workArea\)/);
  });
  test('every mark path tells the counters which marks it started from', () => {
    const calls = (name) => src.split(name + '(').slice(1).map((s) => {
      let depth = 1, i = 0; for (; i < s.length && depth; i++) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; }
      const args = s.slice(0, i - 1); let n = 1, d = 0;
      for (const ch of args) { if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ',' && !d) n++; }
      return n;
    });
    const full = calls('applyDoneCountsDelta'), half = calls('applyHalfDoneDelta');
    expect(full.length).toBeGreaterThanOrEqual(8);
    expect(full.every((n) => n === 4)).toBe(true);
    expect(half.length).toBeGreaterThanOrEqual(2);
    expect(half.every((n) => n === 7)).toBe(true);
  });
});
