# Area Spec: creator-pattern-canvas

## Scope

This specification documents nine screens in the Creator pattern-editing interface, focusing on the core canvas interaction area, drawing tools, palette management, and preview rendering. All elements are housed within the Pattern tab (SCR-005) or overlays anchored to it. The canvas supports multiple input modalities (mouse, pen, touch), four stitch types (cross, half-fwd, half-bck, backstitch), multi-tool interaction (paint, fill, lasso, magic wand, eyedropper), and real-time preview modes (symbol/colour/realistic).

---

## Screen: SCR-005 â€” Creator Canvas (Pattern tab)

The Pattern tab chrome: wraps canvas + toolbar + palette chips + status indicators.

### EL-SCR-005-01: Zoom Slider

**Interactive** â†’ Slider control to adjust canvas zoom level (0.05Ã— to 3Ã—, 5% increments).

- **Gesture**: Drag slider thumb left/right; keyboard arrows adjust Â±5%
- **State**: Default positioned to current zoom level; disabled when no pattern loaded
- **Behaviour**: On change, emit `cv.setZoom(newValue)`; RAF debounced to coalesce rapid slider drags into one repaint
- **Keyboard**: Arrow Up/Down Â±5%, Home/End min/max
- **Accessibility**: `aria-label="Zoom"`, `type="range"`, min/max/step attributes
- **Data display**: Numeric label shows `Math.round(cv.zoom * 100) + "%"` to right
- **Platform**: **Tablet** â€” slider height 40px+ for touch target
- **Related files**: [creator/ToolStrip.js](creator/ToolStrip.js#L69-L77)

### EL-SCR-005-02: Fit Button

**Interactive** â†’ Button that zooms canvas to fit viewport.

- **On click**: `cv.setZoom(cv.fitZ || 1)`
- **Keyboard**: Home key (shortcut registered in shortcuts.js)
- **Tooltip**: "Fit (Home)"
- **Accessibility**: Keyboard focusable, `aria-label="Fit pattern to view"`
- **Related files**: [creator/ToolStrip.js](creator/ToolStrip.js#L73)

### EL-SCR-005-03: Shortcuts Hint Banner (dismissible)

**Display** â†’ Informational banner: "Press ? for keyboard shortcuts" (no emoji, use Icons.lightbulb()).

- **Visibility**: If `!app.shortcutsHintDismissed` and localStorage key not set
- **Dismiss**: X button sets localStorage `'shortcuts_hint_dismissed' = '1'`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L92-L107)

### EL-SCR-005-04: Confetti Cleanup Score Card

**Display** â†’ Stitch score (0â€“100) with visual bar; colour-coded by threshold (90+=green, 75â€“90=yellow, 60â€“75=orange, <40=red).

- **Data**: `100 - cleanPct` score; remaining stitches count
- **Render condition**: `app.confettiData && orphans > 0`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L115-L142)

### EL-SCR-005-05: Cleanup Warning Banner (conditional)

**Display** â†’ Alert (Icons.warning()) when cleanup removal >15% or aggressive on small grid.

- **Severity**: Danger (>20%) or Warning (10â€“20%)
- **Dismiss**: X button or CTA link to Prepare tab
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L145-L161)

### EL-SCR-005-06: Status Bar (dynamic)

**Display** â†’ Left: tool help text; Center: grid coords (X, Y 1-indexed) + colour swatch + DMC name; Right: modifier mode.

- **Updates**: On hover/tool change; clears during drag
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L273-L310)

### EL-SCR-005-07: Undo Button (Quick Access)

**Interactive** â†’ "â†¶ Undo" button.

- **Disabled**: If `cv.editHistory.length === 0`
- **On click**: `cv.undoEdit()`
- **Keyboard**: Ctrl+Z
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L313-L322)

### EL-SCR-005-08: Redo Button (Quick Access)

**Interactive** â†’ "â†· Redo" button.

- **Disabled**: If `cv.redoHistory.length === 0`
- **On click**: `cv.redoEdit()`
- **Keyboard**: Ctrl+Y or Ctrl+Shift+Z
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L323-L328)

### EL-SCR-005-09: Clear Highlight Button

**Interactive** â†’ "Clear âœ•" button; danger-coloured.

- **Visibility**: Only if `cv.hiId !== null`
- **On click**: `cv.setHiId(null)`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L330-L335)

