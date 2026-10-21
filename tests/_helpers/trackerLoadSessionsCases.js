// Fixtures for the Tracker's session rebuild on project load (F-011). Every case is a factory so each run gets fresh
// objects (the rebuild patches session objects in place, which the tests observe). Dates are mid-day UTC so the local
// calendar date is the same in every realistic time zone.
const NOW = '2026-05-20T12:00:00.000Z';

const dmc = (id) => ({ id, type: 'solid' });
const mixedPattern = (stitches, skips) => {
  const out = [];
  const kinds = [dmc('310'), { id: '310+550', type: 'blend' }, { id: 'CUSTOM-1', type: 'solid', rgb: [12, 34, 56] }, dmc('666')];
  for (let i = 0; i < stitches; i++) out.push(Object.assign({}, kinds[i % kinds.length]));
  for (let i = 0; i < skips; i++) out.push(i % 2 ? { id: '__skip__' } : { id: '__empty__' });
  out.push(null);                                    // a hole in a legacy array is neither a stitch nor an error
  return out;
};

const session = (over) => Object.assign({
  id: 'sess_a', date: '2026-03-01', startTime: '2026-03-01T09:00:00.000Z', endTime: '2026-03-01T10:00:00.000Z',
  durationSeconds: 3600, durationMinutes: 60, stitchesCompleted: 20, stitchesUndone: 0, netStitches: 20,
  totalAtEnd: 20, percentAtEnd: 5, coloursWorked: ['310'],
}, over || {});

const v11 = (over) => Object.assign({
  version: 11, id: 'proj_1', page: 'tracker', name: 'Current',
  createdAt: '2026-02-01T12:00:00.000Z', updatedAt: '2026-03-02T12:00:00.000Z',
  settings: { sW: 4, sH: 3, fabricCt: 14 }, bsLines: [], done: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  halfStitches: [[2, { fwd: { id: '310' } }]], halfDone: [[2, { fwd: true }]],
  partialStitches: [[3, { tl: { id: '310+550' } }]], parkMarkers: [], sessions: [], threadOwned: {}, statsSessions: [],
}, over || {});

