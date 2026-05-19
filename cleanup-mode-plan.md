# Cleanup Mode — Design Plan

## 1. Codebase Audit Summary

### 1.1 App modes and toolbar

The Creator app has two top-level `appMode` values: `"create"` and `"edit"`.

| Mode | Meaning |
|---|---|
| `"create"` | Source-image configuration (upload, dimensions, palette generation, preview). Minimal toolbar (Overlay toggle + Zoom). |
| `"edit"` | Pattern canvas is interactive. Full toolbar: Paint / Fill / Erase / Pick / Hand / Replace, swatch strip, Magic Wand, Lasso. |

Within edit mode the current interaction is selected via `cv.activeTool` (string: `"eyedropper"`, `"hand"`, `"colourReplace"`, `"magicWand"`, `"lasso"`, or `null` for Paint/Fill). **Cleanup Mode will add `"cleanup"` as a new `activeTool` value**, consistent with how Hand and Replace are already implemented.

The toolbar (`creator/ToolStrip.js`) reads from `CanvasContext` (`useCanvas()`) and `PatternDataContext` (`usePatternData()`). The Cleanup Mode toggle will appear in both the `"create"` toolbar (minimal) and the `"edit"` toolbar (full brush group), so users can clean up lineart at any point in the workflow.

### 1.2 Pattern / palette data model

- `state.pat` — flat array of length `sW * sH`. Each cell: `{ id, type, rgb, lab, ... }`, or `{ id: "__skip__" }` / `{ id: "__empty__" }`.
- `state.pal` — array of palette entries `{ id, rgb, lab, count, name, symbol }`, sorted by stitch count.
- `state.cmap` — `{ [id]: paletteEntry }` lookup.
- `state.sW`, `state.sH` — grid dimensions.

### 1.3 Undo/redo system

`creator/useEditHistory.js` implements a **delta-based** undo/redo stack:

```
editHistory: Array<{ type, changes: [{idx, old}], psChanges?, bsLines? }>
redoHistory: same shape
```

- Each entry stores the *old* values of changed cells (not full snapshots).
- Pushing an entry: `state.setEditHistory(prev => prev.concat([entry]))`.
- `rebuildPreservingZeros(np)` rebuilds `pal`/`cmap` after every commit, keeping zero-count palette entries as `count:0` chips so the user can see which colours are now unused.

A Cleanup commit is a standard `{ type: "cleanup", changes: [{idx, old}] }` entry — the generic fallthrough in `undoEdit`/`redoEdit` handles it with zero extra code.

### 1.4 Colour distance

`colour-utils.js` exports `dE2000(lab1, lab2)` (full CIEDE2000, result is ΔE, not ΔE²) with a built-in LRU cache. `dE2(lab1, lab2)` returns ΔE² (squared) and is used internally. A palette entry's `.lab` is already populated. `rgbToLab(r,g,b)` is available as a global.

Cleanup Mode tolerance works in CIEDE2000 units; a slider range of 0–100 maps to 0–30 ΔE (the full DMC palette spans roughly 0–110 ΔE max, most perceptual thresholds sit below 20).

### 1.5 Canvas rendering

`PatternCanvas.js` uses a two-effect pattern:
1. **Effect 1** — full base render (expensive), fired on pattern/palette/view changes; caches to `baseCacheRef`.
2. **Effect 2** — overlay-only render (cheap), fired on hover/tool changes; restores cached base then paints hover indicators.

The cleanup overlay will integrate into Effect 2 (fast path) via `drawPatternOverlayOnCanvas` in `canvasRenderer.js`. The overlay mask is just another piece of state that triggers the cheap redraw, not the expensive base render.

### 1.6 Web Worker / performance

`generate-worker.js` is the existing worker for generation. Auto-detect will get its **own dedicated worker** (`cleanup-worker.js`) using the same `importScripts` pattern. The worker receives `{ pat, sW, sH, targetLab, tolerance, ... }` and returns `{ selected: Uint8Array }`. This keeps the main thread free during analysis of large patterns.

