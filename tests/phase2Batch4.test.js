/**
 * Phase 2 batch 4: day boundaries (STATS-05). Each stitch is on the day it was made; a session that crosses the day
 * end is saved as one record per day; one date helper everywhere; the clocks changing do not move the boundary.
 */
process.env.TZ = 'Europe/London';
const fs = require('fs');
const path = require('path');
const PU = require('../progress-units.js');
global.ProgressUnits = PU;
const code = fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8');
eval(code);

const local = (y, m, d, h, mi) => new Date(y, m - 1, d, h, mi || 0, 0, 0).getTime();

describe('getStitchingDate', () => {
  test('midnight day end: 23:50 and 00:02 are on different days', () => {
    expect(getStitchingDate(local(2026, 10, 10, 23, 50), 0)).toBe('2026-10-10');
    expect(getStitchingDate(local(2026, 10, 11, 0, 2), 0)).toBe('2026-10-11');
  });
  test('2:00 AM day end: 00:02 still counts for the previous day', () => {
    expect(getStitchingDate(local(2026, 10, 11, 0, 2), 2)).toBe('2026-10-10');
    expect(getStitchingDate(local(2026, 10, 11, 2, 0), 2)).toBe('2026-10-11');
  });
  test('getStitchingNow follows the same rule', () => {
    const real = Date;
    const at = local(2026, 10, 11, 0, 30);
    global.Date = class extends real { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } };
    try {
      expect(getStitchingDate(getStitchingNow(2), 0)).toBe('2026-10-10');
      expect(getStitchingDate(getStitchingNow(0), 0)).toBe('2026-10-11');
    } finally { global.Date = real; }
  });
});

describe('nextStitchingDayBoundary', () => {
  test('is the next day-end hour, local time', () => {
    expect(nextStitchingDayBoundary(local(2026, 10, 10, 23, 50), 0)).toBe(local(2026, 10, 11, 0, 0));
    expect(nextStitchingDayBoundary(local(2026, 10, 11, 0, 2), 2)).toBe(local(2026, 10, 11, 2, 0));
    expect(nextStitchingDayBoundary(local(2026, 10, 11, 3, 0), 2)).toBe(local(2026, 10, 12, 2, 0));
  });
  test('the clocks going back (25 October 2026, a 25-hour day) still ends the day at midnight and 2:00', () => {
    expect(new Date(nextStitchingDayBoundary(local(2026, 10, 25, 12, 0), 0)).getDate()).toBe(26);
    expect(new Date(nextStitchingDayBoundary(local(2026, 10, 25, 12, 0), 0)).getHours()).toBe(0);
    const b = nextStitchingDayBoundary(local(2026, 10, 25, 0, 30), 2);
    expect(new Date(b).getHours()).toBe(2);
    expect(new Date(b).getDate()).toBe(25);
    // 01:30 happens twice that night; both belong to the previous stitching day under a 2:00 AM day end.
    expect(getStitchingDate(Date.UTC(2026, 9, 25, 0, 30), 2)).toBe('2026-10-24');   // 01:30 BST
    expect(getStitchingDate(Date.UTC(2026, 9, 25, 1, 30), 2)).toBe('2026-10-24');   // 01:30 GMT
  });
  test('the clocks going forward (29 March 2026, a 23-hour day)', () => {
    const b = nextStitchingDayBoundary(local(2026, 3, 29, 12, 0), 0);
    expect(new Date(b).getDate()).toBe(30);
    expect(new Date(b).getHours()).toBe(0);
  });
});

describe('splitSessionByDays', () => {
  // 10 stitches at 23:50 and 20 at 00:02, the audit's worked example.
  const t1 = local(2026, 10, 10, 23, 50), t2 = local(2026, 10, 11, 0, 2);
  const whole = {
    id: 'sess_1', date: '2026-10-10', startTime: new Date(t1).toISOString(), endTime: new Date(t2 + 60000).toISOString(),
    timingModeUsed: 'classic', durationSeconds: 780, durationMinutes: 13,
    stitchesCompleted: 30, stitchesUndone: 0, netStitches: 30, units: 30, unitsCompleted: 30, unitsUndone: 0,
    totalAtEnd: 230, percentAtEnd: 23, note: '', coloursWorked: ['310'], milestones: [{ label: 'x' }],
  };
  const byDay = {
    '2026-10-10': { t0: t1, sc: 10, su: 0, uc: 10, uu: 0, cu: 0 },
    '2026-10-11': { t0: t2, sc: 20, su: 0, uc: 20, uu: 0, cu: 0 },
  };
  test('10 on the 10th and 20 on the 11th, one group, unique ids, progress adds up', () => {
    const parts = splitSessionByDays(whole, byDay, [600000, 180000], 1000, 0);
    expect(parts.map(p => [p.date, PU.sessionAdded(p)])).toEqual([['2026-10-10', 10], ['2026-10-11', 20]]);
    expect(new Set(parts.map(p => p.id)).size).toBe(2);
    expect(parts.every(p => p.groupId === 'sess_1')).toBe(true);
    expect(parts[0].totalAtEnd).toBe(210);
    expect(parts[1].totalAtEnd).toBe(230);
    expect(parts[1].milestones).toEqual([{ label: 'x' }]);
    expect(parts[0].milestones).toBeUndefined();
    expect(new Date(parts[0].endTime).getTime()).toBe(local(2026, 10, 11, 0, 0));
    expect(parts[0].durationSeconds + parts[1].durationSeconds).toBe(780);
  });
  test('with a 2:00 AM day end the same marks are one day (no split)', () => {
    const deh = 2;
    const days = new Set([t1, t2].map(t => getStitchingDate(t, deh)));
    expect(days.size).toBe(1);
  });
  test('catch-up and unpicking stay with the day they happened on', () => {
    const b = {
      '2026-10-10': { t0: t1, sc: 10, su: 0, uc: 10, uu: 0, cu: 0 },
      '2026-10-11': { t0: t2, sc: 20, su: 5, uc: 20, uu: 5, cu: 12 },
    };
    const parts = splitSessionByDays(whole, b, [600000, 180000], 1000, 0);
    expect(PU.sessionCatchUp(parts[1])).toBe(12);
    expect(PU.sessionAdded(parts[1])).toBe(8);
    expect(PU.sessionUnpicked(parts[1])).toBe(5);
    expect(PU.sessionAdded(parts[0])).toBe(10);
  });
});

