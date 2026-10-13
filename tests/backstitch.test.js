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
