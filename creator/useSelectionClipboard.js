/* creator/useSelectionClipboard.js — Copy, Cut, Paste, Duplicate, Flip and
 * Rotate for a selection (audit DRAW-04 items 1–2).
 *
 * Paste, Duplicate, Flip and Rotate make a *floating selection*: the copied
 * stitches sit on top of the pattern, where they can be dragged, flipped and
 * turned, until the user taps outside them, presses Done (or Enter), or picks
 * another tool. Cancel (or Esc, or Undo) puts everything back. While it
 * floats the active tool is "float". Flip and Rotate on a selection that
 * isn't floating lift it first, leaving its cells empty underneath.
 *
 * A float is one undo step, however much it was dragged and turned: the
 * history entry is the difference between the pattern before the float and
 * the pattern when it's placed (SelectionTransforms.diffForHistory), using
 * the "move" entry shape so Undo also restores the selection.
 *
 * The clipboard is kept on window, so it survives switching projects in the
 * same tab (pasting into another project), but not a reload.
 *
 *   window.useSelectionClipboard(state) -> api (see the return value)
 *
 * `state` is a proxy built in useCreatorState with the pattern, its setters,
 * the selection, the tool setters, history and addToast.
 */
window.useSelectionClipboard = function useSelectionClipboard(state) {
  var T = window.SelectionTransforms;
  var useState = React.useState, useRef = React.useRef, useEffect = React.useEffect;

  var _cb = useState(function () { return window.__creatorClipboard || null; });
  var clipboard = _cb[0], setClipboardState = _cb[1];
  // { w, h, ox, oy, clipped, origin } while a selection floats, else null.
  var _fl = useState(null);
  var float = _fl[0], setFloat = _fl[1];
  var floatRef = useRef(null);
  var dragRef = useRef(null);
  var stateRef = useRef(state);
  stateRef.current = state;

  function setClipboard(clip) {
    window.__creatorClipboard = clip;
    setClipboardState(clip);
  }

  function current() {
    var s = stateRef.current;
    return { pat: s.pat, ps: s.partialStitches || new Map(), bsLines: s.bsLines || [], mask: s.selectionMask };
  }

  function busyWithMove() {
    var s = stateRef.current;
    if (s.moveFloatActive) {
      if (s.addToast) s.addToast("Finish the move first: switch to another tool to keep it, or press Esc to cancel it.", { type: "info", duration: 3000 });
      return true;
    }
    return false;
  }

  function rebuildPalette(pat) {
    var s = stateRef.current;
    if (!s.buildPaletteWithScratch) return;
    var r = s.buildPaletteWithScratch(pat);
    s.setPal(r.pal); s.setCmap(r.cmap);
  }

  // Show the float where it is now.
  function show(f) {
    var s = stateRef.current;
    var r = T.placeClip(f.base, f.clip, f.ox, f.oy, s.sW, s.sH);
    f.shown.add(r.pat);
    s.setPat(r.pat);
    s.setPartialStitches(r.ps);
    s.setBsLines(r.bsLines);
    s.setSelectionMask(r.mask);
    rebuildPalette(r.pat);
    setFloat({ w: f.clip.w, h: f.clip.h, ox: f.ox, oy: f.oy, clipped: r.clipped, origin: f.origin });
    return r;
  }

  // Keep the requested place (the copy's own spot, or two stitches off for
  // Duplicate) and let placeClip leave out what falls outside, unless none
  // of it would land on the pattern at all, as when pasting from a larger
  // project: then bring it just inside.
  function pasteOrigin(clip, x, y) {
    var s = stateRef.current;
    var visible = x < s.sW && y < s.sH && x + clip.w > 0 && y + clip.h > 0;
    if (visible) return { x: x, y: y };
    return {
      x: Math.max(0, Math.min(x, Math.max(0, s.sW - clip.w))),
      y: Math.max(0, Math.min(y, Math.max(0, s.sH - clip.h)))
    };
  }

  function startFloat(orig, base, clip, ox, oy, origin) {
    var s = stateRef.current;
    var f = {
      orig: orig, base: base, clip: clip, ox: ox, oy: oy, origin: origin,
      // Every pattern this float has put on screen. If the pattern on screen
      // is none of them, something else replaced it (another project, a
      // resize, another edit) and the float's snapshot is out of date.
      shown: new WeakSet([orig.pat]),
      prevTool: s.activeTool === "float" ? null : s.activeTool,
      prevDrawMode: s.drawMode
    };
    floatRef.current = f;
    // Dragging needs Draw mode; Navigate comes back when the float is placed.
    if (s.setDrawMode && !s.drawMode) s.setDrawMode(true);
    if (s.setPartialStitchTool) s.setPartialStitchTool(null);
    if (s.setBsStart) s.setBsStart(null);
    s.setActiveTool("float");
    return show(f);
  }

  function endFloat(f, restoreTool) {
    var s = stateRef.current;
    floatRef.current = null;
    dragRef.current = null;
    setFloat(null);
    if (restoreTool) {
      s.setActiveTool(f.prevTool || null);
      if (s.setDrawMode && f.prevDrawMode === false) s.setDrawMode(false);
    }
  }

  // Place the float (or, with `withoutClip`, only its base: a cut float) and
  // record one undo step. Returns the placed pattern, or null.
  // The pattern was changed under the float: keep what is on screen and
  // drop the float rather than write an old snapshot over it.
  function staleFloat(f, keepTool) {
    var cur = stateRef.current.pat;
    if (cur && f.shown.has(cur)) return false;
    endFloat(f, !keepTool);
    return true;
  }

  function commit(opts) {
    var f = floatRef.current;
    if (!f) return null;
    if (staleFloat(f, opts && opts.keepTool)) return null;
    var s = stateRef.current;
    var r = opts && opts.withoutClip
      ? { pat: f.base.pat, ps: f.base.ps, bsLines: f.base.bsLines, mask: null, clipped: false }
      : T.placeClip(f.base, f.clip, f.ox, f.oy, s.sW, s.sH);
    s.setPat(r.pat); s.setPartialStitches(r.ps); s.setBsLines(r.bsLines); s.setSelectionMask(r.mask);
    rebuildPalette(r.pat);
    var d = T.diffForHistory(f.orig, r);
    if (!d.empty) {
      var MAX = s.EDIT_HISTORY_MAX;
      s.setEditHistory(function (prev) {
        var n = prev.concat([{ type: "move", op: f.origin, changes: d.changes, psChanges: d.psChanges, bsLines: d.bsLines,
          prevMask: f.orig.mask || null, nextMask: r.mask }]);
        if (n.length > MAX) n = n.slice(n.length - MAX);
        return n;
      });
      s.setRedoHistory([]);
    }
    if (r.clipped && s.addToast) {
      s.addToast(f.origin === "text" ? "Part of the text was outside the pattern, so it was left out."
        : f.origin === "paste" ? "Part of the paste was outside the pattern, so it was left out."
        : "Part of the selection went outside the pattern, so it was left out.", { type: "info", duration: 3500 });
    }
    endFloat(f, !(opts && opts.keepTool));
    return r;
  }

  function cancel() {
    var f = floatRef.current;
    if (!f) return;
    if (staleFloat(f)) return;
    var s = stateRef.current;
    s.setPat(f.orig.pat); s.setPartialStitches(f.orig.ps); s.setBsLines(f.orig.bsLines);
    s.setSelectionMask(f.orig.mask || null);
    rebuildPalette(f.orig.pat);
    endFloat(f, true);
  }

  // Picking another tool (or Navigate) places the float.
  useEffect(function () {
    if (floatRef.current && state.activeTool !== "float") commit({ keepTool: true });
  }, [state.activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  function copyClip() {
    var f = floatRef.current;
    if (f) return f.clip;
    var c = current();
    return c.mask ? T.extractClip(c.pat, c.ps, c.bsLines, c.mask, stateRef.current.sW, stateRef.current.sH) : null;
  }

  function copy() {
    var clip = copyClip();
    if (!clip) return false;
    setClipboard(clip);
    var s = stateRef.current, n = T.clipStitchCount(clip);
    // Part stitches and backstitch aren't counted, so a selection of only
    // those is "the selection", not "0 stitches".
    var msg = n > 0 ? "Copied " + n.toLocaleString() + " stitch" + (n === 1 ? "" : "es") + "." : "Copied the selection.";
    if (s.addToast) s.addToast(msg, { type: "info", duration: 1500 });
    return true;
  }

  function cut() {
    if (busyWithMove()) return false;
    var clip = copyClip();
    if (!clip) return false;
    setClipboard(clip);
    if (floatRef.current) { commit({ withoutClip: true }); return true; }
    var s = stateRef.current;
    if (s.deleteSelection) s.deleteSelection();
    return true;
  }

  function pasteAt(clip, x, y, origin) {
    // A float already out is placed first; the tool to go back to is the one
    // from before it.
    var prevF = floatRef.current;
    var placedFrom = prevF ? commit({ keepTool: true }) : null;
    var c = current();
    var orig = placedFrom
      ? { pat: placedFrom.pat, ps: placedFrom.ps, bsLines: placedFrom.bsLines, mask: placedFrom.mask }
      : c;
    var base = { pat: orig.pat, ps: orig.ps, bsLines: orig.bsLines };
    var o = pasteOrigin(clip, x, y);
    var r = startFloat(orig, base, clip, o.x, o.y, origin);
    if (prevF && floatRef.current) { floatRef.current.prevTool = prevF.prevTool; floatRef.current.prevDrawMode = prevF.prevDrawMode; }
    return r;
  }

  // A clip made elsewhere (the text tool, audit DRAW-04) floated at (x, y)
  // without touching the clipboard; origin names it in the toasts.
  function floatClip(clip, x, y, origin) {
    if (!clip || !stateRef.current.pat || busyWithMove()) return false;
    pasteAt(clip, x, y, origin || "text");
    return true;
  }
  // Swap the floating clip for another where it is (the text being typed).
  function replaceClip(clip) {
    var f = floatRef.current;
    if (!f || !clip || staleFloat(f)) return false;
    f.clip = clip;
    show(f);
    return true;
  }

  function paste() {
    var clip = window.__creatorClipboard || clipboard;
    if (!clip || !stateRef.current.pat || busyWithMove()) return false;
    pasteAt(clip, clip.srcX, clip.srcY, "paste");
    return true;
  }

  function duplicate() {
    if (busyWithMove()) return false;
    var f = floatRef.current;
    var clip = copyClip();
    if (!clip) return false;
    setClipboard(clip);
    var x = f ? f.ox : clip.srcX, y = f ? f.oy : clip.srcY;
    pasteAt(clip, x + 2, y + 2, "paste");
    return true;
  }

  function transform(op) {
    var f = floatRef.current;
    if (f && staleFloat(f)) f = null;
    if (f) {
      var turned = T.transformClip(f.clip, op);
      if (op === "rotCW" || op === "rotCCW") {
        var o = T.rotatedOrigin(f.clip, f.ox, f.oy);
        f.ox = o.x; f.oy = o.y;
      }
      f.clip = turned;
      show(f);
      return true;
    }
    if (busyWithMove()) return false;
    var c = current(), s = stateRef.current;
    if (!c.mask) return false;
    var clip = T.extractClip(c.pat, c.ps, c.bsLines, c.mask, s.sW, s.sH);
    if (!clip) return false;
    var base = T.liftSelection(c.pat, c.ps, c.bsLines, c.mask, s.sW, s.sH);
    var turned2 = T.transformClip(clip, op);
    var o2 = (op === "rotCW" || op === "rotCCW") ? T.rotatedOrigin(clip, clip.srcX, clip.srcY) : { x: clip.srcX, y: clip.srcY };
    startFloat(c, base, turned2, o2.x, o2.y, "lift");
    return true;
  }

  // Delete while floating: a lifted selection is removed, a paste discarded.
  function deleteFloat() {
    if (!floatRef.current) return false;
    commit({ withoutClip: true });
    return true;
  }

  // Dragging: whole stitches only.
  // Dragging: whole stitches only. While the finger or mouse moves, the
  // pattern isn't rebuilt: PatternCanvas draws a ghost of the clip at the
  // drag position (dragGhost) over the chart, as Move does, and the float is
  // placed there once, when the drag ends.
  function notifyGhost() {
    try { window.dispatchEvent(new Event("cs:clip-ghost")); } catch (_) {}
  }
  function startDrag(gx, gy) {
    var f = floatRef.current;
    if (!f) return;
    dragRef.current = { gx: gx, gy: gy, x: f.ox, y: f.oy, moved: false };
  }
  function updateDrag(gx, gy) {
    var f = floatRef.current, d = dragRef.current;
    if (!f || !d) return;
    var nx = f.ox + gx - d.gx, ny = f.oy + gy - d.gy;
    if (nx === d.x && ny === d.y) return;
    d.x = nx; d.y = ny; d.moved = true;
    notifyGhost();
  }
  function endDrag() {
    var f = floatRef.current, d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (!f || !d.moved) { notifyGhost(); return; }
    if (staleFloat(f)) { notifyGhost(); return; }
    f.ox = d.x; f.oy = d.y;
    show(f);
    notifyGhost();
  }
  // { clip, fromX, fromY, x, y } while a drag has moved the float, else null.
  function dragGhost() {
    var f = floatRef.current, d = dragRef.current;
    if (!f || !d || !d.moved) return null;
    return { clip: f.clip, fromX: f.ox, fromY: f.oy, x: d.x, y: d.y };
  }
  function isInside(gx, gy) {
    var f = floatRef.current;
    if (!f) return false;
    var x = gx - f.ox, y = gy - f.oy;
    if (x < 0 || y < 0 || x >= f.clip.w || y >= f.clip.h) return false;
    return !!f.clip.sel[y * f.clip.w + x];
  }

  // One object per clipboard / float change, so the canvas context that
  // carries it isn't rebuilt on every render. The functions only read refs,
  // so an older copy of them is as good as a new one.
  return React.useMemo(function () { return {
    clipboard: clipboard, hasClipboard: !!clipboard,
    float: float, floatActive: !!float,
    copy: copy, cut: cut, paste: paste, duplicate: duplicate, transform: transform,
    floatClip: floatClip, replaceClip: replaceClip,
    commit: function () { return commit(); }, cancel: cancel, deleteFloat: deleteFloat,
    startDrag: startDrag, updateDrag: updateDrag, endDrag: endDrag, isInside: isInside, dragGhost: dragGhost,
    isDragging: function () { return !!dragRef.current; }
  }; }, [clipboard, float]); // eslint-disable-line react-hooks/exhaustive-deps
};
