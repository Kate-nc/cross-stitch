# Track Mode UI Audit
*Phase 1 of the track-mode redesign. Generated from source exploration of `tracker-app.js`, `useDragMark.js`, `styles.css`, and `stitch.html`.*

---

## 1. Complete Interactive Element Inventory

Controls are listed in approximate visual / z-order from top to bottom on a desktop viewport. Mobile-only elements are noted explicitly.

### 1.1 Shared Header (`Header` component, `page="tracker"`)

| # | Label / Icon | What it does | Frequency while stitching |
|---|---|---|---|
| H1 | File open button | Opens file picker (load .json/.oxs/.png/.jpg/.pdf) | occasional |
| H2 | Save (Ctrl+S) | Saves current project to IndexedDB | session boundary |
| H3 | Export PDF | Opens PDF export settings modal | occasional |
| H4 | New Project | Prompts confirmation, clears project | occasional |
| H5 | Open Project | Opens project picker modal | occasional |
| H6 | Preferences (gear) | Opens preferences modal | occasional |
| H7 | Project name (editable inline) | Renames project | occasional |
| H8 | Progress % chip | Read-only display in header | — (read-only) |
| H9 | Command palette | Opens command search | occasional |
| H10 | Help (?) | Opens help / shortcuts modal | occasional |

### 1.2 Toolbar Row (`.pill-row`, `.toolbar-row`)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| T1 | Hamburger / sidebar toggle | Cycles left sidebar: hidden → rail → open | active use (≤3/session) |
| T2 | "Sleep" / "Awake" chip | Toggles screen wake-lock | session boundary |
| T3 | "Focus" chip (F key) | Hides most chrome; focus on canvas only | active use |
| T4 | **Mark** / "Modify" button (T) | Sets `stitchMode = "track"` — main marking mode | active use |
| T5 | **Nav** button (N) | Sets `stitchMode = "navigate"` — crosshair / parking | active use |
| T6 | Row mode toggle (R) | Toggle row-by-row tracking | active use |
| T7 | "Prev row" button | Navigate to previous row in row mode | active use (row mode only) |
| T8 | "Row N/total" label | Displays current row position | — (read-only) |
| T9 | "Next row" button | Navigate to next row in row mode | active use (row mode only) |
| T10 | Zoom − | Decreases zoom level | active use |
| T11 | Zoom slider | Continuous zoom input | active use |
| T12 | Zoom + | Increases zoom level | active use |
| T13 | Zoom % label | Displays current zoom | — (read-only) |
| T14 | **Fit** button (0) | Fits entire pattern in canvas | active use |
| T15 | `···` Overflow menu button | Opens overflow menu with ~30 additional controls | occasional |
| T16 | **Session chip** (shows timer if active) | Opens Session sidebar tab | active use |

### 1.3 Overflow Menu (`tb-overflow-menu`, via `···`)

> **Density problem**: 30+ items in a single dropdown menu.

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| O1 | Edit project details… | Opens name/designer/description modal | occasional |
| O2 | Mark (collapsed stitch group) | Replicated mark button | active use |
| O3 | Navigate (collapsed) | Replicated nav button | active use |
| O4 | Row mode (collapsed) | Replicated row mode toggle | active use |
| O5 | Symbol / Col+Symbol / Highlight (collapsed view group) | View mode buttons | active use |
| O6 | Parking colour dropdown | Selects which colour to park | active use (navigate mode) |
| O7 | Clear park markers | Removes all park markers | occasional |
| O8 | Show/Hide all parked colours | Visibility toggle for all park layers | occasional |
| O9 | Undo (N steps) | Undo last stitch/drag marks | active use |
| O10 | Redo | Redo a undone mark | occasional |
| O11 | Reset progress (danger) | Clears all `done` data | occasional |
| O12 | Copy Progress Summary | Copies text to clipboard | occasional |
| O13 | Undo Edit (edit mode) | Undoes edits to pattern colours | occasional |
| O14 | Revert to Original (edit mode) | Reverts pattern to pre-edit state | occasional |
| O15 | Exit correction mode (edit mode) | Leaves edit mode | session boundary |
| O16 | Correct pattern colours… | Enters edit mode | occasional |
| O17 | Show/Hide controls help | Toggles inline navigation help card | occasional |
| O18 | Realistic preview | Opens/closes realistic preview modal | occasional |
| O19 | Thread usage toggle | Shows cluster/isolation canvas overlay | occasional |
| O20 | Counting aids toggle | Shows run-length counting overlays | active use |
| O21 | Layers | Opens View sidebar tab | occasional |
| O22 | Stats | Toggles full stats view | session boundary |
| O23 | Spotlight toggle | Enables spotlight focus area | active use |
| O24 | Set/Clear focus block | Sets or clears the spotlight block | active use (spotlight mode) |
| O25 | Breadcrumbs toggle | Shows/hides breadcrumb trail | occasional |
| O26 | Stitching style: … | Opens 3-screen stitching style picker | occasional |
| O27 | Block size quick-pickers (10×10, 20×20) | Changes block size | occasional |
| O28 | Block size custom W/H inputs (×2) | Custom block dimensions | occasional |
| O29 | "Block size may not align" warning | Conditional text warning | — (read-only) |
| O30 | Time Tracked section (timer display) | Glanceable stats | — (read-only) |

