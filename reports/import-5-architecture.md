# Import 5 — Parser Architecture

> Phase 2, Step 1. Pipeline and module design for the new
> general-purpose pattern import engine. Synthesised from
> [import-1-existing-system.md](import-1-existing-system.md),
> [import-2-dmc-file-analysis.md](import-2-dmc-file-analysis.md),
> [import-3-format-landscape.md](import-3-format-landscape.md), and
> [import-4-parsing-techniques.md](import-4-parsing-techniques.md).

---

## TL;DR

- One **dispatch entry-point** (`importPattern(file, options)`) replaces the current ad-hoc switch in [import-formats.js](../import-formats.js#L60-L71). It returns a uniform `ImportResult` that carries a normalised pattern, a confidence map, a publisher tag, and a list of human-review hints.
- One **classifier** decides what kind of file it is and which **strategy** to invoke. Classification is two-tier: format (`oxs | json | image | pdf`) then sub-type (for PDFs: `vector | glyph | raster | hybrid` + publisher fingerprint).
- Each strategy is a **plugin** with a fixed contract (`canHandle`, `parse`). New formats register themselves; the dispatcher does not need editing. This is what fixes the "every format hardcoded" problem documented in [import-1-existing-system.md](import-1-existing-system.md).
- All strategies emit into the same **internal pattern builder** that produces the v8 project schema. This is the only place pattern shape is mutated; strategies cannot reach past it.
- The whole pipeline runs inside a dedicated **import worker** so the UI stays responsive. The worker reports `progress`, `partial`, `done`, and `error` messages; cancellation is `worker.terminate()`.
- **Legend extraction always runs**, even when grid extraction fails. A legend gives us the palette to pre-load into the Creator if the user must rebuild manually.

---

## 1. Pipeline stages

```
                     importPattern(file, options)
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 0 — Sniff                              │
        │  • magic-byte check on first 1024 bytes       │
        │  • extension as fallback                      │
        │  • emit { format: 'pdf'|'oxs'|'json'|'image' }│
        └───────────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 1 — Strategy selection                 │
        │  • iterate registered strategies              │
        │  • each strategy answers canHandle(meta)      │
        │  • for PDF: also run cheap per-page classify  │
        │    pass to assign each page a role            │
        │  • pick best-match strategy by score          │
        └───────────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 2 — Extract                            │
        │  Strategy-specific. Always returns:           │
        │    {                                           │
        │      grid:    RawCell[],                      │
        │      legend:  RawLegendEntry[],               │
        │      meta:    RawMeta,                        │
        │      flags:   { uncertainCells, warnings }    │
        │    }                                           │
        │  Cells are still in PDF / source coordinates. │
        └───────────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 3 — Assemble                           │
        │  • multi-page chart stitch (overlap detect)   │
        │  • two-layer merge (DMC Layout A)             │
        │  • coordinate normalisation (PDF → top-down)  │
        │  • grid origin + cell-pitch inference         │
        └───────────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 4 — Resolve palette                    │
        │  • merge legend rows by art-line context      │
        │  • map RGB-only cells to legend entries       │
        │  • fall back to nearest-DMC via colour-utils  │
        │  • mark every cell with confidence score      │
        └───────────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 5 — Validate                           │
        │  • per-thread cell counts vs legend totals    │
        │  • palette coverage                           │
        │  • dimension sanity (≤ MAX_DIM, > 1)          │
        │  • emit per-cell + per-pattern confidence     │
        └───────────────────────────────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │  Stage 6 — Materialise                        │
        │  • build v8 project object                    │
        │  • return ImportResult                        │
        └───────────────────────────────────────────────┘
                                │
                                ▼
                          ImportResult
                       (handed to the UI)
```

Each stage is a pure function over the previous stage's output. Stages 0–2 are strategy-specific (delegated through the strategy interface); stages 3–6 are shared infrastructure that every strategy reuses.

### Cancellation

A `cancelToken` flows through every stage. After every page-level operation (and at the start of every stage) the pipeline checks `cancelToken.aborted` and bails with a typed `ImportAbortedError`. The UI calls `cancelToken.abort()` then `worker.terminate()`; the worker is recreated on the next import.

### Progress reporting

Every stage emits a `{ stage, page?, total?, label }` progress message via `postMessage`. The UI shows a single progress bar with the stage label. Stages 0, 1, 4, 5, 6 fire once each; stages 2 and 3 fire per page.

---

## 2. Module layout

```
import-engine/                          (new top-level folder, sibling of creator/)
  index.js                              ImportEngine + registry
  types.js                              Shared shapes (RawCell, ImportResult, ...)
  worker.js                             Web Worker entry; wraps ImportEngine
  workerClient.js                       Main-thread RPC wrapper
  registry.js                           Strategy registration helper
  classifier/
    sniffMagic.js                       Magic-byte file detection
    pdfClassifier.js                    Per-page role + publisher fingerprint
  strategies/
    oxsStrategy.js                      Wraps existing parseOXS
    jsonStrategy.js                     Wraps existing project-JSON path
    imageStrategy.js                    Wraps existing parseImagePattern
    pdfDmcStrategy.js                   New — DMC vector-cell parser
    pdfGlyphStrategy.js                 Refactor of existing pdf-importer.js
    pdfRasterStrategy.js                New — single-image fallback
    pdfGenericStrategy.js               New — uses heuristics only
  pdf/
    pdfDocLoader.js                     Wraps pdfjs.getDocument with sane defaults
    operatorWalker.js                   Pure function over getOperatorList()
    legendExtractor.js                  Shared text-table extractor
    pageMarkerDetector.js               N/M page-marker regex pack
    publishers.js                       Publisher fingerprint table (DMC, HAED, ...)
  pipeline/
    assemble.js                         Multi-page + two-layer merge
    palette.js                          Legend → palette resolution
    validate.js                         Cross-checks
    materialise.js                      Build v8 project
  ui/                                   (lives outside import-engine)
    ImportWizard.jsx                    Existing wizard, refactored to consume ImportResult
    ImportReviewPane.jsx                New — flagged-cell review UI

reports/
  import-1..5*.md                      Phase 1 + 2 docs (this folder)
  import-reference-dmc-format.md       Reference doc consumed by pdfDmcStrategy
```

Every file under `import-engine/` is plain ES module-style JS attached to `window` (matching the conventions in [.github/copilot-instructions.md](../.github/copilot-instructions.md) — no `import`/`export` in shipped files). The folder bundles the same way as `creator/` — concatenated by the existing [build-creator-bundle.js](../build-creator-bundle.js) pattern, or by a sibling `build-import-bundle.js` if we want it independent.

---

## 3. The strategy interface

```ts
type Strategy = {
  id: string;                                   // 'pdf-dmc', 'oxs', 'image', ...
  formats: Array<'pdf'|'oxs'|'json'|'image'>;   // formats this strategy accepts

  // Cheap up-front check — must not parse the whole file.
  // Returns a 0..1 confidence score. > 0 means "I can handle this".
  canHandle(probe: FileProbe): Promise<number>;

  // Full parse. Returns a normalised RawExtraction.
  parse(probe: FileProbe, opts: ImportOptions, ctx: ImportContext): Promise<RawExtraction>;
};

type FileProbe = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;          // first ≤ 1 MB; full bytes available via ctx.fullBytes()
  pdfMeta?: PdfMeta;          // populated by the pdf classifier when format='pdf'
  pageRoles?: PdfPageRole[];  // ditto
};

type ImportContext = {
  cancelToken: { aborted: boolean };
  reportProgress(msg: ProgressMessage): void;
  fullBytes(): Promise<Uint8Array>;
  log(scope: string, ...args: unknown[]): void;
};

type RawExtraction = {
  grid:   RawCell[];
  legend: RawLegendEntry[];
  meta:   RawMeta;
  layers?: { backstitch?: RawLineSegment[] };
  flags:  { warnings: string[]; uncertainCells: number };
};

type RawCell = {
  // Grid coordinate after the strategy has done its own coordinate inference.
  // Stage 3 may rewrite these during multi-page assembly.
  x: number;
  y: number;
  // One of: an already-resolved DMC ID, or a raw colour, or a glyph reference.
  source:
    | { kind: 'dmc';   id: string }                      // legend already known
    | { kind: 'rgb';   r: number; g: number; b: number } // need palette resolution
    | { kind: 'glyph'; font: string; ch: string };       // need legend lookup
  // Optional sub-cell info (quarter / half / partial)
  partial?: { type: 'half' | 'quarter' | 'three-quarter'; orientation?: string };
};

type RawLegendEntry = {
  glyph?: { font: string; ch: string };       // for glyph strategies
  swatchRgb?: [number, number, number];       // for vector / raster strategies
  code?: string;                              // raw publisher code, e.g. '5310', 'B5200'
  artLine?: string;                           // 'mouliné spécial 117', 'perlé metallisé 315', ...
  stitchType: 'cross' | 'half' | 'quarter' | 'backstitch' | 'french-knot' | 'bead' | 'other';
  strands?: number;
  totalStitches?: number;                     // when the legend reports it (Layout B)
  totalSkeins?: number;                       // when the legend reports it (Layout A)
  name?: string;                              // when present (rare for DMC, common for HAED/flosscross)
};

type RawMeta = {
  publisher?: string;                         // 'DMC', 'flosscross', 'HAED', ...
  title?: string;
  designer?: string;
  copyright?: string;
  languages?: string[];
  fabricCount?: number;
  fabricSku?: string;
  finishedSize?: string;
  thumbnail?: { kind: 'image'; data: Uint8Array; mime: string };
  rawSourcePages?: number[];
};
```

The strategy is **forbidden** from constructing a v8 project object directly. That belongs to Stage 6 (`materialise.js`). This invariant means a buggy strategy can corrupt a single import but cannot break the on-disk schema.

---

## 4. PDF classifier

```js
// pdf/pdfClassifier.js
async function classifyPdf(doc) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    const text = await page.getTextContent({ includeMarkedContent: false });
    pages.push({
      pageNum: i,
      role:        rolePerPage(ops, text),       // 'chart-vector' | 'chart-glyph' | 'chart-raster' | 'legend' | 'instructional' | 'cover' | 'blank'
      stats:       cheapStats(ops, text),
      pageMarker:  detectPageMarker(text),       // { current, total } | null
    });
    page.cleanup();
  }
  return {
    publisher: fingerprintPublisher(doc, pages),  // 'DMC' | 'flosscross' | 'HAED' | null
    pages,
    chartPages: pages.filter(p => p.role.startsWith('chart-')),
    legendPages: pages.filter(p => p.role === 'legend'),
  };
}
```

`rolePerPage` uses the heuristics from [import-2-dmc-file-analysis.md §F](import-2-dmc-file-analysis.md#f-implications-for-the-importer) and [import-4-parsing-techniques.md §1.1](import-4-parsing-techniques.md#11-pdfjs--the-workhorse). All rules live in one place so they can be tested directly with synthetic op streams.

`fingerprintPublisher` consults [pdf/publishers.js](#) which is a small declarative table:

```js
// pdf/publishers.js (sketch)
const PUBLISHERS = [
  {
    id: 'DMC',
    match: (doc, pages) =>
      /Adobe InDesign/.test(doc.info?.Creator || '') &&
      pages.some(p => p.text.includes('dmc library - bibliothèque dmc')),
    artLines: [/* see reports/import-reference-dmc-format.md §5 */],
  },
  {
    id: 'flosscross',
    match: (doc) => /flosscross/i.test(doc.info?.Creator || ''),
  },
  // ...
];
```

The table is the point of extension. New publishers add an entry; no parser code changes.

---

## 5. Resources / references system

[Phase 1.1](import-1-existing-system.md) found that the existing codebase has **no** pluggable resources system; every format is hardcoded. The new architecture introduces one:

- **`reports/import-reference-*.md`** — human-authored format specs (one per publisher / format).
- **`pdf/publishers.js`** — machine-readable publisher fingerprints + per-publisher overrides (legend column order, code regex, art-line table, language preferences).
- **`strategies/`** — one file per strategy.

Adding a new publisher in this design means:

1. Drop a sample PDF into `TestUploads/`.
2. Run `node scripts/analyse-dmc-pdfs.js` (rename / generalise to `analyse-pdf.js`) to produce a structural dump.
3. Author `reports/import-reference-<publisher>.md` describing the conventions.
4. Append an entry to `pdf/publishers.js`.
5. If existing strategies cover the rendering style (vector / glyph / raster), no new code. If not, add a new strategy under `strategies/`.

Step 5 is the only one that touches code, and only for genuinely new rendering styles. This is the explicit fix for the limitation called out in [import-1-existing-system.md](import-1-existing-system.md): *"new format specs require code changes"*.

---

## 6. Error and confidence model

Every parse produces an `ImportResult` whose shape forces the UI to surface ambiguity:

```ts
type ImportResult = {
  ok: true;
  project: ProjectV8;            // the actual pattern (always populated, even when partial)
  publisher?: string;
  confidence: {
    overall: number;             // 0..1
    perCell: Float32Array;       // length = w*h
    perPaletteEntry: number[];
  };
  warnings: ImportWarning[];     // non-fatal, surfaced in the review pane
  reviewHints: ReviewHint[];     // 'tap to fix', e.g. 'cell (45, 12) was a glyph not in the legend'
} | {
  ok: false;
  error: ImportError;            // typed errors: AbortedError, UnsupportedError, ParseError, ValidateError
  partial?: ProjectV8;           // best-effort partial pattern, may help the user start manually
  publisher?: string;
  warnings: ImportWarning[];
};
```

Three failure modes that today cause silent failure (per [import-1-existing-system.md](import-1-existing-system.md)) become explicit:

1. `UnsupportedError` — no strategy claimed the file. UI shows "We don't recognise this file" with the publisher name when known.
2. `ParseError` — a strategy ran but the result is unusable. UI shows "Couldn't read the chart, but here's what we found in the legend" with the partial palette.
3. `ValidateError` — extraction succeeded but cross-checks failed (e.g. cell count vs legend count off by > 25 %). UI shows the extracted pattern with a banner: "We're not confident this matches the original — please review highlighted cells."

This replaces the current "alert and bail" model with a graceful-degradation model.

---

## 7. Worker boundary

```js
// workerClient.js (main thread)
async function importPattern(file, opts) {
  const worker = new Worker('import-engine/worker.js');
  const channel = new MessageChannel();
  worker.postMessage({ kind: 'init', port: channel.port2 }, [channel.port2]);

  const cancelToken = { aborted: false };
  const onCancel = () => { cancelToken.aborted = true; worker.terminate(); };

  try {
    const bytes = await file.arrayBuffer();
    worker.postMessage({ kind: 'parse', bytes, fileName: file.name, mimeType: file.type, opts }, [bytes]);
    return await listenForResult(channel.port1, opts.onProgress);
  } finally {
    worker.terminate();
  }
  return { onCancel };
}
```

Workers communicate only via structured-clone-safe messages. Specifically forbidden inside the worker:

- DOM / `window` access
- `localStorage` (use `IndexedDB` if needed, but the current design has no need)
- React imports

Permitted: `pdfjs-dist` (which itself spawns its own worker — that nested worker is fine), pure utilities from [colour-utils.js](../colour-utils.js), and the `import-engine/*` modules.

---

## 8. Test strategy

| Layer | Test type | Where |
|---|---|---|
| Stage 0 sniff | Jest unit, in-memory `Uint8Array` fixtures | `tests/import/sniff.test.js` |
| PDF classifier | Jest unit, fed synthetic op-streams + a few real PDF dumps | `tests/import/pdfClassifier.test.js` |
| Strategy: oxs / json / image | Jest unit + existing fixtures from `tests/` | reuse current files |
| Strategy: pdf-dmc | Jest unit using `TestUploads/PAT*.pdf` and the analysis JSONs as golden data | `tests/import/pdfDmc.test.js` |
| Strategy: pdf-glyph | Jest unit using `TestUploads/Books and Blossoms.pdf` | `tests/import/pdfGlyph.test.js` |
| Pipeline assembly | Jest unit with hand-crafted RawExtraction inputs | `tests/import/assemble.test.js` |
| Validation rules | Jest unit | `tests/import/validate.test.js` |
| End-to-end (browser) | Playwright, against `index.html` | `docs/test-plans/import-e2e.md` |

The Phase 1 raw analysis JSONs in [reports/import-2-raw/](import-2-raw/) become **golden fixtures** for the classifier and DMC strategy. If a future change to the classifier breaks DMC layout-A or layout-B detection, the test suite catches it before the user does.

---

## 9. Migration plan (existing code)

The existing [import-formats.js](../import-formats.js), [pdf-importer.js](../pdf-importer.js), and [creator/useImportWizard.js](../creator/useImportWizard.js) cannot be deleted in one pass without breaking the wizard. The migration is staged:

1. **Add `import-engine/` next to existing files.** Its `workerClient.js` exposes `window.importPattern2`.
2. Wire a feature flag in user-prefs (`creator.useNewImporter`, default off).
3. Migrate strategies one at a time, starting with the OXS strategy (smallest), then JSON, then PDF-glyph (refactor of existing), then PDF-DMC (new), then image, then PDF-raster.
4. When all strategies pass parity tests against the existing wizard, flip the default flag to on.
5. Remove the old [pdf-importer.js](../pdf-importer.js) and the old `detectImportFormat` switch.

This avoids the "big-bang rewrite that breaks the app for two weeks" pattern that bites this kind of refactor.

---

## 10. Open design questions

These are intentionally not decided yet — surface them with the user before implementing:

1. **Should the import worker be shared across imports, or recreated per import?** Recreating is simpler and per-import isolation is desirable; sharing avoids worker-startup cost (~50 ms). Default: recreate.
2. **Where do publisher reference docs live long-term — `reports/` or `import-engine/publishers/`?** `reports/` is currently a research folder; the docs are part of the product going forward. Probably move to `docs/import-formats/` once stable.
3. **Should the importer ever auto-create a project, or always hand the user a preview to confirm first?** Strong recommendation: **always preview**. Auto-create on success would short-circuit the review pane and re-introduce the silent-failure problem.
4. **Bundling**: extend `build-creator-bundle.js` to also produce `import-engine/bundle.js`, or write a parallel `build-import-bundle.js`? The latter avoids coupling the two bundles' build configs.
5. **License audit on any new dependency**: pdf.js (Apache 2.0) is already in. Anything else added must be MIT / Apache / BSD compatible with the app's distribution.
6. **Resources system as a generic concept**: do we want non-import "resources" (e.g. fabric reference, thread blend tables, stitch glossary) to live alongside import format docs? Designing one resources/references system to serve all of these is broader than this report; flag for a separate Phase 2 step if confirmed.

---

## 11. What this changes day one for callers

The existing wizard ([creator/useImportWizard.js](../creator/useImportWizard.js)) calls `parseFile(file)` and gets back a project (or throws). After migration:

```js
// Before
const project = await parseFile(file);

// After
const result = await importPattern(file, { onProgress });
if (!result.ok) {
  toast.error(humanError(result.error));
  if (result.partial) openCreatorWith(result.partial);  // graceful degradation
  return;
}
openImportReview(result);  // shows the project + flagged cells
```

The migration of `useImportWizard.js` is the only consumer-facing change in Phase 2.

---

## Next steps

Phase 2 continues with:

- **Step 2** — module-by-module API design for `import-engine/`, including signatures and JSDoc types for every public function.
- **Step 3** — UI design for the import review pane (flagged-cell highlighting, palette confirmation, manual fix interactions).
- **Step 4** — explicit test plan: golden fixtures, parity matrix vs existing importer, performance budgets per corpus file.

These will become `import-6-…md`, `import-7-…md`, `import-8-…md`. They depend on confirmation of the open questions in §10 before they are worth writing.
