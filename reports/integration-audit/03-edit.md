# 03 — Edit mode

> Phase 2, area 3. Covers `appMode === "edit"` in the Creator: brush,
> lasso, magic wand, palette operations, partial stitches, backstitches,
> park markers, scratch-mode editing, undo/redo, and zoom. The cleanup
> overlay is in [02-cleanup.md](02-cleanup.md); the create flow and
> generation reset are in [01-create.md](01-create.md); tracker is in
> [04-track.md](04-track.md). UX density was covered in
> [reports/edit-mode-ui-audit.md](../edit-mode-ui-audit.md) and is not
> repeated here.

---

## 1. Surface scope

| Code | Role |
|---|---|
| [creator/useCreatorState.js](../../creator/useCreatorState.js) | State hub; palette mutations; undo/redo entry-push helpers |
| [creator/useEditHistory.js](../../creator/useEditHistory.js) | Undo/redo reducer (consumes the entries pushed elsewhere) |
| [creator/useCanvasInteraction.js](../../creator/useCanvasInteraction.js) | Pointer/touch dispatch for brush/lasso/wand/backstitch/partial stitches; per-drag accumulation |
| [creator/useMagicWand.js](../../creator/useMagicWand.js) | Selection mask, flood-fill, global select, confetti / colour-reduce / colour-replace within selection |
| [creator/PatternCanvas.js](../../creator/PatternCanvas.js) | Render layer, click → grid coord mapping |
| [creator/canvasRenderer.js](../../creator/canvasRenderer.js) | Low-level canvas draw routines |
| [creator/MagicWandPanel.js](../../creator/MagicWandPanel.js) | Wand sidebar UI |
| [creator/ColourReplaceModal.js](../../creator/ColourReplaceModal.js) | Global colour swap |
| [creator/BulkAddModal.js](../../creator/BulkAddModal.js) | Stash bulk-add |
| [creator/AdaptModal.js](../../creator/AdaptModal.js), [creator/adaptationEngine.js](../../creator/adaptationEngine.js) | Adapt-to-stash (non-destructive parallel project) |
| [creator/LegendTab.js](../../creator/LegendTab.js), [creator/MaterialsHub.js](../../creator/MaterialsHub.js) | Palette legend, reorder/rename/star, materials view |
| [creator/Sidebar.js](../../creator/Sidebar.js), [creator/ToolStrip.js](../../creator/ToolStrip.js), [creator/ActionBar.js](../../creator/ActionBar.js) | Tool selection and action chrome |
| [palette-swap.js](../../palette-swap.js) | Cross-pattern palette swap logic |

Tools active in edit mode: brush (paint / erase / eraser-all), lasso
(freehand / polygon / magnetic), magic wand, backstitch (draw / erase),
partial stitches (quarter / half-fwd / half-bck / three-quarter),
park-marker placement (via context menu), hand (pan).

---

## 2. Wiring correctness

### 2.1 State plumbing

