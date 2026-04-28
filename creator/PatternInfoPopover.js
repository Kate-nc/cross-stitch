/* creator/PatternInfoPopover.js — UX-12 Option 2: Pattern info popover.
 *
 * Replaces the four-stat block that used to live on the right of the
 * Creator action bar. The bar now hosts a `Pattern info ▾` chip;
 * clicking it opens this popover (or, on phones, a bottom sheet) with
 * the canonical summary of dimensions, fabric, palette, skeins,
 * difficulty, stitchability, and time estimate.
 *
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 * Exposes window.CreatorPatternInfoPopover.
 *
 * Props:
 *   open            — boolean; render only when true
 *   onClose         — required; called on Escape, click-outside, scrim tap
 *   triggerRef      — ref to the button that opened the popover; used to
 *                     ignore its own clicks (mousedown delegation)
 *   sW, sH          — pattern dimensions
 *   fabricCt        — fabric count
 *   colourCount     — palette length (live)
 *   skeinEstimate   — pre-computed skein count (number, may be null)
 *   totalStitchable — stitch count used for progress / time
 *   difficulty      — { stars, color, label } object from useCreatorState
 *   solidPct        — stitchability percentage (e.g. 92.4)
 *   stitchSpeed     — stitches/hr (defaults to 30 if absent)
 *   doneCount       — stitches completed (for "remaining" estimate)
 *
 * Read-only — no internal state, no IndexedDB.
 */

window.CreatorPatternInfoPopover = function CreatorPatternInfoPopover(props) {
  var h = React.createElement;
  var popoverRef = React.useRef(null);

  React.useEffect(function() {
    if (!props || !props.open) return undefined;
    function onDoc(e) {
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      if (props.triggerRef && props.triggerRef.current && props.triggerRef.current.contains(e.target)) return;
      if (typeof props.onClose === "function") props.onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        if (typeof props.onClose === "function") props.onClose();
        if (props.triggerRef && props.triggerRef.current && props.triggerRef.current.focus) {
          props.triggerRef.current.focus();
        }
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return function() {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [props && props.open, props && props.onClose, props && props.triggerRef]);

  if (!props || !props.open) return null;

  var sW = props.sW, sH = props.sH;
  var hasDims = (typeof sW === "number" && typeof sH === "number");
  var hasFabric = (typeof props.fabricCt === "number" && props.fabricCt > 0);
  var hasColours = (typeof props.colourCount === "number" && props.colourCount >= 0);
  var hasSkeins = (typeof props.skeinEstimate === "number" && isFinite(props.skeinEstimate));
  var skeinsRounded = hasSkeins ? Math.max(1, Math.round(props.skeinEstimate)) : null;
  var stitchable = (typeof props.totalStitchable === "number") ? props.totalStitchable : null;
  var doneCount = (typeof props.doneCount === "number") ? props.doneCount : 0;
  var stitchSpeed = (typeof props.stitchSpeed === "number" && props.stitchSpeed > 0) ? props.stitchSpeed : 30;
  var fmt = (typeof window.fmtTimeL === "function") ? window.fmtTimeL : function(s) { return Math.round(s/3600) + "h"; };

  function row(label, value) {
    return [
      h("div", { className: "creator-popover-info__label", key: label + "-k" }, label),
      h("div", { className: "creator-popover-info__value", key: label + "-v" }, value)
    ];
  }

  var patternRows = [];
  if (hasDims) patternRows.push.apply(patternRows, row("Size", sW + " \u00D7 " + sH + " stitches"));
  if (hasFabric) patternRows.push.apply(patternRows, row("Fabric", props.fabricCt + " ct Aida"));
  if (stitchable != null) patternRows.push.apply(patternRows, row("Stitchable", stitchable.toLocaleString()));
  if (hasColours) patternRows.push.apply(patternRows, row("Colours", String(props.colourCount)));
  if (hasSkeins) patternRows.push.apply(patternRows, row("Skeins", "~" + skeinsRounded));

  var estimateRows = [];
  if (stitchable != null) {
    var totalSeconds = Math.round(stitchable / stitchSpeed * 3600);
    estimateRows.push.apply(estimateRows, row("Time @ " + stitchSpeed + "/hr", fmt(totalSeconds)));
    if (doneCount > 0 && doneCount < stitchable) {
      var remainSeconds = Math.round((stitchable - doneCount) / stitchSpeed * 3600);
      estimateRows.push.apply(estimateRows, row("Remaining", fmt(remainSeconds)));
    }
  }

  var badges = [];
  if (props.difficulty && props.difficulty.label) {
    badges.push(h("span", {
      key: "difficulty",
      className: "creator-popover-info__badge"
    }, props.difficulty.label));
  }
  if (typeof props.solidPct === "number" && isFinite(props.solidPct)) {
    badges.push(h("span", {
      key: "solid",
      className: "creator-popover-info__badge"
    }, props.solidPct.toFixed(1) + "% solid"));
  }

  var children = [
    h("h3", { key: "p-title", className: "creator-popover-info__title" }, "Pattern"),
    h("div", { key: "p-grid", className: "creator-popover-info__grid" }, patternRows)
  ];
  if (estimateRows.length) {
    children.push(h("hr", { key: "d1", className: "creator-popover-info__divider" }));
    children.push(h("h3", { key: "e-title", className: "creator-popover-info__title" }, "Estimates"));
    children.push(h("div", { key: "e-grid", className: "creator-popover-info__grid" }, estimateRows));
  }
  if (badges.length) {
    children.push(h("hr", { key: "d2", className: "creator-popover-info__divider" }));
    children.push(h("div", { key: "badges", className: "creator-popover-info__badges" }, badges));
  }

  return h(React.Fragment, null,
    h("div", {
      className: "creator-popover-info-scrim",
      "aria-hidden": "true",
      onClick: function() { if (typeof props.onClose === "function") props.onClose(); }
    }),
    h("div", {
      ref: popoverRef,
      className: "creator-popover-info",
      role: "dialog",
      "aria-label": "Pattern details"
    }, children)
  );
};
