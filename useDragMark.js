/* useDragMark.js — B2: Drag-Mark + Long-Press Range Select.
   ════════════════════════════════════════════════════════════
   A React hook for the Stitch Tracker grid that unifies tap,
   drag-mark, and long-press range-select gestures across mouse
   and touch input.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useDragMark and (for tests) window.__dragMarkInternals.

   API
   ───
     const { handlers, dragState, notifyShiftUp } = window.useDragMark({
       w, h,            // grid dimensions
       pattern,         // flat cell array (read-only)
       done,            // flat done array (read-only)
       cellAtPoint,     // (clientX, clientY) => idx | -1
       onToggleCell,    // (idx) => void           — single-cell tap
       onCommitDrag,    // (Set<idx>, intent) => void
       onCommitRange,   // (Set<idx>, intent) => void
       isEditMode,      // boolean — when true, hook is a no-op
     });
     // Spread handlers onto the grid container:
     //   <div {...handlers} />
     // Call notifyShiftUp() from a document-level Shift keyup/blur
     // listener so the range-select anchor is forgotten the instant
     // Shift is released — see behaviour (7) below.
     // Use dragState to paint a translucent overlay:
     //   { mode: 'idle'|'pending'|'drag'|'range'|'shiftRange',
     //     path: Set<number>, anchor: number|null,
     //     intent: 'mark'|'unmark'|null }

   Behaviours
   ──────────
   1. Single-cell tap (down + up on same cell within 200ms) → onToggleCell.
   2. Drag-mark: after 200ms touch-start guard, if pointer crosses cells,
      collect them into a Set; intent fixed by FIRST cell's done state.
      __skip__/__empty__ cells excluded. Commit as ONE undo step.
   3. 200ms multi-touch guard: a second pointer arriving inside the guard
      window aborts (browser handles pinch-zoom natively).
   4. Long-press 500ms with no movement → set range anchor; next tap on a
      different cell commits the rectangular region as one undo step.
      Touch/pen only — see note in (5).
   5. Mouse: click+drag = drag-mark; shift+mousedown starts a LIVE
      rubber-band rectangle from the most recent anchor — the preview
      (state.path) follows the pointer as it moves and only commits on
      release, so the selected area is always visible before it's applied.
      Mouse never arms the (4) long-press timer, so a click has no minimum
      OR maximum hold-time to register as a tap — it always toggles the
      cell as long as the button is released without moving off it. This
      avoids a dead zone where a click held anywhere between ~200ms-500ms
      (very plausible with a real mouse) used to be silently swallowed
      instead of registering as a tap or a drag.
   6. Pointer cancel discards the gesture (shift-range preview included).
   7. The range-select anchor (lastAnchor) is forgotten as soon as Shift
      is released (parent calls notifyShiftUp() on keyup/blur) — it does
      NOT persist indefinitely across unrelated clicks. If Shift goes up
      while a rubber-band drag is still in progress (mouse button not yet
      released), the drag finishes normally on release, but the anchor it
      would otherwise leave behind is discarded too. Holding Shift down
      across multiple clicks still lets you chain range-selects from the
      previous one, same as before.                                     */
