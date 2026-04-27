# Creator Edit-Mode Audit

> Scope: the Creator (`index.html` / `create.html`) when opened on an existing
> pattern (`appMode === 'edit'`). Generation flow excluded.

## TL;DR

- Edit mode currently surfaces the same four numbers (size, fabric count,
  colours, skeins) in **six** places. The header alone is enough; the rest
  is decoration.
- The **Export…** dropdown lives behind the sticky tool strip because
  `.creator-actionbar__menu` is `z-index: 50` while `.toolbar-row` is
  `z-index: 99`. One-line fix.
- The "go to tracker" affordance exists **twice** with different labels
  (`Track this pattern` in the ActionBar, `Start Tracking →` at the bottom of
  the sidebar). The bottom-of-sidebar `[← Create] [Start Tracking →]` pair
  is the one the user is asking us to lift to the top.

---

## Section A — UI inventory (edit mode)

| # | Region | File | Notes |
|---|---|---|---|
| 1 | Top header | [header.js](../header.js) | Project name (editable), `{w}×{h} stitches · {n} colours`, autosave dot, progress bar, `Track ›`, `Download` |
| 2 | Action bar | [creator/ActionBar.js](../creator/ActionBar.js) | `Print PDF`, `Track this pattern`, `Export…` dropdown, plus the same `{w}×{h} · {ct}ct · {n} colours · ~{s} skeins` stats block |
| 3 | Tool strip | [creator/ToolStrip.js](../creator/ToolStrip.js) | Brushes, backstitches, zoom, overlay toggle. Sticky, `z-index: 99` |
| 4 | Right sidebar — Palette tab | [creator/Sidebar.js](../creator/Sidebar.js) | Palette chips with stash dots, DMC search, "Limit to stash" filter |
| 5 | Right sidebar — Tools / View / Preview tabs | [creator/Sidebar.js](../creator/Sidebar.js) | Brush size, view mode, highlight, preview mode |
| 6 | Right sidebar — bottom action bar (edit-only) | [creator/Sidebar.js:1670](../creator/Sidebar.js) | `[← Create]` + `[Start Tracking →]` |
| 7 | Materials hub — Threads sub-tab | [creator/LegendTab.js](../creator/LegendTab.js) | Thread legend, fabric calculator |
| 8 | Materials hub — Stash sub-tab | [creator/PrepareTab.js](../creator/PrepareTab.js) | Deficit list, "Add all to shopping list" |
| 9 | Materials hub — Output sub-tab | [creator/ExportTab.js](../creator/ExportTab.js) | Export presets, format, page settings, Workshop theme, page count, Open in Tracker |
| 10 | Project tab | [creator/ProjectTab.js](../creator/ProjectTab.js) | Pattern summary stats, difficulty, confetti badge, time estimate, finished-size table |
| 11 | Pattern canvas + status bar | [creator/PatternTab.js](../creator/PatternTab.js) | Tool hint, cursor coords, colour-under-cursor readout |
| 12 | Context menu | [creator/ContextMenu.js](../creator/ContextMenu.js) | Right-click actions |

---

## Section B — Duplicate / redundant information

| Datum | Where it appears now | Recommended canonical home |
|---|---|---|
| Pattern name | Header · ProjectTab · ExportTab filename · Download dialog | Header only |
| `{w} × {h}` stitches | Header · ActionBar · ProjectTab · Sidebar glance · PrepareTab · ExportTab page count | Header (always visible) |
| Fabric count `{ct}` | Header · ActionBar · ProjectTab · PrepareTab fabric calc · LegendTab fabric calc · ExportTab geometry | LegendTab fabric calculator (canonical for editing); shown as a meta chip in header |
| Colour count | Header · ActionBar · ProjectTab · Sidebar palette header | Header + Sidebar (it changes when you edit the palette, so the sidebar number must stay live) |
| Skein estimate | ActionBar · ProjectTab · PreviewEstimates · ExportTab | ProjectTab (canonical) + a one-glance number on the materials button |
| Difficulty / confetti % / progress % | ProjectTab badges + Header progress bar | Keep in ProjectTab; header bar stays for progress only |
| Stash status (per-thread) | Sidebar palette dot · LegendTab status column · PrepareTab deficit row | All three are appropriate (different views) — leave |
| `Track this pattern` / `Start Tracking →` | ActionBar (top) · Sidebar bottom action bar | Top only — collapse to a single button labelled "Open in Tracker" |
| `← Create` button | Sidebar bottom action bar | Move to top alongside the tracker button (per user request) |

