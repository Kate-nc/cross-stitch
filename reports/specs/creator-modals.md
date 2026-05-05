# Area Spec: creator-modals

**Location**: [reports/specs/creator-modals.md](creator-modals.md)

## Scope

Five interrelated modal/popover components for pattern adaptation, colour replacement, magic wand selection operations, pattern metadata display, and palette transformation. All use Workshop theming (tokens on `:root` light / `[data-theme="dark"]` dark), SVG icons from [icons.js](../../icons.js) (no emoji), and React 18 with Babel runtime compilation.

## Quick Reference

| Screen | Purpose | File | Entry |
|--------|---------|------|-------|
| SCR-014 | Stash/brand adaptation (non-destructive) | [creator/AdaptModal.js](../../creator/AdaptModal.js) | Adapt button |
| SCR-016 | Direct DMC colour replacement | [creator/ColourReplaceModal.js](../../creator/ColourReplaceModal.js) | Right-click stitch / palette chip / Replace tool |
| SCR-019 | Magic Wand selection toolbar + sub-panels | [creator/MagicWandPanel.js](../../creator/MagicWandPanel.js) | activeTool === 'magicWand' \| selection exists |
| SCR-020 | Read-only pattern metadata popover | [creator/PatternInfoPopover.js](../../creator/PatternInfoPopover.js) | ActionBar "Pattern info" chip |
| SCR-056 | Non-destructive palette swap (presets / custom) | [palette-swap.js](../../palette-swap.js) | "Palette swap" menu / button |

---

## Screen: SCR-014 â€” Creator Adapt Modal

**Purpose**: Hybrid A/B substitution workflow. Auto-proposes thread substitutions for current pattern using either (1) Stash Match mode (find owned threads) or (2) Brand Conversion mode (convert DMCâ†”Anchor). Displays substitution table with inline override picker per row. Threshold slider controls Î”E2000 tolerance (1â€“25, default 10). Sticky preview thumbnails show before/after. **Non-destructive**: saves as new project, leaves original unchanged.

**Render condition**: `<AdaptModal open={true} mode="stash|brand" ... />`

### EL-SCR-014-01: Modal Header

- **Close button**: `Icons.x()`, top-right, `onClick={onClose}`
- **Title**: "Adapt this pattern"
- **Mode toggle**: Two radio-style buttons â€” "Match my stash" | "Convert to brand". Toggling updates `mode` state â†’ recomputes `proposal`.
- **Styling**: `maxWidth: 100%`, desktop ~850px target; header `padding: 16â€“20px`; `border-bottom: 1px solid var(--border)`

### EL-SCR-014-02: Resizable Split Container

- **Left pane** (default 66%, min 400px): Substitution table (scrollable)
- **Right pane** (min 240px): Preview thumbnails (sticky)
- **Divider** (4px handle): Draggable via pointerdown/move/up; ratio persisted to localStorage (`creator.adaptModalSplitRatio`)
- **Breakpoint**: < 720px width â†’ vertical stack
- **Styling**: `display: 'flex'`, `gap: 0`, divider `flex: 0 0 4px`, `background: var(--line)`, `cursor: col-resize` on hover

### EL-SCR-014-03: Threshold Controls

- **Location**: Left pane header (sticky above table)
- **Elements**: 
  - Label "Max Î”E threshold"
  - Slider `type="range" min="1" max="25" step="1"` (maps to `threshold` state)
  - Value display (monospace, e.g. "12 Î”E2000")
  - "Re-run auto" button â†’ clears `overrides` state â†’ recomputes proposal
- **Debounce**: 500ms before persisting to localStorage (`cs_adaptMaxDE`)
- **Styling**: `display: 'flex'`, `alignItems: 'center'`, `gap: 12px`, `padding: 8px 12px`, `background: var(--surface-secondary)`

### EL-SCR-014-04: Substitution Table

- **Semantic** `<table>` with sticky thead
- **Columns** (left to right):
  1. **Source** (30%): Swatch chip (22Ã—22) + DMC ID (bold monospace) + name (secondary grey)
  2. **Arrow** (3%): "â†’" (tertiary grey)
  3. **Target** (30%): Swatch + ID + name + brand badge. If no match: italic grey "No match within threshold" / "Nothing in stash" / "No equivalent"
  4. **Match Quality** (15%): `MatchChip` component (tier badge + Î”E value)
  5. **Actions** (22%): "Pickâ€¦" / "Changeâ€¦" button â†’ opens inline `PickerPopover`
- **Rows**: Height ~48px, `padding: 8px 10px`, `borderBottom: 1px solid var(--line)`, hover background (subtle)
- **Interaction**: Row button click â†’ popover opens above. Select thread in popover â†’ updates `overrides[sourceKey]` â†’ effective proposal recomputes. Click "Skip" in popover â†’ sets `overrides[sourceKey] = null` â†’ row marked as skipped.

