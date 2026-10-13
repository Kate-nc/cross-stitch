/* tracker-minimap.js — Phase 5 (TRACK-09): an overview of the whole pattern in the Tracker.
   ════════════════════════════════════════════════════════════════════════════
   One small canvas, at most MAX_SIDE pixels on its longer side. A pixel is the average of a block of cells: done cells in
   their thread colour, not-done cells faded (the same two looks the chart draws, so "done is full colour, not done is faded" reads the same at
   every zoom). The viewport is a rectangle moved by direct style writes; tapping or dragging the map scrolls the chart.

   Cost rules (the Tracker's drawing speed must not change):
     • built once per pattern, in idle slices, and only once it is first shown (a pattern that fits the screen never builds);
     • a mark touches only the blocks it falls in (api.cellsChanged), never the whole pattern;
     • a `done` change that did not come through cellsChanged (load, undo of an edit, cross-tab merge) is one idle rebuild;
     • the canvas and its pixel buffer are dropped when the pattern changes or the map unmounts.

   Loaded as a plain <script> before tracker-app.js. Exposes window.TrackerMinimap (a React component) and
   window.__minimapCore (pure helpers, for tests).
*/
(function () {
  'use strict';

  var MAX_SIDE = 200;          // longest side of the offscreen canvas, in pixels
  var DISPLAY_SIDE = 132;      // longest side as shown, in CSS pixels
  var FABRIC = [244, 241, 234];
  var SLICE_MS = 6;            // budget for one idle slice

  // ── Pure core ──────────────────────────────────────────────────────────────────────────────────────────────────
  function blockSize(sW, sH) { return Math.max(1, Math.ceil(Math.max(sW, sH) / MAX_SIDE)); }

  // [doneR,doneG,doneB, pendR,pendG,pendB] for a thread colour, cached by packed RGB.
  var _numCache = new Map();
  function parse(fill) { var m = fill.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  function looksOf(rgb) {
    var key = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
    var hit = _numCache.get(key);
    if (hit) return hit;
    var d = parse(window.doneStitchLook(rgb).fill), p = parse(window.pendingStitchLook(rgb, 0.5).fill);
    hit = [d[0], d[1], d[2], p[0], p[1], p[2]];
    if (_numCache.size > 4000) _numCache.clear();
    _numCache.set(key, hit);
    return hit;
  }

  // The colour of one block, written into out[o..o+2]. Cells that are not stitches show the fabric.
  function blockColour(pat, cmap, done, sW, sH, bs, bx, by, out, o) {
    var x0 = bx * bs, y0 = by * bs, x1 = Math.min(sW, x0 + bs), y1 = Math.min(sH, y0 + bs);
    var r = 0, g = 0, b = 0, n = 0;
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var i = y * sW + x, cell = pat[i];
        if (!cell) continue;
        if (cell.id === '__skip__' || cell.id === '__empty__') continue;
        // The cell's own RGB first, as the chart does: two brands share ids (DMC 310 is black, Anchor 310 is tan).
        var rgb = cell.rgb || (cmap[cell.id] && cmap[cell.id].rgb);
        if (!rgb) continue;
        var l = looksOf(rgb), k = done && done[i] ? 0 : 3;
        r += l[k]; g += l[k + 1]; b += l[k + 2]; n++;
      }
    }
    if (!n) { out[o] = FABRIC[0]; out[o + 1] = FABRIC[1]; out[o + 2] = FABRIC[2]; }
    else { out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); }
    out[o + 3] = 255;
  }

  // ── Component ──────────────────────────────────────────────────────────────────────────────────────────────────
  var idle = typeof window.requestIdleCallback === 'function'
    ? function (fn) { return window.requestIdleCallback(fn, { timeout: 200 }); }
    : function (fn) { return setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 16); };
  var cancelIdle = typeof window.cancelIdleCallback === 'function' ? function (h) { window.cancelIdleCallback(h); } : function (h) { clearTimeout(h); };

  /* props:
       pat, cmap, sW, sH, done   the pattern and its progress
       scrollRef                 the chart's scroll box (scroll and resize drive the viewport rectangle)
       getView()                 → {x0,y0,x1,y1} in cells: what the chart is showing
       onJump(cx, cy)            centre the chart on this cell
       viewKey                   changes when zoom or layout does (re-measures the rectangle)
       collapsed                 closed behind a small button (phone Focus mode); onOpen opens it
       side                      'left' | 'right': the corner of the chart box it sits in (opposite the tool rail)
       apiRef                    receives { cellsChanged(changes, nd) }
       label                     accessible name                                                                    */
  function TrackerMinimap(props) {
    var React = window.React, h = React.createElement;
    var pat = props.pat, cmap = props.cmap, sW = props.sW, sH = props.sH, done = props.done;
    var st = React.useRef(null);
    if (!st.current) st.current = { canvas: null, img: null, mw: 0, mh: 0, bs: 1, built: false, building: 0, token: 0, dirty: null, latestDone: null, seenDone: null, shown: false, dragging: false };
    var s = st.current;
    var canvasRef = React.useRef(null), boxRef = React.useRef(null), rectRef = React.useRef(null), btnRef = React.useRef(null);
    var shownState = React.useState(false), shown = shownState[0], setShown = shownState[1];
    // A render that the memo let through brings a new `done` prop; a local render (setShown) re-reads the props it last saw,
    // which are older than what cellsChanged was told, so it must not overwrite them.
    if (s.propDone !== done) { s.propDone = done; s.latestDone = done; }

    var bs = blockSize(sW, sH), mw = Math.ceil(sW / bs), mh = Math.ceil(sH / bs);
    var narrow = typeof window.innerWidth === 'number' && window.innerWidth < 600;
    var scale = (narrow ? 96 : DISPLAY_SIDE) / Math.max(mw, mh);
    var dispW = Math.max(1, Math.round(mw * scale)), dispH = Math.max(1, Math.round(mh * scale));

    // Sit in a bottom corner of the chart box, clear of its scrollbars and (by `side`) of the tool rail. Measures the page, so it
    // runs on resize and layout changes, never per scroll frame.
    var place = React.useCallback(function () {
      var box = boxRef.current, sc = props.scrollRef && props.scrollRef.current, col = box && box.parentElement;   // the chart column, which is positioned (offsetParent is null while hidden)
      if (!box || !sc || !col) return;
      var a = sc.getBoundingClientRect(), b = col.getBoundingClientRect(), edge = 40, lift = 22;
      var left = props.side === 'right' ? a.right - b.left - dispW - 22 : a.left - b.left + edge;
      [box, btnRef.current].forEach(function (n) { if (n) { n.style.left = left.toFixed(0) + 'px'; n.style.top = (a.bottom - b.top - (n === box ? dispH : 44) - lift).toFixed(0) + 'px'; } });
    }, [props.scrollRef, props.side, dispW, dispH]);

    // The viewport rectangle (and whether the map is worth showing: only when the chart is bigger than its box).
    var updateRect = React.useCallback(function () {
      var v = props.getView && props.getView();
      var el = rectRef.current, box = boxRef.current;
      if (!v || !el || !box) return;
      var covers = v.x0 <= 0.5 && v.y0 <= 0.5 && v.x1 >= sW - 0.5 && v.y1 >= sH - 0.5;
      if (covers === s.shown) { s.shown = !covers; setShown(!covers); }
      var l = Math.max(0, v.x0) / sW * dispW, t = Math.max(0, v.y0) / sH * dispH;
      var r = Math.min(sW, v.x1) / sW * dispW, b = Math.min(sH, v.y1) / sH * dispH;
      var w = Math.max(3, r - l).toFixed(1) + 'px', ht = Math.max(3, b - t).toFixed(1) + 'px';
      el.style.transform = 'translate(' + l.toFixed(1) + 'px,' + t.toFixed(1) + 'px)';
      if (s.w !== w) { el.style.width = w; s.w = w; }                  // the size changes with zoom, not with a scroll
      if (s.ht !== ht) { el.style.height = ht; s.ht = ht; }
    }, [props.getView, sW, sH, dispW, dispH]);

    // Scroll and resize move the rectangle, one write per frame.
    React.useEffect(function () {
      var sc = props.scrollRef && props.scrollRef.current, raf = 0;
      if (!sc) return;
      function tick() { if (!raf) raf = requestAnimationFrame(function () { raf = 0; updateRect(); }); }
      function relayout() { place(); tick(); }
      sc.addEventListener('scroll', tick, { passive: true });
      var ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
      if (ro) ro.observe(sc);
      relayout();
      return function () { sc.removeEventListener('scroll', tick); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); };
    }, [updateRect, place, pat]);
    React.useEffect(function () { var r = requestAnimationFrame(updateRect); return function () { cancelAnimationFrame(r); }; }, [props.viewKey, updateRect]);
    // Layout reads belong only to the things that can move the map (its corner, its size, its state), not to every zoom step.
    React.useEffect(function () { var r = requestAnimationFrame(function () { place(); updateRect(); }); return function () { cancelAnimationFrame(r); }; }, [place, shown, props.collapsed]);

    // Drop everything when the pattern changes or the map goes away.
    React.useEffect(function () {
      return function () {
        s.token++; if (s.building) { cancelIdle(s.building); s.building = 0; }
        if (s.flushRaf) { cancelAnimationFrame(s.flushRaf); s.flushRaf = 0; }
        s.img = null; s.built = false; s.dirty = null; s.seenDone = null;
        var c = canvasRef.current; if (c) { c.width = 0; c.height = 0; }
      };
    }, [pat, sW, sH]);

    function paintAll() { var c = canvasRef.current; if (c && s.img) c.getContext('2d').putImageData(s.img, 0, 0); }

    // Full build, in idle slices.
    var build = React.useCallback(function () {
      var c = canvasRef.current;
      if (!c || !pat || !cmap) return;
      if (s.building) { cancelIdle(s.building); s.building = 0; }
      var token = ++s.token;
      c.width = mw; c.height = mh;
      s.img = c.getContext('2d').createImageData(mw, mh);
      s.mw = mw; s.mh = mh; s.bs = bs; s.built = false; s.dirty = null;
      var by = 0;
      function slice(dl) {
        if (token !== s.token) return;
        var t0 = performance.now();
        while (by < mh && (performance.now() - t0 < SLICE_MS)) {
          for (var bx = 0; bx < mw; bx++) blockColour(pat, cmap, s.latestDone, sW, sH, bs, bx, by, s.img.data, (by * mw + bx) * 4);
          by++;
        }
        paintAll();
        if (by < mh) { s.building = idle(slice); return; }
        s.building = 0; s.built = true; s.seenDone = s.latestDone;
        if (s.dirty) { var d = s.dirty; s.dirty = null; refresh(d); }
      }
      s.building = idle(slice);
    }, [pat, cmap, sW, sH, mw, mh, bs]);

    // Recompute some blocks (a Set of block ids) and paint just their bounding box.
    function refresh(set) {
      var c = canvasRef.current;
      if (!c || !s.img) return;
      var x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      set.forEach(function (id) {
        var bx = id % mw, by = (id - bx) / mw;
        blockColour(pat, cmap, s.latestDone, sW, sH, bs, bx, by, s.img.data, id * 4);
        if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (by < y0) y0 = by; if (by > y1) y1 = by;
      });
      if (x1 >= 0) c.getContext('2d').putImageData(s.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }

    // The Tracker reports the cells it just marked or unmarked (nd is the done array that will be committed).
    React.useEffect(function () {
      if (!props.apiRef) return;
      props.apiRef.current = {
        seen: function () { return s.seenDone; },
        cellsChanged: function (changes, nd) {
          s.latestDone = nd; s.seenDone = nd;
          if (!s.shown && !s.built && !s.building) return;       // never built: the first build reads the latest done
          var set = new Set();
          for (var i = 0; i < changes.length; i++) {
            var idx = changes[i].idx, x = idx % sW, y = (idx - x) / sW;
            set.add(Math.floor(y / bs) * mw + Math.floor(x / bs));
          }
          // Gathered and painted once a frame: a drag over sixty cells calls this sixty times.
          s.dirty = s.dirty || new Set(); set.forEach(function (b) { s.dirty.add(b); });
          if (s.built && !s.flushRaf) s.flushRaf = requestAnimationFrame(function () { s.flushRaf = 0; var d = s.dirty; s.dirty = null; if (d && s.built) refresh(d); });
        }
      };
      return function () { if (props.apiRef) props.apiRef.current = null; };
    });

    // Shown for the first time (or the pattern changed while shown): build.
    React.useEffect(function () {
      if (shown && !props.collapsed && !s.built && !s.building) build();
    }, [shown, props.collapsed, pat, cmap, sW, sH, build]);
    // `done` replaced without cellsChanged: one rebuild.
    React.useEffect(function () {
      if (!s.built || s.seenDone === s.latestDone) return;
      s.seenDone = s.latestDone; build();
    }, [done, build]);

    // Tap or drag to jump.
    function jumpFrom(e) {
      var box = boxRef.current; if (!box || !props.onJump) return;
      var r = box.getBoundingClientRect();
      var cx = (e.clientX - r.left) / r.width * sW, cy = (e.clientY - r.top) / r.height * sH;
      props.onJump(Math.max(0, Math.min(sW, cx)), Math.max(0, Math.min(sH, cy)));
    }
    function down(e) { if (e.button != null && e.button > 0) return; s.dragging = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); e.stopPropagation(); jumpFrom(e); }
    function move(e) { if (s.dragging) { e.preventDefault(); jumpFrom(e); } }
    function up(e) { s.dragging = false; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} }
    function key(e) {
      var step = e.shiftKey ? 20 : 5, v = props.getView && props.getView(); if (!v) return;
      var cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2, d = null;
      if (e.key === 'ArrowLeft') d = [-step, 0]; else if (e.key === 'ArrowRight') d = [step, 0];
      else if (e.key === 'ArrowUp') d = [0, -step]; else if (e.key === 'ArrowDown') d = [0, step];
      if (d) { e.preventDefault(); e.stopPropagation(); props.onJump(Math.max(0, Math.min(sW, cx + d[0])), Math.max(0, Math.min(sH, cy + d[1]))); }
    }

    var visible = shown && !props.collapsed;
    return h(React.Fragment, null, props.collapsed && h('button', {
      ref: btnRef, type: 'button', className: 'tracker-minimap-open', style: { display: shown ? 'inline-flex' : 'none' },
      onClick: props.onOpen, title: 'Show the pattern overview', 'aria-label': 'Show the pattern overview'
    }, window.Icons && window.Icons.minimap ? window.Icons.minimap() : null), h('div', {
      ref: boxRef, className: 'tracker-minimap', 'data-testid': 'tracker-minimap', role: 'group',
      'aria-label': props.label || 'Pattern overview. Arrow keys move the view.', tabIndex: visible ? 0 : -1,
      style: { width: dispW, height: dispH, display: visible ? 'block' : 'none' },
      onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onKeyDown: key
    },
      h('canvas', { ref: canvasRef, width: 0, height: 0, className: 'tracker-minimap__canvas', 'aria-hidden': 'true' }),
      h('div', { ref: rectRef, className: 'tracker-minimap__view', 'aria-hidden': 'true' })
    ));
  }

  // A mark reaches the map through api.cellsChanged and then replaces `done`: that replacement is not news, so skip the render.
  function sameProps(a, b) {
    for (var k in b) { if (k === 'done') continue; if (a[k] !== b[k]) return false; }
    if (a.done === b.done) return true;
    var api = b.apiRef && b.apiRef.current;
    return !!(api && api.seen && api.seen() === b.done);
  }
  window.TrackerMinimap = window.React && window.React.memo ? window.React.memo(TrackerMinimap, sameProps) : TrackerMinimap;
  window.__minimapCore = { blockSize: blockSize, blockColour: blockColour, MAX_SIDE: MAX_SIDE, DISPLAY_SIDE: DISPLAY_SIDE, FABRIC: FABRIC };
  if (typeof module !== 'undefined' && module.exports) module.exports = window.__minimapCore;
})();
