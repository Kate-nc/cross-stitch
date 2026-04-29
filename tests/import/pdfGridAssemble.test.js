/* tests/import/pdfGridAssemble.test.js — Unit 8. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { detectPitch, snapToGrid, matchToLegend,
        parsePageMarker, inferTileLayout, assembleTiles, edgeOverlapScore } = ENGINE;

// Generate a synthetic chart of N×M cells at a given pitch.
function makeRects(cols, rows, pitch, originX = 100, originY = 100, color = [200, 0, 0]) {
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        kind: 'fillRect',
        x: originX + c * pitch,
        y: originY + r * pitch,
        w: pitch,
        h: pitch,
        color,
      });
    }
  }
  return rects;
}

describe('detectPitch', () => {
  it('detects a regular 10-unit pitch', () => {
    const rects = makeRects(8, 6, 10);
    const grid = detectPitch(rects);
    expect(grid.pitchX).toBeCloseTo(10, 1);
    expect(grid.pitchY).toBeCloseTo(10, 1);
    expect(grid.cols).toBe(8);
    expect(grid.rows).toBe(6);
  });

  it('returns zero pitch for too few rects', () => {
    expect(detectPitch([{ x: 0, y: 0, w: 1, h: 1 }])).toEqual(
      expect.objectContaining({ pitchX: 0, pitchY: 0 })
    );
  });
});

describe('snapToGrid', () => {
  it('maps every rect to a unique (col,row) cell', () => {
    const rects = makeRects(4, 3, 10);
    const grid = detectPitch(rects);
    const cells = snapToGrid(rects, grid);
    expect(cells).toHaveLength(12);
    const keys = new Set(cells.map(c => `${c.col},${c.row}`));
    expect(keys.size).toBe(12);
    expect(cells.every(c => c.type === 'full')).toBe(true);
  });

  it('classifies a half-cell by aspect ratio', () => {
    const grid = { pitchX: 10, pitchY: 10, originX: 0, originY: 0, cols: 1, rows: 1 };
    const cells = snapToGrid([{ x: 0, y: 0, w: 5, h: 10, color: [0, 0, 0] }], grid);
    expect(cells[0].type).toBe('half');
  });
});

describe('matchToLegend', () => {
  it('exact-matches cells whose colour is in the legend', () => {
    const cells = [{ col: 0, row: 0, color: [255, 0, 0] }];
    const legend = { rows: [{ code: '321', rgb: [255, 0, 0] }] };
    const matched = matchToLegend(cells, legend, []);
    expect(matched[0].code).toBe('321');
    expect(matched[0].matchKind).toBe('legend-exact');
    expect(matched[0].matchConfidence).toBe(1.0);
  });

  it('nearest-matches close legend colour', () => {
    const cells = [{ col: 0, row: 0, color: [254, 1, 1] }];
    const legend = { rows: [{ code: '321', rgb: [255, 0, 0] }] };
    const matched = matchToLegend(cells, legend, []);
    expect(matched[0].matchKind).toBe('legend-nearest');
    expect(matched[0].matchConfidence).toBeCloseTo(0.95, 2);
  });

  it('falls back to DMC palette when legend has no rgb', () => {
    const cells = [{ col: 0, row: 0, color: [10, 10, 10] }];
    const matched = matchToLegend(cells, { rows: [] }, [{ id: '310', rgb: [0, 0, 0] }]);
    expect(matched[0].matchKind).toBe('dmc-fallback');
    expect(matched[0].matchConfidence).toBe(0.5);
  });

  it('reports unknown when nothing matches', () => {
    const matched = matchToLegend([{ color: [50, 50, 50] }], { rows: [] }, []);
    expect(matched[0].matchKind).toBe('unknown');
  });
});

describe('parsePageMarker', () => {
  it('parses N/M', () => {
    expect(parsePageMarker('1/4')).toEqual({ idx: 1, total: 4 });
    expect(parsePageMarker('Page 3 of 8')).toEqual({ idx: 3, total: 8 });
    expect(parsePageMarker('page 2 sur 4')).toEqual({ idx: 2, total: 4 });
  });
  it('returns null for unparseable text', () => {
    expect(parsePageMarker('hello')).toBeNull();
    expect(parsePageMarker('')).toBeNull();
  });
});

describe('inferTileLayout', () => {
  it('finds 2×2 for 4', () => expect(inferTileLayout(4, 1)).toEqual({ rows: 2, cols: 2 }));
  it('finds 3×2 for 6 with wide aspect', () => expect(inferTileLayout(6, 2)).toEqual({ rows: 2, cols: 3 }));
  it('returns 1×1 for 1', () => expect(inferTileLayout(1, 1)).toEqual({ rows: 1, cols: 1 }));
});

describe('assembleTiles', () => {
  it('assembles a 2×2 set of tiles into a single grid', () => {
    function tile(idx, total, color) {
      const rects = makeRects(4, 4, 10);
      const grid = detectPitch(rects);
      const cells = snapToGrid(rects, grid).map(c => Object.assign(c, { color }));
      return { cells, grid, marker: { idx, total } };
    }
    const tiles = [
      tile(1, 4, [200, 0, 0]),
      tile(2, 4, [0, 200, 0]),
      tile(3, 4, [0, 0, 200]),
      tile(4, 4, [200, 200, 0]),
    ];
    const out = assembleTiles(tiles);
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(out.cells.length).toBe(64);
  });

  it('returns the single tile unchanged when total=1', () => {
    const rects = makeRects(3, 2, 10);
    const grid = detectPitch(rects);
    const cells = snapToGrid(rects, grid);
    const out = assembleTiles([{ cells, grid }]);
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect(out.cells.length).toBe(6);
  });
});

describe('edgeOverlapScore', () => {
  it('returns low score for tiles with matching edges', () => {
    const make = c => {
      const rects = makeRects(4, 4, 10, 0, 0, c);
      const grid = detectPitch(rects);
      return { cells: snapToGrid(rects, grid), grid };
    };
    const a = make([100, 100, 100]);
    const b = make([100, 100, 100]);
    expect(edgeOverlapScore(a, b, 1, 'horizontal')).toBe(0);
  });
});
