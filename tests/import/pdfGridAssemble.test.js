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

/* A tile of `cols`x`rows` cells whose colour identifies it, so placement can be
 * checked by reading colours back out of the assembled grid. */
function tileOf(cols, rows, color, extra) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ col: c, row: r, color });
  }
  return Object.assign({ cells, grid: { cols, rows } }, extra || {});
}

describe('assembleTiles — tile count vs page marker', () => {
  it('uses the tile count, not the marker total, to size the layout', () => {
    // The gen-3 shape: 4 chart tiles inside a 38-page PDF. Trusting the marker
    // total would infer a 2x19 grid from 38 and scatter the tiles across it.
    const tiles = [
      tileOf(5, 5, [1, 0, 0], { marker: { idx: 1, total: 38 } }),
      tileOf(5, 5, [2, 0, 0], { marker: { idx: 2, total: 38 } }),
      tileOf(5, 5, [3, 0, 0], { marker: { idx: 3, total: 38 } }),
      tileOf(5, 5, [4, 0, 0], { marker: { idx: 4, total: 38 } }),
    ];
    const out = assembleTiles(tiles);
    expect(out.layout).toEqual({ rows: 2, cols: 2 });
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
    expect(out.cells.length).toBe(100);
  });

  it('warns when the marker total disagrees with the tile count', () => {
    const tiles = [
      tileOf(4, 4, [1, 0, 0], { marker: { idx: 1, total: 9 } }),
      tileOf(4, 4, [2, 0, 0], { marker: { idx: 2, total: 9 } }),
    ];
    const out = assembleTiles(tiles);
    expect(out.warnings.join(' ')).toMatch(/claim 9 pages but 2 chart tiles/);
  });

  it('orders tiles by page marker rather than array order', () => {
    const tiles = [
      tileOf(2, 1, [9, 9, 9], { marker: { idx: 2, total: 2 } }),
      tileOf(2, 1, [1, 1, 1], { marker: { idx: 1, total: 2 } }),
    ];
    const out = assembleTiles(tiles);
    const at = (col) => out.cells.find(c => c.col === col && c.row === 0).color[0];
    expect(at(0)).toBe(1); // marker idx 1 placed first
    expect(at(2)).toBe(9);
  });

  it('notes when only some tiles carry a marker', () => {
    const tiles = [
      tileOf(2, 2, [1, 0, 0], { marker: { idx: 1, total: 2 } }),
      tileOf(2, 2, [2, 0, 0]),
    ];
    expect(assembleTiles(tiles).warnings.join(' ')).toMatch(/Only 1 of 2 tiles carry a page marker/);
  });
});

describe('assembleTiles — non-uniform tiles', () => {
  it('aligns a short remainder column instead of assuming uniform width', () => {
    // Two columns: full tiles 5 wide, remainder 2 wide. Row 2's tiles must start
    // at the same columns as row 1's.
    const tiles = [
      tileOf(5, 4, [1, 0, 0]), tileOf(2, 4, [2, 0, 0]),
      tileOf(5, 4, [3, 0, 0]), tileOf(2, 4, [4, 0, 0]),
    ];
    const out = assembleTiles(tiles, { layout: { rows: 2, cols: 2 } });
    expect(out.width).toBe(7);
    expect(out.height).toBe(8);
    // The remainder column starts at column 5 on both rows.
    expect(out.cells.find(c => c.col === 5 && c.row === 0).color[0]).toBe(2);
    expect(out.cells.find(c => c.col === 5 && c.row === 4).color[0]).toBe(4);
    // No gap where a uniform-width assumption would have left one.
    expect(out.cells.filter(c => c.row === 0)).toHaveLength(7);
  });

  it('aligns a short bottom row', () => {
    const tiles = [
      tileOf(4, 5, [1, 0, 0]), tileOf(4, 5, [2, 0, 0]),
      tileOf(4, 2, [3, 0, 0]), tileOf(4, 2, [4, 0, 0]),
    ];
    const out = assembleTiles(tiles, { layout: { rows: 2, cols: 2 } });
    expect(out.height).toBe(7);
    expect(out.cells.find(c => c.col === 0 && c.row === 5).color[0]).toBe(3);
  });

  it('sizes each column to its widest tile', () => {
    // A narrow tile in an otherwise wide column must not pull the next column in.
    const tiles = [
      tileOf(3, 2, [1, 0, 0]), tileOf(4, 2, [2, 0, 0]),
      tileOf(5, 2, [3, 0, 0]), tileOf(4, 2, [4, 0, 0]),
    ];
    const out = assembleTiles(tiles, { layout: { rows: 2, cols: 2 } });
    // Column 0 is sized by the 5-wide tile, so column 1 begins at 5.
    expect(out.cells.find(c => c.col === 5 && c.row === 0).color[0]).toBe(2);
  });
});

