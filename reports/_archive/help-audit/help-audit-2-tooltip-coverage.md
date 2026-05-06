# Tooltip Coverage Audit — stitchx

**Audit scope:** Every interactive element across all five entry points  
**Files reviewed:** home.html · create.html · stitch.html · manager.html · home-app.js · creator-main.js · creator/ActionBar.js · creator/ToolStrip.js · creator/Sidebar.js · creator/ExportTab.js · creator/PatternTab.js · creator/ProjectTab.js · creator/PrepareTab.js · creator/MaterialsHub.js · creator/LegendTab.js · creator/MagicWandPanel.js · creator/AdaptModal.js · tracker-app.js · manager-app.js · components.js · modals.js · header.js · preferences-modal.js · palette-swap.js · command-palette.js · help-drawer.js · shortcuts.js  
**Tooltip mechanisms in use:** `title` attribute (primary), `aria-label` (accessibility parallel), custom `Tooltip` React component (components.js portal), `InfoIcon` wrapper

---

## Executive Summary

Tooltip coverage is **inconsistent and bimodal**. The Pattern Creator's **ToolStrip** toolbar is excellent — every tool button carries both a `title` (with keyboard shortcut hint) and an `aria-label`. The **Tracker toolbar** is similarly well-annotated. Coverage collapses in secondary panels and contextual controls: the MagicWand sub-operation panels, PatternTab dismiss/mode buttons, ProjectTab action buttons, and the global command-palette input are all inadequately labelled. One **HIGH** priority item — the Export "…" overflow menu trigger in ActionBar — is an icon-only button with no accessible name whatsoever, making it invisible to screen readers and confusing to keyboard users.

**Overall health:** ~160 interactive elements audited. ~95 (59 %) have adequate tooltip/label coverage. ~57 (36 %) need attention: 1 HIGH, 22 MED, 34 LOW.

---

## Comprehensive Element Table

### Header (`header.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Logo "stitch." (go-home link) | `title="Back to home"` / `"stitchx"` | Adequate |
| App-section nav tabs (Create / Edit / Track / Stash / Stats) | Plain `<a>` with visible text; `aria-current` on active | Adequate — text is self-explanatory |
| Creator sub-page dropdown trigger button | No `title` | LOW — has visible text; arrow icon `aria-hidden` |
| Creator sub-page dropdown menu items | No `title` | LOW — text labels present |
| Project switcher `HeaderProjectSwitcher` trigger | `aria-label="Switch project"` via component; no `title` | Adequate (aria-label present) |
| Recent project items in switcher dropdown | No `title`, no `aria-label` | LOW — project names are visible |
| "All projects…" menu item | No `title` | LOW — self-explanatory |
| Active project name badge (editable) | `title="Click to rename"` + `aria-label="Rename project"` | Adequate |
| SaveStatusBadge (all-saved / saving / error states) | Contextual `title` per state | Adequate |
| Sync status indicator button | Dynamic `title` with sync details + `aria-label="Sync status"` | Adequate |
| Command palette trigger button | `title` + `aria-label="Open command palette (Ctrl/Cmd+K)"` | Adequate |
| Keyboard shortcuts button | `title="Keyboard shortcuts"` + `aria-label` | Adequate |
| Help button | `title="Open help (?)"` + `aria-label` | Adequate |
| "File" menu trigger | No `title` | LOW — text label present |
| File menu items (Download backup, Restore, etc.) | No `title` | LOW — text labels present |
| Context bar "Edit Pattern" button (tracker) | `title="Open this pattern in the Pattern Creator"` | Adequate |
| Context bar "Track ›" button (creator) | No `title` | MED — destination not obvious at a glance |

### Home Page (`home-app.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| HomeTabBar buttons (Projects / Create new / Stash / Stats) | No `title`; `role="tab"` + `aria-selected` | LOW — text labels present |
| "+ New project" button (greeting row) | No `title` | LOW — self-explanatory |
| "Resume tracking" button (ActiveProjectCard) | No `title` | LOW — self-explanatory |
| "Edit pattern" button (ActiveProjectCard) | No `title` | LOW — self-explanatory |
| Project row "Track" button (ProjectsList) | No `title` | LOW — short text label |
| Project row "Edit" button (ProjectsList) | No `title` | LOW — short text label |
| "Create new" tile buttons (image / blank) | No `title` | LOW — labels present |