### EL-SCR-005-10: Highlight Mode Segmented Control

**Interactive** â†’ 4-button pill toggle: Isolate, Outline, Tint, Spotlight.

- **Current mode**: `cv.highlightMode`
- **On click**: `cv.setHighlightMode(mode)`
- **Visibility**: Only if `cv.hiId !== null`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L341-L363)

### EL-SCR-005-11: Highlight Isolate Settings

**Interactive** â†’ Background dimming slider (5â€“60%) + optional desaturation slider (0â€“100% in Advanced mode).

- **On change**: `cv.setBgDimOpacity(op)` / `cv.setBgDimDesaturation(frac)`
- **Advanced toggle**: Decouples sliders
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L364-L389)

### EL-SCR-005-12: Highlight Outline Settings

**Display** â†’ Static text: "Animated marching ants highlight the boundary of the selected colour."

### EL-SCR-005-13: Highlight Tint Settings

**Interactive** â†’ Colour picker + opacity slider (10â€“80%).

- **On change**: `cv.setTintColor(hex)` / `cv.setTintOpacity(frac)`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L395-L415)

### EL-SCR-005-14: Highlight Spotlight Settings

**Interactive** â†’ Dim strength slider (5â€“50%).

- **On change**: `cv.setSpotDimOpacity(frac)`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L417-L428)

---

## Screen: SCR-010 â€” Creator Pattern Canvas (rendering surface)

The main interactive canvas element where stitches are drawn and edited.

### EL-SCR-010-01: Canvas Left-Click in Paint Mode

**Interactive** â†’ Single cell paint on left-click when Paint tool active.

- **Gesture**: Left-click canvas cell
- **Preconditions**: `cv.activeTool === "paint"` (or null with `brushMode="paint"`), `cv.selectedColorId` set, in-bounds cell
- **Behaviour**: Paint cell with selected DMC id; drag-paint collects all cells under cursor path; on mouse-up commit to history
- **Edit history**: `{ type: "paint", changes: [{idx, old}] }`
- **Keyboard modifier**: Alt = eyedropper sample
- **Accessibility**: Canvas role="application", aria-label="Cross stitch pattern grid"
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L493-600); [creator/PatternCanvas.js](creator/PatternCanvas.js#L124-140)
- **P1 TODO**: VER-EL-SCR-010-01-01 â€” Verify every paint action undoable via history

### EL-SCR-010-02: Canvas Left-Click in Erase Mode

**Interactive** â†’ Cell erasure (set to `{id:"__empty__"}`).

- **Gesture**: Left-click or drag
- **Behaviour**: Cell becomes empty; palette count decrements; count 0 kept (via `rebuildPreservingZeros`)
- **Edit history**: `{ type: "erase", changes: [{idx, old}] }`
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L509-530)
- **P1 TODO**: VER-EL-SCR-010-02-01 â€” Verify erased cells become empty, not deleted

### EL-SCR-010-03: Canvas Left-Click in Fill Mode

**Interactive** â†’ Flood-fill all 4-connected cells of same colour with selected colour.

- **Preconditions**: `cv.brushMode === "fill"`, `cv.selectedColorId` set, in-bounds cell
- **Behaviour**: BFS flood-fill from clicked cell; single history entry with all changes
- **Edit history**: `{ type: "fill", changes: [{idx, old}, ...] }`
- **P1 TODO**: VER-EL-SCR-010-03-01 â€” Verify fill stops at colour boundaries, not grid lines

### EL-SCR-010-04: Canvas Left-Click in Eyedropper Mode

**Interactive** â†’ Sample colour from clicked cell; set `cv.selectedColorId`.

- **Gesture**: Left-click (or Alt+click in any mode)
- **Behaviour**: If empty (`__skip__` / `__empty__`), toast "That cell is empty"; else `cv.setSelectedColorId(cellInfo.id)`
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L254-280)
- **P1 TODO**: VER-EL-SCR-010-04-01 â€” Verify eyedropper rejects empty cells with message

### EL-SCR-010-05: Canvas Left-Click in Magic Wand Mode

**Interactive** â†’ Select all cells matching clicked colour (with tolerance and modifier modes).

