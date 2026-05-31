# Phase 1 Baseline — stitchx Current Capabilities

> Generated May 2026 from direct codebase inspection. Primary sources:
> `creator-main.js`, `creator/` module files, `tracker-app.js`,
> `manager-app.js`, `helpers.js`, `threadCalc.js`, `project-storage.js`,
> `sync-engine.js`, `backup-restore.js`, `import-formats.js`,
> `thread-conversions.js`, and all `reports/` audits.
>
> Quality ratings: **good** = works well, no known significant gaps;
> **partial** = present but incomplete/limited; **buggy** = present but has
> documented failures; **stub** = scaffolded but not functional.

---

## 1. Create — Image-to-Pattern

| Capability | Status | Notes |
|---|---|---|
| Image upload (drag-drop, file picker) | good | JPEG, PNG, GIF, BMP, WebP accepted; auto-downscaled to ≤4 Mpx |
| Image paste from clipboard | good | Handled by same `handleFile` funnel |
| EXIF orientation correction | good | Handled via `img.decode()` with fallback |
| Crop tool | good | Interactive drag-to-crop with auto-crop button; full `CropModal.js` |
| Rotate / flip | partial | Available only inside the Import Wizard (experimental flag); not in the main legacy sidebar |
| Aspect-ratio guide / lock | good | Free, 1:1, 4:3, 3:4, 16:9 in wizard; aspect-lock for width/height sliders |
| Brightness / contrast / saturation sliders | good | CSS filter; live preview at 300 ms debounce |
| Smoothing (Gaussian / median blur) | good | Radius 0–10 px; algorithm choice; live preview |
| Colour count control (max colours slider) | good | 2–100; live preview |
| Dithering modes | good | Off / weak / balanced / strong (Atkinson-based); Bayer 2×2, 4×4, 8×8 also available |
| Background removal | good | ΔE threshold against user-chosen colour; eyedropper pick |
| Min-stitches-per-colour (rarity removal) | good | 0–20 stitches; live preview |
| 2-thread blends | good | Opt-in; uses CIEDE2000 for blend matching |
| Confetti / orphan cleanup (pipeline) | good | Saliency + edge-aware; gentle/balanced/thorough; integrated into pipeline |
| Stash-constrained palette | good | Only threads marked owned in Stash Manager are used |
| Variation seeds / gallery | good | K-means seed control; multi-variation gallery for comparing outputs |
| Live preview with comparison slider | good | Original vs preview side-by-side with auto-sweep and magnifier |
| Diff overlay (changed cells highlight) | good | Orange overlay 1.5 s post-preview-update, auto-fade |
| Saliency heatmap overlay | good | Toggle during create mode |
| Re-generate CTA with edit count warning | good | Warns when manual edits exist before overwriting |
| Progress indication during generation | partial | Spinner with message, no per-step progress bar; pipeline is synchronous on main thread (worker exists but not yet hooked up) |
| OXS / KG-Chart XML import | good | `import-formats.js`; parses colour assignments and dimensions |
| JSON project import | good | Full round-trip; validates format/version; `pattern.length === w×h` validated |
| PDF pattern import (Pattern Keeper-compatible) | good | `pdf-importer.js`; reads PK format charts |
| Import Wizard (multi-step) | partial | 5-step wizard exists behind `experimental.importWizard` pref flag; step-4 live preview pane not yet live |
| Fabric count selection | good | Affects skein/time estimates; does not change pixel count |
| Skein / time estimate in create mode | buggy | `threadCalc.js` had a confirmed `×6` bug in usable skein length (bug C in size-calculator-diagnosis.md); fix status not confirmed in baseline |
| Confetti score display | good | Percentage and tier label shown in preview stats panel |

---

## 2. Create-from-Scratch

