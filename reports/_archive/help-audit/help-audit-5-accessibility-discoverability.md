# Help System Accessibility & Discoverability Audit

**Date:** 2026-05-02  
**Auditor:** GitHub Copilot (accessibility specialist mode)  
**Scope:** help-drawer.js, components.js, header.js, shortcuts.js, keyboard-utils.js, creator/MaterialsHub.js, creator/ActionBar.js, creator/ToolStrip.js, creator/Sidebar.js, tracker-app.js, manager-app.js, home-app.js, modals.js, command-palette.js, preferences-modal.js, styles.css  
**Target:** WCAG 2.1 Level AA

---

## Executive Summary

The application has a **solid accessibility foundation** — focus-visible styles, prefers-reduced-motion coverage, a robust Escape stack, a good Overlay component with proper focus trapping, and a genuine keyboard shortcut (`?`) to open help from anywhere. The `MaterialsHub` tablist, `HeaderProjectSwitcher` dropdown, and `PreferencesModal` Switch control are exemplary patterns worth copying.

However, **the application does not currently meet WCAG 2.1 AA in full**. The two most significant blockers are:

1. **The `Tooltip` component is completely inaccessible to keyboard and screen-reader users** (WCAG 1.4.13, 2.1.1, 4.1.2). It triggers only on hover. Every `InfoIcon` using it becomes invisible to assistive technology.

2. **The help drawer's internal tab navigation violates the ARIA tablist pattern** (WCAG 2.1.1, 4.1.2). Arrow keys don't switch tabs, and the tab/panel relationship is not conveyed to screen readers.

There are also several medium-severity issues across the command palette, Section component, and colour contrast of the `HelpHintBanner` that should be addressed before claiming AA compliance.

---

## A — Help Discoverability

### What works

- A visible **Help button** (`aria-label="Open help (?)"`) appears in the persistent header on every tool page. It contains both an icon and a visible "Help" text label.
- A separate **Shortcuts button** (`aria-label="Keyboard shortcuts"`) opens the shortcuts tab directly.
- Both buttons are standard `<button>` elements — keyboard-reachable without custom handling.
- The **`?` key** opens the help drawer from anywhere outside an input field, handled in both `keyboard-utils.js` and `help-drawer.js` (belt-and-suspenders approach that avoids conflicts).
- `Ctrl/Cmd+K` opens the command palette, which has a "Help" action and a "Keyboard Shortcuts" action.
- The **`HelpHintBanner`** floating pill surfaces after 30 s of true idle on first visit, with a focus-aware hide so it doesn't obscure typing. The dismiss button has `aria-label="Dismiss help hint"`.

### Gaps

- `HelpHintBanner` is only mounted in `creator-main.js` (line 1336). Users who land directly on `stitch.html` or `manager.html` and never visit the Creator never see the idle prompt. The banner component in `keyboard-utils.js` is fully reusable; it just needs to be mounted on the other pages.
- The `HelpHintBanner` renders with hardcoded hex colours (`background: "#0f172a"`, `color: "#fff"`) instead of CSS custom-property tokens. Under OS-level forced-colours or the app's own `html.pref-high-contrast` class the banner will not adapt, potentially producing invisible text.
- Help is not exposed as a skip-link or landmark, so a screen reader user arriving at a blank state (no project loaded, nothing to interact with) has no prompt guiding them to the `?` shortcut or the header Help button.

---

## B — Tooltip Accessibility

**All issues below stem from the single `Tooltip` component in `components.js`.**

The component wraps children in a `div` with `onMouseEnter` / `onMouseLeave` to show/hide a portal. It has no `onFocus` / `onBlur` handlers, no `role="tooltip"`, no `aria-describedby` connecting the trigger to the tip, no delay logic, no Escape dismissal, and the rendered tip element has `pointerEvents:"none"` making it unreachable in any mode.

The `InfoIcon` component wraps this `Tooltip` around an info SVG icon with `role="img"` on the container span, but the tooltip text is never surfaced to assistive technology at all — the icon says "Information" but the content of the information is invisible.

`Tooltip` and `InfoIcon` are used throughout the Creator sidebar, SliderRow components, thread selectors, and the Stash panel.

---

## C — Help Panel / Drawer Accessibility

### What works

