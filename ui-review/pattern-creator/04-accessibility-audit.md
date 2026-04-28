# Accessibility Audit — Pattern Creator

This audit focuses on WCAG 2.1 AA compliance for the Creator section. Issues are categorised by severity (Critical / Major / Minor). Many findings overlap with the tracker audit since they share `styles.css`, `header.js`, and `components.js`.

---

## 1. Colour Contrast

### 1.1 Text Contrast on UI Controls

| Element | Foreground | Background | Contrast Ratio | WCAG AA (4.5:1 text / 3:1 large) | Verdict |
|---|---|---|---|---|---|
| `.tb-btn` default | `#475569` | transparent on `#f8fafc` | ~5.3:1 | Pass | ✅ |
| `.tb-btn--on` | `#1e293b` | `#f1f5f9` | ~11:1 | Pass | ✅ |
| Swatch strip labels (count) | `#94a3b8` | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |
| Creator palette chip text | `#64748b` | `#ffffff` | ~4.6:1 | Pass | ✅ |
| Creator palette chip text (selected) | `#ffffff` | `var(--accent)` (`#0d9488`) | ~3.5:1 | **Fail for small text** | ⚠️ Major |
| Sidebar section headers | `#1e293b` | `#ffffff` | ~13:1 | Pass | ✅ |
| Slider labels (`--text-tertiary`) | `#94a3b8` | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |
| Slider value display | `#475569` | `#ffffff` | ~5.3:1 | Pass | ✅ |
| Status bar text | `#94a3b8` | `#f8fafc` | ~2.6:1 | **Fail** | ⚠️ Major |
| ContextBar metadata | `#475569` | `#f8fafc` | ~5.3:1 | Pass | ✅ |
| Toast info text | `#1e40af` | `#dbeafe` | ~6.2:1 | Pass | ✅ |
| Toast warning text | `#92400e` | `#fef3c7` | ~5.8:1 | Pass | ✅ |
| Thread table DMC ID | `#1e293b` | `#ffffff` | ~13:1 | Pass | ✅ |
| Thread table secondary info | `#94a3b8` | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |
| Diagnostics panel labels | `#64748b` | `#ffffff` | ~4.6:1 | Pass | ✅ |
| Magic Wand panel hint text | `#94a3b8` | `#ffffff` | ~2.8:1 | **Fail** | ⚠️ Major |

**Key finding:** Same `--text-tertiary` (`#94a3b8`) problem as tracker. Used extensively for secondary information: slider labels, status bar, thread table secondary columns, hint text in floating panels.

**Fix:** Change `--text-tertiary` to `#64748b` (slate-500) globally — passes at ~4.6:1. This is a shared CSS variable fix that benefits both Creator and Tracker.

### 1.2 Colour as Sole Information Carrier

**Canvas patterns:**
- Pattern cells rely on colour fill to distinguish threads → mitigated by Symbol and Both view modes
- Selection mask uses blue overlay → single colour indicator, but strong contrast
- Backstitch lines use black by default → adequate contrast
- Highlight modes use dimming + desaturation → Isolate works for CVD users; Tint depends on tint colour choice

**Diagnostic overlays:**
- Confetti: uses red/orange/yellow traffic light → CVD issue. Should add icons or patterns.
- Heatmap: gradient colour ramp → should offer alternative (pattern/density numbers overlay).
- Readability: red/amber/green → same traffic light CVD issue.

**Verdict:** ⚠️ Major — canvas mitigated by symbol mode, but diagnostic overlays have no CVD fallback.

### 1.3 Icon-Only Buttons Without Colour Distinction
The swatch strip and palette chips rely entirely on colour to identify threads. Users with CVD may struggle to distinguish similar hues.

**Mitigations available:**
- Symbol mode shows unique symbols per colour on canvas
- Palette chips show DMC ID text label
- Thread table shows both swatch and DMC ID

**Verdict:** ⚠️ Minor — mitigated by text labels, but the swatch strip (quick colour selection) has no text labels on the swatches themselves.

