/* touch-constants.js — Centralised touch / pointer-gesture tuning.
   ════════════════════════════════════════════════════════════════
   Loaded as a plain <script> before useDragMark.js,
   creator/bundle.js, tracker-app.js, and manager-app.js so every
   gesture handler reads from one place.

   Exposes window.TouchConstants. Module export available for tests.

   Keep this file dependency-free. A matchMedia listener is registered
   at module evaluation time (when window is available) to invalidate
   the isCompactTouch() cache on orientation/pointer-type changes.
*/
(function () {
  'use strict';

  var C = {
    // ─── Tap / drag promotion ─────────────────────────────────────────
    // Movement under this distance keeps a pointer sequence in "tap"
    // mode. Once the pointer travels more than this, we promote to
    // "drag". 10 px matches Material Design's slop and is large enough
    // to absorb finger jitter on capacitive touchscreens.
    TAP_SLOP_PX: 10,

    // Pointer must stay within TAP_SLOP_PX AND lift within this many
    // milliseconds to count as a tap (else it's a "hold").
    TAP_HOLD_MS: 200,

    // Long-press recogniser fires after this long with the pointer
    // still down and within TAP_SLOP_PX of the start. 500 ms matches
    // iOS / Android system long-press.
    LONG_PRESS_MS: 500,

    // ─── Multi-touch arbitration ──────────────────────────────────────
    // When a second touch arrives within this window of the first,
    // we treat the gesture as multi-touch (pan / pinch) and abandon
    // any in-progress single-touch action without committing it.
    // Tightened from 200 ms (was: useDragMark.js, tracker-app.js) so
    // genuine 1-finger taps don't have to wait that long.
    MULTI_TOUCH_GRACE_MS: 100,

    // ─── Pinch-zoom ───────────────────────────────────────────────────
    // Combined finger movement under this many pixels is ignored so
    // tiny finger wobble during a 2-finger tap doesn't trigger zoom.
    PINCH_MIN_MOVE_PX: 4,

    // ─── Multi-finger tap shortcuts (track / view canvas) ─────────────
    // Maximum duration for a 2-finger or 3-finger tap to register as
    // an undo / redo shortcut. Above this it's treated as a pan.
    MULTI_FINGER_TAP_MAX_MS: 250,

    // Maximum movement allowed during a multi-finger tap.
    MULTI_FINGER_TAP_SLOP_PX: 8,

    // ─── Double-tap (zoom-to-fit) ────────────────────────────────────
    DOUBLE_TAP_MAX_MS: 300,
    DOUBLE_TAP_MAX_DIST_PX: 24,

    // ─── Pan ──────────────────────────────────────────────────────────
    // Two-finger pan threshold: combined centroid movement before pan
    // begins. Smaller than TAP_SLOP_PX so 2-finger pans feel snappy.
    PAN_THRESHOLD_PX: 6,

    // ─── Touch-target floor ──────────────────────────────────────────
    // Minimum interactive size on touch viewports (CSS px). Buttons
    // below this should grow to it via the .ts-44 helper.
    TOUCH_TARGET_MIN_PX: 44,

    // ─── Edge-swipe reveal (lpanel) ──────────────────────────────────
    // Distance from the screen edge in which a 1-finger drag will
    // open / close the lpanel.
    EDGE_SWIPE_GUTTER_PX: 20,
    EDGE_SWIPE_TRIGGER_PX: 32,

    // ─── Compact-touch breakpoint ────────────────────────────────────
    // Used by JS that needs to mirror the CSS rule:
    //   @media (max-width: 1024px) and (pointer: coarse)
    COMPACT_TOUCH_MEDIA: '(max-width: 1024px) and (pointer: coarse)',

    // ─── Focus-mode controls auto-fade ───────────────────────────────
    FOCUS_MINIBAR_FADE_MS: 4000,
    FOCUS_MINIBAR_FADE_OPACITY: 0.30,
  };

  // Helper: detect whether the current viewport is a "compact touch"
  // device (covers phones and most tablets). Cached after first call;
  // returns false in non-DOM environments (Node tests).
  var _compactTouch = null;
  C.isCompactTouch = function isCompactTouch() {
    if (_compactTouch !== null) return _compactTouch;
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try { _compactTouch = window.matchMedia(C.COMPACT_TOUCH_MEDIA).matches; }
    catch (_) { _compactTouch = false; }
    return _compactTouch;
  };

  // Reset the cache (used by tests; also when device orientation
  // changes such that pointer:coarse may have flipped).
  C.resetCompactTouchCache = function () { _compactTouch = null; };
  if (typeof window !== 'undefined' && window.matchMedia) {
    try {
      var mq = window.matchMedia(C.COMPACT_TOUCH_MEDIA);
      var onChange = function () { _compactTouch = null; };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    } catch (_) {}
  }

  if (typeof window !== 'undefined') {
    window.TouchConstants = C;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = C;
  }
})();
