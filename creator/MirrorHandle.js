/* creator/MirrorHandle.js — handles for moving the mirror-drawing axes
 * (audit DRAW-04).
 *
 * While mirror drawing is on, each axis gets a grip at the edge of the
 * chart's visible area: on the top edge for the left–right axis, on the left
 * edge for the top–bottom one. Dragging a grip moves its axis in half-stitch
 * steps (so it can run along a grid line or through the middle of a row or
 * column); the arrow keys do the same, Home puts it back in the centre. The
 * grips are fixed-position and follow the chart as it scrolls and zooms.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorMirrorHandle = function CreatorMirrorHandle() {
  var h = React.createElement;
  var cv = window.useCanvas();
  var app = window.useApp();
  var ctx = window.usePatternData();
  var mir = cv.mirror;
  var on = !!(mir && mir.on) && app.tab === "pattern" && !app.previewActive && !!ctx.pat;
  var _tick = React.useState(0), bump = _tick[1];

  // Re-place the grips when the chart scrolls or the window resizes.
  React.useEffect(function () {
    if (!on) return undefined;
    function again() { bump(function (n) { return n + 1; }); }
    var sc = app.scrollRef && app.scrollRef.current;
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    if (sc) sc.addEventListener("scroll", again);
    return function () {
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      if (sc) sc.removeEventListener("scroll", again);
    };
  }, [on, app.scrollRef]);

  if (!on || !cv.setMirror) return null;
  var canvas = app.pcRef && app.pcRef.current;
  if (!canvas) return null;
  var r = canvas.getBoundingClientRect();
  var view = app.scrollRef && app.scrollRef.current ? app.scrollRef.current.getBoundingClientRect() : r;
  var G = app.G || 0, cs = cv.cs;

  function setAxis(key, v) {
    var max = key === "ax" ? ctx.sW : ctx.sH;
    v = Math.max(0, Math.min(max, Math.round(v * 2) / 2));
    // Same half-stitch: keep the same object, so nothing re-renders.
    cv.setMirror(function (m) { if (m[key] === v) return m; var n = Object.assign({}, m); n[key] = v; return n; });
  }

  function grip(key) {
    var vertical = key === "ax";
    var value = mir[key];
    var pos = vertical ? r.left + G + value * cs : r.top + G + value * cs;
    // Only while the axis is inside the visible part of the chart.
    if (vertical && (pos < view.left || pos > view.right)) return null;
    if (!vertical && (pos < view.top || pos > view.bottom)) return null;
    var style = vertical
      ? { left: pos, top: Math.max(view.top, r.top + G) }
      : { top: pos, left: Math.max(view.left, r.left + G) };
    function onDown(e) {
      e.preventDefault();
      e.stopPropagation();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onMove(e) {
      if (!e.currentTarget.hasPointerCapture || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
      var rr = canvas.getBoundingClientRect();
      var v = vertical ? (e.clientX - rr.left - G) / cs : (e.clientY - rr.top - G) / cs;
      setAxis(key, v);
    }
    function onKey(e) {
      var step = e.key === (vertical ? "ArrowRight" : "ArrowDown") ? 0.5 : e.key === (vertical ? "ArrowLeft" : "ArrowUp") ? -0.5 : 0;
      if (e.key === "Home") { e.preventDefault(); setAxis(key, (vertical ? ctx.sW : ctx.sH) / 2); return; }
      if (!step) return;
      e.preventDefault();
      setAxis(key, value + step * (e.shiftKey ? 10 : 1));
    }
    var label = vertical ? "Left–right mirror axis" : "Top–bottom mirror axis";
    return h("div", {
      key: key, role: "slider", tabIndex: 0,
      className: "cs-mirror-grip cs-mirror-grip--" + (vertical ? "v" : "h"),
      "aria-label": label, "aria-orientation": vertical ? "horizontal" : "vertical",
      "aria-valuemin": 0, "aria-valuemax": vertical ? ctx.sW : ctx.sH, "aria-valuenow": value,
      "aria-valuetext": (vertical ? "after column " : "after row ") + value,
      title: label + ": drag to move it",
      style: style,
      onPointerDown: onDown, onPointerMove: onMove, onKeyDown: onKey
    }, window.Icons.mirror());
  }

  return h(React.Fragment, null,
    (mir.axis === "v" || mir.axis === "both") ? grip("ax") : null,
    (mir.axis === "h" || mir.axis === "both") ? grip("ay") : null
  );
};