| Capability | Status | Notes |
|---|---|---|
| Blank grid initialisation | good | "Design from Scratch" card; `startScratch()` → `initBlankGrid()`; goes straight to edit mode |
| Configurable blank grid dimensions | partial | Defaults to 80×80; user sets dimensions before clicking "Design from Scratch" via the same Dimensions sidebar controls |
| Scratch palette (add threads manually) | good | `addScratchColour()`, `removeScratchColour()`; thread search by DMC number or name |
| Unrestricted painting on blank grid | good | All edit tools available immediately |

---

## 3. Cleanup / Denoise

### 3a. Lineart Cleanup Mode

| Capability | Status | Notes |
|---|---|---|
| Target-colour selection | good | Click-to-pick or colour-list dropdown |
| Tolerance slider | good | 0–100 maps to 0–30 ΔE |
| Sub-tool: brush | good | Brush radius 1–10; rAF-coalesced mask updates |
| Sub-tool: magic wand | good | Connected / all-matching modes |
| Auto-detect lineart | good | 4-phase worker algorithm; finds thin-stroke foreign-colour regions |
| Mask preview (orange overlay) | good | Live; shows pending mask before apply |
| Apply / cancel / undo | good | Atomic snapshot; undo history entry |

### 3b. Denoise Mode (Conversion-Noise Cleanup)

| Capability | Status | Notes |
|---|---|---|
| Threshold-based noise detection | partial | `useDenoiseMode` hook wired in `creator-main.js`; plan exists in `reports/conversion-noise-cleanup-plan.md`; implementation completeness not fully verified |
| Ops toggles (merge near-duplicates, remove speckle, fix edge fringes) | partial | State variables present; worker `noise-cleanup-worker.js` defined in plan |
| Brush / wand sub-tools | partial | Same shared helpers as lineart cleanup; implementation status uncertain |
| Dither warning | partial | `denoiseDitherWarning` state; dismissed by `dismissDitherWarning()` |

---

## 4. Edit

| Capability | Status | Notes |
|---|---|---|
| Paint (click/drag) | good | Brush sizes 1×1 to configurable; colour from palette |
| Flood fill | good | Contiguous same-colour fill |
| Erase | good | Sets cells to `__empty__` |
| Eyedropper | good | Picks colour from canvas cell |
| Backstitch lines | good | Click grid intersections; continuous mode; right-click cancel; undo-able |
| Backstitch erase | good | Dedicated erase mode for backstitch lines |
| Half stitches (/ and \) | good | Both diagonal directions; stored in `halfStitches` map |
| Three-quarter stitches | good | Stored in `partialStitches` map |
| Quarter stitches | good | Stored in `partialStitches` map |
| Zoom (slider, keyboard shortcuts) | good | `−` / `+` / `=` / `0`; pinch on touch |
| Pan (hand tool, space+drag) | good | |
| Undo / redo | good | 50-step history; Ctrl+Z / Ctrl+Y; duplicate in-canvas buttons |
| Magic wand selection | good | Tolerance slider; connected / all-matching; add/subtract/intersect modifier keys |
| Lasso selection (freehand, polygon, magnetic) | good | Three sub-modes; add/subtract/intersect |
| Confetti cleanup (selection-scoped) | good | Min cluster size slider, preview, apply |
| Colour reduction (selection-scoped) | good | Target colour count, merge preview |
| Colour replace (selection-scoped) | good | Source/dest picker; fuzzy mode |
| Colour replace (global) | good | `applyGlobalColourReplacement()`; `ColourReplaceModal.js` |
| Stitch info / export CSV | good | Per-selection colour breakdown; CSV export |
| Auto-outline (backstitch from selection boundary) | good | Thread picker, generate button |
| Source image overlay (transparency slider) | good | Toggle with `O` key; opacity slider |
| Canvas resize | good | `ResizeCanvasModal.js`; crops or expands with anchor point; preserves progress/backtitch/park markers |
| Colour highlight (isolate / outline / tint / spotlight) | good | Four modes; sliders for intensity |
| Symbol view / colour view / both view | good | Three rendering modes in edit toolbar |
| Grid / ruler display | good | Column/row numbers; configurable cell sizes |
| Palette management (add scratch colours, remove unused) | good | `addScratchColour`, `removeUnusedColours`; search by DMC ID or name |
| Palette swap (preset) | good | `palette-swap.js`; swap full palette to a preset |
| Thread adaptation modal | good | `AdaptModal.js`; adapt palette for owned threads or substitute thread |
| Park markers (creator side) | partial | Can set markers; not cleared by `removeUnusedColours` (documented bug E-3) |
| Coachmarks / onboarding hints | good | First-stitch and tools-tab-unlocked coachmarks |
| Keyboard shortcuts | good | Full set; `useKeyboardShortcuts.js`; command palette searchable |
| Context menu (right-click) | good | Select all of colour, add/remove from palette, etc. |

