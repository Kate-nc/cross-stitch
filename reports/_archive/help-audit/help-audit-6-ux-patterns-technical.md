# Help & Tooltip Patterns — Technical Audit
<!-- audit ref: help-audit-6 -->

{% raw %}

## Overview

This audit inventories every mechanism used to surface contextual help, tooltips,
and explanatory text across all five app surfaces (Creator, Tracker, Manager, Home,
Stats). Fourteen distinct patterns were identified. Several patterns overlap in
intent, creating an inconsistent user experience and maintenance burden.

---

## Pattern Inventory

### P1 — `Tooltip` React Component

**Files:** [components.js](../components.js)  
**Trigger:** Hover (mouseover/mouseout) + touch toggle (touchstart — touch again to dismiss)  
**Implementation:** Portal-rendered (`document.body`), inline styles only, `z-index: 9999`

```js
Tooltip({ text, children, width = 180 })
```

**Strengths:** Works on touch (toggled), escaped from stacking contexts via portal.  
**Weaknesses:**
- No `role="tooltip"` on the tooltip element
- No `id`/`aria-describedby` wiring — screen readers cannot discover it
- No keyboard focus trigger — keyboard-only users never see it
- Inline styles cannot be themed or overridden via CSS
- Touch toggle leaves tooltip open when user scrolls away; no focus-out dismissal

---

### P2 — `InfoIcon` React Component

**Files:** [components.js](../components.js), [creator/Sidebar.js](../creator/Sidebar.js)  
**Trigger:** Hover/touch (delegates to P1)  
**Implementation:** Wraps `Tooltip` with an ℹ icon span (`cursor: help`, `color: --text-tertiary`)

```js
InfoIcon({ text, width })
```

**Usage in Sidebar.js:** Direct `InfoIcon` calls for:
- "Keep proportional", "Colour blending", "Constrain to stash", "Dithering",
  "Confetti cleanup", "Fabric count", "Background removal"

**Weaknesses:** Inherits all P1 accessibility gaps. `stopPropagation()` on click
prevents bubbling to parent containers — this can silently break parent click
handlers if an InfoIcon is placed inside an interactive ancestor.

---

### P3 — `SliderRow.helpText` → InfoIcon Chain

**Files:** [components.js](../components.js), [creator/Sidebar.js](../creator/Sidebar.js)  
**Trigger:** Hover/touch (delegates through P2 → P1)  
**Implementation:** `SliderRow` renders `InfoIcon` when `helpText` prop is non-null

```js
SliderRow({ label, value, min, max, step, onChange, helpText = null })
```

**Usage in Sidebar.js:** Palette count, min stitches per colour, orphan level,
blur radius, background tolerance.

**Assessment:** Clean abstraction over P2. No unique weaknesses beyond P1/P2.

---

### P4 — HTML `title` Attributes

**Files:** [creator/ToolStrip.js](../creator/ToolStrip.js), [creator/MagicWandPanel.js](../creator/MagicWandPanel.js),
[creator/ActionBar.js](../creator/ActionBar.js), [creator/PatternTab.js](../creator/PatternTab.js),
[creator/Sidebar.js](../creator/Sidebar.js), [manager-app.js](../manager-app.js),
[tracker-app.js](../tracker-app.js), [stats-page.js](../stats-page.js)  
**Trigger:** Hover (browser native), shown after ~500 ms delay  
**Examples:**
- ToolStrip: `title="Paint (P)"`, `title="Fill (F)"`, `title="Zoom"`
- MagicWandPanel: `title="New selection — replaces any existing"`
- PatternTab: `title="What is this?"` on a `<span>` with dotted underline (`cursor: help`)
- stats-page.js: SABLE Index uses a `?` circle button with a multi-line `title` attribute

**Weaknesses:**
- **Invisible on touch** — Android/iOS never show native title tooltips
- Multi-line `title` content (e.g. SABLE Index) is truncated on some browsers
- No custom styling, positioning, or animation
- Inconsistent ~500 ms delay across OS/browser combinations
- Does not work inside SVG or canvas elements

---

### P5 — `aria-label` as Tooltip Substitute

**Files:** [creator/ActionBar.js](../creator/ActionBar.js), [creator/ToolStrip.js](../creator/ToolStrip.js),
[tracker-app.js](../tracker-app.js), [manager-app.js](../manager-app.js)  
**Trigger:** Screen reader only (not visually rendered)  
**Examples:**
- ToolStrip: `"aria-label": "Paint tool"` alongside `title="Paint (P)"`
- Tracker modal close buttons: `aria-label="Close"` alongside `title="Close"`

