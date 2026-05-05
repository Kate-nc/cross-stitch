# Cross-Cutting: Authentication & Session Lifecycle

> Phase 2 cross-cutting output. Note: no traditional auth in this PWA;
> see [Project Context](../00_PROJECT_CONTEXT.md). This doc covers the session-like analogues
> that implement user continuity, PWA lifecycle, optional file-based sync, and feature gating.

---

## Scope & non-goals

**IN SCOPE:**
- Active project as the "session" concept: lifecycle, storage, recovery, multi-tab race conditions
- Service Worker lifecycle and user experience of deployments
- File-based sync engine (sync-engine.js) and its optional opt-in design
- Feature flags / render-gated UI (experimental.* UserPrefs)
- Cross-tab event propagation and known gaps (localStorage vs IndexedDB vs custom events)

**OUT OF SCOPE:**
- OAuth / account management (none exists)
- Backend authentication (app is fully client-side)
- Role-based access control (no users/roles; per-device only)
- Push notifications / remote notifications (not applicable to client-side-only PWA)

---

## Active project as "session"

The "active project" is the closest analogue to a user session in this fully client-side app.
It represents which pattern the user is currently working on and persists across browser
restarts via `localStorage` and project data via IndexedDB.

### Storage & lifecycle

- **Pointer storage**: `localStorage` key `crossstitch_active_project` holds a project ID string (e.g. `"proj_1712345678"`)
  - Written by `ProjectStorage.setActiveProject(id)` ([project-storage.js](../../project-storage.js):461)
  - Read by `ProjectStorage.getActiveProjectId()` ([project-storage.js](../../project-storage.js):465)
  - Cleared by `ProjectStorage.clearActiveProject()` ([project-storage.js](../../project-storage.js):472)
- **Project data storage**: IndexedDB `CrossStitchDB` (v3), `projects` store
  - Keyed by project ID
  - Contains full pattern, tracking state, sessions, metadata
- **Pointer initialization**: 
  - When app loads, each page ([home.html](../../home.html), [create.html](../../create.html), [stitch.html](../../stitch.html), [manager.html](../../manager.html)) reads active project via `ProjectStorage.getActiveProjectId()`
  - If pointer is set but project is deleted, `getActiveProject()` returns `null`
  - Home page has self-healing logic: if pointer exists but project missing, clear pointer ([home-app.js](../../home-app.js):894â€“903)

### Multi-tab behaviour

**Scenario: user opens create.html in Tab A, then navigates to tracker in Tab B**

1. Tab A sets active project to `proj_X` via `ProjectStorage.setActiveProject('proj_X')` (writes to localStorage)
2. localStorage write fires **`StorageEvent`** (automatic, browser-native) only **on other tabs** â€” not on the writing tab
3. Tab B receives `StorageEvent` on `window`, sees `crossstitch_active_project` changed
4. **CURRENT STATE**: Tracker-app does NOT listen to `StorageEvent` for active project changes
5. **RESULT**: Tab B continues with whatever active project ID it read on page load; does NOT reflect Tab A's change until manual refresh
6. **KNOWN GAP** (P2): Cross-tab active project changes are silent; no live update

**Related**: home-app.js does **not** listen to `StorageEvent` for project list changes either. Projects added in Manager (Manager â†’ "New pattern") trigger `cs:projectsChanged` event, which home-app.js **does** listen for ([home-app.js](../../home-app.js):1008).

### Deletion & orphaned pointer

- When a project is deleted via `ProjectStorage.delete(id)`:
  - If it is the active project, `clearActiveProject()` is called automatically ([project-storage.js](../../project-storage.js):400)
  - If it is NOT the active project, pointer is left alone
- **Edge case** (P2): if active project is deleted in Tab A while Tab B has that project open in Tracker:
  - Tab B does not receive a notification
  - Tracker tries to load pattern on next save or reload â†’ IndexedDB get returns null â†’ UI should gracefully handle "project not found"
  - **VERIFICATION ITEM**: Tracker gracefully handles null active project load

---

## Service worker lifecycle

The PWA uses a [Cache-versioned](../../sw.js) Service Worker to intercept requests and manage offline support.
The cache version is a string like `v40` that bumps on each deploy; the Service Worker is the **primary mechanism
for delivering new code** to users.

### Lifecycle & user experience

