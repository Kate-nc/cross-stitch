# Initial PCStitch PAT import

PAT support was absent at implementation time: the registry had OXS, JSON,
image and PDF strategies; the UI explicitly rejected `.pat` as unsupported.
A separate XSD strategy landed on main during implementation and was preserved when rebasing.
This change adds one PAT strategy, with its own layout and a format-neutral bounded
binary reader. It does not reuse OXS palette matching or geometry assumptions.

## Support matrix

| File/version | Initial behaviour |
| --- | --- |
| Plaintext PCStitch 7, `PCStitch 7 Pattern File` at byte 0 | Parse the documented fixed-header / unversioned palette layout. Always show review with limitations. |
| PCStitch 5, 6 | Recognise signatures from KXStitch; reject with version-specific guidance. Their palette and knot layouts differ. |
| PCStitch 8 | Recognise signature documented by stitchcraft; reject. Its postheader, lengths, independently versioned palette (including 8a), and stitch records differ. |
| Other numbered signatures, including 9–11 | Reject; do not assume these use the v7 layout. Signature recognition alone does not establish a supported variant. |
| Protected, encrypted, licensed payloads requiring access mechanisms | No decryption, password processing, access-control changes, recovery or palette scanning. An unsupported/damaged layout is rejected; use an authorised export in the source program. Unknown v7 header options are not interpreted or changed. |
| Other `.pat` formats (GIMP, Photoshop, CAD hatch, etc.) | Extension alone never identifies a PCStitch chart. No PAT strategy without matching content. |

| Content in the v7 layout | Behaviour |
| --- | --- |
| Full cross (type 1) | DMC identifier/brand and RGB retained; column-major source becomes row-major project grid. |
| Three-quarter (types 2–5) | TL/TR/BL/BR variants become exact quadrant sets. |
| Diagonal half (6–7) | TL+BR / TR+BL quadrant pairs. |
| Quarter (9–12) | Exact TL/TR/BL/BR quadrant. |
| Extras | Four stitch records at one-based cell coordinates; same geometry rules. Unrepresentable overlaps reject the import. |
| Backstitch | One-based cells plus 1–9 snap points become exact half-cell endpoints; independent thread reference over empty cells. |
| Empty/sparse, fractional-only, backstitch-only | Valid; empty palette permitted only when no object references it. |
| DMC palette | Exact `DMC` scheme; numeric IDs, White/Blanc, 5200/B5200, Ecru. Aliases normalised, original IDs retained in metadata. No nearest-colour substitution. |
| Other schemes / explicit composite identifiers | Distinct `U<n>` placeholders with source label/RGB; repair in Palette. Preserve the original palette in metadata and original bytes. |
| Blends and custom palette attributes | **Unverified**, not claimed as supported. Public v7 readers leave fields undecoded; a blend may be indistinguishable from a first component's ordinary identifier. Every import explicitly warns to compare every thread. No automatic reconstruction or ratio approximation. |
| French knots | Validate records/references, omit with count; snap semantics not sufficiently verified. |
| Petite, specialty, unknown stitch codes (including 0/8) | Omit with type and count; never turn into a full cross. |
| Unknown header/palette fields, symbols, notes, underlays | Not interpreted; source retained. Overall unsupported-content verification remains limited. |
| Trailing data | Retained in original; warn with byte count that additional objects may be missing. |
| Unequal or absent fabric counts | Single count approximation reported; both source counts retained. |

The canonical project uses `pattern`, `partialStitches` quadrant entries,
`bsLines`, and `settings.sW/sH`. Raw metadata, palette and fabric counts live in
`meta.pcstitch`; audit evidence lives in `importReport.pat`. Shared pipeline code
attaches the original bytes and verification. Review refresh retains PAT
provenance. Supported-grid run totals verify grid coverage, **not** all source
content. Thread fidelity and unsupported content cannot receive full verification.
Palette repair also updates backstitch references and removes placeholder brands.

## Provenance and permissions

Public compatible readers consulted for layout observations:

