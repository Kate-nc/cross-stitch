# Impact Graph

This map identifies the surface area that changed and the upstream/downstream code that could be affected. Used by Phase 1 verification agents to know where to look for ripple effects.

## Modified subsystems

```
Creator (creator/, creator-main.js)
   ├── State hook        useCreatorState.js
   │      • new: removeUnusedColours, applyGlobalColorReplacement,
   │              colourReplaceModal/setColourReplaceModal, genPatSnapshot,
   │              setGenPatSnapshot
   │      • produces:    state object consumed by CreatorApp + all child hooks
   ├── Canvas events     useCanvasInteraction.js
   │      • new: rebuildPreservingZeros helper, "colourReplace" tool branch
   │      • consumes:    state.activeTool, cmap, pat
   ├── History           useEditHistory.js
   │      • new branches: 'remove_unused_colours', 'colorReplace', 'revert_to_gen'
   ├── Preview canvas    PreviewCanvas.js
   │      • now reads:   app.fabricColour (was app.previewFabricBg)
   ├── Sidebar           Sidebar.js
   │      • new UI:      "Remove unused (N)" header button, per-chip × in edit
   │                      mode, paletteSwap.revertSection
   ├── ContextMenu       new: "Replace this colour…" entry
   ├── ToolStrip         new: Replace tool button (activeTool='colourReplace')
   ├── ActionBar         minimal pre-pattern fallback (always renders Stats link)
   ├── PatternInfoPopover  new: difficulty breakdown surface
   └── (new) ColourReplaceModal.js   modal, calls onApply(threadObj)

Tracker (tracker-app.js)
   ├── live stash deduction (rtConsumption memo, debounced flush)
   ├── wastePrefs state + UserPrefs sync
   ├── new modals: rt_disable_confirm, rt_complete_summary
   ├── recordAutoActivity: setLiveAutoStitches now subtracts undone
   ├── SessionSummaryModal prevAvgSpeed: prefers sess.netStitches over stitchesCompleted
   ├── window.__openTrackerStats(targetId) — accepts an optional project id
   └── difficulty surface (in tracker)

Stash + stats (project-storage.js, stash-bridge.js, stats-page.js, manager-app.js)
   ├── getMostUsedColours       — palette fallback from cells, statsSessions fallback, blend split
   ├── getLifetimeStitches      — statsSessions fallback
   ├── getStitchLogByDay        — statsSessions fallback
   ├── buildStatsSummary        — palette derivation from cells if absent
   ├── getAcquisitionTimeseries — statsSessions fallback for "used" series
   ├── migrateSchemaToV3        — dispatch cs:stashChanged after migration
   ├── manager updateThread     — record V3 acquisition/history fields
   ├── manager stash list       — sort dropdown
   ├── stats-page richProjects  — blend split, palLen accuracy
   ├── stats-page buyingImpact  — split blended thread into both components
   ├── stats-page neverUsedData/useWhatYouHave/lowStockNeeded — split blend ids
   └── stats-page Stitching tab — pass onViewProject handler to GlobalStatsDashboard

Helpers / shared (helpers.js, threadCalc.js, palette-swap.js, home-screen.js, icons.js)
   ├── helpers.js: difficulty calculation expanded (+58 lines)
   ├── threadCalc.js: threadCostPerStitch(fabricCount, strandCount, wastePrefs)
   ├── palette-swap.js: revertToGenPalette + revertSection (consumes genPatSnapshot)
   ├── home-screen.js: difficulty rendering (+12)
   └── icons.js: Icons.colourSwap (24×24)
```

## Key cross-file contracts and dependents

### `genPatSnapshot` (new)

- **Producer**: `useCreatorState.generate()` writes a `{pat, pal, cmap}` clone after each generation. `resetAll()` clears it.
- **Consumers**: `usePaletteSwap` reads `props.genPatSnapshot` and `hasPaletteChanged`; `revertToGenPalette()` reassigns `pat/pal/cmap/done`.
- **Risk**: snapshot is in-memory only (session-scoped). Reload always loses it; revert is unavailable for reloaded projects. Serialised projects never carry it. Confirm: nothing tries to read it after reload.

### `colourReplaceModal` state + `applyGlobalColorReplacement` (new)

- **Producer**: `useCreatorState`; modal opened by ContextMenu, palette chip swap button, ToolStrip "colourReplace" tool, all of which call `state.setColourReplaceModal({srcId, srcName, srcRgb})`.
- **Consumer**: `creator-main.js` mounts `window.ColourReplaceModal` when `state.colourReplaceModal` is truthy; `onApply(dstThread)` calls `state.applyGlobalColorReplacement(srcId, dstThread.id)`.
- **History interaction**: pushes a `colorReplace` history entry — `useEditHistory.js` must understand that entry shape.
- **Risk**: closure capture for selection mask; behaviour with blend ids on either side; cmap pollution if dstThread is unknown.

