# Mobile Audit 1 — Touch Target Sizes & Spacing

## Summary

The app has **mixed compliance** with touch accessibility (WCAG 2.5.5 / 2.5.8). A mobile media query at [styles.css](styles.css#L1694) enforces `min-width:44px;min-height:44px` for some toolbar buttons, but many components fall outside this rule, with targets as small as 18×18px. Critical failures: modal close buttons with no explicit sizing, command palette rows at 20px tall, icon-only overflow menus at 28×26px, desktop nav buttons with 4px padding. Spacing gaps below 8px are common around toolbar pill buttons (`gap:1px`) and separator dividers (`margin:0 2px`).

## TODOs (prioritised)

### 1. 🔴 Modal close (`×`) buttons have no explicit min size
- **File(s)**: [modals.js](modals.js), [styles.css](styles.css) `.modal-close`
- **Problem**: Rendered as `<button>×</button>` with `font-size:18px` only. Tap target ~20×24px on mobile.
- **Affects**: All pages, all modals, mobile.
- **Fix**: Add `.modal-close { min-width:44px; min-height:44px; display:inline-flex; align-items:center; justify-content:center; }` (mobile-first; desktop can keep tighter).

### 2. 🔴 Command Palette rows are 20px tall
- **File(s)**: [command-palette.js](command-palette.js#L260-L290) `.cs-cmdp-row`
- **Problem**: `padding:10px 16px` on 0-line-height inline content yields ~20px. Adjacent rows are stitched flush together.
- **Affects**: All pages, mobile/tablet.
- **Fix**: Set `min-height:44px` on `.cs-cmdp-row`; ensure flex-aligned content.

### 3. 🔴 Overflow menu / kebab button (28×26px)
- **File(s)**: [header.js](header.js), [components.js](components.js)
- **Problem**: Icon-only "more" buttons in card rows are well below 44×44.
- **Affects**: Mobile.
- **Fix**: `min-width:44px;min-height:44px;` on icon-button base class (gate desktop with `@media (min-width:1025px)` if cramped).

### 4. 🔴 Desktop nav page buttons (`.tb-app-tab`) — 28px tall
- **File(s)**: [styles.css](styles.css#L287-L318)
- **Problem**: `padding:4px 10px` ≈ 28px. Existing 600px media query keeps the same padding.
- **Affects**: Mobile, top nav.
- **Fix**: Inside `@media (max-width:600px)` set `min-height:44px; padding:8px 10px`.

### 5. 🟡 Inline modal action buttons use `padding:'4px 14px'`
- **File(s)**: [modals.js](modals.js), inline JSX `style={{padding:'4px 14px'}}` throughout
- **Problem**: ~26px tall.
- **Fix**: Switch to a shared `.btn` class on mobile or override inline padding via container CSS at `@media (max-width:600px)`.

### 6. 🟡 Right-panel tabs `padding:8px 0` (vertical only)
- **File(s)**: [styles.css](styles.css), `.rpanel .tab`
- **Problem**: Horizontal hit area collapses with text; targets touch each other.
- **Fix**: Add `padding:10px 14px; min-height:44px;` and `gap:4px`.

### 7. 🟡 Palette chip remove `×` (24×24px)
- **File(s)**: Creator palette chips (creator/PatternTab.js / canvas chip rendering)
- **Fix**: Bump to 32×32 minimum, with 12px tap padding around the visible glyph.

### 8. 🟡 Tracker bottom action bar swatches (28×28px)
- **File(s)**: [tracker-app.js](tracker-app.js) bottom action bar
- **Fix**: 36×36 minimum visual + 6px padding ring → 44×44 hit area.

### 9. 🟡 Tracker info strip (36px)
- **File(s)**: [styles.css](styles.css#L2108-L2110)
- **Fix**: Increase to 44px (`min-height:44px`).

### 10. 🟡 Toolbar pill button group `gap:1px`
- **File(s)**: [styles.css](styles.css#L293-L309)
- **Problem**: Adjacent buttons share an edge; mistaps frequent.
- **Fix**: Add `gap:6px` inside `@media (max-width:600px)`.

### 11. 🟡 Separator dividers `margin:0 2px`
- **File(s)**: [styles.css](styles.css)
- **Fix**: Increase to `margin:0 8px` on touch viewports (`@media (pointer:coarse)`).

### 12. 🟡 Preferences modal toggle/checkbox controls
- **File(s)**: [preferences-modal.js](preferences-modal.js)
- **Fix**: Verify each row is at least 44px tall; wrap each control in a label spanning the full row width so the whole row is tappable.

### 13. 🟡 Inline help links (`<a>`) inside paragraphs
- **File(s)**: [help-content.js](help-content.js)
- **Fix**: `a { padding:2px 0; }` and force `line-height:1.7` so adjacent links don't share a hit area.

### 14. 🟡 Stitch type buttons in tracker
- **File(s)**: [tracker-app.js](tracker-app.js)
- **Fix**: Confirm 44×44 inside `@media (max-width:600px)`.

### 15. 🟢 Palette swatch grid (`.pal-grid .sw`) — already 44×44 on mobile
- No action.
