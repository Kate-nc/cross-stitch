# B3 — Creator sub-page consolidation map

The Creator's top-level navigation collapsed three former pages
(`prepare`, `legend`, `export`) into a single **Materials** hub with
internal sub-tabs. This document records where each former page now
lives so contributors and tests can trace the rewrites.

## Top-level pages

| Old page | New page | Rendered by |
|---|---|---|
| Pattern | Pattern (unchanged) | `creator/PatternTab.js` |
| Project | Project (unchanged) | `creator/ProjectTab.js` |
| Prepare | Materials → Stash | `creator/MaterialsHub.js` → `creator/PrepareTab.js` |
| Legend  | Materials → Threads | `creator/MaterialsHub.js` → `creator/LegendTab.js` |
| Export  | Materials → Output | `creator/MaterialsHub.js` → `creator/ExportTab.js` |

## State / preferences

The active sub-tab is held in the `materialsTab` state on the Creator's
`useCreatorState` hook and persisted via `UserPrefs` under
`creator.materialsTab`. The legacy `creator.lastPage` preference is
read on first load and rewritten to the new shape:

| Legacy `lastPage` | Migrated to |
|---|---|
| `"prepare"` | `tab = "materials"`, `materialsTab = "stash"` |
| `"legend"`  | `tab = "materials"`, `materialsTab = "threads"` |
| `"export"`  | `tab = "materials"`, `materialsTab = "output"` |

`useCreatorState` exports both `materialsTab` and `setMaterialsTab` so
external callers (the new outcome action bar's "More export options…"
item, the command palette, etc.) can route to the correct sub-tab
without knowing the internal layout.

## Tab guards

Each former page-level component now guards on the composite
`(tab, materialsTab)` pair so it only mounts inside the Materials hub:

| Component | Mounts when |
|---|---|
| `PrepareTab` | `tab === "materials" && materialsTab === "stash"` |
| `LegendTab`  | `tab === "materials" && materialsTab === "threads"` |
| `ExportTab`  | `tab === "materials" && materialsTab === "output"` |

`creator-main.js` mounts `CreatorMaterialsHub` for the Materials page
and no longer mounts the three former tabs as direct children. The
Sidebar returns `null` while `tab === "materials"` (the hub provides
its own internal navigation) and shows the "Project at a glance" panel
while `tab === "project"`.

## Build order

`build-creator-bundle.js` lists `MaterialsHub.js` after
`PrepareTab.js`, `LegendTab.js`, and `ExportTab.js` so the hub can
reference the three children when the bundle is concatenated.
