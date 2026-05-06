# Cross-Cutting: Loading, Empty, & Partial States

> Phase 2 cross-cutting output.

## Scope

This specification documents the visual and interaction patterns for LOADING, EMPTY, PARTIAL, and ERROR states across all data-driven screens in stitchx. For each component and element, we identify:

- **LOADING**: What renders while data is being fetched, computed, or imported (spinner, skeleton, placeholder)
- **EMPTY**: What renders when a dataset is truly empty (no projects, no threads, no stitches)
- **PARTIAL**: What renders during incomplete asynchronous operations (pattern generation stages, PDF export progress)
- **ERROR**: What renders on failure (cross-references error-handling cross-cutting spec; summarised here)
- **WHICH EL-ID**: The element owner responsible for rendering each state

**Not all empty/loading states currently exist in code.** This spec identifies gaps as defect targets (P0â€“P4 severity).

---

## Per-Component State Matrix

| Component | EL-ID | LOADING | EMPTY | PARTIAL | ERROR | Code ref |
|---|---|---|---|---|---|---|
| **HOME AREA** | | | | | | |
| Home Dashboard â€” Projects list | EL-SCR-001-05 | None (list loads sync from IndexedDB) | "No active project" card + "Pick a project below" CTA | N/A | N/A | [home-app.js:132â€“245](home-app.js#L132-L245) |
| Home Dashboard â€” Project count badge | EL-SCR-001-03 | Hidden; count always 0 or N | Hides if count === 0 | N/A | N/A | [home-app.js:170â€“180](home-app.js#L170-L180) |
| Home Create tab â€” Generate pending | EL-SCR-002-XX | Spinner (3s debounce) + "Generating patternâ€¦" label | N/A | CSS spinner, `height: 60px`, `background: url(spinner)` | User sees error toast if generation fails | [home-app.js:585â€“595](home-app.js#L585-L595) |
| Home Stash tab â€” Inventory glance | EL-SCR-003-XX | None (loads sync from IDB on tab click, async after) | "Your stash is empty. Add threads in the Stash Managerâ€¦" + CTA link | N/A | N/A | [home-app.js:600â€“612](home-app.js#L600-L612) |
| Home Stash tab â€” Shopping list card | EL-SCR-003-XX | None (loads async) | "Nothing on your shopping list." (tertiary grey, 11px) | N/A | N/A | [home-app.js:654](home-app.js#L654) |
| Home Stash tab â€” Coverage card | EL-SCR-003-XX | None (loads async) | "No patterns are fully covered by your stash yet." (tertiary grey) | N/A | N/A | [home-app.js:685](home-app.js#L685) |
| Home Stats tab â€” Activity | EL-SCR-004-XX | None (loads on tab click) | "No stitching data yet." (secondary grey, 15px, `marginBottom: var(--s-3)`) | N/A | N/A | [home-app.js:797](home-app.js#L797) |
| Home Stats tab â€” Insights | EL-SCR-004-XX | None | "No completed projects." (secondary grey) | N/A | N/A | [home-app.js:776](home-app.js#L776) |
| **CREATOR AREA** | | | | | | |
| Creator Pattern Canvas â€” before image | EL-SCR-010-01 | Blank canvas (transparent background) | Shows "Drag image here" CTA overlay or ImportWizard empty state | N/A | If image fails to load, shows error toast | [creator-main.js:L300â€“L400](creator-main.js#L300-L400) |
| Creator Canvas â€” during generation | EL-SCR-010-01 | Overlaid spinner + stage label ("Quantisingâ€¦", "Matchingâ€¦", "Ditheringâ€¦") | N/A | Deterministic progress (stage + current/total steps shown in label) | Toast on error; canvas reverts to pre-generate state | [creator/generate.js](creator/generate.js) + [creator-main.js](creator-main.js) |
| Creator Sidebar palette â€” empty pattern | EL-SCR-012-XX | None | Shows "Create or import a pattern to start" or icon + message | N/A | N/A | [creator/Sidebar.js](creator/Sidebar.js) |
| Creator Sidebar palette â€” all unused | EL-SCR-012-XX | None | Sorted list of unused colours; section header shows "(X unused)" in secondary grey | N/A | N/A | [creator/Sidebar.js](creator/Sidebar.js) |
| Creator Legend tab â€” no palette | EL-SCR-007-XX | None | Shows "No pattern loaded" or similar placeholder | N/A | N/A | [creator/LegendTab.js](creator/LegendTab.js) |
| Creator Legend tab â€” only blends | EL-SCR-007-XX | None | Legend table shows blend rows; solid colour section is empty or hidden | N/A | N/A | [creator/LegendTab.js](creator/LegendTab.js) |
| Creator Export tab â€” no project active | EL-SCR-008-XX | None | Shows "Create or open a pattern to export" or similar | N/A | N/A | [creator/ExportTab.js](creator/ExportTab.js) |
| Creator Export tab â€” PDF generation | EL-SCR-008-XX | N/A | N/A | "Generating PDFâ€¦ X of Y pages" (deterministic progress) | Toast on export error | [creator/ExportTab.js:519](creator/ExportTab.js#L519) |
| Creator Realistic Preview â€” not yet computed | EL-SCR-021-XX | Spinner + "Computing previewâ€¦" | N/A | N/A | N/A | [creator/RealisticCanvas.js](creator/RealisticCanvas.js) |
| Creator Magic Wand panel â€” no selection | EL-SCR-019-XX | N/A | Panel hidden; only shows when `cv.hasSelection === true` | N/A | N/A | [creator/MagicWandPanel.js](creator/MagicWandPanel.js) |
| Creator Adapt Modal â€” loading proposal | EL-SCR-014-XX | Spinner in table header or skeleton rows | N/A | N/A | Modal shows error message if stash lookup fails | [creator/AdaptModal.js](creator/AdaptModal.js) |
| Creator Adapt Modal â€” no matches in stash | EL-SCR-014-04a | N/A | "No match within threshold" in Target column (italic grey) or "Nothing in stash" or "No equivalent" | N/A | N/A | [creator/AdaptModal.js](creator/AdaptModal.js) |
| Creator BulkAdd Modal â€” accepting files | EL-SCR-015-XX | Spinner + upload progress (if visible from file reader) | N/A | Progress bar or percentage (if multi-file) | Toast on upload/parse error | [creator/BulkAddModal.js](creator/BulkAddModal.js) |
| Creator Shopping List Modal â€” no pattern | EL-SCR-017-XX | None | "Create or import a pattern first" (secondary grey, tertiary link to materials hub) | N/A | N/A | [creator/ShoppingListModal.js](creator/ShoppingListModal.js) |
| Creator Shopping List Modal â€” all threads owned | EL-SCR-017-XX | None | Green banner "You own all colours!" or similar | N/A | N/A | [creator/ShoppingListModal.js](creator/ShoppingListModal.js) |
| Creator ImportWizard Step 1 â€” no image | EL-SCR-018a-XX | N/A | "Drag an image here" overlay + "Or click to browse" link | N/A | N/A | [creator/ImportWizard.js](creator/ImportWizard.js) |
| Creator ImportWizard Step 4 â€” preview generating | EL-SCR-018d-XX | Spinner + "Generating previewâ€¦" | N/A | Progress indicator if available | Toast on failure; skip to next step | [creator/ImportWizard.js](creator/ImportWizard.js) |
| Creator Colour Replace Modal â€” searching | EL-SCR-016-XX | None (search is instant client-side) | "No colours found" (centred, secondary grey, 12px) | N/A | N/A | [creator/ColourReplaceModal.js](creator/ColourReplaceModal.js) |
| **TRACKER AREA** | | | | | | |
| Tracker Canvas â€” no project selected | EL-SCR-024-01 | None | Shows "No saved projects yet" or similar placeholder overlay | N/A | N/A | [tracker-app.js:497](tracker-app.js#L497) |
| Tracker Canvas â€” pattern loaded, no stitches done | EL-SCR-024-01 | None | Shows 0% progress label + empty progress bar + optional tutorial overlay | N/A | N/A | [tracker-app.js](tracker-app.js) |
| Tracker Canvas â€” pattern loaded, all done | EL-SCR-024-01 | None | Shows 100% + green progress bar + optional completion badge/animation | N/A | N/A | [tracker-app.js](tracker-app.js) |
| Tracker Colours Drawer â€” zero stitches done for any thread | EL-SCR-025-XX | None | Shows "No threads in this pattern" or similar (secondary grey) | N/A | N/A | [tracker-app.js:732](tracker-app.js#L732) |
| Tracker Colours Drawer â€” no stash data synced | EL-SCR-025-XX | None | Thread rows show owned counts as N/A or "â€“" | N/A | N/A | [tracker-app.js](tracker-app.js) |
| Tracker Stats Dashboard â€” no sessions yet | EL-SCR-028-XX | None | "No session data" (secondary grey) | N/A | N/A | [components.js:494](components.js#L494) |
| Tracker Stats Dashboard â€” stats loading | EL-SCR-028-XX | Spinner + "Computing statsâ€¦" | N/A | N/A | N/A | [components.js](components.js) |
| **MANAGER AREA** | | | | | | |
| Manager Threads tab â€” no threads in stash | EL-SCR-029-04 | None (loads sync from IDB) | EmptyState component: "Your stash is empty" title + description + "Bulk add threads" CTA button | N/A | N/A | [manager-app.js:1093â€“1100](manager-app.js#L1093-L1100) |
| Manager Threads tab â€” search returns empty | EL-SCR-029-04 | None | Grey text "No threads found" (secondary grey, centred in grid) | N/A | N/A | [manager-app.js](manager-app.js) |
| Manager Threads tab â€” brand filter returns empty | EL-SCR-029-04 | None | "No threads found" + secondary text (e.g., "Switch filter to 'All' or 'DMC' to see threads") | N/A | N/A | [manager-app.js](manager-app.js) |
| Manager Patterns tab â€” no patterns in library | EL-SCR-030-XX | None (loads sync from IDB) | EmptyState component: "Your pattern library is empty" + description + "Create first pattern" CTA | N/A | N/A | [manager-app.js:1500â€“1502](manager-app.js#L1500-L1502) |
| Manager Patterns tab â€” search returns empty | EL-SCR-030-XX | None | "No patterns found" (secondary grey) | N/A | N/A | [manager-app.js](manager-app.js) |
| Manager Patterns tab â€” status filter returns empty | EL-SCR-030-XX | None | "No patterns in this status" (e.g., "No Completed patterns") | N/A | N/A | [manager-app.js](manager-app.js) |
| **SHARED SHELL AREA** | | | | | | |
| Help Drawer â€” search results | EL-SCR-037a-XX | None (search is instant client-side) | "No matching help topics." (centred, secondary grey, `fontSize: var(--text-sm)`) | N/A | N/A | [help-drawer.js](help-drawer.js) |
| Command Palette â€” recent actions loading | EL-SCR-038-XX | "Loadingâ€¦" (centred, tertiary grey, 13px) | N/A | N/A | N/A | [command-palette.js:439](command-palette.js#L439) |
| Command Palette â€” no matching actions | EL-SCR-038-XX | N/A | "No matching actions." (centred, tertiary grey, 13px, `padding: 24px 16px`) | N/A | N/A | [command-palette.js:437â€“440](command-palette.js#L437-L440) |
| Preferences Modal â€” theme loading | EL-SCR-039-XX | Spinner on theme toggle | N/A | N/A | N/A | [preferences-modal.js](preferences-modal.js) |
| Backup/Restore Modal â€” scanning backups | EL-SCR-043-XX | "Scanning backupsâ€¦" (spinner + label) | N/A | N/A | Toast on scan error | [backup-restore.js](backup-restore.js) |
| Toast notifications | EL-SCR-047-XX | N/A | (Not applicable â€” toasts only render when present) | N/A | Error toasts show failure reason + optional retry button | [toast.js](toast.js) |

---

## Patterns Observed

### 1. **IndexedDB Operations Are Synchronous-Looking**

Most data loads from IndexedDB without showing explicit spinners because:
- IndexedDB reads are fast on most hardware (< 100ms)
- Data is cached in React state immediately after mount
- No network round-trip latency

**Examples**: Home Projects list, Manager Threads/Patterns tab.

**Problem**: On slower devices (older tablets), IndexedDB reads may block the main thread briefly. Currently, no skeleton or timeout-to-spinner fallback exists.

---

### 2. **Web Worker Computations Show Deterministic Progress**

Creator pattern generation, PDF export, and image analysis use Web Workers. Progress is communicated via postMessage events, allowing **stage-based labels** ("Quantisingâ€¦ 45%", "Matchingâ€¦ 33 of 98 colours").

**Current implementation**: 
- `generate-worker.js` emits progress events 
- `pdf-export-worker.js` emits page-count progress
- Parent thread debounces at 500ms before rerendering

**Problem**: Progress labels are generic; end users don't know if "Dithering" will take 1 second or 10 seconds.

---

### 3. **Empty States Use `EmptyState` Component or Raw Text**

**Unified pattern** (components.js line 2123â€“2153):
```javascript
function EmptyState(props) {
  return h('div', { className: 'cs-empty-state' },
    props.icon && h('div', { className: 'cs-empty-state__icon' }, props.icon),
    h('h3', { className: 'cs-empty-state__title' }, props.title),
    props.description && h('p', { className: 'cs-empty-state__desc' }, props.description),
    props.cta && h('button', { className: 'g-btn g-btn--primary', onClick: props.onCta }, props.cta)
  );
}
window.EmptyState = EmptyState;
```

**Used by**: Manager (Threads/Patterns), Home (if no projects). Provides icon (from Icons.js), title, description, and optional CTA button.

**Not used**: Many components fall back to raw `<p>` tags with secondary grey text instead. Inconsistent styling and no icon affordance.

---

### 4. **Search/Filter Empty States Are Context-Dependent**

- **"No matches for query"**: When user has a non-empty search
- **"Nothing in this filter"**: When filter is applied but empty
- **"[Category] is empty"**: When no data exists at all

**Examples**: 
- Help Drawer search: "No matching help topics."
- Command Palette: "No matching actions."
- Manager Threads with brand filter: "No threads found" (context-dependent message)

**Problem**: Message phrasing varies per component; no centralised copy guidelines.

---

### 5. **PDF and Worker-Based Export Show Progress, But Not Deterministic ETA**

**Current**: "Generating PDFâ€¦ X of Y pages" (numeric progress).

**Gap**: No estimated time remaining; no pause/cancel button; if stuck, user has no feedback whether the worker is hung or just slow.

---

### 6. **Partial States for Half-Stitches, Park Markers, and Partial Coverage**

Tracker supports:
- **Half-stitches**: sparse Map storage; partial stitches rendered as small indicators
- **Park markers**: coloured overlays on cells
- **Partial stitch completion**: cells can be 0 (not done), 1 (full), 0.5 (half-done)

**Empty state**: If no park markers exist, nothing is rendered (not a separate UI state).

**Problem**: User can't distinguish "no park markers set" from "park layer just disabled"; no affordance to add first marker.

---

### 7. **Palette Initialization Is Inconsistent**

- **Creator**: Shows "empty palette" placeholder if no image imported
- **Manager**: Doesn't show palette (patterns are reference-only)
- **Adapt Modal**: Shows skeleton row or spinner while auto-matching

**Problem**: No unified pattern for "palette loading" across tools.

---

### 8. **Error States Delegate to Toasts or Modal Alerts**

Rather than inline error states, the codebase favours:
- Toast notifications (non-blocking, dismissible, auto-timeout)
- Modal alerts (blocking, require user action)
- Retry buttons on failed save state badge (Creator only)

**Example**: Image import fails â†’ Toast: "Image not supported. Try a JPEG or PNG."

**Problem**: Error details are lost if user scrolls away before dismissing toast. No persistent error log.

---

## Gaps

The following empty/loading states are **missing or incomplete** in the current codebase:

### P0 â€” Broken or Critical

| Defect ID | Component | Issue | UX Impact |
|---|---|---|---|
| **GAP-P0-001** | Home Dashboard â€” project list | Home landing with ZERO projects shows empty Projects list with no CTA. New users land on blank screen. | User doesn't know how to create first project; may bounce. |
| **GAP-P0-002** | Creator Canvas â€” pattern generation progress | Generator stages ("Quantising", "Matching", "Dithering") show no indicator of work or timeframe. If >15s, user may assume hung. | User doesn't know whether to wait or restart. |
| **GAP-P0-003** | Tracker Canvas â€” no project loaded | Blank canvas; "No saved projects yet" message may be invisible at small font sizes. | User confused; may think app is broken. |

### P1 â€” Misleading or Confusing

| Defect ID | Component | Issue | UX Impact |
|---|---|---|---|
| **GAP-P1-001** | Manager Threads â€” filter returns empty | Showing "No threads found" doesn't clarify if user's stash is actually empty vs. filter too narrow. | User may give up, not realizing they can widen filter. |
| **GAP-P1-002** | Creator Adapt Modal â€” stash lookup | Modal shows no skeleton rows while computing proposals; table appears blank until ready. | User unsure if modal froze or is computing. |
| **GAP-P1-003** | Help Drawer â€” search results empty | "No matching help topics." doesn't suggest refining query or browsing by topic. | User leaves drawer to avoid appearing stuck. |
| **GAP-P1-004** | Tracker half-stitch mode â€” no markers placed | User enters park-marker mode but sees no affordance to place first marker. | User confused about how to place markers. |
| **GAP-P1-005** | Creator Legend tab â€” blend-only palette | Legend shows only blend rows; header says "No solids" but context is unclear. | User unsure if blend-only is intentional or error. |

### P2 â€” Suboptimal Performance or UX

| Defect ID | Component | Issue | UX Impact |
|---|---|---|---|
| **GAP-P2-001** | Home Stash/Stats tabs â€” lazy-load delay | Tabs load async after click; no skeleton or placeholder between click and data arrival (IndexedDB, ~100ms on tablet). | Perceived lag; user may click tab again (double-click). |
| **GAP-P2-002** | Creator PDF export â€” progress ETA | "Generating PDFâ€¦ X of Y pages" doesn't show estimated time remaining. | User can't estimate how long to wait. |
| **GAP-P2-003** | Command Palette â€” loading indicator timing | Shows "Loadingâ€¦" for recent actions, but on fast devices, flickers briefly; on slow devices, no timeoutâ†’fallback. | Inconsistent perceived performance; potential flicker on 3G/slow networks. |
| **GAP-P2-004** | Manager â€” background stash sync indicator | No feedback when `StashBridge` is syncing changes from Tracker. | User doesn't know if thread counts are live or stale. |
| **GAP-P2-005** | Tracker â€” IndexedDB load on tablet | Tracker loads project data on mount; on old iPad, blocking the main thread briefly (no spinner fallback). | UI feels sluggish for 1â€“2s; user perceives jank. |

### P3 â€” Nice-to-Have or Accessibilty

| Defect ID | Component | Issue | UX Impact |
|---|---|---|---|
| **GAP-P3-001** | Shared â€” empty list typography | Empty state messages use varying font sizes and colours; no centralised design token. | Inconsistent visual hierarchy across app. |
| **GAP-P3-002** | Creator Sidebar â€” palette section collapse | Unused colours section doesn't collapse when empty; takes up space. | Visual clutter; less real estate for canvas. |
| **GAP-P3-003** | Creator Realistic preview â€” fallback rendering | If preview fails to compute, canvas shows "Error" or blank; no retry button or safe fallback (e.g., symbol view). | User stranded if preview worker crashes. |

### P4 â€” Future Enhancements

| Defect ID | Component | Issue | Future Impact |
|---|---|---|---|
| **GAP-P4-001** | Home Create tab â€” image processing stages | "Generating patternâ€¦" doesn't break down image processing pipeline (decode, filter, analysis, quantize). | Future enhancement for transparency in generation. |
| **GAP-P4-002** | Manager â€” bulk import progress | BulkAdd modal doesn't show per-file progress if importing large thread lists. | Future enhancement if users bulk-import >100 threads. |
| **GAP-P4-003** | Tracker â€” park marker affordance | First time placing marker has no guided tutorial or affordance; user may not discover feature. | Future onboarding enhancement via Coachmark. |

---

## Discovered.md Appendix

**Cross-references to existing discoveries** (from repository memory):

- **Preferences**: `UserPrefs.get(key)` falls back to `DEFAULTS[key]` even if localStorage is missing. Code that detects "first run" must use `localStorage.getItem('cs_pref_' + key)` directly.
- **Accessibility**: `HelpDrawer.open/close` dispatches a global `cs:helpStateChange` event so Header can reflect `aria-expanded` state accurately.
- **Globals**: `StashBridge` is explicitly bound to `window.StashBridge` (guarded) so feature tests via `window.StashBridge` work.
- **Codebase**: `helpers.js` defines global `fmtNum(n)` and `threadKm(stitches)`; these are relied upon by stats and home surfaces.

---

## Verification TODO

All TODOs follow the severity scale (P0â€“P4) and format: **VER-STATE-NNN** [Severity] â€” Description.

- [ ] **VER-STATE-001** [P0] â€” Home landing with zero projects shows a dedicated "Create your first project" CTA component (EmptyState style) targeting EL-SCR-001-XX, not a blank list. User can click "New project" and land in Creator with import wizard or blank canvas.

- [ ] **VER-STATE-002** [P0] â€” Creator pattern generation displays a determinate progress indicator with stage labels ("Quantising 45%", "Matching colours 2 of 5", "Dithering") and an animated spinner. Each stage â‰¤ 30s on desktop; if > 30s on tablet, show ETA countdown or "Slow device" warning.

- [ ] **VER-STATE-003** [P0] â€” Tracker canvas with no project selected shows a modal/overlay with "No saved projects yet" message (â‰¥ 16px, secondary grey) and a prominent "Open Creator" or "Select project" CTA button (44px+ touch target).

- [ ] **VER-STATE-004** [P1] â€” Manager Threads tab with empty stash displays EmptyState component with icon (Icons.thread()), title "Your stash is empty", description, and CTA "Bulk add threads" (44px+ touch target). Filter message clarifies "(No threads matching 'Anchor'" if filter is active).

- [ ] **VER-STATE-005** [P1] â€” Creator Adapt Modal shows skeleton row placeholders while auto-matching proposals (min 3 skeleton rows, each 48px tall, grey pulse animation). Once proposal completes, replaces skeleton with actual match data. If no matches, shows "No match within Î”E threshold" inline with clear fallback action (e.g., "Increase threshold").

- [ ] **VER-STATE-006** [P1] â€” Help Drawer search with no matches displays "No matching help topics. Try different keywords or browse help by topic." (centre-aligned, secondary grey, â‰¤ 13px). Includes optional suggestion to browse categories.

- [ ] **VER-STATE-007** [P1] â€” Tracker Colours Drawer with zero stitches marked displays "No threads to track yet. Mark stitches on the canvas to see colour progress here." (secondary grey, 12px, `margin: var(--s-3)`).

- [ ] **VER-STATE-008** [P2] â€” Creator PDF export progress label shows "Generating PDFâ€¦ X of Y pages (~Zs remaining)" if estimated time available; otherwise "Generating PDFâ€¦ X of Y pages". Must update â‰¤ 1s intervals. If > 60s total, show "Preparing file, please waitâ€¦" after page N.

- [ ] **VER-STATE-009** [P2] â€” Home Stash/Stats tabs show a skeleton/placeholder while loading IndexedDB data. Skeleton must be present for â‰¥ 50ms to avoid flicker on fast devices, but disappear after 3s if data hasn't arrived (timeout safeguard).

- [ ] **VER-STATE-010** [P2] â€” Command Palette shows "Loadingâ€¦" only if recent actions haven't loaded within 200ms. Must clear label once list arrives. If load takes > 5s, show error state "Couldn't load recent actions" with fallback to manual search.

- [ ] **VER-STATE-011** [P2] â€” Tracker ProjectStorage.get on app mount must not block render. If data arrives >500ms later, show spinner overlay + "Loading projectâ€¦" label until load completes or times out (10s fallback to error state).

- [ ] **VER-STATE-012** [P2] â€” Manager Threads/Patterns with brand or status filter returning zero results must show filter-specific message, e.g., "No Anchor threads found" (not generic "No threads found"). Include suggestion to change filter.

- [ ] **VER-STATE-013** [P3] â€” All empty state UI (Manager EmptyState, home "No projects", tracker "No projects", etc.) must use the shared `EmptyState` component from [components.js](components.js#L2123-L2153) with standardised styling (icon, title, description, CTA button).

- [ ] **VER-STATE-014** [P3] â€” Creator Realistic preview canvas failure (worker crash, out-of-memory, timeout) displays inline error message "Preview failed. Try reducing pattern size or switching to symbol view." with a "Retry" button that re-triggers preview generation.

- [ ] **VER-STATE-015** [P3] â€” Tracker park marker feature shows a coachmark tutorial on first use ("Long-press a cell to place a coloured marker here. Markers help you track which area you're working on.") with optional "Skip" button. After first marker, coachmark dismisses.

- [ ] **VER-STATE-016** [DISCOVERY] â€” Verify that all Toast notifications include role="alert", aria-live="polite", and aria-atomic="true" to ensure screen readers announce errors and loading completions. Link to error-handling cross-cutting spec.

- [ ] **VER-STATE-017** [DISCOVERY] â€” Document all CustomEvents fired during loading/empty state transitions (e.g., `cs:projectsChanged`, `cs:stashChanged`, `cs:prefsChanged`). Ensure no race conditions when events fire before listeners are attached.

- [ ] **VER-STATE-018** [P4] â€” Future: Add deterministic progress UI for ImportWizard image analysis stage (saliency map, bilateral filter, etc.). Currently shows spinner; enhance with substep labels ("Analyzing imageâ€¦ 20%").

- [ ] **VER-STATE-019** [P4] â€” Future: Add "Undo" action to Manager Threads bulk operations (e.g., "Remove all low-stock threads"). Currently no undo; would require snapshot before bulk mutation.

- [ ] **VER-STATE-020** [TABLET PRIORITY P2] â€” Test Creator pattern generation on iPad 2 or equivalent old tablet (slow CPU). If generation > 45s without progress update, ensure stage labels update â‰¤ 5s intervals so user perceives active work.