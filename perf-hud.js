/* perf-hud.js — opt-in performance readout for the Stitch Tracker.
   ═══════════════════════════════════════════════════════════════════════════
   Phase 0 of reports/track-view-performance-plan.md. The Playwright harness
   runs emulated engines on a desktop host and cannot see a real phone's or
   iPad's limits (mobile-freeze-large-patterns.md §8.3). This readout puts the
   same counters on the real device, with no remote devtools needed.

   Loaded only when the URL carries ?perf=1 — see the loader in stitch.html —
   so it costs nothing otherwise and is deliberately not in the SW precache.

   Every counter here works on iOS Safari. Long tasks and Event Timing do not
   exist there, so blocking time is derived from requestAnimationFrame gaps,
   which every engine has, and tap latency is timed directly from input to
   the frame after it. Where Long Tasks *is* available it is shown as well.

   Copy puts a JSON snapshot on the clipboard so results can be pasted into an
   issue or report verbatim. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__perfHud) return;

  var WINDOW_MS = 10000;      // rolling window for frame / blocking / posts
  var TAP_WINDOW_MS = 30000;  // rolling window for worst tap
  var HISTORY_S = 120;        // per-second history kept for Copy
  var now = function () { return performance.now(); };

  var c = { elements: 0, fills: 0 };
  var frames = [];   // {t, gap}
  var longTasks = []; // {t, d}
  var posts = [];    // {t, ms}
  var taps = [];     // {t, ms, type}
  var history = [];  // one entry per second
  var lastSec = { elements: 0, fills: 0 };

  // ── React reconcile proxy: element-tree size built per render ──────────
  // The compiled tracker calls React.createElement by property, so wrapping
  // it after load still counts every subsequent render. Same metric as
  // tests/mobile-audit/idle-render-cost.spec.js.
  function wrapReact() {
    var R = window.React;
    if (!R || !R.createElement) return false;
    if (R.__perfHudWrapped) return true;
    var orig = R.createElement;
    R.createElement = function () { c.elements++; return orig.apply(this, arguments); };
    R.__perfHudWrapped = true;
    return true;
  }
  if (!wrapReact()) {
    var tries = 0, iv = setInterval(function () { if (wrapReact() || ++tries > 300) clearInterval(iv); }, 50);
  }

  // ── Canvas fills ──────────────────────────────────────────────────────
  try {
    var proto = window.CanvasRenderingContext2D && window.CanvasRenderingContext2D.prototype;
    if (proto && !proto.__perfHudWrapped) {
      var of = proto.fillRect;
      proto.fillRect = function () { c.fills++; return of.apply(this, arguments); };
      proto.__perfHudWrapped = true;
    }
  } catch (_) {}

  // ── Worker postMessage: the synchronous structured-clone cost ─────────
  try {
    var wp = window.Worker && window.Worker.prototype;
    if (wp && !wp.__perfHudWrapped) {
      var op = wp.postMessage;
      wp.postMessage = function () {
        var t0 = now();
        try { return op.apply(this, arguments); }
        finally { var t1 = now(); posts.push({ t: t1, ms: t1 - t0 }); }
      };
      wp.__perfHudWrapped = true;
    }
  } catch (_) {}

  // ── Frames: gaps between animation frames ─────────────────────────────
  var lastFrame = 0;
  function onFrame(t) {
    if (lastFrame) frames.push({ t: t, gap: t - lastFrame });
    lastFrame = t;
    requestAnimationFrame(onFrame);
  }
  requestAnimationFrame(onFrame);
  // A hidden tab stops rAF; the first gap after returning is not jank.
  document.addEventListener('visibilitychange', function () { lastFrame = 0; });

  // ── Long tasks, where the engine has them (not Safari) ────────────────
  var hasLongTask = false;
  try {
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes &&
        PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0) {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { longTasks.push({ t: e.startTime + e.duration, d: e.duration }); });
      }).observe({ type: 'longtask', buffered: false });
      hasLongTask = true;
    }
  } catch (_) {}

  // ── Tap latency: input event to the frame after it ────────────────────
  // Scheduled from a capture listener, which runs before the app's handlers;
  // they run in the same task, so the frame measured is the one that shows
  // their result. setTimeout after rAF lands just after that frame's paint.
  function timeInput(e) {
    if (!e.isTrusted) return;
    var t0 = e.timeStamp && e.timeStamp > 0 && e.timeStamp < now() + 1 ? e.timeStamp : now();
    var type = e.type;
    requestAnimationFrame(function () {
      setTimeout(function () { taps.push({ t: now(), ms: now() - t0, type: type }); }, 0);
    });
  }
  ['pointerdown', 'pointerup', 'keydown'].forEach(function (type) {
    window.addEventListener(type, timeInput, { capture: true, passive: true });
  });

  // ── Aggregation ───────────────────────────────────────────────────────
  function prune(arr, keepMs) {
    var cut = now() - keepMs, i = 0;
    while (i < arr.length && arr[i].t < cut) i++;
    if (i) arr.splice(0, i);
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function summary() {
    var t = now();
    prune(frames, WINDOW_MS); prune(longTasks, WINDOW_MS); prune(posts, WINDOW_MS); prune(taps, TAP_WINDOW_MS);
    var lastS = frames.filter(function (f) { return f.t > t - 1000; });
    var worstFrame = 0, longFrames = 0, frameBlocking = 0;
    frames.forEach(function (f) {
      worstFrame = Math.max(worstFrame, f.gap);
      if (f.gap > 50) { longFrames++; frameBlocking += f.gap - 50; }
    });
    var postMs = 0, postWorst = 0;
    posts.forEach(function (p) { postMs += p.ms; postWorst = Math.max(postWorst, p.ms); });
    var tapWorst = 0, lastTap = taps.length ? taps[taps.length - 1] : null;
    taps.forEach(function (x) { tapWorst = Math.max(tapWorst, x.ms); });
    var tbt = 0;
    longTasks.forEach(function (l) { tbt += l.d - 50; });
    var heap = null;
    try { if (performance.memory) heap = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (_) {}
    var last = history.length ? history[history.length - 1] : { elements: 0, fills: 0 };
    return {
      fps: lastS.length,
      worstFrameMs: Math.round(worstFrame),
      longFrames10s: longFrames,
      frameBlockingMs10s: Math.round(frameBlocking),
      longTaskBlockingMs10s: hasLongTask ? Math.round(tbt) : null,
      elementsPerSec: last.elements,
      fillsPerSec: last.fills,
      workerPosts10s: posts.length,
      workerPostMs10s: round1(postMs),
      workerPostWorstMs: round1(postWorst),
      lastTapMs: lastTap ? Math.round(lastTap.ms) : null,
      worstTapMs30s: taps.length ? Math.round(tapWorst) : null,
      heapMB: heap,
    };
  }
  setInterval(function () {
    history.push({ t: Math.round(now()), elements: c.elements - lastSec.elements, fills: c.fills - lastSec.fills });
    lastSec = { elements: c.elements, fills: c.fills };
    if (history.length > HISTORY_S) history.shift();
    render();
  }, 1000);

  function device() {
    var n = navigator;
    return {
      userAgent: n.userAgent,
      dpr: window.devicePixelRatio || 1,
      deviceMemory: n.deviceMemory || null,
      cores: n.hardwareConcurrency || null,
      viewport: window.innerWidth + 'x' + window.innerHeight,
      reactWrapped: !!(window.React && window.React.__perfHudWrapped),
      longTaskApi: hasLongTask,
    };
  }
  function snapshot() {
    return {
      at: new Date().toISOString(),
      page: location.pathname,
      device: device(),
      now: summary(),
      perSecond: history.slice(),
      taps: taps.map(function (x) { return { type: x.type, ms: Math.round(x.ms) }; }),
      workerPosts: posts.map(function (p) { return round1(p.ms); }),
    };
  }
  function reset() {
    frames.length = 0; longTasks.length = 0; posts.length = 0; taps.length = 0; history.length = 0;
    lastFrame = 0;
    lastSec = { elements: c.elements, fills: c.fills };
    render();
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  var panel = null, body = null, collapsed = false;
  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }
  var BTN = 'font:inherit;font-size:11px;padding:3px 8px;border-radius:var(--radius-sm,6px);border:1px solid var(--border);' +
            'background:var(--surface-secondary);color:var(--text-primary);cursor:pointer;';
  function build() {
    if (panel || !document.body) return;
    panel = el('div',
      'position:fixed;left:8px;bottom:8px;z-index:2147483000;max-width:min(320px,calc(100vw - 16px));' +
      'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;' +
      'background:var(--surface);color:var(--text-primary);border:1px solid var(--border);' +
      'border-radius:var(--radius-md,8px);box-shadow:var(--shadow-md);padding:6px 8px;pointer-events:auto;');
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-label', 'Performance readout');
    panel.id = 'perf-hud';
    var head = el('div', 'display:flex;align-items:center;gap:6px;margin-bottom:4px;');
    head.appendChild(el('strong', 'flex:1;font-family:var(--font-ui,system-ui);font-size:11px;', 'Performance'));
    var copyBtn = el('button', BTN, 'Copy');
    copyBtn.type = 'button';
    copyBtn.onclick = function () { copy(copyBtn); };
    var resetBtn = el('button', BTN, 'Reset');
    resetBtn.type = 'button';
    resetBtn.onclick = reset;
    var foldBtn = el('button', BTN, 'Hide');
    foldBtn.type = 'button';
    foldBtn.onclick = function () { collapsed = !collapsed; foldBtn.textContent = collapsed ? 'Show' : 'Hide'; render(); };
    head.appendChild(copyBtn); head.appendChild(resetBtn); head.appendChild(foldBtn);
    panel.appendChild(head);
    body = el('div', 'white-space:pre;');
    panel.appendChild(body);
    document.body.appendChild(panel);
  }
  function row(label, value) { return (label + '                    ').slice(0, 18) + value + '\n'; }
  function render() {
    build();
    if (!body) return;
    body.style.display = collapsed ? 'none' : '';
    if (collapsed) return;
    var s = summary();
    body.textContent =
      row('Frames/s', s.fps) +
      row('Worst frame 10s', s.worstFrameMs + ' ms') +
      row('Long frames 10s', s.longFrames10s + ' (' + s.frameBlockingMs10s + ' ms over)') +
      (s.longTaskBlockingMs10s != null ? row('Long-task TBT 10s', s.longTaskBlockingMs10s + ' ms') : '') +
      row('React elements/s', s.elementsPerSec) +
      row('Canvas fills/s', s.fillsPerSec) +
      row('Worker posts 10s', s.workerPosts10s + ' (' + s.workerPostMs10s + ' ms, worst ' + s.workerPostWorstMs + ')') +
      row('Last tap', s.lastTapMs != null ? s.lastTapMs + ' ms' : '-') +
      row('Worst tap 30s', s.worstTapMs30s != null ? s.worstTapMs30s + ' ms' : '-') +
      (s.heapMB != null ? row('JS heap', s.heapMB + ' MB') : '');
  }
  function copy(btn) {
    var text = JSON.stringify(snapshot(), null, 2);
    var done = function (ok) {
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(text); done(true); });
    } else { fallback(text); done(true); }
  }
  // Clipboard API refused (e.g. not a secure context): show the text selected
  // in a box so it can be copied by hand.
  function fallback(text) {
    var ta = el('textarea', 'width:100%;height:160px;margin-top:6px;font:10px ui-monospace,monospace;' +
      'background:var(--surface-secondary);color:var(--text-primary);border:1px solid var(--border);');
    ta.readOnly = true;
    ta.value = text;
    panel.appendChild(ta);
    ta.focus(); ta.select();
  }

  window.__perfHud = { summary: summary, snapshot: snapshot, reset: reset, counters: c };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
