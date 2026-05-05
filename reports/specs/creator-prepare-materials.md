# Area Spec: creator-prepare-materials

> Phase 1B output. See reports/specs/00_INTERFACE_MAP.md for Screen IDs.

## Scope

This area covers the end-to-end workflow for preparing a cross-stitch pattern for production: importing or selecting an image, configuring palette and size, calculating materials (threads, time, cost), and bulk-managing stash inventory. It spans five entry points:

1. **SCR-055 (Materials Hub)** â€” container with three sub-sections (Threads/Stash/Output)
2. **SCR-006 (Prepare Materials tab)** â€” shopping list inside the Materials Hub
3. **SCR-009 (Project tab)** â€” planning: time, finished size, cost, thread organiser with stash status
4. **SCR-015 (BulkAdd Modal)** â€” bulk import/kit threads into the Stash Manager's database
5. **SCR-017 (Shopping List Modal)** â€” dedicated modal: "What do I need to buy?" with push-to-stash integration
6. **SCR-018 (ImportWizard)** â€” 5-step guided flow to convert an image to a pattern (experimental, behind `experimental.importWizard` UserPref)
7. **SCR-018aâ€“e** â€” individual wizard steps: Crop, Palette, Size, Preview, Confirm

### Key decision points

- **Palette source**: Full DMC â†’ Stash-only â†’ Limited count (max 5â€“80 colours)
- **Stash operations**: Add threads, mark as owned, push to shopping list in Manager
- **Materials math**: Skein estimates account for fabric count, strand count, waste factor, "over two"
- **Draft persistence**: ImportWizard saves state to localStorage (7-day TTL) to survive reload
- **Multi-brand**: BulkAddModal accepts DMC and Anchor; ShoppingListModal resolves by brand; palette builder is DMC-only (memory constraint: bare IDs used in pipeline would collide)
- **Tablet friendliness**: All inputs must be â‰¥44px touch target; layouts must not wrap awkwardly at iPad portrait/landscape

---

## Screen: SCR-055 â€” Creator Materials Hub

The container that replaces the three former top-level tabs (Materials/Prepare/Export) with a single page exposing three side-tabs: Threads (LegendTab), Stash (PrepareTab), Output (ExportTab). Sub-tab state persists via UserPref key `creator.materialsTab`.

### EL-SCR-055-01: Materials Hub Breadcrumb
- **Location**: SCR-055, header section, left side
- **Type**: Display
- **Data source**: Hardcoded + active sub-tab from app context
- **Display logic**: Shows "Materials & Output" root, chevron, then active sub-tab label (e.g., "Threads" / "Stash status" / "Output")
- **Update trigger**: Sub-tab change
- **Constraints**: Aria-hidden; for visual breadcrumb only

### EL-SCR-055-02: Sub-tab Navigation (tablist)
- **Location**: SCR-055, header below breadcrumb
- **Type**: Composite (tablist role)
- **Component**: [creator/MaterialsHub.js](creator/MaterialsHub.js#L75-L105)
- **Visible when**: Materials Hub active (app.tab === 'materials')
- **Default state**: First tab active ("Threads")

**Intended behaviour:**
- **Trigger**: Click on tab button or keyboard (Arrow Left/Right/Home/End)
- **Immediate feedback**: Tab appearance changes (border-bottom underline); content below updates
- **State mutation**: app.materialsTab updates; persists via UserPrefs
- **Navigation**: No page load; in-place tab content switch
- **Side effects**: None
- **Success outcome**: Active tab label/icon highlight; focus moves to active tab button
- **Error outcome**: N/A

**Keyboard**: Arrow Left/Right (previous/next), Home/End (first/last); Tab (next focusable); standard combobox pattern
**Constraints**: Each tab has icon + label; role="tab", aria-selected, tabIndex controlled
**Relationships**: Controls visibility of three child components (LegendTab, PrepareTab, ExportTab). Each child guards its own render via app.materialsTab check.

### EL-SCR-055-03: Sub-tab Label Icon (Threads)
- **Location**: SCR-055, tab button for "Threads"
- **Type**: Display (icon)
- **Data source**: window.Icons.thread()
- **Update trigger**: Static (per house style)
- **Display logic**: 24Ã—24 SVG, currentColor
- **Constraints**: Aria-hidden; no emoji; must match icon library style

### EL-SCR-055-04: Sub-tab Label Icon (Stash status)
- **Location**: SCR-055, tab button for "Stash status"
- **Type**: Display (icon)
- **Data source**: window.Icons.layers()
- **Update trigger**: Static
- **Display logic**: 24Ã—24 SVG, currentColor
- **Constraints**: As above

### EL-SCR-055-05: Sub-tab Label Icon (Output)
- **Location**: SCR-055, tab button for "Output"
- **Type**: Display (icon)
- **Data source**: window.Icons.download()
- **Update trigger**: Static
- **Display logic**: 24Ã—24 SVG, currentColor
- **Constraints**: As above

### EL-SCR-055-06: Tab Button â€” Threads
- **Location**: SCR-055, sub-tabs navigation
- **Type**: Button
- **Component**: [creator/MaterialsHub.js](creator/MaterialsHub.js#L120-L135)
- **Default state**: Active on first load

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button appearance highlights; border-bottom accent
- **State mutation**: app.setMaterialsTab('threads')
- **Side effects**: Persists to UserPrefs via setMaterialsTab wrapper
- **Success outcome**: LegendTab renders below

**Keyboard**: Enter/Space to activate; Tab to navigate
**Constraints**: Role="tab", aria-selected="true" when active
**Relationships**: EL-SCR-055-02

### EL-SCR-055-07: Tab Button â€” Stash status
- **Location**: SCR-055, sub-tabs navigation
- **Type**: Button
- **Component**: [creator/MaterialsHub.js](creator/MaterialsHub.js#L120-L135)
- **Default state**: Inactive

**Intended behaviour:** As EL-SCR-055-06, but activates PrepareTab (SCR-006)

### EL-SCR-055-08: Tab Button â€” Output
- **Location**: SCR-055, sub-tabs navigation
- **Type**: Button
- **Component**: [creator/MaterialsHub.js](creator/MaterialsHub.js#L120-L135)
- **Default state**: Inactive

**Intended behaviour:** As EL-SCR-055-06, but activates ExportTab (out of scope for this area)

---

## Screen: SCR-006 â€” Creator Prepare Materials tab

The shopping list view showing required vs. owned threads, skein estimates, fabric calculator, and one-tap stash operations.

### EL-SCR-006-01: Summary Banner
- **Location**: SCR-006, top
- **Type**: Display + Actions
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L110-L185)
- **Visible when**: Pattern loaded (ctx.pat && ctx.pal)
- **Data source**: Computed from pattern palette + global stash

**Intended behaviour:**
- Shows status: "You own X of N colours" or "All N colours in stash!"
- If partial, shows "X partial (low stock)"
- If not all owned, shows "Still need: Y colours, ~Z skeins"
- Icon: check mark if 100% owned; otherwise styled differently
- Right side has action buttons (Copy, Share, View thread stash)

**Display logic:**
- Count owned = rows.filter(r => r.status === 'owned').length
- Count partial = rows.filter(r => r.status === 'partial').length
- Skeins needed = sum of (needed - owned) where owned < needed
- Colour: green if complete; amber if partial; danger if missing

**Staleness:** Updates whenever ctx.pal or stash changes

### EL-SCR-006-02: Over Two Checkbox
- **Location**: SCR-006, controls row
- **Type**: Checkbox input + label
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L186-L197)
- **Visible when**: Always
- **Default state**: Unchecked (false)

**Intended behaviour:**
- **Trigger**: User clicks checkbox or label
- **Immediate feedback**: Checked state toggles; shopping list recomputes instantly
- **State mutation**: overTwo state variable toggles; affects effectiveFabric calculation
- **Success outcome**: Stitches per skein estimate updates; table rows recalculate
- **Error outcome**: N/A

**Constraints**: When checked, fabricCt is divided by 2 for effective count calculations
**Relationships**: Affects EL-SCR-006-04 (thread table) and EL-SCR-006-07 (fabric calculator)

### EL-SCR-006-03: Sort Dropdown
- **Location**: SCR-006, controls row
- **Type**: Dropdown select
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L197-L205)
- **Visible when**: Always
- **Default state**: "Thread number"

**Intended behaviour:**
- **Trigger**: Change option
- **Immediate feedback**: Table rows reorder immediately
- **State mutation**: sort state updates
- **Success outcome**: Table reflects new sort order

**Options:**
1. "Thread number" â€” DMC ID numeric order (310 < 321 < 550)
2. "Stitch count" â€” highest stitches first
3. "Skeins needed" â€” most skeins needed first
4. "Status" â€” needed â†’ partial â†’ owned

**Keyboard**: Standard <select> (Arrow Up/Down, Enter)
**Constraints**: Numeric collator used for ID sorting (natural order)
**Relationships**: Controls visual order of EL-SCR-006-04

### EL-SCR-006-04: Thread Shopping List Table
- **Location**: SCR-006, main content area
- **Type**: Display (table)
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L212-L310)
- **Data source**: Computed from ctx.pal + stash lookups + sort state
- **Visible when**: Pattern loaded
- **Display logic:**
  - Each row = one palette entry (solid or blend)
  - Columns: Colour swatch | DMC ID | Name | Stitches | Skeins needed | In stash | Status badge
  - Row styling:
    - Owned = green background
    - Partial = amber background
    - Needed = white/transparent
- **Update trigger**: Palette change, stash change, sort change, over-two toggle
- **Loading state:** Shows only if ctx.pat && ctx.pal; guards before useMemo
- **Empty state:** N/A (at least one thread always present in a valid pattern)
- **Staleness:** Recomputes on every sort/stash/palette change; no polling

**Row elements:**
- Colour swatch (20Ã—20 px, border-radius 4px, 0.5px border)
- Thread ID (fontWeight 600)
- Thread name (colour secondary)
- Stitch count (right-aligned, formatted with toLocaleString)
- Skeins needed (right-aligned, bold)
- In stash (right-aligned; "â€”" if 0, number if > 0)
- Status badge (inline-flex; label + background colour)

