// The one definition of progress (tracking audit STATS-01).
const PU = require('../progress-units.js');

const specialProject = () => ({
  pattern: Array.from({ length: 1742 }, () => ({ id: '310' })).concat(Array.from({ length: 10 }, () => ({ id: '__skip__' }))),
  done: (() => { const d = new Array(1752).fill(0); d[0] = 1; d[1] = 1; return d; })(),
  // 30 half-stitch sides: 15 cells with both legs
  halfStitches: Array.from({ length: 15 }, (_, i) => [2000 + i, { fwd: { id: '310' }, bck: { id: '310' } }]),
  halfDone: [[2000, { fwd: true, bck: true }]],
  knots: [{ x: 0, y: 0, id: '310' }, { x: 2, y: 2, id: '310' }],
  knotsDone: ['0,0']
});

test('the worked example: 1,742 full, 30 half sides, 2 knots; 2 full, 2 half sides and 1 knot done is 4 / 1,759 (0.2%)', () => {
  const r = PU.fromProject(specialProject());
  expect(r.totalUnits).toBe(1742 + 15 + 2);
  expect(r.doneUnits).toBe(2 + 1 + 1);
  expect(r.percent).toBe(0.2);
  expect(PU.formatUnits(r.doneUnits)).toBe('4');
  expect(PU.formatUnits(r.totalUnits)).toBe('1,759');
  expect(r.remainingUnits).toBe(1755);
});

test('the Tracker counters and a stored record give the same answer', () => {
  const fromCounters = PU.progressUnits({ full: { done: 2, total: 1742 }, half: { done: 2, total: 30 }, knot: { done: 1, total: 2 } });
  const fromRecord = PU.fromProject(specialProject());
  expect(fromCounters.doneUnits).toBe(fromRecord.doneUnits);
  expect(fromCounters.totalUnits).toBe(fromRecord.totalUnits);
  expect(fromCounters.percent).toBe(fromRecord.percent);
});

test('weights live in one table and a type is one row', () => {
  expect(PU.WEIGHTS).toEqual({ full: 1, half: 0.5, quarter: 0.25, petite: 0.25, long_stitch:0.5, knot: 1 });
  const r = PU.progressUnits({ quarter: { done: 2, total: 8 }, petite: { done: 4, total: 4 } });
  expect(r.doneUnits).toBe(0.5 + 1);
  expect(r.totalUnits).toBe(2 + 1);
});

test('visible-layers-only figures take an include list', () => {
  const counts = { full: { done: 10, total: 100 }, half: { done: 4, total: 20 }, knot: { done: 1, total: 2 } };
  expect(PU.progressUnits(counts, { include: ['full'] }).totalUnits).toBe(100);
  expect(PU.progressUnits(counts, { include: { full: true, half: true, knot: false } }).totalUnits).toBe(110);
  expect(PU.progressUnits(counts).totalUnits).toBe(112);
});

test('backstitch is counted on its own, not in the percentage', () => {
  const r = PU.progressUnits({ full: { done: 5, total: 10 }, backstitch: { done: 3, total: 8 } });
  expect(r.percent).toBe(50);
  expect(r.separate.backstitch).toEqual({ done: 3, total: 8 });
});

test('empty and finished projects', () => {
  expect(PU.progressUnits({}).percent).toBe(0);
  expect(PU.progressUnits({ full: { done: 0, total: 0 } }).complete).toBe(false);
  const done = PU.progressUnits({ full: { done: 10, total: 10 }, half: { done: 4, total: 4 } });
  expect(done.complete).toBe(true);
  expect(done.percent).toBe(100);
  expect(PU.progressUnits({ full: { done: 12, total: 10 } }).percent).toBe(100);   // never above 100
});

test('breakdown text names only the special types the project has', () => {
  const r = PU.progressUnits({ full: { done: 2, total: 100 }, half: { done: 2, total: 30 }, knot: { done: 1, total: 2 } });
  expect(PU.breakdownText(r)).toBe('2 half, 1 knot');
  expect(PU.breakdownText(PU.progressUnits({ full: { done: 1, total: 4 } }))).toBe('');
});

test('session units: a half stitch is half a unit, and old sessions read as netStitches', () => {
  expect(PU.sessionUnits({ full: 3, half: 4, knot: 1 })).toBe(3 + 2 + 1);
  expect(PU.sessionUnits({ full: -2, half: -2 })).toBe(-3);
  expect(PU.sessionNet({ netStitches: 40 })).toBe(40);
  expect(PU.sessionNet({ netStitches: 40, units: 31.5 })).toBe(31.5);
  expect(PU.sessionNet({ units: 0, netStitches: 9 })).toBe(0);
  expect(PU.sessionNet(null)).toBe(0);
});

test('a compact-format project and a project with only totals still read', () => {
  const compact = { p: [['310'], ['310', 'k'], ['__skip__']], done: [1, 0, 0] };
  expect(PU.fromProject(compact).totalUnits).toBe(1);
  expect(PU.fromProject(compact).doneUnits).toBe(1);
  expect(PU.fromProject({ totalStitches: 50, completedStitches: 10 }).percent).toBe(20);
});

test('done, to go and total always add up once rounded for display', () => {
  const r = PU.progressUnits({ full: { done: 0, total: 1742 }, half: { done: 3, total: 30 }, knot: { done: 0, total: 2 } });   // 1.5 done of 1,759
  expect(PU.roundUnits(r.doneUnits) + PU.remainingWhole(r)).toBe(PU.roundUnits(r.totalUnits));
  expect(PU.remainingWhole(PU.progressUnits({ full: { done: 5, total: 5 } }))).toBe(0);
});

describe('review round 1 (batch 2)', () => {
  const PU = require('../progress-units.js');
  test('breakdown only lists the types that are included', () => {
    const r = PU.progressUnits({ full: { done: 1, total: 2 }, half: { done: 1, total: 2 } }, { include: ['full'] });
    expect(PU.breakdownText(r)).toBe('');
    expect(r.totalUnits).toBe(2);
  });
  test('fromProject keeps the exact percentage that whole done/total would blur', () => {
    const r = PU.fromProject({ pattern: [{ id: '310' }], done: [0], halfStitches: [[0, { fwd: 1 }]], halfDone: [[0, { fwd: 1 }]] });
    expect(r.doneUnits).toBe(0.5);
    expect(r.percent).toBeCloseTo(33.3, 1);
  });
});
