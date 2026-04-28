# Perf Audit 3 — Synchronous blocking on the main thread

15 items. Estimated total improvement: 500–2000 ms freed from main thread on typical workflows (sync, export, pattern creation).

---

## 1. pako deflate/inflate on entire projects 🔴
**File:** sync-engine.js (~230–270), backup-restore.js (~64–120), creator/useProjectIO.js (~175–185)
**Problem:** Synchronous `pako.deflate()` on 10–50 MB blobs.
**Impact:** 100–1000ms freeze on every save/export/sync/backup.
**Fix:** Move to a deflate-worker.js; or chunk via setTimeout(0) yields.

## 2. JSON.stringify on whole project 🔴
**File:** sync-engine.js (~230), backup-restore.js (~89), project-storage.js (~755)
**Problem:** Full pattern serialised synchronously.
**Impact:** 50–500 ms before deflate even starts.
**Fix:** Stream via rIC chunks or worker.

## 3. Bilateral filter on main thread 🔴
**File:** embroidery.js (~345–420)
**Problem:** O(N·R²) triple loop without yield.
**Impact:** 500–2000ms freeze on auto-segment.
**Fix:** Move to generate-worker.js; rIC per scanline.

## 4. Canny edge detection on main thread 🔴
**File:** embroidery.js (~420–520)
**Impact:** 300–800ms freeze.
**Fix:** Move to worker.

## 5. SLIC superpixel segmentation 🔴
**File:** embroidery.js (~540–750)
**Impact:** 1000+ ms.
**Fix:** Move whole pipeline to worker with progress callback.

## 6. Morphological operations 🔴
**File:** embroidery.js (~350–370), colour-utils.js (~730–780)
**Impact:** 100–300ms each, called multiple times per segmentation.
**Fix:** Streaming with rIC or worker.

## 7. Auto-snapshot deflate in tracker on stitch event 🔴
**File:** tracker-app.js (~1443–1480)
**Problem:** `pako.deflate(done)` synchronously in useEffect after a click.
**Impact:** 100–500ms stall mid-stitch.
**Fix:** Debounce 2s + worker.

## 8. Project load JSON.parse on main thread 🔴
**File:** project-storage.js (~750–770)
**Impact:** 50–200ms per project open.
**Fix:** Worker-parse if size > 100 KB.

## 9. Tracker full-grid re-render on cell click 🟡
**File:** tracker-app.js (~400–600)
**Impact:** 50–200ms per stitch click on large grids.
**Fix:** Patch only changed cells.

## 10. Int8Array allocation per state update 🟡
**File:** tracker-app.js (~50–100)
**Fix:** Structural sharing or buffer reuse.

## 11. URL-hash pattern handoff deflate on main thread 🟡
**File:** creator/useProjectIO.js (~175–190)
**Fix:** Worker-based compression for handoff.

## 12. Sync fingerprint deflate per project 🟡
**File:** sync-engine.js (~100–130)
**Fix:** Cache fingerprint in metadata; recompute only on change.

## 13. Backup restore FileReader + sync inflate 🟢
**File:** backup-restore.js (~150–200)
**Fix:** Streaming readAsArrayBuffer + worker inflate.

## 14. Symbol font subset build per export 🟢
**File:** creator/pdfChartLayout.js (~200–250)
**Fix:** Cache by palette.

## 15. Insights recomputed every panel open 🟢
**File:** insights-engine.js (~40–100)
**Fix:** Memoise by (projectId, sessionCount, today).
