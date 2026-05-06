# touch-7 — Toolbar Improvements

Improving the existing toolbars without redesigning them. The goals are:

1. Hit the 44 × 44 px target floor everywhere on touch viewports.
2. Reorder by usage so the most-used tools stay visible.
3. Move the toolbar to a thumb-reachable position on tablet/phone.
4. Make the active tool and active colour persistently obvious.

──────────────────────────────────────────────────────────────────────
## Tool usage priority — inferred from code
──────────────────────────────────────────────────────────────────────

Inferred from handler complexity, default keyboard shortcuts, and
the order in `creator/ToolStrip.js` (current order is roughly the
designer's mental model of frequency):

### Edit-mode tools (priority order)
1. **Paint** (P) — primary editing action, default on app open.
2. **Eraser** (E) — most-undo'd second tool.
3. **Eyedropper** (I / Alt+click) — high-frequency colour switching.
4. **Fill** (F / G) — common for backgrounds.
5. **Magic wand** (W) — selection workflow.
6. **Lasso** (L) — selection workflow.
7. **Hand / pan** (H) — new in this proposal; high frequency on touch.
8. **Backstitch** (B) — niche but important to certain patterns.
9. **Eraser BS** — niche.
10. **Partial-stitch tools** (half-fwd, half-back, quarter, three-quarter)
    — niche; group into one overflow.

### Track-mode tools
1. **Mark** (default) — the entire workflow.
2. **Hand** — new; pan.
3. **Range** — promote from gesture to explicit tool.
4. **Edit-mode toggle** — niche.

### Always-visible adjacent
- Undo / redo
- Active colour swatch
- Zoom controls
- Focus / full-screen toggle (new)

──────────────────────────────────────────────────────────────────────
## Sizing changes
──────────────────────────────────────────────────────────────────────

| Selector | Today | Proposed |
|---|---|---|
| `.tb-btn` (desktop) | ~ 22 px tall × 36–60 px | Keep desktop appearance; **min-height 44 px when `(pointer:coarse)` or `(max-width:1024px)`** |
| `.tb-btn` (touch) | 44 px when `(pointer:coarse)` (already partial via `min-height:44px` in some contexts) | **44 px guaranteed** by adding `min-height:44px` to `.tb-btn` directly inside the tablet/touch media query |
| `.tb-btn` adjacent gap | ~ 4 px | **8 px** on touch viewports |
| `.tb-fit-btn` | 28 × 26 px | **44 × 44 px** on touch |
| `.tb-overflow-btn` | 28 × 26 px | **44 × 44 px** on touch |
| `.tb-zoom-pct` | 11 px text only | unchanged (visual only) |
| `.tb-overflow-menu` items | ~ 28 px tall | **44 px** on touch |
| `.lp-tab` (tablet landscape 900–1023 px) | 28 px tall | **44 px** (extend existing mobile rule to ≤ 1024 px or `(pointer:coarse)`) |
| `.lp-close` | 36 × 36 px | **44 × 44 px** on touch |
| `.rp-tab` | 28 px tall | **44 px** on touch |
| `.palette-chip` (mobile) | 28 × 28 px, 0 px gap | **40 × 40 px**, 8 px gap (current 28 px is intentional density-pack but causes mistaps) |
| Modal close `×` buttons | 32 × 32 px | **44 × 44 px** on touch |
| SplitPane divider | 4 px wide | **8 px wide on touch**, 4 px on mouse-only (use `(pointer:coarse)` query) |
| Header nav links | ~ 36 px tall | **44 px** on touch via padding |
| Filter chips (manager) | 24 × 24 px | **40 × 40 px** with 8 px gap on touch |
| Native checkboxes in modals | OS default | Wrap in 44 × 44 px label hit-area |

──────────────────────────────────────────────────────────────────────
## Reorder + overflow strategy
──────────────────────────────────────────────────────────────────────

Today the ToolStrip wraps its rows when narrow and dumps everything
into an overflow on desktop too. Proposed:

- **Always-visible primary tools** (Edit): Paint, Eraser, Eyedropper,
  Fill, Wand, Lasso, Hand, Undo, Redo, Active-colour swatch, Zoom %%,
  Focus button.
- **Overflow menu**: Backstitch, Eraser BS, Partial-stitch group,
  Crop, Selection ops, etc.

This is achievable by setting CSS `order:` on the existing buttons in
`ToolStrip` and giving the overflow trigger a fixed `order:` at the
end. No structural component change.

──────────────────────────────────────────────────────────────────────
## Bottom positioning on touch viewports
──────────────────────────────────────────────────────────────────────

On touch viewports (≤ 1024 px or `(pointer:coarse)`), the creator's
ToolStrip moves to the **bottom** of the canvas area, mirroring the
tracker mobile action bar pattern that already works.

CSS sketch:
```css
@media (pointer: coarse), (max-width: 1024px) {
  .tool-strip {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    border-top: 1px solid var(--border);
    border-bottom: none;
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 50;
  }
  .canvas-area { padding-bottom: 72px; }
}
```

The tracker `tracker-action-bar` is already bottom-fixed; this adds
parity for the creator. Top toolbar still exists on desktop (≥ 1025 px
and `(pointer:fine)`).

### Why not "floating, repositionable"?

Procreate-style draggable palettes are powerful but introduce a
discoverability tax (users must learn it can move) and a state that
must persist sanely across orientation changes. A fixed-bottom bar
matches the tracker pattern users already know and ships with less
risk. Could be revisited as polish later.

──────────────────────────────────────────────────────────────────────
## Active tool / active colour visibility
──────────────────────────────────────────────────────────────────────

In addition to the existing `.tb-btn--on` highlight on the active
tool, add a **persistent status chip** at the bottom-left of the
canvas area:

- 44 × 44 px tool icon + small label below it.
- 32 × 32 px colour swatch overlapping the bottom-right of the icon.
- Tapping it opens the tool overflow.

This chip is always visible in normal mode AND mirrored into the
floating mini-bar in full-screen mode.

This solves the rule "the active tool and active mode must be visible
at all times" — even when the bottom toolbar wraps overflow into a
menu, the chip shows the truth.

──────────────────────────────────────────────────────────────────────
## Tool switching interaction
──────────────────────────────────────────────────────────────────────

- **Tap to select**: same as today.
- **Long-press a tool**: opens a sub-menu of related tools where
  appropriate. Examples:
  - Long-press Lasso → freehand / polygon / magnetic options.
  - Long-press Wand → tolerance slider.
  - Long-press Brush → brush-size slider.
  - Long-press Eraser → "erase only stitches" / "erase everything".
- Sub-menus are a translucent flyout above the tool button, dismissed
  by tap-outside or selecting an item.
- Mouse equivalent: right-click on the tool, or click a small chevron
  next to it.

──────────────────────────────────────────────────────────────────────
## Implementation footprint
──────────────────────────────────────────────────────────────────────

- CSS-only changes for: sizing floors, gaps, bottom positioning at
  touch viewports.
- Small JS changes for: `order:` rules in `ToolStrip.js`, persistent
  status chip component, long-press sub-menus.
- No new dependencies, no React-tree restructuring.
