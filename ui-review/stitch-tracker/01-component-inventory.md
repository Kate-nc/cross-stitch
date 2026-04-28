# Component Inventory — Stitch Tracker

Every UI component rendered in the tracker section (`stitch.html` → `tracker-app.js` + shared scripts). File references are to the codebase root. Line numbers reference `tracker-app.js` unless otherwise noted.

---

## 1. Top-Level Navigation

### 1.1 Header
- **File:** `header.js` → `Header` component
- **What it does:** Persistent app-wide navigation bar with logo, page tabs (Create / Track / Stash / Stats), File dropdown (New, Open, Save, Backup/Restore), Help, Shortcuts links.
- **Frequency:** Always visible, but users interact with it rarely during a tracking session — only at session boundaries (open project, save, switch page).
- **Visual weight vs frequency:** Appropriate — sticky top bar at 48px occupies minimal space. File menu is hidden behind a dropdown.
- **Mobile / desktop:** Shown on both. Tabs may overflow on very narrow screens (<360px). Touch targets meet 44px minimum via `@media (pointer: coarse)` rule (`styles.css` L1624–1631).
- **Tag:** ✅ Already well-placed

### 1.2 ContextBar
- **File:** `header.js` → `ContextBar` component
- **What it does:** Shows project name (editable inline), dimensions, palette count, completion %, and action buttons (Edit in Creator, Save, Home).
- **Frequency:** Background reference. Users glance at progress % constantly; edit name or switch pages rarely.
- **Visual weight vs frequency:** Slightly over-weighted. The "Edit" and "Home" buttons duplicate Header functionality. Progress % is also shown in the progress bar below.
- **Mobile / desktop:** Both. On mobile the inline name editor may be fiddly — small tap target.
- **Tag:** 🔄 Keep but demote — merge progress info into one location; consider collapsing into the Header or making it contextually dismissible.

---

## 2. Pill Toolbar (Tool Strip)

**File:** `tracker-app.js` L3417–3590 (approx), rendered as `<div className="toolbar-row">` → `<div className="pill">`.
**CSS:** `styles.css` L187–199 (`.pill`, `.pill .tb-btn`).

The pill toolbar is the primary control surface. It contains **~15 interactive elements** in a single horizontal row.

### 2.1 Cross Stitch Button
- **What it does:** Activates full cross-stitch tracking mode (tap/click = mark done).
- **Frequency:** Always needed — this is the default and primary mode.
- **Visual weight:** Green highlight when active — correctly prominent.
- **Tag:** ✅ Keep prominent

### 2.2 Half Stitch Menu (dropdown)
- **What it does:** Dropdown with 3 sub-tools: Half /, Half \, Erase half.
- **Frequency:** Rarely — half stitches are an advanced feature used on specific patterns.
- **Visual weight:** Takes as much space as the Cross button. Blue highlight when active.
- **Mobile:** Dropdown requires precise tap on small chevron.
- **Tag:** 🔽 Keep but demote — could collapse into an overflow or "Advanced marking tools" group.

### 2.3 Navigate (Nav) Button
- **What it does:** Switches to navigate mode (click = place crosshair guide, no stitch marking).
- **Frequency:** Occasionally — used to orient, place parking markers, or review pattern without accidentally marking.
- **Visual weight:** Proportionate.
- **Tag:** ✅ Keep prominent

### 2.4 Range Button (⊞ Range)
- **What it does:** Enables rectangle-select mode for batch marking. Only visible in track mode.
- **Frequency:** Occasionally — useful for marking large completed areas.
- **Visual weight:** Proportionate. Only appears contextually.
- **Tag:** ✅ Already well-placed (conditional rendering is good)

