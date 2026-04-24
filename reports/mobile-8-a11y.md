# Mobile Audit 8 — Mobile Accessibility

## Summary

✅ Viewport meta tags on all 3 HTMLs are correct (`width=device-width, initial-scale=1.0`, no `user-scalable=no`); `<html lang="en">` present; `aria-live="polite"` on toast container; `:focus-visible` global rule exists; `prefers-reduced-motion` respected.

❌ Command palette focus trap relies on Tab/Shift-Tab — irrelevant for VoiceOver/TalkBack swipe navigation. Many icon-only buttons (palette swatches, ToolStrip overlay toggle, lock/unlock, hue shift) use only `title` (not always announced on touch SR). Modal close (`×`) buttons receive no initial focus. Landscape modals with `max-height:70dvh` may exceed viewport height. No skip-to-content link.

## TODOs (prioritised)

### 1. 🔴 Command Palette focus trap incomplete on mobile screen readers
- **File(s)**: [command-palette.js](command-palette.js#L346)
- **Fix**: Add capture-phase `focus` listener on document; if focus leaves overlay, restore to input.

### 2. 🔴 Palette swatch buttons missing `aria-label`
- **File(s)**: [creator/ToolStrip.js](creator/ToolStrip.js#L220-L230)
- **Fix**: `aria-label={"Select DMC " + p.id + (p.name ? " " + p.name : "")}` plus `aria-pressed`.

### 3. 🔴 Icon-only ToolStrip buttons (Overlay toggle, palette-expand, brush-size, Wand/Lasso/Polygon/Magnetic)
- **File(s)**: [creator/ToolStrip.js](creator/ToolStrip.js#L250-L310)
- **Fix**: Add `aria-label` to each (don't rely on `title`).

### 4. 🔴 Modal close (`×`) doesn't get initial focus
- **File(s)**: [palette-swap.js](palette-swap.js#L1610), [modals.js](modals.js)
- **Fix**: `autoFocus` on close button or `useEffect(() => closeRef.current?.focus(), [])` after mount.

### 5. 🟡 Landscape modals may exceed viewport height
- **File(s)**: [styles.css](styles.css#L1712)
- **Fix**: `@media (max-height:500px){ .rpanel--open, .modal-content, .sync-summary-modal{ max-height:90dvh; overflow-y:auto; } }`

### 6. 🟡 No skip-to-content link
- **File(s)**: [index.html](index.html), [stitch.html](stitch.html), [manager.html](manager.html)
- **Fix**: Top of `<body>`: `<a class="skip-link" href="#main">Skip to content</a>`; CSS `.skip-link{position:absolute;left:-9999px} .skip-link:focus{left:8px;top:8px;…}`. Add `id="main"` to each page's main content wrapper.

### 7. 🟡 Lock/unlock icon buttons missing `aria-label`
- **File(s)**: [palette-swap.js](palette-swap.js#L827-L836)

### 8. 🟡 Hue/saturation shift buttons missing `aria-label`
- **File(s)**: [palette-swap.js](palette-swap.js#L1572-L1583)

### 9. 🟡 Creator "Fit (Home)" button uses only `title`
- **File(s)**: [creator/ToolStrip.js](creator/ToolStrip.js#L58-L62)

### 10. 🟡 Onboarding wizard: focus not restored on close
- **File(s)**: [onboarding-wizard.js](onboarding-wizard.js#L371)
- **Fix**: Capture `document.activeElement` on open; restore on close.

### 11. 🟢 Toast undo button has duplicate text + aria-label
- **File(s)**: [toast.js](toast.js#L110-L115)
- **Fix**: Use one label source.

### 12. 🟢 Command palette input: `:focus-visible` outline may clip on small viewports
- **File(s)**: [command-palette.js](command-palette.js#L313)
- **Fix**: `@media(max-width:480px){ .cs-cmdp-input:focus-visible{ outline-offset:0; } }`

### 13. 🟢 Modal overlay click-to-close not announced to SR
- **Fix**: Optional `aria-label` on overlay.

### 14. 🟢 `#475569` secondary text borderline contrast at 14px
- **File(s)**: [styles.css](styles.css#L7-L8)
- **Fix** (optional, beyond AA): bump to `#3a4557`.
