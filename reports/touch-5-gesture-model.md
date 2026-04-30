# touch-5 — Proposed Gesture Model

Design goal: **every gesture has exactly one meaning per mode, and
the user can always pan and zoom without modifying the pattern.**

This is a proposal awaiting review (Phase 3 gate). Read alongside
`touch-1-gesture-inventory.md` (current state), `touch-3-touch-research.md`
(rationale from peer apps), and `touch-4-gesture-conflicts.md`
(conflicts being resolved).

──────────────────────────────────────────────────────────────────────
## Universal rules (apply in every mode)
──────────────────────────────────────────────────────────────────────

1. **Two-finger drag = pan. Pinch = zoom.** Always. Never anything
   else. Cancels any in-flight one-finger action when the second
   finger arrives within 100 ms (grace window).
2. **Two-finger tap = undo. Three-finger tap = redo.** Optional but
   strongly recommended. Conventional in Procreate, Pixaki, Affinity.
3. **Long-press = secondary / context action.** Never a destructive
   primary action. Long-press always opens a contextual menu, never
   commits a change.
4. **Tap commits on POINTER_UP**, with a visual touchdown preview
   between POINTER_DOWN and POINTER_UP. The user can slide off the
   cell to cancel before lifting.
5. **Active mode and active tool are persistently visible** in the
   toolbar / floating chip — the user is never unsure what their next
   tap will do.
