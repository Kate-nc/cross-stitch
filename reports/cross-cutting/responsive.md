# Cross-Cutting: Responsive & Multi-Device Behaviour

> Phase 2 cross-cutting output. Tablet is the primary user-prioritised
> device per orchestrator brief. All TODOs explicitly call out tablet
> behaviour where applicable. This spec documents intended responsive
> behaviour at every supported breakpoint and serves as the authoritative
> reference for screen-size-based layout, interaction, and touch-target
> sizing across the application.

---

## Scope & breakpoints

The application supports five distinct display contexts, defined by viewport width. Breakpoints are derived from explicit `@media` queries in [styles.css](../../styles.css), Playwright device configs in [playwright.config.js](../../playwright.config.js), and observed natural reflow points across page layouts.

### Canonical breakpoints

| Breakpoint | Width range | Device archetype | Playwright target | Primary use case |
|---|---|---|---|---|
| **Phone portrait** | 360â€“480 px | iPhone SE / small Android | N/A (out of scope per phase gate) | Emergency access; not primary |
| **Phone landscape** | 481â€“767 px | iPhone rotated / small tablet | `Pixel 5` (393Ã—851) | Secondary access path |
| **Tablet portrait** | 768â€“1023 px | **iPad Mini** | `touch-tablet-chromium` (**canonical**) | **Primary user device â€” highest priority** |
| **Tablet landscape** | 1024â€“1279 px | iPad rotated / larger tablet | `touch-tablet-chromium` rotated | **Primary user device â€” secondary orientation** |
| **Desktop** | â‰¥1280 px | 13"+ laptop / monitor | `perf-desktop` (1440Ã—900) | Extended / multi-window workflows; TV/projector context for presentations |

### Media query thresholds currently in codebase

- `max-width: 599px` â€” materials grid collapse; header/modal reflow; font size reduction
- `max-width: 899px` â€” modal constraint (max 100% width instead of max-width clamped to 560 px)
- `min-width: 1024px` / implied â€” tablet landscape layout begins
- `pointer:coarse` â€” in some components (future consolidation work)

**Key discovery**: breakpoints are fragmented across `599 / 600 / 899 / 900 / 1024` with no unified scheme. Phase 4 verification must consolidate these into a canonical set.

---

## Per-breakpoint behaviour summary

### Phone portrait (360â€“480 px)

*Note: Out of primary scope per user brief; included for completeness.*

| Element | Behaviour |
|---|---|
| **Header** | Nav items wrap 2â€“3 lines; no hamburger collapse implemented (tech debt) |
| **Modals** | Fit within viewport without horizontal scroll; `max-width: 100%` applies at `max-width:599px` |
| **Creator top toolbar** | Wraps to 3+ rows; overflow menu activated; buttons â†’ 28 px tall (below 44 px floor) |
| **Creator canvas area** | SplitPane collapses to single-column; right-panel becomes bottom-sheet; canvas usable â‰ˆ 360 Ã— 500 px |
| **Manager inventory table** | Likely horizontal scroll; columns hidden (exact layout TBD in Phase 1 Manager spec) |
| **Tracker canvas** | Single-column layout; colours drawer slides up; canvas usable â‰ˆ 360 Ã— 600 px |
| **Touch targets** | Many secondary links 28â€“32 px tall; below 44 px accessibility floor |
| **Drawers** | HelpDrawer, CommandPalette: full-height, push existing content; width â‰ˆ 90vw |

### Phone landscape / small tablet (481â€“767 px)

| Element | Behaviour |
|---|---|
| **Header** | Nav wraps to 2 rows; still no hamburger (tech debt carried forward) |
| **Modals** | `max-width: min(90vw, 560px)` applies; fits without scroll |
| **Creator layout** | SplitPane columns visible but constrained; sidebar â‰ˆ 150 px, canvas â‰ˆ 250 px, rpanel â‰ˆ 250 px |
| **Creator toolbar** | Still wraps; overflow menu less crowded than phone portrait |
| **Tracker canvas** | Colours drawer height may need constraint; canvas â‰ˆ 600 Ã— 400 px |
| **Touch targets** | Toolbar buttons remain small (depends on overflow logic); secondary links still marginal |
| **Horizontal scroll** | Materials grid still single-column (per `@media(max-width:599px)`) |

### Tablet portrait (768â€“1023 px) â€” **PRIMARY USER FOCUS**

| Element | Behaviour |
|---|---|
| **Header** | Full layout; nav items visible; no wrapping; logo + title + file menu + help button all readable |
| **Home project grid** | 2 columns of cards; each â‰¥ 360 px wide; 44+ px tap targets |
| **Creator layout** | 3-column split visible: sidebar (200â€“280 px) + canvas (400â€“500 px) + rpanel (300 px) |
| **Creator toolbar** | May still wrap depending on tool count; zoom controls in overflow; buttons â†’ 22 px tall (below floor â€” **P1 issue**) |
| **Creator right-panel tabs** | â‰ˆ 28 px tall (below floor â€” **P1 issue**) |
| **Manager inventory** | Exact layout TBD; assume card-view or table with hidden columns; horizontal scroll acceptable but not ideal |
| **Tracker canvas** | Full width; colours drawer (bottom) â‰¤ 60 % viewport height so user sees canvas while selecting; usable area â‰ˆ 720 Ã— 600 px |
| **Tracker sidebar** | `leftSidebarMode` pref controls visibility; when visible, â‰ˆ 200 px wide; when collapsed, canvas expands |
| **Modals** | Fit without scroll at 768 px; `max-width: min(90vw, 560px)` = 560 px (exact); 90 px margin each side |
| **Drawers** | HelpDrawer â‰ˆ 60â€“70 % viewport width; CommandPalette centered; no horizontal scroll |
| **Palette swap UI** | Fits on-screen without significant reflow |
| **Touch targets** | Canvas surfaces (cells, buttons): â‰¥44 px recommended; secondary UI often 32â€“40 px (tech debt) |

