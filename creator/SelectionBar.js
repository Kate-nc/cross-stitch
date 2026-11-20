/* creator/SelectionBar.js — the action bar over a selection (audit DRAW-04).
 *
 * Two forms, both fixed just above the selection on screen (or below it
 * when there's no room above), kept on screen while the chart scrolls:
 *   - a selection on a touch screen: Copy, Cut, Duplicate, Flip, Rotate,
 *     Stitch type and Delete (desktops have the same in the Tools tab, the
 *     right-click menu and the keyboard). Stitch type swaps the buttons for
 *     Cross / Half / / Half \ (symbols only on phones) and a Back button;
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
  var pressRef = React.useRef(null);
  var _pos = React.useState(null); var pos = _pos[0], setPos = _pos[1];
  // Showing the stitch-type choices in place of the actions.
  var _st = React.useState(false); var stMode = _st[0], setStMode = _st[1];

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

  var maskBox = React.useMemo(function () {
    if (!show || floating || !cv.selectionMask || !window.SelectionTransforms) return null;
    return window.SelectionTransforms.selectionBBox(cv.selectionMask, ctx.sW, ctx.sH);
  }, [show, floating, cv.selectionMask, ctx.sW, ctx.sH]);
  var fl = floating ? clip.float : null;

  // The cells the bar sits over: where a drag has reached, else the float's
  // own box (which may hang off the pattern, or lie wholly outside it, so
  // it isn't taken from the selection mask), else the selection's box.
  function currentBox() {
    var g = clip && clip.dragGhost ? clip.dragGhost() : null;
    if (g) return { minX: g.x, minY: g.y, maxX: g.x + g.clip.w - 1, maxY: g.y + g.clip.h - 1 };
    if (fl) return { minX: fl.ox, minY: fl.oy, maxX: fl.ox + fl.w - 1, maxY: fl.oy + fl.h - 1 };
    return maskBox;
  }

  // Above the selection, or below it, inside the chart's visible area.
  var place = React.useCallback(function () {
    var bar = barRef.current, canvas = app.pcRef && app.pcRef.current, bbox = currentBox();
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
  }, [maskBox, fl, cv.cs, app.G, app.pcRef, app.scrollRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new selection, a float or the bar going away starts from the actions.
  React.useEffect(function () { if (!show || floating) setStMode(false); }, [show, floating]);
  React.useEffect(function () { setStMode(false); }, [cv.selectionMask]);
  React.useLayoutEffect(function () { if (show) place(); }, [stMode]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useLayoutEffect(function () {
    if (!show) { setPos(null); return undefined; }
    place();
    var sc = app.scrollRef && app.scrollRef.current;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("cs:clip-ghost", place);
    if (sc) sc.addEventListener("scroll", place);
    return function () {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("cs:clip-ghost", place);
      if (sc) sc.removeEventListener("scroll", place);
    };
  }, [show, place, floating]);

  if (!show || (!floating && !maskBox)) return null;

  // The buttons act when a pointer is pressed and released on them, not on
  // the click: Chrome swallows the click of a tap that lands while a flick
  // across the chart is still settling (it uses that tap to stop the
  // fling), so Done could need a second tap right after dragging the copy.
  // Click still serves the keyboard (Enter / Space). The click that follows
  // a pointer press is skipped, whichever button it lands on: after Done the
  // bar re-renders as the selection bar, and that click would otherwise hit
  // the new button under the finger (Delete, say).
  function btn(label, icon, onClick, opts) {
    opts = opts || {};
    return h("button", {
      key: label, type: "button",
      className: "cs-selbar__btn" + (opts.primary ? " cs-selbar__btn--primary" : "") + (opts.text ? " cs-selbar__btn--text" : "") + (opts.className ? " " + opts.className : ""),
      "aria-label": label, title: opts.title || label,
      "aria-pressed": opts.pressed == null ? undefined : (opts.pressed ? "true" : "false"),
      onPointerDown: function (e) {
        // Keep focus (and the selection) where it is on a press.
        e.stopPropagation();
        if (e.button === 0 || e.pointerType !== "mouse") pressRef.current = { label: label, id: e.pointerId };
      },
      onPointerUp: function (e) {
        e.stopPropagation();
        var p = pressRef.current;
        pressRef.current = null;
        if (!p || p.label !== label || p.id !== e.pointerId) return;
        window.CreatorSelectionBar._pointerActedAt = Date.now();
        onClick();
      },
      onPointerCancel: function () { pressRef.current = null; },
      onClick: function (e) {
        e.stopPropagation();
        var t = window.CreatorSelectionBar._pointerActedAt || 0;
        if (e.detail > 0 && Date.now() - t < 1000) return;
        onClick();
      }
    }, icon ? icon : null, opts.text ? h("span", { className: opts.textClass }, opts.text) : null);
  }
  var I = window.Icons;
  var kind = cv.selectionStitchKind;
  function pickStitch(t) { if (cv.convertSelectionStitchType) cv.convertSelectionStitchType(t); }
  var items = floating ? [
    btn("Flip left to right", I.flipHorizontal(), function () { clip.transform("flipH"); }, { title: "Flip left to right (Shift+H)" }),
    btn("Flip upside down", I.flipVertical(), function () { clip.transform("flipV"); }, { title: "Flip upside down (Shift+V)" }),
    btn("Rotate anticlockwise", I.rotateCcw(), function () { clip.transform("rotCCW"); }, { title: "Rotate anticlockwise (,)" }),
    btn("Rotate clockwise", I.rotateCw(), function () { clip.transform("rotCW"); }, { title: "Rotate clockwise (.)" }),
    btn("Cancel", null, function () { clip.cancel(); }, { text: "Cancel", title: "Put it back (Esc)" }),
    btn("Done", I.check(), function () { clip.commit(); }, { text: "Done", primary: true, title: "Place it here" })
  ] : stMode ? [
    btn("Back", I.chevronLeft(), function () { setStMode(false); }, { title: "Back to the selection actions" }),
    h("span", { key: "sthint", className: "cs-selbar__hint cs-selbar__hint--st" }, "Stitch as"),
    btn("Cross", I.stitchFull(), function () { pickStitch("full"); },
      { text: "Cross", textClass: "cs-selbar__label", className: "cs-selbar__btn--st", pressed: kind === "full", title: "Make every stitch in the selection a cross stitch" }),
    btn("Half /", I.stitchHalfFwd(), function () { pickStitch("half-fwd"); },
      { text: "Half /", textClass: "cs-selbar__label", className: "cs-selbar__btn--st", pressed: kind === "half-fwd", title: "Make every stitch in the selection a half stitch (/)" }),
    btn("Half \\", I.stitchHalfBck(), function () { pickStitch("half-bck"); },
      { text: "Half \\", textClass: "cs-selbar__label", className: "cs-selbar__btn--st", pressed: kind === "half-bck", title: "Make every stitch in the selection a half stitch (\\)" })
  ] : [
    btn("Copy", I.copy(), function () { clip.copy(); }, { title: "Copy (Ctrl+C)" }),
    btn("Cut", I.scissors(), function () { clip.cut(); }, { title: "Cut (Ctrl+X)" }),
    btn("Duplicate", I.duplicate(), function () { clip.duplicate(); }, { title: "Duplicate (Ctrl+D)" }),
    btn("Flip left to right", I.flipHorizontal(), function () { clip.transform("flipH"); }),
    btn("Flip upside down", I.flipVertical(), function () { clip.transform("flipV"); }),
    btn("Rotate clockwise", I.rotateCw(), function () { clip.transform("rotCW"); }),
    btn("Stitch type", I.stitchHalfFwd(), function () { setStMode(true); }, { title: "Change the stitch type: cross or half" }),
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
