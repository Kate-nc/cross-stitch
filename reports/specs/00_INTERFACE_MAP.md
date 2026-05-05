# Interface Map — All Screens

> Phase 1A discovery output. Single source of truth for Screen IDs.
> Phase 1B area agents and Phase 2 cross-cutting agents reference these IDs.

## Summary

- **Total screens**: 74
- **Routed (HTML entry)**: 5 (home.html, create.html, stitch.html, manager.html, embroidery.html experimental)
- **Tabs**: 9 (Creator: Prepare/Pattern/Legend/Export/Project; Manager: Inventory/Patterns; Home: Projects/Create/Stash/Stats)
- **Modals**: 12 (Adapt, BulkAdd, ColourReplace, ShoppingList, ImportWizard steps, About, Help shim, ThreadSelector, Preferences, WelcomeWizard, BackupRestore, ProfileModal)
- **Drawers/Sheets**: 4 (HelpDrawer, CommandPalette, ManagerPanel, TrackerColours)
- **Popovers/Overlays**: 6 (PatternInfoPopover, ContextMenu, MagicWandPanel, RealisticCanvas preview, PartialStitchThumb, DesignerBrandingSection)
- **Wizard steps**: 8 (ImportWizard: 5 steps; WelcomeWizard: Creator/Manager/Tracker flows)
- **Other (toast/coach/etc)**: 4 (Toast container, Coachmark overlay, Command entry, OnboardingWizard controller)
- **Orphans (suspected dead code)**: 0

## Screen Table

