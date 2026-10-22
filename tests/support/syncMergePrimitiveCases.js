// Case battery for the tracking-merge primitives that SyncEngine.mergeTrackingProgress is built from
// (sessions, running totals, fractional pairs, stitch log, parking markers, work area, lifecycle dates).
//
// Each case calls the real SyncEngine facade and records what a caller can observe: the returned value, the error
// (if any), whether the arguments were left unchanged, and which results are the very objects that were passed in.
// tests/syncMergePrimitives.test.js compares the record with a golden file generated on the pre-extraction code;
// reports/cleanup-18/differential.cjs compares two checkouts directly.

const OLD = '2026-07-01T09:00:00.000Z';
const NEW = '2026-08-23T10:00:00.000Z';

function proj(updatedAt, overrides) {
  const pattern = [];
  for (let i = 0; i < 16; i++) pattern.push({ id: String(310 + (i % 3)) });
  return Object.assign({
    id: 'proj_1', name: 'Shared', updatedAt,
    settings: { sW: 4, sH: 4, fabricCt: 14 }, pattern,
    done: new Array(16).fill(0), statsSessions: [], sessions: [], totalTime: 0,
    threadOwned: {}, parkMarkers: [], achievedMilestones: [], halfDone: {}
  }, overrides || {});
}

function sess(over) {
  return Object.assign({ id: 's1', date: '2026-07-01', start: '2026-07-01T09:00:00.000Z', durationMinutes: 10, netStitches: 20 }, over);
}

// Journal records the way the Tracker writes them: the running total on each one.
function entry(id, start, net, totalAtEnd, extra) {
  return Object.assign({
    id, date: start.slice(0, 10), startTime: start, start, durationMinutes: 5, netStitches: net, units: net,
    totalAtEnd, percentAtEnd: Math.round(totalAtEnd / 16 * 1000) / 10
  }, extra || {});
}

function snapshot(x) { return x === undefined ? '__undefined__' : JSON.stringify(x); }

// Runs fn(...args) and describes the outcome. `args` are snapshotted before the call so mutation is detected.
function observe(fn, args) {
  const before = args.map(snapshot);
  let result, error = null;
  try { result = fn.apply(null, args); } catch (e) { error = { name: e.name, constructor: e.constructor && e.constructor.name, message: e.message }; }
  const after = args.map(snapshot);
  const out = {
    result: error ? null : (result === undefined ? '__undefined__' : JSON.parse(JSON.stringify(result))),
    error,
    argsUnchanged: before.every((b, i) => b === after[i]),
    returnedArg: error ? -1 : args.findIndex(a => a !== null && typeof a === 'object' && a === result)
  };
  if (!error && Array.isArray(result)) {
    // How many returned elements are the same objects the caller passed in (shared) rather than copies.
    const pool = new Set();
    args.forEach(a => { if (Array.isArray(a)) a.forEach(e => { if (e && typeof e === 'object') pool.add(e); }); });
    out.sharedElements = result.filter(e => pool.has(e)).length;
  }
  return out;
}