### EL-SCR-014-04a: MatchChip

- **Display**: Filled dot (6px circle) + tier label ("Exact" / "Close" / "Approx." / "No match") + Î”E value
- **Colour** (by tier):
  - Exact (dE < 1): green (`--success`)
  - Close (1 â‰¤ dE â‰¤ 3): amber
  - Approx. (dE > 3): red/orange
  - No match: grey (`--text-secondary`)
- **Styling**: `display: 'inline-flex'`, `alignItems: 'center'`, `gap: 4px`, `padding: 2px 8px`, `borderRadius: 12px`, `fontSize: var(--text-xs)`, `fontWeight: 500`, background/border keyed by colour token

### EL-SCR-014-05: PickerPopover

- **Positioning**: `position: 'absolute'`, `zIndex: 50`, `top: '100%'`, `left: 0`, anchored to button
- **Elements**:
  - **Tab buttons** (2): "In stash" | "All DMC" (or "All ANCHOR" if brand=anchor)
  - **Search input**: `placeholder="Search id or nameâ€¦"`, autofocus on open, debounced filter
  - **Thread list** (max-height 360px, scrollable): Each row = swatch (18Ã—18) + ID (bold monospace) + name (truncate) + "In stash" badge (green `--success` if owned), result cap 60. Click row â†’ `onPick(thread)`, popover closes, `overrides` updates.
  - **"Skip â€” leave original" button** (at bottom): Calls `onPick(null)` â†’ skips this colour
- **Empty state**: "No matches" (centred, secondary grey)
- **Styling**: `background: var(--surface)`, `border: 1px solid var(--border)`, `borderRadius: var(--radius-md)`, `boxShadow: 0 8px 24px rgba(0,0,0,0.18)`, `width: 320`, `padding: 8px`

### EL-SCR-014-06: Preview Thumbnails

- **Two canvas elements** (right pane, sticky to top):
  1. **Original**: Pattern rendered with current palette, no remap
  2. **Adapted**: Pattern rendered with `effectiveProposal` substitutions applied
- **Rendering**: Via `_renderThumb(canvas, pattern, sW, sH, remap)` utility. Redrawn whenever `pattern`, `sW`, `sH`, or `effectiveProposal` changes (memoized).
- **Styling**: `imageRendering: 'pixelated'`, `border: 1px solid var(--border)`, `borderRadius: 4px`, label text ("Original" / "Your adaptation") above each. Canvas size target ~200Ã—200 rendered (scaled to fit pane).

### EL-SCR-014-07: Footer (Action Buttons)

- **Position**: Sticky bottom, `borderTop: 1px solid var(--border)`
- **Buttons** (right-aligned):
  - **Cancel**: `onClick={onClose}`, text "Cancel", secondary button styling
  - **Save**: `onClick={handleSave}`, text "Save as new project", primary accent button. **Disabled** if `!effectiveProposal` or no substitutions.
- **Interaction**: Save â†’ calls `window.AdaptationEngine.applyProposal(effectiveProposal, ctx.project)` â†’ new project object â†’ `window.ProjectStorage.save(newProj)` â†’ navigate to new project + toast "Pattern adapted as '[name]'". Original project untouched.
- **Styling**: `display: 'flex'`, `justifyContent: 'flex-end'`, `gap: 8px`, `padding: 16px`

**Tablet**: Modal scrolls body if content > viewport. Scrim (overlay) dismisses on tap. All touch targets 44px+.

---

## Screen: SCR-016 â€” Creator Colour Replace Modal

**Purpose**: Direct (one-shot) DMC-only colour replacement. Triggered by three entry points: (1) right-click stitch â†’ "Replace this colour", (2) palette chip swap button, (3) Replace tool. Modal shows source colour swatch + DMC ID at top, followed by searchable DMC thread picker. Current (source) thread is disabled/greyed. Select target â†’ applies replacement immediately (no new project). **DMC-only** (no Anchor support; prevent ID collisions).

**Render condition**: `modal.type === 'colourReplace'` in app state

### EL-SCR-016-01: Modal Header

- **Close button**: `Icons.x()`, top-right
- **Title**: "Replace DMC [ID] Â· [name] withâ€¦" (source colour shown as swatch chip 20Ã—20 + text)
- **Styling**: `maxWidth: 460`, `width: 100%`, `display: 'flex'`, `flexDirection: 'column'`, `maxHeight: 80vh`; header `padding: 20px`; `border-bottom: 1px solid var(--border)`
- **A11y**: `labelledBy="colour-replace-title"`, Escape closes, focus trap

### EL-SCR-016-02: Search Input

- `type="text"`, `placeholder="Search by DMC code or colour nameâ€¦"`, `autoFocus`
- Filters thread list by substring match (ID or name, case-insensitive)
- Styling: `width: 100%`, `padding: 8px 10px`, `borderRadius: var(--radius-sm)`, `border: 1px solid var(--border)`, `background: var(--surface)`, `marginBottom: 10`
- Debounced 250ms for perf

