# Polish 13 — Creator Mode Consolidation (Plan + Mockups)

> **Status:** Planning only. No source changes yet. This document captures
> the Solution C proposal raised after the Polish A/B fixes in
> `ui-improvements-2`. It supersedes nothing until it is reviewed and
> agreed.

## Problem statement

Today the Pattern Creator has two distinct UIs that the user shuttles
between via an `appMode` state flag (`"create"` ↔ `"edit"`):

1. **Setup mode** (`appMode === "create"`) — image upload, dimension
   sliders, palette pickers, fabric/zoom controls. Sidebar tabs:
   *Image · Dimensions · Palette · Preview · Project*.
2. **Edit mode** (`appMode === "edit"`) — pixel-level editing of the
   generated pattern: brush, lasso, fill, magic wand, half/quarter
   stitches, backstitch lines, palette swap. Sidebar tabs:
   *Tools · View · Palette · Preview · More*.

Switching is implicit (Generate flips you forward) and the only way back
is the action-bar's `<- Setup` button, which fires a `confirm()` dialog
warning that local edits will be lost. New users routinely report:

- "Why did the screen change after I clicked Generate?" (Polish A
  addressed the *visual cue* with the new phase label and the toast in
  Polish B; the *structural* duplication remains.)
- "Where did the dimension slider go?" — they're forced to back out and
  regenerate from scratch to nudge the canvas size.
- "I just wanted to swap the palette." — palette is in both modes but
  behaves differently (Setup = re-quantise, Edit = swap-in-place).

The two-mode model also costs us:

- **Two sets of sidebar tab arrays** with subtly different ordering
  (Polish A locked Palette/Preview to slot 3/4 to mitigate this).
- **Two canvas renderers** wired through one component but gated on
  `appMode`.
- **A confirm() dialog** for any back-step, which is on the polish-7
  deferred list.
- **Test surface** — every feature that crosses the boundary needs
  paired assertions (`createTabs`, `editTabs`, both keyboard maps).

## Goal

A **single, progressive Creator UI** where every feature is reachable at
all times. Features that require a generated pattern stay disabled (with
a clear "Generate first" hint) until generation completes.

## Proposed unified UI

### Sidebar tab list (single source of truth)

| Slot | Tab        | Pre-generate behaviour            | Post-generate behaviour |
|------|------------|-----------------------------------|-------------------------|
| 1    | Image      | Upload, crop, filters             | Same — re-uploading prompts a regen toast |
| 2    | Dimensions | Live slider; previews target size | Same — regen on apply, with a "values changed" badge |
| 3    | Palette    | Pick DMC subset / quantise count  | Combines current Setup palette pickers + Edit-mode swap-in-place |
| 4    | Tools      | **Disabled** with "Generate to enable" pill | Brush, lasso, magic wand, half/quarter, backstitch |
| 5    | View       | **Disabled** with "Generate to enable" pill | Grid, symbols, gridlines, zoom presets |
| 6    | Preview    | Live thumbnail of the source image | Live thumbnail of the pattern |
| 7    | Project    | Save / load / export              | Save / load / export (with regen confirmation) |

### Canvas

A single canvas component decides what to render based on the *focused
tab*, not on `appMode`:

- *Image / Dimensions* tabs → show source image with crop overlay.
- *Palette* tab → show source-image swatch grid, or pattern preview if a
  pattern exists.
- *Tools / View* tabs → show editable pattern canvas (the existing
  `PatternCanvas`).
- *Preview* tab → realistic preview canvas.
- *Project* tab → most-recent canvas (no auto-switch).

This removes the implicit forward jump on Generate. Users see Tools
light up and the canvas re-render in place — no full-screen swap.

### Action bar

The `Setup ⇄ Edit` mode chip vanishes (no modes left). The bar becomes
purely outcome-oriented:

```
[ Pattern info ▾ ]   ……   [ Print PDF ]   [ Export ▾ ]   [ Open in Tracker > ]
```

The "back to Setup" affordance is implicit: every Setup feature is one
click away in the sidebar.