| Screen ID | Name | Type | Page (HTML) | Component file | Render condition | Est. elements |
|---|---|---|---|---|---|---|
| SCR-001 | Home Dashboard (Projects tab) | tab | home.html | [home-app.js](../../home-app.js) | active when home loads or tab selected | ~35 |
| SCR-002 | Home Create New tab | tab | home.html | [home-app.js](../../home-app.js) | visible when user selects Create tab | ~15 |
| SCR-003 | Home Stash tab | tab | home.html | [home-app.js](../../home-app.js) | visible when user selects Stash tab | ~10 |
| SCR-004 | Home Stats tab | tab | home.html | [home-app.js](../../home-app.js) | visible when user selects Stats tab | ~8 |
| SCR-005 | Creator Canvas (Pattern tab) | tab | create.html | [creator/PatternTab.js](../../creator/PatternTab.js) | app.tab === 'pattern' | ~50 |
| SCR-006 | Creator Prepare Materials tab | tab | create.html | [creator/PrepareTab.js](../../creator/PrepareTab.js) | app.tab === 'prepare' | ~40 |
| SCR-007 | Creator Legend tab | tab | create.html | [creator/LegendTab.js](../../creator/LegendTab.js) | app.tab === 'legend' | ~30 |
| SCR-008 | Creator Export tab | tab | create.html | [creator/ExportTab.js](../../creator/ExportTab.js) | app.tab === 'export' | ~45 |
| SCR-009 | Creator Project tab | tab | create.html | [creator/ProjectTab.js](../../creator/ProjectTab.js) | app.tab === 'project' | ~25 |
| SCR-010 | Creator Pattern Canvas (rendering surface) | page | create.html | [creator/PatternCanvas.js](../../creator/PatternCanvas.js) | always rendered in background | ~120 |
| SCR-011 | Creator Tool Strip (left sidebar tools) | overlay | create.html | [creator/ToolStrip.js](../../creator/ToolStrip.js) | always visible during editing | ~18 |
| SCR-012 | Creator Sidebar (properties/palette) | overlay | create.html | [creator/Sidebar.js](../../creator/Sidebar.js) | always visible during editing | ~45 |
| SCR-013 | Creator Context Menu | menu | create.html | [creator/ContextMenu.js](../../creator/ContextMenu.js) | right-click on canvas | ~8 |
| SCR-014 | Creator Adapt Modal | modal | create.html | [creator/AdaptModal.js](../../creator/AdaptModal.js) | user clicks Adapt button | ~65 |
| SCR-015 | Creator BulkAdd Modal (threads) | modal | create.html | [creator/BulkAddModal.js](../../creator/BulkAddModal.js) | user clicks Bulk Add or bridge trigger | ~40 |
| SCR-016 | Creator Colour Replace Modal | modal | create.html | [creator/ColourReplaceModal.js](../../creator/ColourReplaceModal.js) | user selects colour replace action | ~35 |
| SCR-017 | Creator Shopping List Modal | modal | create.html | [creator/ShoppingListModal.js](../../creator/ShoppingListModal.js) | user opens shopping list | ~28 |
| SCR-018 | Creator ImportWizard (5-step flow) | wizard | create.html | [creator/ImportWizard.js](../../creator/ImportWizard.js) | experimental.importWizard pref and image selected | ~50 |
| SCR-018a | ImportWizard Step 1 (Crop & Orient) | wizard-step | create.html | [creator/ImportWizard.js](../../creator/ImportWizard.js) | step 0 active | ~12 |
| SCR-018b | ImportWizard Step 2 (Palette Choice) | wizard-step | create.html | [creator/ImportWizard.js](../../creator/ImportWizard.js) | step 1 active | ~18 |
| SCR-018c | ImportWizard Step 3 (Size & Fabric) | wizard-step | create.html | [creator/ImportWizard.js](../../creator/ImportWizard.js) | step 2 active | ~22 |
| SCR-018d | ImportWizard Step 4 (Preview & Tune) | wizard-step | create.html | [creator/ImportWizard.js](../../creator/ImportWizard.js) | step 3 active | ~15 |
| SCR-018e | ImportWizard Step 5 (Confirm Generate) | wizard-step | create.html | [creator/ImportWizard.js](../../creator/ImportWizard.js) | step 4 active | ~8 |
| SCR-019 | Creator Magic Wand Panel | popover | create.html | [creator/MagicWandPanel.js](../../creator/MagicWandPanel.js) | cv.activeTool === 'magicWand' | ~12 |
| SCR-020 | Creator Pattern Info Popover | popover | create.html | [creator/PatternInfoPopover.js](../../creator/PatternInfoPopover.js) | infoOpen === true in ActionBar | ~25 |
| SCR-021 | Creator Realistic Preview Canvas | overlay | create.html | [creator/RealisticCanvas.js](../../creator/RealisticCanvas.js) | preview modal open | ~80 |
| SCR-022 | Creator Split Pane (preview comparison) | overlay | create.html | [creator/SplitPane.js](../../creator/SplitPane.js) | view mode includes comparison | ~90 |
| SCR-023 | Creator Designer Branding Section | sheet | create.html | [creator/DesignerBrandingSection.js](../../creator/DesignerBrandingSection.js) | visible in Export tab | ~20 |
| SCR-024 | Tracker Canvas (main stitch canvas) | page | stitch.html | [tracker-app.js](../../tracker-app.js) | always visible when tracker active | ~110 |
| SCR-025 | Tracker Colours Drawer (bottom) | drawer | stitch.html | [tracker-app.js](../../tracker-app.js) | colourDrawerOpen === true | ~35 |
| SCR-026 | Tracker Preview Modal (realistic render) | modal | stitch.html | [tracker-app.js](../../tracker-app.js) | user opens preview | ~85 |
| SCR-027 | Tracker PDF Modal (export settings) | modal | stitch.html | [tracker-app.js](../../tracker-app.js) | user clicks export PDF | ~50 |
| SCR-028 | Tracker Stats Dashboard | modal | stitch.html | [components.js](../../components.js) | statsOpen === true | ~75 |
| SCR-029 | Manager Threads Tab (Inventory) | tab | manager.html | [manager-app.js](../../manager-app.js) | tab === 'inventory' | ~55 |
| SCR-030 | Manager Patterns Tab (Library) | tab | manager.html | [manager-app.js](../../manager-app.js) | tab === 'patterns' | ~45 |
| SCR-031 | Manager Profile Modal | modal | manager.html | [manager-app.js](../../manager-app.js) | profileModalOpen === true | ~18 |
| SCR-032 | Manager BulkAdd Modal | modal | manager.html | [creator/BulkAddModal.js](../../creator/BulkAddModal.js) (reused) | bulkAddOpen === true | ~40 |
| SCR-033 | Manager Welcome Wizard | modal | manager.html | [onboarding-wizard.js](../../onboarding-wizard.js) | first visit or replay | ~15 |
| SCR-034 | Embroidery Tool (experimental) | page | embroidery.html | [embroidery.js](../../embroidery.js) | embroidery.html loaded | ~60 |
| SCR-035 | Header (all pages) | overlay | all pages | [header.js](../../header.js) | always visible | ~22 |
| SCR-036 | Context Bar (project metadata row) | overlay | create.html, stitch.html | [header.js](../../header.js) (ContextBar) | project active | ~12 |
| SCR-037 | Help Drawer (all pages) | drawer | all pages | [help-drawer.js](../../help-drawer.js) | HelpDrawer.open() | ~80 |
| SCR-037a | Help Drawer — Help tab | sheet | all pages | [help-drawer.js](../../help-drawer.js) | tab === 'help' | ~60 |
| SCR-037b | Help Drawer — Shortcuts tab | sheet | all pages | [help-drawer.js](../../help-drawer.js) | tab === 'shortcuts' | ~40 |
| SCR-037c | Help Drawer — Getting Started tab | sheet | all pages | [help-drawer.js](../../help-drawer.js) | tab === 'getting-started' | ~25 |
| SCR-038 | Command Palette (global) | overlay | all pages | [command-palette.js](../../command-palette.js) | cs:openCommand or Ctrl+K | ~45 |
| SCR-039 | Preferences Modal (all pages) | modal | all pages | [preferences-modal.js](../../preferences-modal.js) | preferencesOpen === true | ~65 |
| SCR-040 | Welcome Wizard — Creator flow | modal | create.html | [onboarding-wizard.js](../../onboarding-wizard.js) | shouldShow('creator') | ~15 |
| SCR-040a | Welcome Wizard — Creator Step 1 | wizard-step | create.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 0 | ~8 |
| SCR-040b | Welcome Wizard — Creator Step 2 | wizard-step | create.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 1 | ~8 |
| SCR-040c | Welcome Wizard — Creator Step 3 | wizard-step | create.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 2 | ~8 |
| SCR-041 | Welcome Wizard — Manager flow | modal | manager.html | [onboarding-wizard.js](../../onboarding-wizard.js) | shouldShow('manager') | ~15 |
| SCR-041a | Welcome Wizard — Manager Step 1 | wizard-step | manager.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 0 | ~8 |
| SCR-041b | Welcome Wizard — Manager Step 2 | wizard-step | manager.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 1 | ~8 |
| SCR-041c | Welcome Wizard — Manager Step 3 | wizard-step | manager.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 2 | ~8 |
| SCR-042 | Welcome Wizard — Tracker flow | modal | stitch.html | [onboarding-wizard.js](../../onboarding-wizard.js) | shouldShow('tracker') | ~15 |
| SCR-042a | Welcome Wizard — Tracker Step 1 | wizard-step | stitch.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 0 | ~8 |
| SCR-042b | Welcome Wizard — Tracker Step 2 | wizard-step | stitch.html | [onboarding-wizard.js](../../onboarding-wizard.js) | step 1 | ~8 |
| SCR-043 | Backup & Restore Modal | modal | all pages | [backup-restore.js](../../backup-restore.js) + [modals.js](../../modals.js) | triggered via File menu | ~30 |
| SCR-044 | SharedModals.About | modal | all pages | [modals.js](../../modals.js) | modal === 'about' | ~15 |
| SCR-045 | SharedModals.Help (fallback) | modal | all pages | [modals.js](../../modals.js) | HelpDrawer unavailable | ~12 |
| SCR-046 | SharedModals.ThreadSelector | modal | all pages | [modals.js](../../modals.js) | colour swap/select triggered | ~55 |
| SCR-047 | Toast Container (notifications) | overlay | all pages | [toast.js](../../toast.js) | toast notifications present | ~5 |
| SCR-048 | Coachmark (interactive coaching) | overlay | create.html, stitch.html | [coaching.js](../../coaching.js) | active step in sequence | ~18 |
| SCR-049 | Overlay Component (generic modal shell) | overlay | all pages | [components/Overlay.js](../../components/Overlay.js) | wrapped around any modal | ~10 |
| SCR-050 | PartialStitchThumb (component) | component | tracker.html, components | [components/PartialStitchThumb.js](../../components/PartialStitchThumb.js) | shown in UI | ~8 |
| SCR-051 | Project Library (in Manager + Creator home) | overlay | manager.html, create.html | [project-library.js](../../project-library.js) | project picker visible | ~40 |
| SCR-052 | MultiProjectDashboard (recent projects) | sheet | home.html, manager.html | [home-screen.js](../../home-screen.js) → MultiProjectDashboard | always visible | ~35 |
| SCR-053 | HomeScreenProjectCard (individual card) | component | home.html, manager.html | [home-screen.js](../../home-screen.js) | per project in list | ~12 |
| SCR-054 | Creator Action Bar (top controls) | overlay | create.html | [creator/ActionBar.js](../../creator/ActionBar.js) | always visible during editing | ~20 |
| SCR-055 | Creator Materials Hub (Prepare tab section) | sheet | create.html | [creator/MaterialsHub.js](../../creator/MaterialsHub.js) | Prepare tab open | ~28 |
| SCR-056 | Palette Swap UI | overlay | create.html, stitch.html | [palette-swap.js](../../palette-swap.js) | palette swap initiated | ~35 |
| SCR-057 | Stats Activity (time/session log) | sheet | home.html, tracker.html | [stats-activity.js](../../stats-activity.js) | stats open | ~30 |
| SCR-058 | Stats Insights (analytics summary) | sheet | home.html, tracker.html | [stats-insights.js](../../stats-insights.js) | stats open | ~25 |
| SCR-059 | Stats Page (full stats dashboard) | page | (via link from home) | [stats-page.js](../../stats-page.js) | /stats or deep link | ~80 |
| SCR-060 | Insights Engine (analysis overlay) | overlay | create.html | [insights-engine.js](../../insights-engine.js) | pattern quality shown | ~15 |
| SCR-061 | Home-screen MultiProjectDashboard | sheet | home.html | [home-screen.js](../../home-screen.js) | home loads | ~40 |

