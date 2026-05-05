# Area Spec: creator-legend-export

## Scope

This spec covers the Legend and Export surfaces of the Pattern Creator (Prepare phase, Materials hub). Three screens are in scope:

- **SCR-007** Creator Legend tab: thread list with fabric calculator, materials summary
- **SCR-008** Creator Export tab: PDF/PNG/Bundle export with presets, format options, designer branding  
- **SCR-023** Creator Designer Branding Section: card for designer name, logo, copyright, contact info

**Note**: The Legend and Export tabs are rendered as sub-tabs within the Materials hub (LegendTab.js, ExportTab.js). Branding is a card section rendered inside the Export tab (DesignerBrandingSection.js).

---

## Screen: SCR-007 â€” Creator Legend Tab

Scope: Thread palette list, stash status, skein calculator, fabric configuration, export/share affordances.

### EL-SCR-007-01: Legend Summary Bar

**Severity**: P1 (Broken if missing or non-functional)

**Display**: Top-of-screen status row showing totals and stash match.

**Content**:
- Colour count (e.g. "24 colours")
- Skein count (e.g. "18 skeins")
- Stash summary (e.g. "Stash: 16/24 owned, 3 partial") â€” only shown if StashBridge available
- "Still needed" count (e.g. "~2 skeins needed") â€” red text, only when stash present and not all owned
- All-owned success state: background changes to `var(--success-soft)`, text shows "All colours in stash!" with Icons.check

**Buttons** (right-aligned, flex gap 6px):
1. "Copy list" button
   - Initial state: text "Copy list"
   - After click: shows Icons.check + "Copied" for 2s
   - On click: copies formatted text to clipboard via `navigator.clipboard.writeText()`
   - Format: Shopping List header, pattern size line, blank, thread lines (one per colour), total summary
   - Each line: "âœ“ DMC 310 â€” Black â€” 2 skeins (own 1)" (mark: âœ“ if owned, ~ if partial, â—‹ if needed)
   - Fallback: silent fail if clipboard unavailable (P2 TODO: test fallback)
2. "Share" button (conditional: only if `navigator.share` available AND not all owned)
   - On click: calls `navigator.share()` with title + list of threads needing purchase
   - P2 TODO: [tablet] min touch target 44Ã—44px
3. "Thread stash" link-button (new window)
   - Opens manager.html in new tab
   - Label: text + Icons.chevronRight
   - P2 TODO: [tablet] min touch target 44Ã—44px

**Styling**:
- Background: `var(--success-soft)` if all owned, else `var(--surface-secondary)`
- Border: `0.5px solid var(--border)` or border-colour matching background
- Border-radius: `var(--radius-md)`
- Padding: 9px 14px
- Font-size: `var(--text-sm)`
- Display: flex, align-items center, gap 10px, flex-wrap wrap

**Accessibility**:
- Buttons use aria-label for clarity
- Icons marked with aria-hidden="true"

---

### EL-SCR-007-02: Thread List Controls Row

**Severity**: P2 (Features may be unavailable)

**Display**: Subheader and filter/sort controls above the table.

**Layout**: flex row, gap `var(--s-2)`, flex-wrap wrap

**Content**:
1. Section heading: "Threads" (uppercase, font-weight 700, colour `var(--text-secondary)`, fontSize `var(--text-xs)`)
2. Divider: "|" (colour `#CFC4AC`)
3. Sort selector:
   - Label: "Sort:" (fontSize `var(--text-sm)`)
   - Dropdown options: "Thread number" | "Stitch count" | "Skeins needed" | "Stash status" (last only if StashBridge)
   - Default: "Thread number"
   - Sort logic per option:
     - "Thread number": numeric collation (310 before 500) via `Intl.Collator({numeric: true})`; non-numeric IDs follow alphabetically
     - "Stitch count": descending by `p.count`
     - "Skeins needed": descending by `r.needed`
     - "Stash status": order by level (needed=0, partial=1, owned=2)
   - Styling: padding 3px 8px, border-radius `var(--radius-sm)`, border 0.5px solid `var(--border)`, background `var(--surface)`, font-size `var(--text-xs)`
   - P2 TODO: [tablet] min touch target 44Ã—44px
4. "Mark all owned" button (conditional: only if StashBridge available AND not all already owned)
   - Initial state: text "Mark all owned"
   - After click: shows Icons.check + "Added" for 2.5s
   - On click: calls `StashBridge.updateThreadOwned(id, needed)` for each non-owned thread, then refreshes stash
   - Placed at right margin (marginLeft: auto)
   - P1 TODO: handle StashBridge errors (toast or silent fail)
   - P2 TODO: [tablet] min touch target 44Ã—44px

---

### EL-SCR-007-03: Screen Colour Accuracy Disclaimer (Dismissible)

**Severity**: P2 (Informational)

**Display**: Dismissible inline banner warning about screen colour approximations (colour-2 B3 requirement).

