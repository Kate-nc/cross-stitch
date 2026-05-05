# Area Spec: manager

## Scope

The Manager area (**manager.html**) is the dedicated Stash Management hub where users track thread inventory (DMC + Anchor brands), manage a pattern library, and access detailed stitching analytics. The Manager owns the `stitch_manager_db` IndexedDB database (schema v1, store: `manager_state`) and exposes thread stash state across the app via `StashBridge` and `cs:stashChanged` events. It also reconciles auto-synced patterns from Creator/Tracker projects with manually-added library entries.

**Key workflows:**
- **Inventory tracking**: Add threads (bulk or individually), track partial skeins, set min-stock thresholds.
- **Pattern library**: Auto-sync from Creator/Tracker; add manual-only patterns; filter/search/sort.
- **Alerts**: Surfaced conflicts (threads needed by multiple patterns, insufficient stock), low-stock warnings, ready-to-start projects.
- **Analytics**: Lifetime stats, weekly/monthly activity heatmap, insights, stash composition.
- **Profile**: Manage user preferences (fabric count, strand count, waste factor, default brand).

**Data ownership:**
- **stitch_manager_db.manager_state**: threads dict, patterns array, userProfile, schema version.
- **CrossStitchDB**: projects (via ProjectStorage); Manager reconciles metadata.
- **StashBridge**: read-only bridge from other pages; dispatches `cs:stashChanged` on external writes.
- **cs:stashChanged event**: Fired by StashBridge after Tracker deductions; listened by Manager to reload threads.

---

## Screen: SCR-029 â€” Manager Threads Tab (Inventory)

### Purpose
Display the user's DMC and Anchor thread inventory in a searchable, filterable grid. Each thread shows owned count, partial-skein status, and usage across patterns. Smart Hub alerts surface conflicts and low-stock warnings at the top.

### EL-SCR-029-01: Filter & Search Bar
**Layout**: Sticky horizontal bar below tab selector.
**Elements:**
- **Search input** (aria-label="Search threads"): text field accepting thread ID or name. Updates `searchQuery` state real-time.
- **Filter chips** (buttons):
  - "All" (default)
  - "Owned" (owned > 0 or partial status in [mostly-full, about-half, remnant])
  - "Low Stock" (owned < lowStockThreshold, default 1)
  - "Remnants" (partialStatus === 'remnant')
  - "Used Up" (partialStatus === 'used-up' AND owned === 0)
- **Brand selector** (buttons):
  - "All" (default, DMC + Anchor)
  - "DMC"
  - "Anchor"
- **Sort dropdown** (select, aria-label="Sort threads"):
  - "Number" (DMC/Anchor ID numeric order)
  - "Colour" (RGB â†’ HSL hue sort; greys to end)
  - "Name (Aâ€“Z)"
  - "Owned: most first"
  - "Owned: fewest first"
- **"+ Bulk Add" button** (right-aligned): Opens BulkAddModal (SCR-032).

### EL-SCR-029-02: Stash Info Chip (Plan B Phase 2)
**Layout**: Compact chip below filter bar, left-aligned.
**Elements:**
- **Trigger button** (aria-haspopup="dialog", aria-expanded): "Stash" label + summary count (e.g. "120 skeins Â· 3 low").
- **Popover** (on click, offset from trigger):
  - **Stash section** (AppInfoGrid):
    - Total skeins owned
    - Distinct threads owned (count of keys where owned > 0)
    - Low-stock threshold (user preference)
  - **Divider**
  - **Status section** (AppInfoGrid, conditional rows):
    - Low stock (needed) â€” only if lowStockNeeded.length > 0
    - Low stock (other) â€” only if lowStockNotNeeded.length > 0
    - Conflicts â€” only if conflicts.length > 0
    - Ready to start â€” only if readyToStart.length > 0
  - **Divider** (if badges present)
  - **Badges section** (AppInfoBadges):
    - Conflicts badge (kind='danger', label='{count} conflicts') â€” if count > 0
    - Low stock badge (kind='warning') â€” if any
    - Ready badge (kind='success') â€” if readyToStart.length > 0

### EL-SCR-029-03: Smart Hub Alerts (Stacked)
**Layout**: Full-width alert cards above thread grid, stacked vertically.
**Conflict Alert** (danger, class="alert-card danger"):
- Heading: "{Icons.warning()} Thread Conflicts ({count})"
- Subtext: "These threads are needed by multiple patterns but you don't have enough."
- Content: Scrollable list of conflict rows, each showing:
  - Color swatch (14Ã—14 px, rounded)
  - Thread ID + brand label (bold, 12px)
  - Thread name (secondary, 11px)
  - Status: "own {n}, need {m}" (danger colour)
  - Patterns (tertiary list)
