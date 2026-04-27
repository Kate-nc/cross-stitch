# Polish Pass 9 — Design Token Inventory

**Audit date:** 2026-04-27  
**Source of truth:** [styles.css](styles.css) `:root` (light) and `[data-theme="dark"]` (dark). Workshop is the only theme.

This document captures the canonical design tokens that already exist in the app, identifies which deviating values appear in component code, and prescribes the consolidation rules for the harmonisation phase. **No new design system is invented here** — this is the best-of-what-already-exists.

---

## Colour

### Canonical (light → dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#B85C38` | `#E2865B` | primary action, links |
| `--accent-hover` | `#944526` | `#F0A07A` | accent hover state |
| `--accent-2` | `#944526` | `#F0A07A` | secondary accent (graphs) |
| `--accent-soft` / `--accent-light` | `#F4DDCF` | `#3A2418` | accent-tinted surfaces |
| `--accent-border` | `#E8B89A` | `#6E3A22` | borders on accent surfaces |
| `--accent-ink` | `#5C2A14` | `#F4DDCF` | text on accent-soft |
| `--text-on-accent` | `#FFF8F0` | `#1B1410` | text on solid accent |
| `--text-primary` | `#1B1814` | `#F4EFE7` | body text |
| `--text-secondary` | `#5C5448` | `#B6AC9C` | secondary text |
| `--text-tertiary` / `--text-muted` | `#8A8270` / `#8A8270` | `#847B6C` | muted text |
| `--surface` | `#ffffff` | `#1C1A18` | cards / dialogs |
| `--surface-secondary` | `#FBF8F3` | `#14120F` | page bg |
| `--surface-tertiary` | `#EFE7D6` | `#2A2724` | hover, selected row |
| `--line` | `#E5DCCB` | `#3A352E` | borders |
| `--line-2` | `#D8CDB6` | `#4B4339` | strong borders |
| `--success` / `--success-soft` | `#4F7D3F` / `#DEE7D2` | `#88B077` / `#2C3A24` | success |
| `--warning` / `--warning-soft` | `#C0883A` / `#F2E2BE` | `#E6B069` / `#3A2E16` | warning |
| `--danger` / `--danger-soft` | `#A53D3D` / `#F1D2D2` | `#E07474` / `#3E1F1F` | danger |

### Deviations to retire

11 raw hex values are still used inline in JS (see Polish 3 §Colour). All map to existing tokens; **no new colour tokens needed**.

---

## Spacing scale

**Canonical:** `--s-1: 4`, `--s-2: 8`, `--s-3: 12`, `--s-4: 16`, `--s-5: 24`, `--s-6: 32`, `--s-7: 48`. (Defined at [styles.css](styles.css#L60).)

**Deviations:** 2, 3, 5, 6, 7, 10, 14, 20 px appear in component inline styles.

| Outlier | Snap to |
|---|---|
| 2px | `var(--s-1)` halved — only worth a `--s-half` token if 5+ uses; otherwise round to 4 |
| 3px | drop or round to 4 |
| 5px | round to 4 |
| 6px | round to `var(--s-2)` (8) **or** introduce `--s-1-5: 6px` if 5+ uses |
| 7px, 10px | round to `var(--s-2)` (8) |
| 14px | round to `var(--s-4)` (16) |
| 20px | round to `var(--s-5)` (24) |

**Decision:** keep the 7-step scale; do **not** add micro-tokens unless an outlier value clears 5 occurrences.

---

## Border-radius

**Canonical:** `--radius-sm: 6`, `--radius-md: 8`, `--radius-lg: 10`, `--radius-xl: 12`, `--radius-pill: 999`.

**Deviations found:** 2, 3, 4, 5, 7, 14, 20px.

| Outlier | Snap |
|---|---|
| 2/3 | `--radius-sm` |
| 4 | introduce `--radius-xs: 4px` only if 3+ uses (kbd hints currently use it) |
| 5/7 | `--radius-sm` |
| 14 | `--radius-xl` (12) |
| 20 | `--radius-xl` (12) |

**Decision:** add `--radius-xs: 4px` to the canonical set; collapse the rest.

---

## Typography scale

**Canonical:** `--text-xs: 11`, `--text-sm: 12`, `--text-md: 13`, `--text-lg: 14`, `--text-xl: 17`, `--text-h: 22`, `--text-hero: 28`.

**Deviations:** 10, 15, 16, 20px.

| Outlier | Snap |
|---|---|
| 10 | `--text-xs` (11), unless need a true 10 — then `--text-xxs` |
| 15 / 16 | `--text-lg` (14) or `--text-xl` (17), per context |
| 20 | `--text-h` (22) |

**Decision:** keep 7 steps; only add `--text-xxs: 10px` if it's used in 3+ places.

---

## Shadows

**Canonical:** `--shadow-sm`, `--shadow`, `--shadow-md`, `--shadow-lg` (defined at [styles.css](styles.css#L18,L69)). Both light and dark have parallel definitions.

No widespread deviations; one-off `box-shadow: 0 2px 4px rgba(0,0,0,.08)` style shows up in 2–3 components — replace with `--shadow`.

---

## Motion

**Canonical:** `--motion-fast: 120ms ease-out`, `--motion: 160ms ease-out`, `--motion-slow: 220ms ease-out`. (Defined at [styles.css](styles.css#L64).)

**Deviations:** 8 hardcoded durations (Polish 6). Mapping rule:

| Range | Snap |
|---|---|
| ≤ 130ms | `var(--motion-fast)` |
| 140–190ms | `var(--motion)` |
| ≥ 200ms | `var(--motion-slow)` |

---

## Z-index

**Currently unscaled** (10 → 10000 with duplicates and gaps, see Polish 4).

**Proposed canonical scale (new, but extracted from existing intent):**

```css
--z-base:       1;
--z-sticky:    100;   /* topbar, strip, sticky tabs */
--z-dropdown:  400;   /* toolbar dropdowns */
--z-fab:       450;
--z-action-bar: 500;
--z-backdrop:  900;
--z-modal:    1000;
--z-toast:    1100;
--z-coachmark: 1200;
```

This is the smallest token set this audit recommends adding. It replaces values 10–10000 (all duplicates) and gives the codebase a 9-level system consumed via CSS variables.

---

## Component patterns

| Pattern | Canonical |
|---|---|
| Button height | 32–36px desktop, 44px touch (`@media (pointer: coarse)`) |
| Button padding | `var(--s-2) var(--s-3)` |
| Input height | 36px desktop, 44px touch |
| Modal max-width | 720px (current default in `.overlay-panel--dialog`) |
| Sheet | `border-radius: var(--radius-xl) var(--radius-xl) 0 0`, slides via `var(--motion-slow)` |
| Card padding | `var(--s-4)` |
| Card radius | `var(--radius-md)` |
| Tooltip radius | `var(--radius-sm)` |
| Chip radius | `var(--radius-pill)` |

---

## What is **not** changing

- The full Workshop palette (`--accent` family, `--success`, `--warning`, `--danger`).
- The dark-mode mappings.
- The 7-step spacing scale.
- The 7-step type scale.
- The 3-step motion scale.
- The PDF / Pattern Keeper export pipeline (out of scope per AGENTS.md).

The harmonisation work in Polish 10/11 only consolidates **deviations** onto the existing tokens above and adds two small new pieces: `--radius-xs: 4px` and the `--z-*` scale.
