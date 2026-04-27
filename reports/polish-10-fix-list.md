# Polish Pass 10 — Consolidated Fix List

**Audit date:** 2026-04-27  
**Sources:** Polish reports 1–8.  
**Effort key:** **Q** quick (<30 min) · **M** moderate (30 min – 2 h) · **I** involved (2 h+).

---

## 🔴 Critical — broken or stuck

| # | Issue | File(s) | Effort | Source |
|---|---|---|---|---|
| C1 | Help drawer width `calc(100vw − 380px)` goes negative below 380px → drawer collapses | [help-drawer.js](help-drawer.js#L739) | Q | Polish 4 |
| C2 | Tracker info-strip sticky `top: 100px` ignores notch / safe-area on landscape | [styles.css](styles.css#L2667) | Q | Polish 4 |
| C3 | /home active-card buttons don't stack at 375px → overflow | [home-app.js](home-app.js#L150) + [styles.css](styles.css) | Q | Polish 4 |
| C4 | 8 missing empty states (hard requirement) | manager-app, project-library, stats-*, tracker, ExportTab, manager-shopping | M | Polish 5 |
| C5 | Mobile drawers (rpanel, mgr-rpanel, colour-quick-drawer, immersive toolbar) ignore `prefers-reduced-motion` | [styles.css](styles.css#L2126) | Q | Polish 6 |
| C6 | 4 `scrollIntoView({behavior:'smooth'})` calls bypass reduced-motion preference | [creator/Sidebar.js](creator/Sidebar.js#L985), [stats-page.js](stats-page.js#L1043), [stats-showcase.js](stats-showcase.js#L789), [creator/bundle.js](creator/bundle.js#L12383) | Q | Polish 6 |
| C7 | Canvas context menu has no long-press fallback for touch devices | [creator/ContextMenu.js](creator/ContextMenu.js) | M | Polish 7 |

---

## 🟠 High — confusing / misleading

| # | Issue | File(s) | Effort | Source |
|---|---|---|---|---|
| H1 | Toolbar dropdowns at inconsistent z-index (500 vs 201) | [styles.css](styles.css#L465,L655) | Q | Polish 4 |
| H2 | Long project names blow out `.home-proj-row` (no `min-width: 0`) | [home-app.js](home-app.js#L325), styles.css | Q | Polish 4 |
| H3 | Creator palette pill `overflow: visible` on mobile — chips spill off-screen | [styles.css](styles.css#L490) | Q | Polish 4 |
| H4 | Right panel crushes canvas at 800–1024px (no media query) | [styles.css](styles.css#L501) | M | Polish 4 |
| H5 | Command palette uses `100vh` → hidden by iOS keyboard | [command-palette.js](command-palette.js#L285) | Q | Polish 4 |
| H6 | 3 emoji violations in [embroidery.js](embroidery.js#L1298,L1324,L1344) and 1 in [creator-main.js](creator-main.js#L184) | as listed | Q | Polish 3, 8 |
| H7 | Hardcoded hex colours in [modals.js](modals.js) (10+ occurrences) instead of tokens | [modals.js](modals.js) | M | Polish 3 |
| H8 | 11 raw colour hexes across components.js, modals.js | listed in Polish 9 | M | Polish 3 |
| H9 | 9 number inputs in preferences-modal lack `inputMode` | [preferences-modal.js](preferences-modal.js) | Q | Polish 7 |
| H10 | 6 search inputs in manager-app missing `aria-label` | [manager-app.js](manager-app.js#L753,L1086,L1635,L1639,L1652,L1663) | Q | Polish 8 |
| H11 | 4 vague `confirm()` dialogs ("Continue?") don't name object/consequence | useProjectIO, bundle, ExportTab, BulkAddModal | M | Polish 8 |
| H12 | No generic `button:disabled` CSS — disabled buttons indistinguishable from active across the app | [styles.css](styles.css) | Q | Polish 5 |
| H13 | Async ops (generate, PDF export, sync, restore) have no loading indicator | generate-worker, pdf-export-worker, sync-engine, backup-restore | M | Polish 5 |
| H14 | Silent error catches swallow backup/restore/import/sync failures | [backup-restore.js](backup-restore.js#L216), project-storage, import-formats, pdf-importer, generate.js | M | Polish 5 |
| H15 | Breakpoint inconsistency: 599/600 and 899/900 splits cause layout flips at the seam | [styles.css](styles.css) (~30 rules) | M | Polish 7 |
| H16 | Hardcoded `#6366f1` accent in [creator/MaterialsHub.js](creator/MaterialsHub.js#L88) tab strip — wrong colour vs Workshop accent | as listed | Q | Polish 5 |

---

## 🟡 Medium — visual inconsistencies & polish

| # | Issue | File(s) | Effort | Source |
|---|---|---|---|---|
| M1 | Border-radius outliers (2, 3, 4, 5, 7, 14, 20px) — snap to canonical | components.js, modals.js, command-palette.js | M | Polish 3, 9 |
| M2 | Spacing outliers (2, 3, 5, 6, 7, 10, 14, 20px) — snap to scale | as above | M | Polish 3, 9 |
| M3 | Typography outliers (10, 15, 16, 20px) — snap to scale | components.js, modals.js, command-palette.js | M | Polish 3, 9 |
| M4 | 8 hardcoded transition durations — map onto `--motion-*` tokens | styles.css | M | Polish 6 |
| M5 | Z-index 10–10000 chaos with duplicates — introduce `--z-*` scale | styles.css | M | Polish 4, 9 |
| M6 | Colour-row hover states missing on stats / shopping rows (CSS only) | [styles.css](styles.css#L1729,L2590,L4305) | Q | Polish 2 |
| M7 | Colour swatches not clickable in stats / shopping (B1, B2, B6) | components.js, manager-shopping.js, ShoppingListModal | M | Polish 2 |
| M8 | Project-card progress bars not clickable (B3) | [home-screen.js](home-screen.js#L359) | Q | Polish 2 |
| M9 | DMC codes in shopping rows not linkified (A1) | manager-shopping.js + 2 others | M | Polish 2 |
| M10 | Saved-status badge in header is display-only (A4) | [header.js](header.js#L71) | Q | Polish 2 |
| M11 | Focus rings missing replacement on `outline:none` inputs | [styles.css](styles.css#L725,L740,L2710) | Q | Polish 5 |
| M12 | Selected state missing in thread inventory / project library / kit chips | listed in Polish 5 | M | Polish 5 |
| M13 | Modal padding split (14×20 vs 16×20) between two modal systems | [styles.css](styles.css#L228,L260,L314) | Q | Polish 4 |
| M14 | Tracker `lpanel` 70dvh covers entire pattern in landscape | [styles.css](styles.css#L522) | Q | Polish 4 |
| M15 | Tracker action-bar safe-area padding double-counted | [styles.css](styles.css#L2149) | Q | Polish 4 |
| M16 | Generic "Cancel" buttons → specific verbs ("Discard changes", "Cancel import") | ConvertPaletteModal, BulkAddModal, ImportWizard | Q | Polish 8 |
| M17 | Missing success toasts after delete / export / rename / sync | listed in Polish 5 | M | Polish 5 |
| M18 | Toolbar gap inconsistency (1, 2, 3px) | [styles.css](styles.css#L489) | Q | Polish 4 |
| M19 | Sticky `.rp-tabs` nested inside sticky `.rpanel` | [styles.css](styles.css#L505,L513) | M | Polish 4 |
| M20 | Materials sidebar grid breakpoint at 599px (one px from iPad mini) | [styles.css](styles.css#L503) | Q | Polish 4 |
| M21 | "Coming soon" preferences mixed in active categories | [preferences-modal.js](preferences-modal.js#L9) | Q | Polish 1 |
| M22 | Casing mixed (Title Case vs Sentence case) on modal headers / buttons | many files | M | Polish 8 |
| M23 | `aria-label` missing on icon-only buttons (`Icons.archive`, `Icons.printer` etc.) | ActionBar, ExportTab, ContextMenu | M | Polish 8 |
| M24 | Help drawer ignores `safe-area-inset-right` in iPad split-screen | [help-drawer.js](help-drawer.js#L754) | Q | Polish 4 |
| M25 | `home-fadein` keyframe not wrapped in reduced-motion rule | [styles.css](styles.css#L756) | Q | Polish 6 |

---

## 🟢 Low — polish

| # | Issue | File(s) | Effort | Source |
|---|---|---|---|---|
| L1 | Add tooltips/glossary for jargon (backstitch, half-stitch, confetti, parking, fabric count) | [help-drawer.js](help-drawer.js) + UI labels | M | Polish 8 |
| L2 | Standardise "delete" (permanent) vs "remove" (reversible) | many | M | Polish 8 |
| L3 | Add `autocomplete="name"` / `autocomplete="email"` to designer fields | [preferences-modal.js](preferences-modal.js) | Q | Polish 7 |
| L4 | Tracker hamburger 36×32 below 44 on <340px devices | tracker-app, styles.css | Q | Polish 7 |
| L5 | British/American spelling sweep beyond CSS keywords | many | M | Polish 8 |
| L6 | RTL / special-char support on user input fields | many | I | Polish 5 |
| L7 | Virtualise lists 200+ items (DMC inventory, palette swatches) | [manager-app.js](manager-app.js), [palette-swap.js](palette-swap.js) | I | Polish 5 |
| L8 | Tracker canvas bottom padding doesn't react to drawer state | [styles.css](styles.css#L2168) | M | Polish 4 |
| L9 | Pinch-to-zoom on canvas (currently slider-only) | creator/PatternCanvas, tracker | I | Polish 7 |

---

## Out-of-scope feature opportunities (NOT issues)

These were noted during the audit but are **features**, not polish:

- Wire up the four "Coming soon" preferences in [preferences-modal.js](preferences-modal.js).
- Add a glossary modal for craft jargon.
- Pinch-to-zoom + pan as a first-class canvas interaction.
- Cross-tab live sync (sync-engine progress UI).
- A separate dark-mode setting toggle UI (already supported via theme attr; no in-app picker beyond preferences).

---

## Recommended batching

**Batch 1 (commit `fix(ui): critical layout & motion gaps`):** C1, C2, C3, C5, C6, H1, H2, H3, H5.

**Batch 2 (commit `style(ui): replace emoji and hardcoded hexes with tokens`):** H6, H7, H8, H16, M1–M4 (token snap).

**Batch 3 (commit `fix(a11y): aria-labels, inputMode, focus-visible`):** H9, H10, M11, M23, L3.

**Batch 4 (commit `feat(ui): empty states + loading + error feedback`):** C4, H13, H14, M17. *(Larger; may want review.)*

**Batch 5 (commit `feat(ui): clickable swatches, progress bars, DMC links`):** M6, M7, M8, M9, M10. *(UX judgement — flag for review.)*

**Batch 6 (commit `style(ui): z-index scale + breakpoint normalise`):** M5, H15, H4. *(Larger; flag for review.)*

**Defer for explicit approval:** C7 (long-press), H11 (modal-replacement of `confirm()`), L1, L2, L7, L9.
