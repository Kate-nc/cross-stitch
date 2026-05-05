# Cross-Cutting: Notifications, Toasts, & Feedback

> Phase 2 cross-cutting output.

## Scope

This specification catalogues all user-visible feedback mechanisms across the app, identifies where actions lack feedback, and prioritises gaps. Covers toast notifications, inline success/error indicators, confirmation dialogs, progress indicators, and loading states. Includes audit of destructive actions, async operations, and error handling to ensure no silent failures.

---

## Toast API (toast.js)

**Payload structure:**
```javascript
window.Toast.show({
  message: string,           // Required: user-facing message
  type: 'info'|'success'|'error'|'warning',  // Default: 'info'
  duration: milliseconds,    // Default: 6000; -1 = no auto-dismiss
  undoAction: function(),    // Optional: callback for Undo button
  undoLabel: string          // Default: "Undo"
})
```

**Severity colour mapping:**
- `success` â†’ `var(--success)` (green); left border accent
- `error` â†’ `var(--danger)` (red); left border accent
- `warning` â†’ `var(--warning)` (amber); left border accent
- `info` (default) â†’ `var(--accent)` (blue); left border accent

**Stacking behaviour:**
- Container: fixed bottom-centre, 24px safe-area offset
- Max visible: 3 (configurable via `UserPrefs.toastMaxVisible`, 1-10 range)
- Column-reversed stacking (newest at bottom, oldest fade first)
- Auto-dismiss: fade + slide animation (320ms)

**Icon rendering:**
- Prefers `window.Icons.{check,x,warning}()` SVGs (24Ã—24, 1.6 stroke, currentColor)
- Fallback: coloured pip (8Ã—8 circle) if Icons library not yet loaded

**Disabling:**
- User preference: `toastsEnabled` (default true) â€” errors always show
- Errors bypass preference setting

---

## Feedback Catalogue

### 1. Toast Notifications (Complete List)

