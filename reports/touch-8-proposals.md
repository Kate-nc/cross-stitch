# touch-8 — Prioritised Improvement Proposals

Consolidates Phase 2 designs into a single ordered backlog, grouped
by severity. Each item references the gesture-model / panel / toolbar
docs for detail. Implementation complexity is sized **S** (≤ a day),
**M** (a few days), **L** (a week+) including tests + bundle rebuild.

──────────────────────────────────────────────────────────────────────
## 🔴 Critical — gesture clarity
──────────────────────────────────────────────────────────────────────

### C-1. Add the explicit Hand / Pan tool to Edit and Track modes
- **Problem (E-1, T-1)**: 1-finger pan is unavailable in any tool
  state on Edit, and races with drag-mark on Track. Users cannot
  reliably pan the chart with one finger.
- **Change**: New tool with icon `Icons.hand` (add to icons.js) in
  both ToolStrip (creator) and the tracker top toolbar / action bar.
  When active, 1-finger drag pans, 1-finger tap shows cell info.
  Two-finger pan still works in every other tool.
- **Affected**: Edit mode (creator), Track mode (tracker).
- **Complexity**: **M** (icon, button, tool state branch in
  useCanvasInteraction + tracker, mini-bar entry).

### C-2. Add 10 px slop + POINTER_UP commit to Fill / Wand / Eyedropper / Backstitch / Lasso (Edit)
- **Problem (E-2)**: These tools fire on POINTER_DOWN with zero
  slop; an accidental touchdown commits the action.
- **Change**: Defer commit to POINTER_UP for tools whose action is
  a single tap. If movement > 10 px before UP, treat as a pan
  (in Hand-tool semantics) and don't fire the tool.
- **Affected**: Edit mode.
- **Complexity**: **S/M** in `useCanvasInteraction.js` —
  `handlePatPointerDown` for these tools currently calls
  `handlePatClick` immediately; change to record a pending tap and
  fire only on UP.

### C-3. Refit drag-mark slop in Track mode
- **Problem (T-1, residual)**: useDragMark promotes to drag with
  zero pixel slop (cell-boundary crossing only). Even with the Hand
  tool fixing the pan use-case, a stitcher who's in Mark mode and
  jiggles their finger ≥ 1 cell-width still marks unintended cells.
- **Change**: Add a 10 px slop *additional* to the cell-boundary check
  in `useDragMark.js` POINTER_MOVE — promotion to `drag` requires
  both (a) crossing into a different cell AND (b) total movement >
  TAP_SLOP_PX. Below the slop, stay `pending`.
- **Affected**: Track mode.
- **Complexity**: **S** — small change in the reducer; existing tests
  cover the gesture extraction.

### C-4. Tighten multi-touch grace window to 100 ms
- **Problem**: Current 200 ms guard in useDragMark + 200 ms `pinchDist
  > 0` window in tracker-app.js cause visible commit-then-abort
  flickers when a slightly-late second finger lands.
- **Change**: `MULTI_TOUCH_GRACE_MS = 100` in the new constants module.
- **Affected**: Track mode primarily; Edit mode also benefits.
- **Complexity**: **S**.

### C-5. Set `touch-action: none` + `overscroll-behavior: contain` on tracker canvas wrapper
- **Problem**: Pull-to-refresh / native pinch flicker on iOS Safari.
  Currently the only mitigation is `passive:false` JS.
- **Change**: Add `touch-action:none; overscroll-behavior:contain` to
  the tracker `.canvas-area` and `.canvas-wrapper` selectors.
- **Affected**: Track mode.
- **Complexity**: **S** (CSS).

### C-6. Set viewport meta to `maximum-scale=1, user-scalable=no` on touch pages
- **Problem**: Page pinch-zooms over header / toolbar / modals.
- **Change**: Verify and set viewport meta consistently on
  index.html, create.html, stitch.html, manager.html, home.html.
- **Affected**: Everywhere.
- **Complexity**: **S**.

──────────────────────────────────────────────────────────────────────
## 🟠 High — panel and full-screen
──────────────────────────────────────────────────────────────────────

### H-1. Three-state lpanel (open / rail / hidden)
- **Problem**: Today the lpanel is open or hidden; on tablet landscape
  it eats most of the canvas when open and is invisible when closed.
