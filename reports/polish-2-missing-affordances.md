# Polish Pass 2 — Missing Affordances & Linkification

**Audit date:** 2026-04-27  
**Result:** 28 missing-affordance items, mostly CSS hover-state additions and a handful of "make this swatch/row clickable" component changes.

The highest-leverage fix is the "swatch/row click-to-focus" pattern: [tracker-app.js](tracker-app.js#L5826) `.cqd-tile` already implements it correctly — replicate that pattern for the Stats colour timeline, the Stash shopping rows, and the project-card progress bars.

---

## A. Text that should link

### A1. DMC codes in shopping rows
- [manager-shopping.js](manager-shopping.js#L256), [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L80), [creator/MaterialsHub.js](creator/MaterialsHub.js#L120)
- Currently plain text. Click should open colour-detail popover (or in Creator: select that colour in the palette).
- Scope: 3 surfaces, widespread.

### A2. Project names in shopping list source list
- [manager-shopping.js](manager-shopping.js#L263)
- Already buttons but visually muted; lift to nav-link styling so users see they jump to the project.

### A3. Feature references inside help topics
- [help-drawer.js](help-drawer.js#L96)
- "Auto-synced from any project you save in the **Creator / Tracker**" — bold text, no link. Make these jump to the relevant page.
- Scope: one-off (help drawer only).

### A4. "Saved" status badge in header
- [header.js](header.js#L71), [header.js](header.js#L511)
- Display-only chip; expected to be clickable to force a sync check / open sync details.

---

## B. Elements that should be interactive

### B1. Colour swatches in stats colour timeline
- [components.js](components.js#L442)
- Display-only `.colour-swatch`. Add `onClick` mirroring [tracker-app.js](tracker-app.js#L5826) `.cqd-tile`: set focus colour, navigate.
- Scope: widespread (Stats + ColourProgress).

### B2. Colour swatches in shopping rows
- [manager-shopping.js](manager-shopping.js#L255), [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L88)
- Click should open colour-detail popover (RGB/hex, name, where used).

### B3. Progress bars on project cards
- [home-screen.js](home-screen.js#L359)
- `.mpd-card-progress-track` — display-only. Click should open the project in Tracker.

### B4. Project metadata strip on cards
- [home-screen.js](home-screen.js#L363)
- "14 threads · 80×80" — could open a project-info popover.

### B5. Project recency timestamp
- [home-screen.js](home-screen.js#L371)
- Click could sort projects by recency.

### B6. Whole row in `.stats-colour-row`
- [components.js](components.js#L821)
- Currently only swatch is visually distinct. Make the entire row clickable to focus the colour.

### B7. "47 stitches remaining" type counts
- [components.js](components.js#L827)
- Click could filter the canvas to that colour's remaining cells.

---

## C. Missing hover / click feedback (CSS-only)

| # | Selector | File | Recommended |
|---|---|---|---|
| C1 | `.colour-tl-row` | [styles.css](styles.css#L1729) | Add `:hover { background: var(--surface-tertiary); }` + `transition: background var(--motion-fast)` |
| C2 | `.stats-colour-row` | [styles.css](styles.css#L2590) | Same pattern; add `cursor: pointer` |
| C3 | `.mgr-shopping-row` | [styles.css](styles.css#L4305) | Same pattern |
| C4 | `.colour-swatch` | [styles.css](styles.css#L1730) | Add `cursor: pointer` + accent-coloured `:hover` border |
| C5 | `.mpd-card-progress-track` | [styles.css](styles.css#L7310) | Add `cursor: pointer` + brightness shift on hover |
| C6 | `.home-proj-row` | [styles.css](styles.css#L7480) | Already has hover; consider adding subtle background shift for stronger affordance |

**Reference implementation (do not change):** [tracker-app.js](tracker-app.js#L5826) `.cqd-tile`. It is the canonical correct pattern (handler + cursor + hover + active + aria-label).

---

## Suggested implementation order

1. CSS-only hover states (C1–C5) — single PR, quick win.
2. Wire colour-swatch / row `onClick` handlers (B1, B2, B6) — replicate `.cqd-tile`.
3. Make project-card progress bar clickable (B3).
4. Linkify DMC codes (A1) and the saved-badge (A4).
5. Defer A3 (help drawer) and B5/B7 pending UX call.