- **Preconditions**: `cv.activeTool === "magicWand"`, clicked cell has colour
- **Behaviour**: Colour-distance flood-select using Î”E (CIE Lab), compute `selectionMask` (Uint8Array)
- **Modifier keys**: Shift=add, Alt=subtract, Shift+Alt=intersect
- **Related files**: [creator/useMagicWand.js](creator/useMagicWand.js); [creator/PatternCanvas.js](creator/PatternCanvas.js#L103-118)
- **P1 TODO**: VER-EL-SCR-010-05-01 â€” Verify modifier keys correctly merge selections
- **P2 TODO**: VER-EL-SCR-010-05-02 â€” Tablet: long-press triggers wand (no drag)

### EL-SCR-010-06: Canvas Left-Click in Lasso Mode (Freehand)

**Interactive** â†’ Drag-trace freehand; cells under cursor become selected.

- **Preconditions**: `cv.activeTool === "lasso"`, `cv.lassoMode === "freehand"`
- **Behaviour**: Start `state.startLasso(gx, gy, opModeL)`; accumulate cell coords via Bresenham; commit to `selectionMask` on release
- **Live preview**: Green cells shown during drag
- **Related files**: [creator/useLassoSelect.js](creator/useLassoSelect.js)
- **P2 TODO**: VER-EL-SCR-010-06-01 â€” Tablet: 1-finger lasso without pan interference

### EL-SCR-010-07: Canvas Left-Click in Lasso Mode (Polygon)

**Interactive** â†’ Click anchor points; auto-close when cursor near start; commit via point-in-polygon.

- **Preconditions**: `cv.lassoMode === "polygon"`
- **Esc key**: Cancel in-progress lasso
- **Related files**: [creator/useLassoSelect.js](creator/useLassoSelect.js)

### EL-SCR-010-08: Canvas Left-Click in Lasso Mode (Magnetic)

**Interactive** â†’ Polygon with edge-snapping; drag to lock points.

- **Preconditions**: `cv.lassoMode === "magnetic"`
- **Behaviour**: Snap to nearest colour-edge pixels; visual feedback line changes colour
- **P3 TODO**: VER-EL-SCR-010-08-01 â€” Edge detection respects colour distance

### EL-SCR-010-09: Canvas Left-Click in Backstitch Mode

**Interactive** â†’ Click grid intersections (not cell centres) to place backstitch lines.

- **Preconditions**: `cv.activeTool === "backstitch"`
- **Behaviour**: First click sets `cv.bsStart = {gx, gy}`; show preview line; second click creates entry in `cv.bsLines`; right-click cancels
- **Edit history**: `{ type: "backstitch", changes: [...], bsLines: nextBsLines }`
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L372-395)
- **P1 TODO**: VER-EL-SCR-010-09-01 â€” Backstitch lines can be undone
- **P2 TODO**: VER-EL-SCR-010-09-02 â€” Tablet: touch tap places backstitch

### EL-SCR-010-10: Canvas Hover Overlay

**Display** â†’ Cell outline, half-stitch preview, backstitch preview line, lasso preview mask, brush size circle, colour swatch, modifier mode.

- **Hover cell**: 1px border (all tools except lasso/wand)
- **Half-stitch preview**: Diagonal line for quarter/three-quarter tool
- **Lasso preview**: Green cells during draw
- **Related files**: [creator/canvasRenderer.js](creator/canvasRenderer.js#L780-850)

### EL-SCR-010-11: Canvas Pan (1-Finger Touch or Mouse Drag)

**Interactive** â†’ Scroll canvas when no tool active or Hand tool active.

- **Gesture**: Mouse drag (no tool), 1-finger drag (touch), Space+drag alternative
- **Behaviour**: Update `scrollRef.current.scrollLeft/Top`; clear `hoverCoords`
- **Cursor**: Changes to `grab` when Hand tool active
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L655-690)
- **P2 TODO**: VER-EL-SCR-010-11-01 â€” 1-finger pan without accidental tool activation

### EL-SCR-010-12: Canvas Pinch Zoom (2-Finger Touch)

**Interactive** â†’ Zoom via 2-finger pinch; scale ratio = `newZoom * (newDist / oldDist)`, clamped [0.05, 3].

- **Gesture**: 2-finger pinch open/close
- **State update**: `cv.setZoom(clampedZoom)`
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L632-653)
- **P2 TODO**: VER-EL-SCR-010-12-01 â€” Pinch zoom smooth without jank

### EL-SCR-010-13: Canvas Long-Press Context Menu (Touch)

**Interactive** â†’ Right-click menu triggered by 500 ms hold (LONG_PRESS_MS from touch-constants.js).

