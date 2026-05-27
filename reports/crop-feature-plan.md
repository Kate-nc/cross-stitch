# Canvas Resize Feature — Implementation Plan

> **Scope**: Crop / expand the cross-stitch pattern canvas in Edit mode and
> Create-from-scratch mode.  Users drag handles on the canvas edges and
> corners to define new bounds; existing stitches are repositioned inside the
> new grid.  The feature does **not** touch the Convert/Generate flow's existing
> image-crop (`CropModal.js` / `isCropping`), which is a separate mechanism
> for cropping the source image before generation.

---

## 1  Data model audit

### 1.1  Pattern (`pat`)

* Flat `Array` of length `sW × sH`.
* Index formula: `idx = row * sW + col` (row-major, 0-based).
* Cell shapes:
  * Solid / blend stitch: `{ id: "310", type: "solid", rgb: [0,0,0] }` or
    `{ id: "310+550", type: "blend", rgb: [...] }`
  * Background / transparent: `{ id: "__skip__" }` or `{ id: "__empty__" }`
* Pattern cells have no embedded coordinate — position is purely their index.

### 1.2  Backstitch lines (`bsLines`)

* `Array<{ x1, y1, x2, y2, colorId?, color? }>`.
* Coordinates are in the **lattice** (grid-intersection) space, not cell centres.
  * `x` ∈ `[0, sW]` inclusive (sW+1 valid x values)
  * `y` ∈ `[0, sH]` inclusive (sH+1 valid y values)
* Confirmed by `canvasRenderer.js` boundary check: `lx1 <= dW` (not `< dW`).
* Renderer ignores `color` / `colorId` fields and draws all lines in `#333`.
* The undo/redo system stores `bsLines` as a **full array snapshot** per entry
  (not as index-deltas like `pat`).

### 1.3  Progress tracking (`done`)

* `null` (tracking not started) **or** `Uint8Array | Array` of length `sW × sH`.
* Same flat index as `pat`.  `1` = stitched, `0` = not stitched.
* `null` is the meaningful sentinel — the Tracker shows an empty progress bar
  until tracking is first activated.

### 1.4  Partial stitches (`partialStitches`)

* `Map<flatIndex, { TL?, TR?, BL?, BR? }>`.
* Each quadrant value is a full colour entry `{ id, type, rgb }`.
* Key is the same flat index as `pat`.

### 1.5  Park markers (`parkMarkers`)

* `Array<{ x, y, colorId }>` where `x`, `y` are **integer cell coordinates**
  (matching `pat` columns/rows, 0-based, NOT lattice).

### 1.6  Dimensions in state

* `sW`, `setSW` — columns; `sH`, `setSH` — rows.  React state in
  `useCreatorState.js` (initial value `80`).
* `settings.sW` and `settings.sH` mirror these inside saved project JSON and
  must be kept in sync.

### 1.7  Undo/redo

* Stack in `useEditHistory.js`: `editHistory` / `redoHistory`, cap
  `EDIT_HISTORY_MAX = 50`.
* `pat` changes are stored as **delta arrays** `[{ idx, old }]`.
* `bsLines` changes are stored as a **full snapshot** of the previous array.
* A canvas-resize must store a complete pre-resize snapshot as a single entry
  (dimensions + all four data arrays) because the coordinate space itself
  changes.

### 1.8  Project persistence

* `doSaveProject` in `useProjectIO.js` writes all fields atomically to
  IndexedDB via `ProjectStorage.save(project)`.
* After a canvas resize `pat`, `bsLines`, `done`, `partialStitches`,
  `parkMarkers`, `sW`, and `sH` all need to be updated in React state before
  the next auto-save fires; no extra save call is required.

---

## 2  Coordinate transform

### 2.1  Spec object

```
spec = { newW, newH, offsetX, offsetY }
```

`offsetX`, `offsetY`: where the **old grid origin** `(0, 0)` sits in the new
grid.  Examples:

| Interaction | offsetX | offsetY |
|---|---|---|
| Crop top-left 5 cols, 3 rows | −5 | −3 |
| Expand 10 cols to the right, 5 rows below | 0 | 0 |
| Centre the old canvas inside a larger new canvas | `(newW − sW) / 2` | `(newH − sH) / 2` |
| Move pattern 2 cols right, 1 row down | 2 | 1 |

### 2.2  Pattern transform

For each old cell at `(oldCol, oldRow)`:

```
newCol = oldCol + offsetX
newRow = oldRow + offsetY
```

Keep iff `0 <= newCol < newW AND 0 <= newRow < newH`.