describe('assembleTiles — layout source', () => {
  it('prefers an explicit layout and does not warn about guessing', () => {
    const tiles = [tileOf(3, 3, [1, 0, 0]), tileOf(3, 3, [2, 0, 0]),
                   tileOf(3, 3, [3, 0, 0]), tileOf(3, 3, [4, 0, 0])];
    const out = assembleTiles(tiles, { layout: { rows: 1, cols: 4 } });
    expect(out.layoutSource).toBe('explicit');
    expect(out.width).toBe(12);
    expect(out.warnings.join(' ')).not.toMatch(/inferred/);
  });

  it('flags an inferred layout as unconfirmed', () => {
    const tiles = [tileOf(2, 2, [1, 0, 0]), tileOf(2, 2, [2, 0, 0]),
                   tileOf(2, 2, [3, 0, 0]), tileOf(2, 2, [4, 0, 0]),
                   tileOf(2, 2, [5, 0, 0]), tileOf(2, 2, [6, 0, 0])];
    const out = assembleTiles(tiles);
    expect(out.layoutSource).toBe('inferred');
    expect(out.warnings.join(' ')).toMatch(/inferred/);
  });

  it('warns when an explicit layout cannot hold every tile', () => {
    const tiles = [tileOf(2, 2, [1, 0, 0]), tileOf(2, 2, [2, 0, 0]), tileOf(2, 2, [3, 0, 0])];
    const out = assembleTiles(tiles, { layout: { rows: 1, cols: 2 } });
    expect(out.warnings.join(' ')).toMatch(/fewer cells than the 3 tiles/);
  });

  it('returns an empty result for no tiles', () => {
    const out = assembleTiles([]);
    expect(out).toEqual(expect.objectContaining({ width: 0, height: 0, cells: [], layoutSource: 'none' }));
  });
});

describe('assembleTiles — explicit offsets', () => {
  it('places pages at their stated offsets, ignoring layout inference', () => {
    // What axis-ruler reading produces: each page already knows where it belongs,
    // including a remainder column that is not a multiple of the tile width.
    const tiles = [
      tileOf(5, 4, [1, 0, 0], { offset: { col: 0, row: 0 } }),
      tileOf(3, 4, [2, 0, 0], { offset: { col: 5, row: 0 } }),
      tileOf(5, 4, [3, 0, 0], { offset: { col: 0, row: 4 } }),
      tileOf(3, 4, [4, 0, 0], { offset: { col: 5, row: 4 } }),
    ];
    const out = assembleTiles(tiles);
    expect(out.layoutSource).toBe('offsets');
    expect(out.width).toBe(8);
    expect(out.height).toBe(8);
    expect(out.cells.find(c => c.col === 5 && c.row === 4).color[0]).toBe(4);
  });

  it('lets overlapping offsets collapse onto the same cell', () => {
    // Page-break overlap: two pages that both describe column 2.
    const tiles = [
      tileOf(3, 1, [1, 0, 0], { offset: { col: 0, row: 0 } }),
      tileOf(3, 1, [2, 0, 0], { offset: { col: 2, row: 0 } }),
    ];
    const out = assembleTiles(tiles);
    expect(out.width).toBe(5);
    expect(out.cells).toHaveLength(5);
  });

  it('keeps the better-matched reading where two pages overlap', () => {
    const a = tileOf(2, 1, [1, 0, 0], { offset: { col: 0, row: 0 } });
    const b = tileOf(2, 1, [2, 0, 0], { offset: { col: 1, row: 0 } });
    a.cells.forEach(c => { c.matchConfidence = 0.9; });
    b.cells.forEach(c => { c.matchConfidence = 0.2; });
    const out = assembleTiles([a, b]);
    expect(out.cells.find(c => c.col === 1).color[0]).toBe(1);
  });
});

describe('assembleTiles — overlap removal', () => {
  it('removes repeated columns at the page break', () => {
    // Two 5-wide tiles sharing a 2-column repeat make a 8-wide chart, not 10.
    const tiles = [tileOf(5, 3, [1, 0, 0]), tileOf(5, 3, [2, 0, 0])];
    const out = assembleTiles(tiles, { layout: { rows: 1, cols: 2 }, overlap: { cols: 2 } });
    expect(out.width).toBe(8);
  });

  it('removes repeated rows at the page break', () => {
    const tiles = [tileOf(3, 5, [1, 0, 0]), tileOf(3, 5, [2, 0, 0])];
    const out = assembleTiles(tiles, { layout: { rows: 2, cols: 1 }, overlap: { rows: 1 } });
    expect(out.height).toBe(9);
  });
});

describe('bestOverlap', () => {
  const { bestOverlap } = ENGINE;

  // Build two tiles where B's first `rep` columns repeat A's last `rep`.
  function pair(cols, rows, rep) {
    const colour = (c, r) => [(c * 7 + r * 3) % 255, (c * 11) % 255, (r * 5) % 255];
    const a = { grid: { cols, rows }, cells: [] };
    const b = { grid: { cols, rows }, cells: [] };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) a.cells.push({ col: c, row: r, color: colour(c, r) });
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // B's column c corresponds to A's column (cols - rep + c).
        b.cells.push({ col: c, row: r, color: colour(cols - rep + c, r) });
      }
    }
    return [a, b];
  }

  it('finds a 2-column repeat', () => {
    const [a, b] = pair(8, 6, 2);
    expect(bestOverlap(a, b, 'horizontal', 5).overlap).toBe(2);
  });

  it('finds a 3-column repeat', () => {
    const [a, b] = pair(9, 5, 3);
    expect(bestOverlap(a, b, 'horizontal', 5).overlap).toBe(3);
  });

  it('reports no overlap for tiles that do not repeat', () => {
    const a = { grid: { cols: 4, rows: 2 }, cells: [] };
    const b = { grid: { cols: 4, rows: 2 }, cells: [] };
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        a.cells.push({ col: c, row: r, color: [10, 20, 30] });
        b.cells.push({ col: c, row: r, color: [200, 180, 160] });
      }
    }
    expect(bestOverlap(a, b, 'horizontal', 5).overlap).toBe(0);
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
