# Cross-Cutting: Data Flow & State Consistency

> Phase 2 cross-cutting output. No backend; all persistence is local (localStorage + IndexedDB).
> This spec traces every entity through its full lifecycle: creation, display, updates, deletion,
> cross-view propagation, and stale-cache risks.

---

## Scope

This spec covers data flow for 7 entity types managed by the Cross Stitch app:
1. **Project** â€” full pattern + tracking state (CrossStitchDB.projects)
2. **Project metadata** â€” lightweight summary mirror (CrossStitchDB.project_meta)
3. **Active project pointer** â€” which project is currently active (localStorage)
4. **Threads inventory** â€” DMC/Anchor owned/to-buy counts (stitch_manager_db.manager_state.threads)
5. **Pattern library** â€” named patterns in Stash Manager (stitch_manager_db.manager_state.patterns)
6. **User preferences** â€” global settings and per-pattern state (localStorage cs_pref_*)
7. **Stats summaries** â€” lightweight dashboard cache (CrossStitchDB.stats_summaries)

---

## Storage layer summary

| Database | Store | Type | Version | Key pattern | Consumers | Writers |
|---|---|---|---|---|---|---|
| `CrossStitchDB` | `projects` | Project JSON | v3 | `proj_NNNNNNNNN` or `auto_save` (legacy) | Creator, Tracker, Home, Manager | Creator (save), Tracker (stitch marks), BackupRestore |
| `CrossStitchDB` | `project_meta` | Lightweight metadata | v3 | `proj_NNNNNNNNN` (mirrors projects) | Home dashboard, Manager, Header switcher | ProjectStorage.save (auto-synced) |
| `CrossStitchDB` | `stats_summaries` | Stats cache | v3 | `proj_NNNNNNNNN` | Stats page, Insights, Home stats cards | ProjectStorage.save (auto-synced from project) |
| `stitch_manager_db` | `manager_state` | Object with keys `threads` / `patterns` | v1 | `"threads"` or `"patterns"` | Creator, Tracker (palette), Manager | Manager inventory tab, Manager patterns tab, ProjectStorage (auto-sync) |
| `localStorage` | `crossstitch_active_project` | String project ID | N/A | singleton key | All pages on load, Header, Project switcher | Home (click project), Creator (new/import), Tracker (on exit/save) |
| `localStorage` | `cs_pref_*` | Serialized JSON or boolean | N/A | per-key (e.g. `cs_pref_trackerDefaultView`) | All pages (read), Preferences modal, inline toggles | Preferences modal, coaching.js |

---

## CustomEvent bus (full enumeration)

| Event | Dispatched by | Listened by | Payload detail | Triggers |
|---|---|---|---|---|
| **`cs:projectsChanged`** | `ProjectStorage.save()`, `ProjectStorage.delete()`, `BackupRestore.restore()` | Header (ProjectSwitcher), Home (all tabs), Manager (pattern reconciliation), Stats page, HeaderProjectSwitcher | `{ reason: "save"\|"delete"\|"restore", id: projectId }` | Dashboard refresh, card updates, badge counts |
| **`cs:stashChanged`** | `StashBridge.*()` (Manager thread edits, inventory save) | Creator (palette source), Tracker (colour swatches), Manager (live refresh), Stats page (stash-dependent stats), Home Stash tab | none | Threads inventory sync, palette updates, stash badges |
| **`cs:patternsChanged`** | `StashBridge.syncProjectToLibrary()`, `Manager` (manual pattern ops) | Manager patterns view, Home (library count badge), Stats page | none | Pattern library refresh, auto-sync updates |
| **`cs:prefsChanged`** | `UserPrefs.set()` (called by PreferencesModal, coaching.js, onboarding) | `apply-prefs.js`, Header, Creator canvas, Tracker canvas, Coach overlay | `{ key: prefKey, value: newValue }` | Theme changes, feature toggles, persistence |
| **`cs:helpStateChange`** | `HelpDrawer.open()` / `.close()` | Header (aria-expanded update) | `{ isOpen: boolean }` | Accessibility state sync |
| **`cs:openHelp`** | Command palette, Footer link, "?" key | HelpDrawer, Creator (cs:openHelpDesign variant) | `{ tab: "help"\|"shortcuts"\|"getting-started", query?: string }` | Open drawer + scroll to topic |
| **`cs:openPreferences`** | Command palette, File menu (all pages), Prefs shortcut | PreferencesModal (all pages), Manager, Creator, Tracker | none | Modal open |
| **`cs:openBulkAdd`** | Command palette (Manager) | Manager BulkAddModal | none | Modal open |
| **`cs:openShortcuts`** | Command palette, HelpDrawer (all pages) | HelpDrawer / modal | none | Shortcuts tab focus |
| **`cs:backupRestored`** | `BackupRestore.restore()` | (notification listeners, optional) | `{ summary: { databases, timestamp } }` | Full data refresh (all pages usually do full reload anyway) |
| **`cs:paletteImportFile`** | Command palette | (internal action handler) | `{ file: File }` | File drag-drop or picker |
| **`cs:showWelcome`** | (internal onboarding) | Welcome wizards (Manager, Tracker, Creator) | `{ page: "creator"\|"manager"\|"tracker" }` | Replay guided tour |
| **`cs:toast`** | Anywhere via toast.js API | Toast container (overlay) | `{ message: string, type: "info"\|"success"\|"error", duration?: number }` | Transient notifications |

---

## Entity: Project

### Create

