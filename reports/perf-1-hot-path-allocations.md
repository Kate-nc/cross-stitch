# Performance Report 1: Hot-Path Allocations

Allocations inside loops, render paths, and per-cell iteration that should be hoisted, pooled, or reused.

---

### 🔴 1. `findSolid()` returns a fresh object literal per call
**File:** [colour-utils.js](colour-utils.js#L1)
**Problem:** Every pixel match allocates `{type, id, name, rgb, lab, dist}`. With 100×100 patterns × dithering, that's 40k+ short-lived objects per generation pass.
**Fix:** Return a reused scratch object, or return only the index into the palette array; let callers read fields by index.

### 🔴 2. `quantize()` builds `[lab,...]` + `cl = cs.map(()=>[])` allocations every k-means iteration
**File:** [colour-utils.js](colour-utils.js#L60) — Lines 60–115
**Problem:** Each of 20 iterations allocates `cs.length` empty arrays, plus pushes lab triples. For 1024² image × 20 it × 16 clusters: ~320k array allocations + millions of pushes.
**Fix:** Maintain `clusterSums` (Float64Array of 3*n), `clusterCounts` (Uint32Array). Compute centroid from sums/count without intermediate arrays.

### 🔴 3. `doDither()` allocates `Set` per pixel for neighbour IDs
**File:** [colour-utils.js](colour-utils.js#L160) — Lines ~175–195
**Problem:** `const neighborIds = new Set()` allocated per pixel — 10k–1M Set objects per dither pass.
**Fix:** Use 4 local string variables or a reused Set cleared each iteration. Better: small array since at most 4 IDs.

### 🟡 4. `quantize()` `rgbToLab` triple-array per pixel; entire `px` array of arrays
**File:** [colour-utils.js](colour-utils.js#L65) — Lines 65–69
**Problem:** `px.push(rgbToLab(...))` allocates one 3-element array per pixel (1M for 1024²).
**Fix:** Pack into `Float32Array(N*3)` and index by `i*3`.

### 🟡 5. `PatternCanvas` rebuilds merged `ctxRef.current` snapshot every render
**File:** [creator/PatternCanvas.js](creator/PatternCanvas.js#L25) — Line 25
**Problem:** `Object.assign({}, ctx, cv, gen, {...})` runs on every render, allocating a large object that holds refs to every state value.
**Fix:** Mutate `ctxRef.current` properties in place; only allocate when reference identity matters.

### 🟡 6. `_resolveHighlight()` allocates options object per draw call
**File:** [creator/canvasRenderer.js](creator/canvasRenderer.js#L51) — Lines 51–75
**Problem:** Returns a fresh object every cell draw chain. `_hexToRgba` + `_hexToRgbArr` also re-parse the same hex string per call.
**Fix:** Cache by state hash; memoise hex→rgba conversions.

### 🟡 7. `LegendTab` rebuilds `Intl.Collator` per render
**File:** [creator/LegendTab.js](creator/LegendTab.js#L57) — Line 57
**Problem:** `var threadIdCollator = new Intl.Collator(...)` allocates a new collator on every render.
**Fix:** Hoist to module scope.

### 🟡 8. Tracker localStorage `useEffect`s allocate string per write
**File:** [tracker-app.js](tracker-app.js#L613) — Lines 613–625
**Problem:** Many tiny `localStorage.setItem` calls (8+) on every dependency change; each does a full sync write.
**Fix:** Batch writes into one effect; use UserPrefs in-memory + debounced flush.

### 🟡 9. `findBest()` builds a result object per pixel even when solid
**File:** [colour-utils.js](colour-utils.js#L2) — Lines 2–28
**Problem:** Allocates blend-result object literal per blend pixel.
**Fix:** Use a returned tuple/typed packed result; or cache last-pixel result.

### 🟢 10. `gridCoord()` returns `{gx,gy}` per pointer event
**File:** [helpers.js](helpers.js#L52) — Line 52
**Problem:** Mouse-move at 60 Hz allocates 60 objects/sec.
**Fix:** Reuse a single scratch object or return a packed integer.

### 🟢 11. `confettiTier()` returns fresh object every call
**File:** [helpers.js](helpers.js#L37) — Lines 37–43
**Fix:** Hoist tier objects to module-level constants.

### 🟢 12. `calcDifficulty()` returns fresh object per call
**File:** [helpers.js](helpers.js#L62) — Lines 62–73
**Fix:** Hoist tier objects to module-level constants.

### 🟢 13. `import-formats.js` builds many intermediate arrays per parsed cell
**File:** [import-formats.js](import-formats.js#L150) — Lines 150–170
**Fix:** Pre-allocate result arrays once total cell count is known.
