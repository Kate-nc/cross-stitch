# Perf Audit 4 — Data structure mismatches

10 items. Biggest wins: DMC_BY_ID Map (#1), cached totalStitches (#2), usedThreads as Set (#3), useMemo quickWins (#4).

---

## 1. DMC.find() linear scans 🔴
**Files:** manager-app.js (#1453, #1549, #1558), pdf-importer.js (#804, #819), stash-bridge.js (#46), creator/bundle.js (#10331), manager-shopping.js (#28)
**Problem:** 700+ entries scanned per `.find(d=>d.id===x)`.
**Fix:** Module-load `const DMC_BY_ID = new Map(DMC.map(d=>[d.id,d]))`; replace all `.find()` with `.get()`.

## 2. pattern.filter() counts repeated 🔴
**Files:** project-storage.js (#19, #44, #634), tracker-app.js (#2863)
**Problem:** Full-pattern scans for non-skip count on every metadata build.
**Fix:** Cache `totalStitches` on save.

## 3. usedThreads.includes() on big arrays 🔴
**File:** modals.js (#121, #139)
**Fix:** `useMemo(()=>new Set(usedThreads),[usedThreads])`.

## 4. quickWins chain unmemoised 🔴
**File:** tracker-app.js (#1555)
**Fix:** Wrap in useMemo([pc]).

## 5. Object spreads for single-field updates 🟡
**Files:** tracker-app.js (#1483, #4258, #6146), embroidery.js (#1278)
**Fix:** Split state or scoped updates.

## 6. done.reduce O(n) every metadata build 🟡
**File:** project-storage.js (#21), creator/useCreatorState.js (#462)
**Fix:** Cache completedStitches; update atomically.

## 7. manager-shopping projectIds .indexOf() 🟡
**File:** manager-shopping.js (#82)
**Fix:** Use Set; convert to array on output.

## 8. JSON.parse(JSON.stringify) deep clone fallback 🟡
**File:** tracker-app.js (#8), sync-engine.js (#11)
**Fix:** Always use structuredClone; or shallow copy with typed array buffers.

## 9. id.indexOf('+') blend detection per cell 🟢
**Files:** helpers.js (#1263), manager-shopping.js (#64), modals.js
**Fix:** Cache blend Set per pattern load.

## 10. Object.values().filter().length for counts 🟢
**Files:** manager-app.js (#814), components.js (#881)
**Fix:** Use reduce-counter to skip intermediate array.
