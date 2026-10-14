const fs = require('fs');
const window = {};
eval(fs.readFileSync('creator/canvasResize.js', 'utf8'));
eval(fs.readFileSync('creator/useEditHistory.js', 'utf8'));
const PU = require('../progress-units');
const F = require('../fractional');
const fwd = { id: '403', brand: 'anchor', rgb: [1, 2, 3], type: 'solid' };
const bck = { id: '310+550', brand: 'dmc', rgb: [4, 5, 6], type: 'blend' };
const cell = { BL: fwd, TR: fwd, TL: bck, BR: bck };
const halves = [[22, { fwd, bck }]];
const done = [[22, { fwd: true, bck: true }]];
function resize(spec, hs = halves, hd = done, pd = [[22, ['BL', 'TR', 'TL', 'BR']]]) {
  const pat = Array.from({ length: 100 }, () => ({ id: '__empty__' }));
  const grid = window.applyCanvasResize(pat, [], null, new Map([[22, cell]]), [], 10, 10, spec);
  return { ...window.remapCanvasTracking(hs, hd, pd, grid.newPartialStitches, 10, 10, spec), grid };
}

test('left expansion remaps both representations and preserves all thread data without mutating input', () => {
  const r = resize({ newW: 11, newH: 10, offsetX: 1 });
  expect(r.halfStitches).toEqual([[25, { fwd, bck }]]);
  expect(r.halfDone).toEqual([[25, { fwd: true, bck: true }]]);
  expect(r.partialDone).toEqual([[25, ['TL', 'TR', 'BL', 'BR']]]);
  expect(r.grid.newPartialStitches.get(25)).toEqual(cell);
  expect(halves[0][0]).toBe(22);
  expect(r.halfStitches[0][1].fwd).not.toBe(fwd);
});

test.each([
  ['left', { newW: 7, newH: 10, offsetX: -3 }, null],
  ['right', { newW: 2, newH: 10 }, null],
  ['top', { newW: 10, newH: 7, offsetY: -3 }, null],
  ['bottom', { newW: 10, newH: 2 }, null],
  ['left survivor', { newW: 9, newH: 10, offsetX: -1 }, 19],
  ['right survivor', { newW: 9, newH: 10 }, 20],
  ['top survivor', { newW: 10, newH: 9, offsetY: -1 }, 12],
  ['bottom survivor', { newW: 10, newH: 9 }, 22],
  ['all sides expansion', { newW: 14, newH: 16, offsetX: 2, offsetY: 3 }, 74],
])('%s crops or moves stitches and completion together', (_, spec, idx) => {
  const r = resize(spec);
  expect(r.halfStitches.map(e => e[0])).toEqual(idx === null ? [] : [idx]);
  expect(r.halfDone.map(e => e[0])).toEqual(idx === null ? [] : [idx]);
  expect(r.partialDone.map(e => e[0])).toEqual(idx === null ? [] : [idx]);
});

test('orphan sides/cells, out-of-old-grid indices and absent quarters lose completion', () => {
  const spec = { newW: 11, newH: 11, offsetX: 1 };
  const r = resize(spec, [[22, { fwd }], [100, { fwd }]], [[22, { fwd: true, bck: true }], [23, { fwd: true }], [100, { fwd: true }]], [[23, ['TL']], [22, ['invalid']]]);
  expect(r.halfDone).toEqual([[25, { fwd: true }]]);
  expect(r.halfStitches).toEqual([[25, { fwd }]]);
  expect(r.partialDone).toEqual([[25, ['TR', 'BL']]]);
});

test('legacy completion synchronises only equivalent quarters with the same brand', () => {
  const spec = { newW: 11, newH: 10, offsetX: 1 };
  const ps = new Map([[25, { BL: fwd, TR: fwd, TL: bck, BR: bck }]]);
  const r = window.remapCanvasTracking(halves, [[22, { fwd: true }]], [[22, ['TL', 'BR']]], ps, 10, 10, spec);
  expect(r.partialDone).toEqual([[25, ['TR', 'BL']]]);
  const other = { ...fwd, brand: 'dmc' };
  const independent = window.remapCanvasTracking([[22, { fwd: other }]], [], [[22, ['BL']]], ps, 10, 10, spec);
  expect(independent.partialDone).toEqual([[25, ['BL']]]);
});