### Tablet landscape (1024â€“1279 px) â€” **PRIMARY USER FOCUS**

| Element | Behaviour |
|---|---|
| **Header** | Identical to portrait; all nav items visible |
| **Home project grid** | 3â€“4 columns of cards; plenty of breathing room; â‰¥ 44 px tap targets |
| **Creator layout** | 3-column split: sidebar (200â€“280 px) + canvas (â‰¥ 500 px) + rpanel (300â€“320 px) â€” canvas now the largest area |
| **Creator toolbar** | Likely fits without wrap at this width; all tools visible; buttons still â‰ˆ 22 px tall (below floor if not addressed) |
| **Creator right-panel tabs** | Still â‰ˆ 28 px tall (below floor) |
| **Manager inventory** | More horizontal space; likely 3â€“4 columns visible or expanded card-view |
| **Tracker canvas** | Full width; colours drawer â‰¤ 50 % viewport height (more space for canvas); usable â‰ˆ 950 Ã— 600 px |
| **Modals** | Unconstrained by max-width (â‰¥1280 context); can use more space; `max-width: 560 px` may feel narrow |
| **Drawers** | HelpDrawer â‰ˆ 50â€“60 % viewport width; full height; keyboard-friendly â†‘â†“ nav in shortcut list |
| **Touch targets** | Same as portrait; no improvement; tech debt compounds at this size |

### Desktop (â‰¥1280 px)

| Element | Behaviour |
|---|---|
| **Header** | Unchanged; max-width â‰ˆ 1300 px (see `tb-topbar-inner` in styles.css line 462) |
| **Home project grid** | 4+ columns; cards highly scannable; no crowding |
| **Creator layout** | Generous 3-column layout; canvas â‰¥ 600 px wide; sidebar + rpanel can both expand to 300+ px |
| **Creator toolbar** | No wrap expected; all tools visible; buttons 22 px tall (acceptable for mouse, but still below 44 px touch target if used with external mouse input on a large screen) |
| **Manager inventory** | Likely full 6+ column table; no horizontal scroll |
| **Tracker canvas** | Very spacious; colours drawer can be narrower (user has abundant space to read and tap) |
| **Modals** | Can expand up to ~560 px (hard limit) without feeling cramped |
| **Drawers** | HelpDrawer can occupy 50â€“70 % viewport width; plenty of space for content and shortcuts |

---

## Per-area responsive layout

### home (SCR-001â€“004, SCR-052â€“053, SCR-061)

**Source files**: [home-app.js](../../home-app.js), [home-screen.js](../../home-screen.js)

#### Tab bar (EL-SCR-001-02)
- **Tablet portrait**: All 4 tabs (Projects / Create / Stash / Stats) fit; labels visible; no scrolling; icon + label layout.
- **Tablet landscape**: Same as portrait; plenty of space.
- **Desktop**: Same; left-aligned with padding.
- **Phone**: Likely 2â€“3 tabs wrap; consider scroll-x or overflow menu (currently not implemented).

#### Project grid (EL-SCR-001-06+)
- **Tablet portrait**: Grid layout with `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` or similar; cards should be 320â€“360 px wide, resulting in ~2 cards per row. Each card â‰¥ 44 px tall (project name, action buttons).
- **Tablet landscape**: Same grid logic; 3â€“4 cards per row at 1024 px.
- **Desktop**: 4+ cards per row.
- **Phone**: Single column (1 card per row) or 2-up squeeze; acceptable.

#### Card interaction (EL-SCR-001-05, EL-SCR-001-07+)
- **Tap targets**: "Resume tracking" button, "Edit pattern" button, card menu (â‹¯) â€” all â‰¥ 44 Ã— 44 CSS px on touch devices.
- **Progress bar** (EL-SCR-001-07): height at least 4 px; width full-card-width (320+ px).
- **Project avatar** (EL-SCR-001-06): 56â€“64 px square on all sizes (matches Material Design).
- **Time-ago label** (e.g. "Updated 3 days ago"): 12 px font on all sizes; single line; no wrapping.

#### Stash tab (EL-SCR-003)
- **Tablet portrait / landscape**: Thread grid 2â€“3 columns; each thread chip â‰¥ 44 Ã— 32 px (width Ã— height) to accommodate label + colour swatch.
- **Phone**: Single column; chips wide enough for swatch + label.

#### Stats glance (EL-SCR-004)
- **Tablet portrait / landscape**: 2 rows of stat cards (e.g. "10 projects", "156 hours", "8 colours used", "2 in progress"); each â‰¥ 100 Ã— 80 px.
- **Phone**: Stacked 1 per row; full width (minus padding).

---

### creator (SCR-005â€“023)

**Source files**: [creator/PatternTab.js](../../creator/PatternTab.js), [creator/PatternCanvas.js](../../creator/PatternCanvas.js), [creator/ToolStrip.js](../../creator/ToolStrip.js), [creator/Sidebar.js](../../creator/Sidebar.js), [creator/ActionBar.js](../../creator/ActionBar.js), etc.; concatenated into [creator/bundle.js](../../creator/bundle.js).

**Layout model**: fixed header (ActionBar) â†’ SplitPane (ToolStrip + Canvas + Sidebar + right panel) â†’ status bar.

#### ActionBar (EL-SCR-054)
- **All breakpoints**: fixed height â‰ˆ 56 px; full width; contains project title (left), mode selector, export/save buttons (right).
- **Tablet portrait / landscape**: Buttons â‰ˆ 44 Ã— 44 px (acceptable touch size); labels visible; title truncates if > 200 px.
- **Phone**: Buttons 40 Ã— 40 px (marginal); title further truncated; export/save may move to menu.