**Content**:
- Icon: Icons.info (aria-hidden)
- Text: "Colours are screen approximations. Use the DMC code as the authoritative reference and verify critical colours against a physical thread card."
- Close button: Icons.x (aria-label "Dismiss colour-accuracy notice")

**Visibility**: 
- Shown by default on first load
- Hidden once user clicks close
- Persisted in UserPrefs key `creatorColourDisclaimerDismissed`
- Conditional: `!disclaimerDismissed && h("div", ...)`

**Styling**:
- Display: flex, align-items flex-start, gap 8px
- Padding: 8px 12px
- Background: `var(--surface-secondary)`
- Border: 0.5px solid `var(--border)`
- Border-radius: `var(--radius-sm)`
- Margin-bottom: `var(--s-2)`
- Font-size: `var(--text-xs)`
- Colour: `var(--text-secondary)`
- Line-height: 1.45

---

### EL-SCR-007-04: Similar Colour Warning Bar

**Severity**: P2 (Feature; appearance only)

**Display**: Summary banner if any palette threads are Î”Eâ‚€â‚€ < 3.0 apart (colour-2 B3 approach).

**Content**:
- Icon: Icons.warning (aria-hidden)
- Text: "N palette colour(s) have a near-match â€” hover the warning icon next to a thread name to see which."
- Condition: only shown if `similarCount > 0`

**Data**: Computed via `useMemo` as `similarPairs` object mapping thread ID â†’ {otherId, otherName, dE} for nearest colour if dE < 3.0

**Styling**:
- Display: flex, align-items center, gap 6px
- Padding: 6px 10px
- Background: `#FBF1E1`
- Border: 0.5px solid `var(--border)`
- Border-radius: `var(--radius-sm)`
- Margin-bottom: `var(--s-2)`
- Font-size: `var(--text-xs)`
- Colour: `var(--accent-hover, #B7500A)`
- Line-height: 1.45

---

### EL-SCR-007-05: Thread List Table

**Severity**: P0 (Core feature)

**Display**: Scrollable table (max-height 440px) listing palette threads, sorted per EL-SCR-007-02.

**Columns** (left to right):
1. **Sym** (symbol): monospace, fontSize 15
   - Thread symbol character from symbolFontSpec (Unicode U+E000..U+E05F)
   - Assignment: most-used thread = U+E000, second-most = U+E001, etc.
2. **Swatch** (colour preview): 20Ã—20px box with thread RGB background, 1px border `var(--border)`, border-radius 3px
   - Keyboard-accessible: tabIndex 0, space/Enter opens popover (EL-SCR-007-06)
   - On click: triggers popover for colour detail
3. **DMC**: thread ID (e.g. "310"), bold, monospace, font-weight 600
4. **Name**: thread name or blend indicator (e.g. "Black" or "310 + 550"), colour `var(--text-secondary)`
   - Includes isolated stitch count badge (if `confettiCount > 0`): small red "â— N"
   - Includes similar-colour warning icon (if `similarPairs[id]`): clickable Icons.warning with comparison tooltip
   - Similar-colour icon: aria-label + role="button" + tabIndex 0 for keyboard access
5. **Type**: badge "Solid" or "Blend"
   - Solid: background `var(--success-soft)`, colour `var(--success)`
   - Blend: background `#F8EFD8`, colour `var(--accent-hover)`
6. **Stitches** (right-aligned): stitch count, localized number formatting
7. **Skeins** (right-aligned): skeins needed (calculated via `stitchesToSkeins()` or fallback `skeinEst()`)
8. **In stash** (conditional, right-aligned): skeins owned, green if > 0 else grey dash â€” only if StashBridge
9. **Status** (conditional): status badge (see EL-SCR-007-07) â€” only if StashBridge
10. **Done** (conditional, right-aligned): "X/Y" progress, green if done === total else grey â€” only if `ctx.done` exists

**Row interaction**:
- On click: sets `cv.hiId = thread.id` and switches to Pattern tab
- Highlighted row background: `#F8EFD8`
- Owned thread row background (if stash present): `var(--success-soft)`
- Striped: even rows transparent, odd rows `var(--surface-secondary)`
- Cursor: pointer
- Border-bottom: 0.5px solid `var(--surface-tertiary)`

**Table styling**:
- Border-collapse: collapse
- Font-size: `var(--text-sm)`
- Max-height: 440px, overflow-y auto
- Border: 0.5px solid `var(--border)`, border-radius `var(--radius-md)`

**Header styling**:
- Font-size: `var(--text-xs)`, font-weight 700
- Colour: `var(--text-tertiary)`
- Text-transform: uppercase
- Background: `var(--surface-secondary)`
- Border-bottom: 2px solid `var(--border)`
- Padding: 6px 10px

**Accessibility**:
- Rows tabIndex 0, activated via Enter/Space
- Aria-label on swatch for colour details
- Similar-colour icon: title + aria-label + role="button" for a11y

