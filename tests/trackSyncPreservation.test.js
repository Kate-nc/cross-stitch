const fs = require('fs');
global.window = global.window || {};
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.pako = require('pako');
global.indexedDB = undefined;
global.ProjectStorage = { listProjects: async () => [], get: async () => null };
eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = window.SyncEngine;
const proj = extra => Object.assign({ id: 'p', settings: { sW: 2, sH: 1 }, pattern: [{ id: '310' }, { id: '310' }], done: [0, 0] }, extra);
const merge = (a, b) => SE.mergeTrackingProgress(proj(a), proj(b));

describe('QA-01: saved half-stitch marks', () => {
  test('the exact two-cell reproduction retains both marks', () => {
    expect(merge({ halfDone: [[0, { fwd: 1 }]] }, { halfDone: [[1, { bck: 1 }]] }).halfDone)
      .toEqual([[0, { fwd: 1 }], [1, { bck: 1 }]]);
  });
  test('both sides, numeric/string zero, duplicates, empty values, order and repeat imports', () => {
    const a = { halfDone: [['0', { fwd: 1 }], [0, { bck: 0 }]] };
    const b = { halfDone: [[0, { bck: 1 }], [1, {}], [2, null]] };
    const expected = [[0, { fwd: 1, bck: 1 }]];
    expect(merge(a, b).halfDone).toEqual(expected);
    expect(merge(b, a).halfDone).toEqual(expected);
    expect(merge(merge(a, b), b).halfDone).toEqual(expected);
    expect(merge({ halfDone: null }, { halfDone: {} }).halfDone).toEqual([]);
    expect(a.halfDone).toEqual([['0', { fwd: 1 }], [0, { bck: 0 }]]);
    expect(b.halfDone).toEqual([[0, { bck: 1 }], [1, {}], [2, null]]);
  });
});

test('neighboring cross-tab half and quarter maps normalise numeric indices', () => {
  const TM = require('../tracking-merge.js');
  expect(TM.mergeHalfDone([[0, { fwd: 1 }]], [['0', { bck: 1 }]], [[0, { fwd: 1 }]]))
    .toEqual([[0, { bck: 1 }]]);
  expect(TM.mergeQuarterDone([[0, ['TL']]], [['0', ['BR']]], [[0, ['TL']]]))
    .toEqual([[0, ['BR']]]);
});

describe('QA-02: saved parking markers', () => {
  const marker = (x, y, colorId, corner) => ({ x, y, colorId, corner });
  test('different markers at array position zero survive', () => {
    const a = marker(0, 0, '310', 'BL'), b = marker(1, 0, '550', 'TR');
    expect(merge({ parkMarkers: [a] }, { parkMarkers: [b] }).parkMarkers).toEqual([a, b]);
  });
  test('same cell, different colours/corners; duplicates within a peer and repeats', () => {
    const a = { parkMarkers: [marker(0, 0, '310', 'BL')] };
    const b = { parkMarkers: [marker('0', '0', '310'), marker(0, 0, '550', 'BL'), marker(0, 0, '310', 'TR'), marker(0, 0, '550', 'BL')] };
    const result = merge(a, b);
    expect(result.parkMarkers).toHaveLength(3);
    expect(merge(b, a).parkMarkers).toEqual(result.parkMarkers);
    expect(merge(result, b).parkMarkers).toEqual(result.parkMarkers);
    result.parkMarkers[0].x = 99;
    expect(a.parkMarkers[0].x).toBe(0);
    expect(b.parkMarkers[0].x).toBe('0');
    expect(merge({ parkMarkers: [] }, {}).parkMarkers).toEqual([]);
  });
  test('legacy explicit index zero never falls back to array position', () => {
    expect(merge({ parkMarkers: [{ idx: 0 }, { idx: 1 }] }, { parkMarkers: [{ idx: 0 }, { idx: 0 }] }).parkMarkers).toHaveLength(2);
  });
});

