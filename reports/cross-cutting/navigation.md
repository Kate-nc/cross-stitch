# Cross-Cutting: Navigation & Routing

> Phase 2 cross-cutting output. References EL-IDs from reports/specs/.

## Scope

This cross-cutting spec documents every navigation event in the Cross Stitch Pattern Generator. The app has **no client-side router**; each HTML file is a separate entry point loaded directly. Inter-page navigation occurs via full-page loads using `window.location.href` or `<a>` links. Intra-page navigation uses `history.replaceState()` to update the URL without triggering a page reload, allowing the Creator's unified `index.html` entry point to switch between design, track, and stats modes in-memory.

Navigation encompasses:
- Full-page transitions between home.html, create.html, stitch.html, manager.html, and embroidery.html
- Intra-page tab/mode switching (Creator, Tracker, Manager, Home tab bars)
- Project activation: setting and propagating the active project pointer
- Modals, drawers, and popovers: any UI surface that overlays the main content
- Deep links: URL query parameters (action=, mode=, tab=, from=, etc.)
- History state management and browser back/forward behaviour
- Navigation guards: defensive redirects and unsaved-changes confirmations
- Service Worker routing and fallback handling

---

## Inter-page navigation map

The app defines five HTML entry points. Navigation between them is a full-page reload with no transition state preserved (each page initialises from scratch, reading localStorage and IndexedDB).

| **From** | **To** | **Trigger EL-ID** | **Destination URL** | **Guard/Condition** | **Side effect(s)** |
|---|---|---|---|---|---|
| home | create.html | EL-SCR-001-04 ("+ New project" button) | `home.html?tab=create` | None | Switches to Home Create tab in-page (SPA) |
| home | create.html | EL-SCR-001-08 (Active Project Resume btn, edit variant) | `create.html?from=home` | Active project required | `ProjectStorage.setActiveProject(id)` called; Creator page loads |
| home | create.html | EL-SCR-001-26 (Project row Track btn) | `create.html?from=home` | Project in row must exist | `ProjectStorage.setActiveProject(id)` called |
| home | stitch.html | EL-SCR-001-08 (Active Project Resume btn, track variant) | `stitch.html?from=home` | Active project required | `ProjectStorage.setActiveProject(id)` called; Tracker page loads |
| home | stitch.html | EL-SCR-001-26 (Project row Track btn) | `stitch.html?from=home` | Project in row must exist | `ProjectStorage.setActiveProject(id)` called |
| home | manager.html | EL-SCR-003-02 (Stash tab "Open Stash Manager" link) | `manager.html?from=home` | None | Full page load to Stash Manager |
| home | embroidery.html | (Create tab experimental tile) | `embroidery.html?from=home` | Experimental feature pref ON | Full page load to experimental embroidery tool |
| create | home | EL-SCR-035-01 (Logo link) | `home.html` | None | Full page load; Creator state lost |
| create | home | Project name â†’ Project switcher â†’ "All projects" | (via project switcher menu item) | Opens project picker modal | Modal navigation; triggers `stitch.html` if project selected |
| create | stitch | EL-SCR-035-02 (Header "Track" tab) | `stitch.html` | Active project required (guarded by create.html redirect) | `window.history.replaceState()` + mode switch to 'track' (in-page) |
| create | manager.html | (link in materials hub, target="_blank") | `manager.html` | None | Full page load (optional separate window if target="_blank") |
| stitch | home | EL-SCR-035-01 (Logo link) | `home.html` | None | Full page load; Tracker state lost |
| stitch | home | Project switcher â†’ recent project â†’ "All projects" | (via project switcher menu) | Opens project picker modal | Modal navigation; triggers `stitch.html` if project selected |
| stitch | create | EL-SCR-035-02 (Header "Edit" tab) or context bar "Edit Pattern" btn | `create.html?from=home` | Active project required | `window.history.replaceState()` + mode switch to 'design' (in-page) |
| stitch | manager.html | (links in UI, context dependent) | `manager.html?from=home` | None | Full page load |
| manager | home | EL-SCR-035-01 (Logo link) | `home.html` | None | Full page load; Manager state lost |
| manager | create.html | (link from pattern library) | `create.html?from=home` | Pattern must exist | Full page load; Creator opens with pattern |
| manager | stitch | (project card button or list item) | `stitch.html` | Project must exist | `ProjectStorage.setActiveProject(id)` called |
| index.html (redirect guard) | home.html | (automatic on load) | `home.html` | No active project in localStorage | Redirects before script content loads |
| create.html (redirect guard) | home.html?tab=create | (automatic on load) | `home.html?tab=create` | No active project AND no `action=` param AND no `from=home` param | Defensive redirect to project picker |
| index.html or create | home | Ctrl/Cmd+K â†’ Command Palette "Go Home" action | `index.html` or direct nav | None | Command Palette closes; navigation proceeds |