New flat index: `newIdx = newRow * newW + newCol`.

New cells not covered by the old pattern are filled with `{ id: "__empty__" }`.

### 2.3  Backstitch transform

Remap each endpoint:

```
newX = x + offsetX
newY = y + offsetY
```

**Keep the line iff ALL FOUR remapped values are within lattice bounds:**

```
0 <= newX1 <= newW  AND  0 <= newY1 <= newH
0 <= newX2 <= newW  AND  0 <= newY2 <= newH
```

Note the **inclusive upper bound** (`<= newW`, not `< newW`) — correct for the
`(newW+1) × (newH+1)` lattice coordinate space.

Lines with one or both endpoints outside the new canvas are **deleted**, not
clipped.  (Clipping would produce confusing partial stitch artefacts.)

### 2.4  Progress tracking transform

If `done` is non-null, remap using the same cell mapping as the pattern:

```
newDone[newIdx] = oldDone[oldIdx]  — for cells that survive
newDone[newIdx] = 0               — for new (expanded) cells
```

If `done` was `null`, it remains `null` after resize (no progress started).

### 2.5  Partial stitches transform

Apply the same cell mapping: if `(oldCol + offsetX, oldRow + offsetY)` is
within bounds, remap `partialStitches.get(oldIdx)` to `newIdx`.  Discard
entries that fall outside the new canvas.

### 2.6  Park markers transform

For each `{ x, y, colorId }`:

```
newX = x + offsetX
newY = y + offsetY
```

Keep iff `0 <= newX < newW AND 0 <= newY < newH`.

---

## 3  Core transform function (Phase 2)

**File**: `creator/canvasResize.js`

```js
// Pure — no DOM, no React state, no side effects.
window.applyCanvasResize = function applyCanvasResize(
  pat, bsLines, done, partialStitches, parkMarkers, sW, sH, spec
) {
  // spec: { newW, newH, offsetX, offsetY }
  // Returns {
  //   newPat, newBsLines, newDone, newPartialStitches, newParkMarkers,
  //   deletedStitchCount, deletedBsCount, progressAffected
  // }
};
```

### 3.1  Validation (guard in the function)

* `newW` and `newH` must be integers ≥ 1. (The UI enforces a minimum of 10×10;
  the core function checks ≥ 1 as a floor.)
* `offsetX`, `offsetY` must be integers.
* If validation fails, return `null` (callers must check).

### 3.2  Return metadata

| Field | Meaning |
|---|---|
| `deletedStitchCount` | Non-empty cells from the old canvas that were cropped out |
| `deletedBsCount` | Backstitch lines that were dropped |
| `progressAffected` | `true` if `done` was non-null and any stitched cells were cropped |

These are used by the UI to compose the destructive-action warning.

---

## 4  Undo/redo integration (Phase 3)

The canvas resize creates a **single undo entry** of type `"canvasResize"`.
Because the coordinate space changes, we cannot use index-deltas; we store a
full snapshot:

```js
{
  type: "canvasResize",
  prevSW: sW,
  prevSH: sH,
  prevPat: pat.slice(),          // shallow copy of array
  prevBsLines: bsLines.slice(),  // full snapshot (matches existing bs undo pattern)
  prevDone: done ? Array.from(done) : null,
  prevPS: [...partialStitches.entries()],  // serialised Map entries
  prevParkMarkers: parkMarkers.slice(),
  prevPal: pal,
  prevCmap: cmap,
}
```

On **undo**, restore all fields at once:

```js
state.setSW(last.prevSW); state.setSH(last.prevSH);
state.setPat(last.prevPat);
state.setBsLines(last.prevBsLines);
state.setDone(last.prevDone ? new Uint8Array(last.prevDone) : null);
state.setPartialStitches(new Map(last.prevPS));
state.setParkMarkers(last.prevParkMarkers);
state.setPal(last.prevPal); state.setCmap(last.prevCmap);
state.setEditHistory([]); state.setRedoHistory([]);
// Also rebuild palette from prevPat in case new entries were added
```

> **Note**: The redo stack is cleared after a resize (consistent with how the
> existing `useEditHistory` handles structural changes).

The resize handler is added to `useEditHistory.js` as a new branch in the
undo/redo switch.

---

## 5  UI wrappers (Phase 3)

### 5.1  Entry points

The resize UI is accessible from:

1. **Edit mode** (`appMode === "edit"`): a "Resize canvas" button in the
   toolbar / `ActionBar`.
2. **Create-from-scratch mode** (`isScratchMode === true`): same button.

Both use the same modal component.