### EL-SCR-016-03: Thread Picker List

- **Container**: `flex: 1`, `overflowY: 'auto'`, `border: 1px solid var(--border)`, `borderRadius: var(--radius-sm)`
- **Rows** (per thread, button-style):
  - Swatch chip (18Ã—18) + ID (monospace, bold, secondary grey, min-width 35) + name (flex 1, truncate) + "current" badge (if source thread)
  - Styling: `display: 'flex'`, `alignItems: 'center'`, `gap: 10`, `width: 100%`, `padding: 7px 12px`, `borderBottom: 1px solid var(--surface-secondary)`, `cursor: 'pointer'`, `textAlign: 'left'`
  - **Hover** (non-source): `background: var(--surface-secondary)`
  - **Disabled** (source row): greyed, not clickable
- **Empty state**: "No colours found" (centred, secondary grey, `fontSize: var(--text-sm)`)
- **Interaction**: Click non-source row â†’ `onApply(thread)` â†’ applies colour replacement (pattern mutation) â†’ closes modal

### EL-SCR-016-04: Footer

- **Cancel** button (right-aligned): `onClick={onClose}`, text "Cancel"
- **Context notes**:
  - **Entry point 1** (right-click stitch): Source colour pre-selected from stitch colour
  - **Entry point 2** (palette chip swap button): Source from chip DMC ID
  - **Entry point 3** (Replace Tool): Source pre-filled from `cv.replaceSource` canvas interaction state

**Tablet**: Height ~80vh, scrollable if content exceeds viewport.

---

## Screen: SCR-019 â€” Creator Magic Wand Panel

**Purpose**: Floating toolbar for magic wand / lasso selection operations + bulk operations on selections. Renders as stacked horizontal bars (TB-style) with tool options, operation mode buttons, and conditional sub-panels (confetti cleanup, reduce colours, replace colour, stitch info, outline).

**Render condition**: `cv.activeTool === 'magicWand'` OR `cv.activeTool === 'lasso'` OR `cv.hasSelection === true`

**Positioning**: Floats above canvas; position typically bottom-left or managed by `cv.wandPanel` state.

### EL-SCR-019-01: Tool Options Row (Magic Wand only)

- **Visibility**: Shows only when `cv.activeTool === 'magicWand'`
- **Elements** (horizontal flex):
  - Label "Wand" (bold, secondary grey, `flexShrink: 0`)
  - Divider (`tb-sdiv`: vertical line)
  - Tolerance label + slider `type="range" min="0" max="100" step="1"` + value display (monospace, min-width 22). Suffix changes: "(exact)" @ 0, "(similar)" @ 1â€“5, "(broad)" @ 6â€“15, "(very broad)" @ 16+
  - Divider
  - **Contiguous toggle** (two buttons):
    - "Connected only": active when `cv.wandContiguous === true`. Tooltip: "Only select stitches connected to the one you click"
    - "All matching": active when `cv.wandContiguous === false`. Tooltip: "Select every stitch of this colour anywhere on the chart"
- **Styling**: `className: 'tb-strip--sel'`, `display: 'flex'`, `alignItems: 'center'`, `gap: 4â€“10px`, `padding: 8â€“10px`, `background: var(--surface-secondary)`, `fontSize: 11`

### EL-SCR-019-02: Selection Mode Buttons

- **Four buttons** (replace / add / subtract / intersect):
  - **Replace** (`svgSelReplace` + "New"): Tooltip "New selection â€” replaces any existing"
  - **Add** (`svgSelAdd` + "Add"): Tooltip "Add to selection (hold Shift)"
  - **Subtract** (`svgSelSubtract` + "Subtract"): Tooltip "Subtract from selection (hold Alt)"
  - **Intersect** (`svgSelIntersect` + "Intersect"): Tooltip "Keep only the overlap (hold Shift+Alt)"
- **Icons**: Inline SVG (12Ã—12, stroke-based), dashed rect + mode indicator
- **Styling**: Each `className: 'tb-btn'` + `'tb-btn--on'` if active. Hover highlight.
- **Badge** (if Alt/Shift modifier active): Small amber/gold dot (top-right of button)
- **Interaction**: Click button â†’ `cv.setSelectionOpMode(mode)` â†’ updates operation mode

### EL-SCR-019-03: Selection Status Row (if `hasSelection`)

