# Branch Scope

- **Branch**: `double-checking`
- **HEAD**: `f36436ab9b68056f3daa1b85784da963360caf3d` ("Fixes for difficulty")
- **Target branch**: `main`
- **Merge base**: `ca4519f21ff52a0306f8ebcd9f06470360013af0`
- **Total commits on branch**: 18
- **Time period**: This branch is large — both a UI/feature delta and a stats data-correctness sweep, plus a difficulty-metric initiative (with extensive proposal/report markdown).

## Commit list (newest → oldest, as `git log` reports them)

| # | Hash | Message |
|---|------|---------|
| 1 | `f36436a` | Fixes for difficulty |
| 2 | `dde642f` | Difficulty metrics |
| 3 | `7e34511` | feat(tracker): live stash deduction (Proposal D) - inline skein meter per thread row |
| 4 | `5b2ebff` | fix(stats): split blend ids in neverUsedData, useWhatYouHave, lowStockNeeded |
| 5 | `e54d5c1` | fix(stats): Option A - split blend threads into components everywhere |
| 6 | `ee6bf97` | fix(stats): buildStatsSummary now derives palette from pattern cells for Creator projects |
| 7 | `e9342bb` | fix(stats): colour swatches show grey instead of actual colour |
| 8 | `be2e2b6` | fix(stats): fall back to statsSessions in stitchLog readers |
| 9 | `7575577` | fix(stats): repair SABLE and stash-age tracking for manager thread changes |
| 10 | `0f528c9` | fix stitch tracker |
| 11 | `d5cf109` | fix canvas colour |
| 12 | `bcca388` | Restore original colours |
| 13 | `255142d` | feat(creator): direct colour swap via context menu, palette chip, and Replace tool |
| 14 | `9d3bab5` | Fix colour removal |
| 15 | `fa3c594` | fix(creator): remove-unused colours now works in generated-pattern edit mode |
| 16 | `3044d38` | Project stats visibility fixes |
| 17 | `410da6f` | Add a sort option for the stash |
| 18 | `3c41d15` | feat(creator): remove unused colours from palette in edit mode |

## File change summary (vs merge base)

Total: **63 files changed, +19,170 / −201**.

The diff is dominated by markdown reports and HTML proposals (~14k lines):

- `reports/difficulty/00_–08_*.md` — 7,237 lines of difficulty research
- `reports/help-audit-{1..8}.md` — 3,460 lines of help-system audit
- `proposals/difficulty/*.html` (5 files) — 2,132 lines of design comps
- `proposals/proposal-{a..e}*.html` (5 files) — 2,514 lines
- `proposals/realtime-deduction-*.html` (4 files) — 2,064 lines
- `proposals/RANKING.md`, `proposals/difficulty/RANKING.md`, `proposals/realtime-deduction-RANKING.md`, `reports/realtime-deduction-spec.md` — 911 lines

These markdown/HTML files do not ship to users (they live under `reports/` and `proposals/`); they are excluded from functional verification.

### Code files actually shipped (sorted by size of change)

| File | +/− | Notes |
|---|---|---|
| `creator/bundle.js` | +519 | Generated artifact — concatenation of `creator/*.js` |
| `tracker-app.js` | +524 | Live stash deduction UI + RT modals (Proposal D) |
| `styles.css` | +228 | Difficulty styling, RT meter, misc visibility |
| `creator/ColourReplaceModal.js` | +112 (new) | Direct colour-swap modal |
| `project-storage.js` | +94 | Stats read fixes (palette derivation, statsSessions fallback, blend split) |
| `manager-app.js` | +76 | Stash sort + V3 acquisition fields on edit + blend split |
| `creator/PatternInfoPopover.js` | +86 | Difficulty surface area |
| `palette-swap.js` | +62 | "Restore original colours" support |
| `helpers.js` | +58 | Difficulty calc helpers |
| `creator/useEditHistory.js` | +47 (new branch) | `remove_unused_colours` undo/redo |
| `creator/ActionBar.js` | +39 | Difficulty + replace tool surface |
| `creator/Sidebar.js` | +36 | Per-chip × button + Remove unused button |
| `creator/PreviewCanvas.js` | +35 (net 0) | Canvas colour fix |
| `creator/useMagicWand.js` | +35 | (Note: included in fa3c594 despite that commit's message being about "remove-unused" only — see classification report) |
| `creator/useCanvasInteraction.js` | +33 | rebuildPreservingZeros + colour removal |
| `stats-page.js` | +75 | Project stats visibility + blend split |
| `threadCalc.js` | +34 | `threadCostPerStitch` for RT deduction |
| `creator/useCreatorState.js` | +74 | removeUnusedColours, restoreOriginal, applyGlobalColorReplacement |
| `stash-bridge.js` | +24 | statsSessions fallback + dispatch on V3 migration |
| `creator/ContextMenu.js` | +5 | "Replace this colour…" item |
| `creator/ToolStrip.js` | +14 | Replace tool button |
| `creator-main.js` | +15 | Wire palette-swap restore + replace tool + removeUnused |
| `home-screen.js` | +12 | Difficulty rendering on home |
| `index.html` | +6 (mostly bundle version bump) | Cache-bust for `bundle.js` |
| `icons.js` | +9 | `colourSwap` icon (24×24 stroke) |
| `build-creator-bundle.js` | +1 | Add `ColourReplaceModal.js` to concat order |
| `tests/__snapshots__/icons.test.js.snap` | +1 | `colourSwap` snapshot |
| `tests/creatorActionBar.test.js` | +5 / −2 | Test adjustment |
