# Code Quality Audit: Cross-File Duplication

## Summary

This audit examined duplicate logic across 40+ JavaScript files (root + creator/) that should be extracted into shared helpers. Found **20+ actionable consolidation opportunities** spanning composite key building, thread lookup patterns, time formatting, canvas operations, and storage/persistence logic. High-impact extractions would reduce code debt and prevent the C1-style bugs that key normalization duplication already introduced.

---

## Consolidated TODO List (by Impact)

### CRITICAL: Composite Thread Key Building

- [ ] **Extract `makeThreadKey(brand, id)` to helpers.js** — Currently duplicated across manager-app.js (6 lines), creator/Sidebar.js, creator/ConvertPaletteModal.js, creator/ShoppingListModal.js, creator/BulkAddModal.js, home-screen.js. Replace all inline `brand + ':' + id` or `'dmc:' + id` patterns. **Files:** manager-app.js:252, 256, 267, 271; creator/Sidebar.js:106; stash-bridge.js:494 (normalise variant); creator/ConvertPaletteModal.js:91, 123, 197; home-screen.js:949. **Impact:** Prevents C1-style key mismatch bugs.

- [ ] **Extract key parsing helper `parseCompositeKey(key, defaultBrand='dmc')`** — Already exists as `parseThreadKey()` in helpers.js (line 1106–1110) but called inconsistently. Consolidate inline parsing (e.g., `key.indexOf(':') < 0 ? 'dmc' : key.split(':')[0]`) to use this single function. **Files:** manager-app.js:430; home-screen.js:963 (normKey local fn); stash-bridge.js:492 (colon parsing); creator/ShoppingListModal.js:89. **Impact:** 4 fewer branches for the same logic.

### HIGH: Thread Lookup & Match Functions

- [ ] **Create `findThreadInCatalog(brand, id)` in colour-utils.js** — Consolidate repeated `DMC.find(d => d.id === id)` and `ANCHOR.find(a => a.id === id)` patterns. Currently at manager-app.js:151, 432, 622, 865, 1319, 1414, 1423, 1640, 1705, 2011; import-formats.js:141; pdf-importer.js:794, 809; colour-utils.js:315; creator/MagicWandPanel.js:336, 343. **Proposed signature:** `findThreadInCatalog(brand, id) -> thread | null`. **Impact:** Single source of truth for catalogue lookup.

- [ ] **Centralize `resolveBrand(id)` logic in helpers.js** — Currently inline in creator/Sidebar.js:90–93 (checks DMC first, then Anchor). Expose as `resolveBrandForId(id) -> 'dmc' | 'anchor'`. Use in manager-app.js:430 and anywhere brand fallback is needed. **Files:** creator/Sidebar.js:90; manager-app.js:430 (implicit). **Impact:** Consistent brand resolution across apps.

- [ ] **Extract thread match classification to helpers.js** — `classifyMatch(deltaE, isOfficial)` exists (helpers.js:1133) but not exported/reused. Move to colour-utils.js with dE functions; call from creator/ConvertPaletteModal.js:78–125 (currently recalculates match logic inline). **Files:** creator/ConvertPaletteModal.js:33–125. **Impact:** Single source for colour distance -> match kind mapping.

### HIGH: Time Formatting Functions

- [ ] **Consolidate time formatters — deduplicate fmtTime, fmtTimeL, formatStatsDuration** — Three variants exist: `fmtTime(seconds)` (helpers.js:13, tracker-app.js:1309, 1312), `fmtTimeL(seconds)` (helpers.js:14, used widely), and `formatStatsDuration(seconds)` (helpers.js:591, components.js:134, tracker-app.js). The first two use compact/long format; the third is an alias for formatStatsDuration. **Consolidate to:** `formatSeconds(seconds, style='long'|'short'|'compact')` in helpers.js. **Files:** helpers.js:13–14; components.js:134, 217, 773; tracker-app.js:1309, 1312, 1636, 1646.

- [ ] **Extract formatTimeRange(startISO, endISO) from components.js** — Partially lives in helpers.js (line 617) but format/usage varies. Ensure all stats timeline rendering (components.js:214, 217) uses the same function. **Files:** helpers.js:617; components.js:214.