- **Visibility**: Shows only when `cv.hasSelection === true`
- **Elements** (horizontal flex):
  - Status text (bold secondary grey): "[N] stitches selected" (N localised)
  - Divider
  - **Quick-action buttons** (Deselect, Invert, All): Tooltips "Deselect all (Esc)", "Invert selection (Ctrl+â‡§+I)", "Select all stitches (Ctrl+A)"
  - Divider
  - **Sub-panel toggles** (5 buttons):
    - "Confettiâ€¦" â†’ `setWandPanel('confetti'|null)`, active if `panel === 'confetti'`
    - "Reduce Coloursâ€¦" â†’ `setWandPanel('reduce'|null)`, active if `panel === 'reduce'`
    - "Replace Colourâ€¦" â†’ `setWandPanel('replace'|null)`, active if `panel === 'replace'`
    - "Stitch Infoâ€¦" â†’ `setWandPanel('info'|null)`, active if `panel === 'info'`
    - "Outlineâ€¦" â†’ `setWandPanel('outline'|null)`, active if `panel === 'outline'`
- **Styling**: `className: 'tb-strip--sel'`, similar flex layout

### EL-SCR-019-04: Confetti Cleanup Panel

- **Visibility**: `panel === 'confetti'` AND `hasSelection === true`
- **Background**: `#F8EFD8` (light orange), `borderBottom: 1px solid #E5C97D`
- **Elements**:
  - Label "Confetti Cleanup in Selection" (bold, `#7c2d12`)
  - Min cluster size slider (label + range 1â€“10 + value display) + "Preview" button + "Apply" button (green, disabled if !preview) + Close button (Ã—)
  - Status (if preview exists): "[N] stitches flagged"
- **Interaction**: Preview â†’ `cv.previewConfettiCleanup()` â†’ overlay on canvas. Apply â†’ `cv.applyConfettiCleanup()` â†’ modifies pattern + undo entry added.
- **Styling**: `display: 'flex'`, `alignItems: 'center'`, `gap: 10px`, `flexWrap: 'wrap'`, `padding: 10px 14px`, `fontSize: 11`

### EL-SCR-019-05: Reduce Colours Panel

- **Visibility**: `panel === 'reduce'` AND `hasSelection === true`
- **Background**: `#DEE7D2` (light green), `borderBottom: 1px solid #C4DCB6`
- **Elements**:
  - Label "Simplify Colours in Selection" (bold, `#2E4824`)
  - Info "[N] colours in selection" (secondary `#3F6432`)
  - Target input (label + `type="number" min="1" max={selColours}`)
  - "Preview merges" button + "Apply" button (green, disabled if !preview) + Close (Ã—)
  - Merge preview list (if exists, max-height 120px scrollable): Per merge: swatch + name + "â†’" + swatch + name + "([N] stitches)"
- **Interaction**: Adjust target â†’ `cv.setReduceTarget()`. Preview â†’ `cv.previewColorReduction()` â†’ shows merge list. Apply â†’ `cv.applyColorReduction()`.
- **Styling**: Similar to confetti; `color: #3F6432` for secondary text

### EL-SCR-019-06: Replace Colour Panel

- **Visibility**: `panel === 'replace'` AND `hasSelection === true`
- **Background**: `#fdf4ff` (light purple), `borderBottom: 1px solid #e9d5ff`
- **Elements**:
  - Label "Replace Colour in Selection" (bold, `#4a044e`)
  - **Source selector**: Label "Source:" + source swatch + `<select>` (palette entries, placeholder "â€” pick â€”")
  - Arrow "â†’" (secondary grey)
  - **Target selector**: Label "Target:" + target swatch + `<select>` (palette entries, placeholder "â€” pick â€”")
  - **Fuzzy toggle**: Checkbox "Fuzzy" + (if checked) range slider (`min: 0, max: 20, step: 1`) + Î”E display ("Î”Eâ‰¤[n]")
  - Status (if source selected): "[N] stitches affected" (purple)
  - "Apply" button (green, disabled if !source || !target || !affected) + Close (Ã—)
- **Interaction**: Select source/target â†’ `cv.setReplaceSource()` / `cv.setReplaceDest()`. Toggle Fuzzy â†’ `cv.setReplaceFuzzy()` + shows slider. Apply â†’ `cv.applyColorReplacement()`.
- **Styling**: `display: 'flex'`, `alignItems: 'center'`, `gap: 10px`, `flexWrap: 'wrap'`, `padding: 10px 14px`, `fontSize: 11`

### EL-SCR-019-07: Stitch Info Panel

- **Visibility**: `panel === 'info'`
- **Background**: `#f0f9ff` (light blue), `borderBottom: 1px solid #bae6fd`
- **Elements**:
  - Label "Selection Info" / "Pattern Info" (bold, `#0c4a6e`)
  - Summary "[N] stitches, [M] colours, ~[K] skeins" (secondary blue)
  - "Export CSV" button â†’ generates CSV (headers: DMC, Name, Stitches, Skeins) â†’ blob download via `<a>` + `URL.createObjectURL()`
  - Close (Ã—)
  - Stats table (scrollable, max-height 140px):
    - Thead: Colour | DMC | Name | Stitches (right-aligned) | Skeins (right-aligned)
    - Tbody: Row per colour. Alternating backgrounds. Footer row (bold, border-top) with totals.