---

## 2. Touch Targets

### 2.1 Minimum Size Compliance

The `@media (pointer: coarse)` rule sets `min-width: 44px; min-height: 44px` on `.tb-btn`, `.tb-fit-btn`, `.tb-overflow-btn`, and creator palette chips.

**Tested elements:**

| Element | Computed Size (coarse) | Passes 44×44? |
|---|---|---|
| Toolbar buttons (Paint, Fill, etc.) | 44×44 min | ✅ Pass |
| Swatch strip swatches | `24×24` (no coarse override) | ❌ **Fail** — 24×24px |
| Zoom ± buttons | Inline style `padding: 0 5px` | ❌ **Fail** — ~22×22px |
| Zoom slider thumb | Browser default input range | ⚠️ Platform-dependent |
| Fit button | `.tb-fit-btn` gets 44×44 | ✅ Pass |
| Sidebar tab buttons | `.rp-tab` 44px on coarse | ✅ Pass |
| Sidebar accordion toggle | Click on full section header | ✅ Pass — large target |
| Slider controls in sidebar | Browser default input range + label area | ⚠️ Platform-dependent |
| View toggle buttons (Colour/Symbol/Both) | `padding: 3px 0` | ❌ **Fail** — ~70×22px |
| Preview dropdown items | `.tb-ovf-item` 44px on coarse | ✅ Pass |
| Diagnostics toggle switches | ToggleSwitch component — ~40×20px | ❌ **Fail** |
| Magic Wand panel buttons | Button elements — varies | ⚠️ Likely borderline |
| Context menu items | Standard menu items | ✅ Pass — full width, adequate height |
| Brush size radio buttons (1/2/3) | Small inline elements ~24×24px | ❌ **Fail** |
| Stitch type dropdown items | Standard dropdown items | ✅ Pass via coarse rules |
| Highlight mode segmented control | `padding: 3px 0` — ~60×22px | ❌ **Fail** |
| Image card Crop/Change buttons | Small text buttons | ❌ **Fail** — likely ~30×24px |

**Key finding:** Same pattern as tracker — primary toolbar buttons are correctly sized, but secondary controls (swatch swatches, view toggles, brush size selectors, highlight mode segments, diagnostic toggles) miss the `(pointer: coarse)` size boost.

**Highest priority fix:** Swatch strip swatches (24×24). This is the most-used secondary control — users tap these hundreds of times per editing session. Should be 44×44 on coarse pointers, or at minimum 36×36 with adequate spacing.

---

## 3. Keyboard Navigation

### 3.1 Keyboard Shortcut Coverage
The creator has comprehensive keyboard shortcuts:

| Action | Key | Available? |
|---|---|---|
| Paint tool | P | ✅ |
| Fill tool | F | ✅ |
| Erase tool | 5 | ✅ |
| Eyedropper | I | ✅ |
| Cross stitch | 1 | ✅ |
| Half stitch / | 2 | ✅ |
| Half stitch \ | 3 | ✅ |
| Backstitch | 4 | ✅ |
| Magic wand | W | ✅ |
| Cycle view | V | ✅ |
| Toggle split pane | \ | ✅ |
| Zoom in/out | +, − | ✅ |
| Fit zoom | 0 | ✅ |
| Undo / Redo | Ctrl+Z / Ctrl+Y | ✅ |
| Save | Ctrl+S | ✅ |
| Select all | Ctrl+A | ✅ |
| Invert selection | Ctrl+Shift+I | ✅ |
| Shortcuts help | ? | ✅ |
| Escape (cascading dismiss) | Esc | ✅ |

**Gaps:**
- No keyboard shortcut for Diagnostics toggle
- No keyboard shortcut for Preview mode cycling
- No keyboard shortcut for colour cycling (◀▶ in swatch strip)
- No keyboard shortcut for brush size change
- No keyboard shortcut for Generate/Regenerate
- No keyboard shortcut for sidebar tab switching

**Verdict:** ✅ Core tools well-covered. ⚠️ Minor gaps for secondary features.