The redundancy is concentrated in the four-number "stats block". The
ActionBar and the ProjectTab both restate what the header already shows.
Removing the ActionBar restatement reclaims a full row of vertical space
above the canvas without losing any information — the header and ProjectTab
keep the data within one click.

---

## Section C — Export dropdown z-index bug

**Symptom.** Clicking `Export…` opens the menu, but on scroll (or simply
because the tool strip sits above the action bar in stacking order) the menu
renders behind the sticky tool strip.

**Root cause.** `creator/bundle.js` renders the menu inside the action bar
with `position: absolute; z-index: 50`
([styles.css:4626](../styles.css)). Two siblings establish higher stacking
contexts:

- `.tb-topbar` — `z-index: 100` ([styles.css:459](../styles.css))
- `.toolbar-row` — `position: sticky; z-index: 99` ([styles.css:487](../styles.css))

50 < 99 < 100, so the menu is painted underneath both.

**Minimal fix (recommended).**

```css
.creator-actionbar__menu { z-index: 1000; }
```

This single bump puts the menu above the tool strip and the header. No
React change needed, no portal, no layout shift. Verified against existing
`.tb-dropdown { z-index: 500 }` rule (toolbar dropdowns work for the same
reason).

**Why not a portal?** A `ReactDOM.createPortal` to `document.body` would
also fix it but introduces focus-trap complications for the click-outside
handler that already works correctly. Avoid unless we hit a second
stacking-context bug.

---

## Section D — Where the tracker / create buttons live today

| Button | Location | Suggested action |
|---|---|---|
| `Track this pattern` (ActionBar, top) | [creator/ActionBar.js:158](../creator/ActionBar.js) | **Keep.** This is what the user means by "track this pattern is already there". |
| `Start Tracking →` (sidebar bottom, edit-only) | [creator/Sidebar.js:1686](../creator/Sidebar.js) | **Remove** — duplicate of the above. |
| `← Create` (sidebar bottom, edit-only) | [creator/Sidebar.js:1670](../creator/Sidebar.js) | **Move to the top** — promote into the action bar (or into a "mode switch" segmented control in the header) so the Create / Edit / Track triad lives in one consistent place. |

After this consolidation, the sidebar's bottom action bar disappears
entirely in edit mode, and the canvas-side controls regain that vertical
space.

---

## Section E — Four layout options

Each option ships as a self-contained HTML mockup in
[`proposals/`](../proposals/). All four assume:

- The export-dropdown z-index is already fixed (Section C).
- The duplicate `Start Tracking →` button at the bottom of the sidebar is
  removed.

### Option 1 — Tightened action bar (smallest change)

File: [proposals/edit-mode-option1-tighter-bar.html](../proposals/edit-mode-option1-tighter-bar.html)

- Action bar keeps its current row but loses the four-number stats block
  (the header already shows size + colours; skeins move to a chip on the
  Materials tab button).
- `Create` and `Tracker` join the existing primary action group as a
  three-button segmented control: `[Create] [Edit ●] [Track]`.
- Net effect: roughly one row of vertical space reclaimed; zero new
  components.

**Why it works.** Lowest-risk path. Mirrors the pattern from
[creator/MaterialsHub.js](../creator/MaterialsHub.js) (roving-tabindex
segmented control). Users keep every existing affordance.

