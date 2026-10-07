/* perfProbes.js — counters shared by the Phase 0 cost specs
   (reports/track-view-performance-plan.md).
   ═══════════════════════════════════════════════════════════════════════════
   One init script, installed before any app code runs, that counts the work
   the tracker does rather than timing it. Wall time on this harness varies
   4-5x between identical runs (mobile-experience-audit.md §H); these counts
   do not:

     elements    React.createElement calls — the element tree built per render,
                 i.e. how much of TrackerApp reconciled
     fills       CanvasRenderingContext2D.fillRect calls — chart paint work
     posts       Worker.postMessage calls, with the synchronous main-thread
                 time of each (that is the structured clone) and the message
                 type, so analysis posts can be told apart
     longTasks   Long Tasks API entries (Chromium only)
     events      Event Timing entries >= 16 ms (Chromium only) — input to
                 next paint; interactions() reduces them to one figure per
                 tap, the INP-style number

   The time-based figures are logged for context but specs assert only on the
   counts. */
const { SCROLLER_FN } = require('./deviceEmulation');

async function installProbes(page) {
  await page.addInitScript(() => {
    const P = window.__probe = { elements: 0, fills: 0, posts: [], longTasks: [], events: [], byType: {} };
    const install = () => {
      if (!window.React || window.__probeReact) return !!window.__probeReact;
      window.__probeReact = true;
      const orig = window.React.createElement;
      window.React.createElement = function (type) {
        P.elements++;
        const k = typeof type === 'string' ? type : (type && (type.displayName || type.name)) || 'anon';
        P.byType[k] = (P.byType[k] || 0) + 1;
        return orig.apply(this, arguments);
      };
      return true;
    };
    if (!install()) {
      const iv = setInterval(() => { if (install()) clearInterval(iv); }, 10);
      setTimeout(() => clearInterval(iv), 15000);
    }
    const proto = CanvasRenderingContext2D.prototype;
    const of = proto.fillRect;
    proto.fillRect = function () { P.fills++; return of.apply(this, arguments); };
    const wp = Worker.prototype;
    const op = wp.postMessage;
    wp.postMessage = function (msg) {
      const t0 = performance.now();
      try { return op.apply(this, arguments); }
      finally { P.posts.push({ t: t0, ms: performance.now() - t0, type: msg && msg.type }); }
    };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) P.longTasks.push({ t: e.startTime, d: e.duration }); })
        .observe({ type: 'longtask' });
    } catch (_) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) P.events.push({ name: e.name, d: e.duration, t: e.startTime, id: e.interactionId || 0 });
      }).observe({ type: 'event', durationThreshold: 16 });
    } catch (_) {}
  });
}

/** Zero every counter. Call after load has settled, so mount cost is excluded. */
function resetProbes(page) {
  return page.evaluate(() => {
    const P = window.__probe;
    P.elements = 0; P.fills = 0; P.posts = []; P.longTasks = []; P.events = []; P.byType = {};
  });
}

/** A copy of the counters, plus whether createElement was actually wrapped. */
function readProbes(page) {
  return page.evaluate(() => {
    const P = window.__probe;
    return {
      reactWrapped: !!window.__probeReact,
      elements: P.elements,
      fills: P.fills,
      posts: P.posts.slice(),
      longTasks: P.longTasks.slice(),
      events: P.events.slice(),
      topTypes: Object.entries(P.byType).sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  });
}

async function cpuThrottle(page, rate) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return cdp;
}

/** Bounding box of the chart's scrolling container. */
function chartBox(page) {
  return page.evaluate((fnSrc) => {
    const el = (new Function('return (' + fnSrc + ')()'))();
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, SCROLLER_FN.toString());
}

/** Total blocking time: the part of each long task beyond 50 ms. */
function tbt(longTasks) {
  return Math.round(longTasks.reduce((s, l) => s + Math.max(0, l.d - 50), 0));
}

/** Event Timing entries grouped into interactions (one tap = one id), each
 *  taking its slowest event — the same reduction INP uses. */
function interactions(events) {
  const by = new Map();
  for (const e of events) if (e.id) by.set(e.id, Math.max(by.get(e.id) || 0, e.d));
  return [...by.values()];
}

function stats(values) {
  if (!values.length) return { n: 0, max: 0, median: 0, total: 0 };
  const s = values.slice().sort((a, b) => a - b);
  const r = (n) => Math.round(n * 10) / 10;
  return { n: s.length, max: r(s[s.length - 1]), median: r(s[Math.floor(s.length / 2)]), total: r(s.reduce((a, b) => a + b, 0)) };
}

module.exports = { installProbes, resetProbes, readProbes, cpuThrottle, chartBox, tbt, stats, interactions };
