# CQ Report 05 — Mutation and Property-Based Testing Opportunities

## Summary

Audited the existing test suite and identified gaps where property-based tests or mutation tests would add high confidence. The codebase already has an impressive set of property-based tests for pure mathematical functions. The main gaps are in canvas rendering logic, grid coordinate math, and import/export round-tripping.

**Current Test Coverage:** Strong for pure functions; absent for DOM-adjacent logic.

## Existing Strong Test Coverage

### Already Well-Covered by Property Tests

| Module | Property Test File | Properties Verified |
|---|---|---|
| `fmtTime` / `fmtTimeL` | [tests/time-formatting-properties.test.js](../tests/time-formatting-properties.test.js) | Non-negativity, monotonicity, idempotency |
| `stitchesToSkeins` | [tests/skein-calculation-properties.test.js](../tests/skein-calculation-properties.test.js) | Monotonicity, unit consistency |
| `dE2000` | [tests/colour-distance-properties.test.js](../tests/colour-distance-properties.test.js) | Symmetry, reflexivity |
| `rgbToLab` | [tests/rgb-to-lab-properties.test.js](../tests/rgb-to-lab-properties.test.js) | Boundary, monotonicity |
| `findSolid` | [tests/colour-matching-properties.test.js](../tests/colour-matching-properties.test.js) | Returns valid DMC ID |
| `calcDifficulty` | [tests/difficulty-rating-properties.test.js](../tests/difficulty-rating-properties.test.js) | Monotonicity with stitch count |
| `isBlendId` / `splitBlendId` | [tests/blend-id-properties.test.js](../tests/blend-id-properties.test.js) | Round-trip consistency |
| `threadKey` / `parseThreadKey` | [tests/composite-key-properties.test.js](../tests/composite-key-properties.test.js) | Inverse function property |
| `classifyMatch` / `tierLabel` | [tests/matchQuality.test.js](../tests/matchQuality.test.js) | Tier ordering monotonicity |

## Critical Test Gaps

### P-01: dE2 (Euclidean Distance) — No Property Tests
- **File**: [colour-utils.js](../colour-utils.js#L45), `dE2()` function
- **Properties to test**:
  - Commutativity: `dE2(a, b) === dE2(b, a)`
  - Reflexivity: `dE2(a, a) === 0`
  - Non-negativity: `dE2(a, b) >= 0`
  - Triangle inequality: `dE2(a, c) <= dE2(a, b) + dE2(b, c)`
- **Issue**: Only golden-value tests exist. Mutation of the squared-sum expression could survive testing.
- **Risk**: Off-by-one in the Euclidean sum could survive existing tests

### P-02: quantize() — Missing Output Properties
- **File**: [colour-utils.js](../colour-utils.js#L87), `quantize()` function
- **Properties to test**:
  - Output length: `result.length === w * h`
  - Each output cell is a valid DMC ID from input palette
  - Convergence: Running `quantize` twice with same palette produces same-quality assignment
  - Empty palette returns consistent failure
- **Issue**: No quantize tests at all. Bugs in k-means centroid update step would be silent.

### P-03: doDither() — Missing Size Invariants
- **File**: [colour-utils.js](../colour-utils.js#L162), `doDither()` function
- **Properties to test**:
  - Output size invariant: `result.length === w * h`
  - Error diffusion weight sum: coefficients sum to 1.0 (Floyd-Steinberg: 7/16 + 3/16 + 5/16 + 1/16 = 1.0)
  - All output IDs are valid palette entries
  - Determinism: Same input + same palette → same output (no random variation)
- **Issue**: No dither tests. Logic has known issues (see E-09) that property tests would catch.

### P-04: gridCoord() — NO TESTS AT ALL
- **File**: [helpers.js](../helpers.js#L203), `gridCoord()` function
- **Properties to test**:
  - Identity at origin: `gridCoord(originX, originY, sz, originX, originY) === {gx:0, gy:0}`
  - Inverse: `gridCoord(originX + gx*sz, originY + gy*sz, sz, originX, originY)` → `{gx, gy}`
  - Boundedness: When `cellSize > 0`, result is finite
  - Edge: `cellSize = 0` produces safe/guarded result (not NaN)
- **Issue**: `gridCoord` is called on every mouse/touch event. No tests. The off-by-one and division-by-zero bugs (from Report 04) would be caught by these.

### P-05: importResultToProject() — No Round-Trip Tests
- **File**: [import-formats.js](../import-formats.js#L380)
- **Properties to test**:
  - For any valid project P, `import(export(P)).pattern ≈ P.pattern`
  - OXS round-trip: exported XML re-imported produces equivalent pattern
  - JSON round-trip: serialised project re-parsed equals original
- **Issue**: No round-trip tests. Subtle format bugs in import/export would only be caught manually.

### P-06: parseHexColor() — Missing Boundary Tests
- **File**: [import-formats.js](../import-formats.js#L15), `parseHexColor()` function
- **Properties to test**:
  - With `#`: `parseHexColor('#RRGGBB') === parseHexColor('RRGGBB')`
  - Uppercase/lowercase consistency
  - Boundary: `parseHexColor('000000') === [0,0,0]`, `parseHexColor('ffffff') === [255,255,255]`
  - Round-trip: `parseHexColor(rgbToHex(r,g,b)) === [r,g,b]`
- **Issue**: Minimal tests. Hex parsing is used in every import path.

### P-07: stitchesToSkeins() — Invalid Parameter Mutations Not Covered
- **File**: [threadCalc.js](../threadCalc.js#L14), `stitchesToSkeins()` function
- **Missing edge tests**:
  - `stitchesToSkeins(0, ...)` → should return 0, not throw
  - `stitchesToSkeins(-1, ...)` → should handle gracefully
  - `stitchesToSkeins(n, 0, ...)` → potential divide-by-zero (fabric count 0)
  - Very large stitch counts (>1,000,000) → no overflow
- **Existing tests are strong but don't cover negative/zero fabric count.**

## Most Likely Surviving Mutations (High Risk)

Based on code review, these mutations would likely not be caught by existing tests:

1. **Off-by-one in doDither** — `< h-1` vs `< h` boundary check in error diffusion loop
2. **Floor vs Round** in `gridCoord` — `Math.floor` vs `Math.round` produces different grid alignment
3. **Arithmetic sign** in Floyd-Steinberg coefficients — `7/16` could become `-7/16`
4. **k-means convergence threshold** — `EPSILON = 1.0` could become `10.0` without test failure
5. **Skein waste factor** — waste multiplier dropped without numeric test
6. **Backstitch >= vs >** boundary (identified in E-13) — not caught by any test

## TODO — Priority-Ordered Fix List

1. **[HIGH] Add property tests for gridCoord()** in [helpers.js](../helpers.js): identity, inverse, boundedness, zero-guard. This is the most uncovered critical path.
2. **[HIGH] Add property tests for doDither()**: output length invariant, valid-palette-entry invariant, determinism.
3. **[HIGH] Add output-size tests for quantize()**: input 40×40 image → output 1600 cells.
4. **[MEDIUM] Add dE2 property tests**: commutativity, reflexivity, triangle inequality.
5. **[MEDIUM] Add round-trip tests for OXS/JSON import-export**.
6. **[MEDIUM] Expand stitchesToSkeins tests** for invalid inputs: zero/negative stitch count, zero fabric count.
7. **[LOW] Add parseHexColor round-trip tests**.