- **Styling**: `padding: 10px 14px`, table cells `padding: 2px 6px`, `fontSize: 11`, `borderCollapse: 'collapse'`

### EL-SCR-019-08: Outline Panel

- **Visibility**: `panel === 'outline'` AND `hasSelection === true`
- **Background**: `#f8fafc` (subtle grey), `borderBottom: 1px solid #E5DCCB`
- **Elements**:
  - Label "Generate Backstitch Outline" (bold, `#1B1814`)
  - Thread picker: Label "Outline thread (DMC):" + text input (width 60, monospace, for DMC ID input)
  - Thread display (live): If valid DMC â†’ swatch + name (secondary grey). If invalid â†’ "Unknown DMC" (red)
  - "Generate" button (green, disabled if invalid DMC) + Close (Ã—)
- **Interaction**: Type DMC ID â†’ validates via `findThreadInCatalog('dmc', id)` (live). Generate â†’ `cv.applyOutlineGeneration()` â†’ adds backstitch lines around selection using specified DMC.
- **Styling**: `display: 'flex'`, `alignItems: 'center'`, `gap: 10px`, `flexWrap: 'wrap'`, `padding: 10px 14px`, `fontSize: 11`

**Tablet**: Touch targets 44px+. On mobile, may collapse or slide into sidebar.

---

## Screen: SCR-020 â€” Creator Pattern Info Popover

**Purpose**: Read-only display of pattern metadata (dimensions, fabric count, palette size, skein estimate, stitchability %, time estimate, difficulty with factors). Anchored to "Pattern info â–¾" chip in ActionBar; opens as popover on desktop (dismiss Escape / click-outside) or bottom sheet on mobile.

**Render condition**: `infoOpen === true` in ActionBar state. Props: `sW, sH, fabricCt, colourCount, skeinEstimate, totalStitchable, difficulty, solidPct, stitchSpeed, doneCount`.

### EL-SCR-020-01: Popover Container

- **Desktop**: `position: 'absolute'`, anchored to trigger button. `zIndex: 100`. Click-outside or Escape â†’ `onClose()`.
- **Mobile/iPad**: `position: 'fixed'`, bottom 0, `width: 100%`, `height: ~50vh`, slide-in animation from bottom, swipe-down dismissible.
- **Styling**: `background: var(--surface)`, `border: 1px solid var(--border)` (desktop) or `borderTopLeftRadius: var(--radius-lg)` (sheet), `boxShadow: var(--shadow-lg)`, `padding: 16â€“20px`, `minWidth: 320`, `maxWidth: 400`
- **A11y**: `aria-label="Pattern info"`, Escape closes + focus returns to trigger

### EL-SCR-020-02: Pattern Dimensions Grid

- **Rows** (label | value):
  - **Size**: "[sW] Ã— [sH] stitches"
  - **Fabric**: "[fabricCt] ct Aida"
  - **Stitchable**: "[totalStitchable]" (localised, comma sep)
  - **Colours**: "[colourCount]"
  - **Skeins**: "~[skeinsRounded]" (ceiling of estimate, min 1)
- **Omit** if value missing
- **Styling**: `display: 'grid'`, `gridTemplateColumns: '1fr 1fr'`, `gap: 8px`, `fontSize: var(--text-sm)`. Labels: `color: var(--text-secondary)`, `fontWeight: 500`. Values: `color: var(--text-primary)`, monospace for numbers

### EL-SCR-020-03: Stitchability Badge

- **Type**: Inline badge (if `solidPct` defined)
- **Content**: "[pct]% solid" (e.g. "92.4% solid")
- **Styling**: `display: 'inline-block'`, `padding: 2px 8px`, `borderRadius: var(--radius-pill)`, `background: color-mix(in srgb, var(--success) 12%, transparent)`, `color: var(--success)`, `fontSize: var(--text-xs)`, `fontWeight: 500`

### EL-SCR-020-04: Difficulty Section

- **Basic**: Colour-coded tier badge (Easy/green | Moderate/amber | Advanced/orange | Challenging/red) + optional score "(score / 100)"
- **Full** (if `diff.factors` array exists):
  - Factor bars (one per factor): Label (left) + track (flex, `height: 4â€“6px`, `background: var(--surface-secondary)`) + fill bar (`width: score * 100%`, `background: var(--accent)`) + pct (right)
  - "How this is calculated" disclosure: `<details>` with `<summary>` â†’ opens formula table (Factor | Weight | Score | Contribution)
- **Styling**: Badge `padding: 2px 8px`, `borderRadius: var(--radius-pill)`, border `1px solid`, `inline-block`. Table `fontSize: var(--text-xs)`, `borderCollapse: 'collapse'`

### EL-SCR-020-05: Time Estimate Rows

- **Rows** (label | value):
  - **Total time** (if stitchable != null): "Time @ [stitchSpeed]/hr" â†’ "[formatted time]" (via `window.fmtTimeL()`, e.g. "4h 30m")
  - **Remaining** (if doneCount > 0 && < stitchable): "Remaining" â†’ "[formatted time]"
