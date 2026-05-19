# Edit Mode UI Audit

> Phase 1 of the edit-mode UI redesign.  
> Sources inspected: `creator/ToolStrip.js`, `creator/Sidebar.js`, `creator/ActionBar.js`,
> `creator/MagicWandPanel.js`, `creator/ContextMenu.js`, `creator/PatternTab.js`,
> `creator/useKeyboardShortcuts.js`, `creator/ColourReplaceModal.js`, `creator/BulkAddModal.js`,
> `creator/ShoppingListModal.js`, `styles.css`, `creator-main.js`, `header.js`

---

## 1. Complete element inventory

Elements are listed per UI region, top-to-bottom in the DOM order a user encounters them.
"Frequency" is inferred from keyboard shortcut presence, position, and function.

### 1.1 Global header — `tb-topbar` (48 px sticky bar)

| # | Element | Type | Label / Icon | Purpose | Shortcut | Frequency |
|---|---|---|---|---|---|---|
| H1 | Logo | Button | App logo | Navigate to home | — | Low |
| H2 | Pattern tab | Tab | "Pattern" | Switch to canvas view | — | Always active in edit mode |
| H3 | Materials tab | Tab | "Materials" | Switch to materials / export panel | — | Low–Medium |
| H4 | Stats tab | Tab | "Stats" / "Legend" | Navigate to stats page | — | Low |
| H5 | Project switcher | Dropdown button | Recent project list icon | Switch or open a saved project | — | Low |
| H6 | Import | Button | "Import" | Import `.json`, `.oxs`, image, or PDF | — | Low |
| H7 | Download | Button | "Download" | Download `.json` backup | Ctrl+S | Low |

### 1.2 Context bar (below `tb-topbar`, inside header, always visible when a project is open)

| # | Element | Type | Label / Icon | Purpose | Frequency |
|---|---|---|---|---|---|
| C1 | Project name | Editable text | `[project name]` | Inline project rename | Low |
| C2 | Dimensions badge | Static text | e.g. "80×80 st" | Pattern size info | N/A (display) |
| C3 | Palette count | Static text | e.g. "12 colours" | Info | N/A (display) |
| C4 | Progress % | Static text | e.g. "34% done" | Info | N/A (display) |
| C5 | Auto-saved hint | Status chip | "All changes saved" | Save status indicator | N/A (display) |
| C6 | Open in Tracker | Button | pencil icon "Edit Pattern" (tracker page) / "Open in Tracker" (creator) | Switch to tracker mode | — | Low |
| C7 | Download | Button | "Download" | Download `.json` | — | Low |

### 1.3 Action bar — `creator-actionbar` (below header, full-width)

| # | Element | Type | Label / Icon | Purpose | Frequency |
|---|---|---|---|---|---|
| A1 | Phase label | Static text | "Editing pattern" | Mode indicator | N/A (display) |
| A2 | Open in Tracker | Button | "Open in Tracker" + chevron | Switch to stitch tracker | Low |
| A3 | Stats link | Ghost button / link | barChart "Stats" | Navigate to stats page | Low |
| A4 | Print PDF | Primary button | printer "Print PDF" | Export chart to PDF | Low |
| A5 | Export menu | Ghost dropdown | document "Export…" + chevron | Open export options | Low |
| A5a | Save project (.json) | Menu item | save icon "Save project (.json)" | Download `.json` | Low |
| A5b | More export options… | Menu item | archive icon "More export options…" | Jump to Materials → Output tab | Low |
| A6 | Difficulty badge | Status chip | e.g. "Intermediate" | Pattern difficulty level | N/A (display) |
| A7 | Pattern info | Trigger button | "Pattern info" + chevron | Open pattern info popover | Low |

### 1.4 Toolbar pill (ToolStrip row 1 — `.pill-row`, 52 px sticky)

The pill is one horizontal bar. Elements inside from left to right:

| # | Element | Type | Label / Icon | Purpose | Shortcut | Frequency |
|---|---|---|---|---|---|---|
| T1 | Paint | Toggle button | "Paint" | Activate paint-brush tool | P | **Very high** |
| T2 | Fill | Toggle button | "Fill" | Activate flood-fill tool | F | High |
| T3 | Erase | Toggle button | cross icon "Erase" | Activate erase tool | 5 | Medium |
| T4 | Pick | Toggle button | "Pick" | Activate eyedropper (sample colour) | I | Medium |
| T5 | Hand | Toggle button | hand icon "Hand" | Pan / drag-to-scroll canvas | H | High |
| T6 | Replace | Toggle button | colourSwap icon "Replace" | Click-to-replace-colour mode | — | Low–Medium |
| T7 | Cleanup | Toggle button | cleanup icon "Cleanup" | Enter multi-step cleanup mode | — | Low |
| — | Separator | Visual divider | | | | |
| T8 | Wand | Toggle button | wand SVG "Wand" | Magic wand selection | W | Medium |
| T9 | Lasso | Toggle button | freehand/polygon/magnetic SVG "Lasso" | Lasso selection (mode set in sidebar) | — | Medium |
| T10 | Clear selection | Button (conditional) | `N sel ×` | Clear current selection | Esc | Medium (when active) |
| T11 | Tool badge | Status chip | e.g. "Paint 2×2", "Fill", "Erase" | Active tool indicator | N/A | N/A (display) |
| T12 | Zoom label | Static text | "Zoom" | Label | N/A | N/A |
| T13 | Zoom range | Range input | slider | Set zoom level | − / + / = | **Very high** |
| T14 | Zoom % | Static text | e.g. "100%" | Shows current zoom | N/A | N/A (display) |
| T15 | Fit | Button | "Fit" | Fit pattern to viewport | 0 | High |
| — | Separator | Visual divider | | | | |
| T16 | Undo | Button | ↩ | Undo last edit | Ctrl+Z | **Very high** |
| T17 | Redo | Button | ↪ | Redo | Ctrl+Y | High |
| — | Separator (conditional) | | | | | |
| T18 | Overlay | Toggle button (conditional) | "Overlay" | Toggle source image overlay | O | Low (only when image loaded) |
| T19 | Overlay opacity | Range input (conditional) | slider | Adjust overlay opacity | — | Low |
| — | Separator | | | | | |
| T20 | Overflow menu `···` | Dropdown | `···` | Show collapsed/extra controls | — | Low |

**Overflow menu items (when open):**

| # | Element | Type | Label | Condition |
|---|---|---|---|---|
| T20a | Overlay toggle | Toggle item | "Overlay" + check | When image loaded |
| T20b | Overlay opacity | Slider | range | When overlay on |
| T20c | Paint | Menu item | "Paint" + check | When pill width < 680 px |
| T20d | Fill | Menu item | "Fill" + check | When pill width < 680 px |

### 1.5 Swatch row (ToolStrip row 2 — `.swatch-strip-row`, 36 px)

Visible when Paint or Fill is active and the palette has colours.

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| S1 | "Colour" label | Static text | "COLOUR" | Section label | N/A |
| S2 | Active colour chip | Status chip | e.g. "310 · Black" | Shows selected colour | N/A (display) |
| S3 | Colour swatches | Toggle buttons | 20×20 px colour squares (up to 20 visible) | Select paint colour | **Very high** |
| S4 | Expand / collapse | Button | "+N ∨" or "∧" | Show all/fewer swatches | Medium |

### 1.6 Magic Wand Panel (below toolbar, conditional — when wand, lasso, or selection active)

The panel renders up to four stacked horizontal strips between the toolbar and the canvas.

**Strip 1 — Tool options (when wand or lasso is active):**

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| M1 | Tool label | Static text | "Wand" / "Lasso" | Identifies tool | N/A |
| M2 | Tolerance slider | Range input | "Tolerance" 0–100 | Wand selection radius | Medium (wand only) |
| M3 | Tolerance value | Static text | 0–100 + hint | Info | N/A |
| M4 | Connected only | Toggle button | "Connected only" | Wand contiguous mode | Medium |
| M5 | All matching | Toggle button | "All matching" | Wand global (non-contiguous) | Medium |
| M6 | New | Toggle button | selection-replace icon "New" | Replace selection on click | High (default) |
| M7 | Add | Toggle button | selection-add icon "Add" | Add to selection (also: Shift) | Medium |
| M8 | Subtract | Toggle button | selection-subtract icon "Subtract" | Subtract (also: Alt) | Medium |
| M9 | Intersect | Toggle button | selection-intersect icon "Intersect" | Intersect (also: Shift+Alt) | Low |
| M10 | Key hint | Static text | "Shift / Alt / Shift+Alt" | Shortcut reminder | N/A |

**Strip 2 — Selection status (when selection active):**

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| M11 | Selection count | Static text | "N stitches selected" | Info | N/A |
| M12 | Deselect | Button | "Deselect" | Clear selection | High |
| M13 | Invert | Button | "Invert" | Invert selection | Medium |
| M14 | All | Button | "All" | Select all | Medium |
| M15 | Confetti… | Toggle button | "Confetti…" | Open confetti cleanup panel | Low |
| M16 | Reduce Colours… | Toggle button | "Reduce Colours…" | Open colour-reduction panel | Low |
| M17 | Replace Colour… | Toggle button | "Replace Colour…" | Open scoped colour-replace panel | Low |
| M18 | Stitch Info… | Toggle button | "Stitch Info…" | Open per-colour breakdown panel | Medium |
| M19 | Outline… | Toggle button | "Outline…" | Open backstitch-outline generator | Low |

**Inline sub-panels (Strip 3+ — one opens at a time):**

