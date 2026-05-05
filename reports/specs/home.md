# Area Spec: home

> Phase 1B output. Element-level behaviour spec for all screens in the
> `home` area. See reports/specs/00_INTERFACE_MAP.md for Screen IDs.

## Scope

The `home` area encompasses the landing dashboard and hub screens accessible via `home.html`. All five assigned screens render within a single React root component (`HomeApp` in [home-app.js](../../home-app.js)), with tab-based navigation between Projects, Create New, Stash, and Stats views. Two supporting component trees are also included: `MultiProjectDashboard` (used on manager.html via [home-screen.js](../../home-screen.js)) and individual project card components. The area interacts with `ProjectStorage`, `StashBridge`, and `UserPrefs` for state persistence; uses Icons from [icons.js](../../icons.js); and fires CustomEvents (`cs:projectsChanged`, `cs:stashChanged`, `cs:prefsChanged`) for cross-tab sync.

**Screens covered:**
- SCR-001 Home Dashboard (Projects tab)
- SCR-002 Home Create New tab
- SCR-003 Home Stash tab
- SCR-004 Home Stats tab
- SCR-052 MultiProjectDashboard (recent projects)
- SCR-053 HomeScreenProjectCard
- SCR-061 Home-screen MultiProjectDashboard

---

## Screen: SCR-001 â€” Home Dashboard (Projects tab)

The default landing view on `/home`. Renders a time-aware greeting, the active project card (merged resume surface), and an "All projects" list capped at 8 entries. Tab bar at top with project count badge. Header shared with all pages. Footer with About link only.

### EL-SCR-001-01: Header (shared) â€” forward reference

The shared Header is owned by the **shared-shell** spec. See [shared-shell.md â†’ EL-SCR-035-01](shared-shell.md) and the SCR-035 element block for the canonical Header element specification, behaviours, keyboard map, and verification TODOs. SCR-001 inherits all Header behaviour unchanged.

_(Resolves VER-CONF-001. The previous home.md Header definition was a duplicate and has been removed in favour of the single source of truth in shared-shell.md.)_

### EL-SCR-001-02: Home Tab Bar
- **Location**: below header, full width
- **Type**: tab group (role=tablist)
- **Component**: `HomeTabBar` (inline in [home-app.js](../../home-app.js))
- **Visible when**: always
- **Default state**: Projects tab active (aria-selected="true"), other tabs inactive

**Intended behaviour:**
- **Trigger**: user clicks a tab button (Projects / Create new / Stash / Stats)
- **Immediate feedback**: clicked tab highlights (home-tab--active class); content panel switches
- **State mutation**: `tab` state â†’ one of 'projects' | 'create' | 'stash' | 'stats'; URL parameter ?tab=X available for external entry points
- **Navigation**: tabs do not navigate; they swap content in-page (SPA-style)
- **Side effects**: if switching to Stash or Stats tab, lazy-load data (refreshStashRef / refreshStatsRef)
- **Success outcome**: user sees the requested tab content

**Keyboard**: Tab navigates between tabs (standard tablist); Enter/Space activates focused tab
**Constraints**: Projects tab must show project count in badge (red indicator, not an emoji). Stash and Stats tabs load data only when opened (perf optimisation per [home-app.js](../../home-app.js):1024â€“1032)
**Relationships**: badge count auto-updates when projects list changes via cs:projectsChanged event

### EL-SCR-001-03: Projects Tab Badge
- **Location**: top-right of Projects tab button
- **Type**: display (counter badge)
- **Component**: span.home-tab__badge (inline in HomeTabBar)
- **Visible when**: projectCount > 0 (uses `display: none` when count === 0; layout shift on first project is intentional and accepted â€” the tab bar is stable enough without space reservation)
- **Default state**: aria-hidden="true" (decoration only)

**Intended behaviour:**
- **Trigger**: ProjectStorage.listProjects() populates the list
- **Immediate feedback**: badge shows numeric count
- **State mutation**: none (computed from list.length)
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees at a glance how many projects exist

**Keyboard**: none (hidden from AT via aria-hidden)
**Constraints**: Count must be accurate; update when list changes
**Relationships**: updates when HomeApp's `list` state changes (watch in refreshAll callback)

### EL-SCR-001-04: Greeting Row
- **Location**: top of Projects tab content
- **Type**: section (hero text + CTA)
- **Component**: `GreetingRow` (inline in [home-app.js](../../home-app.js):105â€“130)
- **Visible when**: on Projects tab
- **Default state**: greeting text + count of projects

**Intended behaviour:**
- **Trigger**: page loads or Projects tab selected
- **Immediate feedback**: displays time-aware greeting ("Good morning" / "Good afternoon" / "Good evening") via `getGreeting()` helper; subtitle shows "N project(s)" or "No projects yet"
- **State mutation**: none (display only)
- **Navigation**: "+ New project" button â†’ calls props.onTab('create') to switch to Create tab
- **Side effects**: none
- **Success outcome**: user sees greeting + project count; can start new pattern from one click

**Keyboard**: "+ New project" button is focusable; Enter/Space activates
**Constraints**: Greeting text must match time of day. If zero projects, subtitle must say "No projects yet â€” create one to get started."
**Relationships**: list.length feeds the count; onTab callback controls tab switching

### EL-SCR-001-05: Active Project Card
- **Location**: below greeting row
- **Type**: section (highlighted resume card)
- **Component**: `ActiveProjectCard` (inline in [home-app.js](../../home-app.js):132â€“245)
- **Visible when**: always (empty state if no active project)
- **Default state**: card shows active project or empty state

**Intended behaviour for active project:**
- **Trigger**: ProjectStorage.getActiveProject() fetches the active project ID from localStorage
- **Immediate feedback**: renders project name, avatar (initials), dimensions (WxH), update time (e.g. "Updated 3 days ago"), completion %, and progress bar
- **State mutation**: none (read-only display)
- **Navigation**: "Resume tracking" â†’ activateAndGo(p.id, 'stitch.html') sets active project and navigates to tracker; "Edit pattern" â†’ activateAndGo(p.id, 'create.html') sets active project and navigates to creator
- **Side effects**: activateAndGo calls ProjectStorage.setActiveProject() to ensure the target tool opens with the right project loaded
- **Success outcome**: user can jump directly to either Tracker or Creator for the active project with one click

**Intended behaviour for empty state:**
- **Trigger**: no project is active
- **Immediate feedback**: card shows "No active project" header + suggestion to pick one below or start new
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user understands why no project is pinned and can take action

**Keyboard**: "Resume tracking" and "Edit pattern" buttons are focusable; Enter/Space activates
**Constraints**: Project initials avatar must be truncated to 2 chars max. Completion % must be hidden if pattern has no stitches (p.totalStitches === 0). ETA label only shown if 50+ stitches are done and there is enough velocity data. Progress bar must be muted if completion is 0%.
**Relationships**: reads activeProject from HomeApp state (set by ProjectStorage.getActiveProject in refreshAll); uses timeAgo() helper from [home-screen.js](../../home-screen.js); uses etaLabel() helper for ETA projection based on velocity

### EL-SCR-001-06: Active Project Avatar
- **Location**: left side of Active Project Card body
- **Type**: display (initials avatar)
- **Component**: div.home-active-card__avatar
- **Visible when**: card is visible
- **Default state**: background-neutral, white text, project initials

**Intended behaviour:**
- **Trigger**: active project loaded
- **Immediate feedback**: shows 1â€“2 letter initials (first letter of first and second words of project name, or first 2 chars if single word)
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: visual identifier for the project

**Keyboard**: none (decoration; aria-hidden="true")
**Constraints**: initials must be derived via projectInitials() helper; max 2 chars; if name is empty, show '?'
**Relationships**: derived from activeProject.name

### EL-SCR-001-07: Active Project Progress Bar
- **Location**: below Active Project Card name and metadata
- **Type**: display (progress indicator)
- **Component**: div.home-active-card__bar with animated fill
- **Visible when**: pct !== null (i.e., at least one stitch exists)
- **Default state**: width = pct%; color = accent

**Intended behaviour:**
- **Trigger**: project has tracking data (done array) and pattern (totalStitches > 0)
- **Immediate feedback**: filled portion of bar shows % complete
- **State mutation**: none (computed)
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: visual progress indicator

**Keyboard**: none (decoration)
**Constraints**: width must be clamped to 0â€“100%; must not render if pct is null
**Relationships**: pct computed via projectPct() helper

### EL-SCR-001-08: Active Project Resume Button
- **Location**: bottom-right of Active Project Card
- **Type**: button (primary CTA)
- **Component**: button.btn.btn-primary (inline in ActiveProjectCard)
- **Visible when**: card has active project
- **Default state**: enabled, blue background, white text "Resume tracking"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: button may show loading state; page navigates
- **State mutation**: ProjectStorage.setActiveProject(p.id) called to confirm the active project pointer
- **Navigation**: window.location.href = 'stitch.html?from=home' (full page load)
- **Side effects**: ?from=home tells stitch.html to skip the redirect-to-home guard
- **Success outcome**: user lands on Tracker canvas with the active project loaded

**Keyboard**: focusable; Enter/Space activates
**Constraints**: must disable if project is being deleted or no pattern exists
**Relationships**: calls activateAndGo(p.id, 'stitch.html') helper

### EL-SCR-001-09: Active Project Edit Button
- **Location**: bottom-right of Active Project Card (secondary)
- **Type**: button (secondary CTA)
- **Component**: button.btn (inline in ActiveProjectCard)
- **Visible when**: card has active project
- **Default state**: enabled, ghost/outline background, "Edit pattern"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: button may show loading state; page navigates
- **State mutation**: ProjectStorage.setActiveProject(p.id) called
- **Navigation**: window.location.href = 'create.html?from=home'
- **Side effects**: ?from=home tells create.html to skip the redirect-to-home guard
- **Success outcome**: user lands on Pattern Creator with the active project loaded in editor mode

**Keyboard**: focusable; Enter/Space activates
**Constraints**: must be available whenever Resume is available (same active project conditions)
**Relationships**: calls activateAndGo(p.id, 'create.html') helper

### EL-SCR-001-10: Projects List Section
- **Location**: below Active Project Card
- **Type**: section
- **Component**: `ProjectsList` (inline in [home-app.js](../../home-app.js):247â€“400)
- **Visible when**: on Projects tab AND there are other projects (excludes active project and completed projects if homeShowCompleted pref is false)
- **Default state**: list of up to 8 project rows

**Intended behaviour:**
- **Trigger**: ProjectStorage.listProjects() populates the list; filters applied based on pref
- **Immediate feedback**: rows render in reverse-chronological order (most recently updated first)
- **State mutation**: none (display + row-level interactions)
- **Navigation**: none at section level (see individual row elements)
- **Side effects**: if showCompleted pref changes, re-filter list
- **Success outcome**: user sees all active and queued projects at a glance

**Keyboard**: none at section level
**Constraints**: must exclude the active project (already shown in ActiveProjectCard). Must respect homeShowCompleted pref (exclude 100% done projects if pref is false). Max 8 rows shown; no pagination (older projects are accessible via manager.html).
**Relationships**: projects state in HomeApp; watches cs:prefsChanged event for homeShowCompleted pref changes

### EL-SCR-001-11: Projects List Title
- **Location**: top of ProjectsList section
- **Type**: heading (h2)
- **Component**: h2.home-section__title (inline in ProjectsList)
- **Visible when**: ProjectsList is visible
- **Default state**: text "All projects"

**Intended behaviour:**
- **Trigger**: always rendered when section renders
- **Immediate feedback**: none
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: accessible label for the section

**Keyboard**: none
**Constraints**: id='home-proj-list-title' required for aria-labelledby on section
**Relationships**: none

### EL-SCR-001-12: Project Row (per list item)
- **Location**: repeated in ProjectsList grid
- **Type**: article / row
- **Component**: div.home-proj-row (inline in ProjectsList map)
- **Visible when**: per project in filtered list
- **Default state**: avatar | name/metadata/bar | Track/Edit buttons

**Intended behaviour:**
- **Trigger**: project is in list
- **Immediate feedback**: row renders with project data
- **State mutation**: clicking project name opens metadata popover
- **Navigation**: Track/Edit buttons navigate to tracker/creator
- **Side effects**: none
- **Success outcome**: user can access or navigate to project