---

## 5. Track

| Capability | Status | Notes |
|---|---|---|
| Mark stitches done (click, drag) | good | Tap/drag on canvas; `useDragMark.js`; multi-cell drag marking |
| Unmark / toggle | good | Second click toggles |
| Row-by-row mode | good | Sequential row navigation with prev/next buttons |
| Focus block (spotlight) | good | Configurable block size (10×10, 20×20, custom W×H); dims outside area |
| Colour highlight (isolate / outline / tint / spotlight) | good | Same four modes as creator; `[ ]` to cycle colours; skip-completed option |
| Counting aids overlay | good | Run-length indicators (H/V/both); threshold filter (All/3+/5+/10+) |
| Ninja stitch highlight | good | Highlights isolated or hard-to-spot stitches |
| Symbol / colour / both view modes | good | `V` key; `[ ]` to switch layers |
| Zoom (slider, keyboard) | good | `−` / `+` / `0` (fit) |
| Layer visibility (half, backstitch, etc.) | good | Checkbox per layer: full/half/backstitch/quarter/petite/french_knot/long_stitch (defined, counts show 0 for non-full) |
| Session tracking (start / stop / pause) | good | Timer, stitches/session, stitches/hour speed |
| Session notes | good | Free-text note saved per session |
| Progress % and bar | good | Live; today segment shown separately |
| Progress popover (done/total, today, week, pace, remaining time) | good | "Progress info" chip |
| Copy progress summary | good | Text summary to clipboard |
| Realistic preview | good | Full-pattern photorealistic render in modal |
| Thread usage overlay (cluster / isolation heatmap) | good | Two modes |
| Breadcrumb trail | good | Overlay showing path of completed work |
| Next-block suggestions | good | AI-style cluster recommendations |
| Edit pattern in tracker (correction mode) | good | Inline edit tools; exit edit mode button; revert to original |
| Edit pattern → back to Creator | good | "Edit in Creator" button; full handoff with state preservation |
| Wake lock | good | Keeps screen on while stitching |
| Park markers | good | Per-colour; placement shown on canvas; toggle visibility by colour |
| Undo / redo | good | Stitch marking undo; separate undo for pattern edits |
| Pattern resize (in tracker via creator) | good | Via "Edit in Creator" → resize canvas |
| Focus mode (hide chrome) | good | `F` key; hides sidebar and toolbar for distraction-free view |
| Keyboard shortcuts | good | Full set including `T`/`N`/`R`/`P`/`F`/etc. |
| Command palette | good | Searchable action list |
| Per-project notes field | good | Designer name, description, free-text notes |
| Difficulty badge | good | Computed from stitch count and confetti ratio |
| Stitching style picker | good | 3-screen picker for personal style configuration |

---

## 6. Stash (Thread Inventory)

