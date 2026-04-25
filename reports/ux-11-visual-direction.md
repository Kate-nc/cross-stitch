# UX-11 — Visual Direction Proposals

> Phase 3. Three visual languages, one per plan in
> [ux-10](ux-10-proposals.md). Each defines tone, type scale, colour,
> spacing, iconography, and motion. The user picks one alongside the
> plan; the wireframes in [wireframes/](wireframes/) demonstrate.

> All three direction maintain:
> - SVG icons via `window.Icons` ([icons.js](../icons.js)). No emojis.
>   See [AGENTS.md](../AGENTS.md).
> - British English copy.
> - DMC swatch paired with ID + name (Principle P2 in [ux-3](ux-3-domain-reference.md)).

---

## Direction 1 · "Workshop" (pairs with Plan A — Tracker / Mobile)

> **Mood:** the well-organised cross-stitch sewing chair. Warm,
> tactile, focused on the work in front of the user. Inspired by
> Procreate's calm canvas-first chrome and the linen / wood palette of
> craft-room photography on Instagram.

### Type
- Family: **Inter** (UI), **Inter** (numerals tabular). Body weight 400,
  emphasis 600.
- Scale (six steps):
  - `--text-xs` 11px (caption, dense data)
  - `--text-sm` 12px (helper, footer)
  - `--text-md` 13px (body, labels)
  - `--text-lg` 14px (button, card title)
  - `--text-xl` 17px (section header)
  - `--text-h` 22px (page title)
  - `--text-hero` 28px (welcome, empty-state)

### Colour
Warm neutrals with a single rich accent.

| Token | Light | Dark |
|---|---|---|
| `--surface` | #FBF8F3 (linen) | #1C1A18 (warm charcoal) |
| `--surface-raised` | #FFFFFF | #2A2724 |
| `--text-primary` | #1B1814 | #F4EFE7 |
| `--text-secondary` | #5C5448 | #B6AC9C |
| `--accent` | #B85C38 (terracotta) | #E2865B |
| `--success` | #4F7D3F (sage) | #88B077 |
| `--warning` | #C0883A (amber) | #E6B069 |
| `--danger` | #A53D3D (brick) | #E07474 |

### Spacing
4 / 8 / 12 / 16 / 24 / 32 / 48. Tight on mobile (favour 8 / 12), roomy on
desktop tracker (favour 16 / 24).

### Iconography
1.6 stroke. Rounded line caps. Match existing [icons.js](../icons.js)
style. New icons added for: `wakeLock`, `qrShare`, `printer`,
`columnsCollapse`.

### Motion
- Reduced-motion strict compliance.
- Default transitions 120 ms ease-out; 200 ms for sheet entry.
- Mark-stitch animation: 80 ms scale 0.95 → 1.0 + ink fill — celebrates
  progress without intruding.

### Tone of voice
Warm, plain, encouraging without cheerleading. "100 done today — well
stitched." not "🎉 You're crushing it!". British English.

---

## Direction 2 · "Studio" (pairs with Plan B — Design System Reset)

> **Mood:** Linear / Notion / Vercel modern productivity tools.
> Disciplined, rectilinear, generous whitespace. Demonstrates that
> the foundation is robust and the team takes design tokens
> seriously.

### Type
- Family: **Geist** or **IBM Plex Sans** (UI). Tabular numerals.
- Scale aligns to a 4 px baseline grid.
  - `--text-xs` 11px / 16px line
  - `--text-sm` 12px / 16px
  - `--text-md` 13px / 20px
  - `--text-lg` 15px / 22px
  - `--text-xl` 18px / 26px
  - `--text-h` 22px / 30px
  - `--text-hero` 30px / 38px

### Colour
Cool neutrals, monochrome surfaces, single high-energy accent.

| Token | Light | Dark |
|---|---|---|
| `--surface` | #FFFFFF | #0B0C0F |
| `--surface-raised` | #F7F8FA | #16181D |
| `--text-primary` | #0B0C0F | #F1F2F4 |
| `--text-secondary` | #5B6168 | #A4A9B0 |
| `--accent` | #5046E5 (electric indigo) | #7C75F0 |
| `--success` | #14965A | #2EBE7A |
| `--warning` | #C58A00 | #E5AC2A |
| `--danger` | #D03A3A | #EE6262 |

### Spacing
Strict 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64. Components on multiples of 4.

### Iconography
1.5 stroke (slightly thinner than current). Square line caps. Heroicons-
adjacent. Considered colder than Direction 1.

### Motion
- 100 ms ease-in-out default; 150 ms for modals.
- Subtle. No bounce, no overshoot.
- Skeleton-loading shimmer at 1.4 s cycle for perceived performance.

