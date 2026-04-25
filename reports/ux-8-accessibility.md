# UX-8 — Accessibility Audit (WCAG 2.2 AA)

> Phase 2 audit. Severity:
> - **High** — WCAG 2.2 AA failure
> - **Medium** — best-practice gap, may pass technical audit but harms users
> - **Low** — polish

---

## Summary

The app has a solid accessibility foundation: skip-to-content link,
`<html lang>`, `:focus-visible` styles, `prefers-reduced-motion`
honoured in many places, the Materials Hub uses a textbook ARIA
tablist with roving tabindex. But three structural gaps prevent a
clean WCAG 2.2 AA pass:

1. The two canvases (Creator and Tracker) are entirely opaque to
   assistive technology. There's no text alternative, no keyboard
   route, no live announcement when state changes.
2. Modals lack `role="dialog"` + `aria-modal` + focus trap.
3. Multiple states are signalled by colour alone (badges, toasts,
   today / streak counters).

A focused a11y pass — perhaps two weeks — would close most findings;
the canvas problem is harder and needs design thinking.

---

## High-severity findings (WCAG fails)

### A-H1 · Form inputs lack `htmlFor`/`id` association
**WCAG 1.3.1 Info and Relationships**
**Where:** [creator/Sidebar.js:571,575](../creator/Sidebar.js)

Width / height number inputs have a `<label>` adjacent but not
associated. Screen readers may announce the input as unlabeled.

**Fix:** Either wrap the input inside the label or use
`htmlFor`+`id`.