---

## 2. Cleanup Mode Specification

### 2.1 New files

| File | Purpose |
|---|---|
| `creator/useCleanupMode.js` | Hook: all cleanup state + logic (color selection, tolerance, brush drag, auto-detect, apply, overlay mask) |
| `cleanup-worker.js` | Web Worker: auto-detect algorithm (off main thread) |
| `tests/cleanupMode.test.js` | Unit + integration tests |
| `cleanup-mode-notes.md` | Post-implementation notes doc |

### 2.2 Modified files

| File | Change |
|---|---|
| `creator/useCreatorState.js` | Add cleanup state vars to state object |
| `creator/context.js` | Expose `cleanupMode` helpers on `CanvasContext` |
| `creator/ToolStrip.js` | Add Cleanup toggle button; render cleanup control row |
| `creator/canvasRenderer.js` | Add cleanup overlay rendering to `drawPatternOverlayOnCanvas` |
| `creator/PatternCanvas.js` | Add `cleanupOverlayMask` to Effect 2 dependencies |
| `build-creator-bundle.js` | Prepend `useCleanupMode.js` before `useCanvasInteraction.js` in `ORDER` |

### 2.3 Module-root constants (in `creator/useCleanupMode.js`)

```js
// Tolerance slider maps to this ΔE scale (CIEDE2000).
var CLEANUP_TOLERANCE_MIN_DE = 0;
var CLEANUP_TOLERANCE_MAX_DE = 30;
var CLEANUP_TOLERANCE_DEFAULT = 20; // roughly 20/100 * 30 = 6 ΔE

// Auto-detect heuristic thresholds
var AUTODETECT_MAX_RUN_WIDTH = 2;        // stitches — thin runs only (1–2 wide)
var AUTODETECT_MIN_FOREIGN_NEIGHBOR_RATIO = 0.5; // >50% neighbors must be a different colour
var AUTODETECT_MIN_CONNECTED_RUN_LENGTH = 3;     // minimum cells in a run to count as lineart

// Brush
var CLEANUP_BRUSH_MIN = 1;
var CLEANUP_BRUSH_MAX = 10;
var CLEANUP_BRUSH_DEFAULT = 1;

// Overlay
var CLEANUP_OVERLAY_FILL = "rgba(255, 80, 0, 0.45)"; // warm orange solid highlight

// Neighbor vote
var CLEANUP_WIDE_NEIGHBORHOOD = 5; // 5×5 region for tie-breaking
```

---

## 3. State Design

All new state lives in `useCreatorState` (so it is part of the existing state tree and passed through `CanvasContext`).

```
// ── Cleanup mode state ───────────────────────────────────────────────────
cleanupTargetColorId      : string | null     // selected palette color
cleanupTolerance          : number (0-100)    // slider value
cleanupSelTool            : "click"|"brush"|"auto"  // sub-tool
cleanupBrushSize          : number (1-10)
cleanupPendingMask        : Uint8Array | null // length sW*sH, 1=selected
cleanupAutoRunning        : boolean           // worker is computing
cleanupAutoError          : string | null
```

`cleanupPendingMask` is a `Uint8Array` (same shape as `done` in the tracker). It drives:
- The overlay rendering (Effect 2 in PatternCanvas — cheap redraw).
- The Apply button enabled state.

---

## 4. Integration Points

### 4.1 Toolbar button

Added to both the create-mode and edit-mode toolbar strips in `ToolStrip.js`:

```jsx
h("button", {
  className: "tb-btn" + (cv.activeTool==="cleanup" ? " tb-btn--on" : ""),
  onClick: toggleCleanup,
  title: "Cleanup Mode — remove lineart pixels (C)",
  "aria-label": "Cleanup mode",
  "aria-pressed": cv.activeTool==="cleanup" ? "true" : "false"
}, Icons.cleanup(), " Cleanup")
```

A new `Icons.cleanup()` SVG will be added to `icons.js` (broom/eraser outline, 24×24, 1.6 stroke, currentColor).

