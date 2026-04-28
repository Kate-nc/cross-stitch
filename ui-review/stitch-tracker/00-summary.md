# Stitch Tracker UI Review — Executive Summary

## The Problem

The stitch tracker works — every feature a cross-stitcher needs is present. But the interface has grown organically and now suffers from **information overload, duplicate controls, and a layout that punishes mobile users**.

### Key Findings

1. **226px of stacked chrome above the canvas** (Header 48 + ContextBar 44 + Pill Toolbar 52 + Progress Bar 34 + MiniStatsBar 48). On a typical phone in landscape this leaves barely 140px for the actual pattern. On a 667px portrait phone, only ~440px.

2. **Duplicate controls everywhere.** Progress is shown in three places (ContextBar %, progress bar, MiniStatsBar). Save appears in three places (Header File menu, ContextBar button, below-canvas section). View mode is accessible from both the toolbar and the right panel.

3. **No mobile story for the right panel.** The 280px sidebar renders at full width or not at all — no bottom drawer, no collapsible tabs, no responsive adaptation.

4. **Misplaced features.** Thread Organiser and the full image-import dialog live in the tracker but belong in the Stash Manager and Creator respectively.

5. **Accessibility gaps.** `--text-tertiary` (#94a3b8) fails WCAG AA contrast. Many touch targets fall below 44×44px. No visible focus indicators. Canvas is not keyboard-focusable. Icon-only buttons lack `aria-label`.

Full details in:
- [01-component-inventory.md](01-component-inventory.md) — every UI element tagged with keep/demote/relocate
- [02-user-journeys.md](02-user-journeys.md) — four walkthroughs (mobile tracking, desktop tracking, first-time, creator↔tracker)
- [03-competitor-analysis.md](03-competitor-analysis.md) — Pattern Keeper, Markup R Stitch, Stitch Fiddle, MacStitch/WinStitch, Stitch Sketch
- [04-accessibility-audit.md](04-accessibility-audit.md) — WCAG audit with prioritised fixes

---

## Three Proposals

Each preserves **all** current features — nothing is deleted, only relocated.

### Proposal A: "Keeper" — Pattern Keeper Minimalism
**Philosophy:** Strip to bare essentials. Canvas dominates. One colour bar at top, three buttons at bottom, everything else in a menu or bottom sheet.

| Metric | Value |
|---|---|
| Mobile chrome | ~136px (40% less) |
| Desktop chrome | Header + bottom toolbar (~92px) |
| Canvas gain | ~90px on mobile |
| Creator harmony | ⚠️ Different toolbar position (bottom vs top) |
| Discoverability | Low — power features hidden behind ⋯ menu |
| Implementation effort | Medium — restructure toolbar + add bottom sheet |

**Best for:** users who spend 90%+ of time marking stitches and want maximum canvas.

→ [Proposal A rationale](05-proposals/proposal-a-keeper/rationale.md) · [Mobile mockup](05-proposals/proposal-a-keeper/mobile.html) · [Desktop mockup](05-proposals/proposal-a-keeper/desktop.html)

---

### Proposal B: "Organised Density" — Same features, better hierarchy
**Philosophy:** Keep everything accessible but eliminate duplication, merge chrome layers, and impose clear hierarchy. Merge ContextBar into Header. Replace progress bar + MiniStatsBar with a 28px info strip. Right panel becomes tabbed (Colours | Session | More) with a mobile bottom-drawer.

| Metric | Value |
|---|---|
| Mobile chrome | ~164px (27% less) |
| Desktop chrome | Header + toolbar + strip (~120px) |
| Canvas gain | ~62px on mobile |
| Creator harmony | ✅ Best — same structural shape as Creator |
| Discoverability | High — all features ≤ 2 taps away |
| Implementation effort | Low-medium — merges and tab restructure, minimal new patterns |

**Best for:** power users who frequently adjust settings mid-session and want everything within reach.

→ [Proposal B rationale](05-proposals/proposal-b-organised-density/rationale.md) · [Mobile mockup](05-proposals/proposal-b-organised-density/mobile.html) · [Desktop mockup](05-proposals/proposal-b-organised-density/desktop.html)

---

### Proposal C: "Spotlight" — Command Palette + Floating Actions
**Philosophy:** Minimal persistent chrome — just a 24px status ribbon and 3 floating buttons. All features accessed via a searchable command palette (Ctrl+K / swipe up).

| Metric | Value |
|---|---|
| Mobile chrome | ~24px (89% less) |
| Desktop chrome | Ribbon 28px + auto-hiding status 22px |
| Canvas gain | ~200px on mobile |
| Creator harmony | ❌ Worst — completely different interaction model |
| Discoverability | Very low — requires learning palette paradigm |
| Implementation effort | High — new command registry, fuzzy search, gesture handling |

**Best for:** tech-savvy users comfortable with keyboard-driven UIs (VS Code, Linear, Figma).

→ [Proposal C rationale](05-proposals/proposal-c-spotlight/rationale.md) · [Mobile mockup](05-proposals/proposal-c-spotlight/mobile.html) · [Desktop mockup](05-proposals/proposal-c-spotlight/desktop.html)

---

## Comparison Matrix

| | A: Keeper | B: Organised | C: Spotlight |
|---|---|---|---|
| Canvas space gained (mobile) | ██████░░░░ 90px | ████░░░░░░ 62px | ██████████ 200px |
| Feature discoverability | ██░░░░░░░░ | ████████░░ | █░░░░░░░░░ |
| Creator↔Tracker harmony | █████░░░░░ | █████████░ | ██░░░░░░░░ |
| Learning curve | ███░░░░░░░ | █░░░░░░░░░ | ██████░░░░ |
| Implementation effort | █████░░░░░ | ███░░░░░░░ | ████████░░ |
| Mobile experience | ████████░░ | ██████░░░░ | ██████████ |
| Desktop experience | ██████░░░░ | ████████░░ | ██████░░░░ |

---

## Recommendation

**Start with Proposal B ("Organised Density")** as the immediate next step. Rationale:

1. **Lowest risk.** Preserves the existing interaction model that users already know. No new paradigms to learn.
2. **Best creator harmony.** The tracker and creator will feel like the same app.
3. **Incremental path.** Several B changes are independently valuable and can ship one at a time:
   - Merge ContextBar into Header (saves 44px immediately)
   - Replace progress bar + MiniStatsBar with info strip (saves 54px)
   - Add tabbed right panel with mobile drawer (fixes the entire right-panel-on-mobile problem)
   - Move Thread Organiser to Stash Manager (simplifies tracker)
   - Remove duplicate Save/Load section
4. **Gateway to A or C.** Once B is stable, elements of A (bottom toolbar for mobile) or C (command palette as a power-user overlay) can be layered on top without undoing B's structural improvements.

### Immediate Wins (no proposal required)

These fixes should ship regardless of which proposal is chosen:

| Fix | Effort | Impact |
|---|---|---|
| Add `aria-label` to all icon-only buttons | Trivial | Accessibility |
| Bump `--text-tertiary` to `#a8b5c7` for WCAG AA | Trivial | Accessibility |
| Set `min-height: 44px` on all `.tb-btn`, `.col-row`, zoom buttons | Small | Touch targets |
| Add `:focus-visible` outline to all interactive elements | Small | Keyboard accessibility |
| Remove duplicate Save button from below-canvas | Trivial | Reduces clutter |
| Add `role="application"` and keyboard handlers to canvas | Medium | Keyboard accessibility |

---

## Deliverables in This Folder

```
ui-review/stitch-tracker/
├── 00-summary.md              ← you are here
├── 01-component-inventory.md  ← every UI element catalogued
├── 02-user-journeys.md        ← four user journey walkthroughs
├── 03-competitor-analysis.md  ← five competitor apps analysed
├── 04-accessibility-audit.md  ← WCAG audit with fixes
└── 05-proposals/
    ├── proposal-a-keeper/
    │   ├── rationale.md       ← design philosophy + relocation table
    │   ├── mobile.html        ← interactive mobile mockup
    │   └── desktop.html       ← interactive desktop mockup
    ├── proposal-b-organised-density/
    │   ├── rationale.md
    │   ├── mobile.html
    │   └── desktop.html
    └── proposal-c-spotlight/
        ├── rationale.md
        ├── mobile.html
        └── desktop.html
```

All HTML mockups are self-contained (inline CSS + JS, no dependencies) and can be opened directly in a browser to interact with the proposed layouts.
