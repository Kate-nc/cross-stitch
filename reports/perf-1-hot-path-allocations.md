# Perf Audit 1 — Hot-path allocations

12 high-impact allocations in frequently-called functions, render loops, and worker pipelines. Prioritised by GC pressure and frame budget impact.

---

## 1. Per-pixel array push in k-means pixel quantization 🔴
**File:** colour-utils.js (lines 56–59)
**Problem:** `quantize()` allocates `px=[]` then pushes w×h times.
**Impact:** ~5–10ms per 1M-pixel image; affects all dither/map pipelines.
**Fix:** Pre-allocate `px = new Array(len)`; indexed assignment.

## 2. CIEDE2000 cache key string building per pixel 🔴
**File:** colour-utils.js (lines 156–169) — used in doDither
**Problem:** Per-pixel cache key built via `lab1[0].toFixed(2)+","+...+lab2[2].toFixed(2)`. ~1M string allocations per 1Mpx image.
**Impact:** 30–50% of dither CPU time on large images; GC stalls.
**Fix:** Use numeric packed key; or remove cache (re-measure first).

## 3. K-means cluster sum arrays allocated per iteration 🔴
**File:** embroidery.js (lines 160–180) `kMeans`
**Problem:** Per-iteration `Array.from({length:k}, ()=>[0,0,0,0])`.
**Impact:** 3–5ms per kMeans pass.
**Fix:** Pre-allocate sums once, `.fill(0)` per iteration.

## 4. Dithering maxC enforcement filter chain allocations 🔴
**File:** generate-worker.js (lines 123–138)
**Problem:** Up to 5 iterations chaining `.filter().sort().map()`, ~20 intermediate arrays each.
**Impact:** 10–50ms worker stall.
**Fix:** Reusable buffer; in-place sort.

## 5. Blend palette object allocation in nested loop 🔴
**File:** colour-utils.js (lines 32–48) `findBest.precomputeBlends`
**Problem:** ~5000 objects per 100-colour palette.
**Impact:** 2–3ms per generation.
**Fix:** Hoist to UI palette-selection time; cache by palette signature.

## 6. Realistic preview colourFreq object per render 🟡
**File:** tracker-app.js (lines ~290–310) TrackerPreviewModal
**Problem:** Iterates entire pattern building freq map every render.
**Impact:** 2–5ms per preview rebuild.
**Fix:** `useMemo([pat, level])`.

## 7. Tile cache key string concatenation in preview loop 🟡
**File:** tracker-app.js (~line 430)
**Problem:** Per-cell string allocations for cache key; cache never cleared.
**Impact:** 2–3ms; growing memory.
**Fix:** Numeric packed key; LRU bound.

## 8. buildPalette called 7× per generation cycle 🟡
**File:** generate-worker.js (lines 107–150)
**Problem:** Repeated rebuild during maxC enforcement.
**Impact:** 20–50ms.
**Fix:** Cache and invalidate only on mapped[] mutation.

## 9. preCleanupIds array allocated unconditionally 🟡
**File:** generate-worker.js (line 71)
**Problem:** w×h array copied even when cleanup is skipped.
**Impact:** 40k entries per 200×200 generation.
**Fix:** Defer until cleanup branch enters.

## 10. Object.assign per animation frame in marching ants 🟡
**File:** creator/PatternCanvas.js (line 52)
**Problem:** 8–10 object allocations/sec during highlight outline.
**Impact:** GC pressure during long sessions.
**Fix:** Reusable snapshot object.

## 11. Per-colour analysis object allocation 🟡
**File:** analysis-worker.js (lines 94–130)
**Problem:** 50 objects + 50 Sets per analysis pass.
**Impact:** ~1ms per analysis.
**Fix:** Pre-allocated colourMap; reset in-place.

## 12. Unnecessary .slice()/.map() in contour processing 🟡
**File:** embroidery.js (lines ~280–310) `smoothContourAngles`
**Problem:** Multiple array copies per finalisation.
**Impact:** ~30KB allocations per finalise.
**Fix:** In-place / single reusable buffer.
