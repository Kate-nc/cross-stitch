/* trackProbes.js — Track Mode baseline counters (reports/track-mode-performance-baseline.md).
   ═══════════════════════════════════════════════════════════════════════════
   One init script, installed before any app code runs, that records what the
   tracker does and where its time goes, split the way the baseline report
   splits it:

     JavaScript   Long Animation Frame (LoAF) entries with their script
                  attribution (invoker, function, file and character), plus
                  Long Tasks. A CPU profile (track-baseline.cjs, opt-in) names
                  the functions inside each long frame.
     Rendering    the part of each long frame after renderStart (style,
                  layout, paint, commit), and chart paints by kind:
                    fullPaints     drawStitch over the whole tile, unclipped
                    partialPaints  drawStitch under a clip: a tapped stitch
                                   (repaintChartCells) or a strip after a
                                   tile move (shiftChartTile)
                    chartCopies    the chart canvas drawn onto itself (a tile
                                   move that kept its pixels)
                  Every drawStitch starts by filling the whole chart rect at
                  0,0 on the chart canvas (z-index 2), which is how a paint is
                  told apart from the fills inside it.
     React        commits, counted through a stub of the DevTools global hook
                  (react-dom calls onCommitFiberRoot once per commit), and
                  createElement calls (the size of each render).
     Storage      every IndexedDB put/add/delete/get/getAll with its
                  synchronous main-thread time (a put's structured clone runs
                  inside the call), transactions with their time to complete,
                  and localStorage writes.
     App spans    named calls into the app's modules (ProjectStorage.save,
                  saveProgress, TrackingSync.*, ThreadAccounting.*,
                  StashBridge.*, SyncEngine.*): synchronous time, and time to
                  settle for the async ones.
     Workers      postMessage synchronous time (structured clone) and the
                  round trip to the matching reply.

   Counts are deterministic. Times on this harness are emulated: headless
   Chromium draws canvases in software (SwiftShader), and phone runs use a CPU
   throttle. None of them is a physical-device measurement. */

/* The init script itself, as a plain function so the Jest suite can run it
   in jsdom (tests/trackProbes.test.js). Runs before any app code. */
