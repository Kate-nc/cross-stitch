# Reference — DMC Free Pattern PDF Format

> Format spec for the resources/references system. This document
> describes the structural conventions of DMC's free pattern library
> PDFs (`https://www.dmc.com/uk/dmc-library`) so that future parsers,
> contributors, or AI agents can reason about the format without
> re-deriving everything from raw operator dumps.
>
> Authored from a corpus of two PDFs (PAT1968_2 "Moonlight" 2023, and
> PAT2171_2 "Jay Feather" 2025); see [import-2-dmc-file-analysis.md](import-2-dmc-file-analysis.md)
> for the underlying analysis.
>
> **Status: descriptive, not authoritative.** DMC has not published a
> spec; conventions may change without notice. Re-validate against new
> samples before relying on any single rule.

---

## 1. Identification

A PDF is a "DMC publisher PDF" if **all** of the following hold:

| Field | Value | Where to read it |
|---|---|---|
| Producer | starts with `Adobe PDF Library` | `pdfDocument.getMetadata().info.Producer` |
| Creator | starts with `Adobe InDesign` | `pdfDocument.getMetadata().info.Creator` |
| Footer text | every page contains `dmc library - bibliothèque dmc` and `www.dmc.com © <year>` | `page.getTextContent()` long-text scan |
| Hashtag block | every page contains `#dmcthreads` (and on newer files `#dmcembroidery`, `#dmcfreepatterns`) | as above |
| Page size | A4 portrait, 595.3 × 841.9 pt | `page.getViewport({ scale: 1 })` |
| Encryption | none — `EncryptFilterName: null`, `IsAcroFormPresent: false`, `IsXFAPresent: false` | metadata |

Producer/Creator alone are not enough — many other publishers also use Adobe InDesign + the Adobe PDF Library. The footer text is the canonical fingerprint.

---

## 2. Page roles

Every page in a DMC PDF plays one of five roles. The publisher does not include role markers in the file structure; the role must be inferred from page content.

| Role | Op-stream signature | Text signature |
|---|---|---|
| **Title page** (Layout B only) | 1–2 `paintImageXObject`, low fill / rect counts, often skewed single-character text from rotated typography | Design title in 2–3 languages; year copyright; `1/N` page marker |
| **Chart — colour fill layer** | `setFillRGBColor` cardinality > 50; `rect` count > 1 000; `paintImageXObject` count = 0 | Page marker, footer, occasional title repeated |
| **Chart — backstitch / specialty layer** (Layout A only) | Same `lineTo` count as the corresponding colour-fill page; `setFillRGBColor` cardinality ≤ 10; high `stroke` count | Page marker, footer |
| **Getting started / tool kit** | Few fills, mostly text. Multilingual paragraph blocks. | `tool kit / fournitures`, `design size / dimensions dessin`, `the size of your design depends on the cross stitch fabric` |
| **Legend / colour key** | Moderate fill count (< 200) for the swatch column; many text items | `symbol / symbole`, `colour / couleur`, `nº skeins / d'échevettes` (or `points / stitches / puntos`); `cross stitch / point de croix`; `backstitch / point arrière`; `Use N strands / Utiliser N brins` |

Role distribution in observed corpus:

| Layout | Pages | Role mapping |
|---|---|---|
| **A** (PAT1968) | 4 | 1 = chart-colour, 2 = chart-backstitch, 3 = instructional, 4 = legend |
| **B** (PAT2171) | 3 | 1 = title (with raster preview), 2 = instructional, 3 = chart + legend combined |

---

## 3. Chart rendering — vector cells, not glyphs

Every stitched cell is a filled rectangle in the PDF content stream:

```
... save, transform <CTM>, setFillRGBColor r g b, constructPath [rectangle x y w h],
fill, restore ...
```

**Critical implications**:

- The chart is **not** OCR-able as glyphs. There are no symbol characters in a DMC chart page; trying to use a glyph-symbol parser will yield zero cells.
- The chart is **not** rasterised. Saving the page as PNG and image-processing it discards exact RGB and exact cell geometry — both of which are available losslessly from the operator stream.
- **Background / unstitched cells are not drawn.** Only stitched cells emit a rectangle. The grid origin and cell size must be inferred from the cells that do exist.

### 3.1 Inferring the grid