- [KXStitch Document.cpp at 6833aa17526fe271e2982b3b723fe621caaa2626](https://github.com/KDE/kxstitch/blob/6833aa17526fe271e2982b3b723fe621caaa2626/src/Document.cpp),
  `readPCStitch`, `readPCStitch7File`, `readPCStitchString` and the format comments.
- [KXStitch Stitch.h at the same revision](https://github.com/KDE/kxstitch/blob/6833aa17526fe271e2982b3b723fe621caaa2626/src/Stitch.h),
  independent bit-mask definitions for quadrant semantics (TL=1, TR=2, BL=4, BR=8).
- [stitchcraft patfile.ml at d18be01243c5b929e4267b05f5addaea59e09802](https://github.com/yomimono/stitchcraft/blob/d18be01243c5b929e4267b05f5addaea59e09802/patreader/lib/patfile.ml)
  and [palette.ml](https://github.com/yomimono/stitchcraft/blob/d18be01243c5b929e4267b05f5addaea59e09802/patreader/lib/palette.ml),
  corroborating v7 widths/lengths and showing v8 differs substantially.

This is an independent JavaScript implementation of observed data layout facts;
no upstream implementation source or dependency is bundled. KXStitch's source is
GPL-2.0-or-later; it was consulted as a public reference, not copied or translated.
No proprietary executable, paid chart, account, protected fixture or restriction
bypass was used.

All four committed `.pat` fixtures in `tests/fixtures/pat/` are original synthetic
charts authored for stitchx and redistributable under this repository's ISC
licence. `make-fixture.js` documents their byte construction. No native PCStitch
export with established redistribution permission was available locally. These
are **not** claimed to be vendor-generated compatibility fixtures. Native v7
exports, especially blends and opaque palette attributes, need independent manual
comparison before broadening this initial support. The draft status preserves
that remaining compatibility limitation.

## Bounds and failure behaviour

- 16 MiB maximum input; `.pat` browser Files above that size rejected before read.
- 4,000 per side and 1,000,000 total cells; checked before grid allocation.
- At most 254 palette entries (255 is the empty-record sentinel).
- 250,000 occupied stitch objects including extras; each knot/line/extra section
  also capped at 250,000 and checked against remaining record bytes.
- Strings use checked 16-bit lengths, fixed-size palette entries are 250 bytes,
  and all little-endian reads honour typed-array byte offsets.
- RLE requires strictly positive runs that cannot exceed the remaining grid.
- Thread indices, coordinates, snap points, zero-length lines, empty sentinels and
  overlapping quadrants are checked. Invalid input yields no project.
- Dense allocation occurs after all supported records pass validation. Notes are
  aggregated by type; a hostile input cannot create one warning per object.

## Validation evidence

`tests/import/patImport.test.js` uses manually stated semantic expectations:
non-square 3×2 row-major ID sequence, DMC alias provenance, explicit composite and
non-DMC placeholders, all ten supported fractional codes, multicolour extras,
backstitch endpoints over empty cells, empty/sparse charts, omitted knots/types,
trailing data, fabric approximation, versions 5/6/8–11, unrelated PAT signatures,
every truncated prefix, corrupt lengths/counts/references/dimensions and overlaps.
It exercises the generated browser bundle through the real pipeline, original
attachment, review validation refresh and the pre-read file-size guard.

The separate bug-hunting pass inspected allocations/loops, 1-based indices,
column order, palette mapping and review repairs. It found and fixed line-only
palette omissions and placeholder repair failing to update line references or
clear the placeholder brand. Regression coverage is in `uiReviewModal.test.js`.
A deterministic 5,000-case mutation pass (fast-check, seed 20261018) accepted 2,249
bounded structural variants and rejected 2,751 typed parse/unsupported cases;
accepted geometry and dimensions were checked. All nine snap positions were
checked against a literal coordinate table. Maximum-size empty chart: 1,000,000
cells, about 117 ms and 43 MiB heap in this environment (observations, not a
cross-device performance guarantee). Excess dimensions and occupied-object budgets
reject. No hangs or untyped failures were observed.

Final checks after rebasing onto main `66ba416c3952a171ba78e83a8b4ac9ad0e307fed`:

- `npm test`: 355 suites / 4,856 tests passed; 1 suite / 4 tests skipped;
  1 snapshot passed. Existing tests require subprocess and local-socket access;
  rerunning with those permissions resolved the sandbox-only failures.
- Browser checks with local CDN dependencies: all 3 PAT checks passed on the
  touch-tablet Chromium profile. All 6 PAT + existing XSD checks passed on a
  temporary desktop Chromium configuration. They check confirmation-only saving,
  exact geometry and source-byte retention, untouched existing projects,
  unsupported-version/unrelated-format errors and Tracker cancellation.
- `node build-import-bundle.js`, `node build-runtime-js.js`, `node build-sw.js`
  regenerated committed assets. Runtime and service-worker freshness checks pass.
- Terminology lint and `git diff --check` pass. CSS token lint completes with
  13 pre-existing non-blocking findings in unchanged `styles.css`.
