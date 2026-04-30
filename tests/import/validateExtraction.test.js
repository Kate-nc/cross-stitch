/* tests/import/validateExtraction.test.js — Unit 10. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { validateExtraction, countsByCode } = ENGINE;

function cell(code, conf) { return { code, matchKind: 'legend-exact', matchConfidence: conf == null ? 1 : conf }; }

describe('validateExtraction', () => {
  it('flags empty grid as an error', () => {
    const r = validateExtraction({ cells: [], legend: { rows: [] }, width: 0, height: 0 });
    expect(r.errors.some(e => e.code === 'EMPTY_GRID')).toBe(true);
  });

  it('reports no warnings for a clean extraction', () => {
    const cells = [cell('310'), cell('310'), cell('930')];
    const legend = { rows: [{ code: '310', expectedCount: 2 }, { code: '930', expectedCount: 1 }] };
    const r = validateExtraction({ cells, legend, width: 10, height: 10 });
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.filter(w => w.code === 'COUNT_MISMATCH')).toHaveLength(0);
    expect(r.coverage).toBe(1);
  });

  it('warns when a thread count is off', () => {
    const cells = [cell('310')];
    const legend = { rows: [{ code: '310', expectedCount: 100 }] };
    const r = validateExtraction({ cells, legend, width: 10, height: 10 });
    const w = r.warnings.find(w => w.code === 'COUNT_MISMATCH');
    expect(w).toBeDefined();
    expect(w.context).toEqual({ code: '310', expected: 100, actual: 1 });
  });

  it('warns when palette coverage is low', () => {
    const cells = [{ code: null, matchConfidence: 0 }, { code: null, matchConfidence: 0 }, cell('310')];
    const r = validateExtraction({ cells, legend: { rows: [] }, width: 10, height: 10 });
    expect(r.warnings.some(w => w.code === 'LOW_PALETTE_COVERAGE')).toBe(true);
    expect(r.coverage).toBeCloseTo(1 / 3, 2);
  });

  it('warns when a chart code is missing from legend', () => {
    const cells = [cell('999')];
    const legend = { rows: [{ code: '310' }] };
    const r = validateExtraction({ cells, legend, width: 10, height: 10 });
    expect(r.warnings.some(w => w.code === 'LEGEND_MISSING_CODE')).toBe(true);
  });

  it('warns when a legend code is unused', () => {
    const cells = [cell('310')];
    const legend = { rows: [{ code: '310' }, { code: '930' }] };
    const r = validateExtraction({ cells, legend, width: 10, height: 10 });
    expect(r.warnings.some(w => w.code === 'LEGEND_UNUSED' && w.message.includes('930'))).toBe(true);
  });

  it('warns when grid dimensions look implausible', () => {
    const r1 = validateExtraction({ cells: [cell('310')], legend: { rows: [] }, width: 2000, height: 50 });
    expect(r1.warnings.some(w => w.code === 'GRID_TOO_LARGE')).toBe(true);
    const r2 = validateExtraction({ cells: [cell('310')], legend: { rows: [] }, width: 2, height: 2 });
    expect(r2.warnings.some(w => w.code === 'GRID_TOO_SMALL')).toBe(true);
  });
});

describe('countsByCode', () => {
  it('counts cells by their code, skipping nulls', () => {
    const m = countsByCode([cell('310'), cell('310'), cell('930'), { code: null }]);
    expect(m.get('310')).toBe(2);
    expect(m.get('930')).toBe(1);
    expect(m.size).toBe(2);
  });
});