| Panel | Key controls |
|---|---|
| Confetti | "Min cluster size" range (1–10), "N stitches flagged" text, Preview button, Apply button, × close |
| Reduce Colours | "Target" number input, "N colours in selection" text, "Preview merges" button, Apply button, × close; merge-list display |
| Replace Colour | "Source" select, "Target" select, "Fuzzy" checkbox, fuzzy tolerance range (conditional), Apply button, × close |
| Stitch Info | Summary text, "Export CSV" button, × close; per-colour table (read-only) |
| Outline | "Outline thread (DMC)" text input, thread preview swatch, Generate button, × close |

### 1.7 Canvas area — `PatternTab`

The canvas itself is not a control, but the following overlays and adjacent controls appear:

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| P1 | Zoom hint banner | Dismissible notice | "To see symbols, zoom in." | Appears when zoom < 6 in symbol/both view | Low |
| P2 | Shortcut hint | Dismissible notice | "Press `?` for keyboard shortcuts" | One-time education | Very low (one-time) |
| P3 | Confetti warning | Dismissible banner | "Cleanup removed N stitches…" | Warning after aggressive cleanup | Very low (edge case) |
| P4 | Status bar — tool hint | Static text | context-sensitive tool guidance | Guidance | N/A |
| P5 | Status bar — coordinates | Static text | "X: N, Y: N" | Cell position on hover | N/A |
| P6 | Status bar — colour info | Static text + swatch | "DMC {id} {name} (N st)" | Cell colour info on hover | N/A |
| P7 | Undo (in-canvas) | Button | "↩ Undo" | Undo | Ctrl+Z | **Very high** (duplicate) |
| P8 | Redo (in-canvas) | Button | "↪ Redo" | Redo | Ctrl+Y | High (duplicate) |
| P9 | Clear highlight | Button | "Clear ×" | Remove colour highlight | Esc | Medium (when hiId active) |

**Highlight controls (below undo row, when a colour is highlighted):**

| # | Element | Type | Label | Purpose |
|---|---|---|---|---|
| P10 | Isolate mode | Toggle button | "Isolate" | Dim other colours |
| P11 | Outline mode | Toggle button | "Outline" | Marching-ants boundary |
| P12 | Tint mode | Toggle button | "Tint" | Tint the highlighted colour |
| P13 | Spotlight mode | Toggle button | "Spotlight" | Spotlight the highlighted colour |
| P14 | Background dimming | Range (Isolate only) | 5–60% | Dimming intensity |
| P15 | Tint colour | `<input type="color">` (Tint only) | | Tint colour |
| P16 | Tint opacity | Range (Tint only) | 10–80% | Tint opacity |
| P17 | Dim strength | Range (Spotlight only) | 5–50% | Spotlight dim intensity |

**Stitch Score panel (when confetti data available):**

| # | Element | Type | Label | Purpose |
|---|---|---|---|---|
| P18 | Stitch Score | Static display | "N / 100" + bar | Score for isolated-stitch density |
| P19 | "What is this?" | Tooltip trigger | text | Explains score |

### 1.8 Right panel (`rpanel`, 280 px) — Tab strip

| # | Element | Type | Label | Available in edit mode |
|---|---|---|---|---|
| R1 | Image tab | Tab | image icon | No (grayed, locked) |
| R2 | Dimensions tab | Tab | ruler icon | No (grayed, locked) |
| R3 | Palette tab | Tab | palette icon | **Yes** |
| R4 | Tools tab | Tab | pencil icon | **Yes** |
| R5 | View tab | Tab | eye icon | **Yes** |
| R6 | Preview tab | Tab | layers icon | **Yes** |
| R7 | Project tab | Tab | folder icon | No (hidden when edit-only) |
| R8 | Panel collapse toggle | Button | chevron icon | Yes |

### 1.9 Right panel — Palette tab

**Top area (always visible when pattern loaded):**

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| R3a | Palette accordion header | Collapsible header | "Palette · N colours" | Expand/collapse palette chips | Low |
| R3b | Remove unused | Button (conditional) | "Remove unused (N)" | Delete zero-count colours | Low |
| R3c | Stash filter | Checkbox | "Only show threads I own" | Filter chips to owned only | Low |
| R3d | Adapt to my stash | Button (conditional) | "Adapt to my stash" | Open AdaptModal | Low |
| R3e | Add to shopping list | Button (conditional) | "Add to shopping list" | Push unowned to Stash Manager | Low |
| R3f | Colour chips | Toggle buttons | 20×20 px per chip | Select active paint colour | **Very high** |
| R3g | Chip swap button | Button (hover/focus) | swap icon | Open ColourReplaceModal | Low–Medium |

**Colours section (accordion, edit-mode scratch-palette workflow):**

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| R3h | Single thread toggle | Toggle | "Single thread" | DMC search mode | Medium |
| R3i | Blend toggle | Toggle | "Blend (2 threads)" | Blend-picker mode | Low |
| R3j | DMC search | Text input | "Search by DMC # or name…" | Filter DMC list | Medium |
| R3k | DMC list | Scrollable list | up to 60 results | Select thread to add to palette | Medium |
| R3l | Blend thread 1 slot | Display+clear | "Thread 1…" + × | First blend component | Low |
| R3m | Blend thread 2 slot | Display+clear | "Thread 2…" + × | Second blend component | Low |
| R3n | Add blend button | Button | "Add blend {id}+{id}" | Create blend entry | Low |