function trackProbeInit() {
    if (window.__tp) return;
    const now = () => performance.now();
    const T = window.__tp = {
      commits: [], elements: 0, reactWrapped: false,
      fills: 0, fullPaints: [], partialPaints: [], chartCopies: 0, overlayCopies: 0,
      loafs: [], longTasks: [], events: [], frames: [],
      idb: [], tx: [], ls: [], spans: [], posts: [], replies: [],
    };

    // ── React commits: a DevTools hook stub. react-dom reads it at load. ──
    try {
      if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        let rid = 0;
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
          supportsFiber: true, isDisabled: false, renderers: new Map(),
          inject(r) { rid++; this.renderers.set(rid, r); return rid; },
          onCommitFiberRoot() { T.commits.push(now()); },
          onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {},
          checkDCE() {},
        };
      }
    } catch (_) {}
    const wrapReact = () => {
      if (!window.React || T.reactWrapped) return T.reactWrapped;
      const orig = window.React.createElement;
      window.React.createElement = function () { T.elements++; return orig.apply(this, arguments); };
      T.reactWrapped = true;
      return true;
    };
    if (!wrapReact()) { const iv = setInterval(() => { if (wrapReact()) clearInterval(iv); }, 10); setTimeout(() => clearInterval(iv), 30000); }

    // ── Canvas: paints by kind ────────────────────────────────────────────
    // jsdom (the Jest suite) has contexts but no CanvasRenderingContext2D global.
    const C2D = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype
      : Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
    const clipDepth = new WeakMap();   // ctx -> stack of "clipped" flags
    const stackOf = (ctx) => { let s = clipDepth.get(ctx); if (!s) { s = [false]; clipDepth.set(ctx, s); } return s; };
    const oSave = C2D.save, oRestore = C2D.restore, oClip = C2D.clip, oFill = C2D.fillRect, oDraw = C2D.drawImage;
    C2D.save = function () { const s = stackOf(this); s.push(s[s.length - 1]); return oSave.apply(this, arguments); };
    C2D.restore = function () { const s = stackOf(this); if (s.length > 1) s.pop(); return oRestore.apply(this, arguments); };
    C2D.clip = function () { const s = stackOf(this); s[s.length - 1] = true; return oClip.apply(this, arguments); };
    C2D.fillRect = function (x, y, w, h) {
      T.fills++;
      const cv = this.canvas;
      if (x === 0 && y === 0 && cv && cv.style && cv.style.zIndex === '2') {
        const tw = parseFloat(cv.style.width) || 0, th = parseFloat(cv.style.height) || 0;
        if (w >= tw - 1 && h >= th - 1 && tw > 0) {
          const s = stackOf(this);
          (s[s.length - 1] ? T.partialPaints : T.fullPaints).push(now());
        }
      }
      return oFill.apply(this, arguments);
    };
    C2D.drawImage = function (src) {
      if (src === this.canvas) { if (this.canvas.style.zIndex === '2') T.chartCopies++; else T.overlayCopies++; }
      return oDraw.apply(this, arguments);
    };

    // ── Storage ───────────────────────────────────────────────────────────
    try {
      const S = IDBObjectStore.prototype;
      for (const op of ['put', 'add', 'delete', 'get', 'getAll', 'clear']) {
        const o = S[op];
        if (typeof o !== 'function') continue;
        S[op] = function () {
          const t = now();
          try { return o.apply(this, arguments); }
          finally { T.idb.push({ op, store: this.name, t, ms: now() - t }); }
        };
      }
      const oTx = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (stores, mode) {
        const tx = oTx.apply(this, arguments);
        if (mode === 'readwrite') {
          const rec = { db: this.name, stores: [].concat(stores).join(','), t: now(), done: null, ok: null };
          T.tx.push(rec);
          tx.addEventListener('complete', () => { rec.done = now(); rec.ok = true; });
          tx.addEventListener('abort', () => { rec.done = now(); rec.ok = false; });
          tx.addEventListener('error', () => { rec.done = now(); rec.ok = false; });
        }
        return tx;
      };
    } catch (_) {}
    try {
      const L = Storage.prototype, oSet = L.setItem;
      L.setItem = function (k, v) {
        const t = now();
        try { return oSet.apply(this, arguments); }
        finally { if (this === window.localStorage) T.ls.push({ k: String(k).replace(/_proj_\w+$/, '_proj_*'), t, ms: now() - t, chars: String(v).length }); }
      };
    } catch (_) {}

    // ── App spans: wrap module methods once they exist ────────────────────
    const SPANS = {
      ProjectStorage: ['save', 'saveChecked', 'saveProgress', 'get', 'listProjects', 'saveSessionCheckpoint', 'refreshProgressRows'],
      TrackingSync: ['record', 'recordDelta', 'withDelta', 'deltaFrom', 'merge', 'records'],
      ThreadAccounting: ['snapshot', 'apply', 'totals', 'compact', 'live'],
      StashBridge: ['applyConsumptionEvents', 'syncProjectToLibrary', 'getGlobalStash', 'getAllPatterns'],
      SyncEngine: ['exportSync', 'exportToFolder', 'compress', 'prepareImport'],
      PatternIO: ['serializePattern'],
      CrossTabCoord: ['noteWrite', 'checkConflict'],
    };
    const wrapped = new Set();
    const wrapSpans = () => {
      for (const mod of Object.keys(SPANS)) {
        const M = window[mod];
        if (!M || typeof M !== 'object') continue;
        for (const fn of SPANS[mod]) {
          const key = mod + '.' + fn;
          if (wrapped.has(key) || typeof M[fn] !== 'function') continue;
          wrapped.add(key);
          const o = M[fn];
          try {
            M[fn] = function () {
              const t = now();
              const rec = { name: key, t, ms: 0, settled: null };
              T.spans.push(rec);
              let r;
              try { r = o.apply(this, arguments); }
              finally { rec.ms = now() - t; }
              if (r && typeof r.then === 'function') {
                r.then(() => { rec.settled = now() - t; }, () => { rec.settled = now() - t; rec.failed = true; });
              }
              return r;
            };
          } catch (_) {}
        }
      }
      return wrapped.size;
    };
    const ivs = setInterval(wrapSpans, 25);
    setTimeout(() => clearInterval(ivs), 30000);
    window.__tpWrapSpans = wrapSpans;

    // ── Workers ───────────────────────────────────────────────────────────
    try {
      const W = window.Worker;
      const oPost = W.prototype.postMessage;
      W.prototype.postMessage = function (msg) {
        const t = now();
        try { return oPost.apply(this, arguments); }
        finally { T.posts.push({ t, ms: now() - t, type: msg && msg.type, url: this.__tpUrl || '' }); }
      };
      window.Worker = class extends W {
        constructor(url, opts) {
          super(url, opts);
          this.__tpUrl = String(url).split('/').pop();
          this.addEventListener('message', (e) => T.replies.push({ t: now(), type: e.data && e.data.type, url: this.__tpUrl }));
        }
      };
    } catch (_) {}

    // ── Frames, long tasks, LoAF, Event Timing ────────────────────────────
    let last = 0;
    const onFrame = (t) => { if (last) T.frames.push([t, t - last]); last = t; requestAnimationFrame(onFrame); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(onFrame);
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) T.longTasks.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.duration < 50) continue;
          T.loafs.push({
            t: e.startTime, d: e.duration, blocking: e.blockingDuration,
            renderStart: e.renderStart, styleStart: e.styleAndLayoutStart,
            scripts: (e.scripts || []).map((s) => ({
              t: s.startTime, d: s.duration, invoker: s.invoker, type: s.invokerType,
              fn: s.sourceFunctionName, url: (s.sourceURL || '').replace(/^https?:\/\/[^/]+\//, ''),
              ch: s.sourceCharPosition, layout: s.forcedStyleAndLayoutDuration,
            })),
          });
        }
      }).observe({ type: 'long-animation-frame', buffered: true });
    } catch (_) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.interactionId) T.events.push({ id: e.interactionId, name: e.name, t: e.startTime, d: e.duration, ps: e.processingStart, pe: e.processingEnd });
      }).observe({ type: 'event', durationThreshold: 16 });
    } catch (_) {}

    // A recognisable busy loop, so a CPU profile can be aligned to page time.
    window.__tpAnchor = function __tpAnchor(ms) { const t = now(); let x = 0; while (now() - t < ms) x += Math.sqrt(x + 1); return t; };
}

