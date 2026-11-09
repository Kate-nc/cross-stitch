/**
 * @jest-environment jsdom
 */
/* The Track Mode baseline counters (tests/_helpers/trackProbes.js) measure
   what reports/track-mode-performance-baseline.md says they measure.
   The browser specs and tests/perf/track-baseline.cjs assert on these counts
   (paints per tap, React commits, saves), so a probe that silently counted
   the wrong thing would make every budget meaningless. Runs the init script
   in jsdom, with node-canvas behind <canvas> and fake-indexeddb behind
   IndexedDB. */
global.structuredClone = global.structuredClone || ((v) => require('v8').deserialize(require('v8').serialize(v)));
require('fake-indexeddb/auto');
const { trackProbeInit, interactionsOf, dist, framesSummary, summarise, storageSummary, workerSummary } = require('./_helpers/trackProbes');

beforeAll(() => { trackProbeInit(); });

function chartCanvas(w, h, z) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.style.zIndex = z;
  document.body.appendChild(cv);
  return cv;
}

describe('chart paints', () => {
  test('a whole-chart fill on the chart canvas is a full paint, under a clip a partial one', () => {
    const T = window.__tp;
    const ctx = chartCanvas(800, 600, '2').getContext('2d');
    const full0 = T.fullPaints.length, part0 = T.partialPaints.length;
    ctx.fillRect(0, 0, 2000, 2400);                 // renderStitch: drawStitch over the tile
    ctx.save(); ctx.beginPath(); ctx.rect(40, 40, 20, 20); ctx.clip();
    ctx.fillRect(0, 0, 2000, 2400);                 // repaintChartCells / a strip: clipped
    ctx.save(); ctx.fillRect(0, 0, 2000, 2400); ctx.restore();   // nested save keeps the clip
    ctx.restore();
    ctx.fillRect(0, 0, 2000, 2400);                 // clip popped: full again
    expect(T.fullPaints.length - full0).toBe(2);
    expect(T.partialPaints.length - part0).toBe(2);
  });

  test('cell fills, other canvases and fills smaller than the tile are not paints', () => {
    const T = window.__tp;
    const full0 = T.fullPaints.length, part0 = T.partialPaints.length, fills0 = T.fills;
    const chart = chartCanvas(800, 600, '2').getContext('2d');
    chart.fillRect(0, 0, 20, 20);                   // the first cell
    chart.fillRect(20, 0, 2000, 2000);              // not at the origin
    chartCanvas(800, 600, '3').getContext('2d').fillRect(0, 0, 2000, 2000);   // an overlay
    expect(T.fullPaints.length - full0).toBe(0);
    expect(T.partialPaints.length - part0).toBe(0);
    expect(T.fills - fills0).toBe(3);
  });

  test('a canvas drawn onto itself is a kept tile move, per canvas kind', () => {
    const T = window.__tp;
    const c0 = T.chartCopies, o0 = T.overlayCopies;
    const chart = chartCanvas(100, 100, '2'), overlay = chartCanvas(100, 100, '3');
    // jsdom gives each context its own drawImage (browsers keep it on the
    // prototype, where the probe is), so call the prototype's directly.
    const draw = (ctx, src) => { try { Object.getPrototypeOf(ctx).drawImage.call(ctx, src, 0, 0); } catch (_) { /* jsdom cannot draw its own element */ } };
    draw(chart.getContext('2d'), chart);
    draw(overlay.getContext('2d'), overlay);
    draw(chart.getContext('2d'), overlay);          // another canvas: not a move
    expect(T.chartCopies - c0).toBe(1);
    expect(T.overlayCopies - o0).toBe(1);
  });
});

describe('React commits', () => {
  test('every commit react-dom reports through the DevTools hook is counted', () => {
    const T = window.__tp;
    // Loaded after the init script, as on the page, so react-dom finds the hook.
    const React = require('react'), ReactDOM = require('react-dom'), { createRoot } = require('react-dom/client');
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    const n0 = T.commits.length;
    ReactDOM.flushSync(() => root.render(React.createElement('p', null, 'a')));
    ReactDOM.flushSync(() => root.render(React.createElement('p', null, 'b')));
    ReactDOM.flushSync(() => root.render(React.createElement('p', null, 'b')));   // same output still commits
    expect(T.commits.length - n0).toBe(3);
    root.unmount();
  });
});

describe('storage', () => {
  test('puts and gets are recorded with their store, and a write transaction with its completion', async () => {
    const T = window.__tp;
    const i0 = T.idb.length, t0 = T.tx.length;
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('probe_test', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('projects');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    await new Promise((res) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ a: 1 }, 'k'); tx.oncomplete = res; });
    await new Promise((res) => { const tx = db.transaction('projects', 'readonly'); const rq = tx.objectStore('projects').get('k'); rq.onsuccess = res; });
    db.close();
    const ops = T.idb.slice(i0).map((e) => e.store + '.' + e.op);
    expect(ops).toEqual(['projects.put', 'projects.get']);
    const tx = T.tx.slice(t0);
    expect(tx).toHaveLength(1);                     // read-only transactions are not writes
    expect(tx[0].ok).toBe(true);
    expect(tx[0].done).toBeGreaterThanOrEqual(tx[0].t);
    const s = storageSummary(T.idb.slice(i0), tx, []);
    expect(s.byStore['projects.put'].n).toBe(1);
    expect(s.writeTx).toBe(1);
  });

  test('localStorage writes are counted with their size, project ids folded', () => {
    const T = window.__tp;
    const l0 = T.ls.length;
    localStorage.setItem('cs_nav_proj_123', 'x'.repeat(40));
    expect(T.ls.slice(l0)).toEqual([expect.objectContaining({ k: 'cs_nav_proj_*', chars: 40 })]);
  });
});

