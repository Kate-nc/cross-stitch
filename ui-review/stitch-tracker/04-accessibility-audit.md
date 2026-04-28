# Accessibility Audit — Stitch Tracker

This audit focuses on WCAG 2.1 AA compliance for the tracker section. Issues are categorised by severity (Critical / Major / Minor) and cross-referenced with simplification opportunities where fixing one fixes both.

---

## 1. Colour Contrast

### 1.1 Text Contrast on UI Controls

| Element | Foreground | Background | Contrast Ratio | WCAG AA (4.5:1 text / 3:1 large) | Verdict |
|---|---|---|---|---|---|
| `.tb-btn` default | `#475569` | `transparent` (on `#f8fafc`) | ~5.3:1 | Pass | ✅ |
| `.tb-btn--on` | `#1e293b` | `#f1f5f9` | ~11:1 | Pass | ✅ |
| `.tb-btn--green` | `#ffffff` | `#0d9488` | ~3.5:1 | **Fail for small text** | ⚠️ Major |
| `.tb-btn--blue` | `#1d4ed8` | `#dbeafe` | ~4.8:1 | Pass | ✅ |
| `.rp-heading` | `#1e293b` | `#ffffff` | ~13:1 | Pass | ✅ |
| `.col-row .nm` | `#94a3b8` (text-tertiary) | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |
| `.col-row .ct` (count) | `#94a3b8` | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |
| `.col-row .sym` (symbol) | `#94a3b8` | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |
| `.sess-card .lbl` | `#94a3b8` | `#f0fdfa` | ~2.5:1 | **Fail** | ⚠️ Major |
| Progress bar text | `#475569` | `#ffffff` | ~5.3:1 | Pass | ✅ |
| MiniStatsBar streak | `#d97706` | `#f8f9fa` | ~3.7:1 | Borderline — pass for large text only | ⚠️ Minor |

**Key finding:** The `--text-tertiary` colour (`#94a3b8`) is used extensively for secondary text but fails WCAG AA contrast on white backgrounds. This affects colour names, stitch counts, session labels, and symbol characters — all of which are functional information, not decorative.

**Fix:** Change `--text-tertiary` to `#64748b` (slate-500) which passes at ~4.6:1.

**Simplification overlap:** Reducing the amount of secondary text in the colour list (e.g., dropping the symbol column, using the swatch as the identifier) eliminates some failing-contrast elements entirely.

### 1.2 Colour as Sole Information Carrier

**Critical issue:** The stitch canvas relies heavily on colour to distinguish between:
- Different thread colours in the pattern
- Done vs undone stitches (done cells are coloured, undone show symbols)
- Highlight mode focused colour vs dimmed colours

For users with colour vision deficiency (CVD), these distinctions break down. Mitigation strategies in the app:
- **Symbol mode** — each colour gets a unique symbol. ✅ This is the primary accessible path.
- **Highlight mode Isolate** — dims everything except the focused colour. ✅ Helps with CVD.
- **Colour+Symbol mode** — shows both colour fill and symbol. ✅ Best accessible mode.

**Gap:** There's no explicit CVD-friendly palette option. Pattern Keeper offers a "high contrast" search colour setting. This app could add a "high contrast symbols" or "CVD-friendly palette" option.

**Verdict:** ⚠️ Major — mitigated by symbol mode, but could be better.

### 1.3 Progress Bar Colour
The progress bar fill uses `--accent` (`#0d9488`) on a `--border` (`#e2e8f0`) background track. The today-portion uses a lighter shade. The contrast between the two fill segments may be inadequate for CVD users.

**Verdict:** ⚠️ Minor — a pattern or texture on the today-segment would help.

---

## 2. Touch Targets

### 2.1 Minimum Size Compliance

The `@media (pointer: coarse)` rule in `styles.css` L1624-1631 sets `min-width: 44px; min-height: 44px` on `.tb-btn`, `.tb-fit-btn`, and `.tb-overflow-btn`. This matches Apple HIG and WCAG 2.5.5 (Target Size).

**Tested elements:**