### 2.5 View Mode Buttons (Sym / Col+Sym / HL)
- **What it does:** Three toggle buttons switching between Symbol view, Colour+Symbol view, and Highlight (single-colour focus) view.
- **Frequency:** Highlight mode is used very frequently (focus on one colour at a time is a core workflow — Pattern Keeper's #1 praised feature). Symbol/Colour toggle is used occasionally.
- **Visual weight:** All three presented equally in the toolbar. Highlight deserves more prominence.
- **Mobile:** Three separate buttons on small screens are tight.
- **Tag:** 🔄 Relocate — consider making Highlight mode the default or giving it a more prominent, differentiated button. Symbol/Colour could be a right-panel setting.

### 2.6 Highlight Navigation (◀ ▶)
- **What it does:** Cycle through palette colours in highlight mode.
- **Frequency:** Very frequent — this is the primary interaction loop in highlight mode.
- **Conditional:** Only shown when `stitchView === "highlight"`.
- **Tag:** ✅ Keep prominent (when in highlight mode)

### 2.7 Zoom Controls (−, slider, +, %, Fit)
- **What it does:** 5 elements: minus button, range slider (55px wide), plus button, percentage label, Fit button.
- **Frequency:** Occasionally. Pinch-to-zoom on mobile means these are desktop-primary. "Fit" is used once per session typically.
- **Visual weight:** Takes ~140px of toolbar width — disproportionate to use frequency, especially on mobile where pinch-zoom exists.
- **Mobile:** Range slider is nearly impossible to use with fingers. ± buttons are better for touch.
- **Tag:** 🔽 Keep but demote — collapse zoom slider to just ± buttons + Fit on mobile; or hide entirely on touch devices and rely on pinch.

### 2.8 Live Session Chip
- **What it does:** Shows live session timer, stitch count, and pause state. Green when running, yellow when paused, grey when idle.
- **Frequency:** Always visible during sessions (i.e. from first stitch until save). Users glance at it but don't interact often.
- **Visual weight:** Self-contained chip — doesn't compete. Pulsing green dot draws the eye appropriately.
- **Tag:** ✅ Already well-placed — but duplicated in the right panel's Session section as well.

### 2.9 Preview Button (👁 eye icon)
- **What it does:** Opens realistic stitch preview modal.
- **Frequency:** Rarely — a "reward" feature checked maybe once per session to see progress.
- **Visual weight:** Small icon button — appropriate.
- **Tag:** 🔽 Keep but demote — could move to overflow menu or right-panel actions.

### 2.10 Thread Usage Toggle (globe icon)
- **What it does:** Toggles confetti/isolation heat-map overlay and a dropdown (Cluster size / Isolation distance).
- **Frequency:** Rarely — an analytical tool.
- **Visual weight:** Takes toolbar space including a sub-dropdown. Over-weighted for frequency.
- **Tag:** 📦 Relocate to dropdown/menu — belongs in a "View settings" or "Analysis" panel, not the primary toolbar.

### 2.11 Undo/Redo (↩ ↪)
- **What it does:** Undo/redo stitch marking.
- **Frequency:** Occasionally — Ctrl+Z keyboard shortcut is likely the primary path. Buttons are backup.
- **Conditional:** Only shown when undo/redo stacks are non-empty.
- **Tag:** ✅ Already well-placed (conditional show is good)

### 2.12 Layers Button + Dropdown
- **What it does:** Dropdown panel listing 7 layer types (Full Cross, Half Stitch, Backstitch, Quarter, Petite, French Knot, Long Stitch) with toggle/solo/opacity controls.
- **Frequency:** Rarely during typical tracking. Used when a pattern has multiple stitch types.
- **Visual weight:** Single button (appropriate), but the dropdown is feature-dense (toggle, solo, show all/hide all, per-layer badge counts).
- **Tag:** 🔽 Dropdown itself is appropriate but could be simplified — most users only need Full/Half/Backstitch toggles.

---

## 3. Progress Bar

**File:** `tracker-app.js` L3606–3617.
**CSS:** `styles.css` — `.tb-progress`, `.tb-progress-bar`, `.tb-progress-fill`.

- **What it does:** Thin progress bar showing completion %. Text shows done/total counts, half-stitch counts, today's stitches, and remaining. Two-tone bar (previous + today's contribution).
- **Frequency:** Always visible. Users glance at it constantly.
- **Visual weight:** Appropriate — compact, informative.
- **Mobile / desktop:** Both. Text may overflow on narrow screens when pattern has half stitches.
- **Tag:** ✅ Keep prominent — but note duplication with ContextBar's progress % and right-panel stats.

---

## 4. MiniStatsBar

**File:** `components.js` → `MiniStatsBar`; rendered at L3618.

- **What it does:** Compact stats strip: ProgressRing, today's stitches, streak, "View all" button to open full stats.
- **Frequency:** Background glance. "View all" clicked occasionally.
- **Visual weight:** Full-width bar between progress bar and canvas. Adds ~40px of vertical height.
- **Mobile:** Every pixel of vertical space matters for canvas visibility. This bar is a significant cost.
- **Tag:** 🔽 Keep but demote — on mobile, hide by default or collapse into the progress bar. The "View all" button duplicates the Stats page tab.