**Keyboard**: none at row level (see child elements)
**Constraints**: each row must be distinct (unique project id). Rows must be deletable via manager.html (no delete here, but state sync must work).
**Relationships**: data from project metadata; Track and Edit are sub-elements

### EL-SCR-001-13: Project Row Avatar
- **Location**: left of project row
- **Type**: display (initials badge)
- **Component**: div.home-proj-row__avatar (inline in ProjectsList row)
- **Visible when**: per project row
- **Default state**: initials (1â€“2 chars)

**Intended behaviour:**
- **Trigger**: project rendered
- **Immediate feedback**: shows initials
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: visual identifier

**Keyboard**: none (decoration; aria-hidden="true")
**Constraints**: same as EL-SCR-001-06
**Relationships**: projectInitials(p.name)

### EL-SCR-001-14: Project Row Name Button
- **Location**: centre-left of project row
- **Type**: button (text, no visible frame)
- **Component**: button.home-proj-row__name.home-proj-row__name--button (inline in ProjectsList row)
- **Visible when**: per project row
- **Default state**: project name as button text; aria-haspopup="dialog"

**Intended behaviour:**
- **Trigger**: user clicks project name
- **Immediate feedback**: metadata popover opens anchored to the button (via AppInfoPopover)
- **State mutation**: openFor === p.id (triggers re-render of popover)
- **Navigation**: none
- **Side effects**: popover opens; focus may move to popover
- **Success outcome**: user sees detailed metadata for the project without navigating

**Keyboard**: focusable; Enter/Space opens popover; Escape closes
**Constraints**: must have aria-haspopup="dialog" and aria-expanded reflecting popover state. Title should say "Project details" for screen readers.
**Relationships**: uses AppInfoPopover component (from [components.js](../../components.js)); data from metadataPopover() helper in ProjectsList

### EL-SCR-001-15: Project Row Metadata Popover
- **Location**: overlay near project name button
- **Type**: popover (modal, dismissible on escape/click-outside)
- **Component**: window.AppInfoPopover (conditional render in ProjectsList row)
- **Visible when**: isOpen === p.id
- **Default state**: closed; opens on button click

**Intended behaviour for open:**
- **Trigger**: user clicks project name button
- **Immediate feedback**: popover appears with grid of metadata sections (Pattern / Metadata)
- **State mutation**: setOpenFor(p.id) sets the state to open; setOpenFor(null) closes
- **Navigation**: none (metadata is read-only)
- **Side effects**: focus trap within popover; Escape key dismisses
- **Success outcome**: user can read detailed project info (dimensions, fabric, stitchable count, colours, progress %, created/updated dates, time spent)

**Intended behaviour for close:**
- **Trigger**: user presses Escape, clicks outside, or clicks name button again
- **Immediate feedback**: popover closes and focus returns to button
- **State mutation**: setOpenFor(null)
- **Navigation**: none
- **Side effects**: document click listener attached while open
- **Success outcome**: popover dismissed without navigating

**Keyboard**: Escape closes; Tab cycles through popover content; click outside closes
**Constraints**: popover data must be accurate (dimensions, stitches, colours, progress, dates). Must not allow editing from this view (read-only).
**Relationships**: uses AppInfoPopover (shared component); data from metadataPopover(p) helper; triggerRef anchors popover to button

### EL-SCR-001-16: Project Row Metadata â€” Dimensions
- **Location**: Pattern section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row (inline in metadataPopover)
- **Visible when**: p.settings and p.settings.sW exist
- **Default state**: "Dimensions" label + "WxH stitches" value

**Intended behaviour:**
- **Trigger**: popover opens
- **Immediate feedback**: dimension value displayed
- **State mutation**: none (read-only)
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees pattern dimensions

**Keyboard**: none
**Constraints**: format must be "WxH" (e.g. "80Ã—80")
**Relationships**: from p.settings.sW and p.settings.sH

### EL-SCR-001-17: Project Row Metadata â€” Fabric Count
- **Location**: Pattern section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: p.settings && p.settings.fabricCt
- **Default state**: "Fabric" label + "N ct Aida" value

**Intended behaviour:**
- **Trigger**: popover opens
- **Immediate feedback**: fabric count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees fabric specification

**Keyboard**: none
**Constraints**: format must be "Nct Aida" (e.g. "14 ct Aida")
**Relationships**: from p.settings.fabricCt

### EL-SCR-001-18: Project Row Metadata â€” Stitchable Count
- **Location**: Pattern section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: stitchable > 0 (pattern has non-skip/empty cells)
- **Default state**: "Stitchable" label + count value (localized number)

**Intended behaviour:**
- **Trigger**: popover opens; stitches counted on demand
- **Immediate feedback**: stitchable cell count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows the true stitch count (excluding skips/empty)

**Keyboard**: none
**Constraints**: must use toLocaleString() for thousands separator; must exclude __skip__ and __empty__ cells
**Relationships**: computed by scanning p.pattern

### EL-SCR-001-19: Project Row Metadata â€” Colours
- **Location**: Pattern section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: distinctColours > 0
- **Default state**: "Colours" label + count value

**Intended behaviour:**
- **Trigger**: popover opens; colours counted on demand
- **Immediate feedback**: unique colour count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows thread palette size

**Keyboard**: none
**Constraints**: must count unique thread IDs in pattern (including blend IDs like "310+550"), excluding __skip__ and __empty__. Blends count as 2 thread references each, but we count distinct IDs (so "310+550" and "310+550" in two cells = 1 distinct entry, 2 distinct thread IDs overall). The display shows total distinct IDs only.
**Relationships**: computed by scanning p.pattern and deduping

### EL-SCR-001-20: Project Row Metadata â€” Progress
- **Location**: Pattern section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: pct !== null
- **Default state**: "Progress" label + "N% (done/total)" value

**Intended behaviour:**
- **Trigger**: popover opens; tracking data exists
- **Immediate feedback**: progress percentage and done/total counts displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees tracking progress

**Keyboard**: none
**Constraints**: both done and stitchable must be localized (toLocaleString())
**Relationships**: pct computed via projectPct(p) helper

### EL-SCR-001-21: Project Row Metadata â€” Created Date
- **Location**: Metadata section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: p.createdAt exists
- **Default state**: "Created" label + formatted date (locale-aware)

**Intended behaviour:**
- **Trigger**: popover opens
- **Immediate feedback**: creation date displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows when project was created

**Keyboard**: none
**Constraints**: date format must be locale-aware (toLocaleDateString()); use ISO string p.createdAt
**Relationships**: from p.createdAt

### EL-SCR-001-22: Project Row Metadata â€” Last Edited
- **Location**: Metadata section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: p.updatedAt exists
- **Default state**: "Last edited" label + relative time (e.g. "3 days ago")

**Intended behaviour:**
- **Trigger**: popover opens
- **Immediate feedback**: last update time displayed in relative format
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows when project was last touched

**Keyboard**: none
**Constraints**: must use timeAgo(p.updatedAt) helper for relative formatting
**Relationships**: from p.updatedAt

### EL-SCR-001-23: Project Row Metadata â€” Time Spent
- **Location**: Metadata section of popover
- **Type**: display (key-value grid row)
- **Component**: AppInfoGrid row
- **Visible when**: totalSec > 0 (project has tracking sessions)
- **Default state**: "Time spent" label + human-readable duration (e.g. "12h 30m")

**Intended behaviour:**
- **Trigger**: popover opens; sessions data available
- **Immediate feedback**: cumulative stitching time displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees total time investment in project

**Keyboard**: none
**Constraints**: format must use fmtTimeL() helper or equivalent (hours:minutes, abbreviated)
**Relationships**: computed from p.totalTime or p.statsSessions

### EL-SCR-001-24: Project Row Bar
- **Location**: below project row name/meta
- **Type**: display (progress indicator)
- **Component**: div.home-proj-row__bar with fill
- **Visible when**: pct !== null
- **Default state**: width = pct%; muted colour if pct === 0

**Intended behaviour:**
- **Trigger**: project row rendered
- **Immediate feedback**: filled portion of bar shows % complete
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: visual progress indicator at a glance

**Keyboard**: none (decoration)
**Constraints**: same as EL-SCR-001-07
**Relationships**: pct computed via projectPct(p)

### EL-SCR-001-25: Project Row Meta Text
- **Location**: centre of project row, below avatar
- **Type**: display (metadata summary)
- **Component**: div.home-proj-row__meta (inline in row)
- **Visible when**: per project row
- **Default state**: comma-separated metadata (dimensions Â· updated Â· progress Â· ETA)

**Intended behaviour:**
- **Trigger**: project row rendered
- **Immediate feedback**: metadata displayed as text (e.g. "80Ã—80 Â· 2 days ago Â· 45%")
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees key stats inline without popovers

**Keyboard**: none
**Constraints**: only include non-null metadata parts; use ' Â· ' separator. Include ETA if available (etaLabel() returns non-null).
**Relationships**: dim, updated time, pct, eta computed from project data

### EL-SCR-001-26: Project Row Track Button
- **Location**: right side of project row (primary action)
- **Type**: button (primary, small)
- **Component**: button.btn.btn-primary.btn-sm (inline in row)
- **Visible when**: per project row
- **Default state**: enabled, text "Track"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: button may show loading state; page navigates
- **State mutation**: ProjectStorage.setActiveProject(p.id) called
- **Navigation**: window.location.href = 'stitch.html?from=home'
- **Side effects**: ?from=home tells stitch.html to skip redirect guard
- **Success outcome**: user lands on Stitch Tracker with project loaded

**Keyboard**: focusable; Enter/Space activates
**Constraints**: must be available for all projects (not just active)
**Relationships**: calls activateAndGo(p.id, 'stitch.html') helper

### EL-SCR-001-27: Project Row Edit Button
- **Location**: right side of project row (secondary action)
- **Type**: button (secondary, small)
- **Component**: button.btn.btn-sm (inline in row)
- **Visible when**: per project row
- **Default state**: enabled, text "Edit"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: button may show loading state; page navigates
- **State mutation**: ProjectStorage.setActiveProject(p.id) called
- **Navigation**: window.location.href = 'create.html?from=home'
- **Side effects**: ?from=home tells create.html to skip redirect guard
- **Success outcome**: user lands on Pattern Creator with project loaded in edit mode

**Keyboard**: focusable; Enter/Space activates
**Constraints**: must be available for all projects
**Relationships**: calls activateAndGo(p.id, 'create.html') helper

### EL-SCR-001-28: Home Footer
- **Location**: bottom of page (all tabs)
- **Type**: footer
- **Component**: `HomeFooter` (inline in [home-app.js](../../home-app.js):917â€“927)
- **Visible when**: all tabs
- **Default state**: About button visible

**Intended behaviour:**
- **Trigger**: rendered on all tabs
- **Immediate feedback**: About button present
- **State mutation**: clicking About triggers setAboutOpen(true)
- **Navigation**: none (modal opens)
- **Side effects**: AboutModal dispatches (if SharedModals.About available)
- **Success outcome**: user can open About modal

**Keyboard**: About button focusable; Enter/Space activates
**Constraints**: Help is in the header, not here (avoid duplication). Preferences is in File menu (header).
**Relationships**: onAbout callback triggers about state in HomeApp

### EL-SCR-001-29: About Modal
- **Location**: overlay (centred, full-screen scrim)
- **Type**: modal dialog
- **Component**: window.SharedModals.About (conditional render in HomeApp)
- **Visible when**: aboutOpen === true
- **Default state**: closed (aboutOpen === false on mount)

**Intended behaviour for open:**
- **Trigger**: user clicks About link in footer
- **Immediate feedback**: modal appears with app info, version, links
- **State mutation**: setAboutOpen(true)
- **Navigation**: none (read-only)
- **Side effects**: scrim prevents interaction with page behind
- **Success outcome**: user sees app information and credits

**Intended behaviour for close:**
- **Trigger**: user clicks close button or presses Escape
- **Immediate feedback**: modal closes
- **State mutation**: setAboutOpen(false)
- **Navigation**: none
- **Side effects**: focus returns to footer About button
- **Success outcome**: modal dismissed

**Keyboard**: Escape closes; Tab cycles through modal content
**Constraints**: must use SharedModals.About component from [modals.js](../../modals.js); content must be app-specific (name, version, links, credits)
**Relationships**: rendered conditionally in HomeApp root