| Action | File:Line | Type | Message | Duration | Undo? | Trigger |
|--------|-----------|------|---------|----------|-------|---------|
| **Backup download** | header.js:773 | error | "Backup failed: {e.message}" | 8000 | No | BackupRestore.downloadBackup() catch |
| **Backup trigger (Command Palette)** | command-palette.js:131 | error | "Backup failed: {e.message}" | 8000 | No | FileDownload action error |
| **Restore file validation** | header.js:450 | error | Toast (via ternary) | N/A | No | Invalid JSON or size check fails |
| **Restore parse error** | header.js:461 | error | "Invalid file: could not parse JSON." | 8000 | No | JSON.parse() fails on uploaded file |
| **Restore file import** | header.js:459 | error | "Restore failed: {err.message}" | 8000 | No | BackupRestore.restoreFromJSON() catch |
| **Restore: stash migration** | backup-restore.js:364 | error | "Restore: stash migration failed â€” some thread data may need a manual refresh." | 8000 | No | Stash Bridge write during restore |
| **Restore: project migration** | backup-restore.js:378 | error | "Restore: project migration failed â€” some projects may need a manual refresh." | 8000 | No | Project data repair during restore |
| **Sync download (export)** | header.js:798 | error | "Sync export failed: {e.message}" | 8000 | No | SyncEngine.downloadSync() catch |
| **Sync: no changes** | header.js:832 | info | "Nothing to sync â€” all projects are identical." | default | No | parts.length === 0 |
| **Sync complete** | header.js:839 | success | "Sync complete: {imported} imported, {merged} merged." | default | No | Sync operation succeeds |
| **Sync merge error** | header.js:841 | error | "Sync failed: {err.message}" | 8000 | No | SyncEngine.mergeSyncData() catch |
| **Sync import error** | header.js:844 | error | "Sync import failed: {err.message}" | 8000 | No | Parsing or validation fails |
| **Creator: colour replace load** | creator-main.js:841 | error | "Colour replace dialog failed to load." | default | No | Modal render fails |
| **Creator: adapt operation** | creator/AdaptModal.js:469 | error | "Adapt failed: {err && err.message}" | default | No | runAdaptation() or save promise rejects |
| **Creator: adapt success** | creator/AdaptModal.js:478 | success | "Adapted {n} cells" | default | No | Adapt completes |
| **Creator: adapt save error** | creator/AdaptModal.js:487 | error | "Save failed: {err && err.message}" | default | No | IDB save after adapt fails |
| **Creator: BulkAdd missing StashBridge** | creator/BulkAddModal.js:150 | error | "StashBridge is not available. Make sure stash-bridge.js is loaded." | 8000 | No | window.StashBridge not defined |
| **Creator: BulkAdd save error** | creator/BulkAddModal.js:170 | error | "Failed to save: {e.message}" | 8000 | No | StashBridge.saveThreads() catch |
| **Creator: PDF export symbol font** | creator/ExportTab.js:162 | error | "PDF export failed. Please refresh the page and try again." | 6000 | No | /symbol font/i.test(msg) |
| **Creator: PDF export bundle size** | creator/ExportTab.js:366 | success | "Bundle saved ({size} MB)" | 3000 | No | exportToZip() succeeds |
| **Creator: ShoppingList StashBridge** | creator/ShoppingListModal.js:159 | error | "StashBridge unavailable. Open the Stash Manager and try again." | default | No | window.StashBridge missing |
| **Creator: ShoppingList save** | creator/ShoppingListModal.js:172 | success | "Added {n} to Stash" | default | Yes | Mark threads as owned |
| **Creator: ShoppingList save error** | creator/ShoppingListModal.js:180 | error | "Could not add to Stash list: {e && e.message \|\| e}" | default | No | IDB write fails |
| **Creator: Palette swap no matches** | palette-swap.js:1255 | info | "No matching cells found." | default | No | Replace by colour finds 0 cells |
| **Home: Import error (file)** | home-app.js:486 | error | "Could not import: {err && err.message \|\| err}" | 10000 | No | ImportEngine or file parse fails |
| **Home: Sample pattern load error** | home-screen.js:1821 | error | "Could not load sample pattern" | default | No | Fetch or parse fails |
| **Home: Project card toast** | home-screen.js:740 | success/info | Custom message & type | default | No | showToast() utility function |
| **Manager: Archive thread** | manager-app.js:819 | success | "Archived {n} thread(s)" | default | Yes | Threads removed from inventory |
| **Manager: Remove thread** | manager-app.js:1196 | success | "Removed {n} thread(s)" | default | Yes | Threads deleted from stash |
| **Manager: Delete project error** | manager-app.js:1424 | error | "Could not capture project before delete â€” aborting." | default | No | Backup/save before delete fails |
| **Manager: Delete project success** | manager-app.js:1448 | success | "Deleted {project name}" | default | Yes | ProjectStorage.delete() completes |
| **Manager: Shopping list update** | manager-app.js:1577 | success | "Synced {n} items" | default | No | Stash deduction succeeds |
| **Manager: Shopping list update error** | manager-app.js:1585 | error | "Could not update shopping list" | default | No | IDB save fails |
| **Command Palette: generic action error** | command-palette.js:402 | error | "Action failed: {e && e.message \|\| 'unknown error'}" | default | No | Action handler throws |
| **Tracker: snapshot save error** | components.js:1102 | error | "Could not save snapshot â€” try again." | default | No | Canvas save or IDB write fails |
| **Coaching: coachmark idle** | coaching.js:388 | info | (from template) | 6000 | No | Coachmark step auto-advance |

**Total dispatch sites: 30+ locations across 14 files**

---

### 2. Inline Success States

| Component | Location | Display | Trigger | Status | Auto-hide |
|-----------|----------|---------|---------|--------|-----------|
| **SaveStatus badge** | header.js:641â€“700 (renders saveStatus prop) | "Savingâ€¦" (pending) â†’ "Saved âœ“" (saved) â†’ grey (error) | Creator auto-save controller (creator/saveStatus.js) | Shows state: idle\|pending\|saving\|saved\|error | Fades after 2.5s at 'saved' |
| **Adapt result count** | creator/AdaptModal.js (inline) | "Adapted N cells" | Adapt modal success | Toast (success type) | After default duration |
| **ShoppingList add badge** | creator/ShoppingListModal.js (badge count) | Green check icon + "Added N" | Thread mark-owned succeeds | Toast with undo | Default duration |
| **Manager archive count** | manager-app.js (inline) | "Archived N thread(s)" | Archive action completes | Toast (success) | Default duration |

### 3. Inline Error/Validation Messages

