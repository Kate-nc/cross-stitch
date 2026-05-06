# Help & Tooltip Edge Cases — Audit (Phase 8)

**Scope:** Inline `Tooltip` / `InfoIcon` (components.js), `title=` attributes (ToolStrip, ActionBar, tracker-app), PatternInfoPopover, and the HelpDrawer overlay.  
**Files examined:** components.js, creator/Sidebar.js, creator/ToolStrip.js, creator/ActionBar.js, creator/MagicWandPanel.js, creator/PatternInfoPopover.js, tracker-app.js, help-drawer.js, styles.css, touch-constants.js, useDragMark.js, keyboard-utils.js, modals.js, command-palette.js, onboarding-wizard.js, coaching.js, icons.js, shortcuts.js, useDragMark.js.

---

## Quick-reference priority list

```
[A] Viewport & positioning
[B] Disabled / conditional elements
[C] Dynamic content & state races
[D] Touch & mobile
[E] Performance, animation & z-index
[F] Content & accessibility edge cases
```

- [ ] [HIGH][A] Tooltip has no Y-axis edge clamping — clips off-screen near the top of the viewport
- [ ] [HIGH][A] Tooltip always renders above its trigger — no downward flip, no safe minimum `top`
- [ ] [HIGH][E] Tooltip (z:9999) overlays the onboarding wizard (z:9500) during guided walkthroughs
- [ ] [HIGH][E] Help drawer panel and Tooltip share z-index 9999 — simultaneous display is undefined
- [ ] [HIGH][D] `InfoIcon` touch target is ~16 px — well below the 44 px minimum; not keyboard-focusable
- [ ] [HIGH][D] `title=` tooltips on toolbar buttons are silently suppressed on all touch devices
- [ ] [MED][D]  Touch tap toggle on `Tooltip` may not fire reliably in iOS Safari (pointerType="")
- [ ] [MED][D]  `onMouseLeave` dismissal fires immediately after a touch tap, closing the tooltip before the user can read it
- [ ] [MED][C]  Tooltip stays at stale position if the trigger element scrolls or moves while the tooltip is open
- [ ] [MED][C]  Lingering tooltip from a button click that opens a modal: tooltip z:9999 sits above modal z:1000
- [ ] [MED][B]  `InfoIcon` on conditionally rendered palette chips — no guard prevents tooltip registering on unmounting elements
- [ ] [MED][F]  Tooltip content is not wired to `aria-describedby`; screen readers never read tooltip text
- [ ] [MED][F]  Multiple tooltips can be open simultaneously — no singleton enforcement
- [ ] [LOW][F]  No guard for `text=""` or `text={null}` passed to `Tooltip` — invisible empty bubble added to DOM
- [ ] [LOW][F]  Very long unbreakable words (e.g. hex codes, compound IDs) may overflow the `max-width: 180px` container
- [ ] [LOW][F]  Help drawer shortcut list shows Ctrl/Cmd key combos with no touch-gesture equivalents
- [ ] [LOW][C]  Help drawer "Replay walkthrough" action assumes `window.WelcomeWizard` is loaded — no guard
- [ ] [LOW][A]  `PatternInfoPopover` has no bottom/right edge detection — can clip on small viewports

---

## Category A — Viewport & positioning

### A1 · No Y-axis clamping in `calculateTooltipPosition` — HIGH

**File:** `components.js`  
**What the code does:**

```js
function calculateTooltipPosition(x, width) {
  var hw = width / 2 + 8;
  return Math.max(hw, Math.min(x, window.innerWidth - hw));
}
```

Only the X axis is clamped. The Y position is computed as:

```js
top: pos.y - 10   // pos.y = getBoundingClientRect().top
```

with the tooltip styled `transform: translate(-50%, -100%)`, placing it entirely above the trigger. For any element whose `getBoundingClientRect().top` is less than the tooltip height (typically ≈ 60–120 px), the tooltip will be partially or fully off-screen above the fold.

**Affected elements:** Any `InfoIcon` or `Tooltip` rendered in the top ~120 px of the page — the palette lock/blend/stash options in Sidebar are typically at 80–200 px, which is borderline.