**Constraints:**
- Max-height 480px; overflow-y auto
- Blend threads: name is "thread1 + thread2"
- Stitches per skein calculated via `stitchesToSkeins()`; fallback to 800-stitch estimate if function missing

### EL-SCR-006-05: Status Badge â€” Owned
- **Location**: SCR-006, thread table status column
- **Type**: Badge (display)
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L302-L310)
- **Data source**: Computed from row.status
- **Display logic:** "You own this" label + success-soft background + success colour
- **Staleness:** Recomputed per row as stash updates

### EL-SCR-006-06: Status Badge â€” Partial
- **Location**: SCR-006, thread table status column
- **Type**: Badge (display)
- **Data source:** Computed
- **Display logic:** "Low stock" label + #F8EFD8 background + accent-hover colour

### EL-SCR-006-07: Status Badge â€” Needed
- **Location**: SCR-006, thread table status column
- **Type**: Badge (display)
- **Data source:** Computed
- **Display logic:** "Need to buy" label + danger-soft background + danger colour

### EL-SCR-006-08: Copy List Button
- **Location**: SCR-006, summary banner (right side)
- **Type**: Button
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L126-L155)
- **Visible when**: Summary banner visible
- **Default state**: Not copied

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button label changes to "Copied" with check icon; reverts after 2s
- **State mutation**: copied flag toggles; text copied to clipboard
- **Side effects:** navigator.clipboard.writeText() call
- **Success outcome:** Shopping list as plain text in clipboard, formatted as:
  ```
  Shopping List
  WIDTHxHEIGHT stitches @ COUNT count [over two]
  
  [mark] DMC 310 â€” Black â€” N skeins (own M)
  ...
  
  Total: X/Y colours owned
  ```
- **Error outcome:** Silent fail if clipboard unavailable

**Keyboard:** Tab to focus, Space/Enter to activate
**Constraints:** Mark symbols: âœ“ (owned) / ~ (partial) / â—¯ (needed)
**Relationships:** EL-SCR-006-01

### EL-SCR-006-09: Share List Button
- **Location**: SCR-006, summary banner (right side)
- **Type**: Button
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L156-L165)
- **Visible when**: navigator.share available AND summary banner visible
- **Default state**: Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback:** Native share sheet opens (OS-dependent)
- **State mutation:** None (transient)
- **Side effects:** navigator.share() call with title + text payload
- **Success outcome:** User can select destination (Mail, Messages, AirDrop, etc.)
- **Error outcome:** Silent if share unavailable or user cancels

**Keyboard:** Tab, Space/Enter
**Constraints:** Only rendered if navigator.share exists
**Relationships:** EL-SCR-006-01

### EL-SCR-006-10: View Thread Stash Link
- **Location**: SCR-006, summary banner (right side)
- **Type**: Link
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L166-L171)
- **Visible when:** Always
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click or Space/Enter (keyboard)
- **Immediate feedback:** Link navigates; new tab/window opens with manager.html
- **Navigation:** Full-page load to manager.html (opens Stash Manager)
- **Success outcome:** User sees Stash Manager thread inventory

**Keyboard:** Tab, Enter
**Constraints:** href="manager.html", target="_blank"
**Relationships:** EL-SCR-006-01

### EL-SCR-006-11: Mark All As Owned Button
- **Location**: SCR-006, controls row (right side)
- **Type**: Button
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L200-L211)
- **Visible when**: Not all threads owned (ownedCount < totalCount)
- **Default state**: Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback:** Button changes to "Added to stash" with check icon; reverts after 2.5s
- **State mutation**: Calls StashBridge.updateThreadOwned() for each "to buy" thread; sets owned = needed
- **Side effects:** Writes to stitch_manager_db; dispatches cs:stashChanged event
- **Success outcome:** Global stash updates; PrepareTab re-renders with new status
- **Error outcome:** Toast error if StashBridge unavailable

**Keyboard:** Tab, Space/Enter
**Constraints:** Only shown if ctx.pat && ctx.pal && not all owned
**Relationships:** Affects EL-SCR-006-04 status badges; updates stash

### EL-SCR-006-12: Fabric Calculator (collapsible section)
- **Location**: SCR-006, below thread table
- **Type:** Composite (collapsible)
- **Component:** [creator/PrepareTab.js](creator/PrepareTab.js#L311-L400)
- **Visible when**: Always (but collapsed by default)
- **Default state**: Collapsed (fabOpen = false)

**Intended behaviour:**
- **Trigger**: Click section header
- **Immediate feedback**: Content expands/collapses; chevron icon rotates
- **State mutation**: fabOpen toggles
- **Success outcome**: Calculator controls and finished-size table visible

**Constraints:** Bordered container with rounded corners

### EL-SCR-006-13: Fabric Calculator Toggle (header)
- **Location**: SCR-006, fabric calculator header
- **Type**: Button
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L321-L336)
- **Visible when**: Always

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Chevron icon rotates; content below expands/collapses
- **State mutation**: fabOpen toggles
- **Keyboard:** Tab, Space/Enter
- **Constraints**: Full-width, left-aligned text, chevron icon (rotate based on state)

### EL-SCR-006-14: Fabric Calculator Margin Input
- **Location**: SCR-006, fabric calculator body
- **Type**: Number input
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L337-L356)
- **Visible when**: fabOpen === true
- **Default state**: 3 inches

**Intended behaviour:**
- **Trigger**: Type or use spinner (or touch drag on mobile)
- **Immediate feedback**: Fabric dimension table recalculates instantly
- **State mutation**: margin state updates; table rows recompute
- **Constraints**: min 0, max 10, step 0.25

**Keyboard:** Arrow Up/Down to adjust, standard number input
**Relationships**: Affects EL-SCR-006-15

### EL-SCR-006-15: Fabric Calculator Units Selector
- **Location**: SCR-006, fabric calculator controls
- **Type**: Button group (two buttons: inches / centimetres)
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L357-L372)
- **Visible when**: fabOpen === true
- **Default state**: "in" (inches)

**Intended behaviour:**
- **Trigger**: Click either button
- **Immediate feedback**: Active button highlights; table recalculates in new units
- **State mutation**: units state updates; calcFab() applied to all fabric rows
- **Success outcome**: Finished dimensions shown in selected units (inches or cm)

**Keyboard:** Tab between buttons, Space/Enter to select
**Constraints**: Two mutually exclusive buttons

### EL-SCR-006-16: Fabric Calculator Table
- **Location**: SCR-006, fabric calculator body
- **Type**: Display (table)
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L373-L400)
- **Data source**: Computed from sW, sH, fabricCt, margin, units, overTwo
- **Display logic:**
  - Rows: one per fabric count (11, 14, 16, 18 count listed as options)
  - Columns: Fabric label | Width | Height | (current indicator)
  - Row styling: current fabric count row highlighted (success-soft)
  - Effective fabric = overTwo ? ct / 2 : ct
  - Dimensions = (sW / effectiveFabric + margin*2) Ã— (sH / effectiveFabric + margin*2)
- **Update trigger:** margin change, units change, overTwo toggle, sW/sH change, fabricCt change
- **Empty state:** N/A
- **Staleness:** Recomputes synchronously on input change

**Row elements:**
- Fabric label (with "over 2" suffix if applicable)
- Width (right-aligned, 1 decimal place)
- Height (right-aligned, 1 decimal place)
- Current marker ("â† current" if fabric matches ctx.fabricCt)

### EL-SCR-006-17: Fabric Calculator Note
- **Location**: SCR-006, below fabric calculator table
- **Type**: Display (caption)
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L401-L405)
- **Data source**: Hardcoded template + computed values
- **Display logic:** "Pattern: WxH stitches. Margin: M" each side. [Stitching over two threads.]"
- **Staleness**: Updates as values change

### EL-SCR-006-18: Fabric Calculator Over-Two Checkbox (duplicate in calculator)
- **Location**: SCR-006, fabric calculator controls
- **Type**: Checkbox
- **Component**: [creator/PrepareTab.js](creator/PrepareTab.js#L363-L368)
- **Default state**: Synced with main over-two control

**Intended behaviour:** Same as EL-SCR-006-02; linked via same state variable

---

## Screen: SCR-009 â€” Creator Project tab

Planning and progress tracking: time estimate, finished size at various fabric counts, cost estimate, thread organiser with stash status, and kitting checks.

### EL-SCR-009-01: Time Estimate Section
- **Location**: SCR-009, top section
- **Type**: Composite (Section component)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L24-L62)
- **Visible when**: app.tab === "project" && ctx.pat && ctx.pal
- **Default state**: Visible, heading shows "Time Estimate"

**Intended behaviour:** Displays stitching speed slider and computed time estimates (total + remaining)

### EL-SCR-009-02: Stitching Speed Slider
- **Location**: SCR-009, time estimate section
- **Type**: Slider (SliderRow component)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L43-L49)
- **Visible when**: Time estimate section visible
- **Default state**: Initial speed from ctx.stitchSpeed (default 40 stitches/hr)

**Intended behaviour:**
- **Trigger**: Drag or click to set value
- **Immediate feedback**: Value updates; time estimates recalculate
- **State mutation**: ctx.setStitchSpeed(newValue)
- **Success outcome:** Time readouts update
- **Constraints:** min 10, max 120, step 5
- **Format:** Display as "N stitches/hr"

**Relationships:** Affects EL-SCR-009-03 and EL-SCR-009-04

### EL-SCR-009-03: Total Time Estimate Display
- **Location**: SCR-009, time estimate grid
- **Type**: Display (large text)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L50-L62)
- **Data source**: Computed = round((ctx.totalStitchable / ctx.stitchSpeed) * 3600)
- **Display logic:** Large font, bold; formatted via fmtTimeL()
- **Staleness:** Recomputes when stitchSpeed or totalStitchable changes
- **Label:** "Total estimate"