### `wastePrefs` (new) and `rtConsumption` memo

- **Producer**: tracker-app.js `wastePrefs` state, persisted both per-project (settings.wastePrefs) and globally (UserPrefs).
- **Consumers**: `rtConsumption` useMemo (recomputes on every stitch mark), gear flyout UI, debounced stash writer, end-session modal.
- **Cross-DB**: when "Live" is enabled, debounced writer mutates the Stash Manager's IDB via `StashBridge.updateThreadOwned`. Debounce is 30s idle, flushed on `beforeunload`.
- **Risk**: race with manager edits; race with another tab; user disables mid-session (rt_disable_confirm modal handles this); browser closed before debounce fires (beforeunload only — not always reliable).

### Palette derivation from pattern cells (`project-storage.js`)

- **Producers (new)**: `getMostUsedColours`, `buildStatsSummary` now both build a per-project `{id → {name, rgb}}` map by scanning cells when `proj.palette` is absent or empty.
- **Consumers**:
  - `stats-page.js` GlobalStatsDashboard cards (Most-Used Colours, Heatmap)
  - `insights-engine.js` "stash threads not used in any project" insight
  - `stats-insights.js` totalColours + heatmap "show N more"
- **Risk**: blend cells contribute `[128,128,128]` placeholder per the commit message — this is a deliberate compromise. Verify all consumers tolerate the placeholder (or filter it).

### `stitchLog` ↔ `statsSessions` fallback

- **Producers**: tracker `buildSnapshot` writes both. Pre-derivation projects only have `statsSessions`.
- **Consumers (now have fallback)**: `getLifetimeStitches`, `getStitchLogByDay`, `getMostUsedColours`, `getAcquisitionTimeseries` ("used" series).
- **Consumers NOT yet checked for fallback**: anything else in the codebase reading `proj.stitchLog`. Phase 1 must grep for stragglers.

### `fabricColour` user pref (now drives Creator preview)

- `PreviewCanvas.js` switched from `app.previewFabricBg` (boolean toggle, hard-coded `(245,240,230)`) to `app.fabricColour` (string `#RRGGBB` parsed to RGB).
- Fallback when malformed: white `(255,255,255)` — but the previous "white background" path was removed entirely. Verify: when `fabricColour` is absent, the new code defaults to white, matching previous "off" state but losing the previous "on" beige. UX: anyone who had `previewFabricBg=true` before now sees their `fabricColour` pref instead. Need to confirm whether `fabricColour` always has a sensible default in `user-prefs.js`.

### `__openTrackerStats(targetId?)` — new optional argument

- Consumers (new): `stats-page.js` Stitching tab's `handleViewProject` polls for the tracker hook to mount.
- Consumers (existing): the header Stats link calls `window.__openTrackerStats()` with no args. Old behaviour (uses current project) is preserved by `targetId || projectIdRef.current || 'all'`.

### Difficulty calculation (`helpers.js`)

- Producer: expanded difficulty calc.
- Consumers: `creator/PatternInfoPopover.js` (new surface), `creator/ActionBar.js` (badge), `home-screen.js` (project-card badge), `tracker-app.js` (tracker chip).
- Risk: signature change of `calcDifficulty()` could ripple. Phase 1 must verify all four callers pass compatible args.

## Surprising / circular paths

- `creator-main.js` reads `state.colourReplaceModal` and renders `window.ColourReplaceModal`. The modal is registered as a global by `creator/ColourReplaceModal.js`, which is concatenated into `creator/bundle.js` (per the modified `build-creator-bundle.js`). If anyone forgets to rebuild the bundle after touching the modal, the global is undefined and the conditional renders `null` silently — no crash, no toast. **Silent failure mode** worth flagging.
- `usePaletteSwap` receives `genPatSnapshot` via props from `useCreatorState`. The history entry `revert_to_gen` it pushes must be understood by `useEditHistory`. Confirm that branch exists.
- Three commits (#1, #4, #5) build on each other in the colour-removal area. If `useEditHistory.js` only handles `remove_unused_colours` (added in #1) but not `colorReplace` (added in #4) or `revert_to_gen` (added in #7 `bcca388`), undo/redo of those operations will throw or no-op silently.

## Modules / files NOT touched but indirectly affected

- `insights-engine.js` — reads `summaries[].palette`. Behaviour will change because the summaries now contain real palettes for Creator projects.
- `stats-insights.js` — same.
- `stats-activity.js` — already used statsSessions fallback, unchanged.
- `home-app.js` — reads stats; benefits from the lifetime/log fallbacks.
- `user-prefs.js` — `fabricColour` default needs verification.