#### ToolStrip (EL-SCR-011)
- **Tablet portrait**: vertical stack, left side of canvas; â‰ˆ 56 px wide; tools are round buttons â‰ˆ 44 Ã— 44 px each; no wrapping; no padding between buttons means shared borders (conflict with 44 px touch-target rule â€” **P1 issue**).
- **Tablet landscape**: Same; slightly more breathing room for button spacing.
- **Desktop**: Identical layout.
- **Phone**: May convert to horizontal bottom-bar (â‰ˆ 56 px tall, full width) with 5â€“6 visible tools + overflow menu; each tool button â‰ˆ 40 Ã— 40 px (acceptable with tap-slop).

#### Canvas area (SCR-010)
- **Tablet portrait**: usable â‰ˆ 400â€“500 px wide Ã— 500â€“600 px tall; scrollable if pattern > canvas bounds.
- **Tablet landscape**: usable â‰ˆ 500â€“700 px wide Ã— 600â€“700 px tall.
- **Desktop**: â‰ˆ 700+ px wide.
- **Touch-action**: `touch-action: none` required to prevent browser interference (per [creator/PatternCanvas.js](../../creator/PatternCanvas.js) line 160).

#### Sidebar (EL-SCR-012)
- **Tablet portrait / landscape**: fixed width â‰ˆ 200â€“280 px; contains palette chips, size/fabric dropdowns, thread stats. Palette chips in a scrolling row; chips â‰ˆ 28 Ã— 28 px (below 44 px floor for tap, but acceptable for **viewing** â€” editing via palette-swap modal).
- **Phone**: Collapses to icon-only or moves off-screen; user accesses palette via modal or bottom-drawer.

#### Right panel (EL-SCR-012 adjacent; tabs: Prepare, Pattern, Legend, Export, Project)
- **Tablet portrait / landscape**: Fixed width â‰ˆ 300â€“320 px; tabs (EL-SCR-005â€“009) visible as a row or column; tab buttons â‰ˆ 28 px tall (below floor â€” **P1 issue**); content area scrolls vertically.
- **Tab labels**: "Prepare", "Pattern", "Legend", "Export", "Project" â€” must fit without wrapping; current design likely causes single-word abbreviations.
- **Phone**: Right panel becomes a bottom-drawer overlaying the canvas; tabs now horizontal; full width of drawer.

#### Modals (SCR-014â€“020)
- **All breakpoints**: max-width constraint:
  - `@media(max-width:599px)`: max-width 100%
  - `@media(max-width:899px)`: max-width 100%
  - default: max-width 560 px (per [styles.css](../../styles.css) line 345 `.overlay-panel--dialog`)
- **Tablet portrait (768 px)**: modal 560 px (90 px margin each side) â€” tight but fits; no scroll needed for typical modal content.
- **Adapt Modal (SCR-014)**: multipart form with preview; must not exceed 560 px width on tablet; preview area collapses to single column on tablet portrait.
- **ImportWizard (SCR-018)**: 5-step linear flow; each step fits within 560 px; step titles and nav buttons â‰¥ 32 px tall (marginal for touch but acceptable with tap-slop).

#### Legend tab (SCR-007)
- **Tablet portrait**: Legend is a scrolling list of (symbol, DMC id, colour swatch, stitch count, actions); rows â‰ˆ 40 px tall; tap targets for delete/edit â‰¥ 32 px (below floor for strict tablet support).
- **Tablet landscape**: Same layout; more horizontal space; consider multi-column if many stitches exist.

#### Export tab (SCR-008)
- **Tablet portrait / landscape**: Export options (PDF, PNG, JSON, etc.) as a vertical list or grid; buttons â‰¥ 44 Ã— 40 px; shopping list, PDF settings modals fit within modal bounds (560 px).

---

### tracker (SCR-024â€“028)

**Source files**: [tracker-app.js](../../tracker-app.js); includes canvas, colours drawer, stats dashboard.

**Layout model**: header â†’ canvas (main) + colours drawer (bottom, slide-up sheet) + stats modal (if open).

#### Canvas (EL-SCR-024)
- **Tablet portrait**: Usable â‰ˆ 720 px wide Ã— 600 px tall (full-width canvas, fixed-height colours drawer below); cells large enough for tap (depends on pattern size and zoom; baseline â‰¥ 20 px per cell).
- **Tablet landscape**: Usable â‰ˆ 950 px wide Ã— 600 px tall; colours drawer can be narrower or side-by-side.
- **Desktop**: â‰ˆ 1350 px wide Ã— 700 px tall; colours drawer side-by-side optional.
- **Touch**: All patterns must support pinch-zoom (0.3â€“4Ã—) and two-finger pan.

#### Colours drawer (EL-SCR-025)
- **Tablet portrait**: Height â‰¤ 60 % viewport (â‰¤ 400 px on 768 Ã— 1024) so user can see canvas while picking colour; drawer scrolls internally if >20 colours; colour chips â‰ˆ 44 Ã— 44 px each; 2â€“3 columns of chips.
- **Tablet landscape**: Height â‰¤ 50 % viewport; can be narrower to preserve canvas view.
- **Desktop**: Can occupy more space; e.g., 30 % viewport height; 4â€“5 columns of chips.
- **Dismiss**: Tap the âœ“ button or drag drawer handle down; scrim tap does **not** dismiss (user might accidentally close while selecting).

#### Sidebar (leftSidebarMode pref)
- **When enabled on tablet portrait**: Sidebar â‰ˆ 180 px wide; contains session list, stats snapshot; content scrolls; no wrapping.
- **When disabled**: Canvas expands full-width; more usable area.
- **On tablet landscape with sidebar enabled**: Sidebar + canvas side-by-side; both have ample space.
- **Phone**: Sidebar always collapsed to icons or hidden; user accesses via menu icon.

#### Stats dashboard (EL-SCR-028)
- **All breakpoints**: modal, max-width 560 px; shows stats cards, activity log, insights; scrolls vertically; buttons â‰¥ 32 px tall.

---

### manager (SCR-029â€“033, SCR-051, SCR-057â€“059)