| Capability | Status | Notes |
|---|---|---|
| DMC thread inventory | good | All DMC threads; owned count per thread (integer skeins) |
| Anchor thread inventory | good | Full Anchor catalogue; brand filter toggle |
| DMC ↔ Anchor conversion lookup | good | `thread-conversions.js`; official charts cross-referenced; bidirectional |
| Partial skein tracking | partial | `partialStatus` field per thread; UI for marking partial; confirmed bug in partial-skein display (see `reports/stash-partial-skein-bug.md`) |
| Low-stock threshold / filter | good | Configurable per-user preference; "low stock" filter mode |
| "To buy" flag | good | Boolean flag per thread; filter mode |
| Bulk add threads | good | `BulkAddModal.js` |
| Thread search / filter / sort | good | Filter by owned/to-buy/low-stock; sort by number/colour/name/count; brand filter |
| Pattern library | good | Patterns sync'd from Creator; filter by all/wishlist/owned/in-progress/completed |
| Pattern filter states | good | Five filter states with per-filter default (user pref) |
| Shopping list (removed) | partial | Legacy `?tab=shopping` URL redirects to inventory; feature was removed |
| Stash-constrained generation (bridge) | good | `stash-bridge.js`; Creator reads owned threads from `stitch_manager_db` |
| Materials Hub (in Creator) | good | `creator/MaterialsHub.js`; kitting view, owned/to-buy per pattern |
| Thread cost estimate | good | Skein price configurable; total cost shown in create mode |

---

## 7. Size Calculator

| Capability | Status | Notes |
|---|---|---|
| Finished size table (by fabric count) | buggy | `ProjectTab.js`; 25-count evenweave incorrectly treated as Aida (stitch-over bug — see `reports/size-calculator-diagnosis.md` Failure A); margin hardcoded at 1″ each side (Failure B) |
| Over-2 evenweave toggle | partial | Checkbox in `PrepareTab.js` and `LegendTab.js`; correct formula (`calcFab`); **not** in the main `ProjectTab` finished-size table |
| Margin configuration | partial | User-configurable only in `PrepareTab`/`LegendTab`; hardcoded in `ProjectTab` |
| Thread/skein estimate | buggy | `threadCalc.js` `×6` bug inflates skeins by 6× (Failure C); assumptions: 315 in skein, configurable waste factor, configurable strands |
| Fabric cut size with margins | partial | Correct in `PrepareTab`/`LegendTab`; broken in `ProjectTab` for evenweave |
| Imperial / metric output | good | Both shown; cm and inches displayed side-by-side |

---

## 8. Persistence and Storage

| Capability | Status | Notes |
|---|---|---|
| Multi-project storage | good | `ProjectStorage` (IndexedDB `CrossStitchDB` v3); keyed by `proj_*` IDs |
| Project metadata index | good | `project_meta` store; lightweight mirror for list views |
| Active project pointer | good | `localStorage` `crossstitch_active_project` |
| Auto-save (5-second debounce) | good | Creator and Tracker; save status chip in header |
| Legacy single-project `auto_save` key | partial | Still maintained as fallback; write coordination inconsistent across call sites (bug S-1) |
| Stash database | good | Separate `stitch_manager_db` v1; pattern library mirror |
| Cross-database stash sync | good | `BroadcastChannel("cs-stash-changed")`; fired after every save |
| Full-database backup/restore | good | `backup-restore.js`; JSON export/import of all stores; validation present but incomplete (bug S-2) |
| File-based cross-device sync | good | `sync-engine.js`; `.csync` compressed files; passphrase-encrypted; designed for manual transfer via cloud drives |
| Service worker (PWA caching) | good | `sw.js`; offline capable; 10-min update poll |
| Project JSON format | good | v8 format; full round-trip with all stitch types |

---

## 9. Export / Import

| Capability | Status | Notes |
|---|---|---|
| PDF export (chart) | good | Worker-backed; Pattern Keeper-compatible preset; home-printing preset; B&W and colour chart modes; multi-page with overlap; cover page; info page; symbol index; mini legend per page |
| PDF page size options | good | A4, Letter, auto |
| PDF symbol assignment | good | Symbol legend included; `creator/LegendTab.js` |
| PDF workshop theme | partial | Opt-in via `creator.pdfWorkshopTheme` pref; not default |
| PNG export (pattern image) | partial | `exportFormat = "png"` option in `ExportTab.js`; full implementation not verified |
| JSON backup download | good | Explicit "Save project (.json)" export; Ctrl+S |
| OXS export | partial | OXS is a supported import format; OXS export not confirmed present |
| CSV export (colour/stitch breakdown) | good | From selection stitch-info panel |
| Designer branding in PDF | good | `DesignerBrandingSection.js`; logo, name, website |
| Page count preview before export | good | `PdfChartLayout.computePageGeometry()` |
| Pattern sharing (URL) | partial | `pako` (URL compression) loaded for URL-pattern support; full sharing flow not confirmed present |