**EL-IDs:**
- SCR-006 (Creator Prepare tab): user imports image or PDF â†’ `useImportWizard` â†’ `generate-worker.js` â†’ pattern generated â†’ calls `ProjectStorage.save(project)` ([creator/useProjectIO.js:119â€“170](../../creator/useProjectIO.js#L119-L170))
- SCR-005 (Creator Pattern tab): "New Project" button â†’ `handleNewProject()` â†’ blank project with default settings ([creator/useProjectIO.js](../../creator/useProjectIO.js))
- SCR-006 (Creator Prepare tab): image selection â†’ crop/orient workflow ([creator/ImportWizard.js](../../creator/ImportWizard.js))
- SCR-001 (Home Projects tab): "New Project" â†’ redirects to Creator with blank state ([home-app.js](../../home-app.js))

**Process:**
- Creator: `ProjectStorage.save(project)` â†’ assigned new ID via `ProjectStorage.newId()` + createdAt timestamp
- Metadata: auto-built from project via `buildMeta(p)` â†’ inserted into project_meta store
- Stats summary: auto-built from project via `buildStatsSummary(p)` â†’ inserted into stats_summaries store
- Active pointer: `ProjectStorage.setActiveProject(id)` â†’ localStorage `crossstitch_active_project` = id
- Event: `cs:projectsChanged` dispatched with `{ reason: "save", id }` ([project-storage.js:307â€“350](../../project-storage.js#L307-L350))

### Read

**EL-IDs that display project data:**
- SCR-001 (Home Projects tab) â€” shows cards with name, progress %, stitch count, last updated, quick-access buttons
- SCR-052 (MultiProjectDashboard) â€” same card display, used on manager.html and create.html pickers
- SCR-053 (HomeScreenProjectCard) â€” individual card component, extended on home with stats badges
- SCR-036 (Header Context Bar) â€” project name, progress badge (when active project loaded)
- SCR-035 (Header) â€” project name editable inline, progress badge, recent projects dropdown (HeaderProjectSwitcher)
- SCR-024 (Tracker Canvas) â€” full project display: pattern, done bitmap, sessions (loaded on page init or via project switcher)
- SCR-005 (Creator Pattern tab) â€” full project display: pattern, palette, edit history, preview (loaded on page init or import)
- SCR-006 (Creator Prepare tab) â€” pattern info (size, stitch count, materials estimate)
- SCR-007 (Creator Legend tab) â€” colour legend from project.pattern + palette
- SCR-008 (Creator Export tab) â€” chart preview and export options (PDF, image)
- SCR-029 (Manager Inventory tab) â€” "inprogress" projects shown in low-stock picker
- SCR-030 (Manager Patterns tab) â€” auto-synced projects (marked with badge) appear in library
- SCR-059 (Stats Page) â€” all projects shown in breakdowns by size, difficulty, completion, activity

### Update

**EL-IDs that write changes:**

| What | Where | Mechanism | EL-ID | Result |
|---|---|---|---|---|
| Pattern cells edited | SCR-005 Creator | `state.pat[i] = newCell` â†’ debounced save | Creator PatternCanvas, Sidebar | `cs:projectsChanged` â†’ Home/Manager refresh |
| Palette swapped | Creator/Tracker | `palette-swap.js` â†’ colour replacement on all cells | SCR-005, SCR-024 | `cs:projectsChanged` |
| Stitch marked done | SCR-024 Tracker | `done[i] = 1` â†’ debounced ProjectStorage.save | Tracker canvas cell click | `cs:projectsChanged` â†’ Home % updates |
| Session recorded | SCR-024 Tracker | `sessions.push({startedAt, endedAt, netStitches})` â†’ save | Tracker timer | `cs:projectsChanged` + `buildStatsSummary` updates stats |
| Project renamed | SCR-036 Header OR SCR-030 Manager | `ProjectStorage.save({...project, name: newName})` | Header inline edit OR Manager rename | `cs:projectsChanged` |
| Park markers placed | SCR-024 Tracker | `parkMarkers[i] = markData` â†’ save | Tracker mark UI | `cs:projectsChanged` |
| Half-stitches added | SCR-024 Tracker | `halfStitches[i] = stitch` â†’ save | Tracker canvas | `cs:projectsChanged` |
| Backup restored | SCR-043 Backup modal | `RestoreDB.restore()` â†’ writes to CrossStitchDB | All pages' File menu | `cs:backupRestored` + `cs:projectsChanged` |

**Debounce window:** 5 seconds ([creator/useProjectIO.js:770â€“775](../../creator/useProjectIO.js#L770-L775), Tracker similar)

### Delete

**EL-IDs:**
- SCR-030 (Manager Patterns tab): user deletes library entry â†’ Manager calls `ProjectStorage.delete(id)` if project exists; removes pattern entry ([manager-app.js:~490](../../manager-app.js#L490))
- SCR-001 (Home Projects tab): multi-select + delete â†’ `ProjectStorage.delete(id)` for each ([home-app.js](../../home-app.js))
- SCR-051 (Project Library picker): delete option in modal

**Process:**
- `ProjectStorage.delete(id)` removes from `projects` store, `project_meta` store, and `stats_summaries` store
- `_deletedIds` set updated (blocks accidental reintroduction from sync)
- If `crossstitch_active_project === id`, active pointer is cleared: `localStorage.removeItem('crossstitch_active_project')`
- `cs:projectsChanged` dispatched with `{ reason: "delete", id }` ([project-storage.js](../../project-storage.js))

### Cross-view consistency

**Does view A reflect changes made in view B?**

| Scenario | Initiator | Listener | Event | Result | Status |
|---|---|---|---|---|---|
| Tracker marks stitch â†’ Home % refreshes | SCR-024 (Tracker) | SCR-001 (Home) | `cs:projectsChanged` | Home projects list polling on active project; card % updates on next `cs:projectsChanged` | âœ“ Works (debounced 5s) |
| Creator edits pattern â†’ Tracker palette updates | SCR-005 (Creator) | SCR-024 (Tracker) | `cs:projectsChanged` | Tracker must be on same project in another tab/window. Requires visible project switch or manual refresh. | âš  Soft-gap: palette colour map does NOT auto-refresh on cs:projectsChanged; Tracker only reloads palette on page load or project switcher click |
| Creator renames project â†’ Home card title updates | SCR-005 (Creator) | SCR-001 (Home) | `cs:projectsChanged` | Home listens and refreshes project list; card title reflects new name | âœ“ Works |
| Manager deletes project â†’ Home/Creator project gone | SCR-030 (Manager) | SCR-001, SCR-005 | `cs:projectsChanged` | Home dashboard removes card. Creator: if the deleted project was active, page warns and navigates away | âœ“ Works |
| Creator palette swap â†’ Tracker colour legend | SCR-005 (Creator) | SCR-024 (Tracker) | `cs:projectsChanged` | Same as palette scenario above; requires page reload or manual project switch | âš  Soft-gap |
| Backup restore â†’ all views refresh | SCR-043 (Backup) | All pages | `cs:backupRestored` | Most pages do full reload on backup restore; if not, `cs:projectsChanged` also fired | âœ“ Works |

**Identified soft-gap:** Tracker palette colour rendering (legend, swatches) is cached on project load. If Creator changes palette via colour swap or stitch edits, Tracker on a secondary tab does NOT see the change until page reload or active project is switched away-and-back. **Recommendation:** add `cs:projectChanged` listener in Tracker's color rendering layer to reload palette.

### Stale cache risks

| Risk | Where | Trigger | Consequence | Mitigation |
|---|---|---|---|---|
| **Pattern edit not visible** | SCR-001 Home card shows old stitch count | Creator edits pattern, but debounce hasn't fired yet; Home renders before save. | Card % shows old value; user thinks edit didn't apply. | Debounce fires within 5s; card updates on next `cs:projectsChanged`. |
| **Done bitmap stale in summary** | SCR-001 Home progress badge, SCR-036 Header | Tracker marks stitches; localStorage/IndexedDB write in-flight | Home shows outdated %. | Debounce + `cs:projectsChanged` within 5s. |
| **Project metadata out-of-date** | SCR-052 Dashboard card | Creator or Tracker saves project; buildMeta runs at save time but if done bitmap or pattern changed, metadata still reflects previous value | Card name / % mismatch. | buildMeta runs on every `save()`, so metadata re-syncs within debounce window (5s). |
| **Palette colour map cached in Tracker** | SCR-024 Tracker legend, swatches | Creator changes palette (swap or edits); Tracker in separate tab has in-memory colour map | Tracker swatch colours don't match Creator display. | User must reload Tracker or switch project away-and-back. **P2 gap.** |
| **Active project pointer races** | Multiple tabs/windows | User clicks different projects in Home on two tabs simultaneously; IndexedDB write delays | App loads different projects on each tab even though user intended one. | localStorage write is synchronous; IndexedDB write is async but fast. Race window is <100ms in practice. **Low risk.** |

---

## Entity: Project metadata

### Create

**Process:** auto-created by `ProjectStorage.buildMeta(project)` on every `save()`. Never manually created by user.

- Calls `buildMeta(project)` â†’ compact JSON with: id, name, createdAt, updatedAt, totalStitches, completedStitches, isComplete, palette[], sessionCount, stitchesPerHour, etc.
- Stored in `project_meta` store (v3 schema migration handles legacy projects)

### Read

**EL-IDs:**
- SCR-001 (Home Projects tab): renders project cards from metadata
- SCR-052 (MultiProjectDashboard): same
- SCR-036 (Header ProjectSwitcher): recent projects list from metadata
- SCR-059 (Stats Page): project details breakdowns from metadata

### Update

**Automatic on project save:**
- Every `ProjectStorage.save(project)` â†’ calls `buildMeta(project)` â†’ overwrites metadata store entry
- Metadata always in-sync with projects store (no manual edits)

### Delete

**Automatic on project delete:**
- `ProjectStorage.delete(id)` â†’ removes from both `projects` and `project_meta` stores

### Cross-view consistency

**Metadata sync issue:** because metadata is built from the project on save, **metadata can lag if project is in-flight but not yet saved**. However, metadata is rebuilt on every save, so stale metadata is cleared within the debounce window (5s).

---

## Entity: Active project pointer

### Create

**EL-IDs:**
- SCR-001 (Home Projects tab): user clicks a project card â†’ `activateAndGo(id, href)` â†’ calls `ProjectStorage.setActiveProject(id)` â†’ localStorage `crossstitch_active_project = id` ([home-app.js:112â€“122](../../home-app.js#L112-L122))
- SCR-005/SCR-024 (Creator/Tracker on load): reads active pointer from localStorage; if ID exists, loads project

**Process:**
- `ProjectStorage.setActiveProject(id)` writes synchronously to localStorage under key `crossstitch_active_project`
- Value is a project ID string (e.g. `"proj_1712345678"`)

### Read

**EL-IDs:**
- All pages on load: read `localStorage.getItem('crossstitch_active_project')` to determine which project to hydrate
- SCR-035 (Header): reads active project to show name/progress badge
- SCR-036 (Header ProjectSwitcher): reads to highlight current project in dropdown
- SCR-024 (Tracker): reads on page init to load the active project

### Update

**EL-IDs:**
- SCR-001 (Home): user clicks a project â†’ `setActiveProject(id)` + navigate to creator/tracker
- SCR-005 (Creator "Open in Tracker"): saves project first, then `setActiveProject(id)` before navigating to stitch.html
- SCR-024 (Tracker exit/save): `setActiveProject(id)` if user switching projects

### Delete

**EL-IDs:**
- SCR-030 (Manager): if user deletes the active project, `ProjectStorage.delete(id)` clears the active pointer if `localStorage.getItem('crossstitch_active_project') === id`
- SCR-001 (Home): same as above

### Cross-view consistency

| Scenario | Result | Consistency |
|---|---|---|
| User clicks project in Home, then clicks another project before the first page fully loads | Active pointer in localStorage updated immediately; second page load gets second project. Race window ~100ms. | âœ“ Fine (localStorage sync) |
| User deletes active project from Manager, then opens Creator | Creator reads active pointer, finds it invalid, catches error, shows "project deleted" or blank state | âœ“ Handled |
| Two browser tabs open same project; user marks stitches in Tab A, switches project in Tab B | Active pointers may diverge. Tab A Tracker keeps tracking Tab A's project even if Tab B points elsewhere. | âš  Expected (tabs are independent) |

### Stale cache risks

| Risk | Trigger | Consequence | Mitigation |
|---|---|---|---|
| Active pointer points to non-existent project ID | User deletes project from Manager, then reopens Creator within 5s | Creator tries to load project, fails, navigates away or shows error | ProjectStorage.get(id) catches "not found" and handles gracefully |
| Active pointer stale between tabs | User clicks project in Home; active pointer updates; but Tracker was already loading a different project | Both tabs may briefly show different projects | Expected per-tab isolation; no cross-tab sync needed (tabs are independent contexts) |

---

## Entity: Threads inventory

### Create

**EL-IDs:**
- SCR-029 (Manager Inventory tab): user enters thread count â†’ `StashBridge.setThreadOwned(key, qty, level)` â†’ writes to `stitch_manager_db.manager_state.threads[key]` ([manager-app.js:470â€“475](../../manager-app.js#L470-L475))

**Process:**
- `StashBridge.addThreadToInventory(key, qty, level, ...)` â†’ creates entry in threads object: `{ owned: qty, partial: level, ... }`
- Key format: `"dmc:310"` or `"anchor:25"` (composite, normalized by `_normaliseKey()`)
- `cs:stashChanged` dispatched ([stash-bridge.js:65â€“73](../../stash-bridge.js#L65-L73))

### Read

**EL-IDs:**
- SCR-005/SCR-006 (Creator Prepare tab, Palette Choice): calls `StashBridge.getThreadOwned(brand, id)` to determine if thread is in stash ([creator/MaterialsHub.js](../../creator/MaterialsHub.js))
- SCR-029 (Manager Inventory tab): displays full threads dict, filtered/sorted
- SCR-024 (Tracker Canvas): colour swatches show ownership badge (e.g. "Owned", "Low", "Not owned")
- SCR-017 (Creator Shopping List Modal): filters threads by ownership status
- SCR-055 (Creator Materials Hub): shows stash coverage estimate

### Update

**EL-IDs:**
- SCR-029 (Manager Inventory tab): user changes owned count â†’ `StashBridge.setThreadOwned(key, newQty)` â†’ `cs:stashChanged` dispatched
- SCR-032 (Manager BulkAdd modal): user bulk-adds threads â†’ `StashBridge.bulkAddThreads(...)` â†’ multiple entries added
- SCR-030 (Manager Patterns tab): when a pattern is marked "inprogress", auto-sync calls `StashBridge.syncProjectToLibrary(...)` which deducts thread counts (Proposal D). **Note: this is a write to threads inventory from project activity.**

### Delete

**EL-IDs:**
- SCR-029 (Manager Inventory tab): user deletes thread row â†’ `StashBridge.deleteThread(key)` â†’ removes entry from threads object

**NOTE:** deletion is soft (sets owned = 0) rather than hard-delete, to preserve history/links.

### Cross-view consistency

| Scenario | Initiator | Listener | Result | Consistency |
|---|---|---|---|---|
| Manager updates thread count â†’ Creator palette shows new badge | SCR-029 (Manager) | SCR-005 (Creator) | `cs:stashChanged` dispatched; Creator canvas must reload thread stash cache | âœ“ Works if Creator listening to cs:stashChanged ([creator/useCreatorState.js:~60](../../creator/useCreatorState.js#L60)) |
| Manager marks thread "tobuy" â†’ Tracker Shopping List updates | SCR-029 (Manager) | SCR-024/SCR-027 (Tracker) | `cs:stashChanged` â†’ Tracker reloads stash; shopping list re-filters | âœ“ Works (Tracker has stash listener) |
| Tracker deducts threads on stitch mark â†’ Manager inventory decrements | SCR-024 (Tracker) | SCR-029 (Manager) | Proposal D: Tracker calls `StashBridge.deductThread(...)` â†’ `cs:stashChanged` â†’ Manager re-fetches inventory | âœ“ Designed (not yet implemented) |

### Stale cache risks

| Risk | Trigger | Consequence | Mitigation |
|---|---|---|---|
| **Creator palette "stash only" mode filters old colours** | User adds new thread to stash in Manager; Creator still running with cached stash snapshot | Creator palette doesn't include the newly-added thread even though it's now available | Creator listens to `cs:stashChanged` and recomputes `_allowedPalette` ([creator/useCreatorState.js:59â€“97](../../creator/useCreatorState.js#L59-L97)) |
| **Tracker colour swatches don't reflect stash update** | Manager updates thread ownership; Tracker on separate tab has in-memory colour-ownership map | Tracker shows "Not owned" for a thread user just marked "Owned" in Manager | Tracker listens to `cs:stashChanged` and resets colour-swatch ownership badges |
| **Shopping list stale** | Manager marks thread tobuy; Tracker Shopping List was already rendered | List doesn't include newly-marked thread | `cs:stashChanged` triggers Shopping List re-render |
| **Multi-tab race: deduction lost** | Tracker marks stitch (calls `StashBridge.deductThread`); Manager in Tab A has threads dict open but hasn't subscribed to `cs:stashChanged` | Manager's in-memory threads state is stale | Mitigation: Manager always re-fetches threads on `cs:stashChanged` (not just live-updates in place) |

---

## Entity: Pattern library

### Create

**EL-IDs:**
- SCR-030 (Manager Patterns tab): user manually adds pattern entry â†’ Manager calls `StashBridge.addPatternToLibrary(patternObj)` â†’ written to `stitch_manager_db.manager_state.patterns[]` ([manager-app.js:~480](../../manager-app.js#L480))
- **Auto-sync:** Creator saves project â†’ `ProjectStorage.save()` auto-calls `StashBridge.syncProjectToLibrary(projectId, name, threadData, status, fabricCount)` ([project-storage.js:330â€“340](../../project-storage.js#L330-L340)) â†’ pattern entry added/updated in library

**Process:**
- Manual: user fills form (title, designer, threads, status) â†’ `StashBridge` adds entry with unique ID
- Auto-sync: triggered on every Creator/Tracker project save; entry has `linkedProjectId` field pointing back to project

### Read

**EL-IDs:**
- SCR-030 (Manager Patterns tab): displays pattern library, filtered/sorted by status, designer, tag, thread coverage
- SCR-001 (Home Projects tab): shows "Ready to stitch" banner with patterns from library that match stash
- SCR-059 (Stats Page): "Pattern utilisation" breakdowns

### Update

**EL-IDs:**
- SCR-030 (Manager Patterns tab): user edits pattern metadata (title, designer, status, tags) â†’ `StashBridge.updatePattern(id, fields)` â†’ updates library entry
- **Auto-sync on project change:** Creator renames project â†’ `syncProjectToLibrary(...)` called on save â†’ library entry title auto-updated ([manager-app.js:~250 reconciliation](../../manager-app.js#L250))
- Tracker records session on linked project â†’ auto-updates status to "inprogress" or "completed" via sync

### Delete

**EL-IDs:**
- SCR-030 (Manager Patterns tab): user deletes pattern entry â†’ `StashBridge.deletePattern(id)` â†’ removed from library array

### Cross-view consistency

| Scenario | Initiator | Listener | Event | Result | Consistency |
|---|---|---|---|---|---|
| Creator saves project â†’ Manager pattern library auto-syncs | SCR-005 (Creator save) | SCR-030 (Manager) | `cs:projectsChanged` + auto-sync call | Manager's `reconcileAutoSyncedPatterns()` runs; linked entry updated or added | âœ“ Works |
| Manager renames pattern â†’ Creator project name still old | SCR-030 (Manager pattern edit) | SCR-005 (Creator) | No event | Creator doesn't know pattern was renamed; but project name (in Creator) is separate field. Library entry name is a mirror, not source. | âš  One-way: Creator â†’ Library (not Library â†’ Creator) |
| Manager deletes pattern entry â†’ Creator still has project | SCR-030 (Manager delete) | SCR-005 (Creator) | `cs:patternsChanged` | Creator doesn't care; project still exists independently. Library is just a UI view. | âœ“ By design |
| Tracker marks project inprogress â†’ pattern status auto-updates | SCR-024 (Tracker session) | SCR-030 (Manager) | `cs:patternsChanged` (from sync) | Library entry status changes from "wishlist" to "inprogress" | âœ“ Auto-sync on save |

### Stale cache risks

| Risk | Trigger | Consequence | Mitigation |
|---|---|---|---|
| **Pattern library count badge in Home stale** | Manager adds pattern; Home showing old count | Home badge shows incorrect library size | Home listens to `cs:patternsChanged` and re-fetches count |
| **Auto-sync overwrites user edits** | Manager renames pattern; Creator still open; Creator saves project â†’ sync runs â†’ pattern title reverts to project name | User loses manual edits on the library entry | Mitigation: only update `linkedProjectId` fields on auto-sync; preserve user-set fields like `designer`, `tags`, status. Manager preserves these. ([manager-app.js:~200 updateTitleIfChanged](../../manager-app.js#L200)) |
| **In-memory pattern list stale in Manager** | User adds pattern from another tab; Manager Patterns tab was already open | List doesn't show the newly-added pattern until Manager page reload or tab switch | Manager listens to `cs:patternsChanged` and re-fetches patterns array |

---

## Entity: User preferences

### Create

**EL-IDs:**
- SCR-039 (Preferences Modal): user opens preferences dialog â†’ selects a new value for a pref â†’ `UserPrefs.set(key, value)` â†’ writes to localStorage (`cs_pref_<key>`) ([preferences-modal.js:~40](../../preferences-modal.js#L40))
- SCR-048 (Coaching): auto-progression â†’ `UserPrefs.set('onboarding.coached.<stepId>', true)` ([coaching.js:65](../../coaching.js#L65))

**Process:**
- `UserPrefs.set(key, value)` writes synchronously to localStorage under key `"cs_pref_" + key`
- **Important:** `UserPrefs.set()` does NOT emit `cs:prefsChanged` event; caller must dispatch it manually ([user-prefs.js:234â€“237](../../user-prefs.js#L234-L237))
- PreferencesModal DOES dispatch `cs:prefsChanged` for each changed key ([preferences-modal.js:38â€“45](../../preferences-modal.js#L38-L45))

### Read

**EL-IDs (read `UserPrefs.get(key)`):**
- **All pages on load:** read defaults on bootstrap
- SCR-005 (Creator): reads `creatorDefaultViewMode`, `creatorFabricColour`, etc. to init canvas
- SCR-024 (Tracker): reads `trackerDefaultView`, `trackerIdleMinutes`, `trackerFabricColour` on load
- SCR-029 (Manager): reads `patternsDefaultSort`, `patternsDefaultFilter` to init state
- SCR-001 (Home): reads `homeShowCompleted` to filter project list
- SCR-035 (Header): reads `a11yDarkMode` for theme
- Every component: reads via `apply-prefs.js` listener on `cs:prefsChanged` for live updates

**Important distinction:** `UserPrefs.get(key)` ALWAYS falls back to `DEFAULTS[key]` even if the key was never set in localStorage. To detect "first run" (unset vs. set-to-default), code must read localStorage directly ([user-prefs.js:207â€“233](../../user-prefs.js#L207-L233)):

```js
const wasEverSet = localStorage.getItem('cs_pref_' + key) !== null;
```

### Update

**EL-IDs:**
- SCR-039 (Preferences Modal): user changes setting â†’ `UserPrefs.set(key, value)` + dispatch `cs:prefsChanged` ([preferences-modal.js:38â€“45](../../preferences-modal.js#L38-L45))
- SCR-048 (Coaching): step completed â†’ `UserPrefs.set('onboarding.coached.<stepId>', true)` + dispatch ([coaching.js:65](../../coaching.js#L65))
- Inline toggles (e.g. in Creator): user clicks toggle â†’ `UserPrefs.set(...)` + dispatch

### Delete

**EL-IDs:**
- (No explicit delete; user can reset to default by using Preferences modal)

### Cross-view consistency

| Scenario | Initiator | Listener | Event | Result | Consistency |
|---|---|---|---|---|---|
| User toggles dark mode in Preferences on one tab â†’ other tabs theme updates | SCR-039 (Prefs) on Tab A | Header, apply-prefs on Tab B | `cs:prefsChanged { key: 'a11yDarkMode', value: ... }` | Tab B listens to event, re-applies theme via `apply-prefs.js` | âœ“ Works (custom event crosses tabs) |
| User changes "tracker default view" in Manager Preferences â†’ Creator still uses old value | SCR-039 (Prefs) on Tab A | SCR-005 (Creator) on Tab B | `cs:prefsChanged` | Creator listens but default was applied on page init; doesn't re-init. New value only takes effect on next Creator page load. | âš  Expected (preference applies to next session) |
| User toggles "Stash only" in Creator Prepare tab â†’ palette regenerates live | SCR-005 (Creator inline toggle) | Creator Sidebar | `cs:prefsChanged` | Creator's `useCreatorState` listener recomputes `_allowedPalette` on the fly | âœ“ Works |
| Help drawer opened, then Preferences modal opened, then modal closed â†’ Help drawer still open | SCR-037 â†’ SCR-039 â†’ close | Help drawer state | No event; Help drawer uses separate UI state | Help drawer visibility is modal-independent; closing Prefs doesn't close Help | âœ“ By design |

### Stale cache risks

| Risk | Trigger | Consequence | Mitigation |
|---|---|---|---|
| **In-memory pref cache stale** | User opens Preferences modal; changes a value; dismisses modal; opens another app tab that was already running | New tab still has old pref cached from its page-init read | Each tab loads prefs independently from localStorage on init; later changes sync via `cs:prefsChanged` event if code is listening. For static preferences (read once on init), stale value is expected. |
| **Coaching progress lost** | Coach records step completion â†’ `UserPrefs.set('onboarding.coached.step1', true)` â†’ but localStorage write fails silently (quota exceeded) | User repeats the same coaching step on next reload | Mitigation: code should check localStorage.getItem directly after set to verify write succeeded. Currently not done. **P3 risk.** |
| **Theme flashes on page load** | User has `a11yDarkMode: 'dark'` set; page loads â†’ applies light theme from DEFAULTS before `apply-prefs.js` reads localStorage | Brief light flash before dark theme applied | Mitigation: set theme in `<head>` script or `<html>` class before React renders (currently done in [apply-prefs.js](../../apply-prefs.js) but too late for initial render). **P2 optimization.** |

---

## Entity: Stats summaries

### Create

**Process:**
- Auto-created by `ProjectStorage.buildStatsSummary(project)` on every `ProjectStorage.save()` call
- Stores lightweight KPIs: id, name, totalStitches, completedStitches, isComplete, statsSessions[], achievedMilestones[], palette[], etc.
- Inserted into `stats_summaries` store under project ID key ([project-storage.js:49â€“100](../../project-storage.js#L49-L100))

### Read

**EL-IDs:**
- SCR-059 (Stats Page): loads all stats summaries from `stats_summaries` store to build dashboard
- SCR-057 (Stats Activity): reads statsSessions from summary to display activity log
- SCR-058 (Stats Insights): reads palette[] to compute colour coverage, DMC brand distribution, etc.
- SCR-004 (Home Stats tab): glance-view of lifetime stitches, active projects, streaks (via Stats Insights component)
- SCR-036 (Header Context Bar): progress percentage computed from stats summary

### Update

**Automatic on project save:**
- Every `ProjectStorage.save(project)` â†’ calls `buildStatsSummary(project)` â†’ overwrites stats_summaries store entry
- Includes recount of completed stitches, new session data, palette from latest pattern

### Delete

**Automatic on project delete:**
- `ProjectStorage.delete(id)` removes from `stats_summaries` store

### Cross-view consistency

| Scenario | Initiator | Listener | Event | Result | Consistency |
|---|---|---|---|---|---|
| Tracker marks stitches â†’ Stats page percentages update | SCR-024 (Tracker) marks stitch â†’ saves project â†’ buildStatsSummary | SCR-059 (Stats Page) | `cs:projectsChanged` | Stats page must listen and re-fetch stats summary | âœ“ Works if Stats page subscribed to `cs:projectsChanged` (test: [statsDataConnections.test.js](../../tests/statsDataConnections.test.js)) |
| Tracker records session â†’ Stats insights (pace, streaks) update | SCR-024 (Tracker) session end â†’ save | SCR-058 (Insights) | `cs:projectsChanged` | Stats summaries includes latest sessions; Insights recomputes streaks, pace, etc. | âœ“ Works |
| Manager marks project "completed" â†’ Stats page completion count updates | SCR-030 (Manager) status change â†’ ProjectStorage.save() | SCR-059 (Stats Page) | `cs:projectsChanged` | buildStatsSummary sets isComplete flag; Stats page must listen to refresh | âœ“ Works |
| Stash thread deduction (Proposal D) â†’ Stats insights coverage changes | SCR-024 (Tracker) or SCR-029 (Manager) deducts thread â†’ `cs:stashChanged` | SCR-058 (Insights) stash-dependent stats | `cs:stashChanged` (not `cs:projectsChanged`) | Insights listens to both events and recomputes coverage | âœ“ Designed |

### Stale cache risks

| Risk | Trigger | Consequence | Mitigation |
|---|---|---|---|
| **Stats Page shows old completion count** | Tracker marks many stitches rapidly; debounce hasn't fired yet; user switches to Stats tab | Stats still shows old % | Debounce fires within 5s; `cs:projectsChanged` triggers re-fetch |
| **Insights stash-coverage badge outdated** | Manager deducts thread; Insights component already rendered with old stash snapshot | Coverage calculation is wrong (shows old overage) | Insights listens to `cs:stashChanged` (separate from project changes) and recomputes |
| **Lifetime stitches summary never refreshes** | Stats page opens; loads summaries once; user never closes page; Creator adds many stitches on another tab | Lifetime stitch total doesn't update until page reload | Mitigation: Stats page must listen to `cs:projectsChanged` and auto-refresh summaries. **Test: [statsDataConnections.test.js:line 48](../../tests/statsDataConnections.test.js#L48)** |

---

## DISCOVERED.md appendix

### Critical facts

1. **No backend; all persistence is local** (localStorage + IndexedDB). CustomEvent bus is the only cross-page sync mechanism.

2. **Debounce windows:** Projects save debounced at 5s in Creator/Tracker. Metadata and stats summaries auto-built on every project save. No separate debounce for metadata/stats.

3. **cs:prefsChanged must be dispatched by caller:** `UserPrefs.set()` is silent; PreferencesModal and coaching.js dispatch the event. Any new code using UserPrefs.set must also dispatch.

4. **Active project pointer is localStorage (synchronous).** All other entities are IndexedDB (async). Race window for active pointer is <100ms.

5. **Pattern library is one-way sync from Creator â†’ Manager** (auto-sync). Manual edits on library entry don't flow back to Creator project.

6. **Tracker palette colour rendering is cached on project load.** Changes to palette in Creator (colour swap, stitch edits) don't reflect in a secondary Tracker tab until page reload or project switch. **P2 gap.**

7. **Threads inventory in stitch_manager_db is separate from CrossStitchDB.** Creator/Tracker read from stitch_manager_db via StashBridge bridge (read-only). Only Manager writes to stitch_manager_db.threads. Auto-deduction on stitch mark (Proposal D) not yet implemented.

8. **Stats summaries are denormalized copies** of project + metadata. buildStatsSummary includes a snapshot of palette[], statsSessions[], etc. This causes some duplication but enables fast Stats page load without scanning all project patterns.

---

## VERIFICATION TODO

### P0 (Critical â€” data loss or corruption risk)

- [ ] **VER-DATA-001 [P0]** â€” Tracker stitch mark writes committed to IndexedDB before debounce-and-refresh cycle: run `async function testStitchMarkPersistence() { await tracker.markStitch(0); await tracker.save(); const stored = await ProjectStorage.get(activeId); assert(stored.done[0] === 1); }` in Tracker. Verify done bitmap persists across page reload.

- [ ] **VER-DATA-002 [P0]** â€” Creator project.version schema: when saving a project created by old Creator (v8 or v9), ProjectStorage should not downgrade version. Run: generate old project, save in current Creator, verify v === 11 on reload.

- [ ] **VER-DATA-003 [P0]** â€” Active project pointer survivability: delete active project from Manager; verify Creator/Tracker handle missing project gracefully (show error, not crash). Test on both desktop and tablet.

- [ ] **VER-DATA-004 [P0]** â€” Backup restore integrity: export backup with 5 projects, delete all from UI, restore backup, verify all 5 projects restored and counts match. Check stats_summaries store explicitly.

### P1 (High â€” incorrect display or silent data discrepancy)

- [ ] **VER-DATA-005 [P1]** â€” Marking a stitch in Tracker (SCR-024) updates the project's done bitmap in CrossStitchDB.projects within debounce window AND dispatches `cs:projectsChanged` so Home's recent-progress card on next focus shows the new percentage. Test on phone (swipe mark), tablet (tap), desktop (click). Verify Home card % matches Tracker % after stitch mark.

- [ ] **VER-DATA-006 [P1]** â€” Palette swap in Creator (SCR-005) replaces all pattern cells AND dispatches `cs:projectsChanged`. If Tracker is open on same project in another tab, Tracker's palette legend should reflect the new palette on next refresh (page reload or project switch). Currently does NOT auto-refresh (gap). Document as expected behaviour or fix.

- [ ] **VER-DATA-007 [P1]** â€” Deleting a project from Manager (SCR-030) removes the entry from CrossStitchDB.projects, project_meta, stats_summaries, AND clears crossstitch_active_project IF it was active. Run: mark project active, delete it from Manager, verify localStorage active pointer is cleared.

- [ ] **VER-DATA-008 [P1]** â€” Creator auto-sync to pattern library (SCR-005 save): every project save triggers `StashBridge.syncProjectToLibrary(...)`. Verify library entry is created/updated with correct linkedProjectId and thread counts match pattern. Test after adding new colour to palette.

- [ ] **VER-DATA-009 [P1]** â€” Manager pattern library auto-title-update: Creator renames project â†’ save â†’ library entry title auto-updates. BUT user-set fields (designer, tags, status) are preserved. Test: manually edit pattern title in Manager, rename project in Creator, verify pattern title still shows Manager version.

- [ ] **VER-DATA-010 [P1]** â€” cs:projectsChanged is listened to by Home, Manager, Header ProjectSwitcher, and Stats page. Test on multi-tab setup: save project in Creator (Tab A), verify Home (Tab B) project list updates within 5s debounce window without page reload.

- [ ] **VER-DATA-011 [P1]** â€” UserPrefs.set() does not emit event; caller must dispatch `cs:prefsChanged`. Test: inline toggle in Creator (e.g. "Stash only" in Sidebar) must dispatch event AND call UserPrefs.set. Verify old prefs modal does both ([preferences-modal.js:38â€“45](../../preferences-modal.js#L38-L45)).

- [ ] **VER-DATA-012 [P1]** â€” Threads inventory (Manager Inventory tab SCR-029) updates reflect in Creator palette "Stash only" mode and Tracker colour swatches via `cs:stashChanged` event. Test: add new thread to Manager, switch to Creator with "Stash only" on, verify new thread appears in palette. Verify Tracker swatches show "Owned" badge.

### P2 (Medium â€” sub-optimal UX or performance gap)

- [ ] **VER-DATA-013 [P2]** â€” Tracker palette colour rendering cached on project load; changes in Creator (colour swap, stitch edits) don't auto-reflect in secondary Tracker tab. Document as expected (must reload/switch projects) OR implement cs:projectsChanged listener in Tracker to reload palette. **Recommendation: implement listener.**

- [ ] **VER-DATA-014 [P2]** â€” Stats page (SCR-059) must listen to both `cs:projectsChanged` AND `cs:stashChanged` to keep dashboard live. Verify listeners present and cleanup on unmount. Check test file [statsDataConnections.test.js](../../tests/statsDataConnections.test.js) for coverage.

- [ ] **VER-DATA-015 [P2]** â€” Stats summaries denormalization: check if palette[] in stats_summaries ever gets out-of-sync with project.pattern[] (e.g. user adds new colour, but stats summary not rebuilt). Run: add colour to project, save, verify stats summary palette includes new colour.

- [ ] **VER-DATA-016 [P2 â€” tablet]** â€” Tablet data consistency under slow network or lag: on tablet, marking stitches rapid-fire (before debounce fires) should still persist correctly. Run rapid stitch marks, navigate away, come back, verify count matches. Test with simulated slow storage.

- [ ] **VER-DATA-017 [P2]** â€” Manager pattern library "status" field (wishlist / inprogress / completed) auto-updates when Tracker records sessions on linked project. Test: create pattern from Creator, mark inprogress in Tracker, verify pattern status in Manager library auto-updates within 5s.

### P3 (Low â€” edge cases or future improvements)

- [ ] **VER-DATA-018 [P3]** â€” First-run detection for new prefs: code that needs to distinguish "user never set this pref" from "user set it to the default value" must read localStorage directly, not UserPrefs.get(). Test: new user, read `localStorage.getItem('cs_pref_creatorDefaultViewMode')`, verify it's null (not undefined). Then manually set it to default, verify UserPrefs.get() and localStorage.getItem() both work.

- [ ] **VER-DATA-019 [P3]** â€” LocalStorage write failure silent catch: if localStorage is full or permission-denied, UserPrefs.set() silently fails (no exception thrown). Test: fill localStorage, try UserPrefs.set(), verify no crash but check that pref didn't persist. **Consider adding console.warn or user toast.**

- [ ] **VER-DATA-020 [P3]** â€” Multi-tab active project race: open same project in two tabs, click different projects simultaneously; active pointer may flap. Run: simultaneous clicks in tabs, verify app doesn't crash and at least one tab loads correctly.

- [ ] **VER-DATA-021 [P3]** â€” ProjectStorage.newId() collision: IDs are `"proj_" + Date.now()`. If two saves fire in same millisecond, IDs collide. Test: rapid-fire saves in two workers/threads, verify no collision (or collision is handled). **Low risk in practice; consider UUID in future.**

- [ ] **VER-DATA-022 [P3]** â€” Stats summaries store size growth: stats_summaries is never pruned; old entries for deleted projects remain. Run: create 100 projects, delete 99, check stats_summaries store size. **Consider cleanup on delete.**

- [ ] **VER-DATA-023 [P3]** â€” Backup restore doesn't clear deleted projects marked in `ProjectStorage._deletedIds`. Run: backup 5 projects, delete 2, restore backup (should re-add deleted), verify they don't get filtered out by `_deletedIds` check. **Consider clearing `_deletedIds` on restore.**

- [ ] **VER-DATA-024 [P3]** â€” Cross-database consistency: ProjectStorage writes to CrossStitchDB; StashBridge writes to stitch_manager_db. No foreign-key constraints. If Creator project references a thread ID that was deleted from Stash, no error. Run: create project with DMC 310, delete 310 from Stash, load project, verify it still displays (RGB is embedded in pattern cells).

---

## Tablet-specific considerations

### Data density implications (P2 for tablet)

- **SCR-001 (Home Projects list, tablet):** paginated or infinite scroll? Current implementation shows all projects. On tablet with 100+ projects, performance may degrade. **Consider lazy loading or pagination.**

- **SCR-029 (Manager Inventory, tablet):** threads list can be very long (400+ DMC + 300+ Anchor). Currently shows all with filter/sort UI. On tablet, consider virtual scrolling or collapsible colour groups.

- **SCR-030 (Manager Patterns, tablet):** pattern library can be large. Same consideration as inventory.

- **SCR-059 (Stats Page, tablet):** charts and tables scale differently on tablet. Verify all data loads correctly and charts render at reasonable size.

### Event delivery on tablet

- Tablet focus handling may differ from desktop. If user switches browser tabs (e.g. browser to notes app and back), focus event may not fire. Verify `cs:projectsChanged` still updates Home/Manager even if page was backgrounded. Test with simulated visibilitychange events.

---

## Summary of custom event patterns

| Use case | Event | Who dispatches | Who listens | Payload |
|---|---|---|---|---|
| Project saved / deleted / restored | `cs:projectsChanged` | ProjectStorage, BackupRestore | Home, Manager, Header, Stats | `{ reason, id }` |
| Stash threads changed | `cs:stashChanged` | StashBridge | Creator, Tracker, Manager, Home, Stats | none |
| Pattern library changed | `cs:patternsChanged` | StashBridge, Manager | Manager, Home | none |
| Preferences changed | `cs:prefsChanged` | PreferencesModal, coaching.js (caller's responsibility) | apply-prefs, Header, Creator, Tracker, all UI | `{ key, value }` |
| Help drawer opened/closed | `cs:helpStateChange` | HelpDrawer | Header | `{ isOpen }` |
| Global UI triggers | `cs:openHelp`, `cs:openPreferences`, etc. | Command palette, menu items | Modals, drawers | varies |

---

## Known gaps and recommendations

### Soft-gaps (expected, documented, but suboptimal)

1. **Tracker palette not auto-refreshed when Creator changes palette on another tab** (VER-DATA-013). Recommendation: add `cs:projectsChanged` listener to reload palette.

2. **Pattern library status not immediately reflected when renamed via Creator** (VER-DATA-009). Recommendation: intended (library mirrors project, not vice-versa); document in help.

### Risks to monitor

1. **First-run detection for new preferences:** code must use `localStorage.getItem()` directly, not `UserPrefs.get()`. Documented in repository memory.

2. **Stats page data staleness:** Stats page must listen to both `cs:projectsChanged` and `cs:stashChanged` to keep all KPIs live (test: statsDataConnections.test.js).

3. **Palette colour rendering cache in Tracker:** update to add reload listener when project changes.

4. **Manager pattern library "status" auto-sync:** may not be complete yet (check Proposal D implementation status).

---

## Final verification checklist

Before Phase 3 (before implementation freeze):

- [ ] All VER-DATA-* checks run green on desktop, tablet, and mobile
- [ ] No missing `cs:prefsChanged` dispatches
- [ ] Stats page has all required listeners (cs:projectsChanged, cs:stashChanged)
- [ ] Tracker palette auto-refreshes on cs:projectsChanged OR gap is documented
- [ ] Backup restore re-adds deleted projects correctly
- [ ] No silent data-loss on localStorage quota exceeded
- [ ] Multi-tab sync tested with 2â€“4 concurrent browsers
- [ ] Tablet data density acceptable for 100+ projects, 400+ threads

---

- [ ] `VER-DATA-025` [P2] â€” Stash inventory live-deduction on stitch mark (Proposal D): when Tracker marks stitch, verify thread count decrements in Stash. Currently not implemented; verify implementation status before Phase 4.