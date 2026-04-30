# Import 1 — Existing Import System Audit

> Phase 1, Step 1. Read-only technical audit of the cross-stitch app's
> current pattern import architecture, written before any new design
> work begins. All claims cite specific files and line numbers.

---

## TL;DR

- The repo ships **four importers** (OXS XML, JSON project, raster image, PDF), all dispatched by a single `detectImportFormat()` switch in [import-formats.js](../import-formats.js#L60-L71).
- The "PatternKeeper" format the user named is in fact **OXS / KG-Chart XML** (`.oxs`, `.xml`). `.xsd` is an XML Schema, not a pattern file — the codebase only consumes `.oxs`. PK *export* is bit-stable PDF; PK *import* in this app means OXS.
- The PDF importer ([pdf-importer.js](../pdf-importer.js)) is **experimental, partially wired, and currently coded against PatternKeeper-style PDFs** — not DMC marketing PDFs. It is not invoked from any production UI button today.
- The internal pattern model importers must produce is the v8 project schema (`{v, w, h, settings, pattern[], bsLines[], done, parkMarkers, halfStitches, halfDone, sessions, threadOwned, ...}`). `pattern` is a flat row-major array of cell objects; cell `id` is a DMC code, `"310+550"` blend, `"__skip__"`, or `"__empty__"`.
- **There is no pluggable format-spec / resources system today.** Every format is hardcoded in JS. Adding a new format requires editing `detectImportFormat()`, writing a parser, and threading new options through `useImportWizard.js`.
- Validation is shallow (dimension caps, "any stitches?" checks). Failures hard-fail with a user-visible message; no partial-result recovery.

---

## A. Supported formats and dispatch

[detectImportFormat(file)](../import-formats.js#L60-L71) is the single source of truth for format detection. It runs **filename extension first, MIME second**:

| Format | Extensions | MIME | Handler | Library |
|---|---|---|---|---|
| OXS / KG-Chart XML | `.oxs`, `.xml` | `application/xml`, `*xml*` | `parseOXS()` | Browser `DOMParser` |
| Project JSON | `.json` | `application/json` | inline `JSON.parse` + `importResultToProject()` | native |
| Raster image | `.png .jpg .jpeg .gif .bmp .webp` | `image/*` | `parseImagePattern()` | Canvas2D + [colour-utils.js](../colour-utils.js) |
| PDF | `.pdf` | `application/pdf` | `PatternKeeperImporter` | pdf.js + local [pdf.worker.min.js](../pdf.worker.min.js) |

```js
// import-formats.js:60-71
function detectImportFormat(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.oxs') || name.endsWith('.xml')) return "oxs";
  if (name.endsWith('.json')) return "json";
  if (name.endsWith('.png') || name.endsWith('.jpg') || /* ... */) return "image";
  if (name.endsWith('.pdf')) return "pdf";
  const mime = file.type.toLowerCase();
  /* fallback by MIME */
  return "unknown";
}
```

There is **no magic-byte sniffing**. A `.pdf` renamed to `.png` would be misrouted into the image pipeline.

---

## B. Internal pattern data model (target schema)

This is the contract every importer must satisfy. Sources:
[project-storage.js](../project-storage.js#L1-L50) (persistence), [creator/useCreatorState.js](../creator/useCreatorState.js#L1-L50) (runtime), [tracker-app.js](../tracker-app.js) (consumer), [helpers.js](../helpers.js) / [constants.js](../constants.js) (defaults).

```js
// Persisted v8 project shape
{
  v: 8,                          // schema version (Tracker writes v9 with stats)
  id: "proj_1712345678",
  name: "My Pattern",
  createdAt: "ISO 8601",
  updatedAt: "ISO 8601",

  // Grid
  w: 80,                         // grid width in stitches
  h: 80,                         // grid height in stitches
  settings: {
    sW: 80,                      // source/edit width (may differ from w)
    sH: 80,
    fabricCt: 14                 // DMC fabric count; default constants.js
  },

  // Cells: flat row-major array of length w*h, index = y*w + x
  pattern: [
    { id: "310",     type: "solid", rgb: [0,0,0],   name: "Black", lab: [...] },
    { id: "310+550", type: "blend", rgb: [45,45,45] },           // two DMC IDs joined with '+'
    { id: "__skip__",  type: "skip" },                            // background, never stitched
    { id: "__empty__" }                                           // user-erased cell
  ],

  // Backstitch line segments (optional)
  bsLines: [{ x1, y1, x2, y2 }, ...],

  // Half stitches (v9, sparse)
  halfStitches: { [cellIdx]: { fwd?: 1, bck?: 1 } },
  halfDone:     { [cellIdx]: { fwd?: 0|1, bck?: 0|1 } },

  // Tracker progress (null = not started, else flat 0|1 array length w*h)
  done: null | Uint8Array | number[],

  // Advanced
  parkMarkers: [],

  // Stats / sessions
  totalTime: 0,                  // legacy, deprecated in favour of sessions
  sessions: [{ start, end, ...}],
  statsSessions: [],             // v9 detailed log
  achievedMilestones: [],

  // Stash linkage
  threadOwned: { "310": true, "550": 2, ... }
}
```

**Cell ID conventions** (importers MUST follow):
- Solid stitch: DMC code as string — `"310"`, `"BLANC"`, `"ECRU"`. Special whites/blacks resolved in [import-formats.js#L167-L243](../import-formats.js#L167-L243).
- Blend: two DMC IDs joined by `+`, sorted by appearance order — `"310+550"`. Order matters because the legend renders the first ID as "primary".
- Background: `"__skip__"` (no stitch will be sewn here).
- Erased: `"__empty__"` (user removed a previously-mapped cell during editing).

**Palette is derived, not stored.** Both Creator and Tracker rebuild the palette by walking `pattern[]` and looking up each unique `id` in [dmc-data.js](../dmc-data.js) at load time. This means importers do **not** need to emit a separate `palette` array — they only need correct cell `id`s with optional `rgb` for fast preview before DMC lookup completes.

The shape an importer is expected to *return* (then normalised by `importResultToProject()`):

```js
// import-formats.js:40-56
{
  width:  Number,
  height: Number,
  pattern: Cell[],                // length width*height
  bsLines: Line[],                // [] if not applicable
  stitchCount: Number,            // count of non-skip cells
  paletteSize: Number             // unique non-skip ids
}
```

---

## C. Per-importer details

### C.1 OXS / KG-Chart XML — `parseOXS()`

[`import-formats.js:102-340`](../import-formats.js#L102-L340). Stable, the workhorse importer.

- Parses with native `new DOMParser().parseFromString(xml, 'application/xml')`. Detects `<parsererror>` to throw `"Invalid OXS file: malformed XML"`.
- Dimension extraction (`_oxsExtractDimension`, [L75-L100](../import-formats.js#L75-L100)) tries attributes in order: `chartwidth`, `chartheight`, `width`, `height`, `w`, `h`, on `<properties>` then `<chart>`. Hard cap **5000 × 5000**.
- Palette extraction (L167-L243):
  - Iterates `<palette>|<Palette>|<colors>|<Colors>` containers.
  - Resolves DMC ID via the cached `_importDmcById` / `_importDmcByName` maps ([L4-L18](../import-formats.js#L4-L18)) — these are lazily built O(1) Maps over `dmc-data.js` shared across all parsers.
  - Special-name resolution: `"blanc" → "BLANC"`, `"ecru" → "ECRU"`, `"black" → "310"`.
  - RGB fallback: parses `red/green/blue` or `color`/`hex`/`rgb` then `findSolid()` (CIE ΔE 2000) to nearest DMC if no ID match.
  - Deduplicates palette indices: if two `<color>` elements resolve to the same DMC code, all stitches referencing the duplicate index are remapped to the canonical index ([L244-L255](../import-formats.js#L244-L255)).
- Stitch grid (L256-L280): tries `<fullstitches>|<stitches>|<crosses>|<grid>|<chart>` containers, then `<stitch>|<cross>|<cell>|<point>` items. Coords from `x|col|column` and `y|row`. Palette index from `palindex|palette|color|colorindex|col_index|index` or text content.
- Backstitch (L281-L304): `<backstitch>|<line>` elements with `x1|startx,y1|starty,x2|endx,y2|endy`. Zero-length lines and out-of-bounds endpoints rejected.
- Throws `"No valid stitches found in pattern"` when `stitchCount === 0`.

### C.2 Raster image — `parseImagePattern()`

[`import-formats.js:324-420`](../import-formats.js#L324-L420). Truly an *importer* (not a creator) — produces a pattern in one shot from an image, no editing pass.

Pipeline: HTMLImageElement → downscale on Canvas2D → k-means quantise (`quantize()` in colour-utils.js) → `doMap()` → emit cells.

Options: `maxWidth`/`maxHeight` (default 200, min 10), `maxColours` (30), `skipWhiteBg` (false), `bgThreshold` (CIE ΔE 15).

Cell classification:
- `alpha < 30` → `__skip__` (transparent background).
- `skipWhiteBg && dE(px, white) ≤ bgThreshold` → `__skip__`.
- Else → nearest DMC from quantised palette.

Throws `"No stitches produced from image. Adjust background settings or try another image."` if everything was skipped.

### C.3 JSON — inline

No dedicated parser function. The Creator's bundle reads the file as text, runs `JSON.parse`, hands the object to `importResultToProject()`. **No schema validation** — a malformed JSON project will surface as a downstream `TypeError` when render code touches a missing field.

### C.4 PDF — `PatternKeeperImporter`

[`pdf-importer.js`](../pdf-importer.js) (~700 lines). Status: **experimental, incomplete, not currently invoked from any production UI button**.

Designed against **PatternKeeper-style PDFs only**, which are characterised by:
- Symbols rendered as TrueType glyphs at known cell-centre coordinates.
- Vector grid lines (not rasterised).
- A structured legend with one-line-per-thread entries.

Pipeline:
1. `PdfLoader.load(file)` ([L43-L63](../pdf-importer.js#L43-L63)) — `pdfjsLib.getDocument()` with worker pinned to local `pdf.worker.min.js`. Password PDFs rejected with a friendly message.
2. `extractAllPages()` ([L113-L240](../pdf-importer.js#L113-L240)) — `Promise.all` over all pages, each yielding `{textContent, vectorPaths, viewport}`. Vector paths come from PDF.js `getOperatorList()` and are flattened to lines/rects/curves.
3. `classifyPages()` ([L441-L460](../pdf-importer.js#L441-L460)) — heuristic: a chart page has `numLines > 50 && (numSingleChars > 50 || numTexts > 1000 || numLines > 2000)`. Legend pages contain `"DMC"` or `"stitch count"` text. Page 1 is "cover", everything else is "info".
4. `detectGrid()` ([L495-L601](../pdf-importer.js#L495-L601)) — clusters horizontal and vertical lines, infers cell pitch from median spacing, finds origin from longest contiguous sequence.
5. `extractSymbols()` ([L602-L695](../pdf-importer.js#L602-L695)) — for each grid cell, find a single-character text item near the centre; fall back to coloured fill paths.
6. `parseLegend()` (L696+) — Y-clusters legend text rows, looks for `DMC <code> <name>` patterns, attempts to pair each row with a symbol glyph.
7. `linkSymbolsToThreads()` and `convertToPattern()` — **stubbed/incomplete in repo**.

Critical gap for the task in this engagement: this importer assumes **the chart is on PDF pages with the same coordinate system as PatternKeeper exports**. DMC marketing PDFs (the new target) have intermixed instructional pages, often-rasterised charts, and legends with publisher-specific layout — none of those assumptions hold.

---

## D. UI invocation paths

| Surface | Entry point | Accepted | Post-import |
|---|---|---|---|
| Creator file picker | [creator-main.js#L351](../creator-main.js#L351) → `_ioRef.current.loadProject(e)` (in [creator/useProjectIO.js](../creator/useProjectIO.js)) | `.json,.oxs,.xml,.png,.jpg,.jpeg,.gif,.bmp,.webp,.pdf` (per the `accept=` at [creator-main.js#L768](../creator-main.js#L768)) | Loaded directly into Creator state; no preview gate |
| Creator drag-drop | same handler, dropzone in [creator/PrepareTab.js](../creator/PrepareTab.js) | same | same |
| Tracker import modal | [tracker-app.js#L2900-L2950](../tracker-app.js#L2900) | OXS, JSON, image | `importResultToProject()` → `ProjectStorage.save()` → IndexedDB; opens new project |
| Experimental Import Wizard (C7) | [creator/ImportWizard.js](../creator/ImportWizard.js) gated by `UserPrefs.get("experimental.importWizard")` | image only currently | Multi-step preview; draft persisted to `localStorage["cs_import_wizard_draft"]` |
| Home screen import | [home-app.js](../home-app.js) routes to Creator or Tracker for the actual file work | — | — |

There is **no URL-based import** (no "paste a URL to a pattern PDF").

---

## E. Resources / references system

**Finding: there is no dedicated, pluggable format-spec system.** The user's question implied one might exist; it does not.

What does exist:
- [TERMINOLOGY.md](../TERMINOLOGY.md) — project-wide glossary.
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) — agent-facing prose.
- [docs/test-plans/](../docs/test-plans/) and root-level `*_TEST_PLAN.md` files — manual QA.
- [anchor-data.js](../anchor-data.js) — Anchor↔DMC thread cross-reference (used by `thread-conversions.js`), not a format spec.

What is **not** present:
- No `formats/` directory.
- No JSON schemas, XSDs, or sample files documented as parser references.
- No runtime-loaded format spec: every parser is imperative JS code.

To add a new format today you must:
1. Add an extension/MIME branch to `detectImportFormat()`.
2. Write a parser function with the `{width, height, pattern, bsLines, stitchCount, paletteSize}` return shape.
3. Add a switch arm in the Tracker import handler ([tracker-app.js#L2900](../tracker-app.js#L2900)) and the Creator IO loader.
4. Update the `accept=` lists in [creator-main.js#L768](../creator-main.js#L768) and any tracker file inputs.
5. Optionally extend [creator/useImportWizard.js](../creator/useImportWizard.js) for guided UX.

This is exactly the pain Phase 2 needs to address: the new DMC importer should land behind a plug-in registry so that Riolis, HAED, etc. can be added without touching the dispatch sites.

---

## F. Limitations and failure modes

- **Grid cap:** 5000 × 5000 stitches per axis ([import-formats.js#L98](../import-formats.js#L98)). Throws `"Chart dimensions too large (max 5000×5000): WxH"`.
- **No file-size cap.** Whatever the browser File API will load. Large images blow up Canvas2D before we can warn.
- **No magic-byte sniffing.** Detection is by extension/MIME only.
- **No partial-result recovery.** A missing `<chart>` element, an unrecognised RGB, or zero usable stitches all hard-fail with a single `throw`. There is no "import 95% of cells, flag the rest as `__empty__`" path.
- **Image conversion is destructive by design.** `parseImagePattern()` always quantises and dithers; you cannot round-trip an image through it and back.
- **PDF importer is not surfaced in any release UI button.** The Creator's `accept=".pdf"` will hand the file to a stubbed handler and almost certainly produce an empty pattern.
- **OXS palette de-duplication is first-wins.** A producer that emits two distinct colour entries for the same DMC code will lose the second one's metadata silently.
- **No password handling for PDFs beyond a friendly error.** No prompt to re-enter.

---

## G. Tests

| Test file | What it covers |
|---|---|
| [tests/c7ImportWizardA11y.test.js](../tests/c7ImportWizardA11y.test.js) | ARIA / keyboard semantics in the wizard |
| [tests/c7ImportWizardSteps.test.js](../tests/c7ImportWizardSteps.test.js) | Step-by-step UX transitions |
| [tests/c7ImportWizardState.test.js](../tests/c7ImportWizardState.test.js) | `useImportWizard()` hook: defaults, autofit, draft persistence, commit shape |
| [tests/c7ImportWizardPrefsToggle.test.js](../tests/c7ImportWizardPrefsToggle.test.js) | Feature flag gating |
| [tests/c6ZipBundleManifest.test.js](../tests/c6ZipBundleManifest.test.js) | Manifest XML round-trips through `parseOXS()` |

Coverage gaps:
- No direct tests for `parseOXS()` against real-world OXS samples.
- No tests for `parseImagePattern()`.
- **No tests for the PDF importer** — appropriate, since it's incomplete, but means we have no regression net before adding DMC PDF support.

---

## H. Implications for the new DMC importer

1. **Reuse `importResultToProject()` and the `{width, height, pattern, bsLines, stitchCount, paletteSize}` shape.** Don't invent a new return type.
2. **Don't extend `pdf-importer.js` in place.** Its assumptions are PatternKeeper-specific; mixing DMC heuristics in will break PK PDFs. The new pipeline should at minimum live in a new file, ideally behind a registry.
3. **Use the cached `_importDmcById` / `_importDmcByName` maps** for thread resolution to avoid building yet another DMC index.
4. **Add magic-byte sniffing now**, not later — DMC PDFs renamed `.pat` should still route correctly.
5. **Plan for partial results.** DMC marketing PDFs are visual documents; full pattern recovery from every page won't always be possible, and silently throwing `"No valid stitches"` is a terrible UX. Phase 2 should design a "low-confidence cell" channel.
6. **Surface a real PDF UI path.** Today the `accept=".pdf"` is a trap — clicking it will succeed at file read and fail silently at parse.
7. **Build a regression corpus before touching parser code.** No tests exist for PDF; the first new code should land alongside golden snapshots from `TestUploads/`.

---

*End of Import Audit. Next: [import-2-dmc-file-analysis.md](import-2-dmc-file-analysis.md).*
