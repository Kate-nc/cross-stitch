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