### EL-SCR-009-04: Remaining Time Display
- **Location**: SCR-009, time estimate grid
- **Type**: Display (large text)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L50-L62)
- **Data source:** Computed = round(((totalStitchable - doneCount) / stitchSpeed) * 3600)
- **Display logic:** Large font, bold; colour changes based on completion (success if done >= total, accent if not); formatted via fmtTimeL()
- **Label:** "Remaining"

### EL-SCR-009-05: Actual Session Average Note
- **Location**: SCR-009, time estimate section (if user has tracked progress)
- **Type**: Display (note box)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L63-L67)
- **Visible when**: ctx.totalTime > 0 && ctx.doneCount > 0
- **Data source:** Computed = doneCount / (totalTime / 3600) stitches/hr average
- **Display logic:** Small text in secondary box; shows actual pace based on logged sessions
- **Staleness:** Updates as sessions logged

### EL-SCR-009-06: Finished Size Section
- **Location**: SCR-009, middle section
- **Type**: Composite (Section)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L75-L120)
- **Visible when**: Project tab active
- **Default state**: Visible, heading "Finished Size"

**Intended behaviour:** Displays fabric count options with corresponding width/height at each count

### EL-SCR-009-07: Finished Size Table
- **Location**: SCR-009, finished size section
- **Type**: Display (table)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L90-L120)
- **Data source:** Hardcoded fabric counts (14, 16, 18, 20, 22, 25, 28); computed dimensions for each
- **Display logic:**
  - Rows: one per fabric count
  - Columns: Fabric label | Width | Height | With margin (for framing)
  - Current fabric count highlighted (accent-light)
  - Dimensions: wIn = sW / fabricCount; if 28-count, divide by 14 (over 2)
  - Margin: assumes 2" margin on all sides
  - Show both inches and cm
- **Update trigger:** sW, sH, or fabricCt changes
- **Staleness:** Recomputes synchronously

**Row styling:**
- Current fabric row: bold text + check mark icon + accent background
- Other rows: normal

### EL-SCR-009-08: Cost Estimate Section
- **Location**: SCR-009, middle-lower section
- **Type**: Composite (Section, defaultOpen=false)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L121-L165)
- **Visible when**: Project tab active
- **Default state**: Collapsed

**Intended behaviour:** Shows cost calculation with price-per-skein input and totals (thread cost, to-buy cost)

### EL-SCR-009-09: Price Per Skein Input
- **Location**: SCR-009, cost estimate section
- **Type**: Number input
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L142-L150)
- **Visible when**: Cost section expanded
- **Default state:** ctx.skeinPrice (default Â£0.95)

**Intended behaviour:**
- **Trigger**: Type or adjust
- **Immediate feedback**: Cost calculations update instantly
- **State mutation**: ctx.setSkeinPrice()
- **Constraints:** min 0, step 0.05, decimal input
- **Format:** Currency-like (no Â£ symbol in input; shown in readouts)

**Keyboard:** Arrow Up/Down, type
**Relationships:** Affects EL-SCR-009-10 and EL-SCR-009-11

### EL-SCR-009-10: Total Thread Cost Display
- **Location**: SCR-009, cost estimate grid
- **Type**: Display (large text)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L151-L160)
- **Data source:** ctx.totalSkeins * ctx.skeinPrice
- **Display logic:** Formatted with Â£ prefix, 2 decimal places
- **Label:** "Thread cost"
- **Sub-label:** "N skeins Ã— Â£price"

### EL-SCR-009-11: Still To Buy Cost Display
- **Location**: SCR-009, cost estimate grid
- **Type**: Display (large text)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L151-L160)
- **Visible when**: ctx.toBuyCount < ctx.skeinData.length (not all owned)
- **Data source:** ctx.toBuyList.reduce(...skeins) * skeinPrice
- **Display logic:** Same format as EL-SCR-009-10
- **Label:** "Still to buy"

### EL-SCR-009-12: Cost Note
- **Location**: SCR-009, cost estimate section
- **Type**: Display (small text)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L161-L165)
- **Data source:** Hardcoded
- **Display logic:** "Doesn't include fabric, needles, hoop, or frame. DMC skeins typically Â£0.85â€“Â£1.10 in UK shops."

### EL-SCR-009-13: Thread Organiser Section
- **Location**: SCR-009, lower section
- **Type**: Composite (Section)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L166-L265)
- **Visible when**: Project tab active
- **Default state:** Visible, heading "Thread Organiser"

**Intended behaviour:** Lists all threads in current pattern with owned/to-buy toggles and stash lookup

### EL-SCR-009-14: Thread Organiser Status Pills
- **Location**: SCR-009, thread organiser header
- **Type:** Display (2 pills)
- **Component:** [creator/ProjectTab.js](creator/ProjectTab.js#L167-L180)
- **Data source:** ctx.ownedCount, ctx.toBuyList.length
- **Display logic:** Two side-by-side pills:
  - "X owned" (success-soft background, success colour)
  - "Y to buy" (#F8EFD8 background, accent-hover colour)
- **Staleness:** Updates as ownership changes

### EL-SCR-009-15: Own All Button
- **Location**: SCR-009, thread organiser header (right side)
- **Type**: Button
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L181-L195)
- **Visible when**: Thread organiser visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Marks all threads as "owned" instantly
- **State mutation**: ctx.setThreadOwned({ [id]: "owned" for all }); updates local state
- **Success outcome:** All threads move to "owned" category

### EL-SCR-009-16: Clear Button
- **Location**: SCR-009, thread organiser header (right side)
- **Type**: Button
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L195-L201)
- **Visible when**: Thread organiser visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Clears all ownership marks
- **State mutation**: ctx.setThreadOwned({})
- **Success outcome:** All threads show "To buy"

### EL-SCR-009-17: Thread Row (individual)
- **Location**: SCR-009, thread organiser list
- **Type**: Composite (flex row)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L202-L248)
- **Visible when**: Thread organiser visible
- **Data per row:** d = skeinData entry (id, rgb, name, skeins)

**Intended behaviour:**
- Displays: colour swatch | DMC ID | name | skeins count | toggle button | stash badge | (similarity lookup button if Anchor support)
- **Color swatch**: 16Ã—16 px, background rgb, border
- **Toggle button**: "Owned" / "To buy" (click to toggle)
- **Stash badge**: "owned/needed in stash" (e.g., "2/3 in stash")
- **Similarity button** (if StashBridge): "â‰ˆ" button shows similar threads from stash when clicked

### EL-SCR-009-18: Thread Toggle Button
- **Location**: SCR-009, thread row
- **Type**: Button
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L230-L239)
- **Visible when**: Thread organiser visible
- **Default state**: Reflects ctx.threadOwned[threadId] state

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button label flips between "Owned" and "To buy"; background colour changes
- **State mutation**: ctx.toggleOwned(threadId)
- **Success outcome:** Row styling updates; ownership pills recount

**Keyboard:** Tab, Space/Enter
**Constraints**: min-width 55px; displays state as text

### EL-SCR-009-19: Similar Threads Popover
- **Location**: SCR-009, thread row (if expanded)
- **Type**: Display (list)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L240-L265)
- **Visible when**: ctx.altOpen === threadId && StashBridge available
- **Data source:** StashBridge.suggestAlternatives(id, 5, globalStash)
- **Display logic:** Shows up to 5 similar threads from stash; colour swatch, ID, name, Î”E value, skein count
- **Empty state:** "No similar threads found in your stash."
- **Update trigger:** Similarity lookup button clicked

### EL-SCR-009-20: Adapt to Stash Button
- **Location**: SCR-009, thread organiser bottom
- **Type**: Button
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L249-L256)
- **Visible when:** Thread organiser visible && ctx.pat && ctx.pal
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: AdaptModal opens in "stash" mode
- **State mutation**: ctx.setAdaptModalMode('stash'); ctx.setAdaptModalOpen(true)
- **Side effects:** Opens AdaptModal (out of scope)
- **Success outcome:** User sees adapted pattern using only owned threads

**Keyboard:** Tab, Space/Enter
**Tooltip:** "Create an adapted copy of this pattern using threads from your stash"

### EL-SCR-009-21: Kit This Project Button
- **Location**: SCR-009, thread organiser bottom
- **Type**: Button
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L257-L291)
- **Visible when:** Thread organiser visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button disabled briefly; queries stash for missing/short threads
- **State mutation**: ctx.setKittingResult({ missing, short, total })
- **Side effects:** StashBridge query; updates kitting result display
- **Success outcome:** Kitting check section appears below

### EL-SCR-009-22: Adapt to Brand Button
- **Location**: SCR-009, thread organiser bottom
- **Type**: Button
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L292-L303)
- **Visible when:** Thread organiser visible && window.AdaptModal available && ctx.pat && ctx.pal
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: AdaptModal opens in "brand" mode
- **State mutation**: ctx.setAdaptModalMode('brand'); ctx.setAdaptModalOpen(true)
- **Success outcome:** User sees adapted pattern using alternative thread brand

**Keyboard:** Tab, Space/Enter
**Tooltip:** "Adapt this pattern to a different thread brand"