---

## Intra-page tab/mode switching

These are **same-document navigations**: the URL and mode change but no page reload occurs. State is preserved; content swaps in-place.

### Home (home.html)

- **Tab bar**: EL-SCR-001-02 â€” four tabs (Projects / Create New / Stash / Stats) rendered in [home-app.js](../../home-app.js)
- **Navigation type**: React state update (not `history.replaceState`)
- **Tab trigger/label pairs**:
  | Label | Destination | EL-ID | Visible always? |
  |---|---|---|---|
  | Projects | SCR-001 | tab label within EL-SCR-001-02 | Yes |
  | Create New | SCR-002 (Create New tab content) | tab label within EL-SCR-001-02 | Yes |
  | Stash | SCR-003 (Stash tab content) | tab label within EL-SCR-001-02 | Yes |
  | Stats | SCR-004 (Stats glance content) | tab label within EL-SCR-001-02 | Yes |

- **Intra-tab navigation**: No sub-tabs; each tab is a leaf screen.

### Creator (index.html / create.html, via creator-main.js)

The Creator is a unified JS file (`creator-main.js`) that runs in `index.html` (legacy) and `create.html` (modern). A **single-page application** within that HTML entry point, with three persistent modes and URL-driven state.

- **Mode switching mechanism**: `window.history.replaceState({}, '', qs)` updates the URL; React state updates trigger re-render
- **Modes and their URL markers**:

| Mode ID | Mode name | URL | Query params | Trigger | Component tree |
|---|---|---|---|---|---|
| design | Pattern Design | `/create.html` or `/index.html` | (empty or `?action=open` / `?action=new-blank` / `?action=home-image-pending`) | Header "Create"/"Edit" tabs, startup if active project exists | `CreatorApp` + 5 sub-tabs (Prepare/Pattern/Legend/Export/Project) |
| track | Stitch Tracker (inline) | `/index.html` or `/create.html` | `?mode=track` | Header "Track" tab, programmatic `switchToTrack()` | `TrackerApp` component tree |
| stats | Stats Dashboard (inline) | `/index.html` or `/create.html` | `?mode=stats` or `?mode=stats&tab=showcase` | Header "Stats" tab, programmatic `switchToStats()` | `StatsPage` component tree (lazy-loaded Babel) |

- **Creator sub-tabs** (only visible in 'design' mode):
  - Tab group: EL-SCR-035-03 (Sub-Page Dropdown in header)
  - Tabs: Pattern, Project, Materials & Output (renamed from Prepare/Legend/Export in Phase 8 consolidation)
  - Stored in state: `app.tab` in `useCreatorState` hook
  - Switching: Dropdown click â†’ `setTab(tab)` â†’ `history.replaceState()` (internal, no URL change) â†’ React re-render

- **History state navigation within Creator**:
  - `switchToDesign()`: `history.replaceState({}, '', window.location.pathname)` (strips query string)
  - `switchToTrack()`: `history.replaceState({}, '', '?mode=track')`
  - `switchToStats(params)`: `history.replaceState({}, '', '?mode=stats&...')` with optional tab param
  - `closeStats()`: reverts to previous mode (track â†’ `?mode=track`; design â†’ pathname)

### Tracker (stitch.html)

- **Tab bar**: None (full-screen canvas)
- **Modal dialogs**: Stats modal (SCR-028) opened via button in action bar
- **Project mode only**: Cannot exist without active project (guarded by defensive redirects)

### Manager (manager.html)

- **Tab bar**: EL-SCR-029/030 â€” two tabs (Inventory / Patterns)
- **Navigation type**: React state update (`tab` in [manager-app.js](../../manager-app.js):40)
- **Tab switching**: Click tab label â†’ state update â†’ re-render
- **Intra-tab**: No sub-tabs; each is a leaf screen

---

## Project activation flow

### Active project pointer: localStorage key