- Click a row â†’ filter to All brand/All filter, search cleared, thread highlighted in panel.

**Low-Stock (Needed) Alert** (warning, class="alert-card warn"):
- Heading: "{Icons.box()} Low Stock â€” Needed ({count})"
- Subtext: "Threads below your minimum stock level that are used by active projects."
- Content: Scrollable list of low-stock rows (active projects only):
  - Color swatch, thread ID, name
  - Status: "have {owned}, min {min_stock}" (accent-ink colour)

**Low-Stock (Not Needed) Alert** (info, class="alert-card", muted style):
- Heading (tertiary text): "{Icons.box()} Low stash â€” not currently needed ({count})"
- Subtext (tertiary): "These threads are below minimum stock but aren't used by any active project."
- Content: Scrollable list (grayed; no action on click).

### EL-SCR-029-04: Thread Grid
**Layout**: CSS grid (4â€“6 columns on desktop, 2â€“3 on tablet, 1 on mobile). Responsive via `thread-grid` class.
**Thread Card Pattern** (one per filtered thread):
- **Color swatch** (class="sw"): 14Ã—14 px, border-radius 3px, background=`rgb(r,g,b)`.
- **Info section** (class="info"):
  - **Thread ID** (class="tid", 12px bold): DMC/Anchor number. If Anchor, append small badge (`#0369a1` text on `#e0f2fe` background, "A", 9px).
  - **Thread name** (class="tnm", 11px): e.g. "Very Dark Red Brown".
- **Low-stock badge** (class="badge-low", conditional): Small red badge "Low" if owned > 0 AND owned â‰¤ lowStockThreshold.
- **Owned count** (class="owned", 14px bold): e.g. "3".
- **Partial gauge** (class="gauge"): 4 segments (each 4px Ã— 4px + 2px gap):
  - Segment state computed from `partialStatus`:
    - null â†’ all border-only
    - "mostly-full" â†’ 3 filled + 1 border
    - "about-half" â†’ 2 filled + 2 border
    - "remnant" â†’ 1 filled (warning orange) + 3 border
    - "used-up" â†’ all filled (gray)
- **Interaction**: Click card â†’ toggle selection; if selected, open right panel.

**Empty state** (filteredThreads.length === 0):
- If totalOwnedCount === 0 AND threadFilter === 'all' AND EmptyState component available:
  - EmptyState with icon=Icons.thread(), title="Your stash is empty", description about tracking threads.
  - CTA button "Bulk add threads" â†’ opens BulkAddModal.
- Else: Gray text "No threads found" or filter-specific message.

### EL-SCR-029-05: Right Panel â€” Thread Detail (Collapsible)
**Layout**: Slides in from right edge on desktop; overlay on mobile. Toggles via handle or card selection.
**Handle** (class="mgr-panel-handle"): Small bar at left edge with label "Thread Detail".
**Content** (class="mgr-rpanel"):
- **Header section** (text-align=center):
  - Color swatch (class="td-swatch", larger, ~40px)
  - Title (class="td-title"):
    - Thread ID + brand label + Anchor badge if applicable (class="dmc")
    - Thread name (class="tnm")

- **Stash section** (class="rp-s"):
  - Heading: "Stash" (class="rp-h")
  - **Row 1: Full skeins** (class="td-row"):
    - Label: "Full skeins"
    - Qty ctrl (class="qty-ctrl"): âˆ’/n/+ buttons, center number
  - **Row 2: Min stock** (class="td-row"):
    - Label: "Min stock"
    - Qty ctrl: âˆ’/n/+ buttons
  - **Row 3: Opened skein** (class="td-row"):
    - Label: "Opened skein"
    - Value (span, 11px): "None" | "Mostly full" | "About half" | "Remnant" | "Used up"
  - **Opened skein level selector** (class="gauge-lg"):
    - 4 clickable segments: "â€”" (None), "Â¾" (mostly-full), "Â½" (about-half), "Â¼" (remnant), plus grayed "Used up" display-only
    - On click, updates `partialStatus`.

- **Used In section** (class="rp-s"):
  - Heading: "Used In"
  - If patterns using thread exist (class="used-in"):
    - List of rows (class="ui-row"): {Icons.clipboard()} + pattern title + quantity needed (class="need")
  - Else: Gray text "Not used in any patterns"