### 1.4 Info Strip (below toolbar)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| I1 | Progress bar | Visual % complete, today segment (tap to open session sidebar) | active use (read-only, tap = session) |
| I2 | Progress % label | e.g. "47.2%" (inside bar) | — (read-only) |
| I3 | Live timer icon + time | Shows elapsed time if session active | — (read-only) |
| I4 | "Progress info" chip | Opens popover: done/total, today, week, time, pace, remaining | occasional |

### 1.5 Inline Banners / Toasts (below info strip)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| B1 | Edit mode strip (⚠ Edit mode) | Warning banner + "Exit edit mode" button | session boundary (edit mode only) |
| B2 | Highlight mode intro banner | One-time hint with keyboard shortcuts (8s auto-dismiss) | rare |
| B3 | Session onboarding toast | "Sessions tracked automatically" first-time info | rare |
| B4 | Focus block pill (e.g. "Block · 3,2") | Shows current block; tap to reopen style picker | active use (read-only, tap = style) |
| B5 | Session saved toast (+ "Add note" button) | After auto-session records; input for note | session boundary |
| B6 | Context banner (single slot) | One of: edit instruction / colour-advance toast / block-advance toast / track hint / nav hint / shortcuts hint | active use (info) |

### 1.6 Canvas and Overlays

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| C1 | **Pattern canvas** (main grid) | Tap / drag to mark; pinch to zoom; pan with two fingers / space+drag | **active use — central interaction** |
| C2 | Column number header (sticky) | Orientation aid | — (read-only) |
| C3 | Row number sidebar (sticky) | Orientation aid | — (read-only) |
| C4 | Drag-mark visual overlay | Shows cells being drag-marked in real time | active use (visual feedback) |
| C5 | Thread usage canvas overlay | Cluster / isolation heatmap | occasional |
| C6 | Recommendation border overlay | Highlights suggested next blocks | occasional |
| C7 | Breadcrumb trail overlay | Shows path of completed work | occasional |
| C8 | Focus area spotlight overlay | Dims outside active block | active use (spotlight mode) |
| C9 | Counting aids canvas overlay | Horizontal/vertical run-length indicators | active use |

### 1.7 Left Sidebar (`.lpanel`)

Opened via hamburger (T1); 6 tabs (Highlight, View, Session, Tools, Notes, Legend-mobile-only).

#### 1.7.1 Highlight Tab

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| L1 | Previous colour ([) | Cycles focus colour backward | **active use** |
| L2 | Colour focus display | Shows current focus colour + DMC ID + name | — (read-only) |
| L3 | Next colour (]) | Cycles focus colour forward | **active use** |
| L4 | Clear focus (×) | Removes focus, shows all colours | active use |
| L5 | **Mode: Isolate** | Dims non-focused stitches | active use |
| L6 | **Mode: Outline** | Outlines focused colour | active use |
| L7 | **Mode: Tint** | Tints focused colour | active use |
| L8 | **Mode: Spotlight** | Radial spotlight effect | active use |
| L9 | Visibility slider (isolate mode) | How much to dim non-focused cells | active use |
| L10 | Tint colour picker (tint mode) | Colour of tint overlay | occasional |
| L11 | Tint opacity slider | Intensity of tint | active use |
| L12 | Spotlight dim slider | How dark the outer area is | active use |
| L13 | Counting aids checkbox | Enable/disable counting aids | active use |
| L14 | Counting runs threshold (Off/All/3+/5+/10+) | Minimum run length to highlight | active use |
| L15 | Counting direction (H/V/Both) | Which direction to show runs | active use |
| L16 | Ninja stitches checkbox | Highlight hard-to-spot stitches | active use |
| L17 | "Skip completed colours when cycling" checkbox | Affects [ ] cycle | active use |
| L18 | "Only colours already started" checkbox | Affects [ ] cycle | active use |

