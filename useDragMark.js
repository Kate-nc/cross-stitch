/* useDragMark.js — B2: Drag-Mark + Long-Press Range Select.
   ════════════════════════════════════════════════════════════
   A React hook for the Stitch Tracker grid that unifies tap,
   drag-mark, and long-press range-select gestures across mouse
   and touch input.

   Loaded as a plain <script> before tracker-app.js.
   Exposes window.useDragMark and (for tests) window.__dragMarkInternals.

   API
   ───
     const { handlers, dragState } = window.useDragMark({
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
     // Use dragState to paint a translucent overlay:
     //   { mode: 'idle'|'pending'|'drag'|'range',
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
   5. Mouse: click+drag = drag-mark; shift+click commits a range from the
      most recent anchor.
   6. Pointer cancel discards the gesture.                                */
(function () {
  'use strict';

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
        startIdx: -1, startTime: 0, pointerId: null, moved: false,
        lastAnchor: s.lastAnchor, pointerCount: 0,
      };
    }

    switch (action.type) {
      case 'POINTER_DOWN': {
        // Multi-touch guard: a second pointer within 200ms aborts.
        if (s.mode !== 'idle') {
          if (action.pointerType === 'touch'
              && (action.time - s.startTime) < 200) {
            effects.push({ type: 'CLEAR_LONG_PRESS' });
            return { state: idle(), effects: effects };
          }
          return { state: s, effects: effects };
        }

        // Shift+click: commit a range from the last anchor (mouse path).
        if (action.shiftKey && s.lastAnchor != null
            && isMarkableAt(ctx.pattern, action.idx)
            && isMarkableAt(ctx.pattern, s.lastAnchor)) {
          var rs = rectIndices(s.lastAnchor, action.idx,
                               ctx.w, ctx.h, ctx.pattern);
          var ri = intentForCell(ctx.done, s.lastAnchor);
          effects.push({ type: 'COMMIT_RANGE',
                         set: rs, intent: ri });
          return {
            state: next({ lastAnchor: action.idx }),
            effects: effects,
          };
        }

        // Pending: nothing committed yet.
        var path = new Set();
        if (isMarkableAt(ctx.pattern, action.idx)) path.add(action.idx);
        effects.push({ type: 'START_LONG_PRESS' });
        return {
          state: {
            mode: 'pending',
            path: path,
            anchor: null,
            intent: null,
            startIdx: action.idx,
            startTime: action.time,
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
        if (action.idx === s.startIdx && !s.moved && s.mode === 'pending') {
          // Still on first cell — no transition.
          return { state: s, effects: effects };
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
          if (dt <= 200 && action.idx === s.startIdx
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
        if (s.mode !== 'idle' && (action.time - s.startTime) < 200) {
          effects.push({ type: 'CLEAR_LONG_PRESS' });
          return { state: idle(), effects: effects };
        }
        return { state: s, effects: effects };
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
      startIdx: -1, startTime: 0, pointerId: null, moved: false,
      lastAnchor: null, pointerCount: 0,
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
          }, 500);
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
      dispatch({ type: 'POINTER_MOVE', idx: idx, time: t });
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
      if (stateRef.current.mode === 'range' || stateRef.current.mode === 'drag') {
        if (e && e.preventDefault) e.preventDefault();
      }
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
