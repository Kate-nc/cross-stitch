# touch-4 — Gesture Conflict Matrix

A grid view of every gesture in every mode, with current behaviour,
intended behaviour, and conflict notes. Builds on `touch-1`.

──────────────────────────────────────────────────────────────────────
## Edit mode (creator)
──────────────────────────────────────────────────────────────────────

State variables that change behaviour:
- `activeTool` ∈ { (none), paint, eraseAll, fill, eyedropper, magicWand,
  lasso, backstitch, eraseBs }
- `partialStitchTool` ∈ { (none), half-fwd, half-bck, quarter, three-quarter }

| Gesture | No tool selected | Paint / Erase brush | Fill / Wand / Eyedropper / Backstitch | Lasso (freehand) | Lasso (polygon / magnetic) |
|---|---|---|---|---|---|
| 1-finger tap | Nothing (long-press timer arms but no commit) | Place 1 stitch / erase 1 cell | Run tool immediately on POINTER_DOWN (no slop) | Start lasso point | Add polygon point or close shape |
| 1-finger drag | **Pans the canvas** | Draws a line of stitches (10 px slop) | Repeatedly fires the tool on each cell crossed (no slop) | Extends freehand path | No effect after first point |
| 1-finger long-press (500 ms, no movement) | **Opens cell context menu** | None (timer never starts) | None | None | None (backstitch tool: cancels start point) |
| 2-finger drag | Pinch-pan: cancels in-flight drag, switches to pinch | Same — cancels current paint stroke, becomes pan/zoom | Same | Same | Same |
| Pinch | Zoom 0.05–3 × | Zoom 0.05–3 × | Zoom 0.05–3 × | Zoom 0.05–3 × | Zoom 0.05–3 × |
| 3+ finger touch | preventDefault only — no action | Same | Same | Same | Same |
| 1-finger double-tap | None | None | None | None | None |
| 2-finger tap | None | None | None | None | None |
| 3-finger tap | None | None | None | None | None |

### Conflicts in Edit mode

| # | Conflict | Severity |
|---|---|---|
| E-1 | **1-finger drag has no pan path when a tool is active.** Switching to pan requires lifting and using two fingers. | 🔴 Critical |
| E-2 | **Tools other than paint/erase fire on POINTER_DOWN with zero slop.** A finger jiggle on touchdown commits a fill / wand / lasso click that the user didn't intend. | 🔴 Critical |
| E-3 | **Long-press only works with no tool active.** Users with paint selected cannot reach the cell context menu via touch. | 🟠 High |
| E-4 | **No touch equivalent for "alt + click eyedropper" while another tool is active.** Mouse users get a temporary eyedropper via Alt; touch users get nothing. | 🟡 Medium |
| E-5 | **Spacebar pan has no touch equivalent.** Keyboard-only escape hatch. | 🟠 High (since E-1 leaves no other escape) |
| E-6 | **No 2-finger or 3-finger tap = undo/redo** despite being a near-universal creative-app convention. | 🟡 Medium |
| E-7 | **Right-click only fires app behaviour for backstitch tool.** Other tools show the browser default menu. No mobile equivalent. | 🟡 Medium |

──────────────────────────────────────────────────────────────────────
## Track mode (tracker)
──────────────────────────────────────────────────────────────────────

State variables:
- `isEditMode` (per-cell editor) — useDragMark becomes a no-op
- `highlightColorId` — when set, drag-mark is restricted to that colour
- `focusBlock` — alt-click sets focus, dims surroundings

| Gesture | Default tracking (no tool) | With highlight colour set | With edit-mode toggle on |
|---|---|---|---|
| 1-finger tap | Toggle done/undone on cell | Toggle if cell matches highlight colour, else nothing | Open per-cell editor |
| 1-finger drag (< 200 ms then move) | Mark/unmark a run; intent locked from first cell | Same but only for matching cells | None — drag-mark is gated off |
| 1-finger long-press (500 ms still) | Set range anchor; next tap commits rectangle | Same, restricted | None |
| 1-finger drag > 8 px while still in `tap` mode (touch-fallback in tracker-app.js) | **Pans the canvas** — but useDragMark usually beats this to "drag-mark" | Same race | Pans (drag-mark gated off) |
| 2-finger drag | Pinch-pan; cancels in-flight drag-mark via 200 ms multi-touch guard | Same | Same |
| Pinch | Zoom 0.3–4 × | Same | Same |
| 1-finger double-tap | None | None | None |
| 2-finger tap | None | None | None |
| Right-click | (Mouse) clear focus block | Same | Same |
| Alt + click | (Mouse) set focus block | Same | Same |
| Shift + click | (Mouse) range from last anchor | Same | Same |
| Spacebar + drag | Pan | Same | Same |
| Mouse wheel | Native scroll | Same | Same |
| Ctrl + wheel | Zoom around cursor | Same | Same |

### Conflicts in Track mode