### 3.2 Focus Management

**Tab order testing:**

| Area | Focusable? | Visible focus indicator? |
|---|---|---|
| Header nav tabs | ✅ Focusable | ⚠️ Default browser outline (may be suppressed) |
| Toolbar buttons | ✅ Focusable | ⚠️ No custom focus ring — `outline: none` likely applied |
| Swatch strip swatches | ✅ Buttons are focusable | ❌ No visible focus indicator |
| Sidebar controls | ✅ Inputs/buttons focusable | ⚠️ Default browser rings |
| Canvas | ❌ Not keyboard-focusable | ❌ **Critical** — primary interaction surface |
| Modal overlays | ✅ Focus trap (overlay click dismiss) | ⚠️ Escape to close works |
| Floating panels (diagnostics, wand) | ⚠️ No focus trap | ❌ Tab can escape to background |

**Critical issue:** The canvas (`<canvas>`) is not focusable and has no `tabindex`. Keyboard-only users cannot interact with the canvas for painting/editing. Keyboard shortcuts work because they're registered on `document`, not the canvas — but there's no visual focus indicator showing the canvas is the target.

**Fix priority:** Add `tabindex="0"` to the canvas container. Add `role="application"` or `role="img"` with `aria-label` describing the pattern. Add focus ring style.

### 3.3 Screen Reader Support

| Element | Screen Reader Accessible? | Issue |
|---|---|---|
| Header nav | ✅ Link text | |
| Toolbar buttons | ⚠️ Some have `title` but no `aria-label` | Icon-only buttons lack accessible names |
| Swatch strip | ❌ Visual-only colour swatches | No aria-label per swatch (e.g., "DMC 310 Black, 423 stitches") |
| Canvas | ❌ No text alternative | Canvas is opaque to screen readers |
| Sidebar sliders | ⚠️ Native `<input type="range">` | Mostly accessible, but custom labels may not be associated |
| Floating panels | ❌ No `role="dialog"` or `aria-label` | Screen readers don't announce panel opening |
| Toasts | ❌ No `role="alert"` or `aria-live` | Screen readers won't announce notifications |
| Context menu | ❌ No `role="menu"` / `role="menuitem"` | Not navigable as a menu |

**Verdict:** ⚠️ Major — screen reader support is minimal. The canvas-based editing model is inherently challenging for screen readers, but ARIA landmarks and live regions should be added for non-canvas UI.

---

## 4. Motion & Animation

### 4.1 Reduced Motion Support
CSS includes `@media (prefers-reduced-motion: reduce)` which disables transitions. This is good.

**Animations that should respect this:**
- Marching ants (highlight outline mode) — uses `requestAnimationFrame` loop
- Comparison slider auto-sweep — animated panning
- Toast entrance/exit — CSS transitions
- Dim/highlight fade transitions — `dimFraction` animation
- Loading spinners during generation

**Current:** The CSS media query disables CSS-based transitions. But `requestAnimationFrame`-based animations (marching ants, auto-sweep) are not checked against the preference.