- **Styling**: Grid layout (label | value), right-aligned values if numeric

**Tablet**: On iPad portrait, render as bottom sheet (fixed, ~50% height) with swipe-down dismiss + scrim tap.

---

## Screen: SCR-056 â€” Palette Swap UI

**Purpose**: Non-destructive palette transformation. User selects a preset palette (20+ presets in nature/food/textile/cultural/festive/whimsical/interiors categories) or custom harmony (complementary/analogous/triadic/split-complementary hues). Optionally locks specific colours. Previews before/after on canvas. Applies transformation (creates new project or updates current per interaction spec).

**Render condition**: Triggered by "Palette swap" menu / button; opens as modal or slide-in panel.

### EL-SCR-056-01: Modal Frame & Tab Navigation

- **Tabs** (button group at top):
  1. **Presets**: Pre-defined palette cards, categorised
  2. **Custom**: Hue shift slider, harmony type picker, colour range controls
  3. **Compare**: Side-by-side before/after preview
- **Styling**: `maxWidth: 800`, `display: 'flex'`, `flexDirection: 'column'`. Tab bar at top with button styling. Tab content flex-growing.

### EL-SCR-056-02: Presets Tab

- **Grid layout** (2â€“3 columns on desktop, 1 on mobile) of preset cards
- **Per card**:
  - **Swatch grid**: Tiered colour swatches (8/16/24 colours via `autoSelectTier(colourCount)`), flex row of small circles (16Ã—16, `borderRadius: 50%`)
  - **Title**: Preset name (e.g. "Rocky coastline")
  - **Category badge**: e.g. "nature", "food" (styled, secondary colour)
  - **Description**: Short blurb (e.g. "Slate, sea spray, kelp green, sand, stormy grey")
  - **Select button**: CTA button
- **Styling**: Card `padding: 12px`, `border: 1px solid var(--border)`, `borderRadius: var(--radius-md)`, hover shadow lift
- **Interaction**: Click card â†’ applies preset mapping (sorts source & target palettes by OKLAB lightness, maps 1:1 by rank) â†’ shows preview â†’ enables "Apply" button

### EL-SCR-056-03: Custom Tab

- **Elements**:
  - **Hue shift slider**: 0â€“360Â°. Quick buttons (0Â°, 30Â°, 60Â°, 90Â°, 120Â°, 180Â°). Slider has smooth gradient hue background.
  - **Harmony type selector**: Dropdown or button group (Complementary | Analogous | Triadic | Split-complementary)
  - **Colour range** (advanced, collapsed, P2 feature): Min/max lightness, saturation controls
  - **Lock toggles**: Per-colour lock buttons (visual: lock/unlock icon badge on swatch). Locked colours preserve identity through transformation.
- **Interaction**: Drag slider â†’ recomputes mapping via `computeShiftMapping()` â†’ preview updates. Select harmony type â†’ recomputes mapping. Toggle lock on swatch â†’ updates `lockedIds` set â†’ proposal recomputes.
- **Styling**: `display: 'flex'`, `gap: 12px`, `padding: 16px`, `width: 280px` slider. Quick buttons as button group (selected highlighted).

### EL-SCR-056-04: Mapping Table

- **Columns** (left to right):
  1. **Source** (left): Swatch + DMC ID + name
  2. **â†’** (centre): Arrow
  3. **Target** (centre-right): Swatch + DMC ID + name. If no match or locked: same as source.
  4. **Count** (right): Number of stitches using this colour
  5. **Quality** (right): Î”E badge (EL-SCR-056-04a)
  6. **Actions** (right): Lock toggle (EL-SCR-056-04b) + Similar popover trigger (EL-SCR-056-04c)
- **Styling**: Full-width table, `borderCollapse: 'collapse'`, alternating row backgrounds (optional). Cell `padding: 8px 6px`. Locked row `opacity: 0.5`.

### EL-SCR-056-04a: Î”E Quality Badge

- **Content**: Tier label ("Perfect" / "Close" / "Approx.") + Î”E value
- **Colour** (by tier):
  - Perfect (dE < 1): `background: '#DEE7D2'`, `color: '#4F7D3F'`
  - Close (dE â‰¤ 3): `background: '#FAF5E1'`, `color: '#A06F2D'`
  - Approx. (dE > 3): `background: '#FCEFEF'`, `color: '#A53D3D'`
- **Styling**: `padding: 1px 6px`, `borderRadius: 8`, `fontSize: 10`, `whiteSpace: 'nowrap'`

### EL-SCR-056-04b: Lock Toggle