### 5.2  New modal: `ResizeCanvasModal`

**File**: `creator/ResizeCanvasModal.js`

> **Note**: The existing `creator/CropModal.js` is for cropping the *source
> image* before pattern generation (a separate feature within the Convert
> flow).  Do not modify or reuse it for pattern canvas resize.

The modal is a full-screen overlay (`role="dialog"`, `aria-modal="true"`) that
contains:

#### 5.2.1  Controls panel

* **Width** number input (min 10, max 500) — starts at `sW`.
* **Height** number input (min 10, max 500) — starts at `sH`.
* **Horizontal offset** slider + number input: where the old pattern sits
  horizontally in the new canvas.  Default: `Math.round((newW − sW) / 2)`
  (centred).
* **Vertical offset** slider + number input: same for vertical.  Default:
  `Math.round((newH − sH) / 2)`.
* **Anchor presets**: 3×3 grid of buttons (top-left, top-centre, top-right,
  mid-left, centre, mid-right, bot-left, bot-centre, bot-right) that each set
  `offsetX` and `offsetY` to the corresponding alignment position.

#### 5.2.2  Visual preview

A small canvas (or HTML grid using CSS) showing:

* The new bounds as an outline.
* The old pattern region as a filled rectangle.
* The overlap (what survives) highlighted; the portions that would be cropped
  shown dimmed.

This is a static raster summary, not a full pattern render — just coloured
rectangles so it is instant even for large patterns.

#### 5.2.3  Warning section

Shown when any of the following are true:

* `deletedStitchCount > 0`: "**X stitches** will be permanently removed."
* `progressAffected`: "Progress tracking will lose data for removed stitches."
* `deletedBsCount > 0`: "**N backstitch lines** will be removed."

Use `Icons.warning()` — no emojis.

#### 5.2.4  Buttons

* **Apply resize** (primary, disabled until `newW >= 1 && newH >= 1`) — calls
  `applyCanvasResize`, pushes undo entry, applies to state.
* **Cancel** — closes modal, no change.

If there are deleted stitches / progress loss, the Apply button shows a
"destructive" variant (red accent) and the confirmation copy in the warning is
bolded.

#### 5.2.5  Styling rules

* All CSS tokens: `--accent`, `--surface`, `--line`, `--radius-sm`,
  `--text-primary`, `--text-secondary`, `--radius-md`, `--shadow-sm`.
* No raw hex except inside `box-shadow`.
* No emojis — use `Icons.*()`.
* British English: "Resize canvas", "Remove unused colour…", "stitches" (not
  "cells").

### 5.3  `ActionBar.js` changes