test('both encodings count once in saved progress and Tracker counters; independent quarters still count', () => {
  const ps = [[22, { ...cell, TL: { id: '666' }, BR: { id: '666' } }]];
  const p = { halfStitches: [[22, { fwd }]], halfDone: [[22, { fwd: true }]], partialStitches: ps, partialDone: [[22, ['BL', 'TR', 'TL']]] };
  expect(PU.countsFromProject(p).quarter).toEqual({ total: 2, done: 1 });
  expect(F.progress(PU.partialWithoutLegacyHalves(ps, p.halfStitches), F.toMap(p.partialDone))).toEqual({ total: 2, done: 1 });
  expect(PU.fromProject(p).totalUnits).toBe(1);
  expect(PU.fromProject(p).doneUnits).toBe(0.75);
  expect(ps[0][1].BL).toEqual(fwd);
});

test('real Resize history restores legacy arrays and quarter marks over repeated Undo/Redo, including empty crops', () => {
  const prev = { sW: 10, sH: 10, pat: [], bsLines: [], ps: [[22, cell]], parkMarkers: [], halfStitches: halves, halfDone: done, partialDone: [[22, ['BL', 'TR']]] };
  for (const spec of [{ newW: 11, newH: 10, offsetX: 1 }, { newW: 2, newH: 10 }]) {
    const r = resize(spec);
    const next = { ...prev, sW: spec.newW, sH: spec.newH, ps: [...r.grid.newPartialStitches], ...r };
    const state = { EDIT_HISTORY_MAX: 20, editHistory: [{ type: 'canvasResize', prev, next }], redoHistory: [], trackerFieldsRef: { current: { ...r } }, buildPaletteWithScratch: () => ({ pal: [], cmap: {} }) };
    for (const field of ['SW', 'SH', 'Pat', 'BsLines', 'Knots', 'Done', 'PartialStitches', 'ParkMarkers', 'Pal', 'Cmap', 'EditHistory', 'RedoHistory']) {
      const key = ({ SW: 'sW', SH: 'sH' })[field] || field[0].toLowerCase() + field.slice(1);
      state['set' + field] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
    }
    for (let n = 0; n < 3; n++) {
      window.useEditHistory(state).undoEdit();
      expect(state.trackerFieldsRef.current.halfStitches).toEqual(halves);
      expect(state.trackerFieldsRef.current.halfDone).toEqual(done);
      expect(state.partialStitches.get(22)).toEqual(cell);
      window.useEditHistory(state).redoEdit();
      expect(state.trackerFieldsRef.current.halfStitches).toEqual(r.halfStitches);
      expect(state.trackerFieldsRef.current.halfDone).toEqual(r.halfDone);
      expect(state.trackerFieldsRef.current.partialDone || []).toEqual(r.partialDone);
    }
  }
});

test('mixed-brand duplicates use the project default and keep other-brand quarters', () => {
  const hs = [[22, { bck: { id: '403' } }]];
  const ps = [[22, { TL: { id: '403', brand: 'anchor' }, BR: { id: '403', brand: 'anchor' }, TR: { id: '403', brand: 'dmc' } }]];
  const p = { settings: { threadBrand: 'anchor' }, halfStitches: hs, partialStitches: ps };
  expect(PU.countsFromProject(p).quarter.total).toBe(1);
  const r = window.remapCanvasTracking(hs, [[22, { bck: true }]], [], new Map([[25, ps[0][1]]]), 10, 10, { newW: 11, newH: 10, offsetX: 1 }, 'anchor');
  expect(r.partialDone).toEqual([[25, ['TL', 'BR']]]);
});

test('legacy migration retains brand and blend metadata in both directional pairs', () => {
  const migrate = new Function(fs.readFileSync('helpers.js', 'utf8') + ';return migrateHalfStitch;')();
  expect(migrate({ fwd, bck })).toEqual(cell);
});

test('sparse or absent saved partial fields cannot break progress counts', () => {
  expect(PU.countsFromProject({ halfStitches: halves, partialStitches: [null, [22, null]] }).quarter.total).toBe(0);
  expect(PU.countsFromProject({ partialStitches: {} }).quarter.total).toBe(0);
});