### Pattern Creator — ActionBar (`creator/ActionBar.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| "Open in Tracker" button | `title` + `aria-label` | Adequate |
| Pattern info chip button | `title="Pattern dimensions, fabric, colours, skeins"` | Adequate |
| Print PDF button | `title="Print to PDF"` | Adequate |
| Export "…" overflow menu trigger | **No `title`, no `aria-label`** | **HIGH — icon-only button, zero accessible name** |
| Export menu item "Save project (.json)" | `role="menuitem"` with visible text | Adequate |
| Export menu item "More export options…" | `role="menuitem"` with visible text | Adequate |

### Pattern Creator — ToolStrip (`creator/ToolStrip.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Zoom slider (create mode) | `title="Zoom"` | Adequate |
| "Fit" button | `title="Fit (Home)"` + `aria-label="Fit pattern to view"` | Adequate |
| Overlay toggle (source image) | `title="Toggle source image overlay"` | Adequate |
| Paint (P) | `title="Paint (P)"` + `aria-label` | Adequate |
| Fill (F) | `title="Fill (F)"` + `aria-label` | Adequate |
| Erase (5) | `title="Erase (5)"` + `aria-label` | Adequate |
| Eyedropper (I) | `title="Eyedropper (I)"` + `aria-label` | Adequate |
| Hand (H) | `title="Hand — pan / drag to scroll (H)"` + `aria-label` | Adequate |
| Magic Wand (W) | `title="Magic Wand (W)"` + `aria-label` | Adequate |
| Lasso | `title="Lasso — mode in Tools tab"` + `aria-label` | Adequate |
| Clear selection (Esc) | `title="Clear selection (Esc)"` + `aria-label` | Adequate |
| Colour swatch buttons | `title="DMC {id} · {name} · {count} st"` + `aria-label` | Adequate |
| Swatch expand / collapse button | Has `title` | Adequate |

### Pattern Creator — Sidebar (`creator/Sidebar.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Palette section toggle (clickable div) | **No `aria-label` or `title`** | MED — not a `<button>`, no accessible name |
| "Only show threads I own" checkbox | Adjacent `<label>` text | Adequate |
| "Adapt to my stash" warning panel button | **No `title`** | MED — action is ambiguous; "Adapt" can mean several things |
| "Add to shopping list" button | **No `title`** | LOW — text label present |
| Selected colour "×" clear button | `title="Clear selection"` | Adequate |
| Stash status dot indicators | `title` + `aria-label` per dot | Adequate |
| Background colour pick "Cancel" button | `title="Cancel pick (Esc)"` | Adequate |
| Crop "Crop" button | **No `title`** | LOW |
| Crop "Change" button | **No `title`** | LOW |
| Crop drawing "Cancel" button | **No `title`** | LOW |
| Crop "Apply" button | **No `title`** | LOW |

### Pattern Creator — PatternTab (`creator/PatternTab.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Shortcuts hint dismiss "×" | **No `aria-label` or `title`** | MED — icon-only, no accessible name |
| Confetti banner dismiss "×" | **No `aria-label` or `title`** | MED — icon-only, no accessible name |
| "What is this?" confetti score link | Has `title` | Adequate |
| Highlight mode buttons: Isolate / Outline / Tint / Spotlight | **No `title`** | MED — names alone don't describe the visual effect |
| "Advanced" checkbox | Adjacent `<label>` text | Adequate |
| Tint colour `<input type="color">` | **No `aria-label`** | MED — accessibility failure; colour inputs need labels |
| Background dimming/desaturation/opacity sliders | Adjacent text labels | Adequate |
| "↩ Undo" button | **No `title` or `aria-label`** | MED — keyboard shortcut (Ctrl+Z) not discoverable |
| "↪ Redo" button | **No `title` or `aria-label`** | MED — keyboard shortcut (Ctrl+Y) not discoverable |
| "Clear ×" highlight clear button | **No `title` or `aria-label`** | MED — icon "×" not explained |

