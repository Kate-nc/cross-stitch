# CQ Report 07 — Abnormal Defensive Code

## Summary

Audited for over-defensiveness, "exception swallowing," vestigial type guards, and code that looks like it's defending against errors that cannot happen (or worse, silently hides errors that can and do happen).

**Risk Level: MEDIUM** — Most issues are noise that hides real errors; one is HIGH (data loss before backup).

Found **18 findings** — several indicating patterns that make debugging extremely difficult by silently absorbing errors.

## Findings

### G-08: Backup Flush Failure Swallowed — Data Loss Risk — HIGH
- **File**: [backup-restore.js](../backup-restore.js#L123), line 123
- **Code**:
  ```javascript
  try {
    await window.__flushProjectToIDB?.();
  } catch (_) {
    // silently ignored
  }
  ```
- **Issue**: If the pre-backup flush fails, the backup continues with stale data. User downloads backup thinking it's current. Silently absorbed error could cause data loss.
- **Fix**: Log the error, show a toast "Could not save current state to database — backup may be incomplete," or abort the backup.
- **Severity**: high

### G-03: 60+ Empty localStorage try/catch Blocks — MEDIUM
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js)
- **Code** (representative):
  ```javascript
  try {
    localStorage.setItem('cs_creator_tool', tool);
  } catch (_) { }
  ```
- **Issue**: 60+ identical empty catch blocks across the file. localStorage can throw `QuotaExceededError` (Safari private browsing, iOS quota full). These are valid failure scenarios but they are completely silenced.
- **Impact**: User changes preferences in creator → localStorage full → settings not saved → no feedback → user changes setting again → same silent failure → user confused.
- **Fix**: Log all localStorage failures. Show toast once per session when quota is exceeded.
- **Severity**: medium

