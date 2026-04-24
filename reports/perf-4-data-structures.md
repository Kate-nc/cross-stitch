# Performance Report: Data Structure Mismatches

**Category:** O(n) linear scans in hot paths where O(1) lookups are possible; unnecessary deep clones and object spreads; missed opportunities for structural sharing.

**Impact:** Pattern generation, image quantization, import/export, and state mutations slow down with palette size and project complexity.

---

## Critical Issues (🔴)

### 1. **DMC palette linear scan on every colour match**
- **File:** [colour-utils.js](colour-utils.js#L1) — Lines 1–2, 30–47
- **Priority:** 🔴
- **Problem:** `findSolid()` and `findBest()` iterate through the entire DMC palette for every colour match. Called thousands of times during quantisation/dithering (436 colours × 10,000+ pixels = 4M+ iterations per generation).
- **Why it hurts:** Linear O(n) lookup per pixel; degrades with custom palette size.
- **Fix:** Build `Map<paletteId, entry>` at quantisation start; cache pre-computed blends in a Map instead of recomputing.

### 2. **Import parsers repeatedly `.find()` on DMC array**
- **File:** [import-formats.js](import-formats.js#L153) — Lines 153, 158
- **Priority:** 🔴
- **Problem:** `DMC.find(d => d.id.toLowerCase() === ...)` called for every thread in an imported pattern. 1000-stitch pattern × 20 colours = 1000 finds; 10 patterns/session = 10k finds.
- **Why it hurts:** O(n) per thread ID during import parsing.
- **Fix:** Build a Map once at import start: `new Map(DMC.map(d => [d.id.toLowerCase(), d]))` and reuse.

### 3. **ConvertPaletteModal multiple `.find()` on DMC in hot loop**
- **File:** [creator/ConvertPaletteModal.js](creator/ConvertPaletteModal.js#L65) — Lines 65, 191–192
- **Priority:** 🔴
- **Problem:** `srcArr.find()` and `tgtArr.find()` called per source thread. Modal interaction (keystroke) re-renders 20+ rows × 2 finds = 40+ linear scans per keystroke.
- **Why it hurts:** Modal becomes sluggish during palette conversion.
- **Fix:** Pre-compute `srcMap = new Map(srcArr.map(t => [t.id, t]))` at component mount; use `srcMap.get(id)`.

### 4. **`JSON.parse(JSON.stringify())` deep clones in tracker state snapshots**
- **File:** [tracker-app.js](tracker-app.js#L2096) — Lines 2096–2188, 4219
- **Priority:** 🔴
- **Problem:** Full deep clones of `pal`, `threadOwned`, `newPal` on every colour reassignment/session end. Large pattern (10k+ stitches × 50 colours) = 100+ ms per clone; user reassigns one colour = 3 full clones.
- **Why it hurts:** GC pressure; UI stalls; multiple clones in sequence compound delay.
- **Fix:** Use `Object.assign({}, pal)` for shallow clone if nested objects aren't mutated. For deep clone, implement structural sharing or copy only changed paths.

---

## Moderate Issues (🟡)

### 5. **Object spread for single-field updates in React state**
- **File:** [tracker-app.js](tracker-app.js#L2113) — Lines 2113–2122
- **Priority:** 🟡
- **Problem:** `pat.map(cell => ({ ...cell, id: newThread.id, ... }))` spreads the entire cell object for a single-field update. 100×100 pattern = 10k new object allocations.
- **Why it hurts:** Memory bloat; GC pressure on large patterns.
- **Fix:** Mutate-in-place where safe, or only spread changed fields.

### 6. **Repeated array spread operations in embroidery.js setState**
- **File:** [embroidery.js](embroidery.js#L899) — Lines 899, 929, 956, 1130, 1143, 1168–1169
- **Priority:** 🟡
- **Problem:** `setRegions(p => [...p, newRegion])` called in succession = 50 full array copies for adding 50 regions.
- **Why it hurts:** UI sluggish during bulk region operations.
- **Fix:** Use `slice()` + `push()` builder, or batch additions before setState.

### 7. **Backup/Restore `.find()` on `manager_state` array**
- **File:** [backup-restore.js](backup-restore.js#L159) — Lines 159, 165, 237
- **Priority:** 🟡
- **Problem:** `mdb.manager_state.find(e => e.key === "threads")` called three times during validation/restore.
- **Why it hurts:** Inefficient pattern; adds up on incremental syncs.
- **Fix:** Index once: `const keyMap = new Map(manager_state.map(e => [e.key, e]))`.

### 8. **Pattern stored as flat array of objects; SoA would be more efficient**
- **File:** Pattern array throughout codebase (project-storage.js, tracker-app.js)
- **Priority:** 🟡
- **Problem:** Each stitch cell is `{ id, type, rgb, lab }` with object overhead. 100×100 = 10k objects; 500×500 = 250k objects.
- **Why it hurts:** Large project memory bloat; slow serialisation; GC pauses.
- **Fix:** Structure-of-arrays: store IDs in `Uint16Array`, types in `Uint8Array`, rgb in `Uint8Array`. Big refactor — defer until benchmarked.

---

## Lower Priority Issues (🟢)

### 9. **Set membership test using `.indexOf()` in filter**
- **File:** [helpers.js](helpers.js#L217) — Line 217
- **Priority:** 🟢
- **Fix:** Convert corners to Set: `const cornerSet = new Set(group.corners); filter(q => !cornerSet.has(q))`.

### 10. **Sync engine multiple JSON clones**
- **File:** [sync-engine.js](sync-engine.js#L395) — Lines 395–398, 631
- **Priority:** 🟢
- **Fix:** Use `structuredClone` or shallow merge.

### 11. **Manager-app array spread for single append**
- **File:** [manager-app.js](manager-app.js#L1486) — Lines 1486, 1509, 646, 674
- **Priority:** 🟢
- **Fix:** Use builder pattern instead of double-spread.

### 12. **useEditHistory array copies and `Object.assign`**
- **File:** [creator/useEditHistory.js](creator/useEditHistory.js#L20) — Lines 20–80
- **Priority:** 🟢
- **Fix:** Reuse filter/map chains.

### 13. **project-storage `.find()` for palette lookup**
- **File:** [project-storage.js](project-storage.js#L715) — Lines 538, 715
- **Priority:** 🟢
- **Fix:** Build palette Map at start of stats loop.

### 14. **stash-bridge thread lookup using `.find()`**
- **File:** [stash-bridge.js](stash-bridge.js#L35) — Lines 35–44
- **Priority:** 🟢
- **Fix:** Pre-compute `dmcMap = new Map(DMC.map(d => [d.id, d]))` at app start.

### 15. **colour-utils pre-computed blends cache invalidation**
- **File:** [colour-utils.js](colour-utils.js#L30) — Lines 30–47
- **Priority:** 🟢
- **Fix:** Cache blends keyed by palette hash; reuse if palette unchanged.
