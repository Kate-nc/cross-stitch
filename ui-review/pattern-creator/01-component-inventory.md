# Component Inventory — Pattern Creator

Every UI component rendered in the Creator section (`index.html` → `creator/bundle.js` + shared scripts). File references are to the codebase root. Line numbers reference internal files in `creator/` unless otherwise noted.

---

## 1. Top-Level Navigation

### 1.1 Header
- **File:** `header.js` → `Header` component
- **What it does:** Persistent app-wide navigation bar with logo, page tabs (Create / Track / Stash / Stats), File dropdown (New, Open, Save, Backup/Restore), Help, Shortcuts. Also contains a Creator-specific tab dropdown (Pattern / Project / Threads / Export) that mirrors the sidebar tabs.
- **Frequency:** Interacted with only at session boundaries — opening projects, saving, switching pages.
- **Visual weight vs frequency:** Appropriate — 48px sticky top bar, minimal for what it delivers.
- **Mobile / desktop:** Both. Touch targets meet 44px minimum via `@media (pointer: coarse)` rule.
- **Tag:** ✅ Already well-placed

### 1.2 ContextBar
- **File:** `header.js` → `ContextBar` component
- **What it does:** Shows project name (editable inline), dimensions (`80×80`), colour count, progress % (if tracking data exists), and action buttons ("Track ›", "Save", "Edit Pattern").
- **Frequency:** Background reference. Users rename rarely; dimensions/colour count are informational.
- **Visual weight vs frequency:** Over-weighted. Adds 36px of chrome. The "Track ›" button duplicates the Export tab's "Open in Stitch Tracker" button. "Save" duplicates the File menu. Dimensions and colour count are also visible in the sidebar's Pattern Summary.
- **Mobile / desktop:** Both. On narrow screens, inline name editing is fiddly.
- **Tag:** 🔄 Merge into Header — same pattern as accepted Tracker Proposal B. Project name + colour count can fit inline in the header bar.

---

## 2. ToolStrip — Pill Toolbar

**File:** `creator/ToolStrip.js` (~640 lines), rendered as `<div className="toolbar-row">` → `<div className="pill-row">` → `<div className="pill">`.
**CSS:** `styles.css` L189–199 (`.pill-row` 52px height, `.pill` capsule).
**Condition:** Only visible when pattern loaded AND sidebar tab = Pattern.

The main toolbar contains **~18 interactive elements** across two rows.

### 2.1 Brush Group (Paint / Fill / Erase / Eyedropper)
- **What it does:** Four mutually exclusive drawing tools. Paint draws individual cells or brush strokes; Fill flood-fills contiguous areas; Erase removes cells to `__empty__`; Eyedropper samples colours.
- **Shortcuts:** P, F, 5, I.
- **Frequency:** Very frequent. Paint and Fill are core editing tools used hundreds of times per session.
- **Visual weight:** Occupies ~100px as a capsule group. Collapses at `<680px`.
- **Tag:** ✅ Keep prominent

### 2.2 Stitch Type Dropdown
- **What it does:** Dropdown selecting stitch type: Cross (1), Quarter Stitch, Half / (2), Half \ (3), Three-Quarter, Backstitch (4). Shows current type icon + label.
- **Frequency:** Occasional — most users work primarily in cross stitch mode. Quarter/half/backstitch are advanced features.
- **Visual weight:** ~80px button + dropdown menu. Appropriate as a dropdown rather than 6 separate buttons.
- **Tag:** ✅ Already well-placed — dropdown keeps advanced options accessible but not in the way

### 2.3 Brush Size (1 / 2 / 3)
- **What it does:** Three radio buttons setting brush radius. Only shown for cross/half paint or erase tools.
- **Frequency:** Occasional — users set brush size and leave it. Size 1 is most common.
- **Conditional display:** Hidden for backstitch, eyedropper, fill, magic wand, lasso. Collapses to overflow at `<680px`.
- **Tag:** 🔽 Keep but demote — could live in the overflow or brush group dropdown. Takes toolbar space for a rarely-changed setting.

