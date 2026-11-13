# Stash hub home page and stock-take: plan of action

Follows [option-1-plan.md](option-1-plan.md), which rebuilt the Thread
Stash as an owned-first list and added the Shopping list tab. This plan
adds the parts of the other two options that were chosen:

- **Option 4, Stash hub**: an Overview page becomes the Stash Manager's
  home page, the first thing you see when you open Stash.
- **Option 5, Count and shop**: "Bought" checkboxes that move skeins into
  the stash, a shopping checklist that works on a phone in the shop, and a
  stock-take mode for counting a whole floss box.

## What option 1 already gives us

| Piece | Status |
| --- | --- |
| Owned-first list with steppers in every row (44 px on touch) | Done (option 5's row design) |
| Shared low-stock rule, counts per filter (`stashCounts`) | Done; the Overview reuses it |
| Combined shopping list (`toBuy.shopping`) with patterns per thread | Done; the Overview reuses it |
| `StashBridge.markBought` / `markBoughtMany` (add skeins and clear the list flag in one transaction) | Already in `stash-bridge.js`, not yet used by the Manager |
| `StashBridge.whatCanIStart()` (coverage % per pattern) | Already used for the Pattern Library's "ready to start" count |

So the remaining work is mostly UI. No storage or sync changes are needed.

## Order of work

Each phase ships on its own and leaves the app consistent.

1. **Phase 1: Bought checkboxes** (small). Shared by the Overview and the
   phone checklist, so it goes first.
2. **Phase 2: Overview as the Stash home page** (medium).
3. **Phase 3: Side menu on wide screens** (small to medium).
4. **Phase 4: Stock-take mode** (medium).
5. **Phase 5: Shopping checklist on phones** (small). Builds on Phase 1.

---

## Phase 1: Bought checkboxes

**Status: built.** Undo uses a new `StashBridge.unmarkBoughtMany`, the exact
inverse of `markBoughtMany`, instead of `updateThread`. It subtracts the
added skeins in one transaction, relative to the current count, so edits
made in between are kept. On phones a ticked row's stepper moves to its own
line. Tests: `tests/stashBought.test.js` and `tests/e2e/stash-bought.spec.js`.

**What you see.** On the Shopping list tab:

- Each row gets a checkbox.
- The header gets an **Add ticked to stash** button, which shows how many
  skeins it will add, for example "Add 3 skeins to stash".
- A toast confirms ("3 threads added to your stash") and offers **Undo**.

**How**

- Ticked rows are local React state, keyed by thread, so ticking writes
  nothing to the stash yet.
- The button calls `StashBridge.markBoughtMany({ [key]: qty })` with the
  row's `tobuyQty`.
- The Manager's existing `cs:stashChanged` handler reloads the stash.
  `refreshToBuy()` then drops rows the pattern no longer needs, so no extra
  bookkeeping is required.
- **Undo** subtracts the same quantities through `updateThread`. This keeps
  the per-thread history entries balanced, the same way the Remove from
  stash undo works. Rows added by hand go back on the list with
  `markManyToBuy`.
- Each quantity can be edited before adding, with a small stepper on the
  row, because shops sell what they have.

**Tests**

- Unit: quantities are passed through, and hand-added rows return to the
  list on Undo.
- e2e: tick two rows, add, check owned counts and that the list shrinks.

**Copy**: help ("Shopping list" section), changelog.

## Phase 2: Overview as the Stash home page

**Status: built.** As planned, with these choices:

- **Buy next.** It shares `renderShopRow` and the Bought ticks with the
  Shopping list tab, and its rows always stack because the column is
  narrow.
- **Links.** Typing in the Overview's search carries on in Thread Stash's
  search. The Pattern Creator's "Thread stash" and "View thread stash"
  links now pass `?tab=inventory`. The top-bar Stash link, the command
  palette, the phone menus and the Stats page land on the Overview.
- **Tests.** `tests/stashOverview.test.js` and
  `tests/e2e/stash-overview.spec.js`.

**What you see.** Opening Stash (from the top bar, Home or a project)
lands on **Overview**. The page has four parts:

1. **Four tiles**, each a link to the matching view:

   | Tile | Shows | Opens |
   | --- | --- | --- |
   | Threads | Threads in your stash (DMC n, Anchor n) | Thread Stash, Owned |
   | Full skeins | Total full skeins, plus how many are opened | Thread Stash, Opened |
   | To buy | Skeins across n threads | Shopping list |
   | Running low | Threads below their minimum | Thread Stash, Running low |

2. **Buy next**: the combined shopping list, with the patterns each thread
   is for and the Phase 1 checkboxes. It shows up to 8 rows, then
   "See all n".
3. **Ready to start**: patterns ordered by how much of their thread you
   own, with a progress bar. 100% shows in the success colour. Each one
   opens the pattern in the Pattern Library.
4. **Needs attention**: conflicts (threads two patterns compete for) and
   up to five running-low threads. Each links to that thread's row.

**Routing**

- No `?tab` now opens `overview`. `?tab=inventory|shopping|patterns|materials`
  keep their current meaning.
- Every link that should open the list directly keeps passing
  `?tab=inventory`, for example the Creator's "Open Stash" link and Home's
  deep links. Audit `grep -rn "manager.html" --include=*.js` and decide
  case by case.
- The Thread Stash attention line stays, because people still reach the
  list directly. On the Overview it is replaced by the Needs attention
  panel.

**Where it lives in code**

- A new `StashOverview` component in `manager-app.js`, fed by values the
  Manager already computes: `stashCounts`, `toBuy`, `conflicts`,
  `lowStockAlerts` and `readyToStart`.
- Tiles and panels reuse `.stash-card`, `.stash-pill` and `.stash-chip`.
  New CSS adds `.stash-tiles` and `.stash-progress`.

**Empty states**

- **No stash yet**: one card with "Add your first threads" (opens search
  focused) and Bulk add.
- **No patterns**: Ready to start explains that patterns saved in the
  Creator appear here.

**Tests**

- Unit: the tile counts match `stashCounts`, and the routing default is
  overview.
- e2e: tiles navigate to the right filter, and Buy next ticks work.
- Update `tests/e2e/manager-touch.spec.js` and the onboarding step that
  points at the Thread Stash tab.

**Copy**:

- Help: a new "Overview" section first in the Stash Manager area.
- Onboarding: the manager walkthrough's first step points at Overview.
- `TERMINOLOGY.md`: tabs become Overview, Thread Stash, Shopping list,
  Pattern Library.
- Changelog.

## Phase 3: Side menu on wide screens

**Status: built.** Details of what shipped:

- **One element.** A single `<nav class="mgr-tab-bar mgr-nav">` is
  restyled by CSS: a 228 px side menu from 1024 px, the tab bar below.
- **Real links.** Entries are links (`?tab=…`, `aria-current="page"`), so
  Ctrl or Cmd-click opens a new tab. The address follows the section
  through `history.replaceState`.
- **Narrow screens.** Custom catalogues and Import and export (`?tab=catalogues`,
  `?tab=transfer`) appear in the menu only on wide screens. On narrow ones
  they are in Thread Stash > Add threads.
- **Catalogues page.** `CatalogueDialog` became `CataloguePanel`, shown on
  its own page. The CSV download and the project materials JSON export are
  shared helpers.
- **Number keys.** 1 to 4 are registered through `useShortcuts`, so they
  are ignored while typing in a field.
- **Tests.** `tests/stashNav.test.js` and `tests/e2e/stash-nav.spec.js`.

From 1024 px, the tab bar becomes a left side menu, as in the option 4
mockup:

```
Overview
Thread Stash      22
Shopping list      6
Pattern Library    3
────────────
Custom catalogues
Import and export
```

- Below 1024 px it stays the current tab bar.
- **Custom catalogues** becomes a page instead of a dialog, reusing the
  `CatalogueDialog` body.
- **Import and export** links Bulk add, Export custom CSV and Export
  shopping list JSON, which are spread around today.
- Keyboard: the menu is a `nav` with links and `aria-current="page"`.
  Number keys 1 to 4 switch sections; add them to `shortcuts.js` and to the
  help shortcut list. `tests/helpDrawerShortcutsSync.test.js` enforces the
  help list.

## Phase 4: Stock-take mode

**Status: built.** Choices made while building:

- **Typing never loads a thread.** In DMC, "35" is a thread and also the
  start of 350 to 3599, so typing only previews the match ("DMC 35 Fuchsia
  (n more start with 35)"). **Save, next** (or Enter) saves the current
  count and loads the typed thread.
- **Brand toggle and the white key.** Brand is a DMC / Anchor toggle beside
  the entry. The pad's white key steps through Blanc, Ecru and B5200.
- **Closing.** Done, or closing the dialog, always goes to the summary
  when anything was counted, so Undo all is never lost.
- **Marking uncounted threads used up.** That step is recorded in the same
  session, so Undo all covers it too.
- **Code.** Writes go through `setThreadCount` (opened level, then full
  skeins) and so through `updateThread`'s history. The matcher
  (`matchThreadCode`, `describeThreadMatch`, `summariseStockTake`) is pure.
- **Also reachable from** the Import and export page and the command
  palette.
- **Tests.** `tests/stashStockTake.test.js` and
  `tests/e2e/stash-stock-take.spec.js`.

For sitting down with a floss box and counting everything in one go.

**Entry points**

- Add threads > **Stock-take**.
- On phones, a floating **Stock-take** button over the Thread Stash list.

**The screen** (full-screen `Overlay` sheet on phones, dialog on desktop):

- A large swatch, the number and name of the current thread, and "Was 3
  full skeins".
- A large stepper for full skeins, prefilled with the current count, and
  the opened-skein control.
- A **Next thread** entry:
  - On phones, a number pad: 0 to 9, a **Blanc / Ecru** key, a brand toggle
    (DMC / Anchor) and **Save, next**.
  - On desktop, just type, because the field has focus.
  - Matches show live, for example "Matches 791 to 799", and an exact match
    loads that thread.
- A running count ("14 threads counted") and a list of this session's
  changes.

**Saving**

- Each **Save, next** applies the count through `updateThread`, so the
  existing autosave, history entries and sync behaviour apply unchanged.
- Closing shows a summary ("Counted 42 threads: 30 unchanged, 9 changed,
  3 new") with **Undo all**, which restores the snapshot taken when the
  session started.
- An optional "Mark threads I didn't count as used up" step is off by
  default, comes after the summary, and needs a confirmation that names
  how many threads it affects. It is a destructive bulk change.

**Tests**

- Unit: the code matcher, including "b5200", "blanc", "ecru", leading
  zeros and Anchor numbers.
- e2e: count three threads, Undo all restores them.

## Phase 5: Shopping checklist on phones

**Status: built.** Details of what shipped:

- **Where ticks are kept.** Ticks are kept in `localStorage` under
  `cs_stash_bought_v1` at every width, not only on phones. That key is not
  in the backup key list, so ticks stay on the device. Unreadable values are
  ignored, and ticks for threads that leave the list are dropped.
- **Grouping.** `groupShoppingRows` puts a thread two patterns need under
  the first, and gives a pattern named only by a conflict its own group,
  before "Added by you". Inside a group, a row leaves out that pattern's
  own name.
- **Pinned footer.** On phones the document scrolls rather than the page
  box, so the Shopping page is not a scroll container there and the footer
  sticks to the screen.
- **Tests.** `tests/stashChecklist.test.js` and
  `tests/e2e/stash-checklist.spec.js`.

- On a phone, the Shopping list rows from Phase 1 get 44 px checkboxes and
  group by pattern, with "Added by you" last.
- A sticky footer holds **Copy** and **Done: add n skeins**.
- Ticks survive leaving the page or losing signal in the shop. They are
  saved per device in `localStorage` under a versioned key, and cleared
  when the threads are added.

## Risks and decisions to confirm

- **Landing change.** People who open Stash to edit counts get one extra
  click (Overview, then Thread Stash). The Threads tile is the large first
  tile, and deep links keep going straight to the list. If that still feels
  slow, a "Start on" preference (Overview or Thread Stash) is a small
  addition.
- **Bought with odd quantities.** `markBought` adds whole skeins. Opened
  skeins are not bought, so this is fine.
- **Stock-take and sync.** Counting overwrites owned values. A session on
  two devices at once resolves the same way any other edit does
  (last-writer per field, with history kept). The summary shows exactly
  what changed before you leave.
- **Home.** Home's "Stash" link opens the Overview automatically, so
  nothing on Home has to change. Adding a small stash card to Home is out of
  scope.