### EL-SCR-001-30: Preferences Modal
- **Location**: overlay (centred, full-screen scrim)
- **Type**: modal dialog
- **Component**: window.PreferencesModal (conditional render in HomeApp)
- **Visible when**: prefsOpen === true
- **Default state**: closed (prefsOpen === false on mount)

**Intended behaviour for open:**
- **Trigger**: user presses Ctrl+Comma OR clicks File > Preferences OR fires cs:openPreferences event
- **Immediate feedback**: modal appears with preference categories (creator/tracker/stash/accessibility/sync)
- **State mutation**: setPrefsOpen(true) when cs:openPreferences event received; useEffect listener attached
- **Navigation**: none (modal only)
- **Side effects**: Ctrl+Comma is global shortcut; cs:prefsChanged event fired when prefs change
- **Success outcome**: user can read and modify app preferences

**Intended behaviour for close:**
- **Trigger**: user clicks close button or presses Escape
- **Immediate feedback**: modal closes; any changed prefs are persisted to localStorage
- **State mutation**: setPrefsOpen(false); onClose callback from PreferencesModal
- **Navigation**: none
- **Side effects**: cs:prefsChanged event dispatched for each changed pref (detail: {key, value})
- **Success outcome**: modal dismissed; prefs saved

**Keyboard**: Escape closes; Tab cycles through form
**Constraints**: must use window.PreferencesModal from [preferences-modal.js](../../preferences-modal.js); must dispatch cs:prefsChanged events so other pages react (e.g. apply-prefs.js for theme changes)
**Relationships**: listens for cs:openPreferences event; fires cs:prefsChanged on close

### EL-SCR-001-31: Show Completed Projects Toggle
- **Location**: not on Home Dashboard page itself, but in Preferences modal (accessible from this page)
- **Type**: preference toggle (not a page element, mentioned for context)
- **Component**: preference form field
- **Visible when**: Preferences modal open on home/creator
- **Default state**: true (show completed by default)

**Intended behaviour:**
- **Trigger**: user toggles the "Show completed projects" pref in Preferences
- **Immediate feedback**: toggle switches; projects list filtered on next render or immediately if state management is reactive
- **State mutation**: UserPrefs.set('homeShowCompleted', value); cs:prefsChanged event fired
- **Navigation**: none
- **Side effects**: HomeApp listens for cs:prefsChanged on key 'homeShowCompleted' and updates showCompleted state, triggering re-filter of projects list
- **Success outcome**: completed projects appear/disappear from Projects tab based on pref

**Keyboard**: toggle button focusable; Space activates
**Constraints**: must persist to localStorage via UserPrefs; must be reactive (other pages changing it should update here)
**Relationships**: HomeApp showCompleted state watches cs:prefsChanged event ([home-app.js](../../home-app.js):1052â€“1069)

---

## Screen: SCR-002 â€” Home Create New tab

A tab for starting new patterns. Contains two creation tiles (new from file/image, new from scratch) and an optional experimental third tile (embroidery planner beta).

### EL-SCR-002-01: Create Panel Section
- **Location**: main content area of Create tab
- **Type**: section
- **Component**: `CreatePanel` (inline in [home-app.js](../../home-app.js):402â€“640)
- **Visible when**: tab === 'create'
- **Default state**: three tiles visible (image/file, scratch, optionally embroidery if experimental.embroideryTool pref is true)

**Intended behaviour:**
- **Trigger**: Create tab opened
- **Immediate feedback**: tiles render
- **State mutation**: pending state tracks whether file is being prepared for handoff
- **Navigation**: clicking tiles navigates to creator
- **Side effects**: file input managed via ref; pending spinner shown while image is being read
- **Success outcome**: user can choose creation method

**Keyboard**: none at section level
**Constraints**: experimental.embroideryTool pref controls visibility of third tile
**Relationships**: CreatePanel manages its own file input ref; resets pending state on pageshow (bfcache safety)

### EL-SCR-002-02: Create Panel Title
- **Location**: top of Create Panel
- **Type**: heading (h2)
- **Component**: h2.home-section__title
- **Visible when**: Create tab visible
- **Default state**: text "Start a new pattern"

**Intended behaviour:**
- **Trigger**: always rendered with panel
- **Immediate feedback**: none
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: accessible label

**Keyboard**: none
**Constraints**: none
**Relationships**: none

### EL-SCR-002-03: Hidden File Input
- **Location**: not visible on page (managed via ref)
- **Type**: input[type="file"] (hidden)
- **Component**: input[ref=fileInputRef] (inline in CreatePanel)
- **Visible when**: never (display: none or visibility: hidden)
- **Default state**: accept="image/*,.oxs,.xml,.json,.pdf"

**Intended behaviour:**
- **Trigger**: "New from pattern file" button clicked â†’ handleNewFromImage() calls fileInputRef.current.click()
- **Immediate feedback**: browser file picker opens
- **State mutation**: none at this stage
- **Navigation**: none
- **Side effects**: browser's native file picker is invoked (must be in user gesture context for browser to allow)
- **Success outcome**: user can select a file

**Keyboard**: none (hidden from keyboard navigation)
**Constraints**: must accept image MIME types + common pattern file extensions (.oxs, .xml, .json, .pdf). Accepting .pdf is critical for PDF import support ([pdf-importer.js](../../pdf-importer.js)).
**Relationships**: onChange handler is handleFileChange; fileInputRef created via useRef

### EL-SCR-002-04: New From Image Tile (Button)
- **Location**: left tile in Create Panel grid
- **Type**: button (large, prominent)
- **Component**: button.home-create-tile.home-create-tile--primary
- **Visible when**: Create tab visible
- **Default state**: enabled, shows Image icon + "New from pattern file" title + subtitle

**Intended behaviour:**
- **Trigger**: user clicks tile
- **Immediate feedback**: file input click triggered; browser file picker opens
- **State mutation**: setPending(true) after file is selected and being read
- **Navigation**: after FileReader completes: window.location.href = 'create.html?action=home-image-pending&from=home'
- **Side effects**: selected file serialized to sessionStorage (cs_pending_image_dataurl, cs_pending_image_name, cs_pending_image_type); creator-main.js reconstructs file from sessionStorage and passes it to Creator
- **Success outcome**: Creator opens with the image pre-loaded (no second file picker in Creator)

**Intended behaviour if file read fails:**
- **Trigger**: FileReader.onerror or sessionStorage quota exceeded
- **Immediate feedback**: alert() shown with error message
- **State mutation**: setPending(false)
- **Navigation**: none (user remains on home)
- **Side effects**: none
- **Success outcome**: user is informed of the failure and can retry

