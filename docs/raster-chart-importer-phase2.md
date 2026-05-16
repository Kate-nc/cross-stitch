# Raster Cross-Stitch Chart Importer — Phase 2 Plan

> Phase 1 shipped a complete end-to-end pipeline for **monochrome /
> glyph-based** printed charts: perspective correction, projection-profile
> grid detection, HOG + dHash clustering with DBSCAN, Tesseract.js legend
> OCR with confusion-aware DMC code repair, a five-surface correction UI,
> a dedicated Web Worker, and **local-only opt-out telemetry** that
> captures the data Phase 2 will use to validate (or revise) every
> decision below.
>
> Phase 2 takes the same pipeline to **colour** charts (printed colour
> blocks, screenshots from PK / WCS, mixed colour/symbol charts) and to
> **multi-page** PDFs that need stitching together. The architecture and
> Web Worker stay the same; only the colour-handling, OCR strategy,
> on-disk representation, and multi-page UI change.

## Guiding principle: data-gated defaults

Each decision below ships with **a default we believe in** plus **the
exact telemetry signal that would change the call later**. Phase 1's
`importerTelemetry` object store is the source of truth for those
signals — the data lives entirely in `CrossStitchDB`, never leaves the
device, and the user can opt out in Settings → Experimental.

Boring, debuggable defaults ship now. Aggressive answers (HDBSCAN,
algorithmic distortion correction, auto-page-ordering) wait until the
data justifies them.

## 1. Lab colour space conversion in the worker

**Default:** CIE Lab via D50 illuminant, pure-JS implementation
imported into the worker through `importScripts('../colour-utils.js')`.

The Web Worker already imports OpenCV (which uses **D65**); the rest of
the app uses our `colour-utils.js` helpers (which use **D50**). To keep
cluster centroids consistent with the downstream DMC lookup, the
clustering path must use the same illuminant as the lookup. Default to
**app-side D50** for both.

If a microbenchmark on a representative 30 s pipeline shows the JS Lab
conversion exceeds **500 ms** (≈1.5 % of total budget), fall back to a
**hybrid path**: OpenCV's D65 for in-worker clustering, app-side D50 for
the final DMC nearest-neighbour search. The D50/D65 mismatch will be
documented in code comments at the conversion boundary.

| Signal in `importerTelemetry` | Trigger |
| --- | --- |
| `timings.cluster` median > 500 ms on screenshots | Adopt hybrid path |
| Match accuracy regressions on Phase 2 fixtures | Revert to pure D50 |

## 2. Clustering algorithm: DBSCAN with weighted Lab

**Default:** Keep DBSCAN. Z-score each dimension of the feature vector
(HOG + dHash + Lab) **independently**, then multiply the three Lab
columns by a configurable weight in **`[0.5, 0.7]`** with **0.6** as the
shipped default.

Z-scoring solves the unit-scale problem (HOG is ~[-3, 3] gradients,
Lab L is [0, 100], a, b are [-128, 127]). The Lab weight reflects the
practical observation that colour disagreement matters more than glyph
disagreement for colour charts: a red square and a blue square share an
identical shape and must not collide.

Stay on DBSCAN unless the **median silhouette score across captured
imports drops below 0.4**, at which point prototype HDBSCAN.

| Signal in `importerTelemetry` | Trigger |
| --- | --- |
| `confidence.cluster.meanSilhouette` median < 0.4 | Prototype HDBSCAN behind a feature flag |
| `confidence.cluster.noiseCount` / `clusterCount` ratio > 0.1 | Re-tune ε / minPts before swapping algorithms |

## 3. Legend OCR: anchor-first design

**Default:** Anchor-first legend parsing for **both** colour and B&W,
backported into Phase 1.

For each legend row, pick the **anchor** = either the saturated colour
swatch (Phase 2) or the leftmost high-contrast glyph (Phase 1).
Determine reading direction from the geometry of the first 2–3 rows
(anchor-on-left → OCR-to-the-right; anchor-on-right → OCR-to-the-left;
anchor-above → OCR-below). Run Tesseract only on the OCR region
opposite the anchor.

This eliminates the failure mode where Tesseract reads the swatch as a
nonsense glyph, halves the OCR region, and unifies the colour and B&W
code paths. The Phase 1 monochrome parser will be updated to use the
same primitive (glyph cell as anchor).

| Signal in `importerTelemetry` | Trigger |
| --- | --- |
| `confidence.legend.meanWordConfidence` > 0.95 across 50+ imports | Anchor-first is overkill; refactor cosmetically only |
| `corrections.surface == 'legend-manual-map'` frequency > 20 % | Anchor detection itself is wrong — revisit direction heuristic |

## 4. Barrel distortion: detect-and-prompt only

**Default:** Detect, surface the warning, do not correct algorithmically.

Compare the cell-pitch ratio across the **left / middle / right thirds**
of the detected grid. If the ratio between any two thirds exceeds
**1.15**, the chart is likely a phone photo of a curved book page; show
a modal:

> "This chart appears to be distorted. For best results, please use the
> four-corner tool to mark the chart edges, or retake the photo with the
> book pressed flat."