**Source files**: [manager-app.js](../../manager-app.js); includes inventory table, pattern library, profile modal, stats.

**Layout model**: tabs (Inventory / Patterns) â†’ main content + sidebar (project library, MultiProjectDashboard).

#### Inventory table (SCR-029)
- **Desktop**: 6+ columns (DMC id, name, RGB, quantity owned, quantity used, actions); each cell â‰¥ 40 px tall.
- **Tablet landscape**: 4â€“5 columns; less whitespace; horizontal scroll acceptable.
- **Tablet portrait**: 2â€“3 columns visible (id + name + actions); other columns hidden; horizontal scroll or card-view mode required. **Exact layout TBD in Phase 1 Manager spec.**
- **Phone**: Card-view only; one card per screen; horizontal scroll risks (tech debt).

#### Pattern library (SCR-030)
- **Tablet portrait / landscape**: Grid of pattern thumbnails (3â€“4 per row on tablet portrait, 4â€“5 on landscape); each thumbnail â‰¥ 44 Ã— 44 px; title below â‰¤ 12 px font; buttons (open, delete, info) â‰¥ 32 px tall.
- **Desktop**: 5â€“6 thumbnails per row.
- **Phone**: 2â€“3 per row; card-view still fits.

#### Profile modal (SCR-031)
- **All breakpoints**: max-width 560 px; contains avatar, name, thread inventory summary, account info; fits without scroll on tablet.

#### MultiProjectDashboard (SCR-052)
- **Tablet portrait**: 2-column project card grid (same as home).
- **Tablet landscape**: 3â€“4 column grid.
- **Desktop**: 4+ columns.

---

### shared shell (SCR-035â€“050)

**Source files**: [header.js](../../header.js), [help-drawer.js](../../help-drawer.js), [command-palette.js](../../command-palette.js), [modals.js](../../modals.js), [toast.js](../../toast.js), [coaching.js](../../coaching.js).

#### Header (EL-SCR-035)
- **All breakpoints**: fixed height â‰ˆ 56 px; full width; contains logo (left), page title, file menu + help button (right).
- **Tablet portrait / landscape**: All nav items visible; logo + title readable (title truncates gracefully if > 200 px).
- **Desktop**: Same layout; more space for title.
- **Phone**: Logo shrinks; title abbreviates or hides; nav items wrap to 2 rows (tech debt â€” no hamburger menu).

#### Context bar (EL-SCR-036)
- **All breakpoints**: below header, â‰ˆ 32 px tall; shows active project name, dimensions, thread count, back button; right-aligned close (âœ•) or hamburger menu.
- **Tablet**: Full content visible; no truncation needed.
- **Phone**: Project name may truncate; dimensions shown as "(WÃ—H)" inline or in a popover.

#### Help Drawer (EL-SCR-037, 037aâ€“c)
- **Tablet portrait**: Slides in from left; width â‰ˆ 60â€“70 % viewport (450â€“500 px); height full-screen; three tabs (Help / Shortcuts / Getting Started) as horizontal row at top or vertical column on left.
- **Tablet landscape**: Width â‰ˆ 50â€“60 % viewport (500â€“700 px); same tab layout.
- **Desktop**: Width â‰ˆ 50 % viewport (700 px); fixed; no animation; tabs stay visible.
- **Phone**: Full-width or 90 % viewport; overlays content; dismiss via close button or scrim tap.
- **Content**: Markdown rendered with correct scaling; code blocks do **not** overflow; headings wrap; lists indent properly.
- **Accessibility**: aria-expanded on Help button in Header; keyboard nav within drawer (Tab, Enter, Escape to close).

#### Command Palette (EL-SCR-038)
- **All breakpoints**: modal overlay, centered; width â‰ˆ 80 % viewport, max 500 px; height â‰ˆ 60 % viewport, max 400 px.
- **Tablet**: Keyboard-first (Ctrl+K to open); Escape to close; â†‘â†“ to navigate; Enter to select.
- **Phone**: Same keyboard logic; fits on-screen; search input â‰¥ 32 px tall (acceptable for touch).
- **Scrolling**: Result list scrolls internally; no horizontal scroll.

#### Preferences Modal (EL-SCR-039)
- **All breakpoints**: max-width 560 px (or 100 % on phone); tabs for Creator, Tracker, Manager preferences.
- **Tablet portrait**: Tabs visible as vertical column (left) + content (right); no wrapping.
- **Tablet landscape**: Same; more space.
- **Phone**: Tabs scroll horizontally or stack vertically; content scrolls.
- **Toggles / checkboxes**: â‰¥ 44 Ã— 24 px on touch devices (per Material Design).

#### Toast notifications (EL-SCR-047)
- **All breakpoints**: fixed position, bottom-right or bottom-center; max-width 90 % viewport (min 200 px, max 400 px); height â‰ˆ 48 px; auto-dismiss after 4 s.
- **Tablet portrait**: Positioned 16 px from bottom-right; does **not** overlap essential UI (e.g., colours drawer).
- **Phone**: Centered at bottom; 16 px margin from bottom; width 90 % viewport.
- **Stacking**: Multiple toasts stack vertically (bottom-most is newest); dismiss button (âœ•) â‰¥ 32 px tall.

#### Modals (generic Overlay, SCR-049)
- **Scrim**: Always present; dark overlay (60â€“70 % opacity); tap to close (unless modal is `persistent`).
- **Modal body**: 
  - Desktop: `max-width: 560px`
  - Tablet (`max-width: 899px`): `max-width: 100%` (full width with padding)
  - Phone (`max-width: 599px`): `max-width: 100%`
- **Modal body padding**: 16 px on phone, 24 px on tablet+; no horizontal scroll at any breakpoint.
- **Buttons** (confirm, cancel, etc.): â‰¥ 44 Ã— 40 px on touch; 32 Ã— 24 px acceptable for secondary buttons.
- **Focus management**: first focusable element auto-focused; Escape closes modal; Tab cycles within modal.