**Performance**:
- P0 TODO: memoize sortedRows via useMemo to prevent re-renders on stash changes
- P1 TODO: virtualise rows if palette > 100 entries (currently not common)

---

### EL-SCR-007-06: Swatch Detail Popover

**Severity**: P2 (Secondary feature)

**Display**: Floating popover anchored to clicked swatch (colour-2 C2).

**Content**:
- Thread ID, Name
- RGB hex and decimal values
- Colour preview (larger, ~60Ã—60px)
- If near-match exists: "Compare with DMC [other ID] â€” Î”Eâ‚€â‚€ [value]"

**Trigger**:
- Click on a swatch in the table
- Space/Enter on focussed swatch

**State**: single popover at a time (`popoverThread` state); dismissed via Escape or scrim click

**Anchor**: positioned relative to swatch `getBoundingClientRect()`

**P2 TODO**: [tablet] touch-dismissible (scrim click) implementation

---

### EL-SCR-007-07: Similar Colour Comparator (Expanded Row)

**Severity**: P2 (Feature; colour-2 C3)

**Display**: Full-width expansion row below a thread row, comparing two near-matching threads side-by-side.

**Trigger**:
- Click warning icon in thread Name column
- Toggles expanded state for that pair

**Content**:
- Calls `window.SimilarColourComparator` component:
  - Props: `threadA`, `threadB` (each {id, name, rgb}), `dE`, `onDismiss` callback
  - Renders side-by-side colour swatches, names, Î”E distance, dismiss button

**Dismissed pairs**: tracked locally in `dismissedPairsRef` Set per component instance; not persisted

**Styling**:
- Row background: `var(--surface)`
- Column span: full table width
- Padding: 0 10px 8px

**P1 TODO**: implement SimilarColourComparator if not yet available; ensure renders correctly at various text sizes

---

### EL-SCR-007-08: Fabric Configuration Card (Right Column)

**Severity**: P1 (Broken if non-functional)

**Display**: Two-column layout; right column shows fabric settings and calculator.

**Sections**:

#### a) Fabric Count Selector
- Label: "Count:"
- Dropdown: FABRIC_COUNTS constant (11, 14, 16, 18)
- On change: calls `ctx.setFabricCt(value)`
- P2 TODO: [tablet] min touch target 44Ã—44px

#### b) Over-Two Checkbox
- Label: "Stitching over two"
- On toggle: divides effective fabric count by 2 for calculations

#### c) Margin Input
- Label: "Margin:" (unit: inches per side)
- Number input (min 0, max 10, step 0.5)
- On change: recalculates finished size

#### d) Unit Selector (Button Group)
- Two toggle buttons: "Inches" | "Centimetres"
- Active button: background `var(--accent-light)`, colour `var(--accent)`, border `var(--accent)`
- Inactive: background `var(--surface)`, colour `var(--text-secondary)`, border `var(--border)`

#### e) Fabric Colour Preview (colour-2 B3)
- Label: "Preview against fabric:"
- Preset buttons (26Ã—26px each):
  - White Aida, Antique White, Cream Evenweave, Natural Linen, Black Aida
  - Selected button: border `var(--accent)`, box-shadow glow
  - On select: calls `setFabricColour(hex)`
- Custom colour picker: eyedropper icon, hidden `<input type="color">`
- Description: "Stitched cells appear over this fabric in the Pattern view."
- P2 TODO: [tablet] touch target 26Ã—26px â†’ consider 32Ã—32