#### 1.7.2 View Tab

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| V1 | Symbol / Colour / Highlight segmented control (V) | Canvas rendering mode | active use |
| V2 | Zoom − button | Decreases zoom | active use |
| V3 | Zoom range slider | Continuous zoom | active use |
| V4 | Zoom + button | Increases zoom | active use |
| V5 | Zoom % label | Displays zoom | — (read-only) |
| V6 | Fit button | Fits pattern | active use |
| V7 | "Lock detail tier" checkbox | Prevents auto-simplify at low zoom | occasional |
| V8 | "Zoomed-out fade" select | How aggressively to fade symbols at low zoom | occasional |
| V9 | Fabric colour presets (×5 swatches + custom picker) | Canvas background colour | occasional |
| V10 | Thread sheen checkbox | Adds texture to stitches | occasional |
| V11 | Layer checkboxes (full/half/backstitch/french-knot etc.) | Show/hide stitch types | active use |

#### 1.7.3 Session Tab

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| S1 | Session stats card (time/stitches/speed/total) | Read-only live metrics | active use (read-only) |
| S2 | **Start session / End session** button | Begins or ends a timed stitching session | session boundary |
| S3 | "View/Hide full stats" button | Opens full stats overlay | session boundary |
| S4 | Pause / resume (P) | Pauses session timer | active use |

#### 1.7.4 Tools Tab

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| To1 | Realistic preview open/close | Full-pattern photo-realistic render | occasional |
| To2 | Thread usage: Cluster / Isolation segmented | Overlay mode | occasional |
| To3 | Thread usage summary display | Shows confetti/small/medium/large counts | — (read-only) |
| To4 | Focus area checkbox | Enable spotlight block | active use |
| To5 | Block size quick-pickers (10×10, 20×20) | Changes block | occasional |
| To6 | Block W / H inputs | Custom block dimensions | occasional |
| To7 | Style button | Opens stitching style picker | occasional |
| To8 | Show breadcrumbs checkbox | Breadcrumb overlay toggle | occasional |
| To9 | Suggestions checkbox | Enable next-block suggestions | occasional |
| To10 | Suggestions display | Top block info | — (read-only) |

#### 1.7.5 Notes Tab

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| N1 | Designer text input | Edit designer name | occasional |
| N2 | Description textarea | Edit project notes | occasional |
| N3 | Project info grid (started date, size, stitch counts) | Read-only stats | — (read-only) |
| N4 | Time grid (total logged, estimated remaining) | Read-only stats | — (read-only) |
| N5 | Copy summary button | Copies progress summary text | occasional |
| N6 | Edit in Creator button | Switches to Creator page | occasional |

#### 1.7.6 Legend Tab (mobile only)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| Lg1 | Sort control (DMC ID / % done / Stitch count) | Changes palette sort | active use |
| Lg2–n | Per-colour rows (swatch, symbol, ID, name, progress bar, count, park toggle, Mark/Undo button) | Show/focus/mark per colour | active use |

### 1.8 Right Panel (`.rpanel`, desktop only, ≥900px)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| R1 | Collapse/expand button | Collapses palette legend panel | occasional |
| R2 | Sort control (DMC ID / % done / Stitch count) | Sorts legend | active use |
| R3–n | **Per-colour legend rows** (swatch, symbol, ID, name, progress bar, count, park toggle, Mark/Undo button) | Tap row = focus colour + open Highlight tab; tap swatch = detail popover | **active use** |

### 1.9 TrackerProjectRail (desktop/tablet left rail, ≥600px via CSS)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| PR1 | Project rail collapse button | Collapses the project list strip | occasional |
| PR2–n | Recent project buttons (×up to 8) | Switch to another project | session boundary |
| PR3 | "More projects…" button | Opens project picker modal | occasional |
| PR4 | Today stats card (stitches / session time / active count) | Live metrics | active use (read-only) |
| PR5–n | **Per-thread rows** (swatch, ID, name, skein count, stash status, park toggle button) | Thread inventory | occasional |
| PR6 | **Live RT toggle** (checkbox) | Enable real-time stash deduction | session boundary |
| PR7 | Gear button | Opens waste settings flyout | occasional |
| PR8–n | Waste settings flyout (tail allowance, run length, waste %, strands, estimated in/stitch) | Consumption calculation settings | occasional |