---

## 10. Undo / History

| Capability | Status | Notes |
|---|---|---|
| Edit undo/redo (creator) | good | 50-step cap; Ctrl+Z/Y; edit count shown in Re-generate CTA |
| Stitch-mark undo/redo (tracker) | good | Separate history; park-marker placement NOT undoable (documented question E-7) |
| Canvas resize undo | good | `canvasResize` history entry type |
| Cleanup apply undo | good | Atomic snapshot entry |
| Regenerate wipes undo history | by design | Confirm dialog when `done` has 1s (bug INT-3 — fix status unconfirmed at baseline) |

---

## 11. Cross-Tab / Multi-Device

| Capability | Status | Notes |
|---|---|---|
| Creator ↔ Tracker handoff | good | Full save + `crossstitch_handoff_to_creator` key; trackerFieldsRef preservation |
| Same-browser two-tab conflict detection | partial | No detection; last-write-wins (documented bug INT-7; `BroadcastChannel` approach specced but not implemented) |
| Cross-device sync | good | `.csync` file-based; manual but functional |
| Stash cross-tab broadcast | good | `BroadcastChannel("cs-stash-changed")` |

---

## 12. Shared Infrastructure

| Capability | Status | Notes |
|---|---|---|
| Command palette | good | `command-palette.js`; per-page registered actions; keyboard-accessible |
| Keyboard shortcuts | good | `shortcuts.js`; full set across all pages; conflict detection in dev |
| Help drawer | good | `help-drawer.js`; per-page contextual help |
| Onboarding wizard | good | `onboarding-wizard.js`; per-page first-visit overlay; fails closed on localStorage error (bug S-3) |
| Toast notifications | good | `toast.js`; cap, auto-dismiss, queue; accessible `role="status"` |
| Preferences modal | good | `preferences-modal.js`; controls dithering, cleanup, blends, fabric, price, speed, stash defaults |
| Dark mode | good | `data-theme="dark"` tokens; user preference |
| Light/dark CSS theming | good | `styles.css` `:root` / `[data-theme="dark"]`; Workshop visual direction |
| Thread catalogue | good | Full DMC (`dmc-data.js`); full Anchor (`anchor-data.js`); cross-referenced |
| Colour-matching algorithm | good | CIE ΔE2000 for blend matching; Euclidean LAB for fast operations |
| Multi-project dashboard (home) | good | `home.html` / `home-app.js`; project cards, create/open/delete, stash chip |
| Stats page | good | Session history, time charts, activity calendar, stitch speed, pace, showcase |
| PWA installability | good | `manifest.json`; service worker |

---

## Summary Quality Map

| Surface | Overall quality |
|---|---|
| Create (image → pattern) | **good** — feature-rich; main gap is synchronous main-thread pipeline |
| Create-from-scratch | **partial** — functional but bare; no grid templates, no rulers, limited starting options |
| Cleanup / Denoise | **good** (lineart) / **partial** (denoise — plan exists, implementation uncertain) |
| Edit | **good** — comprehensive toolset; minor known bugs around park markers and undo corner cases |
| Track | **good** — strong live-stitching feature set; overflow menu density is the main UX issue |
| Stash | **good** (inventory) / **partial** (partial skeins bug, shopping list removed) |
| Size calculator | **buggy** — two confirmed correctness failures in the primary table |
| Persistence / storage | **good** — multi-project, auto-save, PWA; cross-tab coordination is the weak point |
| Export / import | **good** (PDF, JSON) / **partial** (PNG, OXS, URL sharing not fully confirmed) |
| Cross-tab / multi-device | **partial** — manual sync works; automatic conflict detection absent |
