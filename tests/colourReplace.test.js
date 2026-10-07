/* tests/colourReplace.test.js ─────────────────────────────────────────────
   Unit tests for creator/colourReplace.js (pure helpers behind the Replace
   colour modal). Follows the fs.readFileSync + eval() pattern.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'creator', 'colourReplace.js'), 'utf8')); // eslint-disable-line no-eval
const CR = window.ColourReplace;

const A = { id: '310', name: 'Black', rgb: [0, 0, 0] };
const B = { id: '321', name: 'Red', rgb: [199, 43, 59] };
const SKIP = { id: '__skip__' };
const EMPTY = { id: '__empty__' };

function pattern() {
  // 6 cells: A, B, A, skip, empty, A
  return [A, B, A, SKIP, EMPTY, A].map(c => Object.assign({}, c));
}

describe('ColourReplace.countMatches', () => {
  test('counts every matching stitch when there is no selection', () => {
    expect(CR.countMatches(pattern(), '310', null)).toEqual({ total: 3, inSelection: null });
  });

  test('reports both the total and the in-selection count when masked', () => {
    const mask = new Uint8Array([1, 1, 0, 1, 1, 1]);
    expect(CR.countMatches(pattern(), '310', mask)).toEqual({ total: 3, inSelection: 2 });
  });

  test('never counts skip / empty cells', () => {
    expect(CR.countMatches(pattern(), '__skip__', null).total).toBe(0);
    expect(CR.countMatches(pattern(), '__empty__', null).total).toBe(0);
  });

  test('handles missing inputs', () => {
    expect(CR.countMatches(null, '310', null)).toEqual({ total: 0, inSelection: null });
    expect(CR.countMatches(pattern(), null, new Uint8Array(6))).toEqual({ total: 0, inSelection: 0 });
  });
});

describe('ColourReplace.replaceInPattern', () => {
  const D = { id: '3371', name: 'Black Brown', rgb: [30, 17, 8] };

  test('replaces every matching cell and records the old cell for undo', () => {
    const pat = pattern();
    const res = CR.replaceInPattern(pat, '310', D, null);
    expect(res.changes.map(c => c.idx)).toEqual([0, 2, 5]);
    expect(res.changes[0].old).toEqual(A);
    expect(res.pat[0].id).toBe('3371');
    expect(res.pat[1].id).toBe('321');
    expect(res.pat[3].id).toBe('__skip__');
  });

  test('does not mutate the input pattern', () => {
    const pat = pattern();
    CR.replaceInPattern(pat, '310', D, null);
    expect(pat[0].id).toBe('310');
  });

  test('new cells are copies, not shared references to the thread entry', () => {
    const res = CR.replaceInPattern(pattern(), '310', D, null);
    expect(res.pat[0]).not.toBe(D);
    expect(res.pat[0]).not.toBe(res.pat[2]);
  });

  test('respects the selection mask', () => {
    const mask = new Uint8Array([0, 0, 1, 0, 0, 1]);
    const res = CR.replaceInPattern(pattern(), '310', D, mask);
    expect(res.changes.map(c => c.idx)).toEqual([2, 5]);
    expect(res.pat[0].id).toBe('310');
  });

  test('is a no-op when source and destination are the same', () => {
    const res = CR.replaceInPattern(pattern(), '310', A, null);
    expect(res.changes).toEqual([]);
  });
});

describe('ColourReplace.rankBySimilarity', () => {
  // Use the app's real colour maths (CIEDE2000 on CIE Lab).
  const { rgbToLab, dE00, DMC } = require('../dmc-data.js');
  const opts = extra => Object.assign({ labOf: rgb => rgbToLab(rgb[0], rgb[1], rgb[2]), distance: dE00 }, extra);

  test('ranks DMC threads nearest first', () => {
    const ranked = CR.rankBySimilarity([0, 0, 0], DMC, opts({ limit: 3, excludeIds: ['310'] }));
    expect(ranked).toHaveLength(3);
    expect(ranked[0].thread.id).toBe('3371');
    expect(ranked[0].dE).toBeLessThanOrEqual(ranked[1].dE);
    expect(ranked[1].dE).toBeLessThanOrEqual(ranked[2].dE);
  });

  test('honours excludeIds as an array or a Set', () => {
    const a = CR.rankBySimilarity([0, 0, 0], DMC, opts({ limit: 1, excludeIds: ['310', '3371'] }));
    const b = CR.rankBySimilarity([0, 0, 0], DMC, opts({ limit: 1, excludeIds: new Set(['310', '3371']) }));
    expect(a[0].thread.id).not.toBe('3371');
    expect(a[0].thread.id).toBe(b[0].thread.id);
  });

  test('without a limit returns every thread', () => {
    expect(CR.rankBySimilarity([10, 20, 30], DMC, opts()).length).toBe(DMC.length);
  });

  test('skips entries without rgb and handles empty input', () => {
    expect(CR.rankBySimilarity([0, 0, 0], [{ id: 'x' }, null], opts())).toEqual([]);
    expect(CR.rankBySimilarity(null, DMC, opts())).toEqual([]);
    expect(CR.rankBySimilarity([0, 0, 0], [], opts())).toEqual([]);
  });

  test('falls back to Euclidean distance when no colour maths is supplied', () => {
    const ranked = CR.rankBySimilarity([0, 0, 0], [{ id: 'a', rgb: [50, 50, 50] }, { id: 'b', rgb: [5, 5, 5] }]);
    expect(ranked.map(r => r.thread.id)).toEqual(['b', 'a']);
  });
});

describe('ColourReplace.similarityLabel', () => {
  test.each([
    [0, 'Near-identical'], [2, 'Near-identical'], [4.9, 'Very close'],
    [9, 'Close'], [15, 'Similar'], [25, null], [null, null], [NaN, null]
  ])('dE %p → %p', (dE, label) => {
    expect(CR.similarityLabel(dE)).toBe(label);
  });
});

describe('ColourReplace with several source colours', () => {
  const D = { id: '3371', name: 'Black Brown', rgb: [30, 17, 8] };

  test('countMatches and replaceInPattern accept an array or Set of ids', () => {
    // pattern(): 310, 321, 310, skip, empty, 310
    expect(CR.countMatches(pattern(), ['310', '321'], null).total).toBe(4);
    expect(CR.countMatches(pattern(), new Set(['321']), null).total).toBe(1);
    const res = CR.replaceInPattern(pattern(), ['310', '321'], D, null);
    expect(res.changes.map(c => c.idx)).toEqual([0, 1, 2, 5]);
    expect(res.pat.filter(c => c.id === '3371')).toHaveLength(4);
  });

  test('cells already in the destination colour are left alone', () => {
    const res = CR.replaceInPattern(pattern(), ['310', '321'], { id: '321', rgb: [199, 43, 59] }, null);
    expect(res.changes.map(c => c.idx)).toEqual([0, 2, 5]);
  });

  test('empty id lists change nothing', () => {
    expect(CR.countMatches(pattern(), [], null).total).toBe(0);
    expect(CR.replaceInPattern(pattern(), [], D, null).changes).toEqual([]);
  });
});

describe('ColourReplace.similarIds', () => {
  const { rgbToLab, dE00 } = require('../dmc-data.js');
  const opts = { labOf: rgb => rgbToLab(rgb[0], rgb[1], rgb[2]), distance: dE00 };
  const src = { id: '310', rgb: [0, 0, 0] };
  const palette = [
    { id: '3371', rgb: [30, 17, 8] },      // very dark brown — close to black
    { id: '939', rgb: [27, 40, 83] },      // dark navy — further
    { id: '321', rgb: [199, 43, 59] },     // red — far
    { id: '__skip__', rgb: [0, 0, 0] }
  ];

  test('always includes the source, closest shades next, within tolerance', () => {
    const near = CR.similarIds(src, palette, 12, opts);
    expect(near[0]).toBe('310');
    expect(near).toContain('3371');
    expect(near).not.toContain('321');
    expect(near).not.toContain('__skip__');
  });

  test('a wider tolerance includes more shades', () => {
    expect(CR.similarIds(src, palette, 30, opts).length).toBeGreaterThan(CR.similarIds(src, palette, 12, opts).length);
  });

  test('zero tolerance or no palette returns only the source', () => {
    expect(CR.similarIds(src, palette, 0, opts)).toEqual(['310']);
    expect(CR.similarIds(src, null, 10, opts)).toEqual(['310']);
    expect(CR.similarIds(null, palette, 10, opts)).toEqual([]);
  });
});

