# Performance Report 3: Synchronous Blocking on Main Thread

CPU-intensive sync work that blocks UI/event loop and should be offloaded to Web Workers, chunked across rAF/idle callbacks, or streamed.

---

### 🔴 1. `JSON.parse` of huge cached project on tracker startup
**File:** [tracker-app.js](tracker-app.js#L2555) — Lines 2555–2625 (autosave/load path)
**Problem:** Full project (>500 KB stringified) parsed synchronously on the main thread on entry.
**Fix:** Defer with `requestIdleCallback`, or stream via the existing IndexedDB get + structured-clone path; avoid `JSON.parse` of localStorage fallback unless needed.

### 🔴 2. PDF export runs DMC font embed + chart layout on main thread
**File:** [creator/pdfExport.js](creator/pdfExport.js#L1), [pdf-export-worker.js](pdf-export-worker.js#L1)
**Problem:** Worker exists, but `pdfExport.js` posts the entire project synchronously and parses returned PDF bytes on main thread. For large patterns this is multi-second blocking.
**Fix:** Confirm worker handles bulk; transfer result as `Uint8Array` (transferable) and stream into Blob without intermediate copy.

### 🔴 3. `colour-utils.quantize()` and `doDither()` run on main thread for in-app palette swap
**Files:** [colour-utils.js](colour-utils.js#L60), [palette-swap.js](palette-swap.js#L1)
**Problem:** Generation worker already exists, but palette-swap calls quantise/dither directly on main thread.
**Fix:** Route through `generate-worker.js` (already imports colour-utils). Add a "swap" message type.

### 🔴 4. `backup-restore` reads/writes entire IndexedDB store sync into one giant string
**File:** [backup-restore.js](backup-restore.js#L19) — Lines 19–130
**Problem:** All projects loaded into memory then `JSON.stringify` blocks UI for seconds with large libraries.
**Fix:** Chunk/stream into a `Blob` builder; `await` between groups so the event loop can run.

### 🟡 5. `pdf-importer.js` parses pages synchronously
**File:** [pdf-importer.js](pdf-importer.js#L1)
**Problem:** PDF page → grid extraction is CPU-bound; performed in main thread.
**Fix:** Move to a worker (pdf.js already supports worker mode for raster decode).

### 🟡 6. `import-formats.js` `.oxs` XML parsed synchronously and walked twice
**File:** [import-formats.js](import-formats.js#L100) — Lines 100–200
**Fix:** Single-pass parse; chunk over `requestIdleCallback` for huge patterns.

### 🟡 7. `pako.deflate` on full pattern hash every save in sync-engine
**File:** [sync-engine.js](sync-engine.js#L78)
**Problem:** Deflate of multi-MB string blocks main thread.
**Fix:** Use a tiny rolling-hash (FNV-1a / xxhash) on cells; reserve deflate for actual export.

### 🟡 8. `analysis-worker.js` results converted via `Array.from()` on main thread
**File:** [analysis-worker.js](analysis-worker.js#L116)
**Fix:** Keep typed arrays; transfer with `[buffer]`.

### 🟡 9. `ProjectStorage.save` synchronously serialises full project + meta + summary
**File:** [project-storage.js](project-storage.js#L100) — Lines 100–200
**Fix:** Stage write in a separate microtask; let UI repaint first.

### 🟡 10. `command-palette.js` filtering scores all actions on each keystroke
**File:** [command-palette.js](command-palette.js#L246)
**Fix:** Debounce by 1 frame; cap to top-N early.

### 🟢 11. `embroidery.js` Canny / Sobel / bilateral filters block when re-running on user crop
**File:** [embroidery.js](embroidery.js#L26) — Lines 26–500
**Fix:** Already cacheable (`_wandEdgeCache`); ensure cache hits avoid recomputation. Consider OffscreenCanvas + worker.

### 🟢 12. `home-screen.js` startup awaits multiple sequential reads (covered in report 5) — parallelise
**Fix:** `Promise.all` across project list, settings, manager_state.
