# Payload & Serialization Waste Audit

## Summary
Identified 11 high-impact serialization bottlenecks across the PWA's persistence, worker, and backup pipelines. Primary patterns: redundant RGB arrays per stitch (duplicating palette lookups), saving entire 50–500KB projects on single-cell changes, JSON.stringify/parse cloning instead of `structuredClone`, uncompressed backups, and typed arrays converted to plain arrays during worker postMessage without transferable objects.

---

## Items (Prioritised)

### 🔴 1. Whole-project re-serialization on every stitch change
**Files:** [creator/useProjectIO.js](creator/useProjectIO.js#L35) — Lines 35–69; [tracker-app.js](tracker-app.js#L2555) — Lines 2555–2625
**Problem:** `buildSnapshot()` serialises the entire pattern array (50–500 KB) and `done` array on every keystroke. Tracker debounces 1s; Creator does not.
**Fix:** (1) Add 1.5s debounce to Creator. (2) Hash project content; skip save if unchanged. (3) Combine `saveProjectToDB` + `ProjectStorage.save` into one batched write.

### 🔴 2. Pattern array stores redundant `{ id, type, rgb }` per cell
**Files:** [creator/useProjectIO.js](creator/useProjectIO.js#L35) — Lines 35–50
**Problem:** RGB stored per cell duplicates palette data. 200×200 × 20-colour palette wastes ~240 KB.
**Fix:** Store `{ id, type }` only; build `paletteById` Map for renderers.

### 🔴 3. Backup is uncompressed JSON
**Files:** [backup-restore.js](backup-restore.js#L48) — Lines 48–130
**Problem:** Full backup uncompressed; pako already loaded.
**Fix:** `pako.deflate()` → base64 with magic-byte header `CSB_v1|`. 80–90% size reduction.

### 🔴 4. PDF export postMessage payload not transferable
**Files:** [creator/pdfExport.js](creator/pdfExport.js#L44); [pdf-export-worker.js](pdf-export-worker.js#L60)
**Problem:** Entire project posted to worker; ~500 KB serialise per 300×300 pattern.
**Fix:** Convert pattern to `Uint16Array` (palette index); transfer with `[buffer]`.

### 🟡 5. `JSON.stringify` → `JSON.parse` clones in handoff
**Files:** [tracker-app.js](tracker-app.js#L2588); [creator/useProjectIO.js](creator/useProjectIO.js#L150)
**Fix:** Use `structuredClone`.

### 🟡 6. analysis-worker converts typed arrays to plain arrays before postMessage
**Files:** [analysis-worker.js](analysis-worker.js#L116) — Lines 116–154
**Problem:** `Array.from(neighbourCounts)` etc. ~120 KB overhead/message.
**Fix:** Return typed arrays; transfer with `[buffer]`.

### 🟡 7. project-storage rebuilds summary/meta on every save
**Files:** [project-storage.js](project-storage.js#L38) — Lines 38–98
**Fix:** Cache `cachedSummary` on the project; rebuild only on palette/pattern change.

### 🟡 8. `sync-engine.js` `computeFingerprint()` deflates entire pattern string per save
**Files:** [sync-engine.js](sync-engine.js#L78) — Lines 78–126
**Fix:** Cache fingerprint; recompute only on palette/pattern edits.

### 🟡 9. URL-pattern compression only on localStorage failure
**Files:** [creator/useProjectIO.js](creator/useProjectIO.js#L158) — Lines 158–177
**Fix:** Compress preemptively for >500 KB patterns.

### 🟡 10. `stash-bridge.syncProjectToLibrary()` recomputes skein data each save
**Files:** [stash-bridge.js](stash-bridge.js#L250)
**Fix:** Cache skein data on project; recompute only when pattern/palette changes.

### 🟡 11. `backup-restore.readStore()` allocates entire library in RAM
**Files:** [backup-restore.js](backup-restore.js#L19) — Lines 19–42
**Fix:** Stream/chunk projects into Blob.

### 🟡 12. Cached creator bundle uncompressed in localStorage
**Files:** [index.html](index.html#L107)
**Fix:** `pako.deflate` cached bundle; ~60–80% saving.
