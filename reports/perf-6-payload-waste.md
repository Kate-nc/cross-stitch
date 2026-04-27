# Perf Audit 6 — Payload and serialization waste

12 findings (3 critical, 5 high, 4 medium).

---

## 1. CDN URLs in service-worker precache 🔴
**File:** sw.js (#3–29)
**Problem:** React/Babel/pdf-lib/pako precached (~1.3 MB).
**Fix:** Remove from PRECACHE_URLS; rely on runtime fetch + cache.

## 2. Full project written to IDB on every autosave 🔴
**File:** project-storage.js (#220–260), creator/useProjectIO.js (#90–150)
**Problem:** ~40KB JSON written across 3 stores per autosave tick.
**Fix:** Field-level update API; batch metadata rebuilds; debounce coalesce.

## 3. Stats summary duplicates sessions array + palette RGB 🔴
**File:** project-storage.js (#26–50)
**Problem:** `statsSessions` and `palette.rgb` carried in summary store.
**Fix:** Strip sessions; drop rgb (lookup from DMC).

## 4. RGB per cell on save (deferred-1 status) 🟡
**File:** helpers.js (#1282–1360)
**Fix:** Verify `PERF_FLAGS.stripRgbOnSave` enabled; measure savings; tests.

## 5. Backup compression default state 🟡
**File:** backup-restore.js (#10–120)
**Fix:** Confirm `compressedBackups` flag default; remove flag if stable.

## 6. PDF worker transferables 🟡
**File:** pdf-export-worker.js (#80–130)
**Fix:** Verify `transferablePdfResult` flag default; remove if stable.

## 7. Generate-worker mapped[] return is JS objects 🟡
**File:** generate-worker.js (#20–50), creator-main.js (#118)
**Problem:** ~250k objects serialised per 500×500 generation.
**Fix:** Return Uint32 ID array + palette; reconstruct on main.

## 8. Analysis-worker per-stitch result objects 🟡
**File:** analysis-worker.js (#1–50), tracker-app.js (#1513)
**Fix:** Typed arrays for distances/labels; sparse for empty regions.

## 9. embroidery.html in precache 🟡
**File:** sw.js (#10)
**Fix:** Remove (experimental page).

## 10. Creator bundle dead-code audit 🟢
**File:** creator/bundle.js (~420 KB)
**Fix:** Tree-shake / lazy-split MagicWand / Embroidery.

## 11. palette-swap colour conversion duplication 🟢
**File:** palette-swap.js (#1–50)
**Fix:** Consolidate with colour-utils where identical.

## 12. Sync fingerprint full pattern string 🟢
**File:** sync-engine.js (#50–100)
**Fix:** Streaming hash via crypto.subtle.digest.