(function () {
  'use strict';

  // ─── Tunable thresholds (sourced from window.TouchConstants when
  //     present so all canvas gestures share one definition; fall back
  //     to the historical defaults for tests / old test pages). ───────
  function TC() {
    return (typeof window !== 'undefined' && window.TouchConstants)
      ? window.TouchConstants : null;
  }
  function tapHoldMs()      { var c = TC(); return c ? c.TAP_HOLD_MS : 200; }
  function longPressMs()    { var c = TC(); return c ? c.LONG_PRESS_MS : 500; }
  function multiTouchMs()   { var c = TC(); return c ? c.MULTI_TOUCH_GRACE_MS : 100; }
  function tapSlopPx()      { var c = TC(); return c ? c.TAP_SLOP_PX : 10; }

  // ─── Pure helpers ────────────────────────────────────────────────────
  function isMarkableAt(pattern, idx) {
    if (idx < 0 || !pattern || idx >= pattern.length) return false;
    var c = pattern[idx];
    if (!c) return false;
    return c.id !== '__skip__' && c.id !== '__empty__';
  }

  function rectIndices(anchorIdx, otherIdx, w, h, pattern) {
    var out = new Set();
    if (anchorIdx < 0 || otherIdx < 0 || !w || !h) return out;
    var ax = anchorIdx % w, ay = (anchorIdx - ax) / w;
    var bx = otherIdx  % w, by = (otherIdx  - bx) / w;
    var minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    var minY = Math.min(ay, by), maxY = Math.max(ay, by);
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var i = y * w + x;
        if (isMarkableAt(pattern, i)) out.add(i);
      }
    }
    return out;
  }

  function intentForCell(done, idx) {
    return (done && done[idx]) ? 'unmark' : 'mark';
  }

  // ─── Pure state-machine reducer (extractable for tests) ──────────────
  // state: { mode, path:Set, anchor, intent, startIdx, startTime,
  //          pointerId, moved, lastAnchor, pointerCount }
  // action types:
  //   POINTER_DOWN  { idx, time, pointerId, shiftKey, pointerType }
  //   POINTER_MOVE  { idx, time }
  //   POINTER_UP    { idx, time }
  //   POINTER_CANCEL
  //   LONG_PRESS_FIRED
  //   MULTI_TOUCH   { time }   — second pointer observed
  //   SHIFT_UP      — Shift key released; forget the anchor (see (5))
  //   RESET
  // returns { state, effects:[ {type, payload} ] }
  // effect types:
  //   TOGGLE_CELL    { idx }
  //   COMMIT_DRAG    { set, intent }
  //   COMMIT_RANGE   { set, intent }
  //   START_LONG_PRESS
  //   CLEAR_LONG_PRESS
  function dragMarkReducer(state, action, ctx) {
    // ctx = { w, h, pattern, done }
    var s = state;
    var effects = [];
    function next(patch) { return Object.assign({}, s, patch); }
    function idle() {
      return {
        mode: 'idle', path: new Set(), anchor: null, intent: null,
        startIdx: -1, startTime: 0, startX: 0, startY: 0,
        pointerType: 'mouse', pointerId: null, moved: false,
        lastAnchor: s.lastAnchor, pointerCount: 0, shiftReleased: false,
      };
    }

    switch (action.type) {
      case 'POINTER_DOWN': {
        // Multi-touch guard: a second pointer within MULTI_TOUCH_GRACE_MS
        // aborts the in-progress 1-finger gesture so pinch / 2-finger
        // pan can take over without committing a stray mark.
        if (s.mode !== 'idle') {
          if (action.pointerType === 'touch'
              && (action.time - s.startTime) < multiTouchMs()) {
            effects.push({ type: 'CLEAR_LONG_PRESS' });
            return { state: idle(), effects: effects };
          }
          return { state: s, effects: effects };
        }

        // Shift+click: begin a LIVE rubber-band rectangle from the last
        // anchor instead of committing immediately. The rectangle preview
        // (state.path) updates as the pointer moves (POINTER_MOVE below)
        // and only commits on release (POINTER_UP below), so the user can
        // see exactly which cells will be marked before it happens.
        if (action.shiftKey && s.lastAnchor != null
            && isMarkableAt(ctx.pattern, s.lastAnchor)) {
          var anchorIdx = s.lastAnchor;
          var otherIdx0 = (action.idx >= 0 && isMarkableAt(ctx.pattern, action.idx))
                          ? action.idx : anchorIdx;
          var riShift = intentForCell(ctx.done, anchorIdx);
          return {
            state: {
              mode: 'shiftRange',
              path: rectIndices(anchorIdx, otherIdx0, ctx.w, ctx.h, ctx.pattern),
              anchor: anchorIdx,
              intent: riShift,
              startIdx: anchorIdx,
              startTime: action.time,
              startX: (typeof action.x === 'number' ? action.x : 0),
              startY: (typeof action.y === 'number' ? action.y : 0),
              pointerType: action.pointerType || 'mouse',
              pointerId: action.pointerId,
              moved: false,
              lastAnchor: s.lastAnchor,
              pointerCount: 1,
              otherIdx: otherIdx0,
              shiftReleased: false,
            },
            effects: effects,
          };
        }

        // Pending: nothing committed yet.
        var path = new Set();
        if (isMarkableAt(ctx.pattern, action.idx)) path.add(action.idx);
        // Long-press-to-range is a touch/pen affordance only. Mouse users
        // already have an unambiguous, immediate range gesture (shift+click,
        // handled above) — arming the same 500ms timer for mouse meant any
        // click held a little longer than tapHoldMs (e.g. a deliberate but
        // unhurried click, or one delayed by a busy main thread) silently
        // turned into a range anchor and swallowed the click instead of
        // toggling the cell. See the pointerType==='mouse' bypass in the
        // POINTER_UP 'pending' branch below for the other half of this fix.
        if ((action.pointerType || 'mouse') !== 'mouse') {
          effects.push({ type: 'START_LONG_PRESS' });
        }
        return {
          state: {
            mode: 'pending',
            path: path,
            anchor: null,
            intent: null,
            startIdx: action.idx,
            startTime: action.time,
            startX: (typeof action.x === 'number' ? action.x : 0),
            startY: (typeof action.y === 'number' ? action.y : 0),
            pointerType: action.pointerType || 'mouse',
            pointerId: action.pointerId,
            moved: false,
            lastAnchor: s.lastAnchor,
            pointerCount: 1,
          },
          effects: effects,
        };
      }

      case 'POINTER_MOVE': {
        if (s.mode === 'idle' || s.mode === 'range') return { state: s, effects: effects };
        if (s.mode === 'shiftRange') {
          // Live rubber-band: keep the last valid cell under the pointer
          // (falls back to the previous one if it wanders over a
          // __skip__/__empty__ cell or off the grid) and recompute the
          // preview rectangle from the fixed anchor.
          var newOther = (action.idx >= 0 && isMarkableAt(ctx.pattern, action.idx))
                         ? action.idx : s.otherIdx;
          if (newOther === s.otherIdx) return { state: s, effects: effects };
          return {
            state: next({
              otherIdx: newOther,
              path: rectIndices(s.anchor, newOther, ctx.w, ctx.h, ctx.pattern),
              moved: true,
            }),
            effects: effects,
          };
        }
        if (action.idx === s.startIdx && !s.moved && s.mode === 'pending') {
          // Still on first cell — no transition.
          return { state: s, effects: effects };
        }
        // Slop check: for touch / pen pointers, require the finger to
        // travel at least TAP_SLOP_PX before promoting to a drag. This
        // prevents jittery taps near a cell boundary from accidentally
        // marking a second cell. Mouse pointers skip the slop test
        // (a different cell already requires deliberate movement).
        if (s.mode === 'pending'
            && s.pointerType && s.pointerType !== 'mouse'
            && typeof action.x === 'number' && typeof action.y === 'number') {
          var dx = action.x - s.startX, dy = action.y - s.startY;
          if ((dx * dx + dy * dy) < (tapSlopPx() * tapSlopPx())) {
            // Inside slop — keep pending, do not promote.
            return { state: s, effects: effects };
          }
        }
        // Movement detected → cancel long-press.
        var newMoved = true;
        if (s.mode === 'pending') {
          // Promote to drag. Intent set by first markable cell.
          var firstIdx = isMarkableAt(ctx.pattern, s.startIdx)
                         ? s.startIdx : action.idx;
          if (!isMarkableAt(ctx.pattern, firstIdx)) {
            return { state: next({ moved: true }), effects: effects };
          }
          var di = intentForCell(ctx.done, firstIdx);
          var p = new Set();
          if (isMarkableAt(ctx.pattern, s.startIdx)) p.add(s.startIdx);
          if (isMarkableAt(ctx.pattern, action.idx)) p.add(action.idx);
          effects.push({ type: 'CLEAR_LONG_PRESS' });
          return {
            state: next({
              mode: 'drag', path: p, intent: di, moved: newMoved,
            }),
            effects: effects,
          };
        }
        // Already in drag — accumulate.
        if (s.mode === 'drag') {
          if (action.idx >= 0 && isMarkableAt(ctx.pattern, action.idx)
              && !s.path.has(action.idx)) {
            var np = new Set(s.path);
            np.add(action.idx);
            return { state: next({ path: np, moved: newMoved }), effects: effects };
          }
          return { state: next({ moved: newMoved }), effects: effects };
        }
        return { state: s, effects: effects };
      }

      case 'LONG_PRESS_FIRED': {
        if (s.mode !== 'pending' || s.moved) return { state: s, effects: effects };
        if (!isMarkableAt(ctx.pattern, s.startIdx)) {
          return { state: idle(), effects: effects };
        }
        var lpi = intentForCell(ctx.done, s.startIdx);
        return {
          state: next({
            mode: 'range', anchor: s.startIdx, intent: lpi,
            lastAnchor: s.startIdx,
          }),
          effects: effects,
        };
      }

      case 'POINTER_UP': {
        if (s.mode === 'idle') return { state: s, effects: effects };
        effects.push({ type: 'CLEAR_LONG_PRESS' });

        if (s.mode === 'range') {
          // Tap after long-press anchor → commit rectangle.
          if (action.idx >= 0 && action.idx !== s.anchor
              && isMarkableAt(ctx.pattern, action.idx)) {
            var rs2 = rectIndices(s.anchor, action.idx,
                                  ctx.w, ctx.h, ctx.pattern);
            effects.push({ type: 'COMMIT_RANGE',
                           set: rs2, intent: s.intent });
            return {
              state: Object.assign(idle(), { lastAnchor: action.idx }),
              effects: effects,
            };
          }
          // Tap on same cell or non-markable → keep anchor.
          return { state: s, effects: effects };
        }

        if (s.mode === 'shiftRange') {
          // Release commits the rectangle currently shown in the preview.
          var finalIdx = (action.idx >= 0 && isMarkableAt(ctx.pattern, action.idx))
                         ? action.idx : s.otherIdx;
          var rsFinal = rectIndices(s.anchor, finalIdx, ctx.w, ctx.h, ctx.pattern);
          if (rsFinal.size > 0) {
            effects.push({ type: 'COMMIT_RANGE', set: rsFinal, intent: s.intent });
          }
          // If Shift was already released before the mouse button (see
          // SHIFT_UP below), forget the anchor right away instead of
          // leaving it available for a future, unrelated shift+click.
          return {
            state: Object.assign(idle(), { lastAnchor: s.shiftReleased ? null : finalIdx }),
            effects: effects,
          };
        }

        if (s.mode === 'drag') {
          if (s.path.size > 0) {
            effects.push({ type: 'COMMIT_DRAG',
                           set: s.path, intent: s.intent });
          }
          var laD = (action.idx >= 0 ? action.idx : s.startIdx);
          return {
            state: Object.assign(idle(), { lastAnchor: laD }),
            effects: effects,
          };
        }

        // pending → tap.
        if (s.mode === 'pending') {
          var dt = action.time - s.startTime;
          // Mouse never arms the long-press timer (see POINTER_DOWN), so
          // there's no risk of this being a stale/duplicate range gesture —
          // any mouse click that didn't move to a different cell is a tap,
          // regardless of how long the button was held.
          var isMouse = s.pointerType === 'mouse';
          if ((isMouse || dt <= tapHoldMs()) && action.idx === s.startIdx
              && isMarkableAt(ctx.pattern, s.startIdx)) {
            effects.push({ type: 'TOGGLE_CELL', idx: s.startIdx });
            return {
              state: Object.assign(idle(), { lastAnchor: s.startIdx }),
              effects: effects,
            };
          }
          // Long press without movement OR up off-cell → discard.
          return { state: idle(), effects: effects };
        }
        return { state: s, effects: effects };
      }

      case 'POINTER_CANCEL': {
        effects.push({ type: 'CLEAR_LONG_PRESS' });
        return { state: idle(), effects: effects };
      }

      case 'MULTI_TOUCH': {
        if (s.mode !== 'idle' && (action.time - s.startTime) < multiTouchMs()) {
          effects.push({ type: 'CLEAR_LONG_PRESS' });
          return { state: idle(), effects: effects };
        }
        return { state: s, effects: effects };
      }

      case 'SHIFT_UP': {
        // Forget the anchor as soon as Shift is released so a later,
        // unrelated shift+click can't silently reuse a stale starting
        // point. If a shift-range drag is still in progress (the button
        // release lagged the key release), let it finish naturally —
        // just flag it so the anchor set by that eventual commit is
        // discarded too (see the 'shiftRange' POINTER_UP branch above).
        if (s.mode === 'shiftRange') {
          return { state: next({ shiftReleased: true }), effects: effects };
        }
        if (s.lastAnchor == null) return { state: s, effects: effects };
        return { state: next({ lastAnchor: null }), effects: effects };
      }

      case 'RESET':
      default:
        effects.push({ type: 'CLEAR_LONG_PRESS' });
        return { state: idle(), effects: effects };
    }
  }

  function initialState() {
    return {
      mode: 'idle', path: new Set(), anchor: null, intent: null,
      startIdx: -1, startTime: 0, startX: 0, startY: 0,
      pointerType: 'mouse', pointerId: null, moved: false,
      lastAnchor: null, pointerCount: 0, otherIdx: null,
      shiftReleased: false,
    };
  }

  // ─── React hook ─────────────────────────────────────────────────────
  function useDragMark(opts) {
    var R = (typeof window !== 'undefined' && window.React) || null;
    if (!R) {
      // Outside React (Node tests) — return inert.
      var noop = function () {};
      return {
        handlers: {
          onPointerDown: noop, onPointerMove: noop,
          onPointerUp: noop, onPointerCancel: noop,
          onContextMenu: noop,
        },
        dragState: { mode: 'idle', path: new Set(), anchor: null, intent: null },
        notifyShiftUp: noop,
      };
    }
    var w = opts.w, h = opts.h;
    var patternRef = R.useRef(opts.pattern);
    var doneRef = R.useRef(opts.done);
    patternRef.current = opts.pattern;
    doneRef.current = opts.done;
    // ── BUGFIX: keep a live ref to the latest opts so stale callback
    //    closures inside dispatch/applyEffects always invoke the
    //    most-recently rendered onToggleCell / onCommitDrag /
    //    onCommitRange. Without this, useCallback memoisation on the
    //    pointer handlers (deps: [isEdit, cellAtPoint]) can pin the
    //    very first render's onToggleCell forever — which captures
    //    the first render's `done` array (typically all zeros) and
    //    therefore overwrites every prior in-session mark when the
    //    parent calls `setDone(new Uint8Array(staleDone))`.
    var optsRef = R.useRef(opts);
    optsRef.current = opts;

    var stateRef = R.useRef(initialState());
    var longPressTimerRef = R.useRef(null);
    var lastTouchStartRef = R.useRef(0);
    var bcastRef = R.useRef(0);

    var _ds = R.useState({ mode: 'idle', path: new Set(),
                            anchor: null, intent: null });
    var dragState = _ds[0], setDragState = _ds[1];

    function syncDragState() {
      var s = stateRef.current;
      setDragState({
        mode: s.mode, path: s.path,
        anchor: s.anchor, intent: s.intent,
      });
    }

    function clearLongPress() {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    function applyEffects(effects, captureEl, pointerId) {
      // Read opts via optsRef so stale handler closures (memoised by
      // useCallback) still invoke the latest parent callbacks.
      var o = optsRef.current;
      for (var i = 0; i < effects.length; i++) {
        var ef = effects[i];
        if (ef.type === 'TOGGLE_CELL') {
          if (typeof o.onToggleCell === 'function') o.onToggleCell(ef.idx);
        } else if (ef.type === 'COMMIT_DRAG') {
          if (typeof o.onCommitDrag === 'function') o.onCommitDrag(ef.set, ef.intent);
        } else if (ef.type === 'COMMIT_RANGE') {
          if (typeof o.onCommitRange === 'function') o.onCommitRange(ef.set, ef.intent);
        } else if (ef.type === 'START_LONG_PRESS') {
          clearLongPress();
          longPressTimerRef.current = setTimeout(function () {
            longPressTimerRef.current = null;
            dispatch({ type: 'LONG_PRESS_FIRED' });
          }, longPressMs());
        } else if (ef.type === 'CLEAR_LONG_PRESS') {
          clearLongPress();
        }
      }
    }

    function dispatch(action) {
      // Use optsRef for w/h too — the parent may resize the grid
      // (project switch) while a stale dispatch closure is still held
      // by a memoised pointer handler.
      var o = optsRef.current;
      var ctx = {
        w: o.w, h: o.h,
        pattern: patternRef.current,
        done: doneRef.current,
      };
      var r = dragMarkReducer(stateRef.current, action, ctx);
      stateRef.current = r.state;
      applyEffects(r.effects);
      syncDragState();
    }

    // Cleanup on unmount.
    R.useEffect(function () {
      return function () { clearLongPress(); };
    }, []);

    var isEdit = !!opts.isEditMode;
    var cellAtPoint = opts.cellAtPoint;

    var noop = R.useCallback(function () {}, []);

    var onPointerDown = R.useCallback(function (e) {
      if (isEdit) return;
      if (typeof cellAtPoint !== 'function') return;
      // Only respond to primary mouse / pen / touch.
      if (e.button !== undefined && e.button > 0) return;
      // Alt+click is reserved for relocating the spotlight focus block (see
      // tracker-app.js handleStitchMouseDown). Don't start a drag-mark on it.
      if (e.altKey) return;
      var t = (typeof performance !== 'undefined' && performance.now)
              ? performance.now() : Date.now();
      if (e.pointerType === 'touch') {
        // Track start time for multi-touch guard.
        lastTouchStartRef.current = t;
      }
      var idx = cellAtPoint(e.clientX, e.clientY);
      try {
        if (e.currentTarget && e.currentTarget.setPointerCapture
            && e.pointerId != null) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch (_) {}
      dispatch({
        type: 'POINTER_DOWN',
        idx: idx,
        x: e.clientX, y: e.clientY,
        time: t,
        pointerId: e.pointerId != null ? e.pointerId : 0,
        shiftKey: !!e.shiftKey,
        pointerType: e.pointerType || 'mouse',
      });
    }, [isEdit, cellAtPoint]);

    var onPointerMove = R.useCallback(function (e) {
      if (isEdit) return;
      if (stateRef.current.mode === 'idle'
          || stateRef.current.mode === 'range') return;
      if (typeof cellAtPoint !== 'function') return;
      var idx = cellAtPoint(e.clientX, e.clientY);
      var t = (typeof performance !== 'undefined' && performance.now)
              ? performance.now() : Date.now();
      dispatch({ type: 'POINTER_MOVE', idx: idx, x: e.clientX, y: e.clientY, time: t });
    }, [isEdit, cellAtPoint]);

    var onPointerUp = R.useCallback(function (e) {
      if (isEdit) return;
      if (typeof cellAtPoint !== 'function') return;
      var idx = cellAtPoint(e.clientX, e.clientY);
      var t = (typeof performance !== 'undefined' && performance.now)
              ? performance.now() : Date.now();
      dispatch({ type: 'POINTER_UP', idx: idx, time: t });
    }, [isEdit, cellAtPoint]);

    var onPointerCancel = R.useCallback(function () {
      if (isEdit) return;
      dispatch({ type: 'POINTER_CANCEL' });
    }, [isEdit]);

    var onContextMenu = R.useCallback(function (e) {
      // Suppress browser context menu on long-press in range mode.
      if (stateRef.current.mode === 'range' || stateRef.current.mode === 'drag'
          || stateRef.current.mode === 'shiftRange') {
        if (e && e.preventDefault) e.preventDefault();
      }
    }, []);

    // Exposed so the parent can forget the range-select anchor the instant
    // the Shift key is released (see SHIFT_UP in the reducer above) —
    // otherwise a stale anchor from long ago could silently be reused by
    // an unrelated later shift+click.
    var notifyShiftUp = R.useCallback(function () {
      dispatch({ type: 'SHIFT_UP' });
    }, []);

    if (isEdit) {
      return {
        handlers: {
          onPointerDown: noop, onPointerMove: noop,
          onPointerUp: noop, onPointerCancel: noop,
          onContextMenu: noop,
        },
        dragState: { mode: 'idle', path: new Set(),
                     anchor: null, intent: null },
        notifyShiftUp: noop,
      };
    }

    return {
      handlers: {
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerCancel: onPointerCancel,
        onContextMenu: onContextMenu,
      },
      dragState: dragState,
      notifyShiftUp: notifyShiftUp,
    };
  }

  // ─── Exports ─────────────────────────────────────────────────────────
  var internals = {
    isMarkableAt: isMarkableAt,
    rectIndices: rectIndices,
    intentForCell: intentForCell,
    dragMarkReducer: dragMarkReducer,
    initialState: initialState,
  };
  if (typeof window !== 'undefined') {
    window.useDragMark = useDragMark;
    window.__dragMarkInternals = internals;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({ useDragMark: useDragMark }, internals);
  }
})();
