/**
 * Phase 2 end of phase: the audit's synthetic history project (10 sessions, 1,350 of 1,600 stitches, 25 elapsed
 * days, "today" = 11 October 2026). Every statistic the audit verified by hand must still read the same after the
 * shared definitions, the unpicking and day-boundary changes and the shared estimator; the estimate is the one
 * deliberate change (one estimator, with its basis).
 */
process.env.TZ = 'Europe/London';
const fs = require('fs');
const path = require('path');
const PU = require('../progress-units.js');
global.ProgressUnits = PU;
eval(fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8'));
const InsightsEngine = require('../insights-engine.js');

// days ago: [stitches, minutes], the audit's plan (the 2-days-ago entry has no stitches and is not a session)
const PLAN = { 24: [100, 40], 23: [120, 45], 22: [90, 30], 17: [200, 70], 16: [150, 50], 10: [80, 30], 9: [110, 40], 8: [60, 20], 3: [300, 100], 1: [140, 45] };
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const NOW = new Date(2026, 9, 11, 12, 0, 0);
function fixture() {
  let total = 0;
  return Object.keys(PLAN).map(Number).sort((a, b) => b - a).map(k => {
    const [n, m] = PLAN[k];
    const d = new Date(2026, 9, 11 - k, 20, 0, 0);
    total += n;
    return { id: 'sess_h' + k, date: ymd(d), startTime: d.toISOString(), endTime: new Date(d.getTime() + m * 60000).toISOString(),
      durationSeconds: m * 60, durationMinutes: m, stitchesCompleted: n, stitchesUndone: 0, netStitches: n,
      totalAtEnd: total, percentAtEnd: Math.round(total / 1600 * 1000) / 10, note: '', coloursWorked: [] };
  });
}
const sessions = fixture();

beforeAll(() => { jest.useFakeTimers({ now: NOW }); });
afterAll(() => { jest.useRealTimers(); });

describe('statistics the audit verified by hand are unchanged', () => {
  test('progress, speed, time', () => {
    const o = computeOverviewStats(sessions, 1350, 1600, true);
    expect(o.percent).toBe(84.4);
    expect(o.stitchesPerHour).toBe(172);                 // 1,350 stitches in 470 minutes
    expect(o.totalMinutes).toBe(470);
    expect(o.remaining).toBe(250);
    expect(o.activeDays).toBe(10);
    expect(o.avgPerActiveDay).toBe(135);                 // "135/day (10 active days of 25 elapsed)"
  });
  test('milestone dates 18 Sep, 24 Sep, 2 Oct, 8 Oct', () => {
    const o = computeOverviewStats(sessions, 1350, 1600, true);
    const ms = getMilestones(sessions, 1350, 1600, o.estimate);
    expect(ms.filter(m => m.achieved).map(m => [m.percent, m.achievedDate])).toEqual([[10, '2026-09-18'], [25, '2026-09-24'], [50, '2026-10-02'], [75, '2026-10-08']]);
  });
  test('streaks current 1 and longest 3; best day 300 on 8 Oct', () => {
    expect(computeStreaks(sessions, 0)).toEqual({ current: 1, longest: 3 });
    const best = findBestDay(sessions);
    expect(best.stitches).toBe(300);
    expect(best.date).toBe('2026-10-08');
  });
  test('this week 440 and last week 250 (+76%), days active 2 / 7', () => {
    expect(getStatsThisWeekStitches(sessions, 0)).toBe(440);              // Monday 5 Oct: 300 + 140
    const lastWeek = sessions.filter(s => s.date >= '2026-09-28' && s.date <= '2026-10-04');
    expect(lastWeek.reduce((a, s) => a + ProgressUnits.sessionAdded(s), 0)).toBe(250);   // 80 + 110 + 60
    expect(Math.round((440 - 250) / 250 * 100)).toBe(76);
  });
  test('weekly streak 4', () => {
    expect(InsightsEngine.computeWeeklyStreak(sessions, NOW)).toBe(4);
  });
  test('average session 47 minutes', () => {
    const avg = sessions.reduce((a, s) => a + getSessionSeconds(s), 0) / sessions.length;
    expect(Math.round(avg / 60)).toBe(47);
  });
});

describe('the one estimate for this project', () => {
  test('250 left, 10 stitching days in 25: about 5 days, around 16 October, in every place it appears', () => {
    const o = computeOverviewStats(sessions, 1350, 1600, true);
    expect(o.estimate.enough).toBe(true);
    expect(o.estimate.calendarDaysRemaining).toBe(5);
    expect(o.estimate.finishDate).toBe('2026-10-16');
    expect(o.estimate.stitchingDaysRemaining).toBe(2);
    expect(o.estimate.stitchingDaysPerWeek).toBe(2.8);
    // the Insights projection (global Insights, the Tracker strip) and the milestone read the same date
    const proj = InsightsEngine.generateProjections([{ id: 'p', name: 'H', totalStitches: 1600, completedStitches: 1350, statsSessions: sessions }], { now: NOW })[0];
    expect(proj.estimate.finishDate).toBe('2026-10-16');
    const ms = getMilestones(sessions, 1350, 1600, o.estimate);
    expect(ms.find(m => m.percent === 100).estimatedDate).toBe('2026-10-16');
    // the share text uses it too
    expect(o.estimatedCompletion).toMatch(/16 Oct/);
  });
  test('the pace is the mean per stitching day (135), not the old recency-weighted 145', () => {
    const o = computeOverviewStats(sessions, 1350, 1600, true);
    expect(o.estimate.stitchesPerStitchingDay).toBe(135);
    expect(o.recentPace).toBe(135);
  });
});

describe('share text and CSV labels (no stale labels, one definition)', () => {
  test('the share text names what each figure measures and carries the one estimate with its basis', () => {
    const o = computeOverviewStats(sessions, 1350, 1600, true);
    const text = generateShareText('History Test', o, sessions, 1350, 1600, 0);
    expect(text).toContain('[x] 1,350 / 1,600 stitches (84.4%)');
    expect(text).toContain('Speed: 172 stitches/hour (estimated) · 135 per stitching day recently');
    expect(text).not.toMatch(/\/day average/);
    expect(text).toContain('Est. finish: about 5 days (around 16 Oct');
    expect(text).toContain('Based on your last 25 days: 2.8 stitching days a week, 135 stitches per stitching day.');
    expect(text).toMatch(/Between \d+ \w+ and \d+ \w+\./);
    expect(text).toContain('Streak: 1 day (longest: 3)');
    expect(text).toContain('Best day: 300 stitches');
    expect(text).not.toMatch(/Est\. completion/);
  });
  test('with too little history the share text makes no estimate', () => {
    const few = sessions.slice(-2);
    const o2 = computeOverviewStats(few, 240, 1600, true);
    const t2 = generateShareText('Few', o2, few, 240, 1600, 0);
    expect(t2).not.toMatch(/Est\. finish/);
  });
  test('the session CSV headers say what each column is, and carry catch-up and unpicking separately', () => {
    const s2 = { ...sessions[0], unitsCompleted: 10, unitsUndone: 3, units: 7, stitchesCompleted: 10, stitchesUndone: 3, netStitches: 7, catchUp: 4, totalAtEnd: 12.5, percentAtEnd: 0.8 };
    const csv = generateSessionCSV([s2]).split('\n');
    expect(csv[0]).toBe('Date,Start Time,End Time,Duration (min),Stitches Completed,Stitches Undone,Net Stitches,Cumulative Total,Percent Complete,Note,Catch-up,Time measured');
    const cells = csv[1].split(',');
    expect(cells.slice(4, 7)).toEqual(['10', '3', '7']);
    expect(cells[7]).toBe('12.5');
    expect(cells[cells.length - 2]).toBe('4');
    expect(cells[cells.length - 1]).toBe('auto');
  });
});