- **Icon**: `Icons.lock()` (filled) if locked, `Icons.unlock()` (outline) if unlocked
- **Styling**: `width: 20`, `height: 20`, `display: 'flex'`, `alignItems: 'center'`, `justifyContent: 'center'`, `borderRadius: 4`, border `1px solid`, background conditional
- **Tooltip**: "Lock this colour" / "Unlock this colour"
- **Interaction**: Click â†’ toggles `lockedIds` set â†’ proposal recomputes excluding locked colours

### EL-SCR-056-04c: Similar Popover

- **Positioning**: `position: 'absolute'`, `zIndex: 20`, `top: '100%'`, `right: 0`, `background: '#fff'`, `border: 1px solid #E5DCCB`, `borderRadius: 8`, `boxShadow: 0 4px 12px rgba(0,0,0,0.1)`
- **Content**: "Similar DMC threads" (header) + list of top 5 similar threads by Î”E (filtered to exclude current target)
- **Per row**: Swatch + ID + name + Î”E badge. Hover highlight. Click â†’ overrides target in mapping.
- **Styling**: `padding: 6px`, `minWidth: 200`

### EL-SCR-056-05: Contrast Warning

- **Type**: Collapsible alert (if low-contrast pairs detected in mapping)
- **Content**: "Low contrast detected: [pair1], [pair2]â€¦" + link to "Learn more"
- **Computation**: After preview, analyzes adjacent stitch pairs; computes WCAG relative luminance contrast ratio; flags if < 2 (weak contrast)
- **Styling**: `padding: 12px`, `background: '#fff9e6'` (light amber), `border-left: 4px solid #FFB800`, `borderRadius: 4`, `fontSize: var(--text-sm)`, `color: '#7A5D00'`

### EL-SCR-056-06: Preview Canvas (Mini)

- **Type**: Miniature canvas render (100px wide, scaled to fit)
- **Content**: Pattern rendered with current mapping applied
- **Styling**: `width: 100%`, `maxWidth: 200`, `height: 'auto'`, `imageRendering: 'pixelated'`, `border: 1px solid var(--border)`, `borderRadius: var(--radius-md)`
- **Performance**: Redrawn via `renderMiniCanvas(canvas, pat, sW, sH, mapping)` whenever mapping changes (memoized)

### EL-SCR-056-07: Compare Tab

- **Type**: Split-screen or stacked before/after previews
- **Left** (or top): Original pattern with current palette
- **Right** (or bottom): Preview with new palette applied
- **Divider** (if split-screen, P2 feature): Draggable slider
- **Styling**: `display: 'flex'` (row on wide, column on narrow). Each pane `flex: 1`. Label ("Before" / "After") above/beside canvas.

### EL-SCR-056-08: Footer (Action Buttons)

- **Position**: Bottom of modal, sticky
- **Buttons** (right-aligned):
  - **Cancel**: `onClick={onClose}`, text "Cancel", secondary button
  - **Apply**: `onClick={handleApply}`, text "Apply", primary accent button. **Disabled** if no mapping computed.
- **Interaction**: Cancel â†’ closes without applying. Apply â†’ `applyMapping(pattern, mapping)` â†’ new pattern object â†’ `window.ProjectStorage.save()` (as duplicate or updateâ€”TBD) â†’ toast "Palette swapped".
- **Styling**: `padding: 16px`, `borderTop: 1px solid var(--border)`, `display: 'flex'`, `justifyContent: 'flex-end'`, `gap: 8px`

**Tablet**: Full-screen modal on mobile; side-in or modal on iPad. Preset grid reflows to 1 column.

---

## Dependencies & Global APIs

- **React 18**: `window.React`, `window.ReactDOM` (CDN UMD)
- **DMC/Anchor**: `window.DMC` (required), `window.ANCHOR` (optional)
- **Colour utils**: `window.findSolid()`, `window.findBest()`, `window.dE2()`, `window.rgbToLab()`, `window.rgbToOklab()`, `window.oklabToOklch()`, etc.
- **Icons**: `window.Icons` â€” methods: `check`, `x`, `lock`, `unlock`, `refresh`, `chevronRight`, `wand`, etc.
- **Helpers**: `window.fmtTimeL()`, `window.gridCoord()`, `window.findThreadInCatalog()`
- **Overlay**: `window.Overlay` ([components/Overlay.js](../../components/Overlay.js))
- **State hooks**: `window.useCreatorState()`, `window.useCanvas()`, `window.useApp()`, `window.usePatternData()`
- **Adaptation**: `window.AdaptationEngine` â€” methods: `proposeStash()`, `proposeBrand()`, `applyProposal()`
- **Match quality**: `window.MatchQuality` â€” methods: `tierLabel()`, `tierToken()`, `describeLabDiff()`
- **Storage**: `window.ProjectStorage`, `window.UserPrefs`, `window.Toast`

## VERIFICATION TODO

