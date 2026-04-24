# Performance Audit 7: Missing Early Exits and Short-Circuits

Performance issues where functions perform expensive operations before cheap precondition checks, or walk data structures multiple times instead of single fused passes.

---

### 🔴 1. `colour-utils.js` `findSolid()` — no early rejection threshold
**File:** [colour-utils.js](colour-utils.js#L1)
**Problem:** Loops the entire DMC palette computing `dE2` for every thread, even when distance is already imperceptible.
**Fix:** Early return when `d < ~2.25` (ΔE² perceptual threshold).

### 🔴 2. `colour-utils.js` `quantize()` — triple-nested loop with redundant reductions
**File:** [colour-utils.js](colour-utils.js#L60) — Lines 60–115
**Fix:** (a) Sum & count during assignment pass instead of re-reducing; (b) break early when centroid movement < threshold; (c) fuse channel reductions.

### 🟡 3. `colour-utils.js` `doDither()` — palette loop without early rejection in confetti penalty check
**File:** [colour-utils.js](colour-utils.js#L196) — Lines 196–210
**Fix:** `break` when penalty satisfies threshold.

### 🟡 4. `import-formats.js` `detectImportFormat()` — duplicated extension/MIME checks
**File:** [import-formats.js](import-formats.js#L34) — Lines 34–50
**Fix:** Single early-return chain.

### 🟡 5. `command-palette.js` `filterAndSort()` — evaluates all actions before filtering by score
**File:** [command-palette.js](command-palette.js#L246) — Lines 246–258
**Fix:** Skip `s === 0` results before push.

### 🟡 6. `tracker-app.js` — four individual localStorage writers instead of batched
**File:** [tracker-app.js](tracker-app.js#L613) — Lines 613–616
**Fix:** Single useEffect with combined deps & one batched write.

### 🟡 7. `creator/LegendTab.js` & `creator/PrepareTab.js` — `useMemo(rows)` includes volatile `stash`
**Files:** [creator/LegendTab.js](creator/LegendTab.js#L24); [creator/PrepareTab.js](creator/PrepareTab.js#L38)
**Fix:** Memoise stash reference in context, or depend on a stable hash.

### 🟡 8. `creator/RealisticCanvas.js` & `creator/PreviewCanvas.js` — full canvas render regardless of visibility
**Files:** [creator/RealisticCanvas.js](creator/RealisticCanvas.js#L35); [creator/PreviewCanvas.js](creator/PreviewCanvas.js#L25)
**Fix:** Guard `if (app.tab !== 'preview') return;` at top of effect.

### 🟢 9. `creator/canvasRenderer.js` `_drawMarchingAnts()` — recomputes luminance every animation frame
**File:** [creator/canvasRenderer.js](creator/canvasRenderer.js#L300) — Lines 300–340
**Fix:** Cache luminance; recompute only when selection changes.

### 🟡 10. `stats-insights.js` — three independent reduce passes over sessions
**File:** [stats-insights.js](stats-insights.js#L142) — Lines 142–149
**Fix:** Fuse into a single reduce.

### 🟢 11. `tracker-app.js` `totalTime` — full reduce on every session change
**File:** [tracker-app.js](tracker-app.js#L503)
**Fix:** Maintain incrementally as state.