**Install phase:**
- SW registers on window `load` event ([sw-register.js](../../sw-register.js))
- `navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })`
- SW's `install` event ([sw.js](../../sw.js):88â€“107):
  - Opens cache with versioned name (e.g. `'cross-stitch-cache-v40'`)
  - Pre-caches all static assets (HTML, JS, CSS, CDN scripts, images) individually
  - Each asset failure is caught and logged, but install continues (partial failure allowed)
  - Calls `self.skipWaiting()` to skip waiting in the old SW queue

**Activate phase:**
- SW's `activate` event ([sw.js](../../sw.js):109â€“122):
  - Deletes all old caches (any name != `CACHE_NAME`)
  - Calls `self.clients.claim()` to immediately take control of all pages

**Controller change & reload:**
- When a new SW activates and claims clients, browser fires **`controllerchange`** event on `window.navigator.serviceWorker.container`
- [sw-register.js](../../sw-register.js) listens for this and reloads the page one time (guarded by `refreshing` flag to prevent loops):
  ```javascript
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
  ```
- **User experience**: 
  - User has page open when new code is deployed
  - SW finishes installing, activates, claims the page
  - Page automatically reloads (full page load from network + fresh cache)
  - User sees updated UI with new code

**Update polling:**
- sw-register.js checks for new SW every 10 minutes:
  ```javascript
  setInterval(() => { reg.update().catch(() => {}); }, 10 * 60 * 1000);
  ```
- If an update is found, new SW installs & queues; on next page interaction or visibility change,
  the activator runs and triggers the `controllerchange` reload

### Cache versioning & deployment strategy

- Current cache version: `v40` (as of codebase snapshot)
- **How to deploy**: bump `CACHE_NAME` in [sw.js](../../sw.js) from `v40` to `v41`
- **What gets cached**:
  - All HTML entry points (home.html, create.html, stitch.html, manager.html, index.html)
  - All local app JS (helpers.js, user-prefs.js, project-storage.js, tracker-app.js, creator/bundle.js, etc.)
  - All CSS (styles.css)
  - All CDN scripts (React 18, ReactDOM 18, Babel, pako, pdf.js)
  - All static assets (icons, fonts)
- **What is NOT pre-cached**:
  - embroidery.html + embroidery.js â€” marked as experimental (opt-in); cached stale-while-revalidate on first visit ([sw.js](../../sw.js):37â€“39, commentary on perf-6)

### Offline support

- **Navigation requests** (HTML pages): network-first â†’ cache fallback. If network fails and page not cached, serve `./index.html` as fallback
- **CDN scripts/styles** (pinned versions): cache-first (immutable by version)
- **Local same-origin assets** (app JS): stale-while-revalidate (new versions picked up on next reload)

---

## Cloud sync session (if any)

**CRITICAL**: sync-engine.js is **FILE-BASED SYNC**, not cloud-based with login tokens. Users manually export/import `.csync` files.

### Architecture

- **Format**: [sync-engine.js](../../sync-engine.js) exports compressed files (`pako.deflate`) in JSON format with metadata
- **No authentication**: no login, no tokens, no expiry, no cloud service
- **Storage**: files are exported to user's Downloads folder (browser download) and imported via file picker
- **Transport**: user manually uploads/shares the `.csync` file (Dropbox, Google Drive, email, USB stick, etc.)
- **Device identity**: 
  - Each device gets a device ID (`dev_` + timestamp + random suffix) stored in `localStorage` (key: `cs_sync_deviceId`)
  - Device name is user-editable and stored in localStorage (key: `cs_sync_deviceName`)
  - Device ID/name are embedded in exported sync files for merge conflict UI

### Export & import flow

**Export:**
- User triggers export via Preferences modal or File > Export
- [sync-engine.js](../../sync-engine.js) reads all projects from IndexedDB + stash from Stash Manager DB
- User prefs are **selectively** synced based on `SYNC_PREF_ALLOWLIST`:
  - Synced: designer name/logo/contact, units, currency
  - **NOT synced**: `crossstitch_active_project`, sync state, per-device UI prefs
- Export generates `.csync` file with metadata:
  - `_format: "cross-stitch-sync"`, `_version: 1`
  - `_deviceId`, `_deviceName`, `_createdAt`, `_mode` (full | incremental)
  - Project fingerprints computed via `computeFingerprint(project)` to detect chart changes vs tracking-only changes
- Browser downloads file as `.csync` blob

