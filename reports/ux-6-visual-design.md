# UX-6 — Visual Design Audit

> Phase 2 audit. Inspects typography, colour, spacing, hierarchy,
> iconography, density, and consistency across the three pages.

---

## Summary

The design system has good bones — CSS variables, an accent system, a
proper SVG icon library, prefers-reduced-motion handling — but they
are **systematically underused** in React components, where hardcoded
hex values, inline styles, and ad-hoc font sizes proliferate. The
result is a UI that *almost* feels coherent but breaks down at every
component boundary.

Two systemic problems dominate:

1. **Tokens exist but aren't enforced.** CSS variables for colour,
   spacing, and accent live in `styles.css`, but inline styles in
   React components routinely use raw hex.
2. **Dark mode is half-built.** A `pref-dark` class exists; only ~6
   files reference it. The Tracker and Manager are essentially
   light-mode only.

Both are addressable by a focused design-token consolidation pass —
see [ux-9-prioritised-issues.md](ux-9-prioritised-issues.md) and
[ux-10-proposals.md](ux-10-proposals.md).

---

## High-severity findings

### V-H1 · Icon stroke-width mismatch
**Where:** [icons.js:19](../icons.js),
[command-palette.js](../command-palette.js)

`SVG_PROPS.strokeWidth` is `2` in `icons.js`, but
[AGENTS.md](../AGENTS.md) and the copilot instructions specify `1.6`.
The command palette also hardcodes its own search SVG with
`stroke-width="2"` instead of calling `Icons.search()`.

**Fix:** Set `strokeWidth: 1.6` globally; replace hardcoded SVG in
command palette with `Icons.search()`.

### V-H2 · Dark mode is ~10% complete
**Where:** [styles.css](../styles.css),
[command-palette.js:278](../command-palette.js)

`html.pref-dark` is defined but referenced in only six places. The
core CSS variables (`--surface`, `--text-primary`, etc.) have no
`pref-dark` overrides. Manager and Tracker components use inline hex
that ignore the theme entirely.

**Fix:** Define a complete `html.pref-dark { --surface: ...; }` block,
move all inline hex to CSS variables, audit per-page contrast.

### V-H3 · Button-class proliferation with inconsistent hover mechanics
**Where:** scattered: `.tb-btn`, `.home-btn`, `.mpd-btn`, `.g-btn`,
`.lp-btn`, `.emb-btn`, `.sync-btn`, `.gsd-btn`

A dozen+ button classes exist with overlapping semantics. Some hover
via `filter: brightness(0.97)`, others via hardcoded `--hover` colours,
others via background-colour swaps. Visual feedback on click is
inconsistent.

**Fix:** Consolidate to four semantic types — `primary`, `secondary`,
`ghost`, `danger` — with size modifiers (`sm`, `md`, `lg`).
Page-specific classes alias to one of those four.

### V-H4 · Colour-only state signals
**Where:** [components.js:227](../components.js) (mini-streak amber),
[tracker-app.js](../tracker-app.js) (Today teal),
[toast.js](../toast.js) (border-left colour-only)

Toasts indicate type via a 3 px coloured border-left only — no icon.
The "in use" badge on a thread shows amber with no other cue. The
mini-streak counter relies on amber.

This violates WCAG 1.4.1 Use of Colour (and our own Principle P3 from
[ux-3](ux-3-domain-reference.md)).

**Fix:** Pair every coloured state with an icon —
`Icons.fire`/`Icons.check`/`Icons.warning` from
[icons.js](../icons.js) — and a text label.

### V-H5 · No defined type scale
**Where:** scattered: 11px / 12px / 13px / 14px / 16px / 20px / 24px
appear seemingly at random across components

No tokens, no scale. Tracker uses 11 px body text in places; Manager
uses 13 px in equivalent places; Creator's Sidebar uses 11 px labels
that are too small.

**Fix:** Define six steps —
`--text-xs: 11px`, `--text-sm: 12px`, `--text-md: 13px`, `--text-lg:
14px`, `--text-xl: 16px`, `--text-h: 20px`, `--text-hero: 24px` — and
replace inline `font-size` with these tokens.

### V-H6 · Modal styles fork into two systems
**Where:** [modals.js:31-65](../modals.js),
[preferences-modal.js:21](../preferences-modal.js)

`.modal-overlay`/`.modal-content` and `.modal-box`/`.modal-header`
coexist with overlapping responsibilities. The preferences modal uses
inline hex.

**Fix:** Pick one system; convert the other; remove inline styles.

---

## Medium-severity findings