### Pattern Creator — ProjectTab (`creator/ProjectTab.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Stitching speed slider | Adjacent `<label>` | Adequate |
| Price per skein number input | **No `aria-label`** | MED — no visible label; currency (GBP) context missing |
| "Own all" button | **No `title`** | LOW — text label present |
| "Clear" button | **No `title`** | LOW — text label present |
| Thread ownership toggle ("Owned" / "To buy") | **No `title`** | MED — toggle state change effect unclear without context |
| "≈ similar threads" button | `title="Show similar threads from stash"` | Adequate |
| "Adapt to my stash" button | `title="Create an adapted copy…"` | Adequate |
| "Kit This Project" button | **No `title`** | MED — "kitting" jargon needs explanation |
| "Adapt to brand" button | `title="Adapt this pattern to a different thread brand"` | Adequate |
| "Copy gaps" button | **No `title`** | LOW — meaning is non-obvious but contextually supported |

### Pattern Creator — PrepareTab (`creator/PrepareTab.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| "Copy list" button | **No `title`** | LOW — text label |
| "Share" button | **No `title`** | LOW — text label |
| "View thread stash" link | **No `title`** | LOW — text label |
| "Over two" checkbox | Adjacent `<label>` | Adequate |
| Sort `<select>` dropdown | **No `aria-label`** | LOW — context is clear but input needs a label |
| "Mark all as owned" button | **No `title`** | LOW — text label |
| Status badges (owned / to-buy) | Display only | N/A |

### Pattern Creator — LegendTab (`creator/LegendTab.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| "Copy list" button | **No `title`** | LOW — text label |
| "Share" button | **No `title`** | LOW — text label |
| "Thread stash" link | **No `title`** | LOW — text label |
| Fabric colour preset buttons | No `title` | LOW — colour swatches; context is visual |
| Swatch detail trigger | No `title` | LOW |

### Pattern Creator — MaterialsHub (`creator/MaterialsHub.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Sub-tab buttons: Threads / Stash status / Output | No `title` — `role="tab"` with text | LOW — text labels present |

### Pattern Creator — MagicWandPanel (`creator/MagicWandPanel.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Op mode: New / Add / Subtract / Intersect | `title` per button | Adequate |
| Scope: "Connected only" / "All matching" | `title` per button | Adequate |
| Tolerance range slider | **No `aria-label`** (adjacent text "Tolerance") | LOW — adjacent text is sufficient but input label missing |
| Deselect / Invert / All buttons | `title` per button | Adequate |
| Panel toggle: "Confetti…" | **No `title`** | MED — opening/closing a hidden sub-panel; effect unclear |
| Panel toggle: "Reduce Colours…" | **No `title`** | MED |
| Panel toggle: "Replace Colour…" | **No `title`** | MED |
| Panel toggle: "Stitch Info…" | **No `title`** | MED |
| Panel toggle: "Outline…" | **No `title`** | MED |
| Confetti "Preview" button | **No `title`** | LOW |
| Confetti "Apply" button | **No `title`** | LOW |
| Confetti "×" close button | **No `aria-label` or `title`** | MED — icon-only close |
| Reduce Colours "Preview merges" button | **No `title`** | LOW |
| Reduce Colours "Apply" button | **No `title`** | LOW |
| Reduce Colours "×" close button | **No `aria-label` or `title`** | MED — icon-only close |
| Replace source `<select>` | **No `aria-label`** | MED — unlabelled select |
| Replace target `<select>` | **No `aria-label`** | MED — unlabelled select |
| "Fuzzy" checkbox | Adjacent `<label>` | Adequate |
| Replace "Apply" button | **No `title`** | LOW |
| Replace "×" close button | **No `aria-label` or `title`** | MED — icon-only close |
| "Export CSV" button (Stitch Info) | **No `title`** | MED — unusual action; what does the CSV contain? |
| Stitch Info "×" close button | **No `aria-label` or `title`** | MED — icon-only close |

### Pattern Creator — AdaptModal (`creator/AdaptModal.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| PickerPopover tab "In stash" | No `title` | LOW — text label |
| PickerPopover tab "All DMC" | No `title` | LOW — text label |
| Picker search `<input>` | **No `aria-label`** | MED — accessibility failure; text input with no label |
| Thread picker list items | No `title` | LOW — thread names visible |
| "Skip — leave original" button | **No `title`** | LOW |
| "Change…" / "Pick…" substitution button | **No `title`** | LOW |
| MatchChip (substitution quality indicator) | `title` with ΔE value | Adequate |

