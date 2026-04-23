# Code Quality Audit: Edge Cases

## Summary

This audit examines boundary conditions, error paths, and data consistency issues across pattern generation, tracking, import/export, storage, and sync flows. **Found 40+ actionable items** ordered by likelihood × severity.

---

## 1. Pattern Dimensions & Composition

- [ ] **Empty pattern (w=0, h=0)** → `runGenerationPipeline`, `quantize`. Array length calculations produce undefined behavior; `quantize` may crash accessing `data[i*4]`. **Fix:** Early return in `runGenerationPipeline` if `sW <= 0 || sH <= 0`; add unit test.
- [ ] **1×1 pattern edge case** → builder/generate.js, tracker canvas rendering. Canvas zoom/pan unconstrained; half-stitch on single cell ambiguous. **Fix:** Special handling for patterns ≤ 4 cells.
- [ ] **Very large pattern (>500×500)** → canvas memory, runGenerationPipeline. Uint8ClampedArray ~4MB per 1000×1000; canvas may OOM. **Fix:** Cap `sW × sH` ≤ 2000; warn on >1000×1000; add test.
- [ ] **Pattern with only one colour** → colour-utils.js:quantize, analyse confetti. Blend precomputation runs even with 1 colour. **Fix:** Skip blend precompute if `palette.length < 2`.
- [ ] **Pattern with only blends** → doDither, cell mapping. doMap will not find fallback solids. **Fix:** Ensure buildPalette always includes ≥1 solid; validate palette in importResultToProject.
- [ ] **Pattern with only `__skip__` / `__empty__` cells** → tracker UI. Stats show 0 stitches; division-by-zero in trainer. **Fix:** Guard `if (totalSt === 0)` in tracker.

## 2. Half-Stitches & Partial Stitches

- [ ] **Half-stitch + full stitch on same cell** → tracker-app.js, done vs halfDone. Both set; no collision detection. **Fix:** If `done[idx] === 1`, prevent half-stitch add.
- [ ] **Undo with half-stitch state loss** → useEditHistory.js:undoEdit. psChanges restored without shape validation. **Fix:** Defensive shape check; warn and skip.
- [ ] **HalfDone array not initialized on v8 project load** → tracker-app.js init. Accessing halfDone[idx] throws if undefined. **Fix:** `if (!project.halfDone) project.halfDone = new Array(pattern.length).fill(0);`

## 3. Backstitch Lines

- [ ] **Zero-length backstitch line (x1===x2 && y1===y2)** → creator/canvasRenderer.js. May cause Bresenham loop. **Fix:** Ignore zero-length adds.
- [ ] **Out-of-bounds backstitch endpoints** → import-formats.js:parseOXS, PDF import. Stored coords are garbage. **Fix:** Clip/reject lines where `x > sW || y > sH`.
- [ ] **Backstitch line after crop** → state.bsLines mutation. Endpoints not recalculated. **Fix:** On crop, filter bsLines to endpoints inside new bounds.

## 4. Park Markers

- [ ] **Park marker on deleted cell after resize/crop** → parkMarkers array. UI tries to render outside grid. **Fix:** On crop, `parkMarkers.filter(m => m.x < newW && m.y < newH)`.
- [ ] **Park marker index off-by-one** → serialization / state load. Cell index vs grid coordinate mismatch. **Fix:** Normalize to `{x, y}` on load; validate bounds.

## 5. Schema Migrations

- [ ] **migrateSchemaToV3 not awaited (CRITICAL)** → stash-bridge.js, manager-app.js init. Bulk-add before migration completes; new threads lack v3 fields. **Fix:** Chain `migrateV2().then(() => migrateV3()).then(updateUI)`.
- [ ] **Project v8 missing optional fields** → tracker-app.js init. Undefined array access. **Fix:** Normalize on load (halfStitches, halfDone, parkMarkers default).
- [ ] **threadOwned mixed format (legacy "310" vs "dmc:310")** → stash persistence. Double-counting. **Fix:** Normalize on load; add migration test.
- [ ] **Partial halfDone array** → tracker-app.js state restoration. Out-of-range access undefined. **Fix:** `halfDone.length = pattern.length; halfDone.fill(0, oldLength)`.
- [ ] **Backup/restore doesn't reset migration markers** → backup-restore.js. Old schema_version copied to new device prevents migrations. **Fix:** On restore, remove migration markers + schema_version.

