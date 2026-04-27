# Polish Pass 4 — Alignment, Spacing & Layout Issues

**Audit date:** 2026-04-27  
**Headline:** 3 critical mobile/responsive layout bugs + 11 high/medium issues, plus a chaotic z-index inventory spanning 10 → 10000 with duplicates.

## Z-index inventory

| Layer | Selector | z-index | File |
|---|---|---|---|
| Coachmark / cmd palette | `.cs-coachmark`, `.cs-cmdp-overlay` | 10000 | [command-palette.js](command-palette.js#L284) |
| Modal overlay | `.modal-overlay` / `.modal-box` | 1000 | [styles.css](styles.css#L219) |
| Backdrops | `.rpanel-backdrop`, `.lpanel-backdrop` | 999 | [styles.css](styles.css#L604) |
| Toolbar dropdown | `.tb-dropdown` | 500 | [styles.css](styles.css#L465) |
| Tracker action bar | `.tracker-action-bar` | 501 | [styles.css](styles.css#L2149) |
| FAB undo | `.fab-undo` | 400 | [styles.css](styles.css#L636) |
| Page dropdown | `.tb-page-dropdown` | 201 | [styles.css](styles.css#L655) |
| Topbar | `.tb-topbar` | 100 | [styles.css](styles.css#L459) |
| Strip / toolbar row | `.tb-strip`, `.toolbar-row` | 99 | [styles.css](styles.css#L481) |
| Info strip | `.info-strip-wrap` + child | 98 (both!) | [styles.css](styles.css#L2667) |
| Sticky tabs | `.lp-tabs`, `.rp-tabs` | 10 | [styles.css](styles.css#L550) |

**Problems:** duplicate 10000 (cmd palette and coachmark race); two completely different toolbar dropdowns at 500 vs 201; parent + child both 98 on info-strip; large gap 10 → 98 → 99 → 100 → 201 with no semantic system. **Recommendation:** introduce CSS custom properties `--z-toolbar`, `--z-dropdown`, `--z-modal`, `--z-toast`, `--z-coachmark` and standardise.

---

## 🔴 Critical

### C1. Help drawer width calc breaks below 380px
- [help-drawer.js](help-drawer.js#L739): `width: "calc(100vw - 380px)"` resolves to **negative** at 375px (iPhone SE) → drawer collapses to 0.
- **Fix:** `width: min(380px, 100vw)` plus `@media (max-width: 480px) { width: 100vw }`.

### C2. Tracker info-strip sticky offset is hardcoded 100px
- [styles.css](styles.css#L2667): `top: 100px` ignores `env(safe-area-inset-top)` — misaligns on notched devices in landscape.
- **Fix:** `top: calc(48px + env(safe-area-inset-top, 52px))`.

### C3. /home active-card action buttons don't stack on mobile
- [home-app.js](home-app.js#L150) renders `.home-active-card__actions` but no `@media (max-width: 480px)` rule in [styles.css](styles.css) makes them column-stack.
- At 375px, `Resume tracking` + `Edit pattern` overflow or wrap awkwardly.
- **Fix:** add a single media query that flips the flex-direction and sets `width: 100%`.

---

## 🟡 High

### H1. Toolbar dropdowns at inconsistent z-index
- `.tb-dropdown` (500) vs `.tb-page-dropdown` (201) — same UI pattern. Standardise.

### H2. Long project names break `.home-proj-row`
- [home-app.js](home-app.js#L325): name button has no `min-width: 0` on its flex parent → ellipsis fails, row width pushes off-screen.
- **Fix:** `.home-proj-row__body { flex: 1; min-width: 0; }`.

### H3. Creator palette pill is `overflow: visible` on mobile
- [styles.css](styles.css#L490) — 30+ colour palettes spill off-screen instead of horizontally scrolling. Match the `.swatch-strip-row` pattern.

### H4. Right panel crushes canvas at 800–1024px
- [styles.css](styles.css#L501): `.rpanel { width: 280px; flex-shrink: 0 }` with no media query to drawer-ise on tablet.
- **Fix:** `@media (max-width: 1024px) { .rpanel { display: none } }` or reuse the existing mobile drawer treatment.

### H5. Command palette uses `100vh` on mobile
- [command-palette.js](command-palette.js#L285): `100vh` doesn't shrink when the iOS soft keyboard appears → search input hidden behind the keyboard.
- **Fix:** swap `100vh` → `100dvh`.

### H6. Nested sticky on `.rpanel` + `.rp-tabs`
- [styles.css](styles.css#L505,L513): two stacked sticky elements with conflicting `top` references. Verify behaviour and either drop the inner sticky or pin it correctly.

---

## 🟢 Medium

- **M1. Tracker canvas bottom padding 112px is static** — wastes space when drawer is closed. [styles.css](styles.css#L2168). Consider syncing with drawer state.
- **M2. Materials sidebar grid breakpoint at 599px** — flips 2-col → 1-col one pixel away from iPad mini. Bump to 800px. [styles.css](styles.css#L503).
- **M3. Action bar safe-area padding double-counted** — [styles.css](styles.css#L2149). Use a single `calc()` expression.
- **M4. Two modal systems with different padding** — `.modal-header` (14×20) vs `.overlay-title` (16×20). [styles.css](styles.css#L228,L260,L314). Standardise.
- **M5. Toolbar gap inconsistency** (1, 2, 3px). Define `--toolbar-gap`. [styles.css](styles.css#L489).
- **M6. Help drawer ignores `safe-area-inset-right`** on iPad split-screen. [help-drawer.js](help-drawer.js#L754).
- **M7. Tracker `.lpanel` 70dvh covers entire pattern in landscape** — reduce to 50dvh in landscape orientation. [styles.css](styles.css#L522).
- **M8. Info-strip parent + child both z-index 98** — pick a layering. [styles.css](styles.css#L2667).

## Testing checklist

- 375 / 600 / 768 / 1024 / 1440 px on each of /home, Creator, Tracker, Stash.
- iPhone landscape with safe-area inset.
- Desktop with 30+ colour palette.
- Long project name (50+ chars) on /home.
