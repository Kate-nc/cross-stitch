# Thread Stash rebuild: option 1 ("My threads" list)

Status: built on branch `claude/zen-carson-0blhk8`.
Follow-up work (Stash hub home page, stock-take, shopping checklist) is in
[hub-and-stock-take-plan.md](hub-and-stock-take-plan.md).

## Why

The redesign review measured the current Thread Stash page and found nine
problems with three root causes:

1. The page lists the whole thread catalogue (1,229 DMC and Anchor shades),
   not the threads you own.
2. Catalogue import, 13 filter controls, a summary chip, up to four alert
   panels and the grid are all stacked on one page with no hierarchy.
3. Editing happens somewhere else: select a card, then use a side panel (a
   bottom sheet on phones), one skein at a time.

Option 1 replaces the card grid and side panel with an owned-first list you
edit in place, and moves everything about buying threads to its own tab.

## What changes

### Tabs

| Before | After |
| --- | --- |
| Thread Stash (badge counted skeins) | Thread Stash (badge counts threads in your stash) |
| Project materials (unstyled) | Shopping list (badge counts threads to buy); includes project reservations |
| Pattern Library | Pattern Library (unchanged) |

- `?tab=inventory`, `?tab=patterns` keep working. `?tab=shopping` (linked from
  the Creator's shopping list) and `?tab=materials` open the Shopping list tab.
- The tab bar scrolls inside itself and never widens the page. The Showcase
  link shrinks to its icon on narrow screens.

### Thread Stash tab

- **Toolbar** (wraps instead of hiding controls):
  - Search: "Find a thread, or type a number to add one".
  - Filter, as one segmented control: Owned (default), Running low, Opened,
    Used up (only when there are any), Every shade.
  - View menu: sort and brand.
  - Add threads menu: Bulk add, Custom thread catalogues.
- **Attention line**: one line that says how many threads need buying,
  for which patterns, and which threads two patterns compete for. It
  links to the Shopping list tab. Dismissing it hides it until the
  numbers change.
- **List rows**: swatch, number, brand label (DMC or Anchor on every
  row), name, a full-skein stepper, the opened-skein level, the
  patterns that use the thread, and status pills (Short N, Low, On list).
- **Expanded row** (replaces the side panel):
  - Opened skein: one control with None, ¾, ½, ¼ and Used up.
  - "Keep at least": the thread's own minimum.
  - What each pattern needs.
  - Add to / Remove from shopping list, and Remove from stash.
- **Search adds threads**: when you search from Owned, Running low, Opened
  or Used up, matching shades you don't own appear under "Not in your
  stash", each with an Add button.
- **Long lists**: rows render 200 at a time with a "Show more" button. The
  old page rendered 1,229 cards on every visit.
- **Phone layout**: rows become two lines with the stepper on the right.
  There is no bottom sheet.

### Shopping list tab

1. **To buy**: the combined list from `StashBridge.getToBuy().shopping`.
   Each row shows the patterns that need the thread, or "Added by you", and
   how many skeins to buy. Rows you added yourself can be removed. Copy
   list puts a plain-text list on the clipboard.
2. **Thread Conflicts**, **To buy for (pattern)** and **Low stock: needed**
   keep their collapsible panels and remembered open/closed choices.
   "Low stash: not currently needed" goes away; the Running low filter
   shows those threads instead.
3. **Project materials**: the reservation tool restyled as cards and a
   proper table, with the long rules moved under "How reservations work".
   Its controls and labels stay the same.

### Custom thread catalogues

Custom thread catalogues moves out of the main view into a dialog opened
from Add threads, with styled controls. Import and export behaviour is
unchanged.

### One meaning of "low"

```
usable  = full skeins + opened skein (¾ = 0.75, ½ = 0.5, ¼ = 0.25)
minimum = the thread's own "Keep at least" value, or else the
          Preferences "running low" value (default 1)
low     = the thread is in your stash and usable < minimum
```

The card badge, the Running low filter, the Low stock panel and the
attention line all use these helpers. The preferences description changes
from "this many skeins or fewer" to "less than this", which matches what
the help already said.

## Fix map

| # | Finding | Fix |
| --- | --- | --- |
| 1 | Shows 1,229 shades, not your stash | Owned is the default filter; Every shade is opt-in and paginated |
| 2 | Alerts push the stash off screen | One attention line; panels move to the Shopping list tab |
| 3 | Filter row doesn't fit | Wrapping toolbar, segmented filter, View menu |
| 4 | Phone editor cut off | Tab bar contained; no bottom sheet; inline 44 px steppers on touch |
| 5 | Every change is a detour | Stepper in each row; editor expands under the row |
| 6 | Opened skein contradicts itself | One control including Used up; used up draws as an empty, dashed circle |
| 7 | "Low" means two things | Shared `isThreadLow` rule everywhere |
| 8 | Unstyled catalogues and materials | Catalogues dialog; restyled materials section |
| 9 | Misleading labels, empty side panel | Badge counts threads; brand label on every row; side panel removed from this tab |

House rules kept: no emoji or symbol glyphs in UI (icons from `icons.js`),
Workshop tokens only (no raw hex in component CSS), and ES2020 syntax.

## Files

- `manager-app.js`: list, toolbar, attention line, shopping tab, catalogues
  dialog, shared low-stock helpers. Removes the unused `PartialGauge` and the
  stash summary chip.
- `styles.css`: new `.stash-*` rules; the `.tcard`/`.thread-grid`/
  `.gauge-lg`/`.qty-ctrl` rules the Thread Stash tab no longer uses are removed.
  `.mgr-rpanel` stays for the Pattern Library.
- `preferences-modal.js`: running-low description.
- `user-prefs.js`: `stashAttentionDismissed`.
- `help-drawer.js`, `changelog.js`, `onboarding-wizard.js` (step copy).
- `compiled/manager-app.compiled.js` via `node build-runtime-js.js`.
- Tests:
  - Unit: update the source-scanning tests that named the old grid,
    `tests/managerGaugeDom.test.js` and `tests/mobileTouchErgonomics.test.js`.
  - Unit: add `tests/stashListRules.test.js` for the low rule, filters and
    pagination.
  - e2e: update `tests/e2e/stash-collapsible-alerts.spec.js` and
    `tests/e2e/material-reservations.spec.js`.

## Not in this change

- "Bought" checkboxes that move skeins into the stash (option 4).
- The Stash hub overview page (option 4).
- Stock-take keypad mode (option 5).
- Selecting several threads at once.

These are planned in [hub-and-stock-take-plan.md](hub-and-stock-take-plan.md).

## Build notes

Things found while building:

- **Phone overflow cause.** The page widening on phones came from the
  Stash Manager's own tab bar (the Showcase link), not the shared header,
  which already scrolls inside itself. The tab bar now scrolls inside
  itself. On phones the labels shorten ("Shopping", "Library"), with the
  full text kept for screen readers.
- **Anchor threads.** The Anchor catalogue loads on demand. The list
  rebuilds its catalogue once it arrives, so owned Anchor threads always
  show.
- **Dark theme.** The legacy `html.pref-dark button { … !important }` rule
  painted every button grey, hiding the selected filter, opened-skein level
  and the active tab. The stash page and tab bar are excluded from it.
- **Old audit specs.** `tests/mobile-audit/*gauge*` proved pixel-equality
  of the old card gauge and were removed with it. The side-panel audit
  checks now open the Pattern Library, which still has the panel.
- **Measured afterwards** (sample stash of 22 threads):
  - 22 rows on load instead of 1,229.
  - No horizontal overflow at 320, 390, 1100 or 1440 px.
  - Smallest touch target 44 px.