#### ThreadSelector modal (SCR-046)
- **All breakpoints**: grid of thread colour chips; chip size depends on available space.
- **Tablet portrait**: 3â€“4 columns of chips; each chip â‰¥ 32 Ã— 32 px (acceptable for viewing; editing via palette-swap if needed).
- **Tablet landscape**: 4â€“5 columns.
- **Desktop**: 6+ columns.
- **Search input**: full width, â‰¥ 32 px tall; placeholder visible; clear button (âœ•) â‰¥ 28 px tall (marginal for touch).

---

## Touch gestures

All gesture recognition is implemented via [touch-constants.js](../../touch-constants.js) (centralised thresholds) and gesture-handler modules ([useDragMark.js](../../useDragMark.js), [creator/useCanvasInteraction.js](../../creator/useCanvasInteraction.js), [tracker-app.js](../../tracker-app.js)).

**Reference**: The intended gesture model is defined in [reports/touch-5-gesture-model.md](../touch-5-gesture-model.md) (Phase 2 proposal); current implementation is in [reports/touch-1-gesture-inventory.md](../touch-1-gesture-inventory.md).

### Universal gestures (all pages)

| Gesture | Threshold | Intended action | Actual (current) | Feedback |
|---|---|---|---|---|
| **Tap (pointer down + up within 10 px / 200 ms)** | `TAP_SLOP_PX: 10`, `TAP_HOLD_MS: 200` | Context-dependent (see per-page rows below) | Varies by tool/mode | Depends on action (cell highlight, menu open, etc.) |
| **Long-press (pointer down, < 5 px movement, â‰¥ 500 ms)** | `LONG_PRESS_MS: 500` | Context menu / secondary action | Only in no-tool state (Creator); range-anchor or context menu (Tracker) | None during the 500 ms wait; menu appears on long-press fire |
| **Two-finger drag** | `MULTI_TOUCH_GRACE_MS: 100` | Pan canvas | Pans via `scrollLeft/scrollTop` delta | Smooth scroll; no inertia |
| **Pinch (two-finger zoom)** | `PINCH_MIN_MOVE_PX: 4` | Zoom (0.3â€“4 Ã—) | Zooms around midpoint of two fingers | Smooth animation; percent-zoom overlay (optional) |
| **Two-finger tap** | `MULTI_FINGER_TAP_MAX_MS: 250`, `MULTI_FINGER_TAP_SLOP_PX: 8` | Undo (**proposed** in touch-5, not yet implemented) | (Not yet wired) | Visual feedback TBD |
| **Three-finger tap** | Same as two-finger | Redo (**proposed**, not yet implemented) | (Not yet wired) | Visual feedback TBD |
| **Double-tap** | `DOUBLE_TAP_MAX_MS: 300`, `DOUBLE_TAP_MAX_DIST_PX: 24` | Zoom to fit (proposed for canvas) | Not yet implemented on all surfaces | (TBD) |
| **Swipe (horizontal or vertical)** | Directional velocity > threshold (TBD) | Drawer dismiss, tab scroll, etc. (**proposed** in touch-5) | Not systematically implemented | (TBD) |

### Creator canvas gestures

| Gesture | Hand tool | Paint / Erase | Fill / Wand / Lasso | Context |
|---|---|---|---|---|
| 1-finger tap | Cell info popover | Place / erase stitch (commit on UP, preview on DOWN) | Run tool (with 10 px slop before commit) | Canvas only |
| 1-finger drag | Pan canvas (NEW intent per touch-5; currently drag-mark disabled when no tool) | Brush stroke | Tool-specific (lasso freehand; others = pan) | Touch-5 proposes Hand tool + per-tool logic |
| 1-finger long-press | Context menu | Context menu | Context menu | After 500 ms, no movement > 5 px |
| 2-finger drag + pinch | Pan + zoom | Pan + zoom (cancels stroke) | Pan + zoom | Always available |
| 2-finger tap | Undo (proposed) | Undo (proposed) | Undo (proposed) | Not yet implemented |

**Current state**: One-finger pan only available when **no tool is active**. Once paint/fill/wand selected, one-finger drag = paint/fill (not pan). This violates the "always pan" principle in touch-5. Two-finger pan is the workaround (not discoverable).

### Tracker canvas gestures

| Gesture | Tracking mode | Intended | Actual | Feedback |
|---|---|---|---|---|
| 1-finger tap (same cell, same location) | Track | Mark/unmark cell (toggle done state) | useDragMark promotes tap â†’ toggles done bit | Cell repaints; progress bar updates |
| 1-finger drag | Track | Mark/unmark run of cells (one undo step) | useDragMark drags immediately (no slop); intent locked from first cell | Cells fill behind finger; intent dictates fill or unfill |
| 1-finger long-press | Track | Set range anchor | useDragMark mode transitions to 'range'; next tap picks opposite corner | Anchor cell pulses (CSS animation); marching-ants briefly on confirm |
| 1-finger shift+click / shift+tap | Track | Range-select from last anchor | useDragMark sees shiftKey (mouse) or (TBD for touch equivalent) | Marching-ants on selected range |
| 2-finger drag + pinch | Track / view | Pan + zoom | tracker-app.js `handleTouchMove` scales and scrolls | Smooth; zoom % overlay (optional) |
| Spacebar + 1-finger drag | Any | Pan (view mode) | Keyboard-only; no touch equivalent except 2-finger | Cursor grab; scroll smoothly |

**Current state**: One-finger drag is **always** mark/unmark (via useDragMark). Pan fallback is 8 px threshold (line 4365 tracker-app.js), but useDragMark preempts it. Result: one-finger pan is rarely accessible; user must use two-finger.

---

## Touch-target audit (â‰¥44 Ã— 44 CSS px)