### A-H2 · Pattern canvas has no keyboard route
**WCAG 2.1.1 Keyboard**
**Where:** [creator/PatternCanvas.js](../creator/PatternCanvas.js#L130)

The canvas accepts pointer/touch only. There is no keyboard
equivalent for selecting a colour and stitching a cell.

**Fix:** Two-pronged. **Short-term:** add a clearly labelled "use
keyboard mode" panel that lets a user move a focus square with
arrow keys + Enter to place a stitch. **Longer-term:** ensure all
toolbar actions, palette picks, and modes are keyboard-reachable, and
the canvas exposes its cursor position via `aria-live`.

### A-H3 · Tracker canvas has no keyboard route or text alternative
**WCAG 2.1.1 Keyboard, 1.1.1 Non-text Content**
**Where:** [tracker-app.js:229](../tracker-app.js)

The display canvas has no `tabindex`, no keyboard handler, no
`aria-label`. A screen-reader user gets nothing.

**Fix:** Add `aria-label="Cross-stitch chart, X by Y stitches, P% complete"`.
Add a "screen-reader companion" panel that lists the next-N unstitched
cells with their colour and coordinates, and announces marking via
`aria-live`.

### A-H4 · Modals lack dialog semantics
**WCAG 4.1.2 Name, Role, Value**
**Where:** [tracker-app.js:380](../tracker-app.js),
[modals.js:38-50](../modals.js)

`<div className="modal-overlay">` is used without `role="dialog"`,
`aria-modal="true"`, or `aria-labelledby` referencing the modal
title.

**Fix:** Wrap modal content in a `role="dialog" aria-modal="true"`
container with `aria-labelledby` set to the modal title's `id`.

### A-H5 · Insufficient text contrast
**WCAG 1.4.3 Contrast**
**Where:** [styles.css:7-8](../styles.css)

`--text-tertiary: #64748b` on `--surface: #fff` measures ~3.8:1 —
below the 4.5:1 body-text minimum.

**Fix:** Darken to `#475569` (≈ 7:1) for body usage; reserve the
lighter shade for non-essential annotation only.

---

## Medium-severity findings

### A-M1 · Modals lack focus trap
**Where:** [modals.js](../modals.js)

ESC-to-close is implemented; focus containment isn't. Tab can move
focus to the obscured background.

**Fix:** Implement focus trap on `open`; restore focus to the trigger
on `close`. (`focus-trap` library exists; or a small custom hook.)

### A-M2 · Heading hierarchy may skip levels
**Where:** [creator/ProjectTab.js:39](../creator/ProjectTab.js),
[creator/ExportTab.js:392](../creator/ExportTab.js)

`<h3>` used without an enclosing `<h2>`.

**Fix:** Audit each route's heading tree; ensure h1 → h2 → h3 with no
gaps.

### A-M3 · Manager thread inventory is not a semantic table
**Where:** [manager-app.js](../manager-app.js#L1700)

Thread rows are flex divs; screen-reader users get no row/column
context, no header announcement.

**Fix:** Use `<table role="grid">` with `<thead>`, `<tr>`, `<th>`,
`<td>`, or a `role="table"` div hierarchy with the same semantics.

### A-M4 · Range inputs lack visible labels
**Where:** [creator/Sidebar.js:565,894,1149](../creator/Sidebar.js)

Sliders are labeled by surrounding text but the relationship may not
be obvious to magnifier users.

**Fix:** Visible `<label>` with `for=` linkage; current value visibly
adjacent.

### A-M5 · Help drawer's click-outside-to-close pattern is undocumented
**Where:** [help-drawer.js:17-18](../help-drawer.js)

`role="dialog" aria-modal="false"` is correct *if* the drawer is
non-modal, but the close behaviour (click outside) isn't announced or
labelled.

**Fix:** Add an explicit "Close" button with `aria-label` inside the
drawer; document the close gesture in instructional text or screen-
reader-only copy.

### A-M6 · Skip-to-content not verified on all entry points
**Where:** [stitch.html](../stitch.html), [manager.html](../manager.html)

`index.html` has the skip link; verify equivalent on the other two
pages.

**Fix:** Add the same skip link pattern to all three HTML entry
points; ensure each page's `main` landmark has a stable `id`.

### A-M7 · Live regions missing for important state changes
A stitch marked, a save success, an export started/finished — all
silent to AT.

**Fix:** A single hidden `aria-live="polite"` region; toasts also
mirror to it.

### A-M8 · Custom widgets without ARIA roles
The palette grid, colour drawer, and command palette combobox lack
proper widget ARIA. Command palette in particular needs `role="combobox"`,
`aria-expanded`, `aria-activedescendant` for the result list.

**Fix:** Apply the WAI-ARIA Combobox pattern to the command palette.

---

## Low-severity findings

### A-L1 · Reduced-motion gaps
[styles.css:57,789,2420,3611](../styles.css) — most animations honour
`prefers-reduced-motion`, but a search shows several `@keyframes`
without a corresponding reduced-motion override (e.g.
`card-pickbg-pulse`).

**Fix:** Sweep every `animation:` and ensure each is wrapped in a
reduced-motion guard.

### A-L2 · Some icon buttons lack `aria-label`
[header.js:345](../header.js) — keyboard-shortcuts button is correct;
audit other icon-only buttons across components.

**Fix:** Lint rule: every icon button must have `aria-label`.

### A-L3 · Preferences "Accessibility" panel under-delivers
[preferences-modal.js:619-650](../preferences-modal.js) — high-
contrast and reduced-motion toggles exist, but no font-size, no
dyslexia font, several other options listed are "Coming soon".

**Fix:** Either ship the missing toggles or remove them from the UI
until they are real (per [ux-3 §7](ux-3-domain-reference.md#7-vocabulary-in-app-copy--the-dos-and-donts)).

### A-L4 · Number-input spinners small at 200% zoom
[creator/Sidebar.js](../creator/Sidebar.js) — browser-native spinners
on `<input type="number">` are tiny at 200% zoom; users with low
vision struggle.

**Fix:** Provide custom `+`/`–` buttons of 44×44 next to numerics for
the most-used inputs.

### A-L5 · Realistic preview canvas lacks alt text
[tracker-app.js:220-230](../tracker-app.js) — no `aria-label` or
`role="img"` on the realistic preview canvas.

**Fix:** `aria-label="Realistic stitch preview of <project name>, <P>% complete"`.

### A-L6 · Manager sort buttons don't announce sort direction
Column-header sort toggles need `aria-sort="ascending|descending|none"`.

### A-L7 · Toasts may auto-dismiss before screen-reader finishes
Toast duration ~3 s; `aria-live` region needs to keep content long
enough for AT to read.

**Fix:** Don't auto-dismiss critical toasts; let the user dismiss.

---

## Themes

1. **The two canvases are an a11y blackhole.** Solving this isn't a
   tech fix — it needs a design pattern (companion list, keyboard
   navigation grid, screen-reader summary). This is the highest-impact
   single investment.
2. **Modal hygiene** (dialog role, focus trap, focus restoration) is
   missing across the board. A single modal primitive would fix it
   everywhere.
3. **Colour-only signal** keeps creeping back. A lint rule plus the
   icon-pairing principle from [ux-3 §4 P3](ux-3-domain-reference.md#p3--symbols-are-equal-partners-with-colours)
   would prevent regressions.
4. **The Accessibility preference panel needs to be honest.** Either
   ship the toggles or remove them.