- [ ] `VER-SCR-014-01` [P1] AdaptModal header renders mode toggle + title correctly; no emoji
- [ ] `VER-SCR-014-02` [P2] Resizable split pane: dragging divider updates ratio; ratio persists to localStorage
- [ ] `VER-SCR-014-03` [P1] Threshold slider 1â€“25 Î”E; value display correct; debounce to localStorage verified
- [ ] `VER-SCR-014-04` [P1] Substitution table renders all colours; source/target cells distinct; MatchChip colour-codes by tier
- [ ] `VER-SCR-014-05` [P1] PickerPopover filters by tab; search debounced; row click updates `overrides` state
- [ ] `VER-SCR-014-06` [P2] Preview thumbnails render original + adapted correctly; canvas pixel rendering preserved
- [ ] `VER-SCR-014-07` [P1] Save button creates new project via `AdaptationEngine.applyProposal()`; original untouched; toast confirms
- [ ] `VER-SCR-014-TABLET` [P2] Modal scrolls body on narrow screens; scrim dismisses on tap; buttons 44px+
- [ ] `VER-SCR-016-01` [P1] ColourReplaceModal source swatch + heading rendered; search input autofocus
- [ ] `VER-SCR-016-02` [P1] Thread list filters by DMC ID/name; source row disabled; target row click applies
- [ ] `VER-SCR-016-03` [P1] Entry points: right-click source pre-selected; palette chip source from ID; Replace tool source from `cv.replaceSource`
- [ ] `VER-SCR-019-01` [P1] Wand tool options render: tolerance slider (0â€“100), contiguous toggle
- [ ] `VER-SCR-019-02` [P1] Operation mode buttons render SVG icons; clicking updates `cv.setSelectionOpMode()`
- [ ] `VER-SCR-019-03` [P1] Selection status shows "N stitches selected"; quick action buttons functional
- [ ] `VER-SCR-019-04` [P1] Confetti panel renders; slider 1â€“10; Preview + Apply buttons functional; status shows count
- [ ] `VER-SCR-019-05` [P1] Reduce colours panel renders; target input range 1â€“selColours; preview shows merge pairs; Apply functional
- [ ] `VER-SCR-019-06` [P1] Replace colour panel renders; source/target dropdowns; fuzzy toggle controls slider; Apply disabled if !source || !target
- [ ] `VER-SCR-019-07` [P1] Stitch info renders table (Colour, DMC, Name, Stitches, Skeins); Export CSV button downloads `.csv`
- [ ] `VER-SCR-019-08` [P1] Outline panel renders; text input validates DMC ID; Generate button disabled if invalid
- [ ] `VER-SCR-020-01` [P1] Pattern info popover anchored to trigger; Escape closes; click-outside dismisses
- [ ] `VER-SCR-020-02` [P1] Pattern dimensions grid renders (Size, Fabric, Stitchable, Colours, Skeins); values formatted correctly
- [ ] `VER-SCR-020-03` [P1] Stitchability badge renders if `solidPct` defined; format "[pct]% solid"
- [ ] `VER-SCR-020-04` [P1] Difficulty section renders tier badge + score; if factors array: factor bars + formula disclosure
- [ ] `VER-SCR-020-05` [P1] Time estimate rows computed from stitchability + stitchSpeed (default 30); formatted via `fmtTimeL()`
- [ ] `VER-SCR-020-TABLET` [P2] On iPad portrait, render as bottom sheet (~50% height) with swipe-down dismiss + scrim tap
- [ ] `VER-SCR-056-01` [P1] Palette Swap modal renders tab navigation (Presets / Custom / Compare); tab switching functional
- [ ] `VER-SCR-056-02` [P1] Presets tab renders grid of cards (2â€“3 columns on desktop, 1 on mobile); tier selection automatic
- [ ] `VER-SCR-056-03` [P1] Custom tab renders hue shift slider (0â€“360), harmony picker, lock toggles; recompute on change
- [ ] `VER-SCR-056-04` [P1] Mapping table renders (Source | â†’ | Target | Count | Î”E | Actions); locked rows opacity 0.5
- [ ] `VER-SCR-056-04a` [P1] Î”E badges colour-coded by tier; correct thresholds (dE < 1 / â‰¤ 3 / > 3)
- [ ] `VER-SCR-056-04b` [P1] Lock toggle button renders lock/unlock icon; clicking updates `lockedIds` set; proposal recomputes
- [ ] `VER-SCR-056-04c` [P2] Similar popover opens; lists top 5 similar DMC threads; row click overrides target
- [ ] `VER-SCR-056-05` [P2] Contrast warning section appears if low-contrast pairs detected; threshold < 2 WCAG ratio
- [ ] `VER-SCR-056-06` [P1] Mini canvas renders pattern with mapping applied; pixel rendering preserved
- [ ] `VER-SCR-056-07` [P1] Compare tab shows before/after split or stack; labels clear
- [ ] `VER-SCR-056-08` [P1] Apply button creates new project; toast confirms swap
- [ ] `VER-SCR-056-TABLET` [P2] Modal full-screen on mobile; side-in on iPad; preset grid reflows to 1 column
