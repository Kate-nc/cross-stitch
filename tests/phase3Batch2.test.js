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
