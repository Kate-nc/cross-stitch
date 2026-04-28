# Creator Section — Comprehensive UI Inventory

> Generated from a deep codebase analysis of every source file that contributes to the Creator (`index.html`) page.

---

## Table of Contents

1. [Entry Point & Script Loading](#1-entry-point--script-loading)
2. [React Contexts](#2-react-contexts)
3. [Component Tree](#3-component-tree)
4. [State Variables (useCreatorState)](#4-state-variables-usecreatorstate)
5. [Header & Context Bar](#5-header--context-bar)
6. [ToolStrip — Toolbar](#6-toolstrip--toolbar)
7. [Sidebar — Right Panel](#7-sidebar--right-panel)
8. [Sidebar Tabs](#8-sidebar-tabs)
9. [Canvas Interaction Modes](#9-canvas-interaction-modes)
10. [Selection System](#10-selection-system)
11. [Modal Dialogs](#11-modal-dialogs)
12. [Context Menu](#12-context-menu)
13. [Toast Notifications](#13-toast-notifications)
14. [Diagnostics Panel](#14-diagnostics-panel)
15. [Split Pane System](#15-split-pane-system)
16. [Highlight Modes](#16-highlight-modes)
17. [Palette Swap System](#17-palette-swap-system)
18. [Substitute From Stash System](#18-substitute-from-stash-system)
19. [Keyboard Shortcuts](#19-keyboard-shortcuts)
20. [Export System](#20-export-system)
21. [Preview System](#21-preview-system)
22. [CSS Layout & Responsive Rules](#22-css-layout--responsive-rules)
23. [Derived / Computed Values](#23-derived--computed-values)

---

## 1. Entry Point & Script Loading

**File: `index.html`**

The Creator page loads React 18.2.0 + Babel Standalone 7.23.9 from CDN, plus pako for compression. Scripts are loaded in strict order via `<script>` tags:

```
constants.js → dmc-data.js → colour-utils.js → helpers.js → icons.js → import-formats.js
→ components.js → header.js → modals.js → threadCalc.js → project-storage.js
→ stash-bridge.js → backup-restore.js → home-screen.js → palette-swap.js → user-prefs.js
→ creator/bundle.js
```

`creator-main.js` is compiled and cached by Babel at runtime using `localStorage` cache keys (`CREATOR_CACHE_KEY`). Lazy-load helpers: `window.loadScript`, `window.loadPdfStack`, `window.loadCreatorMain`.

---

## 2. React Contexts

**File: `creator/context.js`**

| Context | Hook | Purpose |
|---------|------|---------|
| `GenerationContext` | `useGeneration()` | Image-to-pattern generation params & callbacks |
| `AppContext` | `useApp()` | UI housekeeping: tabs, modals, panels, toasts, refs, export, preview |
| `CanvasContext` | `useCanvas()` | Canvas rendering, zoom, view mode, interaction handlers, highlight, selection |
| `PatternDataContext` | `usePatternData()` | Pattern data, palette, dimensions, fabric, thread ownership, editing tools |

All four are provided by `CreatorApp` in `creator-main.js`. Every creator component consumes one or more of these.

---

## 3. Component Tree

**File: `creator-main.js`**

```
CreatorApp
├── CreatorErrorBoundary (error boundary wrapper)
│   └── GenerationContext.Provider
│       └── AppContext.Provider
│           └── CanvasContext.Provider
│               └── PatternDataContext.Provider
│                   ├── Header
│                   ├── ContextBar (project name/metadata bar)
│                   ├── CreatorToolStrip (toolbar — when pattern loaded & tab=pattern)
│                   ├── div.cs-main (main layout flex container)
│                   │   ├── div.canvas-area
│                   │   │   ├── CreatorPatternTab (tab=pattern)
│                   │   │   ├── CreatorProjectTab (tab=project)
│                   │   │   ├── CreatorLegendTab (tab=legend)
│                   │   │   └── CreatorExportTab (tab=export)
│                   │   └── CreatorSidebar (div.rpanel, 280px right panel)
│                   ├── NamePromptModal (conditional)
│                   ├── SharedModals.Help / About / Shortcuts / ThreadSelector (conditional)
│                   ├── CreatorContextMenu (right-click menu)
│                   ├── DiagnosticsPanel (floating panel)
│                   ├── MagicWandPanel (floating selection tools)
│                   ├── SubstituteFromStashModal (conditional)
│                   └── CreatorToastContainer (fixed bottom-right)
```

**Other top-level components:**

| Component | File | Description |
|-----------|------|-------------|
| `ComparisonSlider` | `creator-main.js` | Before/after image comparison with draggable split, auto-sweep, diff overlay, heatmap overlay, Alt+hover zoom lens |
| `HomeScreen` | `home-screen.js` | Dashboard when no project is active |
| `PatternCanvas` | `creator/PatternCanvas.js` | Interactive editable pattern canvas (base + overlay) |
| `CreatorPreviewCanvas` | `creator/PreviewCanvas.js` | WYSIWYG pixel preview with grid overlay |
| `CreatorRealisticCanvas` | `creator/RealisticCanvas.js` | Realistic stitch texture rendering (4 levels) |
| `CreatorSplitPane` | `creator/SplitPane.js` | Side-by-side chart + preview pane |

---

## 4. State Variables (useCreatorState)

**File: `creator/useCreatorState.js` (~1100 lines)**

### 4a. Image & Upload

| Variable | Default | Description |
|----------|---------|-------------|
| `img` | `null` | Source image (HTMLImageElement) |
| `isUploading` | `false` | File upload in progress |
| `isDragging` | `false` | Drag-over indicator for file drop |

### 4b. Dimensions & Aspect

| Variable | Default | Description |
|----------|---------|-------------|
| `sW` | `80` | Pattern stitch width |
| `sH` | `80` | Pattern stitch height |
| `arLock` | `true` | Lock aspect ratio |
| `ar` | `1` | Aspect ratio value |

### 4c. Generation Parameters

| Variable | Default | Description |
|----------|---------|-------------|
| `maxC` | `30` | Max colours |
| `bri` | `0` | Brightness adjustment |
| `con` | `0` | Contrast adjustment |
| `sat` | `0` | Saturation adjustment |
| `dith` | `false` | Floyd-Steinberg dithering |
| `skipBg` | `false` | Skip background colour |
| `bgTh` | `15` | Background tolerance |
| `bgCol` | `[255,255,255]` | Background colour |
| `pickBg` | `false` | Background colour picker mode |
| `minSt` | `0` | Min stitches per colour |
| `smooth` | `0` | Smoothing strength (0-4) |
| `smoothType` | `"median"` | Smoothing type (median/gaussian) |
| `orphans` | `0` | Remove orphan clusters (0-3) |
| `allowBlends` | `true` | Allow blended threads |

### 4d. Stitch Cleanup

| Variable | Default | Description |
|----------|---------|-------------|
| `stitchCleanup` | `{enabled:true, strength:"balanced", protectDetails:true, smoothDithering:true}` | Post-generation cleanup settings |
| `cleanupDiff` | `null` | Visual diff data for cleanup preview |
| `showCleanupDiff` | `false` | Toggle cleanup diff visualisation |

### 4e. Pattern Data

| Variable | Default | Description |
|----------|---------|-------------|
| `pat` | `null` | Flat pattern array (length w×h) |
| `pal` | `null` | Palette array |
| `cmap` | `null` | Colour map (id → entry) |
| `busy` | `false` | Generation in progress |
| `origW` | `null` | Original image width |
| `origH` | `null` | Original image height |

### 4f. Fabric & Floss

| Variable | Default | Description |
|----------|---------|-------------|
| `fabricCt` | `14` | Fabric count |
| `skeinPrice` | `DEFAULT_SKEIN_PRICE` (£0.95) | Price per skein |
| `stitchSpeed` | `40` | Stitches per hour for time estimates |

### 4g. UI State

| Variable | Default | Description |
|----------|---------|-------------|
| `tab` | `"pattern"` | Active sidebar tab |
| `sidebarOpen` | `true` | Right panel visibility |
| `loadError` | `null` | Error message for file load failures |
| `copied` | `false` | "Copied!" feedback state |
| `modal` | `null` | Active modal name |
| `view` | `"color"` | Canvas view mode (color/symbol/both) |
| `zoom` | `1` | Zoom level |
| `hiId` | `null` | Highlighted colour ID |
| `showCtr` | `true` | Show centre lines |
| `showOverlay` | `false` | Show source image overlay |
| `overlayOpacity` | `0.3` | Source overlay opacity |
| `shortcutsHintDismissed` | — | Keyboard shortcuts hint banner |

### 4h. Preview State

| Variable | Default | Description |
|----------|---------|-------------|
| `previewActive` | `false` | Preview mode on |
| `previewShowGrid` | `false` | Preview grid overlay |
| `previewFabricBg` | `false` | Cream Aida background |
| `previewMode` | `"pixel"` | Preview type (pixel/realistic) |
| `realisticLevel` | `2` | Realistic render level (1-4) |
| `coverageOverride` | `null` | Manual thread coverage |

### 4i. Split Pane

| Variable | Default | Description |
|----------|---------|-------------|
| `splitPaneEnabled` | — | Side-by-side mode |
| `splitPaneRatio` | `0.5` | Divider position |
| `splitPaneSyncEnabled` | `true` | Synchronise scroll |
| `rightPaneMode` | `"level2"` | Right pane render mode |

### 4j. Section Open States (sidebar accordion)

| Variable | Default | Description |
|----------|---------|-------------|
| `dimOpen` | — | Dimensions section |
| `palOpen` | — | Palette section |
| `fabOpen` | — | Fabric & Floss section |
| `adjOpen` | — | Adjustments section |
| `bgOpen` | — | Background section |
| `palAdvanced` | — | Palette advanced toggle |
| `cleanupOpen` | — | Stitch cleanup section |

### 4k. Editing Tools

| Variable | Default | Description |
|----------|---------|-------------|
| `activeTool` | `null` | Active tool: `null`, `"paint"`, `"fill"`, `"eyedropper"`, `"backstitch"`, `"eraseBs"`, `"magicWand"`, `"lasso"` |
| `brushMode` | `"paint"` | Brush sub-mode: `"paint"`, `"fill"`, `"eraseAll"` |
| `brushSize` | `1` | Brush radius (1/2/3) |
| `selectedColorId` | `null` | Currently selected palette colour |
| `hoverCoords` | `null` | Mouse position on canvas |
| `editHistory` | `[]` | Undo stack (delta-based) |
| `redoHistory` | `[]` | Redo stack |

### 4l. Backstitch

| Variable | Default | Description |
|----------|---------|-------------|
| `bsLines` | `[]` | Array of backstitch line segments |
| `bsStart` | `null` | Current backstitch start point |
| `bsContinuous` | `false` | Chain backstitch mode |

### 4m. Partial Stitches

| Variable | Default | Description |
|----------|---------|-------------|
| `partialStitches` | `Map()` | Map<index, {TL,TR,BL,BR}> for quarter/half/¾ stitches |
| `partialStitchTool` | `null` | Active partial stitch tool: `"quarter"`, `"half-fwd"`, `"half-bck"`, `"three-quarter"` |

### 4n. Crop

| Variable | Default | Description |
|----------|---------|-------------|
| `isCropping` | `false` | Crop mode active |
| `cropRect` | `null` | Current crop rectangle |
| `cropStartRef` | ref | Crop drag start |
| `cropRef` | ref | Crop overlay ref |

### 4o. Export

| Variable | Default | Description |
|----------|---------|-------------|
| `exportPage` | — | Current export page number |
| `pageMode` | — | A4 multi-page mode |
| `pdfDisplayMode` | `"color_symbol"` | PDF chart mode |
| `pdfCellSize` | `3` | PDF cell size |
| `pdfSinglePage` | `false` | Single-page PDF |

### 4p. Tracking (used when Creator has tracking data)

| Variable | Default | Description |
|----------|---------|-------------|
| `done` | `null` | Done array (Uint8Array) |
| `parkMarkers` | `[]` | Parking markers |
| `hlRow` / `hlCol` | — | Highlight row/column guides |
| `totalTime` | `0` | Total tracked time |
| `sessions` | `[]` | Session history |

### 4q. Scratch Mode

| Variable | Default | Description |
|----------|---------|-------------|
| `isScratchMode` | `false` | Scratch (blank grid) mode |
| `scratchPalette` | — | User-built scratch palette |
| `dmcSearch` | — | DMC search string |
| `colPickerOpen` | — | Colour picker panel |

### 4r. Thread Organiser

| Variable | Default | Description |
|----------|---------|-------------|
| `threadOwned` | `{}` | Thread ownership status map |
| `globalStash` | `{}` | Cross-database stash data |
| `kittingResult` | `null` | Kit check results |
| `altOpen` | `null` | Stash alternatives panel (thread ID) |

### 4s. Stash-Constrained Generation

| Variable | Default | Description |
|----------|---------|-------------|
| `stashConstrained` | `false` | Restrict palette to owned threads |
| `substituteModalOpen` | `false` | Substitute modal visible |
| `substituteProposal` | `null` | Substitution analysis results |
| `substituteModalKey` | — | Re-render key for modal |
| `substituteMaxDeltaE` | — | Max colour distance for substitutions |

### 4t. Variation & Gallery

| Variable | Default | Description |
|----------|---------|-------------|
| `variationSeed` | — | Random seed for palette variation |
| `variationSubset` | — | Subset of colours to vary |
| `variationHistory` | — | History of seed states |
| `gallerySlots` | — | Gallery thumbnail slots |
| `galleryOpen` | — | Gallery panel state |

### 4u. Highlight Modes

| Variable | Default | Description |
|----------|---------|-------------|
| `highlightMode` | `"isolate"` | Active highlight mode |
| `bgDimOpacity` | `0.20` | Background dim level |
| `bgDimDesaturation` | `0.80` | Background desaturation |
| `hiAdvanced` | — | Advanced highlight controls open |
| `tintColor` | `"#FFD700"` | Tint overlay colour |
| `tintOpacity` | `0.40` | Tint overlay opacity |
| `spotDimOpacity` | `0.15` | Spotlight dim level |
| `dimFraction` | — | Animated dim factor (0→1) |
| `dimHiId` | — | Render-time highlight ID |
| `antsOffset` | — | Marching ants animation offset |

### 4v. Diagnostics

| Variable | Default | Description |
|----------|---------|-------------|
| `diagnosticsOpen` | — | Panel visible |
| `diagnosticsEnabled` | `{confetti:false, heatmap:false, readability:false}` | Per-diagnostic toggle |
| `diagnosticsSettings` | — | Per-diagnostic threshold/config |
| `diagnosticsResults` | — | Computed diagnostic data |

### 4w. Project Identity

| Variable | Default | Description |
|----------|---------|-------------|
| `projectName` | — | Project display name |
| `namePromptOpen` | — | "Name Your Project" modal |
| `projectIdRef` | ref | Persistent project ID |
| `createdAtRef` | ref | Creation timestamp |

### 4x. Coverage Gaps

| Variable | Default | Description |
|----------|---------|-------------|
| `coverageGaps` | `null` | Colour gap analysis for stash-constrained mode |

### 4y. Eyedropper

| Variable | Default | Description |
|----------|---------|-------------|
| `eyedropperEmpty` | `false` | Flash when sampling empty cell |

### 4z. Context Menu

| Variable | Default | Description |
|----------|---------|-------------|
| `contextMenu` | `null` | `{x, y, gx, gy}` for right-click menu |

### 4aa. Toasts

| Variable | Description |
|----------|-------------|
| `toasts` | Array of active toast notifications |
| `addToast(msg, opts)` | Create toast (type: info/success/warning/error) |
| `dismissToast(id)` | Remove toast |

---

## 5. Header & Context Bar

**Files: `header.js`, `styles.css`**

### Header (`<header class="tb-topbar">`)

| Element | Description |
|---------|-------------|
| **Logo** | "StitchCraft" brand, click → home screen |
| **App nav tabs** | `Create` / `Track` / `Stash` / `Stats` / `Embroidery (BETA)` — navigation between HTML pages |
| **Active project badge** | Shows project name + completion % in a pill badge, inline-editable |
| **Creator tab dropdown** | `Pattern` / `Project` / `Threads` / `Export` — switches sidebar tab |
| **File menu dropdown** | Open / Save / New / Backup / Restore actions |
| **Help/About/Shortcuts** | Menu items launch modals |

### Context Bar (`<div class="tb-context-bar">` — 36px below header)

| Element | Description |
|---------|-------------|
| **Project name** | Inline-editable (click to rename, 60 char max) |
| **Dimensions** | `80×80` format |
| **Colour count** | `"15 colours"` |
| **Progress bar** | Thin bar with percentage (when tracking data exists) |
| **Action buttons** | "Track ›" (primary), "Save", "Edit Pattern" (from tracker) |

---

## 6. ToolStrip — Toolbar

**File: `creator/ToolStrip.js` (~640 lines)**

Renders as `<div class="toolbar-row">` containing a `<div class="pill-row">` with a `<div class="pill">` capsule. Only visible when `pat && pal && tab === "pattern"`.

### Row 1: Main Pill

| Group | Buttons | Shortcuts |
|-------|---------|-----------|
| **Brush tools** | Paint (P), Fill (F), Erase (5), Eyedropper/Pick (I) | P, F, 5, I |
| **Stitch type dropdown** | Cross (1), ¼ Stitch, Half / (2), Half \\ (3), ¾ Stitch, Backstitch (4) | 1, 2, 3, 4 |
| **Brush size** | 1, 2, 3 (shown for cross/half paint or erase) | — |
| **Backstitch continuous** | Checkbox (chain mode) | — |
| **Selection tools dropdown** | Magic Wand (W), Freehand lasso, Polygon lasso, Magnetic lasso, Clear selection | W |
| **Colour chip** | Shows selected colour info: DMC ID + swatch | — |
| **Zoom** | Range slider (0.05–3×), percentage label, "Fit" button | +/−/0 |
| **Undo / Redo** | ↩ / ↪ | Ctrl+Z / Ctrl+Y |
| **Preview dropdown** | Chart / Pixel preview / Realistic; Grid overlay; Fabric background; Realistic levels 1-4; Thread coverage slider (Sparse/Standard/Dense/Full) | — |
| **Split view** | Toggle split pane | \\ |
| **Diagnostics** | Toggle diagnostics panel | — |
| **Overflow ⋯** | Overlay toggle + opacity slider; collapsed brush options | — |

### Row 2: Swatch Strip (`<div class="swatch-strip-row">`)

Horizontal scrollable strip of colour swatches sorted by usage count. First 20 shown initially, expand button reveals all. Click to select paint colour.

### Responsive Behaviour

- `ResizeObserver` collapses brush group at `<680px`
- Backstitch controls collapse at `<550px`
- Collapsed items move to overflow menu
- `@media(pointer:coarse)` hides desktop-only items, shows FAB undo button

### SVG Icons (defined in ToolStrip.js)

`svgX` (cross), `svgFwd` (half /), `svgBck` (half \\), `svgQtr` (quarter), `svgThreeQtr` (¾), `svgErase`, `svgWand`, `svgFreehand`, `svgPolygon`, `svgMagnetic`, `svgSplit`, `svgDiag`

---

## 7. Sidebar — Right Panel

**File: `creator/Sidebar.js` (~1000 lines)**

The sidebar renders as `<div class="rpanel">` — 280px, sticky, scrollable. Always visible. Contains:

### Top: Tab Bar (`<div class="rp-tabs">`)

4 tabs: **Pattern** | **Project** | **Threads** | **Export**

### Palette Chips Section

Colour swatches at top of sidebar. Click to select paint colour (when pattern tab) or to highlight colour. In scratch mode: DMC search + add/remove colour buttons.

### View Toggle

Three buttons: **Colour** / **Symbol** / **Both** — switches canvas rendering mode.

### Image Card

Shows source image thumbnail with **Crop** and **Change** buttons. Background pick indicator shown when in `pickBg` mode.

### Collapsible Sections (accordion pattern using `Section` component)

Each uses controlled `isOpen` / `onToggle` props persisted to state:

| Section | Key Controls |
|---------|-------------|
| **Dimensions** | Lock AR checkbox, size slider or W/H inputs (10–300) |
| **Palette** | Max colours slider (10–40), Allow blended threads, Use only stash threads, Quick-add to stash, Randomise + seed, Explore variations gallery, Min stitches/colour, Remove Orphans (0–3), Dithering (Direct/Dithered) |
| **Stitch Cleanup** | Toggle on/off, Strength slider (Gentle/Balanced/Thorough), Protect fine details, Smooth dithering, Cleanup diff visualisation |
| **Fabric & Floss** | Fabric count dropdown (`FABRIC_COUNTS`: 14/16/18/20/22/28 ct) |
| **Adjustments** | Smooth (0-4, Median/Gaussian), Brightness/Contrast/Saturation sliders |
| **Background** | Skip background checkbox, BG colour picker, Tolerance slider, Auto-Crop to Stitches |
| **Palette Swap** | Hue shift section + Preset palettes section (see §17) |

### Bottom: Generate Button

- **Generate Pattern** / **Regenerate** — triggers worker-based pattern generation
- **Reset Canvas** — in scratch mode

---

## 8. Sidebar Tabs

### Pattern Tab — `CreatorPatternTab`

**File: `creator/PatternTab.js` (~300 lines)**

Main canvas area. Contains:

| Element | Description |
|---------|-------------|
| **Modifier key tracker** | Shift/Alt indicators for selection tools |
| **Status text** | Context-sensitive tool hints (e.g. "Click to select, Shift to add") |
| **Shortcuts hint banner** | "Press ? for keyboard shortcuts" (dismissable) |
| **Confetti cleanup warning** | Banner when high confetti detected |
| **Canvas container** | Scrollable, renders `PatternCanvas`, `PreviewCanvas`, or `RealisticCanvas` |
| **Split pane mode** | Uses `CreatorSplitPane` when `splitPaneEnabled` |
| **Highlight mode controls** | Segmented control: Isolate / Outline / Tint / Spotlight, with per-mode settings |
| **Status bar** | Tool hint + grid coordinates + colour-under-cursor |
| **Undo/Redo/Clear highlight** | Bottom action buttons |

### Project Tab — `CreatorProjectTab`

**File: `creator/ProjectTab.js` (~500 lines)**

| Section | Contents |
|---------|----------|
| **Pattern Summary** | Grid dimensions, total stitchable count, difficulty badge (1-4 stars), stitchability/confetti score, progress % |
| **Time Estimate** | Stitching speed slider, total & remaining time display |
| **Finished Size** | Table showing each fabric count with physical dimensions |
| **Cost Estimate** | Price per skein input, total cost calculation |
| **Thread Organiser** | Owned/to-buy counts, per-thread list with swatch + DMC ID + skeins, "Own all" / "Clear" bulk actions, stash badge (X/Y in stash), "≈" button for similar-from-stash, "Substitute from Stash" button, "Kit This Project" button, kitting result display, "Copy To-Buy List" / "Copy Full List" buttons, "Mark all To Buy" (sends to Stash Manager) |

### Legend Tab — `CreatorLegendTab`

**File: `creator/LegendTab.js` (~200 lines)**

| Element | Description |
|---------|-------------|
| **Fabric count selector** | Dropdown to change calculation basis |
| **Total skeins** | Summary count |
| **Thread table** | Columns: Symbol, Colour swatch, DMC ID, Name, Type (Solid/Blend), Stitches, Skeins, Done (if tracking) |
| **Row click** | Highlights that colour on pattern tab |
| **Confetti indicator** | Per-colour confetti stitch count |

### Export Tab — `CreatorExportTab`

**File: `creator/ExportTab.js` (~200 lines)**

| Element | Description |
|---------|-------------|
| **Open in Stitch Tracker** | Primary action button (green) |
| **PDF Export** | Chart mode: Color+Symbols / Symbols Only / Color Blocks; Cell size: Small / Medium / Large; Single Page checkbox; "Download Pattern PDF" + "Cover Sheet PDF" buttons |
| **PNG Chart** | A4 pages toggle with page navigation, canvas preview |
| **Save/Load** | Save (.json) and Load (.json) buttons |

---

## 9. Canvas Interaction Modes

**File: `creator/useCanvasInteraction.js` (~400+ lines)**

### Tools & Modes

| Tool | Activator | Click Behaviour | Drag Behaviour |
|------|-----------|----------------|----------------|
| `paint` | P key or toolbar | Set single cell | Brush stroke (radius 1/2/3), selection-mask-aware |
| `fill` | F key or toolbar | Flood fill from click point | — |
| `eraseAll` | 5 key or toolbar | Erase single cell → `__empty__` | Brush-erase drag |
| `eyedropper` | I key or toolbar | Sample colour from cell | — |
| `backstitch` | 4 key or toolbar | Set start → set end → line | Chain with `bsContinuous` |
| `eraseBs` | Toolbar | Remove nearest BS line | — |
| `magicWand` | W key or toolbar | Select contiguous/global by colour | — |
| `lasso` | Toolbar dropdown | Start lasso selection | Freehand/polygon/magnetic gesture |
| `quarter` | Stitch type | Place ¼ stitch in hit-tested quadrant | — |
| `half-fwd` | Stitch type | Place half / stitch (BL+TR quadrants) | Drag series |
| `half-bck` | Stitch type | Place half \\ stitch (TL+BR quadrants) | Drag series |
| `three-quarter` | Stitch type | Place ¾ stitch (3 quadrants) | — |
| — | Alt+click | Temporary eyedropper (any tool) | — |

### Touch Handling

| Gesture | Handler |
|---------|---------|
| **Pinch-to-zoom** | `startPinchGesture` / `updatePinchGesture` |
| **Pan** | Single-finger drag (when no tool active) |
| **Long press** | 500ms timer → context menu |
| **Pointer coalescing** | Drag changes batched via `dragChangesRef` |

### Canvas Rendering

**File: `creator/PatternCanvas.js` (~200 lines)**

- Base layer: full pattern cached as `ImageData`, re-rendered on content changes
- Overlay layer: hover/selection drawn every frame, RAF-coalesced
- Marching ants animation: for highlight outline mode + selection mask
- Delegated pointer events: `onPointerDown/Up/Move/Leave/Cancel`

**File: `creator/canvasRenderer.js` (~300+ lines)**

Core rendering function: `drawPatternOnCanvas(ctx2d, offX, offY, dW, dH, cSz, gut, state)`

Renders: cells (colour/symbol/both), grid lines (minor every 1, major every 10), axis labels, checkerboard for empty/skip cells, source image overlay, backstitch lines, partial stitches, selection mask, highlight effects (all 4 modes), hover indicator, brush size preview.

---

## 10. Selection System

### Magic Wand — `useMagicWand`

**File: `creator/useMagicWand.js` (~300+ lines)**

| State | Default | Description |
|-------|---------|-------------|
| `selectionMask` | `null` | `Uint8Array(w×h)` — 1=selected, 0=not |
| `wandTolerance` | `0` | Lab ΔE tolerance for colour matching |
| `wandContiguous` | `true` | Flood (BFS) vs global scan |
| `wandOpMode` | `"replace"` | replace / add / subtract / intersect |
| `wandPanel` | `null` | Active sub-panel: confetti / reduce / replace / stitch-info / outline |

**Operations (via MagicWandPanel):**

| Operation | Description |
|-----------|-------------|
| **Confetti cleanup** | Min cluster size slider → preview flagged → apply (replace with neighbor majority) |
| **Reduce colours** | Target count → merge similar → apply |
| **Replace colour** | Source → Dest colour, optional fuzzy tolerance |
| **Stitch info** | Statistics for selected area |
| **Outline** | Generate backstitch outline around selection boundary |
| **Deselect / Invert / Select All** | Mask operations |

### Lasso Select — `useLassoSelect`

**File: `creator/useLassoSelect.js` (~350+ lines)**

| Sub-mode | Gesture |
|----------|---------|
| `freehand` | Click-drag paints cells directly |
| `polygon` | Click anchors → close near start → ray-cast fill |
| `magnetic` | Click anchors → A* cost-minimal path following colour edges → close → fill |

Magnetic path uses `edgeStrength` (LAB ΔE to neighbours) as cost, heuristic A* with binary min-heap, bounded search window.

---

## 11. Modal Dialogs

**File: `modals.js`**

| Modal | Trigger | Contents |
|-------|---------|----------|
| `SharedModals.Help` | "?" or menu | User guide: Pattern Creator, Pattern Editing, Stitch Tracker, Saving & Exporting sections |
| `SharedModals.About` | Menu | App description, privacy note ("no data uploaded"), tech list, version |
| `SharedModals.Shortcuts` | ? key | Keyboard shortcut reference, Creator-specific and Tracker-specific sections, "Reset preview preferences" button |
| `SharedModals.ThreadSelector` | Click symbol in legend | DMC thread search, "In Use" swap offer, "Use anyway" for unknown IDs |
| `NamePromptModal` | First save | Text input for project name, 60 char max |

All modals use `<div class="modal-overlay">` + `<div class="modal-content">` pattern, close on overlay click and Escape key.

---

## 12. Context Menu

**File: `creator/ContextMenu.js` (~200 lines)**

Triggered by right-click on canvas. Positioned at mouse coordinates with viewport clamping.

| Item | Action |
|------|--------|
| **Header** | Shows cell colour info (DMC + name) or "Empty cell (x,y)" |
| Pick this colour | Set `selectedColorId` to cell's colour |
| Switch to fill tool | Activate fill mode |
| Select similar (wand) | Magic wand select all cells matching this colour |
| Select all of this colour | Exact colour match across entire pattern |
| Highlight this colour | Set `hiId`; or "Remove highlight" if already highlighted |
| Stitch info | Open stitch info panel for this colour |

---

## 13. Toast Notifications

**File: `creator/Toast.js` (~60 lines)**

Component: `CreatorToastContainer` — fixed position bottom-right, stacks vertically.

| Type | Icon | Colour Scheme |
|------|------|---------------|
| `info` | ℹ | Blue |
| `success` | ✓ | Green |
| `warning` | ⚠ | Amber |
| `error` | ✕ | Red |

Auto-dismiss with configurable `duration` (default varies). Click × to dismiss manually.

---

## 14. Diagnostics Panel

**File: `creator/DiagnosticsPanel.js` (~300 lines)**

Floating panel toggled from ToolStrip "Diag" button.

| Diagnostic | Controls | Output |
|-----------|----------|--------|
| **Confetti** | Threshold slider, toggle on/off | Score, per-colour breakdown of isolated stitches |
| **Heatmap** | Block size (5/10/20), metric (colorcount/fragmentation), toggle | Distribution histogram, colour-coded overlay |
| **Readability** | Toggle on/off | Contrast ratio analysis, fail/warn counts, problem colour pairs |

Each diagnostic has a `ToggleSwitch` on/off control. Results computed by `diagnosticsEngine.js` with 500ms debounce.

---

## 15. Split Pane System

**File: `creator/SplitPane.js` (~200+ lines)**

Component: `CreatorSplitPane` — side-by-side view.

| Feature | Description |
|---------|-------------|
| **Draggable divider** | Ratio persisted to `UserPrefs` |
| **Narrow mode** | `<560px` → stacked layout |
| **Scroll sync** | Debounced RAF synchronisation between panes |
| **Right pane modes** | WYSIWYG pixel, Realistic Level 1/2/3 |
| **Exit threshold** | Dragging divider past edge exits split mode |
| **Toggle** | `\` key or ToolStrip button |

---

## 16. Highlight Modes

Four mutually exclusive modes controlled from PatternTab when `hiId` is set:

| Mode | Visual Effect | Controls |
|------|--------------|----------|
| **Isolate** | Dim + desaturate non-highlighted cells | `bgDimOpacity` (0–1), `bgDimDesaturation` (0–1) |
| **Outline** | Marching ants border around selected colour | Animated dash offset |
| **Tint** | Coloured overlay on highlighted cells | `tintColor` (hex), `tintOpacity` (0–1) |
| **Spotlight** | Strong dim on non-highlighted + adaptive border + outer glow | `spotDimOpacity` (0–1) |

All modes support animated transitions via `dimFraction` (0→1) and all rendering is handled in `canvasRenderer.js` via `_resolveHighlight()` and `_drawCellHighlight()`.

---

## 17. Palette Swap System

**File: `palette-swap.js` (~500+ lines)**

Integrated via `usePaletteSwap` hook from `useCreatorState`.

### Hue Shift Section

Global hue rotation using OKLCH colour space. Slider controls hue shift in degrees.

### Preset Palettes

14 colour palette presets, each with 3 tiers (8/16/24 colours):

| Category | Presets |
|----------|---------|
| **Nature** | Rocky coastline, Desert at dusk, Cherry blossom, Coral reef, Autumn woodland |
| **Weather** | Thunderstorm, Tropical sunrise |
| **Cultural** | Victorian garden, Japanese ukiyo-e, Moroccan tiles, Folk art, Nordic knit |
| **Food** | Patisserie, Coffee shop, Spice market |
| **Textile** | Gingham picnic |

Colour conversion pipeline: `rgbToOklab` → `oklabToOklch` → shift → `oklchToOklab` → `oklabToRgb`

---

## 18. Substitute From Stash System

**File: `creator/SubstituteFromStashModal.js` (~300+ lines)**

### Analysis Engine — `analyseSubstitutions()`

Analyses unowned threads and proposes stash substitutions:

1. Build stash candidate list (owned > 0)
2. For each unowned thread: find top 5 candidates within `maxDeltaE`
3. Prefer candidates with sufficient skeins
4. Resolve duplicate targets (`_resolveDuplicateTargets`)
5. Enforce pairwise contrast constraints (`_enforceContrastConstraints`)

### Substitution Statuses

| Status | Meaning |
|--------|---------|
| `exact` | Same thread in stash |
| `close` | ΔE ≤ 5 |
| `moderate` | ΔE ≤ 10 |
| `distant` | ΔE ≤ 15 |
| `conflict` | Duplicate target, unresolvable |

### UI: `SubstituteFromStashModal`

- Before/after colour swatches
- Per-substitution approval with alternative candidates
- Contrast warnings with conflicting thread IDs
- `renderSubstitutionPreview()` — live pixel-per-stitch thumbnail with remap applied

---

## 19. Keyboard Shortcuts

**File: `creator/useKeyboardShortcuts.js` (~100 lines)**

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+S` | Save project |
| `Ctrl+A` | Select all |
| `Ctrl+Shift+I` | Invert selection |
| `Escape` | Cascading dismiss: name prompt → modal → overflow → lasso → selection → backstitch → tool → highlight → colour |
| `?` | Shortcuts modal |
| `1` | Cross stitch (or highlight mode 1 when highlighting) |
| `2` | Half stitch / (or highlight mode 2) |
| `3` | Half stitch \\ (or highlight mode 3) |
| `4` | Backstitch (or highlight mode 4) |
| `5` | Erase |
| `W` | Magic wand |
| `P` | Paint |
| `F` | Fill |
| `I` | Eyedropper |
| `V` | Cycle view mode (color → symbol → both) |
| `\` | Toggle split pane |
| `+` / `-` | Zoom in / out |
| `0` | Fit zoom |

---

## 20. Export System

### PDF Export — `creator/exportPdf.js`

**File: `creator/exportPdf.js` (~200+ lines)**

Lazy-loads `jsPDF` on first use. Generates:

| Output | Contents |
|--------|----------|
| **Cover sheet** | Pattern thumbnail, dimensions, thread count, partial stitch count, progress %, time spent, thread list with owned/to-buy status, notes lines |
| **Thread legend page** | Symbol, colour swatch, DMC ID, name, stitches, length (m), skeins; backstitch legend |
| **Chart pages** | Multi-page grid with axis labels, support for Color+Symbols / Symbols Only / Color Blocks modes |

### JSON Save/Load — `creator/useProjectIO.js`

**Project format version 10.** Saves:

Pattern array, palette, settings (all generation params), backstitch lines, partial stitches (serialised Map), done array, park markers, sessions, thread ownership, project name/ID/timestamps, saved zoom level.

`handleOpenInTracker`: Serialises project → `localStorage` handoff (or pako-compressed URL hash for smaller patterns) → navigates to `stitch.html`.

---

## 21. Preview System

**File: `creator/usePreview.js`, `creator/PreviewCanvas.js`, `creator/RealisticCanvas.js`**

### usePreview Hook

Debounced preview generation: fast non-dithered pass → full dithered pass. `MAX_PREVIEW_AREA = 40000`. Geometric cache for image drawing.

### PreviewCanvas (WYSIWYG)

- Offscreen 1px-per-stitch → upscaled to display at zoom level
- Grid overlay: minor (1px apart) + major (every 10)
- Fabric background: cream Aida vs white
- Status bar: dimensions + colour count

### RealisticCanvas (4 levels)

| Level | Rendering |
|-------|-----------|
| **1** | Flat colour X crosses |
| **2** | Cylindrical gradient shading per leg |
| **3** | Procedural thread texture — per-strand twisted fibres with halo + solid passes |
| **4** | Blend per-segment Z-order — crossing-point detection, alternating front/back strand drawing |

Thread coverage derived from fabric count + strand count, with manual override slider. Cell size capped at 16px (levels 1-2) or 32px (levels 3-4), max canvas 8192px.

### ComparisonSlider

**File: `creator-main.js`**

Before/after comparison with:
- Draggable split position
- Auto-sweep toggle (animated panning)
- Alt+hover → zoom lens
- Diff overlay (pixel-difference heatmap)
- Heatmap overlay

---

## 22. CSS Layout & Responsive Rules

**File: `styles.css`**

### Main Layout Classes

| Class | Properties |
|-------|-----------|
| `.tb-topbar` | `position:sticky; top:0; z-index:100; height:48px` — top navigation |
| `.tb-topbar-inner` | `max-width:1300px; margin:0 auto; display:flex; align-items:center` |
| `.toolbar-row` | `position:sticky; top:48px; z-index:99; flex-direction:column` — tool strip |
| `.pill-row` | `height:52px; display:flex; align-items:center; justify-content:center` |
| `.pill` | `display:inline-flex; border-radius:14px; padding:4px; box-shadow` — capsule toolbar |
| `.swatch-strip-row` | `height:36px; overflow-x:auto; scrollbar-width:none` |
| `.cs-main` | `display:flex; flex:1; min-height:0` — main content area |
| `.canvas-area` | `flex:1; min-width:0; overflow-y:auto` |
| `.rpanel` | `width:280px; position:sticky; top:128px; max-height:calc(100vh - 128px); overflow-y:auto` |
| `.rp-tabs` | `display:flex; border-bottom; position:sticky; top:0; z-index:10` |
| `.rp-tab` | `flex:1; font-size:11px; border-bottom:2px solid transparent` |
| `.tb-context-bar` | `height:36px; border-bottom` — project info bar |

### Responsive Breakpoints

| Breakpoint | Effect |
|-----------|--------|
| `@media(pointer:coarse)` | Hide `.tb-desktop-only`, show `.fab-undo` (fixed FAB), enlarge palette chips (44×44px min), enlarge touch targets |
| `@media(max-width: 599px)` | Home screen padding reduction, compact layouts |
| `@media(max-width: 399px)` | Further compact adjustments |
| `@media(min-width: 600px)` | Desktop-enhanced layouts for stats, context bars |
| `@media(prefers-reduced-motion: reduce)` | Disable animations |
| `ResizeObserver` in ToolStrip | Collapse brush group at `<680px`, backstitch controls at `<550px` |
| `SplitPane narrow mode` | `<560px` → stacked layout |

### CSS Variables (from `:root`)

`--surface`, `--surface-secondary`, `--surface-tertiary`, `--border`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent`, `--accent-hover`, `--accent-light`, `--accent-border`, `--radius-md`, `--shadow-sm`, `--shadow-md`

---

## 23. Derived / Computed Values

**From `useCreatorState` (all `useMemo`):**

| Value | Description |
|-------|-------------|
| `totalStitchable` | Count of non-skip, non-empty cells |
| `cs` | Cell size in pixels (based on zoom) |
| `skeinData` | Array of `{id, name, rgb, count, skeins, stitches}` per colour |
| `totalSkeins` | Sum of all skeins needed |
| `blendCount` | Number of blended colours in palette |
| `difficulty` | 1-4 star difficulty rating |
| `doneCount` | Stitches marked complete |
| `dmcFiltered` | DMC entries filtered by search |
| `displayPal` | Palette sorted for display |
| `progressPct` | Completion percentage |
| `colourDoneCounts` | Per-colour completion counts |
| `stitchType` | Current stitch type string |
| `ownedCount` / `toBuyCount` / `toBuyList` | Thread ownership summaries |
| `stashThreadCount` | Number of threads in stash |
| `effectiveMaxC` | `maxC` capped by stash size when constrained |
| `stashPalette` | Stash entries as palette array |
| `blendsAutoDisabled` | Blends disabled when stash < 6 threads |
| `effectiveAllowBlends` | Resolved blend permission |
| `fitZ` | Zoom level to fit pattern in viewport |
| `pxX` / `pxY` / `totPg` | A4 page coordinates for PDF export |

---

## Shared Components (from `components.js`)

| Component | Props | Description |
|-----------|-------|-------------|
| `Tooltip` | `text, children, width` | Hover/touch tooltip portal |
| `InfoIcon` | `text, width` | ⓘ icon with tooltip |
| `Section` | `title, children, isOpen, onToggle, defaultOpen, badge` | Collapsible accordion section |
| `SliderRow` | `label, value, min, max, step, onChange, suffix, format, helpText` | Labelled range slider with value display |
| `ProgressRing` | `percent, size` | SVG circular progress indicator |
| `MiniStatsBar` | session/goal tracking | Compact stats with progress ring, streak, daily goal |
| `OverviewCards` | stats data | Overview statistics grid |
| `NoteEditor` | `sessionId, currentNote, onSave` | Inline session note editor |
| `SessionTimeline` | `sessions, statsSettings, onEditNote` | Grouped session history |

---

*End of Creator UI Inventory*