- **Key**: `crossstitch_active_project` (alias: `LOCAL_STORAGE_KEYS.activeProject` from [constants.js](../../constants.js))
- **Type**: Plain string (project ID, e.g. `"proj_1712345678"`)
- **Persistence layer**: `window.ProjectStorage` singleton ([project-storage.js](../../project-storage.js))

### Setting the active project

1. **On user action** (click Track/Edit button on a project card):
   - Code calls `ProjectStorage.setActiveProject(id)` ([project-storage.js](../../project-storage.js))
   - This writes to localStorage and dispatches `CustomEvent('cs:projectsChanged')`
2. **Programmatic flows**:
   - Creator: when user saves a new project, `ProjectStorage.setActiveProject(newId)` is called ([creator-main.js](../../creator-main.js):1290)
   - Tracker: when user resumes from a dropdown or shortcut, `setActiveProject()` is called
   - Command Palette: recent project selection calls `setActiveProject()` ([command-palette.js](../../command-palette.js):211â€“212)

### Reading the active project

1. **Home dashboard**: `ProjectStorage.getActiveProject()` on component mount; renders ActiveProjectCard or empty state
2. **Creator/Tracker**: Loads the active project into state; if missing, defensive redirect to `/home`
3. **Header project switcher**: `ProjectStorage.getActiveProjectId()` to display current project label

### Cross-page propagation

- **cs:projectsChanged CustomEvent**: Fired by `ProjectStorage.setActiveProject()` and listened to by:
  - Header project switcher: reloads recent projects list
  - Home dashboard: refreshes active project card
  - Any page with a project-aware UI
- **localStorage**: Direct read by each page on init (browser native storage API; no IndexedDB dependency)
- **Redirect safety**: Defensive redirects in `index.html` and `create.html` check `localStorage.getItem('crossstitch_active_project')` before proceeding

### Project activation + navigation sequence

User clicks "Resume tracking" on a project card (EL-SCR-001-08):
1. `activateAndGo(id, 'stitch.html')` called from home-app.js
2. `ProjectStorage.setActiveProject(id)` is called (synchronous)
3. `cs:projectsChanged` event dispatched (async listeners fire)
4. `window.location.href = 'stitch.html?from=home'` (full page load)
5. stitch.html loads; redirect guard sees `from=home` param and skips guard
6. Tracker app initialises; loads project from IndexedDB via `ProjectStorage.get(id)`
7. Stitch canvas renders with project data

---

## Browser back/forward & history

### History API usage

The app uses **`history.replaceState()` only**. No `history.pushState()`.

- **Purpose**: Update the URL without creating history entries. Allows Creator's mode switching (design â†” track â†” stats) to reflect in the URL bar without polluting the history stack.
- **Behaviour**: Browser back/forward navigates between separate HTML pages (inter-page), not between modes within the Creator's `index.html`.

### Popstate handling

**No explicit `popstate` event listeners** detected in the codebase. History state is minimal (empty `{}`), and there is no restoration logic. The app relies on browser default behaviour:
- Clicking browser back button navigates to the previous full-page URL (e.g. from `create.html` to `home.html`)
- Each page re-initialises from localStorage + IndexedDB on load

### Implications for navigation

- User in Creator design mode, clicks browser back â†’ navigates to previous page (e.g. home.html), *not* to Creator track mode
- No "undo mode switch" via back button; mode switches are ephemeral URL changes only
- Service Worker cache + defensive redirects ensure backward navigation doesn't break

---

## Deep links

The app uses URL query parameters to control behaviour on page load. No URL fragments (`#`) are used for routing.

| Query parameter | Values | Purpose | Read by |
|---|---|---|---|
| `from=home` | `from=home` | Marker to bypass defensive redirect guards; signals the user came from `/home` as an entry point. Used to allow deep links (e.g. `create.html?action=home-image-pending&from=home`) to proceed without the page bouncing to `/home`. | [create.html](../../create.html) (line 35â€“40), [index.html](../../index.html) (line 28â€“34) |
| `action` | `open`, `new-blank`, `home-image-pending` | Creator startup action: open existing project, create blank, or process pending image upload. | [creator-main.js](../../creator-main.js) (line 1136+) |
| `mode` | `track`, `stats`, `showcase` | Creator unified-mode selector: design (default), track, or stats view. `showcase` is a stats variant (redirects to `?mode=stats&tab=showcase`). | [creator-main.js](../../creator-main.js) (line 1138â€“1141) |
| `tab` | `create`, `inventory`, `patterns`, `shopping` | **Home**: switch to Create tab on load. **Manager**: switch to Patterns or Inventory tab. `shopping` is a Manager variant. | [home-app.js](../../home-app.js) (inferred from tab state), [manager-app.js](../../manager-app.js) (line 40) |
| (others) | Various | stats-page.js, stats-activity.js parse additional params for filtering; not core routing. | [stats-page.js](../../stats-page.js) (line 986+), [stats-activity.js](../../stats-activity.js) (line 285+) |