async function installTrackProbes(page) {
  await page.addInitScript(trackProbeInit);
}

/** Copy of every record at or after page time `since` (ms). */
function readTrackProbes(page, since = 0) {
  return page.evaluate((s) => {
    const T = window.__tp;
    const f = (a) => a.filter((r) => (typeof r === 'number' ? r : Array.isArray(r) ? r[0] : r.t) >= s);
    return {
      now: performance.now(), reactWrapped: T.reactWrapped, elements: T.elements,
      commits: f(T.commits), fullPaints: f(T.fullPaints), partialPaints: f(T.partialPaints),
      fills: T.fills, chartCopies: T.chartCopies, overlayCopies: T.overlayCopies,
      loafs: f(T.loafs), longTasks: f(T.longTasks), events: f(T.events), frames: f(T.frames),
      idb: f(T.idb), tx: f(T.tx), ls: f(T.ls), spans: f(T.spans), posts: f(T.posts), replies: f(T.replies),
    };
  }, since);
}

/* ── Reductions (node side) ─────────────────────────────────────────────── */

function pct(values, p) {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
}
function dist(values) {
  if (!values.length) return { n: 0 };
  return { n: values.length, p50: pct(values, 50), p75: pct(values, 75), p95: pct(values, 95), max: Math.round(Math.max(...values)) };
}

/** One record per interaction (Event Timing): the INP-style duration (slowest
 *  event), the input delay of its first event, the time its handlers ran, and
 *  what was left until the next paint. */
function interactionsOf(events) {
  const by = new Map();
  for (const e of events) {
    const r = by.get(e.id) || { t: e.t, d: 0, delay: Infinity, run: 0, names: new Set() };
    r.t = Math.min(r.t, e.t); r.d = Math.max(r.d, e.d);
    r.delay = Math.min(r.delay, e.ps - e.t); r.run = Math.max(r.run, e.pe - e.ps); r.names.add(e.name);
    by.set(e.id, r);
  }
  return [...by.values()].map((r) => ({ t: Math.round(r.t), d: Math.round(r.d), delay: Math.round(r.delay), run: Math.round(r.run), presentation: Math.max(0, Math.round(r.d - r.delay - r.run)), names: [...r.names].join('+') }));
}

function sum(a, f) { return a.reduce((s, x) => s + f(x), 0); }
const r1 = (n) => Math.round(n * 10) / 10;

/** Group spans by name: count, total synchronous ms, total settle ms, max. */
function spansByName(spans) {
  const out = {};
  for (const s of spans) {
    const o = out[s.name] || (out[s.name] = { n: 0, syncMs: 0, maxSyncMs: 0, settleMs: 0, maxSettleMs: 0 });
    o.n++; o.syncMs += s.ms; o.maxSyncMs = Math.max(o.maxSyncMs, s.ms);
    if (s.settled != null) { o.settleMs += s.settled; o.maxSettleMs = Math.max(o.maxSettleMs, s.settled); }
  }
  for (const k of Object.keys(out)) for (const f of ['syncMs', 'maxSyncMs', 'settleMs', 'maxSettleMs']) out[k][f] = r1(out[k][f]);
  return out;
}