### Tone of voice
Direct, confident, neutral. "Pattern saved." "Export complete."
Encouragement reserved for milestones (50% / 100% complete).

---

## Direction 3 · "Folk" (pairs with Plan C — Outcomes Over Tabs)

> **Mood:** the patterns themselves. Folk-art floral, sampler-band
> typography, a touch of Pinterest craft-shop. Aimed at making the
> first impression feel handmade, not engineered. Designed to
> make Bea feel "this app was made by someone who gets it."

### Type
- Family: **Söhne** or **DM Sans** (UI), **DM Serif Display** for the
  first-impression hero (welcome, empty states, page hero only — never
  body).
- Scale similar to Workshop, with a hero at 32 px.

### Colour
Saturated craft-shop palette anchored on a deep sage and floss-pink
accent — taken from the most-loved DMC colours rather than abstract
brand swatches.

| Token | Light | Dark |
|---|---|---|
| `--surface` | #FAF6EE (cream) | #15191B (deep slate) |
| `--surface-raised` | #FFFFFF | #1F2528 |
| `--text-primary` | #1B2326 | #EFE9DD |
| `--text-secondary` | #5A6469 | #A8B2B7 |
| `--accent` | #356859 (DMC 502 sage) | #5BA088 |
| `--accent-2` | #C73E5E (DMC 600 floss pink) | #E16C8B |
| `--success` | #4D8A5C | #84BD90 |
| `--warning` | #C68A2E | #E2B05A |
| `--danger` | #A53D3D | #DD7575 |

### Spacing
4 / 8 / 12 / 16 / 24 / 32. Looser than Studio, less strict than Workshop.
Decorative dividers (sampler-band style) used sparingly on home + empty
states only.

### Iconography
Mix of [icons.js](../icons.js) outline icons (1.6 stroke) and a small
set of *filled* "stitch motif" icons used as section markers
(petal, leaf, knot, stitch X). The filled motifs are used in welcome /
home / hero contexts only — never inside the canvas chrome.

### Motion
- 140 ms ease-out default; 220 ms for hero/welcome elements.
- One celebration moment at 100% complete (sampler-band sweeps in
  beneath the project title). Otherwise restrained.

### Tone of voice
Warm + slightly literary. "Welcome back. You left off mid-rose."
Stitcher slang welcomed sparingly ("frogging" labelled with a tooltip
the first time).

---

## Choosing a direction

Strictly tied to plan choice:

- **Plan A → Workshop.** Calm, tactile, gets out of the way of the
  canvas. Right for mobile-tracking-flagship.
- **Plan B → Studio.** Disciplined, demonstrates the system. Right
  for design-system-reset.
- **Plan C → Folk.** Personality-forward, makes the first 60 seconds
  delightful. Right for outcomes-over-tabs (Bea-first).

Direction is *not orthogonal* to plan: each direction's tonal language
amplifies the strategy of its plan. Mixing (Plan A + Folk, etc.) is
possible but would dilute both.

---

## Cross-direction non-negotiables

Regardless of pick:
- **No emojis in user-facing UI.** [icons.js](../icons.js) only.
- **DMC swatch is rendered with canonical RGB** + ID + name in every
  thread chip ([ux-3 P2](ux-3-domain-reference.md#p2--dmc-colour-fidelity-is-non-negotiable)).
- **Symbol-on-coloured-cell** is the default chart rendering; symbol-
  only mode is always available.
- **Reduced-motion** support across all motion choices.
- **44 px minimum** touch targets on `pointer: coarse`.
- **British English** in all copy.
- **Accent passed through CSS variables** so the user can pick from
  the four-accent system in preferences (red / amber / blue / pink)
  on top of the chosen direction.

---

## Wireframes

Each direction is rendered in its plan's wireframes:

- Plan A · Workshop: [plan-a-tracker-mobile.html](wireframes/plan-a-tracker-mobile.html), [plan-a-tracker-tablet.html](wireframes/plan-a-tracker-tablet.html), [plan-a-pattern-tab.html](wireframes/plan-a-pattern-tab.html)
- Plan B · Studio: [plan-b-token-system.html](wireframes/plan-b-token-system.html), [plan-b-dark-mode.html](wireframes/plan-b-dark-mode.html), [plan-b-modal-primitive.html](wireframes/plan-b-modal-primitive.html)
- Plan C · Folk: [plan-c-creator-design.html](wireframes/plan-c-creator-design.html), [plan-c-creator-use.html](wireframes/plan-c-creator-use.html), [plan-c-header-switcher.html](wireframes/plan-c-header-switcher.html), [plan-c-home.html](wireframes/plan-c-home.html)