| # | Conflict | Severity |
|---|---|---|
| T-1 | **1-finger drag races between "drag-mark" (useDragMark) and "pan" (tracker-app.js 8 px fallback). useDragMark wins because it promotes on cell-boundary crossing (often 1 px at high zoom).** Effectively no 1-finger pan. | 🔴 Critical |
| T-2 | **Long-press = range anchor is a destructive primary action**, not a "secondary / context" action. Stitchers expect long-press to show info, not commit a rectangle of changes. | 🟠 High |
| T-3 | **No touch equivalent for Alt-click focus-block.** Mouse-only feature. | 🟠 High |
| T-4 | **No touch equivalent for right-click clear-focus.** | 🟡 Medium |
| T-5 | **No 2-finger / 3-finger tap = undo/redo** despite the universal convention; the user has to reach the FAB undo button at bottom-left every time. | 🟡 Medium |
| T-6 | **Shift+click range works only on mouse.** Touch users use the long-press (T-2). | 🟡 Medium (covered by T-2) |
| T-7 | **No tap visual preview**: tap commits on POINTER_UP, but cell only repaints after the bit is flipped. No "you'll mark this if you lift" outline. | 🟡 Medium |
| T-8 | **iPad with Pencil reports `pointer:fine`** so the entire mobile-only stylesheet (action bar, FAB, larger taps inside lpanel) does not apply. Tablet-with-Pencil users get the desktop layout on a tablet viewport. | 🟠 High |

──────────────────────────────────────────────────────────────────────
## View / preview mode (creator preview canvas, realistic canvas)
──────────────────────────────────────────────────────────────────────

| Gesture | Behaviour |
|---|---|
| 1-finger drag | Native page scroll (canvas may scroll with it) |
| Pinch | **Native browser page-zoom** (the page itself scales, blurring text) |
| Tap | Nothing |
| Double-tap | Native browser zoom-to-text |

### Conflicts

| # | Conflict | Severity |
|---|---|---|
| V-1 | **No touch-action on preview canvases** — pinch zooms the whole page rather than the canvas content. | 🟠 High |
| V-2 | Pull-to-refresh fires when scrolled to top of preview. | 🟡 Medium |

──────────────────────────────────────────────────────────────────────
## Browser-default conflicts (all modes)
──────────────────────────────────────────────────────────────────────

| Default | Triggered when | Mitigation status |
|---|---|---|
| iOS pull-to-refresh | Touch starts at scrollTop:0 in tracker, modals, manager | Tracker canvas avoids it via passive:false touch handlers; modals can fire it |
| Browser back-swipe (mobile Safari, Chrome left-edge swipe) | Edge-swipe from screen left/right | Not mitigated — could bounce user to /home accidentally while panning near canvas left edge |
| Pinch-to-zoom on the page (viewport-meta dependent) | Pinch over chrome (header, toolbar, modals) | Need to verify viewport meta has `user-scalable=no` or similar; fix if not |
| Long-press text selection (iOS magnifier) | Long-press on text in legend, status, modals | Mostly OK because canvas is `touch-action:none`; legend rows still trigger it |
| 300 ms tap-delay | Default on non-`touch-action:manipulation` elements | Mitigated on most buttons; missed on header nav, modal close buttons |
| Double-tap-to-zoom | Default on text content | Mitigated on buttons; not on text content |

──────────────────────────────────────────────────────────────────────
## Gesture dead zones
──────────────────────────────────────────────────────────────────────

| Zone | Reason | Affected mode |
|---|---|---|
| Left 320 px of tracker canvas (when lpanel is docked desktop ≥ 1024 px) | Lpanel overlays canvas; tap goes to panel, not chart | Track desktop |
| Bottom 70 dvh of tracker canvas (when lpanel is open as bottom-sheet < 1024 px) | Lpanel overlay covers the chart; gestures on it scroll the lpanel rather than chart | Track tablet/phone |
| Bottom 56 px of tracker canvas (always, mobile) | tracker-action-bar is fixed | Track mobile |
| Bottom ~ 60 px of creator canvas (mobile) | Action bar / status bar | Edit mobile |
| Top ~ 80 px of any screen | Top-bar + toolbar | All |
| Edge-swipe corridors (left/right ~ 20 px) on iOS Safari | Reserved for browser back/forward | All |

──────────────────────────────────────────────────────────────────────
## Summary: actions with NO touch equivalent
──────────────────────────────────────────────────────────────────────

| Action | Mouse / keyboard path | Touch alternative? |
|---|---|---|
| Pan canvas while a tool is active (Edit) | Hold space + drag | **None** (must use 2-finger) |
| Pan canvas with one hand without dropping/picking-up tool | Spacebar | **None** |
| Right-click context menu (Edit, with tool active) | Right-click | **None** |
| Right-click clear focus block (Track) | Right-click | **None** |
| Alt-click eyedropper / focus-block | Alt + click | **None** |
| Shift+click range select | Shift + click | Long-press → tap (different gesture) |
| Wheel zoom | Ctrl + wheel | Pinch (parity) |
| Undo via gesture | Ctrl/Cmd + Z | FAB button (Track only) |
| Redo via gesture | Ctrl/Cmd + Shift + Z | None on touch |
| Switch tool | Keyboard shortcut (P/F/W/etc.) | Tap toolbar (multi-tap journey) |

──────────────────────────────────────────────────────────────────────
## Headline conflict tally
──────────────────────────────────────────────────────────────────────

- 🔴 Critical: **3** (E-1, E-2, T-1)
- 🟠 High: **6** (E-3, E-5, T-2, T-3, T-8, V-1)
- 🟡 Medium: **6** (E-4, E-6, E-7, T-4, T-5, T-7, V-2)

The three critical conflicts all share a root cause: **the app has no
explicit, always-available "pan / view" affordance on touch**. Every
mode tries to do "smart" disambiguation between content modification
and navigation, and every one of those disambiguations is wrong some
of the time.
