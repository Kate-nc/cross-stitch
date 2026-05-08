// Tests for the visual conflict diff (Tier-2 SrgConflictDiffViewer).
//
// We don't run JSX here — we extract the pure _computePatternDiff via
// regex+eval and assert its delta classification on synthetic project
// pairs. Canvas drawing is exercised lightly in JSDOM-free Node
// because canvas isn't available; we just confirm the pure helper is
// shaped as the renderer expects (diffCells array of correct length,
// deltaStats counters add up to totalDiffs).

const fs = require('fs');
const path = require('path');

const modalsSrc = fs.readFileSync(path.join(__dirname, '..', 'modals.js'), 'utf8');

// Pull the four pure helpers out of modals.js using their function
// signatures. Names are unique and stable across the file.
function extract(name) {
  // Match `function NAME(args) { ... }`. Brace-balance to find the end.
  const start = modalsSrc.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('Could not find function ' + name);
  let i = modalsSrc.indexOf('{', start);
  let depth = 1;
  i++;
  while (i < modalsSrc.length && depth > 0) {
    const c = modalsSrc[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return modalsSrc.slice(start, i);
}

const helpersSrc =
  extract('_emptyId') + '\n' +
  extract('_cellRgb') + '\n' +
  extract('_computePatternDiff');

// eslint-disable-next-line no-new-func
const ctx = {};
const factory = new Function('return (function () { ' + helpersSrc + '; return { _emptyId, _cellRgb, _computePatternDiff }; })();');
const helpers = factory();
const computePatternDiff = helpers._computePatternDiff;

function makeProject(w, h, pattern, done) {
  return { id: 'p', w: w, h: h, pattern: pattern || [], done: done || [] };
}

describe('_computePatternDiff — chart conflicts', () => {
  test('identical patterns produce zero diffs', () => {
    const a = [{ id: '310', type: 'solid', rgb: [0, 0, 0] }, { id: '__empty__' }];
    const b = [{ id: '310', type: 'solid', rgb: [0, 0, 0] }, { id: '__empty__' }];
    const out = computePatternDiff(makeProject(2, 1, a), makeProject(2, 1, b), 'chart');
    expect(out.deltaStats.patternDiffs).toBe(0);
    expect(out.totalCells).toBe(2);
    expect(out.diffCells.filter(Boolean)).toHaveLength(0);
  });

  test('classifies added / removed / colour-changed correctly', () => {
    const local = [
      { id: '310', type: 'solid', rgb: [0, 0, 0] },        // colour-changed below
      { id: '__empty__' },                                  // added in remote
      { id: '550', type: 'solid', rgb: [128, 0, 128] }     // removed in remote
    ];
    const remote = [
      { id: '550', type: 'solid', rgb: [128, 0, 128] },
      { id: '310', type: 'solid', rgb: [0, 0, 0] },
      { id: '__empty__' }
    ];
    const out = computePatternDiff(makeProject(3, 1, local), makeProject(3, 1, remote), 'chart');
    expect(out.deltaStats.colorChanged).toBe(1);
    expect(out.deltaStats.addedInRemote).toBe(1);
    expect(out.deltaStats.removedInRemote).toBe(1);
    expect(out.deltaStats.patternDiffs).toBe(3);
    expect(out.diffCells[0]).toBe('changed');
    expect(out.diffCells[1]).toBe('added');
    expect(out.diffCells[2]).toBe('removed');
  });

  test('ignores empty-vs-empty cells', () => {
    const local = [{ id: '__empty__' }, { id: '__skip__' }];
    const remote = [{ id: '__empty__' }, { id: '__empty__' }];
    const out = computePatternDiff(makeProject(2, 1, local), makeProject(2, 1, remote), 'chart');
    expect(out.deltaStats.patternDiffs).toBe(0);
  });
});

describe('_computePatternDiff — stitch conflicts', () => {
  test('classifies stitched-local-only and stitched-remote-only', () => {
    const ld = [1, 0, 1, 1];
    const rd = [0, 1, 1, 0];
    const local = makeProject(2, 2, [{}, {}, {}, {}], ld);
    const remote = makeProject(2, 2, [{}, {}, {}, {}], rd);
    const out = computePatternDiff(local, remote, 'stitch');
    expect(out.deltaStats.stitchDiffs).toBe(3);
    expect(out.deltaStats.stitchedLocalOnly).toBe(2);
    expect(out.deltaStats.stitchedRemoteOnly).toBe(1);
    expect(out.diffCells[0]).toBe('stitched_local_only');
    expect(out.diffCells[1]).toBe('stitched_remote_only');
    expect(out.diffCells[2]).toBeNull();
    expect(out.diffCells[3]).toBe('stitched_local_only');
  });

  test('all-equal done arrays produce zero diffs', () => {
    const ld = [1, 1, 0];
    const rd = [1, 1, 0];
    const out = computePatternDiff(makeProject(3, 1, [{}, {}, {}], ld), makeProject(3, 1, [{}, {}, {}], rd), 'stitch');
    expect(out.deltaStats.stitchDiffs).toBe(0);
  });
});

describe('_computePatternDiff — bounds & defaults', () => {
  test('handles missing pattern arrays without throwing', () => {
    const out = computePatternDiff({}, {}, 'chart');
    expect(out.totalCells).toBe(0);
    expect(out.deltaStats.patternDiffs).toBe(0);
  });

  test('totalCells is max of the two pattern lengths', () => {
    const a = [{ id: '310' }, { id: '310' }, { id: '310' }];
    const b = [{ id: '310' }];
    const out = computePatternDiff(makeProject(3, 1, a), makeProject(1, 1, b), 'chart');
    expect(out.totalCells).toBe(3);
    // Cells 1 and 2 are local-non-empty vs remote-undefined → removed.
    expect(out.deltaStats.removedInRemote).toBe(2);
  });

  test('unknown conflict type produces no diffs', () => {
    const out = computePatternDiff(makeProject(2, 1, [{}, {}]), makeProject(2, 1, [{}, {}]), 'meta');
    expect(out.deltaStats.patternDiffs).toBe(0);
    expect(out.deltaStats.stitchDiffs).toBe(0);
  });
});