**Assessment:** `aria-label` is correctly used for icon-only buttons. It is *not*
a tooltip. When used alongside `title`, it creates a dual-label situation where
the two strings sometimes differ (e.g. `title="Paint (P)"` vs `aria-label="Paint
tool"`), which is confusing for screen reader users.

---

### P6 — Dual `title` + `aria-label` on Same Element

**Files:** [creator/ActionBar.js](../creator/ActionBar.js), [creator/ToolStrip.js](../creator/ToolStrip.js),
[tracker-app.js](../tracker-app.js)  
**Issue:** Same element has both `title` and `aria-label`. Screen readers use
`aria-label` and ignore `title`. Sighted users see `title`. The two strings are
sometimes inconsistent, creating a split source-of-truth.  
**Rule:** For icon-only buttons, use `aria-label` for the accessible name; omit
`title` or ensure it matches exactly.

---

### P7 — `CreatorPatternInfoPopover`

**Files:** [creator/PatternInfoPopover.js](../creator/PatternInfoPopover.js),
[creator/ActionBar.js](../creator/ActionBar.js)  
**Trigger:** Click (toggle)  
**Implementation:** `role="dialog"` `aria-label="Pattern details"`, click-outside
+ Escape to close, mobile bottom-sheet with scrim div.  
**CSS:** `.creator-popover-info`, `.creator-popover-info-scrim`, `__title`, `__grid`,
`__label`, `__value`, `__divider`, `__badges`, `__badge`

**Assessment:** The best popover implementation in the codebase. Proper dialog
semantics, keyboard dismissal, touch-friendly scrim, CSS-class-based styling.

---

### P8 — `AppInfoPopover` (Shared Chip + Popover)

**Files:** [home-app.js](../home-app.js), [tracker-app.js](../tracker-app.js),
[manager-app.js](../manager-app.js)  
**Trigger:** Click on an info chip  
**Implementation:** Shared component introduced in Plan B (Phase 2–3). Positioning
variant via `.app-info-popover--left`.  
**CSS:** `.app-info-popover`, `.app-info-popover--left`

**Assessment:** Good reuse pattern. Click-triggered, dismissable. Its accessibility
posture (role, focus management) should be verified against P7's standard.

---

### P9 — `HelpDrawer`

**Files:** [help-drawer.js](../help-drawer.js)  
**Trigger:** `?` key, `window.HelpDrawer.open()`, `cs:openHelp` custom event  
**Implementation:** Slide-in panel (380 px desktop / 100 vw mobile), tabs for Help
topics / Shortcuts / Getting Started. `role="dialog"` `aria-modal="false"`. Escape
closes. Mounts into `#cs-help-drawer-root`.  

**Assessment:** Solid implementation. Self-contained, globally accessible, proper
ARIA role. `aria-modal="false"` correctly indicates that background content remains
interactive. Not React — plain DOM with manual DOM manipulation.

---

### P10 — Inline Dismissible Hint Banners

**Files:** [creator/PatternTab.js](../creator/PatternTab.js)  
**Trigger:** Shown once; dismissed via × button; state persisted in component  
**Examples:**
- `"Press ? for keyboard shortcuts"` — shown after first pattern generation
- Confetti-cleanup warning banner (danger-soft background, auto-shown when triggered)

**Assessment:** Appropriate for one-time contextual nudges. No concerns beyond
ensuring dismissed state is persisted (currently in-component state, lost on
remount).

---

### P11 — Always-Visible Contextual Status Text

**Files:** [creator/PatternTab.js](../creator/PatternTab.js)  
**Trigger:** Persistent (updates based on active tool)  
**Implementation:** `statusText` string rendered in a fixed status bar at the bottom
of the canvas. Shows instructions like "Click to paint · Right-click to erase".

**Assessment:** Excellent discoverability for first-time users. No tooltip
interaction required.

---

### P12 — Inline Toggle `.help` Subtext

**Files:** [creator/Sidebar.js](../creator/Sidebar.js)  
**Trigger:** Always visible — small secondary text below the toggle label  
**Implementation:** `Toggle` component renders `props.help` as a `<small>` or
secondary `<span>` directly beneath the label.

**Assessment:** Good for persistent explanations that are short enough to show
inline (1–2 lines). Overuse would clutter the sidebar.

