# Pattern Maker XSD import

The `.xsd` extension identifies several possible formats, not a support guarantee.
This reader recognises **Pattern Maker for Cross Stitch binary XSD**, not W3C XML
Schema. There was no XSD parser in stitchx at the starting revision
`55aab33d`; the picker explicitly rejected the extension. PAT is unchanged.

## Initial support matrix

| Source/content | Behaviour |
| --- | --- |
| Binary signature `10 05`, producer version **4.8.4.12**, palette family bytes `00 16` | Supported layout, subject to the limits below. The version is read in the producer's component order, not inferred from the extension. |
| Other producer versions, signatures, palette families, protected or unknown variants | Fail explicitly; no fallback to OXS, JSON or image conversion. No claim that other v4 builds share this layout. |
| Full crosses | Preserve physical palette index and row-major chart coordinates. Display palette order does not redirect stitch references. |
| Half crosses, quarters and petite crosses | Decode known small-cell flags, including the bit-6 small-cell marker validated by the sectional fixture. Halves/quarters use canonical quadrant maps; petites use independent half-cell geometry and deterministic IDs. Unknown flag combinations omit the entire affected cell and report its count, without guessing its contents. |
| Three-quarter crosses | No invented type conversion. Known constituent half/quarter objects are retained where their quadrants do not conflict. A conflicting object is omitted and counted. |
| DMC and Anchor solids | Preserve known catalogue identifiers and explicit source RGB. No nearest-colour or cross-brand substitution. Other brands/unknown numbers omit affected stitch objects with palette entry and object count. Raw palette identities remain in `meta.xsdPalette` and the original source attachment. |
| Blends | Exactly two distinct known threads of the same brand with equal positive strand proportions. Preserve component identities, brand and explicit RGB. Mixed-brand, unequal, three/four-component or unresolved blends omit affected objects with counts. A blend is never flattened to a solid. |
| Backstitch | Preserve both half-cell endpoints and explicit thread identity, including lines over empty grid cells. |
| Straight stitches | Independent canonical `long_stitch` geometry and deterministic IDs; never relabelled as backstitch. |
| French knots | Preserve corner/centre position and thread. Edge-midpoint positions and duplicate positions cannot be represented by the knot model; omit and count each reason separately. |
| Beads | Preserve independent IDs, material label (source numeric brand and number), explicit RGB and half-cell positions, including edge midpoints. Source size and rotation have no canonical rendering equivalent; each affected bead is reported. No bead is converted to a thread stitch. |
| Curves and special motifs | Omit and count each curve, special motif instance and model definition. Read and bound their variable-length structures; never seek past an unknown record kind. An unknown joint/model signature fails the whole import. |
| Rectangular fabric counts | Keep dimensions exactly; canonical fabric count uses horizontal count. Report both source counts and this approximation when they differ. |
| Titles/author/copyright/notes/fabric | Retained in project metadata. UTF-8 first, Windows-1251 fallback as used by the compatible reader. Other legacy encodings are not established. |
| Display symbols/fonts, print settings, per-type strand settings, library/machine settings, undocumented header and trailing data | No full-fidelity claim. Original bytes are retained. Trailing-byte count is reported; symbol fonts, print and strand settings are explicitly not imported. |
| A chart with no retained supported stitch objects | Fail with reasons; never offer an empty successful chart. |

A successful XSD result is **usable with limitations**, never “fully verified”.
The import-verification system separately records dimensions, full-cell retention,
palette resolution, stitch-object retention, unknown fractional cells and
unsupported content. Structural counts are checked but do not establish
independent per-thread totals. Coverage is unknown when the source denominator
is unknown. Original bytes are attached by the existing pipeline, and publication
uses the existing review/confirmation workflow on Home, Creator and Tracker.

## Bounds and malformed input

Maximum input: **16 MiB**, **250,000 grid cells**, **240 palette entries**,
**240 special models** and **1,000,000 decoded stitch/model objects**. Small-buffer
count cannot exceed grid area. Every seek/read checks the remaining byte length;
all count-driven payloads check multiplication and bounds before access. Grid
allocation follows dimension validation. Encoded block sizes are nonzero and
bounded; RLE requires a value after a marker, a positive repetition count and an
expansion that fits the remaining grid exactly. Truncated/overlong expansions,
out-of-range palette/buffer/model indices, off-chart coordinates, zero-length
lines and unknown structural tags fail with a byte offset. High-level XSD File
size checks happen before the complete `arrayBuffer()` read, including a two-byte
header probe for renamed oversized Files, and the parser repeats the input bound
for low-level probes. A successful limited import cannot hide structural errors.

## Provenance and licensing