## 6. IndexedDB & Storage

- [ ] **Concurrent writes to projects + project_meta (CRITICAL)** → project-storage.js:save. Separate transactions can diverge. **Fix:** Single multi-store transaction.
- [ ] **localStorage quota exceeded during backup export** → backup-restore.js. Uncaught QuotaExceededError. **Fix:** try/catch; offer streaming download via Blob.
- [ ] **IndexedDB upgrade race when two tabs open** → project-storage.js:getDB. Race on version. **Fix:** Shared cache ref; `onblocked` listener; retry.
- [ ] **Project resurrection guard timing** → project-storage.js._deletedIds. Autosave can resurrect if check happens too late. **Fix:** Clear _deletedIds only on reload/close.

## 7. Image Import

- [ ] **Image decode error without onerror** → embroidery.js. Silent hang. **Fix:** Always assign `img.onerror`.
- [ ] **EXIF rotation not applied** → embroidery.js:handleFile. Pattern is skewed. **Fix:** Use rotation lib; or document limitation.
- [ ] **CMYK JPEG import** → colour shift during browser RGB conversion. **Fix:** Document; warn user.
- [ ] **Animated GIF (multi-frame)** → only first frame used. **Fix:** Document; or extract frame.
- [ ] **Oversized image (>10000×10000px)** → canvas OOM. **Fix:** Cap to 4000; offer downscale dialog.
- [ ] **Non-RGBA image format** → colour-utils.js:runCleanupPipeline. Code assumes 4-byte stride. **Fix:** Always go through canvas getImageData.
- [ ] **FileReader abort** → embroidery.js:handleFile. Stale state on cancel. **Fix:** Add `reader.onabort` cleanup.

## 8. PDF Import

- [ ] **Encrypted PDF** → pdf-importer.js:PdfLoader.load. Generic error. **Fix:** Catch PasswordException; prompt; retry.
- [ ] **Scanned (image-only) PDF** → pdf-importer.js:extractAllPages. PK extraction fails silently. **Fix:** Detect image-only; fall back to image import.
- [ ] **Multi-page PDF** → pdf-importer.js:import. Pages 2–N silently ignored. **Fix:** Prompt user; or import-all-as-gallery.
- [ ] **PDF with 0 pages** → loop exits silently with empty result. **Fix:** Throw if `numPages <= 0`.

## 9. Colour Quantization & Palette

- [ ] **Quantize returns empty palette** → creator/generate.js. Pipeline aborts; UI shows "generation failed". **Fix:** Fallback to 1-colour palette.
- [ ] **Palette swap collision (A→B, B→A)** → palette-swap.js:applyPaletteSwap. Order matters. **Fix:** Build swap map atomically; apply in single pass.
- [ ] **Palette swap source not in pattern** → no-op without feedback. **Fix:** Validate; show warning.
- [ ] **Blend ID formatting inconsistency ("310+550" vs "550+310")** → colour-utils.js:findBest. Same blend treated as different. **Fix:** Canonicalize sorted: `[a,b].sort().join('+')`.

## 10. Skein Math

- [ ] **NaN inputs to stitchesToSkeins** → threadCalc.js. Display shows "NaN skeins". **Fix:** Validate early; throw on NaN.
- [ ] **Negative or zero price** → manager stash. Total cost negative. **Fix:** Clamp `price < 0 → 0`; reject on input.
- [ ] **Math.ceil rounding edge case (0.0001 → 1)** → buy 1 full skein for 1 pixel. **Fix:** Add epsilon threshold.
- [ ] **Floating point precision in waste factor div** → ~0.5% discrepancy on large projects. **Fix:** Round to fixed precision.

## 11. React & Event Handling

- [ ] **Stale closure over `done` array in keyboard handler** → tracker-app.js, useCanvasInteraction.js. New marks lost. **Fix:** Correct useCallback deps or use ref.
- [ ] **Missing keys in React list render** → components.js:ColourProgress. Reorder breaks alignment. **Fix:** `key={p.id}` not `key={i}`.
- [ ] **Keyboard shortcut fires when input focused** → keyboard-utils.js. Tool activates while typing. **Fix:** Check `document.activeElement.tagName === 'INPUT'`.
- [ ] **IME composition events** → search/rename input. Half-formed characters saved. **Fix:** `if (e.isComposing) return;` use `compositionend`.

## 12. Canvas Rendering

