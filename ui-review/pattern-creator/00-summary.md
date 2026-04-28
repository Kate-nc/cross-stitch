# Pattern Creator UI Review — Executive Summary

## The Problem

The Creator is the most complex page in the app — and rightfully so. Converting an image to a cross-stitch pattern involves dimensions, palette tuning, stitch cleanup, adjustments, background handling, and then a full editing toolkit. But the current interface layers **172px of chrome above the canvas** (Header 48 + ContextBar 36 + Pill Toolbar 52 + Swatch Strip 36), duplicates information between the ContextBar and Header, crams 15+ interactive elements into a single horizontal pill bar, and gives mobile users a drawer that fights the toolbar for attention.

### Key Findings

1. **172px of stacked chrome above the canvas.** On a 667px phone this leaves ~451px for the pattern (after the 44px collapsed drawer). The ContextBar duplicates the project name and save button already in the Header — merging them saves 36px immediately.

2. **The pill toolbar does too much.** Paint/Fill/Erase/Eyedropper, stitch type dropdown, brush size, backstitch toggle, selection tools, colour chip, zoom, undo/redo, preview mega-dropdown, split view, diagnostics, and overflow — all in one 52px row. A ResizeObserver collapses elements at <680px and <550px, but collapsed state hides important tools behind an overflow menu with no indication of what is hidden.

3. **The right sidebar is a scroll treadmill.** Seven collapsible sections (Dimensions, Palette, Stitch Cleanup, Fabric & Floss, Adjustments, Background, Palette Swap) plus an image card, view toggle, and pinned Generate button. "Fabric & Floss" wraps a single dropdown. Users generating patterns scroll past editing sections they don't need yet.

4. **Preview is a mega-menu.** Three chart views + three realistic texture levels + a coverage slider + six presets — nested inside a dropdown attached to a toolbar button. This is a full panel's worth of controls in a popup.

5. **Swatch strip touch targets are 24px.** The `@media(pointer:coarse)` rules enlarge `.tb-btn` to 44px but leave swatch chips at 24px — a WCAG failure for the most-tapped element during editing.

