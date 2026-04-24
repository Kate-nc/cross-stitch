# B3 — Creator Sub-Page Consolidation Map (5 → 3)

## Summary

The Pattern Creator's five top-level sub-pages collapse to three:

| Before (5) | After (3) | New home |
|---|---|---|
| Pattern  | **Pattern**              | unchanged |
| Project  | **Project**              | unchanged |
| Materials (LegendTab)  | **Materials & Output**   | `materialsTab='threads'` |
| Prepare  | **Materials & Output**   | `materialsTab='stash'` |
| Export   | **Materials & Output**   | `materialsTab='output'` |
| —        | **Materials & Output**   | `materialsTab='shopping'` (new) |

Internal state key: `app.tab` continues to drive top-level routing; valid
values are now `'pattern' | 'project' | 'materials'`. Within `materials`,
the `app.materialsTab` key drives the side-tab nav.

## Per-section justification

### Pattern
The canvas-centric editing surface (paint, fill, magic-wand, lasso, BS
lines, partial stitches, undo/redo) stays its own page. Touching it would
break muscle memory for anyone who already uses the Creator daily.

### Project
Generation parameters, fabric, dimensions, project metadata, output
preview thumbnail. This is the "what am I making" page; merging it into
Materials & Output would conflate "creation parameters" with "stitcher
deliverables", which is the precise overlap B3 set out to fix.

### Materials & Output (the new MaterialsHub)
Why these three (plus Shopping) belong together: every item answers
*"what threads / fabric / file do I need to actually stitch this?"* —
which is a single user task. The pre-B3 split forced the user to bounce
between three top-level pages to see (a) which threads they need
(Materials), (b) what their stash status is and how much fabric to buy
(Prepare), and (c) how to get the printable PDF out (Export). All three
are downstream of pattern generation and have zero interaction with the
canvas, so they share a sidebar context and a shared "Output" mental
model.

The four sub-tabs and their old-tab provenance:

| MaterialsHub sub-tab | Source tab | Content |
|---|---|---|
| Threads      | `LegendTab` (formerly "Materials")    | Full thread list with DMC/Anchor IDs, names, swatches, skein counts, sort + units controls. |
| Stash status | `PrepareTab`                          | Limit-to-stash / Substitute UI, ownership rows, fabric calculator. |
| Shopping     | (new, lightweight)                    | Threads in this project with a deficit, "Add all to shopping list" CTA via existing `StashBridge.markManyToBuy`. |
| Output       | `ExportTab`                           | PDF / PNG / OXS / JSON download controls and presets. Logic untouched — the UI relocates only. |

Why Prepare belongs in Materials & Output and not in Pattern: although
the Prepare tab today contains some palette-tweak affordances, the
*user-visible* content that matters post-A1 (stash limiting,
substitution, fabric calc) is a thread-and-stash decision, not a
canvas-edit decision. The palette-tweak controls themselves already live
in the Pattern page's right-hand Sidebar — they were duplicated into
Prepare for legacy reasons and the consolidation removes the duplication.

## Redirect plan for old page IDs

`useCreatorState.js` exposes `setTab(value)` already. After B3 it
intercepts the legacy values and rewrites:

| Incoming `setTab(...)` value | Rewritten to | Side-effect |
|---|---|---|
| `'prepare'` | `'materials'` | also `setMaterialsTab('stash')` |
| `'legend'`  | `'materials'` | also `setMaterialsTab('threads')` |
| `'export'`  | `'materials'` | also `setMaterialsTab('output')` |
| `'pattern'`/`'project'`/`'materials'` | unchanged | — |
| anything else | `'pattern'` | (defensive) |

This covers:
- Persisted prefs: any user with `creator.lastPage = 'export'` saved is
  rewritten on first read.
- Internal call sites (Header dropdown, command palette actions,
  `state.resetAll()` etc.) — all already route through `setTab`.
- URL query strings (`?creatorPage=export`) — same path.

The `materialsTab` itself persists via `UserPrefs.set('creator.materialsTab', value)`
so the user lands back on the sub-tab they last used.

## No functionality lost

Each old top-level page still renders, byte-identical to before. Only
the *navigation chrome* differs: instead of being reached via the
top-bar dropdown, the Prepare / Legend / Export panels are now reached
via the MaterialsHub side-tab nav inside the new Materials & Output
page. Their internal hooks, props, early-return guards, and rendered
output are unchanged — see the trivial diff in
`creator/{PrepareTab,LegendTab,ExportTab}.js` (one-line guard rewrite).

## Mode-aware sidebar (per-page intent)

Within the Creator, the right-hand `Sidebar.js` panel renders different
content depending on `app.tab`:

| `app.tab` | Sidebar content |
|---|---|
| `'pattern'`   | Existing palette chips + paint/tool controls + edit-mode strip. |
| `'project'`   | "Project at a glance" (dimensions, colour count, est. skeins) + generation-parameter quick links. |
| `'materials'` | Hidden — MaterialsHub uses the full content width. The right rail collapses. |

A 160 ms opacity fade marks the transition (`.cs-sidebar-fade` in
`styles.css`). Across the three HTML entry points (index, stitch,
manager) the sidebars are already different by virtue of being different
pages; no cross-mode work is needed beyond preserving that.

## Confirmation

- All B1 (PartialStitchThumb), B2 (drag-mark), B5 (multi-select),
  B6 (HelpDrawer) APIs are untouched.
- Tracker (`tracker-app.js`) is untouched.
- Manager gains a new top-level tab (`Shopping`) but the existing
  Inventory / Patterns tabs are untouched.
- No project file format change, no IndexedDB schema change.