- [ ] **Canvas at non-integer devicePixelRatio (1.5×)** → blurry grid. **Fix:** `canvas.width = W * dpr; ctx.scale(dpr, dpr);`
- [ ] **Very small viewport (<200px)** → canvas compressed unusably. **Fix:** Hide canvas/sidebar below threshold.
- [ ] **Very large pattern on low-end device** → frame rate drops; browser hangs. **Fix:** Dirty-rect culling or WebGL; cap live preview.

## 13. Sync & Concurrency

- [ ] **Clock skew in sync fingerprinting** → sync-engine.js:computeFingerprint. Time NOT used. **Fix:** Include `updatedAt`; lamport clock for causal order.
- [ ] **Simultaneous edits (deleted-then-recreated project)** → resurrection guard. B's new project overwritten by A's deletion. **Fix:** Include `createdAt`; skip deletion if newer.

## 14. Workers

- [ ] **Worker error not propagated to UI** → generate-worker.js, pdf-export-worker.js. Spinner hangs forever. **Fix:** Main thread `Promise.race(workerPromise, timeout)`.
- [ ] **Worker receives transferable buffer, retains reference** → corruption if main reuses. **Fix:** Document; test.
- [ ] **Worker terminate during in-flight message** → memory leak. **Fix:** Send graceful cancel first.

## 15. Backup & Restore

- [ ] **Restore over existing data (merge vs replace)** → backup-restore.js:restore. Replace-only behavior undocumented. **Fix:** Offer merge option; document.
- [ ] **Partial JSON in restore file** → JSON.parse throws generic error. **Fix:** Validate; show clear error.
- [ ] **Restore with missing databases** → null deref on missing stitch_manager_db. **Fix:** Guard each database key.

## 16. Stash & Thread Data

- [ ] **Mixed key formats (legacy "310" + composite "dmc:310") (CRITICAL)** → manager-app, stash-bridge. Inventory double-counts. **Fix:** Migrate on first read; validate format in setter.
- [ ] **Missing addedAt field on stash entries** → SABLE timeseries. NaN in stats. **Fix:** Default to LEGACY_EPOCH on read.
- [ ] **Partial history array** → stash-bridge.js, buildSableData. Sparse → UI crash. **Fix:** Fill missing dates; or skip.
- [ ] **Acquisition source not set** → stats bucket aggregation. Undefined group. **Fix:** Default to 'unknown'.

## 17. Import Formats

- [ ] **OXS with missing palette entries** → import-formats.js:parseOXS. Incorrect pattern. **Fix:** Warn; graceful fallback.
- [ ] **OXS with duplicate palette IDs** → cells map to different indices but render identical; stored separately. **Fix:** Deduplicate during import.
- [ ] **Malformed XML in OXS** → DOMParser returns parsererror doc; not checked. **Fix:** Check `doc.querySelector('parsererror')` and throw.
- [ ] **JSON import with missing required fields** → undefined .length crash. **Fix:** Validate `pattern` is an array.

## 18. Date & Time Handling

- [ ] **Date parsing edge case (pre-2020-01-01)** → LEGACY_EPOCH comparison. UI may not format nicely. **Fix:** Cap display: "Long ago" if >10y.
- [ ] **Invalid date in session history** → `new Date(invalidString)` returns NaN. **Fix:** Validate on load; drop invalid sessions.

---

## Research Needed

- Determine if devicePixelRatio caching needed for performance on high-DPI displays
- Profile memory usage of very large patterns (500×500+) with multiple undo states
- Test backup/restore atomicity with IndexedDB transactions interrupted by tab close
- Verify PDF.js worker path doesn't violate CSP in strict sandboxes
- Benchmark quantize algorithm with edge inputs (all same color, random noise)

---

## Implementation Priority

**Immediate (this sprint):**
- [ ] Empty pattern validation (`w=0, h=0`)
- [ ] Migration chaining (migrateV2 → migrateV3, return promise)
- [ ] Park marker clipping on crop
- [ ] React list keys (palette cards, sessions)

**Soon (next sprint):**
- [ ] Keystroke IME handling (`isComposing`)
- [ ] Input focus check for keyboard shortcuts
- [ ] Thread key format validation & normalization
- [ ] Canvas devicePixelRatio scaling

**Later (backlog):**
- [ ] Worker timeout + graceful cancellation
- [ ] PDF multi-page selection UI
- [ ] Encrypted PDF password prompt
- [ ] Backup merge vs replace mode
