/**
 * Stats helpers tests
 *
 * Tests for streak calculations, daily stitch data, goal tracking,
 * and other stats-related functions in helpers.js.
 */
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8');
eval(code);

// Helper to build a session object for testing
function makeSession(date, netStitches, durationSeconds, opts) {
  return Object.assign({
    id: 'sess_' + Date.now() + Math.random(),
    date: date,
    startTime: date + 'T10:00:00.000Z',
    endTime: date + 'T11:00:00.000Z',
    durationSeconds: durationSeconds || 3600,
    durationMinutes: Math.round((durationSeconds || 3600) / 60),
    stitchesCompleted: netStitches || 0,
    stitchesUndone: 0,
    netStitches: netStitches || 0,
    totalAtEnd: 0,
    percentAtEnd: 0,
    note: '',
    coloursWorked: [],
  }, opts || {});
}

describe('computeStreaks', () => {
  test('returns {current:0, longest:0} for no sessions', () => {
    expect(computeStreaks([], 0)).toEqual({ current: 0, longest: 0 });
  });

  test('detects a simple 3-day streak ending today', () => {
    const today = getStitchingDate(new Date(), 0);
    const d1 = new Date(today + 'T12:00:00');
    d1.setDate(d1.getDate() - 2);
    const d2 = new Date(today + 'T12:00:00');
    d2.setDate(d2.getDate() - 1);
    const sessions = [
      makeSession(formatLocalDateYYYYMMDD(d1), 10),
      makeSession(formatLocalDateYYYYMMDD(d2), 15),
      makeSession(today, 20),
    ];
    const result = computeStreaks(sessions, 0);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
  });

  test('detects streak ending yesterday', () => {
    const today = getStitchingDate(new Date(), 0);
    const yesterday = new Date(today + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const dayBefore = new Date(today + 'T12:00:00');
    dayBefore.setDate(dayBefore.getDate() - 2);
    const sessions = [
      makeSession(formatLocalDateYYYYMMDD(dayBefore), 10),
      makeSession(formatLocalDateYYYYMMDD(yesterday), 15),
    ];
    const result = computeStreaks(sessions, 0);
    expect(result.current).toBe(2);
  });

  test('broken streak (gap) resets current but keeps longest', () => {
    const today = getStitchingDate(new Date(), 0);
    const twoDaysAgo = new Date(today + 'T12:00:00');
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 5);
    const sessions = [
      makeSession(formatLocalDateYYYYMMDD(twoDaysAgo), 10),
      makeSession(today, 5),
    ];
    const result = computeStreaks(sessions, 0);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
  });

  test('handles dayEndHour correctly for yesterday calculation', () => {
    // With dayEndHour=4, if it's currently before 4AM the "today" date is shifted back
    // This test verifies the yesterday calculation also shifts
    const deh = 4;
    const todayAdjusted = getStitchingDate(new Date(), deh);
    const yesterdayAdj = new Date(todayAdjusted + 'T12:00:00');
    yesterdayAdj.setDate(yesterdayAdj.getDate() - 1);
    const sessions = [
      makeSession(formatLocalDateYYYYMMDD(yesterdayAdj), 10),
      makeSession(todayAdjusted, 20),
    ];
    const result = computeStreaks(sessions, deh);
    expect(result.current).toBe(2);
  });
});

describe('getDailyStitchData', () => {
  test('returns correct number of days', () => {
    const data = getDailyStitchData([], 7, 0);
    expect(data.length).toBe(7);
  });

  test('marks today correctly', () => {
    const data = getDailyStitchData([], 7, 0);
    const todayEntry = data.find(d => d.isToday);
    expect(todayEntry).toBeDefined();
    expect(todayEntry.date).toBe(getStitchingDate(new Date(), 0));
  });

  test('today is last entry', () => {
    const data = getDailyStitchData([], 7, 0);
    expect(data[data.length - 1].isToday).toBe(true);
  });

  test('aggregates stitches per day correctly', () => {
    const today = getStitchingDate(new Date(), 0);
    const sessions = [
      makeSession(today, 10),
      makeSession(today, 5),
    ];
    const data = getDailyStitchData(sessions, 7, 0);
    const todayData = data.find(d => d.isToday);
    expect(todayData.stitches).toBe(15);
  });

  test('uses dayEndHour-adjusted dates for axis', () => {
    const deh = 4;
    const todayAdjusted = getStitchingDate(new Date(), deh);
    const data = getDailyStitchData([], 7, deh);
    // Last entry should be the adjusted today
    expect(data[data.length - 1].date).toBe(todayAdjusted);
    expect(data[data.length - 1].isToday).toBe(true);
  });
});

