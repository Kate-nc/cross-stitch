// Differential check of the tracking-merge primitives between two checkouts (base = before the extraction).
//   node reports/cleanup-18/differential.cjs <baseDir> <headDir> [fuzzIterations]
// 1. The case battery from tests/support/syncMergePrimitiveCases.js, compared in full (error messages included).
// 2. Seeded random inputs (valid, legacy and malformed) through the SyncEngine facade functions and
//    mergeTrackingProgress / classifyProjects. Each run records the value, the error type and message, whether the
//    arguments were mutated and which results are the passed-in objects, and the two checkouts must agree exactly.
const path = require('path');
const { loadEngine } = require('./load-engine.cjs');
const cases = require('../../tests/support/syncMergePrimitiveCases.js');

const baseDir = path.resolve(process.argv[2]);
const headDir = path.resolve(process.argv[3]);
const iterations = Number(process.argv[4] || 3000);
const base = loadEngine(baseDir);
const head = loadEngine(headDir);

let failures = 0; const tally = {};
const report = (what, a, b) => {
  failures++;
  if (failures <= 10) console.log('MISMATCH', what, '\n  base:', JSON.stringify(a).slice(0, 400), '\n  head:', JSON.stringify(b).slice(0, 400));
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. battery
const bBase = cases.run(base), bHead = cases.run(head);
Object.keys(bBase).forEach(k => { if (!same(bBase[k], bHead[k])) report('battery ' + k, bBase[k], bHead[k]); });
console.log('battery cases compared:', Object.keys(bBase).length);

// 2. seeded fuzz
let seed = 20260915;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const int = (n) => Math.floor(rnd() * n);
const maybe = (p, v) => (rnd() < p ? v : undefined);
const dates = ['2026-07-01T09:00:00Z', '2026-07-02T09:00:00.000Z', '2026-07-03', '2026-07-01T12:00:00+01:00', 'garbage', '', null, undefined, 12, '2026-08-01T00:00:00Z'];
const ids = ['a', 'b', 'c', 0, 1, '1', null, undefined, 'zz'];
const junk = [null, undefined, 0, 1, 'x', '', true, NaN, [], {}, [[]]];

function genSession() {
  if (rnd() < 0.08) return pick(junk);
  const s = {};
  if (rnd() < 0.8) s.id = pick(ids);
  if (rnd() < 0.7) s.start = pick(dates);
  if (rnd() < 0.3) s.startTime = pick(dates);
  if (rnd() < 0.6) s.date = pick(dates);
  if (rnd() < 0.5) s.editedAt = pick(dates);
  if (rnd() < 0.6) s.durationMinutes = pick([0, 1, 5, 10.5, NaN, Infinity, '3', null]);
  if (rnd() < 0.3) s.durationSeconds = pick([0, 30, NaN, '9', 100]);
  if (rnd() < 0.7) s.netStitches = pick([0, 3, 12, -2, null, '4']);
  if (rnd() < 0.3) s.units = pick([0, 5, null, 8]);
  if (rnd() < 0.6) s.totalAtEnd = pick([0, 10, 40, '3', null, NaN]);
  if (rnd() < 0.5) s.percentAtEnd = pick([0, 12.5, 100, null, '5']);
  if (rnd() < 0.2) s.note = 'n' + int(3);
  return s;
}
const genList = () => (rnd() < 0.06 ? pick(junk) : Array.from({ length: int(5) }, genSession));
const genIds = () => (rnd() < 0.05 ? pick(['abc', 5, {}, null, undefined]) : Array.from({ length: int(4) }, () => pick(ids)));
const genPair = () => {
  if (rnd() < 0.08) return pick(junk);
  const k = pick([0, 1, 2, '1', '2', 3, '__proto__', null, undefined]);
  const detail = pick([null, 1, 'x', { fwd: true }, { bck: 1 }, { TL: 'a', TR: null }, { TL: 'b', BL: 'c', BR: undefined }, { nested: { deep: [1, 2] } }, []]);
  return rnd() < 0.1 ? [k] : [k, detail];
};
const genPairs = () => (rnd() < 0.06 ? pick(junk) : Array.from({ length: int(5) }, genPair));
const genLogEntry = () => (rnd() < 0.1 ? pick(junk) : { date: pick(['2026-07-01', '2026-07-02', '2026-07-03', '', null]), count: pick([0, 3, 9, -1, NaN, Infinity, '5', undefined]) });
const genLog = () => (rnd() < 0.06 ? pick(junk) : Array.from({ length: int(5) }, genLogEntry));
const genMarker = () => {
  if (rnd() < 0.1) return pick(junk);
  const m = {};
  if (rnd() < 0.7) { m.x = pick([1, 2, '1', '2', null, 'abc', NaN, 0]); m.y = pick([1, 2, '2', null, 0]); }
  if (rnd() < 0.3) m.idx = pick([1, 4, '4']);
  if (rnd() < 0.2) m.cellIdx = pick([1, 4]);
  if (rnd() < 0.7) m.colorId = pick(['310', 310, '311', undefined]);
  if (rnd() < 0.5) m.corner = pick(['TL', 'BL', '', undefined]);
  if (rnd() < 0.3) m.rgb = pick([[1, 2, 3], [9, 9, 9]]);
  return m;
};
const genMarkers = () => (rnd() < 0.06 ? pick(junk) : Array.from({ length: int(5) }, genMarker));
const genArea = () => (rnd() < 0.3 ? pick([null, undefined, 'x', 3]) : { x0: 0, y0: 0, x1: int(5), y1: 2, setAt: pick([0, 5, 9, NaN, '4', undefined, Infinity]) });
const genDone = () => (rnd() < 0.2 ? pick([null, undefined]) : Array.from({ length: int(6) }, () => pick([0, 1, 2, '', 'x', null, undefined])));

function proj(updatedAt, over) {
  const pattern = []; for (let i = 0; i < 16; i++) pattern.push({ id: String(310 + (i % 3)) });
  return Object.assign({ id: 'proj_1', name: 'Shared', updatedAt, settings: { sW: 4, sH: 4, fabricCt: 14 }, pattern, done: new Array(16).fill(0),
    statsSessions: [], sessions: [], totalTime: 0, threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {} }, over || {});
}
function genProject(updatedAt) {
  const o = {};
  if (rnd() < 0.8) o.statsSessions = genList();
  if (rnd() < 0.8) o.sessions = genList();
  if (rnd() < 0.5) o.totalTime = pick([0, 100, 900, NaN, undefined, null]);
  if (rnd() < 0.5) o.deletedSessionIds = genIds();
  if (rnd() < 0.3) o.deletedSnapshotIds = genIds();
  if (rnd() < 0.7) o.stitchLog = genLog();
  if (rnd() < 0.7) o.parkMarkers = genMarkers();
  if (rnd() < 0.6) o.halfStitches = genPairs();
  if (rnd() < 0.6) o.partialStitches = genPairs();
  if (rnd() < 0.7) o.workArea = genArea();
  ['startedAt', 'lastTouchedAt', 'completedAt'].forEach(f => { if (rnd() < 0.6) o[f] = pick(dates); });
  return proj(updatedAt, o);
}

const observe = cases.observe;
// Generate every argument set once, then give each engine its own deep copy (arguments are mutation-checked).
const fresh = x => (x === undefined ? undefined : (typeof x === 'number' && !Number.isFinite(x) ? x : structuredClone(x)));
function both(name, make, call) {
  const args = make();
  const a = observe((...xs) => call(base, ...xs), args.map(fresh));
  const b = observe((...xs) => call(head, ...xs), args.map(fresh));
  tally[name] = tally[name] || { ok: 0, err: 0 }; tally[name][a.error ? "err" : "ok"]++;
  if (!same(a, b)) report(name + ' ' + JSON.stringify(args).slice(0, 300), a, b);
}
for (let i = 0; i < iterations; i++) {
  both('mergeDoneArrays', () => [genDone(), genDone(), pick([0, 1, 3, 6, -1, 1.5, 8])], (E, ...a) => E.mergeDoneArrays(...a));
  both('mergeSessions', () => [genList(), genList(), genIds()], (E, ...a) => E.mergeSessions(...a));
  both('mergeIndexedPairs', () => [genPairs(), genPairs()], (E, ...a) => E.mergeIndexedPairs(...a));
  both('mergeStitchLogs', () => [genLog(), genLog()], (E, ...a) => E.mergeStitchLogs(...a));
  both('mergeTrackingProgress', () => [genProject('2026-07-01T09:00:00.000Z'), genProject(pick(['2026-08-01T09:00:00.000Z', '2026-06-01T09:00:00.000Z'])), pick([undefined, { name: 'keep-remote' }, { notes: 'keep-local' }])], (E, ...a) => E.mergeTrackingProgress(...a));
  both('classifyProjects', () => { const l = genProject('2026-08-01T09:00:00.000Z'); const r = genProject('2026-08-01T09:00:00.000Z'); if (rnd() < 0.5) r.parkMarkers = fresh(l.parkMarkers); return [l, r]; },
    (E, l, r) => E.classifyProjects([{ id: r.id, updatedAt: r.updatedAt, data: r }], { [l.id]: l }).map(e => e.classification));
}
console.log('fuzz iterations:', iterations, '(6 call shapes each)');
console.log("outcomes (ok/err) on base:", JSON.stringify(tally));
console.log(failures ? 'FAILURES: ' + failures : 'base and head agree on every case');
process.exit(failures ? 1 : 0);