### EL-SCR-009-23: Kitting Check Result Box
- **Location**: SCR-009, thread organiser (if result present)
- **Type**: Composite (display + actions)
- **Component**: [creator/ProjectTab.js](creator/ProjectTab.js#L304-L345)
- **Visible when**: ctx.kittingResult !== null
- **Data source:** ctx.kittingResult = { missing, short, total }

**Intended behaviour:**
- Shows heading: "Kitting check (N colours)"
- If no gaps: success message "You have everything!"
- If missing: "Missing (N):" list
- If short: "Low stock (N):" list
- Two action buttons: "Copy gaps", (internal state only; no stash write here)

**Display logic:**
- Missing items shown in danger colour (#A53D3D)
- Short items shown in accent-hover colour (#A06F2D)
- Each item: colour swatch | ID | name | need info

---

## Screen: SCR-015 â€” Creator BulkAdd Modal (threads)

Modal for bulk-importing threads into the Stash Manager database via two tabs: "Paste list" (free-text parsing) and "From a kit" (starter kit selection). Reused in Manager (SCR-032) with identical behavior.

**Note:** This modal is component-reused between Creator and Manager. Spec documents it once here. Verification TODO confirms Manager mount behaves identically.

### EL-SCR-015-01: Modal Header
- **Location**: SCR-015, top
- **Type**: Display + Close button
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L278-L285)
- **Visible when**: Modal open
- **Data source:** Hardcoded "Bulk Add to Stash"

**Intended behaviour:** Title + close button (X icon) in top-right corner

### EL-SCR-015-02: Tab Selector (Paste List / From Kit)
- **Location**: SCR-015, below header
- **Type**: Tab buttons (two)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L286-L305)
- **Visible when**: Modal visible
- **Default state:** "Paste list" active

**Intended behaviour:**
- **Trigger**: Click either tab
- **Immediate feedback**: Active tab underline appears; content below switches
- **State mutation**: activeTab state updates
- **Success outcome:** Relevant tab content displays

**Keyboard:** Tab to navigate, Space/Enter to select; can use Ctrl+Tab to switch tabs (standard)
**Constraints**: Two mutually exclusive tabs

### EL-SCR-015-03: Brand Selector (Paste tab)
- **Location**: SCR-015, paste tab content area
- **Type**: Button group (DMC / Anchor)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L307-L320)
- **Visible when**: activeTab === 'paste'
- **Default state**: "DMC" selected

**Intended behaviour:**
- **Trigger**: Click either brand button
- **Immediate feedback**: Active button highlights; textarea placeholder updates
- **State mutation**: brand state updates; setPasteText(''); setRemovedRaws([])
- **Success outcome**: Placeholder text reflects selected brand

**Keyboard**: Tab, Space/Enter
**Constraints**: Two mutually exclusive buttons; onChange clears input (to avoid cross-brand confusion)

### EL-SCR-015-04: Thread List Textarea (Paste tab)
- **Location**: SCR-015, paste tab, main input
- **Type**: Textarea
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L321-L330)
- **Visible when**: activeTab === 'paste'
- **Default state**: Empty

**Intended behaviour:**
- **Trigger**: Type or paste text
- **Immediate feedback**: Input updates; chip list below recomputes instantly (parseBulkThreadList + resolveIds)
- **State mutation**: setPasteText(text)
- **Constraints**: 5 rows tall, monospace font, resize vertical allowed
- **Format expected:** Comma/space/newline/semicolon-separated IDs; prefixes (DMC, Anchor, #) stripped
- **Example:** `310, 321, blanc, 3865` or `310\n321\nblank`
- **Keyboard**: Standard textarea (Ctrl+A, Ctrl+V, etc.)

### EL-SCR-015-05: Thread Chip (Paste tab, valid)
- **Location**: SCR-015, paste tab, below textarea
- **Type**: Composite (chip display)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L86-L90)
- **Visible when**: Resolved entries list populated
- **Data per chip:** item = { raw, normalised, thread, valid }

**Intended behaviour:**
- **Display**: Green background (#success-soft) + green text; shows "DMC 310" or "Anchor 403" with name
- **Constraints**: Inline-flex, gap between chips, inline margin
- **Remove button**: X button (small, right side of chip); clicking removes from list

### EL-SCR-015-06: Thread Chip (Paste tab, invalid)
- **Location**: SCR-015, paste tab, below textarea (if unrecognised)
- **Type**: Composite (chip display)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L80-L84)
- **Visible when**: Unrecognised thread ID in input
- **Data per chip:** item with valid=false

**Intended behaviour:**
- **Display**: Red background (danger-soft) + red text; shows "DMC 999 â€” not found" (if 999 is unrecognised)
- **Remove button**: X button; clicking removes from list
- **Styling**: Border 1px solid #DEAEAE; background var(--danger-soft)

### EL-SCR-015-07: Summary Line (Paste tab)
- **Location**: SCR-015, paste tab, above chip list
- **Type**: Display (caption)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L331-L337)
- **Visible when**: pasteResolved.length > 0
- **Data source:** validCount + invalidCount
- **Display logic:** "X valid, Y unrecognised (click Ã— to remove)"
- **Staleness**: Recomputes as text changes

### EL-SCR-015-08: Brand Selector (Kit tab)
- **Location**: SCR-015, kit tab content area
- **Type**: Button group (DMC / Anchor)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L338-L352)
- **Visible when**: activeTab === 'kit'
- **Default state**: "DMC" selected

**Intended behaviour:** Same as EL-SCR-015-03 but for kit tab; onChange resets selected kit to first available for brand

### EL-SCR-015-09: Kit Selector (Kit tab)
- **Location**: SCR-015, kit tab, below brand selector
- **Type**: Button group (horizontal, wrapping)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L353-L365)
- **Visible when**: activeTab === 'kit' && kitKeys.length > 0
- **Data source:** Object.keys(STARTER_KITS[kitBrand])
- **Default state:** First kit selected

**Intended behaviour:**
- **Trigger**: Click any kit button
- **Immediate feedback**: Active kit highlights; chip list below updates
- **State mutation**: setSelectedKit(key); setKitRemovedIds({})
- **Chips display**: All threads from selected kit (minus any user-removed entries)

**Example kits:** "essentials", "shades", "pastels", etc. (per STARTER_KITS data)

### EL-SCR-015-10: Kit Unavailable Message (Kit tab)
- **Location**: SCR-015, kit tab
- **Type**: Display (message)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L366-L370)
- **Visible when**: activeTab === 'kit' && kitKeys.length === 0
- **Data source**: Hardcoded
- **Display logic**: "No starter kits available for this brand."

### EL-SCR-015-11: Thread Chip List (Kit tab)
- **Location**: SCR-015, kit tab, below kit selector
- **Type**: Composite (chip list, flow layout)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L371-L380)
- **Visible when**: kitResolved.length > 0
- **Data source:** kitResolved (filtered kit threads)

**Intended behaviour:** Same as paste tab chips; valid threads green, invalid red; X to remove

### EL-SCR-015-12: Summary Line (Kit tab)
- **Location**: SCR-015, kit tab, above chip list
- **Type**: Display (caption)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L366-L369)
- **Data source:** validCount + invalidCount
- **Display logic:** "X threads in this kit, Y unrecognised"

### EL-SCR-015-13: Cancel Button
- **Location**: SCR-015, footer
- **Type**: Button
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L381-L390)
- **Visible when**: Modal visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click or ESC (via Overlay)
- **Immediate feedback**: Modal closes
- **State mutation**: None; no changes saved
- **Navigation**: Modal dismisses; focus returns to trigger element

**Keyboard:** Tab, Space/Enter, or ESC
**Relationships**: EL-SCR-015-01 (close button)

### EL-SCR-015-14: Add Threads Button
- **Location**: SCR-015, footer (right side)
- **Type**: Button (primary)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L388-L396)
- **Visible when**: Modal visible
- **Default state**: Disabled if validCount === 0

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button shows "Savingâ€¦"; disabled
- **State mutation**: Async StashBridge.updateThreadOwned() calls for each valid thread (brand + id composite key)
- **Side effects:** Writes to stitch_manager_db; dispatches cs:stashChanged event; Success toast shown
- **Success outcome**: Modal shows "N threads added to your stash" confirmation screen (EL-SCR-015-15)
- **Error outcome**: Toast error; modal stays open for retry

**Keyboard**: Tab, Space/Enter (enabled state only)
**Constraints**: Disabled while saving; label shows count (e.g., "Add 5 threads")

### EL-SCR-015-15: Success Confirmation Screen
- **Location**: SCR-015, modal content (post-save)
- **Type**: Composite (confirmation)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L155-L170)
- **Visible when**: done === true
- **Data source:** validCount

**Intended behaviour:**
- Shows check mark icon (success colour)
- Message: "N thread(s) added to your stash"
- "Done" button to close
- **Trigger (Done button)**: Click
- **Immediate feedback**: Modal closes
- **Navigation:** Returns to calling context

### EL-SCR-015-16: Unrecognised Thread Warning
- **Location**: SCR-015, footer
- **Type**: Display (warning text)
- **Component**: [creator/BulkAddModal.js](creator/BulkAddModal.js#L382-L387)
- **Visible when**: invalidCount > 0
- **Data source:** invalidCount
- **Display logic:** "Y unrecognised thread(s) will be skipped" (right-aligned in footer)
- **Colour**: Warning colour

---

## Screen: SCR-017 â€” Creator Shopping List Modal

Modal showing what threads are needed vs. already owned for the current pattern, with integration to push missing threads to the Stash Manager's shopping list.

### EL-SCR-017-01: Modal Header
- **Location**: SCR-017, top
- **Type**: Display + Close button
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L45-L52)
- **Visible when**: Modal open
- **Data source**: Hardcoded "What do I need to buy?"

### EL-SCR-017-02: Status Bar
- **Location**: SCR-017, below header
- **Type**: Display (banner)
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L53-L65)
- **Visible when**: Modal visible
- **Data source:** Computed from rows

**Intended behaviour:**
- If buyRows.length === 0: Green background + check icon + "You have all N colours â€” ready to stitch!"
- Else: Amber background + "You have X of N colours. Need to buy Y thread(s) (~Z skein(s) total)."
- **Colour logic**: Success-soft if complete, #FAF5E1 if not
- **Update trigger:** rows change (pattern or stash changes)

### EL-SCR-017-03: Thread Rows â€” Need to Buy Section
- **Location**: SCR-017, main content area (if buyRows.length > 0)
- **Type**: Display (section)
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L72-L90)
- **Data source:** rows.filter(r => r.status !== 'owned')
- **Display logic:**
  - Section header: "Need to buy (N)" in red
  - Each row: colour swatch | ID | name | "need ~N skein(s)" + "(own M)" if applicable
  - Red background for each row
  - Rows ordered by thread ID (numeric collation)

### EL-SCR-017-04: Thread Rows â€” Already in Stash Section
- **Location**: SCR-017, main content area (if ownedRows.length > 0)
- **Type**: Display (section)
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L72-L90)
- **Data source:** rows.filter(r => r.status === 'owned')
- **Display logic:**
  - Section header: "Already in your stash (N)" in green
  - Each row: colour swatch | ID | name | "own M, need ~N"
  - Green background for each row

