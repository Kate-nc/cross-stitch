// tests/backstitch.test.js — backstitch done keys (Phase 6, TRACK-04).
const B = require('../backstitch.js');

const L = (x1, y1, x2, y2, extra) => Object.assign({ x1, y1, x2, y2 }, extra || {});

describe('key', () => {
  test('a line and its reverse share one key', () => {
    expect(B.key(L(1, 2, 3, 4, { colorId: '310' }))).toBe(B.key(L(3, 4, 1, 2, { colorId: '310' })));
  });
  test('a vertical line is ordered top to bottom', () => {
    expect(B.key(L(2, 5, 2, 1))).toBe('2,1,2,5,');
  });
  test('the colour is part of the key: colorId, else colour, else empty', () => {
    expect(B.key(L(0, 0, 1, 0, { colorId: '310', color: '#000' }))).toBe('0,0,1,0,310');
    expect(B.key(L(0, 0, 1, 0, { color: '#000000' }))).toBe('0,0,1,0,#000000');
    expect(B.key(L(0, 0, 1, 0))).toBe('0,0,1,0,');
  });
  test('recolouring a line changes its key', () => {
    expect(B.key(L(0, 0, 1, 0, { colorId: '310' }))).not.toBe(B.key(L(0, 0, 1, 0, { colorId: '666' })));
  });
});

describe('live, toggle, forSave', () => {
  const lines = [L(0, 0, 1, 0, { colorId: '310' }), L(1, 0, 1, 1, { colorId: '310' })];
  test('live keeps only keys that still match a line, once each, sorted', () => {
    const k0 = B.key(lines[0]), k1 = B.key(lines[1]);
    expect(B.live([k1, k0, k0, 'gone', 5], lines)).toEqual([k0, k1].sort());
    expect(B.live(undefined, lines)).toEqual([]);
  });
  test('toggle returns a new array and forces the result with `on`', () => {
    const a = ['x'];
    const b = B.toggle(a, 'y');
    expect(a).toEqual(['x']); expect(b).toEqual(['x', 'y']);
    expect(B.toggle(b, 'y')).toEqual(['x']);
    expect(B.toggle(b, 'y', true)).toEqual(['x', 'y']);
    expect(B.toggle(b, 'z', false)).toEqual(['x', 'y']);
  });
  test('forSave is undefined when empty, otherwise unique and sorted', () => {
    expect(B.forSave([])).toBeUndefined();
    expect(B.forSave(undefined)).toBeUndefined();
    expect(B.forSave(['b', 'a', 'b', 3])).toEqual(['a', 'b']);
  });
});

describe('progress', () => {
  test('8 lines of 310, 3 marked: 3 of 8', () => {
    const lines = [];
    for (let i = 0; i < 8; i++) lines.push(L(i, 0, i + 1, 0, { colorId: '310' }));
    const done = lines.slice(0, 3).map(B.key);
    expect(B.progress(lines, done)).toEqual({ total: 8, done: 3 });
    expect(B.byColour(lines, done)).toEqual({ '310': { total: 8, done: 3 } });
  });
  test('identical lines share a mark and both count', () => {
    const lines = [L(0, 0, 1, 0, { colorId: '310' }), L(1, 0, 0, 0, { colorId: '310' })];
    expect(B.progress(lines, [B.key(lines[0])])).toEqual({ total: 2, done: 2 });
  });
  test('zero-length and malformed lines are not counted', () => {
    expect(B.progress([L(1, 1, 1, 1), { x1: 'a' }, null], [])).toEqual({ total: 0, done: 0 });
  });
});

describe('offsetDone', () => {
  test('moves the endpoints and keeps the colour (which may contain commas)', () => {
    expect(B.offsetDone(['1,1,2,1,310', '0,0,1,1,#a,b'], 2, 3)).toEqual(['3,4,4,4,310', '2,3,3,4,#a,b']);
    expect(B.offsetDone(['junk', 4], 1, 1)).toEqual([]);
  });
  test('an offset key still matches the moved line', () => {
    const k = B.key(L(1, 1, 2, 1, { colorId: '310' }));
    expect(B.offsetDone([k], 2, 3)[0]).toBe(B.key(L(3, 4, 4, 4, { colorId: '310' })));
  });
});