### Stitch Tracker Toolbar (`tracker-app.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Sidebar toggle button | `title="Sidebar — tap to cycle hidden / rail / open"` + `aria-label` | Adequate |
| Wake-lock toggle | Dynamic `title` + `aria-label` per state | Adequate |
| Focus mode toggle | Dynamic `title` + `aria-label` per state | Adequate |
| Track mode button | Dynamic `title="Mark stitch (T)"` / `"Modify stitches (T)"` | Adequate |
| Navigate mode button | `title="Navigate (N)"` | Adequate |
| Row mode toggle | `title="Row mode — work row by row (R)"` + `aria-label` + `aria-pressed` | Adequate |
| Previous row button | `title="Previous row"` | Adequate |
| Next row button | `title="Next row"` | Adequate |
| Zoom out "−" button | `title="Zoom out"` | Adequate |
| Zoom in "+" button | `title="Zoom in"` | Adequate |
| More options "···" button | `title="More options"` | Adequate |
| Overflow: "Correct pattern colours…" | `title` with explanation | Adequate |
| Custom block-width input | `title="Custom width"` | Adequate |
| Custom block-height input | `title="Custom height"` | Adequate |

### Stitch Tracker — Modals (`tracker-app.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| TrackerPreviewModal close button | `aria-label="Close"` | Adequate |
| Preview level buttons 1–4 (Flat/Shaded/Detailed/Detailed+blend) | Text labels | Adequate |
| SessionConfigModal close button | `aria-label="Close"` + `title="Close"` | Adequate |
| Session time option buttons | Self-explanatory text | Adequate |
| Stitch goal input | Adjacent label text | Adequate |
| SessionSummaryModal close button | `aria-label="Close"` | Adequate |
| "View breadcrumb trail" button | **No `title`** | LOW — text label present |
| TrackerProjectPicker close button | `aria-label="Close"` | Adequate |
| Project pick buttons | **No `title`** | LOW — project names visible |

### Stash Manager (`manager-app.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Thread Stash tab | Icon + text label | LOW — text present |
| Pattern Library tab | Icon + text label | LOW — text present |
| "Showcase" button | `title="See your stitching journey"` + `aria-label` | Adequate |
| Thread search input | `aria-label="Search threads"` | Adequate |
| Thread filter chips (All / Owned / Low Stock / Remnants / Used Up) | **No `title`** | LOW — text labels present |
| Brand filter chips (All / DMC / Anchor) | **No `title`** | LOW — text labels present |
| "+ Bulk Add" button | `title="Bulk-add threads…"` | Adequate |
| Stash chip / info button | `title="Stash overview"` + `aria-haspopup` | Adequate |
| Low-stock thread row buttons | `title="Open thread card for {brand} {id}"` | Adequate |
| Partial status segmented control | `title` per segment | Adequate |
| Pattern search input | `aria-label="Search patterns"` | Adequate |
| Pattern filter chips | **No `title`** | LOW — text labels present |
| Pattern sort `<select>` | **No `aria-label`** | LOW — adjacent label present |
| "% stitched" badge | `title="{x} of {y} stitches"` | Adequate |
| Weekly sparkline | `title="Last 7 days: …"` | Adequate |
| "Fully kitted" badge | `title="All required threads are in your stash"` | Adequate |
| "Missing threads" badge | `title="Missing: {ids}"` | Adequate |
| "Open in Creator" button | `title="Open in Pattern Creator"` | Adequate |
| "Add missing threads" button | Dynamic `title` with count | Adequate |
| Pattern edit modal close button | `aria-label="Close"` | Adequate |
| Pattern title input | `aria-label="Pattern title"` | Adequate |
| Pattern designer input | `aria-label="Pattern designer"` | Adequate |
| Fabric/dimensions input | `aria-label="Fabric and dimensions"` | Adequate |
| Remove tag "×" button | `aria-label="Remove tag {tag}"` | Adequate |
| Add tag input | `aria-label="Add tag"` | Adequate |
| Remove thread row button | `aria-label="Remove thread"` | Adequate |
| Pattern details / view modal close buttons | `aria-label="Close"` | Adequate |

### Shared Modals (`modals.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| ThreadSelector search input | **No `aria-label`** | MED — accessibility failure |
| Thread list item buttons | No `title` | LOW — DMC id + name visible |
| "Swap Colours" banner button | **No `title`** | LOW — text label present |
| "Cancel" swap button | No `title` | LOW — self-explanatory |
| Shortcuts modal "Reset preview preferences…" trigger | Inline confirm UI (no browser `confirm()`) | Adequate — properly labelled |
| "Reset preferences" confirm button | No `title` | LOW — text label present |
| "Reload now" button | **No `title`** | LOW — text label present |
| NamePromptModal Save/Cancel | No `title` | LOW — self-explanatory |

