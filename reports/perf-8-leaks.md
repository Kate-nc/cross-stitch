# Perf Audit 8 — Leak patterns and unbounded growth

13 items (8 critical, 5 moderate). Verified healthy: toast.js, dE2000Cache (FIFO 5000), ResizeObservers cleaned, sw.js evicts old caches, useEditHistory capped.

---

## 1. embroidery.js keydown/keyup listeners not cleaned 🔴
**File:** embroidery.js (#1058)
**Problem:** Handler stacks on mode switch.
**Fix:** Track and remove on cleanup.

## 2. Tracker WakeLock release listener not cleaned on error 🔴
**File:** tracker-app.js (#572)
**Fix:** Remove listener in catch and on unmount.

## 3. command-palette module-level keydown stacks across SPA reloads 🔴
**File:** command-palette.js (#545–559)
**Fix:** Init guard / single registration.

## 4. statsSessions array unbounded 🔴
**File:** tracker-app.js (#4558)
**Fix:** Cap or roll-up older sessions to monthly aggregates.

## 5. doneSnapshots unbounded (daily backups) 🔴
**File:** tracker-app.js (#4852)
**Fix:** Keep last N (e.g. 14); evict older.

## 6. recDismissed Set grows without bound 🔴
**File:** tracker-app.js (#800)
**Fix:** Cap size with FIFO eviction.

## 7. help-drawer subscribers not cleaned on unmount 🔴
**File:** help-drawer.js (#368)
**Fix:** Return unsubscribe in useEffect.

## 8. command-palette overlay/dialog DOM nodes leak 🔴
**File:** command-palette.js (#316–339)
**Fix:** Remove on close.

## 9. breadcrumbs array unbounded 🟡
**File:** tracker-app.js (#1000)
**Fix:** Cap N=50.

## 10. dE2000 cache evicts only 1 entry 🟡
**File:** colour-utils.js (#1436)
**Fix:** Evict batch when cap hit.

## 11. ScrollListener timeouts not cleared on all paths 🟡
**File:** tracker-app.js (#623–670)
**Fix:** Single cleanup function in useEffect return.

## 12. analysisWorker never terminated on error 🟡
**File:** tracker-app.js (#1265)
**Fix:** terminate() in catch and on unmount.

## 13. Legacy auto_save IDB key never pruned 🟡
**File:** project-storage.js (#335)
**Fix:** Delete on first new project save.