Material Design and WCAG recommend touch targets â‰¥ 44 Ã— 44 CSS px for primary actions on touch devices. Larger targets (48â€“56 px) are preferred. This section identifies compliance gaps on **tablet (primary device)**.

### Compliant touch targets (44+ px)

| Component | Size on tablet | Status |
|---|---|---|
| Home project cards (tap to open) | 320+ Ã— 80+ px | âœ“ OK |
| Creator ActionBar buttons (export, save, mode) | 44 Ã— 44 px | âœ“ OK (by design) |
| Tracker mark-cell tap (depends on zoom) | â‰¥ 24 px base, zoom to â‰¥ 44 px typical | âœ“ OK (user can zoom) |
| Modals close button (âœ•) | 32 Ã— 32 px | âš  Marginal; tap-slop helps |
| Toast dismiss button (âœ•) | 32 Ã— 32 px | âš  Marginal |
| Modal confirm button | 44 Ã— 40 px | âœ“ OK |
| HelpDrawer close button | 40 Ã— 40 px | âœ“ OK |
| Colours drawer chips (Tracker) | 44 Ã— 44 px | âœ“ OK |

### Non-compliant touch targets (< 44 px) â€” **TECH DEBT**

| Component | Size on tablet | Severity | EL-ID | Affected areas |
|---|---|---|---|---|
| **Creator top toolbar buttons** | 22 Ã— 22 px | **P1** | EL-SCR-011-* | Creator canvas; overflow menu buttons smaller |
| **Creator right-panel tabs** (Prepare/Pattern/Legend/Export/Project) | 28 px tall | **P1** | EL-SCR-005â€“009 | Creator main interface |
| **Creator sidebar palette chips** | 28 Ã— 28 px | P2 | EL-SCR-012-* | Sidebar; editing via palette-swap modal is preferred |
| **Manager inventory action buttons** | 24â€“32 px | P2 | SCR-029 | Table actions (edit, delete, etc.) |
| **Header nav hamburger** (if added for phone) | TBD | P2 | EL-SCR-035 | Phone portrait only |
| **Modals secondary buttons** | 32 Ã— 24 px | P2 | SCR-049 | Secondary actions (Cancel, Not Now, etc.) |
| **Command Palette search clear button** | 28 px | P3 | EL-SCR-038 | Shortcut; keyboard-first so touch priority lower |
| **ThreadSelector chip size at density** | 32 Ã— 32 px (typical) | P2 | SCR-046 | Colour selection; often used via keyboard on desktop |

### Tap-slop mitigation

The app uses `TAP_SLOP_PX: 10` to allow accidental sub-pixel movement. This gives marginal targets (24â€“32 px) an implicit 10 px grace window, effectively 34â€“42 px. **This is not sufficient** for targets â‰¥ 44 px best practice, but helps reduce false negatives.

---

## Functional parity check

All features must remain accessible at every supported breakpoint. Features that are **intentionally desktop-only** are listed below; all others must have a touch-friendly alternative.

### Desktop-only features (acceptable loss)

- **Alt+click (spotlight mode)** (Tracker) â€” keyboard modifier only; touch alternative via UI menu or long-press (not yet implemented).
- **Right-click context menu** (Creator canvas) â€” mouse-only; touch equivalent is long-press (available in no-tool state; **P1 gap**: unavailable with tool active).
- **Spacebar+drag pan** (Creator, Tracker) â€” keyboard + mouse; touch equivalents: Hand tool (proposed), two-finger drag (exists), one-finger pan (Creator gap, Tracker fallback).
- **Ctrl+wheel zoom** (Creator, Tracker) â€” keyboard + mouse; touch equivalent: pinch (works).
- **Double-click** (Tracker edit mode) â€” mouse-only; touch double-tap not detected (tech debt).

### Features requiring tablet support

| Feature | Creator | Tracker | Manager | Status |
|---|---|---|---|---|
| **Paint / erase stitches** | One-finger drag | âœ“ Available | N/A | âœ“ Works on tablet |
| **Pan canvas** | Two-finger drag (gap: no one-finger pan with tool active) | Two-finger drag + 8 px fallback | N/A | âš  Two-finger required when tool active (not discoverable) |
| **Zoom canvas** | Pinch | Pinch | N/A | âœ“ Works on tablet |
| **Context menu** | Long-press in no-tool state (gap: unavailable with tool active) | Long-press (range-anchor) | Right-click menu or item-specific actions | âš  Long-press unavailable with tool active in Creator |
| **Undo / redo** | Keyboard (Ctrl+Z / Ctrl+Y) or Edit menu | Same | Same | âš  Two-finger tap (proposed) not implemented |
| **Select run of cells** (Tracker) | N/A | One-finger drag | N/A | âœ“ Works |
| **Range-select** (Tracker) | N/A | Long-press + tap, or shift+click | N/A | âš  Shift+click is mouse-only; long-press equivalent exists |
| **Colour selection** | Click chips or palette-swap modal | Drawer or palette-swap modal | Click chips in inventory | âœ“ Works on tablet (modal-based) |
| **Thread inventory search** (Manager) | N/A | N/A | Search input field | âœ“ Works |
| **Thread quantity edit** (Manager) | N/A | N/A | Number input or buttons (Â±) | âœ“ Works; buttons â‰¥ 32 px |
| **Pattern grid scroll** (Manager, Home) | N/A | N/A | Swipe or scroll | âœ“ Works (native scroll on tablet) |

### Gaps / workarounds

1. **Creator: one-finger pan with tool active** â€” Gap exists (only two-finger available). Touch-5 proposes Hand tool + per-tool logic to fix. Workaround: zoom to fit, use spacebar on keyboard, or select no-tool state.
2. **Creator: long-press context menu with tool active** â€” Gap exists. Workaround: open context menu via keyboard or use dedicated edit modals.
3. **Tracker: double-tap zoom-to-fit** â€” Not implemented; workaround is pinch + pan to fit.
4. **Undo / redo via two-finger tap** â€” Proposed in touch-5; not yet wired. Workaround: keyboard (Ctrl+Z / Ctrl+Y) or Edit menu.
5. **Tracker: range-select via shift+tap** â€” Only shift+click works; long-press range-anchor exists as an alternative workflow.

