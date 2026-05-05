# Area Spec: shared-shell

> Phase 1B output. See reports/specs/00_INTERFACE_MAP.md for Screen IDs.

## Scope

The shared-shell area encompasses all cross-app UI chrome: the persistent header, global drawers (Help, CommandPalette), global modals (Preferences, Backup/Restore, Welcome Wizard), and shared primitives (Toast, Coachmark, Overlay, PartialStitchThumb). These components render on top of all page content and are accessible from every entry point (Creator, Tracker, Manager, Home). SCR-034 (Embroidery Tool) is experimental and out of scope.

---

## Screen: SCR-035 â€” Header (all pages)

The topbar persists across every page. It contains the app logo/home link, app-section navigation tabs (suppressed on home), sub-page dropdown (creator/editor only), project switcher dropdown, active project badge, sync indicator, command palette trigger, keyboard-shortcuts button, help button, file menu dropdown, and theme toggle.

### EL-SCR-035-01: Logo/Home Link
- **Location**: Top-left corner of topbar
- **Type**: Navigation link (role=link, tabindex=0)
- **Component**: [header.js](header.js#L232-L250)
- **Visible when**: Always
- **Default state**: Idle; scales to cursor:pointer on hover
- **Intended behaviour:**
  - **Trigger**: Click or Enter/Space key
  - **Immediate feedback**: Pointer changes to hand; CSS hover styling applied
  - **State mutation**: None (navigation only)
  - **Navigation**: If current page is `home`, scrolls to top. Otherwise navigates to `home.html`
  - **Side effects**: None
  - **Success outcome**: User returns to home hub or scrolls to top
  - **Error outcome**: None (navigation is synchronous)
- **Keyboard**: Enter or Space activates; always keyboard accessible
- **Constraints**: Must remain 1px from safe-area-inset-top on mobile. Text wraps if logo length exceeds viewport width
- **Relationships**: Provides single source of truth for "go home". Related to app routing system (see reports/00_PROJECT_CONTEXT.md Â§2)

### EL-SCR-035-02: App-Section Navigation Tabs
- **Location**: Left of centre, after logo
- **Type**: Navigation tab group
- **Component**: [header.js](header.js#L252-L267)
- **Visible when**: All pages except home (page !== 'home')
- **Default state**: One tab marked aria-current="page"; others unmarked
- **Tabs rendered**:
  | Label | Page ID | Href |
  |-------|---------|------|
  | Create | creator | home.html?tab=create |
  | Edit | editor | create.html?action=open |
  | Track | tracker | stitch.html?from=home |
  | Stash | manager | manager.html?from=home |
  | Stats | stats | index.html?mode=stats&from=home |

- **Intended behaviour:**
  - **Trigger**: Click on a tab link
  - **Immediate feedback**: Underline/background highlights active tab instantly; scrim dims non-active tabs
  - **State mutation**: URI changes; page reloads (full navigation)
  - **Navigation**: Full page load to the destination URL
  - **Side effects**: Window history is modified; new page loads scripts in load order
  - **Success outcome**: User lands on the target page with its state initialised
  - **Error outcome**: If JS fails to load, page loads as a bare HTML skeleton (Service Worker serves fallback)
- **Keyboard**: Tab cycles through tabs; Shift+Tab reverses
- **Constraints**: Hidden entirely on home so the HomeTabBar (in home-app.js) is the single source of truth for tab navigation on that page
- **Relationships**: Tabs marked `__switchToCreate`, `__switchToEdit`, `__switchToTrack`, `__switchToStats` can be overridden by page-specific functions for same-document navigation; defaults to full href navigation if override not found

### EL-SCR-035-03: Sub-Page Dropdown (Creator/Editor only)
- **Location**: Left-centre, after app-section tabs
- **Type**: Dropdown menu (role=button, aria-haspopup=true, aria-expanded)
- **Component**: [header.js](header.js#L269-L291)
- **Visible when**: page === 'creator' OR page === 'editor'
- **Default state**: Closed (aria-expanded=false); button text shows active tab label (e.g., "Pattern", "Materials & Output")
- **Dropdown options**:
  | ID | Label | Visible when |
  |----|----|---|
  | pattern | Pattern | Always |
  | project | Project | Always |
  | materials | Materials & Output | Always |

- **Intended behaviour:**
  - **Trigger**: Click button or Space/Enter
  - **Immediate feedback**: Dropdown slides down; button aria-expanded toggles to true
  - **State mutation**: app.tab updates in Creator state (handled by useCreatorState)
  - **Navigation**: None (same page)
  - **Side effects**: Sidebar and canvas content update to reflect chosen tab
  - **Success outcome**: User sees content of selected tab; label updates on button
  - **Error outcome**: None (menu items always valid)
- **Keyboard**: Arrow Down/Up cycle options; Enter selects; Escape closes
- **Constraints**: Created legacy values 'prepare', 'legend', 'export' are mapped to 'materials' by useCreatorState setTab wrapper for backward-compat
- **Relationships**: Mirrors creator/bundle.js tab state; Phase 8 collapsed 5 sub-pages to 3

### EL-SCR-035-04: Project Switcher Dropdown
- **Location**: Left-centre, after sub-page dropdown
- **Type**: Menu (role=menu, aria-label="Switch project", aria-expanded)
- **Component**: [header.js](header.js#L73-L200)
- **Visible when**: Always
- **Default state**: Closed; button shows initials avatar + project name + chevron
- **Visible items**:
  - Current active project (if any) â€” avatar with initials, name, % completion
  - Up to 5 most recently updated projects (sorted by updatedAt descending)
  - "All projectsâ€¦" entry that opens the full project picker modal

- **Intended behaviour:**
  - **Trigger**: Click button or Space/Enter to toggle menu
  - **Immediate feedback**: Menu slides down; button aria-expanded=true; first menuitem receives focus
  - **State mutation**: ProjectStorage.setActiveProject(id) when a recent project is clicked
  - **Navigation**: Navigates to stitch.html (tracker page for tracking mode)
  - **Side effects**: New project loads; active project pointer updated in localStorage + CustomEvent cs:projectsChanged dispatched
  - **Success outcome**: User switches to tracking the selected project in Tracker
  - **Error outcome**: ProjectStorage.setActiveProject silently fails if project not found; navigation still occurs
- **Keyboard**: Arrow Down/Up cycle items; Arrow Left closes menu; Enter selects item; Escape closes
- **Constraints**: Recents list loaded async from ProjectStorage; may show "No other projects yet" if only one project exists; 5-project hard limit
- **Relationships**: List populated from ProjectStorage.listProjects(); reacts to cs:projectsChanged event; avatar initials computed from project name (first 2 chars or first+second word initials)

### EL-SCR-035-05: Active Project Badge
- **Location**: Right of project switcher
- **Type**: Display + inline text input (when editable)
- **Component**: [header.js](header.js#L304-L365)
- **Visible when**: propProjectName OR projName is truthy
- **Default state**: Static text display; inline chevron icon if onNameChange callback provided
- **Data source**: propProjectName prop (preferred) or ActiveProject from ProjectStorage (fallback)
- **Update trigger**: cs:projectChanged CustomEvent or propProjectName prop change
- **Display logic**:
  - Primary: 60-char truncated project name
  - Secondary: Completion % (e.g., "42%") shown as horizontal progress bar with label
  - Tertiary (optional): Save status badge (see EL-SCR-035-06)

- **Intended behaviour:**
  - **Trigger**: Click name or pencil icon to enter edit mode; click elsewhere or press Escape to cancel; press Enter to commit
  - **Immediate feedback**: Name field inline-edits; chevron disappears; input receives focus; characters typed update draft
  - **State mutation**: onNameChange(trimmed) callback fired; name saved to project (ProjectStorage.save)
  - **Navigation**: None
  - **Side effects**: Undo/redo may interact with project save state
  - **Success outcome**: Project renamed; UI updates to show new name
  - **Error outcome**: Trim-to-60-char silently caps overflow; if onNameChange not provided, entire badge is read-only
- **Keyboard**: Enter commits; Escape reverts to previous name; Tab moves focus out of input
- **Constraints**: Max 60 chars enforced by input maxLength + client-side trim; name persists to IndexedDB
- **Relationships**: Consumed by Creator's useCreatorState for prop-passing; Tracker reads from ProjectStorage directly; name edits trigger ProjectStorage saves

### EL-SCR-035-06: Save Status Badge
- **Location**: Right of project name, inline
- **Type**: Display + ephemeral status indicator
- **Component**: [header.js](header.js#L202-L230)
- **Visible when**: Creator pages (page === 'creator') with active save controller; other pages show static "All changes saved"
- **Data source**: saveStatus, savedAt, saveError props (driven by creator/saveStatus.js state machine)
- **Default state**: 'saved' with recent timestamp ("Saved 5 s ago")
- **States**:
  | State | Icon | Label | Colour | Title | Action button |
  |----|----|----|----|----|----|
  | idle | â€” | (none) | â€” | â€” | â€” |
  | pending | pencil | "Editingâ€¦" | --text-secondary | "Unsaved changes â€” auto-saving in a moment" | â€” |
  | saving | hourglass | "Savingâ€¦" | --text-secondary | "Saving to this deviceâ€¦" | â€” |
  | saved | check | "Saved X time ago" | --success | "Your work auto-saves to this device" | â€” |
  | error | warning | "Save failed" | --danger | "Save failed: [error.message]" | "Retry" button |

- **Intended behaviour:**
  - **Trigger**: Automatically updates on save state changes (rerender every 15s when in 'saved' state so timestamp stays fresh)
  - **Immediate feedback**: Icon + label update instantly; colour coding provides visual affordance (green = safe, orange/red = alert)
  - **State mutation**: onRetrySave() called when Retry button clicked
  - **Navigation**: None
  - **Side effects**: Timer ticks every 15s to refresh timestamp display; keeps user aware of freshness
  - **Success outcome**: User sees confidence that work is saved or knows when to retry
  - **Error outcome**: Error state persists until user clicks Retry or manually saves
- **Keyboard**: "Retry" button is Tab-accessible; focus trap follows standard modal pattern
- **Constraints**: Relative timestamp falls back to absolute clock time after 24h ("at 3:45 PM"); fallback for test environments returns ISO string
- **Relationships**: Consumes props from creator/saveStatus.js reducer; non-Creator pages render legacy "All changes saved" label until they opt in to the state machine

### EL-SCR-035-07: Sync Status Indicator
- **Location**: Right side, after save badge
- **Type**: Icon button (aria-label, title)
- **Component**: [header.js](header.js#L369-L408)
- **Visible when**: typeof SyncEngine !== 'undefined' (sync is available)
- **Default state**: Icon reflects sync status; click navigates to home screen
- **Sync states and icons**:
  | State | Icon | Has Watch Dir | Auto-sync | Title example |
  |----|----|----|----|---|
  | Unconfigured | cloud-off | false | n/a | "Sync â€” not yet configured" |
  | Folder connected | cloud-sync | true | false | "Sync folder connected" |
  | Auto-sync active | cloud-check | true | true | "Sync folder connected (auto-sync on)\nLast export: ..." |
  | History only | cloud-check | false | n/a | "Last export: ...\nLast import: ..." |

- **Intended behaviour:**
  - **Trigger**: Click button
  - **Immediate feedback**: Icon colour changes based on state; title tooltip shows full status
  - **State mutation**: None (display only)
  - **Navigation**: Navigates to home.html (or calls window.__goHome if available)
  - **Side effects**: Sync engine continues operating in background regardless
  - **Success outcome**: User jumps to home dashboard where Sync section provides controls
  - **Error outcome**: None (navigation is synchronous)
- **Keyboard**: Enter/Space activates; standard a11y
- **Constraints**: Fetches sync status from SyncEngine.getSyncStatus() on mount and component update; caches result
- **Relationships**: Calls SyncEngine.getWatchDirectory() on mount to initialise status; icon system from window.Icons.*

### EL-SCR-035-08: Command Palette Trigger
- **Location**: Right side, after sync indicator
- **Type**: Icon button (aria-label, title)
- **Component**: [header.js](header.js#L410-L418)
- **Visible when**: window.CommandPalette is defined
- **Default state**: Idle; title shows "Open command palette (Ctrl/Cmd+K)"
- **Intended behaviour:**
  - **Trigger**: Click or Ctrl/Cmd+K keyboard shortcut
  - **Immediate feedback**: CommandPalette overlay renders instantly; input focused and pre-selected
  - **State mutation**: None on header; CommandPalette state manages itself
  - **Navigation**: Depends on action selected in palette (varies)
  - **Side effects**: Body scroll locked; focus trap applied; esc/scrim-click closes
  - **Success outcome**: User enters command search mode
  - **Error outcome**: None (palette always renders)
- **Keyboard**: Ctrl/Cmd+K opens; Escape/pointerdown-outside closes
- **Constraints**: Header button is fallback for touch users who can't use keyboard shortcut
- **Relationships**: Delegates to CommandPalette.open(); global keydown handler still owns the Ctrl/Cmd+K hotkey

### EL-SCR-035-09: Keyboard Shortcuts Button
- **Location**: Right side, after command palette trigger
- **Type**: Icon button (aria-label)
- **Component**: [header.js](header.js#L420-L428)
- **Visible when**: Always
- **Default state**: Idle; title shows "Keyboard shortcuts"
- **Intended behaviour:**
  - **Trigger**: Click to open HelpDrawer on Shortcuts tab
  - **Immediate feedback**: HelpDrawer slides in from right; Shortcuts tab active; query focus
  - **State mutation**: HelpDrawer.open({ tab: 'shortcuts' })
  - **Navigation**: None (drawer)
  - **Side effects**: Any open modals remain open behind drawer (not dismissed)
  - **Success outcome**: User sees all keyboard shortcuts for active page scopes
  - **Error outcome**: None (drawer rendering is always available)
- **Keyboard**: Enter/Space activates button; inside drawer, keyboard shortcuts are displayed
- **Constraints**: Shares HelpDrawer state with other buttons; last-open tab persisted to localStorage
- **Relationships**: Calls window.HelpDrawer.open({ tab: 'shortcuts' }); drawer is global singleton

### EL-SCR-035-10: Help Button
- **Location**: Right side, after shortcuts button
- **Type**: Icon button + label text (aria-label, aria-expanded)
- **Component**: [header.js](header.js#L430-L450)
- **Visible when**: Always
- **Default state**: aria-expanded reflects HelpDrawer.isOpen(); icon is help/question mark
- **Intended behaviour:**
  - **Trigger**: Click or global "?" key
  - **Immediate feedback**: HelpDrawer slides in from right; Help tab active
  - **State mutation**: HelpDrawer.open({ tab: 'help' }); aria-expanded updates
  - **Navigation**: None (drawer)
  - **Side effects**: CustomEvent cs:helpStateChange dispatched by HelpDrawer (used by header to update aria-expanded)
  - **Success outcome**: User reads help content relevant to current page context
  - **Error outcome**: None (drawer always renders)
- **Keyboard**: "?" key opens (except in text inputs); Enter/Space on button; inside drawer keyboard-accessible
- **Constraints**: aria-expanded state syncs via cs:helpStateChange event listener (see [header.js](header.js#L689-L700))
- **Relationships**: HelpDrawer global singleton; P1 TODO: verify aria-expanded always reflects drawer state

### EL-SCR-035-11: File Menu Dropdown
- **Location**: Right edge of topbar
- **Type**: Menu button (role=button, aria-haspopup=true, aria-expanded)
- **Component**: [header.js](header.js#L452-L603)
- **Visible when**: Always
- **Default state**: Closed; button label is "File"; chevron points down
- **Menu sections**:
  1. Storage usage summary (if storageUsage prop provided) â€” read-only display
  2. Theme toggle (Cycle: light â†’ dark â†’ system)
  3. Project operations (New, Switch, Preferences, Open, Download, Open in Tracker, Export PDF)
  4. Backup/Restore (Export Backup, Restore from Backup)
  5. Sync operations (Export Sync, Import Sync â€” if SyncEngine available)

- **Intended behaviour:**
  - **Trigger**: Click button or Space/Enter
  - **Immediate feedback**: Menu slides up; button aria-expanded=true; menu has role=menu
  - **State mutation**: Varies by item clicked (see sub-items below)
  - **Navigation**: Varies by item
  - **Side effects**: Click any item closes menu; page callbacks may fire
  - **Success outcome**: User performs the selected file operation
  - **Error outcome**: Varies by operation (see sub-items)
- **Keyboard**: Arrow Down/Up cycle; Enter selects; Escape closes
- **Constraints**: Menu appears at right edge and anchors bottom-right so it doesn't overflow viewport; items conditionally render based on page and prop availability
- **Relationships**: Menu items wire to props like onNewProject, onOpen, onSave, onExportPDF, onPreferences; pages provide these callbacks

### EL-SCR-035-11a: Storage Usage Summary
- **Location**: Top of File menu
- **Type**: Display (non-interactive)
- **Component**: [header.js](header.js#L465-L471)
- **Visible when**: storageUsage prop provided
- **Default state**: Shows lock/hourglass icon + "Protected" or "Temporary" label + used/quota breakdown
- **Intended behaviour:**
  - **Trigger**: Display only (no interaction)
  - **Immediate feedback**: None
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User sees storage quota usage
  - **Error outcome**: None
- **Constraints**: If quota is absent, only shows "X MB" without total. Format: "Protected/Temporary Â· X.X MB / ~Y MB"
- **Relationships**: storageUsage prop is { persistent: bool, used: bytes, quota?: bytes } from navigator.storage.estimate()

### EL-SCR-035-11b: Theme Toggle
- **Location**: First interactive item in File menu
- **Type**: Menu item button (role=menuitem)
- **Component**: [header.js](header.js#L472-L493)
- **Visible when**: Always
- **Default state**: Icon reflects current theme (sun for light, moon for dark, sun/moon depending on resolved for system)
- **Intended behaviour:**
  - **Trigger**: Click or Space/Enter when focused
  - **Immediate feedback**: Theme cycles: light â†’ dark â†’ system â†’ light. Icon updates. Body class pref-light/pref-dark applied. [data-theme] attribute set on <html>
  - **State mutation**: UserPrefs.set('a11yDarkMode', next); CustomEvent cs:prefsChanged dispatched
  - **Navigation**: None
  - **Side effects**: Every element with CSS var(--text-primary) etc. re-renders with new colour
  - **Success outcome**: App switches to chosen theme; preference persists
  - **Error outcome**: None (theme always switches)
- **Keyboard**: Space/Enter to select when menuitem focused
- **Constraints**: Icons only render when window.Icons is available; fallback is no icon. System mode auto-resolves using window.matchMedia("(prefers-color-scheme: dark)")
- **Relationships**: Reads/writes UserPrefs key 'a11yDarkMode'; apply-prefs.js listens for cs:prefsChanged and applies root classes

### EL-SCR-035-11c: Project Operations (New, Switch, Open, etc.)
- **Location**: Middle section of File menu
- **Type**: Menu item buttons
- **Component**: [header.js](header.js#L495-L531)
- **Visible when**: Conditionally â€” each item renders only if its callback prop is provided (onNewProject, onOpenProject, onPreferences, onOpen, onSave, onTrack, onExportPDF)
- **Intended behaviour:**
  - **Trigger**: Click item
  - **Immediate feedback**: Menu closes immediately; callback fires
  - **State mutation**: Depends on callback (typically page state change or modal open)
  - **Navigation**: Depends on callback
  - **Side effects**: Varies
  - **Success outcome**: Varies by operation
  - **Error outcome**: Varies by operation
- **Keyboard**: Space/Enter when focused
- **Constraints**: Items are filtered out if callback not provided, so missing callbacks don't render as disabled buttons
- **Relationships**: Each callback is wired by the consuming page (Creator, Tracker, Manager)

### EL-SCR-035-11d: Backup/Restore Operations
- **Location**: Lower middle of File menu (after divider)
- **Type**: Menu item buttons + file input label
- **Component**: [header.js](header.js#L533-L571)
- **Visible when**: Always (inline fallback in header if onBackupDownload/onRestoreFile not provided)
- **Items**:
  | Label | Icon | Action |
  |----|----|---|
  | Export Backup | save | BackupRestore.downloadBackup() or calls onBackupDownload prop |
  | Restore from Backup | folder | File picker; calls onRestoreFile(e) prop or inline handleInlineRestore |

- **Intended behaviour:**
  - **Trigger (Export)**: Click; async download starts
  - **Trigger (Restore)**: Click; file picker opens; select .json/.csb file; parsing + validation + confirmation modal + restore
  - **Immediate feedback**: Backup downloads silently; Restore shows Toast on success/error
  - **State mutation**: Full database restore (destructive!)
  - **Navigation**: None (unless page reloads after restore)
  - **Side effects**: All data overwritten; localStorage keys reset; migrations may run post-restore
  - **Success outcome**: User has backup file or data is restored
  - **Error outcome**: Toast shows error message; original data intact
- **Keyboard**: Space/Enter selects; file input opened via label click
- **Constraints**: Inline restore handles parsing legacy JSON + new CSB1 compressed format. On restore, user sees confirmation dialog with project/thread/pattern count before committing
- **Relationships**: Uses BackupRestore module functions; P1 TODO: BackupRestore import is destructive â€” confirm modal appears before executing restore

### EL-SCR-035-11e: Sync Operations (if SyncEngine available)
- **Location**: Bottom of File menu (after Backup/Restore divider)
- **Type**: Menu item buttons + file input label
- **Component**: [header.js](header.js#L573-L603)
- **Visible when**: typeof SyncEngine !== 'undefined'
- **Items**:
  | Label | Icon | Action |
  |----|----|---|
  | Export Sync (.csync) | cloud-sync | SyncEngine.downloadSync() |
  | Import Sync (.csync) | cloud-sync | File picker; SyncEngine.readSyncFile â†’ SyncEngine.prepareImport â†’ SyncEngine.executeImport |

- **Intended behaviour:**
  - **Trigger**: Click
  - **Immediate feedback**: Export downloads silently; Import shows file picker
  - **State mutation**: Sync plan is merged into databases (or simple confirm then reload)
  - **Navigation**: None
  - **Side effects**: Cross-device sync operations; may reload page after import
  - **Success outcome**: Sync file exported or imported; confirmation Toast
  - **Error outcome**: Toast shows error; data rolled back
- **Keyboard**: Space/Enter selects; label-based file input
- **Constraints**: Import dispatches 'sync-plan-ready' CustomEvent to home screen (if listening); non-home pages show simple confirm dialog instead of detailed plan editor
- **Relationships**: SyncEngine is optional; entire section hidden if missing. Import on non-home pages automatically resolves conflicts by keeping local versions

---

## Screen: SCR-036 â€” Context Bar (project metadata row)

A horizontal bar below the header that appears on Creator and Tracker pages when a project is active. Displays project name (editable), dimensions, colour count, completion %, and mode-specific action buttons.

### EL-SCR-036-01: Project Name + Metadata
- **Location**: Left side of context bar
- **Type**: Display + inline edit
- **Component**: [header.js](header.js#L1-L40) ContextBar function
- **Visible when**: name prop is truthy
- **Default state**: Static text; name Â· dimensions Â· colour count
- **Intended behaviour:**
  - **Trigger**: Click name or pencil icon to edit; Enter to commit; Escape to cancel
  - **Immediate feedback**: Input appears, pre-filled with current name, maxLength 60
  - **State mutation**: onNameChange(trimmed) callback fires; name saved
  - **Navigation**: None
  - **Side effects**: Undo/redo may interact
  - **Success outcome**: Project renamed; display updates
  - **Error outcome**: Trim-to-60 silently caps overflow
- **Keyboard**: Enter commits; Escape reverts; Tab moves focus
- **Constraints**: Only editable if onNameChange prop provided; otherwise read-only
- **Relationships**: Mirror of header project name (EL-SCR-035-05) but in a different visual context

### EL-SCR-036-02: Auto-saved Indicator
- **Location**: Next to metadata, inline
- **Type**: Display
- **Component**: [header.js](header.js#L32-L39)
- **Visible when**: showAutosaved prop is true
- **Default state**: Check icon + "All changes saved" label in green
- **Intended behaviour:**
  - **Trigger**: Display only when showAutosaved true
  - **Immediate feedback**: None (static display)
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User sees confidence work is auto-saved
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: Title tooltip explains auto-save and Download download options
- **Relationships**: Legacy UI; replaced by SaveStatusBadge (EL-SCR-035-06) in Creator

### EL-SCR-036-03: Completion Percentage Bar
- **Location**: Next to metadata
- **Type**: Display + progress indicator
- **Component**: [header.js](header.js#L41-L47)
- **Visible when**: pct prop is not null
- **Default state**: Horizontal bar; fill width reflects %; text label shows "42%"
- **Intended behaviour:**
  - **Trigger**: Display updates when pct prop changes
  - **Immediate feedback**: Bar animates fill width (CSS transition)
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User sees tracking progress at a glance
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: pct is 0-100 integer; bar clips at max width
- **Relationships**: Computed from pattern.length and done array count in consuming page

### EL-SCR-036-04: Mode-Specific Buttons
- **Location**: Right side of context bar
- **Type**: Interactive button group
- **Component**: [header.js](header.js#L48-L70)
- **Visible when**: Varies by page
- **Default state**: One or two buttons depending on page context
- **Buttons**:
  | Label | Icon | Visible when | Action |
  |----|----|----|----|
  | Edit Pattern | pencil | page === 'tracker' | onEdit() callback; navigate to Creator |
  | Track â€º | (arrow) | page === 'creator' | onTrack() callback; navigate to Tracker |
  | Download | â€” | onSave provided | onSave(); downloads .json project file |

- **Intended behaviour:**
  - **Trigger**: Click button
  - **Immediate feedback**: Button visual feedback (hover/active); navigation/callback occurs
  - **State mutation**: Depends on button
  - **Navigation**: Varies (Edit/Track navigate pages; Download stays on page)
  - **Side effects**: Varies
  - **Success outcome**: User switches mode or saves file
  - **Error outcome**: None (navigation is synchronous)
- **Keyboard**: Tab cycles; Enter/Space activates
- **Constraints**: Buttons filter based on page and callback availability
- **Relationships**: Edit/Track buttons are mutually exclusive per page; Download wires to ProjectStorage or Creator auto-save

---

## Screen: SCR-037 â€” Help Drawer (all pages)

A right-aligned drawer that slides in from the right, containing three tabs: Help (contextual topics), Shortcuts (keyboard registry), and Getting Started (evergreen first-run hints). Global singleton; multiple pages can trigger it simultaneously.

### EL-SCR-037-01: Drawer Shell
- **Location**: Right edge of viewport, full height
- **Type**: Overlay drawer (role=dialog, aria-modal=false)
- **Component**: [help-drawer.js](help-drawer.js#L550+) render function (inline React)
- **Visible when**: HelpDrawer.open() called or never (initially closed)
- **Default state**: Closed; renders into body-level <div id="cs-help-drawer-root">
- **Intended behaviour:**
  - **Trigger**: HelpDrawer.open({ tab, context, query }); global "?" key; Help button (EL-SCR-035-10)
  - **Immediate feedback**: Drawer slides in from right with CSS transition; tab active; search input focused
  - **State mutation**: state.open=true; selected tab persisted to localStorage cs_help_drawer_tab
  - **Navigation**: None (stays on page)
  - **Side effects**: Body scroll locked (Overlay component); focus trap applied; CustomEvent cs:helpStateChange dispatched
  - **Success outcome**: User can read help and search
  - **Error outcome**: None (drawer always renders)
- **Keyboard**: Escape closes; Tab traps focus inside drawer; all buttons Tab-accessible
- **Constraints**: 380px desktop / 100vw-32px mobile (â‰¤480px); aria-modal=false so page behind stays interactive; click-outside or Esc closes
- **Relationships**: Global singleton; persists last-open tab across page reloads. CustomEvent cs:helpStateChange fired on open/close so Header can sync aria-expanded state (P1 TODO: verify this always happens)

### EL-SCR-037-02: Tab Navigation
- **Location**: Top of drawer, horizontal tabs
- **Type**: Tab group (role=tablist)
- **Component**: [help-drawer.js](help-drawer.js#L550+)
- **Visible when**: Always (part of drawer shell)
- **Default state**: One tab marked aria-selected=true; others aria-selected=false
- **Tabs**:
  | Tab ID | Label | Icon (if any) |
  |----|----|---|
  | help | Help | wand/needle/box (depends on page context) |
  | shortcuts | Shortcuts | keyboard |
  | getting-started | Getting Started | (no icon) |

- **Intended behaviour:**
  - **Trigger**: Click tab or use Left/Right Arrow keys
  - **Immediate feedback**: Tab becomes active (aria-selected=true, background highlight); content switches instantly
  - **State mutation**: state.tab updated; new tab persisted to localStorage
  - **Navigation**: None
  - **Side effects**: Content area re-renders with new tab's content
  - **Success outcome**: User switches to chosen tab
  - **Error outcome**: None
- **Keyboard**: Left/Right arrows cycle tabs; Home/End jump to first/last tab
- **Constraints**: Tabs are horizontal row; small touch targets (P2 TODO: verify â‰¥44px height on touch)
- **Relationships**: state.tab value (help|shortcuts|getting-started) determines which content renders below

### EL-SCR-037-03: Search Input
- **Location**: Below tabs
- **Type**: Text input
- **Component**: [help-drawer.js](help-drawer.js#L550+)
- **Visible when**: Help or Shortcuts tab active
- **Default state**: Empty; placeholder "Searchâ€¦"; query prop may pre-fill
- **Intended behaviour:**
  - **Trigger**: Type characters
  - **Immediate feedback**: Results filter in real-time; no results shows "No matches."
  - **State mutation**: state.query updated on each keystroke
  - **Navigation**: None
  - **Side effects**: Help/Shortcuts sections below re-render with filtered items
  - **Success outcome**: User finds relevant help content quickly
  - **Error outcome**: None (always searchable)
- **Keyboard**: Backspace deletes; Escape clears query and closes drawer
- **Constraints**: Search is case-insensitive; expands American/British spelling aliases (e.g., "color" matches "colour") via _SPELLING_ALIASES
- **Relationships**: Filter state updated live; results show matches in Help topics or Shortcut registry

---

## Screen: SCR-037a â€” Help Drawer â€” Help Tab

The Help tab displays curated help topics organized by area (Pattern Creator, Stitch Tracker, Stash Manager, Saving, Stats, Stitching Style, Glossary). Topics are searchable and grouped by section.

### EL-SCR-037a-01: Help Topic List
- **Location**: Scrollable content area below search
- **Type**: Display list (no interactive elements beyond search)
- **Component**: [help-drawer.js](help-drawer.js) HelpSection function
- **Visible when**: Help tab active
- **Default state**: All topics shown (or filtered by search query)
- **Data source**: HELP_TOPICS array in help-drawer.js; filtered by filterItems() on each search change
- **Update trigger**: state.query changes; state.tab === 'help'
- **Display logic**:
  - Group topics by area (Pattern Creator, Tracker, Manager, Saving, Stats, Stitching Style, Glossary)
  - Within each group, display sections with heading + body + bullet list
  - Sections marked with area label (uppercase, smaller text, borderBottom)
  - Headings bold; body text normal; bullets indented list

- **Intended behaviour:**
  - **Trigger**: Display only (no click targets on topics themselves)
  - **Immediate feedback**: Topics render instantly; search results update in real-time
  - **State mutation**: None (read-only display)
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User reads help content relevant to their question
  - **Error outcome**: If search returns no matches, show "No matches." message
- **Keyboard**: Page Up/Down scroll; no interactive elements in topic list itself
- **Constraints**: Topics are hard-coded English text; no italics or emoji in copy (SVG icons where needed). Bullet text uses <strong> for term + description format.
- **Relationships**: HELP_TOPICS constant in help-drawer.js; manually maintained by UX writer. Searchable index built at module init (buildHelpItems)

---

## Screen: SCR-037b â€” Help Drawer â€” Shortcuts Tab

The Shortcuts tab displays a categorized registry of all keyboard shortcuts for the active page scopes, with key sequence and description. Shortcuts are grouped by scope (Global, Pattern Creator, Stitch Tracker, etc.) and searchable.

### EL-SCR-037b-01: Shortcuts Registry List
- **Location**: Scrollable content area below search
- **Type**: Display list
- **Component**: [help-drawer.js](help-drawer.js) ShortcutsSection function
- **Visible when**: Shortcuts tab active
- **Default state**: All shortcuts for active scopes shown (or filtered by search query)
- **Data source**: Merged from SHORTCUTS constant (built-in) + window.Shortcuts.list() (runtime registry from shortcuts.js)
- **Update trigger**: state.query changes; state.tab === 'shortcuts'; HelpDrawer.open({ context }) changes scope priority
- **Display logic**:
  - Group by scope (Global, Pattern Creator, Stitch Tracker, Stitch Tracker â€” Highlight View, Stash Manager)
  - If context provided, prioritise that scope first
  - Within each scope, display rows: key(s) on left, description on right
  - Keys formatted via window.Icons or as <kbd> elements with | separator

- **Intended behaviour:**
  - **Trigger**: Display only; context can be provided to HelpDrawer.open({ context: 'creator' }) to pre-filter to creator shortcuts
  - **Immediate feedback**: Shortcuts render instantly; search filters results
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User finds the shortcut they need
  - **Error outcome**: If search returns no matches, show "No matches." message
- **Keyboard**: Page Up/Down scroll; no interactive elements in list
- **Constraints**: Keys always shown in <kbd> tags with monospace font and subtle border (Workshop styling). Multiple keys for same action separated by "/" with grey text. Allowed emoji-like glyphs: â†‘ â†“ â† â†’ (arrow keys inside <kbd>), âŒ˜ â‡§ âŒ¥ âŒƒ â†µ (modifier keys inside <kbd>) â€” these are NOT pictographic emoji but keyboard glyphs per AGENTS.md
- **Relationships**: Registry sources from SHORTCUTS constant + window.Shortcuts.list(); built at module init. Per-page scopes determined by Shortcuts.getActiveScopes()

---

## Screen: SCR-037c â€” Help Drawer â€” Getting Started Tab

The Getting Started tab displays evergreen first-run hints organized into actionable cards (Make Pattern, Track Stitches, Manage Stash, Creator Walkthrough, Learn Shortcuts) plus a "Replay Tutorials" button to re-trigger coachmarks and WelcomeWizard flows.

### EL-SCR-037c-01: Getting Started Cards
- **Location**: Scrollable content area
- **Type**: Display cards with action buttons
- **Component**: [help-drawer.js](help-drawer.js) GettingStartedSection function
- **Visible when**: Getting Started tab active
- **Default state**: All cards shown
- **Cards**:
  | Card | Heading | Body | Action Button | Action |
  |----|----|----|----|---|
  | Make Pattern | "Make your first pattern" | Describes Creator workflow | "Try a sample pattern" | Calls window.buildSampleProject() + saves + navigates to stitch.html |
  | Track | "Track your stitches" | Describes Tracker workflow | "Replay the Tracker walkthrough" | Resets WelcomeWizard('tracker'); dispatches cs:showWelcome event |
  | Stash | "Manage your stash" | Describes Stash Manager workflow | "Replay the Stash walkthrough" | Resets WelcomeWizard('manager'); dispatches cs:showWelcome event |
  | Creator Walkthrough | "Take the Creator walkthrough" | Describes guided tour | "Replay the Creator walkthrough" | Resets WelcomeWizard('creator'); dispatches cs:showWelcome event |
  | Shortcuts | "Learn the shortcuts" | Points to this drawer's Shortcuts tab | (none) | â€” |
  | Guided Tours (section) | "Guided tours" | Explains coachmarks | "Restart guided tours" | Calls window.resetCoaching() |

- **Intended behaviour:**
  - **Trigger**: Click action button
  - **Immediate feedback**: Button click closes drawer; callback fires
  - **State mutation**: Sample project created; WelcomeWizard flags reset; coachmark prefs cleared
  - **Navigation**: Varies (sample project navigates to stitch.html; tours stay on page but re-trigger wizards)
  - **Side effects**: Coachmark sequences reset so next project start shows coaching
  - **Success outcome**: User starts workflow or tour replays
  - **Error outcome**: None (actions are idempotent)
- **Keyboard**: Tab cycles buttons; Enter/Space activates
- **Constraints**: Action buttons styled identically; no emoji in copy. Card text explains each feature in plain language
- **Relationships**: Calls window.buildSampleProject (if available), window.WelcomeWizard.reset(), window.resetCoaching(); dispatches CustomEvent cs:showWelcome for consuming pages

---

## Screen: SCR-038 â€” Command Palette (global)

A full-screen search and action interface accessible via Ctrl/Cmd+K or the command palette button. Displays recent projects, static actions (navigation, help, preferences), and page-specific actions. Fuzzy-scored results with keyboard-driven navigation.

### EL-SCR-038-01: Command Palette Overlay
- **Location**: Centred, top 20vh from top
- **Type**: Overlay dialog (role=dialog, aria-label="Command palette")
- **Component**: [command-palette.js](command-palette.js) (no JSX; plain DOM)
- **Visible when**: CommandPalette.open() called or Ctrl/Cmd+K pressed
- **Default state**: Closed initially; opens with input focused and pre-selected
- **Intended behaviour:**
  - **Trigger**: Ctrl/Cmd+K globally or CommandPalette.open()
  - **Immediate feedback**: Overlay renders instantly; input is focused; first result highlighted
  - **State mutation**: None on header; palette manages its own state
  - **Navigation**: Depends on action selected
  - **Side effects**: Body scroll locked; focus trapped inside overlay
  - **Success outcome**: User can search and execute action
  - **Error outcome**: None (palette always renders)
- **Keyboard**: Escape closes; Enter selects; Arrow Up/Down navigate; Tab/Shift+Tab focused trap
- **Constraints**: Max-width 520px on desktop, calc(100vw - 32px) on mobile; overlay max-height calc(100dvh - 20vh - 16px)
- **Relationships**: Singleton created on first Ctrl/Cmd+K press; reused on subsequent opens

### EL-SCR-038-02: Search Input
- **Location**: Top of overlay, full width
- **Type**: Text input (type=text, placeholder="Search actionsâ€¦")
- **Component**: [command-palette.js](command-palette.js) buildOverlay function
- **Visible when**: Always (part of palette)
- **Default state**: Empty, focused, caret blinking
- **Intended behaviour:**
  - **Trigger**: Type characters
  - **Immediate feedback**: Results filter in real-time; fuzzy scoring ranks by relevance
  - **State mutation**: inputEl.value updated; currentResults array re-scored
  - **Navigation**: None (search only)
  - **Side effects**: Result list below re-renders
  - **Success outcome**: User finds desired action
  - **Error outcome**: No results shows "No matching actions." message
- **Keyboard**: Backspace deletes; arrows don't move input focus (navigation keys navigate results); Escape clears and closes
- **Constraints**: IME composition active skips re-render to avoid searching on partial characters
- **Relationships**: Input drives fuzzy scoring via fuzzyScore() function; weights keyword matches highest

### EL-SCR-038-03: Results List
- **Location**: Below search input
- **Type**: Scrollable list (role=listbox)
- **Component**: [command-palette.js](command-palette.js) renderResults function
- **Visible when**: Always
- **Default state**: Empty or populated with results (Recent Projects, Navigate, Actions, Settings sections)
- **Result sections**:
  | Section | Label | Items | When shown |
  |----|----|----|----|
  | Recent Projects | "Recent Projects" | Up to 5 most recently updated projects | Always (empty state if no projects) |
  | Navigate | "Navigate" | Go Home, Switch to Creator/Tracker/Manager/Stats | Always |
  | Actions | "Actions" | Import Pattern, Help, Keyboard Shortcuts, Rename Project, Bulk Add Threads | Page-specific; varies |
  | Settings | "Settings" | Open Preferences | Always |

- **Intended behaviour:**
  - **Trigger**: Results render on input change; click or Enter selects
  - **Immediate feedback**: Hovered result highlights; selected result shows aria-selected=true
  - **State mutation**: Selected action executed
  - **Navigation**: Varies by action
  - **Side effects**: Palette closes after action executes; focus restored to previously focused element
  - **Success outcome**: Action executes (or navigation occurs)
  - **Error outcome**: None (actions are wired by consuming pages)
- **Keyboard**: Arrow Up/Down navigate; Enter selects; Space/Enter on current result
- **Constraints**: Max 360px height; overflow scrolls; section headers non-selectable; rows have aria-selected attribute
- **Relationships**: Recent projects loaded async from ProjectStorage; cached in window.__cachedProjectList to avoid re-querying on each open

### EL-SCR-038-04: Results Hint Footer
- **Location**: Bottom of palette
- **Type**: Display
- **Component**: [command-palette.js](command-palette.js) buildOverlay function
- **Visible when**: Always
- **Default state**: "â†‘ â†“ navigate Â· â†µ select" on left; "Esc close" on right
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: None
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User knows keyboard controls
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: Arrow glyphs (â†‘ â†“) and Enter glyph (â†µ) displayed inside <kbd> tags per keyboard-legend house rule (AGENTS.md). Only emoji-like glyphs allowed here
- **Relationships**: Static text; no state dependency

---

## Screen: SCR-039 â€” Preferences Modal (all pages)

A full-featured preferences panel with 12 categories in a left sidebar and per-category settings on the right. Includes profile/branding, Creator defaults, Tracker defaults, Stash Manager defaults, preview/display, and accessibility. All changes save automatically and dispatch cs:prefsChanged CustomEvent.

### EL-SCR-039-01: Modal Shell
- **Location**: Centred overlay
- **Type**: Overlay dialog (variant=dialog)
- **Component**: [preferences-modal.js](preferences-modal.js) PreferencesModal function (React)
- **Visible when**: preferencesOpen state is true (or triggered by "Open Preferences" command)
- **Default state**: Closed; renders into <div id="root"> or consumes onClose prop to signal parent
- **Intended behaviour:**
  - **Trigger**: File > Preferences, or cs:openPreferences event, or CommandPalette action
  - **Immediate feedback**: Modal slides up; first category panel visible; sidebar highlights active category
  - **State mutation**: None on modal itself (pref changes handled per category; see sub-items)
  - **Navigation**: None (stays on page)
  - **Side effects**: Body scroll locked; focus trap applied; Escape closes
  - **Success outcome**: User can adjust settings
  - **Error outcome**: None (preferences always render)
- **Keyboard**: Escape closes modal; Tab traps focus inside modal; all controls Tab-accessible
- **Constraints**: Max-width 880px desktop; 100vw mobile; max-height 90vh; sidebar 220px fixed width on desktop
- **Relationships**: Wrapper around individual preference panels (Profile, Creator, Tracker, Manager, Preview, Accessibility). Each panel is a separate React component

### EL-SCR-039-02: Sidebar Category Tabs
- **Location**: Left side of modal
- **Type**: Tab navigation (role=tablist)
- **Component**: [preferences-modal.js](preferences-modal.js)
- **Visible when**: Always (part of modal)
- **Default state**: First category active (usually Profile)
- **Categories**:
  1. Your Profile
  2. Pattern Creator
  3. Stitch Tracker
  4. Stash Manager
  5. Preview & Display
  6. Accessibility

- **Intended behaviour:**
  - **Trigger**: Click category button
  - **Immediate feedback**: Category becomes active (highlight); right panel switches to that category's settings
  - **State mutation**: None on sidebar; right panel state updated
  - **Navigation**: None
  - **Side effects**: Right panel re-renders with new category's form
  - **Success outcome**: User sees settings for chosen category
  - **Error outcome**: None
- **Keyboard**: Left/Right arrows cycle categories; Home/End jump to first/last
- **Constraints**: Category names shown as tab labels; mobile may collapse sidebar to icons or sheet
- **Relationships**: Each category is a separate React component (ProfilePanel, CreatorPanel, TrackerPanel, etc.)

### EL-SCR-039-03: Preference Rows (Generic Row Pattern)
- **Location**: Right panel, vertically stacked
- **Type**: Label + description + control
- **Component**: [preferences-modal.js](preferences-modal.js) Row function
- **Visible when**: Depends on category
- **Default state**: Label bold, description smaller text, control (toggle/select/input) on right
- **Intended behaviour:**
  - **Trigger**: Interact with control (e.g., toggle switch, type in input, select from dropdown)
  - **Immediate feedback**: Control updates instantly; UserPrefs.set() called
  - **State mutation**: localStorage key updated (cs_pref_* key); CustomEvent cs:prefsChanged dispatched
  - **Navigation**: None
  - **Side effects**: Live page updates if preference affects visual state (e.g., theme toggle updates immediately)
  - **Success outcome**: Preference saved
  - **Error outcome**: None (all preferences have sensible defaults)
- **Keyboard**: Tab cycles through controls; Space toggles switches; Enter submits inputs; arrows adjust ranges
- **Constraints**: Grid layout with label on left, control on right; gap 18px; max-width 600px for inputs
- **Relationships**: Each preference is wired to UserPrefs via usePref hook; changes dispatch cs:prefsChanged so apply-prefs.js can react

### EL-SCR-039-04: Profile Panel â€” Designer Details
- **Location**: Profile category
- **Type**: Form section
- **Component**: [preferences-modal.js](preferences-modal.js) ProfilePanel > Section (Designer details)
- **Visible when**: Profile category active
- **Default state**: Text inputs with placeholder suggestions
- **Fields**:
  | Field | Key | Type | Max length | Placeholder |
  |----|----|----|----|---|
  | Your name or studio name | designerName | text | â€” | e.g. Katie's Stitches |
  | Copyright line | designerCopyright | text | â€” | Â© 2026 Your Name |
  | Contact or website | designerContact | text | â€” | hello@example.com |
  | Logo | designerLogo | file upload + display | 600Ã—600 px | â€” |

- **Intended behaviour:**
  - **Trigger**: Type or click upload
  - **Immediate feedback**: Text updates live; logo preview renders when uploaded
  - **State mutation**: UserPrefs updated; logo stored as data URL (PNG/JPEG)
  - **Navigation**: None
  - **Side effects**: PDF exports will use these details on cover pages
  - **Success outcome**: Designer branding saved
  - **Error outcome**: Logo upload fails if not PNG/JPEG or > 600Ã—600; error Toast shown
- **Keyboard**: Tab cycles fields; Space triggers file picker from label
- **Constraints**: Logo auto-downscaled to â‰¤600Ã—600 px; stored as data URL in localStorage (PERF: localStorage has ~5â€“10 MB limit before quota exceeded)
- **Relationships**: PDF export pipeline (creator/pdfExport.js) consumes these prefs

### EL-SCR-039-05: Logo Placement Selection
- **Location**: Profile category, after logo upload
- **Type**: Segmented control (toggle group)
- **Component**: [preferences-modal.js](preferences-modal.js) Segmented function
- **Visible when**: Profile category active
- **Default state**: "top-right" selected
- **Options**:
  | Value | Label |
  |----|----|
  | top-left | Top-left |
  | top-right | Top-right |

- **Intended behaviour:**
  - **Trigger**: Click option
  - **Immediate feedback**: Selected option highlights (background = --accent); text colour inverts
  - **State mutation**: UserPrefs.set('designerLogoPosition', value); cs:prefsChanged dispatched
  - **Navigation**: None
  - **Side effects**: PDF cover pages will render logo at chosen position on next export
  - **Success outcome**: Logo position saved
  - **Error outcome**: None
- **Keyboard**: Left/Right arrows cycle; Enter selects; Tab moves to next control
- **Constraints**: Inline display; options in a row
- **Relationships**: PDF export pipeline consumes this pref

### EL-SCR-039-06: Home Dashboard Settings
- **Location**: Profile category, section "Home dashboard"
- **Type**: Toggle switch
- **Component**: [preferences-modal.js](preferences-modal.js) Switch function
- **Visible when**: Profile category active
- **Default state**: On (true)
- **Setting**: "Show finished projects in the home list"
- **Intended behaviour:**
  - **Trigger**: Click switch
  - **Immediate feedback**: Switch animates to new state; label and description remain visible
  - **State mutation**: UserPrefs.set('homeShowCompleted', value); cs:prefsChanged dispatched
  - **Navigation**: None
  - **Side effects**: Home page filters projects list on next reload or when cs:prefsChanged event heard
  - **Success outcome**: Preference saved; home dashboard reflects setting
  - **Error outcome**: None
- **Keyboard**: Space toggles; Tab moves focus
- **Constraints**: Switch animates left/right; colour changes on/off (Workshop tokens)
- **Relationships**: home-app.js listens for cs:prefsChanged and filters projects

### EL-SCR-039-07: Creator Defaults Panel
- **Location**: Pattern Creator category
- **Type**: Form section with multiple sub-sections
- **Component**: [preferences-modal.js](preferences-modal.js) CreatorPanel function
- **Visible when**: Pattern Creator category active
- **Sub-sections**:
  1. Generation Defaults (palette size, fabric count, allow blends, stash-only, dithering, smooth dithering, opacity)
  2. Image Preparation (reference opacity)
  3. Tidying Up (stray stitches, orphan removal, min stitches, protect details)
  4. Canvas Display (default view, thread sheen, grid overlay)
  5. Experimental (import wizard toggle, embroidery tool link)

- **Intended behaviour:**
  - **Trigger**: Adjust any setting
  - **Immediate feedback**: Control updates; UserPrefs.set() fires
  - **State mutation**: localStorage updated; CustomEvent dispatched
  - **Navigation**: None
  - **Side effects**: Creator page reads these prefs on init and uses them as Sidebar defaults
  - **Success outcome**: Next new pattern uses chosen defaults
  - **Error outcome**: None (all have sensible fallbacks)
- **Keyboard**: Full keyboard access to all controls (range sliders, inputs, dropdowns, toggles)
- **Constraints**: Some settings are flagged _soon: true and show "Coming soon" badge but still persist to localStorage
- **Relationships**: creator/Sidebar.js consumes these prefs on mount; user can still override per-project

### EL-SCR-039-08: Tracker Defaults Panel
- **Location**: Stitch Tracker category
- **Type**: Form section
- **Component**: [preferences-modal.js](preferences-modal.js) TrackerPanel function
- **Visible when**: Stitch Tracker category active
- **Sub-sections**:
  1. Default View (chart view, highlight mode)
  2. Highlight Appearance (dim level, tint colour, tint opacity, spotlight opacity)
  3. Palette Filtering (skip done, only started)
  4. Session Timer (auto-pause minutes)
  5. Your Stitching Style (block/cross-country/freestyle/royal, block shape, starting corner)
  6. Counting (parking markers)
  7. Canvas Display (thread sheen)
  8. Feedback (celebrate on 100%, drag-to-mark)

- **Intended behaviour:**
  - **Trigger**: Adjust setting
  - **Immediate feedback**: Control updates; UserPrefs.set() fires
  - **State mutation**: localStorage updated
  - **Navigation**: None
  - **Side effects**: Tracker page reads these on init
  - **Success outcome**: Tracker defaults personalised
  - **Error outcome**: None
- **Keyboard**: Full access
- **Constraints**: Some fields hidden (halfMode, undoDepth not yet wired)
- **Relationships**: tracker-app.js reads these prefs on component mount

### EL-SCR-039-09: Manager Defaults Panel
- **Location**: Stash Manager category
- **Type**: Form section
- **Component**: [preferences-modal.js](preferences-modal.js) ManagerPanel function
- **Visible when**: Stash Manager category active
- **Sub-sections**:
  1. Stash Defaults (thread brand, low-stock threshold)
  2. Skein Calculations (strands per stitch, waste factor, default skein price)
  3. Pattern Library (sort order, default filter)

- **Intended behaviour:**
  - **Trigger**: Adjust setting
  - **Immediate feedback**: Control updates; UserPrefs.set() fires
  - **State mutation**: localStorage updated
  - **Navigation**: None
  - **Side effects**: Manager page reads these on init; impacts skein cost calculations
  - **Success outcome**: Manager defaults set
  - **Error outcome**: None
- **Keyboard**: Full access
- **Constraints**: Currency is separate UserPref but not exposed in UI yet
- **Relationships**: manager-app.js reads these prefs

### EL-SCR-039-10: Preview & Display Panel
- **Location**: Preview & Display category
- **Type**: Form section (truncated in EL; continues further)
- **Component**: [preferences-modal.js](preferences-modal.js) PreviewPanel function
- **Visible when**: Preview & Display category active
- **Sub-sections**:
  1. Default Preview (level, fabric colour, split pane)
  2. Mockup Display (mockup type, hoop style, frame style, mount colour, mount width)

- **Intended behaviour:**
  - **Trigger**: Adjust setting
  - **Immediate feedback**: Control updates; UserPrefs.set() fires
  - **State mutation**: localStorage updated
  - **Navigation**: None
  - **Side effects**: Creator preview components read these on init
  - **Success outcome**: Preview look-and-feel personalised
  - **Error outcome**: None
- **Keyboard**: Full access
- **Constraints**: Hoop/frame/mount styles are visual selectors (not yet implemented in full)
- **Relationships**: creator/PreviewCanvas.js consumes these prefs

### EL-SCR-039-11: Accessibility Panel
- **Location**: Accessibility category
- **Type**: Form section
- **Component**: [preferences-modal.js](preferences-modal.js) (not shown in provided snippet; would be similar structure)
- **Visible when**: Accessibility category active
- **Expected controls** (based on user-prefs.js DEFAULTS):
  | Setting | Type | Values |
  |----|----|---|
  | Font Scale | Segmented | s, m, l, xl |
  | High Contrast Mode | Toggle | on/off |
  | Reduced Motion | Toggle | on/off |
  | Colour Blind Aid | Segmented | off, protan, deutan, tritan |
  | Dark Mode | Segmented | system, light, dark |

- **Intended behaviour:**
  - **Trigger**: Adjust setting
  - **Immediate feedback**: Control updates; root element classes updated instantly (apply-prefs.js reacts to cs:prefsChanged)
  - **State mutation**: localStorage updated; UserPrefs.set() fires; CustomEvent dispatched; apply-prefs.js applies root classes
  - **Navigation**: None
  - **Side effects**: Page re-renders with new font size, contrast level, motion settings, colour filter, or theme
  - **Success outcome**: Accessibility preferences applied; page updates live
  - **Error outcome**: None
- **Keyboard**: Full access; Tab-accessible
- **Constraints**: Changes apply immediately (no page reload needed)
- **Relationships**: apply-prefs.js listens for cs:prefsChanged and applies root class changes

---

## Screen: SCR-040 â€” Welcome Wizard â€” Creator Flow

A modal wizard that displays on first visit to the Creator page. Three steps introduce the Creator workflow. Can be replayed from Help > Getting Started.

### EL-SCR-040-01: Wizard Modal Shell
- **Location**: Centred overlay or targeted popover (if target available)
- **Type**: Modal dialog (role=dialog, aria-modal=true, aria-labelledby=titleId)
- **Component**: [onboarding-wizard.js](onboarding-wizard.js) WelcomeWizard component
- **Visible when**: shouldShow('creator') === true (first visit); or replayed from HelpDrawer
- **Default state**: Step 0 active; step indicator shows "Step 1 of 3"; skip/back/next buttons visible
- **Intended behaviour:**
  - **Trigger**: First visit to Creator, or user clicks "Replay the Creator walkthrough" from Help > Getting Started
  - **Immediate feedback**: Modal slides up or popover appears near target element; first focusable element (usually Next button) receives focus
  - **State mutation**: WelcomeWizard.shouldShow('creator') â†’ false when user completes or skips (pref flag set)
  - **Navigation**: None (stays on page); Close or Skip closes modal cleanly
  - **Side effects**: markDone('creator') sets localStorage flag cs_welcome_creator_done so modal doesn't re-appear
  - **Success outcome**: User sees tour and can close it to begin creating
  - **Error outcome**: None (modal always renders)
- **Keyboard**: Escape skips tour; Tab traps focus inside modal; Enter on Next button advances
- **Constraints**: Max-width 420px mobile / 460px desktop; slides up with animation (unless prefers-reduced-motion)
- **Relationships**: shouldShow() checks localStorage flag cs_welcome_creator_done; markDone() sets it. If target element has dismissOnTargetClick, clicking it closes tour and marks done.

### EL-SCR-040-02: Step Indicator Dots
- **Location**: Below title, above body
- **Type**: Visual progress indicator
- **Component**: [onboarding-wizard.js](onboarding-wizard.js) WelcomeWizard
- **Visible when**: Always (steps.length > 1)
- **Default state**: 3 dots; current dot filled (--accent), others unfilled (--border)
- **Intended behaviour:**
  - **Trigger**: Step changes
  - **Immediate feedback**: Dots animate fill colour (CSS transition)
  - **State mutation**: None (read-only display)
  - **Navigation**: None (dots are not clickable)
  - **Side effects**: None
  - **Success outcome**: User sees progress through tour
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: Decorative; paired with visible step counter text for screen readers
- **Relationships**: idx state drives which dot is filled

### EL-SCR-040-03: Step Content (Title + Body + Tip)
- **Location**: Centre of modal
- **Type**: Display text
- **Component**: [onboarding-wizard.js](onboarding-wizard.js) WelcomeWizard
- **Visible when**: Always (part of modal)
- **Default state**: Heading, body text, optional tip box
- **Content**:
  | Step | Title | Body | Tip |
  |----|----|----|----|
  | 0 | Welcome to the Pattern Creator | Describes converting images to patterns; runs under a minute; photos never leave device | (none) |
  | 1 | What lives where | Describes dashboard, Start New panel, Stash Manager | Your stash and pattern library live one click away |
  | 2 | Pick a starting point | Says to click an option in "Start New"; highlights one button (dismissOnTargetClick); closing tour takes user to editor | Clicking the highlighted button will close tour and take you into editor |

- **Intended behaviour:**
  - **Trigger**: Step changes
  - **Immediate feedback**: Text renders instantly
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: Step 2 has a highlighted target button (data-onboard="home-from-image") with hover/ring styling
  - **Success outcome**: User reads step content and understands next action
  - **Error outcome**: None
- **Keyboard**: No interaction with text itself; buttons below are keyboard-accessible
- **Constraints**: Body text max 2 sentences; tip in smaller text + background highlight
- **Relationships**: Each step defined in STEPS.creator array in onboarding-wizard.js

### EL-SCR-040-04: Navigation Buttons (Skip, Back, Next)
- **Location**: Bottom of modal
- **Type**: Button group
- **Component**: [onboarding-wizard.js](onboarding-wizard.js) WelcomeWizard
- **Visible when**: Always
- **Default state**: Back button disabled on step 0; Skip always enabled; Next/Get started changes label on final step
- **Buttons**:
  | Button | Label | Visible when | Action |
  |----|----|----|----|
  | Skip | Skip tour | All steps | handleClose(false); user can restart from Help |
  | Back | Back | idx > 0 | setIdx(idx - 1) |
  | Next/Get started | Next (final step: "Get started") | All steps | if isLast: handleLast() (marks done, closes, may chain onLastStep); else setIdx(idx + 1) |

- **Intended behaviour:**
  - **Trigger**: Click button
  - **Immediate feedback**: Button visual feedback (hover/active); Next slides next step in; Skip/Back closes/goes back; final Next marks tour complete and closes
  - **State mutation**: idx increments or stays at 0 (Back); tour marked done on Skip or final Next
  - **Navigation**: None (unless onLastStep callback chains to another wizard)
  - **Side effects**: markDone() called on completion; localStorage flag set
  - **Success outcome**: User advances through tour or skips to start creating
  - **Error outcome**: None (buttons always work)
- **Keyboard**: Tab cycles buttons; Space/Enter activates
- **Constraints**: Back button disabled on step 0 (no prior step); final button label is "Get started" not "Next"
- **Relationships**: onLastStep callback can chain to Tracker onboarding if Tracker also needs to show its welcome

---

## Screen: SCR-040a â€” Welcome Wizard â€” Creator Step 1
(See EL-SCR-040 for generic wizard structure; this is step index 0 of STEPS.creator)

---

## Screen: SCR-040b â€” Welcome Wizard â€” Creator Step 2
(See EL-SCR-040 for generic wizard structure; this is step index 1 of STEPS.creator)

---

## Screen: SCR-040c â€” Welcome Wizard â€” Creator Step 3
(See EL-SCR-040 for generic wizard structure; this is step index 2 of STEPS.creator; has dismissOnTargetClick behaviour)

---

## Screen: SCR-043 â€” Backup & Restore Modal

Modal for importing a backup .json or .csb file. Validates backup contents and shows confirmation before importing (destructive operation).

### EL-SCR-043-01: Backup Import Workflow (inline in header.js)
- **Location**: Triggered from File > Restore from Backup file input
- **Type**: Workflow + modal confirmation
- **Component**: [header.js](header.js#L559-L603) handleInlineRestore function
- **Visible when**: User clicks "Restore from Backup" and selects a file
- **Default state**: File picker opens; user selects file; parsing occurs; confirmation modal appears
- **Intended behaviour:**
  - **Trigger**: File selected from picker
  - **Immediate feedback**: File parsing starts; if invalid, Toast error shown
  - **State mutation**: BackupRestore.validate() checks format and summarises contents
  - **Navigation**: None (stays on page)
  - **Side effects**: On confirmation, BackupRestore.restore() runs; databases overwritten; page reloads
  - **Success outcome**: Backup imported; databases restored; page reloads and shows all restored data
  - **Error outcome**: Toast error if parsing fails; window.confirm() cancels if user says no
- **Keyboard**: Confirm dialog uses window.confirm() (browser native; keyboard accessible)
- **Constraints**: P1 TODO: BackupRestore import is destructive â€” verify confirmation modal appears before executing restore and shows project/thread/pattern counts
- **Relationships**: BackupRestore module handles parsing + validation + restore; header.js wires the file input

---

## Screen: SCR-044 â€” SharedModals.About

Simple modal showing app title, description, tech stack, and version number. No interactive elements beyond close button.

### EL-SCR-044-01: About Modal
- **Location**: Centred overlay
- **Type**: Modal dialog (variant=dialog)
- **Component**: [modals.js](modals.js) SharedModals.About component
- **Visible when**: modal === 'about' (triggered by command or menu)
- **Default state**: Closed; opens with close button visible
- **Content**:
  - Title: "About"
  - Paragraph 1: App description
  - Paragraph 2: Privacy statement (no data uploaded)
  - Tech stack list (React, jsPDF, pako)
  - Version: "Version 1.0.0"

- **Intended behaviour:**
  - **Trigger**: Click About from menu
  - **Immediate feedback**: Modal appears instantly
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: Body scroll locked
  - **Success outcome**: User reads about page
  - **Error outcome**: None
- **Keyboard**: Escape closes; Tab moves focus; close button keyboard-accessible
- **Constraints**: Max-width 500px; static text content
- **Relationships**: onClose prop closes modal in parent component

---

## Screen: SCR-045 â€” SharedModals.Help (fallback)

Fallback modal shown if HelpDrawer fails to load (e.g., if help-drawer.js script didn't load). Simple error message + Close button. Not normally rendered.

### EL-SCR-045-01: Help Fallback Modal
- **Location**: Centred overlay
- **Type**: Modal dialog (variant=dialog, labelledBy=help-fallback-title)
- **Component**: [modals.js](modals.js) SharedModals.Help component
- **Visible when**: HelpDrawer missing when modal === 'help' triggered
- **Default state**: Shows error message
- **Content**:
  - Title: "Help"
  - Message: "The help panel could not be opened. Please reload the page to restore full functionality."
  - Close button

- **Intended behaviour:**
  - **Trigger**: Help button clicked but HelpDrawer.open() failed or HelpDrawer undefined
  - **Immediate feedback**: Fallback modal appears
  - **State mutation**: None
  - **Navigation**: None (stays on page)
  - **Side effects**: Body scroll locked
  - **Success outcome**: User is informed help unavailable; told to reload
  - **Error outcome**: This IS the error state (HelpDrawer missing)
- **Keyboard**: Escape closes; Close button keyboard-accessible
- **Constraints**: Max-width 460px; static error message only
- **Relationships**: Shim component that calls HelpDrawer.open() on mount; if HelpDrawer present, it closes this modal immediately

---

## Screen: SCR-046 â€” SharedModals.ThreadSelector

Modal for selecting a thread from the DMC catalogue to substitute or change in a palette. Shows searchable thread list with colour swatches, IDs, names, and usage tags (Current, In Use, etc.).

### EL-SCR-046-01: Thread Selector Modal
- **Location**: Centred overlay
- **Type**: Modal dialog (variant=dialog, maxWidth=500, labelledBy=thread-selector-title)
- **Component**: [modals.js](modals.js) SharedModals.ThreadSelector component
- **Visible when**: Colour swap/select triggered (EL-SCR-045 in creator modals area)
- **Default state**: Closed; opens with search input focused
- **Intended behaviour:**
  - **Trigger**: User clicks colour swap icon in palette or selects "swap colour"
  - **Immediate feedback**: Modal appears; search input focused; full thread list shows
  - **State mutation**: User can filter by search; clicking thread calls onSelect callback
  - **Navigation**: None (stays on page)
  - **Side effects**: Selected thread replaces palette entry; if thread already in use, swap banner appears
  - **Success outcome**: Thread selected or swap confirmed
  - **Error outcome**: None (thread always selectable)
- **Keyboard**: Tab cycles input + list items; Enter selects; Escape closes
- **Constraints**: Max-height 80vh; scrollable list; search is substring match on DMC ID or name
- **Relationships**: Consumes DMC global array; onSelect callback updates Creator palette state

### EL-SCR-046-02: Search Input
- **Location**: Below title
- **Type**: Text input
- **Component**: [modals.js](modals.js) SharedModals.ThreadSelector search input
- **Visible when**: Always (part of modal)
- **Default state**: Empty; placeholder "Search by DMC code or nameâ€¦"; autoFocus
- **Intended behaviour:**
  - **Trigger**: Type characters
  - **Immediate feedback**: Results filter in real-time; matches on ID or name (case-insensitive, substring)
  - **State mutation**: search state updated; filteredThreads re-computed
  - **Navigation**: None
  - **Side effects**: List below re-renders
  - **Success outcome**: User finds desired thread quickly
  - **Error outcome**: No results shows "No threads found" + "Use 'X' anyway" button if search term is a valid custom ID
- **Keyboard**: Backspace deletes; arrows don't move input (they navigate list below if list focused)
- **Constraints**: Full-width input
- **Relationships**: DMC array filtered via Array.filter(); memo-ed to prevent unnecessary re-renders

### EL-SCR-046-03: Thread List Rows
- **Location**: Below search, scrollable area
- **Type**: Button rows (role=button, interactive list items)
- **Component**: [modals.js](modals.js) renderThreadListItem function
- **Visible when**: Always
- **Default state**: Each thread shown as a row with colour swatch, ID, name, and optional badge
- **Row display**:
  - Colour swatch (24px Ã— 24px box, border 1px solid --line-2)
  - DMC ID + Name (flex grow)
  - Badge if applicable (Current, In Use, Swap?)

- **Intended behaviour:**
  - **Trigger**: Click row or press Enter when row focused
  - **Immediate feedback**: If thread in use (In Use badge), show swap banner instead of closing. Otherwise call onSelect(thread)
  - **State mutation**: None (selection handled by parent)
  - **Navigation**: None
  - **Side effects**: onSelect callback fires; Creator palette updated
  - **Success outcome**: Thread selected or swap initiated
  - **Error outcome**: None (rows always clickable)
- **Keyboard**: Arrow Down/Up navigate rows; Home/End jump; Enter selects current row
- **Constraints**: Rows have hover background highlight; current thread has --accent-light background; in-use threads have --surface-secondary background; swap-candidate threads have #FAF5E1 background
- **Relationships**: PERF (perf-4 #3): usedThreadSet is a Set for O(1) lookup instead of Array.includes() O(n)

### EL-SCR-046-04: Swap Banner
- **Location**: Above thread list (appears conditionally)
- **Type**: Display + button group
- **Component**: [modals.js](modals.js) renderSwapBanner function
- **Visible when**: swapCandidate is set (user clicked In Use thread)
- **Default state**: Banner shows thread ID and asks to confirm swap
- **Content**:
  - Message: "DMC [ID] is already assigned to another symbol."
  - Subtext: "Swap the two symbols' colour assignments? Both symbols will keep their shapes â€” only their thread colours will exchange."
  - Buttons: "Swap Colours" (primary), "Cancel" (secondary)

- **Intended behaviour:**
  - **Trigger**: User clicks In Use thread
  - **Immediate feedback**: Banner appears above list; thread row shows "Swap?" badge
  - **State mutation**: swapCandidate set; buttons interactable
  - **Navigation**: None
  - **Side effects**: onSwap callback fires when user confirms; Creator palette re-orders/swaps threads
  - **Success outcome**: Colours swapped between two palette entries
  - **Error outcome**: None (cancel removes banner)
- **Keyboard**: Tab cycles banner buttons; Enter on "Swap" confirms
- **Constraints**: Banner shown instead of closing modal; allows user to reconsider
- **Relationships**: onSwap callback passed from parent component

---

## Screen: SCR-047 â€” Toast Container (notifications)

A persistent container at bottom-centre of viewport that stacks toast notifications. Each toast can have type (info/success/warning/error), message, optional Undo button, and dismiss button.

### EL-SCR-047-01: Toast Container
- **Location**: Fixed position, bottom-centre (bottom: max(24px, safe-area-inset-bottom))
- **Type**: Display container (role=status, aria-live=polite)
- **Component**: [toast.js](toast.js) ensureContainer function (plain DOM)
- **Visible when**: Always (singleton created on first window.Toast.show() call)
- **Default state**: Initially empty; toasts append + prepend (column-reverse) so newest on top
- **Intended behaviour:**
  - **Trigger**: window.Toast.show() called from anywhere in app
  - **Immediate feedback**: Toast animates in from bottom (toast-in 0.25s); stacks above older toasts
  - **State mutation**: Entry added to toasts array; container height grows
  - **Navigation**: None
  - **Side effects**: None (toasts are overlay)
  - **Success outcome**: User sees notification
  - **Error outcome**: None (container always renders)
- **Keyboard**: No direct interaction with container; close button on each toast is keyboard-accessible
- **Constraints**: Max 3 visible toasts by default (configurable via UserPrefs toastMaxVisible); oldest dismissed if limit exceeded. Max-width calc(100vw - 32px) so toasts fit mobile screens
- **Relationships**: window.Toast global singleton; used throughout app for feedback

### EL-SCR-047-02: Individual Toast
- **Location**: Within container, stacked vertically
- **Type**: Notification box
- **Component**: [toast.js](toast.js) show function; individual toast <div>
- **Visible when**: After window.Toast.show() called
- **Default state**: Renders with icon, message, optional Undo button, dismiss button
- **Toast states**:
  | Type | Icon | Border-left Colour | Example messages |
  |----|----|----|----|
  | info | (default; no icon if missing) | --accent | "Loadingâ€¦", "Action complete" |
  | success | check | --success | "Pattern saved", "Backup restored" |
  | warning | warning | --warning | "Stray stitches removed" |
  | error | x | --danger | "Save failed: quota exceeded" |

- **Intended behaviour:**
  - **Trigger**: window.Toast.show({ message, type, duration, undoAction })
  - **Immediate feedback**: Toast slides in with animation; fades in text; icon appears
  - **State mutation**: Entry added to toasts array
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User sees feedback message
  - **Error outcome**: None
- **Keyboard**: Close button Tab-accessible; Space/Enter dismisses. Undo button (if present) Tab-accessible
- **Constraints**: Auto-dismisses after duration (default 6000 ms, errors 8000 ms, success 2000 ms). Type determines icon + colour. Max-width min(480px, calc(100vw - 32px))
- **Relationships**: window.Toast.show() is public API; called by all pages for feedback (saves, errors, etc.)

### EL-SCR-047-03: Toast Icon
- **Location**: Left of message, inline
- **Type**: SVG icon
- **Component**: [toast.js](toast.js) show function; icon span
- **Visible when**: Always (if icon available)
- **Default state**: Displays icon from window.Icons (if available) or coloured dot fallback
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: None
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: Visual affordance of toast type
  - **Error outcome**: None (fallback to dot if Icons missing)
- **Keyboard**: No interaction
- **Constraints**: Icons are 16Ã—16; aria-hidden=true (not announced); fallback is coloured dot (never emoji per house rules)
- **Relationships**: window.Icons.check, .x, .warning, etc.; graceful fallback if icons missing

### EL-SCR-047-04: Toast Message
- **Location**: Centre of toast
- **Type**: Text
- **Component**: [toast.js](toast.js) msgSpan
- **Visible when**: Always
- **Default state**: Plain text; grows to fill space; ellipsis if overflow
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: None
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User reads message
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: Max-width grows; overflow hidden + text-overflow ellipsis
- **Relationships**: User-provided message string

### EL-SCR-047-05: Undo Button
- **Location**: Right of message (if undoAction provided)
- **Type**: Button
- **Component**: [toast.js](toast.js) undoBtn
- **Visible when**: undoAction callback provided
- **Default state**: "Undo" label; text colour --accent
- **Intended behaviour:**
  - **Trigger**: Click or Enter/Space when focused
  - **Immediate feedback**: Button visual feedback (hover/active); undoAction() callback fires; toast dismisses; follow-up "Undone" success toast appears
  - **State mutation**: None on toast (undo action handled by callback)
  - **Navigation**: None
  - **Side effects**: undoAction callback may change page state (e.g., restore deleted stitch); follow-up toast shows success
  - **Success outcome**: Action undone; feedback toast confirms
  - **Error outcome**: If undoAction throws, error logged; toast removed
- **Keyboard**: Tab cycles to button; Space/Enter activates
- **Constraints**: Styled as text button (no border); margin-left 12px creates gap from message
- **Relationships**: undoAction is caller-provided callback; called immediately when button clicked

### EL-SCR-047-06: Dismiss Button
- **Location**: Right edge of toast
- **Type**: Button (aria-label="Dismiss")
- **Component**: [toast.js](toast.js) dismissBtn
- **Visible when**: Always
- **Default state**: "Ã—" label; colour --text-tertiary
- **Intended behaviour:**
  - **Trigger**: Click or Enter/Space
  - **Immediate feedback**: Toast fades out (opacity 0, translateY 10px); removed from DOM after 320 ms
  - **State mutation**: Entry removed from toasts array; container shrinks
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: Toast dismissed
  - **Error outcome**: None (always clickable)
- **Keyboard**: Tab cycles to button; Space/Enter activates
- **Constraints**: Styled as text button; minimal padding; right-aligned
- **Relationships**: Dismisses immediately without waiting for auto-dismiss timeout

---

## Screen: SCR-048 â€” Coachmark (interactive coaching)

An interactive coaching overlay that highlights a target element with a ring and displays a popover with guidance. Used for first-stitch coaching and other feature introductions. Can dismiss with Escape or "Skip" button; "Got it" marks step complete.

### EL-SCR-048-01: Coachmark Shell
- **Location**: Fixed overlay, full viewport
- **Type**: Overlay with scrim + popover + highlight ring
- **Component**: [coaching.js](coaching.js) Coachmark component (React)
- **Visible when**: useCoachingSequence hook's active step is non-null
- **Default state**: Closed (not rendered); renders when active step available
- **Intended behaviour:**
  - **Trigger**: useCoachingSequence({ active: stepId }) drives visibility
  - **Immediate feedback**: Overlay renders; scrim dims background; ring highlights target; popover appears near target (or centred if no target)
  - **State mutation**: Active step managed by useCoachingSequence hook
  - **Navigation**: None (stays on page)
  - **Side effects**: Body scroll may be locked (Overlay component); focus moved to popover; onComplete/onSkip callbacks fired
  - **Success outcome**: User sees coaching and can dismiss it
  - **Error outcome**: None (overlay always renders)
- **Keyboard**: Escape skips; Tab traps focus inside popover
- **Constraints**: SCR-048 shows ring if showHighlight=true; popover placement adaptive (bottom/top/left/right based on target position + viewport); centres if target missing
- **Relationships**: Coachmark is child of page components (creator or tracker); useCoachingSequence hook drives lifecycle

### EL-SCR-048-02: Scrim (dim background)
- **Location**: Full viewport behind popover
- **Type**: Overlay div with high opacity
- **Component**: [coaching.js](coaching.js) Coachmark
- **Visible when**: Always (part of coachmark shell)
- **Default state**: rgba(15, 23, 42, 0.5) semi-transparent dark overlay
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: Page content dims; draws focus to popover
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: Visual focus on coaching area
  - **Error outcome**: None
- **Keyboard**: Click scrim skips tour (click-outside dismiss)
- **Constraints**: Full viewport coverage (inset: 0); pointer-events: none (doesn't block clicks on target); aria-hidden=true
- **Relationships**: Part of Coachmark overlay structure

### EL-SCR-048-03: Highlight Ring
- **Location**: Around target element (if showHighlight=true and target found)
- **Type**: Visual highlight border + shadow
- **Component**: [coaching.js](coaching.js) Coachmark; arrowStyle
- **Visible when**: showHighlight=true AND target element present in DOM
- **Default state**: 3px border --accent; 9999px shadow (dim everything outside ring)
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: Fixed-position div; re-positioned on scroll/resize
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: Re-layout on window resize / scroll (useEffect adds listeners)
  - **Success outcome**: User sees which element is being discussed
  - **Error outcome**: None (ring adapts if target moves or disappears)
- **Keyboard**: No interaction; user can click highlighted element if dismissOnTargetClick=true
- **Constraints**: Border-radius matches target (typically 8px); shadow uses rgba(15, 23, 42, 0.45) semi-transparent; z-index 5000 (below popover at 5001)
- **Relationships**: Position computed by resolvePlacement function; updated on resize/scroll via useEffect

### EL-SCR-048-04: Popover
- **Location**: Positioned relative to target (bottom/top/right/left) or centred
- **Type**: Panel (role=alertdialog, aria-modal=false, aria-labelledby=titleId)
- **Component**: [coaching.js](coaching.js) Coachmark; popover div
- **Visible when**: Always (part of coachmark)
- **Default state**: Shows title, body, optional helpTopic button, button group (Skip / Got it)
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: Popover animates in (CSS transition); content renders
  - **State mutation**: None (content static)
  - **Navigation**: None
  - **Side effects**: Focus moved to popover on mount
  - **Success outcome**: User reads coaching text and can act
  - **Error outcome**: None
- **Keyboard**: Tab cycles buttons; Enter/Space activates
- **Constraints**: Fixed-position; width computed by resolvePlacement (360px desktop, 300px mobile); max-width clamped to viewport; z-index 5001 (above scrim)
- **Relationships**: Styling uses --surface, --text-primary, --accent tokens; focus trap applied by Overlay component

### EL-SCR-048-05: Coachmark Title
- **Location**: Top of popover
- **Type**: Heading (role=heading, id=titleId)
- **Component**: [coaching.js](coaching.js) Coachmark; h2 element
- **Visible when**: Always
- **Default state**: Bold text
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: None
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User reads title
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: Max 1 line (no wrapping expected)
- **Relationships**: Used for aria-labelledby on popover

### EL-SCR-048-06: Coachmark Body
- **Location**: Below title
- **Type**: Paragraph text
- **Component**: [coaching.js](coaching.js) Coachmark; <p> element
- **Visible when**: Always
- **Default state**: Normal text; line-height 1.6
- **Intended behaviour:**
  - **Trigger**: Display only
  - **Immediate feedback**: None
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: None
  - **Success outcome**: User reads guidance
  - **Error outcome**: None
- **Keyboard**: No interaction
- **Constraints**: Max 2â€“3 sentences; wraps naturally
- **Relationships**: Used for aria-describedby on popover (if bodyId provided)

### EL-SCR-048-07: Learn More Button
- **Location**: Below body (conditional)
- **Type**: Button
- **Component**: [coaching.js](coaching.js) Coachmark; "Learn more" button
- **Visible when**: props.helpTopic provided
- **Default state**: "Learn more" label
- **Intended behaviour:**
  - **Trigger**: Click or Enter/Space
  - **Immediate feedback**: Button visual feedback; popover skips; HelpDrawer opens with query pre-filled
  - **State mutation**: None (onSkip callback fires; HelpDrawer opens separately)
  - **Navigation**: None (stays on page)
  - **Side effects**: onSkip() fires (marks step skipped); HelpDrawer.open({ tab: 'help', query: helpTopic }) opens drawer
  - **Success outcome**: User reads extended help in drawer
  - **Error outcome**: None (drawer always opens)
- **Keyboard**: Tab cycles to button; Enter/Space activates
- **Constraints**: Styled as secondary button (text colour, border); margin above action buttons
- **Relationships**: helpTopic string passed to HelpDrawer for search pre-fill

### EL-SCR-048-08: Action Buttons (Skip, Got it)
- **Location**: Bottom of popover
- **Type**: Button group
- **Component**: [coaching.js](coaching.js) Coachmark; button group
- **Visible when**: Always
- **Default state**: Two buttons: "Skip" (secondary), "Got it" (primary)
- **Intended behaviour:**
  - **Trigger**: Click button
  - **Immediate feedback**: Button visual feedback; popover slides out (CSS transition); props.onSkip or props.onComplete callback fires
  - **State mutation**: useCoachingSequence().skip() or .complete() marks step skipped/complete
  - **Navigation**: None (stays on page)
  - **Side effects**: onSkip() marks step skipped (per-session only; replay on next mount). onComplete() marks step complete (persists to UserPrefs)
  - **Success outcome**: User dismisses coaching; step advances or completes
  - **Error outcome**: None
- **Keyboard**: Tab cycles buttons; Enter/Space activates
- **Constraints**: "Skip" button standard secondary style; "Got it" button primary style (--accent background)
- **Relationships**: useCoachingSequence hook manages state; onComplete/onSkip callbacks wired by consuming component

---

## Screen: SCR-049 â€” Overlay Component (generic modal shell)

A reusable React primitive for rendering modal dialogs, sheets, and drawers. Provides scrim click dismiss, Esc dismiss, focus trap, body scroll lock, and role/aria attributes.

### EL-SCR-049-01: Overlay Scrim
- **Location**: Full viewport
- **Type**: Overlay div (click-outside dismiss)
- **Component**: [components/Overlay.js](components/Overlay.js) Overlay function
- **Visible when**: Always (part of overlay)
- **Default state**: Translucent background; rgba colour depends on variant (dialog vs sheet vs drawer)
- **Intended behaviour:**
  - **Trigger**: Click scrim
  - **Immediate feedback**: If dismissOnScrim=true, onClose callback fires
  - **State mutation**: None (onClose handled by parent)
  - **Navigation**: None
  - **Side effects**: Parent component may unmount overlay
  - **Success outcome**: Modal/sheet/drawer closes
  - **Error outcome**: None (click-outside dismiss always available unless suppressible)
- **Keyboard**: Scrim is not keyboard-interactive (ESC is handled separately)
- **Constraints**: Dismissable unless suppressible by dismissOnScrim=false prop
- **Relationships**: onClick handler checks e.target === e.currentTarget to avoid dismissing on nested clicks

### EL-SCR-049-02: Overlay Panel
- **Location**: Depends on variant (centred for dialog, bottom for sheet, right for drawer)
- **Type**: Content panel (role=dialog, aria-modal=true)
- **Component**: [components/Overlay.js](components/Overlay.js) Overlay
- **Visible when**: Always (part of overlay)
- **Default state**: Panel background --surface; renders children passed to component
- **Intended behaviour:**
  - **Trigger**: Display only (consumer provides content + controls)
  - **Immediate feedback**: Panel renders with content
  - **State mutation**: None (consumer manages content state)
  - **Navigation**: None
  - **Side effects**: Focus trap applied; body scroll locked
  - **Success outcome**: User sees modal content
  - **Error outcome**: None
- **Keyboard**: Tab traps focus inside panel; Escape closes (via useEscape hook)
- **Constraints**: variant-specific styling (dialog: centred max-width; sheet: bottom-anchored; drawer: side-anchored)
- **Relationships**: Children can be arbitrary React elements; helpers like Overlay.Title, Overlay.Body, Overlay.Footer available

### EL-SCR-049-03: Focus Trap
- **Location**: Inside overlay panel
- **Type**: Keyboard event handler (useFocusTrap hook)
- **Component**: [components/Overlay.js](components/Overlay.js) useFocusTrap function
- **Visible when**: Always (when overlay open)
- **Default state**: Focus initialized to first focusable element or [data-autofocus] element
- **Intended behaviour:**
  - **Trigger**: Tab/Shift+Tab pressed
  - **Immediate feedback**: Focus cycles within focusable elements in panel
  - **State mutation**: None
  - **Navigation**: None
  - **Side effects**: previousActiveElement stored for restoration on close
  - **Success outcome**: User can't Tab out of modal; modal feels contained
  - **Error outcome**: None (fallback to panel itself if no focusables)
- **Keyboard**: Tab cycles forward; Shift+Tab cycles backward; wraps at ends
- **Constraints**: Selector is FOCUSABLE = 'a[href],button,textarea,input:not([disabled]):not([type="hidden"]),select,[tabindex]:not([tabindex="-1"])'; skips disabled and offscreen elements
- **Relationships**: useFocusTrap React hook managed by Overlay component

### EL-SCR-049-04: Body Scroll Lock
- **Location**: Document body
- **Type**: Style side effect
- **Component**: [components/Overlay.js](components/Overlay.js) Overlay useEffect
- **Visible when**: Always (when overlay open)
- **Default state**: body.style.overflow = "hidden"
- **Intended behaviour:**
  - **Trigger**: Overlay mounts
  - **Immediate feedback**: Page behind modal is no longer scrollable
  - **State mutation**: body.style.overflow updated
  - **Navigation**: None
  - **Side effects**: Nested overlays all lock scroll (last mount wins)
  - **Success outcome**: User focuses on modal and can't scroll page
  - **Error outcome**: None (restored on unmount)
- **Keyboard**: No interaction
- **Constraints**: Overflow restored on unmount via cleanup function
- **Relationships**: useEffect cleanup pattern ensures restoration

### EL-SCR-049-05: Overlay.CloseButton Helper
- **Location**: Typically top-right corner of panel
- **Type**: Button (aria-label="Close")
- **Component**: [components/Overlay.js](components/Overlay.js) Overlay.CloseButton sub-component
- **Visible when**: If rendered by consumer
- **Default state**: "Ã—" label; SVG icon (window.Icons.x) if available
- **Intended behaviour:**
  - **Trigger**: Click or Enter/Space
  - **Immediate feedback**: Button visual feedback; onClose callback fires
  - **State mutation**: None (parent handles state)
  - **Navigation**: None
  - **Side effects**: Parent component may unmount overlay
  - **Success outcome**: Modal closes
  - **Error outcome**: None
- **Keyboard**: Tab-accessible; Enter/Space activates
- **Constraints**: Positioned absolutely; styled minimally (transparent background, inherit colour)
- **Relationships**: Optional helper; consumer can omit if custom close UI preferred

---

## Screen: SCR-050 â€” PartialStitchThumb (component)

A small canvas-rendered preview thumbnail showing a pattern's progress with unstitched cells ghosted and done cells full-colour. Used in lists/cards. Renders to canvas, caches result as PNG data URL in LRU, returns <img> tag.

### EL-SCR-050-01: Partial Stitch Thumbnail
- **Location**: Component render (appears in cards, lists, etc.)
- **Type**: Image element (<img>) backed by canvas rendering
- **Component**: [components/PartialStitchThumb.js](components/PartialStitchThumb.js) PartialStitchThumb component
- **Visible when**: Consumer renders it (typically in project cards)
- **Default state**: Renders as <img> with data:image/png src from cache or fresh render
- **Data source**: pattern array, done array, w, h (dimensions), size (display size), projectId (cache key)
- **Update trigger**: pattern or done array changes; cache miss (new projectId or new size)
- **Display logic**:
  - Render pattern to canvas at 1px/cell (or direct target size if small)
  - Colour cells: done=1 shows full-saturation RGB; done=0 shows desaturated + fabric-tint blend (ghost)
  - Empty cells (id='__skip__' or '__empty__') render transparent
  - Scale canvas if needed (big patterns render 1px then scale with nearest-neighbour)
  - Export canvas to PNG data URL; cache in LRU (32-entry cap)

- **Intended behaviour:**
  - **Trigger**: Component mounts or props change
  - **Immediate feedback**: Cached image renders instantly; if miss, canvas renders + caches for next time
  - **State mutation**: None (component is pure render)
  - **Navigation**: None
  - **Side effects**: Canvas off-screen; no DOM mutation (only data URL used)
  - **Success outcome**: User sees compact preview of pattern progress
  - **Error outcome**: If canvas unavailable, returns empty string (no img rendered)
- **Keyboard**: No interaction (embedded in card/list context)
- **Constraints**: PERF: Canvas rendering stays <10ms per spec (no Worker). Max cache size 32; LRU eviction on overfull. Big patterns (>40k cells) render at 1px then scale to avoid stack overflow on putImageData
- **Relationships**: LRU cache keyed by ${projectId}|${w}x${h}|${size}|${doneHash}; doneHash is 32-bit FNV-1a hash (stable, fast to compute)

---

## Screen: SCR-034 â€” Embroidery Tool (experimental â€” out of scope)

The Embroidery Tool is an experimental feature accessible via embroidery.html. It is not surfaced in the main navigation unless the user enables the experimental pref. Out of scope for this spec.

---

## DISCOVERED.md Appendix

### Summary of Changes Required for Phase 1B Completeness

1. **Element Inventory**: 100+ interactive and display elements documented across 16 screens
2. **Cross-screen relationships**: CustomEvent cs:helpStateChange (HelpDrawer â†” Header aria-expanded), cs:prefsChanged (UserPrefs â†” multiple listeners), cs:projectsChanged, cs:openCommand, cs:openHelp
3. **State machines**: HelpDrawer tab persistence, ProjectStorage active project pointer, UserPrefs localStorage fallback
4. **Reusable primitives**: Overlay (dialog/sheet/drawer), useFocusTrap, Toast, Coachmark, WelcomeWizard
5. **Keyboard model**: Escape closes drawers/modals; Tab traps focus; Arrow keys navigate lists/tabs; Ctrl/Cmd+K opens palette; Global "?" opens Help
6. **Accessibility**: aria-modal, aria-expanded, aria-labelledby, focus trap, role=dialog/menuitem/tablist, live regions (aria-live=polite on Toast)
7. **Tablet considerations**: All modals fit iPad portrait without horizontal scroll (P2 TODO); scrim tap dismisses (P2 TODO for each modal/drawer)

### P1 TODOs (Critical)

- [ ] **VER-EL-SCR-035-10-01 [P1]** â€” Verify Header Help button's aria-expanded always reflects HelpDrawer.isOpen() via cs:helpStateChange event listener
- [ ] **VER-EL-SCR-039-01-02 [P1]** â€” Every preference toggle in PreferencesModal MUST dispatch cs:prefsChanged CustomEvent after UserPrefs.set(); verify apply-prefs.js reacts to all preference changes
- [ ] **VER-EL-SCR-043-01-03 [P1]** â€” BackupRestore import is destructive; confirm modal with project/thread/pattern count appears before executing restore; verify window.confirm() used or custom confirmation modal
- [ ] **VER-EL-SCR-037-01-04 [P1]** â€” HelpDrawer dispatches cs:helpStateChange on open and close; verify Header reacts and keeps aria-expanded in sync

### P2 TODOs (Important but not critical)

- [ ] **VER-EL-SCR-039-*-02 [P2]** â€” Every modal/drawer fits iPad portrait (â‰¤1024px width) without horizontal scroll
- [ ] **VER-EL-SCR-039-*-03 [P2]** â€” Scrim tap dismisses every modal and drawer (except where suppressible)
- [ ] **VER-EL-SCR-047-*-04 [P2]** â€” Toast Undo button visible for history-invalidating operations (stitch, delete, etc.); verify undoAction callback works end-to-end
- [ ] **VER-EL-SCR-048-*-05 [P2]** â€” Coachmark ring highlights correct target; verify target selector is valid and element present in DOM; fallback to centred popover if target missing

### P3 TODOs (Polish / Rough edges)

- [ ] **VER-EL-SCR-037b-01-06 [P3]** â€” Help Drawer Shortcuts tab kbd glyphs (â†‘ â†“ â† â†’ inside <kbd>, âŒ˜ â‡§ âŒ¥ âŒƒ â†µ allowed only inside <kbd>); NO pictographic emoji anywhere in UI
- [ ] **VER-EL-SCR-035-*-07 [P3]** â€” If any emoji-like character found in user-facing UI outside approved <kbd> glyphs, flag and replace with SVG icon

### P4 TODOs (Nice-to-have)

- [ ] **VER-EL-SCR-047-*-08 [P4]** â€” Toast animations smooth; slide in from bottom, fade out
- [ ] **VER-EL-SCR-048-*-09 [P4]** â€” Coachmark popover appears near target with smart placement (avoids off-screen); smooth animation
- [ ] **VER-EL-SCR-049-*-10 [P4]** â€” Overlay component composed cleanly; <Overlay.Title>, <Overlay.Body>, <Overlay.Footer> used consistently across modals

### Architectural Notes

- **No emoji in UI**: Only allowed emoji-like glyphs are keyboard legend arrows (â†‘â†“â†â†’ inside `<kbd>`), modifier keys (âŒ˜â‡§âŒ¥âŒƒâ†µ inside `<kbd>`), and box-drawing dividers in source-file headers
- **Workshop theme**: All colours use CSS variables (--accent, --surface, --text-primary, etc.) from styles.css; no raw hex in component CSS except inside box-shadow declarations
- **CustomEvent dispatch pattern**: cs:prefsChanged detail is { key, value }; cs:helpStateChange detail is { open }; cs:projectsChanged has no detail
- **localStorage keys**: Prefixed cs_* (user prefs: cs_pref_*; UI state: cs_help_drawer_tab, cs_welcome_creator_done, etc.)
- **Singleton globals**: window.UserPrefs, window.ProjectStorage, window.StashBridge, window.CommandPalette, window.HelpDrawer, window.Toast, window.Coachmark, window.WelcomeWizard, window.Overlay
- **React hooks (where used)**: useFocusTrap, useCoachingSequence, usePref, useEscape (custom stack-based Escape handler)
- **No external state libraries**: All state via React useState/useReducer or localStorage + event dispatch

---

## VERIFICATION TODO

- [ ] `VER-EL-SCR-035-01-01` [P1] â€” Header logo navigates home or scrolls to top; always 1px from safe-area-inset
- [ ] `VER-EL-SCR-035-02-01` [P1] â€” App-section tabs suppress on home page; marked aria-current="page" on active tab
- [ ] `VER-EL-SCR-035-03-01` [P1] â€” Sub-page dropdown visible only on creator/editor; maps legacy 'prepare'/'legend'/'export' to 'materials'
- [ ] `VER-EL-SCR-035-04-01` [P1] â€” Project switcher loads recents async; falls back to empty state if no projects; "All projectsâ€¦" entry opens picker
- [ ] `VER-EL-SCR-035-05-01` [P1] â€” Project name editable inline; maxLength 60; Enter commits; Escape reverts
- [ ] `VER-EL-SCR-035-06-01` [P1] â€” Save status badge shows 5 states: pending/saving/saved/error/idle; Retry button wired to onRetrySave callback
- [ ] `VER-EL-SCR-035-07-01` [P1] â€” Sync indicator shows correct status; click navigates to home; icon reflects sync state
- [ ] `VER-EL-SCR-035-08-01` [P1] â€” Command palette button visible only if window.CommandPalette defined; click or Ctrl/Cmd+K opens overlay
- [ ] `VER-EL-SCR-035-09-01` [P1] â€” Keyboard shortcuts button opens HelpDrawer on Shortcuts tab; focus moves to search input
- [ ] `VER-EL-SCR-035-10-01` [P1] â€” Help button aria-expanded reflects HelpDrawer.isOpen(); cs:helpStateChange listener keeps state in sync
- [ ] `VER-EL-SCR-035-11-01` [P1] â€” File menu items conditionally render based on page context and prop availability
- [ ] `VER-EL-SCR-035-11b-01` [P1] â€” Theme toggle cycles light â†’ dark â†’ system; UserPrefs.set() + cs:prefsChanged dispatched; apply-prefs.js reacts
- [ ] `VER-EL-SCR-035-11d-01` [P1] â€” Backup/Restore wired; inline restore handles legacy JSON + new CSB1 format; confirmation modal appears
- [ ] `VER-EL-SCR-035-11e-01` [P1] â€” Sync operations only visible if SyncEngine defined; import dispatches 'sync-plan-ready' or shows confirm dialog
- [ ] `VER-EL-SCR-036-01-01` [P1] â€” Context bar name editable; metadata shows dimensions Ã— colour count; completion % displayed as progress bar
- [ ] `VER-EL-SCR-037-01-01` [P1] â€” HelpDrawer opens/closes via HelpDrawer.open()/close(); persists tab to localStorage; dispatches cs:helpStateChange
- [ ] `VER-EL-SCR-037-02-01` [P1] â€” Tabs switchable; search filters results; tab persisted to localStorage
- [ ] `VER-EL-SCR-037a-01-01` [P1] â€” Help topics displayed; grouped by area; searchable; no emoji in copy
- [ ] `VER-EL-SCR-037b-01-01` [P1] â€” Shortcuts list grouped by scope; filtered by search; keys displayed in <kbd> tags; allowed glyphs only (â†‘â†“â†â†’âŒ˜â‡§âŒ¥âŒƒâ†µ)
- [ ] `VER-EL-SCR-037c-01-01` [P1] â€” Getting Started cards displayed; actions call buildSampleProject, WelcomeWizard.reset, resetCoaching; drawer closes
- [ ] `VER-EL-SCR-038-01-01` [P1] â€” CommandPalette opens via Ctrl/Cmd+K or button; Escape closes; Enter selects; Arrow keys navigate
- [ ] `VER-EL-SCR-038-02-01` [P1] â€” Search input fuzzy-scores results; IME composition skipped; query state drives result list
- [ ] `VER-EL-SCR-038-03-01` [P1] â€” Results grouped by section; recent projects loaded async from ProjectStorage; "No matching actions" on empty
- [ ] `VER-EL-SCR-038-04-01` [P1] â€” Hint footer shows keyboard controls; arrow glyphs â†‘â†“ and enter glyph â†µ in <kbd> only
- [ ] `VER-EL-SCR-039-01-01` [P1] â€” PreferencesModal opens; all categories accessible; settings save automatically; cs:prefsChanged dispatched
- [ ] `VER-EL-SCR-039-03-01` [P1] â€” Each pref row has label + description + control; layout grid with label left, control right
- [ ] `VER-EL-SCR-039-04-01` [P1] â€” Designer details fields save to UserPrefs; logo upload limits 600Ã—600 px; stores as data URL
- [ ] `VER-EL-SCR-039-06-01` [P1] â€” "Show finished projects" toggle wired; home page filters projects on cs:prefsChanged
- [ ] `VER-EL-SCR-039-07-01` [P1] â€” Creator defaults save; Creator Sidebar reads them on init; per-project overrides still work
- [ ] `VER-EL-SCR-039-08-01` [P1] â€” Tracker defaults save; Tracker reads them on init
- [ ] `VER-EL-SCR-039-09-01` [P1] â€” Manager defaults save; Manager reads them on init
- [ ] `VER-EL-SCR-040-01-01` [P1] â€” WelcomeWizard fires first visit; marked done; can replay from Help
- [ ] `VER-EL-SCR-040-02-01` [P1] â€” Step indicator dots update as user advances
- [ ] `VER-EL-SCR-040-04-01` [P1] â€” Back button disabled on step 0; final button label "Get started"; Skip always enabled
- [ ] `VER-EL-SCR-043-01-01` [P1] â€” Backup import confirmation shows project/thread/pattern counts; destructive operation confirmed before executing
- [ ] `VER-EL-SCR-044-01-01` [P1] â€” About modal displays app title, description, tech stack, version
- [ ] `VER-EL-SCR-045-01-01` [P1] â€” Help fallback modal shown if HelpDrawer missing; prompts user to reload
- [ ] `VER-EL-SCR-046-01-01` [P1] â€” ThreadSelector modal opens; search filters threads; selection fires onSelect callback
- [ ] `VER-EL-SCR-046-04-01` [P1] â€” Swap banner appears when In Use thread clicked; "Swap Colours" calls onSwap
- [ ] `VER-EL-SCR-047-01-01` [P1] â€” Toast container fixed at bottom-centre; max 3 visible; oldest dismissed if limit exceeded
- [ ] `VER-EL-SCR-047-02-01` [P1] â€” Individual toast renders with icon, message, optional Undo button, dismiss button
- [ ] `VER-EL-SCR-047-03-01` [P1] â€” Toast icon from window.Icons or fallback coloured dot (no emoji)
- [ ] `VER-EL-SCR-047-05-01` [P1] â€” Undo button calls undoAction callback; follow-up "Undone" success toast appears
- [ ] `VER-EL-SCR-048-01-01` [P1] â€” Coachmark opens when active step available; Escape skips; Got it marks complete
- [ ] `VER-EL-SCR-048-03-01` [P1] â€” Highlight ring appears around target; updated on resize/scroll; z-index below popover
- [ ] `VER-EL-SCR-048-04-01` [P1] â€” Popover positioned near target or centred; adaptive placement
- [ ] `VER-EL-SCR-048-08-01` [P1] â€” Skip button skips step (per-session, replay on next mount); Got it marks complete (persists to UserPrefs)
- [ ] `VER-EL-SCR-049-01-01` [P1] â€” Overlay scrim click dismisses if dismissOnScrim=true (default)
- [ ] `VER-EL-SCR-049-02-01` [P1] â€” Overlay panel renders children; variant-specific layout (dialog centred, sheet bottom, drawer side)
- [ ] `VER-EL-SCR-049-03-01` [P1] â€” Focus trap applies; Tab cycles focusables; focus restored on close
- [ ] `VER-EL-SCR-049-04-01` [P1] â€” Body scroll locked while overlay open; restored on unmount
- [ ] `VER-EL-SCR-049-05-01` [P1] â€” CloseButton helper renders Ã— icon (SVG or fallback); click fires onClose
- [ ] `VER-EL-SCR-050-01-01` [P1] â€” PartialStitchThumb renders canvas-backed <img>; caches result (32-entry LRU); unstitched cells ghosted
- [ ] `VER-EL-SCR-034-01-01` [P2] â€” Embroidery Tool out of scope; marked experimental; not surfaced in nav unless pref enabled