### Deep link examples

- `home.html?tab=create` â€” Navigate to Home, open Create New tab on mount
- `create.html?action=new-blank&from=home` â€” Creator opens with a new blank project; skip redirect guard
- `create.html?action=home-image-pending&from=home` â€” Creator has a pending image upload (from drag-drop on home); render the image processor
- `index.html?mode=stats&tab=showcase` â€” Creator unified page, switch to Stats mode, Showcase tab variant
- `stitch.html?from=home` â€” Tracker page; skip redirect guard (legacy; may be phased out)
- `manager.html?tab=patterns` â€” Manager page, open Patterns tab on load

---

## Modal/drawer open & close

### Generalised modal/drawer pattern

All overlays (modals, drawers, sheets) in the app follow a unified pattern via the `Overlay` component ([components/Overlay.js](../../components/Overlay.js)):

**Open trigger**: 
- Most modals are opened via React state: a component owns a boolean `isOpen` or `modalType === 'X'` state variable
- Some modals are triggered by global `CustomEvent` (e.g. `cs:openHelp`, `cs:openCommand`)
- Programmatic `.open()` methods (e.g. `HelpDrawer.open()`, `CommandPalette.open()`)

**Close trigger**:
- ESC key (universal; composed via `window.useEscape` stack)
- Scrim click (default; suppressible via `dismissOnScrim={false}` prop)
- Action button click (e.g. "Save", "Cancel", "Delete")
- Programmatic `.close()` method