| Element | Computed Size (coarse) | Passes 44×44? |
|---|---|---|
| Toolbar buttons (Cross, Nav, etc.) | 44×44 min | ✅ Pass |
| Zoom ± buttons | Inline style `padding: 0 5px` — no min-height on coarse | ❌ **Fail** — approximately 22×22px |
| Fit button | `.tb-fit-btn` gets 44×44 via media query | ✅ Pass |
| Colour list rows | `padding: 5px 6px` — row height ~28px | ❌ **Fail** — ~28×full-width, height below 44px |
| ✓ button on colour rows | `padding: 1px 6px` — ~22×18px | ❌ **Fail** — far below minimum |
| ◀ / ▶ colour cycle in toolbar | `padding: 2px 5px` — ~28×28px | ❌ **Fail** |
| Session chip Pause/Resume | Chip is click target — ~100×28px | ⚠️ Width OK, height borderline |
| Dismiss × buttons on toasts | `padding: 0 4px` — ~16×16px | ❌ **Fail** |
| Range anchor pulse indicator | Not interactive (pointer-events: none) | N/A |
| Highlight mode sub-buttons (Isolate/Outline/Tint/Spot) | `padding: 3px 0` in rpanel — ~70×22px | ❌ **Fail** on mobile |
| Layer panel toggle/solo buttons | `width:24, height:24` | ❌ **Fail** |
| "Lock detail" checkbox | Native checkbox — browser-default size | ⚠️ Platform-dependent |

**Key finding:** Many secondary controls — especially in the right panel and within the toolbar — don't get the `(pointer: coarse)` size boost. Only the primary `.tb-btn` class does. Zoom buttons, colour list items, action buttons within sections, and dismiss controls are all undersized.

**Simplification overlap:** Reducing the number of on-screen controls reduces the number of undersized touch targets.

---

## 3. Keyboard Navigation

### 3.1 Keyboard Shortcut Coverage
The tracker has extensive keyboard shortcuts (documented in `SharedModals.Shortcuts`):

| Action | Key | Available? |
|---|---|---|
| Toggle track/navigate | T | ✅ |
| Cycle views | V, D | ✅ |
| Pan mode | Space | ✅ |
| Cycle focus colour | `[`, `]`, ←, → | ✅ |
| Fit to screen | 0 | ✅ |
| Zoom | +, − | ✅ |
| Undo/Redo | Ctrl+Z, Ctrl+Y | ✅ |
| Half-stitch tool | H | ✅ (partial — toggles but doesn't cycle /\/erase) |
| Edit mode | E | ✅ |
| Grid toggle | G | ✅ (toggles grid layer visibility) |
| Help/shortcuts | ? | ✅ |

**Good coverage.** However:

### 3.2 Focus Management Issues

- **No visible focus indicators on toolbar buttons.** The `.tb-btn:focus` style is not defined in `styles.css`. Keyboard users tabbing through the toolbar get no visual feedback on which button is focused.

- **Canvas is not keyboard-focusable.** The `<canvas>` element has no `tabindex` attribute. Keyboard users can't focus the canvas to use arrow keys for navigation or Enter for marking stitches.

- **Modal focus trapping:** Modals use `onClick` on the overlay to close, but there's no `onKeyDown` handler for Escape on all modals (some have it, some don't). Focus is not trapped inside modals — Tab can escape to background elements.

- **Dropdown menus (layers, half-stitch, thread usage):** Opened by click, closed by outside click. No keyboard open (Enter/Space on trigger), no arrow-key navigation within, no Escape to close.

**Verdict:** ⚠️ Major — keyboard shortcuts are good, but standard keyboard navigation (Tab, Enter, Escape, arrow keys within components) is incomplete.

---

## 4. Screen Reader Labelling

### 4.1 Interactive Elements Without Labels

| Element | Has `aria-label`? | Has visible text? | Screen reader experience |
|---|---|---|---|
| Toolbar SVG icon buttons | No | Button has text (e.g., "Cross", "Nav") | ✅ Passable — button text provides label |
| Zoom − button | No | Shows `−` character | ⚠️ Screen reader reads "minus" — unclear purpose |
| Zoom + button | No | Shows `+` character | ⚠️ Same |
| Eye (preview) button | No | SVG only, no text | ❌ **No label** — silent to screen reader |
| Thread usage (globe) button | No | SVG only, no text | ❌ **No label** |
| ↩/↪ undo/redo | No | Shows Unicode arrows | ⚠️ Ambiguous |
| Layers button | No | Has "Layers" text | ✅ |
| ✕ dismiss buttons on toasts | `aria-label="Dismiss"` on one instance | Some have it, most don't | ⚠️ Inconsistent |
| Canvas | No `role`, no `aria-label` | — | ❌ **Silent** — screen reader users have no way to interact with the pattern |
| Colour swatch divs | No `alt`, no `aria-label` | — | ❌ **Not accessible** |

**Key finding:** The canvas-based pattern grid is fundamentally inaccessible to screen readers. This is an inherent limitation of using `<canvas>` for the primary content. Adding ARIA live regions for "you marked cell at row X, column Y" would provide minimal feedback.

**Verdict:** ❌ Critical for screen reader users, but the nature of the application (visual pattern tracking) makes full accessibility extremely challenging. Pragmatic approach: ensure all *surrounding* UI is properly labelled.