| Component | Location | Message | Validation | Type | Example |
|-----------|----------|---------|------------|------|---------|
| **Creator Sidebar warnings** | creator/Sidebar.js:23â€“35 | "Your grid is very small â€” cleanup may destroy details." | Grid < 40Ã—40 + cleanup enabled | Danger (red) banner | Cleanup level warning |
| **Creator Sidebar cleanup warning** | creator/Sidebar.js:26 | "Confetti cleanup level N is aggressive for a WxH grid." | Cleanup + grid interaction | Danger banner | Orphan removal aggressive |
| **Creator Sidebar confetti stat** | creator/Sidebar.js:35 | "Cleanup would remove ~N stitches (M% of pattern)." | Detail loss risk | Danger banner | High removal % |
| **Creator Pattern tab error** | creator/PatternTab.js:118 | "Quality score warning" | Pattern generation issues | Danger (inline strip) | Low match quality |
| **Creator Sidebar blend validation** | creator/Sidebar.js:529 | "Pick two different threads" | Blend mode: t1 === t2 | Error (red text) | Thread duplication |
| **Creator LegendTab stash status** | creator/LegendTab.js:200,276 | "Need to buy" (red) vs "Owned" (green) | Thread stash match | Colour-coded label | Material readiness |

### 4. Banner Notifications (Top-of-Page)

| Component | Location | Type | Visibility | Dismissible | Purpose |
|-----------|----------|------|------------|-------------|---------|
| **Creator confetti risk** | creator/PatternTab.js:118â€“133 | Danger strip (red bg, --danger-soft) | Always when > 1000 orphans | Yes (close button) | Alerts to major cleanup risk |
| **Creator pattern quality** | creator/Sidebar.js:900â€“912 | Warning/Danger strip | When score < 60 or issues present | Yes | Quality concerns |
| **Tracker realtime sync notification** | tracker-app.js (potential, not yet) | Info/warning strip | Pending | TBD | Real-time stash deduction |

### 5. Confirmation Dialogs (Destructive Actions)

| Action | Component | Type | Confirmation Text | Code | Styled? | Default Button |
|--------|-----------|------|-------------------|------|---------|-----------------|
| **Bulk delete projects** | home-screen.js:520â€“568 | BulkDeleteModal | Lists up to 5 names; asks "Delete N project(s)?" | styled via CSS + Overlay | âœ“ Yes | "Delete N projects" (danger colour) |
| **Sync folder stop** | preferences-modal.js:910 | window.confirm | "Stop watching the sync folder? Your patterns stay where they are." | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Restore full backup** | preferences-modal.js:948 | window.confirm | "Restoring will replace ALL of your patterns, stash and settings. Continue?" | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Delete all projects** | preferences-modal.js:961 | window.confirm | "This will delete EVERY pattern saved in this browser. Stash and settings kept. Are you sure?" | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Delete all stash+library** | preferences-modal.js:971 | window.confirm | "This will delete your entire thread stash and pattern library. Patterns in Creator kept. Are you sure?" | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Clear app cache** | preferences-modal.js:1220 | window.confirm | "This will clear cached app files and reload. Patterns and settings not affected. Continue?" | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Factory reset** | preferences-modal.js:1243 | window.confirm | "Factory reset erases ALL preferences and remembered chart positions, but keeps patterns and stash. Continue?" | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Export large PDF bundle** | creator/ExportTab.js:344 | window.confirm | "Bundle is roughly X MB. Download?" | window.confirm (not styled) | âœ— No | OK / Cancel |
| **ImportWizard discard** | creator/ImportWizard.js:67â€“70 (comment) | Implicit (Escape key warning planned) | "Unsaved work in import wizard â€” discard?" | Escape key handler comment | âœ— Deferred | "Discard" button |
| **Creator new project** | creator-main.js:811 | window.confirm | "Start a new project? Unsaved changes will be lost." | window.confirm (not styled) | âœ— No | OK / Cancel |
| **Creator regenerate pattern** | creator/Sidebar.js:1775 | window.confirm | "Regenerating will replace your current edits. Continue?" | window.confirm (not styled) | âœ— No | OK / Cancel |

**Gaps:** 7 of 10 use native `window.confirm()` (not styled; no app branding). Only `BulkDeleteModal` (home) is properly styled. P1 opportunity: replace all with styled Overlay modals.

### 6. Progress Indicators & Async Operations