1. Collect all filled rectangles' bottom-left coordinates `(x_i, y_i)` and sizes `(w_i, h_i)`.
2. Take the modal `w_i` and `h_i` — this is the cell pitch (typically 7–9 pt for a Layout-A chart on A4).
3. Take the minimum `x` and minimum `y` — this is the chart origin in PDF user space.
4. Each cell's grid coordinate is `(round((x_i - x_min) / w), round((y_i - y_min) / h))`. PDF y increases upward; flip to top-down before writing to the internal model.

### 3.2 Two-layer charts (Layout A)

When two adjacent pages share the **identical `lineTo` op count** but one is high-`setFillRGBColor` and the other is high-`stroke`, treat them as one chart with two layers:

- Page N (low `setFillRGBColor` … typically just 7) = grid-only / backstitch layer.
- Page N−1 or N+1 (high `setFillRGBColor`) = colour-fill layer.

Their cell geometries are guaranteed to align. Merge by taking colour cells from the colour layer and stroke segments from the backstitch layer.

---

## 4. Legend table

The legend is a small vector table. It carries:

| Column | Rendering | How to read |
|---|---|---|
| Symbol | A small filled rectangle drawn at row's `y` coordinate | Read the `setFillRGBColor` of the cell whose centre lies in the row's vertical band |
| DMC code | Plain text | `\d{2,5}` or `[BDE]\d{3,4}` (see §5) |
| Colour name | (optional, rare in DMC publisher PDFs) | Plain text after the code |
| Skein / stitch count | `x1`, `x2`, … (Layout A) **or** integer count (Layout B `points/stitches/puntos` column) | Plain text in the rightmost column |

Above each legend sub-table, two labels appear:

1. **Art-line header**, e.g. `dmc mouliné spécial art.117`, `dmc perlé metallisé 315`, `dmc diamant art.380`, `dmc mouliné light effect thread art.317w`. **Propagate this header to every row beneath it** — it determines which DMC catalogue the codes resolve against.
2. **Stitch-type group label**, in 2–3 languages, e.g. `cross stitch / point de croix / punto cruz`, `backstitch / point arrière / punto atrás`. Determines the stitch-type assigned to the legend rows beneath it.
3. **Strand count label** beneath the group label, e.g. `Use 3 strands - Utiliser 3 brins`, `Use 1 strand`. Applies to all rows in the group.

### 4.1 Footnote

A footnote like `* Based on stitching with the number of strands shown above, onto 14 count Aida.` appears at the bottom. It documents that the skein count assumes 14ct Aida. Useful for the importer's metadata pane.

---

## 5. DMC code formats

The DMC code regex must be permissive enough to cover all observed prefixes:

| Pattern | Examples seen | Meaning |
|---|---|---|
| `\d{2,5}` | `09`, `310`, `930`, `5852` | Standard mouliné and other catalogue codes |
| `B\d{3,4}` | `B5200` | Mouliné Spécial blanc (Snow White) |
| `D\d{2,4}` | `D225` | Diamant (art. 380) |
| `E\d{3,4}` | `E334`, `E825`, `E3843` | Light Effects (art. 317w) |
| `(?:ECRU\|BLANC(?:\s+NEIGE)?)` | not in this corpus but documented elsewhere | Special named colours |

Codes prefixed with **leading `5`** (`5310`, `5283`, `5317`, `5852`) are not a regex pattern — they are full Perlé Metallisé (art. 315) catalogue numbers. The art-line header above the row is what disambiguates them, **not** the code's prefix.

A naive `\b\d{3}\b` regex (sometimes seen in PDF→pattern tools) will **silently miss valid codes** like `09` and `B5200`. Do not use it.

---

## 6. Multilingual labels

DMC publisher PDFs are bilingual (EN/FR) on older designs and trilingual (EN/FR/ES) from approximately 2024 onwards. Label equivalence classes the parser must recognise:

| English | French | Spanish |
|---|---|---|
| cross stitch | point de croix | punto cruz |
| backstitch / back stitch | point arrière | punto atrás |
| half cross stitch | demi point de croix | medio punto cruz |
| symbol | symbole | símbolo |
| colour | couleur | color |
| skein(s) | échevette(s) | madeja(s) |
| stitches | points | puntos |
| use N strands | utiliser N brins / utilisez N brins | usar N hebras / utilizar N hebras |
| getting started | commencer | empezar |
| tool kit | fournitures | materiales |
| design size | dimensions dessin | dimensiones diseño |
| pearl cotton | coton perlé | algodón perlé |
| metallic pearl | perlé metallisé | perlé metalizado |

The translations are not always idiomatic and the punctuation between language pairs is inconsistent (`/`, `-`, line break). Parsers should normalise to lower-case and strip punctuation before matching.