---

## 5. Contextual Banners / Toasts

Multiple inline banners appear above the canvas based on state:

| Banner | Condition | Tag |
|---|---|---|
| Navigation help panel (grid of how-tos) | `showNavHelp && !isEditMode` | 🔽 Already dismissible — good |
| "Zoom in to see symbols" hint | `scs < 6 && !isEditMode` | ✅ Contextual, auto-hides |
| Edit mode warning (yellow) | `isEditMode` | ✅ Essential safety indicator |
| Keyboard shortcuts hint | `!shortcutsHintDismissed` | 🔽 Good — one-time, dismissible |
| Track mode instructions | `stitchMode === "track" && !halfStitchTool` | 🔄 Verbose — could be shorter |
| Half stitch instructions | `halfStitchTool` | ✅ Contextual |
| Navigate mode instructions | `stitchMode === "navigate"` | ✅ Contextual |
| Range mode instructions | `rangeModeActive` | ✅ Contextual |
| "Advance" toast (colour complete) | `advanceToast` | ✅ Celebratory, auto-hides |
| Half stitch onboarding (3-step) | `showHalfOnboarding` | ✅ Progressive disclosure |
| Half stitch same-colour toast | `halfToast` | ✅ Contextual |
| Session onboarding | `!sessionOnboardingShown && first stitch` | ✅ One-time |
| Session saved toast | `sessionSavedToast` | ✅ Transient |
| "Tap any stitch" first-use hint | `doneCount === 0 && totalStitchable > 0` | ✅ One-time |

**Observation:** In the worst case, 3–4 banners can stack simultaneously (e.g. track instructions + keyboard hint + session onboarding + zoom hint), consuming ~120px of vertical space above the canvas. On mobile, this pushes the canvas partly below the fold.

**Tag (overall):** 🔄 Reduce stacking — implement a single banner slot with priority queue, or move hints to tooltips/overlays.

---

## 6. Canvas Area

**File:** `tracker-app.js` L3783–3842 (scroll container + canvas + overlays).
**CSS:** `.cs-main`, `.canvas-area`.

### 6.1 Column/Row Number Headers
- **What it does:** Sticky row and column number rulers (1-indexed, bold at 10s, semi-bold at 5s).
- **Frequency:** Background reference — users glance occasionally.
- **Gutter width:** 28px (constant `G = 28`).
- **Tag:** ✅ Essential for navigation

### 6.2 Main Canvas (`<canvas ref={stitchRef}>`)
- **What it does:** The core interaction surface — renders the pattern grid, symbols, colours, done state.
- **Frequency:** Continuous — this is the primary touch/click target.
- **Tag:** ✅ Must maximise screen area for this

### 6.3 Thread Usage Overlay Canvas
- **What it does:** Semi-transparent coloured overlay showing confetti/isolation heatmap.
- **Conditional:** Only when `threadUsageMode` is set.
- **Tag:** ✅ Appropriate — overlay on canvas, not separate UI

### 6.4 Recommendation Border Overlay Canvas
- **What it does:** Draws region borders for spatial analysis recommendations.
- **Conditional:** Only when `recEnabled`.
- **Tag:** ✅ Appropriate — overlay on canvas

### 6.5 Range Anchor Indicator
- **What it does:** Pulsing blue border on the anchor cell during range selection.
- **Tag:** ✅ Appropriate

### 6.6 Hover Crosshair Highlights
- **What it does:** Row + column highlight bands that follow cursor position.
- **Tag:** ✅ Helpful navigation aid

---

## 7. Status Bar (below canvas)

**File:** `tracker-app.js` L3851–3857.

- **What it does:** Dark bar showing current hover position (Row X, Col Y) and hovered stitch info (DMC ID, name).
- **Frequency:** Constant passive reference on desktop. Less useful on mobile (no hover).
- **Visual weight:** 30px tall, always shown.
- **Mobile:** Shows "—" perpetually on touch devices since there's no hover. Wastes space.
- **Tag:** 🔽 Keep but demote — hide on touch devices; or only show on hover (already technically the case, but the empty bar wastes space).

---

## 8. Right Panel (`.rpanel`)

280px wide, sticky sidebar. Contains multiple sections. **Hidden on narrow screens** — but there's no explicit mobile alternative (no drawer/bottom sheet). On screens <600px the layout stacks but the rpanel still renders at full width.