Algorithmic correction (cylindrical unwrapping, polynomial dewarping)
is deferred to Phase 3+ unless telemetry shows the detection rate is
high enough to justify the engineering cost.

| Signal in `importerTelemetry` | Trigger |
| --- | --- |
| Distortion-detected rate > 10 % of all imports | Escalate to Phase 3 algorithmic correction |
| `corrections.surface == 'manual-4-corner'` rate > 30 % | Same — manual correction is the workaround |

## 5. `cellColors` storage: Uint8Array in IDB, gzip at export

**Default:** Store the per-cell colour array as a flat `Uint8Array`
(length `cols × rows × 3` for RGB, or `× 4` if we keep alpha) in
IndexedDB **uncompressed**. Gzip only when serialising to JSON for
export, using the existing `pako` global.

Three rules:

1. **Representation beats compression.** A typed array round-trips
   structuredClone-fast, indexes in O(1), and the browser already
   compresses IDB blocks on disk.
2. **Don't gzip in IDB.** Gzipped blobs make in-place edits expensive
   (decompress → mutate → recompress), defeat structured-clone diffing,
   and break Devtools inspection.
3. **`.oxs.gz` convention at the export boundary.** OXS / JSON exports
   that include `cellColors` use the existing `pako.gzip()` call to
   produce a `.oxs.gz` or `.json.gz` artifact; the importer transparently
   ungzips on the way back in.

| Signal in `importerTelemetry` | Trigger |
| --- | --- |
| IDB write durations > 200 ms on representative charts | Reconsider — but first try shrinking schema (drop alpha) |
| Disk-quota warnings in real-world usage | Same |

## 6. Multi-page UI: manual reorder + opt-in auto-suggest

**Default:** Single drop zone, manually drag-to-reorder thumbnails.
Provide a **"Detect order from page numbers"** button that the user
must click to opt in to OCR-based reordering.

The auto-detect runs Tesseract on the **bottom 10 % footer band** of
each page, matches with the regex
`\d+\s*of\s*\d+|Page\s*\d+/\d+|\d+/\d+|\d+`, validates that the
extracted numbers form a contiguous sequence, and proposes a reorder
the user can accept or reject. A live "composition preview" stitching
the pages into a single chart in the manual order is a **stretch
goal**.

Each multi-page session emits its own telemetry event
(`corrections.surface == 'multi-page-reorder'` and
`'multi-page-auto-detect-{accepted|rejected}'`).

| Signal in `importerTelemetry` | Trigger |
| --- | --- |
| Multi-page imports < 5 % of all imports | Remove auto-suggest, keep manual only |
| Auto-detect rejection rate > 50 % | Drop auto-suggest; the heuristic is annoying users |
| Multi-page imports > 25 % of all imports | Promote auto-detect to default-on |

## Summary

| Question | Phase 2 default | Telemetry signal that would change the call |
| --- | --- | --- |
| Clustering algorithm | DBSCAN with z-score + 0.6 Lab weight | Median silhouette score < 0.4 → prototype HDBSCAN |
| Legend OCR design | Anchor-first | Legend OCR > 95 % already → cosmetic refactor only |
| Barrel correction | Detect-and-prompt | Distortion-detected rate > 10 % → escalate to Phase 3 algorithmic fix |
| Multi-page auto-detect | Build as opt-in suggestion | Multi-page imports < 5 % of all imports → remove auto-suggest, keep manual |
| Lab conversion | D50 in worker via `importScripts` | Pure-JS conversion > 500 ms on a 30 s pipeline → hybrid path (OpenCV D65 for clustering, app D50 for lookup) |
| `cellColors` storage | `Uint8Array` in IDB, gzip only at export | IDB write durations > 200 ms or quota warnings → schema tweak first, gzip last |

## Self-verification checklist (Phase 1 → Phase 2 PR readiness)

- [ ] Telemetry being captured for **all six event categories**
      (timings, confidence, corrections, acceptance, input
      characteristics, fingerprint); opt-out implemented in
      `user-prefs.js` and **surfaced in Settings**; debug UI
      accessible via `Ctrl+Shift+I` on the Pattern Creator.
- [ ] All telemetry stays local — **no network requests** by the
      telemetry subsystem (covered by the no-network audit in
      `tests/rasterChart-telemetry.test.js`).
- [ ] `cellColors` stored as `Uint8Array` in IndexedDB, gzipped only at
      export.
- [ ] Legend parser **anchor-first for both B&W and colour** (Phase 1
      backport completed).
- [ ] Barrel-distortion detection **prompts the user** rather than
      attempting algorithmic correction.
- [ ] Multi-page UI shows **manual reorder by default** with
      auto-suggest as an explicit user action.
- [ ] Lab conversion benchmark **run and result documented** (or
      hybrid path with threshold trigger recorded in the PR description).

## A final note on data-driven design

The right answer is rarely the impressive answer. HDBSCAN is more
fashionable than DBSCAN; algorithmic dewarping is more impressive than
"please use the corner tool"; auto-detected multi-page ordering is more
delightful than manual drag-and-drop. We are deliberately shipping the
boring defaults because the telemetry from Phase 1 will tell us, with
real numbers, whether the aggressive answer is worth its engineering
cost. Until those numbers exist, the boring default wins.