---

## 7. Page-marker token

Every page carries a `N/M` token in its long-text stream (`"1/4"`, `"2/4"`, …, `"3/3"`). Match with:

```js
/^\s*(\d+)\s*\/\s*(\d+)\s*$/
```

This token is the most reliable way to determine the chart's page span and is present even on the title and instructional pages. The token's position is consistently in the page header row at approximately `y = 802` (for A4 portrait).

---

## 8. Embedded images (Layout B)

Layout B title pages embed two images:

- **DMC logo** — small, top-left or top-centre, JPEG or DCTDecode-stream. Always present on title page.
- **Marketing photo** — large, occupies most of the page, shows the finished design. Dimensions vary.

These can be extracted with `paintImageXObject` resolution if the importer wants to capture a thumbnail for the project metadata. Otherwise they are decorative and may be skipped.

Layout A has no embedded images at all.

---

## 9. Metadata fields the importer can populate

From the structures above, an importer can extract:

| Internal field | Source |
|---|---|
| `name` | Design title (first non-page-marker, non-footer multilingual long-text run on the title or chart page, first language token before the `/` separator) |
| `designer` | Always "DMC" for this publisher (publisher = designer for DMC's free library) |
| `copyright` | The footer year (`www.dmc.com © 2023`) |
| `settings.fabricCt` | From `aida 5,5 pts/cm - aida 14 ct` or `14 count aida` text in the instructional page (default 14 if absent) |
| `settings.fabricSku` | From `GD1436BXA COL.336` or `GD1436BXI col.4015` in the instructional page (DMC SKUs follow `GD\d{4}[A-Z]{3} col\.\d+`) |
| `w`, `h` | Inferred from the chart page's cell coordinates (max grid x + 1, max grid y + 1) |
| `pattern` | Cell array from chart-page extraction |
| `bsLines` | Backstitch segment array from the backstitch-layer extraction (Layout A) or from the chart page's stroke ops (Layout B) |
| `palette` (intermediate, not in v8 schema) | Legend rows, art-line aware |
| `metadata.designSize` | `18 cm / 7 ''` or `14 x 13 cm / 5.51 x 5.11 in` from instructional page |
| `metadata.languages` | Set of languages detected from label tokens (`['en', 'fr']` or `['en', 'fr', 'es']`) |

---

## 10. Known parser pitfalls (DMC-specific)

These are the failures the corpus analysis predicts a naive parser will hit:

1. **Wrong page assumed to be the chart.** Layout A's chart is on page 1 *and* page 2; Layout B's chart is on page 3. A "chart is on page 1" assumption fails on Layout B. Use op-density classification per page.
2. **Two-layer chart imported as two patterns.** Without the `lineTo`-equality + `setFillRGBColor`-cardinality check, Layout A's pages 1 and 2 look like two distinct charts.
3. **Code `5310` resolved to a non-existent regular DMC mouliné.** Without art-line propagation from the `dmc perlé metallisé 315` header, the parser will look up `5310` in the wrong catalogue and either produce a phantom thread or drop the cells.
4. **Two-digit code `09` ignored.** A `\b\d{3}\b` filter rejects this. Use `\d{2,5}` plus the prefix patterns from §5.
5. **Rotated typography mistaken for chart glyphs.** Layout B's title page has 40 single-character text items from vertical typesetting. Filter by transform skew (§2.3 of [import-4-parsing-techniques.md](import-4-parsing-techniques.md)).
6. **Trilingual title concatenated.** `"plume de geai / jay feather / pluma de jay"` — split on `/` and trim before assigning to `name`. Pick the user's preferred language if available, else English.
7. **DMC SKU mistaken for a code.** `GD1436BXA COL.336` looks like it might contain a code. Parse the instructional page with awareness that this string is a fabric SKU.
8. **PDF y-axis not flipped.** PDF coordinates have origin at bottom-left. The internal pattern model has origin at top-left. Flip in the cell-to-grid conversion step, not after.
9. **Per-page resource leak.** Always call `page.cleanup()` after extracting; `doc.destroy()` when done. DMC PDFs are small but the importer must work for HAED-style 200-page documents under the same code path.
10. **Assuming the legend lists colour names.** DMC publisher PDFs do **not** include human-readable colour names in the legend (only codes). Do not show `"310 - Black"` in the import preview unless the parser cross-references the in-app DMC catalogue ([dmc-data.js](../dmc-data.js)).
