# Visual Conflict Diff in SyncReviewGate — Implementation Proposal

> Tier-2/3 sync feature proposal. Companions:
> [encrypted-csync-payload.md](encrypted-csync-payload.md) and
> [cross-device-handshake.md](cross-device-handshake.md).

## Proposed Approach

For chart and stitch conflicts (the only types where pattern
differences matter), render three compact thumbnails inside
[`SrgConflictCard`](../../../modals.js): **Local | Diff Overlay |
Remote**. Compute per-cell deltas by comparing `pattern` and `done`
arrays in O(n), memoise as canvas `ImageData` to avoid recomputation,
and render to canvas at a target 240×240 px max with per-pixel
sampling (one canvas pixel = 1–4 pattern cells). For
stash / meta / pref conflicts, skip canvas and use a structured text
diff. An expand / collapse toggle prevents the visual diff from
dominating single-cell-difference conflicts. On mobile (<400 px),
stack thumbnails vertically and shrink to 120×120 px. A text fallback
(*"3 cells differ: 1 added in remote, 1 changed colour"*) is always
present above the canvas row.

## Diff Algorithm

```
computePatternDiff(localProject, remoteProject, conflictType):
  let localPattern  = localProject.pattern || []
  let localDone     = localProject.done    || []
  let remotePattern = remoteProject.pattern || []
  let remoteDone    = remoteProject.done    || []
  let patLen = max(localPattern.length, remotePattern.length)

  diffCells  = new Array(patLen)
  deltaStats = { patternDiffs:0, stitchDiffs:0,
                 addedInRemote:0, removedInRemote:0,
                 colorChanged:0 }

  for i in [0..patLen):
    localCell  = localPattern[i]  || { id: "__empty__" }
    remoteCell = remotePattern[i] || { id: "__empty__" }

    if conflictType == "chart":
      if localCell.id  != remoteCell.id  ||
         localCell.type != remoteCell.type:
        deltaStats.patternDiffs++
        if remoteCell.id != "__empty__" && localCell.id  == "__empty__":
          deltaStats.addedInRemote++;   diffCells[i] = "added"
        else if localCell.id != "__empty__" && remoteCell.id == "__empty__":
          deltaStats.removedInRemote++; diffCells[i] = "removed"
        else:
          deltaStats.colorChanged++;    diffCells[i] = "changed"

    else if conflictType == "stitch":
      let localStitched  = (localDone[i]  === 1) ? 1 : 0
      let remoteStitched = (remoteDone[i] === 1) ? 1 : 0
      if localStitched != remoteStitched:
        deltaStats.stitchDiffs++
        diffCells[i] = localStitched ? "stitched_local_only"
                                     : "stitched_remote_only"

  return { diffCells, deltaStats, totalCells: patLen }
```

**Complexity**: O(n) per conflict, where n = w × h (max ~40k for
200×200). Memoised via `React.useMemo` keyed by
`[entry.local.id, entry.remote.data.id, conflictType]`.

## Visual Design

Three thumbnails side-by-side on desktop, stacked on mobile.

- **Local thumbnail** — pattern cells at current colour, opacity 1.0.
- **Diff thumbnail** — overlay layer:
  - Green (`--success`): cell added in remote
  - Red (`--danger`): cell removed in remote
  - Yellow (`#f39c12`): colour changed
  - Orange (`#d68910`): stitched locally only
  - Blue (`#3498db`): stitched remotely only
  - Grey 20 % opacity base for unchanged cells
- **Remote thumbnail** — pattern cells at current colour, opacity 1.0.

A small legend sits above the row, using both colour and label so
colour alone is never the only carrier of information. On mobile the
legend wraps into a 2-column grid.

## Performance Budget

- **Target**: <50 ms to compute diff + render both canvases for a
  200×200 pattern.
- **Technique**: native `createImageData` + `putImageData` (skip the
  DOM); 1 pattern cell ≈ 1–4 canvas pixels via nearest sampling;
  `requestIdleCallback` for diffs over 150k cells; cache diff
  computation and canvas data URLs in component state via `useMemo`;
  lazy-render only on expand and discard on collapse.

