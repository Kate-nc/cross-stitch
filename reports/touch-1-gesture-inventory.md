# touch-1 — Gesture & Touch-Target Inventory

Audit of every touch-relevant interaction in the cross-stitch app at
tablet (768–1024 px) and phone (375 px) viewports. Read alongside
`touch-2-screen-audit.md` (per-screen layout) and `touch-4-gesture-conflicts.md`
(matrix view).

Format: gesture → intended/actual behaviour → visual feedback →
discoverability → conflict notes → code refs.

──────────────────────────────────────────────────────────────────────
## 1. Edit-mode canvas (Pattern Creator — `index.html` / `create.html`)
──────────────────────────────────────────────────────────────────────

Source of truth: [creator/useCanvasInteraction.js](../creator/useCanvasInteraction.js)
mounted on the React canvas in [creator/PatternCanvas.js](../creator/PatternCanvas.js)
(`<canvas onPointerDown / onPointerMove / onPointerUp / onPointerLeave /
onPointerCancel / onContextMenu>` at lines 156–180, with `style={{touchAction:"none"}}`).

The handler is a unified Pointer Events implementation (`handlePatPointerDown`
etc., lines 580–780). Touch and mouse share the same code path; the path
branches on `e.pointerType === "touch"` and on `activeTool` /
`partialStitchTool`.

| Gesture | Intended | Actual | Visual feedback | Discoverable | Conflict / notes | Code |
|---|---|---|---|---|---|---|
| One-finger tap (no tool) | Nothing — navigation only | Long-press timer arms; tap exits with no effect | Cursor reset only | No | OK | useCanvasInteraction.js:619, 633 |
| One-finger drag (no tool) | Pan canvas | Pans canvas via `scrollLeft/scrollTop` deltas | Scroll position updates; no inertia, no pan cursor | No | OK | useCanvasInteraction.js:619-628 |
| One-finger long-press (no tool) | Open cell context menu | Opens `setContextMenu({x,y,gx,gy,idx,cell})` after 500 ms with no movement | None during the 500 ms wait | No (no hint) | OK; cancelled by any movement > 10 px | useCanvasInteraction.js:631-655 |
| One-finger tap (paint/erase tool) | Place stitch at cell | Promotes immediately to `handlePatMouseDown` → `applyBrush` → commits 1 cell on POINTER_UP | Cell repaints during touchdown | Yes (paint cursor) | **No 1-finger pan available** when a tool is active — pan is two-finger only | useCanvasInteraction.js:678-682 |
| One-finger drag (paint/erase tool) | Draw a line of stitches | Same as above — `applyBrush` runs each `handlePatMouseMove` | Cells fill as finger moves | Yes | Cannot be cancelled into a pan — once committed it commits to every cell traversed; only the user lifting and starting two fingers stops it | useCanvasInteraction.js:725-728 |
| One-finger tap (fill / magic wand / lasso point / eyedropper / backstitch / eraseBs) | Fire single-shot tool | `handlePatPointerDown` → `handlePatMouseDown` → `handlePatClick` once on POINTER_DOWN. No tap/drag disambiguation: there's no slop window, the tool fires immediately on touchdown | Tool-specific (fill flash, lasso point dot, marching-ants preview) | Yes (cursor change) | **No 10 px slop for these tools** — accidental sub-pixel movement on touch still triggers; can't pan while one of these tools is active | useCanvasInteraction.js:584-680 |
| One-finger long-press (paint/erase tool) | Nothing | Timer never starts because pendingTap branch is gated by `(!activeTool && !partialStitchTool)` | None | No | Long-press only works in the navigation/no-tool state | useCanvasInteraction.js:619 |
| One-finger long-press (backstitch tool) | Cancel backstitch start point | After 500 ms of no movement, `setBsStart(null)` | None | No | Special-cased at line 657 | useCanvasInteraction.js:657-676 |
| Two-finger drag | Pan + zoom (pinch) | Switches to `pinchStateRef`; `updatePinchGesture()` recalculates zoom + scroll on every move; cancels in-flight drag with `cancelDragSession()` | Smooth zoom around midpoint; scroll position updated each RAF | Yes — works the same in any tool | OK; clean two-finger takeover | useCanvasInteraction.js:79-119, 692-705 |
| Pinch | Zoom (0.05–3 ×) | Computes `nextZoom = startZoom * dist/startDist`, clamped, focal point = midpoint of two fingers in canvas coords | Round to 0.01 step; updates `setZoom`, then RAF re-positions scroll | Yes | OK | useCanvasInteraction.js:97-117 |
| Three-finger touch | Nothing | Falls into `activePointers.size > 2` branch which only `preventDefault`s | None | No | Acceptable | useCanvasInteraction.js:610-614 |
| Mouse wheel | Zoom (Ctrl+wheel) | `wheel` listener (separate, in canvas-mount code) zooms when Ctrl held | Smooth | No (`?` overlay only) | Mouse-only | tracker pattern; in creator analogous |
| Right-click | Show context menu | `onContextMenu` only `preventDefault`s when backstitch tool active; otherwise default browser menu | None app-side | No | Mouse-only — touch equivalent is the no-tool long-press; **with a tool active, no touch path to context menu** | PatternCanvas.js:165-170 |
| Double-click | Nothing | No `onDoubleClick` handler | None | No | Touch double-tap also does nothing | — |
| Spacebar + drag | Pan with any tool active | Hold space → cursor grab → drag pans the canvas | Cursor changes to grab | Help-overlay only | Keyboard-only — **no touch equivalent for "pan while tool is active"** other than two-finger | useCanvasInteraction.js (space handling) |