---

### P13 — Command Palette Hint Bar

**Files:** [command-palette.js](../command-palette.js)  
**Trigger:** Shown when the command palette is open  
**Implementation:** Plain DOM (not React). Injects a `<style>` tag and appends
a `.cs-cmdp-hint` bar containing keyboard shortcut legends (`<kbd>` elements).

**Assessment:** Not React, unlike every other component. Injected styles bypass
the app's CSS token system. Functional but architecturally inconsistent.

---

### P14 — Coachmark Popover

**Files:** [coaching.js](../coaching.js), [styles.css](../styles.css)  
**CSS:** `.cs-coachmark-popover`  
**Trigger:** Programmatic (onboarding flow)

**Assessment:** Separate onboarding system. Not reviewed in detail; keep isolated
from tooltip refactoring.

---

### P15 — Ad-hoc `cursor: help` + `title` Spans (Stats Page)

**Files:** [stats-page.js](../stats-page.js), [stats-insights.js](../stats-insights.js)  
**Trigger:** Hover (browser native title)  
**Implementation:** Inline JSX constructs a `<span>` with `style={{cursor:'help',
borderRadius:'50%', ...}}` containing `'?'`, and a multi-line `title` attribute.

**Example:**
```js
h('span', {
  title: 'SABLE = Stash Accumulated Beyond Life Expectancy\n...',
  style: { cursor: 'help', color: 'var(--text-tertiary)', border: '1px solid currentColor',
    borderRadius: '50%', width: 13, height: 13, ... }
}, '?')
```

**Assessment:** Bespoke wheel-reinvention of `InfoIcon`. Multi-line title content
is unreliable across browsers. Touch users never see it.

---

## Consolidated Inventory Table

| # | Pattern | Primary Files | Trigger | Accessible? | Touch Works? | Limitations |
|---|---------|--------------|---------|-------------|-------------|-------------|
| P1 | `Tooltip` component | components.js | Hover + touch toggle | No (no role/aria) | Partial | No keyboard focus trigger; inline styles |
| P2 | `InfoIcon` component | components.js, creator/Sidebar.js | Hover + touch | No (inherits P1) | Partial | stopPropagation on click |
| P3 | `SliderRow.helpText` → InfoIcon | components.js, creator/Sidebar.js | Hover + touch | No (inherits P1) | Partial | Inherits P1/P2 gaps |
| P4 | HTML `title` attribute | ToolStrip, PatternTab, stats-page, … | Hover (native) | Marginal | No | Touch-invisible; no styling; multi-line unreliable |
| P5 | `aria-label` as label | ActionBar, ToolStrip, tracker | Screen reader | Yes (for a11y) | N/A | Not a tooltip; not visually rendered |
| P6 | Dual `title` + `aria-label` | ActionBar, ToolStrip | Both | Confusing | No | Strings can diverge; reader ignores title |
| P7 | `CreatorPatternInfoPopover` | creator/PatternInfoPopover.js | Click | Yes (dialog role) | Yes (scrim) | One-off implementation |
| P8 | `AppInfoPopover` | home, tracker, manager | Click | Partial | Yes | Role/focus management to verify |
| P9 | `HelpDrawer` | help-drawer.js | `?` key / API | Yes (dialog role) | Yes | Not React; manual DOM |
| P10 | Dismissible hint banners | creator/PatternTab.js | Auto-shown | OK | Yes | Dismissed state lost on remount |
| P11 | Status text bar | creator/PatternTab.js | Always visible | Yes (visible text) | Yes | None |
| P12 | Toggle `.help` subtext | creator/Sidebar.js | Always visible | Yes | Yes | Can clutter UI if overused |
| P13 | Command palette hint bar | command-palette.js | With palette | OK | N/A | Not React; injected styles |
| P14 | Coachmark popover | coaching.js | Programmatic | To verify | To verify | Separate system; out of scope |
| P15 | Ad-hoc `cursor:help` span | stats-page.js, stats-insights.js | Hover (native) | No | No | Reinvents InfoIcon; multi-line title unreliable |

---

## Key Problems

### KP-1: Tooltip Component Has No Keyboard Support
`Tooltip` (P1) — and everything built on it (P2, P3) — only triggers on mouse
hover or touch tap. Keyboard-only users tabbing through the UI never see tooltip
content. Affected sliders, InfoIcon labels, and Toggle help text are silently
inaccessible to keyboard users.

