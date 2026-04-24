# Mobile Audit 4 — Navigation & Information Architecture

## Summary

The shared header is a horizontal tab strip with no hamburger/drawer fallback. Modals don't handle the Android hardware back button — users get trapped, especially in the multi-step onboarding wizard. Preferences modal sidebar has 12 categories arranged for desktop and is unwieldy below 600px. The Creator tab strip (Pattern/Prepare/Project/Export/Legend) overflows horizontally with no scroll affordance. Hover-only dropdowns in the toolbar make File/Page menus unreachable on touch. Z-index values are scattered (1000, 201, 10000, 499, 500, 400) with no documented stacking rules.

## TODOs (prioritised)

### 1. 🔴 Android hardware back button doesn't dismiss modals
- **File(s)**: [modals.js](modals.js), [command-palette.js](command-palette.js), [onboarding-wizard.js](onboarding-wizard.js), [preferences-modal.js](preferences-modal.js)
- **Problem**: No `history.pushState`/`popstate` integration; users get trapped in modal stacks.
- **Fix**: When opening a modal push a state entry; on `popstate` close the topmost modal.

### 2. 🔴 Header tab strip has no mobile drawer/hamburger
- **File(s)**: [header.js](header.js)
- **Problem**: Three page tabs + brand + actions overflow at 480px; no `< Menu >` collapsed view.
- **Fix**: At `@media (max-width:600px)`, render hamburger that opens a left/right drawer; cross-fixes with audit 1 #4.

### 3. 🔴 Hover-only dropdowns in toolbar (File / Page selector)
- **File(s)**: [styles.css](styles.css#L255-L257) `.tb-drop-wrap:hover`
- **Problem**: Touch users cannot open menus.
- **Fix**: Replace `:hover` with explicit click toggle + `:focus-within` fallback (matches audit 2 #8).

### 4. 🔴 Creator tab strip overflows horizontally with no scroll affordance
- **File(s)**: [creator/Sidebar.js](creator/Sidebar.js), [styles.css](styles.css)
- **Problem**: Five tabs at desktop sizing don't fit at 320–480px.
- **Fix**: `overflow-x:auto; scroll-snap-type:x mandatory;` and a left/right gradient hint; or convert to icon-only with tooltips below 480px.

### 5. 🔴 Preferences modal: 12-category sidebar unworkable on mobile
- **File(s)**: [preferences-modal.js](preferences-modal.js)
- **Problem**: Sidebar + content layout assumes ≥800px; below 600px the sidebar consumes most of the dialog.
- **Fix**: Below 700px collapse to a single-column wizard with a header dropdown that switches category, OR a top-level chip strip that scrolls horizontally.

### 6. 🟡 Z-index hierarchy undocumented and inconsistent
- **File(s)**: [styles.css](styles.css), [modals.js](modals.js), [toast.js](toast.js), [command-palette.js](command-palette.js), [onboarding-wizard.js](onboarding-wizard.js)
- **Fix**: Consolidate into CSS custom properties: `--z-modal:1000; --z-cmdp:1100; --z-onboarding:1200; --z-toast:9000;`. Audit and replace literal values.

### 7. 🟡 No back-to-top affordance on long pages
- **File(s)**: [stats-page.js](stats-page.js), [project-library.js](project-library.js), [manager-app.js](manager-app.js)
- **Fix**: Floating FAB that appears after `scrollY > 400`; smooth-scrolls to top.

### 8. 🟡 No sticky header on long scrolling lists
- **File(s)**: [manager-app.js](manager-app.js) inventory list, [stats-page.js](stats-page.js)
- **Fix**: `position:sticky; top:0; z-index:5; background:var(--bg);` on list section header.

### 9. 🟡 Onboarding wizard: no progress indicator, unclear dismiss path
- **File(s)**: [onboarding-wizard.js](onboarding-wizard.js)
- **Fix**: Add "Step N of M" + dot strip; ensure `Skip` button visible above the fold on 320×568.

### 10. 🟡 Manager rpanel drawer has no peek label
- **File(s)**: [styles.css](styles.css#L1711)
- **Fix**: Add visible drawer header (e.g. "Edit thread ▴") so users discover the drag affordance.

### 11. 🟡 Command palette has no touch-discovery hint
- **File(s)**: [command-palette.js](command-palette.js)
- **Fix**: On `(pointer:coarse)` show "Tap a command • Tap outside to close" footer; cross-fix with gesture audit pointerdown change.

### 12. 🟡 Modal stacking: multiple simultaneous modals (e.g. confirm-on-top-of-modal) have unclear dismiss order
- **Fix**: Centralise modal stack in a singleton; Esc/back closes top only; tapping backdrop only closes if no children open.
