# Performance Audit: Leak Patterns and Unbounded Growth

**Focus:** Memory leaks, unbounded caches, timer cleanup, event-listener hygiene.

---

### 🔴 1. Insights / Activity lazy-load interval can stack
**File:** [stats-page.js](stats-page.js#L1014) — Lines 1014–1025
**Problem:** useEffect spawns a `setInterval(50ms)` every time deps re-fire. Cleanup runs only on next effect run. Tab spam = multiple zombie intervals.
**Fix:** Use a ref guard so only one poll exists per tab.

### 🔴 2. Embroidery module-level edge cache never cleared
**File:** [embroidery.js](embroidery.js#L26) — Lines 26–31
**Problem:** `_wandEdgeCache` and `_lassoCostCache` hold full-resolution Float32Arrays that persist across image loads (~8 MB/image).
**Fix:** Export `clearEmbroideryCache()`; call it on new-image load.

### 🔴 3. `ProjectStorage._deletedIds` never resets
**File:** [project-storage.js](project-storage.js#L191), [project-storage.js](project-storage.js#L325)
**Problem:** Set accumulates deleted IDs forever per session.
**Fix:** Persist tombstones to IndexedDB or clear on `beforeunload`.

### 🟡 4. ΔE2000 cache unbounded
**File:** [colour-utils.js](colour-utils.js#L1303) — Lines 1303–1307
**Problem:** Plain object cache grows monotonically as new Lab pairs are compared.
**Fix:** LRU/size cap (~5000 entries).

### 🟡 5. Toast queue unbounded
**File:** [toast.js](toast.js#L73) — Lines 73, 80–100
**Fix:** Cap queued toasts (e.g. 50), drop oldest.

### 🟡 6. Command-palette cached project list never invalidated
**File:** [command-palette.js](command-palette.js#L181) — Lines 181–212
**Fix:** Listen for `cs:projectsChanged` and clear cache; or add TTL.

### 🟡 7. Service-worker register interval lacks cleanup
**File:** [sw-register.js](sw-register.js#L7)
**Fix:** Save interval ID and clear on `beforeunload`.

### 🟡 8. Edit history redo array can briefly exceed cap
**File:** [creator/useEditHistory.js](creator/useEditHistory.js#L65)
**Fix:** Symmetric cap on redo stack.

### 🟡 9. Onboarding interval not guarded
**File:** [onboarding.js](onboarding.js#L577) — Lines 577–578
**Fix:** Ref guard pattern.
