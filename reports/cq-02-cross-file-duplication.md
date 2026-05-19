# CQ Report 02 — Cross-File Duplication

## Summary

Audited the codebase for logical and literal code duplication across files. Found **12 distinct duplication clusters** — several involving safety-critical patterns (IDB open logic, thread key parsing) that would benefit from a shared utility.

**Risk Level: MEDIUM** — Most duplication doesn't cause bugs currently, but increases maintenance cost and risk of divergence.

## Findings

### D-01: IndexedDB Open Patterns Duplicated ~8 Times — MEDIUM
- **Files**: [stash-bridge.js](../stash-bridge.js#L33), [backup-restore.js](../backup-restore.js#L37), [creator/ShoppingListModal.js](../creator/ShoppingListModal.js#L36), [manager-app.js](../manager-app.js#L46), [project-storage.js](../project-storage.js#L50), [home-app.js](../home-app.js#L108)
- **Code**: Each file contains nearly identical `indexedDB.open(DB_NAME, version)` patterns with the same `onupgradeneeded`, `onerror`, `onsuccess` structure.
- **Issue**: Schema version drift possible if one copy is updated and others are not. Bugs in error handling need to be fixed in 8 places.
- **Severity**: medium

### D-02: DMC Lookup Maps Built Twice in Memory — HIGH
- **Files**: [helpers.js](../helpers.js#L21), [import-formats.js](../import-formats.js#L14)
- **Code**:
  - helpers.js: `const _dmcMap = new Map(DMC.map(d => [d.id, d]));`
  - import-formats.js: `const _ibByDmc = {};  DMC.forEach(d => _ibByDmc[d.id] = d);`
- **Issue**: Two separate DMC lookup structures (one Map, one plain Object) built from the same DMC array. Redundant 700-entry allocation. Any third-party usage must choose which one to use.
- **Fix**: Export or expose the Map from helpers.js as a shared utility.
- **Severity**: high

### D-03: Thread Key Parsing Logic Duplicated — MEDIUM
- **Files**: [helpers.js](../helpers.js#L166), [creator/useCreatorState.js](../creator/useCreatorState.js#L195)
- **Code**:
  - helpers.js: `function parseThreadKey(key) { const parts = key.split(':'); ... }`
  - useCreatorState.js: `function _splitStashKey(k) { const p = k.split(':'); ... }`
- **Issue**: Identical logic for splitting thread keys like `"310:standard"` → `{id, type}`. If the format changes, both must be updated.
- **Severity**: medium

### D-04: timeAgo() Function Exactly Duplicated — MEDIUM
- **Files**: [home-screen.js](../home-screen.js#L70), [home-app.js](../home-app.js#L29)
- **Code**:
  ```javascript
  function timeAgo(date) {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  }
  ```
- **Issue**: Exact code duplicate. Already diverged slightly between the two files (different month arrays). Any fix must be applied in two places.
- **Severity**: medium

### D-05: Pattern Cell Validity Check Duplicated 5+ Times — HIGH
- **Files**: [project-storage.js](../project-storage.js#L190), [home-app.js](../home-app.js#L176), [home-screen.js](../home-screen.js#L119), [components-stats.js](../components-stats.js#L88), [creator/useCreatorState.js](../creator/useCreatorState.js#L403)
- **Code**: `cell.id !== '__skip__' && cell.id !== '__empty__'`
- **Issue**: This exact expression is repeated everywhere. If a new "empty" cell type is added (e.g., `"__grid__"`), all 5+ locations must be updated.
- **Fix**: Extract `isCellFilled(cell)` helper in helpers.js.
- **Severity**: high

### D-06: Download Blob Pattern Duplicated 3 Times — MEDIUM
- **Files**: [creator/ExportTab.js](../creator/ExportTab.js#L208), [components-stats.js](../components-stats.js#L1280), [backup-restore.js](../backup-restore.js#L200)
- **Code**: Create `<a>` element → `URL.createObjectURL(blob)` → `a.click()` → `URL.revokeObjectURL`
- **Issue**: All three copies have the same revocation race condition bug (see Report 05). Fixing the bug requires updating all 3 copies.
- **Fix**: Extract `downloadBlob(blob, filename)` helper in helpers.js; fix the race condition once.
- **Severity**: medium

### D-07: Project ID Generation Pattern — LOW
- **Files**: [project-storage.js](../project-storage.js#L52), [helpers.js](../helpers.js#L189), [backup-restore.js](../backup-restore.js#L131)
- **Code**: `'proj_' + Date.now()` or `'proj_' + ts`
- **Issue**: Minor. Format is consistent but not centralised. Changing the ID format requires touching multiple files.
- **Severity**: low

### D-08: Stitch Progress Percentage Calculation — LOW
- **Files**: [project-storage.js](../project-storage.js#L340), [tracker-app.js](../tracker-app.js#L1810), [home-screen.js](../home-screen.js#L130), [components-stats.js](../components-stats.js#L90)
- **Code**: `Math.round(done / total * 100)`
- **Issue**: Inline expression repeated. Not a bug risk, but centralising in helpers would be cleaner.
- **Severity**: low

### D-09: localStorage Key Literals Not Using Registry — MEDIUM
- **Files**: [tracker-app.js](../tracker-app.js#L1121), [creator/useCreatorState.js](../creator/useCreatorState.js#L95), [preferences-modal.js](../preferences-modal.js#L89)
- **Code**: Raw string `'crossstitch_active_project'` etc. used directly
- **Issue**: [constants.js](../constants.js) defines `LOCAL_STORAGE_KEYS` registry. Not all callers use it, creating a risk of key name typos.
- **Severity**: medium

### D-10: Canvas 2D Setup Patterns — LOW
- **Files**: 10+ files
- **Code**: `const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);`
- **Issue**: Minor boilerplate. Not a bug risk.
- **Severity**: low

### D-11: O(n) DMC.find() Scans in Multiple Files — HIGH
- **Files**: [import-formats.js](../import-formats.js#L243), [creator/adaptationEngine.js](../creator/adaptationEngine.js#L200), [colour-utils.js](../colour-utils.js#L45)
- **Code**: `DMC.find(d => d.id === id)` — linear scan through 700-entry array
- **Issue**: Appears in hot paths (pattern import loops, adaptation calculations). Each lookup is O(n) instead of O(1). Should use the centralised Map from D-02 fix.
- **Severity**: high

### D-12: try/catch → toast Error Pattern Repeated — LOW
- **Files**: Multiple throughout codebase
- **Code**: `try { ... } catch (ex) { showToast('Something went wrong: ' + ex.message, 'error'); }`
- **Issue**: Not a semantic duplication issue, but standardising error message format would improve UX consistency.
- **Severity**: low

## TODO — Priority-Ordered Fix List

1. **[HIGH] Extract `isCellFilled(cell)` helper** in [helpers.js](../helpers.js): Replaces the `id !== '__skip__' && id !== '__empty__'` expression in 5+ files.
2. **[HIGH] Deduplicate DMC lookup by exposing shared Map** from [helpers.js](../helpers.js): Remove duplicate structure in [import-formats.js](../import-formats.js#L14); update all `DMC.find()` O(n) scans to use the shared Map.
3. **[MEDIUM] Extract `downloadBlob(blob, filename)` helper** in [helpers.js](../helpers.js) — fixes the revocation race condition once for all 3 download sites.
4. **[MEDIUM] Delete duplicate `timeAgo()` in [home-app.js](../home-app.js#L29)** — consume the one in [home-screen.js](../home-screen.js#L70), or move to helpers.js.
5. **[MEDIUM] Delete `_splitStashKey()` in [creator/useCreatorState.js](../creator/useCreatorState.js)** — reuse `parseThreadKey()` from [helpers.js](../helpers.js#L166).
6. **[MEDIUM] Enforce LOCAL_STORAGE_KEYS registry** across all callers; remove raw string literals.
7. **[MEDIUM] Extract `openManagerDB()` helper** shared across stash-bridge.js, manager-app.js, backup-restore.js.
8. **[LOW] Centralise project ID generation** in helpers.js as `generateProjectId()`.
9. **[LOW] Centralise stitch progress percentage** as `calcProgressPct(done, total)` in helpers.js.