**Suggested fix:** Add Y clamping with a flip to render below the trigger when there is insufficient space above:

```js
var tooltipH = 80; // approximate; measure or cap
var above = pos.y - 10;
var below = pos.y + triggerH + 6;
var top = above > tooltipH ? above : below;
// cap to viewport
top = Math.min(top, window.innerHeight - tooltipH - 8);
```

---

### A2 · Tooltip always renders above its trigger — HIGH

**File:** `components.js`  
The inline style `transform:"translate(-50%,-100%)"` is unconditional. There is no code path that flips the tooltip to render below the trigger. Combined with A1, elements at the very top of the page (e.g., ToolStrip buttons that use `InfoIcon`, or a Sidebar that opens at the top) will produce an off-screen tooltip with no fallback.

---

### A3 · `PatternInfoPopover` has no edge detection — LOW

**File:** `creator/PatternInfoPopover.js`  
The popover is positioned relative to the info button in ActionBar. It uses a fixed pixel offset but contains no CSS clamp or JS repositioning for small-viewport scenarios. On a viewport narrower than ~340 px (rare but possible on some landscape phone orientations) the right edge of the popover clips outside the window. The popover is not keyboard-dismissible via Escape (it relies on a click-outside handler).

---

## Category B — Disabled & conditional elements

### B1 · `title=` tooltip silently disappears on disabled buttons — INFORMATIONAL

**Files:** `creator/ToolStrip.js`, `tracker-app.js`, `creator/MagicWandPanel.js`  
HTML `<button disabled>` suppresses `mouseover` / `focus` events in most browsers, so `title=` tooltip text is not shown when the button is disabled. This is browser-native behaviour. Current usage appears intentional (disabled buttons convey state through visual style), but there are cases — e.g. the zoom-out button at minimum zoom — where a "Already at minimum zoom" explanation via tooltip would help users understand why the button is inert.  
**No code change required** unless richer disabled-state messaging is desired; if so, a custom tooltip that fires on a wrapper `<span>` around the disabled button is the standard solution.

---

### B2 · `InfoIcon` on unmounting palette chips — MED

**File:** `creator/Sidebar.js`  
Palette chip rows render conditionally based on the active palette. When a colour is removed from the palette, the corresponding chip (and its `InfoIcon` / `Tooltip`) unmounts. If the tooltip is currently `show=true` at the moment of unmount, the portal div may briefly persist as a dangling node until React's next paint. In practice the tooltip closes before the unmount settles, but it is technically a state-after-unmount warning. No current real-world bug, but if chip removal is ever animated with a delay, the tooltip could orphan.

---

## Category C — Dynamic content & state races

### C1 · Stale tooltip position on scrolling/resizing — MED

**File:** `components.js`  
The tooltip captures `pos` (from `getBoundingClientRect()`) at the moment `show` becomes `true` (via `onMouseEnter`). Position is not recalculated on `scroll` or `resize`. For tooltips on elements inside a scrollable panel (e.g., the Sidebar which can overflow on small heights), if the user scrolls while the tooltip is open the tooltip remains at the original viewport coordinate while the trigger element moves away.

---

### C2 · Tooltip visible above modal after modal-opening click — MED

**File:** `components.js` / `modals.js`  
Modal overlays are rendered at `z-index: 1000`. The `Tooltip` portal is at `z-index: 9999`. If a button that shows a tooltip also opens a modal (e.g., an ActionBar button with an adjacent `InfoIcon`), and the tooltip hasn't been dismissed before the modal renders, the tooltip floats above the modal overlay — visible through the dimmed backdrop. The tooltip's document-click dismiss fires on the same click that opens the modal, but React batches state updates; there is a one-frame window where both are shown.

---

### C3 · Help drawer "Replay walkthrough" assumes wizard is loaded — LOW

**File:** `help-drawer.js` — Getting Started item with `action: { kind: "sample" }` and wizard replay buttons  
The Getting Started tab contains actions that call `window.WelcomeWizard.replay()`. This is only defined when `onboarding-wizard.js` is loaded. On `stitch.html` and `manager.html`, the wizard is **not** loaded. Clicking the replay button silently fails (`TypeError: Cannot read properties of undefined`) in the console with no user feedback. A guard `if (window.WelcomeWizard) { ... } else { showToast("Not available on this page"); }` would prevent the silent failure.