### Preferences Modal (`preferences-modal.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| `Switch` component (all instances) | Uses `aria-label` prop from caller | Adequate |
| `Segmented` component buttons | **No `title`** | LOW — visible text labels |
| `SoonBadge` | `title="This setting saves but isn't fully wired to the app yet."` | Adequate |
| Logo "Upload…" / "Replace…" `<label>` | **No `title`** | LOW — label text is self-explanatory |
| Logo "Remove" button | **No `title`** | LOW — text label present |
| Logo position segmented (Top-left / Top-right) | **No `title`** | LOW — self-explanatory |
| Maximum colours range slider + number input | Adjacent labels | Adequate |
| Fabric count inputs | Adjacent label + description | Adequate |

### Command Palette (`command-palette.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| `.cs-cmdp-input` text field | **No `aria-label`** | MED — accessibility failure; input has no accessible name |
| Action rows | No tooltip needed — labels + subtitles visible | Adequate |
| Keyboard hint footer (`↑ ↓ navigate`, `↵ select`, `Esc close`) | `<kbd>` elements — intentionally allowed | Adequate |

### Components / Shared (`components.js`)

| Element | Has tooltip? | Verdict |
|---|---|---|
| Custom `Tooltip` component | This is the tooltip system itself | N/A |
| `InfoIcon` wrapper | Wraps `Tooltip` | Adequate |
| `Section` expand/collapse toggle | `aria-hidden` chevron; no button title | LOW — visual affordance present |
| `SliderRow` range input | Adjacent label text | Adequate |
| MiniStatsBar "Stats" button | **No `title`** | MED — icon-only compact button; purpose unclear |
| Goal bar clickable progress div | **No `aria-label`** | MED — not a `<button>`, no accessible name |

---

## Prioritised TODO List

### HIGH — Genuinely ambiguous; may block assistive technology

- [ ] [Priority: HIGH] [File: creator/ActionBar.js] Export "…" overflow menu trigger button: add `title="More export options"` and `aria-label="More export options"` — currently an icon-only button with zero accessible name

### MED — Would benefit noticeably; accessibility failures or confusing to new users