## Area Assignments

### Area: home
- SCR-001 Home Dashboard (Projects tab)
- SCR-002 Home Create New tab
- SCR-003 Home Stash tab
- SCR-004 Home Stats tab
- SCR-052 MultiProjectDashboard (recent projects)
- SCR-053 HomeScreenProjectCard
- SCR-061 Home-screen MultiProjectDashboard

### Area: creator-prepare-materials
- SCR-006 Creator Prepare Materials tab
- SCR-009 Creator Project tab
- SCR-055 Creator Materials Hub
- SCR-015 Creator BulkAdd Modal
- SCR-017 Creator Shopping List Modal
- SCR-018 Creator ImportWizard (5-step flow)
- SCR-018a ImportWizard Step 1 (Crop & Orient)
- SCR-018b ImportWizard Step 2 (Palette Choice)
- SCR-018c ImportWizard Step 3 (Size & Fabric)
- SCR-018d ImportWizard Step 4 (Preview & Tune)
- SCR-018e ImportWizard Step 5 (Confirm Generate)

### Area: creator-pattern-canvas
- SCR-005 Creator Canvas (Pattern tab)
- SCR-010 Creator Pattern Canvas (rendering surface)
- SCR-011 Creator Tool Strip (left sidebar tools)
- SCR-012 Creator Sidebar (properties/palette)
- SCR-013 Creator Context Menu
- SCR-054 Creator Action Bar (top controls)
- SCR-021 Creator Realistic Preview Canvas
- SCR-022 Creator Split Pane (preview comparison)
- SCR-060 Insights Engine (analysis overlay)