const CASES = [
  { name: 'v11 sessions that already carry every field', pattern: () => mixedPattern(10, 2),
    project: () => v11({ statsSessions: [session(), session({ id: 'sess_b', date: '2026-03-02', startTime: '2026-03-02T09:00:00.000Z', totalAtEnd: 45, netStitches: 25 })] }) },
  { name: 'v11 sessions missing totalAtEnd are rebuilt chronologically and clamped to the stitch count', pattern: () => mixedPattern(10, 2),
    project: () => v11({ statsSessions: [
      session({ id: 's3', startTime: '2026-03-03T09:00:00.000Z', date: '2026-03-03', netStitches: 6, totalAtEnd: undefined }),
      session({ id: 's1', startTime: '2026-03-01T09:00:00.000Z', date: '2026-03-01', netStitches: 4, totalAtEnd: undefined }),
      session({ id: 's2', startTime: '2026-03-02T09:00:00.000Z', date: '2026-03-02', netStitches: -9, totalAtEnd: undefined }),
      session({ id: 's4', startTime: '2026-03-04T09:00:00.000Z', date: '2026-03-04', netStitches: 50, totalAtEnd: undefined }),
      session({ id: 's5', startTime: '2026-03-05T09:00:00.000Z', date: '2026-03-05', totalAtEnd: 7 }),
    ] }) },
  { name: 'sessions with unparseable start times fall back to string order', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [
      session({ id: 'x2', startTime: undefined, date: '2026-03-02', netStitches: 2, totalAtEnd: undefined }),
      session({ id: 'x1', startTime: undefined, date: '2026-03-01', netStitches: 1, totalAtEnd: undefined }),
      session({ id: 'x0', startTime: undefined, date: undefined, netStitches: 3, totalAtEnd: undefined }),
    ] }) },
  { name: 'durationMinutes-only sessions get durationSeconds; sessions with neither stay as they are', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [
      session({ id: 'm1', durationSeconds: undefined, durationMinutes: 12 }),
      session({ id: 'm2', durationSeconds: undefined, durationMinutes: undefined }),
      session({ id: 'm3', durationSeconds: 0, durationMinutes: 5 }),
    ] }) },
  { name: 'null, bad-date and date-only sessions', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [null, session({ id: 'bad', startTime: 'not a date' }), session({ id: 'dateonly', startTime: undefined, date: '2026-03-01' }), session({ id: 'neither', startTime: undefined, date: undefined }), session({ id: 'ok' })] }) },
  { name: 'legacy v8 total time becomes one synthetic session dated from createdAt', pattern: () => mixedPattern(10, 2),
    project: () => ({ v: 8, id: 'proj_old', name: 'Old', w: 4, h: 3, totalTime: 5400, createdAt: '2025-12-24T12:00:00.000Z', updatedAt: '2026-01-02T12:00:00.000Z', done: [1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0] }) },
  { name: 'legacy total time with a createdAt of today is moved back a day', pattern: () => mixedPattern(10, 2),
    project: () => ({ v: 8, id: 'proj_today', w: 4, h: 3, totalTime: 61, createdAt: '2026-05-20T10:00:00.000Z', updatedAt: '2026-05-20T11:00:00.000Z' }) },
  { name: 'legacy total time with numeric, padded and digit-string timestamps', pattern: () => mixedPattern(4, 0),
    project: () => ({ v: 8, id: 'proj_num', w: 2, h: 2, totalTime: 120, createdAt: Date.parse('2025-11-02T12:00:00.000Z'), updatedAt: ' 1767355200000 ' }) },
  { name: 'legacy total time with only updatedAt', pattern: () => mixedPattern(4, 0),
    project: () => ({ v: 8, id: 'proj_upd', w: 2, h: 2, totalTime: 120, updatedAt: '2025-10-10T12:00:00.000Z' }) },
  { name: 'legacy total time with unusable dates falls back to yesterday', pattern: () => mixedPattern(4, 0),
    project: () => ({ v: 8, id: 'proj_nodate', w: 2, h: 2, totalTime: 120, createdAt: 'garbage', updatedAt: {} }) },
  { name: 'legacy compact pattern with total time and no id', pattern: () => mixedPattern(6, 0),
    project: () => ({ v: 8, p: [['310'], ['311', 'b'], ['', 'k']], w: 3, h: 1, totalTime: 30, createdAt: '2026-01-05T12:00:00.000Z' }) },
  { name: 'deleted session ids stop the legacy session being invented', pattern: () => mixedPattern(4, 0),
    project: () => ({ v: 9, id: 'proj_del', w: 2, h: 2, totalTime: 600, deletedSessionIds: ['sess_legacy'], createdAt: '2026-01-05T12:00:00.000Z' }) },
  { name: 'an empty deletedSessionIds list does not stop it', pattern: () => mixedPattern(4, 0),
    project: () => ({ v: 9, id: 'proj_del0', w: 2, h: 2, totalTime: 600, deletedSessionIds: [], createdAt: '2026-01-05T12:00:00.000Z', done: [1, 1, 1, 1] }) },
  { name: 'no sessions and no total time', pattern: () => mixedPattern(4, 0), project: () => v11() },
  { name: 'statsSessions absent altogether', pattern: () => mixedPattern(4, 0), project: () => { const p = v11(); delete p.statsSessions; return p; } },
  { name: 'a recovered pending session is appended', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session()] }),
    pending: JSON.stringify([session({ id: 'pend', date: '2026-03-09', startTime: '2026-03-09T09:00:00.000Z' })]) },
  { name: 'a single pending object (not an array) is accepted', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session()] }),
    pending: JSON.stringify(session({ id: 'pend1' })) },
  { name: 'a pending session with a higher correction revision replaces the stored one', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session({ id: 'edit', historyCorrectionRevision: 1, note: 'stored' })] }),
    pending: JSON.stringify([session({ id: 'edit', historyCorrectionRevision: 2, historyCorrectedAt: 2000000000000, note: 'pending' })]) },
  { name: 'an edit made after the correction wins over a pending one', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session({ id: 'edit', historyCorrectionRevision: 1, editedAt: '2033-05-18T03:33:20.000Z', note: 'stored' })] }),
    pending: JSON.stringify([session({ id: 'edit', historyCorrectionRevision: 2, historyCorrectedAt: 1000, note: 'pending' })]) },
  { name: 'a pending copy that is not newer leaves the stored session alone', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session({ id: 'edit', note: 'stored' })] }),
    pending: JSON.stringify([session({ id: 'edit', note: 'pending' })]) },
  { name: 'pending entries without an id, null entries and non-objects are skipped', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session()] }),
    pending: JSON.stringify([null, 0, 'text', { note: 'no id' }, session({ id: 'kept' })]) },
  { name: 'pending sessions join the totalAtEnd backfill because they are merged after it', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session({ id: 'a', totalAtEnd: undefined, netStitches: 2 })] }),
    pending: JSON.stringify([session({ id: 'pend', totalAtEnd: undefined, netStitches: 4 })]) },
  { name: 'pending data that is not JSON is ignored', pattern: () => mixedPattern(5, 0),
    project: () => v11({ statsSessions: [session()] }), pending: '{not json' },
  { name: 'a project without an id looks for the unkeyed pending entry', pattern: () => mixedPattern(5, 0),
    project: () => { const p = v11({ statsSessions: [session()] }); delete p.id; return p; },
    pendingKey: 'cs_pending_session_', pending: JSON.stringify([session({ id: 'orphan' })]) },
  { name: 'blends, custom colours, half and partial stitches and progress do not change the sessions', pattern: () => mixedPattern(11, 3),
    project: () => v11({
      done: [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], halfStitches: [[1, { fwd: { id: '310+550' }, bck: { id: 'CUSTOM-1', rgb: [1, 2, 3] } }]],
      halfDone: [['1', { fwd: true }]], partialStitches: [[4, { tl: { id: '666' }, br: { id: '310+550' } }]], partialDone: [[4, ['tl']]],
      symbols: { 310: 'A' }, knots: [{ x: 1, y: 1, id: '310' }], knotsDone: ['1,1'], beads: [], statsSessions: [session({ totalAtEnd: undefined, netStitches: 3 })] }) },
  { name: 'only skip and empty cells, so a backfill is clamped to zero', pattern: () => [{ id: '__skip__' }, { id: '__empty__' }, null],
    project: () => v11({ statsSessions: [session({ totalAtEnd: undefined, netStitches: 8 })] }) },
];

module.exports = { CASES, NOW };