- [ ] **Consolidate session duration to seconds converter** — Multiple places convert `durationMinutes || 0 * 60` vs. `durationSeconds` (insights-engine.js:158, 302; helpers.js:490). Extract `getSessionDurationSeconds(session) -> number`. **Files:** insights-engine.js:158, 302; helpers.js:490; tracker-app.js (implicit). **Impact:** Single backward-compatibility path for v1/v2/v3 session schemas.

### HIGH: Skein & Thread Calculation Logic

- [ ] **Create `normaliseSkeinEstimate(stitches, fabricCt)` in threadCalc.js** — `skeinEst()` in helpers.js (line 16) calls `stitchesToSkeins()` with hardcoded strandsUsed=2, wasteFactor=0.20. Other code duplicates this (stash-bridge.js:365, 407; tracker-app.js:830, 1624; home-screen.js:992). Extract to threadCalc.js as `normaliseSkeinEstimate(stitches, fabricCt, strandsUsed=2, wasteFactor=0.2)`. **Files:** helpers.js:16; stash-bridge.js:365, 407; tracker-app.js:830, 1624; home-screen.js:992; creator/LegendTab.js:40; creator/PrepareTab.js:51.

- [ ] **Extract blend stitch splitting to helpers.js** — Blend IDs (e.g. '310+550') are split inline using `id.split('+')` in multiple files. Create `splitBlendId(id) -> [baseId1, baseId2]` and `isBlendId(id) -> boolean`. **Files:** colour-utils.js:312; components.js:884; insights-engine.js:391; BRANCH_AUDIT_AND_GAP_BRIEF.md (notes on blend splitting). **Impact:** Centralized blend parsing; easier to extend to 3-way blends.

### MEDIUM: IndexedDB & Storage Boilerplate

- [ ] **Create unified IndexedDB accessor in helpers.js** — `getDB()` (helpers.js:69) is called by `saveProjectToDB()` and `loadProjectFromDB()`, but database upgrade logic is scattered across project-storage.js and helpers.js. Create `ensureProjectDB()` that runs all migrations atomically. **Files:** helpers.js:69, 101, 118; project-storage.js (migration logic).

- [ ] **Extract localStorage key constants** — Multiple keys scattered: `crossstitch_active_project` (helpers.js doc), `cs_globalStreak`, `cs_pref_*`, `CS_GLOBAL_GOALS_KEY`, `CS_GLOBAL_GOALS_COMPAT_KEY` (components.js:1623, 1625, 1633, 1634). Create `constants.js` export `LOCAL_STORAGE_KEYS = {activeProject, globalStreak, globalGoals, ...}`. **Files:** components.js:1623–1634; home-screen.js:339; backup-restore.js:94, 95, 202.

### MEDIUM: Canvas & Image Processing

- [ ] **Create getImageDataPixels(canvas, x, y, w, h) in colour-utils.js** — Repeated `ctx.getImageData(...).data` calls. Extract helper. **Files:** creator/canvasRenderer.js, creator/PatternCanvas.js:101, 127; creator/PreviewCanvas.js:40; creator/pdfExport.js:284; embroidery.js:548, 632; colour-utils.js:271; creator-main.js:107, 110; import-formats.js:297; pdf-export-worker.js:657.

- [ ] **Extract pixel loop iteration pattern** — Many files loop `for (let i = 0; i < w * h; i++)` to iterate grid cells (colour-utils.js:236; embroidery.js:553, 606, 632, etc.). Create `forEachPixel(w, h, fn(i, x, y))` in embroidery.js.

- [ ] **Consolidate createImageData & putImageData wrapping** — Canvas context calls repeated across creator/PatternCanvas.js:52, 76, 127; creator/PreviewCanvas.js:40, 88; creator/pdfExport.js:284, 307; pdf-export-worker.js. Extract `paintCanvasFromPixels(canvas, pixelData)` and `captureCanvasPixels(canvas)`.

### MEDIUM: localStorage Access & Backup Patterns

- [ ] **Create localStorage proxy layer** — Direct `localStorage.getItem` / `setItem` calls scattered across backup-restore.js:94, 95, 202; components.js:1623, 1633; creator/PatternTab.js:103. Create `LocalStorageManager` with get/set/remove/clear.