6. **`--text-tertiary` (#94a3b8) fails WCAG AA contrast** throughout the sidebar, tooltips, and status text — the same issue identified in the Tracker review.

Full details in:
- [01-component-inventory.md](01-component-inventory.md) — every UI element tagged with keep/demote/relocate
- [02-user-journeys.md](02-user-journeys.md) — five walkthroughs (first-time mobile, iterative desktop, quick creation, creator→tracker, scratch mode)
- [03-competitor-analysis.md](03-competitor-analysis.md) — Stitch Fiddle, MacStitch/WinStitch, Pixel Stitch, general chart tools
- [04-accessibility-audit.md](04-accessibility-audit.md) — WCAG audit with prioritised fixes

---

## Three Proposals

Each preserves **all** current features — nothing is deleted, only relocated and reorganised. All harmonise with the accepted Tracker Proposal B ("Organised Density").

### Proposal A: "Harmonised Density" — Tracker B applied to Creator
**Philosophy:** Apply the exact same structural pattern chosen for the Tracker: merge ContextBar into Header, tighten the pill row from 52→44px, keep the swatch strip, merge "Fabric & Floss" into "Dimensions", narrow rpanel to 260px. A direct port of Tracker Proposal B's principles.

| Metric | Value |
|---|---|
| Desktop chrome | 128px (48 header + 44 pill + 36 swatch) |
| Mobile chrome | 172px (+ 44px drawer) |
| Canvas gain (mobile) | +44px vs current |
| Tracker harmony | ✅ Identical structure |
| Discoverability | High — same toolbar, 6 sidebar sections |
| Implementation effort | Low — merge/tighten existing components |

**Best for:** ensuring visual consistency across all three pages with minimal disruption.

→ [Rationale](05-proposals/proposal-a-harmonised-density/rationale.md) · [Desktop mockup](05-proposals/proposal-a-harmonised-density/desktop.html) · [Mobile mockup](05-proposals/proposal-a-harmonised-density/mobile.html)

---

### Proposal B: "Contextual Workshop" — Phase-aware UI
**Philosophy:** The Creator has two distinct modes: **Generation** (uploading, tuning dimensions/palette, clicking Generate) and **Editing** (painting, filling, selecting, swapping colours). Show each mode only the controls it needs.

- **Generation Phase:** Compact 36px inline toolbar (dimensions + colours + Generate button), full sidebar with all generation sections, no swatch strip or editing tools. Chrome: 84px desktop.
- **Editing Phase:** Full pill toolbar + swatch strip, sidebar collapses generation sections and shows palette chips + highlight toggles. Chrome: 128px desktop.

Phase auto-detected (pre-generation vs post-generation) with a manual toggle.

| Metric | Value |
|---|---|
| Desktop chrome (generation) | 84px |
| Desktop chrome (editing) | 128px |
| Mobile chrome (generation) | 128px (48+36+44 drawer) |
| Mobile chrome (editing) | 172px (48+44+36+44 drawer) |
| Canvas gain (generation, mobile) | +88px vs current |
| Tracker harmony | ✅ Editing phase matches Tracker B |
| Discoverability | High per phase — low cross-phase |
| Implementation effort | Medium — phase detection, conditional rendering |

**Best for:** pattern makers who spend significant time in both generation and editing, and want each phase to feel purpose-built.

→ [Rationale](05-proposals/proposal-b-contextual-workshop/rationale.md) · [Desktop mockup](05-proposals/proposal-b-contextual-workshop/desktop.html) · [Mobile mockup](05-proposals/proposal-b-contextual-workshop/mobile.html)

---

### Proposal C: "Sidebar Studio" — Vertical tool rail
**Philosophy:** Replace the horizontal toolbar entirely with a narrow 48px vertical tool rail on the left edge (like VS Code or Photoshop). Every tool is always visible and accessible — no overflow, no collapsing. Canvas fills full height between header and swatch strip. Right panel stays as the settings sidebar.

| Metric | Value |
|---|---|
| Desktop chrome above canvas | 48px (header only!) |
| Mobile chrome | 148px (48 header + 56 tool dock + 44 drawer) |
| Canvas gain (desktop) | +124px vertical (massive) |
| Canvas gain (mobile) | +44px vs current |
| Tracker harmony | ⚠️ Different tool paradigm, shared header + rpanel |
| Discoverability | Very high — all tools always visible |
| Implementation effort | High — new CSS Grid layout, refactored ToolStrip |

**Best for:** users who want maximum canvas area on desktop and a professional editing-studio feel.

→ [Rationale](05-proposals/proposal-c-sidebar-studio/rationale.md) · [Desktop mockup](05-proposals/proposal-c-sidebar-studio/desktop.html) · [Mobile mockup](05-proposals/proposal-c-sidebar-studio/mobile.html)

---

## Comparison Matrix

| | A: Harmonised | B: Contextual | C: Sidebar Studio |
|---|---|---|---|
| Desktop canvas gain | ████░░░░░░ 44px | ██████░░░░ 88px* | ██████████ 124px |
| Mobile canvas gain | ████░░░░░░ 44px | ██████░░░░ 88px* | ████░░░░░░ 44px |
| Feature discoverability | ████████░░ | ██████░░░░ | ██████████ |
| Tracker harmony | ██████████ | ████████░░ | █████░░░░░ |
| Learning curve | █░░░░░░░░░ | ████░░░░░░ | ██████░░░░ |
| Implementation effort | ██░░░░░░░░ | █████░░░░░ | ████████░░ |
| Mobile experience | ██████░░░░ | ████████░░ | ██████░░░░ |
| Desktop experience | ██████░░░░ | ████████░░ | ██████████ |

\* B's gains are in generation phase. In editing phase, B matches A.

---

## Recommendation

**Start with Proposal A ("Harmonised Density") as the foundation, then layer in Proposal B's phase awareness.**

### Phase 1: Ship Proposal A
1. **Lowest risk.** It's the Tracker B pattern applied to the Creator — users experience a unified app.
2. **Merge ContextBar into Header** — saves 36px, removes duplicate controls.
3. **Tighten pill row 52→44px** — matches Tracker.
4. **Merge "Fabric & Floss" into "Dimensions"** — eliminates a one-dropdown section.
5. **Narrow rpanel 280→260px** — consistent with Tracker.
6. **Each change ships independently** — no big-bang refactor needed.

### Phase 2: Add phase awareness from Proposal B
Once Proposal A is stable, add phase detection:
1. **Generation Phase** collapses the editing toolbar into a slim inline bar.
2. **Editing Phase** expands the full toolbar and collapses generation settings.
3. This converts A into B without undoing any structural improvements.

### Phase 3: Consider Proposal C for desktop power users
The vertical tool rail is the most canvas-efficient layout on desktop. If user research shows pattern makers primarily work on desktop with large monitors, the tool rail can be offered as an optional "Studio Mode" layout preference — but it should not be the default for consistency with the Tracker.

### Immediate Wins (no proposal required)

These fixes should ship regardless of which proposal is chosen:

| Fix | Effort | Impact |
|---|---|---|
| Add `aria-label` to all icon-only buttons in ToolStrip | Trivial | Accessibility |
| Bump `--text-tertiary` to ≥ `#64748b` for WCAG AA | Trivial | Accessibility |
| Enlarge swatch strip chips to 28px minimum (44px with padding) on touch | Small | Touch targets |
| Add `:focus-visible` outline to all interactive elements | Small | Keyboard accessibility |
| Remove ContextBar duplicate of project name + save | Small | Chrome reduction |
| Add `role="application"` and keyboard handlers to canvas | Medium | Keyboard accessibility |
| Break Preview mega-menu into a dedicated sidebar tab or panel | Medium | Reduces nesting |

---

## Deliverables in This Folder

```
ui-review/pattern-creator/
├── 00-summary.md                          ← you are here
├── 01-component-inventory.md              ← every UI element catalogued
├── 02-user-journeys.md                    ← five user journey walkthroughs
├── 03-competitor-analysis.md              ← four competitor apps analysed
├── 04-accessibility-audit.md              ← WCAG audit with fixes
└── 05-proposals/
    ├── proposal-a-harmonised-density/
    │   ├── rationale.md                   ← design philosophy + layout spec
    │   ├── desktop.html                   ← interactive desktop mockup
    │   └── mobile.html                    ← phone-frame mobile mockup
    ├── proposal-b-contextual-workshop/
    │   ├── rationale.md                   ← phase-aware design spec
    │   ├── desktop.html                   ← interactive mockup with phase toggle
    │   └── mobile.html                    ← phone-frame mockups (both phases)
    └── proposal-c-sidebar-studio/
        ├── rationale.md                   ← vertical tool rail concept
        ├── desktop.html                   ← 3-column grid layout mockup
        └── mobile.html                    ← phone-frame mockups (dock + drawer)
```