**Import:**
- User picks a `.csync` file via file picker
- Sync engine **classifies** remote projects:
  - `"identical"` â€” same ID and `updatedAt`; skip
  - `"new-remote"` â€” project ID not in local DB; add
  - `"merge-tracking"` â€” same chart (fingerprint match), different tracking progress; merge `done` arrays
  - `"conflict"` â€” same ID but different chart; resolve per `sync.conflictBehaviour` pref (auto-merge-safe | always-ask | silent-lww)
- Conflicts trigger conflict UI for user to choose keep-local vs keep-remote
- Import writes merged projects back to IndexedDB

### Sync preferences

- `sync.includeStash` (default true) â€” include Stash Manager threads in export
- `sync.includePrefs` (default false) â€” include user preferences (not per-device state)
- `sync.includePalettes` (default true) â€” include custom palettes
- `sync.conflictBehaviour` (default "auto-merge-safe") â€” conflict resolution strategy
- `sync.pollIntervalSec` â€” NOT CURRENTLY USED; reserved for future cloud sync
- `sync.firstTimeWizardComplete` â€” onboarding flag for sync setup

### Known limitations & gaps

- **No real-time sync**: files must be manually exported/imported (no automatic cloud polling)
- **No token storage/refresh**: N/A (file-based)
- **No authentication surface**: no login UI
- **No backend API**: sync is entirely client-side file operations
- **Multi-device merge is lossy**: if two devices create the same-named project independently, import sees them as separate projects (no intelligent deduplication by name)
- **Conflict UI incomplete** (P2): `sync.conflictBehaviour: "always-ask"` may not have full UI wired; needs verification

---

## Feature flags / permission analogues

Since there are no users/roles, feature gates are purely about **opt-in experimental features**
and **rendering based on user preferences**.

### Experimental (opt-in) UserPrefs

| Pref | Default | Purpose | Surfaces |
|---|---|---|---|
| `experimental.importWizard` | `false` | Enable 5-step guided image-import wizard (C7) | Creator: Import modal replaced with wizard flow |
| `experimental.embroideryTool` | `false` | Surface link to embroidery.html planner | Creator sidebar footnote link; embroidery.html opt-in splash |

**Implementation**: these prefs are read in app code (e.g. creator-main.js) and control conditional rendering:
```javascript
if (window.UserPrefs && window.UserPrefs.get('experimental.embroideryTool')) {
  // render embroidery tool link
}
```

**Scope**: experimental features are subject to breaking changes and may be removed without notice.

### Feature-gated UI (non-experimental rendering gates)

The following prefs control visibility/behaviour of stable UI:

| Pref | Values | Controls | EL-ID reference |
|---|---|---|---|
| `a11yHighContrast` | bool | High-contrast theme variant | Home + all pages (CSS media query mirror) |
| `a11yReducedMotion` | bool | Disable animations (CSS prefers-reduced-motion) | All pages via styles.css |
| `a11yDarkMode` | system \| light \| dark | Theme choice | All pages; Header theme toggle |
| `a11yFontScale` | s \| m \| l \| xl | Font size scaling | All pages (CSS --font-scale variable) |
| `trackerLeftSidebarMode` | hidden \| rail \| open | Left sidebar collapse state | SCR-040 (Tracker); left rail hamburger |
| `trackerProjectRailCollapsed` | bool | Project rail collapse (tablet/desktop) | SCR-040 (Tracker right rail) |
| `homeShowCompleted` | bool | Show 100%-complete projects in list | SCR-001 (Home > Projects tab) |
| `creator.pdfWorkshopTheme` | bool | Workshop print theme on PDF export (opt-in; default OFF for PK compat) | Creator: Export > PDF > theme choice |

**CONSTRAINTS**:
- `creator.pdfWorkshopTheme`: **DO NOT MODIFY** [pdf-export-worker.js](../../pdf-export-worker.js), [creator/pdfChartLayout.js](../../creator/pdfChartLayout.js), or [creator/pdfExport.js](../../creator/pdfExport.js) without explicit Pattern Keeper compatibility regression check
- `a11yReducedMotion`: mirrors OS `prefers-reduced-motion` by default; CSS animations respect the `--motion` token conditionally

### Onboarding coaching (conditional render gates)

Onboarding coachmarks are gated by `onboarding.coached.*` prefs; when `false`, the coachmark shows.
Dismissed by user interaction, preference set to `true`, and `cs:prefsChanged` dispatched.