### 1.10 Right panel — Tools tab

| # | Element | Type | Label | Purpose | Shortcut | Frequency |
|---|---|---|---|---|---|---|
| R4a | Cross stitch | Radio | "Cross" | Set stitch type | 1 | High |
| R4b | Quarter stitch | Radio | "¼ Stitch" | Set stitch type | — | Low |
| R4c | Half stitch / | Radio | "Half /" | Set stitch type | 2 | Low–Medium |
| R4d | Half stitch \ | Radio | "Half \" | Set stitch type | 3 | Low–Medium |
| R4e | Three-quarter stitch | Radio | "¾ Stitch" | Set stitch type | — | Low |
| R4f | Backstitch | Radio | "Backstitch" | Set stitch type | 4 | Medium |
| R4g | Continuous mode | Checkbox | "Continuous mode…" | Chain backstitch segments | — | Low |
| R4h | Brush size slider | Range | 1–3 | Set brush size | — | Medium |
| R4i | Brush size 1 | Button | "1" | Set brush size to 1 | — | Medium |
| R4j | Brush size 2 | Button | "2" | Set brush size to 2 | — | Medium |
| R4k | Brush size 3 | Button | "3" | Set brush size to 3 | — | Medium |
| R4l | Magic Wand | Toggle button | "Magic Wand (W)" | Activate wand | W | Medium |
| R4m | Lasso | Toggle button | "Lasso" | Activate lasso | — | Medium |
| R4n | Freehand lasso mode | Radio | "Freehand" | Lasso sub-mode | — | Medium |
| R4o | Polygon lasso mode | Radio | "Polygon" | Lasso sub-mode | — | Low |
| R4p | Magnetic lasso mode | Radio | "Magnetic" | Lasso sub-mode | — | Low |
| R4q | Clear selection | Button (conditional) | "Clear selection (N)" | Deselect | Esc | Medium |

### 1.11 Right panel — View tab

| # | Element | Type | Label | Purpose | Shortcut | Frequency |
|---|---|---|---|---|---|---|
| R5a | Colour view | Toggle | "Colour" | Show colour fill | V cycle | High |
| R5b | Symbol view | Toggle | "Symbol" | Show symbols | V cycle | High |
| R5c | Both view | Toggle | "Both" | Colour + symbol | V cycle | High |
| R5d | Isolate mode | Toggle (conditional) | "Isolate" | Highlight mode when hiId set | 1 (in HL) | Medium |
| R5e | Outline mode | Toggle (conditional) | "Outline" | | 2 (in HL) | Medium |
| R5f | Tint mode | Toggle (conditional) | "Tint" | | 3 (in HL) | Low |
| R5g | Spotlight mode | Toggle (conditional) | "Spotlight" | | 4 (in HL) | Low |
| R5h | Background dimming | Range (conditional) | 5–60% | Dim when Isolate active | — | Low |
| R5i | Tint colour picker | `<input type="color">` (conditional) | | Colour when Tint active | — | Low |
| R5j | Tint opacity | Range (conditional) | 10–80% | | — | Low |
| R5k | Dim strength | Range (conditional) | 5–50% | Dim when Spotlight active | — | Low |

### 1.12 Right panel — Preview tab (shared between create and edit modes)

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| R6a | Chart mode | Toggle | "Chart" | Grid-line chart preview | Medium |
| R6b | Pixel mode | Toggle | "Pixel" | Pixel-magnified preview | Low |
| R6c | Realistic mode | Toggle | "Realistic" | Rendered fabric simulation | Low |
| R6d | Quality 1–4 | Toggle buttons (conditional) | "1" / "2" / "3" / "4" | Realistic render quality | Low |
| R6e | Coverage slider | Range | | Coverage density | Low |
| R6f | Sparse preset | Button | "Sparse" | Set coverage preset | Low |
| R6g | Standard preset | Button | "Standard" | Set coverage preset | Low |
| R6h | Dense preset | Button | "Dense" | Set coverage preset | Low |
| R6i | Full preset | Button | "Full" | Set coverage preset | Low |
| R6j | Auto reset | Button | "↺ Auto" | Reset coverage to auto | Low |
| R6k | Grid overlay | Checkbox | "Grid overlay" | Show grid lines in preview | Low |
| R6l | Fabric background | Checkbox | "Fabric background" | Simulate Aida fabric | Low |
| R6m | Compare toggle | Button | "Compare side-by-side" / "Exit compare" | Split-pane preview compare | Low |

### 1.13 Context menu (right-click on canvas)