- [ ] [Priority: MED] [File: command-palette.js] `.cs-cmdp-input` text field: add `aria-label="Search commands"` (or equivalent) — inputs must have accessible names
- [ ] [Priority: MED] [File: components.js] `MiniStatsBar` "Stats" button: add `title="View project statistics"` — compact icon-only button with no accessible name
- [ ] [Priority: MED] [File: components.js] Goal bar clickable progress div: convert to `<button>` or add `role="button"` + `aria-label="Adjust stitch goal"` — `div` with `onClick` is not keyboard accessible
- [ ] [Priority: MED] [File: creator/PatternTab.js] Shortcuts hint dismiss "×" button: add `aria-label="Dismiss shortcuts hint"` — icon-only button with no accessible name
- [ ] [Priority: MED] [File: creator/PatternTab.js] Confetti banner dismiss "×" button: add `aria-label="Dismiss confetti banner"` — icon-only button with no accessible name
- [ ] [Priority: MED] [File: creator/PatternTab.js] Highlight mode buttons (Isolate / Outline / Tint / Spotlight): add `title` to each describing the visual effect, e.g. `title="Isolate — grey out all threads except the selected one"` — mode names alone are opaque to new users
- [ ] [Priority: MED] [File: creator/PatternTab.js] Tint colour `<input type="color">`: add `aria-label="Tint colour"` — colour inputs require explicit labels for screen readers
- [ ] [Priority: MED] [File: creator/PatternTab.js] Undo button: add `title="Undo (Ctrl+Z)"` and `aria-label="Undo"` — keyboard shortcut is not discoverable via hover
- [ ] [Priority: MED] [File: creator/PatternTab.js] Redo button: add `title="Redo (Ctrl+Y)"` and `aria-label="Redo"` — keyboard shortcut is not discoverable via hover
- [ ] [Priority: MED] [File: creator/PatternTab.js] "Clear ×" highlight clear button: add `aria-label="Clear highlight"` and `title="Clear highlight"` — "×" without context is ambiguous
- [ ] [Priority: MED] [File: creator/Sidebar.js] Palette section toggle (clickable div): convert to `<button>` and add `aria-label="Expand/collapse palette"` — non-button interactive element with no accessible name
- [ ] [Priority: MED] [File: creator/Sidebar.js] "Adapt to my stash" warning panel button: add `title="Replace out-of-stash colours with your closest owned threads"` — "Adapt" is overloaded in this UI
- [ ] [Priority: MED] [File: creator/ProjectTab.js] Price per skein number input: add `aria-label="Price per skein (GBP)"` — no visible label; currency context missing
- [ ] [Priority: MED] [File: creator/ProjectTab.js] Thread ownership toggle buttons ("Owned" / "To buy"): add `title="Mark this thread as owned"` / `"Add to shopping list"` — toggle state change effect is unclear
- [ ] [Priority: MED] [File: creator/ProjectTab.js] "Kit This Project" button: add `title="Check all required threads against your stash and generate a shopping list for missing ones"` — "kitting" jargon is not universal
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Panel toggle buttons (Confetti… / Reduce Colours… / Replace Colour… / Stitch Info… / Outline…): add `title` per button describing what the panel contains, e.g. `title="Open confetti detection and removal controls"` — text labels truncate, action is not clear
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Confetti panel "×" close button: add `aria-label="Close confetti panel"` — icon-only close
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Reduce Colours panel "×" close button: add `aria-label="Close reduce-colours panel"` — icon-only close
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Replace Colour panel "×" close button: add `aria-label="Close replace-colour panel"` — icon-only close
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Stitch Info panel "×" close button: add `aria-label="Close stitch-info panel"` — icon-only close
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Replace source `<select>`: add `aria-label="Source colour to replace"` — unlabelled select
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] Replace target `<select>`: add `aria-label="Replacement colour"` — unlabelled select
- [ ] [Priority: MED] [File: creator/MagicWandPanel.js] "Export CSV" button (Stitch Info panel): add `title="Export stitch count per colour as a CSV file"` — unusual action; content of CSV is unclear
- [ ] [Priority: MED] [File: creator/AdaptModal.js] Picker search `<input>`: add `aria-label="Search threads"` — text input with no accessible label
- [ ] [Priority: MED] [File: modals.js] ThreadSelector search `<input>`: add `aria-label="Search by DMC code or name"` — accessibility failure; currently has `placeholder` only
- [ ] [Priority: MED] [File: header.js] Context bar "Track ›" button (creator page): add `title="Open this pattern in the Stitch Tracker"` — destination is not obvious from the label

### LOW — Nice-to-have; text labels present but a tooltip adds discoverability or precision