Add a "Resize canvas" button entry (with `Icons.crop()` or a new icon if that
doesn't suit) that sets a new piece of state `resizeCanvasOpen` to `true`.
Only visible when `appMode === "edit" || isScratchMode`.

> **Icon decision**: check `icons.js` for a suitable existing icon before
> adding a new one.  A square-with-arrows or resize icon would fit.  If none
> exists, add one following the 24×24 viewBox, 1.6 stroke-width, currentColor
> convention in `icons.js`.

### 5.4  State additions

In `useCreatorState.js`, add:

```js
var _rszOpen = useState(false);
var resizeCanvasOpen = _rszOpen[0], setResizeCanvasOpen = _rszOpen[1];
```

Expose via the returned state object.  The modal reads `resizeCanvasOpen` and
calls `setResizeCanvasOpen(false)` on close.

---

## 6  Integration checklist

| Concern | Action |
|---|---|
| **Pattern size calculator** | `sW`/`sH` feed into `pattern-size-calc.js` via `calcFinishedSizeIn(sW, sH, fabricCt, stitchOver)`. Since `sW`/`sH` are React state, the existing render cycle automatically picks up the new values. No extra wiring needed. |
| **Auto-save / persistence** | `doSaveProject` and `ProjectStorage.save` run on the debounce timer after any state change. Once `setSW`, `setSH`, `setPat`, `setBsLines`, etc. are called, the next auto-save tick captures the new values atomically. No extra save call required. |
| **Cross-tab sync** | `CrossTabCoord.noteSeen` is called on project load. The resize writes a new `updatedAt` timestamp automatically via `doSaveProject`. No special cross-tab handling required. |
| **PDF export** | `pdfChartLayout.js` reads `sW`/`sH` from the project object at export time. Because we update `sW`/`sH` in state and the project is auto-saved with those values, export will use the new dimensions. **Do not touch** `pdf-export-worker.js` or `creator/pdfChartLayout.js` — these are PK-compat stable. |
| **Tracker view** | The Tracker reads `project.settings.sW` / `project.settings.sH` from IndexedDB. These are written by `doSaveProject` and `handleOpenInTracker`, so they will be correct after the next save without extra work. |
| **Thread count / materials** | `skeinData` is derived from `pal` which is computed from `pat` — both are updated by the resize. No extra wiring. |

---

## 7  Build step

After editing any file in `creator/`:

```bash
node build-creator-bundle.js
```

New files to add to the concatenation list in `build-creator-bundle.js`:

1. `creator/canvasResize.js` — pure core transform
2. `creator/ResizeCanvasModal.js` — UI modal

---

## 8  Test plan (Phase 4)

**File**: `tests/canvasResize.test.js`

Test style follows the existing pattern: `fs.readFileSync` + `eval()` to
extract the pure function without a module system.

### 8.1  Pure transform tests (high priority)

| Test | Description |
|---|---|
| Crop top-left | Remove first 2 cols and 3 rows; verify remaining cells have correct ids |
| Crop bottom-right | Remove last 2 cols and 2 rows |
| Expand right | Add 5 blank columns to the right; new cells are `__empty__` |
| Expand all sides | Expand by 5 each side with offset (5,5); old content centred |
| Reposition with clamp | Offset places some old cells out of bounds; those are dropped |
| Zero survivors | Offset places all old cells outside new bounds; result is all-empty |
| 1×1 minimum | newW=1, newH=1 |
| Identity | newW=sW, newH=sH, offsetX=0, offsetY=0; result identical to input |
| Backstitch inside bounds | All endpoints within new bounds; lines preserved with remapped coords |
| Backstitch on edge | Endpoint at exactly x=newW or y=newH; must be kept (lattice inclusive) |
| Backstitch one endpoint out | One endpoint outside; entire line dropped |
| Backstitch both endpoints out | Line dropped |
| Done array remap | Cropped stitches lost; expanded cells = 0 |
| Done = null | Returns null done; no crash |
| Partial stitches remap | Quadrant entries remap correctly; cropped entries discarded |
| Park markers remap | Markers within new bounds remapped; outside markers dropped |
| Return metadata | `deletedStitchCount`, `deletedBsCount`, `progressAffected` correct |

### 8.2  Validation tests

| Test | Description |
|---|---|
| newW < 1 | Returns null |
| newH < 1 | Returns null |
| Non-integer dimensions | Returns null |

### 8.3  Integration notes (not automated)

* Undo round-trip: resize then undo should restore sW, sH, pat, bsLines, done, partial stitches, and park markers exactly.
* Persistence: after resize, a manual `doSaveProject` should produce a JSON with updated `settings.sW`, `settings.sH`, and the new `pattern`, `bsLines`, `done`.

---

## 9  Open questions resolved

| Question | Answer |
|---|---|
| Is `CropModal.js` already implementing this feature? | No. It crops the **source image** before generation (GenerationContext). This feature is for the pattern grid. |
| What is the max canvas size? | No hard cap in `constants.js`. The existing new-pattern size inputs cap at ~500 (from the scratch-pad UI). Use `min 10, max 500` in the modal; the core function clamps at ≥ 1. |
| Does the existing crop state (`isCropping`, `cropRect`, etc.) conflict? | No. Those belong to the image-crop flow. The resize feature uses a new `resizeCanvasOpen` flag. |
| How is `halfStitches`/`halfDone` affected? | These are Tracker-only legacy fields preserved in `trackerFieldsRef`. They are **not** indexed by the same flat grid; they are opaque arrays preserved as-is. A canvas resize should leave `trackerFieldsRef.halfStitches` and `trackerFieldsRef.halfDone` untouched (they were generated by an older Tracker version and will be superseded by the current `partialStitches` / `done` system on the next Tracker save). |
| Do bsLines carry color per line? | Structurally yes (`colorId`, `color` fields exist). The renderer ignores them and draws all lines `#333`. The transform copies lines verbatim so any stored color is preserved on the surviving lines. |

---

## 10  Delivery order

1. **Phase 2** — `creator/canvasResize.js` pure function (no UI changes, no bundle rebuild yet — tests can eval the raw file).
2. **Phase 4** — `tests/canvasResize.test.js` test suite (runs against Phase 2 output).
3. **Phase 3** — `creator/ResizeCanvasModal.js` + `ActionBar.js` + `useCreatorState.js` + `useEditHistory.js` changes.
4. **Bundle rebuild** — `node build-creator-bundle.js`.
5. **Smoke test** — verify manual resize in browser: apply, undo, apply again, save, reload.