| # | Element | Type | Label | Purpose | Frequency |
|---|---|---|---|---|---|
| CM1 | Pick this colour | Item | eyedropper icon "Pick this colour" | Sample colour under cursor as paint colour | Medium |
| CM2 | Switch to fill tool | Item | bucket icon "Switch to fill tool" | Activate fill for that colour | Low |
| CM3 | Select similar (wand) | Item | wand icon "Select similar (wand)" | Wand-select from this cell | Low |
| CM4 | Select all of this colour | Item | palette icon "Select all of this colour" | Select every cell of this DMC id | Medium |
| CM5 | Replace this colour… | Item | colourSwap icon "Replace this colour…" | Open ColourReplaceModal | Low–Medium |
| CM6 | Highlight / Remove highlight | Item | magnify / magnifyMinus "Highlight this colour" | Toggle `hiId` | Medium |
| CM7 | Stitch info | Item | info icon "Stitch info" | Wand-select + open stitch info panel | Low |

### 1.14 Modals

| Modal | Trigger(s) | Key controls |
|---|---|---|
| **ColourReplaceModal** | CM5, T6 (Replace tool click), R3g (chip swap) | Search input; scrollable DMC list; Cancel |
| **AdaptModal** | R3d ("Adapt to my stash") | Stash-based palette adaptation workflow |
| **BulkAddModal** | From stash UI | Brand tabs (DMC/Anchor), Paste list textarea, Kit selector, token chips, Cancel, "Add N threads" |
| **ShoppingListModal** | From Materials hub | Buy/own lists, "Add to my Stash list" button, "Copy list" button, "Open Stash list" link |

### 1.15 Keyboard shortcuts (no visible button)

These functions are keyboard-only (no toolbar button):

| Key | Action |
|---|---|
| ? | Toggle keyboard shortcuts panel |
| Mod+A | Select all stitches |
| Mod+Shift+I | Invert selection |
| V | Cycle view: colour → symbol → both |
| \ | Toggle split-pane preview |
| T / Shift+T | Cycle stitch type forward / backward |
| 1 / 2 / 3 / 4 / 5 | Cross / Half / / Half \ / Backstitch / Erase |
| Esc | Cascade cancel: name prompt → modal → overflow → pick-bg → lasso → selection → active tool → highlight → selected colour |

---

## 2. Functional groupings

| Group | Elements |
|---|---|
| **Drawing / marking tools** | T1 Paint, T2 Fill, T3 Erase, T4 Pick (eyedropper), R4a–R4f (stitch type), R4h–R4k (brush size), R4g (backstitch continuous) |
| **Selection tools** | T8 Wand, T9 Lasso, T10 Clear selection, M1–M10 (wand/lasso options), M11–M14 (selection operations), R4l–R4q (sidebar selection), CM3, CM4 |
| **Canvas navigation** | T5 Hand, T13 Zoom range, T14 Zoom %, T15 Fit, keyboard -/+/0 |
| **Colour management** | S2–S4 (swatch row), R3a–R3n (palette tab), CM1 Pick, CM5 Replace, T6 Replace, T4 Pick |
| **View / display settings** | R5a–R5k (View tab), T18 Overlay, T19 Overlay opacity |
| **Preview** | R6a–R6m (Preview tab) |
| **Selection operations (in-selection)** | M15 Confetti, M16 Reduce Colours, M17 Replace Colour, M18 Stitch Info, M19 Outline, and their inline panels |
| **Undo / Redo** | T16 Undo, T17 Redo, P7 Undo (canvas), P8 Redo (canvas), keyboard Ctrl+Z/Y |
| **Highlight (colour focus)** | P9 Clear, P10–P17 (mode + intensity sliders), CM6 Highlight toggle, V key (cycles view), sidebar View tab |
| **File operations** | H6 Import, H7 Download (header), C7 Download (context bar), A4 Print PDF, A5/A5a/A5b Export menu |
| **Mode switching / navigation** | H2–H4 tabs, C6 / A2 Open in Tracker, A3 Stats link, A1 phase label |
| **Mode-entry tools** | T7 Cleanup (enters a multi-step sub-mode), T8/T9 Wand/Lasso (expand to extra strips) |
| **Pattern info / stats** | A6 Difficulty badge, A7 Pattern info, P4–P6 status bar, P18–P19 Stitch Score |
| **Project management** | C1 Name, H5 Project switcher |
| **Help** | P2 shortcut hint, "?" key |

**Unclear / orphan placements:**
- T7 **Cleanup** sits in the brush group (visually treated as a peer of Paint/Fill/Erase) but it is a multi-step mode-entry button, not a brushstroke tool. It expands the UI significantly when activated.
- P7/P8 **Undo/Redo below the canvas** — duplicates T16/T17 in the toolbar. It is unclear whether these exist as a fallback for when the toolbar is hidden, or as an accessibility affordance. They are far from the canvas content.
- R4l/R4m **Wand and Lasso in the Tools sidebar tab** — these duplicate T8/T9 in the toolbar. Users must find the sidebar tab to discover lasso sub-modes, but can activate wand/lasso from the toolbar without visiting the tab.
- R5d–R5k **Highlight controls in the View tab** — also appear below the canvas (P10–P17). Two locations for the same set of four controls.

