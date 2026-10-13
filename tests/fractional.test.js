// tests/fractional.test.js — quarter-stitch done marks (Phase 6, TRACK-04).
const F = require('../fractional.js');

const PS = [[5, { TL: { id: '912' }, BR: { id: '912' } }], [6, { TL: { id: '912' } }]];

test('toMap reads the saved list and drops unknown positions and empty cells', () => {
  const m = F.toMap([[5, ['TL', 'XX']], [7, ['ZZ']], [-1, ['TL']], 'bad']);
  expect(Array.from(m.keys())).toEqual([5]);
  expect(Array.from(m.get(5))).toEqual(['TL']);
});

test('forSave orders cells and positions, and is undefined when empty', () => {
  const m = F.toggle(F.toggle(F.toggle(new Map(), 9, 'BR'), 2, 'TR'), 9, 'TL');
  expect(F.forSave(m)).toEqual([[2, ['TR']], [9, ['TL', 'BR']]]);
  expect(F.forSave(new Map())).toBeUndefined();
});

test('toggle is pure and removes an emptied cell', () => {
  const a = F.toggle(new Map(), 1, 'TL');
  const b = F.toggle(a, 1, 'TL');
  expect(a.size).toBe(1); expect(b.size).toBe(0);
  expect(F.toggle(a, 1, 'TL', true).get(1).has('TL')).toBe(true);
});

test('live drops marks on a quarter with no thread', () => {
  const m = F.toMap([[5, ['TL', 'TR']], [8, ['TL']]]);
  const live = F.live(m, PS);
  expect(F.forSave(live)).toEqual([[5, ['TL']]]);
  expect(F.forSave(F.live(F.toMap([[5, ['BR']]]), new Map(PS)))).toEqual([[5, ['BR']]]);
});

test('912 TL+BR with a neighbour TL: 2 of 3 once two are marked', () => {
  const m = F.toMap([[5, ['TL', 'BR']]]);
  expect(F.progress(PS, m)).toEqual({ total: 3, done: 2 });
  expect(F.byThread(PS, m)).toEqual({ '912': { total: 3, done: 2 } });
});

test('remap moves marks with the grid and drops cells that fall off it', () => {
  const m = F.toMap([[0, ['TL']], [11, ['BR']]]); // old 4 wide: (0,0) and (3,2)
  const out = F.remap(m, 4, 6, 4, 1, 1);          // origin moves to (1,1) in a 6x4 grid
  expect(F.forSave(out)).toEqual([[1 * 6 + 1, ['TL']], [3 * 6 + 4, ['BR']]]);
  expect(F.forSave(F.remap(m, 4, 3, 3, 0, 0))).toEqual([[0, ['TL']]]);
});