### Edit-mode summary

- **Largest gap: 1-finger pan only exists when no tool is active.** Once
  any tool is selected (the normal state), the user can never pan with
  one finger; they must remember the two-finger pan convention. Long-press
  → context-menu has the same restriction.
- Tap vs drag disambiguation only exists for paint/erase brushes (the
  10 px `TOUCH_TAP_SLOP`). Fill, lasso, magic wand, eyedropper, backstitch
  fire on touchdown with no slop, so an accidental palm-edge graze
  triggers the tool.
- No visual feedback for "you are about to place a stitch here" before
  finger-up. Cells repaint during touchdown for paint, but for fill /
  magic wand the action runs on POINTER_DOWN with no preview.
- No haptics anywhere in the file.

──────────────────────────────────────────────────────────────────────
## 2. Track-mode canvas (Stitch Tracker — `stitch.html`)
──────────────────────────────────────────────────────────────────────

Two parallel touch paths that both observe the canvas:

1. **`window.useDragMark`** ([useDragMark.js](../useDragMark.js)) is spread
   onto the canvas wrapper as React props (`onPointerDown / Move / Up /
   Cancel`). It owns single-cell tap, drag-mark, and long-press range-
   select. State machine reducer at lines 90–280.
2. **Native `touchstart / touchmove / touchend`** added imperatively in
   `tracker-app.js` (`handleTouchStart` line 4322, `handleTouchMove` 4357,
   `handleTouchEnd` 4399) on the same canvas. These own pinch-zoom and
   the 8 px **pan fallback** for one-finger drag.

Both paths fire for every touch — useDragMark sees the pointer events
synthesised from the same touches. Conflicts are managed by:

- The 200 ms multi-touch guard in useDragMark (line 96-104) — a second
  pointer within 200 ms of the first aborts the in-progress tap/drag.
- `tracker-app.js` calling `pushTrackHistory` + clearing
  `dragChangesRef` when a 2nd touch arrives (line 4346-4353), ending any
  in-progress drag-mark and switching `ts.mode = "pinch"`.
