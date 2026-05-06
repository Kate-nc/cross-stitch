# Import 3 — Pattern Format Landscape

> Phase 1, Step 3. Survey of every cross-stitch pattern format I could
> identify in the wild, with feasibility / popularity / priority scoring
> for the new general-purpose import engine. Synthesised from web
> research, GitHub repository inspection, and r/CrossStitch / forum
> discussions current to early 2026.

---

## TL;DR

- **OXS (KG-Chart XML)** is the only modern, openly documented, actively maintained interchange format in the cross-stitch world. It is the de-facto open standard. The app already supports it; treat it as the **internal pivot format** and the **export target** for round-tripping any other format.
- **PDF is the dominant consumer delivery format** — but "PDF" subsumes at least four structurally incompatible sub-formats (vector cells, glyph cells, raster bitmap, scanned image). All four are common in the wild; the importer must detect which one it is dealing with on a per-document basis.
- **All other digital formats** (PCStitch `.pat`, WinStitch / MacStitch `.xsp`, Pattern Keeper internal SQLite, HobbyWare `.pat`, Saataja, …) are proprietary, closed, declining in user base, or all three. None are worth a v1 investment except as opportunistic later additions.
- Highest user value per engineering hour, in priority order: (1) DMC vector PDF, (2) flosscross / PatternKeeper glyph PDF (already partly supported), (3) Heaven & Earth Designs glyph PDF, (4) generic PDF with `2 of 4` style multi-page chart assembly, (5) WinStitch / MacStitch `.xsp` (specs exist), (6) Etsy indie raster scans (best-effort with human review).
- The **r/CrossStitch community pain point is unambiguous**: people want to take the PDF they bought / downloaded and load it into a tracker app. PatternKeeper interop and PDF→trackable-pattern are the two requests that come up over and over.

---

## 1. Structured / digital pattern formats

### 1.1 OXS — KG-Chart XML (`.oxs`, `.xml`)

| Attribute | Value |
|---|---|
| Container | UTF-8 XML, root `<chart>` |
| Public spec | Yes — `embroidery-space/xsp-specs` (ImHex pattern + plain English notes) |
| Open-source parsers | This repo's [import-formats.js](../import-formats.js#parseOXS) (browser DOMParser); Embroidery Space's `embroiderly` (Rust); `Mickey1992/stitch-pdf2oxs` (Java, OXS *writer* fed from PDF) |
| Pattern data carried | grid w×h, palette (DMC IDs + RGB), full stitches, half stitches, quarter stitches, backstitches, French knots, beads, blends (limited), copyright string, designer name |
| Popularity | Niche but the only modern open standard; growing as the open-source community consolidates around it |
| Browser feasibility | **5/5 (trivial)** — pure XML, parses with `DOMParser` |
| Verdict | **Already supported. Use as the internal pivot model.** |

OXS is not perfect (the spec has gaps around rare stitch types and palette blending semantics), but it is the only format where adding "yet another importer that emits OXS" is a realistic open-source contribution path.

### 1.2 PCStitch `.pat`

| Attribute | Value |
|---|---|
| Container | Proprietary binary, no header constant published |
| Public spec | None |
| Open-source parsers | None found |
| Pattern data | Grid, palette, possibly backstitch (unknown — would need to reverse) |
| Popularity | Niche and *declining*. PCStitch is still sold (M&R Enterprises) but the Windows-only app has not had a significant update in years. |
| Browser feasibility | **1/5 (opaque)** |
| Verdict | **Defer indefinitely.** Reverse-engineering effort is high and the user base is shrinking. Revisit only if a community-contributed parser appears. |

### 1.3 WinStitch / MacStitch / XSPro `.xsp`