- **Preconditions**: Touch pointer, pan not active (cursor within TAP_SLOP_PX), no multi-touch
- **Behaviour**: Show context menu popup; close on outside tap or Esc
- **Related files**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js#L671-710)

### EL-SCR-010-14: Canvas Right-Click Context Menu (Desktop)

**Interactive** â†’ Context menu with colour/tool actions (see SCR-013).

- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L233-250); [creator/ContextMenu.js](creator/ContextMenu.js)

### EL-SCR-010-15: Canvas Keyboard Shortcuts

**Interactive** â†’ P=Paint, E=Erase, F=Fill, O=Eyedropper, W=Wand, L=Lasso, B=Backstitch, R=Replace, Ctrl+Z=Undo, Ctrl+Y=Redo, Esc=Cancel, ?=Help, Ctrl+S=Save.

- **Related files**: [creator/useKeyboardShortcuts.js](creator/useKeyboardShortcuts.js); [shortcuts.js](shortcuts.js)
- **P2 TODO**: VER-EL-SCR-010-15-01 â€” Every registered shortcut works

### EL-SCR-010-16: Canvas Grid Rendering

**Display** â†’ 1 pixel grid lines at `--line` colour; toggleable via `cv.showGrid`; scaled by `cv.cs`.

- **Related files**: [creator/canvasRenderer.js](creator/canvasRenderer.js)

### EL-SCR-010-17: Canvas Stitch Rendering

**Display** â†’ Cross/half/backstitch symbols coloured by palette; blends interlaced.

