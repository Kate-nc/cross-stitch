# Area Spec: tracker

## Scope

The Tracker is a dedicated stitching companion app (stitch.html) for marking stitches done on saved patterns, tracking time and stitches per session, managing thread consumption in real-time, and exporting progress as a Pattern Keeper PDF. It comprises a large interactive canvas (SCR-024), bottom colour drawer with thread metadata (SCR-025), export/preview modals (SCR-026â€“027), a stats dashboard (SCR-028), and a welcome/style onboarding flow (SCR-042/a/b).

**Key constraints:**
- **Tablet-first companion**: primary use is on iPad during active stitching. Phone and desktop layouts must support drag-marking, pinch-zoom, wake-lock, and orientation changes.
- **No mode tab UI**: modes toggle via spacebar or button pill; view mode selected from a dropdown or left sidebar.
- **Real-time stash deduction** (Proposal D): live consumption display with waste settings, low-thread toasts, and skein meters in the colours drawer.
- **Half-stitches & partial stitches**: stored in sparse Maps; separate marking mode.
- **Park markers**: long-press or mode-specific tool to drop coloured guide markers on the canvas.
- **Bit-stable PDF export**: Pattern Keeper compat is non-negotiable; no format changes without explicit regression test.

---

## Screen: SCR-024 â€” Tracker Canvas (main stitch canvas)

The central interactive grid where users mark stitches as done, toggle view modes, and navigate the pattern. Supports multiple marking gestures (tap, drag, long-press range-select), view modes (symbol, colour, highlight), and optional guided working (blocks, focus areas, counting aids).

### EL-SCR-024-01: Canvas Container
- Role: scrollable SVG/canvas rendering surface for the pattern grid
- Scroll: horizontal/vertical pan via mouse/touch. Spacebar + mouse drag / two-finger drag on touch.
- Zoom: mousewheel / Ctrl+wheel; pinch-zoom on touch
- Dimensions: responsive; fills viewport minus header/toolbar/chrome
- **Classes**: `canvas-area` (scroll container), canvas element itself rendered via `PatternCanvas` React component
- **Ref**: `stitchScrollRef` for scroll state, `stitchZoomRef` for live zoom level
- **P1 TABLET TODO**: VER-EL-SCR-024-01-01 â€” Verify pinch-zoom works on iPad; pinch-pan two-finger drag doesn't accidentally toggle mark mode
- **P2 TABLET TODO**: VER-EL-SCR-024-01-02 â€” Verify scroll momentum/inertia doesn't cause unintended taps

### EL-SCR-024-02: Stitch Marking (Tap Gesture)
- Trigger: single click/tap on a cell
- Behaviour: toggles the cell's done state (0 â†’ 1 or 1 â†’ 0) in the `done` array
- Effect: incremental counter `doneCountRef` updates; colour-specific counts updated via `applyDoneCountsDelta`
- Undo: single undo snapshot stored; can be restored via Ctrl+Z or Edit Mode discard
- **P0 TODO**: VER-EL-SCR-024-02-01 â€” Verify tap on empty/skip cells is no-op
- **P1 TODO**: VER-EL-SCR-024-02-02 â€” Fast double-tap doesn't toggle twice; second tap queued until first counter updates
- **P1 TABLET TODO**: VER-EL-SCR-024-02-03 â€” Tap on iPad with gloved hand (haptic feedback?) doesn't mis-fire; 200ms guard window prevents accidental drag-mark