describe('getStatsTodayStitches', () => {
  test('sums only today sessions', () => {
    const today = getStitchingDate(new Date(), 0);
    const yesterday = new Date(today + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const sessions = [
      makeSession(formatLocalDateYYYYMMDD(yesterday), 100),
      makeSession(today, 30),
      makeSession(today, 20),
    ];
    expect(getStatsTodayStitches(sessions, 0)).toBe(50);
  });
});

describe('getStatsThisWeekStitches', () => {
  test('sums sessions from Monday onwards', () => {
    const today = getStitchingDate(new Date(), 0);
    const sessions = [
      makeSession(today, 25),
    ];
    const result = getStatsThisWeekStitches(sessions, 0);
    expect(result).toBe(25);
  });
});

describe('computeOverviewStats', () => {
  test('computes basic stats correctly', () => {
    const sessions = [
      makeSession('2026-04-18', 100, 3600),
      makeSession('2026-04-19', 50, 1800),
    ];
    const stats = computeOverviewStats(sessions, 150, 1000);
    expect(stats.percent).toBe(15);
    expect(stats.stitchesPerHour).toBe(100); // 150 stitches / 1.5 hours
    expect(stats.remaining).toBe(850);
    expect(stats.uniqueDays).toBe(2);
  });

  test('handles empty sessions', () => {
    const stats = computeOverviewStats([], 0, 1000);
    expect(stats.percent).toBe(0);
    expect(stats.stitchesPerHour).toBe(0);
    expect(stats.estimatedCompletion).toBe('—');
  });

  test('respects useActiveDays parameter', () => {
    const sessions = [
      makeSession('2026-01-01', 100, 3600),
      makeSession('2026-04-19', 50, 1800),
    ];
    const statsActive = computeOverviewStats(sessions, 150, 1000, true);
    const statsCalendar = computeOverviewStats(sessions, 150, 1000, false);
    // Active days = 2, calendar days = many more
    expect(statsActive.avgPerDay).toBe(statsActive.avgPerActiveDay);
    expect(statsCalendar.avgPerDay).toBe(statsCalendar.avgPerCalendarDay);
    // Active-day average should be higher (fewer days)
    expect(statsActive.avgPerDay).toBeGreaterThan(statsCalendar.avgPerDay);
  });
});

describe('getStitchingDate', () => {
  test('returns today for dayEndHour=0', () => {
    const now = new Date();
    const result = getStitchingDate(now, 0);
    const expected = now.getFullYear() + '-' +
      ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
      ('0' + now.getDate()).slice(-2);
    expect(result).toBe(expected);
  });

  test('shifts date back when before dayEndHour', () => {
    // 2AM with dayEndHour=4 should return yesterday
    const at2am = new Date('2026-04-19T02:00:00');
    const result = getStitchingDate(at2am, 4);
    expect(result).toBe('2026-04-18');
  });

  test('keeps same date when after dayEndHour', () => {
    // 5AM with dayEndHour=4 should return today
    const at5am = new Date('2026-04-19T05:00:00');
    const result = getStitchingDate(at5am, 4);
    expect(result).toBe('2026-04-19');
  });
});

describe('checkMilestones', () => {
  test('detects percentage milestones', () => {
    const milestones = checkMilestones(9, 11, 100);
    expect(milestones.some(m => m.pct === 10)).toBe(true);
  });

  test('detects 1000-stitch milestones', () => {
    const milestones = checkMilestones(999, 1001, 5000);
    expect(milestones.some(m => m.label && m.label.includes('1000 stitches'))).toBe(true);
  });

  test('returns empty for no milestone crossed', () => {
    const milestones = checkMilestones(5, 6, 100);
    expect(milestones.length).toBe(0);
  });
});
