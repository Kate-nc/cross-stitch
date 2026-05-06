# P? Verification: All FAILs by Category

**Total FAILs: 28** across 153 items. Most are documented future work or substantial UI/UX projects.

---

## Keyboard & Accessibility FAILs (16)

### Canvas Navigation & Interaction (4)
- **VER-A11Y-007** — Creator Pattern Canvas missing aria-label (`creator/PatternCanvas.js:139`)
- **VER-A11Y-013** — Creator Canvas has no aria-label and no keyboard cell navigation
- **VER-A11Y-014** — Tracker Canvas: spacebar does not mark cells as done; arrow keys not implemented for cell movement
- **VER-A11Y-031** — Creator pattern canvas lacks `tabIndex` (not keyboard-focusable)

### Tab & Menu Navigation (6)
- **VER-A11Y-006** — Home tab group missing arrow-key navigation (ARIA tablist pattern). Only onClick works; needs Left/Right arrows and Home/End keys.
- **VER-A11Y-010** — Help Drawer tab order violates ARIA tablist pattern; tabIndex alternates 0/-1 instead of keeping all tabs in tab order with arrow-key navigation
- **VER-A11Y-015** — No Shift+F10 keyboard equivalent for right-click context menu
- **VER-A11Y-039** — Shift+F10 / Menu key handler not implemented for context menu
- **VER-A11Y-036** — Browser-shortcut conflicts (e.g., Ctrl+K) not surfaced in UI/help documentation

### Palette & Color Selection (3)
- **VER-A11Y-016** — Palette colour chips lack `aria-label` describing colour name + DMC ID
- **VER-A11Y-030** — Palette chips missing `:focus-visible` style (users cannot see which chip has keyboard focus)
- **VER-A11Y-018** — Magic Wand threshold slider missing `aria-valuenow` and `aria-live="polite"` for value change announcements

### Screen Reader & Announcements (3)
- **VER-A11Y-009** — Toast animations use inline CSS; may not respect `prefers-reduced-motion: reduce` media query
- **VER-A11Y-020** — Session timer renders as plain `<strong>` without `aria-live` attribute; time updates not announced to screen readers
- **VER-A11Y-029** — Validation/error toasts use `aria-live="polite"` instead of `assertive` (should interrupt immediately)

### Page Hints & Hints (1)
- **VER-A11Y-037** — Keyboard hint banner appears on page load instead of after 30 seconds of idle time

---

## UI Component Touch Targets: Too Small (8)

All on **PrepareTab** and related modals in Creator's Prepare phase:

- **VER-EL-SCR-006-02-P2** — Over-two checkbox: ~13px (native size, below 44px minimum)
- **VER-EL-SCR-006-03-P2** — Sort dropdown: ~24-28px height from padding 3px 8px
- **VER-EL-SCR-006-11-P2** — "Mark all as owned" button: ~30-35px height from padding 4px 12px
- **VER-EL-SCR-006-12-13-P2** — Fabric calculator toggle: ~34px height (needs padding increase to reach 44px)
- **VER-EL-SCR-006-14-15-P2** — Margin input spinner arrows: ~16-18px wide on 60px input
- **VER-EL-SCR-015-03-08-P2** — Brand selector buttons (`.mgr-chip`): ~21px height
- **VER-EL-SCR-015-09-P2** — Kit selector buttons (same `.mgr-chip`): ~21px height
- **VER-EL-SCR-018a-05-06-07-P2** — Import Wizard buttons (`.iw-btn`): 40px desktop; uncovered for tablet portrait (600-900px)

---

## Canvas & Gesture FAILs (3)

- **VER-RESP-P0-004** — Canvas elements lack `touch-action: none` CSS (allows browser default pinch/pan interference on touch devices)
- **VER-EL-SCR-010-05-02** — Long-press on tablet triggers context menu instead of activating Magic Wand tool
- **VER-RESP-P1-005** — Help Drawer width 380px is below 450px minimum for Shortcuts tab keyboard-key labels readability

---

## Proposed/Future Touch Gestures (5)

These are **documented as proposed features**; implementation is follow-up work:

- **VER-RESP-P4-001** — Double-tap zoom-to-fit not implemented (only keyboard Home key + button click)
- **VER-RESP-P4-002** — Two-finger tap undo / three-finger tap redo not implemented
- **VER-RESP-P4-006** — Swipe gestures (horizontal dismiss drawers, vertical scroll tabs) not implemented
- **VER-RESP-P4-009** — Haptic feedback (`navigator.vibrate()`) entirely absent

---

## CSS Architecture / Breakpoint FAILs (1)

- **VER-RESP-P4-007** — Media query breakpoints are fragmented (399/480/599/600/720/899/900/1024px) instead of consolidated standard scheme (480/768/1024/1280px); missing 768px and 1280px breakpoints

---

## State Management / Spec Compliance (1)

- **VER-EL-SCR-009-14-15-P3** — `PrepareTab.handleAddAll()` incorrectly syncs to Stash Manager via `StashBridge.updateThreadOwned()` when spec requires local-state-only (ProjectTab uses local `ctx.threadOwned` correctly)

---

## Summary by Category

| Category | Count | Scope |
|---|---:|---|
| Keyboard/A11y accessibility | 16 | Interactive elements, screen-reader support, focus management |
| Touch target sizing | 8 | Tablet & phone interaction targets |
| Canvas / gesture handling | 3 | Canvas element CSS, touch gestures, modal sizing |
| Proposed features | 5 | Future touch gestures (not implementation gaps) |
| CSS architecture | 1 | Breakpoint consolidation |
| State management | 1 | PrepareTab unintended sync |
| **TOTAL** | **28** | — |

---

## Notes

- **Not in-cycle-fixable**: Most FAILs require UI/UX design work, substantial refactors, or cross-component coordination unsuitable for during an audit pass.
- **Top priority** for next cycle: Canvas keyboard navigation (VER-A11Y-013/031), ARIA tablist arrows (VER-A11Y-006/010), touch targets on PrepareTab, and `touch-action: none` on canvas.
- **Documented gaps**: The 5 proposed/future touch gestures are already explicitly marked as proposals in specs and reports; they represent intentional backlog rather than hidden bugs.