**Built-in behaviour** (Overlay component):
- Focus trap: first focusable element focused on open; Tab cycles within overlay; focus restored on close
- ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` (auto-derived from `<Overlay.Title>`)
- Variants: `dialog` (centred), `sheet` (bottom sheet on mobile), `drawer` (edge-anchored)
- Reduced-motion respected: no slide-up animation if `prefers-reduced-motion`

### Common modals and their EL-IDs

| Modal | Screen ID | Trigger | Open via | Close via | Notes |
|---|---|---|---|---|---|
| Preferences | SCR-039 | EL-SCR-035 File menu or Ctrl/Cmd+, | State or `cs:openCommand` action | ESC, X button, "Apply" | Fires `cs:prefsChanged` on close |
| Help Drawer | SCR-037 | EL-SCR-035 Help button or Ctrl/Cmd+? | `cs:openHelp` / `cs:openHelpDesign` / `HelpDrawer.open()` | ESC, Back button | Tabs: Help / Shortcuts / Getting Started |
| Command Palette | SCR-038 | Ctrl/Cmd+K or EL-SCR-035 icon | `cs:openCommand` / `CommandPalette.open()` | ESC, selection, scrim click | Global keydown listener; no state-based open |
| Creator Adapt Modal | SCR-014 | Magic Wand tool "Adapt" button | State: `showAdapt === true` | ESC, X, "Cancel"/"Apply" | In-creator modal; no page-level trigger |
| Creator Colour Replace | SCR-016 | Context menu or tool option | State: `showColourReplace === true` | ESC, X, "Cancel"/"Replace" | In-creator modal |
| Creator Shopping List | SCR-017 | Prepare Materials tab button | State: `showShoppingList === true` | ESC, X, "Done" | In-creator modal |
| Palette Swap | SCR-056 | Creator tools or Bridge trigger | State: `paletteSwapOpen === true` | ESC, X, "Cancel"/"Apply" | Creator modal; not page-level |
| Manager Profile | SCR-031 | Header avatar or menu | State: `profileModalOpen === true` | ESC, X, "Done" | Manager page only |
| Welcome Wizard | SCR-040/041/042 | First visit or replay via preferences | Onboarding check on page load | "Skip" / "Next" / completion | Per-page flow (Creator/Manager/Tracker); **not** dismissible via ESC |
| Tracker Stats | SCR-028 | Tracker action bar button | State: `statsOpen === true` | ESC, back arrow, scrim click | Inline in Tracker; not a separate page |
| Project Picker (Library) | SCR-051 | Header project switcher "All projects" | `project-library.js` modal | X button, selection | Searches projects; used on Creator and Manager |
| Import Wizard | SCR-018 | Home Create tab image tile or File menu | State: `importWizardStep` | ESC, "Cancel" / completion | 5-step wizard; **not** dismissible mid-flow unless cancelled |

---

## Navigation guards

### Defensive redirects (startup guards)

Pages validate state on load and redirect if necessary:

1. **index.html** (legacy Creator entry point):
   - Check: `localStorage.getItem('crossstitch_active_project')`
   - Guard condition: Active project missing AND no `from=home` or `action=` param
   - Action: `location.replace('home.html')` (same-origin replacement; no history entry)
   - Rationale: User typed `index.html` or back-navigated to a stale history entry with no project active â†’ send to project picker

2. **create.html** (dedicated Creator entry point):
   - Check: `localStorage.getItem('crossstitch_active_project')` AND `location.search` for `from=home` / `action=`
   - Guard condition: Active project missing AND no `from=home` or `action=` params
   - Action: `location.replace('home.html?tab=create')`
   - Rationale: User typed `create.html` or back-navigated with no project; direct them to the Home Create tab (canonical entry point)

### Destructive action confirmations

These use `window.confirm()` to block destructive navigation:

| Action | Guard location | Confirmation text | Trigger | Block action if |
|---|---|---|---|---|
| New project (discard current) | [creator-main.js](../../creator-main.js) / [tracker-app.js](../../tracker-app.js) | "Start fresh? Your current project is auto-saved." | Header File menu "New Project" button | User clicks Cancel |
| Regenerate pattern (discard edits) | [creator/bundle.js](../../creator/bundle.js) (ImportWizard) | "Regenerating will replace your current edits. Continue?" | ImportWizard final step "Regenerate" button | User clicks Cancel |
| Bundle export (large file) | [creator/ExportTab.js](../../creator/ExportTab.js) | "Bundle is roughly X MB. Download anyway?" | Export tab "Download Bundle" button | User clicks Cancel |
| Create palette presets bundle (large) | [creator/ExportTab.js](../../creator/ExportTab.js) | Similar size warning | Export tab "Create Preset Bundle" button | User clicks Cancel |

### Unsaved changes detection

**Created**: beforeunload handler in Manager and Creator to flush unsaved edits:

- **Manager** ([manager-app.js](../../manager-app.js):513â€“527):
  - Listens: `beforeunload` event
  - Action: If threads/patterns have pending edits, saves to IndexedDB synchronously
  - Purpose: Ensure user doesn't lose thread inventory edits if they close the tab unexpectedly

- **Creator** ([creator/bundle.js](../../creator/bundle.js):9025â€“9054):
  - Listens: `beforeunload` event
  - Action: Triggers sync handler (if SyncEngine active) to export pending pattern changes
  - Purpose: Cloud sync / offline fallback safety

**Not implemented**: Browser native "unsaved changes" confirmation (e.g. `event.returnValue = 'You have unsaved changes'`). The app relies on auto-save and IndexedDB persistence, so user data is safe even if they close without warning.

---

## Redirect chains

### Redirect A: index.html â†’ home.html (no active project)

```
User navigates to: index.html (or PWA shortcut)
  â†“
Check: localStorage.getItem('crossstitch_active_project')
  â†“
Result: not found
  â†“
Check: ?from=home or ?action= param
  â†“
Result: not found
  â†“
Action: location.replace('home.html')
  â†“
Destination: home.html (default Projects tab)
```

**Why**: Prevents the user from landing on a blank Creator page with no project to edit. They must choose a project from home first.

### Redirect B: create.html â†’ home.html?tab=create (no active project + no deep link)

```
User navigates to: create.html (direct URL or back navigation)
  â†“
Check: localStorage.getItem('crossstitch_active_project')
  â†“
Result: not found
  â†“
Check: ?from=home or ?action= param
  â†“
Result: not found
  â†“
Action: location.replace('home.html?tab=create')
  â†“
Destination: home.html, Create tab active
```

**Why**: Similar to Redirect A, but pre-selects the Create tab so the user sees project creation options immediately.

### Redirect C: home.html â†’ project card â†’ stitch.html or create.html (with active project set)

```
User clicks "Resume tracking" on active project card (EL-SCR-001-08)
  â†“