- The 8 px `PAN_THRESHOLD` in `handleTouchMove` (line 4365) — once the
  one-finger touch moves > 8 px **and** is still in `mode==="tap"` (i.e.
  useDragMark hasn't yet promoted it to drag-mark), the touch handler
  flips to `mode="pan"` and starts scrolling.

| Gesture | Intended | Actual | Visual feedback | Discoverable | Conflict / notes | Code |
|---|---|---|---|---|---|---|
| One-finger tap | Mark/unmark a cell | useDragMark POINTER_DOWN → POINTER_UP within 200 ms on same cell → `onToggleCell(idx)` → `setDone` flips bit | Cell repaints; progress bar updates | Yes — primary action | Aborted if 2nd finger arrives < 200 ms later | useDragMark.js:113-128, 257-275 |
| One-finger drag | Mark / unmark a run of cells | useDragMark promotes `pending → drag` on first move > 0 px (no slop). Intent locked from first cell's done state. Commits as one undo step | Cells fill in real-time; intent dictates fill or unfill | Yes (cells fill behind finger) | **Conflicts with pan**: useDragMark grabs the drag immediately, so the 8 px tracker-app pan fallback only ever fires for short jiggles before useDragMark notices movement. Effectively, 1-finger drag = mark; 1-finger pan is rarely accessible. | useDragMark.js:140-180; tracker-app.js:4365-4376 |
| One-finger long-press | Set range anchor | After 500 ms no-movement, useDragMark transitions to `mode==='range'`; next tap on a different cell commits the rectangle | Anchor cell highlights (CSS pulse) | Help-overlay only | Suppressed if any movement detected; suppressed if 2nd finger arrives within 200 ms | useDragMark.js:185-205, 260-278 |
| Two-finger drag | Pan + zoom (pinch) | tracker `handleTouchMove` (line 4378-4396) computes new dist, scales zoom, adjusts `scrollLeft/Top` around the pinch midpoint. useDragMark sees the 2nd pointer within 200 ms → aborts pending tap | Smooth zoom around midpoint | Yes | OK | tracker-app.js:4356-4396 |
| Pinch | Zoom 0.3–4 × | Same as above | Same | Yes | OK | tracker-app.js:4378-4396 |
| Mouse wheel + Ctrl | Zoom around cursor | `handleStitchWheel` (line 4307) `e.preventDefault`s when Ctrl held, scales zoom, adjusts scroll | Smooth | No (`?` overlay) | Wheel without Ctrl falls through to native scroll | tracker-app.js:4307-4322 |
| Right-click | (No effect — would be context menu but unwired) | `onMouseDown` branch with `e.button===2` clears focus | None | No | Touch equivalent is long-press (range-anchor) — different action | tracker-app.js:4119-4150 |
| Double-click | Edit single cell (edit mode only) | When edit-mode toggle is on, `onDoubleClick` enters per-cell editor | Cell highlights | Toggle button | Touch double-tap not detected | tracker-app.js (edit branch) |
| Alt + click | Set focus block | `e.altKey` branch — focus-block + spotlight mode | Spotlight overlay dims surroundings | No | Mouse-only — **no touch equivalent** | tracker-app.js:4119-4140 |
| Shift + click | Range-select from last anchor | useDragMark mouse branch — POINTER_DOWN with `shiftKey` commits `rectIndices(lastAnchor, idx)` | Marching-ants briefly | Help-overlay | Touch equivalent is long-press → tap | useDragMark.js:106-124 |
| Spacebar + drag | Pan | Cursor grab; canvas pans via scroll | Cursor change | Help-overlay | Keyboard-only | tracker-app.js:4228-4265 |
| Touch-and-hold on a colour chip in palette legend | Quick-isolate? | No special handling — just a normal `onClick` on `.palette-chip` | None | No | Acceptable | tracker-app.js palette section |

### Track-mode summary

- **Two handlers compete for one-finger drag** — useDragMark "drag-mark"
  and tracker `touchmove` "pan-after-8 px". useDragMark's `POINTER_MOVE`
  promotes to drag with **zero pixel slop** (line 132 — `if (action.idx
  === s.startIdx && !s.moved)` only blocks until the finger crosses a
  cell boundary, which can be a single pixel at high zoom). On most
  drags useDragMark wins, marking cells the user intended to pan past.
- The 200 ms multi-touch guard helps but doesn't address the common case
  of "one-finger pan to scroll the chart". Stitchers learn to pan with
  two fingers; the discovery cost is high.
- Long-press → range is powerful but undiscoverable. There is no UI hint
  showing it exists.
- No visual touchdown preview before commit (tap fires on POINTER_UP, but
  the cell only repaints after the bit flips — there's no "you'll mark
  this if you lift now" outline).
- Wake-lock and immersive-scroll exist (auto-hide chrome at 50 px scroll
  down), but no explicit full-screen mode.

──────────────────────────────────────────────────────────────────────
## 3. View / preview canvases
──────────────────────────────────────────────────────────────────────

[creator/PreviewCanvas.js](../creator/PreviewCanvas.js) and
[creator/RealisticCanvas.js](../creator/RealisticCanvas.js) — read-only
previews. They have no touch handlers. Browser default pan/pinch on the
container apply. `touch-action` is not explicitly set, so:

- Phones do native page-level pinch-to-zoom over them (the page itself
  scales, blurring text).
- Pull-to-refresh from the top of the preview can fire because
  `overscroll-behavior` is not pinned anywhere in `styles.css`.

Acceptable for "view" semantics but inconsistent with edit/track canvases.

──────────────────────────────────────────────────────────────────────
## 4. Toolbar & controls — measurements (CSS-derived)
──────────────────────────────────────────────────────────────────────

Sourced from [styles.css](../styles.css). Where two values appear they
are desktop / `(pointer:coarse)` mobile.

### Creator top toolbar — `.tb-btn` ([styles.css:660](../styles.css#L660))

- Default: `padding:3px 8px; font-size:11px;` → roughly **22 px tall
  × 36–60 px wide** depending on label length.
- No `min-height` rule. **Below the 44 × 44 px floor on every device.**
- `.tb-fit-btn`, `.tb-overflow-btn` (28 × 26 px) are below the floor too.
- `.tb-zoom-pct` is purely text (no hit target, but the +/- buttons it
  sits between are `.tb-btn` size, ~ 22 px tall).
- `.tb-drop-arrow` is 8 px wide — only acts as visual chevron.
- The dropdown menu items (`.tb-drop-item`) are 6 × 12 px padding around
  12 px font → ~ 28 px tall.

On tablet portrait (768 px) the toolbar wraps; ToolStrip overflow opens
a menu sized for mouse (6 px vertical padding on items).

### Creator palette chip — `.palette-chip` (mobile)

- `.palette-chip` mobile: ~ 28 × 28 px swatch with 4 px gap between.
  **Below floor; adjacent chips share borders.** Accidental colour
  selection is documented as an issue in `mobile-5-forms.md`.

### Tracker mobile action bar — `.tracker-action-bar`

- Bar height: 56 px (line 2167+).
- Mark / undo buttons: 44 × 44 px (`min-height:44px` + reasonable
  padding). **Meets floor.**
- Colour chip preview: 36 × 36 px circle. Slightly under floor.
- Quick-drawer chips: 44 × 44 px (`min-height:44px` line 2226 et seq).
  **Meets floor.**

### Tracker FAB undo — `.fab-undo`

- 48 × 48 px, fixed bottom-left at 16 px / 60 px. **Meets floor.**

### Tracker bottom-sheet `.lpanel` controls

- `.lp-btn`, `.lp-tab`, `.lp-seg` get `min-height:44px` only at
  `max-width:899px` (line 668). **Tablet landscape (900–1023 px) misses
  the floor** — they remain 28 px tall.
- `.lp-close` is 36 px wide × auto. Below floor.

### Header / nav — `header.js`

- Nav links use default padding (~ 12 × 16 px text → ~ 36 px tall).
  Below floor on phone; passes on tablet because text scales.
- Home / pattern-switcher button has no explicit min-height.

### Modals (preferences, project-info, etc.)

- Form rows: number inputs default `<input>` styling — height varies
  by browser but typically ~ 24 px on tablet without explicit
  `min-height`. Some inputs in `preferences-modal.js` have explicit
  44 px heights (verified line 100-130 per repo memory).
- Switches and checkboxes: native `<input type="checkbox">` ~ 16 × 16 px.
  Below floor. Not wrapped in 44 px hit areas in most modals.

### Sidebar Workbench (`creator/Sidebar.js` / `creator/MaterialsHub.js`)

- Tab strip: `padding:8px 12px; font-size:13px` → ~ 32 px tall.
  Below floor.
- Tab list uses roving tabindex (per repo memory).

### Repeating sub-44 px clusters

- Stitch palette swatches in materials hub (24 × 24 px, 4 px gap).
- Filter chips in tracker palette legend (28 × 28 px).
- Number-input spinners (browser-native, ~ 18 px arrows).

──────────────────────────────────────────────────────────────────────
## 5. Tracker left panel (`.lpanel`)
──────────────────────────────────────────────────────────────────────

Currently rendered for every tracker session at every viewport.

| Property | Value | Notes |
|---|---|---|
| Component | `tracker-app.js` left-panel render block (line ~ 1065) | Mounted whenever `leftSidebarOpen === true` |
| State | `leftSidebarOpen` (boolean, persisted via UserPrefs `trackerLeftSidebarOpen`); `leftSidebarTab` (string, 6 tabs) | Persists per user |
| Tabs | `highlight`, `view`, `session`, `tools`, `notes`, `legend` | `legend` shown only on `(max-width:899px)` (mobile-only tab) |
| Layout — desktop ≥ 1024 px | Left dock: 320 px wide × full height, fixed left:0, top:0, bottom:0 | Slides in via `lpanel-slide-right` 220 ms; overlays canvas on the leftmost 320 px (canvas wrapper isn't resized — chart still pannable underneath but partly obscured) |
| Layout — 900–1023 px (tablet landscape) | **Bottom-sheet from below**, max-height 70 dvh, full width, `border-radius:16px 16px 0 0`, with backdrop scrim | Tapping the scrim closes; ESC closes |
| Layout — < 900 px (tablet portrait, phone) | Same bottom-sheet | Adds `min-height:44px` to all `.lp-btn / .lp-tab / .lp-seg` |
| Trigger to open | `.tracker-hamburger` button in top-bar (36 × 32 px — below floor) | Same trigger toggles open/close |
| Persistence | Restored from `localStorage` user-prefs on mount | Yes |
| Auto-collapse | None | Stays in whatever state user left it |
| Push or overlay? | **Overlay** at every viewport — canvas never resizes; on desktop it covers the leftmost 320 px of canvas, on mobile/tablet it covers the bottom 70 dvh | Stitcher must pan the chart out from under the panel to see covered area |

### Panel contents — essential vs. occasional during active stitching

| Tab | Contents | Used during active stitching? |
|---|---|---|
| highlight | Colour filter, isolation mode, dim slider | **Constantly** — choosing the active colour determines what's visible/markable |
| view | Symbol/colour/highlight view selector, layer toggles | Set once per session, rarely changed |
| session | Recording, pause/resume, goals | Set once per session |
| tools | Lasso sub-mode, magic wand tolerance, bulk ops | Tool changes only |
| notes | Free-text editor | Occasional |
| legend | Palette legend with sort | **Constantly** — needed to look up colour codes |

So **highlight + legend** are needed at-glance frequency; the other four
are session-level. This argues for a "minimal" collapsed state that
keeps the active colour visible while hiding the rest.

──────────────────────────────────────────────────────────────────────
## 6. Existing full-screen / hide-chrome
──────────────────────────────────────────────────────────────────────

| Feature | Trigger | Effect | File |
|---|---|---|---|
| `tracker-immersive` body class | Mobile (`pointer:coarse`); auto-applied when user scrolls down > 50 px | Hides top header + tracker top toolbar via `transform:translateY(-100%)`. Reveals on scroll-up. | tracker-app.js:680 + styles.css:2275 |
| Wake-lock | User toggle in tracker UI | Holds screen awake via `navigator.wakeLock`. No visual change. | tracker-app.js:120-170 |
| Browser Fullscreen API | Not used anywhere | — | — |
| Toggle to hide left panel without closing | Not present | — | — |
| Toggle to hide top toolbar permanently | Not present (only auto-hide on scroll) | — | — |

There is **no explicit, user-invokable full-screen mode** that hides
chrome on demand and stays hidden, nor any equivalent in Edit mode.

──────────────────────────────────────────────────────────────────────
## 7. `touch-action` declarations across the app
──────────────────────────────────────────────────────────────────────

| Selector | Value | File:Line | Risk |
|---|---|---|---|
| Pattern canvas (creator) | `touch-action:none` (inline) | PatternCanvas.js:156 | Correct — app owns all touch |
| Tracker `<canvas>` | **Not set explicitly.** Touch handlers manually `e.preventDefault()` in `passive:false` listeners (line 4742-4744). | tracker-app.js | Works, but pull-to-refresh & native pinch can briefly flicker on iOS Safari before the JS preventDefault runs |
| `.fab-undo` | `touch-action:manipulation` | styles.css:655 | Good (no 300 ms tap delay) |
| `.tb-btn` (mobile) | `touch-action:manipulation` | styles.css:2131 | Good |
| `.palette-chip` | `touch-action:manipulation` | styles.css:701 | Good |
| `.tracker-action-bar` buttons | `touch-action:manipulation` | styles.css:2208 | Good |
| `<input type=range>` (mobile) | `touch-action:manipulation` | styles.css:2375 | Good |
| Modals, headers, drawers | Default | — | Default `touch-action:auto` allows pull-to-refresh — harmless on overlays but should be `manipulation` on draggable handles |
| Preview/realistic canvases | Default | — | Native pinch-zooms the page over them |

──────────────────────────────────────────────────────────────────────
## 8. Mouse-only interactions with no touch equivalent
──────────────────────────────────────────────────────────────────────

| Action | Mouse path | Touch alternative? |
|---|---|---|
| Pan canvas while a paint/erase tool is active (Edit) | Hold spacebar + drag | **None** — touch users must lift, switch via two-finger pan |
| Right-click context menu (Edit, with tool active) | Right-click | **None** — long-press only fires when no tool is active |
| Alt+click focus block (Track) | Alt + click | **None** |
| Hover tooltips on tools, palette chips, status indicators | Native `:hover` | **None** — no equivalent (long-press tooltip not implemented) |
| Wheel-zoom | Ctrl + wheel | Pinch (parity OK) |
| Resize split panes (Creator) | Pointer drag on `.SplitPane` divider | Works on touch (it uses pointer events) but the divider is 4 px wide — **far below the 44 px hit floor** (`SplitPane.js:58`) |

──────────────────────────────────────────────────────────────────────
## 9. Browser-default conflicts to address
──────────────────────────────────────────────────────────────────────

| Default | Where it interferes | Current mitigation |
|---|---|---|
| Pull-to-refresh (iOS / Android Chrome) | Tracker canvas at scrollTop:0 | None app-side — relies on `e.preventDefault` in passive:false touchmove |
| Pinch-to-zoom on the page | Preview canvases, modals, tracker chrome | Viewport meta presumably allows it (need to verify in `index.html`); causes accidental page zoom over tracker top-bar |
| Browser back/forward swipe (mobile Safari, Chrome) | Edge swipe from left/right | None — could swipe back to /home accidentally while panning |
| Long-press text selection | Long-press on legend rows or status text | Mostly OK because canvas has `touch-action:none`, but legend rows show the iOS magnifier on long-press |
| Double-tap-to-zoom | Toolbar buttons | Mitigated by `touch-action:manipulation` where set; default elsewhere |

──────────────────────────────────────────────────────────────────────
## 10. Constants and thresholds in code
──────────────────────────────────────────────────────────────────────

| Constant | Value | File:Line | Used for |
|---|---|---|---|
| `TOUCH_TAP_SLOP` | 10 px | useCanvasInteraction.js:22 | Edit-mode tap-vs-drag (paint/erase brushes only) |
| `LONG_PRESS_MS` | 500 ms | useCanvasInteraction.js:23 | Edit-mode context menu, backstitch cancel |
| Multi-touch guard window | 200 ms | useDragMark.js:96, 124 | Track-mode 2nd-pointer abort |
| Tap commit window | 200 ms | useDragMark.js:259 | Track-mode tap (down→up < 200 ms) |
| Drag-mark slop | 0 px (cell boundary) | useDragMark.js:130-138 | Track-mode tap → drag promotion |
| `PAN_THRESHOLD` | 8 px | tracker-app.js:4364 | Track-mode touch-fallback pan |
| Zoom range Edit | 0.05 – 3.0 | useCanvasInteraction.js:101 | Pinch + wheel |
| Zoom range Track | 0.3 – 4.0 | tracker-app.js:4319 | Pinch + wheel |
| Long-press range threshold | 500 ms with no movement | useDragMark.js:185 | Track-mode range anchor |
| Immersive scroll threshold | 50 px down | tracker-app.js:680 | Auto-hide chrome on mobile |

These are **scattered as magic numbers** across two files. Phase 4
should consolidate into a single constants module.

──────────────────────────────────────────────────────────────────────
## 11. Headline gaps to carry into Phase 2
──────────────────────────────────────────────────────────────────────

1. Edit mode has **no 1-finger pan** when a tool is active. The convention
   in every comparable creative app (Procreate, Figma, Affinity Designer)
   is "1-finger = primary action, 2-finger = pan, pinch = zoom". The
   creator already implements 2-finger pan via the pinch path, but
   provides no 1-finger pan affordance and no signal that two-finger is
   the only way to navigate.
2. Track mode has **two handlers racing** for 1-finger drag (useDragMark
   drag-mark vs. tracker touchmove pan-fallback). useDragMark wins
   because it promotes on 0 px of cell-boundary movement vs. the 8 px
   pan threshold. Net effect: 1-finger drag almost always marks rather
   than pans.
3. **Touch targets in the Creator top toolbar are universally below the
   44 px floor** (most are ~22 px). The tracker mobile action bar is
   the only surface that hits the floor across the board.
4. **The lpanel cannot be collapsed without closing it.** There is no
   "minimised rail" state — it's either fully open (covering left 320 px
   on desktop or bottom 70 dvh on mobile) or completely hidden.
5. **No explicit full-screen mode.** Immersive auto-hide on scroll is
   the only chrome-hiding feature, and it's mobile-only and scroll-
   gated.
6. **Right-click and Alt-click have no touch equivalents** for the
   context menu / focus-block actions.
7. **No haptics, no per-tap visual preview, no gesture guide** for
   first-time touch users.
