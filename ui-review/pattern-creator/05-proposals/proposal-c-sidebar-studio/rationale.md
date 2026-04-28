# Proposal C — Sidebar Studio

## Concept
Eliminate the horizontal toolbar entirely and replace it with a **narrow vertical tool rail** on the left edge (48px), similar to VS Code's Activity Bar or Photoshop's tool palette. The right sidebar remains as the context panel. The canvas fills the full width between the two rails.

This is a fundamentally different spatial model: tools are **vertical** rather than horizontal, removing all toolbar chrome above the canvas and producing the largest possible working area.

## Layout

### Desktop
```
┌──────────────────────────────────────────────────────┐
│                 Header bar  (48px)                    │
├─────┬────────────────────────────────┬───────────────┤
│Tool │                                │  Right Panel  │
│Rail │        Canvas Area             │  (260px)      │
│48px │        (full height)           │  4-tab / coll.│
│     │                                │               │
│Paint│                                │  Pattern tab  │
│Fill │                                │  Project tab  │
│Erase│                                │  Threads tab  │
│Eye  │                                │  Export tab   │
│ --- │                                │               │
│ X ▾ │                                │               │
│Half │                                │               │
│ --- │                                │               │
│Wand │                                │               │
│Lasso│                                │               │
│ --- │                                │               │
│Zoom+│                                │               │
│Zoom-│                                │               │
│Fit  │                                │               │
│ --- │                                │               │
│Undo │                                │               │
│Redo │                                │               │
│ --- │                                │               │
│View▾│                                │               │
│Diag │                                │               │
│Split│                                │               │
│     │            Swatch strip        │               │
│     │        (pinned bottom edge)    │               │
├─────┴────────────────────────────────┴───────────────┤
│   Colour chip + Status bar  (24px)                    │
└──────────────────────────────────────────────────────┘
```

- **Tool rail** (48px wide): Vertical stack of icon-only buttons (44×44px touch targets). Grouped by function with subtle dividers. Tooltips on hover. Active tool highlighted with accent border-left.
- **Swatch strip**: Pinned to the bottom of the canvas area as a horizontal row, not eating into the toolbar.
- **Status bar** (24px): Shows active colour name, stitch count, dimensions — replaces the old ContextBar role.
- **Right panel**: Same 260px, 4-tab structure as Proposals A & B.

### Mobile
```
┌──────────────────┐
│  Header  (48px)  │
├──────────────────┤
│                  │
│   Canvas Area    │
│   (full screen)  │
│                  │
│                  │
├──────────────────┤
│  Tool dock (56px)│   ← horizontal mini-rail at bottom
├──────────────────┤
│  Drawer (44px)   │   ← tabs, swipe up for sidebar
└──────────────────┘
```

- Tool rail transforms into a **bottom dock** (56px) with a horizontally scrollable row of the same tool icons.
- Swatch strip tucks inside the drawer as the first element when opened.
- Canvas gets: 667 − 48 − 56 − 44 = **519px** (collapsed drawer) — best-in-class for mobile.

## Chrome Budget

| Viewport      | Chrome (px) | Canvas (px) | vs Current |
|---------------|-------------|-------------|------------|
| Desktop 900px |  48 header  | full height | −124px vert gain (no toolbar rows) |
| Mobile 667px  | 48+56+44=148| 519         | 44px gain |
| Mobile drawer open | 148+~250 | 269       | — |

Desktop vertical chrome is just the 48px header — the tool rail is beside, not above, the canvas. This is the biggest canvas gain of all three proposals.

## Key Differences from A & B

| Aspect | A (Harmonised) | B (Contextual) | C (Sidebar Studio) |
|--------|----------------|-----------------|---------------------|
| Toolbar | Horizontal pill bar | Phase-dependent pill bar | **None — vertical rail** |
| Chrome above canvas | 128px | 84–128px | **48px** |
| Spatial model | Top-down | Top-down + phase toggle | **Left/Right rails** |
| Tool access | Scan horizontally | Depends on phase | Scan vertically |
| Swatch strip | Below toolbar | Editing phase only | Bottom of canvas area |
| Learning curve | Low (familiar) | Medium (phase concept) | Medium-high (new layout) |

## Design Rationale

1. **Maximum canvas**: Professional creative tools (Photoshop, Figma, Krita) use vertical tool palettes precisely because horizontal space is cheaper than vertical space — screens are wider than tall.
2. **Spatial separation**: Tool selection (left) vs. detail configuration (right) creates clear mental model.
3. **Touch-friendly**: 44×44px buttons in a vertical stack are easy to reach with the thumb on tablets.
4. **Scales naturally**: Adding new tools just extends the rail downward — no overflow collapse logic needed.

## Effort & Risk

- **Effort**: High — requires new CSS layout (CSS Grid 3-column), refactoring ToolStrip into a vertical component, re-testing all tool overflow and interaction patterns.
- **Risk**: The vertical rail is unfamiliar for web-based stitch tools (most competitors use horizontal toolbars). Mobile bottom dock adds a third chrome band. Users may initially find the layout surprising.
- **Accessibility gain**: Every tool is always visible and labelled — no collapsing, no dropdowns, no overflow menu hiding tools.

## Harmony with Tracker Proposal B
The Tracker has no equivalent toolbar (its tools are simpler), so there is no conflict. The shared header (48px) and right-panel tabs pattern remain consistent. The status bar takes over the info-strip role from the Tracker design.