- **Actions section** (class="rp-s"):
  - Heading: "Actions"
  - Button "Remove from stash" (class="g-btn", color=#B85555, border danger-soft):
    - On click: Set owned=0, partialStatus=null, tobuy=false.
    - Toast (Undo): "DMC 310 removed from stash" with undo action.

### EL-SCR-029-06: Data Model & State
- **State variables:**
  - `threads`: dict { [compositeKey]: { owned, tobuy, partialStatus, min_stock, addedAt?, acquisitionSource?, history? } }
  - `searchQuery`: string
  - `threadFilter`: 'all' | 'owned' | 'tobuy' | 'lowstock' | 'remnants' | 'usedup'
  - `brandFilter`: 'all' | 'dmc' | 'anchor'
  - `threadSort`: 'number' | 'colour' | 'name' | 'owned_desc' | 'owned_asc'
  - `expandedThread`: compositeKey | null (which thread card is expanded in the grid)
  - `selectedThread`: compositeKey | null (which thread is shown in right panel)
  - `panelOpen`: boolean

- **Composite keys**: brand-prefixed, e.g., "dmc:310", "anchor:310" (bare DMC keys migrated from v1).
- **partialStatus values**: null | 'mostly-full' | 'about-half' | 'remnant' | 'used-up'
- **Low-stock calculation**: owned < min_stock (if set) OR owned < lowStockThreshold (global user pref, default 1).
- **V3 fields** (lazy acquisition/history tracking): addedAt, lastAdjustedAt, acquisitionSource, history (array of { date, delta }).

### EL-SCR-029-07: Integration Points
- **Auto-save**: Debounced 1s on threads state change; writes to IDB.
- **External writes**: StashBridge mutations (Tracker stitch deductions) trigger cs:stashChanged; Manager reloads threads from IDB to prevent state clobber.
- **Visibility change**: On tab return, reconcile patterns from ProjectStorage, reload fresh from IDB.
- **BulkAdd trigger**: Command Palette 'mgr_bulk_add', global 'b' shortcut, or button click.

---

## Screen: SCR-030 â€” Manager Patterns Tab (Library)

### Purpose
Display the user's cross-stitch pattern library: auto-synced patterns from Creator/Tracker projects plus manually-added patterns. Full CRUD support (view, edit, delete, duplicate, export).

### EL-SCR-030-01: Filter & Search Bar
**Layout**: Sticky horizontal bar below tab selector.
**Elements:**
- **Search input** (aria-label="Search patterns"): text field accepting pattern title, designer, or tag.
- **Filter dropdown** or **chips**:
  - "All" (default)
  - "Wishlist"
  - "Owned"
  - "In Progress"
  - "Completed"
- **Sort dropdown** (aria-label="Sort patterns"):
  - "Date added: newest"
  - "Date added: oldest"
  - "Title (Aâ€“Z)"
  - "Designer (Aâ€“Z)"
  - "Status"
- Selections persisted to UserPrefs (`patternsDefaultFilter`, `patternsDefaultSort`).

### EL-SCR-030-02: Pattern Cards Grid
**Layout**: Similar to threads: responsive grid (2â€“4 cols on desktop, 1â€“2 on tablet, 1 on mobile).
**Pattern Card** (one per filtered pattern):
- **Header**:
  - Pattern title (bold, 13px)
  - Status badge: Wishlist (warning), Owned (info), In Progress (warning), Completed (success)
- **Content**:
  - Designer name (if present, secondary text)
  - Thread count (e.g. "12 unique colours, 450 stitches")
  - Tags (if present, small secondary list)
- **Metadata**:
  - "Auto-synced" label/badge (if `linkedProjectId` present)
  - Added date (tertiary text, e.g. "added 3 days ago" via `timeAgo()`)
- **Interaction** (row click or menu):
  - On click (or "Open" button): If linked to Creator project, navigate to create.html with project ID. If manager-only, show info toast or navigate to modal (TBD).

### EL-SCR-030-03: Per-Pattern Actions
**Elements** (context menu or action buttons):
- **Open in Creator**: If `linkedProjectId` set, link to create.html?id=... . Else, disabled or show toast.
- **Open in Tracker**: If linked, link to stitch.html?id=... . Else, disabled.
- **Edit**: Open modal to edit title, designer, status, tags, thread list.
- **Duplicate**: Copy pattern with new ID, append " (copy)" to title.
- **Export**: Generate downloadable PDF or JSON.
- **Delete**: Remove from patterns array; toast with undo.
- **Add to My Stash** (if shopping list present): Bridge to BulkAdd to add required threads.

### EL-SCR-030-04: Auto-Sync Reconciliation Logic
**Process** (on load and visibilitychange):
1. Load base patterns array from IDB.
2. Fetch all project metadata from ProjectStorage.
3. Build `linkedIdxMap` (projectId â†’ pattern index) for fast O(1) lookup.
4. For unlinked projects (not in map), build auto-synced pattern entry:
   - Fetch full project data.
   - Extract palette and thread list.
   - Create pattern object: { id (UUID), linkedProjectId, title (from project.name or size), status: 'inprogress', threads: [...] }.
5. For linked projects where title changed (project renamed), update pattern.title only (preserve user-set designer, tags, status).
6. Append unlinked patterns to array.
7. Return reconciled list and auto-save to IDB.

### EL-SCR-030-05: Pattern Data Model
- **Shape**:
  ```json
  {
    "id": "uuid-or-timestamp",
    "linkedProjectId": "proj_...", 
    "title": "My Heart Pattern",
    "designer": "Jane Doe",
    "status": "inprogress",
    "tags": ["red", "small"],
    "threads": [
      { "id": "310", "name": "Very Dark Red Brown", "qty": 45, "unit": "stitches", "brand": "DMC" }
    ],
    "updatedAt": "2025-04-10T..."
  }
  ```
- **Auto-synced patterns**: always have `linkedProjectId`; `tags` includes 'auto-synced' for UI filtering.
- **Manual patterns**: no `linkedProjectId`; may have designer/tags.

### EL-SCR-030-06: Empty State
If no patterns match filters:
- "No patterns found" message (or filter-specific: "No completed patterns yet").
- If library is completely empty: EmptyState with icon, title, description, CTA to open Creator or add manual pattern.

---

## Screen: SCR-031 â€” Manager Profile Modal

### Purpose
User preferences hub for the Stash Manager. Proxy for settings that affect pattern generation and inventory calculations.

### EL-SCR-031-01: Modal Structure
**Layout**: Centered modal (overlay variant) or sheet. Title: "Profile Settings" or "Manager Preferences".
**Content**:
- **Fabric Count** (spinner or number input, default from UserPref 'creatorDefaultFabricCount', default 14):
  - Label: "Fabric count (threads per inch)"
  - Values: 11, 14, 18, 22, etc.
  - Used for skein calculations in pattern estimate.
- **Strand Count** (spinner, default 2):
  - Label: "Strands per stitch"
  - Range: 1â€“4
  - Used for skein estimation.
- **Default Thread Brand** (select or chip group):
  - Label: "Default brand for new patterns"
  - Options: "DMC", "Anchor"
  - Stored in UserPref 'stashDefaultBrand'.
- **Waste Factor** (slider or input, default 0.20):
  - Label: "Waste factor"
  - Range: 0â€“0.5 (0â€“50%)
  - Expressed as decimal.
- **Low-Stock Threshold** (spinner, default 1):
  - Label: "Low-stock alert (skeins)"
  - Minimum: 0

### EL-SCR-031-02: Save & Sync
- **Local save**: All inputs write to UserPrefs via `UserPrefs.set(key, value)`.
- **Event dispatch**: On save, emit `cs:prefsChanged` CustomEvent with detail `{ key, value }`.
- **Optional cloud sync** (if SyncEngine available): save to remote store.

---

## Screen: SCR-032 â€” Manager BulkAdd Modal

### Purpose
Shared with Creator (SCR-015). Allows rapid thread inventory population by pasting IDs or importing starter kits.

### EL-SCR-032-01: Integration Note
- **Component**: `window.BulkAddModal` (creator/BulkAddModal.js, loaded standalone on manager.html).
- **Trigger**: Command Palette ('mgr_bulk_add'), global 'b' shortcut, or "+ Bulk Add" button in Inventory filter bar.
- **Data destination**: **stitch_manager_db.manager_state.threads** (NOT creator's pattern palette).
- **Key difference from Creator mount**: on submit, BulkAdd callback in Manager writes to stitch_manager_db and fires `cs:stashChanged`.

### EL-SCR-032-02: Verification Point (P1)

Verification TODOs for SCR-032 are owned by the bottom-of-doc verification list (see `### SCR-032 â€” BulkAdd Modal` below). The two duplicate inline TODOs that previously appeared here (`VER-EL-SCR-032-01-01` and `VER-EL-SCR-032-02-01`) have been removed in Phase 3 reconciliation; the canonical definitions live in the verification list below to keep IDs unique. Refer there.

---

## Screen: SCR-033 â€” Manager Welcome Wizard

### Purpose
First-visit guided tour for the Manager page. Multi-step modal introducing the Threads and Patterns tabs.

### EL-SCR-033-01: Wizard Structure
**Component**: `window.WelcomeWizard` (onboarding-wizard.js).
**Trigger**: Lazy init on ManagerApp mount if `WelcomeWizard.shouldShow('manager')` true; flag: `cs_welcome_manager_done` in localStorage.
**Steps**:
- **Step 1: Welcome to the Stash Manager**
  - Title: "Welcome to the Stash Manager"
  - Body: "Track which DMC and Anchor threads you own, and manage a library of patterns. We'll give you a 60-second tour."
  - Navigation: Next button.

- **Step 2: Build your stash**
  - Title: "1. Build your stash"
  - Body: "The Threads tab is where you tick the threads you own. Use 'Bulk Add' to paste a list of IDs in one go."
  - Tip: "Clicking the highlighted tab will close this tour and take you straight there."
  - Target: `[data-onboard="mgr-stash-tab"]` (highlight ring around Threads tab button).
  - dismissOnTargetClick: true (clicking tab closes wizard and marks done).

- **Step 3: Browse your patterns**
  - Title: "2. Browse your patterns"
  - Body: "The Patterns tab lists patterns saved in the Creator/Tracker (auto-synced) plus any you add manually here."
  - Tip: "Clicking the highlighted tab will close this tour."
  - Target: `[data-onboard="mgr-patterns-tab"]`.
  - dismissOnTargetClick: true.
  - Final step: "Get started" button closes and marks done.

### EL-SCR-033-02: Accessibility & Keyboard
- Focus trap (Tab/Shift+Tab inside popover).
- Escape key closes wizard (without marking done).
- ARIA attributes: aria-modal, aria-label, aria-expanded on trigger.
- Reduced-motion: @media (prefers-reduced-motion: reduce) suppresses transitions.

---

## Screen: SCR-041/041a/041b/041c â€” Welcome Wizard (Manager flow, Steps 1â€“3)

(Detailed above in SCR-033; cross-referenced here for completeness.)

---

## Screen: SCR-051 â€” Project Library (in Manager mount)

### Purpose
Unified project listing that surfaces Creator/Tracker projects + manual-only patterns as pseudo-projects for convenient browsing from the Manager sidebar or modal.

### EL-SCR-051-01: ProjectLibrary Component Wrapper
**Component**: `window.ProjectLibrary({ mode: 'manager', ... })` (project-library.js).
**Mode='manager'**: Appends manual-only patterns (from Stash Manager library, flagged `managerOnly: true`) to the project grid as pseudo-projects.
**Data source**: Calls `useProjectLibrary()` hook internally or accepts external `projects` prop.

### EL-SCR-051-02: Pseudo-Project Transformation
**Shape** (for display only):
```json
{
  "id": "mgr:pattern-uuid",
  "_managerPatternId": "pattern-uuid",
  "name": "Heart Pattern",
  "managerOnly": true,
  "completedStitches": 0,
  "totalStitches": 0,
  "lastSessionDate": null,
  "updatedAt": "2025-04-10T...",
  "stitchesThisWeek": 0,
  "stitchesThisMonth": 0,
  "totalMinutes": 0
}
```
**Badge**: "Stash Manager only" displayed on card so users know it's not linked to a Creator/Tracker project.

### EL-SCR-051-03: Card Rendering
- Uses **MultiProjectDashboard** from home-screen.js (same card UI as Home).
- On card click (onOpenProject):
  - If `managerOnly: true`: call `onOpenManagerOnly` callback or show toast "This entry was added directly in the Stash Manager and has no linked project."
  - Else: navigate to Creator/Tracker with project ID.

### EL-SCR-051-04: Data Sync
- Listens to `cs:projectsChanged`, `cs:patternsChanged`, `cs:backupRestored`, and `visibilitychange`.
- Re-loads and reconciles patterns on each event so pseudo-projects stay fresh.

---

## Screen: SCR-057 â€” Stats Activity (time/session log)

### Purpose
Heatmap and activity timeline showing stitching frequency and cadence across all projects (or filtered by one project).

### EL-SCR-057-01: Heatmap & Insights
**Component**: `window.StatsActivity` (stats-activity.js).
**Elements**:
- **Period selector** (buttons): "1 year" (default), "6 months", "All time".
- **Heatmap grid**: 
  - Sun-start weeks aligned.
  - Each cell: one day, color bin (0â€“4) based on percentile of stitches that day.
  - Cells before tracking start: muted/grayed.
  - Click cell: show stitches + duration for that day.
- **Insights section** (conditional, if â‰¥3 active days):
  - Day-of-week favourite.
  - Cadence (days per week).
  - Best streak.

### EL-SCR-057-02: Duration Tracking
- Loads sessions from all projects' `statsSessions` array.
- For each session: extracts `durationSeconds` or `durationMinutes * 60`.
- Displays as "XhYm" format (helpers.fmtHours).

---

## Screen: SCR-058 â€” Stats Insights (analytics summary)

### Purpose
Brief, tweet-like insights about the user's stitching habits and stash composition.

### EL-SCR-058-01: Insight Feeds
**Component**: `window.StatsInsights` (stats-insights.js).
**Elements**:
- **Tone-coded cards** (celebrate, encourage, inform, nudge):
  - "You've stitched {X} stitches this month â€” keep the streak!"
  - "This week's fastest stitch speed was {Y}st/hr."
  - "Your stash is {Z}% complete for red tones."
  - "Consider using {thread}; you have {qty} skeins."
- **Dismiss buttons**: Per-card X; dismissed for 30 days (localStorage).
- **Heatmap** (mini): 4-week view of stitch frequency.

### EL-SCR-058-02: Data Sources
- Calls `ProjectStorage.getAllStatsSummaries()` for palette + session data.
- Calls `StashBridge.getGlobalStash()` for inventory insights.
- Memoizes week/month calculations.

---

## Screen: SCR-059 â€” Stats Page (full stats dashboard)

### Purpose
Comprehensive analytics dashboard: lifetime stats, charts, trends, and learnings.

### EL-SCR-059-01: Main Sections
**Component**: `window.StatsPage` (stats-page.js, mount via /stats or deep link).
**Tabs or sections**:
- **Showcase** (overview glance): Key metrics (lifetime stitches, projects, hours).
- **Activity** (heatmap): 52-week grid + cadence.
- **Insights** (analytics): Brief cards + week-over-week comparison.
- **Detailed analytics** (toggle visibility):
  - SABLE Index (added vs used thread trajectory).
  - Colour families (pie chart).
  - DMC palette coverage (% of 447 colours owned).
  - Ready to start (projects with all threads in stock).
  - Buying impact (cost savings if using what you have).
  - Duplicate risk (threads with redundant similar colours).
  - Oldest WIPs (projects not touched in X weeks).
  - Stash age (when each thread was acquired).
  - Most-used colours (top 50).
  - Threads never used.
  - Colour preference fingerprint (hue/saturation/lightness distribution).
  - Designer leaderboard (projects by designer, completion %).
  - Brand alignment (DMC vs Anchor ratio).
  - Quarterly portfolio (projects per quarter).
  - Difficulty vs completion (scatter: stitch count vs %).
  - Pattern source (Creator vs Import vs Manual).

### EL-SCR-059-02: Visibility Preferences
- `loadStatsVisibility()` / `saveStatsVisibility()`: localStorage-backed dict of section visibility.
- Defaults: DEFAULT_STATS_VISIBILITY object in stats-page.js (most sections on by default).
- Toggle buttons on each card to hide/show.

### EL-SCR-059-03: Date Range Pickers (P2)
- (Not fully detailed in source; placeholder for cross-cutting phase).
- Allow filtering stats to custom date ranges.
- Persist to localStorage.

---

## DISCOVERED.md appendix

### Stash Data Migration Path
- **V1 â†’ V2**: Bare DMC keys (`"310"`) â†’ composite keys (`"dmc:310"`). Triggered on first StashBridge call after v1 data detected.
- **V2 â†’ V3**: Adds `addedAt`, `lastAdjustedAt`, `acquisitionSource`, `history[]` fields. Legacy entries stamped with `LEGACY_EPOCH` ('2020-01-01T...'). Signals cs:stashChanged to notify Manager.
- **V3 â†’ V4** (in manager-app.js migration): Ensures all Anchor threads exist in dict (even if owned=0). Already migrated on first load.
- **Current version**: 4. Tracked in IDB as `stashDataVersion` key in `manager_state` store.

### SmartHub Alerts Logic
- **Conflicts**: `StashBridge.detectConflicts()` â†’ threads where total needed across all patterns > owned.
- **Low-stock (needed)**: Threads with owned < min_stock AND used by active patterns (status !== 'completed').
- **Low-stock (not needed)**: Threads with owned < min_stock AND NOT used by active patterns.
- **Ready to start**: `StashBridge.whatCanIStart()` â†’ projects where all required threads are in stock.
- Alerts recomputed whenever threads or patterns state changes.

### Event Bus & Bridges
- **cs:stashChanged**: Fired by StashBridge.setToBuyQty*, markBought*, etc. Manager reloads threads from IDB to prevent clobber.
- **cs:patternsChanged**: Fired after pattern library mutation (auto-sync reconciliation, manual delete). Triggers visibilitychange handler.
- **cs:backupRestored**: Fired by BackupRestore.restore(). Manager calls loadManagerData + loadActiveProject to refresh all state.
- **cs:projectsChanged**: Fired by ProjectStorage. Manager triggers pattern reconciliation.

### Command Palette & Shortcuts
- **Command 'mgr_bulk_add'**: "Bulk Add Threads" (section: action).
- **Command 'mgr_preferences'**: "Open Preferences" (section: settings).
- **Global shortcut 'b'** (scope: global): "Open Bulk Add Threads" on Manager page.
- All registered in useEffect hooks on mount; unregistered on unmount.

### Responsive Design Notes
- **Desktop** (1024px+): 4â€“6 thread cards per row; right panel slides in from right edge.
- **Tablet** (600â€“1024px): 2â€“3 cards per row; right panel may overlay or become modal.
- **Mobile** (<600px): 1â€“2 cards per row; panel as bottom sheet or modal.
- **P2 TODO**: Inventory table column collapse for dense tabular data on tablet; horizontal scroll fallback.

---

## VERIFICATION TODO

### SCR-029 â€” Threads Tab
- [ ] `VER-EL-SCR-029-01-01` [P0] â€” Search input filters threads by ID and name in real-time; empty search shows all matching brand/filter combo.
- [ ] `VER-EL-SCR-029-02-01` [P1] â€” Brand selector correctly switches between DMC-only, Anchor-only, and combined list.
- [ ] `VER-EL-SCR-029-03-01` [P1] â€” Colour sort algorithm (RGBâ†’HSL hue) places near-grays (saturation < 5%) at end, not scrambled.
- [ ] `VER-EL-SCR-029-04-01` [P0] â€” Thread cards display correct owned count and partial-skein gauge (4 segments) for all status values.
- [ ] `VER-EL-SCR-029-05-01` [P1] â€” Right panel opens on card click; owned/min_stock +/âˆ’ buttons persist changes immediately.
- [ ] `VER-EL-SCR-029-06-01` [P1] â€” Setting partialStatus='used-up' auto-zeroes owned count; setting owned>0 clears used-up status.
- [ ] `VER-EL-SCR-029-07-01` [P1] â€” External StashBridge writes (Tracker stitch deductions) do NOT overwrite React state on auto-save; reload from IDB instead.
- [ ] `VER-EL-SCR-029-08-01` [P2] â€” Low-stock calculation respects per-thread min_stock override; falls back to global threshold.
- [ ] `VER-EL-SCR-029-09-01` [P1] â€” Smart Hub Conflict alert lists all patterns needing each conflicted thread; sorted by (needed - owned) descending.
- [ ] `VER-EL-SCR-029-10-01` [P1] â€” Low-stock (needed) includes only threads used by active projects; excludes completed.
- [ ] `VER-EL-SCR-029-11-01` [P2] â€” Tablet layout: Inventory grid collapses to 2 cols; right panel becomes bottom sheet; horizontal scroll visible.

### SCR-030 â€” Patterns Tab
- [ ] `VER-EL-SCR-030-01-01` [P0] â€” Search input filters by title, designer, tags; case-insensitive.
- [ ] `VER-EL-SCR-030-02-01` [P1] â€” Status filter correctly isolates wishlist/owned/inprogress/completed; default is all.
- [ ] `VER-EL-SCR-030-03-01` [P1] â€” Pattern sort 'date' compares UUID/timestamp (proxy); 'status' sorts by priority (wishlist < owned < inprogress < completed).
- [ ] `VER-EL-SCR-030-04-01` [P1] â€” Auto-sync reconciliation: unlinked projects appear as new pattern entries with linkedProjectId set.
- [ ] `VER-EL-SCR-030-05-01` [P1] â€” Renamed Creator projects update pattern title via reconciliation; user-set designer/tags NOT overwritten.
- [ ] `VER-EL-SCR-030-06-01` [P0] â€” Per-pattern actions (open, delete, duplicate) work without data loss; delete generates undo toast.
- [ ] `VER-EL-SCR-030-07-01` [P1] â€” "Open in Creator" link prefilled with project ID; disabled if no linkedProjectId.
- [ ] `VER-EL-SCR-030-08-01` [P2] â€” Pseudo-project manager-only badge visible; click â†’ info toast "no linked project".

### SCR-031 â€” Profile Modal
- [ ] `VER-EL-SCR-031-01-01` [P0] â€” Fabric count, strand count, waste factor values persist to UserPrefs.
- [ ] `VER-EL-SCR-031-02-01` [P1] â€” Default brand selector writes to UserPref 'stashDefaultBrand'.
- [ ] `VER-EL-SCR-031-03-01` [P1] â€” cs:prefsChanged event dispatched after each save; other pages detect and update (e.g., Creator palette).

### SCR-032 â€” BulkAdd Modal
- [ ] `VER-EL-SCR-032-01-01` [P1] â€” BulkAdd.onSubmit writes to stitch_manager_db.manager_state.threads with composite keys, NOT bare IDs.
- [ ] `VER-EL-SCR-032-02-01` [P1] â€” After submit, cs:stashChanged fired; Tracker/Creator StashBridge detects update.
- [ ] `VER-EL-SCR-032-03-01` [P1] â€” Starter kit selection (e.g., "Reds") correctly populates owned counts and brands.

### SCR-033/041 â€” Welcome Wizard
- [ ] `VER-EL-SCR-033-01-01` [P0] â€” Wizard appears on first visit; dismissed via "Get started" button or Escape; flag set in localStorage.
- [ ] `VER-EL-SCR-033-02-01` [P1] â€” Target highlight (step 2 Threads tab, step 3 Patterns tab) correctly positioned; dismissOnTargetClick closes tour.
- [ ] `VER-EL-SCR-033-03-01` [P2] â€” Focus trap (Tab/Shift+Tab) confined to wizard popover; initial focus on primary action button.
- [ ] `VER-EL-SCR-033-04-01` [P2] â€” Reduced-motion media query suppresses slide animations.

### SCR-051 â€” Project Library
- [ ] `VER-EL-SCR-051-01-01` [P1] â€” Manual-only patterns rendered as pseudo-projects with "Stash Manager only" badge.
- [ ] `VER-EL-SCR-051-02-01` [P1] â€” Click pseudo-project â†’ calls onOpenManagerOnly callback (not Creator/Tracker nav).
- [ ] `VER-EL-SCR-051-03-01` [P1] â€” Pattern reconciliation re-runs on visibilitychange; newly-created Creator projects appear without page reload.

### SCR-057/058/059 â€” Stats Screens
- [ ] `VER-EL-SCR-057-01-01` [P0] â€” Heatmap grids render correctly for 1 year, 6m, all-time periods.
- [ ] `VER-EL-SCR-057-02-01` [P1] â€” Insights fire only if â‰¥3 active stitching days; suppress otherwise.
- [ ] `VER-EL-SCR-057-03-01` [P1] â€” Duration tracking: sessions.durationSeconds preferred over durationMinutes * 60.
- [ ] `VER-EL-SCR-058-01-01` [P2] â€” Insights cards show tone-specific icons (celebrate, encourage, inform, nudge).
- [ ] `VER-EL-SCR-058-02-01` [P2] â€” Dismissed insights stay hidden for 30 days; localStorage purges expired entries.
- [ ] `VER-EL-SCR-059-01-01` [P1] â€” Stats Page loads all summaries in parallel (PERF perf-5 #5); no sequential awaits.
- [ ] `VER-EL-SCR-059-02-01` [P2] â€” Section visibility preferences persisted to localStorage; toggles apply immediately.

### Cross-Cutting
- [ ] `VER-MANAGER-GLOBAL-01` [P1] â€” cs:stashChanged propagates from Tracker stitch deductions to Manager; no data loss on concurrent writes.
- [ ] `VER-MANAGER-GLOBAL-02` [P1] â€” BackupRestore.restore() triggers cs:backupRestored; Manager reloads all data (threads, patterns, projects).
- [ ] `VER-MANAGER-GLOBAL-03` [P2] â€” Tablet layout: Inventory table collapses gracefully; no horizontal overflow on 600â€“1024px viewports.
- [ ] `VER-MANAGER-GLOBAL-04` [P1] â€” Help Drawer â†’ "Restore tutorials" â†’ resets all onboarding flags (WelcomeWizard + StitchingStyleOnboarding).

