# CQ Report 08 — Deep Nesting

## Summary

Audited for excessive control-flow nesting (indentation depth > 4) that makes code hard to understand and debug. Found **5 significant nesting clusters**, two of which are in hot rendering paths where the nesting also has performance implications.

**Risk Level: MEDIUM** — All code is functionally correct; deep nesting is a maintainability and reviewability concern. Refactoring should be done alongside bug fixes (see Report 04 edge cases) to avoid introducing regressions.

## Findings

### N-01: doDither() — 6 Levels of Nesting — WORST
- **File**: [colour-utils.js](../colour-utils.js#L138), lines 138–288
- **Nesting structure**: `for → for → if → if → for → if`
- **Code summary**:
  ```
  function doDither(pixels, w, h, palette, opts) {          // level 1
    for (var y = 0; y < h; y++) {                           // level 2
      for (var x = 0; x < w; x++) {                        // level 3
        if (confetti && tiers[y*w+x] >= threshold) {       // level 4
          if (forced === undefined) {                       // level 5
            for (var ci = 0; ci < palette.length; ci++) {  // level 6 ← deep
              if (dE2(palette[ci].lab, pixLab) < bestDist) // level 7
  ```
- **Issue**: The confetti-aware colour selection is nested inside the error diffusion loop, inside row/column iteration. Six levels of nesting makes it very hard to:
  - Understand what "level 5" is doing
  - Write unit tests for the confetti-colour selection logic
  - Read the surrounding error diffusion accumulation code
- **Extracted helpers needed**:
  - `selectBestColourForPixel(lab, palette, opts)` — best palette entry for a pixel
  - `diffuseErrorToNeighbours(errors, x, y, w, h, err)` — distributes quantisation error to neighbours
- **Severity**: high

### N-02: _drawMarchingAnts() — 5 Levels of Nesting
- **File**: [creator/canvasRenderer.js](../creator/canvasRenderer.js#L81), lines 81–163
- **Nesting structure**: `for → for → if → if → if`
- **Code summary**:
  ```
  function _drawMarchingAnts(ctx, sel, w, h, offset) {
    for (var row = 0; row < h; row++) {          // level 2
      for (var col = 0; col < w; col++) {        // level 3
        if (sel.has(row * w + col)) {            // level 4
          if (col === 0 || !sel.has(...)) {      // level 5
            if (side === 'left') {               // level 6 ← deep
  ```
- **Issue**: The marching-ants boundary detection nests inside the full grid scan, inside a selected-cell check, inside a neighbour-check. Makes it hard to understand which cells draw which segments.
- **Extracted helper needed**: `emitBoundarySegment(ctx, bx, by, side, offset)` for drawing a single boundary segment.
- **Severity**: medium

### N-03: drawPatternOnCanvas() — 5 Levels of Nesting
- **File**: [creator/canvasRenderer.js](../creator/canvasRenderer.js#L167), lines 167–580
- **Nesting structure**: `for → for → if → switch/if → if`
- **Code summary**: The outer two loops scan grid rows/columns. Inside each cell, a cascade of `if (isBlend)` / `switch (halfStitch)` / `if (highlighted)` renders the cell. The rendering logic for blend cells, half-stitches, and highlights is all inlined, making any rendering change a surgical operation through 5 levels.
- **Extracted helper needed**: `renderStitchCell(ctx2d, cell, state, opts)` that handles all cell rendering cases.
- **Severity**: medium

### N-04: parseOXS() — 5 Levels of Nesting
- **File**: [import-formats.js](../import-formats.js#L56), lines 56–300
- **Nesting structure**: `for → forEach → for → if → if`
- **Code summary**: The OXS parser iterates colour elements, then iterates stitch elements nested inside, then checks DMC match, then validates position. All inline.
- **Improvement**: Replace the inner `for` loop for DMC colour lookup with `findSolid(r, g, b)` from [colour-utils.js](../colour-utils.js) — eliminates one nesting level and fixes the O(n) scan (from CQ-02 D-11).
- **Severity**: medium

### N-05: TrackerPreviewModal Effect — 5 Levels of Nesting
- **File**: [tracker-app.js](../tracker-app.js#L50), lines 50–200
- **Nesting structure**: `useEffect → rAF callback → for → for → if`
- **Code summary**: Tile-cache computation runs inside a `requestAnimationFrame`, inside a `useEffect`. The tile rendering loop checks each cell's done state inside the rAF. The compute and render passes are interleaved.
- **Extracted function needed**: `computeTileCache(pattern, done, w, h)` to separate data calculation from canvas drawing.
- **Severity**: medium

## TODO — Priority-Ordered Fix List

1. **[HIGH] Extract helper functions from doDither() in [colour-utils.js](../colour-utils.js#L138)**:
   - `selectBestColourForPixel(lab, palette, confettiOpts)` — testable in isolation
   - `diffuseErrorToNeighbours(errorBuffer, x, y, w, h, quantError)` — matches Floyd-Steinberg paper exactly
   - These helpers also make it possible to add property tests (from CQ-05).

2. **[MEDIUM] Extract `renderStitchCell()` from [creator/canvasRenderer.js](../creator/canvasRenderer.js#L167)**:
   - Also addresses the near-duplicate loop issue from CQ-06 M-03.
   - Target: `drawPatternOnCanvas` and `drawPatternBaseOnCanvas` both call `renderStitchCell()`.

3. **[MEDIUM] Extract `emitBoundarySegment()` from `_drawMarchingAnts()`** in [creator/canvasRenderer.js](../creator/canvasRenderer.js#L81).

4. **[MEDIUM] Replace inner DMC scan in `parseOXS()`** with `findSolid()` call:
   - Removes one level of nesting
   - Changes O(n²) import to O(n×m) where m is number of OXS colours (usually <50)

5. **[MEDIUM] Extract `computeTileCache()` from TrackerPreviewModal useEffect** in [tracker-app.js](../tracker-app.js#L50):
   - Separate data computation from canvas rendering
   - Makes rAF callback simpler (reads pre-computed cache, renders to canvas only)

6. **[LOW] Establish nesting guideline**: Consider adding a code-style note that functions should not exceed 4 levels of nesting; use early-return / helper-extraction to reduce depth.