### EL-SCR-017-05: Empty State
- **Location**: SCR-017, main content area
- **Type**: Display (message)
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L70-L71)
- **Visible when**: rows.length === 0
- **Data source**: Hardcoded
- **Display logic**: "No threads in this pattern yet." (centred, tertiary colour)

### EL-SCR-017-06: Copy List Button
- **Location**: SCR-017, footer (right side)
- **Type**: Button
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L91-L104)
- **Visible when**: Footer visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button feedback; success indicator appears briefly
- **State mutation**: copied flag toggles via setCopied(true); reverts after 2s
- **Side effects**: navigator.clipboard.writeText() with formatted shopping list
- **Success outcome**: List in clipboard as plain text; user sees "Copied!" indicator

**Format:** Sections for "Need to buy" and "Already in stash" with per-thread details

**Keyboard**: Tab, Space/Enter
**Constraints**: Fallback to document.execCommand('copy') if clipboard API unavailable

### EL-SCR-017-07: Push to Stash Button
- **Location**: SCR-017, footer (right side)
- **Type**: Button
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L105-L130)
- **Visible when**: buyRows.length > 0 && footer visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Button shows "Addingâ€¦"; disabled
- **State mutation**: Async StashBridge.setToBuyQtyMany() call with { brand:id â†’ qty } map
- **Side effects:** Writes to stitch_manager_db shopping list; updates Manager's "to buy" quantities
- **Success outcome**: Toast success message + "Added to Stash list!" indicator on modal
- **Error outcome**: Toast error message; button remains enabled for retry

**Keyboard**: Tab, Space/Enter
**Constraints**: Only shown if buyRows present; disabled while busy
**Relationships**: Requires StashBridge to have setToBuyQtyMany() method

### EL-SCR-017-08: Open Stash List Link
- **Location**: SCR-017, footer (left side)
- **Type**: Link
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L131-L137)
- **Visible when**: Footer visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback:** Browser opens manager.html?tab=shopping in new tab/window
- **Navigation**: Full-page load to Manager with shopping list tab pre-selected
- **Success outcome**: User sees Stash Manager shopping list

**Keyboard**: Tab, Enter (standard link behavior)
**Constraints**: href="manager.html?tab=shopping"

### EL-SCR-017-09: Copy Success Indicator
- **Location**: SCR-017, footer (left side of action buttons)
- **Type**: Display (transient)
- **Component**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L138-L142)
- **Visible when**: copied === true OR pushed === true (opacity animation)
- **Data source:** State flag
- **Display logic:** "Copied!" or "Added to Stash list!" text; opacity 0â€“1 transition
- **Staleness:** Fades out after 2s or 2.5s respectively

---

## Screen: SCR-018 â€” Creator ImportWizard (parent)

The 5-step guided flow for converting an image into a cross-stitch pattern. Mounted conditionally when `experimental.importWizard` UserPref is true. State persists via localStorage draft (7-day TTL).

**Feature flag guard:** Entire wizard behind `experimental.importWizard` pref check; legacy single-step modal path unaffected.

### EL-SCR-018-01: Wizard Root Dialog
- **Location**: SCR-018, full modal
- **Type**: Dialog container
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L350-L410)
- **Visible when**: Wizard mounted (experimental.importWizard === true && image selected)
- **Default state:** Visible; step 1 active

**Intended behaviour:**
- Role="dialog", aria-modal="true", aria-labelledby, aria-describedby
- Scrim behind (modal overlay); click scrim triggers discard confirmation
- Dialog remains focused; Escape key triggers discard (routed via useEscape hook)

**Constraints:** max-width 600px or similar; responsive to tablet/mobile

### EL-SCR-018-02: Progress Indicator (5 steps)
- **Location**: SCR-018, header/top area
- **Type**: Display (ordered list, role="list")
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L157-L200)
- **Visible when:** Wizard visible

**Intended behaviour:**
- Shows 5 items: Step 1 (Crop) â†’ Step 2 (Palette) â†’ Step 3 (Size) â†’ Step 4 (Preview) â†’ Step 5 (Confirm)
- Each completed/reached step has different styling (reached; clickable to jump back)
- Current step highlighted (aria-current="step")
- Icons + labels; each reached step clickable (goto)

**Data source:** STEP_LABELS array hardcoded

### EL-SCR-018-03: Progress Item (Crop)
- **Location**: SCR-018, progress bar
- **Type**: Composite (list item)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L165-L185)
- **Data source:** STEP_LABELS[0]
- **Styling:** Reached (checkmark icon + filled), active (blue underline), unreached (grey, disabled)

### EL-SCR-018-04: Progress Item (Palette)
- **Location**: SCR-018, progress bar
- **Type**: Composite (list item)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L165-L185)
- **Styling:** As above, per step state

### EL-SCR-018-05: Progress Item (Size)
- **Location**: SCR-018, progress bar
- **Type**: Composite (list item)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L165-L185)
- **Styling:** As above

### EL-SCR-018-06: Progress Item (Preview)
- **Location**: SCR-018, progress bar
- **Type**: Composite (list item)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L165-L185)
- **Styling:** As above

### EL-SCR-018-07: Progress Item (Confirm)
- **Location**: SCR-018, progress bar
- **Type**: Composite (list item)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L165-L185)
- **Styling:** As above

### EL-SCR-018-08: Step Body Container
- **Location**: SCR-018, main content area (between header and footer)
- **Type**: Display
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L393-L395)
- **Visible when**: Wizard visible
- **Content**: Dynamically rendered based on wizard.step

### EL-SCR-018-09: Back Button
- **Location**: SCR-018, footer (left side)
- **Type**: Button
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L396-L408)
- **Visible when**: Footer visible
- **Default state**: Disabled on step 1

**Intended behaviour:**
- **Trigger**: Click or keyboard
- **Immediate feedback**: Back button becomes enabled; focus moves to previous step
- **State mutation**: wizard.back()
- **Navigation**: Step counter decrements; body re-renders with previous step
- **Success outcome**: User sees previous step

**Keyboard**: Tab, Space/Enter (enabled state only)
**Constraints**: Disabled on step 1 (aria-disabled="true")

### EL-SCR-018-10: Next Button (steps 1â€“4)
- **Location**: SCR-018, footer (right side)
- **Type**: Button (primary)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L404-L408)
- **Visible when**: Footer visible && step < 5
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click or keyboard
- **Immediate feedback**: Step counter increments; body re-renders
- **State mutation**: wizard.next()
- **Navigation**: Next step renders
- **Success outcome**: User sees next step

**Keyboard**: Tab, Space/Enter

### EL-SCR-018-11: Generate Pattern Button (step 5 only)
- **Location**: SCR-018, footer (right side)
- **Type**: Button (primary, large)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L409-L410)
- **Visible when**: step === 5
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click or keyboard
- **Immediate feedback**: Button disabled briefly; generation begins
- **State mutation**: wizard.commit() returns settings object; onGenerate(settings) called
- **Side effects:** Triggers legacy generation pipeline (parseImagePattern + generation worker)
- **Success outcome**: Wizard closes; pattern generation starts; user redirected to pattern editor

**Keyboard**: Tab, Space/Enter

### EL-SCR-018-12: Cancel Button
- **Location**: SCR-018, footer (left side)
- **Type**: Button
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L402-L405)
- **Visible when**: Footer visible
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click or ESC key (routed via useEscape)
- **Immediate feedback**: Discard confirmation dialog appears (EL-SCR-018-13)
- **State mutation**: Discard modal opens via setDiscardOpen(true)
- **Success outcome**: User shown confirmation

**Keyboard**: Tab, Space/Enter, or ESC

### EL-SCR-018-13: Discard Confirmation Modal
- **Location**: SCR-018, overlay (modal within modal)
- **Type**: Dialog (alert)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L426-L445)
- **Visible when**: discardOpen === true
- **Data source**: Hardcoded

**Intended behaviour:**
- Shows: "Discard import?"
- Message: "Your draft is saved for 7 days, so you can come back to it."
- Two buttons: "Keep editing" | "Discard" (danger colour)

### EL-SCR-018-14: Keep Editing Button
- **Location**: SCR-018, discard modal
- **Type**: Button
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L441-L443)
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Discard modal closes; focus returns to wizard
- **State mutation**: setDiscardOpen(false)

**Keyboard**: Tab, Space/Enter

### EL-SCR-018-15: Discard Button (in confirmation)
- **Location**: SCR-018, discard modal
- **Type**: Button (danger)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L444-L447)
- **Default state:** Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Draft clears; wizard closes; focus returns to previous page
- **State mutation**: wizard.reset() clears localStorage draft; onClose() called
- **Side effects:** cs_import_wizard_draft localStorage key removed
- **Navigation**: Wizard modal dismisses; user returns to image upload screen

**Keyboard**: Tab, Space/Enter; Tab order emphasizes "Keep editing" first (safer default)

---

## Screen: SCR-018a â€” ImportWizard Step 1: Crop & Orient

First step of the 5-step import wizard. Allows users to rotate, mirror, and set aspect ratio for the source image. Crop is applied when the pattern is generated (not live).

### EL-SCR-018a-01: Step Title
- **Location**: SCR-018a, top of body
- **Type**: Display (heading)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L206-L210)
- **Data source**: Hardcoded "Step 1 of 5: Crop & orient"
- **Constraints**: role="heading", tabIndex=-1, focusable; focus moved here on step enter
- **Aria:** id="iw-step-heading", ref=headingRef

### EL-SCR-018a-02: Step Description
- **Location**: SCR-018a, below title
- **Type**: Display (paragraph)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L211-L212)
- **Data source**: Hardcoded "Rotate or mirror your image, and pick an aspect-ratio guide. The crop is applied when the pattern is generated."

### EL-SCR-018a-03: Image Preview
- **Location**: SCR-018a, centre area
- **Type**: Display (image)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L213-L223)
- **Visible when**: image !== null
- **Data source**: image.src
- **Display logic:** Image transformed via CSS:
  - rotate(crop.rotate)
  - scaleX(crop.flipH ? -1 : 1)
  - scaleY(crop.flipV ? -1 : 1)