---

## Category D — Touch & mobile

### D1 · `InfoIcon` touch targets are below minimum size — HIGH

**File:** `components.js` (InfoIcon component)  
The `InfoIcon` renders as `<span role="img" aria-label="Information">`. No minimum touch target size is applied. The visual icon is drawn in a 16×16 area. WCAG 2.5.5 (Level AA) requires interactive controls to have a minimum pointer target of 44×44 CSS pixels. The `.tb-btn` class has a `@media (pointer: coarse)` rule that enforces `min-width: 44px; min-height: 44px`, but `InfoIcon` does not use this class and receives no equivalent sizing.

Additionally, `InfoIcon` is not `role="button"` and has no `tabIndex`, making it unreachable by keyboard navigation. Tooltip text is therefore inaccessible to both keyboard users and touch users who cannot hover.

**Suggested fix:**
```js
h("span", {
  role: "button",
  tabIndex: 0,
  "aria-label": "More information",
  style: { minWidth: 44, minHeight: 44, display: "inline-flex",
           alignItems: "center", justifyContent: "center", cursor: "default" },
  onKeyDown: function(e) { if(e.key==="Enter"||e.key===" ") toggleTooltip(); }
}, ...)
```

---

### D2 · `title=` tooltips are invisible on touch devices — HIGH

**Files:** `creator/ToolStrip.js`, `creator/ActionBar.js`, `tracker-app.js`, `creator/MagicWandPanel.js`  
All toolbar button labels — "Paint (P)", "Fill (F)", "Undo (Ctrl+Z)", "Zoom", etc. — are encoded in `title=` attributes. Touch browsers do not fire `mouseover`, so these tooltips never appear on phones or tablets. The button's visual icon is the only affordance for touch users. Buttons that have no `aria-label` (relying on `title` for the accessible name) also become inaccessible to screen readers on touch platforms.

A quick audit of buttons that have `title=` but no `aria-label`:

| File | Button | Current label |
|---|---|---|
| `creator/ToolStrip.js` | All tool buttons | `title=` only (most also have `aria-label`) |
| `tracker-app.js` | Row-nav buttons | `title=` only |

---

### D3 · Touch tap may close tooltip before the user reads it — MED

**File:** `components.js`  
The `Tooltip` wrapper `div` handles touch via:
```js
onClick: function(e) {
  if (e.pointerType === 'touch') { setShow(s => !s); e.stopPropagation(); }
}
```
The `onMouseLeave` handler `setShow(false)` can fire immediately after on some Android browsers when the pointer leaves the element following a tap. The net result is that the tooltip shows for one frame before `onMouseLeave` closes it again — effectively invisible on those devices. A `pointerType` guard on `onMouseLeave` would fix this:
```js
onMouseLeave: function(e) {
  if (e.pointerType !== 'touch') setShow(false);
}
```

---

### D4 · iOS Safari `pointerType` may be empty string — MED

**File:** `components.js`  
On iOS Safari, synthetic click events generated from a touch may have `e.pointerType === ""` rather than `"touch"`. The current check `if (e.pointerType === 'touch')` therefore never matches on iOS, meaning the tap-to-toggle behaviour is completely absent in Safari on iPhone/iPad. The condition should accept both values:
```js
if (e.pointerType === 'touch' || e.pointerType === '') { ... }
```

---

## Category E — Performance, animation & z-index

### E1 · Tooltip (z:9999) overlays the onboarding wizard (z:9500) — HIGH

**Files:** `components.js`, `onboarding-wizard.js`, `styles.css`

Z-index stack (highest wins):

| Layer | z-index | Source |
|---|---|---|
| Coachmark overlay | 10000 | `styles.css:.cs-coachmark` |
| Tooltip portal | 9999 | `components.js` inline style |
| Help drawer panel | 9999 | `help-drawer.js` inline style |
| Help drawer scrim | 9998 | `help-drawer.js` inline style |
| Onboarding wizard | 9500 | `styles.css:.iw-wizard-root` |
| Modal overlay | 1000 | `styles.css:.modal-overlay` |

