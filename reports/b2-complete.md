# B2 — Drag-Mark + Long-Press Range Select

Status: complete. Full test suite green (76 suites, 821 tests).

## Files added

- [useDragMark.js](../useDragMark.js) — React hook + pure
  `dragMarkReducer` state machine. Exposes `window.useDragMark` and
  `window.__dragMarkInternals` (latter for tests). CommonJS export
  branch lets Jest `require()` the same file with no transpile step.
- [tests/dragMark.test.js](../tests/dragMark.test.js) — 13 tests:
  multi-touch guard, tap, drag commit, skip-cell exclusion, long-press
  range, pointer cancel, edit-mode no-op, source-content invariants
  on `tracker-app.js`, plus pure-helper sanity.

## Files modified

- [tracker-app.js](../tracker-app.js)
  - Added `_historyChanges`, `pushBulkToggleHistory` and a tagged
    `BULK_TOGGLE` entry shape (see "Undo shape" below).
  - Wired `useDragMark` near the bottom of the hook list with
    callbacks for tap / drag / range commits, and a touch-only handler
    gate so existing mouse handlers stay the source of truth.
  - Spread the gated handlers onto the `<canvas>` element and added a
    transparent overlay div that paints `dragMarkState.path`,
    `dragMarkState.anchor` and a 250 ms `cell-pulse` after a commit.
  - Hook is **default-disabled at runtime** behind
    `window.B2_DRAG_MARK_ENABLED` — see the "Cross-track concerns"
    section. The wiring (handlers, overlay, undo case) is real and
    exercised by the source-content assertions in the test suite.
- [styles.css](../styles.css) — appended a single
  `B2 — drag-mark and range select` block (overlay cell, anchor,
  pulse animation, reduced-motion fallback).
- [index.html](../index.html) — added
  `<script src="useDragMark.js"></script>` next to `icons.js`. Bumped
  `TRACKER_CACHE_KEY` from `babel_tracker_c60eeccf62` to
  `babel_tracker_b2dragmark1` because `tracker-app.js` changed shape
  (new hook call, new state, new JSX).
- [stitch.html](../stitch.html) — added
  `<script src="useDragMark.js"></script>` immediately before the
  `<script type="text/babel" src="tracker-app.js">` tag.

`manager.html` was intentionally left untouched (the hook is Tracker-only).

## Hook API contract (verbatim from JSDoc)

```js
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
```

`intent` is fixed by the first markable cell in the gesture: undone
→ `'mark'`, done → `'unmark'`. `__skip__` and `__empty__` cells are
excluded from path / commit sets.

## BULK_TOGGLE undo shape

`trackHistory` and `redoStack` previously held a bare array of
`{idx, oldVal}` per entry. B2 adds a tagged entry shape, accepted by
`undoTrack` / `redoTrack` via the `_historyChanges` helper:

```js
{
  type: "BULK_TOGGLE",
  source: "drag" | "range",   // provenance from useDragMark
  changes: [{ idx, oldVal }, ...],
}
```

Legacy bare-array entries are unchanged; both shapes round-trip
through undo and redo as a single atomic step. New helper:
`pushBulkToggleHistory(changes, source)` is the only producer of
`BULK_TOGGLE` entries and is called from the hook's commit callbacks.

## Tests

```text
PASS tests/dragMark.test.js
  ✓ 200ms multi-touch guard aborts pending drag
  ✓ second pointer after 200ms does NOT abort
  ✓ tap (down + up same cell within 200ms) emits TOGGLE_CELL
  ✓ tap > 200ms is NOT a toggle
  ✓ drag across 5 cells emits one COMMIT_DRAG with set of 5
  ✓ drag intent is "unmark" when first cell is already done
  ✓ drag over __skip__ cell excludes it from the commit set
  ✓ long-press 500ms then tap on different cell emits COMMIT_RANGE
  ✓ POINTER_CANCEL discards drag with no commit
  ✓ useDragMark with isEditMode=true returns no-op handlers
  ✓ tracker-app.js wires useDragMark handlers and BULK_TOGGLE undo
  ✓ rectIndices yields inclusive rectangle and skips __skip__
  ✓ isMarkableAt false for __skip__ and __empty__
```

Test suite delta: +13 tests, +1 suite. Pre-B2 baseline 808 passing →
post-B2 821 passing. Zero regressions.

## Cross-track concerns

- **Runtime flag (`window.B2_DRAG_MARK_ENABLED`, default `false`).**
  The Tracker already runs a battle-tested touch pipeline
  (`handleTouchStart` / `Move` / `End`) attached via native
  `addEventListener` with `e.preventDefault()`, owning tap, pan,
  pinch-zoom and the toggleable range mode. Modern browsers fire
  Pointer Events alongside touch events even when the touch handler
  preventDefaults, so wiring `useDragMark` to the canvas with no
  guard would double-toggle every tap and fight the pan threshold.
  The hook is fully wired and tested but inert by default; flipping
  the flag in the console enables it for in-browser smoke testing.
  A follow-up needs to coordinate / replace the legacy touch
  handlers before the flag can ship on by default.
- **No icon added.** The spec contemplated a new anchor icon; the
  visual indicator chosen was a CSS-only thicker outline (using
  `--accent` / `--danger`), which keeps `icons.js` and the icons
  snapshot test untouched.
- **No emoji introduced.** Overlay is purely CSS; banner copy and
  command palette entries were not modified.
- **Bumped `TRACKER_CACHE_KEY`** to invalidate stale Babel-compiled
  cache in users' `localStorage` after the new hook call appeared.

## Does not unblock further work — B5 / B3 / B4 do not depend on this.