---

## 3. Redundancy and overlap

| # | Redundancy | Locations | Severity |
|---|---|---|---|
| **RE-1** | **"Open in Tracker"** appears twice | A2 (ActionBar) + C6 (ContextBar) | Medium — two obvious identical CTAs competing for attention |
| **RE-2** | **Save / Download** appears three times | H7 (topbar Download), C7 (context bar Download), A5a (Export menu "Save project") | High — same action exposed in three places with two different labels ("Download" vs "Save project") |
| **RE-3** | **Colour Replace** is triggered from three places | T6 (Replace button, canvas click), CM5 (right-click menu), R3g (palette chip hover button) | Low — reasonable multiple entry points, but T6 adds a tool mode that CM5/R3g don't require |
| **RE-4** | **Clear / Deselect selection** in four places | T10 (pill ×), M12 (Deselect button), R4q (sidebar Clear selection), Esc key | Medium — the multiplicity is defensive but adds visual noise |
| **RE-5** | **Undo/Redo** in two UI places | T16/T17 (pill toolbar), P7/P8 (below canvas) | Low — the canvas pair adds reachability but duplicates a prominent control |
| **RE-6** | **Wand / Lasso activation** in two places | T8/T9 (toolbar), R4l/R4m (sidebar Tools tab) | Low — acceptable, but the sidebar adds no unique affordance; wand options are already in the MagicWandPanel |
| **RE-7** | **Highlight mode controls** in two places | View tab (R5d–R5k), PatternTab below-canvas (P10–P17) | Medium — the same four mode buttons + sliders appear in two locations simultaneously when a colour is highlighted |
| **RE-8** | **Overlay toggle** in three places | T18 (pill), T20a (overflow menu item), Sidebar Image tab checkbox | High — the overflow duplicate is logical (collapsed state), but the sidebar Image tab also has it |
| **RE-9** | **View cycle** via both keyboard and UI with no toolbar button | V key (keyboard), R5a–R5c (sidebar View tab toggle) | Low — no toolbar button for view, so users must visit the sidebar, but V is fast |
| **RE-10** | **"Replace Colour" in selection** (M17) vs **ColourReplaceModal** (CM5/T6/R3g) | Two different surfaces | Low — these are functionally different (scoped vs global replace) but share a concept and look |

---

## 4. Current density problems

### 4.1 Brush group in the pill — 7 simultaneous toggle buttons

The brush group holds: `Paint · Fill · Erase · Pick · Hand · Replace · Cleanup`.

This is **7 buttons** in a single contiguous group with no visual hierarchy between them.
- **Paint / Fill / Erase** are core marking tools used on nearly every editing session.
- **Pick** is an auxiliary tool (sample a colour) used occasionally.
- **Hand** is a navigation tool — functionally belongs in the zoom/navigation group but lives with the paint tools.
- **Replace** is a destructive bulk operation that replaces every instance of a colour on the whole canvas — very different in stakes from brushing a single cell.
- **Cleanup** is a multi-step mode that expands the UI, replaces the swatch row with a control panel, and does not paint anything — it is a *mode switch*, not a brush variant.

No visual separators distinguish these three tiers of action. All 7 are `.tb-btn` tokens with identical visual weight.

### 4.2 Full pill at once — ~15 interactive controls in one strip

Counting the edit-mode pill: 7 brush tools + separator + 2 select tools + (conditional clear) + zoom range + Fit + Undo + Redo + (conditional Overlay + opacity) + overflow `···` = **15–17 interactive widgets** in a 52 px strip.

At 1200 px viewport width, these fill roughly 700 px of the available pill width. At 900 px (common laptop), the brush group is already hidden by ResizeObserver (`< 680 px` threshold) and moved to the overflow menu — but the breakpoint is aggressive and the overflow menu is not obviously labelled.

### 4.3 MagicWandPanel — 3–4 stacked strips push the canvas down

When the wand is active and a selection exists and a sub-panel is open, up to **four horizontal strips** appear between the toolbar and the canvas:
- Strip 1 (52 px pill)
- Strip 2 (38 px swatch row)
- Strip 3 (38 px wand options)
- Strip 4 (38 px selection actions — 9 buttons)
- Strip 5 (variable panel content)

On a 768 px tall viewport (common laptop), the canvas may be reduced to as little as **250–300 px** of visible height before scrolling.

The selection actions strip (Strip 4) contains **9 toggle buttons** (`Deselect · Invert · All · Confetti… · Reduce Colours… · Replace Colour… · Stitch Info… · Outline…`) — exceeding the 7-item cognitive threshold on a single row.

### 4.4 ActionBar — 7 elements with mixed roles

The ActionBar holds: phase label + "Open in Tracker" + Stats link + Print PDF + Export… menu + Difficulty badge + Pattern info. These span three different concerns (mode navigation, file export, pattern statistics) in one bar, creating unclear hierarchy. The difficulty badge and "Editing pattern" label are purely informational but sit between interactive controls, adding noise.