- **Constraints:** className="iw-crop-viewport"
- **Update trigger**: Crop state changes

### EL-SCR-018a-04: Empty State Message
- **Location**: SCR-018a, centre area
- **Type**: Display
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L223-L224)
- **Visible when**: image === null
- **Data source**: Hardcoded "No image loaded."

### EL-SCR-018a-05: Rotate 90Â° Button
- **Location**: SCR-018a, controls area
- **Type**: Button
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L225-L227)
- **Visible when**: image !== null
- **Default state**: Enabled

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Image preview rotates 90Â° clockwise
- **State mutation**: wizard.setCrop({ ...crop, rotate: (rotate + 90) % 360 })
- **Success outcome**: Rotation cycles through 0Â° â†’ 90Â° â†’ 180Â° â†’ 270Â° â†’ 0Â°

**Keyboard**: Tab, Space/Enter

### EL-SCR-018a-06: Mirror Horizontally Button
- **Location**: SCR-018a, controls area
- **Type**: Button with aria-pressed state
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L228-L230)
- **Visible when**: image !== null
- **Default state**: Unpressed (flipH = false)

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Image preview flips horizontally; button shows pressed state
- **State mutation**: wizard.setCrop({ ...crop, flipH: !flipH })
- **Success outcome**: Horizontal flip toggles; can be combined with vertical flip

**Keyboard**: Tab, Space/Enter
**Constraints**: aria-pressed reflects state; visual feedback (button highlight)

### EL-SCR-018a-07: Mirror Vertically Button
- **Location**: SCR-018a, controls area
- **Type**: Button with aria-pressed state
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L231-L233)
- **Visible when**: image !== null
- **Default state**: Unpressed (flipV = false)

**Intended behaviour:** As EL-SCR-018a-06 but for vertical flip

### EL-SCR-018a-08: Aspect Ratio Fieldset
- **Location**: SCR-018a, lower controls
- **Type**: Fieldset (radio group)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L234-L246)
- **Visible when**: Always
- **Data source**: Hardcoded ratios: Free, 1:1, 4:3, 3:4, 16:9

**Intended behaviour:**
- User can select one aspect ratio
- Default: "Free" (unconstrained)
- Each ratio has corresponding radio button + label

### EL-SCR-018a-09: Aspect Ratio â€” Free
- **Location**: SCR-018a, aspect fieldset
- **Type**: Radio button + label
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L237-L242)
- **Value**: "free"
- **Default state**: Selected on step 1 entry

**Intended behaviour:**
- **Trigger**: Click or keyboard (arrow keys within radio group)
- **Immediate feedback**: Radio selected; guides may disappear from preview (if implemented)
- **State mutation**: wizard.setCrop({ ...crop, aspect: "free" })

### EL-SCR-018a-10: Aspect Ratio â€” 1:1
- **Location**: SCR-018a, aspect fieldset
- **Type**: Radio button + label
- **Value**: "1:1"

**Intended behaviour:** As EL-SCR-018a-09; crops to square

### EL-SCR-018a-11: Aspect Ratio â€” 4:3
- **Location**: SCR-018a, aspect fieldset
- **Type**: Radio button + label
- **Value**: "4:3"

**Intended behaviour:** As EL-SCR-018a-09; landscape aspect guide

### EL-SCR-018a-12: Aspect Ratio â€” 3:4
- **Location**: SCR-018a, aspect fieldset
- **Type**: Radio button + label
- **Value**: "3:4"

**Intended behaviour:** As EL-SCR-018a-09; portrait aspect guide

### EL-SCR-018a-13: Aspect Ratio â€” 16:9
- **Location**: SCR-018a, aspect fieldset
- **Type**: Radio button + label
- **Value**: "16:9"

**Intended behaviour:** As EL-SCR-018a-09; widescreen aspect guide

---

## Screen: SCR-018b â€” ImportWizard Step 2: Palette Choice

Second step. User selects where the pattern generator should source thread colours: full DMC palette, user's owned stash only, or a limited colour count.

### EL-SCR-018b-01: Step Title
- **Location**: SCR-018b, top
- **Type**: Display (heading)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L248-L250)
- **Data source**: Hardcoded "Step 2 of 5: Choose a palette"

### EL-SCR-018b-02: Step Description
- **Location**: SCR-018b, below title
- **Type**: Display (paragraph)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L251-L252)
- **Data source**: Hardcoded "Decide which threads the Creator may use."

### EL-SCR-018b-03: Palette Mode â€” Full DMC Card
- **Location**: SCR-018b, palette modes area
- **Type**: Card (radio + content)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L253-L268)
- **Value**: "dmc"
- **Default state**: Selected on step 2 entry

**Intended behaviour:**
- **Display**: Card layout; title + description
- **Title**: "Full DMC palette"
- **Description**: "Match against the entire DMC range."
- **Trigger**: Click card or radio button
- **State mutation**: wizard.setPalette({ ...palette, mode: "dmc" })

**Keyboard**: Tab to navigate between cards; Space/Enter to select radio

### EL-SCR-018b-04: Palette Mode â€” Stash Only Card
- **Location**: SCR-018b, palette modes area
- **Type**: Card (radio + content)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L253-L268)
- **Value**: "stash"

**Intended behaviour:** As EL-SCR-018b-03 but for stash-only mode
- **Title**: "From my stash"
- **Description**: "Use only the threads you've marked as owned."
- **Constraint**: Requires user to have imported stash data (StashBridge); shows empty list if no owned threads

### EL-SCR-018b-05: Palette Mode â€” Limited Palette Card
- **Location**: SCR-018b, palette modes area
- **Type**: Card (radio + content)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L253-L268)
- **Value**: "limited"

**Intended behaviour:** As EL-SCR-018b-03 but for limited mode
- **Title**: "Limited palette"
- **Description**: "Pick the maximum number of colours."
- **Paired with**: EL-SCR-018b-06 (slider to set max colours)

### EL-SCR-018b-06: Maximum Colours Slider
- **Location**: SCR-018b, below palette mode cards
- **Type**: Range input
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L269-L279)
- **Visible when**: Always
- **Default state**: palette.maxColours (default 30)

**Intended behaviour:**
- **Trigger**: Drag slider or click input field
- **Immediate feedback**: Output value updates immediately
- **State mutation**: wizard.setPalette({ ...palette, maxColours: clamped(5â€“80) })
- **Constraints**: min 5, max 80, step 1
- **Aria**: aria-valuemin, aria-valuemax, aria-valuenow (all updated)
- **Label**: "Maximum colours"

**Keyboard**: Arrow Left/Right to adjust, Tab to focus

### EL-SCR-018b-07: Maximum Colours Output
- **Location**: SCR-018b, right side of slider
- **Type**: Display (output)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L279-L280)
- **Data source**: palette.maxColours
- **Display logic**: Shows numeric value (e.g., "30")
- **Update trigger**: Slider changes

### EL-SCR-018b-08: Allow Blends Checkbox
- **Location**: SCR-018b, below slider
- **Type**: Checkbox + label
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L281-L283)
- **Visible when**: Always
- **Default state**: Checked (allowBlends = true)

**Intended behaviour:**
- **Trigger**: Click checkbox or label
- **Immediate feedback**: Checkbox toggles; state updates
- **State mutation**: wizard.setPalette({ ...palette, allowBlends: !allowBlends })
- **Success outcome**: Pattern generation will use 2-thread blends if checked
- **Label**: "Allow 2-thread blends"

**Keyboard**: Tab, Space (checkbox)

---

## Screen: SCR-018c â€” ImportWizard Step 3: Size & Fabric Count

Third step. User sets pattern dimensions in stitches and selects fabric count. Includes live estimates of total stitches, skeins, and time.

### EL-SCR-018c-01: Step Title
- **Location**: SCR-018c, top
- **Type**: Display (heading)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L285-L287)
- **Data source**: Hardcoded "Step 3 of 5: Size & fabric count"

### EL-SCR-018c-02: Step Description
- **Location**: SCR-018c, below title
- **Type**: Display (paragraph)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L288-L289)
- **Data source**: Hardcoded "Set the finished pattern dimensions in stitches and pick your fabric count."

### EL-SCR-018c-03: Width Input (stitches)
- **Location**: SCR-018c, input grid
- **Type**: Number input
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L290-L298)
- **Visible when**: Always
- **Default state**: Computed auto-fit size on wizard init
- **Label**: "Width (stitches)"

**Intended behaviour:**
- **Trigger**: Type or spinner controls
- **Immediate feedback**: If aspect ratio locked, height auto-adjusts to maintain ratio; estimates update
- **State mutation**: wizard.setSize({ ...size, w: clamped(10â€“300) })
- **Constraints**: min 10, max 300, step 1
- **Relationships**: If lock === true and image present, setSize also updates height to maintain aspect ratio

**Keyboard**: Arrow Up/Down, Tab, type

### EL-SCR-018c-04: Height Input (stitches)
- **Location**: SCR-018c, input grid
- **Type**: Number input
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L299-L307)
- **Visible when**: Always
- **Default state**: Auto-fit size
- **Label**: "Height (stitches)"

**Intended behaviour:** As EL-SCR-018c-03 but for height; similarly locked if aspect lock active

### EL-SCR-018c-05: Lock Aspect Ratio Checkbox
- **Location**: SCR-018c, below input grid
- **Type**: Checkbox + label
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L308-L311)
- **Visible when**: Always
- **Default state**: Checked (lock = true)

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Checkbox toggles; dimension inputs show "locked" state (no auto-adjust on change)
- **State mutation**: wizard.setSize({ ...size, lock: !lock })
- **Label**: "Lock aspect ratio"

**Keyboard**: Tab, Space

### EL-SCR-018c-06: Fabric Count Dropdown
- **Location**: SCR-018c, below aspect lock
- **Type**: Select (dropdown)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L312-L320)
- **Visible when**: Always
- **Default state**: 14 count
- **Label**: "Fabric count"