| Pref | Coachmark location | Phase |
|---|---|---|
| `onboarding.coached.firstStitch_creator` | Creator toolbar "Mark" button | Phase 1 (active) |
| `onboarding.coached.firstStitch_tracker` | Tracker palette colour on first mark | Phase 1 (active) |
| `onboarding.coached.import` | Import wizard first step | Phase 2 (reserved) |
| `onboarding.coached.undo` | Undo button / history | Phase 2 (reserved) |
| `onboarding.coached.progress` | Tracker progress UI | Phase 2 (reserved) |
| `onboarding.coached.save` | Project save / checkpoint | Phase 2 (reserved) |

---

## Cross-tab consistency

Each page ([home.html](../../home.html), [create.html](../../create.html), [stitch.html](../../stitch.html), [manager.html](../../manager.html))
runs as a separate browser context. IndexedDB is **shared** (all tabs see the same projects DB), but state updates are
**not automatically broadcast** across tabs â€” explicit event dispatch is required.

### Events that broadcast across tabs (automatic IndexedDB changes)

These events are dispatched **automatically** whenever their data changes:

- **`cs:projectsChanged`** â€” fired by `ProjectStorage.save()` ([project-storage.js](../../project-storage.js):320, 427)
  - Detail: `{ id: 'proj_X', timestamp: ... }` (not currently populated, but structure reserved)
  - Listeners: Home ([home-app.js](../../home-app.js):1008), Tracker ([tracker-app.js](../../tracker-app.js):467)
  - Effect: refetch project list from IndexedDB (live sync)
  
- **`cs:stashChanged`** â€” fired by `StashBridge` when Stash Manager threads change ([stash-bridge.js](../../stash-bridge.js):54â€“61)
  - Detail: none (just a signal)
  - Listeners: Tracker ([tracker-app.js](../../tracker-app.js):1593, 1736), Home ([home-app.js](../../home-app.js):1011)
  - Effect: reload stash state (inventory, shopping list, palette)

- **`cs:patternsChanged`** â€” fired by `StashBridge` when Manager's pattern library changes ([stash-bridge.js](../../stash-bridge.js):68â€“71)
  - Detail: none
  - Listeners: Home ([home-app.js](../../home-app.js):1010)
  - Effect: refetch pattern library

- **`cs:backupRestored`** â€” fired after backup is imported ([backup-restore.js](../../backup-restore.js):391)
  - Detail: restoration summary object
  - Listeners: Home ([home-app.js](../../home-app.js):1009)
  - Effect: full refresh

### Events that do NOT propagate across tabs (manual dispatch required)

**`cs:prefsChanged`** â€” fired **only by the tab that makes the change**; other tabs do NOT receive it.

- **Why**: UserPrefs stores to localStorage, but `UserPrefs.set()` does not emit an event
- **Responsibility**: Callers of `UserPrefs.set()` **must manually dispatch** `cs:prefsChanged`
- **Current implementors**:
  - preferences-modal.js ([preferences-modal.js](../../preferences-modal.js):38â€“45) â€” after each pref change
  - header.js ([header.js](../../header.js):402) â€” dark mode toggle
  - coaching.js ([coaching.js](../../coaching.js):65, 382) â€” onboarding dismiss
  - tracker-app.js ([tracker-app.js](../../tracker-app.js):6072) â€” canvas texture toggle
- **Multi-tab scenario**: 
  - Tab A: user toggles dark mode in Header â†’ `UserPrefs.set('a11yDarkMode', 'dark')` + dispatch `cs:prefsChanged`
  - Tab A's theme updates immediately
  - Tab B: does NOT listen to `StorageEvent` on `crossstitch_active_project` or other pref keys
  - Tab B: does NOT receive `cs:prefsChanged` (it was dispatched in Tab A, not Tab B)
  - **RESULT**: Tab B retains its old theme until manual refresh or explicit `StorageEvent` listener added

**Workaround (if needed)**: A future cross-tab sync layer could add `window.addEventListener('storage', ...)` to detect localStorage changes from other tabs and replay them, but this is not currently implemented.

### Known gaps & P2 verification items