## Mockups

### Current — Pre-generate (Setup mode)

```
┌─ Header ─────────────────────────────────────────────────────────────┐
│ logo   Create  Track  Stash                                          │
└──────────────────────────────────────────────────────────────────────┘
┌─ Canvas (image preview) ──────────┐ ┌─ Sidebar ────────────────────┐
│                                   │ │ [Image] Dimens Palette       │
│   <source image with crop box>    │ │ Preview Project              │
│                                   │ │                              │
│                                   │ │  Upload…   [ Browse ]        │
│                                   │ │  Crop…                       │
│                                   │ │  Filters                     │
│                                   │ │                              │
│                                   │ │  ┌────────────────────────┐  │
│                                   │ │  │     Generate           │  │
│                                   │ │  └────────────────────────┘  │
└───────────────────────────────────┘ └──────────────────────────────┘
```

### Current — Post-generate (Edit mode) — sidebar swap is jarring

```
┌─ Header ─────────────────────────────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────────┘
┌─ ActionBar: < Setup | Editing pattern | Open in Tracker >  • info  • Export
┌─ Canvas (pattern editor) ─────────┐ ┌─ Sidebar ────────────────────┐
│                                   │ │ [Tools] View  Palette        │
│   <symbol grid, brush cursor>     │ │ Preview More                 │
│                                   │ │                              │
│                                   │ │  Stitch type: Cross  ▾       │
│                                   │ │  Brush size:  ▢▣▣            │
│                                   │ │  Lasso modes…                │
│                                   │ │  Backstitch                  │
│                                   │ │                              │
└───────────────────────────────────┘ └──────────────────────────────┘
```

### Proposed — Pre-generate (single UI, Tools tab dimmed)

```
┌─ Header ─────────────────────────────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────────┘
┌─ ActionBar:                                          info  •  Export ┐
└──────────────────────────────────────────────────────────────────────┘
┌─ Canvas (image preview) ──────────┐ ┌─ Sidebar ────────────────────┐
│                                   │ │ [Image] Dim  Palette         │
│   <source image with crop box>    │ │ Tools•   View•   Preview     │
│                                   │ │ Project                      │
│                                   │ │                              │
│                                   │ │  Upload / Crop / Filters     │
│                                   │ │                              │
│                                   │ │  ┌───────────┐               │
│                                   │ │  │ Generate  │               │
│                                   │ │  └───────────┘               │
└───────────────────────────────────┘ └──────────────────────────────┘
                                       (• = disabled "Generate to enable")
```

### Proposed — Post-generate (same UI, Tools/View enabled, canvas swapped)

```
┌─ Header ─────────────────────────────────────────────────────────────┐
└──────────────────────────────────────────────────────────────────────┘
┌─ ActionBar:    info  • Print PDF  • Export ▾  • Open in Tracker >    ┐
└──────────────────────────────────────────────────────────────────────┘
┌─ Canvas (pattern editor) ─────────┐ ┌─ Sidebar ────────────────────┐
│                                   │ │ Image  Dim   Palette         │
│   <symbol grid, brush cursor>     │ │ [Tools] View   Preview       │
│                                   │ │ Project                      │
│                                   │ │                              │
│                                   │ │  Stitch type: Cross  ▾       │
│                                   │ │  Brush size:  ▢▣▣            │
│                                   │ │  Lasso, magic wand, etc.     │
│                                   │ │                              │
│                                   │ │  ↺ Re-generate (Dim changed) │
└───────────────────────────────────┘ └──────────────────────────────┘
```

### Disabled-tab pill (detail)

```
┌────────────────────────────────────────────┐
│  Tools                              ▢▢▢▢   │  ← greyed text, no fill
│  ─────                                     │
│  Generate a pattern to unlock              │
│  brush, lasso, magic wand, half-stitches,  │
│  backstitch, and more.                     │
│                                            │
│   [ Jump to Image ▸ Generate ]             │
└────────────────────────────────────────────┘
```

## Implementation phases