### 1.10 Mobile Floating Elements (phone only, `body.tracker-mobile`)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| M1 | **Colour chip** (sticky top) | Shows focus colour; tap = open quick-colour drawer | **active use** |
| M2 | **Floating tool dock** (right edge, draggable): | — | — |
| M2a | Drag handle | Repositions dock vertically | occasional |
| M2b | Zoom in (+) | Increases zoom | active use |
| M2c | Zoom out (−) | Decreases zoom | active use |
| M2d | **Undo** | Undoes last mark(s) | **active use** |
| M2e | **Redo** | Redoes | occasional |
| M2f | **Find next** (magnify) | Jumps to next stitch of focus colour | **active use** |
| M2g | Highlight toggle | Switch to/from highlight view | active use |
| M2h | Navigate/parking toggle | Switch to navigate mode | occasional |
| M2i | Row mode toggle | Toggle row-by-row mode | occasional |
| M2j | **Pick colour** (palette icon) | Opens quick-colour drawer | **active use** |
| M3 | **Bottom mode pill** (Stitch / Find / Edit) | Primary mode switching | **active use** |
| M4 | **Bottom action bar** (track mode only): | — | — |
| M4a | **Colour indicator** (focus colour or "Pick a colour") | Opens quick-colour drawer | **active use** |
| M4b | **Undo button** | Undoes last mark | **active use** |
| M4c | **Mark button** (✓) | Marks cell under crosshair | **active use** |

### 1.11 Quick Colour Drawer (bottom sheet, mobile)

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| Q1 | Colour tiles grid (sorted by remaining stitches) | Tap = pick colour + close drawer | **active use** |
| Q2 | Backdrop (tap to close) | Dismisses drawer | active use |

### 1.12 Modals and Overlays

| # | Label / Icon | What it does | Frequency |
|---|---|---|---|
| Mo1 | Project picker | Switch project | occasional |
| Mo2 | Preferences modal | App-wide preferences | occasional |
| Mo3 | Name prompt | Name a new project | occasional |
| Mo4 | Edit project details | Name / designer / description | occasional |
| Mo5 | Edit mode exit confirmation | Confirm discard edits | session boundary |
| Mo6 | Session config (time/goal) | Set explicit session target | session boundary |
| Mo7 | Session summary | Stats after session end | session boundary |
| Mo8 | Stitching style picker (3-screen) | Set working style and block shape | occasional |
| Mo9 | Welcome wizard | First-visit onboarding | rare |
| Mo10 | First-stitch coachmark | First-visit marking hint | rare |
| Mo11 | Realistic preview modal | Photo-realistic canvas render | occasional |
| Mo12 | Resume recap modal | Summary of last session shown on load | session boundary |
| Mo13 | RT disable confirm | Confirms turning off live thread tracking | occasional |
| Mo14 | Help modal | Full help centre | occasional |
| Mo15 | Navigation help card (inline) | Controls reference inline | occasional |
| Mo16 | Palette detail popover | Thread detail + similar thread | occasional |
| Mo17 | Half-stitch disambiguation popup | Choose fwd/bck for half stitches | active use (half stitch only) |
| Mo18 | Progress info popover | Full breakdown of progress/time | occasional |
| Mo19 | Stats full view | Sessions timeline, goals, charts | session boundary |
| Mo20 | PDF export modal | Export/print settings | occasional |

### 1.13 Keyboard Shortcuts (active in track mode)

| Key | Action |
|---|---|
| T | Track / mark mode |
| N | Navigate mode |
| R | Row mode toggle |
| V | Cycle view (symbol → colour → highlight) |
| [ / ] | Previous / next focus colour (highlight view) |
| 1–4 | Set highlight style (isolate/outline/tint/spotlight) |
| J | Jump to next remaining stitch of focus colour |
| F | Toggle full-stitch layer / focus mode |
| H | Toggle half-stitch layer |
| K | Toggle French-knot layer |
| L | Toggle backstitch layer |
| Shift+A | Toggle all layers on/off |
| D | Toggle colour drawer |
| P | Pause/resume session timer |
| C | Toggle counting aids |
| Alt+Arrow | Move spotlight block |
| +/= / − | Zoom in/out |
| 0 | Zoom to fit |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+S | Save |
| Space (hold) | Pan canvas |
| ? | Shortcuts panel |
| Esc | Cancel / dismiss / clear focus |

---

## 2. Functional Groupings