| Operation | Worker/Async Pattern | Progress Type | UI Signal | Status Messages | Code Location |
|-----------|----------------------|----------------|-----------|-----------------|---------------|
| **PDF export** | pdf-export-worker.js (dedicated worker) | Progress messages (`stage`, `current`, `total`) | Spinner overlay (implicit) | "Savingâ€¦", stage names: cover, info, legend, chart-bw, chart-colour, index | creator/pdfExport.js; pdfExport.runExport() |
| **Pattern generation** | generate-worker.js (dedicated worker) | No progress messages sent (single shot) | Spinner overlay (implicit) | None visible during; "Generatingâ€¦" assumed | creator/generate.js; quantize + map pipeline |
| **Analysis** | analysis-worker.js (dedicated worker) | No progress messages (single shot) | Implicit loading during canvas interaction | None visible | creator/MagicWandPanel.js or similar |
| **Import** | import-engine/worker.js + UI ReviewModal | Progress callback in ctx | ReviewModal loading spinner | "Loadingâ€¦" + file format detected | import-engine/wireApp.js; ImportWizard.js |
| **Project save (IDB)** | ProjectStorage.save() via auto-save controller | saveStatus state machine | Badge state indicator (pending/saving/saved) | "Savingâ€¦" â†’ "Saved" (transient) | creator/saveStatus.js; header.js SaveStatusBadge |
| **Backup download** | BackupRestore.downloadBackup() | No explicit progress | Toast on error only | No feedback until error or complete | header.js:773 |
| **Restore import** | BackupRestore.restoreFromJSON() | No explicit progress; IDB migration | Toast on error | Error toasts only | header.js:459 |
| **Sync operation** | SyncEngine.mergeSyncData() | No explicit progress | Toast only | "Nothing to sync" / "Sync complete" / error | header.js:832â€“844 |
| **Stash deduction (Tracker)** | StashBridge write + Manager reconcile | Implicit IDB | Toast success/error | "Removed N thread(s)" with undo | manager-app.js:1448 |
| **File upload (Import)** | FileReader.readAsArrayBuffer() | No explicit progress | ReviewModal overlay (implicit) | ReviewModal hides while parsing | home-app.js import flow |

**Observations:**
- PDF export has structured progress reporting (stage names, current/total counters) but no UI currently displays it
- Pattern generation: silent (no progress visible) â€” user sees spinner only
- Analysis: silent
- IDB saves: saveStatus badge visible but sparse feedback
- Backup/Restore: zero progress indication; only error toasts if things fail

---

### 7. Loading Spinners

| Scenario | Component | Display | Trigger | Duration | Code |
|----------|-----------|---------|---------|----------|------|
| **Creator canvas loading** | creator/PatternCanvas.js (implicit) | Spinner overlay (CSS) | Pattern generation in progress | Until generation completes | creator-main.js render |
| **Tracker stats loading** | components.js:1879â€“1881 | "Loadingâ€¦" text | statsTab changes or ProjectStorage.get() in flight | Until project loaded | components.js StatsPanel |
| **Manager dashboard** | components.js:1699,1713 | "Loadingâ€¦" text + loading state | Dashboard mounts; ProjectStorage.listProjects() runs | ~100msâ€“1s typical | components.js LifetimeStats |
| **Tracker import dialog** | tracker-app.js (implicit) | Modal with loading state | File picked; ImportEngine runs | Until import preview ready | tracker-app.js handleImport |

---

### 8. Coachmarks (One-Time Guidance)

| Step | File | Trigger | Message | Icon | Dismiss | Next Step |
|------|------|---------|---------|------|---------|-----------|
| **firstStitch_creator** | coaching.js:387â€“395 | First time in Creator + pattern ready | "Make your first stitch to start tracking" (approx.) | Icons.* (lightbulb or check) | Auto (6s) or manual click | Coach next step or done |
| **firstStitch_tracker** | coaching.js (planned) | First time in Tracker + pattern open | Similar guidance | Icons.* | Auto or manual | Coach next step |

**Status:** Currently only creator step active; tracker deferred.

---

### 9. Hover Hints / Tooltips

| Element | Tooltip Text | Type | Code Location | Implementation |
|---------|--------------|------|---------------|-----------------|
| **Match quality delta-E badge** | "Lower means closer visual match" (approx.) | Inline help in HelpDrawer | help-drawer.js:94 | Text in Help tab (not interactive tooltip) |
| **Creator cleanup strength** | Description of gentle/balanced/thorough | Inline in Sidebar | creator/Sidebar.js:862â€“912 | Rendered as conditional warning banner |
| **SaveStatus badge** | "Savingâ€¦" / "Saved" | Status indicator | header.js SaveStatusBadge | Badge text via aria-label |

**Gap:** No interactive `<title>`, `aria-label`, or popover tooltips on interactive elements (sliders, buttons). Help content is centralized in Help Drawer.

---

### 10. Audible/Haptic Feedback

**Status:** None implemented. PWA environment does not have access to audio API or vibration API in typical contexts. **Out of scope** for this spec.

---

## Confirmation Dialog Audit (Destructive Actions)

**Destructive actions = any that deletes, resets, or permanently removes data.**

