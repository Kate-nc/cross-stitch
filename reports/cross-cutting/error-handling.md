# Cross-Cutting: Error Handling & Recovery

> Phase 2 cross-cutting output. Maps error types to user experience, recovery paths, and verification requirements across all surfaces.

## Scope

This document categorises every error condition the app can encounter, including offline failures, storage errors, malformed imports, worker crashes, React render failures, and data corruption. For each category, we identify:

- **Trigger conditions** (concrete code paths)
- **Where it surfaces** (which component, UI pattern)
- **User recovery** (whether data is consistent, if retry is possible)
- **Severity** (P0â€“P4 based on data loss or user misdirection risk)

Sources include IndexedDB, localStorage, web workers, PDF imports, image processing, service workers, React components, and validation layers.

---

## Error category: IndexedDB

**Purpose**: Core project persistence in `CrossStitchDB` (v3) and `stitch_manager_db` (v1).

### Triggers

1. **Open failure** â€” `indexedDB.open()` rejected (blocked tab, storage disabled, quota full)
   - [helpers.js](helpers.js#L213-L228): `getDB()` promise rejection
   - [project-storage.js](project-storage.js#L176-L218): `getDB()` promise rejection
   
2. **Version mismatch** â€” Browser has newer/older schema version  
   - [helpers.js](helpers.js#L213-L228): `db.onversionchange` fires when another tab upgrades
   
3. **Quota exceeded** â€” Storage full, request fails mid-transaction
   - [project-storage.js](project-storage.js#L272-L327): `store.put()` throws `QuotaExceededError`
   - [manager-app.js](manager-app.js#L358): `getStorageEstimate()` succeeds but actual write later fails
   
4. **Transaction abort** â€” Race condition or explicit abort
   - [project-storage.js](project-storage.js#L240-L252): `tx.onerror` fired
   - [manager-app.js](manager-app.js#L252): Request onerror in transaction
   
5. **Blocked by another tab** â€” Multiple browser tabs writing same project ID
   - [project-storage.js](project-storage.js#L176): Transaction times out if locked
   
6. **Corrupt data on read** â€” Stored blob unreadable (corrupted file, schema version skew)
   - [project-storage.js](project-storage.js#L338-L348): `project.threadOwned` normalisation catches legacy composite keys

### User-visible outcome

- **Transient error** (quota / blocked): Silent `.catch()` at save time; no UI signal.
- **Fatal error** (open failure): Project tab shows `null` data; Creator shows `loadError` state ([creator/useCreatorState.js](creator/useCreatorState.js#L250), [tracker-app.js](tracker-app.js#L751)).
- **Version mismatch** (schema upgrade needed): Page reload required; no UI warning shown.

### Recovery path

- Quota exceeded: user must free browser storage (settings â†’ Clear cache) or delete old projects via Manager.
- Open failure: browser restart; check private-mode restrictions.
- Transient abort: automatic retry on next save (no user action needed).
- Blocked tab: page refresh resolves lock.
- Version mismatch: page reload triggers schema upgrade.

### Code references

- [helpers.js](helpers.js#L185-L270): `getDB()`, `saveProjectToDB()`, `loadProjectFromDB()`
- [project-storage.js](project-storage.js#L160-L355): `getDB()`, `save()`, `get()`, transaction handlers
- [manager-app.js](manager-app.js#L358): Storage usage query

### Severity

- **P0** (quota, open failure): App becomes read-only; user loses ability to save progress.
- **P1** (transaction abort, blocked): Transient; auto-retry usually succeeds.
- **P2** (version mismatch): Page reload required; discoverable via console only.

---

## Error category: localStorage

**Purpose**: User preferences, active-project pointer, temporary UI state, import drafts.

### Triggers

1. **Quota exceeded** â€” localStorage is full; write throws `QuotaExceededError`.
   - [user-prefs.js](user-prefs.js#L231): `localStorage.setItem()` catch-silently
   - [creator/useImportWizard.js](creator/useImportWizard.js#L66): Import wizard draft save fails silently
   
2. **JSON parse failure** â€” Corrupted entry (partial write, external corruption).
   - [user-prefs.js](user-prefs.js#L225): `JSON.parse(raw)` â€” fallback to default if corrupted
   - [helpers.js](helpers.js#L1242): `getProjectByKey()` catches parse errors
   
3. **Disabled by user** â€” Private browsing mode, browser settings block storage.
   - [user-prefs.js](user-prefs.js#L223-L231): Try-catch around all read/write; defaults returned on any exception
   
4. **Type mismatch** â€” Data type changed after write (e.g., string stored as boolean read back).
   - [helpers.js](helpers.js#L1242): Defensive `Object.assign({}, PVIEW_DEFAULTS, parsed)` ensures schema

### User-visible outcome

- **All cases**: Silent fallback to defaults. User preferences revert to factory settings (no warning shown).
- **Import draft loss**: ImportWizard doesn't recover previous session; user starts over.
- **Active project loss**: Home page shows empty project list (no last-used project highlighted).

### Recovery path

- Quota exceeded: browser storage cleanup required (Settings â†’ Clear browsing data).
- Parse failure: corrupt key is skipped; other keys remain valid.
- Private mode: inherent limitation; some features disabled (e.g., WakeLock, localStorage-backed state).
- Type mismatch: schema normalisation ensures backward compatibility (no data loss, only field reset).

### Code references

- [user-prefs.js](user-prefs.js#L207-L310): `get()`, `set()`, parse/default fallback logic
- [creator/useImportWizard.js](creator/useImportWizard.js#L35-L70): Draft storage with quota handling
- [tracker-app.js](tracker-app.js#L761-L763): Dock position persistence with try-catch

### Severity

- **P2** (all cases): User preferences reset silently; no data loss, only feature regression (e.g., theme preference lost).
- **P3** if user doesn't notice preferences changed and assumes app is broken.

---

## Error category: File import errors

**Purpose**: User attempts to import `.oxs` (KG-Chart XML), `.json` (project backup), `.pdf` (cross-stitch chart), or image (generate from photo).

### Triggers

1. **Invalid `.oxs` format** â€” Malformed XML, missing `<chart>` element.
   - [import-formats.js](import-formats.js#L105-L122): `parserError` detected or no `<chart>` found
   - Error message: "Invalid OXS file: malformed XML" / "Could not find chart element"
   
2. **Oversized `.oxs` chart** â€” Dimensions exceed 5000Ã—5000 limit.
   - [import-formats.js](import-formats.js#L125): Dimension check throws "Chart dimensions too large (max 5000Ã—5000)"
   
3. **Corrupted `.json` project** â€” Invalid JSON, v < 8, schema mismatch.
   - [creator/useCreatorState.js](creator/useCreatorState.js#L1065): `JSON.parse()` fails in import flow
   
4. **Image oversized** â€” Dimensions exceed reasonable limit (e.g., 50 MP+).
   - [generate-worker.js](generate-worker.js#L73): Canvas memory allocation fails
   
5. **No stitches detected** â€” Image processing yields no chart (all background, blank image).
   - [import-formats.js](import-formats.js#L401): "No stitches produced from image. Adjust background settings or try another image."
   - [generate-worker.js](generate-worker.js#L73): "Could not find enough distinct colours in your image."
   
6. **Unsupported codec** â€” Image format not supported by browser (e.g., `.webp` on old Safari).
   - [creator/useCreatorState.js](creator/useCreatorState.js#L978-L980): Worker error message relayed
   
7. **EXIF parse failure** â€” Image metadata corrupted or unreadable.
   - Silent: EXIF extracted but unused for cross-stitch generation

### User-visible outcome

- **`.oxs` errors**: Modal error message (specific reason); user returns to import.
- **`.json` errors**: Modal with "Could not load project" + suggestion to re-export from original source.
- **Image errors**: Toast notification + suggested remediation (crop, adjust background settings, choose sharper image).
- **No stitches**: Toast "No stitches produced from image..." with "Adjust background settings" hint.

### Recovery path

- Malformed file: user edits/corrects file externally and re-imports.
- Oversized chart: limit enforced by OXS spec; file must be recreated smaller.
- Image: user can adjust ImageWizard step 2 (palette) or step 4 (background threshold) and retry.
- Unsupported format: user converts image to `.jpg`/`.png` and re-imports.

### Code references

- [import-formats.js](import-formats.js#L100-L401): OXS, JSON, PDF, image import logic
- [generate-worker.js](generate-worker.js#L1-L215): Image processing, worker error postMessage
- [creator/useCreatorState.js](creator/useCreatorState.js#L975-L995): Worker error relay to UI
- [creator/ImportWizard.js](creator/ImportWizard.js#L1-L430): UI error display in wizard flow

### Severity

- **P1** (malformed file): User misled about file correctness; suggests re-download/support contact.
- **P2** (image settings): User can iterate; error message guides adjustment.
- **P3** (unsupported format): Clear message; user converts and retries.

---

## Error category: Image processing worker errors

**Purpose**: Offload CPU-heavy image quantisation, dithering, edge detection to background thread.

### Triggers

1. **Worker crash** â€” Uncaught exception in `generate-worker.js`, worker termination.
   - [creator/useCreatorState.js](creator/useCreatorState.js#L990-L991): `worker.onerror` handler fires
   
2. **Out of Memory (OOM)** â€” k-means quantisation or dithering exhausts heap during large image processing.
   - [generate-worker.js](generate-worker.js#L214-L215): Try-catch around main algorithm; error posted back
   
3. **Worker timeout** â€” Image processing takes >5s (long complex image).
   - No explicit timeout in code; browser may terminate long-running worker (depends on browser).
   
4. **postMessage serialisation failure** â€” Message too large (unlikely, but theoretically possible for massive result).
   - [generate-worker.js](generate-worker.js#L214-L215): Catch-all error handler posts message
   
5. **Worker initialization failure** â€” Worker blob or constructor fails (rare; usually indicates app bug).
   - [creator/useCreatorState.js](creator/useCreatorState.js#L970-L975): Worker instantiation

### User-visible outcome

- All cases: **Toast error** (see [toast.js](toast.js#L55), type='error' always shown regardless of user prefs):
  - "Could not find enough distinct colours in your image. Try increasing the maximum colours, or use a clearer image."
  - Generic catch-all message relayed from worker

- Creator canvas remains showing previous pattern; no partial or corrupted result displayed.

### Recovery path

- Retry generation with adjusted parameters (more colours, different image, simpler palette).
- Worker recovers automatically on next generation attempt (worker lifecycle not affected by single error).
- OOM: user must close other apps to free browser memory, or use smaller/simpler image.

### Code references

- [generate-worker.js](generate-worker.js#L14-L215): Worker error handling, postMessage contract
- [creator/useCreatorState.js](creator/useCreatorState.js#L960-L1010): Worker lifecycle, error relay
- [toast.js](toast.js#L55-L102): Toast type='error' always displays

### Severity

- **P1**: User sees generic error message; context unclear (did image fail, or app crash?).
- **P2**: User can retry; no data loss. Pattern remains valid before generation attempt.

---

## Error category: PDF import errors

**Purpose**: Detect cross-stitch charts in PDF (e.g., Pattern Keeper exports) and extract grid.

### Triggers

1. **PDF.js not loaded** â€” CDN load fails or late binding undefined.
   - [pdf-importer.js](pdf-importer.js#L50): `if (!window.pdfjsWorker)` check
   - Error: "PDF.js library is not loaded."
   
2. **PDF has no pages** â€” Empty or malformed PDF.
   - [pdf-importer.js](pdf-importer.js#L62): Page count check
   - Error: "PDF contains no pages."
   
3. **PDF is password-protected** â€” Encrypted PDF, user didn't provide password.
   - [pdf-importer.js](pdf-importer.js#L70): Catch "No password given" and wrap as "This PDF is password-protected. Please unlock it before importing."
   
4. **PDF.js parse failure** â€” Corrupted PDF, unsupported format version.
   - [pdf-importer.js](pdf-importer.js#L65-L72): Catch and wrap as "Failed to parse PDF: [error detail]"
   
5. **No chart pages detected** â€” PDF rendered but no cross-stitch symbol grid found (false positive, wrong PDF).
   - [pdf-importer.js](pdf-importer.js#L101): Symbol matching failed
   - Error: "No chart pages detected in the PDF."

### User-visible outcome

- All errors: **Modal error dialog** (text shown to user, typically via ImportWizard step X error state).
- No partial import displayed; user returns to file picker.

### Recovery path

- Unencrypted PDF: must be valid Pattern Keeper or similar export; if corrupted, user re-exports from source.
- Password-protected: user must unlock PDF with password in external tool and re-export.
- No chart detected: user confirms PDF is a cross-stitch chart export (may be wrong file type).

### Code references

- [pdf-importer.js](pdf-importer.js#L50-L101): PDF load, parse, page iteration, symbol detection
- [creator/ImportWizard.js](creator/ImportWizard.js#L1-L430): Error UI in wizard modal

### Severity

- **P1** (not loaded): User confused; app appears broken.
- **P2** (parse/no pages): Clear error message; user checks file.
- **P3** (no chart): User verifies PDF content; may not be a cross-stitch chart.

---

## Error category: PDF export errors

**Purpose**: Render pattern grid to PDF, embed custom symbol font, apply branding.

### Triggers

1. **pdf-lib load failure** â€” CDN timeout or missing script.
   - [pdf-export-worker.js](pdf-export-worker.js#L141): `if (!PDFLib)` throw
   - Error: "pdf-lib failed to load"
   
2. **Symbol font missing** â€” Custom symbol font bytes failed to fetch or base64 decode.
   - [pdf-export-worker.js](pdf-export-worker.js#L155-L159): Fontkit load failure
   - Error: "Symbol font missing â€” the Cross Stitch symbol font failed to load. Please reload the page and try again."
   
3. **Symbol font embed failure** â€” PDF library failed to embed font in document.
   - [pdf-export-worker.js](pdf-export-worker.js#L165-L166): Catch fontErr
   - Error: "Symbol font failed to embed: [detail]"
   
4. **Oversized canvas** â€” Pattern grid too large; PDF memory/page limit exceeded.
   - [pdf-export-worker.js](pdf-export-worker.js#L130-L134): Catch from pdf-lib and relay
   
5. **Logo image load failure** â€” Branding logo URL 404 or slow load.
   - [pdf-export-worker.js](pdf-export-worker.js#L330): `catch (_) { /* logo failures shouldn't kill the export */ }`
   - Silent: export continues without logo

### User-visible outcome

- **Fatal errors** (pdf-lib, symbol font, embed): Toast error message + export cancelled.
- **Oversized canvas**: Toast "PDF export failed: canvas too large or memory exceeded".
- **Logo failure**: Export succeeds but without logo branding (silent recovery).

### Recovery path

- pdf-lib / font missing: reload page; check internet connection.
- Oversized canvas: user reduces pattern size or uses lower DPI setting.
- Logo 404: verify logo URL in branding settings; retry export.

### Code references

- [pdf-export-worker.js](pdf-export-worker.js#L130-L330): Export logic, error handlers, font embedding
- [creator/pdfExport.js](creator/pdfExport.js#L1-N): Export trigger + worker message relay
- [toast.js](toast.js#L55-L102): Error toast display

### Severity

- **P0** (pdf-lib, font): User cannot export; no fallback format available.
- **P1** (embed, oversized): User sees clear error; can adjust and retry.
- **P2** (logo 404): Export succeeds; branding just missing.

---

## Error category: Service worker fetch errors

**Purpose**: Precache app shell, stale-while-revalidate for assets, offline fallback.

### Triggers

1. **Install-time cache miss** â€” Individual asset fetch fails during service worker install.
   - [sw.js](sw.js#L76-L82): `cache.add()` rejects; logged to console
   - Silent: one asset failure doesn't block install (Promise.all per-asset, not collective)
   
2. **Offline + uncached resource** â€” User opens page offline; script not in precache or runtime cache.
   - [sw.js](sw.js#L95-N): Fetch handler; network-first fallback to stale cache or 404
   - User sees blank page or error page (depends on fallback strategy)
   
3. **Cache write failure** â€” Storage quota full; cache.put() rejects.
   - [sw.js](sw.js#L80): `.catch()` swallows error; asset served from network, not cached
   
4. **Stale-while-revalidate conflict** â€” Background revalidation fails but stale asset already served.
   - User sees old version until next hard refresh; no error shown

### User-visible outcome

- **Install failure**: Silent; one missing asset may break app (depends on which asset).
- **Offline access**: Blank page or 404 if HTML/JS not cached.
- **Cache write failure**: Asset loaded but not cached; next offline access misses it.
- **Stale revalidate**: User sees old UI/logic; no notification of mismatch.

### Recovery path

- Install failure: browser self-heals on next SW update (CACHE_NAME bump in [sw.js](sw.js#L1) triggers install again).
- Offline: user goes online, page reloads, SW caches assets.
- Cache write failure: if quota full, browser auto-clears oldest cache entries; next reload succeeds.

### Code references

- [sw.js](sw.js#L1-N): Install, fetch, cache strategies
- [sw-register.js](sw-register.js#L1-N): SW registration trigger
- [vercel.json](vercel.json#L1-N): Cache-Control headers (v40 immutable)

### Severity

- **P1** (offline app unavailable): User cannot use app without internet; error not obvious.
- **P2** (cache write failure): Silent; impacts next offline session, not current.
- **P3** (stale cache): User sees old behavior until hard refresh; discoverable.

---

## Error category: Sync engine errors (if active)

**Purpose**: Optional cloud sync to external service (Vercel KV or similar).

### Triggers

1. **Network failure** â€” Fetch to sync endpoint times out or 5xx.
   - [sync-engine.js](sync-engine.js#L144-L166): Catch fetch error
   - Silent: sync failure doesn't block local save ([project-storage.js](project-storage.js#L313-L314))
   
2. **Auth expired** â€” User token invalid or revoked.
   - [sync-engine.js](sync-engine.js#L1-N): No explicit auth check in current code; depends on backend
   - Silent if not implemented; backend 401 treated as transient
   
3. **Conflict resolution failure** â€” Multiple devices edited same project; merge strategy fails.
   - [sync-engine.js](sync-engine.js#L1-N): Not implemented in Phase 1; reserved for future
   
4. **Partial sync** â€” Only N projects uploaded; cleanup fails, partial state remains.
   - [sync-engine.js](sync-engine.js#L192-L194): Catch and log "Could not read projects from database"
   - User data inconsistently replicated

### User-visible outcome

- All errors: **Silent fallback** (see [project-storage.js](project-storage.js#L314): `/* never block save on sync errors */`).
- No toast or warning shown; user unaware sync failed.
- Local project saved successfully; sync retry happens on next auto-export.

### Recovery path

- Network failure: automatic retry on next save cycle (exponential backoff not implemented).
- Auth expired: user logs in again (feature not yet implemented in current code).
- Partial sync: cleanup happens on next full export cycle.

### Code references

- [sync-engine.js](sync-engine.js#L1-N): Sync logic, error handling, export/import
- [project-storage.js](project-storage.js#L313-L314): Sync trigger with try-catch
- [backup-restore.js](backup-restore.js#L1-N): Export/import fallback

### Severity

- **P2** (network): Silent failure; user may assume cloud is syncing when it's not.
- **P1** (auth expired): User unaware of sync failure; data diverges between devices.
- **P3** (partial sync): Rare edge case; background retry usually succeeds.

---

## Error category: React render errors

**Purpose**: Component tree crashes due to exception in render or effect.

### Triggers

1. **Unhandled exception in component** â€” e.g., null reference, NaN in Math.max().
   - [creator-main.js](creator-main.js#L11-L20): `CreatorErrorBoundary` catches render errors
   - [components.js](components.js#L2025-L2036): `StatsErrorBoundary` catches chart render errors
   
2. **Race condition in effect** â€” useEffect closes DB connection before async save completes.
   - [creator/useCreatorState.js](creator/useCreatorState.js#L250): `loadError` state set on rejection
   - Error state stored; `setLoadError()` triggered by effect cleanup
   
3. **Missing or null prop** â€” Parent doesn't pass expected prop; component throws.
   - Error boundary catches; renders error fallback UI
   
4. **Promise rejection in event handler** â€” Unhandled promise rejection in click handler.
   - [create.html](create.html#L51-L52): Global `unhandledrejection` listener logs to console
   - [index.html](index.html#L49-L52): Same listener

### User-visible outcome

- **CreatorApp error**: Pre-rendered error message in red box ([creator-main.js](creator-main.js#L16-L18)):
  ```
  CreatorApp Error: [message]
  [stack trace]
  ```
  User sees raw error; must reload page.

- **Stats error**: Graceful fallback inline ([components.js](components.js#L2035-L2039)):
  ```
  Stats failed to render
  [error message]
  ```
  Rest of app remains functional; stats section hidden.

- **Unhandled rejection**: Logged to console only; no UI warning.

### Recovery path

- Render error: page reload (hard refresh if needed).
- Effect race: automatic retry on next component mount.
- Unhandled rejection: check browser console; user may not notice.

### Code references

- [creator-main.js](creator-main.js#L11-L20): CreatorErrorBoundary implementation
- [components.js](components.js#L2025-L2036): StatsErrorBoundary implementation
- [create.html](create.html#L51-L52): Global error handlers
- [index.html](index.html#L49-L52): Global error handlers
- [creator/useCreatorState.js](creator/useCreatorState.js#L1065): Error state capture in effect

### Severity

- **P0** (CreatorApp render): App unusable; user must reload.
- **P2** (StatsErrorBoundary): Feature degradation; app otherwise functional.
- **P3** (unhandled rejection): Silent; user may not notice unless they check console.

### Cross-cutting gap

- **No global error boundary wrapping all pages** â€” Home, Manager, Tracker pages have no error boundary. If HomeApp renders and throws, whole page is blank. Consider wrapping HomeApp, ManagerApp, TrackerApp in error boundaries analogous to CreatorErrorBoundary.

---

## Error category: Validation errors

**Purpose**: Prevent invalid input (out-of-range, empty required field, invalid format).

### Triggers

1. **Form field out of range** â€” e.g., max colors slider: user types `999`, exceeds limit 10â€“256.
   - Silent clamp: input constrained by `<input min/max>` in HTML.
   - No error message shown.
   
2. **Required field empty** â€” e.g., project name blank on save.
   - [modals.js](modals.js#L715): `if (!project) throw new Error('Project not found.');`
   - Modal error shown; save cancelled.
   
3. **Invalid DMC ID** â€” User manually edits stash, enters non-numeric ID.
   - Silent: legacy code path may reject or coerce to string.
   - No validation message shown to user.
   
4. **Fabriccute out of range** â€” User enters 0 or >32 count via settings.
   - No check found in code; assumed valid by downstream (threadCalc, pattern rendering).
   
5. **Date format invalid** â€” User enters malformed date in date picker.
   - HTML `<input type="date">` prevents invalid input; browser enforces format.
   - No error message needed.

### User-visible outcome

- **HTML constraint violation**: Browser prevents submission; no custom error.
- **Required field**: Modal error message; user corrects and retries.
- **Out-of-range numeric**: Silent clamp or coercion; user may not notice.

### Recovery path

- Validation failure: user corrects input and retries.
- Out-of-range clamp: automatic; user may need to verify result is sensible.

### Code references

- [modals.js](modals.js#L715-L724): NamePromptModal, EditProjectDetailsModal validation
- [components.js](components.js#L119-L150): Slider input with min/max constraints
- HTML `<input>` attributes: `min`, `max`, `required`, `pattern`, `type="date"`

### Severity

- **P2** (form constraints): Browser prevents bad input; user guided by validation.
- **P3** (silent clamp): User may not notice out-of-range input was adjusted.

---

## Error category: Stash inconsistency

**Purpose**: Thread inventory (DMC, Anchor) referenced by patterns but not in stash; brand ID collisions.

### Triggers

1. **Thread referenced in pattern but not in stash** â€” e.g., Pattern uses DMC 310, stash doesn't include it.
   - Legend view shows "missing thread" visual (greyed out or warning badge).
   - Shopping list calculates skeins for thread not yet owned.
   - Silent: no error, but incomplete inventory data.
   
2. **Brand ID collision** â€” e.g., both DMC 310 and Anchor 310 exist; pattern loads DMC but user sees Anchor name.
   - [stash-bridge.js](stash-bridge.js#L22-L27): parseThreadKey() defaults bare ID to 'dmc' brand.
   - [helpers.js](helpers.js#L1203-L1266): `findThreadInCatalog('dmc', id)` lookup.
   - Silent: collision unresolved; user sees wrong thread name/color.
   
3. **Legacy bare ID in pattern** â€” Old pattern saved with bare ID "310" (before brand namespacing).
   - [project-storage.js](project-storage.js#L338-L348): Normalisation converts to DMC by default.
   - Silent: assumes DMC; user may see wrong thread if they switched brands.

### User-visible outcome

- **Missing thread**: Shopping list shows "?" or greyed-out swatch + "[ID] (not in stash)".
- **Brand collision**: Legend shows DMC name; if user clicked to see Anchor inventory, mismatch not obvious.
- **Legacy ID**: Pattern loads with assumed DMC; user doesn't realize brand inference happened.

### Recovery path

- Missing thread: user adds thread to stash via Manager.
- Brand collision: pattern schema must be updated to include brand namespace; no runtime fix.
- Legacy ID: user manually corrects pattern or re-saves to normalize.

### Code references

- [stash-bridge.js](stash-bridge.js#L22-L107): Thread key parsing, brand handling
- [helpers.js](helpers.js#L1203-L1266): Thread lookup by brand and ID
- [project-storage.js](project-storage.js#L338-L348): Threadowned normalisation
- [creator/useCreatorState.js](creator/useCreatorState.js#L59-L97): Palette building, DMC-only check with comment

### Severity

- **P2** (missing thread): Feature doesn't break; user sees incomplete inventory.
- **P1** (brand collision): User misled about which thread they own; may purchase duplicates or wrong brand.
- **P2** (legacy ID): Silent inference; user unlikely to notice unless they switch brands mid-project.

---

## Error category: Project schema migration

**Purpose**: Opening a project file from an older app version (v < 8).

### Triggers

1. **Version < 8 on load** â€” Project format evolves; older versions have incompatible schema.
   - [helpers.js](helpers.js#L1340-L1374): Comments mention no migration needed if shapes load identically.
   - Code path unclear; assume projects pre-v8 cannot load.
   
2. **Missing required field** â€” New project requires `id`, `createdAt`, `updatedAt`; old project missing these.
   - [project-storage.js](project-storage.js#L260-L348): Silently fills in defaults if missing.
   
3. **Old blend ID format** â€” Pre-phase-5, blends stored as `"310+310"`; post-phase-5, schema changed.
   - [import-formats.js](import-formats.js#L1-N): Import logic handles multiple formats.
   - Load path doesn't explicitly handle old blend format.

### User-visible outcome

- Version < 8: Project fails to load; blank Creator canvas, `loadError` state set.
- Missing fields: Silently filled; project may load with missing metadata (e.g., no name, ancient timestamp).
- Old blend format: Silently coerced to new format; user may see different visual.

### Recovery path

- Version < 8: User must re-export from older app version (if available) or manually recreate pattern.
- Missing fields: Project loads; user edits metadata as needed.
- Old blend format: Automatic coercion; user verifies colors are correct.

### Code references

- [helpers.js](helpers.js#L1340-L1374): Schema comments
- [project-storage.js](project-storage.js#L260-L348): Load and normalisation
- [import-formats.js](import-formats.js#L1-N): Import format handlers

### Severity

- **P1** (version < 8): User loses access to old project; no upgrade path shown.
- **P2** (missing fields): Silent recovery; metadata may be lost but pattern usable.
- **P3** (old blend format): Automatic fix; user may not notice.

---

## Cross-cutting gaps

1. **No React error boundary on non-Creator pages** â€” Home ([home-app.js](home-app.js#L1096)), Manager ([manager-app.js](manager-app.js#L1-N)), and Tracker ([tracker-app.js](tracker-app.js#L1-N)) have no error boundaries. If HomeApp renders and throws, page goes blank. Recommendation: wrap each in ErrorBoundary analogous to CreatorErrorBoundary.

2. **Silent sync failures opaque to user** â€” [project-storage.js](project-storage.js#L314) comment says "never block save on sync errors," but user has no indication sync is happening or failed. If SyncEngine is active, should emit a quiet status indicator or debug log visible in browser tools.

3. **No retry UI for transient errors** â€” If IndexedDB.open fails or worker crashes, no "Retry" button is offered. User must reload page manually. Recommendation: surface retry action in error modal for transient failures.

4. **localStorage quota silently swallowed** â€” [user-prefs.js](user-prefs.js#L231) catch-silently, so user doesn't know preferences aren't persisting. Recommendation: show a one-time banner warning if localStorage quota exceeded.

5. **No error classification for user** â€” All error messages are developer-facing or generic. Recommendation: categorize errors as "Network," "File," "Browser Limits," "Bug" to guide user troubleshooting.

6. **Tablet error visibility** â€” Toast notifications may render off-screen on small tablets if positioned absolutely. Recommendation: test toast positioning on 7" tablet viewport; consider centering toast or using different layout for mobile.

7. **Web Worker errors not isolated** â€” If generate-worker crashes, whole generation UX hangs. No timeout or fallback to CPU-side generation. Recommendation: implement 10s generation timeout; fall back to CPU-side k-means if worker doesn't respond.

8. **PDF import symbol detection fragile** â€” No error recovery if symbol matching fails partway through. User must retry entire import. Recommendation: log confidence scores; if low, show user a preview + manual symbol confirmation step.

---

## DISCOVERED.md appendix

The following errors were discovered in the codebase but have no explicit error handling or recovery:

- **Wake-lock acquisition failure** ([tracker-app.js](tracker-app.js#L770-L790)): Try-catch logs to console, toast shown ("Screen wake-lock not available"); recovery is silent fallback to no wake-lock.
- **Dock position persistence** ([tracker-app.js](tracker-app.js#L761-L763)): Try-catch on localStorage read/write; position reverts to default (40px) if load fails.
- **PDF logo fetch** ([pdf-export-worker.js](pdf-export-worker.js#L330)): Catch-silently; export continues without logo.
- **Style onboarding storage** ([tracker-app.js](tracker-app.js#L255)): Try-catch-silently on localStorage write; onboarding state lost if quota full.
- **SyncEngine device fingerprinting** ([sync-engine.js](sync-engine.js#L44-L52)): Try-catch-silently; defaults to "dev_unknown" if fingerprint fails.

---

## VERIFICATION TODO

- [ ] **VER-ERR-001 [P0]** â€” IndexedDB open fails: confirm app falls back to ephemeral state (no persist), not blank screen. Test in private browsing, storage-disabled profile.

- [ ] **VER-ERR-002 [P1]** â€” IndexedDB quota exceeded during save: confirm toast shown? Or silent failure? Trace [project-storage.js](project-storage.js#L327) to see if error event fires and is caught upstream.

- [ ] **VER-ERR-003 [P2]** â€” localStorage quota exceeded: confirm prefs revert to defaults (test by setting prefs in low-quota environment). Verify user is not warned.

- [ ] **VER-ERR-004 [P2]** â€” Malformed `.oxs` import: confirm error modal shows "Invalid OXS file: malformed XML" (not generic "Import failed"). Test with hand-crafted broken XML.

- [ ] **VER-ERR-005 [P1]** â€” Image processing worker crash: confirm error relayed to UI and shown in toast. Trigger by passing corrupted image data to generate-worker.

- [ ] **VER-ERR-006 [P0]** â€” PDF export pdf-lib load failure: confirm user sees clear error message, not blank page. Test with CDN down.

- [ ] **VER-ERR-007 [P1]** â€” PDF import password-protected: confirm error message specifically says "password-protected" (not generic "Failed to parse PDF"). Test with encrypted PDF.

- [ ] **VER-ERR-008 [P2]** â€” Service worker install-time cache miss: confirm one missing asset doesn't fully block SW install. Check console for "SW install: failed to cache" warnings.

- [ ] **VER-ERR-009 [P0]** â€” React CreatorApp render error: confirm error boundary catches and displays stack trace (not blank page). Inject error in CreatorApp component.

- [ ] **VER-ERR-010 [P2]** â€” StatsErrorBoundary catches broken chart: confirm chart section hides with error message, rest of dashboard remains functional. Inject error in one stats component.

- [ ] **VER-ERR-011 [P2]** â€” Brand ID collision (DMC 310 vs Anchor 310): confirm legacy pattern without brand namespace loads as DMC (implicit). Check that no user warning appears.

- [ ] **VER-ERR-012 [P1]** â€” Thread missing from stash: confirm shopping list shows "[ID] not in stash" or similar indicator (not blank/silent). Verify UI state when thread not found.

- [ ] **VER-ERR-013 [P1]** â€” SyncEngine network failure: confirm local save succeeds despite sync error. Check [project-storage.js](project-storage.js#L313-L314) sync call is wrapped in try-catch that never throws.

- [ ] **VER-ERR-014 [P3]** â€” Manager app loads without error boundary: confirm if ManagerApp throws, whole page blank (not graceful degradation). Test by triggering exception in ManagerApp render.

- [ ] **VER-ERR-015 [P2]** â€” Toast positioning on 7" tablet: confirm toast doesn't render off-screen in portrait mode. Test on mobile viewport (max-width 600px).

- [ ] **VER-ERR-016 [P3]** â€” Unhandled promise rejection in event handler: confirm rejection logged to console via `unhandledrejection` listener. No UI warning. Test by intentionally rejecting promise.

- [ ] **VER-ERR-017 [P1]** â€” Form field required validation: confirm NamePromptModal error message shown if user submits empty name. Check modal state management on save attempt.

- [ ] **VER-ERR-018 [P2]** â€” ImportWizard draft lost on quota error: confirm localStorage write failure doesn't show warning to user. Test by filling localStorage and refreshing wizard.

- [ ] **VER-ERR-019 [P0]** â€” Pattern v < 8 load attempt: confirm loadError state set, canvas remains empty. Test by manually creating old-version project in DevTools.

- [ ] **VER-ERR-020 [P2]** â€” Chart dimensions exceed 5000Ã—5000 in `.oxs`: confirm error message includes actual dimensions. Test with oversized KG-Chart XML.