### 8.1 Suggestions Section
- **What it does:** AI-powered "next best region" recommendations from spatial analysis. Shows top suggestions + quick-win colours.
- **Frequency:** Occasional — users may check once, then ignore or dismiss.
- **Visual weight:** Prominent — first section in the panel, with coloured cards, dismiss buttons, expand buttons.
- **Tag:** 🔽 Keep but demote — valuable feature but occupies prime panel space. Could move below Colours.

### 8.2 Thread Usage Summary
- **What it does:** Detailed confetti/cluster statistics with colour legend.
- **Conditional:** Only when `threadUsageMode` is active.
- **Tag:** ✅ Appropriate — conditional rendering

### 8.3 Session Stats Card
- **What it does:** Live session card showing time, stitches, speed (st/min), and total time.
- **Frequency:** Frequent glancing.
- **Visual weight:** Teal-tinted card — appropriately visible.
- **Duplication:** Session info also shown in toolbar chip (2.8).
- **Tag:** 🔄 Keep but consolidate — deduplicate with toolbar chip.

### 8.4 View Mode Section
- **What it does:** View toggle buttons (Symbol/Colour/Highlight), "Lock detail" checkbox, highlight mode sub-options (Isolate/Outline/Tint/Spot), dim/tint/opacity sliders, colour cycling arrows, "Skip done" and "Started" checkboxes.
- **Frequency:** Mixed. View toggle = occasionally. Highlight sub-modes = rarely. Dim sliders = set once, rarely adjusted.
- **Visual weight:** Very dense — up to 8 interactive elements in one section. Competes with the toolbar's own view buttons.
- **Duplication:** View toggle buttons appear BOTH in the toolbar (2.5) AND here in the right panel.
- **Tag:** 📦 Relocate / consolidate — remove duplication. View toggle should live in one place. Advanced highlight settings (Isolate/Outline/Tint/Spot, sliders) should be tucked behind a "Settings" expander.

### 8.5 Colours List
- **What it does:** Scrollable list of all palette colours showing swatch, symbol, DMC ID, name, progress bar, done/total count, and "✓" button to mark all done.
- **Frequency:** Frequent — primary colour reference and focus-colour selector.
- **Visual weight:** Takes remaining panel height (max-height via flex). Dense but functional.
- **Tag:** ✅ Keep prominent

### 8.6 Actions Row
- **What it does:** Two buttons: "Summary" (copy progress text) and "Edit" (switch to creator).
- **Frequency:** Rarely.
- **Tag:** 🔽 Keep but demote — move to overflow/file menu.

---

## 9. Below-Canvas Sections

These sections render below the canvas + right-panel layout, inside `<div style={{maxWidth:1100}}>`.

### 9.1 Thread Organiser (collapsible Section)
- **What it does:** Full thread management: owned/to-buy status for each colour, skein counts, global stash badges, alternative thread suggestions (ΔE-based), copy shopping list, "Kit This Project", "Own All", "Clear".
- **Frequency:** Used at session boundaries (before starting a project, occasionally mid-project).
- **Visual weight:** Large — scrollable list of all colours with 5+ interactive elements per row, plus action buttons.
- **Mobile:** Dense. Touch targets on status toggle buttons are tight.
- **Tag:** 📦 Move to different section entirely — this is a supply-management feature, not a tracking feature. Belongs in the Stash Manager or a dedicated "Project Supplies" tab.

### 9.2 Project Info (collapsible Section)
- **What it does:** 2×3 grid of metadata: pattern size, total cells, stitchable, skipped, colours, skeins needed.
- **Frequency:** Glanced once when starting a project, then almost never.
- **Visual weight:** Moderate — collapsed by default would be ideal.
- **Tag:** 🔽 Keep but demote — collapse by default or move to an "Info" tab/modal.

### 9.3 Save/Load Buttons
- **What it does:** "Save Project (.json)" and "Load Different Project" buttons at the very bottom.
- **Frequency:** Session boundaries only.
- **Duplication:** Save duplicates Header File menu. Load duplicates Header File menu.
- **Tag:** 📦 Remove from here — already accessible via Header. Adding a secondary unanchored location is confusing.

---

## 10. Modals

### 10.1 TrackerPreviewModal
- **File:** `tracker-app.js` L11–224 → `TrackerPreviewModal`.
- **What it does:** Full-screen realistic stitch preview with quality tier selector (1–4).
- **Frequency:** Rarely — once per session for satisfaction.
- **Tag:** ✅ Already well-placed (modal overlay)