- **Change**: Implement the rail state per `touch-6-panel-design.md`.
  Cycle order: hidden → rail → open → hidden via hamburger; swipe-from-
  edge reveals on mobile.
- **Affected**: Track mode.
- **Complexity**: **M** — mostly CSS + state machine in tracker-app.js.

### H-2. Full-screen / Focus mode
- **Problem**: No explicit focus mode; immersive-on-scroll only fires
  on scroll-down which is rare on a paged canvas.
- **Change**: Implement Focus mode per `touch-6-panel-design.md`.
  Floating mini-bar at bottom-center with always-visible Exit.
  Toggle button in top toolbar; `F` keyboard shortcut.
- **Affected**: Edit + Track.
- **Complexity**: **M/L** — new component, mini-bar layout, full-screen
  CSS class on body, browser Fullscreen API option.

### H-3. Switch responsive breakpoints from `(pointer:coarse)` to viewport-width-aware queries
- **Problem (T-8)**: iPad with Apple Pencil reports `pointer:fine` and
  misses every mobile-only style.
- **Change**: Replace `@media (pointer:coarse)` with
  `@media (pointer:coarse), (max-width:1024px)` (or unify on
  viewport-width queries with breakpoints 600/900/1024). Audit each
  occurrence in styles.css.
- **Affected**: Everywhere.
- **Complexity**: **M** — mechanical but ~ 20 places to update; needs
  visual regression check.

### H-4. Move creator ToolStrip to bottom on touch viewports
- **Change**: CSS-only — `position:fixed; bottom:0` at `(pointer:coarse)
  or (max-width:1024px)`. Pad canvas-area accordingly.
- **Affected**: Edit mode.
- **Complexity**: **S** — CSS + verify scroll-area maths.

### H-5. Add tap visual preview for stitch placement and marking
- **Problem (T-7)**: Tap commits without a pre-commit visual.
- **Change**: On POINTER_DOWN, render a translucent preview of the
  about-to-commit cell (60 % opacity). Commit on UP; cancel on slide-
  off. Light haptic on commit.
- **Affected**: Edit + Track.
- **Complexity**: **M** — touches the canvas redraw path; needs to
  not jank on 1000-cell drags.

### H-6. Long-press = context menu in every tool state
- **Problem (E-3)**: Long-press only works when no tool is active in
  Edit; in Track it does range-anchor.
- **Change**: Long-press always opens a context menu. The menu's items
  vary by mode (cell info, focus block, eyedropper, copy DMC code,
  etc.). Range-anchor moves to its own explicit Range tool.
- **Affected**: Edit + Track.
- **Complexity**: **M**.

──────────────────────────────────────────────────────────────────────
## 🟡 Medium — feedback and polish
──────────────────────────────────────────────────────────────────────

### M-1. Two-finger tap = undo, three-finger tap = redo
- **Change**: Implement per the disambiguation logic in `touch-5`.
- **Affected**: Edit + Track.
- **Complexity**: **M**.

### M-2. Double-tap = zoom-to-fit toggle
- **Change**: Currently no double-tap handling. Add a 280 ms
  double-tap detector that toggles between 100 % zoom and fit-screen.
- **Affected**: Edit + Track + View.
- **Complexity**: **S**.

### M-3. Touch target floor pass
- **Change**: Apply the sizing changes in `touch-7-toolbar-design.md`
  to every selector listed. Audit modals for native checkbox hit areas.
- **Affected**: Everywhere.
- **Complexity**: **M** — touches many CSS rules.

### M-4. Persistent status chip showing active tool + colour
- **Change**: Bottom-left chip per `touch-7`.
- **Affected**: Edit + Track.
- **Complexity**: **S/M**.

### M-5. Haptic feedback (Vibration API)
- **Change**: 8 ms pulse on stitch commit, 12 ms pulse on long-press
  fire, 20 ms on undo. Respect `prefers-reduced-motion` (skip
  vibration) and a UserPrefs `hapticsEnabled` toggle.
- **Affected**: Edit + Track.
- **Complexity**: **S**.

### M-6. Gesture guide overlay shown on first touch session
- **Change**: One-time onboarding card listing the gesture model:
  "1-finger tap = mark, 2-finger drag = pan, pinch = zoom, long-
  press = context menu, 2-finger tap = undo". Dismissable; never
  reappears (UserPrefs `gestureGuideShown`). Re-accessible from Help.