### 4.2 Cleanup control row

When `cv.activeTool === "cleanup"`, a second row below the swatch strip renders:

```
[color swatch picker] [Tolerance: slider 0–100] [Sub-tool: Click | Brush | Auto] [Brush size (if Brush)] [Auto-Detect button] [Apply] [Cancel]
```

This row is rendered inline in `ToolStrip.js`, analogous to the existing `swatchRow`.

### 4.3 Pointer interaction

`useCleanupMode.js` exports handlers (`onCleanupPointerDown`, `onCleanupPointerMove`, `onCleanupPointerUp`) which are called from `useCanvasInteraction.js` when `activeTool === "cleanup"`.

- **Click** (`cleanupSelTool === "click"`): on pointer-up, look up the cell, check if it matches within tolerance, toggle it in `cleanupPendingMask`.
- **Brush** (`cleanupSelTool === "brush"`): paint-select while dragging. Only adds cells that match within tolerance (cells outside tolerance are skipped even if the brush passes over them). Updates `cleanupPendingMask` incrementally during drag.
- **Auto** (`cleanupSelTool === "auto"`): button-triggered; posts a message to `cleanup-worker.js` and sets `cleanupAutoRunning = true`. On worker reply, sets `cleanupPendingMask` from the result.

All pointer handlers use `PointerEvent` (not mouse events) for cross-platform compatibility.

### 4.4 Overlay rendering (canvasRenderer.js)

In `drawPatternOverlayOnCanvas`:

```js
if (state.cleanupPendingMask && state.activeTool === "cleanup") {
  _drawCleanupOverlay(ctx2d, state.cleanupPendingMask, sW, sH, cs, G);
}
```

`_drawCleanupOverlay` draws a semi-transparent solid fill (`CLEANUP_OVERLAY_FILL`) over each selected cell. Simple `fillRect` per cell — no filter, no clipping path, fully Safari-compatible.

### 4.5 Apply logic (in `useCleanupMode.js`)

```
applyCleanup():
  1. Guard: cleanupPendingMask must be non-null and have ≥1 selected cell.
  2. Build `selectedSet = Set<number>` from cleanupPendingMask.
  3. Snapshot pre-apply state: np = pat.slice()
  4. For every selected idx:
     a. Compute replacement = neighborVote(idx, np, selectedSet, sW, sH)
     b. Store { idx, old: np[idx] } in changes[]
     c. Replace np[idx] with replacement
     Note: Step 3 snapshots BEFORE any replacements. Step 4c writes the
     replacement into np AFTER the snapshot, so votes always read
     pre-cleanup state (atomicity guarantee from the spec).
  5. Commit: setPat(np), rebuildPreservingZeros(np) → setPal, setCmap
  6. Push to editHistory: { type: "cleanup", changes }
  7. Clear cleanupPendingMask
  8. Surface unused-color notice (see §4.7)
```

### 4.6 Neighbor vote (in `useCleanupMode.js`)

```
neighborVote(idx, prePat, selectedSet, sW, sH):
  1. Collect 8-connected neighbors that are NOT in selectedSet.
     Map colorId → count.
  2. If no valid neighbors → return prePat[idx] unchanged (edge case:
     all 8 neighbors are also selected — stitch keeps its own colour,
     effectively a no-op for that cell).
  3. Find winning colorId by frequency (most votes).
  4. Tie-break: prefer the colour appearing most often in the 5×5
     neighborhood (excluding cells in selectedSet).
  5. Tie-break 2: prefer the colour with Lab closest to the LAB average
     of all valid 8-neighbors.
  6. Return prePat[winning colorId entry].
```

Key correctness requirement: `prePat` (the snapshot from step 3 of applyCleanup) is used for ALL vote reads, not the partially-updated `np`. This is enforced by only reading from `prePat` inside `neighborVote`.

### 4.7 Unused-colour notice

