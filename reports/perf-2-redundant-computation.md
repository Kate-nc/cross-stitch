# Performance Report 2: Redundant / Repeated Computation

Computations recalculated every call/render that could be memoised, cached, or hoisted.

---

### 🔴 1. `Intl.Collator` recreated per render in LegendTab
**File:** [creator/LegendTab.js](creator/LegendTab.js#L57)
**Problem:** `new Intl.Collator(...)` allocated and configured on every render.
**Fix:** Hoist to module scope; reuse forever.

### 🔴 2. Per-pixel `rgbToLab()` redundant for repeated colours during mapping/dither
**File:** [colour-utils.js](colour-utils.js#L60), [colour-utils.js](colour-utils.js#L210)
**Problem:** `doDither` calls `rgbToLab` once per pixel; `doMap` already caches by RGB key — `doDither` should too.
**Fix:** Add `Map<rgbKey, lab>` cache shared across passes.

### 🔴 3. DMC palette scanned by `.find()` in import & stash-bridge — no Map
**Files:** [import-formats.js](import-formats.js#L153), [stash-bridge.js](stash-bridge.js#L35), [creator/ConvertPaletteModal.js](creator/ConvertPaletteModal.js#L65)
**Note:** `helpers.js` already exposes `_getDmcById()`/`_getAnchorById()` lazy maps — these consumers don't use them.
**Fix:** Consume the lazy DMC-by-id map; remove ad-hoc finds.

### 🔴 4. `findBest.precomputeBlends()` runs per-call but redoes work for same palette
**File:** [colour-utils.js](colour-utils.js#L30)
**Problem:** Called from `doDither` start; if user dithers same palette twice, recomputes all blend pairs.
**Fix:** Already keyed on `_blendPalette` reference — but the reference resets on every quant. Cache by palette id list / hash.

### 🟡 5. `LegendTab.rows` useMemo re-runs whenever `stash` reference changes
**File:** [creator/LegendTab.js](creator/LegendTab.js#L24)
**Fix:** Memoise the relevant slice of stash inside the context, or depend on a stable stash signature.

### 🟡 6. `tracker-app.js` `totalTime` reduces all sessions on every change
**File:** [tracker-app.js](tracker-app.js#L503)
**Fix:** Maintain incrementally.

### 🟡 7. `stats-insights.js` walks sessions array three times for stitches/seconds/days
**File:** [stats-insights.js](stats-insights.js#L142)
**Fix:** Single fused reduce.

### 🟡 8. `project-storage.js` rebuilds stats summary + meta on every save
**File:** [project-storage.js](project-storage.js#L38) — Lines 38–98
**Fix:** Cache summary on project; rebuild on palette/pattern change only.

### 🟡 9. `sync-engine.js` fingerprints (deflate of full pattern string) on every save
**File:** [sync-engine.js](sync-engine.js#L78) — Lines 78–126
**Fix:** Cache fingerprint; recompute only on chart edit.

### 🟡 10. `command-palette.js` actions + project list rebuilt on every keystroke
**File:** [command-palette.js](command-palette.js#L181) — Lines 181–250
**Fix:** Memoise actions array; cache project list with TTL invalidation.

### 🟡 11. `_hexToRgbArr`/`_hexToRgba` re-parse same hex per cell draw
**File:** [creator/canvasRenderer.js](creator/canvasRenderer.js#L23)
**Fix:** Memoise (small Map keyed on hex string).

### 🟢 12. `confettiTier`, `calcDifficulty` — branches and object literals could be table lookups
**File:** [helpers.js](helpers.js#L37), [helpers.js](helpers.js#L62)
**Fix:** Hoist constant tier objects; do a single threshold lookup.

### 🟢 13. `home-screen.js` recomputes derived stats on every render
**Fix:** Wrap derived sums in `useMemo`.