describe('live days', () => {
  test('liveAddedOn reads one stitching day of the running session', () => {
    const cur = { date: '2026-10-10', byDay: { '2026-10-10': { uc: 10, cu: 0 }, '2026-10-11': { uc: 20, cu: 5 } } };
    expect(PU.liveAddedOn(cur, '2026-10-10')).toBe(10);
    expect(PU.liveAddedOn(cur, '2026-10-11')).toBe(15);
    expect(PU.liveAddedFrom(cur, '2026-10-10')).toBe(25);
    expect(PU.liveAddedFrom(cur, '2026-10-11')).toBe(15);
  });
  test('a session object from before byDay is read as one day', () => {
    const cur = { date: '2026-10-11', unitsCompleted: 7, unitsUndone: 0 };
    expect(PU.liveAddedOn(cur, '2026-10-11')).toBe(7);
    expect(PU.liveAddedOn(cur, '2026-10-10')).toBe(0);
  });
});

describe('getDayEndHour', () => {
  test('a project value is used until the person sets the app-wide one', () => {
    global.window = { UserPrefs: { get: () => null } };
    expect(getDayEndHour({ dayEndHour: 3 })).toBe(3);
    expect(getDayEndHour({})).toBe(0);
    global.window = { UserPrefs: { get: () => 2 } };
    expect(getDayEndHour({ dayEndHour: 3 })).toBe(2);
    global.window = { UserPrefs: { get: () => 0 } };
    expect(getDayEndHour({ dayEndHour: 3 })).toBe(0);
    delete global.window;
  });
});

describe('review round 1: splitSessionByDays details', () => {
  const t1 = local(2026, 10, 10, 23, 50), t2 = local(2026, 10, 11, 0, 2);
  const mk = (sec) => ({
    id: 's', date: '2026-10-10', startTime: new Date(t1).toISOString(), endTime: new Date(t2 + 1000).toISOString(),
    timingModeUsed: 'classic', durationSeconds: sec, durationMinutes: Math.max(1, Math.round(sec / 60)),
    totalAtEnd: 10, percentAtEnd: 1, note: '', coloursWorked: ['310', '321'],
  });
  const days = (cl1, cl2) => ({
    '2026-10-10': { t0: t1, sc: 1, su: 0, uc: 1, uu: 0, cu: 0, cl: cl1 },
    '2026-10-11': { t0: t2, sc: 1, su: 0, uc: 1, uu: 0, cu: 0, cl: cl2 },
  });
  test('the parts add up to the saved duration whatever the rounding (two 0.6 s parts of a 1 s run)', () => {
    const parts = splitSessionByDays(mk(1), days(), [600, 600], 100, 0);
    expect(parts[0].durationSeconds + parts[1].durationSeconds).toBe(1);
    const p3 = splitSessionByDays(mk(780), days(), [333333, 111111], 100, 0);
    expect(p3[0].durationSeconds + p3[1].durationSeconds).toBe(780);
    expect(p3[0].durationSeconds).toBeGreaterThan(p3[1].durationSeconds);
  });
  test('each part keeps the colours worked on its own day, else the whole run\'s', () => {
    const parts = splitSessionByDays(mk(60), days(new Set(['310']), new Set(['321'])), [30000, 30000], 100, 0);
    expect(parts[0].coloursWorked).toEqual(['310']);
    expect(parts[1].coloursWorked).toEqual(['321']);
    const fallback = splitSessionByDays(mk(60), days(), [30000, 30000], 100, 0);
    expect(fallback[0].coloursWorked).toEqual(['310', '321']);
  });
});

describe('review round 1: wiring', () => {
  const src = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
  test('the unload save merges every record of a split session, not the whole run', () => {
    const t = src('tracker-app.js');
    expect(t).toMatch(/finalisedSession\.records \|\| \[finalisedSession\]/);
    expect(src('useAutoSession.js')).toMatch(/defineProperty\(finalised,'records'/);
  });
  test('changing the day-end preference closes the running session', () => {
    expect(src('user-prefs.js')).toMatch(/cs:prefchange/);
    expect(src('useAutoSession.js')).toMatch(/addEventListener\('cs:prefchange'/);
  });
});
