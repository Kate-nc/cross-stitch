# Plan: Upgrade `help-drawer.js` to Match Proposal A (Sliding Panel)

The existing `HelpDrawer` is already a right-side sliding panel at 380px / 100vw mobile —
the core mechanic is already right. This plan documents the specific gaps and the tasks
required to bring it to full Proposal A quality.

---

## Current state summary

| What we have | Proposal A target |
|---|---|
| 3-tab bar (Help / Shortcuts / Getting Started) | Category grid → article list → article detail, with search |
| Tabs have no ArrowLeft/ArrowRight keyboard nav or `aria-controls` | Full WCAG 2.1 AA tablist (roving tabindex, `aria-controls`, `role="tabpanel"`) |
| Help tab: flat scrollable list of every bullet, filtered by search | Category card grid + article list + article detail with back navigation |
| InfoIcon / hover Tooltip for in-page field help | `InlineHint` already implemented (Proposal B) — "Learn more" already opens drawer |
| No "was this helpful?" feedback signal | Optional future addition |
| Section accordions missing `aria-expanded` | Fix as part of accessibility pass |
| "Getting Started" is a flat prose list | Kept as-is (still useful); could become a category card |

---

## Task list

### Task 1 — Add WCAG 2.1 AA keyboard navigation to the tab bar

**File:** `help-drawer.js`  
**Scope:** The 3-tab bar (`tabRef`, keyboard handler in `HelpDrawer` component)

The current tab bar uses `onClick` only. Add:
- `role="tablist"` on the tab container (already present as a wrapper `div` — confirm it has the role)
- `role="tab"` on each tab button
- `aria-selected` on each tab button
- `aria-controls="cs-help-panel-{tabId}"` on each tab button
- `role="tabpanel"` + `id="cs-help-panel-{tabId}"` + `aria-labelledby` on each panel wrapper
- Roving `tabIndex` (0 for active tab, -1 for others)
- `onKeyDown` handler on the tab bar that handles:
  - `ArrowLeft` / `ArrowRight` → move focus and activate adjacent tab
  - `Home` → activate first tab
  - `End` → activate last tab

**Reference implementation:** `creator/MaterialsHub.js` already does this correctly — copy the pattern.

---

### Task 2 — Add category-grid landing view to the Help tab

**File:** `help-drawer.js`  
**Scope:** `HelpSection` component + `HelpDrawer` state

Currently the Help tab renders `HelpSection` which shows all topics flat. Change it to a
3-state view:

1. **Landing (default)** — category card grid, 2 columns
2. **Article list** — clicked a category → list of section headings within that topic area
3. **Article detail** — clicked a heading → full article with back button

**State additions inside `HelpDrawer`:**
```js
var _cat = React.useState(null);  // selected topic id (e.g. "creator")
var _art = React.useState(null);  // selected section index within the topic
```

**Category cards** — one per `HELP_TOPICS` entry, showing:
- An icon from `window.Icons` (map each topic id to an icon name in a `TOPIC_ICONS` object)
- The `area` label
- Count of sections as a badge

**Category icons to add to `icons.js`** (if missing):
- `wand` — Pattern Creator (already: `Icons.wand`)
- `gauge` — Stitch Tracker (create if missing)
- `package` — Stash Manager (create if missing)
- `download` — Saving and Backup (already: `Icons.download`)
- `book` — Glossary (create if missing)

**Back navigation** — when in article-list or article-detail view, replace search bar header
with a `← Back` button row.

**Search interaction** — when the user types in the search box, clear `_cat` / `_art` state
and fall back to the current flat-filtered view across all topics. This preserves the existing
search behaviour.

---

### Task 3 — Add a "Getting Started" category card

**File:** `help-drawer.js`  
**Scope:** `HELP_TOPICS` array

Add a synthetic entry to `HELP_TOPICS` (or handle it specially):
```js
{ id: "getting-started", area: "Getting Started", sections: GETTING_STARTED.map(...) }
```

This makes the landing category grid also include Getting Started, and allows the existing
Getting Started tab content to be reached via the category grid rather than a separate tab.
The "Getting Started" tab can then be removed from the tab bar, leaving two tabs: **Help** and
**Shortcuts**.

---

### Task 4 — Surface the drawer's keyboard shortcut in the header button

**Files:** `header.js`, `help-drawer.js`  
**Scope:** The "Help" button that exists in the shared page header