1. **`StorageEvent` for active project** â€” localStorage changes from one tab fire `StorageEvent` in others, but Tracker doesn't listen to them
2. **Pref drift across tabs** â€” if Tab A changes dark mode and Tab B is open, Tab B doesn't get the event
3. **IndexedDB changes without dispatch** â€” if code changes IndexedDB directly (bypassing ProjectStorage), other tabs don't know
4. **Project deletion race** â€” if project is deleted in Tab A while Tab B is viewing it, Tab B tries to save/load deleted project

---

## DISCOVERED.md appendix

**No external auth surface discovered.** The only "session-like" concept is the active project pointer and its IndexedDB backing store.

**File-based sync is intentional**; no cloud backend exists. Sync engine is opt-in and user-driven (manual export/import).

**Service Worker is the primary deployment mechanism** â€” every 10 minutes, app checks for a new SW; if found, new SW installs and reloads the page.

---

## VERIFICATION TODO

- [ ] `VER-AUTH-001` [P0] â€” Tracker loads active project from `localStorage.getItem('crossstitch_active_project')` on page load; if the project ID doesn't exist in IndexedDB, graceful "project not found" state appears instead of crash or infinite load.

- [ ] `VER-AUTH-002` [P0] â€” Service Worker successfully registers on all five HTML entry points (home.html, create.html, stitch.html, manager.html, index.html) and cache version bumps to a new `v##` value cause a full-page reload within 10 minutes (poll interval).

- [ ] `VER-AUTH-003` [P1] â€” `cs:projectsChanged` event is dispatched every time `ProjectStorage.save()` completes; Home and Tracker both listen and refetch project list.

- [ ] `VER-AUTH-004` [P1] â€” `cs:stashChanged` event propagates when Stash Manager writes thread inventory; Tracker and Home both receive it and reload stash state without race conditions.

- [ ] `VER-AUTH-005` [P1] â€” `cs:prefsChanged` event is dispatched (with `detail: { key, value }`) after every pref change in Preferences modal, Header theme toggle, and coaching dismiss; `apply-prefs.js` listener updates CSS tokens and theme stylesheet.

- [ ] `VER-AUTH-006` [P2] â€” If active project is deleted in Tab A while open in Tab B (Tracker or Creator), Tab B's next save attempt detects null and shows graceful "project was deleted" message instead of silent data loss.

- [ ] `VER-AUTH-007` [P2] â€” Preferences changed in Tab A (dark mode, contrast, font scale) do NOT auto-sync to Tab B until Tab B is manually refreshed (expected behaviour; no cross-tab StorageEvent listener wired for prefs yet).

- [ ] `VER-AUTH-008` [P2] â€” Project added in Manager (new pattern) dispatches `cs:projectsChanged`; Home's project list live-updates without refresh if Home is open in another tab.

- [ ] `VER-AUTH-009` [P2] â€” File-based sync export includes all projects + optionally stash/prefs/palettes per pref toggles; import classifies projects as identical/new/merge-tracking/conflict and merges tracking state (done arrays, sessions) via fingerprint matching.

- [ ] `VER-AUTH-010` [P2] â€” Experimental features (`experimental.importWizard`, `experimental.embroideryTool`) are hidden by default (pref = false); when set to true via Preferences, new UI appears on next navigation or reload.

- [ ] `VER-AUTH-011` [P3] â€” Service Worker's 10-minute update poll interval works reliably; when a new SW activates, `controllerchange` event fires exactly once and triggers one reload (guarded by `refreshing` flag to prevent loops).

- [ ] `VER-AUTH-012` [P3] â€” Multi-tab scenario: user opens create.html in Tab A, sets active project to `proj_X`, navigates to stitch.html in Tab B (via Home "Track" button). Tab B loads `proj_X` as active (via Home's `activateAndGo` function which calls `setActiveProject` before navigation).

- [ ] `VER-AUTH-013` [P3] â€” Sync export fingerprints (via `computeFingerprint()`) correctly distinguish chart-structure changes from tracking-only changes; identical charts with different tracking progress are classified as "merge-tracking" and progress is merged without chart conflicts.

- [ ] `VER-AUTH-014` [P4] â€” Preferences modal UP_set() helper correctly dispatches `cs:prefsChanged` for every pref change; no drift between UserPrefs.set() and event broadcast occurs.

- [ ] `VER-AUTH-015` [P4] â€” Sync device ID and device name are readable/writable via localStorage (`cs_sync_deviceId`, `cs_sync_deviceName`) and embedded in exported `.csync` files for user reference.