| Attribute | Value |
|---|---|
| Container | Proprietary binary (some versions zlib-wrapped) |
| Public spec | **Partially documented** in `embroidery-space/xsp-specs` (ImHex bitfield patterns) |
| Open-source parsers | `embroidery-space/xsp-parsers` (Rust, archived but functional reference); `embroidery-space/embroiderly` (Rust, includes XSPro reader v0.7.1+) |
| Pattern data | Full grid, palette, blends, French knots, beads, half/quarter stitches, backstitches |
| Popularity | Declining but real — UrsaSoftware (the publisher) is still trading and many published designers ship `.xsp` source files alongside PDFs. |
| Browser feasibility | **3/5 (hard)** — binary, but documented; portable reference implementation in Rust gives a clear blueprint. |
| Verdict | **v2 candidate.** The Rust reference makes a JS port realistic; users would benefit; the format is rich enough to round-trip into OXS without losing data. |

### 1.4 Pattern Keeper (iOS app, internal)

| Attribute | Value |
|---|---|
| Container | App-internal SQLite DB; no documented export format |
| Public spec | None |
| Open-source parsers | None |
| Pattern data | Grid, palette, per-stitch tracking state (the app's selling point) |
| Popularity | **Common** among iPad-using stitchers. The app is widely used precisely *because* there is no good alternative. |
| Browser feasibility | **1/5 (opaque)** — the app does not export anything |
| Verdict | **Not importable directly.** Users can however *export their imported pattern* from PK (PK accepts most PDFs and re-renders them as glyph charts). The realistic interop story is "import the same source PDF independently into both apps", not "talk to PK". |

### 1.5 HobbyWare Pattern Maker `.pat` (different from PCStitch)

| Attribute | Value |
|---|---|
| Container | Proprietary binary |
| Public spec | None |
| Open-source parsers | None |
| Popularity | Niche, declining |
| Browser feasibility | **1/5 (opaque)** |
| Verdict | **Defer indefinitely.** Note the extension collides with PCStitch — if we ever add `.pat`, we must magic-byte-sniff to disambiguate. |

### 1.6 Saataja (Finnish), Stoney Creek, Crocheter Software, etc.

Regional / publisher-specific binary formats with no documentation, no public reference implementations, and small user populations. **Out of scope.** If demand materialises, treat individually.

### 1.7 StitchFiddle, web-based JSON exports

| Attribute | Value |
|---|---|
| Container | JSON (some sites) or proprietary cloud-only (others) |
| Public spec | None official, but trivially reverse-engineered for the JSON exporters |
| Browser feasibility | **5/5 (trivial)** |
| Popularity | Common among casual / online-first stitchers |
| Verdict | **v1 quick win** when a user asks for it, *but* the JSON shape varies per site. Add per-site adapters only after a user reports a real need. Do not speculatively support sites we have no test files for. |

### 1.8 Cross Stitch Saga, app-internal mobile formats

App-internal SQLite, proprietary, undocumented. **Out of scope.**

---

## 2. PDF pattern publishers

PDF is the *delivery* format for ~80 % of patterns sold to consumers. Inside the PDF wrapper, the chart can be rendered in one of four fundamentally different ways:

| Rendering style | How the chart is drawn | Detection signal | Examples |
|---|---|---|---|
| **Vector cells** | One `setFillRGBColor` + filled `re` per stitch | High `setFillRGBColor` cardinality (50–500), high `rect` count (1 000–10 000), zero images | DMC, Lanarte, modern Riolis, most European publishers |
| **Glyph cells** | One single-character text item per stitch | Very high `singleChars` count (5 000–50 000), low `setFillRGBColor` cardinality (≤ 10) | Pattern Keeper exports, flosscross, Heaven & Earth Designs |
| **Raster bitmap** | One `paintImageXObject` of the whole chart | Few text items, exactly 1–2 large `paintImageXObject` calls per chart page | Older Dimensions kits, scanned indie patterns, some Etsy sellers |
| **Hybrid** | Vector grid + raster preview, or glyph chart with raster colour blocks behind | Mixed signals — needs per-cell decision | Some Mirabilia / specialty publishers |

### 2.1 DMC (free pattern library)

- See [import-2-dmc-file-analysis.md](import-2-dmc-file-analysis.md) for full corpus analysis.
- Vector cells. Bilingual / trilingual labels. Two layout variants observed.
- **No DRM, no encryption.** Always parseable.

### 2.2 Dimensions / Bucilla (Simplicity)

- Older catalogue: glyph charts (typeface + symbol set). Newer catalogue: vector cells.
- Multi-page charts with `1 of 4` style page markers in headers/footers.
- Often include a colour-photo cover page that the parser must skip.
- **No DRM** on PDFs sold or bundled with kits.

### 2.3 Riolis

- European publisher, many small designs sold as PDF.
- Vector cells in newer designs; some older designs are glyph charts.
- Cyrillic text in some metadata fields — the parser's text heuristics must be Unicode-clean.

### 2.4 Heaven & Earth Designs (HAED)

- **Famously massive** charts (one design can be 500 pages).
- Always **glyph charts**. The same single-character glyph may map to different DMCs in different sub-areas of the design (rare but happens for very large palettes).
- HAED includes per-page reference rulers (numbered top edge, lettered side edge) that **align across pages with two-column overlap** — making them ideal for the multi-page assembly algorithm.
- **No DRM** on the PDFs themselves but they often include a personal-watermark cover page (purchaser's email). The parser should treat that page as decorative and skip it.
- High community demand; making HAED PDFs trackable would unlock thousands of users.

### 2.5 Lanarte (DMC subsidiary)

- Vector cells, similar to DMC's own publications. Same parser will work.

### 2.6 Mirabilia, Just Nan, Country Cottage Needleworks, indie cottage publishers

- Highly variable. Some glyph, some vector, some raster scans of older charts.
- Often include **specialty stitch markers** (beads, treasure braid, kreinik metallics, French knots, colonial knots) that need bespoke handling.
- Most are **PDF without DRM**.

### 2.7 Etsy indie designers

- The wildest tail. Anything from a clean vector chart exported from Pattern Maker to a JPG of a hand-drawn graph paper page.
- Often **password-protected PDFs** (rare but real).
- Realistic stance: support what we can; for the rest, present a "we couldn't auto-import — would you like to use the Creator's image-based pattern generator?" fallback that routes the user to the existing image-import pipeline.

### 2.8 Free chart sites (Caterpillar Cross Stitch, AllFreeEmbroidery, etc.)

- Quality and structure all over the place. Treat case-by-case as users surface real files.

---

## 3. Cross-stitch community pain points

Recurring themes from r/CrossStitch (last ~2 years), r/embroidery, and the Pattern Keeper subreddit:

1. **"How do I import this PDF into Pattern Keeper / Lord Libidan / [tracker app]?"** — by far the most common question. PatternKeeper accepts most PDFs but its glyph extraction silently fails on vector-cell DMC PDFs. Users end up *photographing* their tablet screen.
2. **"Pattern Keeper doesn't sync to cloud and the dev has gone quiet"** — long-running thread of users worried about losing tracking progress. Several have asked for an open-source alternative; this app is one of the few candidates.
3. **"Converting between formats is impossible"** — users with a `.pat` from 2003 who can't open it on a modern machine.
4. **"I just want to *track* this PDF, not redesign it"** — strong preference for read-only import that preserves the original chart faithfully, over import-then-edit workflows.
5. **"Why doesn't my chart show all the colours when I import?"** — common with HAED and large indie designs. Cause is almost always glyph-mapping failure (the font dictionary in the PDF is incomplete or uses non-standard glyphs).
6. **"My import shows the chart upside down / mirrored"** — PDF coordinate-system gotcha (origin is bottom-left, not top-left). Any importer must flip the y-axis.
7. **Manual workarounds people resort to**: screenshot every page → tile in Photoshop → use a "magic wand" on each colour → manually count cells → enter into an app row-by-row. This is the workflow we are trying to make obsolete.

---

## 4. Prioritisation

Ranked by `(reach × user_value) / engineering_cost`:

| Rank | Format / source | Reach | Feasibility | Cost | Slot |
|---|---|---|---|---|---|
| 1 | **DMC PDF — vector cells** (this corpus) | High | High (vector ops are deterministic) | Medium | **v1** |
| 2 | **Glyph-chart PDF** (PatternKeeper / flosscross / HAED) | High | Medium (font-dictionary mapping is the hard part) | Medium | **v1** (extends existing [pdf-importer.js](../pdf-importer.js)) |
| 3 | **Multi-page chart assembly** (any glyph or vector chart split `N of M`) | High | Medium | Medium | **v1.5** |
| 4 | **OXS / KG-Chart XML** | Niche | Trivial | Done | **v0** (already supported) |
| 5 | **Project JSON (this app's own format)** | High | Trivial | Done | **v0** (already supported) |
| 6 | **WinStitch / MacStitch `.xsp`** | Niche but real | Hard but documented | High | **v2** |
| 7 | **Raster image of a chart** (scanned indie PDF, JPG / PNG upload) | Medium | Low (fuzzy) | High | **v2 (best-effort with human review)** |
| 8 | **PCStitch `.pat`** | Niche, declining | Opaque | Very high | Defer |
| 9 | **HobbyWare `.pat`** | Niche, declining | Opaque | Very high | Defer |
| 10 | **PatternKeeper internal SQLite** | High demand | Opaque (closed app) | Very high | Defer |
| 11 | **StitchFiddle / online tools JSON** | Sporadic | Trivial per-site | Per-site | **Reactive** — add adapters only when users hit us with real files |

---

## 5. Strategic implications for the architecture

1. **Treat OXS as the internal target.** Every parser writes into the same in-memory pattern model (the v8 project schema described in [import-1-existing-system.md](import-1-existing-system.md)) which is itself losslessly representable in OXS. This makes "export as OXS" a free feature and gives us a stable internal invariant to test against.

2. **PDF is not a format — it is four formats.** The PDF dispatcher must run a per-document classifier (vector / glyph / raster / hybrid) before picking a parser. A PDF importer architected as "one giant function" will collapse under publisher diversity.

3. **Publisher detection is cheap and worth doing.** Most publishers fingerprint themselves via `Producer`, `Creator`, footer text, and characteristic op signatures. Detect the publisher first, then route to the most specific parser available, falling back to the generic one. This lets us special-case DMC's art-line legend semantics without polluting the generic parser.

4. **Always run the legend extractor.** Every publisher includes a legend. Even when grid extraction fails, the legend gives us the palette we need to either (a) prompt the user to paint the chart manually with the right palette pre-loaded, or (b) constrain a fuzzy raster→DMC colour match to only those threads.

5. **Embrace the human-in-the-loop for the long tail.** For raster scans and unknown publishers, the realistic UX is "we extracted what we could; here is a side-by-side view; please correct ambiguous cells". This is consistent with how the existing image-based pattern generator already works.

6. **Don't speculatively support formats we cannot test.** Every importer must ship with at least one real-world test file. Speculative parsers rot.

---

## 6. References

- Embroidery Space organisation — open OXS / XSPro spec & parsers: <https://github.com/embroidery-space/>
  - `xsp-specs` (binary format documentation): <https://github.com/embroidery-space/xsp-specs>
  - `xsp-parsers` (Rust reference, archived): <https://github.com/embroidery-space/xsp-parsers>
  - `embroiderly` (cross-stitch design app, Rust, v0.7.1 Jan 2026): <https://github.com/embroidery-space/embroiderly>
- Mickey1992 — PDF → OXS converter (Java): <https://github.com/Mickey1992/stitch-pdf2oxs>
- pyembroidery (machine-embroidery formats reference): <https://github.com/EmbroidePy/pyembroidery>
- StitchFiddle (web-based charting tool): <https://www.stitchfiddle.com/>
- r/CrossStitch resources & FAQ: <https://www.reddit.com/r/CrossStitch/wiki/index/>
- DMC free pattern library (test corpus origin): <https://www.dmc.com/uk/dmc-library>
- Heaven and Earth Designs publisher: <https://www.heavenandearthdesigns.com/>
- Pattern Keeper community discussion (r/CrossStitch search): <https://www.reddit.com/r/CrossStitch/search/?q=pattern+keeper>