`useCreatorState` exposes one big context object consumed by
`creator-main.js` ([line 1604](../../creator/useCreatorState.js#L1604))
and re-exposed via React context to the entire creator subtree. Helper
hooks (`useEditHistory`, `useCanvasInteraction`, `useMagicWand`,
`useCleanupMode`) all receive the same `state` object and operate via
its setters — there is no prop-drill divergence.

`activeTool`, `brushSize`, `partialStitchTool`, and `selectedColorId`
also have ref shadows (`activeToolRef` etc.) so pointer handlers see
the current value without stale-closure bugs. **Correct.**

### 2.2 Drag-session accumulators

`dragChangesRef`, `dragCellsRef`, `dragPatRef`,
`dragPartialStitchesRef`, `dragBsLinesRef` are mutable refs that
collect mutations during a single pointer-down → pointer-up cycle. On
pointer-up, the accumulated entry is pushed as **one** history entry.
Verified by reading `useCanvasInteraction.js` brush handlers — each
drag pushes one `{ type, changes, … }` entry. **Correct.**

### 2.3 Palette → pattern coupling

Every mutation of `pat` is followed by:

```js
var r = state.buildPaletteWithScratch(np);
state.setPal(r.pal); state.setCmap(r.cmap);
```

`pal` and `cmap` always agree with `pat`. Zero-count entries are
preserved via the wrapper that re-injects palette entries that were
present before but are no longer in use (also pattern in
[useCleanupMode.js applyCleanup](../../creator/useCleanupMode.js#L450-L465)).
**Correct.**

### 2.4 `done` array preservation

`done` is indexed by cell index. Pattern mutations swap *colours* at
specific indices but never resize. **No mutation path in edit mode touches
`done`**, so progress is preserved across colour swaps, brush strokes,
lasso fills, etc. This is documented behaviour (cell index identity).
Only `applyResultRef` (regeneration) resets `done` — covered in
[01-create.md C-3](01-create.md#c-3--regenerate-silently-wipes-done--parkmarkers-when-project-has-progress).

---

## 3. State correctness — undo/redo

### 3.1 Single-entry invariant

| Action | Entry type | Verified |
|---|---|---|
| Brush drag | `paint` / `erase` (one per drag) | Yes — `dragChangesRef` flushed on `mouseup` |
| Click fill | `fill` | Yes |
| Backstitch draw | `backstitch` (`bsLines` snapshot) | Yes — each line is its own entry |
| Backstitch erase | `eraseBs` | Yes |
| Magic-wand selection | (no entry — selection is UI state) | Correct |
| Selection-scoped colour replace | `colorReplace` | Yes |
| Confetti cleanup | `confettiCleanup` | Yes |
| Colour reduction | `colorReduction` | Yes |
| Add palette entry | `add_colour` | Yes (specialised redo branch) |
| Remove unused | `remove_unused_colours` | Yes (specialised redo branch) |
| Manual cleanup apply | `cleanup` | See [02-cleanup.md](02-cleanup.md) |
| Park marker add/remove | (no entry — `parkMarkers` is hint-only) | See E-3 |

### 3.2 Redo invalidation

Every entry-push site is followed by `state.setRedoHistory([])`. Spot-
checked at `removeScratchColour`, `removeUnusedColours`,
`addScratchColour`, `applyCleanup`. **Correct.**

### 3.3 History cap

`EDIT_HISTORY_MAX = 50`. Every push uses the pattern:

```js
var n = prev.concat([entry]);
if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
return n;
```

The oldest entry is dropped when capacity is exceeded. **Correct.**

### 3.4 Specialised undo branches

`useEditHistory` undo dispatcher (search `last.type === "remove_unused_colours"`
at [useEditHistory.js](../../creator/useEditHistory.js#L1) area, mirrored in
bundle.js:5454) restores `pal` and `scratchPalette` from the recorded
`removedFromPal`/`removedFromScratch` arrays, *and pushes the inverse
entry into `redoHistory`* (line 5475). Redo dispatcher mirrors this
([bundle.js:5540-5550](../../creator/bundle.js#L5540-L5550)). **Symmetric
and correct.**

---

## 4. Per-feature behaviour and edge cases

### 4.1 Brush

Paint: `np[idx] = Object.assign({}, colourEntry)`. Shallow copy ensures
cmap entry isn't aliased (so future palette edits don't mutate cells).
Erase-all: cell replaced with `__empty__`, partial stitches for the cell
deleted, nearby backstitches removed within 0.6 grid units. **Correct.**

Edge cases:
- No selected colour → first cell click does nothing silently. UX gap,
  not a bug.
- Brush on `__skip__` / `__empty__` cell: allowed (puts a stitch back).
- Within active selection mask: only masked cells are painted. Correct.

### 4.2 Lasso

Lasso modes: freehand, polygon, magnetic. Operation modes: replace, add,
subtract, intersect. Implemented in `useMagicWand` (mask layer is shared
with the wand). Verified the mask is `Uint8Array` with length `sW × sH`.

Edge cases:
- < 3 points in polygon mode → close-action no-ops. Verified.
- Subtract from empty mask → still empty. Correct (no-op).
- Intersect with empty → empty. Correct.

### 4.3 Magic wand

Flood-fill (4-connected) when `wandContiguous`, linear scan when global.
Tolerance is ΔE-based.

Verified guards in [creator/useMagicWand.js](../../creator/useMagicWand.js):
clicking `__skip__` / `__empty__` returns early with toast. Correct.

### 4.4 Palette: colour swap (ColourReplaceModal)

`applyGlobalColourReplacement(srcId, dstId)`:
- Linear scan; if cell `id === srcId`, replace.
- If a selection mask is active, only swap inside the mask.
- Push one `colorReplace` entry; clear redo.
- Same-id swap → returns early.
- Destination missing → returns with error toast (DEFECT-002 in source).
- No-matches → returns with info toast.

**Correct.** Verified `done` is untouched (cell indices unchanged).

### 4.5 Palette: bulk add (BulkAddModal)

Updates stash only (`StashBridge.updateThreadOwned`). No history entry.
**Correct by design** — stash is a separate database from project.

### 4.6 Palette: adapt to stash

Non-destructive: builds a *new* project from a proposal, leaving original
unchanged. No history entry on the source. The user must promote/save-as
to commit. **Correct by design.**

### 4.7 Palette: remove unused / reorder / rename / star

`removeUnusedColours` ([useCreatorState.js:946-961](../../creator/useCreatorState.js#L946-L961))
filters `pal` and `scratchPalette` for `count === 0`. **It does not
filter `parkMarkers`.** See E-3.

Reorder / rename / star — UI-only operations in LegendTab. Verified no
history entry, no mutation of `pat`/`done`. Acceptable.

### 4.8 Partial stitches

`partialStitches` is a `Map<idx, { TL?, TR?, BL?, BR? }>`. Hit-test
maps cursor → quadrant; click toggles. If all four quadrants cleared,
the map entry is deleted (clean state).

A full-stitch paint over a partial-stitch cell replaces the cell and
also clears `partialStitches[idx]` in the same drag entry (`psChanges`
captures before/after). Undo correctly restores both. Verified.

### 4.9 Backstitches (`bsLines`)

Stored as `{x1,y1,x2,y2,color?}`. Each draw pushes one `backstitch`
entry with the prior `bsLines` snapshot.

`canvasRenderer.js` clips out-of-bounds lines on render. Endpoint
coordinates are stored verbatim — there is no boundary clamp at write
time. Already flagged in [00-system-map.md §5.1](00-system-map.md#51-transitions-that-exist-but-are-not-symmetric)
that `bsLines` survive a re-convert (covered as [01-create.md C-9](01-create.md#c-9--bslines-survive-re-convert)).

### 4.10 Park markers

Stored as `[{x, y, colorId}, ...]`. Set by right-click context menu in
the Creator, and used heavily by the Tracker. **Not part of edit
history** — placing or removing a marker is not undoable in the Creator.

`parkMarkers` is reset by `resetAll` ([useCreatorState.js:818](../../creator/useCreatorState.js#L818))
and by `applyResultRef` ([line 983](../../creator/useCreatorState.js#L983)).
Not reset by `removeUnusedColours` (E-3).

### 4.11 Scratch-mode editing

`scratchPalette` is a separate array of "designed" palette entries that
the user adds manually without them being present in the pattern.
`buildPaletteWithScratch` merges these into `pal` for the legend.

Edge cases:
- Generating a new pattern: `applyResultRef` does **not** clear
  `scratchPalette`. The scratch entries persist into the new pattern's
  palette. Could be a feature (user pre-defines a working set) or
  unintended (user expects "Generate" to start fresh). See E-4.
- `removeScratchColour(id)` ([useCreatorState.js:933-944](../../creator/useCreatorState.js#L933-L944)):
  filters by `id` and pushes a `remove_unused_colours` entry, even
  though the colour may have been actively used in the pattern. Misleading
  type name. See E-5.

### 4.12 Zoom / pan / fit

`zoom` is `useState(1)`, clamped 0.05–3 by the pinch handler. Not part
of project model. Persisted as `savedZoom`/`savedScroll` in the Creator's
v11 save format but reset on every page load. Acceptable.

### 4.13 Back-to-convert

`handleRequestBackToConvert` ([creator-main.js:~390](../../creator-main.js#L390))
checks `editHistory.length > 0` and shows a confirm modal if true.
`confirmBackToConvert` flips `appMode` to `create`.

**Verified gap**: the guard only checks `editHistory` (in-session edits),
not "unsaved-since-last-save". If a user makes an edit, auto-save fires,
then they hit Back-to-convert, the modal still shows even though
everything is saved. Conversely, **history is cleared on regenerate**
(`applyResultRef` calls `setEditHistory([])`), so after a regenerate the
back-to-convert guard never fires for actions in the new session until
the user makes an edit. Both behaviours are by design but the guard
copy ("Discard edits?") is slightly misleading. See E-6.

### 4.14 Auto-save

`doSaveProject` in `useProjectIO.js` is invoked from a debounced effect
that watches `pat`/`pal`/`cmap`/`done`/etc. The current debounce is set
in `useProjectIO.js` (search `setTimeout`). Verified one save per
debounce window — no parallel writes to IndexedDB. **Correct.**

Auto-save also fires for `done` changes via the Tracker, not via Creator
edit-mode interactions (Creator edit mode doesn't change `done`).

---

## 5. Integration points

### 5.1 With cleanup overlay

When `cleanupOpen` is true, canvas pointer handlers route to
`cleanupHandlersRef` ([useCanvasInteraction.js](../../creator/useCanvasInteraction.js)).
Edit-mode tools are suppressed while the cleanup mask is being built.
Cleanup apply pushes a single `cleanup` undo entry that the generic
edit-history reducer handles without a specialised branch.

**Pointer-down race**: opening the cleanup panel mid-drag does not
explicitly cancel the in-flight drag. The drag's `mouseup` handler still
fires and pushes its accumulated entry. Whether the drag was "intended"
is ambiguous but the entry is undoable, so this is acceptable.

### 5.2 With tracker handoff

Outbound (`handleOpenInTracker` in `useProjectIO.js`): saves the project
synchronously via `ProjectStorage.save` + `saveProjectToDB` and writes
`crossstitch_handoff` *before* navigating, so the tracker never reads a
stale snapshot. Verified.

Inbound (`crossstitch_handoff_to_creator`): see [00-system-map.md INT-2
follow-up](00-system-map.md#41-shared-state-inventory) — tracker-only
fields preserved via `trackerFieldsRef`.

---

## 6. Bugs found

### E-1 — Selection mask survives image upload and pattern regeneration
**File**: [creator/useCreatorState.js:818-822](../../creator/useCreatorState.js#L818-L822) (`resetAll`) and [creator/useCreatorState.js:976-1040](../../creator/useCreatorState.js#L976-L1040) (`applyResultRef`)
**Severity**: medium
**Classification**: [auto-fix]

Neither `resetAll` nor `applyResultRef` calls `wand.setSelectionMask(null)`.
A user who wand-selects in edit mode, then uploads a new image (or
regenerates), retains the old mask. Two consequences:

1. **Stale mask size**: if the new pattern has different dimensions,
   `mask.length !== sW × sH`. Brush handlers index `mask[idx]` and treat
   `undefined` as falsy (= cell not selected), so a 100×100 mask on an
   80×80 pattern silently "deselects everything outside the original
   wand selection's footprint" — which is non-obvious behaviour.
2. **UX leak**: the user's previous selection visibly overlays an
   entirely different pattern.

**Repro**:
1. Generate a pattern. Wand-select some cells.
2. Upload a different image and generate.
3. Inspect: the wand panel still shows a selection count; the canvas
   shows the overlay outlined on top of unrelated cells.

**Fix**: Clear the mask in both reset points:
```js
// In resetAll (line 818-822):
if (wand && wand.setSelectionMask) wand.setSelectionMask(null);

// In applyResultRef (line ~983, near setParkMarkers([])):
if (wand && wand.setSelectionMask) wand.setSelectionMask(null);
```

Note `wand` is constructed inside `useCreatorState`; the cleanest fix is
to call its `clearSelection()` if exposed, otherwise inline the setter
reset.

**Regression test**: Mount creator, simulate wand-select (set
`selectionMask` to non-null `Uint8Array`), call `applyResultRef.current`
with a fresh result, assert `wand.selectionMask === null`.

---

### E-2 — Selection mask not cleared on tool change
**File**: [creator/useMagicWand.js](../../creator/useMagicWand.js)
**Severity**: low
**Classification**: [question]

Switching from wand/lasso to brush retains the selection mask, so the
brush only paints inside the selection. This is conventional in tools
like Photoshop, but unconventional in cross-stitch design apps and is
not signposted in the UI. The user must explicitly press Deselect (or
Esc) to clear.

**Question**: Is this intended (preserves selection across tool changes,
familiar to Photoshop users), or should switching to brush/eraser
auto-clear the selection? No behaviour change without a decision.

---

### E-3 — `removeUnusedColours` does not clean up park markers
**File**: [creator/useCreatorState.js:946-961](../../creator/useCreatorState.js#L946-L961)
**Severity**: medium
**Classification**: [auto-fix]

The function filters `pal`, `scratchPalette`, and `cmap` but leaves
`parkMarkers` intact. A marker that referenced one of the removed
colours becomes orphaned. In the Creator the marker is mostly visual
clutter (renderer falls back to a default appearance), but the saved
project carries the broken reference into the **Tracker**, which uses
the marker's `colorId` heavily ([tracker-app.js:1341](../../tracker-app.js#L1341),
[:4002](../../tracker-app.js#L4002)) — for example
`parkLayers[pm.colorId]` toggles. A marker for a colour that no longer
exists in `cmap` cannot be hidden via the colour-layers panel and may
draw with stale styling.

**Repro**:
1. Generate a pattern with at least one colour you can manage to fully
   remove via further edits (or use a scratch-only colour that's never
   placed).
2. Right-click a cell, "Park at colour X".
3. Use the brush to over-paint every X cell, so X becomes unused.
4. Click "Remove unused".
5. Open in Tracker. The marker is still there, pointing to a colour
   that the colour-layers panel can no longer toggle.

**Fix** (inside `removeUnusedColours`):
```js
setParkMarkers(function(prev) {
  return prev ? prev.filter(function(m) { return !unusedIds.has(m.colorId); }) : prev;
});
```

The same fix belongs in `removeScratchColour` for consistency
([useCreatorState.js:933-944](../../creator/useCreatorState.js#L933-L944)).

**Regression test**: Create a state with `pal` containing an entry
`X`, `parkMarkers: [{x:0,y:0,colorId:"X"}]`, and zero count for `X`.
Call `removeUnusedColours()`. Assert `parkMarkers` is empty.

---

### E-4 — `scratchPalette` survives pattern regeneration silently
**File**: [creator/useCreatorState.js:976-1040](../../creator/useCreatorState.js#L976-L1040) (`applyResultRef`)
**Severity**: low
**Classification**: [question]

`applyResultRef` resets `done`, `parkMarkers`, `threadOwned`,
`editHistory`, `redoHistory`, `confettiData`, and various UI flags, but
not `scratchPalette`. After regeneration, the scratch entries linger in
the legend as zero-count chips, which then get swept up by the very
next "Remove unused" click — possibly surprising a user who deliberately
pre-added them.

**Question**: Is keeping scratch entries across regenerate intended
behaviour ("user picks a palette, then regenerates with that palette in
mind"), or should regenerate clear them? Could also be exposed as a user
preference.

---

### E-5 — `removeScratchColour` pushes a `remove_unused_colours` entry even when the colour was in use
**File**: [creator/useCreatorState.js:933-944](../../creator/useCreatorState.js#L933-L944)
**Severity**: low
**Classification**: [auto-fix]

```js
function removeScratchColour(id) {
  var removedFromPal = pal ? pal.filter(function(p) { return p.id === id; }) : [];
  var removedFromScratch = scratchPalette ? scratchPalette.filter(function(p) { return p.id === id; }) : [];
  ...
  setPal(function(prev) { return prev ? prev.filter(function(p) { return p.id !== id; }) : prev; });
  ...
}
```

Two issues:

1. The entry type is `remove_unused_colours` even when the user is
   removing a colour that's actively used in the pattern. The undo
   restores the *palette entry* but the pattern cells that used the
   colour have an `id` that's no longer in `cmap` — they will render
   as missing/`__empty__` placeholders until undone.
2. The colour is removed from `pal` but **the pattern cells using it
   are not touched**. After the operation, `pal` is inconsistent with
   `pat`; the very next `buildPaletteWithScratch` (e.g. on next paint)
   may resurrect the entry from `pat` with `count > 0`, partially
   undoing the removal silently.

**Fix**: Either (a) refuse to remove a scratch colour that's in use
(toast "Colour is in use, remove the stitches first"), or (b) sweep
the pattern (and `partialStitches` and `parkMarkers`) when removing.
Option (a) is the minimal-risk auto-fix; option (b) is a behaviour
change.

**Regression test**: Create state with pattern using "310", add "310"
to scratch palette, call `removeScratchColour("310")`. Either assert
the operation no-ops with a toast (option a), or assert the pattern
cells previously using "310" are now `__empty__` (option b). Pick one
and lock in.

---

### E-6 — "Back to convert" copy reads "Discard edits?" even when work is saved
**File**: [creator-main.js confirmBackToConvert modal copy](../../creator-main.js)
**Severity**: low
**Classification**: [auto-fix]

The guard fires whenever `editHistory.length > 0`. After auto-save
flushes the edits to IndexedDB the work is durable; the modal still
warns "Discard edits?" as though they would be lost. They aren't —
re-loading the project would restore them. The only thing actually
discarded is the *undo stack* (which is reset by the regenerate the
user is presumably about to perform).

**Fix**: Reword the copy:
> Going back to Convert will start a new pattern generation. Your
> current edits are saved, but the **undo history will be cleared** and
> the next "Generate" will replace the pattern.

No code change to the guard logic — just the modal text.

---

### E-7 — Park markers cannot be undone
**File**: [creator/useCanvasInteraction.js parkMarkers handler](../../creator/useCanvasInteraction.js)
**Severity**: low
**Classification**: [question]

Adding or removing a park marker via context menu is not pushed to
`editHistory`. Consistent with markers being "hints" but inconsistent
with the Tracker, which **does** allow placement and is the primary
consumer. A user who places three markers and then mis-clicks a fourth
can't undo.

**Question**: Add park-marker placement to the undo history (low cost)?
Or keep current "metadata, not edits" treatment?

---

## 7. TODO / open questions

`[auto-fix]` queue for Phase 4:
- **E-1** — clear selection mask in `resetAll` and `applyResultRef`.
- **E-3** — filter `parkMarkers` in `removeUnusedColours` and `removeScratchColour`.
- **E-5** — refuse to remove an in-use scratch colour, or sweep the pattern (pick one).
- **E-6** — revise back-to-convert modal copy.

`[question]` for user batch:
- **E-2** — auto-clear selection on tool change? (Photoshop-like vs. CAD-like.)
- **E-4** — clear `scratchPalette` on regenerate, or persist?
- **E-7** — make park-marker placement undoable?

Cross-references:
- [01-create.md C-3](01-create.md#c-3--regenerate-silently-wipes-done--parkmarkers-when-project-has-progress) — regenerate wipes `done`/`parkMarkers` silently.
- [01-create.md C-9](01-create.md#c-9--bslines-survive-re-convert) — `bsLines` survive re-convert.
- [02-cleanup.md CL-5](02-cleanup.md#cl-5--worker-result-still-applied-after-sub-tool-switch) — cleanup auto-detect can clobber edit work.