| Action | Location | Confirmed? | Dialog Type | Issue | Severity |
|--------|----------|-----------|-------------|-------|----------|
| âœ“ Bulk delete projects | home-screen.js | Yes | BulkDeleteModal (styled) | â€” | â€” |
| âœ— Delete single project (from card menu) | home-screen.js (card detail) | **Missing** | No confirmation | User can click Delete without warning | **P1** |
| âœ— Stop watching sync folder | preferences-modal.js:910 | Yes | window.confirm (not styled) | Browser native; no app branding | **P2** |
| âœ— Restore full backup | preferences-modal.js:948 | Yes | window.confirm (not styled) | Browser native; destructive (overwrites all) | **P2** |
| âœ— Delete all projects (factory reset) | preferences-modal.js:961 | Yes | window.confirm (not styled) | Browser native | **P2** |
| âœ— Delete all stash+library (factory reset) | preferences-modal.js:971 | Yes | window.confirm (not styled) | Browser native | **P2** |
| âœ— Clear app cache | preferences-modal.js:1220 | Yes | window.confirm (not styled) | Browser native | **P3** (least destructive) |
| âœ— Factory reset prefs | preferences-modal.js:1243 | Yes | window.confirm (not styled) | Browser native | **P3** |
| âœ“ Archive threads (Manager) | manager-app.js:1448 | Yes | Toast with Undo | â€” | â€” |
| âœ“ Remove threads (Manager) | manager-app.js:1448 | Yes | Toast with Undo | â€” | â€” |
| âœ“ Delete pattern (Manager) | manager-app.js:1424â€“1448 | Yes | Toast with Undo after capture | â€” | â€” |
| âœ— Clear all edits in Creator | creator/Sidebar.js:1775 | Yes | window.confirm (not styled) | Regenerate pattern; asks about edits | **P2** |
| âœ— Start new project in Creator | creator-main.js:811 | Yes | window.confirm (not styled) | "Unsaved changes will be lost" | **P2** |

**Summary:**
- **3/13 properly confirmed** (styled modals + undo toasts)
- **9/13 use window.confirm** (browser native, not branded, inconsistent UX)
- **1/13 missing confirmation entirely** (single project delete from card)

---

## Async-Action Progress Audit (Worker & IDB Operations)

| Async Action | File | Progress Shown? | User Feedback | Duration Typical | Issue |
|--------------|------|-----------------|----------------|------------------|-------|
| PDF export | pdf-export-worker.js | Worker sends progress; **UI doesn't display** | Only error toast on failure | 3â€“10s | **P1 GAP**: Progress events ignored |
| Pattern generation | generate-worker.js | No progress events | Spinner + no text | 1â€“5s | **P2**: Long operations feel unresponsive |
| Image analysis (Magic Wand) | analysis-worker.js | No progress | Silent (canvas interaction frozen briefly) | <1s | **P3**: Acceptable for <1s |
| Import pipeline | import-engine/worker.js | Progress callback in ctx | ReviewModal shows "Loadingâ€¦" text | 1â€“3s | âœ“ OK |
| Project auto-save (IDB) | creator/saveStatus.js | Yes: saveStatus badge | "Savingâ€¦" â†’ "Saved" badge | 500msâ€“1s | âœ“ OK |
| Backup download | BackupRestore.js | No progress | Error toast only | 1â€“2s | **P2**: No indication until error |
| Restore JSON import | BackupRestore.js | No progress | Error toast only | 2â€“5s | **P2**: Silent success (data visible when done) |
| Sync merge | SyncEngine.js | No progress | Toast at end | 2â€“10s | **P2**: Silent during operation |
| Stash deduction (Tracker) | StashBridge | No progress | Toast success at end | <500ms | âœ“ Acceptable |

---

## Completion-Acknowledgement Audit (Silent Completions)

| Action | Completes Silently? | Feedback Given | Issue | Severity |
|--------|-------------------|-----------------|-------|----------|
| Backup download (File menu) | Yes | None (file save is OS-level) | User must check Downloads folder | **P3** |
| **Project restore from backup** | Yes (success case) | Toast only on error | If valid JSON, no "Restore complete" message | **P2** |
| **Sync complete** | No | Toast: "Sync complete: N imported, M merged" | âœ“ Good |
| **Backup auto-complete** | Yes (assumed) | No feedback | Silent success in File menu | **P2** |
| **Project switch (dropdown)** | Yes | Page navigation only | Stitch.html loads; implicit feedback | **P3**: Acceptable (page load is observable) |
| **Thread archive** | No | Toast: "Archived N thread(s)" with undo | âœ“ Good |
| **Pattern delete (Manager)** | No | Toast: "Deleted {name}" with undo | âœ“ Good |
| **Creator pattern save** | No | Badge: "Saved" (transient) | âœ“ Good (though transient) |
| **Command Palette action execute** | Varies | Error toast on failure; silence on success | **P2 GAP**: Many actions silent if successful |

