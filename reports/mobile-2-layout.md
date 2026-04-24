# Mobile Audit 2 — Responsive Layout Breakage

## Summary

Significant responsive issues across all three entry points. Grids use `minmax(260px–300px, 1fr)` which forces a single very-wide column at 480px (and horizontal overflow when the card has its own `min-width`). Context menus and tooltips are absolute-positioned with no viewport clamping. The Creator's `SplitPane` has `height:550px` hard-coded with no stack-on-mobile fallback. Hover-only dropdowns (`.tb-drop-wrap:hover`) are unreachable on touch.

## TODOs (prioritised)

### 1. 🔴 Context menu overflows viewport — no edge clamping
- **File(s)**: [creator/ContextMenu.js](creator/ContextMenu.js#L59)
- **Problem**: `position:fixed; left:menu.x; top:menu.y` with no clamp. A long-press near the right/bottom edge renders the menu off-screen.
- **Affects**: All ≤480px (Creator).
- **Fix**: After mount, measure the menu and clamp: `left = Math.min(menu.x, window.innerWidth - rect.width - 8)`; same for top.

### 2. 🔴 Pattern grid in Manager forces horizontal scroll <600px
- **File(s)**: [styles.css](styles.css#L2920) `.pat-grid`, [manager-app.js](manager-app.js)
- **Problem**: `repeat(auto-fill,minmax(300px,1fr))` — at 480px a 300px card cannot shrink, page horizontally scrolls.
- **Fix**: `grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));`

### 3. 🔴 Thread grid (Stash) same issue
- **File(s)**: [styles.css](styles.css#L2895) `.thread-grid`
- **Fix**: `repeat(auto-fill, minmax(min(220px, 100%), 1fr));` plus `@media(max-width:600px){ grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:6px; }`.

### 4. 🔴 Toast container width math fails near breakpoint
- **File(s)**: [toast.js](toast.js#L20)
- **Problem**: Toast `max-width:480px` inside container `calc(100vw - 32px)` — at 480px viewport the toast overflows by margin amount.
- **Fix**: `max-width: min(480px, calc(100vw - 32px));`

### 5. 🔴 Command palette dialog touches screen edges
- **File(s)**: [command-palette.js](command-palette.js#L268)
- **Fix**: `max-width: min(520px, calc(100vw - 32px))` and `padding-top: max(20vh, env(safe-area-inset-top) + 12px)` so landscape mobile doesn't clip dialog.

### 6. 🟡 Creator SplitPane `height:550px` hard-coded
- **File(s)**: [creator/SplitPane.js](creator/SplitPane.js#L256)
- **Fix**: `@media (max-width:899px){ .SplitPane{ height:auto; flex-direction:column; } }`

### 7. 🟡 Hover-only palette swatch tooltips
- **File(s)**: [styles.css](styles.css#L1154) `.pal-grid .sw:hover .tt`
- **Fix**: Add `:focus-visible .tt { display:block; }` and make swatch focusable (`tabindex=0`); also handle tap-to-show on `(pointer:coarse)`.

### 8. 🟡 Hover-only toolbar dropdown menus
- **File(s)**: [styles.css](styles.css#L255-L257) `.tb-drop-wrap:hover .tb-dropdown`
- **Fix**: Add `:focus-within .tb-dropdown { display:block; }` and toggle on tap with a click handler.

### 9. 🟡 Manager dropdown lists have no viewport-aware flip
- **File(s)**: [manager-app.js](manager-app.js#L1552), [modals.js](modals.js#L100)
- **Fix**: When opening, if `dropdownBottom > window.innerHeight - 40`, flip to `bottom:100%; top:auto;`.

### 10. 🟡 Stitch tracker zoom buttons too small (already in audit 1)
- **File(s)**: [tracker-app.js](tracker-app.js#L4218-L4220)
- **Fix**: Cross-fix with audit 1 #5/8 — share `min-width/height:44px` rule.

### 11. 🟡 Manager rpanel drawer doesn't trap pointer events when open
- **File(s)**: [styles.css](styles.css#L1711)
- **Fix**: When `.mgr-rpanel--open` add a backdrop overlay (`pointer-events:auto; background:rgba(0,0,0,0.4)`).

### 12. 🟡 Comparison/stats tables overflow at <600px
- **File(s)**: [styles.css](styles.css#L3540-L3610)
- **Fix**: Wrap in `overflow-x:auto`; on `@media (max-width:600px)` reduce `font-size:11px; padding:4px 6px;` and hide non-essential `%` column.

### 13. 🟡 Home stats row — 4-col default crushes content 480-599px
- **File(s)**: [styles.css](styles.css#L368-L374)
- **Fix**: Make default 2-col, expand to 4 at `min-width:600px`.

### 14. 🟡 Project dashboard `.mpd-cards` wastes space at ≤480
- **File(s)**: [styles.css](styles.css#L3900)
- **Fix**: `@media(max-width:600px){ grid-template-columns: 1fr; }`

### 15. 🟢 Toolbar overflow (`overflow-x:auto`) at 599px works as designed
- No action.