### 4.5 Swatch row — 20 tiny (20×20 px) touch targets in a 36 px bar

The primary colour-selection mechanism for painting exposes up to 20 colour swatches. At 20×20 px, these are less than half the recommended 44×44 px touch target minimum. On desktop with a mouse, precision is fine, but on a tablet in portrait orientation, this row is reliably mistappable. The row has no visible scroll indicator (scrollbar hidden via `scrollbar-width: none`), so users on touch cannot tell if the row is scrollable.

### 4.6 Palette chips in sidebar — hover-only affordance

The colour-swap button on each palette chip in the sidebar panel is `opacity: 0` and transitions to visible only on `mouseenter`. This is a zero-affordance control on touch. It is 13×13 px — well below touch target minimums.

### 4.7 Duplicate Undo/Redo below the canvas

The Undo/Redo buttons that appear below the canvas (P7/P8) are only shown when `editHistory.length > 0` or `redoHistory.length > 0`. On larger screens, the buttons are redundant with T16/T17. On mobile (where the toolbar scrolls off), they provide reachability — but their placement below potentially a large canvas makes them hard to reach without scrolling.

---

## 5. Touch and mobile issues

| # | Issue | Location | Impact |
|---|---|---|---|
| **TM-1** | Colour swatches at 20×20 px — well below 44×44 px minimum | Swatch row (S3) | **High** — misselection extremely common on touch |
| **TM-2** | Colour swatches have no scroll affordance (scrollbar hidden) | Swatch row | **High** — users cannot discover horizontal scroll without trying |
| **TM-3** | Palette chip swap button is opacity-0 / hover-only, 13×13 px | Sidebar Palette tab (R3g) | **High** — completely inaccessible on touch |
| **TM-4** | Overflow menu button is 28×26 px — below touch minimum | T20 `···` button | Medium — small hit target; less critical as it is accessed rarely |
| **TM-5** | MagicWandPanel sub-tool buttons are 11px font, ~28 px height in strips | M1–M19 | Medium — strips use `min-height: 44px` override at ≤799 px, but the content items inside may still be small |
| **TM-6** | Context menu only reachable by right-click — no long-press equivalent for touch | CM1–CM7 | High — all context menu actions must be duplicated in another path on touch |
| **TM-7** | Highlight mode controls below the canvas (P10–P17) duplicated from View tab, but both are hidden on mobile (the canvas row P10–P17 are inside PatternTab which does not benefit from the `rpanel` bottom-sheet promotion) | P10–P17 | Medium |
| **TM-8** | Tool badge is purely decorative; on narrow screens it takes space without actionable value | T11 | Low |
| **TM-9** | Lasso sub-mode (Freehand / Polygon / Magnetic) requires visiting the Tools tab in the sidebar — on mobile the sidebar is a bottom sheet that must be opened separately from the canvas interaction | R4n–R4p | Medium — the lasso mode is set before drawing; once set it persists, but the discovery is indirect |
| **TM-10** | Split-pane preview (\ key) shows a horizontal split that renders unusably narrow on phone-width screens | R6m, \ key | Low (edge case, low frequency) |
| **TM-11** | DMC search list in Palette tab (R3k) has `max-height: 200px` — on the mobile bottom sheet, this combined with the accordion padding and stash controls may require vertical scrolling within a scrollable container (nested scroll) | R3k | Low–Medium |

---

## 6. Cross-platform considerations

| # | Issue | Detail |
|---|---|---|
| **CP-1** | **Pointer events used throughout** — good | `pointerdown` is used to close flyouts (ToolStrip, ActionBar, overflow). This correctly handles both mouse and touch without requiring separate handlers. No mouse-only `mousedown` sinks found in the audited files. |
| **CP-2** | **`touch-action: manipulation`** partially applied | `.tb-btn` elements get `touch-action: manipulation` inside the `@media (pointer: coarse)` query. However, the swatch buttons (S3, R3f) are custom `<button>` elements styled inline and may not inherit this rule, potentially causing 300 ms tap delay on older iOS. |
| **CP-3** | **Right panel ResizeObserver** collapse at `< 680 px` | The breakpoint matches the `ResizeObserver` on `app.stripRef`. This is client-width reactive, not viewport reactive — if the `rpanel` is open at 280 px, the effective canvas + pill width may be only ~720 px on a 1000 px viewport, triggering the collapse earlier than expected. |
| **CP-4** | **Sticky toolbar on iOS Safari** | `.toolbar-row` is `position: sticky; top: 48px`. iOS Safari has known issues with sticky inside `overflow: hidden` containers. The `.rpanel` at mobile becomes `position: fixed; bottom: 0` — the sticky toolbar above the canvas and the fixed bottom sheet create a dual-inset layout that needs careful `safe-area-inset` accounting. The existing CSS includes `padding-bottom: env(safe-area-inset-bottom, 0px)` on `.mgr-rpanel--open` but not on `.rpanel--open` for the creator. |
| **CP-5** | **Overflow flyouts: `position: absolute`** | The overflow menu and the Export… menu in ActionBar use `position: absolute` with `z-index: 200`. These render correctly on all browsers but can clip behind adjacent sticky/fixed elements if `overflow: hidden` is set on a parent. Audited and no current parent causes this issue, but worth monitoring when new wrappers are added. |
| **CP-6** | **`backdrop-filter` not used** | None of the audited panel surfaces use `backdrop-filter`. This avoids the Safari repaint issue and is consistent with the Workshop theme's surface-colour approach. No concern here. |
| **CP-7** | **Scroll-inside-scroll** | The DMC list inside the Palette tab sidebar (R3k) and the merge-list inside the Reduce Colours panel both use `overflow-y: auto` inside an already-scrollable rpanel. On iOS, this can cause scroll-chaining issues where a swipe on the inner scroll area propagates to the outer scroll container. Both use standard inline styles; adding `-webkit-overflow-scrolling: touch` or ensuring `overscroll-behavior: contain` on the inner scroll elements would mitigate this. |
| **CP-8** | **`pointer: coarse` media query** | The codebase uses `@media (pointer: coarse)` (correctly not `(hover: none)`) to detect touch-primary devices. This query fires on iPads and Android tablets in touch mode. Desktop browsers with touch screens (Surface, Chromebook touchscreen) may also trigger it. The min-height bumps to 44 px for `.tb-btn` inside this query are appropriate. |

