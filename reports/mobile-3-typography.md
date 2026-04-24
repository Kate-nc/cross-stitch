# Mobile Audit 3 — Typography & Readability

## Summary

The codebase has no `@media (max-width:480px)` typography breakpoint. Caption-style text frequently sits at 9–11px (`.tb-btn` 11px, `.stash-badge` 10px, ~50 `fontSize:10` inline styles in creator-main.js), below WCAG-recommended floors for touch viewports. Project/thread names use `white-space:nowrap; text-overflow:ellipsis` with no expand/title affordance, hiding identity. Modal `max-width: min(90vw,400px)` plus 24px padding leaves only ~350px for text on iPhone SE; help-content lineHeight 1.55 feels cramped.

## TODOs (prioritised)

### 1. 🔴 Add `@media (max-width:480px)` typography block
- **File(s)**: [styles.css](styles.css)
- **Fix**: New rule block bumping `.tb-btn`, `.chart-toggle-btn`, `.stash-badge`, `.help-hint` to ≥12px.

### 2. 🔴 Caption text below 12px (10–11px) on mobile
- **File(s)**: [styles.css](styles.css#L186-L196,#L237,#L272-L276,#L2219), inline `fontSize:10` in [creator-main.js](creator-main.js#L186-L188,#L206), [components.js](components.js#L21,#L41,#L838)
- **Fix**: Mobile rule increases caption fonts +1–2px; preserve desktop sizes.

### 3. 🔴 Truncated thread/project names lack expand affordance
- **File(s)**: [styles.css](styles.css#L321,#L335,#L2154,#L2186), [components.js](components.js#L1242), [home-screen.js](home-screen.js#L429)
- **Fix**: Add `title={fullName}` browser tooltip; on `(pointer:coarse)` allow 2-line clamp via `display:-webkit-box; -webkit-line-clamp:2`.

### 4. 🔴 Modal content too narrow on iPhone SE
- **File(s)**: [styles.css](styles.css#L209-L215) `.modal-content`
- **Fix**: `@media(max-width:480px){ .modal-content{ max-width:95vw; padding:16px; } }`

### 5. 🔴 Help/onboarding line-height too tight
- **File(s)**: [help-content.js](help-content.js#L254-L256), [onboarding-wizard.js](onboarding-wizard.js#L40-L60)
- **Fix**: Bump `lineHeight:1.55` → `1.7`; add explicit `lineHeight:1.65` on wizard step descriptions.

### 6. 🟡 Colour breakdown table cramped on mobile
- **File(s)**: [creator-main.js](creator-main.js#L835-L836)
- **Fix**: Reflow row to 2-line layout below 480px (line 1: ID + count, line 2: name).

### 7. 🟡 Shopping list table — long names push status off screen
- **File(s)**: [creator/ShoppingListModal.js](creator/ShoppingListModal.js#L70-L150)
- **Fix**: Stack to two lines on mobile; bump font to 12px.

### 8. 🟡 `.tb-app-tab` 11px too small at 480px
- **File(s)**: [styles.css](styles.css#L287-L318)
- **Fix**: At 480px breakpoint set `font-size:12px; padding:6px 6px`.

### 9. 🟡 `.stash-badge` 9px low-stock indicator
- **File(s)**: [styles.css](styles.css#L2219)
- **Fix**: 10px + `font-weight:700`.

### 10. 🟡 `.home-recent-name` single-line truncation hides identity
- **File(s)**: [home-screen.js](home-screen.js#L429-L430)
- **Fix**: `display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;` (remove `white-space:nowrap`).

### 11. 🟡 Preferences hint 11px low contrast
- **File(s)**: [preferences-modal.js](preferences-modal.js#L68,#L115,#L327)
- **Fix**: Mobile bump to 12px and ensure colour ≥ #6b7280 over white (≥4.5:1).

### 12. 🟡 Legend rows — no min-height / breathing room
- **File(s)**: [creator/LegendTab.js](creator/LegendTab.js)
- **Fix**: `min-height:32px; padding:10px 0; line-height:1.6` on mobile.

### 13. 🟢 Tracker info strip already well-sized.
