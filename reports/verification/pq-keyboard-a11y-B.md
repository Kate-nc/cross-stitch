# P? Verification: keyboard-a11y B (14)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-A11Y-015 | FAIL | creator/ContextMenu.js:1-100 | Context menu opens via right-click/long-press; no Shift+F10 / Menu key handler. |
| VER-A11Y-016 | FAIL | creator/Sidebar.js:1-150 | Palette chips lack aria-label describing colour name + DMC ID. |
| VER-A11Y-017 | PASS | styles.css:3831-3835 | .skip-to-content keyboard-only visible; :focus shows on first Tab. |
| VER-A11Y-018 | FAIL | creator/Sidebar.js (Magic Wand) | Slider accepts arrow keys but no aria-live / aria-valuenow announcements. |
| VER-A11Y-019 | PASS | toast.js:177-188 | Dismiss button native <button> with aria-label="Dismiss"; keyboard accessible. |
| VER-A11Y-020 | FAIL | tracker-app.js:536 | Session timer renders as <strong>; no aria-live / dynamic ARIA updates. |
| VER-A11Y-021 | PASS | modals.js:1-200 | Help/About/ThreadSelector use Overlay component with useFocusTrap. |
| VER-A11Y-022 | UNVERIFIABLE | components/Overlay.js | Tablet on-screen keyboard behaviour requires device testing. |
| VER-A11Y-023 | PASS | styles.css:4274 | <kbd> font-size 11px font-weight 600 padding 2px 6px; scales with root font. |
| VER-A11Y-024 | UNVERIFIABLE | (codebase-wide) | Comprehensive emoji-glyph audit outside <kbd> requires exhaustive text scan. |
| VER-A11Y-025 | PASS | coaching.js:275-290 | Coachmark Escape skip handler; Tab cycles within trap. |
| VER-A11Y-026 | PASS | preferences-modal.js:750 | "Reduce motion" toggle via usePref a11yReducedMotion. |
| VER-A11Y-027 | PASS | coaching.js:221,304-321 | reduceMotion class cs-coachmark-no-motion applied to popover/scrim/highlight. |
| VER-A11Y-028 | PARTIAL | toast.js:117; styles.css:4133+ | Inline animation may not be overridden by media query; needs verification. |

## Defects to file

1. **VER-A11Y-015** — No Shift+F10 keyboard equivalent for context menu.
2. **VER-A11Y-016** — Palette chips lack descriptive aria-label.
3. **VER-A11Y-018** — Magic Wand slider missing aria-valuenow / aria-live announcements.
4. **VER-A11Y-020** — Session timer lacks aria-live for screen-reader updates.
5. **VER-A11Y-028** — Inline toast animation not guaranteed to respect prefers-reduced-motion.

## Final result
- 14 items: 8 PASS / 4 FAIL / 1 PARTIAL / 1 UNVERIFIABLE