- [ ] **Extract backup shape construction** — backup-restore.js:57–99 builds backup JSON structure. Create `createBackupPayload(projects, stash, localStorage)` helper to separate concerns.

### MEDIUM: Project Storage & Persistence

- [ ] **Unify project save/load pathways** — `helpers.saveProjectToDB()` vs. `ProjectStorage.save()` both write to IndexedDB (helpers.js:101–116 vs. project-storage.js:238–270). They handle auto_save vs. proj_* keys differently. Create unified `FlushProjectToIDB(project)` that routes to ProjectStorage internally. **Files:** helpers.js:101; project-storage.js:238; BRANCH_AUDIT_AND_GAP_BRIEF.md notes on dual flush.

- [ ] **Extract cross-database flush orchestration** — Multiple files call `__flushProjectToIDB()` (backup-restore.js:55; tracker-app PDF export; etc.) plus `ProjectStorage.save()`. Create `flushAllData()` that coordinates both synchronously.

### MEDIUM: Stash Bridge Key Handling

- [ ] **Create `StashBridge.makeKey(brand, id)` class method** — Already hinted in BRANCH_AUDIT_AND_GAP_BRIEF.md. Many files inline build `brand + ':' + id` keys (stash-bridge.js:494, 500, 505; creator/Sidebar.js:106; manager-app.js:252, 256, 271; creator/ShoppingListModal.js:89). Extract to `StashBridge.makeKey(brand, id)`.

- [ ] **Create `StashBridge.resolveKey(threadKey) -> {brand, id}`** — Similar to `parseThreadKey()` but with StashBridge defaults. Consolidate the parsing logic that appears in stash-bridge.js:492, 500 (manual colon splitting). **Files:** stash-bridge.js:492, 500.

### LOW-MEDIUM: Modal & Toast Scaffolding

- [ ] **Create shared modal state hook useModalState()** — Multiple pages have `const [modal, setModal] = useState(null)` (embroidery.js, manager-app.js:72, creator-main.js). Extract to a custom hook with open/close/isOpen semantics.

- [ ] **Standardize toast/showToast calls** — `state.addToast`, `window.Toast.show()`, `showToast()` (onboarding.js:284) are three variants. Consolidate to `window.Toast.show({message, type, duration})` everywhere. **Files:** creator-main.js:715; onboarding.js:284, 286; tracker-app.js (implicit).

### LOW-MEDIUM: Brand Resolution & Fallback

- [ ] **Create threadResolutionOrder(preferredBrand='dmc')** — Multiple places check `typeof DMC !== 'undefined' && DMC.find(...) || ANCHOR.find(...)`. Extract to helper that returns [DMC, ANCHOR] or [ANCHOR, DMC] based on preference. **Files:** creator/BulkAddModal.js:48; manager-app.js:151, 432.

- [ ] **Extract project thread brand detection** — Patterns contain mixed DMC/Anchor threads; detection logic appears in manager-app.js and creator files. Create `detectProjectThreadBrands(pattern) -> ['dmc'] | ['anchor'] | ['dmc', 'anchor']`.

### LOW: Export & Import Shape Consistency

- [ ] **Create `exportProjectAsJSON(project)` in project-storage.js** — Backup logic (backup-restore.js:57–99) and individual export (creator) both shape project objects. Extract to single canonical export function.

- [ ] **Centralize import parser dispatch** — import-formats.js has multiple `.oxs`, `.json`, `.pdf`, image parsers. Create unified entry point `parseImportFile(file, format?) -> projectData`.

---

## Risky / Needs Design

- **Stash key separator:** Should `dmc:310` ever become `dmc|310` or `dmc:310:v2`? Changing requires migration. **Recommendation:** Hardcode separator in single helper; document never to inline construct keys.
- **Thread catalogue async:** `findThreadInCatalog()` currently synchronous. If catalogues ever become async, all call sites need Promise wrapping.
- **Time formatter locale:** `fmtTimeL` uses English. If multi-language UI is planned, time formatters need i18n wiring.
- **Canvas pixel format:** All pixel loops assume RGBA 4-byte format. WebGL or 3D contexts may differ.