### KP-2: Tooltip Component Is Not Announced by Screen Readers
There is no `role="tooltip"`, no `id` on the tooltip element, and no
`aria-describedby` on the trigger. The tooltip content exists in the DOM (while
visible) but is invisible to assistive technology.

### KP-3: `title` Attributes Are Invisible on Touch Devices
`title` is used in ToolStrip, MagicWandPanel, ActionBar, PatternTab ("What is
this?"), manager-app, and stats-page. None of these hints are visible on
Android/iOS. This affects ~50 % of real users.

### KP-4: Two Separate Popover Implementations for Similar Purposes
`CreatorPatternInfoPopover` (P7) and `AppInfoPopover` (P8) solve the same problem
(click-triggered rich content popover) with two different implementations,
CSS classes, and accessibility postures.

### KP-5: Dual `title` + `aria-label` with Diverging Strings
Several elements in ToolStrip and ActionBar carry both `title` and `aria-label`
with slightly different text. Screen readers use `aria-label`; sighted users read
`title`. Neither group gets consistent copy.

### KP-6: Bespoke `cursor:help` Spans in Stats Pages
stats-page.js and stats-insights.js manually construct `InfoIcon`-like elements
with hardcoded inline styles and native `title` tooltips. This is a duplication
of P2/P15 that bypasses the shared component.

### KP-7: Command Palette Hint Bar Uses Injected Styles
command-palette.js (P13) injects a `<style>` element into the DOM to style its
hint bar. This is the only place in the app that does this. The styles are
disconnected from `styles.css` tokens and cannot be themed.

---

## Prioritised TODO List

### HIGH — Accessibility Regressions

- [ ] **[Priority: HIGH] [Pattern: P1] [File: components.js]**
  Add `role="tooltip"` to the tooltip portal element. Generate a unique `id` per
  instance. Wire `aria-describedby={tooltipId}` onto the trigger element via
  `cloneElement` or a wrapper span. Without this, the component fails WCAG 2.1
  SC 1.3.1 and SC 4.1.3.

- [ ] **[Priority: HIGH] [Pattern: P1] [File: components.js]**
  Add `onFocus`/`onBlur` handlers to the trigger so the tooltip appears when the
  trigger receives keyboard focus. Currently keyboard-only users never see tooltip
  content. Use a ref on the trigger wrapper and listen for `focus` / `blur`.

- [ ] **[Priority: HIGH] [Pattern: P4] [File: creator/ToolStrip.js]**
  Replace `title` attributes on toolbar buttons with the `Tooltip` component (once
  P1 accessibility gaps are fixed). The toolbar already has `aria-label` on each
  button — keep those and add a visual `Tooltip` wrapping the button element.

- [ ] **[Priority: HIGH] [Pattern: P15] [File: stats-page.js]**
  Replace the ad-hoc `cursor:help` `?` span (SABLE Index, and similar constructs
  in stats-insights.js) with `InfoIcon`. The multi-line `title` content must be
  ported into the `text` prop.

### MEDIUM — Inconsistency and Duplication

- [ ] **[Priority: MEDIUM] [Pattern: P6] [File: creator/ActionBar.js, creator/ToolStrip.js, tracker-app.js]**
  Audit every element carrying both `title` and `aria-label`. Remove the `title`
  attribute where `aria-label` already provides the accessible name (icon-only
  buttons). The two strings must match exactly if both are kept.

- [ ] **[Priority: MEDIUM] [Pattern: P4] [File: creator/PatternTab.js]**
  Replace the "What is this?" `<span title="...">` (inline `cursor:help` dotted
  underline) with an `InfoIcon` or a `Tooltip` wrapping a `<button type="button">`.
  Using a non-interactive `<span>` with a tooltip is inaccessible.

- [ ] **[Priority: MEDIUM] [Pattern: P4] [File: stats-page.js, stats-insights.js]**
  Replace `.sync-help-icon` (styles.css line 3389) and any other class-based
  `cursor:help` icons outside the shared `InfoIcon` component with `InfoIcon`.
  There should be a single implementation.

- [ ] **[Priority: MEDIUM] [Pattern: P7/P8] [File: creator/PatternInfoPopover.js, home-app.js, tracker-app.js, manager-app.js]**
  Evaluate merging `AppInfoPopover` and `CreatorPatternInfoPopover` into a single
  shared `InfoPopover` component. Both are click-triggered content popovers;
  they differ only in layout (grid vs list) and positioning (inline vs
  positioned). A shared base with a `variant` prop would eliminate the divergence.

- [ ] **[Priority: MEDIUM] [Pattern: P10] [File: creator/PatternTab.js]**
  Persist dismissal of the "Press ? for shortcuts" banner across sessions (e.g.
  via `UserPrefs` or `localStorage`). Currently, remounting the component
  (e.g. on pattern reload) re-shows the banner.

### LOW — Code Quality

- [ ] **[Priority: LOW] [Pattern: P13] [File: command-palette.js]**
  Move the `.cs-cmdp-hint` styles from the injected `<style>` block into
  `styles.css` using CSS custom properties. This allows theming and removes the
  style injection side-effect from the component.

- [ ] **[Priority: LOW] [Pattern: P1] [File: components.js]**
  Extract the inline style objects in `Tooltip` into CSS classes
  (`.cs-tooltip`, `.cs-tooltip--visible`) in `styles.css`. This allows the
  tooltip to participate in the Workshop theme system and be overridden via CSS.

- [ ] **[Priority: LOW] [Pattern: P2] [File: components.js]**
  Review whether `stopPropagation()` in `InfoIcon`'s click handler is still
  needed. If it was added defensively, remove it. If it is genuinely needed
  (e.g. inside an accordion or card), document why with a comment.

---

## Proposed Unified Tooltip API

The current `Tooltip` component API should be extended as follows to address KP-1
and KP-2 while remaining backward-compatible:

```js
/**
 * Tooltip — contextual hover/focus tooltip.
 *
 * @param {string|ReactElement} text  Tooltip content (required)
 * @param {ReactElement}        children  Trigger element (required — must be a
 *                                        single React element that accepts ref)
 * @param {number}   [width=180]     Max-width of the tooltip panel (px)
 * @param {string}   [placement='top']  'top' | 'bottom' | 'left' | 'right'
 * @param {string}   [trigger='both']   'hover' | 'focus' | 'both'
 * @param {string}   [id]            If provided, used as the tooltip element id;
 *                                   also wired to aria-describedby on the trigger.
 *                                   Auto-generated if omitted.
 * @param {boolean}  [disabled]      Suppress the tooltip entirely.
 */
function Tooltip({ text, children, width = 180, placement = 'top',
                   trigger = 'both', id, disabled }) { ... }
```

Implementation notes:
- `role="tooltip"` on the portal element, `id` auto-generated via `useId()` or a
  counter when not provided by caller.
- Trigger wrapper uses `cloneElement` to inject `aria-describedby={tooltipId}`,
  `onMouseEnter`, `onMouseLeave`, `onFocus`, `onBlur`, `onTouchStart`.
- `placement` controls which CSS class or inline offset is applied; start with
  `'top'` only and expand as needed.
- `trigger='hover'` omits focus handlers (use when the trigger already has a
  visible label — e.g. a text button where the tooltip is supplementary).
- `trigger='focus'` omits mouse handlers (rarely needed; provided for completeness).

`InfoIcon` remains unchanged as a convenience wrapper:

```js
function InfoIcon({ text, width }) {
  return h(Tooltip, { text, width },
    h('span', { role: 'img', 'aria-label': 'Information',
                style: { cursor: 'help', color: 'var(--text-tertiary)',
                         lineHeight: 1, display: 'inline-flex' } },
      window.Icons?.info ? window.Icons.info() : '\u24D8'));
}
```

---

## Patterns Worth Keeping As-Is

| Pattern | Why it's good |
|---------|--------------|
| P7 `CreatorPatternInfoPopover` | `role="dialog"`, click-outside + Escape close, mobile scrim, CSS-class styling. Best-in-class. |
| P9 `HelpDrawer` | Global keyboard trigger, proper ARIA role, tabbed content, Escape close. Solid. |
| P11 Status text bar (PatternTab) | Always-visible contextual instruction. Zero interaction cost; excellent first-run discoverability. |
| P12 Toggle `.help` subtext | Appropriate for persistent, short supplementary text. Visible without any interaction. |

---

## Files Not Audited (Out of Scope)

- `coaching.js` / coachmark system (P14) — separate onboarding layer
- `onboarding-wizard.js` — new-user flow; separate system
- `pdf-export-worker.js` / `creator/pdfExport.js` — no user-facing UI
- `sw.js` / `sw-register.js` — service worker, no UI

{% endraw %}
