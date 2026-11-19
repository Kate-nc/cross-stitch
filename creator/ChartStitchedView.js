/* creator/ChartStitchedView.js — Edit's Chart / Stitched switch (Stage 3).

   The switch sits in the corner of the chart. Stitched shows the pattern as
   Convert's Stitched preview draws it (creator/StitchedPreview.js,
   CreatorStitchedPreview): crosses of thread on the project's fabric.

   The stitched picture is laid over the chart's grid, at the chart's own cell
   size, inside the same scroll box, and the chart stays underneath. So
   switching keeps the same stitch in the middle of the screen and the same
   zoom, and the rulers keep showing row and column numbers. The overlay takes
   every click and touch, so nothing paints while it is showing: a mouse drag
   moves the chart, a finger scrolls it, and zoom works as on the chart.

   window.CreatorChartViewSwitch()    the Chart / Stitched control
   window.CreatorStitchedOverlay()    the stitched picture over the grid
   window.CREATOR_CHART_VIEWS         [{ id, label, title }]
   Reads the Creator contexts (context.js). Concatenated into creator/bundle.js. */

(function () {
  var h = React.createElement;

  var VIEWS = [
    { id: "chart", label: "Chart", title: "The chart you edit: symbols and colours on a grid (S)" },
    { id: "stitched", label: "Stitched", title: "How it will look stitched: crosses of thread on your fabric. Painting is off (S)" }
  ];
  window.CREATOR_CHART_VIEWS = VIEWS;

  window.CreatorChartViewSwitch = function CreatorChartViewSwitch() {
    var app = window.useApp();
    var value = app.chartView === "stitched" ? "stitched" : "chart";
    function choose(id) {
      if (app.previewActive && app.setPreviewActive) app.setPreviewActive(false);
      if (app.setChartView) app.setChartView(id);
    }
    return h("div", { className: "lp-segmented cv-seg chart-view-switch", role: "radiogroup", "aria-label": "Chart or stitched view", "data-chart-view": value },
      VIEWS.map(function (v, i) {
        var on = v.id === value && !app.previewActive;
        return h("button", {
          key: v.id, type: "button", role: "radio", "aria-checked": on ? "true" : "false",
          tabIndex: on || (app.previewActive && i === 0) ? 0 : -1,
          className: "lp-seg" + (on ? " lp-seg--on" : ""), title: v.title, "data-view": v.id,
          onClick: function () { choose(v.id); },
          onKeyDown: function (e) {
            var step = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1 : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            var next = VIEWS[(i + step + VIEWS.length) % VIEWS.length];
            choose(next.id);
            var sib = e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector('[data-view="' + next.id + '"]');
            if (sib) sib.focus();
          }
        }, v.label);
      }));
  };

  window.CreatorStitchedOverlay = function CreatorStitchedOverlay() {
    var ctx = window.usePatternData();
    var cv = window.useCanvas();
    var app = window.useApp();
    var drag = React.useRef(null);
    var G = app.G || 0, cs = cv.cs || 1;
    if (!ctx.pat || !ctx.sW || !ctx.sH || !window.CreatorStitchedPreview) return null;

    // A mouse or pen drag moves the chart; a finger scrolls it natively.
    function down(e) {
      e.stopPropagation();
      if (e.pointerType === "touch" || e.button !== 0) return;
      var box = app.scrollRef && app.scrollRef.current;
      if (!box) return;
      drag.current = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    }
    function move(e) {
      var d = drag.current, box = app.scrollRef && app.scrollRef.current;
      if (!d || !box) return;
      box.scrollLeft = d.left - (e.clientX - d.x);
      box.scrollTop = d.top - (e.clientY - d.y);
    }
    function up() { drag.current = null; }

    return h("div", {
      className: "chart-stitched", "data-chart-stitched": "",
      style: { left: G, top: G, width: ctx.sW * cs, height: ctx.sH * cs },
      onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up,
      onClick: function (e) { e.stopPropagation(); },
      onContextMenu: function (e) { e.preventDefault(); e.stopPropagation(); }
    },
      h(window.CreatorStitchedPreview, {
        cells: ctx.pat, width: ctx.sW, height: ctx.sH,
        fabricColour: app.fabricColour, fabricCt: ctx.fabricCt || 14,
        displayWidth: ctx.sW * cs
      }));
  };
})();