describe('app spans', () => {
  test('a module method is wrapped once it exists, with its sync time and when it settles', async () => {
    const T = window.__tp;
    let release;
    window.ProjectStorage = { saveProgress: () => new Promise((r) => { release = r; }), get: () => 1 };
    window.__tpWrapSpans();
    window.__tpWrapSpans();                          // idempotent
    const s0 = T.spans.length;
    const p = window.ProjectStorage.saveProgress('id', {});
    expect(window.ProjectStorage.get()).toBe(1);     // the original result is passed through
    const rec = T.spans[s0];
    expect(rec.name).toBe('ProjectStorage.saveProgress');
    expect(rec.settled).toBeNull();
    release(); await p; await Promise.resolve();
    expect(rec.settled).not.toBeNull();
    expect(T.spans.slice(s0).map((s) => s.name)).toEqual(['ProjectStorage.saveProgress', 'ProjectStorage.get']);
  });
});

describe('reductions', () => {
  test('Event Timing entries become one interaction each, split into delay, handlers and presentation', () => {
    const ev = interactionsOf([
      { id: 1, name: 'pointerdown', t: 100, d: 40, ps: 110, pe: 115 },
      { id: 1, name: 'pointerup', t: 120, d: 96, ps: 150, pe: 190 },
      { id: 2, name: 'keydown', t: 500, d: 24, ps: 502, pe: 510 },
    ]);
    expect(ev).toEqual([
      { t: 100, d: 96, delay: 10, run: 40, presentation: 46, names: 'pointerdown+pointerup' },
      { t: 500, d: 24, delay: 2, run: 8, presentation: 14, names: 'keydown' },
    ]);
  });

  test('percentiles are nearest-rank, so p95 of 20 samples is the 19th', () => {
    const v = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(dist(v)).toEqual({ n: 20, p50: 100, p75: 150, p95: 190, max: 200 });
    expect(dist([])).toEqual({ n: 0 });
  });

  test('long frames split into script and rendering, longest first with their callers', () => {
    const f = framesSummary([
      { t: 0, d: 80, blocking: 30, renderStart: 70, scripts: [{ d: 60, invoker: 'TimerHandler:setTimeout', fn: 'save', url: 'a.js', ch: 0 }] },
      { t: 200, d: 300, blocking: 250, renderStart: 0, scripts: [{ d: 290, invoker: 'IDBRequest.onsuccess', fn: 'finish', url: 'b.js', ch: 3, layout: 5 }] },
    ], 6, () => 7);
    expect(f).toMatchObject({ count: 2, scriptMs: 350, renderMs: 10, forcedLayoutMs: 5, totalMs: 380 });
    expect(f.longest[0]).toMatchObject({ d: 300, scripts: [{ fn: 'finish', invoker: 'IDBRequest.onsuccess', at: 'b.js:7' }] });
  });

  test('a summary covers only its window', () => {
    const r = {
      events: [{ id: 1, name: 'pointerup', t: 50, d: 300, ps: 60, pe: 70 }, { id: 2, name: 'pointerup', t: 1500, d: 40, ps: 1505, pe: 1510 }],
      longTasks: [{ t: 10, d: 400 }, { t: 1200, d: 120 }], frames: [[1100, 16], [1200, 130]],
      commits: [5, 1100, 1300], fullPaints: [20], partialPaints: [1501],
      loafs: [], idb: [], tx: [], ls: [], spans: [], posts: [{ t: 1300, ms: 0.5, type: 'analyse', url: 'w.js' }], replies: [{ t: 1340, type: 'result', url: 'w.js' }],
    };
    const s = summarise(r, { t0: 1000, t1: 2000 });
    expect(s.interactions).toMatchObject({ n: 1, max: 40 });
    expect(s.longTasks).toMatchObject({ n: 1, tbtMs: 70, longestMs: 120 });
    expect(s.frames).toMatchObject({ n: 2, over50: 1, over100: 1, worstMs: 130 });
    expect(s.react.commits).toBe(2);
    expect(s.paints).toEqual({ full: 0, partial: 1 });
    expect(s.workers.analyse).toMatchObject({ n: 1, rtt: { n: 1, max: 40 } });
  });

  test('a worker post without a reply has no round trip', () => {
    expect(workerSummary([{ t: 0, ms: 1, type: 'setPattern', url: 'w.js' }], []).setPattern.rtt).toEqual({ n: 0 });
  });
});
