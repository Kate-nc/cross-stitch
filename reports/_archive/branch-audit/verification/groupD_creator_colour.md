# Phase 1 Verification — Group D: Creator Colour Management

**Commits** (chronological): `3c41d15` (remove unused), `fa3c594` (mis-labelled — adds direct colour-swap source files), `9d3bab5` (wires colourReplace tool), `255142d` (bundle rebuild + snapshot), `bcca388` (Restore original colours).

## 1.1 Intended behaviour

Three related Creator capabilities:

1. **Remove unused colours** — palette chip × button + bulk "Remove unused (N)" header button visible whenever the user is in edit mode and any palette entry has `count === 0`. Undoable / redoable.
2. **Direct colour swap** — replace every cell of a chosen source colour with another DMC thread, via three entry points (right-click "Replace this colour…", per-chip swap button, Replace toolbar tool). Honours active selection mask. Undoable.
3. **Restore original colours** — after generation, snapshot pat/pal/cmap; offer a "Revert to generated palette" button in the palette-swap section that restores the snapshot when palette has diverged. Session-scoped only.

## 1.2 Code-path traces

| Capability | Trace |
|---|---|
| Remove unused | Sidebar header button → `state.removeUnusedColours()` ([useCreatorState.js#L926](creator/useCreatorState.js#L926)) → records `{type:'remove_unused_colours', removedFromPal, removedFromScratch}` → updates pal/scratchPalette/cmap → toast. Undo/redo branches in `useEditHistory.js#L50` / `#L158`. |
| Direct colour swap | Three entries: ContextMenu#L120 `setColourReplaceModal({srcId,srcName,srcRgb})`; useCanvasInteraction#L329 (when `activeTool==='colourReplace'`); palette-chip swap button. → creator-main.js mounts `window.ColourReplaceModal` when state non-null and global defined → user picks dst → `state.applyGlobalColorReplacement(srcId, dstId)` ([useMagicWand.js#L454](creator/useMagicWand.js#L454)). Cmap fallback chain: cmap → `findThreadInCatalog('dmc', dstId)` → DMC array. Pushes `{type:'colorReplace', changes:[{idx, old}]}`. |
| Restore original | After generate: `setGenPatSnapshot({pat: result.mapped.slice(), pal: result.pal.slice(), cmap: {...}})` ([useCreatorState.js#L6210 in bundle](creator/useCreatorState.js)). `usePaletteSwap` derives `hasPaletteChanged` (full pat scan) and renders revertSection. Click → `revertToGenPalette()` → `setPat/setPal/setCmap` from snapshot, push `{type:'revert_to_gen', changes}`, **`setDone(new Uint8Array(snap.pat.length))`** ([palette-swap.js#L1225](palette-swap.js#L1225)) — silently wipes all stitching progress. |

## 1.3 Implementation check

| Aspect | Verdict |
|---|---|
| Bulk "Remove unused (N)" + per-chip × in edit mode | ✅ IMPLEMENTED |
| `remove_unused_colours` undo/redo dedicated branches | ✅ IMPLEMENTED ([useEditHistory.js#L50](creator/useEditHistory.js#L50), #L158) |
| Three entry points for colour swap | ✅ IMPLEMENTED |
| Modal honours selection mask | ✅ IMPLEMENTED — closure capture in `applyGlobalColorReplacement` (mirrors `applyColorReplacement`'s pattern). |
| Cmap-→catalog→DMC fallback for unknown destinations | ✅ IMPLEMENTED |
| `colorReplace` undo/redo | ⚠️ PARTIAL — no dedicated branch in `useEditHistory.js`; falls through to the **generic `.changes` handler**. Works because the entry shape matches, but is not explicit and could break if the generic handler is changed without considering colour-swap entries. |
| `revert_to_gen` undo/redo | ⚠️ PARTIAL — same generic handler. Same caveat. |
| `genPatSnapshot` cleared on resetAll | ✅ IMPLEMENTED |
| New ColourReplaceModal global wired | ✅ IMPLEMENTED — `creator-main.js` checks `typeof window.ColourReplaceModal !== 'undefined'` before render. |
| `setColourReplaceModal(null)` on apply / cancel | ✅ IMPLEMENTED |

## 1.4 Failure modes

| Mode | Verdict | Note |
|---|---|---|
| Destination thread id unknown to all 3 lookups | ❌ UNHANDLED — `applyGlobalColorReplacement` returns silently if `!dstEntry`. No toast. User clicks Apply, modal closes, nothing changes. **DEFECT-002 (MEDIUM)**. |
| Source id is a blend, dest is solid (or vice versa) | ✅ HANDLED — exact id match; blend cells affected only when source matches the full blend id. |
| Selection mask active | ✅ HANDLED |
| ColourReplaceModal global undefined (bundle stale) | ❌ UNHANDLED — silent no-op; the Replace tool, context-menu item, and chip swap button all appear to do nothing. **DEFECT-003 (LOW — only affects developers, not shipped users)**. |
| `revertToGenPalette` wipes stitching progress with no warning | ❌ UNHANDLED — `setDone(new Uint8Array(snap.pat.length))` at [palette-swap.js#L1225](palette-swap.js#L1225) silently destroys all `done` data. If a user has tracked any progress and clicks "Revert to generated palette", it is lost without prompt. **DEFECT-004 (HIGH)**. |
| `revertToGenPalette` with null `genPatSnapshot` | ✅ HANDLED — `if (!genPatSnapshot \|\| !hasPaletteChanged) return;` and the button is gated on `genPatSnapshot` truthy. |
| `hasPaletteChanged` O(n) on each render for 100k+ patterns | ⚠️ RISKY — useMemo dep on `[genPatSnapshot, pat]`; recomputes whenever pat reference changes (i.e. after every paint). For very large patterns may cause slow keystroke response. |
| `PreviewCanvas` `fabricColour` malformed (e.g. 3-char hex `#fff`) | ⚠️ PARTIAL — regex requires 6-char hex. `#fff` falls through to white default, **but** the previous behaviour for `previewFabricBg=false` was also white, so existing users see no regression. New users who set `fabricColour` via a 3-char picker would see white when they expected colour. |
| `useEditHistory` generic handler doesn't recognise `revert_to_gen` shape | ✅ SAFE — verified shape `{type, changes:[{idx, old}]}` matches generic handler expectations. |
| Sequence: paint over last cell of colour → undo → redo → undo | ✅ HANDLED — `rebuildPreservingZeros` only runs on paint paths; undo/redo always use `buildPaletteWithScratch` directly, so no zero-count stragglers can survive a round-trip. |
| Spelling: tool name `'colourReplace'` (British), history type `'colorReplace'` (American), function `applyGlobalColorReplacement` (American), state setter `setColourReplaceModal` (British), global `window.ColourReplaceModal` (British) | ⚠️ Confirmed — purely cosmetic, but a ticking maintainability issue. **DEFECT-005 (LOW)**. |

## 1.5 Regression check

| Risk | Verdict |
|---|---|
| Broadening `isUnused` from scratch-only to all edit-mode | ✅ SAFE — adds visibility in generated mode without removing it from scratch mode. |
| `'colourReplace'` tool name collision | ✅ SAFE — no existing tool by that name. |
| `genPatSnapshot` clearing covers project switch / delete / new | ✅ SAFE — all paths funnel through `resetAll`. |
| `previewFabricBg` removed without preference migration | ⚠️ RISKY — anyone who had `previewFabricBg=true` previously now sees the `fabricColour` value (or white if unset). One-time visual change for existing users. **DEFECT-006 (LOW)**. |

**Group verdict**: One HIGH defect (silent progress wipe in revert), one MEDIUM (silent unknown-destination), several LOW (spelling, dev-only bundle staleness, fabric-pref migration, perf on huge patterns). Undo/redo for `colorReplace` and `revert_to_gen` works via the generic handler but isn't explicitly tested.
