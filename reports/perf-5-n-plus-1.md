# Perf Audit 5 — N+1 and batching opportunities

14 items. Biggest wins: batch markSynced (#1), parallel PDF page extraction (#2), DMC index lookup (#3).

---

## 1. Sequential IndexedDB gets in markSynced 🔴
**File:** project-storage.js (#155–180)
**Problem:** `for (id of ids) await get(id)` then sequential put per project (3 stores each).
**Fix:** `Promise.all` reads, then a single tx for all writes.

## 2. PDF page extraction sequential 🔴
**File:** pdf-importer.js (#109–160)
**Problem:** `await pdfData.getPage(i)` + getTextContent + getOperatorList per page sequentially.
**Impact:** 10-page PDF: 2–5s sequential vs 200–500ms parallel.
**Fix:** `Promise.all` for getPage; per-page `Promise.all([getTextContent, getOperatorList])`.

## 3. Linear DMC search in OXS import 🔴
**File:** import-formats.js (#195–230, #360–376)
**Problem:** Inline 500-entry loops with dE per pixel.
**Fix:** Reuse `findSolid()` (k-d tree / cached) from colour-utils.

## 4. Sequential localStorage writes in restore 🔴
**File:** backup-restore.js (#300–314)
**Fix:** Defer with rIC chunks (note: localStorage is sync — main benefit is yielding).

## 5. Manager unlinked patterns fetch 🟡
**File:** manager-app.js (#188–210) — already Promise.all per PERF note. Verify.

## 6. Brush canvas per-cell ctx state changes 🟡
**File:** creator/useCanvasInteraction.js (#127–240)
**Fix:** Batch fillStyle/strokeStyle outside inner loop; one save/restore pair.

## 7. getPresetById O(n) 🟡
**File:** palette-swap.js (#521–526)
**Fix:** Lazy Map.

## 8. Multiple setState per tool switch 🟡
**File:** creator/useCreatorState.js (#536–561)
**Note:** React 18 auto-batches in event handlers — verify these are not in async callbacks. If async, use unstable_batchedUpdates or consolidate.

## 9. Image pixel nested rgbToLab loop 🟡
**File:** import-formats.js (#360–376)
**Fix:** Pre-compute white-Lab once (already done?); consider block sampling for huge previews.

## 10. PDF op-list 20+ else-if dispatch 🟡
**File:** pdf-importer.js (#256–310)
**Fix:** Dispatch table keyed by op code.

## 11. Backup restore: opens DBs sequentially 🟢
**File:** backup-restore.js (#290–314)
**Fix:** Parallelise CrossStitchDB and stitch_manager_db.

## 12. dayKeys.indexOf per session in metadata 🟢
**File:** project-storage.js (#72–76)
**Fix:** Pre-build `dayKeyMap` object.

## 13. SW precache uses Promise.all 🟢 (already optimal — verified)

## 14. Marching ants full grid scan per frame 🟢
**File:** creator/canvasRenderer.js (#125–160)
**Fix:** Cache boundary segments; recompute on highlight change only.