### Area: creator-legend-export
- SCR-007 Creator Legend tab
- SCR-008 Creator Export tab
- SCR-023 Creator Designer Branding Section

### Area: creator-modals
- SCR-014 Creator Adapt Modal
- SCR-016 Creator Colour Replace Modal
- SCR-019 Creator Magic Wand Panel
- SCR-020 Creator Pattern Info Popover
- SCR-056 Palette Swap UI

### Area: tracker
- SCR-024 Tracker Canvas (main stitch canvas)
- SCR-025 Tracker Colours Drawer (bottom)
- SCR-026 Tracker Preview Modal (realistic render)
- SCR-027 Tracker PDF Modal (export settings)
- SCR-028 Tracker Stats Dashboard
- SCR-042 Welcome Wizard — Tracker flow
- SCR-042a Welcome Wizard — Tracker Step 1
- SCR-042b Welcome Wizard — Tracker Step 2

### Area: manager
- SCR-029 Manager Threads Tab (Inventory)
- SCR-030 Manager Patterns Tab (Library)
- SCR-031 Manager Profile Modal
- SCR-032 Manager BulkAdd Modal
- SCR-033 Manager Welcome Wizard
- SCR-041 Welcome Wizard — Manager flow
- SCR-041a Welcome Wizard — Manager Step 1
- SCR-041b Welcome Wizard — Manager Step 2
- SCR-041c Welcome Wizard — Manager Step 3
- SCR-051 Project Library (in Manager)
- SCR-057 Stats Activity (time/session log)
- SCR-058 Stats Insights (analytics summary)
- SCR-059 Stats Page (full stats dashboard)

