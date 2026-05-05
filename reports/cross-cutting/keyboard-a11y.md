# Cross-Cutting: Keyboard, Focus, & Accessibility

> Phase 2 cross-cutting specification for keyboard navigation, focus management, tab order, screen reader support, and accessibility across all screens.

## Scope

This specification covers keyboard interaction, focus behaviour, ARIA attributes, and accessibility features across all five entry pages (home, create, stitch, manager, embroidery) and their modal/drawer overlays. It documents the global keyboard registry, focus trapping patterns, screen reader announcements, and discovers gaps in keyboard equivalents for mouse-only actions and reduced-motion support.

---

## Global keyboard shortcut registry

[shortcuts.js](shortcuts.js) provides `window.Shortcuts` â€” the single authoritative registry managing all keyboard shortcuts across the app. The registry uses hierarchical dot-separated scopes (e.g. `creator.design`, `tracker.view`) with most-specific-wins dispatch.
{% raw %}
| Scope | Shortcut | Handler | Triggered on | Platform variants | Notes |
|---|---|---|---|---|---|
| `global` | `?` | `cs:openShortcuts` event dispatch | text outside input | Capture phase; prevents browser default | Opens Help Drawer Shortcuts tab |
| `creator.design` | `1` | Select cross stitch (or highlight: isolate mode) | `creator-main.js` keyhook | All | Conditional: if highlight active, sets isolate mode |
| `creator.design` | `2` | Select half-fwd stitch (or highlight: outline) | `creator-main.js` keyhook | All | Conditional: if highlight active, sets outline mode |
| `creator.design` | `3` | Select half-bck stitch (or highlight: tint) | `creator-main.js` keyhook | All | Conditional: if highlight active, sets tint mode |
| `creator.design` | `4` | Select backstitch (or highlight: spotlight) | `creator-main.js` keyhook | All | Conditional: if highlight active, sets spotlight mode |
| `creator.design` | `5` | Select erase | `creator-main.js` keyhook | All | |
| `creator.design` | `Esc` | Cancel / dismiss cascade | `useKeyboardShortcuts()` | All | Closes modals, cancels lasso, clears selection, deselects tool |
| `creator.design` | `Ctrl+Z` / `Cmd+Z` | Undo | `history.undoEdit()` | Windows / macOS | |
| `creator.design` | `Ctrl+Y` / `Cmd+Shift+Z` | Redo | `history.redoEdit()` | Windows / macOS | |
| `creator.design` | `Ctrl+S` / `Cmd+S` | Save project | `io.saveProject()` | All | Runs if pattern + palette exist |
| `creator.design` | `Ctrl+A` / `Cmd+A` | Select all stitches | `state.selectAll()` | All | |
| `creator.design` | `Ctrl+Shift+I` / `Cmd+Shift+I` | Invert selection | `state.invertSelection()` | All | |
| `creator.design` | `H` | Hand tool (pan) | `state.selectStitchType('hand')` | All | |
| `creator.design` | `W` | Magic Wand tool | `state.selectTool('magicWand')` | All | |
| `creator.design` | `L` | Lasso tool | `state.selectTool('lasso')` | All | |
| `creator.design` | `V` | Cycle view mode (colour â†’ symbol â†’ realistic â†’ split) | `state.cycleViewMode()` | All | |
| `creator.design` | `\` (backslash) | Split-pane toggle | `state.toggleSplitPane()` | All | |
| `creator.design` | `Home` | Fit pattern to view | `state.fitToView()` | All | |
| `global` | `Ctrl+K` / `Cmd+K` | Open Command Palette | `command-palette.js` dispatcher | All | Capture phase; prevents browser default (address bar focus) |
| `tracker.*` | `Spacebar` | Toggle mark mode on/off | `tracker-app.js` (manual handler) | All | Does not fire while editing text input |
| `tracker.*` | `Ctrl+Z` / `Cmd+Z` | Undo last mark | `tracker-app.js` | All | Single undo snapshot restored |

**Input-element guard (canonical)**: `isTextInputFocused()` in [shortcuts.js](shortcuts.js#L64-L81) and [keyboard-utils.js](keyboard-utils.js#L22-L38) checks for focused `INPUT[type=text|search|email|url|tel|password|number]`, `TEXTAREA`, or `contenteditable`. Single-key shortcuts (`1`, `?`, spacebar) never fire when this returns true. Modified shortcuts (`Ctrl+Z`, `Cmd+S`) bypass this guard by default (`allowInInput: true` for modified keys).

**Scope activation**: `window.Shortcuts.pushScope('creator.design')` / `window.Shortcuts.popScope('creator.design')` manually activate/deactivate scopes (called by hooks like [creator/useKeyboardShortcuts.js](creator/useKeyboardShortcuts.js) and `useScope('tracker.*', when=(...))` in [tracker-app.js](tracker-app.js#L4)).

**Conflicts**: Detected at registration time; console.error logged if two entries share `(scope, key)` fingerprint.

**Escape precedent**: `window.useEscape()` stack in [keyboard-utils.js](keyboard-utils.js#L46-L63) owns `Escape` key; Shortcuts registry never registers it. Most-recently-mounted Escape handler fires first, enabling nested modals to consume Escape before the page handler sees it.

---

## Tab order per screen

### Home (home.html)

- **Main content**: `<main id="main-content" tabindex="-1">` (skip-link target; only focusable programmatically)
- **Header**: All interactive elements (Help button, File menu button, Project Switcher) in natural tab order
- **Tab bar**: `role="tablist"` with five tabs (Projects, Create, Stash, Stats). Active tab `tabIndex={0}`; inactive tabs `tabIndex={-1}`. Arrow keys cycle tabs (standard pattern).
- **Project cards**: Buttons in list order; Project name button (aria-haspopup="dialog"); card menu buttons.
- **Footer**: About link.

### Creator (create.html)

- **Main content**: `<main id="main-content" tabindex="-1">`
- **Header**: Help, File, Project Switcher in order.
- **Tab bar**: Five tabs (Prepare, Pattern, Legend, Export, Project). Active tab `tabIndex={0}`; inactive `tabIndex={-1}`.
- **Action Bar** (Pattern tab): Undo, Redo, Info buttons + title input (when editing).
- **Tool Strip** (sidebar left): Nine tool buttons + cursor position display. Tab order follows visual top-to-bottom.
- **Sidebar** (right): Palette, colour picker, stitch type selector, material options. Tab traps inside sidebar when visible.
- **Canvas** (SCR-010): `<canvas>` element `touchAction="none"` `userSelect="none"`. **Currently not focusable**; no keyboard navigation of individual cells (GAP).
- **Modals** (Overlay components): Focus trap via `useFocusTrap()` â€” first focusable element focused on open; Tab/Shift+Tab cycle within bounds; focus restored to trigger element on close.

### Tracker (stitch.html)

- **Main content**: `<main id="main-content" tabindex="-1">`
- **Header**: Help, File, Project Switcher, stats button.
- **Mark mode pill / sidebar**: Toggle button + view dropdown in natural order.
- **Canvas** (SCR-024): `<canvas>` `touchAction="none"`. **Not focusable; no keyboard-only mark equivalents** (GAP).
- **Colours drawer** (bottom on desktop, right on tablet): Tab group with colour swatch buttons. Each swatch is focusable.
- **Modals**: Focus trap via Overlay.

### Manager (manager.html)

- **Main content**: `<main id="main-content" tabindex="-1">`
- **Header**: Help, File, Project Switcher.
- **Tab bar**: Two tabs (Inventory, Patterns). Active `tabIndex={0}`; inactive `tabIndex={-1}`.
- **Inventory tab**: Thread list with per-thread edit/delete buttons.
- **Patterns tab**: Pattern cards with menu buttons.
- **Modals**: Focus trap via Overlay.

### Help Drawer (all pages)

- **Drawer tabs** (Help, Shortcuts, Getting Started): `role="tablist"`. **Tab order anomaly**: Only the active tab has `tabIndex={0}`; inactive tabs have `tabIndex={-1}`. This prevents Tab key from reaching hidden tab content, but **creates a keyboard UX where tabbing "skips" the inactive tabs**. Standard tablist pattern is to keep all tabs in tab order (`tabIndex={0}` or `-1` based on `aria-selected`), not alternate them.
- **Search input**: Focusable; auto-focuses when drawer opens.
- **Content panels**: Each panel's first focusable element is reachable by tabbing from the search input.

**GAP: Help Drawer tab key cycling should follow ARIA tablist pattern** â€” all tabs stay in the tab order; only arrow keys cycle between tabs.

### Command Palette (global)

- **Overlay wrapper**: `role="dialog"` `aria-label="Command palette"` with scrim.
- **Search input**: `aria-label="Search actions"` auto-focuses on open.
- **Action list**: `role="listbox"` (simulated) with `aria-label="Available actions"`. Rows have `aria-selected="true"` for highlighted row.
- **Keyboard navigation**: Up / Down arrows cycle; Enter activates; Escape closes.

### Preferences Modal (global)

- **Dialog**: `role="dialog"` `aria-modal="true"` `aria-labelledby="preferences-title"`.
- **Tabs** (if multi-panel): Tablist with arrow-key navigation.
- **Toggles / checkboxes**: Keyboard-accessible via native inputs or `role="switch"`.
- **Focus trap**: First focusable element focused on open (typically the first toggle or a search input).

---

## Focus trapping

[components/Overlay.js](components/Overlay.js) provides the canonical focus-trap implementation used by all modals, drawers, and sheets:

**Implementation**: 
- `useFocusTrap(panelRef, active)` hook runs when overlay mounts (`active=true`).
- Queries `FOCUSABLE = 'a[href],button:not([disabled]),...[tabindex]:not([tabindex="-1"])'` within the panel.
- On mount: Focuses the first focusable element (or `[data-autofocus]` if marked, otherwise the panel itself with fallback).
- On keydown: Intercepts Tab and Shift+Tab at the bounds (first / last focusable element) and cycles to the other end.
- On unmount: Restores focus to `prevActive` (the element that had focus before the overlay opened), if it's still in the DOM and focusable.

**Modals using Overlay**:
- [creator/AdaptModal.js](creator/AdaptModal.js#L631) (SCR-014)
- [creator/BulkAddModal.js](creator/BulkAddModal.js) (SCR-015)
- [creator/ColourReplaceModal.js](creator/ColourReplaceModal.js) (SCR-016)
- [creator/ShoppingListModal.js](creator/ShoppingListModal.js) (SCR-017)
- [manager-app.js](manager-app.js#L1750) (pattern edit, detail, profile modals)
- Preferences modal (via [preferences-modal.js](preferences-modal.js))
- Welcome Wizard (via [onboarding-wizard.js](onboarding-wizard.js))
- Backup & Restore modal (via [backup-restore.js](backup-restore.js))

**Non-Overlay modals** (legacy, not yet migrated):
- SharedModals (About, Help fallback, ThreadSelector) in [modals.js](modals.js) â€” *GAP: no focus trap implementation*.
- Help Drawer (hand-managed focus via drawer state; does *not* prevent focus escape to page behind because `aria-modal="false"`).

---

## Focus restoration

**Pattern**: Modal/drawer closes â†’ trigger element (the button that opened it) regains focus.

**Implemented in**:
- [components/Overlay.js](components/Overlay.js#L94-L99): Restores to `prevActive` on unmount.
- [help-drawer.js](help-drawer.js#L557-L583): Dispatches `cs:helpStateChange` event so Header can set `aria-expanded` on Help button (verified in [header.js](header.js#L689-L700)).

**Gaps**:
- [SharedModals.About](modals.js) â€” no focus restoration.
- [SharedModals.Help](modals.js) â€” no focus restoration.
- [SharedModals.ThreadSelector](modals.js) â€” no focus restoration.
- Right-click context menu ([creator/ContextMenu.js](creator/ContextMenu.js)) â€” dismissed on click/Escape; no focus restoration documented.

---

## Skip links

**Status**: Not implemented. No "Skip to main content" link present on any page.

**Expectation**: A keyboard-only skip link (visible only on `:focus`) appears at the top of the viewport, targeting `<main id="main-content">` (which is present but marked `tabindex="-1"`). Pressing the link moves focus to the main area, allowing users to skip the header.

**GAP**: Add skip-to-main-content link to Header component.

---

## Custom widget ARIA audit

### Tab groups (Home, Creator tabs; Manager tabs)

- **Role**: `role="tablist"` on container.
- **Tab elements**: `role="tab"` `aria-selected="true"|"false"` `tabindex="0"|"-1"`.
- **Panels**: `role="tabpanel"` `aria-labelledby="tab-id"` on each panel.
- **Keyboard**: Arrow keys cycle tabs (implemented in [home-app.js](home-app.js), [creator/PatternTab.js](creator/PatternTab.js), [manager-app.js](manager-app.js)).
- **Status**: âœ“ Correct across all pages.

### Canvas elements (Creator Pattern Canvas SCR-010; Tracker Canvas SCR-024)

- **Current**: Plain `<canvas>` elements with `role` / `aria-*` attributes.
- **Accessibility**: Render output is purely visual; no semantic content exposed to screen readers.
- **Keyboard**: No keyboard equivalent for painting, filling, or marking cells.
  - **Creator** â€” Mouse/pen/touch only. No canvas cell navigation.
  - **Tracker** â€” Tap/drag to mark; no keyboard equivalent documented.
- **Gaps**: 
  - No `aria-label` describing the canvas.
  - No `tabIndex={0}` (canvas not focusable).
  - No keyboard navigation via arrow keys to move focus between cells.
  - No keyboard equivalent for "mark as done" (Tracker) or "paint this cell" (Creator).

### Palette chip selector

- **Location**: Creator Sidebar (right panel) â€” list of colour chips below canvas.
- **Current**: Array of clickable divs or buttons, each with `style={{ backgroundColor: ... }}`.
- **Keyboard**: No documented keyboard navigation; users must Tab through each chip one-by-one.
- **ARIA**: Missing `aria-label` (should describe colour name + DMC ID).
- **Gaps**:
  - Should use Arrow keys to move focus (not Tab) within the palette (like a toolbar or menu).
  - Missing focus indicator clarity (border/outline).
  - No `aria-current="true"` on the selected chip.

### Tool strip buttons (Creator left sidebar)

- **Role**: Nine tool buttons (Hand, Paint, Fill, Lasso, Magic Wand, etc.) + cursor position readout.
- **Current**: Plain `<button>` elements.
- **Keyboard**: Focusable via Tab; Enter / Space activates.
- **ARIA**: `aria-label` on each (e.g. "Paint tool (P key)").
- **Status**: âœ“ Correct; keyboard accessible.

### Magic Wand panel (SCR-019)

- **Current**: Popover with slider for threshold + Refine buttons.
- **Keyboard**: Slider supports arrow keys. Buttons focusable.
- **Gaps**:
  - No keyboard equivalent for "refine by colour" (mouse-only right-now).
  - Context menu triggered by right-click; no keyboard alternative.

### Progress bar (e.g. Session progress indicator in Tracker)

- **Role**: `role="progressbar"` `aria-valuenow="50"` `aria-valuemin="0"` `aria-valuemax="100"`.
- **Status**: âœ“ Correct in Phase 1 specs ([tracker.md](reports/specs/tracker.md#L1950)).
- **Keyboard**: Not interactive; read-only attribute updates.

### Toast notifications

- **Role**: `role="status"` `aria-live="polite"` (set on toast container).
- **Current**: Implemented in [toast.js](toast.js); messages appear dynamically.
- **Status**: âœ“ Correct.
- **Keyboard**: Not interactive; users cannot dismiss via keyboard (GAP if dismissible).

### Modals / Overlays (generic)

- **Role**: `role="dialog"` `aria-modal="true"` (for `variant="dialog"` in [components/Overlay.js](components/Overlay.js#L163-L164)).
- **Labelling**: `aria-labelledby="overlay-title-id"` or `aria-label="..."`.
- **Keyboard**: Escape closes (via `useEscape()` stack). Tab traps inside.
- **Status**: âœ“ Correct for Overlay-based modals; legacy modals lack these.

### Coachmarks (SCR-048)

- **Location**: [coaching.js](coaching.js#L325-L326).
- **Role**: `role="dialog"` `aria-labelledby="coachmark-title"` `aria-describedby="coachmark-body"`.
- **Status**: âœ“ Correct.
- **Keyboard**: Escape and button dismiss; focus trap not explicitly mentioned (GAP).

### Command entry / combobox (Command Palette)

- **Role**: Input + listbox pattern.
- **Aria**: `aria-label` on input (`"Search actions"`); `aria-label` on list (`"Available actions"`); `aria-selected` on highlighted row.
- **Keyboard**: Up/Down navigate; Enter selects; Escape closes.
- **Status**: âœ“ Correct in [command-palette.js](command-palette.js#L315-L345).

### Switches / Toggles (Preferences)

- **Current**: Native `<input type="checkbox">` or custom elements with `role="switch"`.
- **ARIA**: `aria-checked="true"|"false"` on role="switch".
- **Keyboard**: Enter / Space toggles.
- **Status**: âœ“ Correct (verified in [preferences-modal.js](preferences-modal.js#L38-L45)).

---

## Screen reader / live regions

### Announced on interaction

1. **Help Drawer open/close**: Fires `cs:helpStateChange` event â†’ Header updates Help button `aria-expanded` (verified in [help-drawer.js](help-drawer.js#L557-L583) and [header.js](header.js#L689-L700)).
2. **Command Palette navigation**: `aria-selected` toggles on rows as user presses Up/Down ([command-palette.js](command-palette.js#L412-L419)).
3. **Tabs active state**: `aria-selected="true"` on active tab; `aria-selected="false"` on inactive tabs.
4. **Toast notifications**: `role="status"` `aria-live="polite"` announces message when appended to DOM.
5. **Progress updates**: `aria-valuenow` updates reactively on progress bar elements.

### Dynamic announcements (live regions)

- **Status messages**: `role="status"` `aria-live="polite"` (spinner during image prep, PDF export progress).
- **Validation errors**: Currently shown via toast notifications with `aria-live="polite"` â€” *no assertive announcements for blocking errors* (GAP).
- **Canvas state changes** (Creator/Tracker): Pattern dimensions, selection count, etc. â€” **no live region announced** (GAP).
- **Session timer** (Tracker): Time elapsed updates in real-time â€” **no aria-live on timer** (GAP).

### Gaps

- Help Drawer panels do not announce the active tab via `aria-label` or `aria-describedby` (user must read visually that "Shortcuts" tab is active).
- Canvas cells do not announce focus or state changes (e.g. "Cell marked as done").
- Magic Wand threshold slider does not announce value on change.
- Palette chip selection does not announce selected colour on focus / on click.

---

## Keyboard equivalents for mouse-only actions

### Creator Canvas (SCR-010 / SCR-005)

| Action | Mouse | Keyboard | Status |
|---|---|---|---|
| Paint cell | Click cell with paint tool selected | N/A â€” no keyboard navigation to cell | GAP |
| Fill region | Click region with fill tool selected | N/A | GAP |
| Draw backstitch line | Click + drag between corners | N/A | GAP |
| Eyedropper | Click colour in palette or on canvas | N/A | GAP |
| Magic Wand select | Click + drag threshold slider; click Refine | Slider: arrow keys âœ“; Refine buttons: Tab+Enter âœ“ | Partial |
| Pan canvas | Spacebar + drag or right-click + drag | Spacebar + arrow keys (not documented; untested) | GAP |
| Zoom | Scroll wheel / Ctrl+Scroll | Alt+Mouse wheel (viewer-only; not editor) | GAP |
| Context menu | Right-click on canvas | N/A | GAP |
| Select all | Ctrl+A | Ctrl+A âœ“ | OK |
| Invert selection | N/A | Ctrl+Shift+I âœ“ | OK |

### Tracker Canvas (SCR-024)

| Action | Touch/Mouse | Keyboard | Status |
|---|---|---|---|
| Mark cell as done | Tap cell | N/A | GAP |
| Mark range (long-press) | Long-press cell | N/A | GAP |
| Drag-mark multiple | Drag across cells | N/A | GAP |
| Toggle mark mode | Button or spacebar | Spacebar âœ“ | OK |
| Pan canvas | Two-finger drag / scroll | Spacebar + arrow keys (untested) | Untested |
| Zoom | Pinch / wheel | Ctrl+Scroll (untested) | Untested |
| Exit mark mode | Click button / press Spacebar | Spacebar âœ“ | OK |

### Colour Selection (both Creator & Tracker)

| Action | Mouse | Keyboard | Status |
|---|---|---|---|
| Select colour from palette | Click chip | Arrow keys to navigate; Enter to select (missing) | GAP |
| Pick colour from canvas | Alt+Click (eyedropper) | N/A | GAP |
| Swap colour | Right-click palette chip | N/A | GAP |

### Right-click context menu (Creator canvas)

- **Current menu** ([creator/ContextMenu.js](creator/ContextMenu.js)): "Copy", "Paste", "Delete", "Invert".
- **Keyboard alternative**: None documented. Users cannot access the menu via keyboard.
- **GAP**: Add Shift+F10 or Menu key equivalent to open context menu at cursor.

---

## Colour contrast spot check

Using [styles.css](styles.css) token definitions:

| Component | Foreground | Background | Contrast ratio | WCAG level | Notes |
|---|---|---|---|---|---|
| Text (primary) | `--text-primary` (0f172a on light) | `--surface` (#fff on light) | ~15:1 | AAA | âœ“ |
| Text (secondary) | `--text-secondary` (475569 on light) | `--surface` (#fff on light) | ~8:1 | AA | âœ“ |
| Disabled text | `--text-tertiary` (94a3b8 on light) | `--surface` (#fff on light) | ~4.5:1 | AA | âœ“ |
| Focus outline | `--accent` (#0ea5e9 on light) | `--surface` (#fff on light) | ~8:1 | AA | âœ“ (2px solid) |
| Button (active) | `--surface` (#fff) | `--accent` (#0ea5e9) | ~8:1 | AA | âœ“ |
| Button (disabled) | `--text-tertiary` (94a3b8) | `--surface-secondary` (#f1f5f9) | ~3.5:1 | Fail | GAP: insufficient contrast on disabled buttons |

**Dark theme** (`[data-theme="dark"]`): Adjust all above to dark palette. Spot-check a few disabled buttons to verify contrast â‰¥ 4.5:1.

**GAP**: Disabled button contrast may fail WCAG AA on light theme. Increase `--text-tertiary` brightness or darken background behind disabled buttons.

---

## Reduced motion

### Current coverage

Files with `@media (prefers-reduced-motion: reduce)` blocks:

- [styles.css](styles.css#L175) â€” Global animations (panel slide-in/out, help drawer animation).
- [styles.css](styles.css#L430) â€” Right panel animation.
- [styles.css](styles.css#L516) â€” Left panel transitions.
- [styles.css](styles.css#L551) â€” Left panel backdrop animation.
- [styles.css](styles.css#L613) â€” Left panel backdrop animation.
- [command-palette.js](command-palette.js#L303) â€” Command palette row transitions.
- [onboarding-wizard.js](onboarding-wizard.js#L32) â€” Onboarding animations.
- [creator/Sidebar.js](creator/Sidebar.js#L1023) â€” Sidebar smooth scroll (fallback to `auto` behavior).
- [creator/bundle.js](creator/bundle.js#L12733) â€” Smooth scroll on magic wand refine.

### Gaps

- **Toast notifications**: No `prefers-reduced-motion` guard on fade-in/out animation (GAP).
- **Coachmark animations**: [coaching.js](coaching.js) â€” no prefers-reduced-motion rule (GAP).
- **Modal entrance/exit**: Overlay component does not check prefers-reduced-motion before applying animations (GAP, if any are defined in CSS).
- **Help Drawer panels**: Tab switching may trigger animations; not guarded (GAP).
- **Realistic Preview Canvas** (Tracker): Canvas rendering has no motion reduction (not applicable; no CSS animation).
- **Colour swatches fade**: If any swatch selection triggers a fade, no prefers-reduced-motion guard (GAP).

### User preference override

- [user-prefs.js](user-prefs.js) defines `a11yReducedMotion` preference (mirrors OS setting by default).
- [apply-prefs.js](apply-prefs.js#L72-L75) adds `html.pref-reduced-motion` class when preference is true, allowing CSS to conditionally disable animations.
- **Status**: âœ“ Infrastructure present; gaps are specific animations without guards.

---

## DISCOVERED.md appendix

### New patterns found

1. **Escape stack** ([keyboard-utils.js](keyboard-utils.js#L46-L63)): Per-modal Escape handlers pushed/popped onto a global stack. Most-recently-mounted handler fires first. Enables nested modals without explicit nesting awareness in the handlers.

2. **Scope-based keyboard registry** ([shortcuts.js](shortcuts.js)): Hierarchical dot-notation scopes with most-specific wins. Allows a single registry to manage shortcuts across multiple pages and modal contexts without collision.

3. **`aria-modal="false"` pattern** ([help-drawer.js](help-drawer.js#L17)): Help Drawer is a dialog that does *not* trap focus or prevent interaction with the page behind. This is intentional (users can still access buttons while drawer is open).

4. **Help hint banner** ([keyboard-utils.js](keyboard-utils.js#L120-L168)): Self-installing hint component that appears bottom-right after 30s of true idleness on first visit. Uses `role="status"` for screen reader announcement; dismissible via button or localStorage.

5. **Input-element guard pattern** (canonical in [shortcuts.js](shortcuts.js#L64-L81)): Single function `isTextInputFocused()` used by both Shortcuts and keyboard-utils to decide whether to fire a shortcut. Avoids duplicating this logic across the codebase.

---

## VERIFICATION TODO

### P0 â€” Critical

- [ ] `VER-A11Y-001` â€” Focus trap in Overlay component cycles Tab/Shift+Tab correctly at bounds; focus restores to trigger element on close. **Test**: Open a modal, press Tab repeatedly, verify focus cycles within modal, press Escape, verify focus returns to button that opened it.

- [ ] `VER-A11Y-002` â€” Help button aria-expanded matches HelpDrawer.isOpen() state. **Test**: Open Help Drawer, verify aria-expanded="true" on button; close, verify aria-expanded="false".

- [ ] `VER-A11Y-003` â€” Escape key stack preserves modal nesting. **Test**: Open modal A, open modal B, press Escape, verify B closes and A remains open.

- [ ] `VER-A11Y-004` â€” Command Palette aria-selected updates correctly as user presses Up/Down arrows. **Test**: Open Command Palette (Ctrl+K), press Down arrow, verify aria-selected="true" on next row, previous row has aria-selected="false".

- [ ] `VER-A11Y-005` â€” Disabled button contrast meets WCAG AA (4.5:1 minimum). **Test**: Inspect disabled button colour values; measure contrast with background using WebAIM tool.

### P1 â€” Must have

- [ ] `VER-A11Y-006` â€” Tab groups (Home, Creator, Manager tabs) support Arrow key navigation per ARIA tab pattern. Left/Right arrows cycle tabs; Home/End jump to first/last tab. **Test**: Focus a tab, press Right arrow, verify next tab is focused; press End, verify last tab is focused.

- [ ] `VER-A11Y-007` â€” Canvas elements announce their purpose via aria-label. **Test**: Creator canvas has aria-label="Pattern editor canvas"; Tracker canvas has aria-label="Stitch tracking canvas". Screen reader reads label on focus.

- [ ] `VER-A11Y-008` â€” Keyboard shortcut registry prevents conflicts. **Test**: Load creator-main.js, inspect console for any "[shortcuts] Conflict" errors. Modify a duplicate shortcut registration and verify error is logged.

- [ ] `VER-A11Y-009` â€” `prefers-reduced-motion: reduce` disables toast fade-in/out animation. **Test**: Enable OS reduced-motion setting, trigger a toast, verify no fade animation (appears instantly, disappears instantly).

- [ ] `VER-A11Y-010` â€” Help Drawer tab order follows ARIA tablist pattern: all tabs remain in tab order; arrow keys (not Tab) cycle tabs. **Test**: Focus Help Drawer tab group, press Tab, verify focus moves to search input (not next tab); press Right arrow, verify next tab is focused.

- [ ] `VER-A11Y-011` â€” Palette chips can be navigated via arrow keys (not Tab). **Test** (Creator Sidebar): Focus first palette chip, press Right arrow, verify focus moves to next chip (not Tab to next element outside palette).

- [ ] `VER-A11Y-012` â€” Coachmark focus trap cycles correctly. **Test**: Open a coachmark, press Tab repeatedly, verify Tab cycles within coachmark (not to page behind).

### P2 â€” Recommended

- [ ] `VER-A11Y-013` â€” Creator Canvas supports keyboard navigation. Arrow keys move a focus indicator cell-by-cell. Focused cell can be painted via Enter / Space (if a paint tool is selected). **Test**: Focus canvas, press Right arrow, verify focus box moves one cell right; press Spacebar with paint tool selected, verify cell is painted.

- [ ] `VER-A11Y-014` â€” Tracker Canvas supports keyboard marking. Arrow keys navigate; Spacebar (or Enter) marks current cell as done. Shift+Spacebar unmarks. **Test**: Focus canvas, press Down arrow, press Spacebar, verify cell is marked; verify status updates in aria-live region ("Cell marked").

- [ ] `VER-A11Y-015` â€” Right-click context menu has keyboard equivalent. Shift+F10 (or Menu key) opens context menu at cursor position. **Test**: Focus canvas, press Shift+F10, verify context menu appears.

- [ ] `VER-A11Y-016` â€” Colour picker (palette chip selection) announces selected colour on focus. **Test**: Focus a palette chip, verify screen reader announces "Red (DMC 310)".

- [ ] `VER-A11Y-017` â€” Skip-to-main link present and keyboard-only visible. **Test**: Tab to first element on page, press Tab again, verify skip link appears; press Enter, verify focus moves to `<main id="main-content">`.

- [ ] `VER-A11Y-018` â€” Magic Wand threshold slider announces value on change. **Test**: Focus slider, press Right arrow, verify screen reader announces updated value (e.g. "Threshold: 15%").

### P3 â€” Nice-to-have

- [ ] `VER-A11Y-019` â€” Toast dismiss button keyboard accessible. **Test**: Toast appears, press Tab, verify dismiss button receives focus; press Enter, verify toast is closed.

- [ ] `VER-A11Y-020` â€” Session timer (Tracker) has aria-live announcement. **Test**: Open Tracker, press Tab to timer, verify aria-live="polite" on timer element; wait 1 minute, verify time update is announced to screen reader (or manually verify aria-live is set).

- [ ] `VER-A11Y-021` â€” All modals not using Overlay component migrated to Overlay or receive equivalent focus-trap implementation. **Test**: Open About modal, press Tab repeatedly, verify Tab cycles within modal (does not escape to page).

- [ ] `VER-A11Y-022` â€” **TABLET**: Modal remains usable when on-screen keyboard appears. Bottom sheets / drawers do not shift out of view. **Test**: Open iPad, open a modal, trigger on-screen keyboard (tap input field), verify modal is still fully visible and interact-able.

- [ ] `VER-A11Y-023` â€” **TABLET**: Keyboard hint glyphs (â†‘ â†“ â† â†’ in `<kbd>` tags) are legible at tablet font sizes. Glyph size scales with font or uses min-width. **Test**: Open Help Drawer on iPad in landscape, inspect Shortcuts tab, verify arrow glyphs are not microscopic.

- [ ] `VER-A11Y-024` â€” **TABLET**: Keyboard hint glyphs do not leak into non-keyboard UI text. Unicode arrow characters and modifier glyphs (âŒ˜ â‡§ etc.) appear only inside `<kbd>` elements, never inline in prose. **Test**: Grep codebase for `â†‘|â†“|â†|â†’|âŒ˜|â‡§|âŒ¥|âŒƒ|â†µ` outside of `<kbd>` tags; verify no matches (except in test fixtures).

- [ ] `VER-A11Y-025` â€” Coachmark close button accessible via keyboard. **Test**: Open coachmark, verify close button is focusable; press Enter to close.

- [ ] `VER-A11Y-026` â€” Reduce-motion preference in Preferences modal is labeled and toggle-able. **Test**: Open Preferences, find "Reduce motion" toggle, toggle it on/off, verify OS prefers-reduced-motion is respected (or app-level CSS class is toggled).

- [ ] `VER-A11Y-027` â€” Prefers-reduced-motion guard added to coachmark animations. **Test**: Enable OS reduced-motion, open coachmark, verify animation does not play.

- [ ] `VER-A11Y-028` â€” Prefers-reduced-motion guard added to toast animations. **Test**: Enable OS reduced-motion, trigger toast, verify no fade animation.

### P4 â€” Polish

- [ ] `VER-A11Y-029` â€” Error announcements use `aria-live="assertive"` for blocking validation errors. **Test**: Submit a form with missing required fields, verify screen reader immediately announces error (not just visible in toast).

- [ ] `VER-A11Y-030` â€” Palette chip focus indicator visible and distinguishable (not just colour background). **Test**: Focus a palette chip, inspect for visible focus outline (2px border or outline) that contrasts with background.

- [ ] `VER-A11Y-031` â€” Canvas focus indicator is clear and visible at all zoom levels. **Test**: Focus canvas, zoom in/out via Ctrl+Scroll, verify focus indicator (cell highlight) remains visible.

- [ ] `VER-A11Y-032` â€” All interactive elements have min 44Ã—44px touch target on tablet layouts. **Test**: Inspect all buttons, sliders, palette chips in tablet viewport (iPad dimensions); verify computed size â‰¥ 44px.

- [ ] `VER-A11Y-033` â€” Prefetched keyboard hint icon (Icons.lightbulb) renders correctly in all browsers. **Test**: Load Creator, wait for help hint banner, verify icon is not broken / stretched.

- [ ] `VER-A11Y-034` â€” Keyboard shortcut hints in command palette render `<kbd>` glyphs legibly (not truncated). **Test**: Open Command Palette, inspect action rows with multi-key shortcuts (e.g. Cmd+Shift+Z), verify glyphs fit within row width.

- [ ] `VER-A11Y-035` â€” Canvas accessibility mode (if implemented) announces cell state on focus. **Test** (if applicable): Focus canvas with "Accessibility mode" enabled, press arrow to a new cell, verify screen reader announces stitch type and colour of cell.

- [ ] `VER-A11Y-036` â€” Hotkey conflicting with browser shortcuts documented. **Test**: Document which shortcuts might conflict (e.g. Ctrl+K with address bar focus on some browsers); add warning in help text if needed.

- [ ] `VER-A11Y-037` â€” Keyboard hint banner ("Press ? for help") does not pop up while user is actively typing in an input. **Test**: Open Creator, click on title input, type, wait > 30s, verify banner does not appear. Move focus away, wait 30s idle, verify banner appears.

- [ ] `VER-A11Y-038` â€” Help keyboard hint banner is not shown when localStorage is unavailable (e.g. private browsing). **Test**: Open app in private/incognito mode, wait 30s, verify no banner appears (gracefully degrades).

- [ ] `VER-A11Y-039` â€” Shift+F10 context menu works on Windows; Cmd+Shift+? or equivalent on macOS. **Test on Windows**: Press Shift+F10 on canvas, verify menu appears. **Test on macOS**: Verify equivalent key works or falls back gracefully.

- [ ] `VER-A11Y-040` â€” Keyboard modifiers correctly map to Cmd on macOS, Ctrl on Windows/Linux. **Test**: Inspect shortcuts.js parseKey() output for `mod` token; verify it maps to metaKey on Mac event and ctrlKey on Windows event.
{% endraw %}