---

## DISCOVERED.md appendix

This cross-cutting spec's discovery process identified the following assets and facts not yet catalogued elsewhere:

### Media query consolidation needed
- Breakpoints are fragmented: `599px / 600px / 899px / 900px / 1024px`.
- `pointer:coarse` is used in some components but not consistently.
- **Action**: Phase 4 should define a canonical breakpoint scheme (e.g. `480px / 768px / 1024px / 1280px`) and consolidate all `@media` queries.

### Touch-target sizing issues on Creator
- ToolStrip buttons and right-panel tabs are 22â€“28 px tall â€” below 44 px floor.
- Palette chips in sidebar are 28 Ã— 28 px (not primary action, but suboptimal).
- **Action**: Phase 3 (or Phase 4 if design direction approves) should increase button padding or change layout to meet 44 px target on tablet.

### Gesture implementation gaps
- One-finger pan is unavailable when a tool is active in Creator (only two-finger works).
- Long-press context menu is unavailable when a tool is active in Creator.
- Two-finger tap (undo) and three-finger tap (redo) are **proposed** in touch-5 but not yet implemented.
- Double-tap zoom-to-fit is not implemented.
- **Action**: touch-5 to be reviewed in Phase 3; implementation pending Phase 4 gate.

### Drawer sizing on tablet
- Help Drawer width is not explicitly defined; likely 60â€“70 % viewport on tablet portrait.
- Tracker Colours Drawer height is not explicitly constrained; should be â‰¤ 60 % viewport to preserve canvas view.
- **Action**: Phase 1 spec updates or Phase 3 verification should define explicit min-width / max-height constraints.

### Modal constraints at tablet
- Modal max-width is 560 px at all breakpoints â‰¥ 900 px; this leaves 90 px margins on 768 px tablet portrait.
- On very large screens (â‰¥ 1400 px), 560 px can feel cramped. Consider breakpoint-based max-width increase (e.g. max-width 600â€“700 px at â‰¥ 1280 px).
- **Action**: Phase 4 optional refinement; current sizing is acceptable.

### Sidebar collapse pref on Tracker
- `tracker.leftSidebarMode` pref controls sidebar visibility.
- Spec does not currently define collapse breakpoint (i.e., should sidebar auto-collapse on phone?).
- **Action**: Phase 1 Tracker spec or Phase 4 prefs agent should clarify.

### Project grid layout not explicitly defined
- Home project cards use `grid-template-columns: repeat(auto-fit, minmax(...))` or similar; exact formula not documented.
- **Action**: Phase 1 Home spec should define explicit grid formula per breakpoint.

---

## VERIFICATION TODO

All verification items below use severity scale **P0 (Broken) â†’ P1 (Misleading) â†’ P2 (Suboptimal) â†’ P3 (Cosmetic) â†’ P4 (Future)** per [reports/00_PROJECT_CONTEXT.md](../../reports/00_PROJECT_CONTEXT.md) Â§ 8.

### P0 (Critical â€” feature broken)

- [ ] `VER-RESP-P0-001` â€” At all breakpoints â‰¤ 1023 px, modals fit within viewport without horizontal scroll. Test at 768 px (iPad portrait): Adapt Modal, ImportWizard steps, BulkAdd Modal, ColourReplace Modal, Shopping List Modal, Preferences Modal must all fit with 16 px padding and no h-scroll.

- [ ] `VER-RESP-P0-002` â€” Creator canvas at tablet (768 Ã— 1024) remains usable (â‰¥ 200 px wide) after sidebar + rpanel layout. Zoom 100 %, verify canvas area â‰¥ 200 px wide and â‰¥ 300 px tall before overflow scroll appears.

- [ ] `VER-RESP-P0-003` â€” Tracker canvas at tablet (768 Ã— 1024) with Colours Drawer open: canvas remains â‰¥ 500 px tall; drawer â‰¤ 60 % viewport (â‰¤ 400 px); user can see both simultaneously without excessive scrolling.

- [ ] `VER-RESP-P0-004` â€” Touch-action CSS prevents browser default pinch/pan on all canvas elements (Creator PatternCanvas, Tracker main canvas). Verify `touch-action: none` on canvas containers.

### P1 (Misleading â€” target sizes below WCAG floor)

- [ ] `VER-RESP-P1-001` â€” Creator ToolStrip buttons (EL-SCR-011-*) measure â‰¥ 44 Ã— 44 CSS px on touch-tablet-chromium (768 Ã— 1024) viewport. Current size 22 Ã— 22 px; must increase button or padding to pass.

- [ ] `VER-RESP-P1-002` â€” Creator right-panel tabs (Prepare, Pattern, Legend, Export, Project) are â‰¥ 44 px tall (or â‰¥ 32 px with 10 px tap-slop grace; prefer 44 px). Current size â‰ˆ 28 px; must increase padding or rearrange tab layout.

- [ ] `VER-RESP-P1-003` â€” All primary action buttons in modals (Confirm, Save, Create, etc.) on tablet are â‰¥ 44 Ã— 40 CSS px. Test Adapt Modal, ImportWizard final step, BulkAdd Modal confirm buttons.

- [ ] `VER-RESP-P1-004` â€” Tracker Colours Drawer (EL-SCR-025) fits on iPad portrait (768 Ã— 1024) without vertical scroll for typical thread count (20â€“30 colours); if scroll needed, height â‰¤ 60 % viewport.

- [ ] `VER-RESP-P1-005` â€” Help Drawer (EL-SCR-037) on tablet portrait opens to â‰¤ 70 % viewport width so remaining canvas/content is visible; width â‰¥ 450 px minimum so Shortcuts tab doesn't truncate key names.

