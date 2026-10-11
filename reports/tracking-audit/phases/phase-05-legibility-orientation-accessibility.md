# Phase 5: Legibility, orientation and accessibility

> **Agent prompt.** You are making the chart in the `kate-nc/cross-stitch` tracker readable at every
> zoom: done versus not-done unmistakable without relying on colour, a useful overview when zoomed
> out, orientation in large patterns, a true "Fit", and full keyboard and screen-reader parity.
> Read [phase-00-working-agreement.md](phase-00-working-agreement.md) in full first, then the findings
> below in [reports/tracking-audit.md](../../tracking-audit.md) and
> `reports/track-view-performance-plan.md` (rendering constraints). Phases 1 to 4 must be merged into
> `main`; confirm. Do not start Phase 6 until told.

## Goal

A stitcher can look at the screen and tell what is done and what remains at any zoom, find where they
are in a 300x300 piece, and operate the whole tracker without a pointer or with assistive technology.
Rendering stays as fast as today.

## Findings in scope

TRACK-09, TRACK-10, COMMON-02 (and the Fit bug if not already fixed in Phase 2).

## Evidence to reproduce first

- TRACK-09: Symbol view at 19 px cells: done is a faint green wash behind the same black symbol; at
  300x300 "Fit" (3 px cells) the chart is a blank grid ("To see symbols, you may need to zoom in"), done
  stitches are a thin line; scroll height 933 in a 600 box (`harness/p1.js`, screenshots
  `track-small-rect-desktop.png`, `track-large-fit-desktop.png`).
- TRACK-10: no keyboard marking; arrow keys mean colour cycling, row stepping or guide movement depending
  on mode (`tracker-app.js` `trackerShortcuts`, `handleStitchKeyDown`).
- COMMON-02: done state is colour-only; unverified items: focus visibility, banner contrast, 200% text,
  screen-reader walkthrough. **Do these audits first and record results** before fixing.

## Recommended solution (chosen options)

### TRACK-09

1. **Non-colour done cue (selectable in View):** options "Fill with thread colour, dim symbol" and
   "Corner tick", default **fill with thread colour** (Pattern Keeper-style: finished stitches turn to
   colour). Both distinguishable in greyscale. Implement in `drawStitch`/`drawStitchTier` paths and
   `repaintChartCells`/`paintDoneChanges` so single-cell repaint stays partial.
2. **Low-zoom colour:** below the symbol tier draw each cell as a solid pixel: done in the thread
   colour, not-done desaturated and lightened. Use the existing detail tiers (`computeDetailTier`,
   `lockDetailLevel`). No per-cell DOM; canvas only.
3. **Minimap:** a corner overview built once per pattern into an offscreen canvas of at most about 200x200
   (one pixel per cell or block average), redrawn incrementally for changed cells (`paintDoneChanges`
   delta), with the viewport rectangle; tap or drag to jump. It is toggleable, remembers its state, and
   is hidden on phones in Focus mode unless opened. Build it in idle time; never per mark over the whole
   pattern.
4. **True Fit:** contained on both axes (if not already done in Phase 2).
5. Orientation aids: keep grid numbers; add 10-stitch emphasis in the sticky rulers (already partly
   there), centre lines and optional page/section boundaries if imported pages are known (inferred; only
   if the data exists).

### TRACK-10: keyboard and screen reader

- In Navigate mode (or whenever the chart has focus): Enter or Space toggles the stitch at the guide;
  Shift+Enter fills the rectangle from the previous guide; arrows move the guide; `[` `]` cycle colours;
  row mode keeps Up/Down only when active. Resolve the arrow-key overload explicitly and document it.
  Update `trackerShortcuts`, `help-drawer.js` and run `tests/helpDrawerShortcutsSync.test.js`.
- The live region announces row, column, thread name and done state after each move and mark.
- Ensure every control has an accessible name, roles, `aria-pressed` states, logical tab order, a visible
  focus ring using tokens, and Esc behaves predictably.

### COMMON-02

Fix what the audit pass finds. At minimum: banners at least 4.5:1 contrast; focus visible everywhere; the
tracker and both Stats pages free of axe "serious" and "critical" violations; usable at 200% browser zoom
and with large text; no information carried by colour alone (done state, highlighted colour, chart series,
milestone achieved vs upcoming).

## Files likely to change

`tracker-app.js` (chart drawing, shortcuts, key handling), `useCanvasOverlays.js`, possibly a new lazily
loaded `tracker-minimap.js` (add to `sw.js` precache and the `stitch.html` loader), `styles.css`,
`icons.js`, `help-drawer.js`, `version.js`, `user-prefs.js`, `preferences-modal.js`, tests including
`tests/chartPartialRepaint.test.js`, `tests/largeChartCanvas.test.js`, `tests/perf/`.

## Acceptance criteria

- A screenshot with 20% of stitches marked is distinguishable when converted to greyscale at 3 px, 8 px
  and 19 px cells (automated: sample pixel luminance difference between a done and a not-done region above
  a stated threshold).
- At 300x300 "Fit" shows the whole pattern in colour with done areas visibly brighter; the minimap viewport
  rectangle follows scrolling and tapping it jumps there.
- The whole pattern fits on both axes at Fit for square, wide and tall fixtures.
- A keyboard-only user can move the guide, mark, unmark, undo, cycle colours, open the legend and change
  mode without a pointer; announcements read row, column, thread and state (verify with a screen reader
  if available, else assert the live-region text; mark manual screen-reader checks unverified if not run).
- axe-core reports no serious or critical violations on `stitch.html` and the Stats pages; contrast 4.5:1 on
  banners; usable at 200% zoom.

## Performance guard

This phase touches the hot drawing path. Required before merging each batch: baseline vs after for
full chart paint time, partial repaint for a single mark, drag-mark of 60 cells, pan/zoom frame time on
the 300x300 fixture, and memory (the minimap offscreen canvas is bounded and freed on project change).
Keep the existing canvas size cap and tile logic (`chartTileFor`, `maxChartCellSize`). Any regression
over 5% in these is a failed batch.

## Data and migration statement (include in the PR)

Only view preferences (`UserPrefs` or per-project view keys); no change to project data. No migration.

## Suggested batches

1. Done-state style and low-zoom colour rendering (TRACK-09 core) with perf numbers.
2. Minimap and true Fit.
3. Keyboard parity and live-region announcements (TRACK-10).
4. Accessibility audit fixes (COMMON-02).

## Phase bug-hunt additions

Visual regression screenshots for symbol, colour, highlight and realistic views at all zoom tiers, light
and dark theme; verify PDF export is untouched (do not modify the PK-compat files); stress with the
300x300 fixture and a 500x500 pattern for the minimap memory and time; check highlight styles, counting aids,
spotlight, work areas, parking markers and half stitches/knots still draw correctly with the new done
style; test with `prefers-reduced-motion` and high-contrast mode.