### 2.4 Backstitch Continuous Checkbox
- **What it does:** Toggles chain-drawing mode for backstitch (each endpoint becomes the next start).
- **Frequency:** Rare — only relevant when drawing backstitch lines.
- **Conditional:** Only shown when backstitch tool active and width `>550px`.
- **Tag:** 🔽 Already properly collapsed — moves to overflow at narrow widths

### 2.5 Selection Tools Dropdown
- **What it does:** Dropdown with 5 items: Magic Wand (W), Freehand Lasso, Polygon Lasso, Magnetic Lasso, Clear Selection.
- **Frequency:** Occasional to frequent. Magic Wand is used for bulk operations (confetti cleanup, colour replacement). Lasso tools are advanced.
- **Visual weight:** Single dropdown button (~70px) + menu. Appropriate.
- **Tag:** ✅ Already well-placed — dropdown encapsulates four tools efficiently

### 2.6 Colour Chip
- **What it does:** Shows the currently selected paint colour (DMC ID + swatch dot).
- **Frequency:** Background reference. Updated automatically when user picks colours.
- **Visual weight:** Small (~60px), appropriate. Provides essential context for "what am I painting with?".
- **Tag:** ✅ Keep — essential feedback element

### 2.7 Tool Badge
- **What it does:** Shows the active tool name + icon as a subtle badge when a non-paint tool is active.
- **Frequency:** Continuous when active, none when in default paint mode.
- **Tag:** ✅ Appropriate — contextual, non-intrusive

### 2.8 Zoom Controls (−, slider, +, %, Fit)
- **What it does:** 5 elements: minus button, range slider, plus button, percentage label, Fit button.
- **Shortcuts:** +, −, 0 (fit).
- **Frequency:** Occasionally. Pinch-to-zoom on mobile means these are desktop-primary. "Fit" used once per session.
- **Visual weight:** Takes ~130px of toolbar width — generous for occasional use. The range slider is nearly unusable on touch.
- **Mobile:** Pinch-to-zoom exists; slider should be hidden on touch devices.
- **Tag:** 🔽 Keep but demote — collapse to ± buttons + Fit on mobile; or defer zoom slider to overflow. Same finding as tracker audit.

### 2.9 Undo / Redo
- **What it does:** Step backward/forward through edit history.
- **Shortcuts:** Ctrl+Z / Ctrl+Y.
- **Conditional:** Only shown when undo/redo stacks are non-empty.
- **Frequency:** Occasional via buttons, frequent via keyboard. Mobile has a floating FAB undo button at `pointer: coarse`.
- **Tag:** ✅ Already well-placed — conditional show + keyboard shortcut + FAB for mobile

### 2.10 Preview Dropdown
- **What it does:** Mega-menu containing: Chart/Pixel/Realistic mode toggle, grid overlay, fabric background, 4 realistic quality levels, thread coverage slider with presets (Sparse/Standard/Dense/Full), auto/manual indicator.
- **Frequency:** Occasional. Users check preview a few times per session to verify appearance.
- **Visual weight:** Single button (~70px) but the dropdown is a dense sub-application (coverage slider + presets + auto-reset).
- **Tag:** 🔄 Reorganise — the preview modes (Chart/Pixel/Realistic) belong here, but the thread coverage slider + presets is a deeply nested control that could live in a dedicated Preview settings area in the sidebar. The dropdown is doing too much.