The wizard sits at 9500, below the tooltip at 9999. If a user hovers over any element that is not masked by the wizard overlay — for example, parts of the header or sidebar that remain interactive during step-by-step guidance — an `InfoIcon` tooltip will render on top of the wizard panel. This can obscure wizard copy and navigation buttons.

The coachmark at 10000 correctly sits above the tooltip, so coachmarks are not affected.

**Suggested fix:** During wizard steps, either raise the wizard z-index to 10001 or suppress tooltip rendering:
```js
// In Tooltip render: skip portal when wizard is active
if (typeof window.WelcomeWizard !== 'undefined' && window.WelcomeWizard.isActive && window.WelcomeWizard.isActive()) return null;
```

---

### E2 · Help drawer panel and Tooltip share z-index 9999 — HIGH

**Files:** `components.js`, `help-drawer.js`  
Both are portaled/mounted to `document.body` with identical `z-index: 9999`. When both are in the DOM simultaneously — for example, a user opens the help drawer and then moves the mouse over an `InfoIcon` that remains exposed outside the scrim — the tooltip and drawer panel are at the same stacking level. The element that appears later in DOM order wins; since the Tooltip is portaled on `onMouseEnter` (after the drawer was already mounted), the tooltip would typically float above the drawer panel. This is confusing: a small tooltip bubble would overlay the help drawer's own content. Raise the help drawer to `z-index: 10001` to ensure it always wins over transient tooltips.

---

### E3 · Tooltip flicker from rapid mouse movement — LOW

