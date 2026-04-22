/* tests/pdfChartLayout.test.js
 * Pure-JS tests for the layout helpers shared by the PDF export worker and the
 * Export panel preview.
 */
const layout = require('../creator/pdfChartLayout.js');

describe('resolvePageSize', () => {
  test('honours explicit overrides', () => {
    expect(layout.resolvePageSize('a4', 'en-US')).toBe('a4');
    expect(layout.resolvePageSize('letter', 'en-GB')).toBe('letter');
  });

  test('auto picks letter for en-US / en-CA', () => {
    expect(layout.resolvePageSize('auto', 'en-US')).toBe('letter');
    expect(layout.resolvePageSize('auto', 'en-CA')).toBe('letter');
  });

  test('auto defaults to A4 elsewhere', () => {
    expect(layout.resolvePageSize('auto', 'en-GB')).toBe('a4');
    expect(layout.resolvePageSize('auto', 'fr-FR')).toBe('a4');
    expect(layout.resolvePageSize('auto', '')).toBe('a4');
  });
});

describe('computePageGeometry', () => {
  test('A4 medium → cellMm close to 2.8mm and grid in tens', () => {
    const g = layout.computePageGeometry({ pageSize: 'a4', marginsMm: 12, stitchesPerPage: 'medium' });
    expect(g.pageSize).toBe('a4');
    expect(g.colsPerPage % 10).toBe(0);
    expect(g.rowsPerPage % 10).toBe(0);
    expect(g.colsPerPage).toBeGreaterThanOrEqual(60);
    expect(g.cellMm).toBeGreaterThan(2.5);
    expect(g.cellMm).toBeLessThanOrEqual(3.0);
  });

  test('A4 small uses smaller cells and more cells per page', () => {
    const small  = layout.computePageGeometry({ pageSize: 'a4', stitchesPerPage: 'small' });
    const medium = layout.computePageGeometry({ pageSize: 'a4', stitchesPerPage: 'medium' });
    const large  = layout.computePageGeometry({ pageSize: 'a4', stitchesPerPage: 'large' });
    expect(small.cellMm).toBeLessThan(medium.cellMm);
    expect(medium.cellMm).toBeLessThan(large.cellMm);
    expect(small.colsPerPage).toBeGreaterThanOrEqual(medium.colsPerPage);
    expect(medium.colsPerPage).toBeGreaterThanOrEqual(large.colsPerPage);
  });

  test('Letter page reports correct dimensions', () => {
    const g = layout.computePageGeometry({ pageSize: 'letter', marginsMm: 12 });
    expect(g.pageWmm).toBeCloseTo(215.9, 1);
    expect(g.pageHmm).toBeCloseTo(279.4, 1);
  });

  test('custom honours requested cols/rows snapped to 10s', () => {
    const g = layout.computePageGeometry({
      pageSize: 'a4', stitchesPerPage: 'custom', customCols: 55, customRows: 75,
    });
    expect(g.colsPerPage).toBe(50);
    expect(g.rowsPerPage).toBe(70);
  });

  test('clamps margin to ≥10mm', () => {
    const g = layout.computePageGeometry({ pageSize: 'a4', marginsMm: 4 });
    expect(g.marginMm).toBe(10);
  });
});

describe('paginate', () => {
  test('80 × 80 with 80-cell page → single page', () => {
    const pages = layout.paginate({ patternW: 80, patternH: 80, colsPerPage: 80, rowsPerPage: 80 });
    expect(pages.length).toBe(1);
    expect(pages[0]).toMatchObject({ pageIndex: 0, x0: 0, y0: 0, x1: 80, y1: 80, gridCols: 1, gridRows: 1 });
  });

  test('200 × 200 with 60×70 pages produces a multi-page grid', () => {
    const pages = layout.paginate({ patternW: 200, patternH: 200, colsPerPage: 60, rowsPerPage: 70 });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0].gridCols * pages[0].gridRows).toBe(pages.length);
    pages.forEach((p) => {
      expect(p.x1).toBeLessThanOrEqual(200);
      expect(p.y1).toBeLessThanOrEqual(200);
      expect(p.x0 % 10).toBe(0);
      expect(p.y0 % 10).toBe(0);
    });
  });

  test('overlap=true makes every internal page start 2 stitches before the prior break', () => {
    const noOv = layout.paginate({ patternW: 200, patternH: 70, colsPerPage: 60, rowsPerPage: 70, overlap: false });
    const wOv  = layout.paginate({ patternW: 200, patternH: 70, colsPerPage: 60, rowsPerPage: 70, overlap: true });
    expect(noOv.length).toBeGreaterThan(1);
    expect(wOv.length).toBeGreaterThanOrEqual(noOv.length);
    expect(wOv[1].overlapLeft).toBe(2);
    expect(wOv[0].overlapLeft).toBe(0);
  });

  test('returns [] when dimensions missing', () => {
    expect(layout.paginate({ patternW: 0, patternH: 50, colsPerPage: 60, rowsPerPage: 70 })).toEqual([]);
  });
});

describe('buildCodepointMap', () => {
  const spec = require('../creator/symbolFontSpec.js');

  test('solids come first, sorted numerically; then blends, lexically', () => {
    const palette = [
      { id: '310',     type: 'solid' },
      { id: '550',     type: 'solid' },
      { id: '3865',    type: 'solid' },
      { id: '50',      type: 'solid' },
      { id: '310+550', type: 'blend' },
      { id: '310+800', type: 'blend' },
    ];
    const out = layout.buildCodepointMap(palette, spec);
    expect(out.order).toEqual(['50', '310', '550', '3865', '310+550', '310+800']);
    expect(out.map['50']).toBe(spec.baseCodepoint);
    expect(out.map['310+550']).toBe(spec.baseCodepoint + 4);
  });

  test('skips reserved sentinel ids', () => {
    const palette = [
      { id: '310',       type: 'solid' },
      { id: '__skip__',  type: 'solid' },
      { id: '__empty__', type: 'solid' },
    ];
    const out = layout.buildCodepointMap(palette, spec);
    expect(out.order).toEqual(['310']);
    expect(out.map['__skip__']).toBeUndefined();
  });

  test('wraps around when palette exceeds spec capacity', () => {
    const palette = [];
    for (let i = 0; i < spec.glyphs.length + 5; i++) {
      // Use numeric-prefixed ids so the natural sort places them in i-order.
      palette.push({ id: String(1000 + i), type: 'solid' });
    }
    const out = layout.buildCodepointMap(palette, spec);
    expect(out.order.length).toBe(spec.glyphs.length + 5);
    // First and (capacity)th entries should share a codepoint after wrap.
    expect(out.map['1000']).toBe(out.map[String(1000 + spec.glyphs.length)]);
  });
});

describe('contrastColor', () => {
  test('returns white on dark backgrounds', () => {
    expect(layout.contrastColor([0, 0, 0])).toEqual([1, 1, 1]);
    expect(layout.contrastColor([20, 30, 60])).toEqual([1, 1, 1]);
  });

  test('returns black on light backgrounds', () => {
    expect(layout.contrastColor([255, 255, 255])).toEqual([0, 0, 0]);
    expect(layout.contrastColor([240, 230, 200])).toEqual([0, 0, 0]);
  });
});

describe('mmToPt / ptToMm', () => {
  test('round-trip is stable', () => {
    expect(layout.mmToPt(25.4)).toBeCloseTo(72, 4);
    expect(layout.ptToMm(72)).toBeCloseTo(25.4, 4);
    expect(layout.ptToMm(layout.mmToPt(123.45))).toBeCloseTo(123.45, 6);
  });
});