### 4.2 ARIA Roles and Landmarks
- No `role="main"`, `role="navigation"`, `role="complementary"` landmarks.
- No `aria-live` regions for dynamic updates (progress count changes, session timer).
- No `aria-expanded` on dropdowns (layers, half-stitch menu, thread usage).

**Verdict:** ⚠️ Major — straightforward to fix.

---

## 5. Motion and Animation

### 5.1 Animations Present
| Animation | Can be disabled? | Purpose |
|---|---|---|
| Marching ants selection border | No `prefers-reduced-motion` check | Selection feedback |
| Session chip pulsing dot | `@keyframes sess-pulse` — no reduced-motion variant | Session status |
| Celebration confetti | No reduced-motion variant found in code | Milestone reward |
| Progress bar width transition | `transition: width 0.3s ease` | Visual smoothness |
| Range anchor pulse | `animate range-anchor-pulse 1s` | Selection feedback |
| Half-stitch onboarding scale-in | `.hs-scale-in` class | Onboarding |

### 5.2 `prefers-reduced-motion` Support
`styles.css` L590 and L1988 contain:
```css
@media (prefers-reduced-motion: reduce) { ... }
```
These exist but checking the actual rules — they suppress some transitions but not all of the above animations. The `sess-pulse`, `marching-ants`, and `range-anchor-pulse` keyframes are not conditionally disabled.

**Verdict:** ⚠️ Minor — most animations are subtle.  Celebration confetti could be problematic for vestibular conditions. Adding `prefers-reduced-motion: reduce` to suppress keyframe animations would be a simple fix.

---

## 6. Reliance on Colour Alone

Beyond the canvas (covered in 1.2), other UI elements that use colour as the sole differentiator:

| Element | Colour Meaning | Alternative Indicator? |
|---|---|---|
| `.tb-btn--green` | Active tracking mode | Text label "Cross" — ✅ |
| `.tb-btn--blue` | Active half-stitch tool | Text label "Half" — ✅ |
| Session chip green/yellow/grey | Running/paused/idle | Text "▶"/"⏸" — ✅ |
| Thread Organiser owned (green) vs to-buy (orange) | Status indicator | Text "Owned"/"To buy" — ✅ |
| Colour progress bar fill | Completion level | Count text "12/45" — ✅ |
| Highlight mode dim level | Focused vs non-focused | Symbol presence/absence — ⚠️ partial |
| Stash badge `●`(green) vs `○`(grey) | In stash / not in stash | Shape differs — ✅ |

**Good finding:** Most colour indicators have a text or shape alternative. The main gap is in the canvas rendering itself, where highlight mode's dim/focus relies primarily on opacity differences.

---

## 7. Scrolling and Viewport Issues

### 7.1 Overflow and Scroll Trapping
The canvas scroll container (`stitchScrollRef`) uses `overflow: auto` with a `maxHeight` of 600px (or 340px when drawer is open). On mobile:
- Scrolling the canvas can conflict with page scrolling
- Pinch-to-zoom on the canvas can accidentally trigger browser zoom
- `touch-action: none` on the canvas prevents this but also disables native scroll on the canvas rectangle

**Verdict:** ⚠️ Minor — functionally handled but edge cases exist when canvas exceeds viewport.

### 7.2 Sticky Header Stack
The sticky header at `top: 0` (48px) + toolbar at `top: 48px` (52px + progress bar + mini-stats) reduces the available scroll area. On landscape tablets:
- Viewport height may be 500px
- Sticky chrome consumes 226px
- Canvas gets 274px — barely usable

**Simplification overlap:** Reducing chrome height directly improves this.

---

## Summary: Priority Fixes

### Critical
1. **Canvas has no screen reader alternative.** (Inherent to the technology — no simple fix.)

### Major (should fix)
2. **`--text-tertiary` fails contrast on white** — affects colour names, counts, symbols.
3. **Multiple touch targets below 44px** — zoom ±, colour list rows, ✓ buttons, dismiss ×, highlight sub-buttons, layer toggles.
4. **No visible focus indicators** on toolbar buttons.
5. **Canvas not keyboard-focusable.**
6. **Dropdown menus not keyboard-operable.**
7. **Missing ARIA roles and landmarks** on page structure.
8. **Missing aria-labels** on icon-only buttons (preview eye, thread usage globe).
9. **`.tb-btn--green` white-on-teal contrast fails** for small text.

### Minor (nice to fix)
10. **Keyframe animations not suppressed** by `prefers-reduced-motion`.
11. **Celebration confetti has no reduced-motion variant.**
12. **Status bar wastes space on touch devices** (shows "—" without hover).

### Simplification Overlap
Items 2, 3, 5, and 12 are partially or fully resolved by simplification proposals that reduce on-screen elements and increase touch target sizes. A simpler UI is an inherently more accessible UI.
