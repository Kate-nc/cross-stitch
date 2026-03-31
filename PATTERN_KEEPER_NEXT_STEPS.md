# Pattern Keeper PDF Compatibility — Phase 5-8 Implementation Plan

Now that the core single-page PDF parsing, grid detection, and legend extraction pipeline is integrated, the following phases should be completed to reach full Pattern Keeper compatibility.

## Phase 5: Multi-page grid stitching
- Update `PatternKeeperImporter` in `import-formats.js` to process **all** chart pages instead of just the first one.
- Implement an edge-matching algorithm to align adjacent pages by comparing overlapping margin rows/columns.
- Calculate a global bounding box and adjust the `row` and `col` values of all `CellData` objects to fall within this single, unified grid.

## Phase 6: Thread legend robustness
- Some PDFs spread the legend across multiple pages or format it in non-standard tabular blocks.
- Enhance `PdfLegendParser.parseLegend` to group items horizontally using bounding boxes rather than relying purely on text baseline Y-coordinates to handle misaligned fonts.
- Add support for detecting half/quarter stitch modifiers in the legend text, and mapping those to the app's internal `type` property (e.g., `"half"`, `"quarter_tl"`).

## Phase 7: UI Enhancements and Manual Overrides
- When `PdfGridDetector` fails, prompt the user with a UI modal to manually define the grid (Origin X/Y, rows, columns). This involves rendering the PDF page to a canvas and overlaying a draggable grid.
- Add a progress bar overlay during the `PdfLoader.load` step, as parsing large 50+ page PDFs will block the UI for several seconds. `PatternKeeperImporter.import` should accept a progress callback.

## Phase 8: Advanced symbol mapping (Custom fonts)
- Currently, `PdfSymbolExtractor` assumes text output corresponds to simple Unicode characters. Many older cross-stitch software exports use subset custom fonts.
- Intercept the PDF.js font dictionaries during loading to extract the specific glyph-to-unicode mappings.
- Implement a fallback where, if a character code cannot be resolved, the raw vector glyph is extracted and rendered as an SVG path inside the app's `Tracker` canvas instead of a plain text character.