**Calculated Size Display**:
- Formula: `(pattern_width / effective_fabric_count + marginÃ—2)` for both dimensions
- Units: inches (with ") or centimetres (with " cm")
- Updated on fabric count, margin, or unit change

**Styling**:
- Card background: `var(--surface-secondary)`
- Border: 0.5px solid `var(--border)`, border-radius 8px 8px 0 0
- Padding: 10px 12px
- Display: flex, flex-direction column, gap `var(--s-2)`

---

## Screen: SCR-008 â€” Creator Export Tab

Scope: PDF, PNG, and Bundle export with presets, customisation, branding, progress UI.

**Render condition**: `app.tab === "materials" && app.materialsTab === "output"`

---

### EL-SCR-008-01: "Open in Stitch Tracker" Quick Action

**Severity**: P2 (Secondary feature)

**Display**: Top-of-screen CTA button.

**Label**: Icons.thread + " Open in Stitch Tracker " + Icons.chevronRight

**Styling**:
- Padding: 12px 20px
- Font-size: `var(--text-lg)`
- Border-radius: `var(--radius-md)`
- Border: none
- Background: `var(--accent-hover)`
- Colour: `var(--surface)`
- Font-weight: 600
- Display: flex, align-items center, justify-content center, gap `var(--s-2)`
- Cursor: pointer

**On click**: calls `app.handleOpenInTracker()` (navigates to stitch.html or tracker page)

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-02: Quick Presets Cards

**Severity**: P1 (Core feature)

**Display**: Two large preset cards.

**Card 1: "For Pattern Keeper"**
- Title: "For Pattern Keeper"
- Badge: "PK Compatible" (background `var(--success)`, white text)
- Description: "Symbols + colour, medium print, 2-row overlap, cover page on. Customers can highlight and track stitches in Pattern Keeper."
- On click: applies preset via `applyPreset("patternKeeper")`
  - Sets: pageSize="auto", marginsMm=12, stitchesPerPage="medium", chartModes=[bw, colour], overlap=true, includeCover/Info/Index/MiniLegend=true
- Active state: background `var(--accent)`, colour `var(--surface)`, border `var(--accent)`

**Card 2: "For printing (home)"**
- Title: "For printing (home)"
- Description: "Colour + B&W charts, large print, no overlap, cover page off. Easier on the eyes when stitching from paper."
- On click: applies preset via `applyPreset("homePrinting")`
  - Sets: pageSize="auto", marginsMm=12, stitchesPerPage="large", chartModes=[bw, colour], overlap=false, includeCover=false, includeInfo/Index/MiniLegend=true
- Active state: same as Card 1

**Styling** (each card):
- Flex: 1
- Padding: 14px
- Border-radius: `var(--radius-lg)`
- Border: 1.5px solid `#CFC4AC` (active: `var(--accent)`)
- Background: `var(--surface)` (active: `var(--accent)`)
- Cursor: pointer
- Text-align: left
- Display: flex, flex-direction column, gap `var(--s-1)`

**Accessibility**:
- Semantic button elements
- Active state indicated visually

**P2 TODO**: [tablet] min touch target 44Ã—44px per card

---

### EL-SCR-008-03: Format & Settings Collapsible Section

**Severity**: P1 (Core feature)

**Display**: Toggle to expand/collapse customisation panel.

**Header** (toggle button):
- Text: "Format & settings"
- Icon: Icons.chevronUp (open) | Icons.chevronDown (closed)
- Styling: 
  - Background `var(--surface)`, border 1px solid `var(--border)`, border-radius `var(--radius-md)`
  - Padding 10px 14px, font-size `var(--text-md)`, font-weight 600, colour `var(--text-primary)`
  - Display: flex, justify-content space-between, align-items center, width 100%, text-align left, cursor pointer

**Content panel** (when expanded):
- Background `var(--surface)`, border 1px solid `var(--border)` (borderTop: none), border-radius 0 0 8px 8px
- Padding: 14px

---

### EL-SCR-008-04: Format Selector (PDF vs PNG)

**Severity**: P1 (Core feature)

**Display**: Radio button group.

**Options**:
- "PDF" (exportFormat = "pdf", default)
- "PNG" (exportFormat = "png")

**Styling** (each label):
- Display: inline-flex, align-items center, gap 6px
- Margin-right: 16px
- Font-size: `var(--text-sm)`, cursor pointer

**On change**: sets `exportFormat[1](value)`

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-05: Page Size Dropdown (PDF)

**Severity**: P2 (Feature)

**Label**: "Page size"

**Options**:
- "Auto (A4 / Letter from locale)" â†’ resolves per `navigator.language` (A4 default, Letter for en-US/en-CA)
- "A4 (210 Ã— 297 mm)"
- "US Letter (8.5 Ã— 11 in)"

**Styling**:
- Padding 6px 10px, border-radius `var(--radius-sm)`, border 1px solid `#CFC4AC`
- Font-size `var(--text-sm)`, width 100%

**Persists to UserPrefs**: `exportPageSize`

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-06: Page Margin Input (mm)

**Severity**: P2 (Feature)

**Label**: "Page margin (mm)"

**Input**:
- Type: number, min 10, max 30
- Default: 12
- Styling: same as page size dropdown

**Persists to UserPrefs**: `exportMarginsMm`

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-07: Stitches Per Page Selector

**Severity**: P1 (Core feature)

**Options**:
- "Small print (~80 Ã— 100, ~2mm cells)"
- "Medium print (~60 Ã— 70, ~2.8mm cells, ideal for PK)" (default)
- "Large print (~40 Ã— 50, ~4mm cells, easier to read)"
- "Custom"

**When "Custom" selected**: reveals two number inputs
- "cols Ã—" (min 10, max 200, step 10)
- "rows" (min 10, max 200, step 10)
- Width: 90px each, same padding/border as other inputs

**Persists to UserPrefs**: `exportStitchesPerPage`, `exportCustomCols`, `exportCustomRows`

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-08: Chart Modes Checkboxes

**Severity**: P0 (Broken if missing)

**Options**:
1. "Symbols on white (B&W)" (modeBw state)
2. "Colour blocks with symbols" (modeColour state)

**Validation**: At least one must be checked
- If neither checked: export button disabled (EL-SCR-008-13)
- Error message: "Pick at least one chart mode (B&W or Colour)."

**Styling** (each label):
- Display: inline-flex, align-items center, gap 6px
- Margin-right: 16px
- Font-size `var(--text-sm)`, cursor pointer

**Persists to UserPrefs**: `exportChartModeBw`, `exportChartModeColour`

**P0 TODO**: validate at least one mode before export

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-09: Additional PDF Options (Checkboxes)

**Severity**: P2 (Features)

**Options** (flex row, gap 14px, flex-wrap):
1. "2-row/column overlap zone" (overlap) â€” repeats 2 rows/cols on adjacent pages
2. "Cover page" (includeCover) â€” pattern preview + title on first page
3. "Info page" (includeInfo) â€” stitch counts, fabric, materials
4. "Chart index" (includeIndex) â€” table of contents (only for multi-page PDFs)
5. "Mini-legend strip on each page" (miniLegend) â€” 32-thread legend footer

**Styling**: inline-flex, align-items center, gap 6px, cursor pointer, font-size `var(--text-sm)`

**Persists to UserPrefs**: `exportOverlap`, `exportIncludeCover`, `exportIncludeInfo`, `exportIncludeIndex`, `exportMiniLegend`

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-10: Workshop Print Theme Toggle (Opt-In)

**Severity**: P0 (PK-compat; must not affect default)

**Display**: Checkbox with dashed border above, separated from other options.

**Label**: "Workshop print theme (terracotta grid + linen background)" (min-height 44px, font-weight 600)

**Description** (sub-text):
- "Off by default. Pattern Keeper compatibility uses the standard black-grid output."
- Font-size `var(--text-xs)`, colour `var(--text-secondary)`

**Behaviour**:
- Off (default): PDF uses Pattern Keeper-compatible theme (black grid, white background) â€” bit-stable
- On: PDF uses Workshop visual direction (terracotta grid, linen background) â€” opt-in, non-PK

**Persists to UserPrefs**: `creator.pdfWorkshopTheme` (key must NOT change)

**P0 TODO**: VER-EL-SCR-008-10-01 â€” PK-compat PDF byte output is unchanged from baseline when workshop theme is OFF

**P0 TODO**: verify pdf-export-worker.js, pdfChartLayout.js, pdfExport.js are NOT modified without explicit PK regression check

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-11: Page Count Preview

**Severity**: P2 (Informational)

**Display**: Computed via `pdfChartLayout.computePageGeometry()`.

**Content**: 
"Will produce ~N pages (chart grid: W Ã— H stitches per chart page, cell â‰ˆ M mm)."

Example: "Will produce ~12 pages (chart grid: 60 Ã— 70 stitches per chart page, cell â‰ˆ 2.80 mm)."

**Visibility**: only if `pageGeom` computes successfully

**Styling**: font-size `var(--text-xs)`, colour `var(--text-tertiary)`, margin-top `var(--s-3)`

---

### EL-SCR-008-12: Designer Branding Pointer

**Severity**: P2 (Informational)

**Display**: Inline note pointing to Preferences.

**Content**: 'Designer branding (name, logo, copyright) is now in **File â†’ Preferences**. Settings there apply to every PDF you export.'

**Styling**:
- Background `var(--surface-secondary)`, border 1px solid `var(--border)`, border-radius `var(--radius-md)`
- Padding 10px 14px, font-size `var(--text-sm)`, colour `var(--text-secondary)`

---

### EL-SCR-008-13: Export Button (PDF or PNG)

**Severity**: P0 (Core interaction)

**Label**: "Export PDF" (if format === "pdf") or "Export PNG" (if format === "png")

**Styling**:
- Padding 14px 22px, font-size `var(--text-xl)`, border-radius `var(--radius-lg)`
- Border: none
- Background `var(--accent)` (normal) or `var(--text-tertiary)` (disabled)
- Colour `var(--surface)`
- Font-weight 700
- Box-shadow 0 1px 3px rgba(0,0,0,0.1)
- Cursor pointer (normal) or "not-allowed" (disabled)

**Disabled state**:
- Condition: `format === "pdf" && modesArr.length === 0`
- Attribute: `disabled={true}`

**On click**:
- If PNG: calls `doExportPng()`
  - Renders pattern to canvas (10px per cell)
  - Converts to PNG blob
  - Downloads via blob URL + `<a download>`
- If PDF: calls `doExport()`
  - Validates `modesArr.length > 0`
  - Builds export project (pattern + metadata)
  - Calls `window.PdfExport.runExport(project, opts, onProgress)`
  - Shows progress UI (EL-SCR-008-15)

**P0 TODO**: VER-EL-SCR-008-13-01 â€” export disabled iff no modes selected

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-14: Error Message Display

**Severity**: P1 (User feedback)

**Display**: Inline error banner (conditional).

**Styling**:
- Background `var(--danger-soft)`, border 1px solid `var(--danger-soft)`
- Border-radius `var(--radius-md)`, padding 10px
- Font-size `var(--text-sm)`, colour `var(--danger)`

**Content**: error message from `errorState` (e.g. "Pick at least one chart modeâ€¦", "PDF export failedâ€¦")

**Dismissal**: error clears on next export attempt

**Accessibility**:
- P1 TODO: add role="alert" for screen reader announcement

---

### EL-SCR-008-15: PDF Export Progress UI

**Severity**: P1 (Core feature; user feedback)

**Display**: Live progress bar + cancel button (when `progressState[0]` not null).

**Content**:
- Title: "Generating PDFâ€¦ X of Y pages"
- Progress bar: background `var(--border)`, fill `var(--accent)`, height 8px, border-radius 4px
  - Width: percentage of (current / total)
  - Transition: width 120ms ease-out
- Cancel button: "Cancel" (red text, border 1px solid `var(--danger-soft)`)

**Styling** (container):
- Background `var(--surface-tertiary)`, border 1px solid `#CFC4AC`, border-radius `var(--radius-lg)`
- Padding `var(--s-4)`

**Progress data**: `{stage, current, total}` updated via `onProgress` callback

**Cancel on click**:
- Sets `runningRef.current = null` (stale-result check)
- Calls `window.PdfExport.cancelAll()` (terminates worker)
- Clears progress UI

**Button styling**:
- Padding 8px 18px, font-size `var(--text-md)`, border-radius `var(--radius-md)`
- Border 1px solid `var(--danger-soft)`, background `var(--surface)`, colour `var(--danger)`
- Font-weight 600, cursor pointer

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-008-16: Bundle (ZIP) Export Section

**Severity**: P2 (Feature)

**Display**: Secondary section below PDF/PNG, separated by top border.

**Header**: "Download as bundle" (font-size `var(--text-md)`, font-weight 600, colour `var(--text-primary)`)

**Description**: "One .zip with the PDF chart, OXS pattern, PNG preview, JSON snapshot, and a manifest. Useful for archiving or sharing the finished project."

**Content** (conditional):
- If bundling (`bundleState[0]`):
  - Shows progress message (e.g. "Preparing bundleâ€¦", "Rendering PDFâ€¦", "Compressingâ€¦")
  - Styling: background `var(--surface-tertiary)`, border 1px solid `#CFC4AC`, border-radius `var(--radius-md)`, padding 10px, font-size `var(--text-sm)`
- Else (default):
  - "Download bundle" button (Icons.archive + "Download bundle")
  - On click: calls `doExportBundle()`
    - Assemble PDF + PNG + OXS + JSON in parallel
    - Warns if bundle > 50MB on touch devices (pointer: coarse media query)
    - Calls `window.ZipBundle.build()` + downloads or shares

**Styling** (section):
- Border-top 1px solid `var(--border)`, margin-top `var(--s-1)`, padding-top 14px
- Display flex, flex-direction column, gap `var(--s-2)`

**P1 TODO**: handle large-file warning gracefully

**P2 TODO**: [tablet] min touch target 44Ã—44px for button

---

## Screen: SCR-023 â€” Creator Designer Branding Section

Scope: Form card for designer metadata (name, logo, copyright, contact). Rendered inside Export tab.

**Render condition**: embedded in ExportTab; always visible in Export tab

---

### EL-SCR-023-01: Branding Section Header & Description

**Severity**: P1 (Informational)

**Display**: Card title and description.

**Title**: "Designer branding" (h4, margin 0 0 8px, font-size 13, colour `#0f172a`)

**Description**: "These settings apply to every PDF you export. They live on this device only." (p, font-size 11, colour `#8A8270`, margin 0 0 12px)

**Styling** (card):
- Background `#fff`, border 1px solid `#E5DCCB`, border-radius 8px, padding 14px

---

### EL-SCR-023-02: Designer Name & Contact Inputs

**Severity**: P1 (Core feature)

**Display**: Two-column grid.

**Column 1: Designer / Shop Name**
- Label: "Designer / shop name" (font-size 11, font-weight 600, colour `#3f3f46`)
- Input: text, placeholder "Your shop name"
- On change: calls `update("designerName", value)` â†’ UserPrefs.set()
- Persisted to UserPrefs: `designerName` (default: "")

**Column 2: Contact / Website**
- Label: "Contact / website" (same styling)
- Input: text, placeholder "yourshop.example"
- On change: calls `update("designerContact", value)` â†’ UserPrefs.set()
- Persisted to UserPrefs: `designerContact` (default: "")

**Input styling**:
- Padding 6px 10px, border-radius 6px, border 1px solid `#CFC4AC`
- Font-size 13px, width 100%, box-sizing border-box

**Grid styling**:
- Display grid, grid-template-columns 1fr 1fr, gap 10px, margin-bottom 10px

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-023-03: Logo Upload Section

**Severity**: P1 (Feature)

**Display**: Three-column layout (flex gap 12px, align-items flex-start).

**Column 1: Logo Upload (flex: 0 0 110px)**

**Label**: "Logo" (same label styling)

**Placeholder** (if logo not uploaded):
- Dashed-border button: "Upload logo"
- Styling: width 100px, height 100px, border 1.5px dashed `#CFC4AC`, border-radius 6, background `#f8fafc`, cursor pointer, font-size 11, colour `#8A8270`
- On click: triggers hidden file input

**Preview** (if uploaded):
- Image preview: 100Ã—100px, border 1px solid `#CFC4AC`, border-radius 6, background `#fafafa`
- Max-width/max-height 100% (centred via flex)
- Overflow hidden

**File input**: hidden, accept `image/png,image/jpeg`

**Logo management buttons** (after upload):
- "Replace" button (font-size 11, padding 4px 8px, border 1px solid `#CFC4AC`, border-radius 6, background `#fff`, cursor pointer)
  - On click: trigger file input
- "Remove" button (font-size 11, padding 4px 8px, border 1px solid `#ECC8C8`, border-radius 6, background `#fff`, colour `#8A2E2E`, cursor pointer)
  - On click: calls `clearLogo()` â†’ `update("designerLogo", null)`

**Button row styling**: display flex, gap 6px, margin-top 6px

**Logo downscaling** (on upload):
- Max dimension: 600px (longest side)
- JPEG: 90% quality (lossy)
- PNG: preserved (lossless, transparency retained)
- Converted to data URL for localStorage storage

**Persisted to UserPrefs**: `designerLogo` (data URL string or null)

**P0 TODO**: VER-EL-SCR-023-03-01 â€” verify PNG alpha channel preserved during downscaling

**P1 TODO**: file size validation (suggest max 5MB)

**P2 TODO**: [tablet] min touch target 44Ã—44px for buttons

---

### EL-SCR-023-04: Logo Position Radio Buttons

**Severity**: P2 (Feature)

**Display**: Two radio buttons (top-left vs top-right).

**Label** (group): "Logo position" (label styling)

**Options**:
1. "Top-left" (value: "top-left")
2. "Top-right" (value: "top-right", default)

**Styling** (each label):
- Display flex, align-items center, gap 4px, cursor pointer, font-size 12px

**On change**: calls `update("designerLogoPosition", value)` â†’ UserPrefs.set()

**Persisted to UserPrefs**: `designerLogoPosition` (default: "top-right")

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-023-05: Copyright Notice Textarea

**Severity**: P2 (Feature)

**Label**: "Copyright notice" (label styling, margin-top 12px)

**Input**:
- Type textarea, rows 2
- Placeholder "Â© 2026 Your Shop. For personal use only."
- Styling: padding 6px 10px, border-radius 6, border 1px solid `#CFC4AC`, font-size 13, width 100%, box-sizing border-box, resize vertical, font-family inherit
- On change: calls `update("designerCopyright", value)` â†’ UserPrefs.set()

**Persisted to UserPrefs**: `designerCopyright` (default: "")

**P2 TODO**: [tablet] min touch target 44Ã—44px

---

### EL-SCR-023-06: Branding Data Flow

**Severity**: P1 (Core feature)

**Lifecycle**:
1. On mount: calls `readPrefs()` â†’ returns all 5 keys (or defaults if missing)
2. On input change: local state updates + `UserPrefs.set(key, value)` writes to localStorage
3. On export: `window.PdfExport.readBranding()` reads current prefs + merges with project-level override
4. Project override: if `app.projectDesigner` is set, it overrides `designerName` in PDF only

**UserPrefs keys**:
- `designerName` (default: "")
- `designerLogo` (default: null)
- `designerLogoPosition` (default: "top-right")
- `designerCopyright` (default: "")
- `designerContact` (default: "")

**P1 TODO**: verify UserPrefs.set() calls dispatch cs:prefsChanged event; add manual dispatch if needed

**P0 TODO**: VER-EL-SCR-023-06-01 â€” branding visible on PDF cover page, info page, footers

**P1 TODO**: VER-EL-SCR-023-06-02 â€” per-project designer override (app.projectDesigner) takes precedence

---

## DISCOVERED.md Appendix

### Data Sources & Helpers

| Source | Details |
|--------|---------|
| Pattern context (ctx) | pat (cell array), pal (palette), sW/sH, fabricCt, bsLines, partialStitches, colourDoneCounts |
| Canvas state (cv) | hiId (highlighted thread ID) |
| App state (app) | tab, materialsTab, projectName/Designer/Description, confettiData, handleOpenInTracker |
| Global singletons | StashBridge, UserPrefs, PdfExport, PdfChartLayout, ZipBundle, Icons |
| Helper functions | stitchesToSkeins(), skeinEst(), threadKey(), findNearestSimilarThread(), similarPairKey() |

### CSS Token Names (No raw hex)

Primary: `--accent`, `--accent-hover`, `--accent-light`, `--accent-2`, `--surface`, `--surface-secondary`, `--surface-tertiary`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-xs/sm/md/lg/xl`, `--success`, `--success-soft`, `--danger`, `--danger-soft`, `--radius-sm/md/lg`, `--s-1/2/3/4`, `--border`, `--line`

Bespoke: `#CFC4AC` (tan border), `#F8EFD8` (blend badge background), `#8A8270` (secondary grey), `#0f172a` (dark text), `#FBF1E1` (warning background), `#E5DCCB` (card border), `#fff`/`#fafafa` (whites)

### File Dependencies

| Screen | File | Imports |
|--------|------|---------|
| SCR-007 | [creator/LegendTab.js](../../creator/LegendTab.js) | usePatternData, useCanvas, useApp, stitchesToSkeins, skeinEst, FABRIC_COUNTS, StashBridge, UserPrefs, Icons |
| SCR-008 | [creator/ExportTab.js](../../creator/ExportTab.js) | usePatternData, useApp, UserPrefs, PdfExport, PdfChartLayout, ZipBundle, CreatorDesignerBrandingSection, Icons, Toast |
| SCR-023 | [creator/DesignerBrandingSection.js](../../creator/DesignerBrandingSection.js) | UserPrefs |

### Reference-Only Files (Do NOT modify)

- [pdf-export-worker.js](../../pdf-export-worker.js) â€” Bit-stable PK-compat. Any change risks compatibility.
- [creator/pdfExport.js](../../creator/pdfExport.js) â€” Worker wrapper; preset logic frozen for PK-compat.
- [creator/pdfChartLayout.js](../../creator/pdfChartLayout.js) â€” Page geometry; pure functions; changes affect preview.
- [creator/symbolFontSpec.js](../../creator/symbolFontSpec.js) â€” Symbol glyphs; do not edit without font rebuild (`node build-symbol-font.js`).

---

## VERIFICATION TODO

### SCR-007 Legend Tab
- [ ] VER-EL-SCR-007-01-01 [P2] â€” Clipboard fallback for old browsers
- [ ] VER-EL-SCR-007-02-01 [P1] â€” Sort order correct for all options
- [ ] VER-EL-SCR-007-03-01 [P2] â€” Disclaimer dismissal persists (localStorage)
- [ ] VER-EL-SCR-007-04-01 [P2] â€” Similar pairs computed correctly
- [ ] VER-EL-SCR-007-05-01 [P1] â€” Row click highlights thread on canvas
- [ ] VER-EL-SCR-007-06-01 [P2] â€” Popover positioned correctly (no clipping)
- [ ] VER-EL-SCR-007-08-01 [P1] â€” Fabric size formula correct (sW / fabricCt + marginÃ—2)
- [ ] VER-EL-SCR-007-08-02 [P2] â€” Colour preview integrates with canvas

### SCR-008 Export Tab
- [ ] VER-EL-SCR-008-02-01 [P1] â€” Presets apply all settings (pageSize, margins, overlap, etc.)
- [ ] VER-EL-SCR-008-05-01 [P2] â€” Auto page-size resolves per locale
- [ ] VER-EL-SCR-008-08-01 [P1] â€” At least one chart mode required
- [ ] VER-EL-SCR-008-10-01 [P0] â€” PK-compat PDF byte output unchanged when workshop theme OFF
- [ ] VER-EL-SCR-008-13-01 [P1] â€” Export button disabled iff no modes selected
- [ ] VER-EL-SCR-008-13-02 [P2] â€” PNG export cell size = 10px per stitch
- [ ] VER-EL-SCR-008-15-01 [P2] â€” Progress bar updates smoothly; cancel terminates worker

### SCR-023 Designer Branding
- [ ] VER-EL-SCR-023-03-01 [P0] â€” PNG logo alpha channel preserved on downscale
- [ ] VER-EL-SCR-023-06-01 [P1] â€” Branding persists to localStorage
- [ ] VER-EL-SCR-023-06-02 [P1] â€” Project-level designer override takes precedence

### Cross-Cutting
- [ ] VER-TABLET-001 [P2] â€” All inputs min 44Ã—44px touch target
- [ ] VER-LEGEXP-A11Y-001 [P2] â€” Keyboard navigation works in Legend & Export tabs (tab, enter, space) â€” area-specific check; the global keyboard contract is owned by `VER-A11Y-001` in `reports/cross-cutting/keyboard-a11y.md`
- [ ] VER-LEGEXP-A11Y-002 [P2] â€” Screen reader announces all labels in Legend & Export tabs â€” area-specific check; the global ARIA contract is owned by `VER-A11Y-002` in `reports/cross-cutting/keyboard-a11y.md`
- [ ] VER-INTEGRATION-001 [P1] â€” StashBridge unavailable handled gracefully
- [ ] VER-INTEGRATION-002 [P2] â€” UserPrefs defaults respected for all export settings