---

## Error-Feedback Audit (Silent Error Paths)

| Error Path | Component | Currently Surfaced? | Hidden? | Severity |
|------------|-----------|-------------------|---------|----------|
| PDF worker crash | pdfExport.js | Yes (error event â†’ toast) | âœ“ No | â€” |
| Generate worker crash | creator/generate.js | **Unknown** (needs investigation) | ? | **P2** |
| Analysis worker crash | analysis-worker.js | **Unknown** | ? | **P2** |
| Import worker crash | import-engine/worker.js | Toast error message | âœ“ No | â€” |
| IDB transaction failure (save) | creator/useCreatorState | Toast error message (in reducer) | âœ“ No | â€” |
| IDB transaction failure (load) | helpers.js saveProjectToDB | console.error only; **no user toast** | **Yes** | **P2** |
| Stash migration error (restore) | backup-restore.js:364 | Toast error message | âœ“ No | â€” |
| Project migration error (restore) | backup-restore.js:378 | Toast error message | âœ“ No | â€” |
| File import parse error (home) | home-app.js:486 | Toast error message | âœ“ No | â€” |
| Colour replace modal render error | creator-main.js:841 | Toast: "Colour replace dialog failed to load." | âœ“ No | â€” |
| Canvas snapshot save error | components.js:1102 | Toast: "Could not save snapshot â€” try again." | âœ“ No | â€” |
| Action handler exception (Command Palette) | command-palette.js:402 | Toast: "Action failed: {message}" | âœ“ No | â€” |
| Sync merge exception | header.js:841 | Toast: "Sync failed: {message}" | âœ“ No | â€” |

**Summary:**
- Most errors ARE surfaced via toast
- **One critical gap:** IDB save failures in background operations (helpers.js) log to console but don't alert user
- Workers: good error surface overall

---

## DISCOVERED.md Appendix

### House Rule Violations (P3 Emoji/Unicode TODOs)

The following toasts or confirmations contain emoji-like unicode characters and should use `Icons.*` SVGs instead:

1. **SaveStatus badge:** "Saved âœ“" â€” should use `Icons.check()` instead of unicode `âœ“`
   - Citation: header.js SaveStatusBadge component (renderProperty logic)
   - Fix: Replace text "Saved" with icon-only badge or use `Icons.check() + " Saved"`

2. **Adapt result:** "Adapted N cells" toast â€” currently clean (no emoji)
   - No action needed

3. **Window.confirm() dialogs:** All 7 instances use browser native OK/Cancel buttons (not emoji, but inconsistent with app style)
   - Citation: preferences-modal.js:910, 948, 961, 971, 1220, 1243; creator-main.js:811; creator/Sidebar.js:1775; creator/ExportTab.js:344
   - Fix: Replace with styled Overlay modals (P2 effort)

### Missing Toast Messages (Content Audit)

All toasts currently use British English spelling âœ“ (Colour, not Color; Organisation not Organization).
No placeholder text like "{n}" rendered directly; all messages use string concatenation.

### Tablet Visibility Concerns (P2)

Toast container: `bottom: max(24px, env(safe-area-inset-bottom))`
- âœ“ Correct for landscape (avoids on-screen keyboard)
- On tablet in landscape with iOS keyboard open: keyboard could still occlude if it's wider than safe-area; consider `bottom: max(24px, calc(env(safe-area-inset-bottom) + 100px))` for extra margin

---

## VERIFICATION TODO

### Confirmation Dialog Replacement (P1 Defect)

- [ ] `VER-FB-001` [P1] â€” BulkDeleteModal correctly lists â‰¤5 project names; click Delete executes; Escape or Cancel closes without action. **Test:** select 3, 5, 10 projects and verify modal text.

- [ ] `VER-FB-002` [P1] â€” Single project delete from card menu ([home-screen.js](home-screen.js) card detail panel) currently shows NO confirmation. **Implement:** styled modal matching BulkDeleteModal style. **Test:** delete one project from card menu; verify styled modal appears before deletion.

