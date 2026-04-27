# Perf Audit 7 — Missing early exits and short-circuits

12 items. Estimated 50–200ms reduction per interaction on large patterns.

---

## 1. embroidery.js double-filter on adjacency list 🔴
**File:** embroidery.js (~480)
**Problem:** Two-pass filter where one fused pass + `break` would suffice.
**Impact:** 50–100ms per image.
**Fix:** Fuse into single loop with early break.

## 2. doDither confetti penalty: skips blend short-circuit 🔴
**File:** colour-utils.js (doDither)
**Problem:** Penalty loop runs through whole palette even when first acceptable neighbour already meets threshold.
**Fix:** `break` once threshold satisfied (behaviour-preserving in confetti-only context — verify visual diff).

## 3. useEditHistory rebuilds palette every undo/redo 🟡
**File:** creator/useEditHistory.js
**Fix:** Diff-only palette delta; skip when palette unchanged.

## 4. useMagicWand colour reduction O(N²) without early-out 🟡
**File:** creator/useMagicWand.js
**Fix:** Skip already-grouped pixels; visited Set early-return.

## 5. useLassoSelect A* doesn't terminate on visited 🟠
**File:** creator/useLassoSelect.js
**Fix:** Visited Set guard.

## 6. tracker-app filter/map/sort/slice chains 🟡
**File:** tracker-app.js
**Fix:** Fuse passes; single sort with early `.slice(0,k)` (top-K via partial sort).

## 7. canvasRenderer marching ants drawn twice per frame 🟠
**File:** creator/canvasRenderer.js
**Fix:** Single pass with offset for dash phase.

## 8. sw.js network-first on nav (slow networks) 🟠
**File:** sw.js
**Fix:** Cache-first with stale-while-revalidate for navigations.

## 9. sw.js always revalidates 🟠
**File:** sw.js
**Fix:** ETag/version-tagged cache; skip revalidate if fresh.

## 10. insights-engine recomputes when no relevant fields changed 🟢
**File:** insights-engine.js
**Fix:** Hash inputs; skip if unchanged.

## 11. canvas redraw without dirty check 🟢
**File:** creator/canvasRenderer.js
**Fix:** Compare last-draw signature.

## 12. palette-swap rebuilds preview when only label changes 🟢
**File:** palette-swap.js
**Fix:** Guard recompute on relevant deps only.