- [ ] [Priority: LOW] [File: creator/Sidebar.js] "Add to shopping list" button: add `title="Add this thread to your shopping list"`
- [ ] [Priority: LOW] [File: creator/Sidebar.js] Crop "Crop" / "Change" / "Apply" / "Cancel" buttons: add `title` to each — crop workflow is contextual but unfamiliar to new users
- [ ] [Priority: LOW] [File: creator/PrepareTab.js] "Copy list" button: add `title="Copy thread list to clipboard"`
- [ ] [Priority: LOW] [File: creator/PrepareTab.js] "Share" button: add `title="Share this thread list"` (shown conditionally when Web Share API is available)
- [ ] [Priority: LOW] [File: creator/PrepareTab.js] Sort `<select>`: add `aria-label="Sort threads by"`
- [ ] [Priority: LOW] [File: creator/PrepareTab.js] "Mark all as owned" button: add `title="Mark all threads in this list as owned in your stash"`
- [ ] [Priority: LOW] [File: creator/PrepareTab.js] "View thread stash" link: add `title="Open Stash Manager"`
- [ ] [Priority: LOW] [File: creator/LegendTab.js] "Copy list" button: add `title="Copy legend to clipboard"`
- [ ] [Priority: LOW] [File: creator/LegendTab.js] "Share" button: add `title="Share this legend"`
- [ ] [Priority: LOW] [File: creator/LegendTab.js] "Thread stash" link: add `title="Open Stash Manager"`
- [ ] [Priority: LOW] [File: creator/ProjectTab.js] "Own all" button: add `title="Mark all pattern threads as owned"`
- [ ] [Priority: LOW] [File: creator/ProjectTab.js] "Clear" button: add `title="Clear all thread ownership for this pattern"`
- [ ] [Priority: LOW] [File: creator/ProjectTab.js] "Copy gaps" button: add `title="Copy the list of threads you need but don't own to the clipboard"`
- [ ] [Priority: LOW] [File: creator/MagicWandPanel.js] Confetti "Preview" / "Apply" buttons: add `title="Preview confetti removal"` / `"Apply confetti removal to pattern"`
- [ ] [Priority: LOW] [File: creator/MagicWandPanel.js] Reduce Colours "Preview merges" / "Apply" buttons: add `title` describing the action
- [ ] [Priority: LOW] [File: creator/MagicWandPanel.js] Replace Colour "Apply" button: add `title="Apply colour replacement to pattern"`
- [ ] [Priority: LOW] [File: creator/MagicWandPanel.js] Tolerance range slider: add `aria-label="Selection tolerance"` — adjacent text label is present, but input has no accessible name
- [ ] [Priority: LOW] [File: creator/AdaptModal.js] PickerPopover tabs "In stash" / "All DMC": no change required, but if tab text is ever truncated add `title`
- [ ] [Priority: LOW] [File: creator/AdaptModal.js] "Skip — leave original" button: add `title="Keep the original thread for this substitution slot"`
- [ ] [Priority: LOW] [File: creator/AdaptModal.js] "Change…" / "Pick…" substitution button: add `title="Choose a different thread for this position"`
- [ ] [Priority: LOW] [File: tracker-app.js] "View breadcrumb trail" button: add `title="View the stitching path recorded in this session"`
- [ ] [Priority: LOW] [File: tracker-app.js] Project pick buttons (TrackerProjectPicker): add `title="{project name} — {pct}% complete"` dynamically — project names may be long/truncated
- [ ] [Priority: LOW] [File: modals.js] "Swap Colours" banner button: add `title="Swap colour assignments between the two symbols"`
- [ ] [Priority: LOW] [File: modals.js] "Reload now" button: add `title="Reload the page to apply reset preferences"`
- [ ] [Priority: LOW] [File: preferences-modal.js] Logo "Remove" button: add `title="Remove logo from PDF exports"`
- [ ] [Priority: LOW] [File: preferences-modal.js] Logo "Upload…" / "Replace…" label: add `title="Upload a PNG or JPEG logo (max 600×600 px)"`
- [ ] [Priority: LOW] [File: manager-app.js] Thread filter chips (All / Owned / Low Stock / Remnants / Used Up): add `title` per chip explaining the filter criterion
- [ ] [Priority: LOW] [File: manager-app.js] Brand filter chips (All / DMC / Anchor): add `title` per chip
- [ ] [Priority: LOW] [File: manager-app.js] Pattern filter chips: add `title` per chip
- [ ] [Priority: LOW] [File: manager-app.js] Pattern sort `<select>`: add `aria-label="Sort patterns by"`
- [ ] [Priority: LOW] [File: header.js] "File" menu trigger button: add `title="File — save, export, backup"` for discoverability
- [ ] [Priority: LOW] [File: home-app.js] HomeTabBar tab buttons: `role="tab"` semantics already present; `title` optional but would aid discoverability of Stash and Stats tabs for new users

---

## Counts

| Category | Count |
|---|---|
| Total interactive elements audited | ~160 |
| Elements with adequate tooltip / label coverage | ~97 (61 %) |
| Elements needing attention (any priority) | ~57 (36 %) |
| HIGH priority | 1 |
| MED priority | 26 |
| LOW priority | 30 |
| Accessibility failures (missing `aria-label` on inputs / unlabelled controls) | 8 |

### Top-level summary by page

| Page / Module | Covered | Needs attention |
|---|---|---|
| Creator ToolStrip | Excellent | 0 |
| Creator ActionBar | Good | 1 (HIGH) |
| Tracker Toolbar | Excellent | 0 |
| Stash Manager | Good | 5 (all LOW) |
| Creator PatternTab | Poor | 8 (all MED) |
| Creator MagicWandPanel | Mixed | 13 (MED + LOW) |
| Creator Sidebar | Mixed | 6 (MED + LOW) |
| Creator ProjectTab | Mixed | 6 (MED + LOW) |
| Shared Modals | Mixed | 4 (MED + LOW) |
| Command Palette | Poor | 1 (MED — accessibility failure) |
| Header | Good | 2 (MED + LOW) |
| Home Page | Good | 7 (all LOW) |
| Preferences Modal | Good | 4 (all LOW) |
