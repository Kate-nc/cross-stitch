/* tests/pdfImporterYBucket.test.js — Cat B-lite Y-bucket extractSymbols.
 *
 * Verifies that the new bucket-based candidate lookup in extractSymbols
 * produces the same symbol grid as the original O(N) Array.find scan.
 *
 * We extract the helper + the new extractSymbols method by reading
 * pdf-importer.js and evaluating just enough of the class to call
 * extractSymbols against a synthetic page.
 */

const fs = require('fs');
const path = require('path');

function loadImporterClass() {
  const raw = fs.readFileSync(path.resolve(__dirname, '..', 'pdf-importer.js'), 'utf8');
  // Strip the PdfLoader bits that reference pdfjsLib + the import() that uses
  // arrayBuffer(). The class declarations are top-level — we need a stub
  // pdfjsLib so the OPS references in extractVectorPaths don't crash when
  // the class body is parsed (they only run when extractVectorPaths is
  // called, which we don't do here, but defensively):
  global.pdfjsLib = {
    OPS: new Proxy({}, { get: () => -1 }),
    GlobalWorkerOptions: { workerSrc: '' },
  };
  // eslint-disable-next-line no-eval
  eval(raw + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}

describe('PatternKeeperImporter — Y-bucket extractSymbols (Cat B-lite)', () => {
  const PatternKeeperImporter = loadImporterClass();

  function makeChartPage(pageIndex, rows, cols, cellWidth, cellHeight, originX, originY) {
    const textItems = [];
    // Each cell gets a single-character symbol "A" through "Z" cycled
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = originX + c * cellWidth + cellWidth / 2;
        const cy = originY + r * cellHeight + cellHeight / 2;
        textItems.push({
          str: String.fromCharCode(65 + ((r * cols + c) % 26)),
          x: cx - 2,
          y: cy + 2, // baseline-ish
          width: 4,
          height: 4,
          fontName: 'TestFont',
          fontSize: 4,
        });
      }
    }
    return {
      pageIndex,
      width: 612,
      height: 792,
      vectorPaths: [],
      textItems,
      fonts: [],
    };
  }

  it('places every cell in a small chart', async () => {
    const importer = new PatternKeeperImporter();
    const page = makeChartPage(1, 5, 5, 10, 10, 100, 100);
    const layout = {
      totalColumns: 5,
      totalRows: 5,
      pages: [{
        pageIndex: 1,
        grid: { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 5, rows: 5 },
        globalOffsetCol: 0,
        globalOffsetRow: 0,
      }],
    };
    const symbols = await importer.extractSymbols([page], layout);
    expect(symbols).toHaveLength(25);
    // First cell should have 'A'
    expect(symbols[0].symbol).toBe('A');
    expect(symbols[0].col).toBe(0);
    expect(symbols[0].row).toBe(0);
    // Last cell row=4, col=4, idx = 24, char (4*5+4)%26 = 24 -> 'Y'
    expect(symbols[24].symbol).toBe('Y');
    expect(symbols[24].col).toBe(4);
    expect(symbols[24].row).toBe(4);
    // No empty cells expected
    expect(symbols.filter(s => s.isEmpty)).toHaveLength(0);
  });

  it('handles a chart with mixed empty cells', async () => {
    const importer = new PatternKeeperImporter();
    const page = makeChartPage(1, 4, 4, 10, 10, 50, 50);
    // Drop half the text items to simulate empty cells
    page.textItems = page.textItems.filter((_, i) => i % 2 === 0);
    const layout = {
      totalColumns: 4,
      totalRows: 4,
      pages: [{
        pageIndex: 1,
        grid: { originX: 50, originY: 50, cellWidth: 10, cellHeight: 10, columns: 4, rows: 4 },
        globalOffsetCol: 0,
        globalOffsetRow: 0,
      }],
    };
    const symbols = await importer.extractSymbols([page], layout);
    expect(symbols).toHaveLength(16);
    // Should have 8 non-empty + 8 empty
    expect(symbols.filter(s => !s.isEmpty)).toHaveLength(8);
    expect(symbols.filter(s => s.isEmpty)).toHaveLength(8);
  });

  it('detects coloured fill paths when no text item is present', async () => {
    const importer = new PatternKeeperImporter();
    const page = {
      pageIndex: 1,
      width: 612,
      height: 792,
      vectorPaths: [{
        type: 'rect',
        // Centroid at (105, 105)
        points: [
          { x: 100, y: 100 },
          { x: 110, y: 100 },
          { x: 110, y: 110 },
          { x: 100, y: 110 },
        ],
        fillColor: [255, 0, 0],
        lineWidth: 1,
      }],
      textItems: [],
      fonts: [],
    };
    const layout = {
      totalColumns: 1,
      totalRows: 1,
      pages: [{
        pageIndex: 1,
        grid: { originX: 100, originY: 100, cellWidth: 10, cellHeight: 10, columns: 1, rows: 1 },
        globalOffsetCol: 0,
        globalOffsetRow: 0,
      }],
    };
    const symbols = await importer.extractSymbols([page], layout);
    expect(symbols).toHaveLength(1);
    expect(symbols[0].isEmpty).toBe(false);
    expect(symbols[0].fillColor).toEqual([255, 0, 0]);
  });

  it('respects globalOffsetCol/Row for multi-page layouts', async () => {
    const importer = new PatternKeeperImporter();
    const page1 = makeChartPage(1, 2, 2, 10, 10, 0, 0);
    const page2 = makeChartPage(2, 2, 2, 10, 10, 0, 0);
    const layout = {
      totalColumns: 4,
      totalRows: 2,
      pages: [
        { pageIndex: 1, grid: { originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, columns: 2, rows: 2 }, globalOffsetCol: 0, globalOffsetRow: 0 },
        { pageIndex: 2, grid: { originX: 0, originY: 0, cellWidth: 10, cellHeight: 10, columns: 2, rows: 2 }, globalOffsetCol: 2, globalOffsetRow: 0 },
      ],
    };
    const symbols = await importer.extractSymbols([page1, page2], layout);
    expect(symbols).toHaveLength(8);
    // Page 2 cells should be offset
    const p2cells = symbols.filter(s => s.col >= 2);
    expect(p2cells).toHaveLength(4);
    expect(p2cells[0].col).toBe(2);
  });

  it('Y-bucket lookup returns empty list for far-out coordinates', () => {
    const importer = new PatternKeeperImporter();
    const buckets = importer._buildYBuckets(
      [{ y: 50 }, { y: 60 }, { y: 70 }],
      it => it.y,
      10
    );
    expect(buckets.lookup(50)).toEqual(expect.arrayContaining([{ y: 50 }, { y: 60 }]));
    expect(buckets.lookup(1000)).toEqual([]);
    expect(buckets.lookup(NaN)).toEqual([]);
    expect(buckets.lookup(Infinity)).toEqual([]);
  });

  it('Y-bucket skips non-finite Y values without crashing', () => {
    const importer = new PatternKeeperImporter();
    const buckets = importer._buildYBuckets(
      [{ y: 50 }, { y: NaN }, { y: Infinity }, { y: 60 }],
      it => it.y,
      10
    );
    // Lookup at y=50 should find y=50 and y=60 (within ±1 bin), but not the bad ones
    const found = buckets.lookup(50);
    expect(found).toContainEqual({ y: 50 });
    expect(found).toContainEqual({ y: 60 });
    expect(found.find(it => Number.isNaN(it.y))).toBeUndefined();
  });
});