### V-M1 · Tab styling inconsistent across pages
Creator right-panel tabs are 11 px font; Tracker app tabs 13 px;
Manager 13 px; Stats 13 px. Font-weights vary 500 vs 600.

**Fix:** All tabs 13 px, weight 600, matching `.tb-app-tab`.

### V-M2 · Progress-bar dual implementation
`.tb-progress` (older) and `.info-strip` / `.mini-goal-fill` /
`.colour-bar-fill` (newer) coexist; both render in some Tracker
contexts.

**Fix:** Consolidate to a single `.progress` component with size and
state modifiers.

### V-M3 · CSS variables underused inside React inline styles
[tracker-app.js:159-200](../tracker-app.js),
[components.js](../components.js),
[modals.js](../modals.js)

`#0d9488`, `#1e293b`, `#94a3b8` etc. are repeated as inline `style`
values instead of `var(--accent)`, `var(--text-primary)`,
`var(--text-tertiary)`.

**Fix:** Mass-replace inline hex with `var(--*)` references.

### V-M4 · Badge fragmentation
Eight different badge styles (`.stash-badge`, `.session-chip`,
`.timeline-milestone-badge`, `.sync-stat-badge`, `.goal-preset-btn`,
etc.) with different paddings and colours.

**Fix:** One `.badge` component with `--sm` / `--md` / `--lg` and
colour modifiers.

### V-M5 · Density jars between pages
Creator Sidebar feels compact (11 px labels, tight rows); Manager
thread cards feel spacious (32 px swatches, generous padding); Tracker
sits between but uses 11 px text in dense rows.

**Fix:** Define three density profiles (`compact` / `normal` /
`spacious`) and pick one per page intentionally.

### V-M6 · Responsive breakpoints inconsistent
Both 599 px and 600 px appear; 480 px, 899 px, and 1024 px are also
used. `(pointer: coarse)` is mixed in.

**Fix:** Standardise to 480 px (sm), 768 px (md), 1024 px (lg).

### V-M7 · Focus-ring inconsistent
Some elements use `outline: 2px solid var(--accent-border)`; inputs
use `border-color: var(--accent)`; some have no visible focus ring at
all.

**Fix:** Single `.focus-ring` mixin; apply globally via
`:focus-visible`.

### V-M8 · Manager headers and Creator headers don't match
The Manager has a sub-header strip with action chips; the Creator has
the Sidebar; the Tracker has its toolbar pill. No shared visual rhythm.

**Fix:** Define a "page-action bar" component shared across all three.

---

## Low-severity findings

### V-L1 · Empty states are plain text
`ThreadSelector` shows "No threads found" as plain text. No icon, no
suggested action.

**Fix:** `EmptyState` component with icon + headline + optional CTA.

### V-L2 · Toast type signal weak
Border-left only; the "Undo" button is small and easy to miss.

**Fix:** Icon + larger Undo button.

### V-L3 · Charts hardcode purple `#534AB7`
Component charts in [components.js:306](../components.js) ignore the
accent system.

**Fix:** Use `var(--accent)` (or a chart-specific token).

### V-L4 · Link underlines inconsistent on hover
`.nav-link:hover` underlines; many other text-buttons don't.

**Fix:** Apply hover underline globally to interactive text.

### V-L5 · Inline SVG in command palette
Hardcoded search SVG instead of `Icons.search()`.

**Fix:** Replace; the icon library is the single source of truth.

### V-L6 · Preferences modal has its own colour map
[preferences-modal.js:46-49](../preferences-modal.js) — local
`COLOURS` object that doesn't follow accent changes.

**Fix:** Use CSS vars; remove the local map.

### V-L7 · Modal scroll strategy varies
Some modals scroll on the outer container, some on a nested div, some
clip.

**Fix:** Standard `.modal-scroll` wrapper.

### V-L8 · Designer-targeting copy occasionally creeps into beginner UI
Words like "render", "deserialize", "pipeline" (audit the help drawer
and tooltips for engineering vocabulary).

**Fix:** Copy review pass; substitute British craft English (see
[ux-3 §7](ux-3-domain-reference.md#7-vocabulary-in-app-copy--the-dos-and-donts)).

---

## Themes

1. **Tokens exist; enforcement does not.** A linter or stylelint rule
   blocking inline hex would prevent regressions.
2. **Dark mode needs to be a release in itself**, not an
   eternally-half-built setting.
3. **Component sprawl is the root of the inconsistency.** Eight badges,
   twelve buttons, two modal systems, multiple progress bars. A
   focused consolidation pass — see Plan B in
   [ux-10-proposals.md](ux-10-proposals.md) — would dramatically
   compress the surface area.