After each apply, check:
```js
var stillUsed = new Set(np.map(c => c.id).filter(id => id !== "__skip__" && id !== "__empty__"));
var removed = changes.map(c => c.old.id).filter(id => !stillUsed.has(id) && newPal.every(p => p.id !== id));
```
For each id in `removed` (now zero-count), show a toast:  
`"DMC 310 is no longer used in this pattern. Remove from palette?"`  
with an undo-safe "Remove" action that pushes a `{ type: "remove_unused_colours", ... }` entry — identical to the existing mechanism already in `useEditHistory.js`.

### 4.8 Auto-detect heuristic (in `cleanup-worker.js`)

The worker receives `{ pat, sW, sH, targetLab, toleranceDe }` and returns `{ selected: Uint8Array }`.

**Algorithm:**

```
Phase 1 — Color match:
  For each cell idx:
    if cell.lab && dE2000(cell.lab, targetLab) <= toleranceDe:
      candidateMask[idx] = 1

Phase 2 — Thin-run filter (exclude filled regions):
  For each candidate cell, count 8-connected neighbors that are also candidates.
  If ≥ (AUTODETECT_MAX_RUN_WIDTH * 2 + 1) neighbors are also candidates
  (i.e., the cell is interior to a filled block, not on the edge of one),
  mark the cell as NOT lineart.
  
  More precisely: a cell is "thick" if both:
    (a) it has ≥ 4 cardinal-direction neighbors that are candidates, AND
    (b) removing it would not disconnect its neighbors
        (connectivity check via simple BFS).
  A "thin" cell is one that is NOT thick.
  
  In practice: count candidate-colored cardinal neighbors. If count >= 4,
  the cell is interior to a filled block and excluded from the result.
  (This is a fast approximation; tunable via AUTODETECT_MAX_RUN_WIDTH.)

Phase 3 — Boundary filter:
  For each remaining candidate cell:
    foreignNeighbors = count of 8-connected neighbors whose color != targetColor
                       (within tolerance).
    totalNeighbors = count of valid (non-skip, non-empty) 8-connected neighbors.
    if foreignNeighbors / totalNeighbors < AUTODETECT_MIN_FOREIGN_NEIGHBOR_RATIO:
      exclude (the cell is inside a solid region, not on a boundary/thin line)
      
Phase 4 — Connected-run filter:
  Label connected components among surviving candidates (4-connected BFS).
  Discard components with < AUTODETECT_MIN_CONNECTED_RUN_LENGTH cells.
  (Prevents isolated noise pixels from being flagged.)

Return: Uint8Array of length sW*sH, 1 = selected.
```

**Tunable constants** are declared at the top of `cleanup-worker.js` (same names as in `useCleanupMode.js`; passed as part of the worker message so they can be adjusted without a page reload in future).

**Performance:** The worker is a single `importScripts`-based file. For a 200×200 grid (40 000 cells), phases 1–4 are all O(N) or O(N log N). No blocking on the main thread.

---

## 5. Accessibility

| Element | ARIA |
|---|---|
| Cleanup Mode toggle button | `role="button"` `aria-pressed` `title` `aria-label` |
| Sub-tool switcher (Click/Brush/Auto) | `role="radiogroup"` with `role="radio"` + `aria-checked` |
| Tolerance slider | `<input type="range">` with visible `<label>` and `aria-label` |
| Brush size slider | Same pattern |
| Apply button | `aria-label="Apply cleanup"` `aria-disabled` when no selection |
| Cancel button | `aria-label="Cancel cleanup"` |

All buttons are keyboard-focusable (natural tab order). Apply/Cancel are triggered by Enter/Space.

---

## 6. Cross-platform notes

- All pointer handlers use `PointerEvent` (not `MouseEvent`) — identical to existing tools.
- Canvas overlay uses only universally-supported 2D API: `fillRect`, `beginPath`/`stroke` for hatching, `setLineDash`, `clip`. No `ctx.filter` (Safari <15 does not support it; the existing code feature-detects this via `_canvasFilterSupported`).
- The cleanup worker uses `importScripts` (same as `generate-worker.js`), which is supported in all browsers that support Web Workers.
- `dE2000` in the worker: `colour-utils.js` is already imported by `generate-worker.js` via `importScripts`. `cleanup-worker.js` does the same.