**Fix:** Check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` before starting RAF loops. Replace marching ants with a static dashed border. Replace auto-sweep with a manual slider.

**Verdict:** ⚠️ Minor — CSS transitions handled, JS animations not.

---

## 5. Responsive & Mobile Accessibility

### 5.1 Viewport Scaling
The app uses `<meta name="viewport" content="width=device-width, initial-scale=1">` — correct. No `maximum-scale=1` or `user-scalable=no` (which would block pinch-to-zoom on the page itself).

### 5.2 Mobile Drawer Discovery
The rpanel collapses to a 44px bottom drawer on `(pointer: coarse)`. There is no visual indicator that the tabs are expandable (no upward chevron, no "swipe up" hint). First-time mobile users may not discover the drawer.

**Fix:** Add a drag handle or chevron indicator above the tab bar.

**Verdict:** ⚠️ Minor — but impacts first-time mobile discoverability.

### 5.3 Landscape Orientation
On a phone in landscape (375×667 → 667×375), the creator chrome takes:
48px (header) + 36px (context bar) + 52px (pill row) + 36px (swatch strip) = 172px.
Available canvas height: 375 − 172 = **203px**. With the bottom drawer (44px): **159px**.

This is too tight for meaningful canvas interaction. The toolbar alone (88px for two rows) takes 23% of the viewport.

**Fix:** On landscape phones, consider collapsing the swatch strip into the sidebar drawer, and merging the context bar into the header (as proposed in the component inventory).

**Verdict:** ⚠️ Major — landscape phone is nearly unusable for canvas work.

### 5.4 Zoom & Pan on Touch
Pinch-to-zoom and single-finger pan work correctly on the canvas. The canvas uses `touch-action: none` to prevent browser-level zoom/scroll — appropriate for a drawing surface.

However, if the user zooms the canvas to a level where edge panning is needed, there's no edge-scroll feedback. The user must lift their finger and re-pan.

**Verdict:** ✅ Functional — ⚠️ Minor improvement opportunity for edge panning.

---

## 6. Creator-Specific Accessibility Issues

### 6.1 Drawing Tool Feedback
When using paint/fill/erase tools, the only feedback is the visual change on the canvas. There is no:
- Haptic feedback on mobile
- Sound feedback
- Status announcement for screen readers
- Confirmation toast for bulk operations (fill, selection operations)

**Verdict:** ⚠️ Minor — visual feedback is clear for sighted users, but non-visual feedback is absent.

### 6.2 Colour Picker in Background Section
The background colour picker uses a standard `<input type="color">` — browser-native, accessible.
The "pick from image" mode (`pickBg`) changes the cursor to a crosshair and expects a click on the source image. This mode change is not announced.

**Verdict:** ⚠️ Minor

### 6.3 Diagnostic Results
Diagnostic results (confetti score, readability failures) are presented as visual graphics (overlay on canvas, histogram charts). No text alternative for the scores.

**Fix:** Add text summaries below each diagnostic — e.g., "Confetti score: 12% (Good — below 15% threshold)".

**Verdict:** ⚠️ Minor — scores are visible in the panel but not screenreader-accessible.

### 6.4 Stitch Type Dropdown
The stitch type dropdown uses custom SVG icons for each type (cross, quarter, half /,  half \, three-quarter). The SVGs have no `aria-label` or `<title>` element. Screen readers will announce these as unlabelled images.

**Fix:** Add `aria-label` to each dropdown item (e.g., `aria-label="Half stitch forward diagonal"`).

**Verdict:** ⚠️ Major — toolbar dropdown items are used frequently and must be identifiable.

---

## 7. Priority Summary

### Critical (must fix)
1. **Canvas not keyboard-focusable** — add `tabindex="0"`, focus ring, `role` attribute
2. **`--text-tertiary` contrast failure** — change to `#64748b` globally (fixes 6+ failing elements)

### Major (should fix)
3. **Swatch strip touch targets** — 24×24 on mobile, should be 44×44
4. **Landscape phone unusable** — 159px canvas (merge context bar, collapse swatch strip)
5. **No `aria-label` on icon-only buttons** — toolbar and stitch type dropdown
6. **No `role="alert"` on toasts** — screen readers miss notifications
7. **Diagnostics colour-only indicators** — traffic light colours without icons/patterns
8. **Floating panels lack `role="dialog"`** — not announced to screen readers
9. **View toggle and highlight mode targets** — 22px height on mobile, need 44px
10. **Selected palette chip contrast** — white on `#0d9488` fails for small text

### Minor (nice to fix)
11. **Reduced-motion for JS animations** — marching ants, auto-sweep
12. **Mobile drawer discovery** — add drag handle/chevron
13. **Keyboard shortcut gaps** — diagnostics, preview, colour cycling, brush size
14. **Drawing tool non-visual feedback** — haptic, audio, or announcements
15. **Stitch type SVGs lack accessible names** — add `<title>` or `aria-label`

---

*End of Accessibility Audit*