describe('ProgressUnits.countsFromProject backstitch row', () => {
  const PU = require('../progress-units.js');
  test('counts lines on their own and leaves the percentage alone', () => {
    const lines = [L(0, 0, 1, 0, { colorId: '310' }), L(1, 0, 1, 1, { colorId: '310' }), L(2, 2, 2, 2)];
    const p = { pattern: [{ id: '310' }, { id: '310' }], done: [1, 0], bsLines: lines, bsDone: [B.key(lines[1])] };
    expect(PU.countsFromProject(p).backstitch).toEqual({ done: 1, total: 2 });
    const r = PU.fromProject(p);
    expect(r.percent).toBe(50);
    expect(r.separate.backstitch).toEqual({ done: 1, total: 2 });
  });
  test('its key matches backstitch.js for any line', () => {
    const odd = [L(3, 4, 1, 2, { colorId: '310' }), L(2, 5, 2, 1, { color: '#abc' }), L(0, 0, 1, 1)];
    odd.forEach(l => {
      const p = { bsLines: [l], bsDone: [B.key(l)] };
      expect(PU.countsFromProject(p).backstitch).toEqual({ done: 1, total: 1 });
    });
  });
  test('a project without lines reports 0 of 0', () => {
    expect(PU.countsFromProject({ pattern: [{ id: '1' }], done: [0] }).backstitch).toEqual({ done: 0, total: 0 });
  });
});

describe('ProgressUnits quarter row (Phase 6 batch 2)', () => {
  const PU = require('../progress-units.js');
  const th = { id: '912' };
  const base = () => ({
    pattern: [{ id: '__skip__' }, { id: '__skip__' }], done: [0, 0],
    partialStitches: [[0, { TL: th, BR: th }], [1, { TL: th }]]
  });
  test('912 TL+BR plus a neighbour TL: 2 of 3 is half a unit', () => {
    const p = Object.assign(base(), { partialDone: [[0, ['TL', 'BR']]] });
    expect(PU.countsFromProject(p).quarter).toEqual({ done: 2, total: 3 });
    const r = PU.fromProject(p);
    expect(r.doneUnits).toBe(0.5);
    expect(r.totalUnits).toBe(0.75);
  });
  test('a mark on a position with no thread is not counted', () => {
    const p = Object.assign(base(), { partialDone: [[1, ['TL', 'BR']], [9, ['TL']]] });
    expect(PU.countsFromProject(p).quarter).toEqual({ done: 1, total: 3 });
  });
  test('whole stitches and quarters add up, in units', () => {
    const p = { pattern: [{ id: '310' }], done: [1], partialStitches: [[0, { TL: th }]], partialDone: [[0, ['TL']]] };
    expect(PU.fromProject(p).doneUnits).toBe(1.25);
    expect(PU.fromProject(p).percent).toBe(100);
  });
});