## Component Structure

New React component in [modals.js](../../../modals.js):

```javascript
function SrgConflictDiffViewer({ conflict, localProject, remoteProject,
                                 expanded, onToggle }) {
  // Memoised diff + canvas rendering.
  // Returns expanded row with 3 thumbnails + legend,
  // or collapsed "N cells differ" badge.
}
```

Modify `SrgConflictCard`:

1. Insert `SrgConflictDiffViewer` above the existing sides
   `ValueBlock` row for chart / stitch conflicts only.
2. Add a toggle button when `deltaStats.totalDiffs > 0`.
3. Collapsed badge shows the count (`"1 cell differs"`).
4. Pass `conflict.entry.local`, `conflict.entry.remote.data`,
   `conflict.type` to the viewer.

CSS additions in [styles.css](../../../styles.css):

```css
.srg-diff-viewer { margin-bottom: 10px; }
.srg-diff-toggle {
  background: none; border: none;
  color: var(--text-secondary);
  font-size: 12px; font-weight: 500; cursor: pointer; padding: 0;
}
.srg-diff-thumbnails {
  display: flex; gap: 8px;
  justify-content: space-around; margin-top: 8px;
}
.srg-thumbnail {
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface-secondary);
}
.srg-diff-legend {
  font-size: 11px; color: var(--text-secondary);
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 4px;
}
.srg-legend-item   { display: flex; align-items: center; gap: 4px; }
.srg-legend-swatch { width: 10px; height: 10px;
                     border-radius: 2px; flex-shrink: 0; }

@media (max-width: 400px) {
  .srg-diff-thumbnails { flex-direction: column; align-items: center; }
  .srg-thumbnail       { width: 120px; height: 120px; }
  .srg-diff-legend     { grid-template-columns: 1fr 1fr; }
}
```

## Per-Conflict-Type Matrix

| Conflict type | Visual treatment | Text fallback |
|---|---|---|
| `stitch` | Canvas: 3 thumbnails, orange/blue overlay | "N cells in disagreement (M stitched locally only, K remotely)" |
| `chart`  | Canvas: 3 thumbnails, green/red/yellow overlay | "N cells differ: M added, K removed, P colour changed" |
| `stash`  | Text only (numeric inventory) | "Owned: X → Y" |
| `meta`   | Text only (name / state strings) | Field name + side-by-side values |
| `pref`   | Text only (preference values) | Key label + side-by-side values |

## Accessibility

- Text fallback always renders above the thumbnails so screen readers
  hear the delta summary first.
- `aria-label` on canvas: *"Visual diff: N cells differ. Local | Diff |
  Remote"*.
- Legend pairs colour with label; colour is never the sole carrier.
- Toggle button uses `aria-expanded` and `aria-controls` pointing at
  the diff section id.
- Existing modal `aria-modal` / `labelledBy` semantics unchanged.

## Effort Estimate

| Task                                              | Person-days |
|---------------------------------------------------|-------------|
| Diff computation logic                            | 0.5         |
| Canvas rendering + memoisation                    | 1.0         |
| `SrgConflictCard` integration                     | 0.5         |
| CSS + responsive layout                           | 0.5         |
| Tests (unit + visual regression)                  | 1.0         |
| **Total**                                         | **3.5 pd**  |

## Open Questions

1. **Cell-to-pixel sampling** — nearest-neighbour vs. round-up to
   power-of-2 + downscale?
2. **Blend stitches** — should `id: "310+550"` blends be visually
   distinct from solids in the diff overlay?
3. **Half-stitches** — diff `halfStitches` / `halfDone` separately,
   or fold into the full-stitch diff?
4. **Tiny diffs** — for 1–2 differing cells in a 40k array, is a full
   canvas render justified? Maybe a "show locations" mini-summary
   instead?
5. **Snapshot baseline** — render a fourth thumbnail showing the
   common ancestor when available, or stick to 3-way?

## Recommendation

The expandable container keeps the modal calm for trivial conflicts
while giving users immediate visual perception of conflict scope when
it matters. Build for chart + stitch types in Phase 1; defer blend
and half-stitch nuance to a follow-up.
