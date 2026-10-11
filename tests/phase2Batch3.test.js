/**
 * Phase 2 batch 3: unpicking (STATS-04) and catch-up marks (STATS-07).
 * Today, pace, best day and streaks read what a session ADDED; unpicking shows as its own figure; catch-up
 * raises progress but is left out of pace.
 */
const fs = require('fs');
const path = require('path');
const PU = require('../progress-units.js');
global.ProgressUnits = PU;
const code = fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8');
eval(code);

const day = (offset) => {
  const d = new Date(getStitchingDate(new Date(), 0) + 'T12:00:00');
  d.setDate(d.getDate() + offset);
  return getStitchingDate(d, 0);
};
function sess(date, completed, undone, extra) {
  return Object.assign({
    id: 's' + Math.random(), date, startTime: date + 'T10:00:00.000Z', endTime: date + 'T11:00:00.000Z',
    durationSeconds: 3600, durationMinutes: 60,
    stitchesCompleted: completed, stitchesUndone: undone, netStitches: completed - undone,
    units: completed - undone, unitsCompleted: completed, unitsUndone: undone,
  }, extra || {});
}

describe('sessionAdded / sessionUnpicked / sessionCatchUp', () => {
  test('+50 and -80: Today is 50, unpicked 80, net -30', () => {
    const s = sess(day(0), 50, 80);
    expect(PU.sessionAdded(s)).toBe(50);
    expect(PU.sessionUnpicked(s)).toBe(80);
    expect(PU.sessionNet(s)).toBe(-30);
  });
  test('catch-up is in progress but not in what was added', () => {
    const s = sess(day(0), 400, 0, { catchUp: 387 });
    expect(PU.sessionAdded(s)).toBe(13);
    expect(PU.sessionCatchUp(s)).toBe(387);
    expect(PU.sessionNet(s)).toBe(400);
  });
  test('old sessions: a net-only session adds its net, never a negative', () => {
    expect(PU.sessionAdded({ netStitches: 30 })).toBe(30);
    expect(PU.sessionAdded({ netStitches: -30 })).toBe(0);
    expect(PU.sessionUnpicked({ netStitches: -30 })).toBe(30);
    expect(PU.sessionAdded({ stitchesCompleted: 20, stitchesUndone: 5, netStitches: 15 })).toBe(20);
  });
});

describe('Today, pace and best day read additions', () => {
  test('Today never goes negative and unpicking is its own figure', () => {
    const sessions = [sess(day(-3), 100, 0), sess(day(0), 0, 80)];
    expect(getStatsTodayStitches(sessions, 0)).toBe(0);
    expect(getStatsTodayUnpicked(sessions, 0)).toBe(80);
  });
  test('speed uses additions only', () => {
    const sessions = [sess(day(-1), 100, 0), sess(day(0), 50, 80)];
    const o = computeOverviewStats(sessions, 70, 1000, true);
    expect(o.stitchesPerHour).toBe(75);
  });
  test('best day does not count unpicking against a day', () => {
    const sessions = [sess(day(-2), 120, 0), sess(day(-1), 50, 80)];
    const best = findBestDay(sessions);
    expect(best.stitches).toBe(120);
  });
});

describe('streaks', () => {
  test('a day of only unpicking is not a stitching day', () => {
    const sessions = [sess(day(-2), 40, 0), sess(day(-1), 0, 80), sess(day(0), 30, 0)];
    expect(computeStreaks(sessions, 0).current).toBe(1);
  });
  test('a day that also had additions counts', () => {
    const sessions = [sess(day(-2), 40, 0), sess(day(-1), 50, 80), sess(day(0), 30, 0)];
    expect(computeStreaks(sessions, 0).current).toBe(3);
  });
  test('a catch-up-only day is not a stitching day', () => {
    const sessions = [sess(day(-1), 387, 0, { catchUp: 387 }), sess(day(0), 30, 0)];
    expect(computeStreaks(sessions, 0).current).toBe(1);
  });
  test('a session with no stitch figures at all still counts', () => {
    const sessions = [{ date: day(-1), durationSeconds: 600 }, sess(day(0), 30, 0)];
    expect(computeStreaks(sessions, 0).current).toBe(2);
  });
});

describe('CSV', () => {
  test('has a Catch-up column at the end and keeps the existing ones', () => {
    const csv = generateSessionCSV([sess(day(0), 400, 0, { catchUp: 387, note: '' })]);
    const [head, row] = csv.split('\n');
    expect(head.endsWith('Note,Catch-up')).toBe(true);
    expect(row.endsWith(',387')).toBe(true);
  });
});
