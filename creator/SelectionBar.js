/* creator/SelectionBar.js — the action bar over a selection (audit DRAW-04).
 *
 * Two forms, both fixed just above the selection on screen (or below it
 * when there's no room above), kept on screen while the chart scrolls:
 *   - a selection on a touch screen: Copy, Cut, Duplicate, Flip, Rotate and
 *     Delete (desktops have the same in the Tools tab, the right-click menu
 *     and the keyboard);
 *   - a floating paste or turned selection, on any screen: Flip both ways,
 *     Rotate both ways, Cancel and Done. Dragging moves it; tapping outside
 *     it also places it.
 *
 * Reads the canvas context's `clip` (useSelectionClipboard).
 * Loaded as a plain <script> (concatenated into creator/bundle.js).
 */
window.CreatorSelectionBar = function CreatorSelectionBar() {
  var h = React.createElement;
  var cv = window.useCanvas();
  var app = window.useApp();
  var ctx = window.usePatternData();
  var clip = cv.clip;
  var barRef = React.useRef(null);
  var _pos = React.useState(null); var pos = _pos[0], setPos = _pos[1];

  var coarse = (function () {
    try {
      return window.Platform && typeof window.Platform.isCoarsePointer === "function"
        ? window.Platform.isCoarsePointer()
        : !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    } catch (_) { return false; }
  })();

  var floating = !!(clip && clip.floatActive);
  var selecting = !floating && !!cv.hasSelection && coarse && !cv.lassoInProgress &&
    cv.activeTool !== "move" && !cv.contextMenu;
  var show = !!clip && (floating || selecting) && app.tab === "pattern" && !app.previewActive;

  var bbox = React.useMemo(function () {
    if (!show || !cv.selectionMask || !window.SelectionTransforms) return null;
    return window.SelectionTransforms.selectionBBox(cv.selectionMask, ctx.sW, ctx.sH);
  }, [show, cv.selectionMask, ctx.sW, ctx.sH]);

  // Above the selection, or below it, inside the chart's visible area.
  var place = React.useCallback(function () {
    var bar = barRef.current, canvas = app.pcRef && app.pcRef.current;
    if (!bar || !canvas || !bbox) return;
    var r = canvas.getBoundingClientRect();
    var view = app.scrollRef && app.scrollRef.current ? app.scrollRef.current.getBoundingClientRect()
      : { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
    var G = app.G || 0, cs = cv.cs;
    var bw = bar.offsetWidth, bh = bar.offsetHeight, gap = 8;
    var selTop = r.top + G + bbox.minY * cs, selBottom = r.top + G + (bbox.maxY + 1) * cs;
    var selMid = r.left + G + ((bbox.minX + bbox.maxX + 1) / 2) * cs;
    var top = selTop - bh - gap;
    if (top < view.top + 4) top = selBottom + gap;
    top = Math.max(view.top + 4, Math.min(top, view.bottom - bh - 4));
    top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
    var left = Math.max(8, Math.min(selMid - bw / 2, window.innerWidth - bw - 8));
    setPos(function (p) { return p && p.top === top && p.left === left ? p : { top: top, left: left }; });
  }, [bbox, cv.cs, app.G, app.pcRef, app.scrollRef]);

  React.useLayoutEffect(function () {
    if (!show) { setPos(null); return undefined; }
    place();
    var sc = app.scrollRef && app.scrollRef.current;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    if (sc) sc.addEventListener("scroll", place);
    return function () {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      if (sc) sc.removeEventListener("scroll", place);
    };
  }, [show, place, floating]);

  if (!show || !bbox) return null;

  function btn(label, icon, onClick, opts) {
    opts = opts || {};
    return h("button", {
      key: label, type: "button",
      className: "cs-selbar__btn" + (opts.primary ? " cs-selbar__btn--primary" : "") + (opts.text ? " cs-selbar__btn--text" : ""),
      "aria-label": label, title: opts.title || label,
      // Keep focus (and the selection) where it is on a mouse press.
      onPointerDown: function (e) { e.stopPropagation(); },
      onClick: function (e) { e.stopPropagation(); onClick(); }
    }, icon ? icon : null, opts.text ? h("span", null, opts.text) : null);
  }
  var I = window.Icons;
  var items = floating ? [
    btn("Flip left to right", I.flipHorizontal(), function () { clip.transform("flipH"); }, { title: "Flip left to right (Shift+H)" }),
    btn("Flip upside down", I.flipVertical(), function () { clip.transform("flipV"); }, { title: "Flip upside down (Shift+V)" }),
    btn("Rotate anticlockwise", I.rotateCcw(), function () { clip.transform("rotCCW"); }, { title: "Rotate anticlockwise (,)" }),
    btn("Rotate clockwise", I.rotateCw(), function () { clip.transform("rotCW"); }, { title: "Rotate clockwise (.)" }),
    btn("Cancel", null, function () { clip.cancel(); }, { text: "Cancel", title: "Put it back (Esc)" }),
    btn("Done", I.check(), function () { clip.commit(); }, { text: "Done", primary: true, title: "Place it here" })
  ] : [
    btn("Copy", I.copy(), function () { clip.copy(); }, { title: "Copy (Ctrl+C)" }),
    btn("Cut", I.scissors(), function () { clip.cut(); }, { title: "Cut (Ctrl+X)" }),
    btn("Duplicate", I.duplicate(), function () { clip.duplicate(); }, { title: "Duplicate (Ctrl+D)" }),
    btn("Flip left to right", I.flipHorizontal(), function () { clip.transform("flipH"); }),
    btn("Flip upside down", I.flipVertical(), function () { clip.transform("flipV"); }),
    btn("Rotate clockwise", I.rotateCw(), function () { clip.transform("rotCW"); }),
    btn("Delete", I.trash(), function () { if (cv.deleteSelection) cv.deleteSelection(); })
  ];

  return h("div", {
    ref: barRef, role: "toolbar",
    "aria-label": floating ? "Place the selection" : "Selection",
    className: "cs-selbar" + (floating ? " cs-selbar--floating" : ""),
    "data-float": floating ? "true" : "false",
    style: pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }
  },
    floating && h("span", { className: "cs-selbar__hint" }, "Drag to move"),
    items
  );
};
