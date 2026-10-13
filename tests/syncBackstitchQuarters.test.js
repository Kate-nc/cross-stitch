// tests/syncBackstitchQuarters.test.js — backstitch and quarter-stitch marks across tabs, devices and saves (Phase 6).
const fs = require('fs');
const pako = require('pako');
const TM = require('../tracking-merge.js');

global.window = global.window || {};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
global.pako = pako;
global.indexedDB = undefined;
global.ProjectStorage = { listProjects: async () => [], get: async () => null, save: async p => p.id };
// eslint-disable-next-line no-eval
eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

const src = fs.readFileSync('./project-storage.js', 'utf8');
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}
// eslint-disable-next-line no-eval
const applyProgressRecord = eval('(' + extract('applyProgressRecord') + ')');

function proj(o) {
  const pattern = Array.from({ length: 100 }, (_, i) => ({ id: String(310 + (i % 3)) }));
  return Object.assign({
    id: 'p', name: 'x', updatedAt: '2026-10-01T09:00:00.000Z', settings: { sW: 10, sH: 10, fabricCt: 14 },
    pattern, done: new Array(100).fill(0), threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {}
  }, o || {});
}

describe('tab merge', () => {
  test('mergeQuarterDone is per cell and per position', () => {
    const base = [[5, ['TL']]];
    const local = [[5, ['TL', 'BR']]];
    const remote = [[5, ['TL']], [9, ['TR']]];
    expect(TM.mergeQuarterDone(base, local, remote)).toEqual([[5, ['TL', 'BR']], [9, ['TR']]]);
  });
  test('a quarter unmarked in the other tab stays unmarked', () => {
    expect(TM.mergeQuarterDone([[5, ['TL', 'BR']]], [[5, ['TL', 'BR']]], [[5, ['TL']]])).toEqual([[5, ['TL']]]);
  });
  test('bsDone merges as a set', () => {
    expect(TM.mergeSet(['a'], ['a', 'b'], ['a', 'c']).sort()).toEqual(['a', 'b', 'c']);
  });
  test('the other tab marking backstitch is not a reason to ask', () => {
    const base = { pattern: proj().pattern, done: new Array(100).fill(0), bsDone: [] };
    const remote = Object.assign({}, base, { bsDone: ['0,0,1,0,310'], partialDone: [[3, ['TL']]] });
    expect(TM.whyNot(base, base, remote)).toBeNull();
  });
});

describe('device sync', () => {
  test('unions backstitch and quarter marks', () => {
    const m = SE.mergeTrackingProgress(
      proj({ bsDone: ['a'], partialDone: [[1, ['TL']]] }),
      proj({ bsDone: ['b', 'a'], partialDone: [[1, ['BR']], [0, ['TR']]] }));
    expect(m.bsDone.sort()).toEqual(['a', 'b']);
    expect(m.partialDone).toEqual([[0, ['TR']], [1, ['TL', 'BR']]]);
  });
  test('beads and marks come from the side that has them; plain projects gain no fields', () => {
    const beads = [{ x: 2, y: 2, label: 'Bead' }];
    expect(SE.mergeTrackingProgress(proj(), proj({ beads })).beads).toEqual(beads);
    const plain = SE.mergeTrackingProgress(proj(), proj());
    ['bsDone', 'partialDone', 'beads'].forEach(k => expect(k in plain).toBe(false));
  });
});

describe('progress record', () => {
  const rec = extra => Object.assign({ v: 1, done: new Uint8Array(100), baseWriteAt: 7 }, extra);
  const base = () => proj({ lastWriteAt: 7, bsDone: ['old'], partialDone: [[1, ['TL']]] });
  test('a record that carries the fields overlays them, empty clears', () => {
    const a = applyProgressRecord(base(), rec({ bsDone: ['n'], partialDone: [[2, ['BR']]] }));
    expect(a.bsDone).toEqual(['n']); expect(a.partialDone).toEqual([[2, ['BR']]]);
    const b = applyProgressRecord(base(), rec({ bsDone: [], partialDone: [] }));
    expect(b.bsDone).toBeUndefined(); expect(b.partialDone).toBeUndefined();
  });
  test('a record from an older build leaves the project marks alone', () => {
    const c = applyProgressRecord(base(), rec());
    expect(c.bsDone).toEqual(['old']); expect(c.partialDone).toEqual([[1, ['TL']]]);
  });
});