---

## 7. Element count by region

| Region | Interactive controls | Display-only elements | Notes |
|---|---|---|---|
| Global header (topbar) | 7 | 0 | |
| Context bar | 2 (+ 2 conditional) | 3 | Conditional: Track/Download only when project loaded |
| Action bar | 6 (+ 2 in menu) | 2 | |
| Toolbar pill (edit mode) | 12 (+ 2–3 conditional) | 2 | 7 in brush group alone |
| Swatch row | 1–21 (conditional) | 2 | Up to 20 swatches + expand |
| MagicWand panel (all strips + panels) | Up to 20 | 4 | Only when tool/selection active |
| Canvas area (PatternTab) | 2–9 (conditional) | 4 | |
| Right panel tab strip | 8 | 0 | 4 tabs locked in edit mode |
| Palette tab | 8–16 (conditional) | 0 | |
| Tools tab | 17 | 1 | |
| View tab | 3 (+ 5 conditional) | 0 | |
| Preview tab | 13 | 0 | |
| Context menu | 7 | 0 | |
| **Total worst-case visible** | **~70–90 reachable controls** | | Not all visible simultaneously, but many are |

---

## 8. Summary of major pain points

1. **The brush group mixes three tiers of tools at equal visual weight** — everyday tools (Paint/Fill), helper tools (Pick/Hand), and whole-mode-changers (Replace/Cleanup) are indistinguishable.

2. **The pill toolbar at full width has ~15 interactive widgets in 52 px** — exceeds the ~7 cognitive threshold; at narrow widths, items collapse into an unlabelled overflow menu with no visual warning.

3. **Up to 4 stacked horizontal strips** (toolbar + swatch row + wand options + selection actions) can appear simultaneously, severely reducing canvas visibility and stacking ~20 buttons between the header and the canvas.

4. **Swatch row colour swatches are 20×20 px** with a hidden scrollbar — critical touch usability failure for the most-used control in paint mode.

5. **Hover-only palette chip swap button** (13×13 px) is completely inaccessible on touch.

6. **Right-click context menu is the only path to some actions on desktop** — no touch equivalent exposed.

7. **Duplicate "Open in Tracker" and "Save/Download"** appear in multiple header regions simultaneously, creating an unclear hierarchy of where to click.

8. **Highlight mode controls appear in two places** (View tab and below the canvas), creating navigational confusion.

---

## Phase 1 question for you

Before moving to Phase 2 proposals, I need your input on one key question:

**Which tools do you consider "must stay one click away" — i.e. tools so frequently used they should never be behind a menu, popover, or expandable section?**

To help frame your answer, here are the candidates from the audit, grouped by how often a typical user would need them:

**Likely essential (used on nearly every stroke):**
- Paint tool
- Fill tool
- Undo / Redo
- Colour selection (swatches / palette)
- Zoom (in/out/fit)

**Probably essential (used many times per session):**
- Erase tool
- Hand/pan
- View toggle (colour / symbol / both)

**Situational (used sometimes, but not every session):**
- Magic Wand selection
- Lasso selection
- Eyedropper (Pick)
- Stitch type selector (Cross / Half / Backstitch etc.)
- Brush size

**Occasionally useful but rarely:**
- Replace colour tool
- Cleanup mode
- Overlay toggle
- Undo history depth > 1 step
- Selection operations (Confetti, Reduce, etc.)

Please list the tools you want guaranteed one-click access to. Your answer will directly shape which redesign options are viable. You can simply name them, or specify any constraints (e.g. "zoom must stay in the toolbar, not behind a tap").