### 10.2 StatsContainer / StatsDashboard / GlobalStatsDashboard
- **File:** `components.js`.
- **What it does:** Full stats view with tabs (Global Stats, Project Stats, Project Comparison), charts, timelines, goals, streaks.
- **Rendered at:** L3695 — replaces the canvas area when `statsView === true`.
- **Frequency:** Checked periodically — between sessions.
- **Tag:** ✅ Already well-placed (replaces main content area)

### 10.3 PDF Export Modal
- **Rendered via:** `setModal('pdf_export')` — triggered from Header File menu.
- **Tag:** ✅ Already well-placed

### 10.4 Help / Shortcuts Modals
- **File:** `modals.js`.
- **Tag:** ✅ Already well-placed

### 10.5 NamePromptModal
- **What it does:** Prompts for project name on first save.
- **Tag:** ✅ Already well-placed

### 10.6 Image Import Dialog
- **File:** `tracker-app.js` L4135+ — inline modal for importing images directly into the tracker.
- **What it does:** Full import pipeline: preview, dimension sliders, colour count, fabric count, skip-background, aspect ratio lock.
- **Note:** This is a significant amount of pattern-creation logic embedded in the tracker. It allows importing a new pattern from an image, essentially duplicating creator functionality.
- **Tag:** 📦 Relocate — this belongs in the Creator, not the Tracker. A "Import & Track" shortcut could redirect through the Creator flow.

### 10.7 Edit Mode — Cell Edit Popover / Thread Selector
- **What it does:** When in edit mode, tapping a cell shows a colour change UI; tapping a palette row opens a DMC thread selector.
- **Tag:** ✅ Appropriate — contextual, only in edit mode.

### 10.8 Celebration Overlay
- **What it does:** Confetti animation when milestones are hit (25%, 50%, 75%, 100%).
- **Tag:** ✅ Delightful, non-blocking

---

## 11. Shared Components Used by Tracker

| Component | File | Used for | Tag |
|---|---|---|---|
| `Section` | `components.js` | Collapsible sections (Thread Organiser, Project Info) | ✅ |
| `ProgressRing` | `components.js` | Circular progress in MiniStatsBar | ✅ |
| `MiniStatsBar` | `components.js` | Stats bar between progress bar and canvas | 🔽 Demote on mobile |
| `SliderRow` | `components.js` | Sliders in import dialog and highlight settings | ✅ |
| `Tooltip` / `InfoIcon` | `components.js` | Help tooltips | ✅ |
| `OverviewCards` | `components.js` | Stats dashboard cards | ✅ |
| `CumulativeChart` | `components.js` | SVG progress-over-time chart | ✅ |
| `DailyBarChart` | `components.js` | SVG daily bar chart | ✅ |
| `SpeedTrendChart` | `components.js` | SVG speed chart | ✅ |
| `SessionTimeline` | `components.js` | Session history list | ✅ |
| `GoalTracker` | `components.js` | Goal setting UI | ✅ |
| `StreaksPanel` | `components.js` | Streak display | ✅ |
| `ColourProgress` | `components.js` | Per-colour progress table | 🔄 Duplicates rpanel colour list |
| `StatsContainer` | `components.js` | Stats tabs wrapper | ✅ |

---

## Summary: Duplication Map

| Feature | Location 1 | Location 2 | Location 3 |
|---|---|---|---|
| Completion % | ContextBar | Progress bar | MiniStatsBar ProgressRing |
| View mode toggle | Pill toolbar (Sym/Col/HL) | Right panel View section | — |
| Session info | Pill toolbar chip | Right panel Session section | — |
| Save | Header File menu | ContextBar | Bottom save button |
| Edit in Creator | ContextBar | Right panel Actions | — |
| Colour list | Right panel Colours | Below-canvas Thread Organiser | Stats → ColourProgress |
| Home navigation | Header logo | ContextBar Home | — |

**Key takeaway:** The tracker has 3 distinct "layers" of chrome (Header + ContextBar + Pill Toolbar + Progress Bar + MiniStatsBar) stacking to **~170px of fixed vertical space** before the canvas even begins. On a typical mobile screen (700px viewport), that leaves only **~530px** for the canvas — and if 2–3 contextual banners are showing, it drops to **~400px**.