The current button just says "Help". Add a visible `?` key hint next to it:

```js
h("button", { ... },
  Icons.help(),
  " Help ",
  h("kbd", { style: { fontSize: 10, ... } }, "?")
)
```

Also ensure the button has `aria-expanded` wired to `HelpDrawer.isOpen()`. Since the drawer
is a global singleton, this requires either a `cs:helpDrawerStateChange` event or polling in
a `useEffect`. The event approach is cleaner:
- In `help-drawer.js`, dispatch `window.dispatchEvent(new CustomEvent("cs:helpStateChange", {detail:{open}}))` inside `open()` and `close()`.
- In `header.js`, listen for `cs:helpStateChange` and update local `isOpen` state.

---

### Task 5 — Fix section accordion `aria-expanded`

**File:** `help-drawer.js`  
**Scope:** `HelpSection` render

The section accordions in the current flat view don't have `aria-expanded`. Since the view is
not collapsible (sections are always expanded), this is a no-op today — but when the article
detail view is added (Task 2), the detail pane's "back" button area should announce correctly.

Also add `aria-live="polite"` to the panel content area so screen readers are informed when
the view switches between landing, list, and detail states.

---

### Task 6 — Add a Glossary help topic for the 5 key undefined terms

**File:** `help-drawer.js`  
**Scope:** `HELP_TOPICS` → existing `"glossary"` entry

Extend the existing Glossary topic with bullets for the 5 terms the audit flagged as
completely undocumented:
- Confetti stitches — what they are and why they matter
- Stitch Score — how it's calculated (0–100, penalises confetti and orphan stitches)
- Fabric count — holes per inch, and the common Aida counts
- Blend stitch — two threads needled through the same stitch
- ΔE (delta-E) — the colour-distance metric used in the Adapt Modal

---

### Task 7 — Content gap fill: Stats page and Tracker stitching style

**File:** `help-drawer.js`  
**Scope:** `HELP_TOPICS` — add two new topic entries

Both the Stats page and the Tracker stitching style picker were flagged in the audit as
having **zero help coverage**. Add:

```js
{
  id: "stats", area: "Stats & Progress",
  sections: [
    { heading: "Reading your stats", body: "...", bullets: [...] },
    { heading: "Sessions and streaks", ... },
    { heading: "Stitch Score", body: "The Stitch Score (0–100) rates how easy your pattern will be to sew...", bullets: [...] }
  ]
},
{
  id: "stitching-style", area: "Stitching Style",
  sections: [
    { heading: "Full cross stitch vs half stitch vs over-two", ... },
    { heading: "Choosing a stitching style", ... }
  ]
}
```

---

### Task 8 — Accessibility: `aria-live` for search results

**File:** `help-drawer.js`  
**Scope:** Search result container

Add `aria-live="polite"` and `aria-atomic="false"` to the panel content region.
When the search query changes and the result count changes, prepend a visually hidden
`<span aria-live="assertive">` with the result count for screen readers:
`"3 results for fabric count"`.

---

## Implementation order

| Priority | Task | Effort | Reason |
|---|---|---|---|
| 1 | Task 1 — Tab keyboard nav | Small | Accessibility blocker; straightforward copy from MaterialsHub.js |
| 2 | Task 4 — Header `aria-expanded` + `?` hint | Small | Single file, no structural change |
| 3 | Task 6 — Glossary additions | Small | Pure content, no code change |
| 4 | Task 7 — Stats + Stitching style topics | Small | Pure content |
| 5 | Task 2 — Category grid landing view | Medium | Core Proposal A visual identity |
| 6 | Task 3 — Getting Started as category | Small (follows Task 2) | Clean up tab count |
| 7 | Task 5 — `aria-expanded` / `aria-live` | Small | Polish |
| 8 | Task 8 — Search result count aria-live | Small | Polish |

Tasks 1, 4, 6, and 7 are safe to implement in any order without affecting each other.
Task 3 depends on Task 2. Task 8 depends on Task 2.

---

## Files modified

| File | Tasks |
|---|---|
| `help-drawer.js` | 1, 2, 3, 5, 6, 7, 8 |
| `header.js` | 4 |
| `icons.js` | 2 (if gauge/book/package icons are missing) |

No bundle rebuild required — none of these files are in `creator/`.
