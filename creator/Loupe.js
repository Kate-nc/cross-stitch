/* creator/Loupe.js — touch magnifier and precision cursor (audit DRAW-03).
 *
 * At the fitted zoom on a phone a cell is about 9 CSS px and a fingertip
 * covers several of them. While one finger is down in Draw mode with Paint,
 * Erase, a partial stitch, backstitch or the eyedropper,
 * useCanvasInteraction.js calls window.creatorLoupe.show() with the target
 * and this file draws:
 *
 *   - the loupe: a 110px circle 90px above the target (below it near the top
 *     of the screen) showing the 7 x 7 cells around it, copied from the chart
 *     canvas, with a crosshair in the current thread colour;
 *   - the precision cursor (opt-in): a crosshair 40px above the finger. The
 *     finger moves it and lifting places the stitch there.
 *
 * The pure helpers (loupeRect, loupePlacement, precisionTarget,
 * touchDrawOutcome) are exported for tests. The Tracker could reuse the loupe
 * later; it only needs a source canvas, a cell size and a gutter.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */

(function () {
  var LOUPE_SIZE = 110;        // CSS px across
  var LOUPE_GAP = 90;          // centre of the loupe to the target, CSS px
  var LOUPE_RADIUS_CELLS = 3;  // 3 cells each side of the target = 7 x 7
  var PRECISION_OFFSET = 40;   // precision cursor above the finger, CSS px
  var EDGE_MARGIN = 8;

  // Source rectangle, in chart-canvas pixels, of the (2r+1) x (2r+1) cells
  // centred on `cell`. `gutter` is the ruler width before the first cell.
  function loupeRect(cell, cs, radiusCells, gutter) {
    var r = radiusCells == null ? LOUPE_RADIUS_CELLS : radiusCells;
    var g = gutter || 0;
    var span = (2 * r + 1) * cs;
    return { sx: g + (cell.gx - r) * cs, sy: g + (cell.gy - r) * cs, sw: span, sh: span };
  }

  // Where the loupe goes for a target at viewport point (x, y): centred
  // LOUPE_GAP above it, or below it when that would leave the top of the
  // screen, and kept inside the viewport horizontally. Its centre is always
  // LOUPE_GAP (more than its radius) above or below the target, so it never
  // covers it.
  function loupePlacement(x, y, vw, vh, opts) {
    var o = opts || {};
    var size = o.size || LOUPE_SIZE;
    var gap = o.gap || LOUPE_GAP;
    var margin = o.margin == null ? EDGE_MARGIN : o.margin;
    var flipped = y - gap - size / 2 < margin;
    var cy = flipped ? y + gap : y - gap;
    var left = x - size / 2;
    if (vw > 0) left = Math.max(margin, Math.min(vw - margin - size, left));
    return { left: left, top: cy - size / 2, size: size, flipped: flipped };
  }

  // The point a finger at (x, y) aims at: under it, or PRECISION_OFFSET above
  // it with the precision cursor on.
  function precisionTarget(x, y, precision) {
    return precision ? { x: x, y: y - PRECISION_OFFSET } : { x: x, y: y };
  }

  // What lifting a finger does. Within the tap slop it is a tap, committed at
  // the last target cell; beyond it a stroke-capable tool strokes as it does
  // with a mouse. The precision cursor and single-cell tools never stroke:
  // the finger only moves the target.
  function touchDrawOutcome(start, now, slop, canStroke) {
    var moved = Math.hypot(now.x - start.x, now.y - start.y) > slop;
    return moved && canStroke ? "stroke" : "tap";
  }

  // ── Bus: the canvas handlers push the target; the component draws it ──
  var current = null;
  var listeners = [];
  function notify() { listeners.slice().forEach(function (fn) { fn(current); }); }
  var bus = {
    show: function (info) { current = info; notify(); },
    hide: function () { if (current) { current = null; notify(); } },
    get: function () { return current; },
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    }
  };

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (_) { return fallback; }
  }

  function drawLoupe(canvas, info) {
    var src = info.source;
    if (!canvas || !src) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var W = Math.round(LOUPE_SIZE * dpr);
    if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
    var c = canvas.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.fillStyle = cssVar("--surface-tertiary", "white");
    c.fillRect(0, 0, W, W);
    // The chart canvas may be scaled by CSS; read cells in its own pixels.
    var scale = 1;
    try {
      var rect = src.getBoundingClientRect();
      if (rect.width > 0) scale = src.width / rect.width;
    } catch (_) {}
    var cell = info.snap ? { gx: info.cell.gx - 0.5, gy: info.cell.gy - 0.5 } : info.cell;
    var r = loupeRect(cell, info.cs, LOUPE_RADIUS_CELLS, info.G);
    try { c.drawImage(src, r.sx * scale, r.sy * scale, r.sw * scale, r.sh * scale, 0, 0, W, W); } catch (_) {}

    // Crosshair: a halo in the surface colour under the thread colour.
    var unit = W / (2 * LOUPE_RADIUS_CELLS + 1);
    var mid = W / 2;
    var halo = cssVar("--surface", "white");
    var ink = info.colour || cssVar("--text-primary", "black");
    function strokeAll(width, colour) {
      c.lineWidth = width * dpr;
      c.strokeStyle = colour;
      c.beginPath();
      if (info.snap) {
        c.arc(mid, mid, unit * 0.3, 0, Math.PI * 2);
      } else {
        c.rect(mid - unit / 2, mid - unit / 2, unit, unit);
      }
      var inner = info.snap ? unit * 0.3 : unit / 2;
      c.moveTo(mid, 0); c.lineTo(mid, mid - inner - 2 * dpr);
      c.moveTo(mid, W); c.lineTo(mid, mid + inner + 2 * dpr);
      c.moveTo(0, mid); c.lineTo(mid - inner - 2 * dpr, mid);
      c.moveTo(W, mid); c.lineTo(mid + inner + 2 * dpr, mid);
      c.stroke();
    }
    strokeAll(3.5, halo);
    strokeAll(1.6, ink);
  }

  window.CreatorLoupe = function CreatorLoupe() {
    var h = React.createElement;
    var st = React.useState(bus.get);
    var info = st[0], setInfo = st[1];
    var canvasRef = React.useRef(null);
    React.useEffect(function () { return bus.subscribe(setInfo); }, []);
    React.useEffect(function () {
      if (info && info.magnifier) drawLoupe(canvasRef.current, info);
    });
    if (!info) return null;
    var vw = window.innerWidth || 0, vh = window.innerHeight || 0;
    var place = loupePlacement(info.x, info.y, vw, vh);
    return h(React.Fragment, null,
      info.magnifier ? h("canvas", {
        ref: canvasRef,
        className: "creator-loupe" + (place.flipped ? " creator-loupe--below" : ""),
        "aria-hidden": "true",
        style: { left: place.left, top: place.top, width: place.size, height: place.size }
      }) : null,
      info.precision ? h("div", {
        className: "creator-precision-cursor",
        "aria-hidden": "true",
        style: { left: info.x, top: info.y }
      }, h("svg", { viewBox: "0 0 24 24", width: 28, height: 28, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" },
        h("circle", { cx: 12, cy: 12, r: 4 }),
        h("path", { d: "M12 1v6M12 17v6M1 12h6M17 12h6" })
      )) : null
    );
  };

  window.creatorLoupe = bus;
  window.loupeRect = loupeRect;
  window.loupePlacement = loupePlacement;
  window.precisionTarget = precisionTarget;
  window.touchDrawOutcome = touchDrawOutcome;
  window.CREATOR_LOUPE = { SIZE: LOUPE_SIZE, GAP: LOUPE_GAP, RADIUS_CELLS: LOUPE_RADIUS_CELLS, PRECISION_OFFSET: PRECISION_OFFSET };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { loupeRect: loupeRect, loupePlacement: loupePlacement, precisionTarget: precisionTarget, touchDrawOutcome: touchDrawOutcome, bus: bus };
  }
})();
