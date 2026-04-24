# Deferred Item 1 — RGB-stripping from saved cells

## Background

Audit `reports/perf-6-payload-serialization.md` item #2 flagged that
`pat.map(m => ({ id, type, rgb }))` stores the same rgb triple for every
cell that uses a given palette colour. For a 200×200 pattern with a
20-colour palette that is roughly 240 KB of pure duplication on every
autosave, every IndexedDB write, every JSON export, and every hand-off to
the Tracker.

It was deferred because every renderer (`PreviewCanvas`, `RealisticCanvas`,
`PatternCanvas`, `palette-swap`, the PDF worker, `tracker-app`) reads
`cell.rgb` directly. Naively dropping it could turn the canvas grey.

## What the code does today

### Save

Five sites build the snapshot pattern as

```js
pat.map(m => m.id === "__skip__" ? { id: "__skip__" }
                                  : { id: m.id, type: m.type, rgb: m.rgb });
```

- [creator/useProjectIO.js](creator/useProjectIO.js#L61) — JSON download
- [creator/useProjectIO.js](creator/useProjectIO.js#L118) — Open-in-Tracker handoff
- [creator/useProjectIO.js](creator/useProjectIO.js#L598) — autosave
- [tracker-app.js](tracker-app.js#L1549) — handleEditInCreator handoff
- [tracker-app.js](tracker-app.js#L2583) — buildSnapshot autosave
- [tracker-app.js](tracker-app.js#L2728) — JSON export

### Load

`restoreStitch(m)` in [colour-utils.js](colour-utils.js#L337) already
hydrates rgb independently:

- `m.id === "__skip__"` → fixed white rgb
- `m.type === "blend"` → split into base ids, look up both in the DMC
  catalog, average rgb. **Returns nothing if either half is missing
  from the catalog.**
- otherwise → look up `m.id` in the DMC catalog; if found, use catalog
  rgb. If not found, fall back to `m.rgb || [128,128,128]`.

So **load already tolerates a missing rgb for any DMC id, and for blends
where both halves are DMC.** Anchor or custom-id cells still need their
rgb because `restoreStitch` falls back to grey otherwise.

### Renderers

All renderers consume the in-memory `pat`, which is the output of
`restoreStitch` (or the freshly-generated cells from quantization). RGB
is always present in memory. **In-memory shape does not change** — only
the on-disk shape is touched.

## Risks

1. **Stripping a non-DMC id loses the colour permanently** because
   `restoreStitch` cannot reconstruct it. Mitigation: only strip when
   the catalog lookup reproduces the stored rgb byte-for-byte.
2. **Stripping a blend with one anchor half loses the colour.**
   Mitigation: only strip blends when both halves are DMC and the
   averaged rgb matches.
3. **A future palette-swap could drift the in-memory rgb away from the
   catalog value.** Mitigation: rgb-equality check happens at save time,
   so any drift keeps the explicit rgb.
4. **Older versions of the code reading newer files.** Mitigation: the
   load path already handles missing rgb. Any older Tracker/Creator
   reading a stripped DMC cell will get the catalog rgb via
   `restoreStitch`. Backward compatibility is automatic.

## Design

### Helper

`window.PatternIO.stripCellForSave(cell)` in [helpers.js](helpers.js)
returns the storage-ready shape:

- skip/empty → `{ id }`
- solid → `{ id, type }` if catalog lookup matches; else `{ id, type, rgb }`
- blend → `{ id, type }` if both halves DMC and averaged rgb matches;
  else `{ id, type, rgb }`

`window.PatternIO.serializePattern(pat)` maps the helper across the array.

### Feature flag

`window.PERF_FLAGS.stripRgbOnSave` (default **true**). When **false**,
`stripCellForSave` returns the legacy `{ id, type, rgb }` shape so the
old behaviour is byte-identical. Useful as a quick rollback if any
downstream consumer turns out to depend on the rgb field.

### Format compatibility

Round-trip is symmetric: stripped pattern → `restoreStitch` → in-memory
cell with rgb populated from the catalog. No magic-byte header or
version bump required. Both the old and new formats live happily
side-by-side because every save site can choose per-cell whether to
strip.

## Expected gain

For the canonical 200×200 / 20-colour test pattern:

- Current snapshot: 40 000 cells × ~30 bytes JSON each (`{"id":"310","type":"solid","rgb":[0,0,0]}`) ≈ **1.2 MB**
- Stripped snapshot: 40 000 cells × ~22 bytes (`{"id":"310","type":"solid"}`) ≈ **880 KB**
- Saving on autosave / hand-off / JSON export: ≈ **~25–30%**

Indirectly: smaller IndexedDB writes → less main-thread blocking; smaller
localStorage handoff → fewer quota errors; smaller backup payload.

## Implementation summary

Code changes:

- [helpers.js](helpers.js) — added `window.PERF_FLAGS.stripRgbOnSave`
  and `window.PatternIO.{stripCellForSave, serializePattern}`.
- [creator/useProjectIO.js](creator/useProjectIO.js) — three save sites
  use `PatternIO.serializePattern(pat)`.
- [tracker-app.js](tracker-app.js) — three save sites use
  `PatternIO.serializePattern(pat)`.
- [creator/bundle.js](creator/bundle.js) — regenerated.

Tests added (`tests/stripCellForSave.test.js`):

- skip / empty cells stay minimal
- solid DMC cell with matching rgb is stripped
- solid DMC cell with mismatched rgb keeps rgb
- non-DMC custom cell keeps rgb
- blend with both DMC halves and matching average is stripped
- blend with mismatched average keeps rgb
- round-trip through `restoreStitch` reproduces original rgb
- feature flag OFF preserves legacy behaviour byte-for-byte

## Validation

- Full Jest suite (60 suites / 660 tests) passes both with the flag on
  and off.
- Round-trip integrity verified for solid DMC, blend DMC, anchor,
  and custom-id cells.
- **Measured benchmark** (200×200 / 20-colour pattern, JSON.stringify
  the snapshot, 10× repeat, Node 22):

  | Path     | Time   | Bytes     |
  |----------|--------|-----------|
  | legacy   | 71.9ms | 1 878 001 |
  | stripped | 52.3ms | 1 096 001 |
  | Δ        | −27%   | **−41.6%** |

## Caveats / follow-ups

- The flag stays in place. A later cleanup pass can remove the
  `{ id, type, rgb }` branch once the new format has been in
  production for a release.
- Only the DMC catalog is consulted for stripping. If the project
  later treats anchor as a first-class catalog at load time, the
  helper can be widened symmetrically.
