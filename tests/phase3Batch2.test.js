/**
 * Phase 3 batch 2 (tracking audit STATS-03): how a session's time was measured is recorded and shown, speed is not
 * claimed for a short estimated session, and the timer's pure rules.
 */
process.env.TZ = 'Europe/London';
const fs = require('fs');
const path = require('path');
const PU = require('../progress-units.js');
global.ProgressUnits = PU;
eval(fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8'));

const sess = (o) => Object.assign({ id: 's', date: '2026-10-10', startTime: '2026-10-10T10:00:00.000Z', endTime: '2026-10-10T10:30:00.000Z', durationSeconds: 1200, stitchesCompleted: 30, stitchesUndone: 0, netStitches: 30, totalAtEnd: 30 }, o);

describe('timing basis', () => {
  test('sessions from before this existed read as auto', () => {
    expect(PU.sessionBasis(sess())).toBe('auto');
    expect(PU.sessionBasis(sess({ timingBasis: 'nonsense' }))).toBe('auto');
    expect(PU.sessionBasis(sess({ timingBasis: 'timer' }))).toBe('timer');
    expect(PU.sessionBasis(sess({ timingBasis: 'edited' }))).toBe('edited');
    expect(PU.sessionBasis(null)).toBe('auto');
  });
  test('labels', () => {
    expect(timingBasisLabel(sess())).toBe('estimated');
    expect(timingBasisLabel(sess({ timingBasis: 'timer' }))).toBe('timed');
    expect(timingBasisLabel(sess({ timingBasis: 'edited' }))).toBe('edited');
  });
});

describe('speed', () => {
  test('a timed session of 20 minutes and 30 stitches is 90 an hour', () => {
    expect(sessionSpeedPerHour(sess({ timingBasis: 'timer' }))).toBe(90);
  });
  test('the same activity worked out automatically also gives 90, but is labelled estimated', () => {
    expect(sessionSpeedPerHour(sess())).toBe(90);
    expect(timingBasisLabel(sess())).toBe('estimated');
  });
  test('an estimated session under 10 minutes shows no speed; a timed one still does', () => {
    expect(sessionSpeedPerHour(sess({ durationSeconds: 540 }))).toBeNull();
    expect(sessionSpeedPerHour(sess({ durationSeconds: 600 }))).toBe(180);
    expect(sessionSpeedPerHour(sess({ durationSeconds: 540, timingBasis: 'timer' }))).toBe(200);
    expect(sessionSpeedPerHour(sess({ durationSeconds: 0, timingBasis: 'timer' }))).toBeNull();
    expect(sessionSpeedPerHour(sess({ stitchesCompleted: 0, netStitches: 0, timingBasis: 'timer' }))).toBeNull();
  });
  test('the total is an estimate when any session was worked out, exact when all were measured', () => {
    expect(sessionsTimeIsEstimated([sess({ timingBasis: 'timer' }), sess({ timingBasis: 'edited' })])).toBe(false);
    expect(sessionsTimeIsEstimated([sess({ timingBasis: 'timer' }), sess()])).toBe(true);
    expect(sessionsTimeIsEstimated([])).toBe(false);
    expect(computeOverviewStats([sess()], 30, 100).timeIsEstimated).toBe(true);
    expect(computeOverviewStats([sess({ timingBasis: 'timer' })], 30, 100).timeIsEstimated).toBe(false);
  });
  test('the overall speed is unchanged by this (past statistics are preserved)', () => {
    const list = [sess({ durationSeconds: 540 }), sess({ id: 'b', durationSeconds: 3600, stitchesCompleted: 100, netStitches: 100 })];
    const total = 30 + 100, hours = (540 + 3600) / 3600;
    expect(computeOverviewStats(list, 130, 1000).stitchesPerHour).toBe(Math.round(total / hours));
  });
});

describe('provenance survives the journal operations', () => {
  const TOTAL = 1000;
  const mk = (id, extra) => sess(Object.assign({ id, date: '2026-10-10', startTime: '2026-10-10T10:00:00.000Z', endTime: '2026-10-10T10:20:00.000Z', totalAtEnd: 30 }, extra));
  const basisAfterMerge = (x, y) => {
    const a = mk('a', x), b = mk('b', Object.assign({ startTime: '2026-10-10T11:00:00.000Z', endTime: '2026-10-10T11:20:00.000Z', totalAtEnd: 60 }, y));
    const r = mergeSessionRecords([a, b], 'a', TOTAL);
    return PU.sessionBasis(r.sessions.find(s => s.id === 'a'));
  };
  test('merging takes the least certain basis', () => {
    expect(basisAfterMerge({ timingBasis: 'timer' }, {})).toBe('auto');
    expect(basisAfterMerge({}, { timingBasis: 'timer' })).toBe('auto');
    expect(basisAfterMerge({ timingBasis: 'timer' }, { timingBasis: 'edited' })).toBe('edited');
    expect(basisAfterMerge({ timingBasis: 'edited' }, { timingBasis: 'timer' })).toBe('edited');
    expect(basisAfterMerge({ timingBasis: 'timer' }, { timingBasis: 'timer' })).toBe('timer');
    expect(basisAfterMerge({}, {})).toBe('auto');
  });
  test('a timed session that ran across the day end keeps its basis on every day record', () => {
    const whole = mk('w', { timingBasis: 'timer', startTime: new Date(2026, 9, 10, 23, 0).toISOString(), endTime: new Date(2026, 9, 11, 1, 0).toISOString(), durationSeconds: 7200, totalAtEnd: 20, stitchesCompleted: 20, netStitches: 20, units: 20, unitsCompleted: 20, unitsUndone: 0 });
    const t0 = new Date(2026, 9, 10, 23, 0).getTime();
    const parts = splitSessionByDays(whole, { '2026-10-10': { t0: t0, sc: 12, su: 0, uc: 12, uu: 0, cu: 0 }, '2026-10-11': { t0: t0 + 3600000, sc: 8, su: 0, uc: 8, uu: 0, cu: 0 } }, [3600000, 3600000], 100, 0);
    expect(parts).toHaveLength(2);
    parts.forEach(p => expect(PU.sessionBasis(p)).toBe('timer'));
    // and one that was automatic stays automatic (no field)
    const auto = splitSessionByDays(mk('x', { startTime: whole.startTime, endTime: whole.endTime, durationSeconds: 7200, units: 20, unitsCompleted: 20, unitsUndone: 0 }), { '2026-10-10': { t0: t0, sc: 12, su: 0, uc: 12, uu: 0, cu: 0 }, '2026-10-11': { t0: t0 + 3600000, sc: 8, su: 0, uc: 8, uu: 0, cu: 0 } }, [3600000, 3600000], 100, 0);
    auto.forEach(p => expect(PU.sessionBasis(p)).toBe('auto'));
  });
});