### 2.11 Split View Toggle
- **What it does:** Enables side-by-side chart + preview panes.
- **Shortcut:** `\` (backslash).
- **Frequency:** Occasional — toggled when user wants simultaneous chart + preview.
- **Visual weight:** Single button (appropriate).
- **Tag:** ✅ Appropriate

### 2.12 Diagnostics Toggle
- **What it does:** Opens/closes the floating diagnostics panel (confetti, heatmap, readability analysis).
- **Frequency:** Rare. Used once or twice per project to check quality.
- **Visual weight:** Single button (`Diag` label on wide screens, icon on narrow).
- **Tag:** 🔽 Keep but demote — could move to overflow menu. Only used a few times per project lifecycle.

### 2.13 Overflow Menu (⋯)
- **What it does:** Contains: source image overlay toggle + opacity slider, plus any collapsed toolbar items (brush size, backstitch continuous).
- **Frequency:** Rare for overlay; catches collapsed items at narrow widths.
- **Visual weight:** Single button (appropriate).
- **Tag:** ✅ Already well-placed — proper overflow pattern

### Row 2: Swatch Strip
- **File:** `creator/ToolStrip.js` — bottom portion of `toolbar-row`.
- **CSS:** `.swatch-strip-row` height 36px, horizontal scrollable.
- **What it does:** Horizontal strip of colour swatches sorted by usage, click to select. First 20 shown, expandable. Includes an "Expand" toggle.
- **Frequency:** Very frequent — this is the primary colour selection mechanism during editing.
- **Visual weight:** Full-width 36px dedicated row. Justified by frequency.
- **Mobile:** Horizontal scroll works well on touch. Swatch targets are 24×24 (below 44px minimum).
- **Tag:** ✅ Keep prominent — but increase touch target size on `pointer: coarse`

---

## 3. Sidebar (Right Panel)

**File:** `creator/Sidebar.js` (~1000 lines), rendered as `<div className="rpanel">`.
**CSS:** `.rpanel` — 280px, sticky `top: 128px`, scrollable. Mobile: collapses to 44px bottom drawer.

### 3.1 Tab Bar
- **What it does:** Four tabs: Pattern | Project | Threads | Export. Mirrors the Header's creator tab dropdown.
- **Frequency:** Frequent — users switch between Pattern (editing) and Project (overview) several times per session.
- **Mobile:** Tab bar becomes sticky at top of drawer. Min-height 44px on coarse pointers.
- **Tag:** ✅ Keep — but note duplication with Header's creator tab dropdown

### 3.2 Palette Chips Section
- **What it does:** Colour swatches at top of sidebar. Click to select paint colour (Pattern tab) or to highlight. Shows DMC ID, stitch count, type indicator (S/B for solid/blend). In scratch mode: DMC search input + add/remove buttons.
- **Frequency:** Frequent. Primary colour selection alongside the swatch strip.
- **Visual weight:** Variable — small palettes fit naturally, large palettes (30+) create long scroll before reaching any settings.
- **Tag:** 🔄 Consider capping visible chips — show top 10-15 in sidebar, rest via "See all" expansion. Same philosophy as swatch strip's first-20 cap.

### 3.3 View Toggle (Colour / Symbol / Both)
- **What it does:** Three buttons switching canvas render mode.
- **Shortcut:** V cycles through modes.
- **Frequency:** Occasional — users pick one mode and stick with it for a while.
- **Tag:** ✅ Appropriate — three clear options

### 3.4 Image Card
- **What it does:** Source image thumbnail with "Crop" and "Change" buttons. Shows background picker indicator when in `pickBg` mode.
- **Frequency:** Crop and Change are per-project actions (once or twice). The thumbnail is useful reference.
- **Visual weight:** ~80px tall. Reasonable.
- **Tag:** ✅ Appropriate — provides useful at-a-glance reference to the source

### 3.5 Dimensions Section (collapsible)
- **What it does:** Lock aspect ratio checkbox, stitch width/height inputs (10-300), size slider.
- **Frequency:** Set once per generation, maybe tweaked 1-2 times. Users set dimensions then generate.
- **Tag:** ✅ Appropriate as collapsible section

### 3.6 Palette Section (collapsible)
- **What it does:** 8+ controls: Max colours slider (10-40), Allow blended threads, Use only stash threads, Quick-add to stash, Randomise + seed, Explore variations gallery, Min stitches/colour, Remove Orphans (0-3), Dithering (Direct/Dithered). Also has an "Advanced" sub-toggle for min stitches, orphans, dithering.
- **Frequency:** Max colours slider is adjusted frequently during iteration. Blends, stash constraint, and randomise are per-project. Min stitches/orphans/dithering are advanced and rarely changed.
- **Visual weight:** When fully expanded including Advanced, this section is very tall (~200px+). The Advanced sub-toggle is good progressive disclosure.
- **Tag:** 🔄 Good structure but the "Advanced" toggle could be slightly better signalled. Consider making it clearer that expanded Advanced adds significant controls below.

### 3.7 Stitch Cleanup Section (collapsible)
- **What it does:** Master toggle, strength slider (Gentle/Balanced/Thorough), Protect fine details checkbox, Smooth dithering checkbox, cleanup diff visualisation button.
- **Frequency:** Occasionally tuned per generation cycle. Most users leave defaults.
- **Tag:** ✅ Appropriate as collapsible

### 3.8 Fabric & Floss Section (collapsible)
- **What it does:** Single dropdown for fabric count (14/16/18/20/22/28 ct).
- **Frequency:** Set once per project, almost never changed.
- **Visual weight:** A full collapsible section for one dropdown is overhead.
- **Tag:** 🔽 Over-structured — this single dropdown could merge into Dimensions or be a top-level control in the sidebar instead of its own section.

### 3.9 Adjustments Section (collapsible)
- **What it does:** Smooth (0-4 with median/gaussian type), Brightness/Contrast/Saturation sliders.
- **Frequency:** Occasionally — users tweak during generation iteration. Expert feature.
- **Tag:** ✅ Appropriate as collapsible — these are pre-generation image adjustments

### 3.10 Background Section (collapsible)
- **What it does:** Skip background checkbox, BG colour picker, tolerance slider, Auto-Crop to Stitches.
- **Frequency:** Set once per project. Auto-crop is a one-shot action.
- **Tag:** ✅ Appropriate as collapsible

### 3.11 Palette Swap Section (collapsible)
- **What it does:** Hue shift slider + 14 preset palettes (each with 3 tiers: 8/16/24 colours). Rich creative feature.
- **Frequency:** Occasional — creative exploration tool used a few times per project.
- **Visual weight:** When expanded, shows all 14 presets with swatches — very tall. This is intentional for browsability.
- **Tag:** 🔄 Consider lazy-loading preset swatches or using a grid layout to reduce vertical height

### 3.12 Generate Button
- **What it does:** "Generate Pattern" (first time) or "Regenerate" (after pattern exists). Triggers web worker pattern generation. "Reset Canvas" in scratch mode.
- **Frequency:** Core action — triggered many times during iteration.
- **Visual weight:** Pinned at bottom of sidebar. Primary-coloured button.
- **Tag:** ✅ Key action, correctly prominent

---

## 4. Sidebar Tabs — Content Areas

### 4.1 Pattern Tab (`CreatorPatternTab`)
- **File:** `creator/PatternTab.js`
- **What it renders:** Canvas container, modifier key tracker, status text hints, shortcuts banner (dismissible), confetti warning banner, highlight mode segmented control (Isolate / Outline / Tint / Spotlight with per-mode settings), status bar (tool hint + coordinates + colour info), undo/redo/clear-highlight action buttons.
- **Canvas area:** Renders `PatternCanvas`, `PreviewCanvas`, `RealisticCanvas`, or `SplitPane` depending on mode.
- **Tag:** ✅ Core of the application — this IS the canvas workspace

### 4.2 Project Tab (`CreatorProjectTab`)
- **File:** `creator/ProjectTab.js`
- **What it renders:** Pattern Summary (dimensions, stitchable count, difficulty, stitchability/confetti score, progress %), Time Estimate (speed slider, total/remaining), Finished Size table, Cost Estimate (price per skein, total), Thread Organiser (owned/to-buy, per-thread list, stash integration, kit check, copy-list buttons).
- **Frequency:** Checked once or twice per project. Thread Organiser is a deep sub-application.
- **Visual weight:** Very tall — Thread Organiser alone can be 500px+ with a 30-colour palette.
- **Tag:** 🔄 Thread Organiser is appropriately placed here (it's pattern-specific, unlike the tracker where it's misplaced), but could benefit from a collapsed default state with "Expand" button.

### 4.3 Threads Tab (`CreatorLegendTab`)
- **File:** `creator/LegendTab.js`
- **What it renders:** Fabric count selector, total skeins, sortable thread table (Symbol, Swatch, DMC ID, Name, Type, Stitches, Skeins, Done). Row click highlights colour on pattern.
- **Frequency:** Reference view — checked a few times per project.
- **Tag:** ✅ Appropriate

### 4.4 Export Tab (`CreatorExportTab`)
- **File:** `creator/ExportTab.js`
- **What it renders:** "Open in Stitch Tracker" (primary green button), PDF export controls (chart mode + cell size + single page + cover sheet), PNG chart with A4 pages, Save/Load JSON.
- **Frequency:** End-of-project actions — used 1-2 times per project.
- **Tag:** ✅ Appropriate as a final tab. "Open in Tracker" deserves its prominent position.

---

## 5. Floating Panels & Overlays

### 5.1 Diagnostics Panel
- **File:** `creator/DiagnosticsPanel.js`
- **What it does:** Floating panel with three diagnostic modes: Confetti (threshold slider, per-colour breakdown), Heatmap (block size, metric, distribution), Readability (contrast ratio analysis, fail/warn counts). Each has a toggle switch. Results computed via `diagnosticsEngine.js` with 500ms debounce.
- **Frequency:** Used 1-3 times per project to validate quality.
- **Visual weight:** Floating overlay — doesn't consume layout space. Correct pattern.
- **Tag:** ✅ Floating panel is the right approach for this

### 5.2 Magic Wand Panel
- **File:** `creator/MagicWandPanel.js`
- **What it does:** Appears when magic wand selection is active. Contains: tolerance slider, contiguous/global toggle, operation mode (replace/add/subtract/intersect), plus operation buttons: Confetti Cleanup, Reduce Colours, Replace Colour, Stitch Info, Outline. Each operation has its own sub-panel.
- **Frequency:** Occasional but important — bulk editing operations.
- **Visual weight:** Floating panel near selection — doesn't block canvas.
- **Tag:** ✅ Appropriate — floating context panel for selection operations

### 5.3 Context Menu
- **File:** `creator/ContextMenu.js`
- **What it does:** Right-click (or long-press on mobile) menu: cell colour info header, Pick this colour, Switch to fill, Select similar, Select all of this colour, Highlight this colour, Stitch info.
- **Frequency:** Occasional on desktop (right-click), less common on mobile (long-press is slow).
- **Tag:** ✅ Appropriate — standard context menu pattern

### 5.4 Substitute From Stash Modal
- **File:** `creator/SubstituteFromStashModal.js`
- **What it does:** Full modal for analysing and applying stash-based thread substitutions. Before/after swatches, per-substitution approval, contrast warnings, live preview thumbnail.
- **Frequency:** Rare — used when user wants to substitute unowned threads with stash alternatives.
- **Tag:** ✅ Appropriate as a modal — complex workflow that deserves full attention

### 5.5 Comparison Slider
- **File:** `creator-main.js`
- **What it does:** Before/after image comparison slider. Draggable split, auto-sweep animation, Alt+hover zoom lens, diff overlay, heatmap overlay.
- **Frequency:** Used after generation to compare source image vs pattern output.
- **Tag:** ✅ Appropriate

### 5.6 Toast Container
- **File:** `creator/Toast.js`
- **What it does:** Fixed bottom-right notification stack. Types: info (ℹ), success (✓), warning (⚠), error (✕). Auto-dismiss.
- **Tag:** ✅ Standard notification pattern

---

## 6. Contextual Banners

Multiple banners appear above the canvas based on state:

| Banner | Condition | Tag |
|---|---|---|
| Keyboard shortcuts hint | `!shortcutsHintDismissed` | 🔽 One-time, dismissible — good |
| Confetti cleanup warning | High confetti detected post-generation | ✅ Actionable alert |
| Modifier key indicator (Shift/Alt) | Selection tools active | ✅ Contextual, essential |
| Status text tool hints | Various tools active | ✅ Contextual |

**Observation:** Unlike the tracker which can stack 3-4 banners, the creator is more disciplined — typically 0-1 banners visible. No stacking issue.

---

## 7. Chrome Budget Summary

### Desktop (pattern loaded, Pattern tab active)

| Layer | Height | Content |
|---|---|---|
| Header | 48px | Logo, nav, file menu, creator tabs |
| ContextBar | 36px | Project name, dimensions, actions |
| Pill Row | 52px | All toolbar buttons |
| Swatch Strip | 36px | Colour swatches |
| **Total chrome** | **172px** | |

**Available canvas on 1080p:** ~908px minus rpanel 280px = ~628px canvas width, ~908px canvas height.

### Mobile (pattern loaded, Pattern tab active)

| Layer | Height | Content |
|---|---|---|
| Header | 48px | Compact nav |
| ContextBar | 36px | Truncated project info, actions |
| Pill Row | 52px | Scrollable toolbar |
| Swatch Strip | 36px | Scrollable swatches |
| rpanel (collapsed) | 44px | Tab bar only (fixed bottom) |
| **Total chrome** | **216px** | |

**Available canvas on 667px phone (portrait):** ~451px. On 375px phone (landscape): ~159px — nearly unusable.

### Comparison to Tracker (current)
- Tracker: 226px chrome → 441px canvas on 667px phone
- Creator: 216px chrome → 451px canvas on 667px phone
- Creator is slightly better because it lacks the progress bar + MiniStatsBar (replaced by swatch strip which is functionally essential)

### Comparison to Tracker Proposal B (accepted)
- Tracker Proposal B: 164px chrome → 503px canvas
- Creator gap: 52px more chrome than proposed tracker
- To harmonise: merge ContextBar into Header (−36px) → 180px, still 16px above tracker target but justifiable given creator's need for the swatch strip

---

## 8. Duplication Map

| Feature | Appears In | Recommendation |
|---|---|---|
| Project name | Header badge + ContextBar + Project Tab | Keep Header badge, remove ContextBar duplicate |
| Colour count | ContextBar + Project Tab + palette chips header | Keep sidebar only |
| Dimensions | ContextBar + Project Tab + Sidebar Dimensions section | Keep sidebar only |
| Save | Header File menu + ContextBar button + Ctrl+S | Remove ContextBar duplicate |
| "Open in Tracker" action | ContextBar "Track ›" button + Export tab primary button | Keep Export tab, remove ContextBar duplicate |
| View mode | Sidebar View Toggle + keyboard shortcut V | No duplication issue — both access paths are valid |
| Colour selection | Swatch strip + Sidebar palette chips + Eyedropper + Context menu | All serve different spatial needs — no duplication issue |
| Creator tabs | Header dropdown + Sidebar tab bar | Keep both — Header provides quick switch from any scroll position, sidebar tabs are primary |

---

## 9. Relocation Candidates

| Element | Current Location | Proposed Location | Rationale |
|---|---|---|---|
| ContextBar | Second row, 36px | Merge fields into Header row | Same fix as Tracker Proposal B; reclaims 36px |
| Fabric count dropdown | Own collapsible section in sidebar | Merge into Dimensions section | Single dropdown doesn't warrant its own section |
| Diagnostics button | Main toolbar pill | Overflow menu (⋯) | Rare usage doesn't justify primary toolbar space |
| Zoom slider | Main toolbar pill | Keep ± and Fit in toolbar; move slider to overflow on narrow/touch | Slider is unusable on touch; ± are sufficient |
| Thread coverage slider | Nested inside Preview dropdown | Preview settings in sidebar or its own mini-section | Too deeply nested in a toolbar dropdown |
| Brush size (1/2/3) | Main toolbar pill | Inside brush group dropdown or overflow | Rarely changed after initial set |

---

*End of Component Inventory*