**Intended behaviour if file is pattern (not image):**
- **Trigger**: file name matches .oxs/.xml/.json/.pdf; MIME type is not image/*
- **Immediate feedback**: setPending(true); route to window.ImportEngine.importAndReview(file) instead of image handoff
- **State mutation**: setPending(true)
- **Navigation**: ImportEngine takes over; may navigate to Creator or show wizard
- **Side effects**: none
- **Success outcome**: pattern file is imported via the import engine

**Keyboard**: focusable; Enter/Space activates
**Constraints**: tile must be disabled if pending === true (image is being prepared). Icon must come from window.Icons.image(); if not available, gracefully degrade. Subtitle must describe file types accepted. "New from pattern file" and subtitle must not contain emoji (use Icons instead).
**Relationships**: handleFileChange processes selected file; calls navigateAfterPaint() for visual continuity

### EL-SCR-002-05: New From Scratch Tile (Link)
- **Location**: middle tile in Create Panel grid
- **Type**: link (styled as button)
- **Component**: a.home-create-tile (href="create.html?action=new-blank")
- **Visible when**: Create tab visible
- **Default state**: enabled, shows Plus icon + "New from scratch" title + subtitle

**Intended behaviour:**
- **Trigger**: user clicks tile or follows link
- **Immediate feedback**: link followed (href navigation)
- **State mutation**: none (navigation)
- **Navigation**: window.location.href = 'create.html?action=new-blank' (full page load)
- **Side effects**: create.html creator-main.js reads action=new-blank and sets mode='design' + pendingCreatorAction='scratch'
- **Success outcome**: Creator opens with a blank canvas

**Keyboard**: focusable; Enter follows link
**Constraints**: aria-disabled set if pending === true (to prevent clicking while image is being prepared); href is direct (not button with onClick). Icon must come from window.Icons.plus().
**Relationships**: no state mutation; direct link

### EL-SCR-002-06: Embroidery Planner Tile (Experimental Link)
- **Location**: right tile in Create Panel grid (conditional)
- **Type**: link (styled as button)
- **Component**: a.home-create-tile (href="embroidery.html?from=home", conditional render)
- **Visible when**: Create tab visible AND experimental.embroideryTool pref is true
- **Default state**: enabled, shows Thread/Image icon + "Embroidery planner" title + "Beta" badge + subtitle

**Intended behaviour:**
- **Trigger**: user clicks tile or follows link (only if pref is enabled)
- **Immediate feedback**: link followed
- **State mutation**: none (navigation)
- **Navigation**: window.location.href = 'embroidery.html?from=home'
- **Side effects**: embroidery.html loads experimental embroidery tool
- **Success outcome**: user lands on embroidery prototyping page

**Keyboard**: focusable; Enter follows link
**Constraints**: must only render if window.UserPrefs.get('experimental.embroideryTool') === true. aria-disabled set if pending === true. Icon is Thread or Image (Icons.thread preferred, fallback to Icons.image). Badge text must say "Beta" (no emoji).
**Relationships**: read experimental.embroideryTool pref on every render (synchronous, no listener needed for pref changes affecting visibility in Create tab)

### EL-SCR-002-07: Create Tile Badge (Beta)
- **Location**: top-right of Embroidery Planner tile
- **Type**: display (badge)
- **Component**: span.home-create-tile__badge
- **Visible when**: embroidery tile visible
- **Default state**: text "Beta"

**Intended behaviour:**
- **Trigger**: always visible on embroidery tile
- **Immediate feedback**: badge displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows feature is experimental

**Keyboard**: none (read as part of link text)
**Constraints**: text must be "Beta" only (no emoji)
**Relationships**: none

### EL-SCR-002-08: Create Pending Spinner
- **Location**: overlay on Create Panel (centre)
- **Type**: display (loading indicator)
- **Component**: div.home-create-pending (conditional render)
- **Visible when**: pending === true
- **Default state**: hidden (pending === false on mount)

**Intended behaviour when image is being read:**
- **Trigger**: FileReader is processing; setPending(true)
- **Immediate feedback**: semi-transparent overlay + spinner + "Preparing your imageâ€¦" message
- **State mutation**: none (display only)
- **Navigation**: none (waiting for FileReader to complete)
- **Side effects**: blocks interaction with tiles; prevents user from clicking again
- **Success outcome**: user sees that something is happening

**Intended behaviour on completion:**
- **Trigger**: FileReader.onload completes; sessionStorage write succeeds â†’ navigateAfterPaint() called
- **Immediate feedback**: spinner stays visible while page is painted (2 rAFs), then navigation occurs
- **State mutation**: setPending remains true until page unloads
- **Navigation**: window.location.href = 'create.html?action=home-image-pending&from=home'
- **Side effects**: spinner ensures visual continuity across the navigation
- **Success outcome**: landing on Creator feels like a smooth transition

**Keyboard**: none
**Constraints**: spinner div must have role="status" and aria-live="polite" for AT; message must be non-empty ("Preparing your imageâ€¦"); must not contain emoji. Overlay must prevent pointer events.
**Relationships**: pending state managed by CreatePanel; navigateAfterPaint() uses 2 rAFs to ensure paint before nav

---

## Screen: SCR-003 â€” Home Stash tab

A glance-view of the Stash Manager inventory and pattern library. Shows KPI strip (skeins/colours/patterns), shopping list preview, and "ready to start" patterns.

### EL-SCR-003-01: Stash Panel Section
- **Location**: main content area of Stash tab
- **Type**: section
- **Component**: `StashPanel` (inline in [home-app.js](../../home-app.js):642â€“839)
- **Visible when**: tab === 'stash'
- **Default state**: if data exists, renders KPI strip + shopping + ready cards; otherwise empty state

**Intended behaviour:**
- **Trigger**: Stash tab opened; lazy-load refreshStash() called
- **Immediate feedback**: stash data loads asynchronously; panel renders with available data
- **State mutation**: stash state populated via Promise.all() in refreshStash
- **Navigation**: "Open Stash Manager" links navigate to manager.html
- **Side effects**: StashBridge.getGlobalStash(), ProjectStorage APIs called; shopping and ready lists built
- **Success outcome**: user sees stash overview without leaving home

**Keyboard**: none at section level
**Constraints**: data must be loaded lazily only when tab is opened (perf optimisation). Empty state shows helpful message + link to Manager.
**Relationships**: uses StashBridge and ProjectStorage APIs; watches cs:stashChanged event for live updates

### EL-SCR-003-02: Stash Panel Empty State
- **Location**: centre of Stash Panel (if no data)
- **Type**: section (empty)
- **Component**: div.home-stash-panel.home-stash-panel--empty
- **Visible when**: stash is null or no relevant data exists
- **Default state**: message + "Open Stash Manager" link

**Intended behaviour:**
- **Trigger**: initial load or stash has zero threads/patterns
- **Immediate feedback**: friendly message displayed
- **State mutation**: none
- **Navigation**: "Open Stash Manager" link â†’ window.location.href = 'manager.html?from=home'
- **Side effects**: none
- **Success outcome**: user understands stash is empty and can navigate to manager

**Keyboard**: link is focusable
**Constraints**: message must be clear and actionable; no emoji
**Relationships**: none

### EL-SCR-003-03: Stash Panel Head
- **Location**: top of Stash Panel (if data exists)
- **Type**: header
- **Component**: div.home-stash-panel__head
- **Visible when**: stash panel has data
- **Default state**: h2 title + "Open Stash Manager" link

**Intended behaviour:**
- **Trigger**: panel renders with data
- **Immediate feedback**: title and link visible
- **State mutation**: none
- **Navigation**: link â†’ manager.html?from=home
- **Side effects**: none
- **Success outcome**: user can navigate to manager; title identifies section

**Keyboard**: link focusable
**Constraints**: title must say "Stash at a glance"; link is secondary navigation
**Relationships**: none

### EL-SCR-003-04: KPI Grid
- **Location**: below Stash Panel Head
- **Type**: grid (3 columns: skeins / colours / patterns)
- **Component**: div.home-kpi-grid
- **Visible when**: stash panel visible
- **Default state**: three KPI cards with numbers

**Intended behaviour:**
- **Trigger**: stash data loads
- **Immediate feedback**: KPI values displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees top-line stash inventory at a glance

**Keyboard**: none (decoration)
**Constraints**: numbers must use fmtNum() for localization; none can be displayed as emoji
**Relationships**: data from stash state (ownedSkeins, uniqueThreads, patternCount)

### EL-SCR-003-05: KPI Card â€” Skeins
- **Location**: left column of KPI Grid
- **Type**: display
- **Component**: div.home-kpi
- **Visible when**: always (if panel visible)
- **Default state**: number (fmtNum) + label "Skeins" or "Skein"

**Intended behaviour:**
- **Trigger**: panel renders
- **Immediate feedback**: count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees total owned skeins

**Keyboard**: none
**Constraints**: label must be singular/plural (1 Skein vs N Skeins); number must be localized (fmtNum)
**Relationships**: from stash.ownedSkeins

### EL-SCR-003-06: KPI Card â€” Colours
- **Location**: middle column of KPI Grid
- **Type**: display
- **Component**: div.home-kpi
- **Visible when**: always (if panel visible)
- **Default state**: number + label "Colours"

**Intended behaviour:**
- **Trigger**: panel renders
- **Immediate feedback**: unique thread count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees thread variety

**Keyboard**: none
**Constraints**: number must be localized; "Colours" is plural (consistent with British English in codebase)
**Relationships**: from stash.uniqueThreads

### EL-SCR-003-07: KPI Card â€” Patterns
- **Location**: right column of KPI Grid
- **Type**: display
- **Component**: div.home-kpi
- **Visible when**: always (if panel visible)
- **Default state**: number + label "Patterns" or "Pattern"

**Intended behaviour:**
- **Trigger**: panel renders
- **Immediate feedback**: pattern library count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees pattern library size

**Keyboard**: none
**Constraints**: label must be singular/plural; number must be localized
**Relationships**: from stash.patternCount

### EL-SCR-003-08: Stash Grid (Shopping + Ready)
- **Location**: below KPI Grid
- **Type**: grid (2 columns)
- **Component**: div.home-stash-grid
- **Visible when**: stash panel has data
- **Default state**: Shopping list card (left) + Ready to start card (right)

**Intended behaviour:**
- **Trigger**: panel renders
- **Immediate feedback**: two cards rendered side-by-side
- **State mutation**: none
- **Navigation**: see child cards
- **Side effects**: none
- **Success outcome**: user sees top shopping needs and ready patterns

**Keyboard**: none
**Constraints**: 2-column layout; should stack on mobile
**Relationships**: contains child card elements

### EL-SCR-003-09: Shopping List Card
- **Location**: left column of Stash Grid
- **Type**: card (article)
- **Component**: article.home-stash-card
- **Visible when**: stash panel has data
- **Default state**: title "Shopping list" + thread list or empty message

**Intended behaviour:**
- **Trigger**: panel renders; shopping list populated from StashBridge.getShoppingList()
- **Immediate feedback**: card rendered with up to 3 threads shown
- **State mutation**: none
- **Navigation**: "Open" link â†’ manager.html?tab=shopping&from=home
- **Side effects**: none
- **Success outcome**: user sees top shopping priorities without visiting manager

**Keyboard**: "Open" link focusable
**Constraints**: only top 3 threads shown; "+N more" message if shopping.length > 3
**Relationships**: shopping list from home-app state (refreshStash callback)

### EL-SCR-003-10: Shopping List Item (per thread)
- **Location**: as a list item in Shopping List Card
- **Type**: list item (li)
- **Component**: li.home-stash-list__item
- **Visible when**: per shopping list item (max 3 shown)
- **Default state**: colour swatch + thread name + quantity

**Intended behaviour:**
- **Trigger**: shopping list item in list
- **Immediate feedback**: thread displayed with swatch, ID, name, and quantity
- **State mutation**: none
- **Navigation**: none (read-only)
- **Side effects**: none
- **Success outcome**: user can see what threads to buy

**Keyboard**: none (list item, read-only)
**Constraints**: swatch must be an inline color square (span with background: rgbCss(row.rgb)); name format "DMC NNN â€” Full Name" or "BRAND NNN â€” Full Name"; qty shown as "Ã—N" if row.tobuyQty > 0
**Relationships**: data from shopping list array

### EL-SCR-003-11: Shopping List Footer
- **Location**: bottom of Shopping List Card
- **Type**: display (summary text)
- **Component**: p.home-stash-card__foot
- **Visible when**: shopping list has items
- **Default state**: "N colour(s) Â· +M more" or "N colour(s)"

**Intended behaviour:**
- **Trigger**: shopping list card renders
- **Immediate feedback**: total and overflow count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows full shopping list size

**Keyboard**: none
**Constraints**: singular/plural on "colour" vs "colours"; only show "+M more" if shoppingMore > 0
**Relationships**: shopping.length and shoppingMore computed

### EL-SCR-003-12: Ready to Start Card
- **Location**: right column of Stash Grid
- **Type**: card (article)
- **Component**: article.home-stash-card
- **Visible when**: stash panel has data
- **Default state**: title "Ready to start" + intro + pattern list or empty message

**Intended behaviour:**
- **Trigger**: panel renders; ready list populated from ProjectStorage.getProjectsReadyToStart()
- **Immediate feedback**: card rendered with patterns where stash covers all colours (100%)
- **State mutation**: none
- **Navigation**: none at card level (see list items)
- **Side effects**: none
- **Success outcome**: user sees which patterns they can fully stitch

**Keyboard**: none
**Constraints**: only patterns with pct === 100 shown; "no patterns yet" message if none
**Relationships**: ready list from home-app state (refreshStash callback filters to pct >= 100)

### EL-SCR-003-13: Ready List Lead Text
- **Location**: top of Ready to Start Card body
- **Type**: display (introductory text)
- **Component**: p.home-stash-card__lead
- **Visible when**: ready.length > 0
- **Default state**: "N pattern(s) in your library can be stitched entirely from your current stash."

**Intended behaviour:**
- **Trigger**: ready list populated
- **Immediate feedback**: intro text displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user understands what "ready" means

**Keyboard**: none
**Constraints**: count must be bold (strong tag); singular/plural on "pattern" vs "patterns"
**Relationships**: ready.length

### EL-SCR-003-14: Ready Pattern Chip (per pattern)
- **Location**: as a chip in Ready Patterns list
- **Type**: display (tag/chip)
- **Component**: li.home-stash-chips__item
- **Visible when**: per ready pattern (max 3 shown)
- **Default state**: pattern name as a chip

**Intended behaviour:**
- **Trigger**: ready pattern in list
- **Immediate feedback**: pattern name displayed as a chip
- **State mutation**: none
- **Navigation**: none (read-only display)
- **Side effects**: none
- **Success outcome**: user sees pattern names at a glance

**Keyboard**: none
**Constraints**: plain text; no links or interaction
**Relationships**: p.title or p.name from ready patterns array

### EL-SCR-003-15: Ready Patterns Overflow
- **Location**: as a chip in Ready Patterns list (if ready.length > 3)
- **Type**: link (chip style)
- **Component**: li.home-stash-chips__item.home-stash-chips__item--more with a tag
- **Visible when**: readyMore > 0
- **Default state**: text "+N more"

**Intended behaviour:**
- **Trigger**: ready.length > 3
- **Immediate feedback**: link chip displayed
- **State mutation**: none
- **Navigation**: click â†’ manager.html?from=home
- **Side effects**: user navigates to manager to see full ready list
- **Success outcome**: user can jump to full list easily

**Keyboard**: link focusable; Enter follows
**Constraints**: text must say "+N more" (e.g. "+2 more")
**Relationships**: readyMore = max(0, ready.length - 3)

---

## Screen: SCR-004 â€” Home Stats tab

A mini stats dashboard mirroring the look of the full stats page. Shows lifetime stitches, 30-day sparkline, and oldest WIP project suggestion.

### EL-SCR-004-01: Stats Panel Section
- **Location**: main content area of Stats tab
- **Type**: section
- **Component**: `StatsPanel` (inline in [home-app.js](../../home-app.js):841â€“915)
- **Visible when**: tab === 'stats'
- **Default state**: lifetime hero + grid of two cards (sparkline + oldest WIP)

**Intended behaviour:**
- **Trigger**: Stats tab opened; lazy-load refreshStats() called
- **Immediate feedback**: stats data loads; panel renders
- **State mutation**: stats state populated via Promise.all() in refreshStats (lifetimeStitches, dailyLog, oldestWip)
- **Navigation**: "Full dashboard" link â†’ index.html?mode=stats&from=home (note: uses index.html, which redirects via mode param)
- **Side effects**: ProjectStorage APIs called (getLifetimeStitches, getStitchLogByDay, getOldestWIP)
- **Success outcome**: user sees stats overview without leaving home

**Keyboard**: "Full dashboard" link focusable
**Constraints**: data loaded lazily only when tab opened (perf). "Full dashboard" link must navigate correctly (index.html?mode=stats). Panel must handle zero-stitches case gracefully.
**Relationships**: uses ProjectStorage APIs; watches cs:projectsChanged for live updates (lazy refresh when tab is switched to)

### EL-SCR-004-02: Stats Panel Head
- **Location**: top of Stats Panel
- **Type**: header
- **Component**: div.home-stash-panel__head (reused class)
- **Visible when**: stats panel visible
- **Default state**: h2 title "Your stitching" + "Full dashboard" link

**Intended behaviour:**
- **Trigger**: panel renders
- **Immediate feedback**: title and link visible
- **State mutation**: none
- **Navigation**: link â†’ index.html?mode=stats&from=home
- **Side effects**: none
- **Success outcome**: user can navigate to full stats; title identifies section

**Keyboard**: link focusable
**Constraints**: link href must be index.html?mode=stats (legacy mode parameter; acts like a route)
**Relationships**: none

### EL-SCR-004-03: Stats Hero Section
- **Location**: below Stats Panel Head
- **Type**: display (hero number + subtitle)
- **Component**: div.home-stats-hero
- **Visible when**: stats panel visible
- **Default state**: lifetime stitch count OR "0" with onboarding message

**Intended behaviour if lifetimeStitches > 0:**
- **Trigger**: stats data loads
- **Immediate feedback**: large number displayed (fmtNum) + "lifetime stitches Â· â‰ˆ X km of thread"
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees their total stitching volume

**Intended behaviour if lifetimeStitches === 0:**
- **Trigger**: no stitching data yet
- **Immediate feedback**: "0" displayed + "Mark a stitch in the Tracker and your lifetime total will start counting here."
- **State mutation**: none
- **Navigation**: none (informational)
- **Side effects**: none
- **Success outcome**: user understands how to start tracking

**Keyboard**: none
**Constraints**: km calculation via threadKm() global helper from [helpers.js](../../helpers.js); format must be "â‰ˆ X km" (uses â‰ˆ character, which is acceptable as it is not emoji)
**Relationships**: lifetimeStitches and threadKm() from home-app stats state

### EL-SCR-004-04: Stats Grid (Sparkline + Oldest WIP)
- **Location**: below Stats Hero
- **Type**: grid (2 columns)
- **Component**: div.home-stats-grid
- **Visible when**: stats panel visible
- **Default state**: two cards side-by-side

**Intended behaviour:**
- **Trigger**: panel renders
- **Immediate feedback**: cards rendered
- **State mutation**: none
- **Navigation**: see child cards
- **Side effects**: none
- **Success outcome**: user sees recent activity and oldest project

**Keyboard**: none
**Constraints**: 2-column layout; should stack on mobile
**Relationships**: contains card child elements

### EL-SCR-004-05: Sparkline Card (Last 30 Days)
- **Location**: left column of Stats Grid
- **Type**: card (article)
- **Component**: article.home-stats-card
- **Visible when**: stats grid visible
- **Default state**: title "Last 30 days" + sparkline SVG OR empty message

**Intended behaviour if data exists (spark.total > 0):**
- **Trigger**: dailyLog has entries
- **Immediate feedback**: SVG sparkline rendered + footer "N stitches Â· M active days"
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees last-30-days trend at a glance

**Intended behaviour if no data:**
- **Trigger**: spark.total === 0 (no stitches in last 30 days)
- **Immediate feedback**: "No stitches logged in the last 30 days." message
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user knows why card is empty

**Keyboard**: none
**Constraints**: sparkline built via buildSpark(dailyLog, 30) helper (returns SVG points string). SVG has aria-label for AT.
**Relationships**: dailyLog from stats state; buildSpark() helper in home-app.js

### EL-SCR-004-06: Sparkline SVG
- **Location**: inside Sparkline Card
- **Type**: display (data visualization)
- **Component**: svg.home-spark (inline in card)
- **Visible when**: spark.total > 0
- **Default state**: polyline with stroke

**Intended behaviour:**
- **Trigger**: sparkline data available
- **Immediate feedback**: chart rendered (polyline from buildSpark points)
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees visual trend over 30 days

**Keyboard**: none (decoration with aria-label for AT)
**Constraints**: viewBox="0 0 120 32"; preserveAspectRatio="none" (fill width). Polyline stroke must be currentColor (inherits from text colour). aria-label must describe the data ("N stitches in the last 30 days").
**Relationships**: points string from buildSpark()

### EL-SCR-004-07: Sparkline Card Footer
- **Location**: bottom of Sparkline Card
- **Type**: display (summary)
- **Component**: p.home-stats-card__foot
- **Visible when**: spark.total > 0
- **Default state**: "N stitches Â· M active days"

**Intended behaviour:**
- **Trigger**: card renders with data
- **Immediate feedback**: summary displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees key stats

**Keyboard**: none
**Constraints**: N must be bold (strong tag) and localized (fmtNum); M is a number; "active days" must be singular if M === 1
**Relationships**: spark.total and spark.activeDays from buildSpark result

### EL-SCR-004-08: Oldest WIP Card (Link)
- **Location**: right column of Stats Grid
- **Type**: card (button-styled, clickable)
- **Component**: button.home-stats-card.home-stats-card--link (if oldestWip exists)
- **Visible when**: oldestWip !== null (project exists)
- **Default state**: title "Oldest WIP" + project name + "Last touched X Â· Y% done"

**Intended behaviour:**
- **Trigger**: oldestWip data loads
- **Immediate feedback**: card rendered with project name and progress
- **State mutation**: none
- **Navigation**: click â†’ activateAndGo(oldestWip.id, 'stitch.html') (sets active and navigates to tracker)
- **Side effects**: ProjectStorage.setActiveProject() called; full page load to stitch.html
- **Success outcome**: user can jump directly to oldest project with one click

**Keyboard**: button focusable; Enter/Space activates
**Constraints**: project name must not be truncated (full name shown). "Last touched" should use daysAgo() helper for relative time. Progress % shown at end.
**Relationships**: oldestWip from stats state; activateAndGo() helper

### EL-SCR-004-09: Oldest WIP Empty State
- **Location**: right column of Stats Grid (if oldestWip is null)
- **Type**: card (article, static)
- **Component**: article.home-stats-card
- **Visible when**: oldestWip === null (no active projects)
- **Default state**: title "Oldest WIP" + message "No active works in progress."

**Intended behaviour:**
- **Trigger**: no active/queued projects exist
- **Immediate feedback**: empty message displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user understands they have no WIP projects

**Keyboard**: none
**Constraints**: must be a static article (not button) when empty
**Relationships**: oldestWip computed from stats

---

## Screen: SCR-052 â€” MultiProjectDashboard (recent projects)

A reusable component showing categorised projects (active/queued/paused/completed/design) with rich cards, bulk actions, and state management. Used on both home.html (via HomeApp display) and manager.html (via MultiProjectDashboard direct consumption).

### EL-SCR-052-01: MultiProjectDashboard Container
- **Location**: main dashboard area (home.html Projects tab or manager.html primary view)
- **Type**: container
- **Component**: `MultiProjectDashboard` (in [home-screen.js](../../home-screen.js):465â€“1088)
- **Visible when**: projects list is loaded (not empty)
- **Default state**: bulk bar hidden; projects categorised and rendered

**Intended behaviour:**
- **Trigger**: component mounts; ProjectStorage.listProjects() populates projects array
- **Immediate feedback**: dashboard renders with all sections
- **State mutation**: state includes: categorised projects, selection set, menu open/close, edit modal, delete confirmation
- **Navigation**: see child buttons
- **Side effects**: PayloadCache ref created for PartialStitchThumb lazy loading; listens for Escape to exit selection mode
- **Success outcome**: user sees their projects organized by state

**Keyboard**: Escape exits selection mode and clears selection
**Constraints**: selection mode must not activate on initial render. Payload cache must be shared across all rendered cards (perf).
**Relationships**: projects array fed by parent (home-app or manager); uses ProjectStorage APIs for state changes

### EL-SCR-052-02: Bulk Action Bar
- **Location**: sticky at top of dashboard (below summary bar, if selectionMode active)
- **Type**: toolbar (role=toolbar)
- **Component**: div.mpd-bulk-bar (conditional render)
- **Visible when**: selectionMode === true
- **Default state**: left: count + Select All / Cancel buttons; right: Archive / Delete / Export buttons

**Intended behaviour:**
- **Trigger**: user enters selection mode (long-press or Cmd+click on card)
- **Immediate feedback**: bulk bar appears with selected count
- **State mutation**: selectionMode === true; selected Set contains IDs
- **Navigation**: bulk actions may trigger subsequent flows
- **Side effects**: Escape listener added to exit selection mode; document click listener to dismiss state menus
- **Success outcome**: user can perform bulk operations on multiple projects

**Keyboard**: Tab navigates through buttons; Space/Enter activates
**Constraints**: bulk bar must be sticky/persistent. Buttons disabled if selected.size === 0. "Select all" must exclude managerOnly projects. Archive sets state to 'paused'; Delete opens confirmation modal.
**Relationships**: selectionMode and selected state at dashboard level; Archive/Delete/Export callbacks

### EL-SCR-052-03: Bulk Bar Left â€” Count and Controls
- **Location**: left side of bulk bar
- **Type**: group
- **Component**: div.mpd-bulk-bar-left
- **Visible when**: bulk bar visible
- **Default state**: count text + two buttons

**Intended behaviour:**
- **Trigger**: bulk bar visible
- **Immediate feedback**: count updated reactively; Select All and Cancel buttons available
- **State mutation**: none (display of current state)
- **Navigation**: buttons trigger state changes (selectAll, clearSelection)
- **Side effects**: none
- **Success outcome**: user can manage selection

**Keyboard**: buttons focusable
**Constraints**: count text must show "N selected" (where N = selected.size)
**Relationships**: selected Set state

### EL-SCR-052-04: Bulk Bar Select All Button
- **Location**: left side of bulk bar
- **Type**: button
- **Component**: button.mpd-btn.mpd-btn--ghost (inline in bulk bar left)
- **Visible when**: bulk bar visible
- **Default state**: enabled, text "Select all"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: all non-managerOnly projects selected; count updates
- **State mutation**: setSelected(new Set(projects.filter(p => !p.managerOnly).map(p => p.id)))
- **Navigation**: none
- **Side effects**: bulk actions become available (Archive/Delete enabled)
- **Success outcome**: all eligible projects selected at once

**Keyboard**: focusable; Space/Enter activates
**Constraints**: must exclude managerOnly projects (entries in Manager pattern library not linked to Creator/Tracker)
**Relationships**: selectAll() handler in dashboard

### EL-SCR-052-05: Bulk Bar Cancel Selection Button
- **Location**: left side of bulk bar (after Select All)
- **Type**: button
- **Component**: button.mpd-btn.mpd-btn--ghost (inline in bulk bar left)
- **Visible when**: bulk bar visible
- **Default state**: enabled, text "Cancel selection"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: selection cleared; bulk bar disappears; dashboard returns to normal view
- **State mutation**: setSelected(new Set()); setSelectionMode(false)
- **Navigation**: none
- **Side effects**: focus may shift back to first project card
- **Success outcome**: selection mode exited; bulk bar hidden

**Keyboard**: focusable; Space/Enter activates; Escape also exits
**Constraints**: aria-label must say "Cancel selection mode"
**Relationships**: clearSelection() handler; Escape key also triggers this

### EL-SCR-052-06: Bulk Bar Right â€” Action Buttons
- **Location**: right side of bulk bar
- **Type**: group
- **Component**: div.mpd-bulk-bar-right
- **Visible when**: bulk bar visible
- **Default state**: three buttons (Archive, Delete, Export)

**Intended behaviour:**
- **Trigger**: bulk bar visible
- **Immediate feedback**: buttons visible; disabled if no projects selected
- **State mutation**: clicking Archive/Delete/Export triggers different flows
- **Navigation**: none directly (see individual buttons)
- **Side effects**: none
- **Success outcome**: user can perform bulk operations

**Keyboard**: Tab navigates
**Constraints**: all buttons disabled if selected.size === 0; Delete uses different styling (mpd-bulk-delete class)
**Relationships**: contains three action buttons

### EL-SCR-052-07: Bulk Bar Archive Button
- **Location**: right side of bulk bar (Archive icon + label)
- **Type**: button
- **Component**: button.mpd-btn.mpd-btn--ghost (with Icons.archive)
- **Visible when**: bulk bar visible
- **Default state**: disabled if selected.size === 0, otherwise enabled

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: toast shown; bulk bar remains visible (unless user dismisses it)
- **State mutation**: handleBulkArchive() sets all selected projects to state='paused'; UI updates; toast shown
- **Navigation**: none
- **Side effects**: ProjectStorage.setStateMany() called (batch update); cs:projectsChanged event fired; selected Set and selectionMode cleared
- **Success outcome**: projects moved to Paused section

**Keyboard**: focusable; Space/Enter activates
**Constraints**: must include Icons.archive() for icon. Text must say "Archive" (no emoji). Toast shows "N project(s) archived".
**Relationships**: handleBulkArchive() handler; ProjectStorage.setStateMany() API

### EL-SCR-052-08: Bulk Bar Delete Button
- **Location**: right side of bulk bar (Trash icon + label)
- **Type**: button
- **Component**: button.mpd-btn.mpd-btn--ghost.mpd-bulk-delete
- **Visible when**: bulk bar visible
- **Default state**: disabled if selected.size === 0, otherwise enabled

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: BulkDeleteModal opens (styled confirmation, replaces window.confirm)
- **State mutation**: setConfirmDelete(true)
- **Navigation**: none (modal opens)
- **Side effects**: focus moves to modal Cancel button
- **Success outcome**: user sees confirmation before deleting

**Keyboard**: focusable; Space/Enter activates
**Constraints**: must include Icons.trash() for icon. Text must say "Delete" (no emoji). BulkDeleteModal shows up to **5** project names verbatim. If more than 5 are selected, the remaining count is rendered as `+N more` text. **5 is a hard limit** â€” do not raise without an accompanying scrollable-list redesign. Per Phase 3 resolution, **all destructive deletes (single or multi) MUST route through BulkDeleteModal** so users see a uniform confirmation surface (Option A, see VER-CONF-005).
**Relationships**: handleBulkDelete() handler; BulkDeleteModal component (also invoked by single-card delete via SCR-053 card menu)

### EL-SCR-052-09: Bulk Bar Export Button
- **Location**: right side of bulk bar
- **Type**: button
- **Component**: button.mpd-btn.mpd-btn--ghost
- **Visible when**: bulk bar visible
- **Default state**: disabled if selected.size === 0, otherwise enabled

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: toast shown "Bulk export coming in B4"
- **State mutation**: none (placeholder)
- **Navigation**: none
- **Side effects**: toast displayed
- **Success outcome**: user knows feature is planned

**Keyboard**: focusable; Space/Enter activates
**Constraints**: currently a placeholder; no actual export happens. Text must say "Export".
**Relationships**: handleBulkExport() handler (stub); showToast() utility

### EL-SCR-052-10: Selection Cancel Bar
- **Location**: sticky below bulk bar (while selectionMode active)
- **Type**: status bar (role=status, aria-live=polite)
- **Component**: div.mpd-selection-cancel-bar (conditional render)
- **Visible when**: selectionMode === true
- **Default state**: text "Selection mode active â€” N selected" + Cancel button

**Intended behaviour:**
- **Trigger**: selectionMode becomes true
- **Immediate feedback**: bar appears; shows current count
- **State mutation**: none (display of state)
- **Navigation**: Cancel button triggers clearSelection()
- **Side effects**: provides persistent affordance to exit selection without scrolling (fix-3.7)
- **Success outcome**: user always has visible way to cancel selection mode

**Keyboard**: Cancel button focusable; Space/Enter activates
**Constraints**: must have role="status" and aria-live="polite" for AT to announce. Text must update reactively.
**Relationships**: selectionMode and selected Set state

### EL-SCR-052-11: Continue Bar
- **Location**: below bulk/selection bars (if not in selectionMode)
- **Type**: sticky bar (accent background)
- **Component**: div.mpd-continue-bar (conditional render)
- **Visible when**: !selectionMode && continueProj !== null
- **Default state**: project thumbnail + name + progress % + "Continue â†’" button

**Intended behaviour:**
- **Trigger**: continueProj computed (most recent active/queued/design project without managerOnly flag)
- **Immediate feedback**: bar appears with project data and quick-continue CTA
- **State mutation**: none (display of state)
- **Navigation**: Continue button â†’ handleOpenProject(continueProj, 'tracker')
- **Side effects**: focus may shift if user clicks Continue
- **Success outcome**: user can resume most recent project with one click (sticky affordance)

**Keyboard**: Continue button focusable; Space/Enter activates
**Constraints**: thumbnail shown on left (32Ã—32 px); name not truncated if possible; progress % shown; button text "Continue â†’" (arrow is unicode, acceptable per AGENTS.md keyboard legend exception, but verify this is keyboard legend contextâ€”actually it's in a button label, so should use Icons.pointing or just say "Continue". Let me check the source: [home-screen.js](../../home-screen.js):1003 shows 'Continue \u2192' which is a right arrow Unicode character. For button labels (not keyboard legends), this might be flagged as P3 by the emoji rule. I'll note this constraint.)
**Relationships**: continueProj computed from categorised.active, categorised.queued, categorised.design; handleOpenProject() callback

### EL-SCR-052-12: Summary Bar
- **Location**: below Continue bar (or top if no Continue bar)
- **Type**: display
- **Component**: div.mpd-summary-bar
- **Visible when**: dashboard visible
- **Default state**: text with project count, monthly stitches, streak

**Intended behaviour:**
- **Trigger**: always rendered
- **Immediate feedback**: summary stats displayed
- **State mutation**: none (display of computed state)
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees dashboard-level stats at a glance

**Keyboard**: none
**Constraints**: format: "N active project(s) Â· M stitches this month Â· [streak icon] S-day streak" (streak only shown if > 1). Stitches must be toLocaleString(). Streak icon must use Icons.fire().
**Relationships**: summary computed from projects and streak data

### EL-SCR-052-13: Suggestion Card
- **Location**: below Summary bar
- **Type**: card (suggest next project to stitch)
- **Component**: div.mpd-suggestion (conditional render)
- **Visible when**: suggestion !== null && (!continueProj || suggestion.proj.id !== continueProj.id)
- **Default state**: title with lightbulb icon + project name + reason + button

**Intended behaviour:**
- **Trigger**: suggestion computed by getSuggestion() algorithm (scores active projects by recency + completion + stash readiness)
- **Immediate feedback**: card appears with project name and reason
- **State mutation**: none (display)
- **Navigation**: "Start now" button â†’ handleOpenProject(suggestion.proj, 'tracker')
- **Side effects**: none
- **Success outcome**: user gets personalized suggestion based on idle time, progress, stash readiness

**Keyboard**: "Start now" button focusable
**Constraints**: must include Icons.lightbulb() in title. Reason text generated by getSuggestion(): "You haven't stitched this in N days", "You're X% done â€” so close!", or "Keep momentum going â€” you're X% done." Suppressed if suggestion duplicates continueProj.
**Relationships**: suggestion computed from active projects; getSuggestion() algorithm in [home-screen.js](../../home-screen.js):109â€“150

### EL-SCR-052-14: Active Projects Section
- **Location**: below Suggestion card
- **Type**: section (main project list)
- **Component**: div.mpd-cards (conditional render if active.length > 0, else empty message)
- **Visible when**: always rendered
- **Default state**: grid of ProjectCard components or "No active projects" message

**Intended behaviour if cards exist:**
- **Trigger**: active projects array populated
- **Immediate feedback**: cards rendered in grid (likely 1 column on mobile, multi-column on desktop)
- **State mutation**: each card can trigger state changes (open menu, select, etc.)
- **Navigation**: see individual cards
- **Side effects**: none
- **Success outcome**: user sees all active (in-progress) projects

**Intended behaviour if no active projects:**
- **Trigger**: active.length === 0
- **Immediate feedback**: message "No active projects â€” move one from the queue or start something new."
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user understands queue is empty

**Keyboard**: none at section level
**Constraints**: cards must be deletable (delete state, not actual removal, unless confirmed). Each card renders State Change Menu on button click.
**Relationships**: projects categorised by state; active array from categorised.active

### EL-SCR-052-15: Up Next Section
- **Location**: below Active Projects
- **Type**: section (queued projects)
- **Component**: div.mpd-section
- **Visible when**: always rendered
- **Default state**: header + list of CompactProjectRow components or empty message

**Intended behaviour:**
- **Trigger**: always rendered
- **Immediate feedback**: section header "Up next" with count badge
- **State mutation**: expanding/collapsing not applicable (always expanded, no collapse button)
- **Navigation**: see individual rows
- **Side effects**: none
- **Success outcome**: user sees queued projects (next to stitch)

**Keyboard**: none
**Constraints**: section header includes count badge; "+ Add" button to add new project to queue. Rows are CompactProjectRow (simpler than full ProjectCard).
**Relationships**: categorised.queued array; header has onAddNew callback

### EL-SCR-052-16: Up Next Section Header
- **Location**: top of Up Next section
- **Type**: header
- **Component**: div.mpd-section-header
- **Visible when**: section visible
- **Default state**: "Up next" label + count badge + "+ Add" button

**Intended behaviour:**
- **Trigger**: section renders
- **Immediate feedback**: header displayed
- **State mutation**: clicking "+ Add" calls onAddNew callback
- **Navigation**: onAddNew typically triggers "create new project" flow in parent (home-app or manager-app)
- **Side effects**: none
- **Success outcome**: user can add a new project to the queue

**Keyboard**: "+ Add" button focusable
**Constraints**: count badge must show actual queued project count. "+ Add" button is secondary (ghost style).
**Relationships**: onAddNew callback from parent; count from categorised.queued.length

### EL-SCR-052-17: Paused Section
- **Location**: below Up Next section
- **Type**: collapsible section
- **Component**: div.mpd-section (conditional render if paused.length > 0)
- **Visible when**: paused.length > 0
- **Default state**: collapsed (pausedOpen === false initially)

**Intended behaviour when collapsed:**
- **Trigger**: section header clicked or pausedOpen === false
- **Immediate feedback**: arrow icon rotated (right triangle); rows hidden
- **State mutation**: none (display only; pausedOpen state controls expand/collapse)
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: paused projects hidden to reduce clutter

**Intended behaviour when expanded:**
- **Trigger**: user clicks section header; pausedOpen === true
- **Immediate feedback**: arrow rotated down (down triangle); rows visible
- **State mutation**: setPausedOpen(true)
- **Navigation**: see rows
- **Side effects**: none
- **Success outcome**: paused projects revealed

**Keyboard**: header button focusable; Space/Enter toggles expand/collapse
**Constraints**: aria-expanded must reflect pausedOpen state. Section count shown in header (e.g. "Paused (3 projects)").
**Relationships**: pausedOpen state; paused array from categorised.paused

### EL-SCR-052-18: Completed Section
- **Location**: below Paused section
- **Type**: collapsible section
- **Component**: div.mpd-section (conditional render if complete.length > 0)
- **Visible when**: complete.length > 0
- **Default state**: collapsed (completedOpen === false initially)

**Intended behaviour:**
- **Trigger**: similar to Paused section
- **Immediate feedback**: header shows "Completed (N projects)"; rows hidden/shown based on completedOpen
- **State mutation**: setCompletedOpen(true/false)
- **Navigation**: see individual rows
- **Side effects**: none
- **Success outcome**: completed projects archived out of sight

**Keyboard**: header button focusable; Space/Enter toggles
**Constraints**: same as Paused section
**Relationships**: completedOpen state; complete array from categorised.complete

### EL-SCR-052-19: My Designs Section
- **Location**: below Completed section
- **Type**: collapsible section
- **Component**: div.mpd-section (conditional render if design.length > 0)
- **Visible when**: design.length > 0
- **Default state**: collapsed (designOpen === false initially)

**Intended behaviour:**
- **Trigger**: similar to Paused/Completed sections
- **Immediate feedback**: "My designs (N)" header; rows hidden/shown based on designOpen
- **State mutation**: setDesignOpen(true/false)
- **Navigation**: see rows
- **Side effects**: none
- **Success outcome**: creator-only projects (no tracking data) organized separately

**Keyboard**: header button focusable; Space/Enter toggles
**Constraints**: same as Paused section
**Relationships**: designOpen state; design array from categorised.design

### EL-SCR-052-20: Stats Link
- **Location**: bottom of dashboard
- **Type**: link (button-styled)
- **Component**: button.mpd-stats-link (conditional render if onOpenGlobalStats callback exists)
- **Visible when**: onOpenGlobalStats !== undefined
- **Default state**: text "View detailed stats across all projects â†’" with barChart icon

**Intended behaviour:**
- **Trigger**: always rendered if callback exists
- **Immediate feedback**: link visible at bottom
- **State mutation**: none
- **Navigation**: click â†’ onOpenGlobalStats() callback (typically opens full stats page)
- **Side effects**: depends on callback
- **Success outcome**: user can navigate to full stats dashboard

**Keyboard**: focusable; Space/Enter activates
**Constraints**: must include Icons.barChart() icon. Text must include arrow glyph " â†’" (acceptable as keyboard legend exception per AGENTS.md, but verify contextâ€”this is a button label, not a legend, so should avoid emoji-like chars. Use Icons.pointing or plain text? Source shows '\u2192' which is a Unicode arrow. For a button label (not keyboard legend), I'll flag this as P3 for the spec.)
**Relationships**: onOpenGlobalStats callback from parent

---

## Screen: SCR-053 â€” HomeScreenProjectCard

An individual project card component (part of MultiProjectDashboard active projects grid or manager dashboard). Rich card with thumbnail, name, metadata, progress bar, stash status, and action buttons.

### EL-SCR-053-01: Project Card Container
- **Location**: grid item in MultiProjectDashboard.mpd-cards
- **Type**: article / card
- **Component**: `ProjectCard` (in [home-screen.js](../../home-screen.js):181â€“420)
- **Visible when**: per active project
- **Default state**: multi-part card with thumbnail + body + footer

**Intended behaviour:**
- **Trigger**: project rendered in active list
- **Immediate feedback**: card visible with all sections
- **State mutation**: clicking card or long-press may trigger selection; context menu available
- **Navigation**: action buttons navigate to tracker/creator
- **Side effects**: lazy-loading of full project payload for PartialStitchThumb
- **Success outcome**: user sees rich project card with clear action options

**Keyboard**: entire card focusable for selection (if in selection mode); action buttons within card focusable
**Constraints**: card layout must be responsive (flex with wrap). Long-press (500ms) triggers selection mode. Cmd+click toggles selection without entering selection mode.
**Relationships**: ProjectCard props include proj, onOpen, onChangeState, stashOk, selectionMode, selected, onToggleSelect, onLongPress, payloadCache. Touch event listeners for long-press gesture.

### EL-SCR-053-02: Project Card Selection Checkbox
- **Location**: top-left corner of card
- **Type**: button (checkbox-like)
- **Component**: button.mpd-card-select (conditional render or always rendered)
- **Visible when**: always rendered (visible on hover or in selection mode)
- **Default state**: unchecked (selected === false); aria-pressed="false"

**Intended behaviour for unchecked:**
- **Trigger**: card not selected
- **Immediate feedback**: checkbox visible but empty
- **State mutation**: clicking checkbox calls onToggleSelect(proj.id)
- **Navigation**: none
- **Side effects**: if this is the first selection, selectionMode is enabled
- **Success outcome**: project selected; selection mode activated if needed

**Intended behaviour for checked:**
- **Trigger**: card is selected (selected === true)
- **Immediate feedback**: checkbox shows checkmark icon (Icons.check)
- **State mutation**: clicking checkbox again calls onToggleSelect(proj.id) to deselect
- **Navigation**: none
- **Side effects**: if last selected item is deselected, selectionMode is exited
- **Success outcome**: project deselected

**Keyboard**: focusable; Space toggles selection
**Constraints**: aria-pressed reflects selected state. aria-label must say "Select project" or "Deselect project" based on state. Icon must use Icons.check() only when checked. Must always be visible on touch devices (otherwise 500ms long-press is the only affordance).
**Relationships**: onToggleSelect callback; selected state from parent; selectionMode state

### EL-SCR-053-03: Project Card Thumbnail
- **Location**: top of card (full width or left side depending on layout)
- **Type**: display + interactive (clickable to open tracker)
- **Component**: div.mpd-card-thumb
- **Visible when**: per card
- **Default state**: PartialStitchThumb component (if payload loaded) OR static thumbnail OR placeholder

**Intended behaviour for PartialStitchThumb (full project):**
- **Trigger**: projectPayload loaded (lazy from ProjectStorage.get(proj.id))
- **Immediate feedback**: chart preview rendered (96Ã—96 px, multi-colour grid)
- **State mutation**: none
- **Navigation**: clicking thumbnail â†’ onOpen(proj, 'tracker')
- **Side effects**: payload cached in payloadCache Map (shared across dashboard)
- **Success outcome**: user sees accurate chart preview

**Intended behaviour for static thumbnail:**
- **Trigger**: proj.thumbnail URL available
- **Immediate feedback**: thumbnail image rendered
- **State mutation**: none
- **Navigation**: clicking â†’ onOpen(proj, 'tracker')
- **Side effects**: none
- **Success outcome**: user sees project thumbnail

**Intended behaviour for placeholder:**
- **Trigger**: no payload, no thumbnail
- **Immediate feedback**: placeholder div shown (grey background)
- **State mutation**: none
- **Navigation**: clicking â†’ onOpen(proj, 'tracker')
- **Side effects**: payload fetch triggered in useEffect (once per component lifetime)
- **Success outcome**: placeholder shown until data available

**Keyboard**: div not focusable (parent card handles interaction); thumbnail click handled by onClick handler
**Constraints**: all three branches (PartialStitchThumb / static / placeholder) must be clickable. PERF: payload lazy-loaded only after mount to avoid n-way fan-out. payloadCache shared to avoid re-fetching on re-renders.
**Relationships**: PartialStitchThumb component from [components/PartialStitchThumb.js](../../components/PartialStitchThumb.js); payload state in card (memoized via useMemo and payloadCache). Payload fetching guarded by proj.managerOnly flag.

### EL-SCR-053-04: Project Card Body
- **Location**: main content area of card
- **Type**: section
- **Component**: div.mpd-card-body
- **Visible when**: always
- **Default state**: renders top row (name + %), metadata, bar, recency, etc.

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: all body content visible
- **State mutation**: clicking name may open metadata popover (future feature; not yet implemented in home-screen.js)
- **Navigation**: see sub-elements
- **Side effects**: none
- **Success outcome**: user sees project details inline

**Keyboard**: none at body level
**Constraints**: layout flexible; stacks vertically on narrow screens
**Relationships**: contains child display elements

### EL-SCR-053-05: Project Card Top Row (Name + Progress %)
- **Location**: top of card body
- **Type**: display + button (name is clickable for metadata in future)
- **Component**: div.mpd-card-top
- **Visible when**: always
- **Default state**: project name (left) + progress % (right)

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: name and % visible side-by-side
- **State mutation**: none (display)
- **Navigation**: none (future: clicking name opens metadata popover)
- **Side effects**: none
- **Success outcome**: at-a-glance progress and name

**Keyboard**: none (display only)
**Constraints**: name must not wrap; use ellipsis if needed. % must be right-aligned. If pct >= 100, add mpd-card-pct--done class for visual distinction.
**Relationships**: name from proj.name; pct computed from project metadata

### EL-SCR-053-06: Project Card Name
- **Location**: left side of top row
- **Type**: display (future: clickable button for metadata popover)
- **Component**: div.mpd-card-name (currently div, future: button)
- **Visible when**: always
- **Default state**: project name or "Untitled"

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: name displayed
- **State mutation**: none (currently read-only; future: opens metadata popover)
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees project title

**Keyboard**: not currently focusable (future: will be button)
**Constraints**: must not overflow; use text-overflow: ellipsis. Max 1 line. Must fall back to "Untitled" if proj.name is empty.
**Relationships**: proj.name

### EL-SCR-053-07: Project Card Progress Percentage
- **Location**: right side of top row
- **Type**: display (percentage indicator)
- **Component**: div.mpd-card-pct
- **Visible when**: always
- **Default state**: "N%" (where N = 0â€“100)

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: percentage displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees completion at a glance

**Keyboard**: none
**Constraints**: if pct >= 100, add mpd-card-pct--done class (visual distinction for completed projects). Format as "N%" (e.g. "45%").
**Relationships**: pct computed from project.completedStitches / project.totalStitches

### EL-SCR-053-08: Manager-Only Badge
- **Location**: below name row (if proj.managerOnly === true)
- **Type**: display (badge)
- **Component**: div.mpd-card-badge.mpd-card-badge--manager-only
- **Visible when**: proj.managerOnly === true
- **Default state**: text "Stash Manager only"

**Intended behaviour:**
- **Trigger**: card rendered for manager-only entry
- **Immediate feedback**: badge displayed with explanation tooltip
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user understands this entry is library-only (no Creator/Tracker project)

**Keyboard**: none
**Constraints**: title attribute should explain "This entry was added directly in the Stash Manager and has no Creator/Tracker project linked." Styling must be distinct (warning colours recommended).
**Relationships**: proj.managerOnly flag

### EL-SCR-053-09: Adapted Badge
- **Location**: below Manager-Only Badge (if proj.adaptation exists)
- **Type**: display + interactive (badge with optional link)
- **Component**: window.AdaptedBadge component (conditional render)
- **Visible when**: proj.adaptation && proj.adaptation.fromName
- **Default state**: "Adapted from ORIGINAL_NAME" (possibly clickable if fromProjectId available)

**Intended behaviour:**
- **Trigger**: adapted pattern card rendered
- **Immediate feedback**: badge displayed with source project name
- **State mutation**: if onClick available, clicking navigates to source project
- **Navigation**: clicking â†’ onOpen(source_proj) if available
- **Side effects**: focus shifts to source project card
- **Success outcome**: user can see and jump to source project

**Keyboard**: if clickable, focusable; Space/Enter activates
**Constraints**: compact: true prop passed to AdaptedBadge. Badge must not overflow card. onClick only available if fromProjectId exists.
**Relationships**: proj.adaptation from project metadata; AdaptedBadge component (shared UI)

### EL-SCR-053-10: Card Extras (Optional Customization)
- **Location**: below badges (if cardExtras prop provided)
- **Type**: display (custom per context)
- **Component**: div.mpd-card-extras (conditional render if cardExtras function exists)
- **Visible when**: cardExtras prop !== undefined
- **Default state**: custom content from cardExtras(proj) function

**Intended behaviour:**
- **Trigger**: parent passes cardExtras function
- **Immediate feedback**: custom UI rendered (e.g. shopping list checkbox + missing-thread badge on Manager dashboard)
- **State mutation**: depends on extras
- **Navigation**: none (display only)
- **Side effects**: depends on extras
- **Success outcome**: context-specific project metadata shown

**Keyboard**: depends on extras
**Constraints**: cardExtras is a render function; must return React element
**Relationships**: cardExtras prop from parent MultiProjectDashboard (supplied by parent container like manager-app)

### EL-SCR-053-11: Progress Bar
- **Location**: below metadata rows
- **Type**: display (progress indicator)
- **Component**: div.mpd-card-progress-track with div.mpd-card-progress-fill
- **Visible when**: always
- **Default state**: width = pct%; role=progressbar

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: filled portion of bar shows % complete
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: visual progress indicator

**Keyboard**: none (display)
**Constraints**: role="progressbar"; aria-valuenow, aria-valuemin (0), aria-valuemax (100) must be set. Fill width must not exceed 100%.
**Relationships**: pct from project metadata

### EL-SCR-053-12: Metadata Row (Dimensions / Fabric / Threads / Difficulty)
- **Location**: below progress bar
- **Type**: display (comma-separated inline metadata)
- **Component**: div.mpd-card-meta
- **Visible when**: any metadata exists (dim || fabricCt || threadCount > 0)
- **Default state**: "WxH Â· Nct Â· M colours Â· Difficulty"

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: metadata displayed inline
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees key specs at a glance

**Keyboard**: none
**Constraints**: separator must be 'Â·' (centered dot); only include non-null parts. Difficulty shown with colour-coded label (e.g. "Easy" in green, "Hard" in red). Difficulty has title attr with score.
**Relationships**: dim, fabricCt, threadCount, diff computed from project metadata; calcDifficulty() helper used for scoring

### EL-SCR-053-13: Recency Row
- **Location**: below metadata
- **Type**: display (last-stitched timestamp)
- **Component**: div.mpd-card-recency
- **Visible when**: always
- **Default state**: "Last stitched X days ago" or "Last stitched today" or "Not started"

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: recency text displayed; warning styling if neglected (13+ days)
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees how long since last stitch

**Keyboard**: none
**Constraints**: must add mpd-card-recency--warn class if days >= 13 (visual cue for neglected projects). Format: "Last stitched today" | "Last stitched yesterday" | "Last stitched N days ago" | "Not started".
**Relationships**: days computed from daysBetween(proj.lastSessionDate || proj.updatedAt)

### EL-SCR-053-14: Session Summary Row
- **Location**: below recency (if weekSt > 0)
- **Type**: display (weekly stitch count)
- **Component**: div.mpd-card-session
- **Visible when**: weekSt > 0
- **Default state**: "This week: N stitches"

**Intended behaviour:**
- **Trigger**: project has stitches this week
- **Immediate feedback**: weekly count displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees recent activity

**Keyboard**: none
**Constraints**: N must be toLocaleString(). Only show row if weekSt > 0.
**Relationships**: weekSt from project metadata

### EL-SCR-053-15: Time Estimate Row
- **Location**: below session summary (if remHours > 0)
- **Type**: display (projected completion time)
- **Component**: div.mpd-card-estimate
- **Visible when**: remHours > 0
- **Default state**: "Est. remaining: X" (e.g. "Est. 2 weeks" or "Est. Nov 2026")

**Intended behaviour:**
- **Trigger**: project has tracking velocity and remaining stitches
- **Immediate feedback**: estimate displayed
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees projected completion

**Keyboard**: none
**Constraints**: format via fmtHours() helper. Only show if velocity available.
**Relationships**: remHours computed from estimateRemainingHours(proj)

### EL-SCR-053-16: Card Footer
- **Location**: bottom of card
- **Type**: row (stash status + action buttons)
- **Component**: div.mpd-card-footer
- **Visible when**: always
- **Default state**: left: stash status pill; right: Continue button + menu button

**Intended behaviour:**
- **Trigger**: card renders
- **Immediate feedback**: footer visible with stash status and buttons
- **State mutation**: clicking buttons triggers actions
- **Navigation**: see action buttons
- **Side effects**: none
- **Success outcome**: user has clear action options

**Keyboard**: buttons focusable
**Constraints**: footer layout flexible; stash status left, actions right
**Relationships**: contains stash status display and action buttons

### EL-SCR-053-17: Stash Status Pill
- **Location**: bottom-left of card footer
- **Type**: display (icon + label)
- **Component**: div.mpd-card-stash
- **Visible when**: always
- **Default state**: icon (check/warning/info) + text ("Ready" | "Need threads" | "Stash not checked")

**Intended behaviour:**
- **Trigger**: card renders; stashOk state set by parent
- **Immediate feedback**: status displayed with colour-coded icon
- **State mutation**: none
- **Navigation**: none
- **Side effects**: none
- **Success outcome**: user sees at a glance if they have threads for this project

**Keyboard**: none
**Constraints**: icon must use Icons.check (green) if stashOk === true, Icons.warning (accent) if stashOk === false, Icons.info (neutral) if stashOk === null. Colour set via inline style (var(--success) / var(--accent-ink) / #a1a1aa). Title attribute holds full stash message.
**Relationships**: stashOk prop from parent; stashMsg prop from parent; stashColor computed based on stashOk

### EL-SCR-053-18: Card Action Buttons
- **Location**: bottom-right of card footer
- **Type**: button group
- **Component**: div.mpd-card-actions
- **Visible when**: always
- **Default state**: Continue button + menu button

**Intended behaviour:**
- **Trigger**: card rendered
- **Immediate feedback**: two buttons visible
- **State mutation**: clicking Continue opens tracker; clicking menu opens State Change Menu
- **Navigation**: Continue â†’ tracker with project loaded
- **Side effects**: menu click triggers onChangeState callback
- **Success outcome**: user has quick access to tracker or state management

**Keyboard**: buttons focusable; Space/Enter activates
**Constraints**: Continue is primary (blue); menu is ghost (text-only). Menu button shows "â€¦" (ellipsis, Unicode character; acceptable for non-UI text per AGENTS.md guidance).
**Relationships**: Continue calls onOpen(proj, 'tracker'); menu button calls onChangeState(proj)

### EL-SCR-053-19: Continue Button
- **Location**: bottom-right of card (primary button)
- **Type**: button
- **Component**: button.mpd-btn.mpd-btn--primary
- **Visible when**: always
- **Default state**: enabled, text "Continue"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: page navigates
- **State mutation**: ProjectStorage.setActiveProject() called
- **Navigation**: window.location.href = 'stitch.html?from=home'
- **Side effects**: project becomes active; full page load to tracker
- **Success outcome**: user lands on Stitch Tracker with project loaded

**Keyboard**: focusable; Space/Enter activates
**Constraints**: must always be available (primary CTA)
**Relationships**: onClick â†’ onOpen(proj, 'tracker') callback

### EL-SCR-053-20: Card Menu Button
- **Location**: bottom-right of card (after Continue)
- **Type**: button (ellipsis, toggles State Change Menu)
- **Component**: button.mpd-btn.mpd-btn--ghost.mpd-card-menu-btn
- **Visible when**: always
- **Default state**: enabled, text "â€¦"

**Intended behaviour:**
- **Trigger**: user clicks button
- **Immediate feedback**: State Change Menu appears below button
- **State mutation**: onChangeState(proj) called; menu becomes visible
- **Navigation**: none (menu opens)
- **Side effects**: menu has focus trap; Escape closes
- **Success outcome**: user can change project state without opening manager

**Keyboard**: focusable; Space/Enter opens menu; Escape closes menu
**Constraints**: must open StateChangeMenu popover. Title should say "Change project state".
**Relationships**: onClick â†’ onChangeState(proj) callback; StateChangeMenu popover component

---

## Screen: SCR-061 â€” Home-screen MultiProjectDashboard

This is the same `MultiProjectDashboard` component rendered on `manager.html` (and historically on home.html before Phase 7 refactoring). It's a fully-featured project dashboard with project state categorization, bulk selection, and state management. The screen contains the same visual and interactive elements as SCR-052, but rendered in a different page context (manager.html vs home.html).

**Behaviour:** All elements and interactions are identical to SCR-052. Refer to EL-SCR-052-01 through EL-SCR-052-20 for complete specification.

**Context differences:**
- Parent component: `HomeScreen` in [home-screen.js](../../home-screen.js) (mounted on manager.html)
- Props passed to MultiProjectDashboard include `cardExtras` callback (provided by manager for shopping list checkbox + missing-thread badge)
- EditProjectDetailsModal may be available (manager-app-specific feature)
- Callbacks (onOpenProject, onAddNew, onOpenGlobalStats) wired to manager-specific handlers

**No additional element specifications required** â€” use SCR-052 elements as the source of truth.

---

## DISCOVERED.md appendix

None. All screens found in the Interface Map were encountered and fully documented.

---

## VERIFICATION TODO

- [ ] `VER-EL-SCR-001-01-01` [P0] â€” Header Help button aria-expanded state must stay in sync with HelpDrawer visibility; test via cs:helpStateChange event listener
- [ ] `VER-EL-SCR-001-02-01` [P1] â€” Home Tab Bar must reflect correct active tab state on load; verify ?tab= URL parameter is respected
- [ ] `VER-EL-SCR-001-02-02` [P2] â€” Stash and Stats tab data must only load when tab is opened (performance regression if loaded eagerly)
- [ ] `VER-EL-SCR-001-05-01` [P0] â€” Active Project Card must show OR empty state correctly; no undefined renders if activeProject is null
- [ ] `VER-EL-SCR-001-05-02` [P1] â€” Active Project Card "Resume tracking" and "Edit pattern" buttons must correctly call activateAndGo() and not lose the project ID in navigation
- [ ] `VER-EL-SCR-001-10-01` [P1] â€” Projects List must exclude active project and respect homeShowCompleted preference; test filtering logic
- [ ] `VER-EL-SCR-001-14-01` [P2] â€” Project Row Name Button popover must close on Escape key and when clicking outside
- [ ] `VER-EL-SCR-001-15-01` [P1] â€” Metadata Popover dimensions/fabric/colours must be accurate (not computed incorrectly); validate against full project payload
- [ ] `VER-EL-SCR-001-31-01` [P2] â€” homeShowCompleted preference change must be reactive (projects list re-filters without reload)
- [ ] `VER-EL-SCR-002-03-01` [P3] â€” File input must accept all pattern file extensions (.oxs, .xml, .json, .pdf); verify MIME type filtering
- [ ] `VER-EL-SCR-002-04-01` [P1] â€” New from Image file handoff must serialize to sessionStorage correctly; verify creator-main.js can reconstruct file without second picker
- [ ] `VER-EL-SCR-002-04-02` [P3] â€” sessionStorage quota exceeded error must display user-friendly message (not raw error)
- [ ] `VER-EL-SCR-002-06-01` [P2] â€” Embroidery planner tile visibility must be gated by experimental.embroideryTool pref; verify toggle in Preferences shows/hides tile on reload
- [ ] `VER-EL-SCR-003-01-01` [P2] â€” Stash panel data must load lazily only when Stash tab opened; perf regression if loaded on mount
- [ ] `VER-EL-SCR-003-10-01` [P1] â€” Shopping list threads must be correct (not stale from old StashBridge call); test after modifying stash in manager
- [ ] `VER-EL-SCR-003-14-01` [P1] â€” Ready to Start patterns must only show if stash covers ALL required colours (pct === 100), not partial coverage
- [ ] `VER-EL-SCR-004-03-01` [P1] â€” Stats Hero lifetime stitches must be accurate; validate against full project session summaries
- [ ] `VER-EL-SCR-004-04-01` [P2] â€” Stats panel must load lazily when Stats tab opened; no eager aggregate scan on home load
- [ ] `VER-EL-SCR-004-05-01` [P1] â€” Sparkline must render correctly (polyline points valid SVG); test edge cases (0 stitches, 1 stitch, all on one day)
- [ ] `VER-EL-SCR-004-08-01` [P1] â€” Oldest WIP project must be the earliest-created or least-recently-touched active project, correctly identified
- [ ] `VER-EL-SCR-052-02-01` [P1] â€” Bulk action bar must not show in initial render; only appear when first project selected
- [ ] `VER-EL-SCR-052-04-01` [P1] â€” Select All must exclude managerOnly projects; test on mixed dashboard (creator + library entries)
- [ ] `VER-EL-SCR-052-05-01` [P0] â€” Escape key must exit selection mode and clear selection set; test on keyboard
- [ ] `VER-EL-SCR-052-07-01` [P2] â€” Archive bulk action must batch-update all selected projects to state='paused'; verify ProjectStorage.setStateMany() used (not individual puts)
- [ ] `VER-EL-SCR-052-09-01` [P2] â€” BulkDeleteModal must show up to 5 project names verbatim then `+N more`; 5 is a hard limit. Test with 3, 5, 10 selected projects.
- [ ] `VER-EL-SCR-052-08-02` [P1] â€” Single-project delete from card menu (SCR-053) opens BulkDeleteModal with that one project preselected (Option A from VER-CONF-005); window.confirm() must NOT be used anywhere.
- [ ] `VER-EL-SCR-052-11-01` [P2] â€” Continue Bar must show most recent active/queued/design project (not managerOnly); verify computation of continueProj
- [ ] `VER-EL-SCR-052-11-02` [P3] â€” Continue Bar sticky positioning must not overlap bulk action bar when selection mode active; test layout on tablet
- [ ] `VER-EL-SCR-052-13-01` [P1] â€” Suggestion algorithm must score projects correctly (recency + completion % + stash readiness); test weighting
- [ ] `VER-EL-SCR-052-13-02` [P2] â€” Suggestion card must be suppressed if it duplicates continueProj (same project ID)
- [ ] `VER-EL-SCR-053-01-01` [P2] â€” ProjectCard long-press (500ms) must enable selection mode on touch devices; test on tablet
- [ ] `VER-EL-SCR-053-01-02` [P2] â€” ProjectCard Cmd+click must toggle selection without entering selection mode; test on desktop
- [ ] `VER-EL-SCR-053-03-01` [P2] â€” PartialStitchThumb payload must be lazy-loaded only after card mounts; verify no n-way fan-out on dashboard load
- [ ] `VER-EL-SCR-053-03-02` [P1] â€” Payload cache must be shared across all ProjectCard instances; verify cache hits prevent re-fetching
- [ ] `VER-EL-SCR-053-11-01` [P1] â€” Progress bar aria-valuenow must be accurate and sync with filled width percentage
- [ ] `VER-EL-SCR-053-12-01` [P2] â€” Difficulty score must use calcDifficulty() helper and match full project specs (threadCount, totalStitches, fabricCt)
- [ ] `VER-EL-SCR-053-13-01` [P3] â€” Recency warning styling (mpd-card-recency--warn) must apply if days >= 13; test visual distinction
- [ ] `VER-EL-SCR-053-19-01` [P0] â€” Continue Button must navigate to stitch.html with correct project loaded; no silent failures or wrong project opened