### Group A: Core Marking
*The primary stitching loop — tap/drag/range-select cells to toggle done state.*

T4 (Mark mode), C1 (canvas), M3 (mode pill – Stitch), M4a (colour indicator), M4b (undo), M4c (mark button), M2d (dock undo), Q1 (quick colour), L1–L4 (colour cycle in highlight), M1 (colour chip), M2f (find next), R2–Rn (palette legend tap = focus), Lg2–n (legend rows)

**Keyboard**: T, Ctrl+Z, [, ], J, V

### Group B: Navigation and Orientation
*Finding your place on the pattern.*

T5 (Nav mode), T6 (row mode), T7/T9 (prev/next row), T8 (row label), T10–T14 (zoom), C2–C3 (grid numbers), M2b/M2c (dock zoom), Mo15 (nav help card)

**Keyboard**: N, R, +/−, 0, Space+drag, Ctrl+scroll

### Group C: View and Highlight
*Controlling how the pattern is displayed.*

T3 (focus mode), V1–V10 (View tab), L5–L18 (Highlight tab), M2g (highlight toggle), O5 (view in overflow)

**Keyboard**: V, 1–4, F, H, K, L, Shift+A, C

### Group D: Progress Tracking
*Seeing how much has been done.*

I1–I4 (info strip), S1 (session stats), Mo19 (full stats), PR4 (today card), B6 (context banners), H8 (header %)

### Group E: Session Management
*Bounding stitching sessions.*

T16 (session chip), S1–S4 (Session tab), Mo6 (session config), Mo7 (session summary), Mo12 (resume recap), T2 (wake-lock), O22 (stats in overflow), H2 (save)

**Keyboard**: P, Ctrl+S

### Group F: Colour Focus and Filtering
*Which colour to work on next.*

L1–L18 (Highlight tab), M1 (colour chip), M4a (colour indicator), M2j (pick colour dock), Q1 (quick colour drawer), R3–Rn (right panel legend), Lg2–n (mobile legend), O6–O8 (parking)

### Group G: Thread and Stash Management
*Thread inventory, skeins needed, live consumption.*

PR5–PR8 (TrackerProjectRail threads panel), O6–O8 (parking)

### Group H: Tools and Analysis
*Less frequent but powerful extras.*

To1 (realistic preview), To2–To3 (thread usage), To4–To10 (focus area, suggestions), Mo19 (stats)

### Group I: Project Management
*Loading, saving, switching projects.*

H1–H6 (header), Mo1 (project picker), PR2–PR3 (project rail), Mo3–Mo4 (name/details)

### Group J: Settings and Configuration
*Rarely touched during active stitching.*

H6 (preferences), Mo8 (stitching style), Mo2 (preferences), PR6–PR8 (RT / waste settings), V7–V10 (rendering settings)

---

## 3. In-Session vs. Between-Session Classification

**Legend**: `active` = needed every few minutes while stitching · `session-boundary` = at the start or end of a session · `occasional` = rarely during a session

| Control | Classification | Notes |
|---|---|---|
| Canvas tap/drag mark (C1) | **active** | The central action |
| Colour focus cycle [ ] (L1/L3) | **active** | Every colour change |
| Find next stitch J (M2f, jumpNext) | **active** | Navigating to next work area |
| Undo (M2d, M4b, Ctrl+Z) | **active** | Error correction |
| Zoom in/out/fit (T10–T14, M2b/c) | **active** | Adjusting view |
| Pan canvas (C1 drag/pinch) | **active** | Moving around pattern |
| View mode V (V1, M3) | **active** | Symbol ↔ Highlight ↔ Colour |
| Highlight mode 1–4 (L5–L8) | **active** | Switching visual style |
| Counting aids C (L13–L16) | active | Assist counting runs |
| Row mode T6/T7/T9 | active | Row-by-row navigation |
| Focus colour pick Q1/M1/M4a | **active** | Choosing what to stitch |
| Right panel legend rows R3–Rn | **active** | Focusing a colour |
| Progress strip I1–I3 | active (read-only) | Glanceable progress |
| Wake-lock chip T2 | session-boundary | Set once per stitching session |
| Start/End session S2 | session-boundary | |
| Pause/resume P (S4) | active | Bathroom break etc. |
| Session chip T16 | active | Quick glance + open session tab |
| Save H2/Ctrl+S | session-boundary | Auto-save handles most cases |
| Spotlight focus area To4 | active | When using block method |
| Move spotlight Alt+Arrow | active | Stepping through blocks |
| Breadcrumb overlay To8 | active (read-only) | |
| Park marker (Nav mode) | occasional | Between colours |
| Clear park markers O7 | occasional | |
| Stats S3/O22 | session-boundary | Check at end of session |
| Stitching style picker Mo8/O26 | occasional | Set at project start |
| Block size To5–To6/O27–O28 | occasional | Set at project start |
| Realistic preview To1 | occasional | Curiosity / checking colours |
| Thread usage To2 | occasional | Planning thread usage |
| Fabric colour V9 | occasional | Setup preference |
| Layer toggles V11 | occasional | Hiding stitch types |
| Preferences H6 | occasional | |
| Project switch Mo1/PR2 | occasional | |
| Edit mode enter/exit O16/B1 | occasional | Correcting import errors |
| Export PDF H3/O18? | occasional | |
| Suggestions To9 | occasional | |
| Reset progress O11 | occasional | |
| Correct pattern O16 | occasional | |
| Project name/details H7/N1–N2 | occasional | |
| RT live toggle PR6 | occasional | Enable once per project |
| Waste settings PR7–PR8 | occasional | |