---

## 7. Undo/redo correctness

The spec asks us to verify: undo a cleanup → create-mode action → redo.

- Cleanup apply pushes `{ type: "cleanup", changes }` to `editHistory` and clears `redoHistory` (same as every other edit).
- Undo of cleanup: generic fallthrough in `undoEdit` restores all `changes[i].old` values and rebuilds palette.
- After undo, the user paints a cell (create-mode action). This pushes a new entry to `editHistory` and **clears `redoHistory`** (standard behavior for any new edit after undo).
- Attempting redo at this point: `redoHistory` is empty → redo is a no-op. This is the standard, expected UX: a new edit after undo always clears the redo stack.

No special handling is needed. The existing `useEditHistory.js` generic loop handles `type: "cleanup"` entries without modification.

---

## 8. Build changes

`build-creator-bundle.js` ORDER array: insert `'useCleanupMode.js'` immediately before `'useCanvasInteraction.js'` (cleanup state must be set up before interaction handlers reference it).

`cleanup-worker.js` lives at the project root (same level as `generate-worker.js`) and is **not** bundled — it is loaded via `new Worker('cleanup-worker.js')`.

---

## 9. Testing plan

### Unit tests (`tests/cleanupMode.test.js`)

1. **Color distance threshold**: `dE2000` of the target color to itself = 0; color 3 ΔE away with tolerance=5 is included; color 10 ΔE away with tolerance=5 is excluded.
2. **Neighbor vote — standard case**: grid with a center cell surrounded by 5 cells of color A and 3 of color B → center replaced with A.
3. **Neighbor vote — all neighbors selected**: center and all 8 neighbors are in `selectedSet` → center keeps its original color (no crash, no invalid result).
4. **Neighbor vote — edge cell**: top-left corner with only 3 valid neighbors → vote uses only those 3.
5. **Auto-detect — thin line detected**: hand-crafted 10×10 grid with a single-cell-wide diagonal line of target color → all line cells selected.
6. **Auto-detect — solid fill excluded**: 5×5 block of target color → no cells (or very few edge cells) selected.
7. **Tolerance slider**: same target color, different tolerances; verify set grows as tolerance increases.
8. **Atomic replacement**: two adjacent selected cells vote for each other's neighbor and get the correct replacement color from the pre-apply snapshot.

### Integration test

```
1. Load a fixture pattern with a known set of target-color cells.
2. Enter cleanup mode (set activeTool = "cleanup").
3. Run auto-detect.
4. Adjust tolerance — verify pending mask changes.
5. Apply — verify pat[] changed correctly.
6. Call undoEdit() — verify pat[] restored to original.
7. Verify pal/cmap are correct after undo.
```

---

## 10. Deferred / out of scope

- **Auto-generating backstitch paths** from removed lineart pixels is explicitly out of scope. Mentioned in `cleanup-mode-notes.md` as a future enhancement.
- **Live hatch animation** (animated diagonal lines) — static hatch is sufficient and cheaper.
- **Multi-color cleanup** in one pass — user runs cleanup once per color. Future enhancement.

---

## 11. File creation order

1. Add `Icons.cleanup()` to `icons.js`.
2. Add cleanup state variables to `creator/useCreatorState.js`.
3. Create `creator/useCleanupMode.js`.
4. Create `cleanup-worker.js`.
5. Update `creator/canvasRenderer.js` (overlay rendering).
6. Update `creator/ToolStrip.js` (toggle + control row).
7. Update `creator/PatternCanvas.js` (add dependency to Effect 2).
8. Update `creator/useCanvasInteraction.js` (dispatch to cleanup handlers).
9. Update `build-creator-bundle.js` (add `useCleanupMode.js` to ORDER).
10. Run `node build-creator-bundle.js`.
11. Create `tests/cleanupMode.test.js`.
12. Create `cleanup-mode-notes.md`.