### G-11: Promise.all Silent Swallow in Manager — MEDIUM
- **File**: [manager-app.js](../manager-app.js#L238), line 238
- **Code**:
  ```javascript
  const results = await Promise.all(
    ids.map(id => loadProject(id).catch(() => null))
  );
  ```
- **Issue**: Failed project loads are silently swallowed as `null`. Project library renders with holes (missing cards) that look like deleted projects. No error logged or shown.
- **Fix**: Log the failing project ID; show a toast "Some projects could not be loaded."
- **Severity**: medium

### G-07: Backup-Restore Has 12 Inconsistent Error Catch Blocks — MEDIUM
- **File**: [backup-restore.js](../backup-restore.js)
- **Issue**: Some catch blocks show a toast, some log, some silently return, and some are completely empty. No consistent error handling strategy.
- **Severity**: medium

### G-02: ensurePersistence().catch(() => {}) — Silent Permission Failure — MEDIUM
- **File**: [helpers.js](../helpers.js#L380), line 380
- **Code**: `ensurePersistence().catch(() => {})`
- **Issue**: Storage persistence request failure completely silenced. On Safari (where persist is never granted), this is fine. On Chrome, a failed persist() could indicate a permission issue worth logging.
- **Severity**: medium

### G-01: DB Close Errors Silenced — MEDIUM
- **File**: [helpers.js](../helpers.js#L396), line 396
- **Code**: `try { db.close(); } catch(_) {}`
- **Issue**: `db.close()` should never throw, but if it does (e.g., browser IDB bug), the error is lost.
- **Severity**: low

### G-10: Wrapping console.error in try/catch — LOW
- **File**: [backup-restore.js](../backup-restore.js#L320), line 320
- **Code**: `try { console.error('Restore error', e); } catch(_) {}`
- **Issue**: `console.error()` itself will not throw. Wrapping it in try/catch suggests a copy-paste error or excessive defensiveness. Remove the wrapper.
- **Severity**: low

### G-04: typeof window.dispatchEvent Always False Check — LOW
- **File**: [stash-bridge.js](../stash-bridge.js#L42), line 42
- **Code**: `if (typeof window.dispatchEvent !== 'function') return;`
- **Issue**: `window.dispatchEvent` is always a function in browsers. This guard can never be true in a browser context.
- **Severity**: low

### G-05: Redundant typeof Checks on Always-Loaded Globals — LOW
- **Files**: [helpers.js](../helpers.js#L217), [stash-bridge.js](../stash-bridge.js#L47), [project-storage.js](../project-storage.js#L95)
- **Code**: `if (typeof DMC === 'undefined') { ... }` and `if (typeof findThreadInCatalog === 'undefined')`
- **Issue**: `DMC` and `findThreadInCatalog` are always loaded via the script load order in the HTML. These checks are vestigial guards from an earlier development stage.
- **Severity**: low

### G-06: x !== null && x !== undefined Should Use == null — LOW
- **Files**: [stash-bridge.js](../stash-bridge.js#L19), [manager-app.js](../manager-app.js#L290)
- **Code**: `if (x !== null && x !== undefined)`
- **Issue**: `x != null` is the idiomatic JS way to check for both. The verbose form is not wrong but is inconsistent.
- **Severity**: low

### G-09: Redundant Array Length Check Before forEach — LOW
- **File**: [import-formats.js](../import-formats.js#L240), line 240
- **Code**: `if (colorEls.length > 0) { colorEls.forEach(...) }`
- **Issue**: `forEach` on an empty array is a no-op. The `if` guard is redundant.
- **Severity**: low

### G-12: Double Null-Check Pattern — LOW
- **File**: [project-storage.js](../project-storage.js#L85), line 85
- **Code**: `if (!result || result === null)` — falsy check plus explicit null check are redundant
- **Issue**: `!result` already catches `null`, `undefined`, `0`, `""`, `false`, `NaN`. The `|| result === null` is redundant.
- **Severity**: low

### G-13: Empty Catch Around dispatchEvent — LOW
- **File**: [creator-main.js](../creator-main.js#L1342), line 1342
- **Code**: `try { document.dispatchEvent(new CustomEvent(...)); } catch (_) {}`
- **Issue**: `dispatchEvent` should not throw. Empty catch hides any actual error from event construction.
- **Severity**: low

### G-14: Vestigial CustomEvent typeof Check — LOW
- **File**: [stash-bridge.js](../stash-bridge.js#L47), line 47
- **Code**: `typeof CustomEvent !== 'function'` — guard for IE11 era
- **Issue**: CustomEvent is available in every modern browser. IE11 is not supported.
- **Severity**: low

### G-15: try/catch Around window.alert in onerror — LOW
- **File**: [embroidery.js](../embroidery.js#L901)
- **Code**: `img.onerror = () => { try { window.alert('Image failed to load'); } catch(_) {} }`
- **Issue**: `window.alert` will not throw. Empty catch wrapping it is redundant.
- **Severity**: low

### G-16: Null Initialisation Before Guaranteed Assignment — LOW
- **File**: [components-stats.js](../components-stats.js#L673), line 673
- **Code**: `let result = null; if (condition) { result = ...; } else { result = ...; } return result;`
- **Issue**: Branch covers all paths. `null` initialisation is unnecessary; could use `const result = condition ? ... : ...;`.
- **Severity**: low

### G-17: Redundant Array.isArray After Falsy Guard — LOW
- **File**: [sync-engine.js](../sync-engine.js#L130), line 130
- **Code**: `if (!arr || !Array.isArray(arr)) return [];`
- **Issue**: `!arr` catches `null`, `undefined`, `false`, `0`. The `!Array.isArray(arr)` is needed for non-array truthy values. This one is fine but could be written more cleanly as `if (!Array.isArray(arr)) return [];` since `Array.isArray(null)` is false.
- **Severity**: low

### G-18: 5-Condition StashBridge Defensive Ladder — LOW
- **File**: [project-storage.js](../project-storage.js#L275), line 275
- **Code**: `if (window.StashBridge && window.StashBridge.syncProject && typeof window.StashBridge.syncProject === 'function')`
- **Issue**: StashBridge is always present when stash-bridge.js is loaded. Optional chaining would be cleaner: `window.StashBridge?.syncProject?.()`.
- **Severity**: low

## TODO — Priority-Ordered Fix List

1. **[HIGH] Add user feedback for backup flush failure** in [backup-restore.js](../backup-restore.js#L123): Show toast "Warning: Could not flush latest changes — backup may not be fully up to date." Do not silently continue.
2. **[MEDIUM] Consolidate localStorage error handling** in [creator/useCreatorState.js](../creator/useCreatorState.js): Show a single toast when `QuotaExceededError` is caught; log all others.
3. **[MEDIUM] Log and surface failed project loads** in [manager-app.js](../manager-app.js#L238): Show toast for partial load failures.
4. **[MEDIUM] Standardise error handling in [backup-restore.js](../backup-restore.js)**: All catch blocks should either show toast + log, or log only. Never silent.
5. **[LOW] Remove `console.error` wrapped in try/catch** in [backup-restore.js](../backup-restore.js#L320).
6. **[LOW] Remove vestigial IE11/old-browser guards** in [stash-bridge.js](../stash-bridge.js): `typeof CustomEvent !== 'function'`, `typeof window.dispatchEvent !== 'function'`.
7. **[LOW] Replace 5-condition StashBridge check** with optional chaining.
8. **[LOW] Use `x != null` instead of `x !== null && x !== undefined`** throughout.
9. **[LOW] Remove redundant `if (arr.length > 0)` guards before `forEach`** calls.