**Trade-off.** Doesn't address the deeper "edit mode is busy" feeling — it
just trims duplication.

**See it in context:**
- [1b · Materials → Output sub-tab](../proposals/edit-mode-option1b-materials-output.html) — how the export wizard looks once the action bar's stats block is gone, with count chips on the hub tabs.
- [1c · Mobile / 380 px](../proposals/edit-mode-option1c-mobile.html) — two phone frames showing the default state and the export menu open above the tool strip.
- [1d · Project planner tab](../proposals/edit-mode-option1d-project-planner.html) — Project tab keeps a hero stats strip (size · stitchable · colours · skeins) plus the time + finished-size cards.

---

### Option 2 — Stats popover (medium change)

File: [proposals/edit-mode-option2-stat-popover.html](../proposals/edit-mode-option2-stat-popover.html)

- The stats block becomes a single `Pattern info ▾` button. Click reveals
  a popover with: dimensions, fabric, colours, skeins, difficulty, time
  estimate.
- Action bar collapses to one row of action buttons + the new info
  trigger + the segmented mode switch.
- ProjectTab loses its summary section (now redundant with the popover)
  and becomes purely the time / finished-size planner.

**Why it works.** All the numbers are still one click away, but the
default view is calm. Solves the "bloated" feedback without hiding
anything important.

**Trade-off.** Introduces one new component (popover). Needs a focus trap
and Escape handling — well-trodden ground in this app.

**See it in context:**
- [2b · Materials → Output sub-tab](../proposals/edit-mode-option2b-materials-output.html) — output flow restyled as a 3-card preset wizard with a review strip and a dashed "other formats" tray.
- [2c · Mobile / 380 px](../proposals/edit-mode-option2c-mobile.html) — two phone frames: calm default with a single info chip, and the info chip raised as a native-feeling bottom sheet.
- [2d · Project planner tab](../proposals/edit-mode-option2d-project-planner.html) — the Project tab is purely a planner (no stats duplication), with a discoverability callout pointing at the popover.

---

### Option 3 — Unified header (larger change)

File: [proposals/edit-mode-option3-unified-header.html](../proposals/edit-mode-option3-unified-header.html)

- Header grows to two rows: top row keeps brand + project name + autosave
  + progress; bottom row adopts the action bar's contents (mode switch,
  Print, Export, Materials).
- The standalone `.creator-actionbar` is deleted.
- Tool strip docks directly under the header.

**Why it works.** Edit mode shrinks to: header, tools, canvas, sidebar.
Four regions instead of five. Strong sense of "all the chrome lives at the
top".

**Trade-off.** Touches `header.js` (shared with the tracker), so we'd need
a per-page extension slot. Highest churn of the four options.

---

### Option 4 — Left rail launcher (most ambitious)

File: [proposals/edit-mode-option4-side-rail.html](../proposals/edit-mode-option4-side-rail.html)

- Action bar is replaced by a thin left rail with iconographic buttons:
  `Create ▸ Edit ● Track` mode switch at the top, then `Print`, `Export`,
  `Materials`, `Stats`. Tooltips on hover, full labels in expanded state.
- The canvas becomes near full-bleed. Sidebar stays on the right.
- Stats live in a Stats sheet that slides in from the rail.

**Why it works.** Maximum canvas. The mode switch is unambiguous and
spatially anchored. Matches the visual language of pro creative tools
(Figma, Affinity).

**Trade-off.** Biggest visual departure; would want a usability check on
mobile (rail collapses to a bottom dock under 720 px). Also requires
re-homing the Materials hub — currently a tab, would become a sliding
panel.

---

## Recommendation

Ship **Option 1** as the immediate cleanup (one PR, zero new components,
fixes the bloat complaint and the z-index bug at the same time), then
prototype **Option 2** as a follow-up. Options 3 and 4 are useful as a
direction-setting exercise but represent multi-PR work.
