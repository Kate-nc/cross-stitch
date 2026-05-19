# CQ Report 04 — Unhandled Edge Cases

## Summary

Audited for unhandled edge cases across mathematical operations, IDB access, canvas sizing, pattern array access, and import parsing. Found **15+ significant issues**, with several representing potential blockers or data corruption paths.

**Risk Level: HIGH** — Two issues can cause divide-by-zero or out-of-bounds crashes in core rendering; one can cause silent canvas truncation on iOS.

## Findings

### E-10: Canvas Dimension Overflow on iOS — BLOCKER
- **File**: [creator/PatternCanvas.js](../creator/PatternCanvas.js#L25), [creator/PreviewCanvas.js](../creator/PreviewCanvas.js#L22), [creator/RealisticCanvas.js](../creator/RealisticCanvas.js#L45)
- **Code**: `canvas.width = sW * cellSize; canvas.height = sH * cellSize;`
- **Issue**: No guard for iOS Safari's 16384px canvas limit. A 200×200 pattern with a 10px cell size produces a 2000×2000px canvas (safe), but a 200×200 pattern with a 100px cell size produces a 20000×20000px canvas — exceeding iOS limits. The canvas silently falls back to minimal rendering, displaying a blank white rectangle.
- **Severity**: blocker

### E-01: Division by Zero in gridCoord() When cellSize=0 — HIGH
- **File**: [helpers.js](../helpers.js#L203), lines 203–208
- **Code**:
  ```javascript
  function gridCoord(x, y, cellSize, originX, originY) {
    return { gx: Math.floor((x - originX) / cellSize), gy: Math.floor((y - originY) / cellSize) };
  }
  ```
- **Issue**: Division by `cellSize` with no guard for `cellSize === 0`. If cell size is somehow 0 (e.g., during initialisation or if a user sets very large zoom), result is `{gx: NaN, gy: NaN}`.
- **Severity**: high — NaN coordinates crash array index expressions

### E-04: gridCoord() Returns Unclamped Values Outside Grid Bounds — HIGH
- **File**: [helpers.js](../helpers.js#L203)
- **Code**: `Math.floor((x - originX) / cellSize)` — can return negative values
- **Issue**: If user clicks outside canvas bounds, `gx` or `gy` can be negative or larger than `w`/`h`. Callers don't consistently bounds-check before array access.
- **Severity**: high — negative array index produces `undefined`, propagating NaN through rendering

### E-12: parseOXS() Doesn't Validate w=0 or h=0 — HIGH
- **File**: [import-formats.js](../import-formats.js#L68), lines 68–85
- **Code**:
  ```javascript
  const w = parseInt(root.getAttribute("StitchWidth"), 10);
  const h = parseInt(root.getAttribute("StitchHeight"), 10);
  const pattern = new Array(w * h);  // 0-element array for w=0 or h=0
  ```
- **Issue**: No validation for zero or negative dimensions. A malformed OXS file with `StitchWidth="0"` creates an empty pattern array with no error message.
- **Severity**: high — downstream code iterates `pattern.length` and crashes on property access

### E-14: Pattern Array Out-of-Bounds Access — HIGH
- **Files**: [creator/canvasRenderer.js](../creator/canvasRenderer.js#L167), [colour-utils.js](../colour-utils.js#L163)
- **Code**: `pattern[gy * w + gx]` with no bounds check
- **Issue**: When `gx` or `gy` is outside grid bounds (see E-04), the expression `gy * w + gx` can be negative or larger than `pattern.length`. Access returns `undefined`; downstream property access `cell.id` throws TypeError.
- **Severity**: high

### E-07: skeinEst() Missing Validation for NaN/Infinity — HIGH
- **File**: [helpers.js](../helpers.js#L113), lines 113–125
- **Code**: `function skeinEst(n, fabricCt, strands, wasteFactor)` — no validation of input types
- **Issue**: If called with non-numeric arguments (e.g., `NaN` from failed `parseInt`), it silently returns `NaN` or `Infinity`, which propagates through skein cost calculations.
- **Severity**: high

### E-16: parseOXS() Silent Failure When DMC Not Found — MEDIUM
- **File**: [import-formats.js](../import-formats.js#L243), lines 243–253
- **Code**: `const dmcMatch = DMC.find(d => d.id === dmcId);` — no handling for `undefined`
- **Issue**: DMC IDs from third-party OXS files may not exist in the bundled catalogue. `dmcMatch` is `undefined`, and the next access `dmcMatch.rgb` throws TypeError. Error propagates up and kills the entire import.
- **Severity**: medium — import of third-party files crashes silently

### E-13: Backstitch OOB Check Uses `>` Not `>=` — MEDIUM
- **File**: [project-storage.js](../project-storage.js#L396), line 396
- **Code**:
  ```javascript
  if (x1 > w || y1 > h || x2 > w || y2 > h) continue;
  ```
- **Issue**: Grid dimensions are 0-indexed. Max valid x is `w-1`. Condition should be `>= w` not `> w`. A backstitch ending exactly at the right/bottom edge is valid but would be skipped.
- **Severity**: medium — off-by-one silently discards valid backstitch lines at pattern edges

### E-09: doDither Silently Returns Empty for w=0 or h=0 — MEDIUM
- **File**: [colour-utils.js](../colour-utils.js#L162), lines 162–165
- **Code**: `function doDither(pixels, w, h, palette, opts)` — no initial size check
- **Issue**: If called with `w=0` or `h=0`, the function iterates no pixels and returns an empty result without error. Caller receives `[]` with no indication of the problem.
- **Severity**: medium

### E-19: Sessions With NaN durationMinutes Pass Through buildMeta() — MEDIUM
- **File**: [project-storage.js](../project-storage.js#L418), lines 418–434
- **Code**: `totalTime += s.durationMinutes;` — no NaN check
- **Issue**: If any session has `durationMinutes: NaN` (e.g., from failed `parseInt`), `totalTime` becomes `NaN` for all subsequent sessions. Time display shows "NaN h" in the project panel.
- **Severity**: medium

### E-02: fmtTime/fmtTimeL Don't Handle NaN/Infinity/Negative — MEDIUM
- **File**: [helpers.js](../helpers.js#L58), lines 58–90
- **Code**: `function fmtTimeL(ms) { if (!ms) return '0m'; ...`
- **Issue**: `if (!ms)` catches `0` and `undefined` but not `NaN` or `Infinity`. `fmtTimeL(NaN)` returns `"0m"` (falsy check passes). `fmtTimeL(Infinity)` formats to "Infinitym" or "Infinityh".
- **Severity**: medium

### E-11: runGenerationPipeline() No Resource Warning on Canvas Failure — MEDIUM
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L980)
- **Code**: `const canvas = document.createElement('canvas'); canvas.width = maxDim; canvas.height = maxDim;`
- **Issue**: Canvas allocation can silently fail on low-memory devices. No check for `canvas.width === 0` after assignment.
- **Severity**: medium

### E-03: threadKm() Passes NaN Through Silently — LOW
- **File**: [helpers.js](../helpers.js#L142), line 142
- **Code**: `function threadKm(n, fabricCt, strands) { return skeinEst(n, fabricCt, strands) * SKEIN_LENGTH_IN * 0.0000254; }`
- **Issue**: If `skeinEst` returns `NaN`, `threadKm` also returns `NaN`. Caller displays `NaN` in the materials list.
- **Severity**: low

### E-08: quantize() Returns [] for Empty Pattern — LOW
- **File**: [colour-utils.js](../colour-utils.js#L87), line 87
- **Code**: `if (!pixels.length) return [];`
- **Issue**: Correct early exit, but callers may not check for empty result. Acceptable if all callers do a length check.
- **Severity**: low

### E-18: Sync Engine Race Condition Guard Needs Review — MEDIUM
- **File**: [sync-engine.js](../sync-engine.js#L130)
- **Code**: `if (this._syncing) { return; }` — single boolean guard
- **Issue**: Guard exists but the boolean may not be reset correctly if an async error interrupts the sync cycle. A failed sync leaves `_syncing = true` permanently, blocking all future syncs.
- **Severity**: medium

## TODO — Priority-Ordered Fix List

1. **[BLOCKER] Add canvas size cap before assignment** in all canvas setups: `canvas.width = Math.min(sW * cellSize, MAX_CANVAS_DIM)` where `MAX_CANVAS_DIM = 16384`.
2. **[HIGH] Guard gridCoord() against zero cellSize**: `if (!cellSize) return {gx:0, gy:0};` and clamp to `[0, w-1]`/`[0, h-1]`.
3. **[HIGH] Clamp gx/gy to grid bounds before array access** in all `pattern[gy * w + gx]` expressions.
4. **[HIGH] Add dimension validation in parseOXS()**: If `w <= 0 || h <= 0`, throw/return an error with message.
5. **[HIGH] Add `isFinite()` guard in skeinEst()**: Return `0` if any numeric argument is non-finite.
6. **[MEDIUM] Handle missing DMC in parseOXS()**: Log warning and skip or substitute nearest colour if DMC ID not found in catalogue.
7. **[MEDIUM] Fix backstitch OOB check**: Change `> w` to `>= w` and `> h` to `>= h` in [project-storage.js](../project-storage.js#L396).
8. **[MEDIUM] Guard NaN durationMinutes** in `buildMeta()`: `totalTime += isFinite(s.durationMinutes) ? s.durationMinutes : 0;`.
9. **[MEDIUM] Fix sync engine `_syncing` boolean**: Add reset in error/finally path in [sync-engine.js](../sync-engine.js#L130).
10. **[MEDIUM] Guard doDither for w=0/h=0**.
11. **[LOW] Add NaN guard in fmtTime/fmtTimeL**: `if (!ms || !isFinite(ms)) return '0m';`.