- **Affected**: Edit + Track.
- **Complexity**: **S**.

### M-7. Long-press sub-menus on tools
- **Change**: Long-press Lasso / Wand / Brush / Eraser → sub-menu.
- **Affected**: Edit mode.
- **Complexity**: **S/M**.

### M-8. Disable text selection on canvas wrappers and toolbars
- **Change**: `user-select:none` on `.canvas-area`, `.tool-strip`,
  `.tracker-action-bar`, `.tb-progress`. Keep enabled on legend rows
  and notes.
- **Affected**: Everywhere.
- **Complexity**: **S** (CSS).

### M-9. Long-press on rail's swatch / on action-bar colour chip = open palette
- **Change**: Quality-of-life shortcut for switching the active colour
  without opening the panel.
- **Affected**: Track mode.
- **Complexity**: **S**.

### M-10. View / preview canvas: implement explicit pan + pinch
- **Problem (V-1)**: Today preview canvases let the page pinch-zoom.
- **Change**: Add `touch-action:none` + minimal pan/pinch handlers
  (single-tap shows cell info; pinch zooms within canvas).
- **Affected**: Preview, Realistic preview.
- **Complexity**: **M**.

### M-11. Consolidate constants in `touch-constants.js`
- **Change**: New shared module loaded before useDragMark and
  useCanvasInteraction (per `touch-5`).
- **Complexity**: **S**.

### M-12. Edge-gutter zone (16 px from left/right edges) suppresses
1-finger pan
- **Problem**: Browser back/forward swipe on iOS Safari intercepts.
- **Change**: In Hand-tool / pan handler, ignore touches that start
  within 16 px of the screen edge. User can two-finger pan in those
  zones.
- **Complexity**: **S**.

──────────────────────────────────────────────────────────────────────
## Cross-cutting non-functional
──────────────────────────────────────────────────────────────────────

- **Tests**: Each gesture change needs a baseline test (current
  behaviour) committed first, then a "new behaviour" test alongside
  the change. Existing useDragMark tests are a good model.
- **Bundle**: After every `creator/*.js` edit, run `node build-creator-
  bundle.js`. New constants module added to script load order in
  `index.html`, `stitch.html`, `manager.html`, `home.html`.
- **Repo memory** for "icons added when needed" applies — at minimum
  add `Icons.hand` and `Icons.fullscreen` (or `focus`) and update the
  icons snapshot test with `--updateSnapshot`.

──────────────────────────────────────────────────────────────────────
## Implementation order suggestion (Phase 5 plan)
──────────────────────────────────────────────────────────────────────

1. Constants module + viewport meta + touch-action/overscroll CSS
   (C-4, C-5, C-6, M-11) — small CSS/HTML changes, low risk.
2. Baseline test commits for current Edit + Track gestures.
3. Slop fixes (C-2, C-3) — minimal behavioural change with safety net.
4. Hand tool (C-1) — biggest UX win; requires icons + tool branches.
5. Long-press → context menu unification (H-6) and Range tool
   extraction.
6. Three-state lpanel (H-1).
7. Full-screen Focus mode (H-2).
8. Toolbar bottom-positioning + sizing pass (H-4, M-3, M-4).
9. Visual feedback (H-5, M-5).
10. Convenience gestures (M-1, M-2, M-7, M-9).
11. Breakpoint cleanup (H-3) — last because it touches many CSS rules.
12. Gesture guide overlay (M-6).
13. Preview canvas pan/pinch (M-10).

──────────────────────────────────────────────────────────────────────
## Risk register
──────────────────────────────────────────────────────────────────────

| Risk | Mitigation |
|---|---|
| Desktop regression — mouse handlers share code with touch | Separate touch-only code paths via `pointerType` checks; baseline tests before each change |
| Existing useDragMark tests break | Update tests alongside the slop change in C-3; keep the reducer's pure-function signature unchanged |
| Bundle / load-order breakage | Add new constants script before useDragMark + useCanvasInteraction in every HTML; verify via load |
| Pattern Keeper PDF regression | None — gesture changes don't touch pdf-export-worker.js or related files |
| iPad-Pencil users seeing layout flicker after H-3 breakpoint switch | Test on real device; use a feature flag if needed |