- The drawer uses `role="dialog"` and `aria-label="Help and shortcuts"`.
- A manual focus trap cycles Tab/Shift-Tab within the drawer (`focusableIn` + `onKey` handler).
- Focus moves to the search input on open.
- The close button has `aria-label="Close help drawer"`.
- The search `<input>` has `aria-label="Search help and shortcuts"` and `type="search"`.
- `aria-modal="false"` is intentional — allows the page behind to remain scrollable.
- Escape closes the drawer (handled in the drawer's own keydown listener; also compatible with the `useEscape` stack for nested modals).

### Gaps

- **No arrow-key navigation in the tablist.** The `div[role="tablist"]` has no `onKeyDown` handler. ARIA authoring practices require `ArrowLeft`/`ArrowRight` (and `Home`/`End`) to move between tabs; Tab key should leave the tablist, not cycle through the individual tabs. Currently all three `role="tab"` buttons are in the natural tab order simultaneously, which is incorrect roving-tabindex behaviour.
- **Tabs lack `aria-controls`.** Each `role="tab"` button should have `aria-controls="<panelId>"`. The tab panels should have `role="tabpanel"` and `id` attributes. Neither exists.
- **No `aria-label` on the tablist element.** Without a label the tablist widget has no accessible name.
- **No `tabIndex` management (roving tabindex).** The active tab should have `tabIndex=0`; inactive tabs should have `tabIndex=-1`. This is required for the arrow-key pattern to work correctly.
- **Search results not announced.** When the user types in the search box and the list changes, no `aria-live` region announces the number of results or the fact that results have appeared/disappeared. A screen-reader user can see only "No matches." by navigating into the content area.
- **No return-focus tracking.** The drawer doesn't record `document.activeElement` when it opens, so on close (via Escape or the close button) focus returns to `<body>` rather than the element that triggered it. The `Overlay` primitive handles this correctly; the drawer could adopt the same pattern.

---

## D — ARIA Patterns

### Command Palette (`command-palette.js`)

| Feature | Status |
|---|---|
| `role="listbox"` on results list | Present |
| `role="option"` on result rows | Present (added in `renderResults`) |
| `aria-selected` on highlighted row | Present |
| `aria-label` on input | Present |
| `aria-label` on overlay dialog | Present |
| `aria-modal="true"` on dialog | **Missing** |
| `aria-controls` input → listbox | **Missing** |
| `aria-activedescendant` on input | **Missing** |
| Focus restored on close | Present (with deferred-tick guard) |

Without `aria-activedescendant` on the `<input>` field, screen readers cannot announce which item is currently highlighted as the user presses arrow keys. Users can type a query and press Enter to activate a result, but cannot browse results with a screen reader.

### Help Drawer Tablist (`help-drawer.js`)

See section C above. The `MaterialsHub` tablist in `creator/MaterialsHub.js` is the correct model (roving tabindex + ArrowLeft/ArrowRight/Home/End) and should be copied verbatim.

### Header dropdowns (`header.js`)

- The **File dropdown** trigger button (`'File'` + chevron) lacks `aria-haspopup="menu"` and `aria-expanded`. Screen readers cannot anticipate the popup or know whether it is open.
- The **Sub-page dropdown** (Creator/Editor) has the same gap.
- The **HeaderProjectSwitcher** button correctly uses `aria-haspopup="menu"` and `aria-expanded` — this is the model to follow.

### Section accordion (`components.js`)

The `Section` component renders a `<button>` that expands/collapses content, but the button element has no `aria-expanded` attribute. Screen readers announce only the button label with no indication of whether the content below is open or closed.

### `Segmented` control (`preferences-modal.js`)

The `Segmented` component buttons have no `role` attribute and no `aria-pressed`. Selected state is conveyed only visually (background colour). Screen-reader users cannot determine which option is active.

### `Switch` control (`preferences-modal.js`) — **Good pattern**

`role="switch"` and `aria-checked` are both correctly applied. The `aria-label` prop is threaded through. This is the correct pattern for a boolean toggle.

### Logo (`header.js`)

The logo `<span>` uses `role="link"` with `tabIndex=0` and handles `Enter`/`Space` via `onKeyDown`. Functional, though a semantic `<a href="home.html">` would be more robust (links appear in screen-reader link lists; `role="link"` on a span does not).

### `role="dialog"` on manager-app.js modals

Three modals in `manager-app.js` place `role="dialog"` and `onClick={onClose}` on the same element (the overlay wrapper). The inner panels call `stopPropagation()` which prevents accidental closure, but this pattern means that keyboard activation (Enter on the overlay's root) would also close — unlikely but worth noting. These modals do not use the shared `Overlay` component, and therefore also lack focus trapping and focus restoration.

---

## E — WCAG 2.1 AA Compliance

### Focus styles

- `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` — good universal rule.
- `*:focus:not(:focus-visible) { outline: none; }` — correctly suppresses focus ring for pointer users.
- Legacy `input:focus, select:focus, button:focus { outline: 2px solid var(--accent-border); }` fires on all focus events (not just keyboard), partially redundant. If `--accent-border` resolves to a lower-opacity token than `--accent`, pointer-triggered clicks will still show a faint ring, which is harmless but inconsistent.
- `.tb-app-tab:focus-visible` and `.overlay-close:focus-visible` have explicit overrides — fine.
- **`--accent` (terracotta/orange) on a white `--surface` background likely passes the 3:1 minimum for non-text UI components (WCAG 1.4.11), but must be verified with a colour contrast analyser against both light and dark theme surfaces.** The audit cannot measure computed hex values from CSS tokens without a browser rendering context.

### Prefers-reduced-motion

Extensive coverage — `@media (prefers-reduced-motion: reduce)` blocks found across 8+ files and a redundant `html.pref-reduced-motion` class-based override. The drawer's slide-in animation has no explicit `prefers-reduced-motion` rule, but because it currently has no CSS animation (it's rendered/removed from the DOM), this is moot.

### Forced colours / high contrast

`html.pref-high-contrast` (set by app preference toggle) provides partial support, but **`@media (forced-colors: active)` is absent from the codebase**. Users who enable Windows High Contrast mode or macOS Increase Contrast at the OS level get no app-level adaptation. The `HelpHintBanner` in particular will break because it uses hardcoded hex colours.

### Touch target sizes

- Command palette rows have `min-height: 44px` at `@media (pointer: coarse)` — correct.
- The help drawer close button has `padding: 4` — the hit area depends entirely on the SVG icon size (likely 16–20 px at 1.6 stroke-width), giving a target of approximately 24–28 px. This is below the WCAG 2.5.8 (AA, Level 2.2) recommended minimum of 24 px for target size and well below the 44 px best practice for touch.
- Toolbar buttons (`tb-btn`) in the Creator ToolStrip have no `min-height` guard for touch, and the visual button height at the default font-size is approximately 32 px.

### Reflow at 320 px viewport

The drawer uses `width: 380, maxWidth: "100vw"` and the command palette uses `max-width: min(520px, calc(100vw - 32px))` — both will fill a 320 px screen. The drawer's fixed left scrim is anchored to `right: 380`, which goes negative on viewports narrower than 380 px and creates a zero-width strip. This is a cosmetic artefact rather than a content-reflow failure, but it is worth noting.

---

## Prioritised TODO List

```
HIGH — WCAG AA violations
```

- [ ] [Priority: HIGH] [WCAG: 1.4.13, 2.1.1] [File: components.js] Add `onFocus`/`onBlur` handlers to `Tooltip` so it shows when the trigger element receives keyboard focus, and dismisses on `onBlur`. Add Escape dismissal via `document` `keydown` listener while visible.
- [ ] [Priority: HIGH] [WCAG: 4.1.2] [File: components.js] Add `role="tooltip"` to the rendered tooltip `div` and give it an `id`. Add `aria-describedby={tooltipId}` to the trigger element so screen readers associate tip with trigger.
- [ ] [Priority: HIGH] [WCAG: 2.1.1] [File: help-drawer.js] Add `onKeyDown` to the `role="tablist"` div implementing ArrowLeft/ArrowRight/Home/End to move between tabs (copy the `onTablistKeyDown` pattern from `creator/MaterialsHub.js`). Switch tabs to roving tabindex: active tab `tabIndex=0`, inactive tabs `tabIndex=-1`.
- [ ] [Priority: HIGH] [WCAG: 4.1.2] [File: help-drawer.js] Add `aria-controls="help-panel-{tab}"` to each `TabButton`, assign matching `id` and `role="tabpanel"` attributes to the three tab content areas (Help / Shortcuts / Getting Started). Add `aria-label` to the `role="tablist"` div (e.g. `"Help sections"`).
- [ ] [Priority: HIGH] [WCAG: 4.1.2] [File: components.js] Add `aria-expanded={currentOpen ? "true" : "false"}` to the `Section` accordion toggle button.
- [ ] [Priority: HIGH] [WCAG: 4.1.2] [File: command-palette.js] Add `aria-controls="cs-cmdp-listbox"` to the input and `id="cs-cmdp-listbox"` to the `role="listbox"` div. Set `aria-activedescendant` on the input to the `id` of the currently highlighted `role="option"` row (update in `paintHighlight`).
- [ ] [Priority: HIGH] [WCAG: 4.1.3] [File: help-drawer.js] Add a visually-hidden `aria-live="polite"` region in the drawer body that announces the number of search results when the query changes (e.g. "5 help results" / "No matches").
- [ ] [Priority: HIGH] [WCAG: 4.1.2] [File: header.js] Add `aria-haspopup="menu"` and `aria-expanded={pageDrop}` to the creator sub-page dropdown trigger button (`'File'` button and page dropdown both share this gap).

```
MEDIUM — WCAG best practice / AAA / AT usability
```

- [ ] [Priority: MED] [WCAG: 4.1.2] [File: command-palette.js] Add `aria-modal="true"` to the `role="dialog"` overlay div so screen readers restrict virtual-cursor navigation to the palette when it is open.
- [ ] [Priority: MED] [WCAG: 1.4.11] [File: keyboard-utils.js] Replace hardcoded `background: "#0f172a"` and `color: "#fff"` in `HelpHintBanner` with CSS custom-property tokens (`var(--text-primary)` / `var(--surface)` inverted, or dedicated `--hint-bg` / `--hint-fg` tokens). This ensures the banner is visible under `@media (forced-colors: active)` and `html.pref-high-contrast`.
- [ ] [Priority: MED] [WCAG: 4.1.2] [File: preferences-modal.js] Add `role="group"` with `aria-label` to the `Segmented` container and `aria-pressed={isOn}` to each segment button, so screen readers can announce the active option.
- [ ] [Priority: MED] [WCAG: 2.5.8] [File: help-drawer.js] Increase the help drawer close button padding from `4px` to at least `8px` (giving a ~28–32 px hit area); or add `min-width: 32px; min-height: 32px` to the button style so it meets the 24 px threshold at all font sizes.
- [ ] [Priority: MED] [WCAG: 2.1.1] [File: help-drawer.js] Track `document.activeElement` when the drawer opens and return focus to that element when the drawer closes (Escape or close button). Currently focus goes to `<body>`.
- [ ] [Priority: MED] [WCAG: 4.1.2] [File: keyboard-utils.js] Mount `HelpHintBanner` on `tracker-app.js` and `manager-app.js` (and `home-app.js`) so the idle-hint is available to users who never visit the Creator.
- [ ] [Priority: MED] [WCAG: 1.4.11] [File: styles.css] Add `@media (forced-colors: active)` block that ensures focus rings, border colours, and interactive element outlines use the `ButtonText` / `HighlightText` forced-colour system values rather than app tokens that become invisible in Windows High Contrast mode.
- [ ] [Priority: MED] [WCAG: 4.1.2] [File: manager-app.js] Migrate the three hand-written modal overlays (`PatternEditModal`, `PatternDetailModal`, `UserProfileModal`) to the shared `Overlay` component so they gain focus trapping and focus restoration without duplication.
- [ ] [Priority: MED] [WCAG: 4.1.2] [File: header.js] Replace the logo `<span role="link" tabIndex=0>` with a semantic `<a href="home.html">` element (or `<a href="#" onClick={...}>`). `role="link"` on a `span` is not surfaced in browser/AT link lists.

```
LOW — Enhancements / polish
```

- [ ] [Priority: LOW] [WCAG: 1.4.13] [File: components.js] Add a short show-delay (e.g. 500 ms) to `Tooltip` before it appears, to avoid accidental trigger during pointer movement across controls. WCAG 1.4.13 does not mandate a delay but discoverability is improved.
- [ ] [Priority: LOW] [WCAG: n/a] [File: help-drawer.js] Consider adding a skip-to-help landmark (e.g. a visually-hidden `<a href="#cs-help-search">` in the header skip-nav block) so keyboard users on pages with no project loaded can quickly jump to help without tabbing through the entire header.
- [ ] [Priority: LOW] [WCAG: 2.5.8] [File: creator/ToolStrip.js] Add `@media (pointer: coarse)` min-height guard on `.tb-btn` (match the 44 px guard already in command-palette) so toolbar buttons meet the touch-target minimum on mobile browsers.
- [ ] [Priority: LOW] [WCAG: 4.1.2] [File: help-drawer.js] The `HelpSection` and `ShortcutsSection` use `<h4>` headings. Add a visually-hidden `<h2>` or `<h3>` at the top of the drawer body (e.g. "Help — [current tab name]") so the heading hierarchy is complete for screen reader navigation by heading.
- [ ] [Priority: LOW] [WCAG: n/a] [File: help-drawer.js] The `GettingStartedSection` action buttons have `padding: "6px 12px"` which produces approximately 30 px height — below the AA 44 px touch guideline on coarse-pointer devices. Add touch-target padding at `@media (pointer: coarse)`.

---

## Patterns Done Well — Use as Models

These implementations are correct and should be referenced when fixing the issues above.

### 1. `creator/MaterialsHub.js` — Roving-tabindex tablist
Full ARIA tablist pattern: `role="tablist"` with `aria-label`, `role="tab"` with `aria-selected` and roving `tabIndex`, `onKeyDown` handling ArrowLeft/ArrowRight/Home/End, and `setTimeout(() => focusTabByIndex(nextIdx), 0)` to focus programmatically after state update.

### 2. `header.js` — `HeaderProjectSwitcher` dropdown
Trigger button with `aria-haspopup="menu"` and `aria-expanded`, `role="menu"` container with `aria-label`, `role="menuitem"` on each entry with `tabIndex=-1`, auto-focus first item on open, ArrowUp/ArrowDown/Home/End navigation, Escape returns focus to trigger.

### 3. `creator/ActionBar.js` — Export dropdown
Same pattern as HeaderProjectSwitcher; demonstrates that the menu pattern can be used for action menus as well as navigation menus.

### 4. `components/Overlay.js` — Modal focus trap
`useFocusTrap` captures `document.activeElement` before mounting, focuses first child (respects `data-autofocus`), Tab/Shift-Tab wraps within panel, restores focus to opener on unmount. Body scroll-lock included.

### 5. `keyboard-utils.js` — `useEscape` stack
Single capture-phase listener, LIFO stack, `skipWhenEditingTextField` guard, suppresses propagation so outer containers don't double-handle Escape.

### 6. `preferences-modal.js` — `Switch` toggle
`role="switch"` + `aria-checked` + `disabled` forwarding + `aria-label` prop threaded through. This is the correct pattern for binary toggles.

### 7. `styles.css` — Focus ring and reduced-motion foundations
`*:focus-visible { outline: 2px solid var(--accent); }` with `*:focus:not(:focus-visible) { outline: none; }` is the correct modern split. Extensive `@media (prefers-reduced-motion: reduce)` coverage across all animated components. App-level `html.pref-reduced-motion` class mirrors the media query for users who set it through Preferences rather than the OS.

---

## Files Audited

| File | Lines read | Key findings |
|---|---|---|
| `help-drawer.js` | All (~900) | Tablist pattern incomplete; no aria-controls; no live search region; no return-focus tracking |
| `components.js` | 1–200 (Tooltip, InfoIcon, Section, SliderRow, NoteEditor) | Tooltip inaccessible; Section missing aria-expanded |
| `header.js` | All (~900) | Help/shortcuts buttons good; File/page dropdowns missing aria-haspopup+expanded; logo span role |
| `shortcuts.js` | 1–220 | Registry well-designed; no direct ARIA issues |
| `keyboard-utils.js` | All (~260) | HelpHintBanner hardcoded colours; useEscape stack is model pattern |
| `creator/MaterialsHub.js` | All (~90) | **Model tablist pattern** |
| `creator/ActionBar.js` | 1–200 | **Model menu pattern**; aria-live on phase label |
| `creator/ToolStrip.js` | 1–200 | aria-label on toolbar and buttons; missing touch-target guard |
| `creator/Sidebar.js` | 1–150 | Toggle role=switch correct; aria-live on stash warning |
| `command-palette.js` | All (~560) | role=option present; missing aria-activedescendant, aria-controls, aria-modal |
| `modals.js` | 1–200 | Help shim routes to drawer; About/ThreadSelector use Overlay correctly |
| `preferences-modal.js` | 1–200 | Switch model; Segmented missing aria-pressed |
| `components/Overlay.js` | All (~200) | **Model focus trap + restoration** |
| `styles.css` | Selective (focus, motion, contrast) | Good focus-visible; missing forced-colors; hardcoded hex in HelpHintBanner not in CSS |