describe('spatial index', () => {
  const lines = [
    L(0, 0, 3, 0, { colorId: '310' }),     // 0: along the top of row 0, three cells
    L(0, 0, 0, 1, { colorId: '310' }),     // 1
    L(5, 5, 6, 6, { colorId: '666' }),     // 2: a diagonal through the centre of cell (5,5)
    L(5, 5, 6, 6, { colorId: '310' })      // 3: the same place, another colour
  ];
  const g = B.buildGrid(lines);
  test('nearest finds the line under a point within the tolerance, else nothing', () => {
    expect(B.nearest(g, 1.5, 0.1, 0.3).i).toBe(0);
    expect(B.nearest(g, 1.5, 0.4, 0.3)).toBeNull();
    expect(B.nearest(g, 0.05, 0.5, 0.3).i).toBe(1);
  });
  test('the nearer of two lines wins, and a rule can rule one out', () => {
    expect(B.nearest(g, 0.2, 0.1, 0.5).i).toBe(0);                // 0.1 from the top line, 0.2 from the side one
    expect(B.nearest(g, 5.5, 5.5, 0.1, (i) => i !== 2).i).toBe(3);
  });
  test('a long line is found from any cell it crosses', () => {
    const long = B.buildGrid([L(0, 0, 40, 0)]);
    [0.5, 13.5, 27.2, 39.9].forEach(x => expect(B.nearest(long, x, 0.05, 0.2).i).toBe(0));
  });
  test('inCell lists the lines touching a cell in drawing order', () => {
    expect(B.inCell(g, 0, 0)).toEqual([0, 1]);
    expect(B.inCell(g, 2, 0)).toEqual([0]);
    expect(B.inCell(g, 5, 5)).toEqual([2, 3]);
    expect(B.inCell(g, 9, 9)).toEqual([]);
  });
  test('10,000 lines index quickly and look up quickly', () => {
    const many = [];
    for (let i = 0; i < 10000; i++) many.push(L(i % 100, Math.floor(i / 100), (i % 100) + 1, Math.floor(i / 100)));
    const t0 = Date.now();
    const big = B.buildGrid(many);
    const t1 = Date.now();
    for (let k = 0; k < 2000; k++) B.nearest(big, (k % 100) + 0.5, Math.floor(k / 20) + 0.05, 0.3);
    const t2 = Date.now();
    expect(B.nearest(big, 50.5, 20.05, 0.3).i).toBe(2050);
    expect(t1 - t0).toBeLessThan(500);
    expect(t2 - t1).toBeLessThan(200);
  });
});

test('inCell finds a line that only runs along the cell\'s edge', () => {
  const g = B.buildGrid([L(6, 5, 7, 5), L(3, 3, 3, 8)]);
  expect(B.inCell(g, 6, 4)).toEqual([0]);   // the bottom edge of the cell above
  expect(B.inCell(g, 6, 5)).toEqual([0]);   // and the top edge of the one below
  expect(B.inCell(g, 2, 5)).toEqual([1]);   // the right edge of (2,5), the left edge of (3,5)
  expect(B.inCell(g, 4, 5)).toEqual([]);
});

test('inCell ignores a line that only meets the cell at a corner', () => {
  const g = B.buildGrid([L(4, 4, 6, 4), L(7, 3, 8, 2)]);
  expect(B.inCell(g, 6, 4)).toEqual([]);   // the first line ends at (6,4), the corner of cell (6,4)
  expect(B.inCell(g, 5, 3)).toEqual([0]);
});

describe('remapDone', () => {
  test('a mark follows its line when the line is recoloured, and nothing else moves', () => {
    const oldLines = [L(0, 0, 1, 0, { colorId: '310' }), L(1, 0, 2, 0, { colorId: '310' }), L(2, 0, 3, 0, { colorId: '666' })];
    const newLines = [Object.assign({}, oldLines[0], { colorId: '312' }), oldLines[1], oldLines[2]];
    const done = oldLines.map(B.key);
    const out = B.remapDone(done, oldLines, newLines);
    expect(out).toEqual([B.key(newLines[0]), done[1], done[2]]);
    expect(B.live(out, newLines)).toHaveLength(3);
    expect(B.remapDone(out, newLines, oldLines)).toEqual(done);   // and back, as undo does
  });
  test('no change, no done keys, or no lines hands the list back untouched', () => {
    const lines = [L(0, 0, 1, 0, { colorId: '310' })];
    const d = [B.key(lines[0])];
    expect(B.remapDone(d, lines, lines)).toBe(d);
    expect(B.remapDone([], lines, lines)).toEqual([]);
    expect(B.remapDone(undefined, lines, lines)).toBeUndefined();
  });
});
