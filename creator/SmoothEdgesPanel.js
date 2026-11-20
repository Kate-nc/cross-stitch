/* creator/SmoothEdgesPanel.js — Smooth edges for a selection.
 *
 * Opens when cv.wandPanel is "smooth" (Selection menu, right-click menu,
 * Tools tab, or the touch selection bar's stitch-type choices). Chooses how
 * (trim the corners, or fill the steps) and whether to keep square corners;
 * the chart shows the cells that will change (cv.smoothPreview, drawn by
 * canvasRenderer) and Apply makes them three-quarter stitches in one undo
 * step (cv.applySmoothEdges, SmoothEdges.plan / apply).
 *
 * A card docked at the top right of the chart, so the selection stays in
 * view; a sheet along the foot of the screen on phones (styles.css,
 * .cs-smooth). Clearing the selection closes it.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorSmoothEdgesPanel = function CreatorSmoothEdgesPanel() {
  var h = React.createElement;
  var cv = window.useCanvas();
  var app = window.useApp();
  var _top = React.useState(null); var top = _top[0], setTop = _top[1];

  var open = cv.wandPanel === "smooth" && !!cv.hasSelection && app.tab === "pattern" && !app.previewActive;

  // Dock just below the top of the chart's scroll area.
  React.useLayoutEffect(function () {
    if (!open) return undefined;
    function place() {
      var sc = app.scrollRef && app.scrollRef.current;
      var t = sc ? sc.getBoundingClientRect().top + 8 : 120;
      setTop(function (p) { return p === t ? p : t; });
    }
    place();
    window.addEventListener("resize", place);
    return function () { window.removeEventListener("resize", place); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  var I = window.Icons;
  var opts = cv.smoothOptions || { mode: "trim", keepSquare: true };
  var plan = cv.smoothPreview;
  var counts = plan ? plan.counts : { threeQuarter: 0, half: 0, quarter: 0 };
  var n = counts.threeQuarter + counts.half;
  function setOpt(k, v) {
    if (!cv.setSmoothOptions) return;
    cv.setSmoothOptions(function (prev) { var o = Object.assign({}, prev); o[k] = v; return o; });
  }
  function close() { cv.setWandPanel(null); }

  function method(id, label, icon) {
    var on = opts.mode === id;
    return h("button", {
      type: "button", className: "cs-smooth__method", "aria-pressed": on ? "true" : "false",
      onClick: function () { setOpt("mode", id); }
    }, icon, h("span", null, label));
  }

  var summary;
  if (!n) {
    summary = "No steps to smooth along this edge.";
  } else {
    var parts = [];
    if (counts.threeQuarter) parts.push(h("b", { key: "q3" }, counts.threeQuarter.toLocaleString() + " ¾ stitch" + (counts.threeQuarter === 1 ? "" : "es")));
    if (counts.half) {
      if (parts.length) parts.push(" and ");
      parts.push(h("b", { key: "h" }, counts.half.toLocaleString() + " half stitch" + (counts.half === 1 ? "" : "es")));
    }
    parts.push(opts.mode === "fill" ? " added" : " made");
    if (counts.quarter) parts.push(", with " + counts.quarter.toLocaleString() + " ¼ stitch" + (counts.quarter === 1 ? "" : "es") + " in the colour beside " + (n === 1 ? "it" : "them"));
    parts.push(". Shown on the chart.");
    summary = parts;
  }

  return h("div", {
    className: "cs-smooth", role: "dialog", "aria-modal": "false", "aria-label": "Smooth edges",
    style: top != null ? { top: top } : null,
    onPointerDown: function (e) { e.stopPropagation(); }
  },
    h("div", { className: "cs-smooth__head" },
      h("div", { className: "cs-smooth__title" }, I.smoothEdges(), "Smooth edges"),
      h("button", { type: "button", className: "cs-smooth__close", "aria-label": "Close", title: "Close", onClick: close }, I.x())
    ),
    h("p", { className: "cs-smooth__hint" },
      opts.mode === "fill"
        ? "Adds a ¾ stitch in each step just outside the selection, so the shape grows slightly. Any stitch already there keeps the far quarter."
        : "Cuts the outside corner off each step, so the shape gets slightly smaller. A cut-off quarter takes the colour stitched beside it."),
    h("div", { className: "cs-smooth__methods", role: "group", "aria-label": "How" },
      method("trim", "Trim the corners", I.smoothTrim()),
      method("fill", "Fill the steps", I.smoothFill())
    ),
    h("label", { className: "cs-smooth__check" },
      h("input", { type: "checkbox", checked: opts.keepSquare !== false, onChange: function (e) { setOpt("keepSquare", e.target.checked); } }),
      h("span", null, "Keep square corners")
    ),
    h("p", { className: "cs-smooth__hint cs-smooth__hint--check" }, "Where two straight edges meet, the corner stays sharp."),
    h("div", { className: "cs-smooth__sum", role: "status" },
      h("span", { className: "cs-smooth__swatch", "aria-hidden": "true" }),
      h("span", null, summary)
    ),
    h("div", { className: "cs-smooth__btns" },
      h("button", { type: "button", className: "cs-smooth__btn", onClick: close }, "Cancel"),
      h("button", {
        type: "button", className: "cs-smooth__btn cs-smooth__btn--primary", disabled: !n,
        onClick: function () { if (cv.applySmoothEdges) cv.applySmoothEdges(); }
      }, "Apply")
    )
  );
};
