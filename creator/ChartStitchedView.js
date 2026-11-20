/* creator/ChartStitchedView.js — Edit's Chart / Stitched switch (Stage 3).

   The switch sits in the corner of the chart. Stitched shows the pattern as
   Convert's Stitched preview draws it (creator/StitchedPreview.js,
   CreatorStitchedPreview): crosses of thread on the project's fabric.

   The stitched picture is laid over the chart's grid, at the chart's own cell
   size, inside the same scroll box, and the chart stays underneath. So
   switching keeps the same stitch in the middle of the screen and the same
   zoom, and the rulers keep showing row and column numbers. The overlay is
   only a picture (pointer-events: none): every click and touch reaches the
   chart beneath, which treats the Stitched view as Navigate
   (useCanvasInteraction.js isNavigate). So a drag moves the chart, two
   fingers or a double-tap zoom it, a middle-button drag moves it, and
   nothing paints, whatever tool is chosen.

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
    var G = app.G || 0, cs = cv.cs || 1;
    if (!ctx.pat || !ctx.sW || !ctx.sH || !window.CreatorStitchedPreview) return null;

    return h("div", {
      className: "chart-stitched", "data-chart-stitched": "",
      style: { left: G, top: G, width: ctx.sW * cs, height: ctx.sH * cs }
    },
      h(window.CreatorStitchedPreview, {
        cells: ctx.pat, width: ctx.sW, height: ctx.sH,
        fabricColour: app.fabricColour, fabricCt: ctx.fabricCt || 14,
        displayWidth: ctx.sW * cs
      }));
  };
})();