### P2 (Suboptimal â€” minor gaps in touch experience)

- [ ] `VER-RESP-P2-001` â€” Creator sidebar palette chips (EL-SCR-012-*) on tablet portrait are â‰¥ 28 Ã— 28 px each; acceptable if palette-swap modal is primary workflow. Verify no adjacent chip borders cause mistaps due to shared 0 px gap (chips should have gap or be 44 Ã— 44 px if primary).

- [ ] `VER-RESP-P2-002` â€” Manager inventory table (SCR-029) on tablet portrait does not overflow horizontally beyond 768 px viewport without user explicitly swiping/scrolling. Either hide non-essential columns or switch to card-view layout.

- [ ] `VER-RESP-P2-003` â€” Manager pattern library (SCR-030) on tablet portrait displays â‰¥ 2 pattern thumbnails per row; each thumbnail â‰¥ 44 Ã— 44 px; title + action buttons do not cause horizontal scroll.

- [ ] `VER-RESP-P2-004` â€” Home project grid (EL-SCR-001-10, the list container) on tablet portrait shows â‰¥ 2 project cards per row; no cards wrap awkwardly or truncate titles excessively. _(Corrected per VER-CONF-002 â€” previously referenced EL-SCR-001-01 which is the Header, not the project grid.)_

- [ ] `VER-RESP-P2-005` â€” Command Palette (EL-SCR-038) search input on tablet is â‰¥ 40 px tall and centered; result list scrolls vertically without horizontal scroll; initial focus on search input.

- [ ] `VER-RESP-P2-006` â€” Preferences Modal (EL-SCR-039) on tablet portrait: preference toggles/checkboxes are â‰¥ 44 Ã— 24 px; tabs visible without wrapping; content scrolls vertically only.

- [ ] `VER-RESP-P2-007` â€” ThreadSelector modal (SCR-046) on tablet portrait displays thread chips in â‰¥ 3 columns; no horizontal scroll needed for typical palette (50â€“100 threads).

- [ ] `VER-RESP-P2-008` â€” Toast notifications (EL-SCR-047) on tablet portrait do not overlap Colours Drawer (Tracker) or other persistent UI; positioned â‰¥ 16 px from viewport edge.

- [ ] `VER-RESP-P2-009` â€” Tracker sidebar (leftSidebarMode pref) on tablet portrait: when visible, sidebar is â‰¥ 150 px wide and â‰¤ 250 px (proportional); canvas area remains â‰¥ 300 px wide; when collapsed, canvas expands to full-width-minus-header.

- [ ] `VER-RESP-P2-010` â€” Creator Prepare tab Materials Hub (EL-SCR-055) on tablet portrait: material grid collapses to 1 column; materials list scrolls vertically; modals (BulkAdd, Shopping List) fit without h-scroll.

### P3 (Cosmetic â€” visual polish on touch devices)

- [ ] `VER-RESP-P3-001` â€” Modals on tablet landscape (1024 Ã— 768) do not feel cramped; consider max-width increase (e.g., max 600 px instead of 560 px) if designer approves.

- [ ] `VER-RESP-P3-002` â€” Creator zoom indicator (% overlay) appears briefly on pinch (â‰¤ 600 ms); position does not block content.

- [ ] `VER-RESP-P3-003` â€” Tracker progress bar (EL-SCR-001-07) on all breakpoints: height â‰¥ 4 px; no jank during animation; color contrast â‰¥ 4.5:1 (WCAG AA).

- [ ] `VER-RESP-P3-004` â€” Header Help button aria-expanded state synced with HelpDrawer open/close via cs:helpStateChange event; no drift when drawer toggled.

- [ ] `VER-RESP-P3-005` â€” Coachmark overlay (EL-SCR-048) on tablet portrait does not obstruct â‰¥ 50 % of canvas; highlight spot â‰¥ 8 px border radius; close button (âœ•) â‰¥ 32 px.

### P4 (Future â€” Phase 3+ refinements)

- [ ] `VER-RESP-P4-001` â€” Double-tap zoom-to-fit (proposed in touch-5) implemented on Creator canvas; zooms to fit entire pattern or current selection; smooth 300 ms animation.

- [ ] `VER-RESP-P4-002` â€” Two-finger tap undo and three-finger tap redo (proposed in touch-5) wired on Creator and Tracker canvas; â‰¤ 250 ms both fingers lift without pinch (â‰¥ 4 px relative move = pinch, not undo).

- [ ] `VER-RESP-P4-003` â€” Creator Hand tool (proposed in touch-5) implemented as explicit mode button in ToolStrip; when active, one-finger drag = pan, one-finger tap = cell info.

- [ ] `VER-RESP-P4-004` â€” One-finger long-press context menu available in **all** Creator tool states (currently only works in no-tool state); fires after 500 ms with < 5 px movement.

- [ ] `VER-RESP-P4-005` â€” Phone portrait (< 480 px) layout completely verified; nav collapse implemented (hamburger menu); all touch targets â‰¥ 44 px or justified as below-floor with tap-slop grace.

- [ ] `VER-RESP-P4-006` â€” Swipe gestures (proposed in touch-5): horizontal swipe to dismiss drawers; vertical swipe to scroll tabs; implemented with momentum fallback to native scroll.

- [ ] `VER-RESP-P4-007` â€” Consolidated media query breakpoint scheme (`480px / 768px / 1024px / 1280px`) applied across all `@media` rules in [styles.css](../../styles.css); `pointer:coarse` used consistently or removed.

- [ ] `VER-RESP-P4-008` â€” Horizontal pan fallback (8 px threshold in Tracker) documented and tested; intentional gap in one-finger pan availability (Creator with tool active) accepted or fixed per touch-5 resolution.

- [ ] `VER-RESP-P4-009` â€” Haptic feedback (optional) added on touch devices for tap/drag commit (e.g., `navigator.vibrate([10])` on POINTER_UP); tests pass on iPad and Android tablets.