6. **Canvas surfaces use `touch-action:none`**. Preview surfaces use
   `touch-action:pan-y pinch-zoom` (allow native scroll/pinch over
   them since they're read-only).
7. **`overscroll-behavior:contain`** on canvas containers to defeat
   pull-to-refresh.
8. **Disambiguation thresholds (configurable, exported from a single
   constants module):**
   - `TAP_SLOP_PX = 10` — movement under 10 px stays a tap.
   - `TAP_HOLD_MS = 200` — POINTER_DOWN → POINTER_UP within 200 ms
     and < 10 px = tap.
   - `LONG_PRESS_MS = 500` — pointer down with < 5 px movement for
     500 ms = long-press. Cancelled by any movement > 5 px.
   - `MULTI_TOUCH_GRACE_MS = 100` — when a second finger arrives
     within 100 ms of the first, abort any in-flight one-finger
     action and switch to two-finger mode. (The current 200 ms is
     too loose — taps fire and then get aborted, causing flicker.)
   - `PINCH_MIN_MOVE_PX = 4` — pinch-zoom only kicks in once the
     two fingers have moved relative to each other by ≥ 4 px (avoids
     accidental zoom from a still two-finger touch that's actually
     trying to undo).
   - `UNDO_TAP_MAX_MS = 250` — for two-finger / three-finger tap to
     register as undo/redo, both fingers must lift within 250 ms of
     touchdown without crossing PINCH_MIN_MOVE_PX.

──────────────────────────────────────────────────────────────────────
## Edit mode (Pattern Creator)
──────────────────────────────────────────────────────────────────────

The Edit mode tool model has two states the user explicitly chooses
between:

- **Tool tools** (paint, eraseAll, fill, eyedropper, magicWand, lasso,
  backstitch, eraseBs, partial-stitch tools) — primary action runs on
  one-finger.
- **Hand tool (new)** — explicit "view / pan" mode. Primary action
  with one finger is pan. This replaces the current "no tool selected"
  behaviour as a discoverable, named tool.

The active tool is shown in the toolbar with a clear highlight
(`tb-btn--on`) and mirrored in a small status chip near the canvas.

| Gesture | Hand tool | Paint / Erase brush | Fill / Wand / Eyedropper / Backstitch / Lasso |
|---|---|---|---|
| 1-finger tap (< 10 px / 200 ms) | Show cell info popover | Place / erase 1 stitch (commit on UP, preview on DOWN) | Run tool once, with **10 px slop** before commit |
| 1-finger drag (> 10 px) | **Pan** | Brush along path (10 px slop before stroke begins) | Tool-specific: lasso freehand extends path; otherwise treat as pan, do not run tool |
| 1-finger long-press (500 ms still) | Open cell context menu | Open cell context menu | Open cell context menu |
| 2-finger drag | Pan + pinch | Pan + pinch (cancels in-flight stroke) | Pan + pinch |
| Pinch | Zoom 0.05–3 × | Zoom | Zoom |
| 2-finger tap (both lift < 250 ms) | Undo | Undo | Undo |
| 3-finger tap | Redo | Redo | Redo |
| Double-tap | Zoom-to-fit (toggle between 100 % and fit-screen) | Same | Same |

Notable changes from current behaviour:
- **E-1 fixed**: 1-finger pan now exists in every tool state, either
  via the explicit Hand tool or via "drag in a non-paint/non-lasso
  tool = pan" (rather than re-firing the tool).
- **E-2 fixed**: every tool now has a 10 px slop before committing.
  Fill / wand / eyedropper / backstitch defer the action to POINTER_UP
  and only commit if movement < 10 px.
- **E-3 fixed**: long-press works in every tool state.
- **E-5 fixed**: Hand tool replaces the spacebar-pan workflow on touch.
- **E-6 added**: undo / redo gestures.
- **E-7 fixed**: long-press = context menu in every tool state.

### Edit-mode feedback

| Gesture | Visual feedback during gesture |
|---|---|
| Tap touchdown (paint) | Cell shows a translucent fill of the selected colour at 60 % opacity; commits on UP, fades to 100 % on success. Slide off cell before UP to cancel (returns to original). |
| Drag (paint) | Cells fill behind the finger immediately at 100 % opacity (this is also the commit; UP only ends the stroke). |
| Pan | Subtle 4 % opacity translucent border-shadow on the canvas indicating "scrolling"; cursor for mouse changes to grab. |
| Pinch | Smooth scale animation, focal point centred on midpoint of two fingers. Brief percent-zoom indicator overlay (top-right, fades after 600 ms). |
| Long-press | Cell shows pulsing outline; haptic tap (`navigator.vibrate(10)`) at 500 ms; menu appears. |
| Undo gesture | Toast "Undone" with last-action description; brief screen-edge pulse. |

### Edge behaviour
- At canvas boundaries: pan clamps to the edge (no overscroll into
  empty space). Pinch clamps zoom at 0.05 / 3.0.
- During pan momentum (RAF-driven): pan ends immediately on POINTER_UP
  (no inertia for now — keeps the cell-grid feeling precise).
- "User starts panning then realises they wanted to place": there is
  no recovery path because the tap-vs-drag threshold has already
  decided. They can always tap again after lifting.

──────────────────────────────────────────────────────────────────────
## Track mode (Stitch Tracker)
──────────────────────────────────────────────────────────────────────

Track mode adopts the same Hand-tool concept, paired with the existing
Mark tool (default).

The active tool is shown in the bottom action-bar (the existing
`tracker-action-bar` already has space for this).

| Gesture | Mark tool (default) | Hand tool | Range tool (existing range-anchor as an explicit tool) |
|---|---|---|---|
| 1-finger tap | Toggle done/undone on cell | Show cell info popover | Place / move range anchor |
| 1-finger drag (> 10 px) | Mark/unmark a run; intent locked from first cell (10 px slop) | **Pan** | Drag the second corner of the range; commit on UP |
| 1-finger long-press | Open cell context menu (info / "go to colour" / focus block) | Same | Same |
| 2-finger drag | Pan + pinch | Pan + pinch | Pan + pinch |
| Pinch | Zoom 0.3–4 × | Zoom | Zoom |
| 2-finger tap | Undo last mark | Undo | Undo |
| 3-finger tap | Redo | Redo | Redo |
| Double-tap | Zoom-to-fit (toggle 100 % / fit) | Same | Same |

Notable changes from current behaviour:
- **T-1 fixed**: 1-finger pan exists via the Hand tool. Mark-tool drag
  retains 10 px slop (so a 1-finger pan attempt that strays into Mark
  tool no longer marks if movement < 10 px).
- **T-2 fixed**: long-press is now a context menu (cell info / focus
  block / clear focus / "go to colour"), not a destructive range
  commit.
- **T-3 fixed**: focus-block is reachable from the long-press context
  menu.
- **T-4 fixed**: clear-focus is reachable from the context menu.
- **T-5 added**: undo / redo gestures.
- **T-7 added**: tap touchdown shows preview before commit.
- **T-8 fixed (separately)**: media queries switch from
  `(pointer:coarse)` to `(max-width:1024px) or (pointer:coarse)` so
  iPad-with-Pencil gets the touch layout.

### Track-mode feedback

| Gesture | Feedback |
|---|---|
| Tap touchdown | Cell shows a translucent done-marker (or undo-marker) at 60 % opacity; commits on UP. Haptic tap on commit (`vibrate(8)`). |
| Drag-mark | Cells fill behind the finger as the mark commits to each. |
| Pan (Hand tool) | Same as Edit. |
| Long-press | Pulsing outline + light haptic; menu opens with cell info, focus-block, "go to next of colour", etc. |
| Range-tool drag | Marching-ants rectangle preview, commits on UP. |

──────────────────────────────────────────────────────────────────────
## View mode (preview / realistic canvas)
──────────────────────────────────────────────────────────────────────

| Gesture | Action |
|---|---|
| 1-finger drag | Pan |
| Pinch | Zoom |
| 1-finger tap | Show cell info popover |
| Long-press | Same context menu (info only — no editing actions) |
| Double-tap | Zoom-to-fit |
| 2-finger tap | (no-op; consistency) |

`touch-action: pan-x pan-y pinch-zoom` is the goal, but our app needs
to override pinch to keep it on the canvas content (not the page), so
in practice we set `touch-action: none` and handle gestures.

──────────────────────────────────────────────────────────────────────
## Disambiguation logic (the actual rules)
──────────────────────────────────────────────────────────────────────

```
on POINTER_DOWN (touch):
  if active pointers > 1:
    cancel any in-flight one-finger action
    switch to two-finger mode (await pinch / undo-tap / pan)
  else:
    record startX, startY, startTime
    start LONG_PRESS_MS timer
    set state = "pending"

on POINTER_MOVE (touch):
  if state == "two-finger":
    distMoved = |currentDist - startDist|
    if distMoved >= PINCH_MIN_MOVE_PX:
      enter "pinch" mode → update zoom + scroll
    else:
      pan based on midpoint delta
  else if state == "pending":
    delta = hypot(x - startX, y - startY)
    if delta >= TAP_SLOP_PX:
      cancel long-press timer
      if tool needs drag (paint / erase / lasso freehand):
        state = "drag"; run tool
      else:
        state = "pan"; pan canvas
    else: stay pending

on second finger arrives:
  if (now - startTime) < MULTI_TOUCH_GRACE_MS:
    cancel any pending action (don't commit on lift)
    state = "two-finger"
  else if state == "drag":
    commit drag-so-far, switch to two-finger mode
  else: switch to two-finger mode

on POINTER_UP:
  if state == "pending":
    if (now - startTime) <= TAP_HOLD_MS:
      commit tap (run tool's tap action)
  else if state == "drag":
    commit drag
  else if state == "pan" or state == "pinch":
    nothing (gesture is its own commit)
  cancel long-press timer

on LONG_PRESS_MS elapsed (no movement, single finger down):
  if state == "pending":
    state = "long-press"
    open context menu (light haptic)
    cancel any subsequent commit on this pointer

on POINTER_CANCEL:
  reset all state, no commit
```

For two-finger / three-finger tap (undo / redo):
```
when second / third finger lands:
  if all fingers are within PINCH_MIN_MOVE_PX of their landing positions
    AND all lift within UNDO_TAP_MAX_MS:
    fire undo (2 fingers) or redo (3 fingers)
```

──────────────────────────────────────────────────────────────────────
## Browser-default mitigations
──────────────────────────────────────────────────────────────────────

| Default | Mitigation |
|---|---|
| Pull-to-refresh | `overscroll-behavior: contain` on body and canvas wrappers; canvases use `touch-action: none` |
| Browser back-swipe (iOS Safari) | Cannot fully disable; mitigate with a 16 px gutter at the edges where canvas pan is suppressed (rely on two-finger pan in that zone). Document for users. |
| Page pinch-zoom | `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">`. Verify `index.html`, `stitch.html`, `manager.html`, `home.html` all set this. |
| Long-press text selection | `user-select: none` on canvas wrappers, toolbars, action bars, status bars. Keep allowed in modals, notes textarea, and the legend rows so users can copy DMC numbers. |
| 300 ms tap-delay | `touch-action: manipulation` on every interactive non-canvas element. |

──────────────────────────────────────────────────────────────────────
## Constants module (proposed)
──────────────────────────────────────────────────────────────────────

New file `touch-constants.js` (loaded before useDragMark.js and
useCanvasInteraction.js):

```js
window.TOUCH = {
  TAP_SLOP_PX: 10,
  TAP_HOLD_MS: 200,
  LONG_PRESS_MS: 500,
  LONG_PRESS_SLOP_PX: 5,
  MULTI_TOUCH_GRACE_MS: 100,
  PINCH_MIN_MOVE_PX: 4,
  UNDO_TAP_MAX_MS: 250,
  EDIT_PAN_THRESHOLD_PX: 10,   // for non-brush tools, drag = pan beyond this
  TRACK_PAN_THRESHOLD_PX: 10,
  ZOOM_EDIT_MIN: 0.05, ZOOM_EDIT_MAX: 3,
  ZOOM_TRACK_MIN: 0.3, ZOOM_TRACK_MAX: 4,
};
```

──────────────────────────────────────────────────────────────────────
## What does NOT change
──────────────────────────────────────────────────────────────────────

- Keyboard shortcuts (P/F/W/etc.) all work as today.
- Spacebar-pan still works on desktop with mouse.
- Mouse interactions (click, drag, right-click, alt+click, ctrl+wheel,
  shift+click) are unchanged.
- Existing tool buttons remain in the same toolbar with the same
  icons and same labels.
- Bundle size impact is minimal (constants module + ~ 80 lines in
  useCanvasInteraction).