**Intended behaviour:**
- **Trigger**: Click to open; select option
- **Immediate feedback**: Value updates; estimates recalculate
- **State mutation**: wizard.setSize({ ...size, fabricCt: Number(value) })
- **Options**: Hardcoded FABRIC_COUNTS (11, 14, 16, 18 count typical)

**Keyboard**: Arrow Up/Down, Tab, Enter

### EL-SCR-018c-07: Stitch Count Readout
- **Location**: SCR-018c, estimate area
- **Type**: Display (live)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L321-L327)
- **Data source**: Computed stitchCount = size.w * size.h
- **Display logic**: "Total stitches: " + formatted number (e.g., "6,400")
- **Update trigger**: Width or height changes
- **Role**: status, aria-live="polite" (screen reader announces updates)

### EL-SCR-018c-08: Skeins & Time Estimate Readout
- **Location**: SCR-018c, estimate area
- **Type**: Display (live)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L321-L327)
- **Data source:** Computed skeins + timeText
- **Display logic**: "Estimate: ~N skein(s), ~Xh Ym"
- **Update trigger**: Size or fabricCt changes
- **Role**: status, aria-live="polite"

### EL-SCR-018c-09: Large Pattern Warning
- **Location**: SCR-018c, below estimates
- **Type**: Display (alert)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L328-L329)
- **Visible when**: stitchCount > 40,000
- **Data source**: Computed
- **Display logic**: "Patterns over 40,000 stitches can be slow to generate on older devices."
- **Role**: alert
- **Colour**: Warning style

---

## Screen: SCR-018d â€” ImportWizard Step 4: Preview & Tune

Fourth step. User adjusts image processing parameters (dithering, contrast, saliency, background skip). Live preview of processed image shown (placeholder: "Live preview coming in follow-up").

### EL-SCR-018d-01: Step Title
- **Location**: SCR-018d, top
- **Type**: Display (heading)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L331-L333)
- **Data source**: Hardcoded "Step 4 of 5: Preview & tune"

### EL-SCR-018d-02: Step Description
- **Location**: SCR-018d, below title
- **Type**: Display (paragraph)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L334-L335)
- **Data source**: Hardcoded "Live preview is coming in a follow-up. For now, choose how the pixels should be processed."

### EL-SCR-018d-03: Preview Thumbnail
- **Location**: SCR-018d, centre area
- **Type**: Display (image)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L336-L340)
- **Visible when**: image !== null
- **Data source**: image.src
- **Display logic**: Pixelated rendering (image-rendering: pixelated)
- **Constraints**: Shows source image only; live preview forthcoming
- **Alt text**: "Image preview"

### EL-SCR-018d-04: Dithering Checkbox
- **Location**: SCR-018d, controls area
- **Type**: Checkbox + label
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L341-L343)
- **Visible when**: Always
- **Default state**: Checked (dither = true)

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Checkbox toggles; preview updates (when live preview implemented)
- **State mutation**: wizard.setSettings({ ...settings, dither: !dither })
- **Label**: "Use dithering (smoother gradients)"

**Keyboard**: Tab, Space

### EL-SCR-018d-05: Contrast Slider
- **Location**: SCR-018d, controls area
- **Type**: Range input
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L344-L354)
- **Visible when**: Always
- **Default state**: 0 (no adjustment)
- **Label**: "Contrast"

**Intended behaviour:**
- **Trigger**: Drag or click
- **Immediate feedback**: Value updates; preview updates (if live preview implemented)
- **State mutation**: wizard.setSettings({ ...settings, contrast: clamped(-50â€“50) })
- **Constraints**: min -50, max 50, step 1

**Keyboard**: Arrow Left/Right, Tab

### EL-SCR-018d-06: Contrast Output
- **Location**: SCR-018d, right side of contrast slider
- **Type**: Display (output)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L354-L355)
- **Data source**: settings.contrast
- **Display logic**: Shows numeric value (e.g., "+5" or "-10")

### EL-SCR-018d-07: Saliency Checkbox
- **Location**: SCR-018d, controls area
- **Type**: Checkbox + label
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L356-L358)
- **Visible when**: Always
- **Default state**: Unchecked (saliency = false)

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Checkbox toggles; preview overlays saliency map if checked
- **State mutation**: wizard.setSettings({ ...settings, saliency: !saliency })
- **Label**: "Show saliency overlay (advanced)"

**Keyboard**: Tab, Space

### EL-SCR-018d-08: Skip Background Checkbox
- **Location**: SCR-018d, controls area
- **Type**: Checkbox + label
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L359-L361)
- **Visible when**: Always
- **Default state**: Unchecked (skipBg = false)

**Intended behaviour:**
- **Trigger**: Click
- **Immediate feedback**: Checkbox toggles; if checked, reveals background threshold slider (EL-SCR-018d-09)
- **State mutation**: wizard.setSettings({ ...settings, skipBg: !skipBg })
- **Label**: "Skip near-white background"

**Keyboard**: Tab, Space

### EL-SCR-018d-09: Background Threshold Slider
- **Location**: SCR-018d, controls area (revealed if skipBg = true)
- **Type**: Range input
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L362-L372)
- **Visible when**: settings.skipBg === true
- **Default state**: 15
- **Label**: "Background tolerance"

**Intended behaviour:**
- **Trigger**: Drag or click
- **Immediate feedback**: Value updates; background skip tolerance changes
- **State mutation**: wizard.setSettings({ ...settings, bgThreshold: clamped(3â€“50) })
- **Constraints**: min 3, max 50, step 1
- **Description**: Higher values skip more near-white pixels

**Keyboard**: Arrow Left/Right, Tab

### EL-SCR-018d-10: Background Threshold Output
- **Location**: SCR-018d, right side of threshold slider
- **Type**: Display (output)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L372-L373)
- **Data source**: settings.bgThreshold
- **Display logic**: Shows numeric value (e.g., "15")

---

## Screen: SCR-018e â€” ImportWizard Step 5: Confirm

Fifth step. User reviews all settings (dimensions, fabric count, palette mode, dithering, background skip) and sets the project name. On "Generate pattern" click, wizard commits settings and triggers pattern generation.

### EL-SCR-018e-01: Step Title
- **Location**: SCR-018e, top
- **Type**: Display (heading)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L375-L377)
- **Data source**: Hardcoded "Step 5 of 5: Confirm"

### EL-SCR-018e-02: Step Description
- **Location**: SCR-018e, below title
- **Type**: Display (paragraph)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L378-L379)
- **Data source**: Hardcoded "Check the details, then generate your pattern."

### EL-SCR-018e-03: Project Name Input
- **Location**: SCR-018e, input area
- **Type**: Text input
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L380-L389)
- **Visible when**: Always
- **Default state**: Wizard name (basename from image filename)

**Intended behaviour:**
- **Trigger**: Type or clear text
- **Immediate feedback**: Input value updates
- **State mutation**: wizard.setName(text)
- **Constraints**: maxLength 60 characters
- **Placeholder**: "e.g. Rose Garden"

**Keyboard**: Tab, type, Ctrl+A, Ctrl+C/V

### EL-SCR-018e-04: Project Thumbnail
- **Location**: SCR-018e, summary area (left side if space permits)
- **Type**: Display (image)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L390-L395)
- **Visible when**: image !== null
- **Data source**: image.src
- **Display logic**: Small thumbnail of source image
- **Alt text**: "Project thumbnail"