### Phase 1 — Merge tab arrays (no behaviour change)

- Replace `createTabs` / `editTabs` in `creator/Sidebar.js` with a
  single `tabs` array of all 7 entries.
- Each tab gains an `enabledWhen(state)` predicate (defaults to `true`).
- Tools/View use `enabledWhen: state => !!state.pat`. When disabled,
  render the pill placeholder above instead of the live content.
- Update `tests/toolsTabRelocation.test.js` and any sibling regex tests
  (cleanup tab order tests) to assert against the new single array.

### Phase 2 — Canvas selector by tab focus

- Move the `appMode === "edit" ? <PatternCanvas/> : <SourceCanvas/>`
  decision out of `creator-main.js` and into a small selector that keys
  on `state.tab`.
- Document the mapping in a constant (`CANVAS_BY_TAB`) so future tabs
  can register their canvas.

### Phase 3 — Remove `appMode`

- Strip `appMode` / `setAppMode` from `creator/useCreatorState.js`.
- Drop the `<- Setup` button from `creator/ActionBar.js` (every Setup
  feature is now reachable from the sidebar).
- Drop the `confirm()` dialog at `creator-main.js:779` — there is
  nothing to confirm.
- Replace the success toast with a quieter version: *"Pattern generated
  — Tools and View are now available."*

### Phase 4 — Polish

- Add a one-time coachmark over the Tools tab on first generation.
- Add an "↺ Re-generate (values changed)" CTA inside Dimensions/Palette
  when the user has edited the pattern, then changed source values.
- Migrate any deep-linked state (`?mode=edit` in URLs) to map to
  `?tab=tools`.

## Risk assessment

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Test suite regression (most tests assert appMode-shaped sidebars) | High | Update tests in same commit as Phase 1; budget ~30 minutes for each phase. |
| User memory of "Edit mode" is disrupted | Medium | Keep the phase label in the action bar (Polish A) for one release as a transitional cue: *"Editing pattern"* is still meaningful. |
| Re-generate from Edit loses pixel-level edits silently | Medium | Phase 4 adds the explicit CTA; the regen action shows a confirm with diff count: *"Re-generating will discard 142 manual edits."* |
| Mobile layout (≤480px) — 7 tabs in the sidebar tab strip | Low | Wrap to two rows on narrow screens; Tools/View stay on row 2 until enabled. Existing CSS already handles wrap. |
| PDF export pipeline regression | None | Export entry points (`creator/pdfExport.js`) are not touched. |
| PK-compatible export | None | No changes to `pdf-export-worker.js` or `creator/pdfChartLayout.js`. |
| Deep links / onboarding flows referencing `appMode` | Low | Grep for `appMode` after Phase 3; replace with `tab` references. |

## Estimated effort (rough complexity, not time)

- Phase 1: small. Bundle rebuild + ~3 test updates.
- Phase 2: medium. Touches `creator-main.js` mount tree.
- Phase 3: small but spreads across `useCreatorState.js`,
  `ActionBar.js`, `creator-main.js`. Tests likely need updates in
  `creatorActionBar.test.js`, `useCreatorState.test.js` (if any).
- Phase 4: small. Toast wording, CSS for the disabled pill, optional
  coachmark.

## Open questions for review

1. Should **Tools** and **View** be a single tab when disabled (a
   merged "Editing tools (locked)" pill) or two separate disabled
   tabs? The mockup shows two — easier to find later — but the strip
   gets crowded on mobile.
2. Should *Project* (save/load) be split off into the action bar as a
   menu, freeing a sidebar slot?
3. Re-generate confirmation copy when manual edits exist — wording
   should be agreed with the writing voice in
   [TERMINOLOGY.md](../TERMINOLOGY.md).
4. Keep the action-bar phase label even in the unified UI? It still
   works as a stage indicator (*"Setting up"* until first generation;
   *"Editing pattern"* after) without `appMode`.

## Next step

If approved, land **Phase 1** alone first (low-risk, reversible) and
gather feedback. Phases 2–4 chain from there.