const TS = require('../tracking-sync.js');
const tracked = (base, next, actor) => TS.record(base, proj(next), actor);
const allMarks = { done: [1, 0], halfDone: [[0, { fwd: 1, bck: 1 }]], partialDone: [[0, ['TL', 'BR']]], knotsDone: ['k0'], bsDone: ['b0'] };
const none = { done: [0, 0], halfDone: [], partialDone: [], knotsDone: [], bsDone: [] };

describe('QA-03: causal completion edits', () => {
  test('exact offline unpick reproduction: [1,0] -> A [0,0], B [1,1] -> [0,1]', () => {
    const base = tracked(null, { done: [1, 0] }, 'seed');
    const a = tracked(base, { done: [0, 0] }, 'A');
    const b = tracked(base, { done: [1, 1] }, 'B');
    expect(SE.mergeTrackingProgress(a, b).done).toEqual([0, 1]);
    expect(SE.mergeTrackingProgress(b, a).done).toEqual([0, 1]);
  });
  test('all five completion representations retain removals, independent additions and metadata', () => {
    const base = tracked(null, allMarks, 'seed');
    const a = tracked(base, none, 'A');
    const b = tracked(base, { done: [1, 1], halfDone: [[0, { fwd: 1, bck: 1 }], ['1', { bck: 1 }]], partialDone: [[0, ['TL', 'BR']], ['1', ['TR']]], knotsDone: ['k0', 'k1'], bsDone: ['b0', 'b1'] }, 'B');
    const before = JSON.stringify([a, b]);
    const m = SE.mergeTrackingProgress(a, b);
    expect(m.done).toEqual([0, 1]);
    expect(m.halfDone).toEqual([[1, { bck: 1 }]]);
    expect(m.partialDone).toEqual([[1, ['TR']]]);
    expect(m.knotsDone).toEqual(['k1']); expect(m.bsDone).toEqual(['b1']);
    expect(TS.merge(b, a)).toEqual(TS.merge(a, b));
    expect(TS.merge(m, b)).toEqual(TS.merge(a, b));
    expect(JSON.stringify([a, b])).toBe(before);
  });
  test('concurrent mark/unpick is remove-wins; observed re-mark wins after synchronisation', () => {
    const base = tracked(null, none, 'seed');
    const marked = tracked(base, allMarks, 'A');
    const unpicked = tracked(marked, none, 'A');
    const concurrentMark = tracked(base, allMarks, 'B');
    const merged = Object.assign(proj(), TS.merge(unpicked, concurrentMark));
    expect(merged.done).toEqual([0, 0]); expect(merged.halfDone).toEqual([]);
    expect(merged.partialDone).toEqual([]); expect(merged.knotsDone).toEqual([]); expect(merged.bsDone).toEqual([]);
    const remarked = tracked(merged, allMarks, 'B');
    expect(TS.merge(remarked, unpicked).done).toEqual([1, 0]);
  });
  test('three-device merge is associative, including a superseded concurrent removal', () => {
    const base = tracked(null, none, 'seed');
    const a = tracked(base, allMarks, 'A');
    const b = tracked(tracked(base, allMarks, 'B'), none, 'B');
    const c = tracked(b, allMarks, 'B');
    const combine = (x, y) => Object.assign(proj(), TS.merge(x, y));
    expect(TS.merge(combine(a, b), c)).toEqual(TS.merge(a, combine(b, c)));
    expect(combine(combine(a, b), c).done).toEqual([1, 0]);
  });
  test('legacy absence never deletes; a new removal defeats stale legacy additions', () => {
    const legacy = proj(allMarks);
    expect(TS.merge(legacy, proj(none)).done).toEqual([1, 0]);
    const removed = tracked(legacy, none, 'A');
    expect(TS.merge(removed, legacy).done).toEqual([0, 0]);
    expect(TS.record(legacy, proj({ done: [1, 0] }), 'A').halfDone).toEqual(allMarks.halfDone);
    expect(TS.merge(proj(allMarks), proj({ trackingSync: { version: 99, marks: {} } })).halfDone).toEqual(allMarks.halfDone);
  });
  test('equal project timestamps cannot hide changed marks or pattern structure', () => {
    const local = proj({ updatedAt: 'same', done: [1, 0] });
    const remote = proj({ updatedAt: 'same', done: [0, 1] });
    const classify = p => SE.classifyProjects([{ id: 'p', updatedAt: 'same', data: p }], { p: local })[0].classification;
    expect(classify(remote)).toBe('merge-tracking');
    expect(classify(proj({ updatedAt: 'same', pattern: [{ id: '550' }, { id: '310' }] }))).toBe('conflict');
  });
});