### EL-SCR-024-03: Drag-Mark Gesture
- Trigger: pointer down, move >10px (tapSlop), collect crossed cells; pointer up commits
- Behaviour: all cells crossed by the drag path are marked with a single intent (mark or unmark, based on the FIRST cell's state)
- Skip cells / empty cells excluded from collection
- Multi-touch guard: second pointer arrival within 100ms aborts the drag; browser handles pinch natively
- Undo: single undo snapshot; Ctrl+Z restores
- **P0 TODO**: VER-EL-SCR-024-03-01 â€” Drag across 50 cells commits as one undo step; no intermediate marks
- **P1 TABLET TODO**: VER-EL-SCR-024-03-02 â€” Drag on iPad doesn't mis-detect as pan when near scroll edge; 10px threshold respected
- **P2 TABLET TODO**: VER-EL-SCR-024-03-03 â€” Two-finger drag on iPad aborts drag-mark and pans instead; pinch-zoom unaffected

### EL-SCR-024-04: Long-Press Range-Select Gesture
- Trigger: pointer down with no movement for 500ms
- Behaviour: sets an anchor cell; next tap on a different cell commits the bounding rectangle
- Anchor persists across taps (visual feedback: border or highlight on anchor)
- Shift+click (mouse) / second touch quickly after first commits range without anchor wait
- **P1 TODO**: VER-EL-SCR-024-04-01 â€” Long-press at edge of viewport doesn't auto-scroll; range-select is viewport-local
- **P2 TABLET TODO**: VER-EL-SCR-024-04-02 â€” Long-press on iPad doesn't trigger system context menu; preventDefault propagated correctly
- **P1 TODO**: VER-EL-SCR-024-04-03 â€” Anchor visual indicator visible at zoom levels 0.5Ã— to 4Ã—; readable text/border colour

### EL-SCR-024-05: Mode Toggle (Track vs Navigate)
- Location: top toolbar or floating pill (phone immersive mode)
- Label: shows current mode (Track / Navigate)
- Hotkey: Spacebar toggles between modes
- Track Mode:
  - Tap/drag marks stitches done
  - Canvas does not pan or navigate
- Navigate Mode:
  - Tap/drag moves a guide crosshair or pans the canvas
  - Stitches not marked (read-only canvas)
  - Spacebar returns to Track
- **P0 TODO**: VER-EL-SCR-024-05-01 â€” Spacebar toggle doesn't fire when input is focused (e.g. search box, prefs modal open)
- **P1 TABLET TODO**: VER-EL-SCR-024-05-02 â€” iPad on-screen keyboard doesn't consume spacebar; toggle works with external keyboard
- **P2 TODO**: VER-EL-SCR-024-05-03 â€” Rapid Spacebar mash (>5 toggles/sec) doesn't crash; debounce or queue

### EL-SCR-024-06: View Mode Selector
- Location: left sidebar or dropdown in action bar
- Options: symbol (default), colour (swatch colours), highlight (single focus colour with variants)
- Persist: UserPrefs key `trackerDefaultView`
- Highlight-mode detail:
  - Isolate: dim non-focus cells; focus cells bright
  - Outline: outline focus cells only
  - Tint: overlay focus cells with a colour tint (default #FFD700 gold, 40% opacity)
  - Spotlight: show focus colour and dim rest in a radial gradient
- **P1 TODO**: VER-EL-SCR-024-06-01 â€” Switching view modes at zoom 3Ã— doesn't flicker or lose scroll position
- **P1 TABLET TODO**: VER-EL-SCR-024-06-02 â€” View mode dropdown/sidebar accessible in both portrait and landscape; font size remains legible at <600px width

### EL-SCR-024-07: Highlight Mode Configuration
- Location: left sidebar (Highlight tab) or gear icon in toolbar
- Controls:
  - Highlight mode picker (isolate/outline/tint/spotlight) with visual previews
  - Tint colour picker (if applicable, e.g. Tint/Spotlight modes)
  - Opacity slider (for dim level, tint, spotlight; 0â€“100%)
- Persist: UserPrefs keys for mode, tint colour, tint opacity, spot dim opacity
- **P1 TODO**: VER-EL-SCR-024-07-01 â€” Opacity slider updates canvas in real-time; no 500ms+ lag
- **P2 TABLET TODO**: VER-EL-SCR-024-07-02 â€” Colour picker on small screens (iPhone SE) fits in modal or slides up; not cut off

### EL-SCR-024-08: Fabric Colour Customization
- Location: Preferences modal (Tracker tab)
- Control: colour picker for canvas background fabric (default #FFFFFF)
- Persist: UserPrefs key `trackerFabricColour` (validated #RRGGBB)
- Threading: optional texture toggle (UserPrefs `trackerCanvasTexture`)
- **P1 TODO**: VER-EL-SCR-024-08-01 â€” Fabric colour persists across sessions; load â†’ verify matches last used
- **P2 TODO**: VER-EL-SCR-024-08-02 â€” Contrast: dark fabric + dark stitch colour must have minimum 3:1 luminance ratio for visibility

### EL-SCR-024-09: Stitch Mode Selector (Full, Half, Backstitch, etc.)
- Location: left sidebar (Layers tab) or toolbar strip
- Layers (all togglable):
  - Full Cross (default, F key)
  - Half Stitch (H key, sparse Map-based)
  - Backstitch (B key, line segments)
  - Quarter, Petite, French Knot, Long Stitch (no hotkeys)
- State: `layerVis` object tracks visibility per layer
- Solo mode: double-click a layer to show only that layer; click again to restore
- **P1 TODO**: VER-EL-SCR-024-09-01 â€” Solo timer 3s; clicking other layer buttons within timer resets it (doesn't auto-exit)
- **P1 TABLET TODO**: VER-EL-SCR-024-09-02 â€” Layer buttons on touch screen have 44px min-height; no accidental toggles

### EL-SCR-024-10: Counting Aids
- Location: left sidebar (Counting tab)
- Options:
  - Toggle counting aids on/off (default on)
  - Run direction (horizontal / vertical)
  - Run minimum length (3â€“20 stitches)
  - Ninja mode (fast-flashing 10Ã— visual accent on done sequences)
- Rendering: overlay grid or dashed lines every N stitches
- **P1 TODO**: VER-EL-SCR-024-10-01 â€” Counting lines don't interfere with stitch visibility at 100% zoom; opacity <15%
- **P2 TABLET TODO**: VER-EL-SCR-024-10-02 â€” Ninja mode flash rate doesn't cause seizure risk; capped at 10 Hz, prefers-reduced-motion respected

### EL-SCR-024-11: Park Markers
- Trigger: long-tap on a cell (500ms hold with no movement) in Navigate mode, or dedicated Park tool
- Visual: coloured dot or flag overlay on the cell
- Marker data: `parkMarkers` array stores `{x, y, colorId, timestamp, note?}`
- Visibility: per-colour toggle in `parkLayers` (all layers visible by default)
- Bulk hide: "Hide all" button hides all parked colours at once
- **P1 TODO**: VER-EL-SCR-024-11-01 â€” Park marker persists across zoom/scroll; anchor to cell, not screen
- **P2 TABLET TODO**: VER-EL-SCR-024-11-02 â€” Long-press to place marker doesn't accidentally trigger text selection or context menu
- **P1 TODO**: VER-EL-SCR-024-11-03 â€” Long-press on an already-parked cell opens marker detail (edit note, change colour, delete)

### EL-SCR-024-12: Half-Stitch Marking Mode
- Trigger: dedicated tool or hotkey (H in Layers tab)
- Behaviour: tap to open `halfDisambig` popover at cell; user selects fwd/bck half or both
- Storage: `halfStitches` sparse Map keyed by cellIdx; value is `{fwd, bck}` with `{id, rgb, name, symbol}`
- Undo: separate from full-stitch undo (independent snapshot)
- Display: when layer visible, render smaller thread-colour indicators in corners or half-cell
- **P1 TODO**: VER-EL-SCR-024-12-01 â€” Half-stitch popover doesn't overflow on cells near edges; repositions
- **P1 TABLET TODO**: VER-EL-SCR-024-12-02 â€” Half-stitch popover on touch doesn't auto-close on blur; explicit close button or tap-outside
- **P1 TODO**: VER-EL-SCR-024-12-03 â€” Half-stitch progress counts as 0.5 stitch in stats; verified in combined progress calc

### EL-SCR-024-13: Partial Stitch Support
- Component: `PartialStitchThumb` (SCR-050)
- Location: cell detail popover (optional advanced view)
- Shows: thumbnail of the partial stitch pattern (e.g. quarter, petite, French knot) for the cell
- **P1 TODO**: VER-EL-SCR-024-13-01 â€” PartialStitchThumb SVG scales correctly at 0.5Ã— to 2Ã— cell size; no pixelation
- **P2 TABLET TODO**: VER-EL-SCR-024-13-02 â€” Partial stitch popover on iPhone 11 (375px wide) doesn't extend past safe area

### EL-SCR-024-14: Focus Block / Spatial Focus Area
- Purpose: let users work in blocks (e.g. 10Ã—10, 10Ã—20) and focus on one block at a time
- Stitching styles: "block" (square sections), "cross-country" (one colour at a time), "freestyle" (no fixed method)
- Configuration: block width/height (5â€“100, default 10Ã—10); start corner (TL/TR/C/BL/BR)
- Persist: localStorage keys `cs_blockW`, `cs_blockH`, `cs_stitchStyle`, `cs_startCorner`
- Display: optional grid overlay showing blocks; current block highlighted with border
- Advance toast: when a block is 100% done, show brief toast "Block X complete!"
- **P1 TODO**: VER-EL-SCR-024-14-01 â€” Block grid renders correctly for non-square patterns (60Ã—100)
- **P1 TABLET TODO**: VER-EL-SCR-024-14-02 â€” Current block highlight visible on iPad in both landscape and portrait; border width scales with zoom

### EL-SCR-024-15: Stitching Style Onboarding Modal
- Trigger: first visit (unless dismissed); also callable from toolbar "Stitching style" affordance
- Component: `StitchingStyleStepBody` (reused by Welcome Wizard)
- Flow:
  1. **Screen 1**: Pick general working style (block / cross-country / freestyle)
  2. **Screen 2** (if block): Pick block shape (10Ã—10 / 10Ã—20 / 20Ã—20 / custom)
  3. **Screen 3**: Pick start corner (TL / TR / C / BL / BR)
- Output: commits `{style, blockW, blockH, startCorner}` to localStorage + UserPrefs
- Flag: localStorage `cs_styleOnboardingDone`
- **P1 TODO**: VER-EL-SCR-024-15-01 â€” Custom block size validation: W/H must be >=5 and <=100; warning if not divisible by 10
- **P1 TABLET TODO**: VER-EL-SCR-024-15-02 â€” On iPad landscape, modal content doesn't exceed 600px; on portrait fits in safe area

### EL-SCR-024-16: Breadcrumb Trail (Session Playback)
- Purpose: visualize the order and path of stitches completed in the current or past session
- Display: optional animated breadcrumb path on canvas (small circles connected by thin lines)
- Toggle: `breadcrumbVisible` checkbox in left sidebar
- Data: `breadcrumbs` array stores `{idx, timestamp, sessionId}` for each marked stitch
- **P2 TABLET TODO**: VER-EL-SCR-024-16-01 â€” Breadcrumb animation doesn't stutter on iPad Air 2 (old GPU); capped FPS or simplified path
- **P1 TODO**: VER-EL-SCR-024-16-02 â€” Long sessions (>10k stitches) don't tank performance; breadcrumbs culled or decimated for old sessions

### EL-SCR-024-17: Realistic Preview (Detailed Stitch Visualization)
- Trigger: Preview button in toolbar or modal via "Realistic view"
- Component: `TrackerPreviewModal` (standalone version of creator's RealisticCanvas)
- Levels (buttonset to toggle):
  1. Flat (solid thread colour, no shading)
  2. Shaded (basic shadow/highlight on cross)
  3. Detailed (multi-strand rendering, coverage simulation)
  4. Detailed+blend (fabric weave simulation + blend strand variation)
- Canvas: max 8192Ã—8192 internal; scales to fit 700Ã—500 display area
- **P0 TODO**: VER-EL-SCR-024-17-01 â€” Realistic canvas byte output unchanged from Phase 0; PK-compat verified
- **P1 TABLET TODO**: VER-EL-SCR-024-17-02 â€” Realistic preview on iPad renders without OOM; internal canvas limited to 8192px

### EL-SCR-024-18: Edit Mode (Bulk Edit / Colour Change)
- Trigger: Edit button in toolbar
- States:
  - Off (read-only canvas, marking enabled)
  - On (read-write canvas, marking disabled, click to edit cell)
  - Cell popover open (edit colour, remove, or change to different thread)
- Popover: colour selector, "remove stitch" button, apply/cancel
- Undo: single snapshot taken on enter; discard restores from snapshot
- **P1 TODO**: VER-EL-SCR-024-18-01 â€” Edit mode doesn't interfere with stats tracking; in-edit changes don't count toward session stats until applied
- **P1 TABLET TODO**: VER-EL-SCR-024-18-02 â€” Colour picker in edit popover on iPhone doesn't extend off-screen; scrollable or fits in modal

### EL-SCR-024-19: Immersive Mode (Full-Screen Canvas on Mobile)
- Trigger: top/bottom chrome slides off-screen during scroll (detected on touch / <900px)
- Body class: `tracker-immersive`
- Behaviour: topbar (header) and toolbar (dock) hidden; canvas expands to fill viewport
- Reappear: on upward scroll or on tap of a top-edge reveal zone
- **P1 TABLET TODO**: VER-EL-SCR-024-19-01 â€” Immersive mode on iPad in split-screen (50vw) works; chrome reappears correctly
- **P1 TODO**: VER-EL-SCR-024-19-02 â€” Safari on iPhone â€” status bar doesn't overlap canvas during immersive mode; viewport-fit:cover respected

### EL-SCR-024-20: Wake-Lock Chip
- Location: toolbar (phone) or floating badge
- Toggle: turns on screen wake-lock (navigator.wakeLock.request('screen'))
- State: persisted per project via UserPrefs `trackerWakeLock`
- Fallback: on unsupported browsers, show toast "Screen wake-lock not available"
- **P2 TABLET TODO**: VER-EL-SCR-024-20-01 â€” Wake-lock on iPad during stitching keeps display on for >8 hours (battery test)
- **P1 TODO**: VER-EL-SCR-024-20-02 â€” Release on tab hide (visibilitychange); re-acquire on tab focus if pref is true

### EL-SCR-024-21: Left Sidebar (Multi-Tab Layout)
- Location: left edge of viewport; collapses on phone, always open on desktop (900px+)
- Modes: hidden / rail / open
- Hotkey: Hamburger button cycles hidden â†’ rail â†’ open
- Tabs:
  - Highlight (view mode + tint settings)
  - Layers (stitch types visibility + solo toggle)
  - Counting (aid toggles + run config)
  - Sessions (active session timer + playback)
  - Threads (palette with live-consumption meters)
- Persist: UserPrefs `trackerLeftSidebarMode`, `trackerLeftSidebarTab`
- Rail mode: shows tab icons only; expand on hover or click
- **P1 TABLET TODO**: VER-EL-SCR-024-21-01 â€” Rail mode on iPad in 600px split-screen doesn't cover canvas; width <80px
- **P1 TABLET TODO**: VER-EL-SCR-024-21-02 â€” Tab content (Highlight, Layers) scrollable if >80vh; internal scroll, sidebar stays fixed

### EL-SCR-024-22: Mobile Bottom Dock & Action Bar
- Location: bottom edge (phone / <600px)
- Elements:
  - Mode toggle (Track / Navigate)
  - View mode quick-switch
  - Stats / Timer button
  - More button (gear/menu)
- Draggable: vertical position saved in localStorage `tracker_dock_y` (40% default)
- **P1 TABLET TODO**: VER-EL-SCR-024-22-01 â€” Dock position persists on iPad rotate landscapeâ†’portrait; Y offset scaled proportionally
- **P1 TABLET TODO**: VER-EL-SCR-024-22-02 â€” Dock doesn't occlude keyboard on iPhone when input focused

### EL-SCR-024-23: Focus Mode (F Key Toggle)
- Hotkey: F (when no input focused)
- Body class: `cs-focus`
- Behaviour: hide header, sidebar, dock; show only canvas + minimal floating mini-bar
- Mini-bar: contains Escape button, timer, mode toggle
- Fade: mini-bar fades after 4s (FOCUS_MINIBAR_FADE_MS); move mouse/tap to unfade
- **P1 TODO**: VER-EL-SCR-024-23-01 â€” Focus mode on large monitor (4K) still centers mini-bar; not lost off-screen
- **P2 TABLET TODO**: VER-EL-SCR-024-23-02 â€” iPad in landscape focus mode â€” mini-bar at bottom-right, not top-left (respects rtl?)

### EL-SCR-024-24: Session Timer & Auto-Pause
- Display: top-right toolbar or left sidebar (Sessions tab)
- Timer: incremental clock showing HH:MM for current session
- Auto-session: tracks stitches completed since session started
- Inactivity auto-pause: if no stitch event for N minutes (UserPrefs `trackerIdleMinutes`, default 10), pause session
- Manual pause/resume: buttons or hotkey
- **P1 TODO**: VER-EL-SCR-024-24-01 â€” Inactivity timer doesn't fire when user is actively scrolling/panning canvas
- **P1 TABLET TODO**: VER-EL-SCR-024-24-02 â€” Timer display visible on all zoom levels; font size doesn't shrink below 12px
- **P1 TODO**: VER-EL-SCR-024-24-03 â€” Pause state reflected in mini-bar and full timer display; UI consistent

### EL-SCR-024-25: Session Config Modal
- Trigger: "Start Session" button or after loaded project without active session
- Component: `SessionConfigModal`
- Fields:
  - Time available (15 min / 30 min / 1 hr / 2 hr / Open-ended)
  - Stitch goal (optional number input)
- Commit: creates a new session record; timer starts
- **P1 TODO**: VER-EL-SCR-024-25-01 â€” Goal input validation: only positive integers; range 1â€“10000
- **P1 TABLET TODO**: VER-EL-SCR-024-25-02 â€” Number keyboard on iOS shows return key (enterKeyHint="done")

### EL-SCR-024-26: Session Summary Modal
- Trigger: after session ends (manually or inactivity timeout)
- Component: `SessionSummaryModal`
- Data shown:
  - Duration (MM:SS or HH:MM:SS)
  - Stitches completed (count)
  - Speed (stitches/hour) + delta vs previous average
  - Progress (% before â†’ % after)
  - Blocks/colours completed (if applicable)
  - Breadcrumb trail viewer button (if `hasBreadcrumbs`)
- Close button hides modal; session saved to `statsSessions`
- **P1 TODO**: VER-EL-SCR-024-26-01 â€” Speed delta shows "+5%" or "-3%" with colour coding (green/red); calculation verified
- **P2 TODO**: VER-EL-SCR-024-26-02 â€” Session data persists across browser tab close; recovered on reload

### EL-SCR-024-27: Project Rail & Switcher (Desktop/Tablet)
- Location: left side on >=600px viewports (SCR-024 extended)
- Component: `TrackerProjectRail`
- Display:
  - Collapse/expand button
  - List of recent projects (up to 8, sorted by updated date)
  - Per-project: thumbnail, name, progress bar, % done
  - "More projectsâ€¦" button
- Active project: highlighted with border/background; "ACTIVE" badge
- Click to switch: calls `onPickProject(id)` or `setActiveProject(id)` + reload
- Right panel (when rail open):
  - "Today" stats card (stitches, session time, active stitches)
  - "Threads needed" palette with real-time consumption metrics
- **P1 TABLET TODO**: VER-EL-SCR-024-27-01 â€” Rail collapses on portrait phone; re-expands on rotate to landscape
- **P1 TABLET TODO**: VER-EL-SCR-024-27-02 â€” Project thumbnails render fast; no lag when scrolling 20+ projects
- **P2 TODO**: VER-EL-SCR-024-27-03 â€” Right panel scrollable independently of rail; doesn't affect canvas scroll

### EL-SCR-024-28: Real-Time Stash Deduction (Proposal D)
- Trigger: toggle in right panel "Live" switch (or via `wastePrefs.enabled`)
- Display: per-thread consumption meter (2â€“5 skeins used, with bar fill)
- Snapshot: global stash captured at project load or when Live first enabled (baseline)
- Calculation: threadCostPerStitch(fabric, strands, waste, tail) Ã— stitches marked in session
- **P0 TODO**: VER-EL-SCR-024-28-01 â€” Real-time consumption snapshot persists across toggle-off/on within same project; doesn't reset
- **P1 TODO**: VER-EL-SCR-024-28-02 â€” Consumption data flushed to StashBridge on beforeunload; no data loss on close
- **P2 TODO**: VER-EL-SCR-024-28-03 â€” Restore modal shows consumed count + restored count on undo/session rewind

### EL-SCR-024-29: Waste Settings Flyout (Real-Time Stash)
- Trigger: gear icon next to Live toggle in right panel (threads section header)
- Component: inline flyout (not modal)
- Settings (all numeric inputs, persisted to UserPrefs `rtWastePrefs`):
  - Tail allowance (inches, 0.5â€“4, step 0.5; default 1.5)
  - Run length (stitches, 10â€“100, step 5; default 30)
  - General waste (%, 0â€“30, step 1; default 10)
  - Strands (1â€“6, default 2)
- Hint text: "X.XXX in/stitch (estimated)" based on current settings
- Close: click outside or Escape
- **P1 TODO**: VER-EL-SCR-024-29-01 â€” Settings applied immediately; consumption recalc without delay
- **P1 TODO**: VER-EL-SCR-024-29-02 â€” Flyout doesn't extend off-screen on phone; repositions left/right

### EL-SCR-024-30: Low-Thread Toast (Real-Time Stash)
- Trigger: when `skeinsRemaining < 0.25` for any thread
- Toast: "Running low on DMC 310 â€” only 0.15 skeins left"
- Display: once per session per thread (deduplicated via `rtLowToastedRef`)
- **P1 TODO**: VER-EL-SCR-024-30-01 â€” Toast doesn't fire on every stitch mark; debounced to 30s minimum
- **P1 TABLET TODO**: VER-EL-SCR-024-30-02 â€” Toast doesn't overlap canvas on iPad; moves above fold on small screens

---

## Screen: SCR-025 â€” Tracker Colours Drawer (bottom)

A collapsible bottom sheet showing the pattern's thread palette, per-thread counts (done/total), skein consumption (if RT enabled), and quick access controls.

### EL-SCR-025-01: Drawer Header
- Title: "Colours" or "Threads needed"
- Collapse button (chevron up/down)
- Sort controls (optional: ID / count / name)
- Filter controls (if many threads: search or category)
- **P1 TABLET TODO**: VER-EL-SCR-025-01-01 â€” Header visible on all zoom levels; text legible at 12px min

### EL-SCR-025-02: Per-Thread Row
- Display per thread (DMC or blend):
  - Swatch (colour square, 20Ã—20px)
  - ID (e.g. "310" or "310+550" blend)
  - Name (e.g. "Black")
  - Count badge (e.g. "45 / 120" done/total or "Half 12/8 / 16")
  - Skein meter (if RT enabled): bar showing used/owned skeins
  - Stash indicator pip: green checkmark (in stash), red Ã— (need to buy), or owned count (e.g. "3Ã—")
- Interactive: click row or swatch to focus that colour in highlight mode (canvas updates immediately)
- **P1 TODO**: VER-EL-SCR-025-02-01 â€” Stash pip click toggles thread ownership (+/âˆ’) via `onToggleOwned` callback
- **P1 TABLET TODO**: VER-EL-SCR-025-02-02 â€” Row height >=44px on touch; no mis-taps when scrolling drawer

### EL-SCR-025-03: Skein Meter (Real-Time)
- Shows: horizontal bar within each thread row
- Fill: % of current skein consumed (repeating 0â†’100 per skein)
- Colour: green (normal), yellow (low <0.25), red (overage <0)
- Tooltip: "0.45 / 3.2 skeins" or "2.15 skeins used"
- **P0 TODO**: VER-EL-SCR-025-03-01 â€” Meter updates live without page refresh; on every stitch mark within 200ms
- **P1 TABLET TODO**: VER-EL-SCR-025-03-02 â€” Meter bar width scales with screen size; minimum 80px on phone

### EL-SCR-025-04: Go To Next Stitch Button (Optional)
- Trigger: optional button per thread row (e.g. right-align chevron icon)
- Action: focus canvas on next unfinished stitch of that thread; zoom if necessary
- **P2 TODO**: VER-EL-SCR-025-04-01 â€” Next stitch search doesn't scan entire pattern on click; cached index of next-unfinished per thread
- **P1 TABLET TODO**: VER-EL-SCR-025-04-02 â€” Button visible on all screen sizes; doesn't overflow row on narrow phone

### EL-SCR-025-05: Grouping & Sorting
- Default: sort by ID (DMC/Anchor numeric)
- Options: by count done (fewest first), by skeins needed, by name
- Grouping (RT mode): "Need more" (skeinsRemaining < 0) / "In stash" (owned >=0)
- Grouping (normal mode): "To buy" (missing) / "In stash" (owned)
- Persist: UserPrefs `trackerLegendSort`
- **P1 TODO**: VER-EL-SCR-025-05-01 â€” Re-sort triggers canvas re-render; highlight focus colour persists
- **P1 TABLET TODO**: VER-EL-SCR-025-05-02 â€” Sort options in dropdown don't extend past viewport edge

---

## Screen: SCR-026 â€” Tracker Preview Modal (realistic render)

Full-screen modal showing a photorealistic render of the pattern as stitched so far, with detail/coverage levels.

### EL-SCR-026-01: Preview Canvas
- Rendering: offscreen canvas (up to 8192Ã—8192) â†’ scaled display canvas (max 90vw Ã— 90vh)
- Cell size: auto-scaled to fit viewport; min 4px, max 32px (varies by detail level)
- Quality presets (buttonset above canvas):
  1. **Flat** â€” solid thread colour, no shading
  2. **Shaded** â€” basic shadow on cross legs
  3. **Detailed** â€” multi-strand per-stitch rendering
  4. **Detailed+blend** â€” fabric weave + blend strand variation
- Fabric: beige background (#F5F0E6) with optional weave pattern
- Performance: skip rendering cells marked as `__skip__` or `__empty__`
- **P0 TODO**: VER-EL-SCR-026-01-01 â€” Byte output of realistic canvas matches Phase 0 bit-for-bit (PK-compat); no format drift
- **P1 TABLET TODO**: VER-EL-SCR-026-01-02 â€” Realistic render on iPad Air 2 (100Ã—100 pattern, level 4) completes in <2s; no OOM
- **P1 TODO**: VER-EL-SCR-026-01-03 â€” Switching detail levels updates canvas incrementally; doesn't block UI (rAF throttle)

### EL-SCR-026-02: Close Button
- Location: top-right corner
- Action: closes modal; returns to canvas
- Hotkey: Escape
- **P1 TODO**: VER-EL-SCR-026-02-01 â€” Escape doesn't close if a nested input/popover is focused; only closes top modal

### EL-SCR-026-03: Dimensions Footer
- Text: "80Ã—80 Â· 14-count Â· 2 strands"
- Updates when switching patterns or changing fabric count
- **P1 TODO**: VER-EL-SCR-026-03-01 â€” Footer text readable at all zoom levels; font-size >=11px

---

## Screen: SCR-027 â€” Tracker PDF Modal (export settings)

Modal for exporting the pattern as a Pattern Keeperâ€“compatible PDF with user-selected rendering and layout options.

### EL-SCR-027-01: PDF Export Settings
- **Chart style**: symbols / colour blocks
- **Cell size**: 1â€“5mm (default 3)
- **Paper size**: A4 / A3 / Letter / Tabloid
- **Orientation**: portrait / landscape
- **Grid interval**: 10â€“50 stitches (default 10)
- **Grid numbers**: toggle (show stitch count on grid lines)
- **Centre marks**: toggle (show crosshairs at centre)
- **Legend location**: separate page / margin / none
- **Legend columns**: 1â€“3 (default 2)
- **Cover page**: toggle (print project info on first page)
- **Progress overlay**: toggle (show completed % tint)
- **Separate backstitch**: toggle (render backstitch on separate page)
- **Theme**: Workshop (opt-in) or classic (bit-stable)
- Persist: localStorage DEFAULT_PDF_SETTINGS
- **P0 TODO**: VER-EL-SCR-027-01-01 â€” PDF byte output unchanged if theme=classic; workshop theme is opt-in only
- **P1 TODO**: VER-EL-SCR-027-01-02 â€” Cell size 3mm fits 15Ã—15 on A4 portrait without overflow

### EL-SCR-027-02: Export Button
- Action: trigger PDF generation via worker thread (pdf-export-worker.js)
- Output: download file named "{projectName}_{date}.pdf"
- Disable while generating (show spinner)
- **P1 TODO**: VER-EL-SCR-027-02-01 â€” Large pattern (500Ã—500) PDF generation doesn't freeze UI; worker thread handles it
- **P1 TABLET TODO**: VER-EL-SCR-027-02-02 â€” Downloaded PDF opens in Files app on iPad; filename includes date

### EL-SCR-027-03: Preview Thumbnail (Optional)
- Small preview of first page (optional, can be out-of-scope for Phase 1B)
- Updates when settings change
- **P2 TODO**: VER-EL-SCR-027-03-01 â€” If present, thumbnail updates within 500ms of settings change

---

## Screen: SCR-028 â€” Tracker Stats Dashboard

Modal showing session history, progress analytics, time tracking, and project completion estimate.

### EL-SCR-028-01: Global Stats Tab (Project-Agnostic)
- View: aggregate stats across all projects or per-project selector
- Component: `GlobalStatsDashboard` from components.js
- Displays:
  - Total stitches across projects (or for one project)
  - Time invested (HH:MM)
  - Stitches per hour average
  - Projects in progress (count)
  - Completion estimate (days to finish)
- **P1 TODO**: VER-EL-SCR-028-01-01 â€” Completion estimate recalcs when switching projects
- **P1 TABLET TODO**: VER-EL-SCR-028-01-02 â€” Stats on iPad landscape fit in 800px width; no horizontal scroll

### EL-SCR-028-02: Per-Project Stats Tab
- View: detailed stats for the active project
- Component: `StatsDashboard` from components.js
- Sections:
  - **Time tracking**: total time, sessions breakdown, daily/weekly/monthly breakdowns
  - **Stitches per hour**: trend chart, current session speed
  - **Sessions log**: list of past sessions with start/end times, stitches/hour, notes (editable)
  - **Progress estimate**: days to finish based on current speed
  - **Milestones**: achievements unlocked (e.g. "500 stitches!")
- **P1 TODO**: VER-EL-SCR-028-02-01 â€” Session notes editable inline; save via blur or Enter key
- **P1 TABLET TODO**: VER-EL-SCR-028-02-02 â€” Sessions list scrollable on phone; doesn't expand modal height

### EL-SCR-028-03: Stats Settings Gear
- Location: top-right of dashboard
- Controls:
  - Daily goal (stitches, optional)
  - Weekly goal (stitches, optional)
  - Monthly goal (stitches, optional)
  - Target date (completion date picker)
  - Day end hour (0â€“23, default 0 = midnight)
  - Stitching speed override (if user wants to adjust estimate)
  - Inactivity pause threshold (minutes, default 10)
  - Use active days only (toggle)
- Persist: UserPrefs / project storage
- **P1 TODO**: VER-EL-SCR-028-03-01 â€” Goals update progress bars in real-time; no lag on number input
- **P1 TABLET TODO**: VER-EL-SCR-028-03-02 â€” Date picker on iOS uses native date control; accessible

### EL-SCR-028-04: Activities & Insights Tabs (Sub-Screens)
- **Stats Activity**: session log formatted as breadcrumb trail or timeline
- **Stats Insights**: analytics summary (best day, fastest session, consistency trend)
- Component: reuse of `stats-activity.js` and `stats-insights.js`
- **P1 TODO**: VER-EL-SCR-028-04-01 â€” Insights are read-only; stats computed server-side or on first load
- **P2 TABLET TODO**: VER-EL-SCR-028-04-02 â€” Timeline visualization on small screens doesn't overflow; horizontal scroll or collapse

### EL-SCR-028-05: Export CSV (Optional)
- Button: "Export session data as CSV"
- Output: file with columns [Date, Stitches, Time (min), Speed (st/hr), Notes]
- **P2 TODO**: VER-EL-SCR-028-05-01 â€” CSV escapes quotes and commas correctly; opens in Excel without mangling

### EL-SCR-028-06: Share Progress (Optional)
- Button: "Share progress" (out-of-scope Phase 1B unless specified)
- **P2 TODO**: VER-EL-SCR-028-06-01 â€” If implemented, verify no personal data leaks; sanitized URL

---

## Screen: SCR-042 â€” Welcome Wizard â€” Tracker Flow

First-visit welcome modal with generic intro steps, followed by the stitching-style picker (SCR-042a/b style steps).

### EL-SCR-042-01: Welcome Modal Frame
- Overlay: full-screen scrim with rounded modal box
- Title: "Welcome to the Stitch Tracker"
- Progress: step counter (e.g. "Step 1 of 3")
- Navigation: Previous/Next buttons + Skip (optional, removed in Phase 4)
- Flag: localStorage `cs_welcome_tracker_done`
- **P1 TODO**: VER-EL-SCR-042-01-01 â€” Modal persists on reload during wizard; session state survives
- **P1 TABLET TODO**: VER-EL-SCR-042-01-02 â€” Modal on iPad landscape fits in 600px width; portrait matches safe area

### EL-SCR-042-02: Generic Step 1 â€” Introduction
- Body text: "Track your progress on saved patterns interactively. Click stitches as you complete them; the timer logs your sessions automatically."
- No target or placement; centred
- **P1 TODO**: VER-EL-SCR-042-02-01 â€” Text uses Workshop design tokens; colour contrast >=4.5:1

### EL-SCR-042-03: Generic Step 2 â€” Track vs Navigate Modes
- Body text: "Toggle between Track (tap to mark stitches done) and Navigate (move a guide crosshair, place parking markers)."
- Tip: "Press Space to switch modes quickly."
- **P1 TODO**: VER-EL-SCR-042-03-01 â€” Tip text doesn't overflow on phone; word-wrap applied

---

## Screen: SCR-042a â€” Welcome Wizard â€” Tracker Step 1 (Style Picker Screen 1)

First screen of the stitching-style picker modal (reuses `StitchingStyleStepBody`).

### EL-SCR-042a-01: Style Choice Buttons
- Options:
  - "One section at a time" â†’ block style
  - "One colour at a time" â†’ cross-country style
  - "I don't have a fixed method" â†’ freestyle style
- Styling: modal-choice-btn (large touch targets)
- **P1 TABLET TODO**: VER-EL-SCR-042a-01-01 â€” Buttons have 44px min-height; no mis-taps

### EL-SCR-042a-02: Back Navigation
- Button: "Back" (left-align, light style)
- Action: returns to generic intro step (SCR-042-02)
- **P1 TODO**: VER-EL-SCR-042a-02-01 â€” Back button visible at all times; keyboard Tab order correct

---

## Screen: SCR-042b â€” Welcome Wizard â€” Tracker Step 2 (Style Picker Continuation)

Continuation of the stitching-style picker (block shape, start corner, or freestyle confirmation).

### EL-SCR-042b-01: Block Shape Picker (If Block Selected)
- Options (buttons):
  - "10Ã—10 blocks"
  - "Tall towers (10 wide Ã— 20 tall)"
  - "Larger blocks (20Ã—20)"
  - "Other sizeâ€¦" (expands custom input)
- Custom input (if "Other sizeâ€¦"):
  - Two number inputs (W, H)
  - Validation: min 5, max 100
  - Warning text: "Custom sizes may not align with the 10-stitch grid lines."
- **P1 TABLET TODO**: VER-EL-SCR-042b-01-01 â€” Custom input spinners (â†‘â†“) large enough for touch; 44px target

### EL-SCR-042b-02: Start Corner Picker
- Displayed on final step of wizard
- Radio buttons or large buttons (TL / TR / C / BL / BR):
  - TL = Top-left
  - TR = Top-right
  - C = Centre
  - BL = Bottom-left
  - BR = Bottom-right
- Commit: clicking any corner commits the full style config and closes wizard
- **P1 TODO**: VER-EL-SCR-042b-02-01 â€” Corner labels clear and unambiguous; SVG corner diagram (optional) aids clarity
- **P1 TABLET TODO**: VER-EL-SCR-042b-02-02 â€” Button corners (TL, TR, BR, BL) positioned at modal corners for visual clarity; no labels overlap

### EL-SCR-042b-03: Persist & Commit
- Action: commit config to localStorage + UserPrefs
- Keys: `cs_stitchStyle`, `cs_blockW`, `cs_blockH`, `cs_startCorner`, `cs_styleOnboardingDone`
- Effect: wizard closes; canvas renders with new style active
- **P0 TODO**: VER-EL-SCR-042b-03-01 â€” Config persists across sessions; reload without re-prompting

---

## DISCOVERED.md Appendix

### Discovered Components & Sub-Screens (Not in Interface Map)

1. **rt_disable_confirm Modal** â€” triggered when user tries to disable Live real-time tracking
   - Asks for confirmation; warns of consequence
   - Calls modal `setModal('rt_disable_confirm')`
   - Scheduled: Phase 1B spec amendment or Phase 2 cross-cutting

2. **rt_complete_summary Modal** â€” shown after a session ends with Live tracking active
   - Displays consumption snapshot + restoration option
   - Calls modal `setModal('rt_complete_summary')`
   - Scheduled: Phase 1B spec amendment or Phase 2 cross-cutting

3. **TrackerProjectRail (Phase 4 Extended)** â€” left sidebar on >=600px with project switcher
   - Not listed as SCR-025a/b; spans desktop/tablet only
   - Re-exporting as EL-SCR-024-27 above
   - Should be flagged in Phase 2 navigation for explicit URL/state binding

4. **PartialStitchThumb (SCR-050)** â€” reused component in Tracker for half-stitch popover
   - Renders SVG thumbnail of quarter/petite/French knot stitches
   - Not currently surfaced in tracker.html; marked in-scope but discovery-phase-only

5. **Coaching Overlay** â€” "firstStitch_tracker" step (SCR-048 Coachmark)
   - Triggers on first stitch mark in a session
   - Highlights canvas cell + shows tooltip
   - Sourced: coaching.js line 40

### Discovered Modals (Not in Interface Map Primary List)

- `SessionConfigModal` â€” start-session time/goal picker
- `SessionSummaryModal` â€” end-session recap (duration, stitches, speed)
- `StitchingStyleOnboarding` â€” style picker modal (reused from Welcome flow)
- `TrackerProjectPicker` â€” modal version of project switcher (fallback on phone)
- `TrackerPreviewModal` â€” realistic canvas (SCR-026, inline implementation)

### Discovered Real-Time Features (Proposal D Implementation)

- **rtConsumption** object: per-thread consumption {id â†’ {stitchesConsumed, skeinsConsumed, ownedSkeins, skeinsRemaining}}
- **rtStashSnapshotRef**: baseline stash snapshot taken at project load or when RT enabled
- **wastePrefs**: global default persisted via UserPrefs `rtWastePrefs`; per-project override stored in localStorage
- **rtLowToastedRef**: deduplication set to prevent toast spam
- **Disable workflow**: cs:rtDisableRequest event â†’ modal â†’ user confirms â†’ clears consumption snapshot

### Discovered Gesture System (useDragMark.js Integration)

- **Handler signatures** (via useDragMark hook):
  - `onToggleCell(idx)` â€” single-cell tap
  - `onCommitDrag(Set<idx>, intent)` â€” drag-mark commit
  - `onCommitRange(Set<idx>, intent)` â€” long-press range-select commit
- **dragState exposure** for overlay painting:
  - `mode: 'idle' | 'pending' | 'drag' | 'range'`
  - `path: Set<number>` â€” cells under cursor
  - `anchor: number | null` â€” long-press anchor
  - `intent: 'mark' | 'unmark' | null`

### Discovered Preferences & LocalStorage Keys

Core UserPrefs (synced to UserPrefs object):
- `trackerDefaultView` â€” 'symbol', 'colour', 'highlight' (default 'symbol')
- `trackerDefaultHighlightMode` â€” 'isolate', 'outline', 'tint', 'spotlight' (default 'isolate')
- `trackerTintColour` â€” hex string (default '#FFD700')
- `trackerTintOpacity` â€” 0â€“1 (default 0.4)
- `trackerSpotDimOpacity` â€” 0â€“1 (default 0.15)
- `trackerHighlightSkipDone` â€” boolean (default true)
- `trackerOnlyStarted` â€” boolean (filter for row-mode)
- `trackerDimLevel` â€” 0â€“1 (default 0.1)
- `trackerFabricColour` â€” hex string (default '#FFFFFF')
- `trackerCanvasTexture` â€” boolean (default false)
- `trackerStitchingStyle` â€” 'block', 'cross-country', 'freestyle'
- `trackerBlockShape` â€” 'WxH' string (e.g. '10x10')
- `trackerStartCorner` â€” 'TL', 'TR', 'C', 'BL', 'BR'
- `trackerIdleMinutes` â€” number, 0 to disable (default 10)
- `trackerWakeLock` â€” boolean (default false)
- `trackerLeftSidebarMode` â€” 'hidden', 'rail', 'open'
- `trackerLeftSidebarTab` â€” 'highlight', 'layers', 'counting', 'sessions', 'colours'
- `trackerLegendSort` â€” 'id', 'count', 'name' (default 'id')
- `trackerLegendCollapsed` â€” boolean (default false)
- `rtWastePrefs` â€” object {enabled, tailAllowanceIn, threadRunLength, generalWasteMultiplier, strandCountOverride}

localStorage-only (not synced):
- `tracker_dock_y` â€” Y position (percentage, default 40)
- `cs_stitchStyle`, `cs_blockW`, `cs_blockH`, `cs_startCorner` â€” style config
- `cs_focusEnabled`, `cs_colourSeq` â€” stitching state
- `cs_styleOnboardingDone`, `cs_welcome_tracker_done` â€” onboarding flags
- `cs_trDimLv`, `cs_hlMode`, `cs_tintColor`, `cs_tintOp`, `cs_spotDimOp` â€” legacy display settings
- `cs_countAids`, `cs_countRunMin`, `cs_countRunDir`, `cs_countNinja` â€” counting aid config
- `cs_bcVisible` â€” breadcrumb visibility
- `cs_parkLayers_<projectId>` â€” per-project park marker visibility
- `cs_legendSort_<projectId>`, `cs_legendCollapsed_<projectId>` â€” per-project legend config
- `cs_hlIntroSeen` â€” first-entry highlight-mode intro banner
- `shortcuts_hint_dismissed` â€” command-palette hint dismissal

---

## VERIFICATION TODO

### P0 (Blocker) Verification

- [ ] **VER-EL-SCR-024-02-01** â€” Tap on empty/skip cells is no-op; no count increment
- [ ] **VER-EL-SCR-024-03-01** â€” Drag across 50 cells commits as one undo step; no intermediate marks
- [ ] **VER-EL-SCR-024-17-01** â€” Realistic canvas byte output unchanged from Phase 0; PK-compat verified
- [ ] **VER-EL-SCR-024-28-01** â€” Real-time consumption snapshot persists across toggle-off/on within same project
- [ ] **VER-EL-SCR-025-03-01** â€” Skein meter updates live without page refresh; on every stitch mark within 200ms
- [ ] **VER-EL-SCR-026-01-01** â€” Realistic canvas byte output matches Phase 0 bit-for-bit (PK-compat)
- [ ] **VER-EL-SCR-027-01-01** â€” PDF byte output unchanged if theme=classic; workshop theme is opt-in only
- [ ] **VER-EL-SCR-042b-03-01** â€” Config persists across sessions; reload without re-prompting

### P1 (High Priority) Verification

#### Canvas Gestures & Interaction
- [ ] **VER-EL-SCR-024-01-02** â€” Scroll momentum/inertia doesn't cause unintended taps
- [ ] **VER-EL-SCR-024-02-02** â€” Fast double-tap doesn't toggle twice
- [ ] **VER-EL-SCR-024-05-01** â€” Spacebar toggle doesn't fire when input is focused
- [ ] **VER-EL-SCR-024-06-01** â€” Switching view modes at zoom 3Ã— doesn't flicker; scroll position preserved
- [ ] **VER-EL-SCR-024-07-01** â€” Opacity slider updates canvas in real-time; no 500ms+ lag
- [ ] **VER-EL-SCR-024-08-01** â€” Fabric colour persists across sessions
- [ ] **VER-EL-SCR-024-09-01** â€” Solo timer resets within 3s on layer button click
- [ ] **VER-EL-SCR-024-10-01** â€” Counting lines opacity <15%; doesn't interfere with stitch visibility at 100% zoom
- [ ] **VER-EL-SCR-024-11-01** â€” Park marker persists across zoom/scroll; anchor to cell, not screen
- [ ] **VER-EL-SCR-024-12-01** â€” Half-stitch popover repositions if near canvas edges; doesn't overflow
- [ ] **VER-EL-SCR-024-12-03** â€” Half-stitch progress counts as 0.5 stitch in stats (verified in combined progress calc)
- [ ] **VER-EL-SCR-024-14-01** â€” Block grid renders correctly for non-square patterns (60Ã—100)
- [ ] **VER-EL-SCR-024-18-01** â€” Edit mode doesn't interfere with stats tracking; changes don't count until applied
- [ ] **VER-EL-SCR-024-21-01** â€” Rail mode on iPad in 600px split-screen doesn't cover canvas; width <80px
- [ ] **VER-EL-SCR-024-24-01** â€” Inactivity timer doesn't fire when user is scrolling/panning canvas
- [ ] **VER-EL-SCR-024-24-03** â€” Pause state reflected in mini-bar and full timer; UI consistent
- [ ] **VER-EL-SCR-024-25-01** â€” Goal input validation: only positive integers, range 1â€“10000
- [ ] **VER-EL-SCR-024-26-01** â€” Speed delta calculation verified; colour-coded green/red
- [ ] **VER-EL-SCR-024-27-03** â€” Right panel scrollable independently; doesn't affect canvas scroll
- [ ] **VER-EL-SCR-024-28-02** â€” Consumption data flushed to StashBridge on beforeunload
- [ ] **VER-EL-SCR-024-29-01** â€” Waste settings applied immediately; consumption recalc without delay
- [ ] **VER-EL-SCR-024-30-01** â€” Toast doesn't fire on every stitch mark; debounced to 30s minimum
- [ ] **VER-EL-SCR-025-02-01** â€” Stash pip click toggles thread ownership (+/âˆ’) via callback
- [ ] **VER-EL-SCR-025-04-02** â€” Next stitch button visible on all screen sizes; no overflow on narrow phone
- [ ] **VER-EL-SCR-025-05-01** â€” Re-sort triggers canvas re-render; highlight focus colour persists
- [ ] **VER-EL-SCR-026-02-01** â€” Escape doesn't close if nested input/popover is focused
- [ ] **VER-EL-SCR-026-03-01** â€” Footer text readable at all zoom levels; font-size >=11px
- [ ] **VER-EL-SCR-027-02-01** â€” Large pattern (500Ã—500) PDF generation doesn't freeze UI
- [ ] **VER-EL-SCR-028-02-01** â€” Session notes editable inline; save via blur or Enter key
- [ ] **VER-EL-SCR-028-03-01** â€” Goals update progress bars in real-time; no lag
- [ ] **VER-EL-SCR-042-01-01** â€” Modal persists on reload during wizard; session state survives
- [ ] **VER-EL-SCR-042a-01-01** â€” Style choice buttons have 44px min-height; no mis-taps
- [ ] **VER-EL-SCR-042b-01-01** â€” Custom input spinners large enough for touch; 44px target
- [ ] **VER-EL-SCR-042b-02-01** â€” Corner labels clear; SVG diagram aids clarity (optional)
- [ ] **VER-EL-SCR-042b-03-01** â€” Config persists; reload without re-prompting

### P1 TABLET Verification (Critical for iPad Use)

#### Touch & Gesture Tablet Tests
- [ ] **VER-EL-SCR-024-01-01** â€” Pinch-zoom on iPad works; two-finger drag pan doesn't toggle mark mode
- [ ] **VER-EL-SCR-024-02-03** â€” Tap with gloved hand (haptic?) doesn't mis-fire; 200ms guard window respected
- [ ] **VER-EL-SCR-024-03-02** â€” Drag on iPad doesn't mis-detect as pan near scroll edge; 10px threshold respected
- [ ] **VER-EL-SCR-024-03-03** â€” Two-finger drag aborts drag-mark and pans instead; pinch-zoom unaffected
- [ ] **VER-EL-SCR-024-05-02** â€” iPad on-screen keyboard doesn't consume spacebar; toggle works with external keyboard
- [ ] **VER-EL-SCR-024-06-02** â€” View mode dropdown/sidebar accessible in portrait and landscape; legible at <600px width
- [ ] **VER-EL-SCR-024-07-02** â€” Colour picker on small screens (iPhone SE) fits in modal; not cut off
- [ ] **VER-EL-SCR-024-09-02** â€” Layer buttons >=44px min-height; no accidental toggles
- [ ] **VER-EL-SCR-024-10-02** â€” Ninja mode flash rate capped at 10 Hz; prefers-reduced-motion respected
- [ ] **VER-EL-SCR-024-11-02** â€” Long-press doesn't trigger system context menu; preventDefault propagated
- [ ] **VER-EL-SCR-024-12-02** â€” Half-stitch popover doesn't auto-close on blur; explicit close or tap-outside
- [ ] **VER-EL-SCR-024-14-02** â€” Current block highlight visible on iPad landscape/portrait; border width scales with zoom
- [ ] **VER-EL-SCR-024-15-02** â€” On iPad landscape, modal content doesn't exceed 600px; portrait fits in safe area
- [ ] **VER-EL-SCR-024-19-01** â€” Immersive mode on iPad split-screen (50vw) works; chrome reappears correctly
- [ ] **VER-EL-SCR-024-20-01** â€” Wake-lock on iPad during stitching keeps display on >8 hours (battery test)
- [ ] **VER-EL-SCR-024-21-02** â€” Tab content (Highlight, Layers) scrollable if >80vh; internal scroll, sidebar fixed
- [ ] **VER-EL-SCR-024-22-01** â€” Dock position persists on iPad rotate landscapeâ†”portrait; Y offset scaled proportionally
- [ ] **VER-EL-SCR-024-22-02** â€” Dock doesn't occlude keyboard on iPhone when input focused
- [ ] **VER-EL-SCR-024-25-02** â€” Number keyboard on iOS shows return key (enterKeyHint="done")
- [ ] **VER-EL-SCR-024-27-01** â€” Rail collapses on portrait phone; re-expands on rotate to landscape
- [ ] **VER-EL-SCR-024-27-02** â€” Project thumbnails render fast; no lag when scrolling 20+ projects
- [ ] **VER-EL-SCR-025-01-01** â€” Header visible on all zoom levels; text legible at 12px min
- [ ] **VER-EL-SCR-025-02-02** â€” Row height >=44px on touch; no mis-taps when scrolling drawer
- [ ] **VER-EL-SCR-025-03-02** â€” Meter bar width >=80px on phone
- [ ] **VER-EL-SCR-026-01-02** â€” Realistic render on iPad Air 2 (100Ã—100, level 4) completes in <2s; no OOM
- [ ] **VER-EL-SCR-027-02-02** â€” Downloaded PDF opens in Files app on iPad; filename includes date
- [ ] **VER-EL-SCR-028-01-02** â€” Stats on iPad landscape fit in 800px; no horizontal scroll
- [ ] **VER-EL-SCR-028-02-02** â€” Sessions list scrollable on phone; doesn't expand modal height
- [ ] **VER-EL-SCR-028-03-02** â€” Date picker on iOS uses native control; accessible
- [ ] **VER-EL-SCR-042-01-02** â€” Modal on iPad landscape fits 600px width; portrait matches safe area

### P2 (Low Priority / Enhancement) Verification

- [ ] **VER-EL-SCR-024-04-01** â€” Long-press at edge of viewport doesn't auto-scroll; range-select viewport-local
- [ ] **VER-EL-SCR-024-05-03** â€” Rapid Spacebar mash (>5 toggles/sec) doesn't crash; debounce or queue
- [ ] **VER-EL-SCR-024-10-02** â€” Ninja mode flash on iPad doesn't stutter; capped FPS or simplified path
- [ ] **VER-EL-SCR-024-16-02** â€” Long sessions (>10k stitches) don't tank performance; breadcrumbs culled for old sessions
- [ ] **VER-EL-SCR-024-23-01** â€” Focus mode on 4K monitor centers mini-bar; not lost off-screen
- [ ] **VER-EL-SCR-024-26-02** â€” Session data persists across browser tab close; recovered on reload
- [ ] **VER-EL-SCR-025-05-02** â€” Sort options in dropdown don't extend past viewport edge
- [ ] **VER-EL-SCR-027-03-01** â€” If present, thumbnail updates within 500ms of settings change
- [ ] **VER-EL-SCR-028-04-02** â€” Timeline visualization on small screens doesn't overflow; horizontal scroll or collapse
- [ ] **VER-EL-SCR-028-05-01** â€” CSV escapes quotes/commas correctly; opens in Excel without mangling
- [ ] **VER-EL-SCR-042b-02-02** â€” Button corners (TL, TR, BR, BL) positioned at modal corners for visual clarity

