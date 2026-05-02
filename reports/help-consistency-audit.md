# Help & Tooltip Consistency Audit

_Branch: `tool-tips` — audit run after Proposal A + B + documentation pass_

---

## 1. Patterns found (8 distinct approaches)

| # | Pattern | Where used | Touch-safe? | Screen-reader? |
|---|---------|------------|-------------|----------------|
| 1 | **`title=` only** (no `aria-label`) | `header.js`, `home-screen.js`, `creator/ActionBar.js`, `tracker-app.js` icon buttons | No | Poor — `title` is not reliably announced |
| 2 | **`title=` + `aria-label`** pair | `creator/ToolStrip.js` (all tool buttons), `creator/Sidebar.js` source-overlay toggle | No (title) | Yes (`aria-label` is announced) |
| 3 | **React `Tooltip`** component | `creator/Sidebar.js` — colour swatches, mode buttons, filter-type buttons | Yes (hover+touch toggle built in) | Partial — no `role="tooltip"` or `aria-describedby` wiring |
| 4 | **`InfoIcon`** (wraps `Tooltip`) | `creator/Sidebar.js` — 7+ setting fields | Yes (inherits `Tooltip`) | Same gap as #3 |
| 5 | **`InlineHint` / `FieldWithHint`** | `creator/Sidebar.js` — 6 controls (Width/Height, Fabric, Max colours, Min stitches, Confetti, Smooth) | Yes (focus-triggered, no hover dependency) | Yes — renders visible text in DOM |
| 6 | **Help Drawer** (`window.HelpDrawer`) | `header.js` (direct `.open()`), `keyboard-utils.js`, `components.js` InlineHint "Learn more" — but `manager.html` / older code still falls back to `setModal("help")` | Yes | Yes — `role="dialog"`, focus-trapped |
| 7 | **Custom cursor-following tooltip** | `stats-activity.js` — activity heatmap cells | No (cursor position, no touch) | No — `position:fixed` div, no ARIA |
| 8 | **SABLE `?` badge** | `stats-page.js` — SABLE Index card title | No | No — `<span title="...">?</span>` with inline styles, no `aria-label` or `role` |
| 9 | **Coachmarks** (`coaching.js`) | First-use flow in Creator and Tracker | Partial | Partial — overlay scrim, no focus management to drawer |

---

## 2. Key inconsistencies

### 2a. `title=` without `aria-label` on actionable elements

`creator/ActionBar.js` has three icon-bearing buttons:

```js
title: "Open this pattern in the Stitch Tracker"     // no aria-label
title: "Pattern dimensions, fabric, colours, skeins" // no aria-label
title: "Other export options"                         // no aria-label
```

`header.js` similarly mixes — some buttons have both, some have `title=` only:

```js
// has both (good):
'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts'
// title= only (bad):
title: 'Open help (?)'
title: 'Cycle theme: light, dark, or follow system setting'
title: 'Download a .json copy…'
```

`home-screen.js` has ~10 `title=`-only instances on icon buttons (batch export, delete, status dropdowns).

`tracker-app.js` thread counter span: `title: 'Skeins needed'` — screen readers won't surface this.

### 2b. Tooltip widths are arbitrary

`InfoIcon` in `creator/Sidebar.js` uses five different `width` values with no apparent rule: 200, 200, 240, 230, 220, 220, 220px. The `Tooltip` component itself defaults to 180px. There is no design token or constant for tooltip width.

### 2c. SABLE `?` badge is a one-off

`stats-page.js` builds its own in-title `<span title="...">?</span>` (lines 1894–1895):

```js
h('span', {
  title: 'SABLE = Stash Accumulated Beyond Life Expectancy\n...',
  style: { cursor:'help', color:'var(--text-tertiary)', ... }
}, '?')
```

No `aria-label`, no `role="tooltip"`, no touch affordance. Neither `InfoIcon` nor the `Tooltip` component is used here, even though both exist and are globally available.

### 2d. Custom tooltip in `stats-activity.js`

The activity heatmap rolls its own cursor-following tooltip (`position:fixed`, `left: tooltip.x + 14, top: tooltip.y + 14`). This is a legitimate special case (data visualisation, many cells) but it has no touch equivalent and no ARIA.

### 2e. HelpDrawer adoption is split

```js
// Correct (direct):
window.HelpDrawer.open({ tab: 'shortcuts' })

// Outdated fallback still present in header.js:
if (window.HelpDrawer) window.HelpDrawer.open({ tab: 'shortcuts' }); else setModal('shortcuts');

// Older pages still call setModal('help') entirely
```

The `keyboard-utils.js` approach calls `HelpDrawer.open({ tab: 'help' })` directly — that's the target pattern everywhere.

### 2f. Coachmarks are isolated

`coaching.js` coachmarks complete and disappear with no "read more" link to the help drawer. A user who dismisses a coachmark has no second path to that content unless they open the drawer independently.

### 2g. `InfoIcon` vs `FieldWithHint` used independently, rarely together

Controls in `creator/Sidebar.js` have either an `InfoIcon` (hover only) **or** an `InlineHint` (focus), but rarely both tiers together. The intent of Proposal B was a three-tier stack; the current implementation fills in one tier per control and leaves the other blank.