---

## 4. Redundancy and Overlap

| Issue | Controls involved | Severity |
|---|---|---|
| Undo appears in 4 places | T15/O9 (overflow), M2d (dock), M4b (action bar), Ctrl+Z | Medium — all serve real contexts but the multi-location is confusing |
| Zoom controls duplicated on desktop | T10–T14 (toolbar pill) + V2–V6 (View sidebar tab) + M2b/c (mobile dock) | Medium — desktop has two zoom controls visible simultaneously |
| Colour focus cycling duplicated | L1/L3 (sidebar Highlight tab) + [ ] keys + M2f (dock "find next") + M4f? | Low — each has a slightly different meaning |
| View mode duplicated | V1 (sidebar View tab) + O5 (overflow) + V key | Low — accessible from multiple surfaces, not visually redundant |
| Mark / Nav mode buttons in both toolbar and overflow | T4/T5 + O2/O3 | Low — overflow is a collapsed fallback |
| "Spotlight" is both a highlight mode (L8) and a focus area (To4/O23) | L5–L8 + To4 | **High** — "spotlight" means two completely different things. Users will be confused. |
| Stats accessible from Session sidebar AND overflow menu AND header? | S3 + O22 | Low |
| Sort control in both right panel and mobile Legend tab | R2 + Lg1 | Low — same content, different surfaces |
| Project details editable in Notes tab AND via overflow "Edit project details…" | N1/N2 + O1 | Low |

---

## 5. Density Problems

> Threshold for concern: more than ~5 simultaneous interactive controls in one visual region.

| Region | Simultaneous visible controls | Problem? |
|---|---|---|
| Toolbar pill (desktop, non-collapsed) | ~8–12 (hamburger + wake chip + focus chip + mark/nav/row mode + zoom strip + overflow) | **Moderate — crowded but each has a distinct purpose** |
| Overflow menu | 20–30 items | **Severe — the `···` is a dumping ground for everything** |
| Left sidebar Highlight tab | ~14 (colour cycle, mode selector + 3 sliders + 4 checkboxes) | **Moderate — every item is meaningful but visually dense** |
| Left sidebar View tab | ~12 (mode segmented + zoom strip + 2 checkboxes + select + 5 fabric swatches + canvas checkbox + 4 layer checkboxes) | **Moderate** |
| Info strip + banners | Up to 5 stacked banners at once | **High — in certain states (edit mode + session + spotlight + highlight intro + shortcuts hint) this area becomes very noisy** |
| Floating tool dock (mobile) | 10 buttons | **High for a touch target the size of the dock — especially lower buttons require shifting grip** |
| Mobile action bar | 3 controls — but the colour indicator is very small (text-overflow) | Moderate |

---

## 6. Touch and Ergonomic Issues