- [ ] `VER-FB-003` [P1] â€” Replace 7 `window.confirm()` calls in preferences-modal.js and creator/* with styled Overlay modals (variant="dialog"). Apply `BulkDeleteModal` pattern. **Test each:**
  - Stop watching sync folder â†’ custom message
  - Restore full backup â†’ custom message
  - Delete all projects â†’ custom message
  - Delete all stash+library â†’ custom message
  - Clear app cache â†’ custom message
  - Factory reset prefs â†’ custom message
  - Creator new project â†’ custom message
  - Creator regenerate pattern â†’ custom message
  - Verify Escape/Cancel closes without action.

### Toast Content & Icon Audit (P3 House Style)

- [ ] `VER-FB-004` [P1] â€” SaveStatus badge displays "Saved âœ“" using unicode `âœ“`. The badge is **user-facing** (visible in the Header context bar after every auto-save) so this is an AGENTS.md house-rule violation, not a cosmetic. Replace with `Icons.check()` SVG + "Saved" text. **Test:** wait for auto-save to complete; verify SVG check icon (not unicode glyph) appears. _(Severity raised from P3 to P1 per VER-CONF-003 / VER-CONF-007.)_

- [ ] `VER-FB-005` [P3] â€” All other toasts audited: confirm no emoji/unicode pictograms (âœ“ âœ— â†’ â† âš  â„¹) in message strings. Approved characters: alphanumeric, punctuation, emoji in data values (thread counts) only.

### Progress Feedback for Async Operations (P1 & P2)

- [ ] `VER-FB-006` [P1] â€” PDF export worker sends `progress()` messages (`stage`, `current`, `total`). **Verify:** progress events are received by main thread; **implement UI:** render a progress bar or % text in the export modal. **Test:** export a complex 200Ã—200 pattern; observe progress updates every 1â€“2 pages.

- [ ] `VER-FB-007` [P2] â€” Pattern generation (generate-worker.js) has no progress reporting. **Consider:** add rough progress estimates (e.g., "Quantizingâ€¦" â†’ "Ditheringâ€¦" â†’ "Cleanupâ€¦") as named messages. **Test:** generate with large image; verify user sees incremental feedback.

- [ ] `VER-FB-008` [P2] â€” Image analysis (analysis-worker.js) completes silently. If duration >1s observed in practice: add progress callback similar to import-engine. **Test:** magic wand on very large canvas; measure duration; if >1s, add "Analysingâ€¦" feedback.

- [ ] `VER-FB-009` [P2] â€” Backup/restore operations (BackupRestore.downloadBackup, restoreFromJSON) have no progress indication. **Implement:** modal with "Reading backupâ€¦" / "Migrating dataâ€¦" text during IDB migration. **Test:** download backup; restore from file; verify modal visible entire time.

- [ ] `VER-FB-010` [P2] â€” Sync operation (SyncEngine.mergeSyncData) silent during merge. **Implement:** toast "Syncingâ€¦" that persists until completion, then replaces with "Sync complete" or error. **Test:** trigger sync with many changes; verify "Syncingâ€¦" visible.

### Completion Feedback (P2)

- [ ] `VER-FB-011` [P2] â€” Backup download (File menu â†’ Backup) completes silently. After browser saves file, **show toast:** "Backup downloaded successfully" (success type, 3s auto-dismiss). **Test:** download backup; verify toast appears.

- [ ] `VER-FB-012` [P2] â€” Project restore from valid backup file completes silently. **Implement toast:** "Restore complete: {n} projects imported" (success type, persistent or 4s). **Test:** select backup file; verify completion toast after success (even if no data changed).

- [ ] `VER-FB-013` [P2] â€” Command Palette actions that complete successfully (e.g., "Duplicate project", "Export stats") are silent. Audit all 20+ action handlers in command-palette.js and flag which should display success feedback. **Implement:** toast for high-impact actions (delete, export, sync). **Test:** execute 3 actions; verify sensible feedback for each.

### Error-Feedback Coverage (P2)

- [ ] `VER-FB-014` [P2] â€” IDB save failures in helpers.js `saveProjectToDB()` currently console.error only. **Implement:** catch error in all callers; dispatch toast "Could not save project â€” try again." **Test:** fill disk / simulate IDB quota; verify error toast appears.

- [ ] `VER-FB-015` [P2] â€” Generate/Analysis worker crashes: **verify** worker.onerror handler exists and surfaces error. **Test:** inject syntax error in generate-worker.js; verify error toast (not silent crash).

- [ ] `VER-FB-016` [P2] â€” File upload parse errors during import: **verify** all error paths (invalid PDF, corrupt JSON, unsupported format) show user-facing toast with specific error reason. **Test:** import malformed .oxs file; verify descriptive error toast.

### Undo Coverage (P1)

- [ ] `VER-FB-017` [P1] â€” All destructive actions that can be reversed must offer `undoAction` callback in toast. Audit: delete project, remove thread, archive thread, clear edits (if implemented). **Test:** delete a thread; click Undo button within 5s; verify thread restored and "Undone" toast appears.

**Pattern clarification (Phase 3 / VER-CONF-006):** `undoAction` and `retryAction` are **distinct** Toast button patterns and MUST NOT be conflated:

- `undoAction` â€” a successful destructive operation completed; the toast offers to **restore** the previous state. Used for delete/archive/clear. Implies the operation succeeded and the user changed their mind.
- `retryAction` â€” an attempted operation **failed**; the toast offers to **re-run** the operation. Used for preview generation, network/sync, file import errors. Implies the user still wants the operation to succeed.

These have different semantics, different placement (success toast vs error toast), and different button labels. Future code that adds either MUST pick the correct one. See `loading-empty-states.md` for retry usages and the `VER-FB-018` audit below for undo usages.

- [ ] `VER-FB-018` [P1] â€” Undo button in toast (if undoAction provided) calls callback and shows "Undone" success toast. **Test:** execute 3 different undo actions; verify each restores data and shows feedback.

### Tablet Layout (P2 Toast Visibility)

- [ ] `VER-FB-019` [P2] â€” Toast container on iPad landscape with on-screen keyboard present: verify toast NOT occluded by keyboard. Test bottom safe-area adjustment. **Test:** open manager on iPad in landscape; trigger a thread archive toast; open keyboard; verify toast visible above keyboard.

- [ ] `VER-FB-020` [P2] â€” Multiple toasts stack correctly on tablet (max 3 visible). Narrow viewport doesn't clip text. **Test:** trigger 3 toasts on 375px-wide viewport; verify all 3 visible and readable.

### Toast Preference Enforcement (P2)

- [ ] `VER-FB-021` [P2] â€” User disables toasts via Preferences (toastsEnabled = false). **Verify:** all non-error toasts suppressed; errors still show. **Test:** disable toasts â†’ perform archive action â†’ verify no success toast; perform invalid restore â†’ verify error toast still shows.

### Inline Validation Messages (P1)

- [ ] `VER-FB-022` [P1] â€” Creator Sidebar cleanup warnings correctly display when confetti cleanup level + grid size are risky. **Test:** set grid to 30Ã—30, cleanup to "thorough"; verify danger banner appears with specific stitch-loss estimate.

- [ ] `VER-FB-023` [P1] â€” Creator Legend stash status colour-coded correctly: owned = green, partial = amber, needed = red. **Test:** add threads to pattern; mark some as owned; verify Legend thread rows colour-coded by stash status.

### Coachmark Lifecycle (P2)

- [ ] `VER-FB-024` [P2] â€” First-time Creator user sees coachmark "Make your first stitch" after pattern generated. Auto-dismisses after 6s or on click. **Test:** new browser; generate pattern in Creator; verify coachmark appears; click to dismiss and verify it doesn't re-appear on reload within 24h.

- [ ] `VER-FB-025` [P2] â€” Tracker first-stitch coachmark (if implemented): follows same lifecycle. **Test:** first-time Tracker user; verify coachmark after pattern load.

### House Style Enforcement (P3)

- [ ] `VER-FB-026` [P3] â€” All user-facing message strings in toasts, confirmations, and inline text use British English spelling (colour, organisation, stash, etc.). **Audit:** grep for "color", "organization", "inventory" (if used). Replace with "colour", "organisation", if needed.

- [ ] `VER-FB-027` [P3] â€” Coachmark messages use Icons.* SVGs for status indicators (not emoji). **Test:** inspect coaching.js rendered output; verify SVG icons, not emoji.

### Cross-Cutting Integration (P2)

- [ ] `VER-FB-028` [P2] â€” Toast notifications respect user's reduced-motion preference. If `prefers-reduced-motion: reduce`, suppress animation but keep message visible. **Test:** enable reduced motion OS setting; trigger toast; verify no fade/slide animation.

- [ ] `VER-FB-029` [P2] â€” Confirmation dialogs (Overlay variant="dialog") respect focus trap and keyboard: Escape closes, Tab cycles buttons. **Test:** open any styled confirmation (after P1 refactor); press Escape â†’ closes; Tab â†’ cycles between buttons; verify Enter activates focused button.

- [ ] `VER-FB-030` [P2] â€” All modals/dialogs have proper aria-label or aria-labelledby. **Test:** navigate with screen reader; verify purpose is announced.
