# Polish Pass 7 — Cross-Browser & Responsive Consistency

**Audit date:** 2026-04-27  
**Headline:** **8 distinct breakpoints** with the 599/600 and 899/900 splits causing visible layout flips, **9 number inputs in [preferences-modal.js](preferences-modal.js) missing `inputMode`**, **0 `autocomplete` hints anywhere**, and **no long-press/contextmenu fallback** for the right-click context menu used by the canvas.

---

## A. Breakpoint inventory

| Breakpoint | Rule count | Primary use | Issue |
|---|---|---|---|
| 359px | 1 | extra-narrow phones | orphan |
| 399px | 5 | iPhone SE-era | overlaps 480 |
| 480px | 7 | command palette | overlaps 599 |
| 599px (max-width) | 20+ | tablet / mobile pivot | **conflicts with 600** |
| 600px (min-width) | 8 | tablet | **conflicts with 599** |
| 899px (max-width) | 5 | tablet/desktop pivot | **conflicts with 900** |
| 900px (min-width) | 1 | desktop | overlap |
| 1024px | 3 | desktop sidebar dock | OK |

**Recommended canonical set:** 375 / 600 / 900 / 1024 / 1440. Normalise all `max-width: 599px` → `599.98px` (or restructure to `min-width` based) so 600 and 599 don't both apply / both miss. Same fix at 899/900. Fold 359/399/480 into 375 + 600 tier.

**Concrete bugs at the seams:**
- At exactly 600px, `.tb-app-nav` ([styles.css](styles.css)) stops scrolling but tab padding is still compressed → overflow.
- At exactly 900px, the Tracker lpanel backdrop visibility may flicker between rules.

## B. Touch vs pointer

### B1. 🔴 No long-press fallback for canvas context menu

[creator/ContextMenu.js](creator/ContextMenu.js#L1) listens only on `pointerdown` (right-click). Touch users cannot reach the canvas context menu — the comment at line 28 promises "long-press" but no `setTimeout` / long-press timer exists.

**Fix:** add a 500ms `pointerdown` timer that fires the context menu if the pointer hasn't moved beyond a small threshold. Cancel on `pointermove`/`pointerup` before timeout.

### B2. Hover-dependent dropdowns — already handled

`.tb-drop-wrap:hover` is overridden inside `@media (pointer: coarse)` so touch correctly uses focus-within / open-class. ✓

### B3. Touch-target sizes

- Compliant: `.lp-btn`, `.lp-tab`, `.tb-btn`, command palette rows (44×44 via `@media (pointer: coarse)`).
- Borderline: tracker hamburger 36×32 — too small under 340px (rare devices).
- Desktop-only OK: `.rp-tab` 24px height, toolbar dropdown rows 24px height.

### B4. Pinch-to-zoom

[creator/PatternCanvas.js](creator/PatternCanvas.js) sets `touch-action: none` and routes via pointer events. App provides slider zoom; native pinch is intentionally suppressed. Acceptable.

## C. Form input conventions

### C1. 🟠 `inputMode` missing in preferences

| Line | Field | Recommended |
|---|---|---|
| [preferences-modal.js](preferences-modal.js#L289) | Palette size | `inputMode="numeric"` |
| [preferences-modal.js](preferences-modal.js#L330) | Min stitches | `numeric` |
| [preferences-modal.js](preferences-modal.js#L444) | Low-stock threshold | `numeric` |
| [preferences-modal.js](preferences-modal.js#L453) | Strands count | `numeric` |
| [preferences-modal.js](preferences-modal.js#L462) | Skein price | `decimal` |
| [preferences-modal.js](preferences-modal.js#L596) | Margin | `numeric` |
| [preferences-modal.js](preferences-modal.js#L610) | Grid interval | `numeric` |
| [preferences-modal.js](preferences-modal.js#L690) | Max toasts | `numeric` |
| [preferences-modal.js](preferences-modal.js#L730) | Skein price (dup) | `decimal` |

Other forms (BulkAddModal, ImportWizard, manager-app inventory rows, tracker session edit) already comply.

### C2. `autocomplete` hints: zero coverage

Recommend adding to:
- Designer name field in [preferences-modal.js](preferences-modal.js) → `autocomplete="name"`.
- Designer email/contact → `autocomplete="email"`.

### C3. `enterkeyhint`: partial coverage

Already on tracker goal input ([tracker-app.js](tracker-app.js#L337)) and help search ([help-drawer.js](help-drawer.js#L792)). Add to Stash search and pattern-library search.

## D. Platform conventions

### D1. Scrollbars — intentional dual pattern (no fix needed)

Global container uses thin visible scrollbars; tab/pill scrollers hide via `scrollbar-width: none`. Consistent across Webkit + Firefox.

### D2. Font fallback — solid

`'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` — robust chain. No issues.

## E. Mobile-only edge cases

- Canvas at 375px with high stitch count + small fabric — may overflow horizontally; verify `max-width: 100vw` on parent.
- Stacked modals (preferences + session toast) at 320px — test stacking + scrim.
- 480px toolbar tabs compress to 10px font + 5px padding — borderline cramped; consider an intermediate 400px tweak.

## Recommendations summary

1. **Critical:** add long-press to [creator/ContextMenu.js](creator/ContextMenu.js).
2. **High:** add `inputMode` to the 9 preference inputs.
3. **High:** unify 599/600 and 899/900 breakpoints.
4. **Medium:** add `autocomplete` hints to identity fields.
5. **Low:** consider a `1440px` rule for ultra-wide desktop stretch.