The layout reference is the MIT-licensed
[Pattern Maker resource specification](https://github.com/embroidery-space/xsp-specs/tree/7e3efc4efe02ae0745aff7f8f82442c1ff58bbcc/pmaker),
including `patterns/xsd.hexpat` (Nazar Antoniuk, 2024–2026). It documents the
binary header, palette and fixed settings. The specification itself is incomplete
about stitch encoding and joints.

The compatible implementation and independent expected sectional outputs are
[Embroiderly's XSD reader and tests](https://github.com/embroidery-space/embroiderly/tree/d60bde37fb670e0f7f96653308a28a84d640716c/crates/embroiderly-parsers/src/pmaker).
Its source is GPL-3.0-or-later. It was inspected as an interoperability reference;
no Rust source, third-party parser dependency, thread-brand table or expressive
test source is copied into the shipped application. This is a separately written
bounded JavaScript reader using format facts and stitchx's existing model. The
repository's licensing is unchanged. Committed fixture generation contains only
original tiny charts and malformed variations, not third-party designs.

The compatible reader's ordinary stitch serialization uses XOR/rotation with
seeds stored in the same file, followed by RLE. This implementation handles that
serialization only. It accepts no password, extracts no application secret, cracks
no key, and does not alter or bypass a licence check or access restriction. Unknown
or protected variants are outside the support matrix. No Pattern Maker binary or
unlicensed software was downloaded or executed.

Read-only local verification used public upstream test fixtures at the pinned
commit above. Charts are **not redistributed** here: the upstream demo notices
reserve their authors' rights; Piggies is credited to Ursa Software. Access to
public source is not treated as permission to republish pattern artwork. Tests
requiring these files are opt-in for a locally authorised reference checkout;
there is no automatic fixture download in the test suite.

| Reference file | SHA-256 |
| --- | --- |
| `testdata/patterns/pmaker/piggies.xsd` | `bebac57f0df5065e8f9c0f4c52a2ed7fb4633809e1f733cbabe691eaa58364a3` |
| `app/public/demo/Piggies.oxs` | `9fdd664ff1c82e95719cbb78ea3f1ba737a2e0399c9d97875b2a0f037ea54760` |
| `testdata/patterns/pmaker/specials.xsd` | `fbea5d7900216ae0b18e06dc45a643854d51115303806b98a9cb1aeda373d6a5` |
| `testdata/patterns/pmaker/xsd/stitches` | `4934b7c43404d5708de3d73f048601ca05bd05bb54ff3ccbd57cd123f4d5ec7a` |
| `testdata/patterns/pmaker/xsd/joints` | `db06824a14d2648c1c7bd81be7116dda7a84b50a7c30241984a88dfd9bb5e1f9` |

## Verification evidence

`tests/import/xsdReferences.test.js` compares all **1,000 full crosses**, their
thread identities and cell coordinates in the 69 × 73 Piggies XSD with the
independently supplied OXS chart. The XSD has 54 fractional buffers, 404 backstitch
records, 42 straight stitches, 10 knots and 8 beads. The OXS export has different
fractional representation, finer decorative endpoints and 1,105 subdivided line
records; it is not an exact oracle for these layers. No whole-chart equality is
claimed. The XSD also has 21,166 trailing bytes, which stay explicitly unverified.

The real sectional stitch fixture independently checks four full cells, four
petites, all four quarter directions and both diagonal halves against the
compatible reader's known expectations. The joint fixture checks three backstitch
segments, one straight stitch, a knot, two beads and nine explicitly omitted
special motifs. The real specials-only chart fails rather than claiming an empty
success. Sectional tests insert these original fixture sections into an original
tiny envelope; they do not pretend that envelope is a real producer export.

Generated cases cover palette reorder and invalid indices, Anchor identities,
equal/unequal blends, every fractional direction, independent petites, line and
node boundaries, unknown versions, invalid counts, huge dimensions, oversized
input, malformed RLE, byte-offset views, truncation, special models and empty
results. The separate adversarial pass in `xsdRobustness.test.js` applies **2,000
seeded structured mutations** and checks typed failures, bounded allocations,
coordinate bounds, known thread identities and nonempty output. It also guards
unknown fractional flags and validation of geometry even for unresolved threads.

Browser tests exercise real file selection, limitation review, no save before
confirmation, canonical project publication, source retention, unsupported version
errors and XML Schema rejection. PAT's rejection tests remain in place.

```sh
npm test
XSD_REFERENCE_ROOT=/path/to/authorised/embroiderly npm test -- --runTestsByPath tests/import/xsdReferences.test.js
npm run lint:terminology
npm run lint:css-tokens
E2E_LOCAL_CDN=1 npx playwright test --project=touch-tablet-chromium import-xsd.spec.js import-friendly-errors.spec.js
```

The initial release deliberately has one evidenced producer build. Extending it
requires additional permitted fixtures and expected semantic outputs, not simply
allowing another extension or relaxing the version check.

## Recorded validation, 17 October 2026

Implementation rebased onto main `6762e8be`, preserving the reviewed chart-update
workflow. Focused verification: **128 tests passed**, including all four opt-in
real-reference cases and 2,000 structured mutations. **Seven browser tests passed**
in system Chromium with local CDN dependencies, including existing chart update
and rollback, XSD review/publication and preservation of an existing project.

The complete two-worker unit run reported **351 passing suites / 4,803 passing
tests**, one skipped reference suite (four tests), and two resource-sensitive
failures: backstitch index construction took 729 ms against a 500 ms threshold;
the 95-colour PDF symbol test exceeded its five-second timeout. The unchanged
suites then passed separately: **27 backstitch tests** and **17 PDF symbol tests**.
These full-run failures are recorded rather than presented as a green full suite.

Terminology lint passed. CSS-token lint passed with 13 existing advisory findings;
this PR changes no CSS. Runtime compilation, import-bundle regeneration,
service-worker fingerprints and `git diff --check` passed.