Action: activateAndGo(id, 'stitch.html')
  â†“
Step 1: ProjectStorage.setActiveProject(id) [sync write to localStorage]
  â†“
Step 2: window.location.href = 'stitch.html?from=home' [full page load]
  â†“
Destination: stitch.html
  â†“
stitch.html loads; checks ?from=home param and skips redirect guard
  â†“
Tracker app initialises with project data from IndexedDB
```

**Why**: The active project pointer must be set *before* navigation so the new page knows which project to load.

### Redirect D: home.html â†’ command palette action â†’ any page (with optional mode switch)

```
User presses Ctrl/Cmd+K on home.html
  â†“
CommandPalette opens (overlay; no page navigation yet)
  â†“
User selects "Switch to Tracker" action
  â†“
Action closure: CommandPalette.close() â†’ location.href = 'stitch.html'
  â†“
Destination: stitch.html (full page load)
  â†“
Guard: ?from=home param not present, but active project exists in localStorage
  â†“
Tracker page skips guard and loads active project
```

**Why**: Command palette is a global overlay that unifies navigation across all pages. It reads recent projects and can navigate between pages.

---

## DISCOVERED.md appendix

### Navigation-related EL-IDs not yet in Phase 1 specs

These elements trigger navigation but do not have Phase 1 EL-IDs assigned. They should be catalogued in future area specs or a navigation sub-spec:

- Header project switcher "All projects" menu item: opens project picker modal (SCR-051)
- Creator mode-switch "Track" button: triggers `switchToTrack()` (intra-page)
- Creator mode-switch "Stats" button: triggers `switchToStats()` (intra-page)
- Tracker "Switch project" button (resume recap modal): calls project switcher or navigates to home
- Command Palette actions: ~10 static navigation actions (Go Home, Switch to Creator, etc.)
- Manager project card "Track" button: navigates to stitch.html with project set
- Manager project card "Edit" button: navigates to create.html with project set
- Service Worker: no explicit routing UI, but `sw.js` serves 200 responses (PWA precache); may need routing doc if offline-first paths exist

---

## VERIFICATION TODO

- [ ] `VER-NAV-001` [P0] â€” Clicking Header Create tab from Stitch Tracker (EL-SCR-035-02) navigates to create.html and Creator app mounts within 2s without showing Tracker briefly
- [ ] `VER-NAV-002` [P0] â€” Clicking "Resume tracking" on active project card (EL-SCR-001-08) sets active project pointer in localStorage and navigates to stitch.html; Tracker loads the correct project without 404
- [ ] `VER-NAV-003` [P0] â€” Clicking "Edit pattern" on active project card (EL-SCR-001-09) navigates to create.html and loads the project; pattern canvas renders within 2s
- [ ] `VER-NAV-004` [P0] â€” Navigating directly to `index.html` with no active project redirects to `home.html` before first render
- [ ] `VER-NAV-005` [P0] â€” Navigating directly to `create.html` with no active project and no `action=` param redirects to `home.html?tab=create`
- [ ] `VER-NAV-006` [P0] â€” Navigating to `create.html?action=new-blank&from=home` bypasses redirect guard and shows blank project creator
- [ ] `VER-NAV-007` [P0] â€” Clicking browser back button from Creator returns to previous page (e.g. home.html); no in-page history
- [ ] `VER-NAV-008` [P0] â€” Switching Creator mode (design â†” track â†” stats) via Header tabs or programmatic call updates `window.location.pathname` / `?mode=...` without page reload; state preserved
- [ ] `VER-NAV-009` [P1] â€” Clicking Header project switcher "All projects" opens SCR-051 project picker modal; selecting a project navigates to Tracker
- [ ] `VER-NAV-010` [P1] â€” Closing Creator (via logo/home link) and returning to home.html correctly clears Creator state without polluting IndexedDB
- [ ] `VER-NAV-011` [P1] â€” Pressing Ctrl/Cmd+K opens CommandPalette (SCR-038) globally; palette actions navigate correctly (Go Home â†’ home.html, Switch to Tracker â†’ stitch.html, etc.)
- [ ] `VER-NAV-012` [P1] â€” Closing CommandPalette via ESC or scrim click does not trigger navigation; same-document close
- [ ] `VER-NAV-013` [P1] â€” CustomEvent `cs:projectsChanged` fires after `ProjectStorage.setActiveProject()` is called; all listeners on Header, Home dashboard react within 100ms
- [ ] `VER-NAV-014` [P1] â€” Navigating to `?from=home` param on index.html or create.html with no action= does not redirect if active project exists
- [ ] `VER-NAV-015` [P1] â€” Clicking "New project" button in Creator (with unsaved edits) shows `confirm()` dialog; clicking Cancel blocks navigation
- [ ] `VER-NAV-016` [P1] â€” Manager page shows Inventory tab by default; clicking Patterns tab (EL-SCR-030) switches to SCR-030 in-page without reload
- [ ] `VER-NAV-017` [P1] â€” Manager beforeunload handler saves unsaved threads/patterns to IndexedDB when user closes tab
- [ ] `VER-NAV-018` [P1] â€” Deep link `manager.html?tab=patterns` opens Manager on Patterns tab on page load
- [ ] `VER-NAV-019` [P1] â€” Deep link `create.html?action=home-image-pending&from=home` shows image processor UI in Creator (if image pending in sessionStorage / state)
- [ ] `VER-NAV-020` [P1] â€” Clicking "Open in Stitch Tracker" link from Creator Export tab (EL-SCR-008-01) navigates to stitch.html with project already set
- [ ] `VER-NAV-021` [P1] â€” Mobile: clicking project card "Track" button on home.html works identically to desktop (no gesture/swipe interference)
- [ ] `VER-NAV-022` [P2] â€” Service Worker: loading app offline from precache correctly renders home.html entry point without 404 errors
- [ ] `VER-NAV-023` [P2] â€” Tablet: Home tab bar (EL-SCR-001-02) responds to swipe gestures to switch tabs (if implemented; otherwise P3 opportunity)
- [ ] `VER-NAV-024` [P2] â€” Navigating between Creator design/track/stats modes via history.replaceState does not create history entries; browser back skips to previous full page
- [ ] `VER-NAV-025` [P2] â€” Clicking logo from any page (Creator/Tracker/Manager) navigates to home.html and correctly initialises Home state
- [ ] `VER-NAV-026` [P2] â€” Project switcher recent projects list (Header) updates within 100ms of setting active project on another page
- [ ] `VER-NAV-027` [P2] â€” Opening Help Drawer (SCR-037) via Header Help button (EL-SCR-035) or `cs:openHelp` event correctly focuses first tab on open
- [ ] `VER-NAV-028` [P2] â€” Help Drawer tab switching (Help / Shortcuts / Getting Started) is smooth and preserves scroll position per tab
- [ ] `VER-NAV-029` [P2] â€” File menu actions (New Project, Export Backup, Preferences) in Header trigger correct modals or navigation
- [ ] `VER-NAV-030` [P3] â€” Deep link with unknown `?action=` param on create.html does not break Creator; falls back to blank project
- [ ] `VER-NAV-031` [P3] â€” Deep link `?mode=showcase` on index.html redirects to `?mode=stats&tab=showcase` and displays showcase view
- [ ] `VER-NAV-032` [P3] â€” Creator stats mode (opened via Header Stats tab or `switchToStats()`) can close back to previous mode (design or track) correctly
- [ ] `VER-NAV-033` [P3] â€” Manager pattern library card "Track" button sets active project and navigates to Tracker
- [ ] `VER-NAV-034` [P3] â€” Command Palette "Import Pattern" action opens file picker; successful import navigates to Creator with imported pattern loaded
- [ ] `VER-NAV-035` [P3] â€” Welcome Wizard (onboarding flow) on first visit correctly gates to the appropriate page (Creator/Manager/Tracker); can replay via Preferences
- [ ] `VER-NAV-036` [P4] â€” Embroidery experimental tool (embroidery.html) is gated behind pref and navigable from home.html Create tab
- [ ] `VER-NAV-037` [P4] â€” Multi-tab sync: setting active project in one tab dispatches `cs:projectsChanged`; other tabs' Header project switchers refresh within 200ms (BroadcastChannel or polling)
- [ ] `VER-NAV-038` [P4] â€” PWA: app icon / bookmark shortcut navigates to home.html (canonical) or index.html if deep link active; redirect guard ensures correct page
- [ ] `VER-NAV-039` [P4] â€” localStorage corruption: if active project key is unreadable, app gracefully falls back to no-project state and navigates to home.html
- [ ] `VER-NAV-040` [P4] â€” Rapid navigation (user clicks Tab A, then Tab B, then back to Tab A within 200ms) does not cause race condition; final tab is always visible