---

## 3. Best-practice locations (reference implementations)

| File | Pattern | Why it's good |
|------|---------|---------------|
| `creator/ToolStrip.js` | `title=` + `aria-label` pair | Title for sighted hover; `aria-label` for screen readers |
| `creator/Sidebar.js` (Width/Height, Fabric count) | `FieldWithHint` + `helpTopic` | Focus-triggered text, "Learn more" → drawer, visible in DOM |
| `components.js` `Tooltip` | Touch toggle built in, portal positioning | Handles both pointer and touch |
| `help-drawer.js` | `role="dialog"`, roving tablist, `aria-live` | Full WCAG AA pattern |

---

## 4. Recommended standard

### The three-tier rule

Every help surface should fit one of three tiers. Pick the smallest tier that answers the user's question:

| Tier | Component | Trigger | Use for |
|------|-----------|---------|---------|
| **T1 — Identity** | `aria-label` + `title=` | Always present | Icon-only buttons, abbreviations, inline badges |
| **T2 — Context** | `Tooltip` (for discrete elements) or `InlineHint` (for settings fields) | Hover/focus | One-sentence "what this does" |
| **T3 — Detail** | Help Drawer article (`HelpDrawer.open(…)`) | "Learn more" link or `?` button | Full explanation, examples, related topics |

### Specific recommendations

1. **Replace all `title=`-only on actionable elements with `title=` + `aria-label`.**  
   Priority files: `creator/ActionBar.js`, `header.js` (remaining gaps), `home-screen.js`.  
   ToolStrip is already correct — use it as the reference.

2. **Replace the SABLE `?` span with `InfoIcon`.**  
   `InfoIcon` is globally available, handles touch, and is already used in the same file's neighbours. The `width` should be standardised (see point 4).

3. **Add a touch-safe fallback to the stats-activity custom tooltip.**  
   Simplest fix: render the tooltip text also via `aria-label` on each cell, and on `touchstart` show/hide the tooltip div. The component can stay custom-built (it has legitimate density reasons) but needs an accessible label per cell.

4. **Standardise `Tooltip` / `InfoIcon` widths to two values only:**  
   - `160px` — short labels (thread names, colour names)  
   - `220px` — descriptive sentences  
   Remove the 200/230/240px one-offs and replace with the nearest standard.

5. **Remove the `setModal('shortcuts')` / `setModal('help')` fallback branches in `header.js`.**  
   `HelpDrawer` is loaded on every page. The guard `if (window.HelpDrawer)` is vestigial; simplify to a direct call.

6. **Add a "Read more in help" link at the end of each coachmark.**  
   `coaching.js` coachmark objects already have a `topic` field concept — wire the last step of each coachmark sequence to `HelpDrawer.open({ tab:'help', query: topic })`.

7. **Fill the dual-tier gap in `SliderRow`.**  
   Controls that have `inlineHint` but no `helpText` should add a short one-liner `helpText` (shown as `InfoIcon` on hover). Controls that have `helpText` but no `inlineHint` should add a `inlineHint` with the same text, expanded. The goal is every non-trivial setting reaching T2 in both hover *and* focus modes.

---

## 5. Migration priority

| Priority | Change | Effort | Files |
|----------|--------|--------|-------|
| P1 | Add `aria-label` to `title=`-only icon buttons | Low — mechanical | `creator/ActionBar.js`, `header.js`, `home-screen.js` |
| P1 | Replace SABLE `?` span with `InfoIcon` | Low | `stats-page.js` |
| P2 | Standardise InfoIcon/Tooltip widths to 160/220 | Low — search + replace | `creator/Sidebar.js` |
| P2 | Remove `setModal` fallback branches in `header.js` | Low | `header.js` |
| P3 | Add touch-safe `aria-label` to stats-activity cells | Medium | `stats-activity.js` |
| P3 | Add `helpText` to every `SliderRow` that only has `inlineHint` | Medium — editorial | `creator/Sidebar.js` |
| P4 | Wire coachmarks to help drawer at sequence end | Medium | `coaching.js` |
| P4 | Audit remaining `title=`-only on non-icon elements in `tracker-app.js` | Low | `tracker-app.js` |

---

## 6. What to convert everything to

**Short answer: keep all 8 patterns, but apply them by tier and mandate the pairing rules above.**

Do not collapse everything into a single pattern — the tiers serve different interaction modes. The correct target state is:

- Every actionable icon → `aria-label` + `title=` (T1)
- Every settings field → `InfoIcon` (hover, T2) + `InlineHint` (focus, T2) + `helpTopic` (drawer link, T3)
- Every standalone `?`/info badge → `InfoIcon` with standardised width
- Every custom data-vis tooltip (activity heatmap) → keep custom positioning, add `aria-label` per data cell
- HelpDrawer → direct `HelpDrawer.open()` calls everywhere, no legacy `setModal` fallbacks

`creator/Sidebar.js` Width/Height with `FieldWithHint` is the exemplar for settings controls.  
`creator/ToolStrip.js` tool buttons are the exemplar for icon-only actionable elements.