function storageSummary(idb, tx, ls) {
  const byStore = {};
  for (const e of idb) {
    const k = e.store + '.' + e.op;
    const o = byStore[k] || (byStore[k] = { n: 0, ms: 0, maxMs: 0 });
    o.n++; o.ms += e.ms; o.maxMs = Math.max(o.maxMs, e.ms);
  }
  for (const k of Object.keys(byStore)) { byStore[k].ms = r1(byStore[k].ms); byStore[k].maxMs = r1(byStore[k].maxMs); }
  const done = tx.filter((t) => t.done != null);
  return {
    mainThreadMs: r1(sum(idb, (e) => e.ms) + sum(ls, (e) => e.ms)),
    byStore,
    writeTx: tx.length,
    writeTxMs: dist(done.map((t) => t.done - t.t)),
    writeTxByStore: tx.reduce((o, t) => { o[t.stores] = (o[t.stores] || 0) + 1; return o; }, {}),
    localStorageWrites: ls.length,
    localStorageChars: sum(ls, (e) => e.chars),
  };
}

function workerSummary(posts, replies) {
  const byType = {};
  for (const p of posts) {
    const o = byType[p.type || '?'] || (byType[p.type || '?'] = { n: 0, ms: 0, maxMs: 0, rtt: [] });
    o.n++; o.ms += p.ms; o.maxMs = Math.max(o.maxMs, p.ms);
    const reply = replies.find((r) => r.url === p.url && r.t >= p.t);
    if (reply) o.rtt.push(reply.t - p.t);
  }
  for (const k of Object.keys(byType)) { const o = byType[k]; o.ms = r1(o.ms); o.maxMs = r1(o.maxMs); o.rtt = dist(o.rtt); }
  return byType;
}

/** Split long animation frames into script, forced layout and rendering
 *  time, and name the scripts in the longest ones. */
function framesSummary(loafs, top = 6, lineOf) {
  let script = 0, render = 0, forced = 0;
  for (const f of loafs) {
    script += sum(f.scripts, (s) => s.d);
    forced += sum(f.scripts, (s) => s.layout || 0);
    if (f.renderStart > 0) render += Math.max(0, f.t + f.d - f.renderStart);
  }
  const longest = loafs.slice().sort((a, b) => b.d - a.d).slice(0, top).map((f) => ({
    t: Math.round(f.t), d: Math.round(f.d), blocking: Math.round(f.blocking || 0),
    renderMs: f.renderStart > 0 ? Math.round(f.t + f.d - f.renderStart) : 0,
    scripts: f.scripts.slice().sort((a, b) => b.d - a.d).slice(0, 4).map((s) => ({
      d: Math.round(s.d), invoker: s.invoker, type: s.type, fn: s.fn || '',
      at: s.url ? s.url + (lineOf ? ':' + lineOf(s.url, s.ch) : '@' + s.ch) : '',
    })),
  }));
  return { count: loafs.length, scriptMs: Math.round(script), forcedLayoutMs: Math.round(forced), renderMs: Math.round(render), totalMs: Math.round(sum(loafs, (f) => f.d)), longest };
}

/** Everything a scenario window reports, from readTrackProbes output. */
function summarise(r, { lineOf, t0 = 0, t1 = Infinity } = {}) {
  const inWin = (t) => t >= t0 && t <= t1;
  const pick = (a) => a.filter((x) => inWin(typeof x === 'number' ? x : Array.isArray(x) ? x[0] : x.t));
  const ev = interactionsOf(pick(r.events));
  const lt = pick(r.longTasks);
  const frames = pick(r.frames).map((f) => f[1]);
  return {
    interactions: { ...dist(ev.map((e) => e.d)), inputDelay: dist(ev.map((e) => e.delay)), handler: dist(ev.map((e) => e.run)), presentation: dist(ev.map((e) => e.presentation)), samples: ev.map((e) => e.d) },
    longTasks: { n: lt.length, tbtMs: Math.round(sum(lt, (l) => Math.max(0, l.d - 50))), longestMs: Math.round(Math.max(0, ...lt.map((l) => l.d))), top: lt.map((l) => Math.round(l.d)).sort((a, b) => b - a).slice(0, 5) },
    frames: { n: frames.length, over50: frames.filter((g) => g > 50).length, over100: frames.filter((g) => g > 100).length, worstMs: Math.round(Math.max(0, ...frames)) },
    react: { commits: pick(r.commits).length },
    paints: { full: pick(r.fullPaints).length, partial: pick(r.partialPaints).length },
    loaf: framesSummary(pick(r.loafs), 6, lineOf),
    storage: storageSummary(pick(r.idb), pick(r.tx), pick(r.ls)),
    spans: spansByName(pick(r.spans)),
    workers: workerSummary(pick(r.posts), pick(r.replies)),
  };
}

module.exports = { trackProbeInit, installTrackProbes, readTrackProbes, summarise, interactionsOf, dist, pct, spansByName, storageSummary, workerSummary, framesSummary };
