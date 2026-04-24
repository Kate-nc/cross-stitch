# Mobile Audit 7 — Gesture & Interaction Model Gaps

## Summary

Critical: three Creator features (crop resize, lasso tool, command palette dismissal) are bound to mouse-only event handlers and ship broken on touch. Tracker stitch grid already has comprehensive pinch-zoom & pan; Creator canvas has pointer-event infrastructure (and a 500ms long-press timer in `useCanvasInteraction.js`) — context menu just isn't wired up. `:active` press states exist on only 2 selectors so the whole UI feels unresponsive on tap. No swipe-to-dismiss / swipe-to-delete anywhere.

## TODOs (prioritised)

### 1. 🔴 Crop resize handles use mouse-only events
- **File(s)**: [creator-main.js](creator-main.js#L852)
- **Problem**: `onMouseDown/Move/Up/Leave` only — touch users can't crop.
- **Fix**: Replace with `onPointerDown/Move/Up/Cancel` + `setPointerCapture`.

### 2. 🔴 Lasso/freehand/polygon/magnetic select uses mouse-only
- **File(s)**: [embroidery.js](embroidery.js#L1409)
- **Fix**: Add pointer events alongside mouse handlers; verify all 3 lasso modes.

### 3. 🔴 Command palette dismissal & row select on `mousedown` only
- **File(s)**: [command-palette.js](command-palette.js#L297,#L303,#L450)
- **Fix**: Convert `document.addEventListener('mousedown', close)` → `pointerdown`; same for row click handlers.

### 4. 🟡 No `:active` press feedback on majority of interactive elements
- **File(s)**: [styles.css](styles.css)
- **Coverage today**: only `button:active{filter:brightness(.94)}` and `.tracker-mobile .colour-indicator:active`.
- **Fix**: Add a single rule covering tap-friendly elements: `.tb-btn:active, .fab:active, .creator-palette-chip:active, .modal-choice-btn:active, .stash-row:active, .project-card:active { filter:brightness(0.92); transform:scale(0.98); }`.

### 5. 🟡 Header dropdown close on `mousedown` only
- **File(s)**: [header.js](header.js#L112,#L125)
- **Fix**: Switch to `pointerdown`.

### 6. 🟡 SplitPane divider lacks visual touch affordance
- **File(s)**: [creator/SplitPane.js](creator/SplitPane.js)
- **Fix**: `.split-pane-divider:active{ background:var(--accent); opacity:1; }` plus larger touch hit area on `(pointer:coarse)`.

### 7. 🟡 Long-press → context menu not wired
- **File(s)**: [creator/useCanvasInteraction.js](creator/useCanvasInteraction.js), [creator/ContextMenu.js](creator/ContextMenu.js)
- **Problem**: Long-press timer exists but doesn't open the context menu on touch.
- **Fix**: In `handlePatPointerUp`, if `longPressTriggeredRef.current && !moved`, call `cv.setContextMenu({x,y,cell,gx,gy})`.

### 8. 🟢 Swipe-to-delete on project library / stash rows (NEEDS-DECISION)
- **File(s)**: [project-library.js](project-library.js), [manager-app.js](manager-app.js)
- **Decision needed**: Tradeoff vs accidental delete; requires undo affordance design.

### 9. 🟢 Swipe-to-dismiss modals (NEEDS-DECISION)
- **File(s)**: [modals.js](modals.js)
- **Decision needed**: Conflicts with internal scrolling in long modals; non-trivial.