function cases(SE) {
  const list = [];
  const add = (name, fn, args, opts) => list.push({ name, fn, args, opts: opts || {} });
  const merge = (l, r, o) => SE.mergeTrackingProgress(l, r, o);

  // ── mergeDoneArrays ────────────────────────────────────────────────────
  add('done/both-null', SE.mergeDoneArrays, [null, null, 4]);
  add('done/both-undefined', SE.mergeDoneArrays, [undefined, undefined, 4]);
  add('done/local-null', SE.mergeDoneArrays, [null, [1, 0, 1], 3]);
  add('done/remote-null', SE.mergeDoneArrays, [[1, 0, 1], null, 3]);
  add('done/union', SE.mergeDoneArrays, [[1, 0, 0, 2], [0, 0, 1, 0], 4]);
  add('done/length-longer-than-inputs', SE.mergeDoneArrays, [[1], [0, 1], 4]);
  add('done/length-shorter-than-inputs', SE.mergeDoneArrays, [[1, 1, 1], [0, 0, 0], 2]);
  add('done/length-zero', SE.mergeDoneArrays, [[1], [1], 0]);
  add('done/truthy-strings', SE.mergeDoneArrays, [['x', '', null], [0, 'y', undefined], 3]);
  add('done/typed-array', SE.mergeDoneArrays, [Uint8Array.from([1, 0]), Uint8Array.from([0, 1]), 2]);
  add('done/negative-length-throws', SE.mergeDoneArrays, [[1], [1], -1]);
  add('done/fractional-length-throws', SE.mergeDoneArrays, [[1], [1], 1.5]);

  // ── mergeSessions (facade) ─────────────────────────────────────────────
  add('sessions/both-empty', SE.mergeSessions, [[], [], []]);
  add('sessions/both-undefined', SE.mergeSessions, [undefined, undefined, undefined]);
  add('sessions/local-empty-keeps-remote-order', SE.mergeSessions, [[], [sess({ id: 'b', start: '2026-07-03T00:00:00Z' }), sess({ id: 'a', start: '2026-07-02T00:00:00Z' })], []]);
  add('sessions/remote-empty-keeps-local-order', SE.mergeSessions, [[sess({ id: 'b', start: '2026-07-03T00:00:00Z' }), sess({ id: 'a', start: '2026-07-02T00:00:00Z' })], [], []]);
  add('sessions/union-sorted-by-start', SE.mergeSessions, [
    [sess({ id: 'c', start: '2026-07-03T00:00:00Z' })],
    [sess({ id: 'a', start: '2026-07-01T00:00:00Z' }), sess({ id: 'b', start: '2026-07-02T00:00:00Z' })], []]);
  add('sessions/same-id-later-edit-wins', SE.mergeSessions, [
    [sess({ id: 'a', note: 'local', editedAt: '2026-08-01T00:00:00Z' })],
    [sess({ id: 'a', note: 'remote', editedAt: '2026-08-02T00:00:00Z' })], []]);
  add('sessions/same-id-earlier-edit-loses', SE.mergeSessions, [
    [sess({ id: 'a', note: 'local', editedAt: '2026-08-02T00:00:00Z' })],
    [sess({ id: 'a', note: 'remote', editedAt: '2026-08-01T00:00:00Z' })], []]);
  add('sessions/same-id-never-edited-keeps-local', SE.mergeSessions, [
    [sess({ id: 'a', note: 'local' })], [sess({ id: 'a', note: 'remote' })], []]);
  add('sessions/same-id-remote-edited-vs-unedited-local', SE.mergeSessions, [
    [sess({ id: 'a', note: 'local' })], [sess({ id: 'a', note: 'remote', editedAt: '2026-08-01T00:00:00Z' })], []]);
  add('sessions/unparseable-editedAt-counts-as-oldest', SE.mergeSessions, [
    [sess({ id: 'a', note: 'local', editedAt: 'not a date' })],
    [sess({ id: 'a', note: 'remote', editedAt: '2026-08-01T00:00:00Z' })], []]);
  add('sessions/duplicate-in-local-keeps-first', SE.mergeSessions, [
    [sess({ id: 'a', note: 'first' }), sess({ id: 'a', note: 'second' })], [sess({ id: 'z', start: '2026-07-09T00:00:00Z' })], []]);
  add('sessions/tombstone-removes-both-sides', SE.mergeSessions, [
    [sess({ id: 'a' }), sess({ id: 'b', start: '2026-07-02T00:00:00Z' })],
    [sess({ id: 'a' }), sess({ id: 'c', start: '2026-07-03T00:00:00Z' })], ['a']]);
  add('sessions/tombstone-all-local-returns-filtered-remote', SE.mergeSessions, [
    [sess({ id: 'a' })], [sess({ id: 'r', start: '2026-07-05T00:00:00Z' }), sess({ id: 'q', start: '2026-07-04T00:00:00Z' })], ['a']]);
  add('sessions/null-and-falsy-entries-dropped', SE.mergeSessions, [
    [null, sess({ id: 'a' }), 0, undefined], [false, sess({ id: 'b', start: '2026-07-02T00:00:00Z' })], []]);
  add('sessions/id-zero-is-a-real-id', SE.mergeSessions, [
    [sess({ id: 0 })], [sess({ id: 0, note: 'remote', editedAt: '2026-08-01T00:00:00Z' })], []]);
  add('sessions/id-zero-tombstoned', SE.mergeSessions, [[sess({ id: 0 })], [sess({ id: 1, start: '2026-07-02T00:00:00Z' })], [0]]);
  add('sessions/numeric-id-tombstone-does-not-match-string-id-types', SE.mergeSessions, [[sess({ id: '7' })], [sess({ id: 8, start: '2026-07-02T00:00:00Z' })], [7]]);
  add('sessions/no-id-keyed-by-start', SE.mergeSessions, [
    [{ start: '2026-07-01T00:00:00Z', note: 'l' }], [{ start: '2026-07-01T00:00:00Z', note: 'r' }, { start: '2026-07-02T00:00:00Z' }], []]);
  add('sessions/no-id-no-start-keyed-by-date-minutes-stitches', SE.mergeSessions, [
    [{ date: '2026-07-01', durationMinutes: 5, netStitches: 9, note: 'l' }, { date: '2026-07-01', note: 'blank' }],
    [{ date: '2026-07-01', durationMinutes: 5, netStitches: 9, note: 'r' }, { date: '2026-07-01', durationMinutes: 0, netStitches: 0, note: 'blank-r' }], []]);
  add('sessions/sort-uses-startTime-then-start-then-date', SE.mergeSessions, [
    [{ id: 'a', startTime: '2026-07-03T00:00:00Z' }, { id: 'b', date: '2026-07-01' }],
    [{ id: 'c', start: '2026-07-02T00:00:00Z' }, { id: 'd' }], []]);
  // Unparseable dates make the sort comparator return NaN, which engines order differently; the differential
  // harness covers that against the base on one engine instead of recording it here.
  add('sessions/non-array-tombstones-throws', SE.mergeSessions, [[sess()], [sess({ id: 'x' })], 'abc']);
  add('sessions/non-array-local-throws', SE.mergeSessions, [{ a: 1 }, [], []]);
  add('sessions/non-array-remote-throws', SE.mergeSessions, [[], 5, []]);

  // ── mergeIndexedPairs (facade) ─────────────────────────────────────────
  add('pairs/both-empty-returns-local-array', SE.mergeIndexedPairs, [[], []]);
  add('pairs/both-empty-local-undefined-returns-remote', SE.mergeIndexedPairs, [undefined, []]);
  add('pairs/both-undefined', SE.mergeIndexedPairs, [undefined, undefined]);
  add('pairs/both-non-array', SE.mergeIndexedPairs, [null, 'x']);
  add('pairs/local-only', SE.mergeIndexedPairs, [[[3, { fwd: true }], [1, { bck: true }]], []]);
  add('pairs/remote-only', SE.mergeIndexedPairs, [undefined, [[2, { fwd: true }]]]);
  add('pairs/shared-index-fills-missing-subkeys', SE.mergeIndexedPairs, [
    [[5, { TL: 'a', TR: null }]], [[5, { TL: 'z', TR: 'b', BL: 'c', BR: undefined }]]]);
  add('pairs/shared-index-non-object-detail-local-wins', SE.mergeIndexedPairs, [[[5, 1]], [[5, { TL: 'x' }]]]);
  add('pairs/shared-index-null-local-detail', SE.mergeIndexedPairs, [[[5, null]], [[5, { TL: 'x' }]]]);
  add('pairs/index-types-coerce-to-string-keys', SE.mergeIndexedPairs, [[[1, { a: 1 }]], [['1', { b: 2 }], [2, { c: 3 }]]]);
  add('pairs/malformed-pairs-skipped', SE.mergeIndexedPairs, [[null, [], [1], 'ab', [7, { x: 1 }]], [[], [8]]]);
  add('pairs/proto-like-key', SE.mergeIndexedPairs, [[['__proto__', { x: 1 }], ['constructor', { y: 1 }]], [['__proto__', { z: 1 }]]]);
  add('pairs/nested-detail-is-copied-not-shared', SE.mergeIndexedPairs, [[[1, { a: { deep: [1, 2] } }]], [[2, { b: { deep: [3] } }]]]);
  add('pairs/dates-in-detail', SE.mergeIndexedPairs, [[[1, { at: new Date('2026-01-01T00:00:00Z') }]], []]);

  // ── mergeStitchLogs (facade) ───────────────────────────────────────────
  add('log/both-empty-returns-local-array', SE.mergeStitchLogs, [[], []]);
  add('log/both-undefined', SE.mergeStitchLogs, [undefined, undefined]);
  add('log/local-undefined-remote-empty', SE.mergeStitchLogs, [undefined, []]);
  add('log/distinct-days-sorted', SE.mergeStitchLogs, [[{ date: '2026-07-03', count: 3 }], [{ date: '2026-07-01', count: 1 }]]);
  add('log/shared-day-takes-max', SE.mergeStitchLogs, [[{ date: '2026-07-01', count: 9 }], [{ date: '2026-07-01', count: 4 }, { date: '2026-07-01', count: 12 }]]);
  add('log/malformed-entries', SE.mergeStitchLogs, [
    [null, {}, { date: '' }, { date: '2026-07-01' }, { date: '2026-07-02', count: '5' }, { date: '2026-07-03', count: NaN }, { date: '2026-07-04', count: Infinity }, { date: '2026-07-05', count: -3 }],
    [{ date: '2026-07-01', count: -2 }]]);
  add('log/extra-fields-dropped', SE.mergeStitchLogs, [[{ date: '2026-07-01', count: 1, note: 'x' }], []]);
  add('log/non-array-inputs', SE.mergeStitchLogs, [{ date: '2026-07-01', count: 1 }, 'x']);

  // ── mergeTrackingProgress: sessions, totals, tombstones ────────────────
  const A = entry('a', '2026-07-01T09:00:00Z', 10, 10);
  const B = entry('b', '2026-07-02T09:00:00Z', 5, 15);
  const C = entry('c', '2026-07-03T09:00:00Z', 7, 22);
  const B2 = entry('b2', '2026-07-02T10:00:00Z', 3, 13);
  const prog = (name, local, remote, overrides) => add(name, merge, [local, remote, overrides]);

  prog('progress/journals-both-sides-rebuild-running-totals', proj(OLD, { statsSessions: [A, B] }), proj(NEW, { statsSessions: [A, B2, C] }));
  prog('progress/journal-one-side-only-not-rebuilt', proj(OLD, { statsSessions: [A, B] }), proj(NEW, { statsSessions: [] }));
  prog('progress/journals-without-totalAtEnd-no-baseline', proj(OLD, { statsSessions: [{ id: 'a', start: '2026-07-01T09:00:00Z', netStitches: 3 }] }), proj(NEW, { statsSessions: [{ id: 'b', start: '2026-07-02T09:00:00Z', netStitches: 4 }] }));
  prog('progress/baseline-from-remote-when-local-has-none', proj(OLD, { statsSessions: [{ id: 'a', start: '2026-07-01T09:00:00Z', netStitches: 3 }] }), proj(NEW, { statsSessions: [A, B] }));
  prog('progress/total-is-capped-by-project-size', proj(OLD, { statsSessions: [entry('a', '2026-07-01T09:00:00Z', 10, 10)] }), proj(NEW, { statsSessions: [entry('b', '2026-07-02T09:00:00Z', 30, 40)] }));
  prog('progress/units-take-precedence-over-netStitches', proj(OLD, { statsSessions: [entry('a', '2026-07-01T09:00:00Z', 4, 4, { units: 8 })] }), proj(NEW, { statsSessions: [entry('b', '2026-07-02T09:00:00Z', 2, 6, { units: undefined })] }));
  prog('progress/tombstoned-session-excluded-and-totalTime-recomputed',
    proj(OLD, { statsSessions: [A, B], sessions: [A, B], totalTime: 900, deletedSessionIds: ['b'] }),
    proj(NEW, { statsSessions: [A, B, C], sessions: [A, C], totalTime: 1200 }));
  prog('progress/remote-tombstone-only', proj(OLD, { statsSessions: [A, B], sessions: [A, B] }), proj(NEW, { statsSessions: [A], sessions: [A], deletedSessionIds: ['b', 'zzz'] }));
  prog('progress/tombstones-union-dedupe-and-nulls', proj(OLD, { deletedSessionIds: ['x', null, 'y'], deletedSnapshotIds: ['p'] }), proj(NEW, { deletedSessionIds: ['y', 'z', undefined], deletedSnapshotIds: ['p', 'q'] }));
  prog('progress/stitchLog-rebuilt-from-sessions-after-deletion',
    proj(OLD, { statsSessions: [A, B], stitchLog: [{ date: '2026-07-01', count: 10 }, { date: '2026-07-02', count: 5 }], deletedSessionIds: ['b'] }),
    proj(NEW, { statsSessions: [A, B], stitchLog: [{ date: '2026-07-02', count: 99 }] }));
  const secs = (over) => Object.assign({ id: 'x', start: '2026-07-01T09:00:00Z' }, over);
  prog('progress/totalTime-prefers-durationSeconds',
    proj(OLD, { sessions: [secs({ id: 'a', durationSeconds: 100, durationMinutes: 9 })], totalTime: 5 }),
    proj(NEW, { sessions: [secs({ id: 'b', start: '2026-07-02T09:00:00Z', durationMinutes: 2 })], totalTime: 7 }));
  prog('progress/totalTime-ignores-non-finite-and-non-numeric',
    proj(OLD, { sessions: [secs({ id: 'a', durationSeconds: NaN, durationMinutes: 1 }), secs({ id: 'b', start: '2026-07-02T09:00:00Z', durationSeconds: '60' }), null] }),
    proj(NEW, { sessions: [secs({ id: 'c', start: '2026-07-03T09:00:00Z', durationSeconds: Infinity, durationMinutes: Infinity })] }));
  prog('progress/totalTime-takes-largest-of-local-remote-sessions', proj(OLD, { totalTime: 500 }), proj(NEW, { totalTime: 300 }));
  prog('progress/statsSessions-and-sessions-merge-independently', proj(OLD, { statsSessions: [A], sessions: [B] }), proj(NEW, { statsSessions: [C], sessions: [B2] }));
  prog('progress/malformed-sessions-throw', proj(OLD, { statsSessions: 'oops' }), proj(NEW, { statsSessions: [A] }));

  // ── mergeTrackingProgress: parking markers ─────────────────────────────
  const park = (l, r) => add('progress/parkMarkers/' + l.name, merge, [proj(OLD, { parkMarkers: l.v }), proj(NEW, { parkMarkers: r })]);
  park({ name: 'positioned-union-sorted-by-key', v: [{ x: 3, y: 1, colorId: '310', corner: 'TL' }] }, [{ x: 1, y: 1, colorId: '310' }]);
  park({ name: 'numeric-strings-coerced-and-colour-stringified', v: [{ x: '2', y: '5', colorId: 310 }] }, [{ x: 2, y: 5, colorId: '310', corner: 'BL' }]);
  park({ name: 'duplicate-identity-keeps-lexically-smaller-payload', v: [{ x: 1, y: 1, colorId: '310', rgb: [9, 9, 9] }] }, [{ x: 1, y: 1, colorId: '310', rgb: [1, 1, 1] }]);
  park({ name: 'legacy-idx-and-cellIdx-share-identity', v: [{ idx: 4, colorId: '310' }] }, [{ cellIdx: 4, colorId: '310', note: 'r' }]);
  park({ name: 'legacy-corner-defaults-to-BL', v: [{ idx: 4, colorId: '310', corner: 'BL' }] }, [{ idx: 4, colorId: '310' }]);
  park({ name: 'unpositioned-keyed-by-whole-payload', v: [{ colorId: '310', note: 'a' }] }, [{ colorId: '310', note: 'a' }, { note: 'b', colorId: '310' }]);
  park({ name: 'partial-coordinates-are-not-positioned', v: [{ x: 1, colorId: '310' }, { x: null, y: 2, colorId: '310' }] }, [{ x: 1, y: 'abc', colorId: '310' }]);
  park({ name: 'non-array-and-malformed-entries-ignored', v: 'nope' }, [null, 3, 'x', { x: 1, y: 2, colorId: '5' }]);
  park({ name: 'missing-colourId-becomes-undefined-string', v: [{ x: 1, y: 2 }] }, [{ x: 1, y: 2, colorId: 'undefined' }]);
  park({ name: 'result-is-a-deep-copy', v: [{ x: 1, y: 2, colorId: '1', meta: { deep: [1] } }] }, []);

  // ── mergeTrackingProgress: work area and lifecycle dates ───────────────
  const wa = (name, l, r) => add('progress/workArea/' + name, merge, [proj(OLD, { workArea: l }), proj(NEW, { workArea: r })]);
  const area = (setAt, x1) => ({ x0: 0, y0: 0, x1: x1 || 2, y1: 2, setAt });
  wa('newer-setAt-wins', area(5), area(9, 3));
  wa('older-remote-loses', area(9), area(5, 3));
  wa('tie-keeps-local', area(5), area(5, 3));
  wa('remote-null-keeps-local', area(5), null);
  wa('local-null-takes-remote', null, area(5));
  wa('both-absent', undefined, undefined);
  wa('non-object-remote-keeps-local', area(5), 'x');
  wa('non-object-local-takes-remote', 'x', area(5));
  wa('non-finite-setAt-counts-as-zero', area(NaN), area(0, 3));
  wa('string-setAt-counts-as-zero', area('99'), area(1, 3));

  const iso = (name, l, r) => add('progress/lifecycle/' + name, merge, [
    proj(OLD, { startedAt: l[0], lastTouchedAt: l[1], completedAt: l[2] }),
    proj(NEW, { startedAt: r[0], lastTouchedAt: r[1], completedAt: r[2] })]);
  iso('ordinary', ['2026-07-02T00:00:00Z', '2026-07-02T00:00:00Z', '2026-07-09T00:00:00Z'], ['2026-07-01T00:00:00Z', '2026-07-05T00:00:00Z', '2026-07-08T00:00:00Z']);
  iso('ties-keep-local', ['2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z', '2026-07-02T00:00:00.000Z'], ['2026-07-02T00:00:00Z', '2026-07-02T00:00:00Z', '2026-07-02T00:00:00Z']);
  iso('blank-local', [undefined, '', null], ['2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z']);
  iso('blank-remote', ['2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'], [undefined, '', null]);
  iso('both-blank', [undefined, null, ''], ['', undefined, null]);
  iso('unparseable-takes-remote', ['garbage', 'garbage', 'garbage'], ['2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z']);
  iso('unparseable-remote-wins-by-comparison-rule', ['2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z', '2026-07-01T00:00:00Z'], ['garbage', 'garbage', 'garbage']);
  iso('mixed-formats', ['2026-07-01', '2026-07-01T12:00:00+01:00', '2026-07-01T00:00:00.000Z'], ['2026-07-01T00:00:00Z', '2026-07-01T11:30:00Z', '2026-07-01T01:00:00+01:00']);

  // ── Classification: parking markers count towards "same tracking state" ─
  const classify = (name, l, r) => add('classify/' + name, () => {
    const local = proj(NEW, { parkMarkers: l });
    const remote = proj(NEW, { parkMarkers: r });
    const out = SE.classifyProjects([{ id: remote.id, updatedAt: remote.updatedAt, data: remote }], { [local.id]: local });
    return out.map(e => e.classification);
  }, [], { wrapped: true });
  classify('same-markers', [{ x: 1, y: 1, colorId: '310' }], [{ x: 1, y: 1, colorId: '310' }]);
  classify('same-markers-different-order', [{ x: 1, y: 1, colorId: '310' }, { x: 2, y: 2, colorId: '311' }], [{ x: 2, y: 2, colorId: '311' }, { x: 1, y: 1, colorId: '310' }]);
  classify('string-vs-number-coordinates', [{ x: '1', y: '1', colorId: 310 }], [{ x: 1, y: 1, colorId: '310' }]);
  classify('different-markers', [{ x: 1, y: 1, colorId: '310' }], [{ x: 1, y: 1, colorId: '311' }]);
  classify('none-vs-some', [], [{ x: 1, y: 1, colorId: '310' }]);
  classify('duplicate-collapses', [{ x: 1, y: 1, colorId: '310' }, { x: 1, y: 1, colorId: '310' }], [{ x: 1, y: 1, colorId: '310' }]);

  // ── Whole-merge idempotence / re-merge stability ───────────────────────
  add('progress/remerge-is-stable', () => {
    const l = proj(OLD, { statsSessions: [A, B], sessions: [A, B], totalTime: 900, stitchLog: [{ date: '2026-07-01', count: 10 }], parkMarkers: [{ x: 1, y: 1, colorId: '310' }], halfStitches: [[1, { fwd: true }]], workArea: area(3), startedAt: '2026-07-01T00:00:00Z' });
    const r = proj(NEW, { statsSessions: [A, C], sessions: [A, C], totalTime: 1200, stitchLog: [{ date: '2026-07-03', count: 7 }], parkMarkers: [{ x: 2, y: 2, colorId: '311' }], halfStitches: [[2, { bck: true }]], workArea: area(8, 3), startedAt: '2026-06-30T00:00:00Z' });
    let m = merge(l, r);
    const once = JSON.parse(JSON.stringify(m));
    for (let i = 0; i < 4; i++) m = merge(m, r);
    return { once, again: JSON.parse(JSON.stringify(m)) };
  }, [], { wrapped: true });

  return list;
}

// Runs every case and returns { name: outcome }.
function run(SE) {
  const out = {};
  cases(SE).forEach(c => {
    out[c.name] = c.opts.wrapped
      ? (() => { try { return { result: c.fn() }; } catch (e) { return { error: { name: e.name, message: e.message } }; } })()
      : observe(c.fn, c.args);
  });
  return out;
}

module.exports = { cases, run, observe };