### EL-SCR-018e-05: Summary Details List
- **Location**: SCR-018e, summary area (right side)
- **Type**: Display (definition list, dl/dt/dd)
- **Component**: [creator/ImportWizard.js](creator/ImportWizard.js#L395-L407)
- **Data source:** Wizard state at confirm step
- **Display logic:** Key-value pairs (all read-only):
  - Dimensions: "WxH stitches"
  - Fabric count: "N count"
  - Palette: "Full DMC" / "From stash" / "Limited (N)"
  - Blends: "Allowed" / "Off"
  - Dithering: "On" / "Off"
  - Skip background: "On (tolerance N)" / "Off"
  - Estimate: "~N skein(s), ~Xh Ym"

### EL-SCR-018e-06: Dimensions Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: size.w, size.h
- **Display logic**: "WxH stitches"

### EL-SCR-018e-07: Fabric Count Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: size.fabricCt
- **Display logic**: "N count"

### EL-SCR-018e-08: Palette Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: palette.mode
- **Display logic**: Conditional text based on mode

### EL-SCR-018e-09: Blends Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: palette.allowBlends
- **Display logic**: "Allowed" / "Off"

### EL-SCR-018e-10: Dithering Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: settings.dither
- **Display logic**: "On" / "Off"

### EL-SCR-018e-11: Skip Background Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: settings.skipBg, settings.bgThreshold
- **Display logic**: "On (tolerance N)" or "Off"

### EL-SCR-018e-12: Estimate Row
- **Location**: SCR-018e, summary list
- **Type**: Display (dt/dd pair)
- **Data source**: Computed stitchCount, skeins, timeText
- **Display logic**: "~N skein(s), ~Xh Ym"

---

## DISCOVERED.md appendix

### Discovered screens not in initial interface map

**None.** All screens SCR-006, SCR-009, SCR-015, SCR-017, SCR-018, SCR-018aâ€“e, SCR-055 documented per interface map.

### Edge cases and special behaviors

1. **BulkAddModal reuse**: Component mounted identically in Creator (SCR-015) and Manager (SCR-032); spec covers both via single element documentation.
2. **ImportWizard feature flag**: Entire wizard gated behind `experimental.importWizard` UserPref; legacy single-step modal path untouched if flag false.
3. **Draft persistence**: useImportWizard localStorage draft (cs_import_wizard_draft) auto-clears after 7 days; prevents resume across different source images via imageW/imageH/baseName match.
4. **Blend thread naming**: Palette entries with type="blend" and id="310+550" show as "DMC 310 + DMC 550" in UI; backend uses split logic.
5. **Stash palette builder (DMC-only)**: _buildAllowedPaletteFromStash filters to DMC threads only (not Anchor) because pipeline keys colours by bare id; many Anchor IDs overlap DMC (e.g., both have '310'), causing silent colour merge. Non-DMC support requires namespaced IDs throughout pipeline + save format.
6. **Over-two calculation**: When overTwo=true, effectiveFabric = fabricCt / 2; affects both shopping list skein math and fabric calculator finished size.
7. **Multi-brand resolution in ShoppingListModal**: Rows built by trying findThreadInCatalog('dmc', id) first; if not found, checks ANCHOR array. Matched thread's brand used to form composite stash key (dmc:310 or anchor:403).
8. **Stash lookup in ProjectTab**: Similar dual-lookup logic; getStash[threadKey] reads composite keys from globalStash context (StashBridge-supplied).

---

## VERIFICATION TODO

### P0 â€” Broken (feature does not work)
- [ ] `VER-EL-SCR-006-04-P0` â€” Thread shopping list table doesn't render or shows empty rows when pattern valid
- [ ] `VER-EL-SCR-017-03-04-P0` â€” ShoppingListModal fails to distinguish "need to buy" vs "already owned" sections
- [ ] `VER-EL-SCR-015-02-P0` â€” BulkAddModal tab switching doesn't swap content (stuck on initial tab)

### P1 â€” Misleading or loses data
- [ ] `VER-EL-SCR-006-04-P1` â€” Blend thread rows (type="blend") display incorrectly formatted name or missing colour swatch
- [ ] `VER-EL-SCR-009-02-P1` â€” Stitching speed slider value doesn't persist across session or resets unexpectedly
- [ ] `VER-EL-SCR-015-03-06-P1` â€” Switching brand in BulkAddModal Paste tab should clear input and reset removed-raws; verify state resets correctly
- [ ] `VER-EL-SCR-017-06-P1` â€” Copy list button includes incorrect skein counts (off-by-one or uses fallback estimate instead of stitchesToSkeins result)
- [ ] `VER-EL-SCR-017-07-P1` â€” Push to Stash button writes wrong qty to Manager's shopping list (e.g., owned count instead of needed delta)
- [ ] `VER-EL-SCR-018b-04-P1` â€” "From my stash" palette mode returns empty or includes non-DMC threads (should DMC-only per constraint)
- [ ] `VER-EL-SCR-018a-06-P1` â€” Mirror horizontally button applies mirroring but doesn't visually reflect state in button appearance
- [ ] `VER-EL-SCR-018c-03-04-P1` â€” Width/height inputs allow out-of-bounds values (< 10 or > 300) despite min/max attributes
- [ ] `VER-EL-SCR-018c-05-P1` â€” Lock aspect ratio doesn't auto-adjust height when width changed with lock active
- [ ] `VER-EL-SCR-018d-07-P1` â€” Saliency checkbox shows but overlay doesn't render (future feature; verify checkbox state updates without error)
- [ ] `VER-EL-SCR-018e-08-P1` â€” Palette summary text doesn't match actual palette mode selected (shows "Limited (30)" when "From stash" selected)
- [ ] `VER-EL-SCR-055-02-P1` â€” MaterialsHub tab keyboard navigation (Arrow Left/Right/Home/End) doesn't work or focus gets lost
- [ ] `VER-EL-SCR-006-13-P1` â€” Fabric calculator checkbox "Over two" in main controls and inside calculator get out of sync
- [ ] `VER-EL-SCR-009-20-P1` â€” "Adapt to stash" button opens modal but modal has no effect (verify AdaptModal wiring)
- [ ] `VER-EL-SCR-017-02-P1` â€” Status bar uses wrong count totals (e.g., shows total colours instead of "need to buy" count)

### P2 â€” Tablet and touch targets
- [ ] `VER-EL-SCR-006-02-P2` â€” Over-two checkbox touch target < 44px; test tap hit zone on iPad
- [ ] `VER-EL-SCR-006-03-P2` â€” Sort dropdown target size < 44px or text too small; test on mobile
- [ ] `VER-EL-SCR-006-08-P2` â€” Copy/Share/View Stash buttons may wrap awkwardly at iPad portrait; verify layout
- [ ] `VER-EL-SCR-006-11-P2` â€” Mark all as owned button touch target < 44px
- [ ] `VER-EL-SCR-006-12-13-P2` â€” Fabric calculator header toggle button too small on touch (verify click/tap hit zone)
- [ ] `VER-EL-SCR-006-14-15-P2` â€” Margin input number spinner arrows very small; test touch usability
- [ ] `VER-EL-SCR-009-02-P2` â€” Stitching speed slider track too thin for reliable touch on mobile; verify 6â€“8px minimum
- [ ] `VER-EL-SCR-009-18-P2` â€” Thread toggle button may be too narrow (min-width 55px); test tap accuracy
- [ ] `VER-EL-SCR-015-03-08-P2` â€” Brand selector buttons in BulkAddModal may wrap or compress at narrow viewport; test iPad portrait
- [ ] `VER-EL-SCR-015-09-P2` â€” Kit selector buttons (flow layout) may wrap awkwardly; test at various widths
- [ ] `VER-EL-SCR-017-06-07-P2` â€” Button group in footer may stack vertically on narrow screens; test responsive wrapping
- [ ] `VER-EL-SCR-018a-05-06-07-P2` â€” Rotate/Mirror buttons touch targets â‰¥ 44px; test on tablet
- [ ] `VER-EL-SCR-018b-06-P2` â€” Maximum colours slider track too thin for touch; verify slider size
- [ ] `VER-EL-SCR-018c-03-04-P2` â€” Width/height number inputs spinner controls very small on mobile; test touch usability
- [ ] `VER-EL-SCR-018d-05-08-P2` â€” Contrast/threshold sliders and checkboxes < 44px; verify touch targets

### P3 â€” State persistence and edge cases
- [ ] `VER-EL-SCR-018-draft-P3` â€” ImportWizard draft persists > 7 days; verify localStorage cleanup and TTL enforcement
- [ ] `VER-EL-SCR-018-draft-mismatch-P3` â€” Uploading image A, starting wizard, then uploading image B mid-wizard; verify draft clears (not resuming image B settings with image A params)
- [ ] `VER-EL-SCR-009-14-15-P3` â€” "Own all" and "Clear" buttons update local threadOwned state; verify they don't incorrectly sync to Manager
- [ ] `VER-EL-SCR-017-05-P3` â€” Empty state "No threads in this pattern yet" never shown in practice (valid patterns always have â‰¥1 thread); verify condition correct
- [ ] `VER-EL-SCR-006-17-P3` â€” Fabric calculator note text updates when sW/sH/fabricCt change; verify recalculation is synchronous
- [ ] `VER-EL-SCR-015-13-14-P3` â€” Cancel button in BulkAddModal respects ESC key routed through Overlay; verify focus trap working
- [ ] `VER-EL-SCR-018-discard-P3` â€” Discard confirmation modal appears; "Keep editing" restores focus to wizard; "Discard" clears draft and closes

### P4 â€” Future enhancements / known limitations
- [ ] `VER-EL-SCR-018d-03-P4` â€” Live preview in Step 4 currently placeholder ("coming in follow-up"); when implemented, verify processed image updates on dither/contrast/skip changes
- [ ] `VER-EL-SCR-009-19-P4` â€” Similar threads popover uses StashBridge.suggestAlternatives() method; if method missing, no suggestions shown (graceful degrade)
- [ ] `VER-EL-SCR-018b-04-P4` â€” Stash-only palette mode requires globalStash data from Manager (StashBridge); if user has no owned threads, mode shows empty palette (graceful, but could offer helpful message)
- [ ] `VER-EL-SCR-015-12-P4` â€” Unrecognised threads in kit tab skipped silently (X button removes, but no resolution attempt); future: allow user to map IDs or source alternatives
- [ ] `VER-EL-SCR-006-12-P4` â€” Fabric calculator margin input range (0â€“10 inches) hardcoded; future: allow custom margin ranges per user preference
- [ ] `VER-EL-SCR-017-06-07-P4` â€” Toast notifications for Copy/Push actions; verify toast queue handles multiple rapid clicks (no spam)

### P3 â€” Anchor brand support cross-check
- [ ] `VER-Anchor-BulkAdd-P3` â€” BulkAddModal.parseBulkThreadList accepts "Anchor" / "Anch." prefix; verify resolveIds correctly looks up in ANCHOR array when brand='anchor'
- [ ] `VER-Anchor-Shopping-P3` â€” ShoppingListModal.rowEl resolution tries DMC first (findThreadInCatalog), then ANCHOR; verify correct brand assignment in stash key (dmc: vs anchor:)
- [ ] `VER-Anchor-Palette-Builder-P3` â€” _buildAllowedPaletteFromStash explicitly filters to DMC-only (_splitStashKey checks brand); Anchor threads silently excluded (intentional per constraint). Verify this doesn't confuse users when they see fewer threads than owned in Manager.

### P2 â€” Tablet responsive layout
- [ ] `VER-PrepareTab-Layout-iPad-P2` â€” PrepareTab shopping list + fabric calculator layout doesn't wrap awkwardly at iPad portrait (768px) and landscape (1024px)
- [ ] `VER-ProjectTab-Layout-iPad-P2` â€” ProjectTab sections (Time/Size/Cost/Organiser) stack vertically and remain readable at tablet widths
- [ ] `VER-BulkAddModal-Layout-iPad-P2` â€” BulkAddModal Paste tab textarea, chip list, footer buttons remain usable at tablet widths
- [ ] `VER-ImportWizard-Layout-iPad-P2` â€” ImportWizard steps (especially Step 1 crop viewport, Step 3 inputs, Step 5 summary) render without horizontal overflow at iPad portrait

### P1 â€” Manager BulkAdd identical behavior
- [ ] `VER-Manager-BulkAdd-P1` â€” SCR-032 (Manager BulkAdd Modal) mounts same BulkAddModal component; verify tab switching, brand selection, thread chip rendering, and save action behave identically to Creator mount (SCR-015). Note: trigger context differs (Manager opens from Stash inventory vs Creator from Project tab), but modal behavior should be identical.