test('generated multi-device histories converge under regrouping, reversal and repeats', () => {
  const fc = require('fast-check');
  const p = done => proj(Object.assign({}, none, { done }));
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 2 }), fc.integer({ min: 0, max: 1 }), fc.boolean()), { maxLength: 40 }), ops => {
    const peers = [p([0, 0]), p([0, 0]), p([0, 0])];
    const combine = (a, b) => Object.assign(p([0, 0]), TS.merge(a, b));
    for (const [a, b, i, mark] of ops) {
      if (a === b) {
        const next = Object.assign({}, peers[a], { done: peers[a].done.slice() });
        next.done[i] = mark ? 1 : 0;
        peers[a] = TS.record(peers[a], next, 'actor' + a);
      } else peers[a] = combine(peers[a], peers[b]);
    }
    expect(TS.merge(combine(peers[0], peers[1]), peers[2])).toEqual(TS.merge(peers[0], combine(peers[1], peers[2])));
    expect(TS.merge(peers[0], peers[1])).toEqual(TS.merge(peers[1], peers[0]));
    expect(TS.merge(combine(peers[0], peers[1]), peers[1])).toEqual(TS.merge(peers[0], peers[1]));
  }), { numRuns: 300, seed: 34019 });
});

test('all storage/sync pages load the helper before use and precache it', () => {
  for (const page of fs.readdirSync('.').filter(p => p.endsWith('.html'))) {
    const html = fs.readFileSync(page, 'utf8');
    for (const consumer of ['project-storage.js', 'sync-engine.js']) {
      const at = html.indexOf('src="' + consumer + '"');
      if (at < 0) continue;
      expect(html.indexOf('src="tracking-sync.js"')).toBeGreaterThan(-1);
      expect(html.indexOf('src="tracking-sync.js"')).toBeLessThan(at);
    }
  }
  expect(fs.readFileSync('./sw.js', 'utf8')).toContain("'./tracking-sync.js'");
});

test('fractional structure fingerprints normalise cell indices and side order; marks remain independent', () => {
  const a = proj({ halfStitches: [['0', { fwd: { id: '310' }, bck: { id: '550' } }]] });
  const b = proj({ halfStitches: [[0, { bck: { id: '550' }, fwd: { id: '310' } }]], halfDone: [[0, { fwd: 1 }]] });
  expect(SE.computeFingerprint(a)).toBe(SE.computeFingerprint(b));
});

test('parking payloads normalise equivalent numeric coordinates for tracker hit testing', () => {
  const m = merge({ parkMarkers: [{ x: '0', y: '0', colorId: 310 }] }, { parkMarkers: [{ x: 0, y: 0, colorId: '310', corner: 'BL' }] });
  expect(m.parkMarkers).toEqual([{ x: 0, y: 0, colorId: '310', corner: 'BL' }]);
});

test('blank indices and invalid/unversioned removal metadata cannot unpick zero', () => {
  const legacy = proj({ halfDone: [[0, { fwd: 1 }]] });
  const malformed = proj({ halfDone: [[' ', { bck: 1 }], [false, { fwd: 1 }]], trackingSync: { version: 1, marks: { 'h:0:fwd': [{ value: 0, clock: {} }] } } });
  expect(TS.merge(legacy, malformed).halfDone).toEqual([[0, { fwd: 1 }]]);
});