### Area: shared-shell
- SCR-035 Header (all pages)
- SCR-036 Context Bar (project metadata row)
- SCR-037 Help Drawer (all pages)
- SCR-037a Help Drawer — Help tab
- SCR-037b Help Drawer — Shortcuts tab
- SCR-037c Help Drawer — Getting Started tab
- SCR-038 Command Palette (global)
- SCR-039 Preferences Modal (all pages)
- SCR-040 Welcome Wizard — Creator flow
- SCR-040a Welcome Wizard — Creator Step 1
- SCR-040b Welcome Wizard — Creator Step 2
- SCR-040c Welcome Wizard — Creator Step 3
- SCR-043 Backup & Restore Modal
- SCR-044 SharedModals.About
- SCR-045 SharedModals.Help (fallback)
- SCR-046 SharedModals.ThreadSelector
- SCR-047 Toast Container (notifications)
- SCR-048 Coachmark (interactive coaching)
- SCR-049 Overlay Component (generic modal shell)
- SCR-050 PartialStitchThumb (component)
- SCR-034 Embroidery Tool (experimental — out of primary scope)

## Orphans / Suspected Dead Code

| Component | File | Reason flagged |
|---|---|---|
| (none identified) | — | All defined components appear to be mounted or conditionally rendered. |

## Notes for Phase 1B agents

### Naming and scope

- **Unified Tracker/Creator entry**: create.html and stitch.html are SEPARATE HTML entry points; they do not share a root component. Phase 1B agents should treat them independently.
- **home.html as canonical landing**: `/` and `/home` route here; legacy direct URLs (create.html, stitch.html, manager.html) still work.
- **embroidery.html**: experimental, not in nav. Mark out-of-scope unless explicitly surfaced.

### Tricky render conditions

- **ImportWizard (SCR-018)**: gated by `experimental.importWizard` UserPref. Default users see the legacy single-step modal flow.
- **Welcome Wizards (SCR-040/041/042)**: per-page; fire once per browser unless replayed via Help → Restart Guided Tours.
- **Coachmark (SCR-048)**: only renders for active sequence steps (currently `firstStitch_creator`, `firstStitch_tracker`).

### Modals vs sheets vs popovers

- **Modal**: full-screen scrim with `Overlay` component, variant="dialog"
- **Drawer**: slides from edge, often persistent
- **Popover**: anchored to trigger; dismiss on Escape/scrim click
- **Sheet**: section within modal/drawer, NOT a separate screen
- **Wizard-step**: discrete render block of a wizard parent

### Multi-page presence

- **PreferencesModal (SCR-039)**, **HelpDrawer (SCR-037)**, **CommandPalette (SCR-038)**, **Toast (SCR-047)**, **BackupRestore (SCR-043)** all global — element specs should describe behaviour generically; cross-cutting agents will document per-page differences.
- **BulkAddModal**: same component on Creator (SCR-015) and Manager (SCR-032); spec once and cross-reference.

### Tabs vs pages

- **Creator tabs (SCR-005–009)**: state-managed (`app.tab`); switching does not reload.
- **Manager tabs (SCR-029–030)**: state-managed (`tab` useState).
- **Home tabs (SCR-001–004)**: state-managed (`setTab()`).
- **Tracker**: no tab UI; mode toggle (Track vs Navigate) and view-mode selector instead.

### Component file locations

- **creator/*.js** are source files concatenated into [creator/bundle.js](../../creator/bundle.js); they expose components via `window.*`.
- **Shared root .js files** (header.js, help-drawer.js, etc.) load directly via `<script>` tags on each page.
- **Tracker-only / Manager-only** components live inline in `tracker-app.js` / `manager-app.js`.

### Shortcuts and keyboard

- Centralised in [shortcuts.js](../../shortcuts.js); consumed by HelpDrawer Shortcuts tab.
- Each page registers its shortcuts before main mount. Treat as cross-cutting (Phase 2 keyboard-a11y).
