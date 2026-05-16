/* tests/rasterChart-schema.test.js
 *
 * Schema-compatibility test: the raster importer's RawExtraction output
 * must materialise into a v8 project indistinguishable in shape from the
 * PDF importer's output.
 */

const { materialiseProject } = require('../import-engine/pipeline/materialise.js');

function fakeRasterExtraction() {
  return {
    width: 4,
    height: 4,
    cells: [
      { col: 0, row: 0, code: '310', color: [0, 0, 0], type: 'solid', matchConfidence: 0.9 },
      { col: 1, row: 0, code: '310', color: [0, 0, 0], type: 'solid', matchConfidence: 0.9 },
      { col: 2, row: 2, code: '550', color: [120, 30, 150], type: 'solid', matchConfidence: 0.8 },
    ],
    legend: [{ code: '310', name: 'Black', confidence: 0.95 }, { code: '550', name: 'Violet', confidence: 0.9 }],
    palette: [],
    flags: { warnings: [], uncertainCells: 0 },
    // Phase-2-ready optional fields:
    cellColors: null,
    multiPageMetadata: null,
  };
}

describe('rasterChart → materialise schema parity', () => {
  test('produces a v8 project with the documented shape', () => {
    const proj = materialiseProject(fakeRasterExtraction(), { name: 'Test', fabricCt: 14 });
    expect(proj.v).toBe(8);
    expect(proj.w).toBe(4);
    expect(proj.h).toBe(4);
    expect(proj.settings).toEqual({ sW: 4, sH: 4, fabricCt: 14 });
    expect(Array.isArray(proj.pattern)).toBe(true);
    expect(proj.pattern.length).toBe(16);
    expect(proj.pattern[0]).toEqual({ id: '310', type: 'solid', rgb: [0, 0, 0] });
    expect(proj.pattern[10]).toEqual({ id: '550', type: 'solid', rgb: [120, 30, 150] });
    expect(proj.pattern[15]).toEqual({ id: '__skip__' });
    expect(proj.done).toBeNull();
    expect(Array.isArray(proj.bsLines)).toBe(true);
  });

  test('per-cell confidence is attached and parallels the pattern array', () => {
    const proj = materialiseProject(fakeRasterExtraction(), {});
    expect(proj._import.perCellConfidence.length).toBe(16);
    expect(proj._import.perCellConfidence[0]).toBeCloseTo(0.9, 5);
    expect(proj._import.perCellConfidence[15]).toBe(0);
  });

  test('Phase-2 optional fields do not break materialisation', () => {
    const raw = fakeRasterExtraction();
    raw.cellColors = null;
    raw.multiPageMetadata = null;
    expect(() => materialiseProject(raw, {})).not.toThrow();
  });
});