| Issue | Location | Severity |
|---|---|---|
| **Many dock buttons are small (~36×36px estimated)** | Mobile floating tool dock (M2a–M2j) | **High** — needs to be ≥44×44px. Zoom, undo, redo, find-next are the most tapped; they're squeezed into a narrow strip. |
| **Colour indicator in action bar is narrow** | M4a (bottom action bar) | **High** — on 390px wide phone this button tries to fit swatch + "DMC 310" + name + chevron in ~180px. Name truncates. Hard to read at arm's length. |
| **Mark button (✓) in action bar barely distinguishable from undo** | M4b/M4c | **Medium** — two small icons side-by-side with no label. Right-hand tap users may accidentally hit undo. |
| **Overflow menu (`···`) requires precision tap** | T15 | **Medium** — opens 30+ items. On touch, any "important" action inside is one precision tap away from the button and another tap inside a scrolling list. |
| **Drag-mark on long patterns requires sustained finger movement across entire screen** | C1 canvas | Medium — physical constraint; unavoidable but auto-advance + range-fill (long-press) help |
| **Long-press range-fill requires 500ms hold** | C1 | Medium — needle in other hand makes holding still for 500ms difficult |
| **Left sidebar tabs are small text buttons** | `.lp-tabs` | **High** — 6 tabs in a row; each tab label is short text. On 390px phone this is ~55px per tab = borderline |
| **Park visibility pip is 9px font, very small** | R3–Rn, Lg2–n per-colour rows | **High** — tiny "P×2" button is 9px text in a 1px border. Untappable at arm's length. |
| **Mark/Undo button in palette legend rows is 9px font** | R3–Rn, Lg2–n | **High** — 1px border, 9px text, 1px 6px padding. Well below 44×44px minimum. |
| **Sidebar open/close requires finding the hamburger** | T1 | Medium — hamburger cycles 3 states; the rail mode adds a hidden intermediate state. |
| **Toolbar overflow `···` needs two-handed access on phone** | T15 | Low — but the overflow houses important functions |
| **Zoom slider in toolbar requires two-hand interaction on phone (not visible — desktop-only class)** | T11 | N/A on mobile — hidden |
| **Focus mode toggle (T3) appears next to wake-lock chip (T2) with similar pill styling** | T2/T3 | Medium — easy to confuse. |

---

## 7. Visibility and Contrast Issues

| Issue | Location | Severity |
|---|---|---|
| **Completed colours shown at 55% opacity in legend** | R3–Rn, Lg2–n | **High** — 55% opacity on already-small text is illegible in mixed outdoor lighting |
| **Progress bar uses colour alone to distinguish today vs. cumulative** | I1 | **Medium** — two differently-coloured bar segments with no pattern or label differentiation |
| **Session chip text is very small** (e.g. "12m · 34 st") | T16 | Medium — works at desk; hard to read from arm's length on tablet stand |
| **Info strip progress percentage is text-only** (no large numeric display) | I2 | Medium — at arm's length the "47.2%" in the bar is unreadable |
| **Highlight mode buttons (Isolate/Outline/Tint/Spotlight) have no icons** | L5–L8 | Medium — text-only segmented control; names don't communicate the visual effect |
| **Toolbar pill buttons are ~22px height** (estimated from `lineHeight: "22px"`) | T4–T9 | **High** — toolbar buttons have 0px padding, relying on lineHeight for height. Well under 44px tap target. |
| **Toolbar buttons use thin 0.5px borders** | T10 (zoom − +) | Medium — barely visible on retina displays in dark mode |
| **Dock handle icon (menu icon) is visually identical to the sidebar hamburger** | M2a | Low |
| **"Live" badge on Session tab** is colour-only green text | S1 header | Low |

---

## 8. The Marking Interaction

### Current mechanism (tap mode)
1. User taps a cell on the canvas — `useDragMark` fires `onToggleCell(idx)`.
2. Toggle: if `done[idx]` is truthy → set to 0 (unmark); if falsy → set to 1 (mark).
3. Canvas re-renders the cell immediately via `drawCellDirectly(idx, val)`.
4. The track history stack gets one undo entry.
5. A visual pulse overlay briefly highlights the toggled cell.

### Current mechanism (drag mode)
1. Pointer down + movement beyond `TAP_SLOP_PX` (10px) within `TAP_HOLD_MS` (200ms) starts a drag.
2. **Intent** is fixed by the first cell's current state: if that cell is unmarked → all dragged cells get marked; if marked → all get unmarked.
3. `__skip__` / `__empty__` cells are skipped.
4. On pointer-up `onCommitDrag` is called with the full path `Set<idx>` and intent — committed as one undo step.

### Current mechanism (long-press range select)
1. Long-press (500ms stationary) sets a range **anchor**.
2. The next tap on a different cell commits the rectangular bounding box of anchor + tap as one undo step.
3. `shift+click` on mouse also commits a range from the most recent anchor.

