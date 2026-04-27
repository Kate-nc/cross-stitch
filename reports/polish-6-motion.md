# Polish Pass 6 — Animation, Transition & Motion Consistency

**Audit date:** 2026-04-27  
**Headline:** App defines 3 canonical motion tokens (`--motion-fast` 120ms, `--motion` 160ms, `--motion-slow` 220ms) but uses **8 hardcoded durations** alongside them (0.1, 0.12, 0.15, 0.18, 0.2, 0.22, 0.25, 0.3s). Reduced-motion is implemented for ~72% of animations; **2 critical gaps** (mobile drawers + smooth-scroll JS calls) bypass the preference.

## Canonical motion tokens

| Token | Value | Easing | Use |
|---|---|---|---|
| `--motion-fast` | 120ms | ease-out | hover feedback, button states |
| `--motion` | 160ms | ease-out | modal/overlay entrance |
| `--motion-slow` | 220ms | ease-out | drawers, sheets |

Defined in [styles.css](styles.css#L84).

## Hardcoded duration inventory

| Duration | Count | Notable callers |
|---|---|---|
| 0.1s | 1 | `.emb-dmc-swatch` |
| 0.12s | 4 | `.g-nav a`, `.tb-app-tab`, preview HTML files |
| 0.15s | 11 | `.upload-area`, toggles, [creator/Sidebar.js](creator/Sidebar.js) chevrons |
| 0.18s | 1 | `.rpanel` desktop collapse |
| 0.2s | 16 | `.tab-button`, `.nav-link`, drag-upload, spinners, "Copied!" |
| 0.22s | 1 | `.modal-content--sheet` |
| 0.25s | 6 | **mobile drawers** (`.rpanel`, `.mgr-rpanel`, `.colour-quick-drawer`, `.tb-topbar`, `.toolbar-row`) |
| 0.3s | 2 | progress fill, insights bar |

**Recommendation:** map these to the three tokens. 0.1/0.12/0.15 → `--motion-fast`; 0.18/0.2/0.22 → `--motion`; 0.25/0.3 → `--motion-slow`.

## 🔴 Critical: mobile drawers ignore prefers-reduced-motion

The mobile media query at [styles.css](styles.css#L2126) redefines transitions on `.rpanel`, `.mgr-rpanel` ([styles.css](styles.css#L2135)), `.colour-quick-drawer` ([styles.css](styles.css#L2213)), `.tb-topbar` ([styles.css](styles.css#L2257)), and `.toolbar-row` ([styles.css](styles.css#L2260)) without nesting a `prefers-reduced-motion` override. The desktop override at [styles.css](styles.css#L512) does not cascade into the mobile media query.

**Fix:** nest `@media (prefers-reduced-motion: reduce) { ... transition: none !important; }` inside the mobile media block.

## 🔴 Critical: smooth-scroll JS calls bypass preference

`scrollIntoView({behavior: 'smooth'})` is called unconditionally in:
- [creator/Sidebar.js](creator/Sidebar.js#L985) — Legend navigation
- [stats-page.js](stats-page.js#L1043) — chart scroll on filter
- [stats-showcase.js](stats-showcase.js#L789) — stat-tile scroll

Browser support for honouring `prefers-reduced-motion` automatically is patchy.

**Fix:** read the preference once and switch:
```js
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  || (window.UserPrefs && window.UserPrefs.get('a11yReducedMotion'));
el.scrollIntoView({behavior: reduced ? 'auto' : 'smooth'});
```

## Reduced-motion coverage today

- Preference: `a11yReducedMotion` in [user-prefs.js](user-prefs.js#L109).
- UI: toggle in [preferences-modal.js](preferences-modal.js#L632).
- Application: [apply-prefs.js](apply-prefs.js#L25) adds `.pref-reduced-motion`.
- CSS: 23 `prefers-reduced-motion` rules; covers all `.overlay-*` animations and the desktop `.rpanel` collapse.
- Spinners (`@keyframes spin`) are infinite but reach static-fallback paths in reduced mode.

## Other minor findings

- The legacy `.modal-overlay` system has no entrance animation while the newer `.overlay-*` system does. Acceptable, but consider migrating remaining modals to the newer system.
- `.upload-area` mixes 0.15s and 0.2s for hover transitions — pick one.
- `@keyframes home-fadein` ([styles.css](styles.css#L756)) is not wrapped in any reduced-motion rule.

## Recommended actions

1. Nest reduced-motion overrides inside the mobile media query.
2. Wrap the 4 `scrollIntoView` calls.
3. Rebase 0.1/0.12/0.15/0.2/0.22/0.25/0.3 durations onto the three motion tokens.
4. Add a reduced-motion wrapper to `home-fadein`.