**File:** `components.js`  
`onMouseEnter` and `onMouseLeave` are unthrottled. Rapid mouse movement across a dense `InfoIcon` row (e.g., the Sidebar's palette controls) triggers rapid show/hide React state updates. No visual flicker has been confirmed in testing but the churn is unnecessary. A 100 ms `setTimeout`-based show delay (with cancellation on `onMouseLeave`) is the standard fix and also improves perceived performance by not showing tooltips for accidental passes.

---

### E4 · No `prefers-reduced-motion` handling — LOW (no action needed)

**Files:** `styles.css`, `components.js`  
The Tooltip itself has no CSS animation; it appears instantly. The `@media (prefers-reduced-motion: reduce)` block in `styles.css` disables the help drawer slide animation. No further work is needed here.

---

## Category F — Content & accessibility edge cases

### F1 · Tooltip content never exposed to screen readers — MED

**File:** `components.js`  
The Tooltip div is portaled to `document.body` with no `role="tooltip"` and no `id`. The trigger element has no `aria-describedby` pointing to it. Screen readers therefore never announce the tooltip text, even when the tooltip is visible. Keyboard users also cannot trigger the tooltip (see D1).

**Suggested fix:**
```js
var tipId = React.useId ? React.useId() : ("tip-" + Math.random().toString(36).slice(2));
// On trigger element:
"aria-describedby": show ? tipId : undefined
// On tooltip div:
role: "tooltip", id: tipId
```

---

### F2 · Empty `text` prop silently inserts a DOM node — LOW

**File:** `components.js`  
There is no guard against `text=""` or `text={null}` in the `Tooltip` component. The portal is attached and the tooltip `div` is inserted into `document.body` whenever `show` is `true`, regardless of content. An empty tooltip renders as an invisible styled `div` that remains in the DOM until dismissed. No current callsite passes an empty string, but adding a guard is defensive:

```js
if (!text) return children; // skip tooltip when no text
```

---

### F3 · Long unbreakable words overflow the tooltip container — LOW

**File:** `components.js`  
The tooltip container has `maxWidth: width` (default 180 px) but no `wordBreak: "break-word"` or `overflowWrap: "anywhere"`. If a tooltip string contains a long unbreakable token — for example, a hex colour code, blend ID like `"310+550"`, or a translated string with no word boundaries — it will overflow the box and be clipped or extend beyond the boundary. Add `wordBreak: "break-word"` to the tooltip style.

---

### F4 · Help drawer shortcuts list is not synced to runtime bindings — LOW

**File:** `help-drawer.js`  
The shortcut table is hardcoded. The actual key bindings live in `shortcuts.js` and can be customised. If shortcuts are ever remapped programmatically, the help drawer will show stale data. Low risk currently since shortcuts are not user-configurable, but worth noting if that changes.

---

### F5 · Shortcut list has no touch-gesture equivalents — LOW

**File:** `help-drawer.js`  
The keyboard shortcuts tab lists Ctrl/Cmd combinations. Touch-only users who open the help drawer on a phone see an entirely keyboard-centric list with no gesture equivalents (e.g., "two-finger pinch to zoom", "long-press to colour-pick"). This is a UX gap rather than a bug.

---

## Manual test checklist

Use this checklist before releasing any tooltip or help-drawer changes.

### A — Positioning

- [ ] Open the creator on a 1280×800 desktop viewport. Hover over the first `InfoIcon` in the Sidebar (lock aspect ratio). Confirm tooltip is fully visible, not clipped at the top.
- [ ] Resize browser to 375×667 (iPhone SE). Hover/tap all `InfoIcon` elements in the visible area. Confirm no tooltip clips outside the viewport.
- [ ] Scroll the Sidebar so an `InfoIcon` is at the very top of the visible area. Hover it. Confirm tooltip renders below the trigger (once A1/A2 are fixed).
- [ ] Open the creator. Confirm PatternInfoPopover does not clip at the right edge on a 360 px wide viewport.

### B — Disabled states

- [ ] Set zoom to minimum. Confirm the zoom-out button shows the browser `title=` tooltip on desktop (this is expected behaviour; no regression expected).

### C — State races

- [ ] Hover an `InfoIcon` to open its tooltip. Then immediately click a button that opens a modal. Confirm tooltip is not visible through the modal overlay.
- [ ] Open the help drawer. Move mouse over any `InfoIcon` that is not blocked by the scrim. Confirm tooltip does not appear above the drawer panel (once E2 is fixed).

### D — Touch

- [ ] On an Android device (Chrome), tap an `InfoIcon`. Confirm tooltip appears and stays visible for ≥ 2 seconds without flickering closed.
- [ ] On an iOS device (Safari), tap an `InfoIcon`. Confirm tooltip appears (once D4 is fixed).
- [ ] On a touch device, tap away from an open tooltip. Confirm it dismisses.
- [ ] Confirm all toolbar buttons in ToolStrip and tracker-app have `aria-label` attributes (run: `document.querySelectorAll('button[title]:not([aria-label])').length === 0`).

### E — Z-index

- [ ] Start the onboarding wizard (first run or replay). During a wizard step, hover over an exposed `InfoIcon`. Confirm no tooltip appears over the wizard panel (once E1 is fixed).
- [ ] Open the help drawer. Hover any `InfoIcon` visible beside the drawer. Confirm tooltip does not overlay the drawer (once E2 is fixed).

### F — Content & accessibility

- [ ] Run the page through axe-core or Lighthouse accessibility audit. Confirm no "Interactive control missing accessible name" errors for `InfoIcon` elements.
- [ ] Using a keyboard alone (Tab / Space / Enter), confirm at least one `InfoIcon` can be focused and its tooltip text read aloud by a screen reader (after F1 fix).
- [ ] In DevTools console, run `document.querySelectorAll('[role=tooltip]').length` while a tooltip is visible. Should return 1 (after F1 fix).

---

## Appendix — Z-index reference

| Layer | z-index | Set in |
|---|---|---|
| Coachmark | 10000 | `styles.css` `.cs-coachmark` |
| Tooltip portal | 9999 | `components.js` inline |
| Help drawer panel | 9999 | `help-drawer.js` inline |
| Help drawer scrim | 9998 | `help-drawer.js` inline |
| Onboarding wizard | 9500 | `styles.css` `.iw-wizard-root` |
| Import wizard | ~9500 | bundled |
| Mobile right panel | 500 | `styles.css` `.rpanel` |
| Modal overlay | 1000 | `styles.css` `.modal-overlay` |
| Overlay scrim | 999 | `styles.css` `.overlay-scrim` |
| Sticky toolbar row | 99 | `styles.css` `.toolbar-row` |
| Sticky topbar | 100 | `styles.css` `.tb-topbar` |

---

*Generated by automated audit — verify findings against current source before implementing fixes.*