### Current mechanism (mark-colour-done button)
- In the legend rows (right panel / mobile Legend tab) there's a "Mark/Undo" button per colour that marks or unmarks **all stitches** of that colour in a single action (with a >50-stitch confirmation prompt).

### Known gap
The "Mark stitch" button in the bottom action bar (M4c) marks the cell **under the crosshair** (navigate mode crosshair position — `hlRow`/`hlCol`). If no crosshair has been placed, it shows a toast ("Tap a stitch on the canvas"). This is confusing — the button name suggests marking but it only works if the user has navigated to that cell first.

### Touch platform notes
- The canvas uses **Touch Events** (`touchstart/touchmove/touchend`), not Pointer Events, because `{passive:false}` is required to prevent default browser scroll and magnifier gestures on Safari iOS.
- Long-press `preventDefault` on touchstart suppresses iOS context menu during drag-mark.
- Pinch-zoom abort guard: second touch within `MULTI_TOUCH_GRACE_MS` (100ms) cancels the drag and hands control to the browser for pinch.

---

## 9. Cross-Platform Considerations

| Issue | Affected platforms | Reference |
|---|---|---|
| **Touch Events not Pointer Events on canvas** — intentional (Safari iOS requirement). `{passive:false}` on touch events. | Safari iOS, iPadOS | Comment in `tracker-app.js` near `attachTouchListeners` effect |
| **Long-press (500ms) can trigger iOS text selection / link preview** if preventDefault is not called early enough | Safari iOS | `useDragMark.js` calls `preventDefault` on `touchstart` for all non-pinch touches |
| **Wake lock not available on all browsers** — graceful fallback (toast) when `navigator.wakeLock` is undefined | Firefox, older Safari | `acquireWakeLock` handles the error |
| **Context menu on right-click suppressed** via `onContextMenu={e=>e.preventDefault()}` — prevents "Save image as" on Chrome | All desktop | Canvas event handler |
| **Pointer capture during drag-mark** — currently uses Touch Events (not `setPointerCapture`). On Windows touchscreen / Surface, pointer events fire instead; drag may not work across cells. | Windows touchscreen | The `...dragMarkHandlers` spread on the canvas uses pointer-event based handlers from `useDragMark` **for mouse**; touch events handle the touch path separately. This split is intentional and correct. |
| **Zoom range slider** does not fire at correct increments on some iOS versions (Safari rounds `step`). | iOS Safari | The 0.05 step slider in the View tab |
| **`structuredClone` used for deepClone** — available in all supported browsers but the JSON fallback is present | IE (not supported) | Module-top `const deepClone = ...` |
| **`ResizeObserver` used to collapse toolbar pill** | IE (not supported) | Toolbar collapse effect |

---

## 10. Summary: Top Density and UX Debt Items

Ranked by impact on an active-stitching user:

1. **The `···` overflow menu is a dumping ground.** ~30 items behind a single button. Many are "active use" controls (undo, view mode, counting aids, spotlight) buried where they're inaccessible with a needle in hand.

2. **The mobile bottom action bar's controls are undersized.** Colour indicator (≤180px wide), undo icon, mark icon — all well under 44px tap targets, with no text labels. These are the most-tapped controls on phone.

3. **The floating tool dock has 10 buttons stacked in a narrow strip.** The dock is only ~44px wide; each button is approximately 36×36px. Users must reposition the dock to avoid blocking the canvas AND carefully aim at tiny buttons.

4. **The left sidebar requires two interactions to reach "active use" controls.** Open hamburger → tap Highlight tab → use controls. While stitching, this is frequent enough to be a friction point.

5. **The bottom mode pill on phone is the primary mode switcher but it duplicates T4/T5 in the toolbar pill.** Two mode-switching mechanisms on the same page with different visual treatments creates confusion.

6. **Redundant "Spotlight" naming** (highlight mode L8 vs focus area To4) will confuse users.

7. **Per-colour legend rows have 9px-font action buttons** (Park toggle, Mark/Undo) — completely untappable at arm's length or with a needle in hand.

8. **Multiple simultaneous banners** (B1–B6) can stack below the toolbar, pushing the canvas significantly down before the user has even started stitching.

9. **Completed colours at 55% opacity** in the legend is too dim for bright outdoor lighting and makes it hard to verify you've moved to the next colour.

10. **The "Mark button" in the action bar (M4c) is contextually confused** — it only works when a crosshair is placed in navigate mode, but it sits next to the colour indicator which is always visible in track mode. Users will tap it and see a confusing toast.

---

*End of audit — see phase-end questions below.*