- **Cross**: Full X in cell
- **Half**: Single diagonal (fwd / bck)
- **Quarter / three-quarter**: Triangle or 3/4 fill
- **Backstitch**: Line segments between grid intersections
- **Blend**: Two colours interlaced (alternating per stitch type)
- **Related files**: [creator/canvasRenderer.js](creator/canvasRenderer.js#L100-400)
- **P1 TODO**: VER-EL-SCR-010-17-01 â€” Blend stitches render with correct interlace

### EL-SCR-010-18: Canvas Fabric Background

**Display** â†’ Woven fabric colour (`app.fabricColour`, default `#F5F0E6`) + faint grid texture.

### EL-SCR-010-19: Canvas Highlight Isolation

**Display** â†’ Dimmed/desaturated background when `cv.hiId` set and mode="isolate"; highlighted cell full brightness with 1px border.

- **Opacity**: `cv.bgDimOpacity` (default 20%, user adjustable 5â€“60%)
- **Desaturation**: `cv.bgDimDesaturation` (default 80%, advanced mode)
- **Related files**: [creator/canvasRenderer.js](creator/canvasRenderer.js#L180-220)

### EL-SCR-010-20: Canvas Highlight Outline (animated)

**Display** â†’ Animated marching ants border around `cv.hiId` cells when mode="outline".

- **Animation**: Offset cycling every ~100 ms (20-frame loop)
- **Related files**: [creator/PatternCanvas.js](creator/PatternCanvas.js#L73-93)
- **P3 TODO**: VER-EL-SCR-010-20-01 â€” Marching ants smooth without jank

---

## Screen: SCR-011 â€” Creator Tool Strip

Tool selection bar with buttons for drawing modes and auxiliary tools.

### EL-SCR-011-01: Paint Button

**Interactive** â†’ "Paint" (Icons.brush()).

- **States**: Active if `cv.brushMode === "paint"`; hover colour change
- **On click**: `cv.setBrushAndActivate("paint")`; auto-select first colour by usage if none selected
- **Tooltip**: "Paint (P)"
- **Keyboard**: P
- **P1 TODO**: VER-EL-SCR-011-01-01 â€” Auto-selects colour if palette non-empty

### EL-SCR-011-02: Fill Button

**Interactive** â†’ "Fill" (Icons.bucket()).

- **On click**: `cv.setBrushAndActivate("fill")`
- **Precondition**: Colour must be selected (greyed out if not)
- **Tooltip**: "Fill (F)"
- **Keyboard**: F

### EL-SCR-011-03: Eraser Button

**Interactive** â†’ "Erase" (eraser icon).

- **On click**: `cv.selectStitchType("erase")`
- **Tooltip**: "Erase (E)"
- **Keyboard**: E

### EL-SCR-011-04: Eyedropper Button

**Interactive** â†’ "Eyedropper" (Icons.eyedropper()).

- **On click**: `cv.setActiveTool("eyedropper")`
- **Alt+click**: Any other tool also activates eyedropper
- **Tooltip**: "Eyedropper (O)"
- **Keyboard**: O

### EL-SCR-011-05: Lasso Button (with sub-modes)

**Interactive** â†’ "Lasso" dropdown: Freehand, Polygon, Magnetic.

- **Sub-menu**: Drag-to-select, click-anchors, edge-snap
- **On click sub-option**: `cv.setActiveTool("lasso")` + `state.setLassoMode(mode)`
- **Keyboard**: L

### EL-SCR-011-06: Magic Wand Button

**Interactive** â†’ "Wand" (wand icon).

- **On click**: `cv.setActiveTool("magicWand")`
- **Tooltip**: "Magic Wand (W)"
- **Keyboard**: W

### EL-SCR-011-07: Replace Colours Button

**Interactive** â†’ "Replace" (Icons.colourSwap()).

- **On click**: Opens CreatorColourReplaceModal (SCR-016)
- **Tooltip**: "Replace colours"

### EL-SCR-011-08: Select All Button

**Interactive** â†’ "Select All".

- **On click**: `cv.selectAllOfColorId(...)` or equivalent
- **Keyboard**: Ctrl+A

### EL-SCR-011-09: Undo (ToolStrip)

**Interactive** â†’ Duplicate of EL-SCR-005-07.

- **Disabled**: If `cv.editHistory.length === 0`
- **Keyboard**: Ctrl+Z

### EL-SCR-011-10: Redo (ToolStrip)

**Interactive** â†’ Duplicate of EL-SCR-005-08.

- **Disabled**: If `cv.redoHistory.length === 0`
- **Keyboard**: Ctrl+Y

### EL-SCR-011-11: Tool Strip Responsive Collapse

**Interactive** â†’ ResizeObserver collapses groups into overflow menu when strip narrows.

- **Thresholds**: <680px hide brush group; <550px hide backstitch group
- **Overflow**: Icon â‹® button opens popover with hidden tools
- **P2 TODO**: VER-EL-SCR-011-12-01 â€” Tool strip collapses at 680px and 550px

---

## Screen: SCR-012 â€” Creator Sidebar (palette/properties)

Right-side panel with colour palette chips and thread management.

### EL-SCR-012-01: Palette Chip (composite)

**Interactive** â†’ 20Ã—20 px colour swatch + DMC id + name + stitch count badge.

- **On click**: `cv.setSelectedColorId(p.id)`; chip highlights as active
- **Selection indicator**: Border glow when `cv.selectedColorId === p.id`
- **Related files**: [creator/Sidebar.js](creator/Sidebar.js#L58-180)
- **P1 TODO**: VER-EL-SCR-012-01-01 â€” Clicking chip selects colour for paint

### EL-SCR-012-02: Palette Chip Swap Button (hover)

**Interactive** â†’ Icons.colourSwap() button; opens colour selection modal on click.

### EL-SCR-012-03: Palette Chip Remove Button (hover)

**Interactive** â†’ Icons.x() button; removes unused colour on click.

- **Visibility**: Only if `p.count === 0`
- **Edit history**: `{ type: "remove_unused_colours", removedFromPal: [p], removedFromScratch: [] }`

### EL-SCR-012-04: Palette Chip Stash Status Indicator (dot)

**Display / Interactive** â†’ Coloured dot: green (owned), yellow (partial), red (needed).

- **Calculation**: Compare `skeinEst(p.count, fabricCt)` vs stash quantity
- **Related files**: [creator/Sidebar.js](creator/Sidebar.js#L94-140)

### EL-SCR-012-05: "Limit to Stash" Filter

**Interactive** â†’ Checkbox to hide unowned threads from display.

- **On toggle**: `ctx.setCreatorStashFilter(!ctx.creatorStashFilter)`
- **Visibility**: Only if stash has data

### EL-SCR-012-06: Stash Strip (inventory summary)

**Display** â†’ "My Stash" header; expandable to show owned threads by brand; quick actions.

---

## Screen: SCR-013 â€” Creator Context Menu (right-click popup)

Right-click context menu overlay with colour and editing actions.

### EL-SCR-013-01: Cell Info Header

**Display** â†’ "DMC 310 Â· Black" with inline colour swatch box.

- **Visibility**: Only if cell not empty
- **Related files**: [creator/ContextMenu.js](creator/ContextMenu.js#L62-72)

### EL-SCR-013-02: "Pick Colour" Item

**Interactive** â†’ Icons.eyedropper() + "Pick this colour".

- **On click**: `cv.setSelectedColorId(cellInfo.id)`
- **Enabled**: Only if cell has colour

### EL-SCR-013-03: "Switch to Fill Tool" Item

**Interactive** â†’ Icons.bucket() + "Switch to fill tool".

- **On click**: `cv.selectStitchType("cross")` + `cv.setBrushAndActivate("fill")`

### EL-SCR-013-04: "Select Similar (Wand)" Item

**Interactive** â†’ Icons.wand() + "Select similar (wand)".

- **On click**: `cv.setActiveTool("magicWand")` + `cv.applyWandSelect(...)`

### EL-SCR-013-05: "Select All of This Colour" Item

**Interactive** â†’ Icons.palette() + "Select all of this colour".

- **On click**: `cv.selectAllOfColorId(cellInfo.id)`

### EL-SCR-013-06: "Replace This Colour" Item

**Interactive** â†’ Icons.colourSwap() + "Replace this colourâ€¦".

- **On click**: Opens ColourReplaceModal (SCR-016)

### EL-SCR-013-07: "Highlight / Remove Highlight" Item

**Interactive** â†’ Icons.magnify() or Icons.magnifyMinus() + toggle text.

- **On click**: `cv.setHiId(cv.hiId === cellInfo.id ? null : cellInfo.id)`

### EL-SCR-013-08: "Stitch Info" Item

**Interactive** â†’ Icons.info() + "Stitch info".

- **On click**: Opens MagicWandPanel (SCR-019) in "info" mode

---

## Screen: SCR-054 â€” Creator Action Bar (top controls)

Persistent bar above tab content with outcome buttons (Print PDF, Track) and pattern info.

### EL-SCR-054-01: "Print PDF" Primary Button

**Interactive** â†’ "Print PDF" or "PDF" (Icons.filePdf()).

- **On click**: Triggers PDF export flow
- **Visibility**: When `props.ready === true`
- **P1 TODO**: VER-EL-SCR-054-01-01 â€” PDF export preserves bit-stability (PK compat)

### EL-SCR-054-02: Export Menu

**Interactive** â†’ Dropdown with "Save as JSON" + "More export optionsâ€¦".

- **Related files**: [creator/ActionBar.js](creator/ActionBar.js#L95-135)

### EL-SCR-054-03: Mode Switch (Create / Edit / Track)

**Interactive** â†’ 3-button toggle; "Edit" always active in Creator.

- **Track button**: Switches to Tracker page
- **Create button**: Switches to image upload flow
- **Related files**: [creator/ActionBar.js](creator/ActionBar.js#L137-160)

### EL-SCR-054-04: "Pattern Info" Popover Trigger

**Interactive** â†’ Chip showing icon + compact stats (e.g., "80Ã—80, 548 stitches").

- **On click**: Opens SCR-020 popover
- **P2 TODO**: VER-EL-SCR-054-04-01 â€” Popover closes on Esc/outside click

### EL-SCR-054-05: Setup Phase Display

**Display** â†’ "Setting up" text when no pattern loaded.

---

## Screen: SCR-020 â€” Creator Pattern Info Popover

Detailed pattern statistics.

### EL-SCR-020-01: Dimensions

**Display** â†’ "80 Ã— 80 cells"

### EL-SCR-020-02: Fabric Count

**Display** â†’ "14-count Aida"

### EL-SCR-020-03: Stitch Count / Stitchability

**Display** â†’ "548 stitches (92% of pattern)"

### EL-SCR-020-04: Colour Count

**Display** â†’ "12 colours"

### EL-SCR-020-05: Difficulty (stars + label)

**Display** â†’ â˜…â˜…â˜…â˜…â˜† "Intermediate" (via `calcDifficulty(...)`)

### EL-SCR-020-06: Skein Estimate

**Display** â†’ "2.4 skeins" (via `skeinEst(count, fabric)`)

### EL-SCR-020-07: Done Count

**Display** â†’ "42 / 548 stitches done (7.7%)" (if tracking started)

### EL-SCR-020-08: Stitch Speed

**Display** â†’ "48 stitches/hr" (computed from session history)

---

## Screen: SCR-021 â€” Creator Realistic Preview Canvas

Photorealistic preview with woven fabric, thread sheen, optional blends.

### EL-SCR-021-01: Realistic Canvas Rendering

**Display** â†’ Levels 1â€“4: flat X â†’ shaded â†’ textured fibres â†’ blend z-order.

- **Rendering levels**:
  - Level 1: flat X, no sheen
  - Level 2: shaded X with light
  - Level 3: procedural thread texture
  - Level 4: per-segment z-order for blends
- **Related files**: [creator/RealisticCanvas.js](creator/RealisticCanvas.js); [creator/PreviewCanvas.js](creator/PreviewCanvas.js)
- **P3 TODO**: VER-EL-SCR-021-01-01 â€” Level 3 texture doesn't exhaust memory

### EL-SCR-021-02: Realistic Canvas Pan/Zoom

**Interactive** â†’ 2-finger pinch, 1-finger drag (same as main canvas).

- **P2 TODO**: VER-EL-SCR-021-02-01 â€” Pinch zoom on preview

### EL-SCR-021-03: Realistic Canvas Grid Toggle

**Interactive** â†’ Checkbox `app.previewShowGrid`.

### EL-SCR-021-04: Realistic Canvas Coverage Override

**Display / Interactive** â†’ Debug slider (conditional visibility).

---

## Screen: SCR-022 â€” Creator Split Pane (preview comparison)

Side-by-side chart (left) + preview (right) with draggable divider.

### EL-SCR-022-01: Split Pane Left Pane (Pattern Canvas)

**Interactive** â†’ Standard canvas (SCR-010) in left half; scroll sync optional.

### EL-SCR-022-02: Split Pane Divider (draggable)

**Interactive** â†’ Vertical divider; drag updates `ratio` (clamped [0.1, 0.9]).

- **Cursor**: `col-resize` on hover
- **Exit**: Drag past 10% / 90% threshold exits split pane
- **Persist**: Save ratio to UserPrefs
- **P3 TODO**: VER-EL-SCR-022-02-01 â€” Divider drag maintains layout on narrow screens

### EL-SCR-022-03: Split Pane Right Pane (Preview Canvas)

**Display** â†’ Realistic or symbol preview; scroll sync optional.

### EL-SCR-022-04: Split Pane Right Pane Dropdown

**Interactive** â†’ Switch preview rendering level (Levels 1â€“4 if realistic).

### EL-SCR-022-05: Split Pane Narrow Mode

**Display** â†’ Stacked layout (<560px): pattern full width above, preview collapsible below.

- **Collapse toggle**: "â–¼ Preview" button
- **P2 TODO**: VER-EL-SCR-022-05-01 â€” Preview collapse/expand on mobile

### EL-SCR-022-06: Split Pane Scroll Sync Toggle

**Interactive** â†’ Checkbox `app.splitPaneSyncEnabled`.

- **On toggle**: Save to UserPrefs

---

## Screen: SCR-060 â€” Insights Engine (analysis overlay)

Pattern quality and stitching insights.

### EL-SCR-060-01: Stitch Score Display

**Display** â†’ "Stitch Score: 87/100" with bar; colour-coded (90+=green, <40=red).

- **Calculation**: `100 - confettiPct`
- **Related files**: [creator/PatternTab.js](creator/PatternTab.js#L115-142); [insights-engine.js](insights-engine.js)

### EL-SCR-060-02: Stitch Score Tooltip

**Interactive** â†’ Hover shows explanation about isolated stitches, thread changes, etc.

### EL-SCR-060-03: Orphaned Stitches Count

**Display** â†’ "148 isolated stitches remaining"

---

## DISCOVERED.md Appendix

### Critical Rendering Pipeline

1. **PatternCanvas** owns two Effects:
   - Effect 1: Full re-render on pattern/settings changes (RAF debounced)
   - Effect 2: Overlay-only re-render on hover (cheaper)
2. **Base cache**: ImageData snapshot after full render; overlay painted on top each frame
3. **Marching ants**: Interval-driven offset; restores base + repaints overlay each tick

### Edit History Structure

- Shape: `{ type: "paint" | "fill" | "erase" | "backstitch" | "colourReplace" | "add_colour" | "remove_unused_colours", changes: [{idx, old}], psChanges?: [...], bsLines?: [...] }`
- Redo stack mirrors; max 128 entries per EDIT_HISTORY_MAX
- Delta approach (old value stored), not full snapshots

### Palette Consistency

- Scratch palette: temporary user-added colours (isolated)
- Palette chips: display-order list sorted by usage
- `cmap`: Object keyed by id; value = {id, name, rgb, lab, count, brand}
- Blend ids: format "310+550" (two-strand blends)

### Tablet/Touch Constraints

From [touch-constants.js](touch-constants.js):
- TAP_SLOP_PX = 10 (movement threshold before drag)
- LONG_PRESS_MS = 500 (context menu hold)
- PINCH_MIN_MOVE_PX = 4 (combined finger movement)
- MULTI_TOUCH_GRACE_MS = 100 (2nd touch window)

### Keyboard Shortcut Registry

All shortcuts in [shortcuts.js](shortcuts.js) with scope "creator.design" pushed by [useKeyboardShortcuts.js](creator/useKeyboardShortcuts.js). Single-key shortcuts don't fire while typing (unless modified, e.g. Ctrl+S).

### No-Emoji Rule

All UI labels use Icons.{name}() SVG from [icons.js](icons.js). Forbidden: pictographic emoji (ðŸ‘¤ ðŸ”” etc.), symbol marks (âœ“ âœ— â†’ â†). Keyboard legends in `<kbd>` tags only exception (â†‘ â†“ â† â†’ âŒ˜ â‡§).

### Conversion Settings Manifest

[useCreatorState.js](creator/useCreatorState.js) CONVERSION_STATE_KEYS = authoritative list of state affecting preview/generation. Any new setting MUST be added to pass regression tests.

---

## VERIFICATION TODO

### P0 (Broken)
- [ ] `VER-EL-SCR-010-01-01` â€” Paint action updates pattern array and history
- [ ] `VER-EL-SCR-010-01-02` â€” Undo reverses paint to old value
- [ ] `VER-EL-SCR-010-11-01` â€” Canvas pan doesn't interfere with tool clicks

### P1 (Misleading)
- [ ] `VER-EL-SCR-010-02-01` â€” Erased cells become empty, not deleted
- [ ] `VER-EL-SCR-010-03-01` â€” Fill stops at colour boundaries
- [ ] `VER-EL-SCR-010-04-01` â€” Eyedropper rejects empty cells with message
- [ ] `VER-EL-SCR-010-05-01` â€” Modifier keys merge selections correctly
- [ ] `VER-EL-SCR-010-17-01` â€” Blend stitches render with correct interlace
- [ ] `VER-EL-SCR-011-01-01` â€” Paint auto-selects colour if palette non-empty
- [ ] `VER-EL-SCR-012-01-01` â€” Clicking chip selects colour
- [ ] `VER-EL-SCR-054-01-01` â€” PDF preserves bit-stability (PK compat)

### P2 (Missing)
- [ ] `VER-EL-SCR-010-05-02` â€” Tablet: long-press triggers wand (no drag)
- [ ] `VER-EL-SCR-010-06-01` â€” Tablet: 1-finger lasso without pan
- [ ] `VER-EL-SCR-010-09-02` â€” Tablet: touch tap places backstitch
- [ ] `VER-EL-SCR-010-12-01` â€” Pinch zoom smooth
- [ ] `VER-EL-SCR-010-15-01` â€” Every shortcut key works
- [ ] `VER-EL-SCR-011-12-01` â€” Tool strip collapses at breakpoints
- [ ] `VER-EL-SCR-021-02-01` â€” Preview pinch zoom
- [ ] `VER-EL-SCR-022-05-01` â€” Mobile: preview collapse/expand
- [ ] `VER-EL-SCR-054-04-01` â€” Popover closes on Esc

### P3 (Nice to have)
- [ ] `VER-EL-SCR-010-08-01` â€” Magnetic lasso respects colour threshold
- [ ] `VER-EL-SCR-010-20-01` â€” Marching ants smooth
- [ ] `VER-EL-SCR-021-01-01` â€” Level 3 texture memory efficient
- [ ] `VER-EL-SCR-022-02-01` â€” Divider drag layout stable

### P4 (Performance)
- [ ] `VER-EL-SCR-010-01-03` â€” Paint perf on >100k stitches
- [ ] `VER-EL-SCR-010-12-02` â€” Pinch zoom smooth on mid-range devices

