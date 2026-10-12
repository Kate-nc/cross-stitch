/**
 * Phase 2 batch 5: one estimator (STATS-02). Stitching days converted to calendar days with how often the person
 * actually stitches; one line of basis; a range; no estimate until there is enough history.
 */
process.env.TZ = 'Europe/London';
const PU = require('../progress-units.js');
global.ProgressUnits = PU;
const fs = require('fs');
const path = require('path');
eval(fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8'));
const InsightsEngine = require('../insights-engine.js');

const TODAY = '2026-10-25';
const NOW = new Date(2026, 9, 25, 12, 0, 0);
const dayStr = (offset) => estDateFromNumber(estDayNumber(TODAY) + offset);
function sess(date, added, seconds) {
  return { id: 's' + date, date, startTime: date + 'T10:00:00.000Z', endTime: date + 'T11:00:00.000Z', durationSeconds: seconds || 3600,
    stitchesCompleted: added, stitchesUndone: 0, netStitches: added, units: added, unitsCompleted: added, unitsUndone: 0 };
}
// 10 stitching days in the last 25 (the audit's history project), 145 stitches on each.
function historyProject() {
  const days = [-24, -22, -19, -17, -14, -11, -8, -5, -2, 0];
  return days.map(d => sess(dayStr(d), 145));
}

describe('the worked example from the audit', () => {
  test('10 stitching days in 25, 145 per stitching day, 250 left: about 5 calendar days', () => {
    const est = estimateCompletion(historyProject(), 250, { now: NOW, dayEndHour: 0, percent: 95 });
    expect(est.enough).toBe(true);
    expect(est.stitchesPerStitchingDay).toBe(145);
    expect(est.stitchingDaysPerWeek).toBe(2.8);          // 10 / 25 x 7
    expect(est.stitchingDaysRemaining).toBe(2);
    expect(est.calendarDaysRemaining).toBe(5);           // 2 stitching days at 0.4 a day
    expect(est.finishDate).toBe(dayStr(5));
    expect(est.basis).toBe('Based on your last 25 days: 2.8 stitching days a week, 145 stitches per stitching day');
    expect(est.text).toMatch(/^about 5 days \(around /);
    expect(est.rangeLow <= est.finishDate && est.finishDate <= est.rangeHigh).toBe(true);
    expect(est.rangeLow < est.rangeHigh).toBe(true);
  });
  test('the other copies agree: insights projection, overview and milestone read the same date', () => {
    const sessions = historyProject();
    const proj = InsightsEngine.generateProjections([{ id: 'p', name: 'P', totalStitches: 5000, completedStitches: 4750, statsSessions: sessions }], { now: NOW })[0];
    expect(proj.status).toBe('projected');
    expect(proj.daysRemaining).toBe(5);
    const o = computeOverviewStats(sessions, 4750, 5000, true);
    // the overview uses the real clock; its estimate is built by the same function
    expect(o.estimate.stitchesPerStitchingDay).toBe(145);
    const pace = InsightsEngine.calculateRecentPace(sessions, NOW);
    expect(Math.round(pace.pacePerDay)).toBe(145);
    expect(pace.activeDays).toBe(10);
  });
});

describe('when there is not enough to say', () => {
  test('fewer than 3 stitching days', () => {
    const est = estimateCompletion([sess(dayStr(0), 30), sess(dayStr(-1), 30)], 1000, { now: NOW, dayEndHour: 0, percent: 50 });
    expect(est.enough).toBe(false);
    expect(est.text).toBe('Not enough history yet');
  });
  test('under 5% done, even with enough days', () => {
    const est = estimateCompletion(historyProject(), 9000, { now: NOW, dayEndHour: 0, percent: 3 });
    expect(est.enough).toBe(false);
    expect(est.reason).toBe('history');
  });
  test('nothing stitched in the last 4 weeks gives no estimate, with the reason', () => {
    const old = [-80, -70, -60, -50].map(d => sess(dayStr(d), 100));
    const est = estimateCompletion(old, 500, { now: NOW, dayEndHour: 0, percent: 50 });
    expect(est.enough).toBe(false);
    expect(est.reason).toBe('idle');
  });
  test('a finished project is complete', () => {
    expect(estimateCompletion(historyProject(), 0, { now: NOW, dayEndHour: 0 }).reason).toBe('complete');
  });
});

describe('what counts as a stitching day and the window', () => {
  test('unpicking-only and catch-up-only days are not stitching days', () => {
    const s = historyProject();
    s.push({ ...sess(dayStr(-1), 0), stitchesUndone: 80, unitsUndone: 80, netStitches: -80, units: -80 });
    s.push({ ...sess(dayStr(-3), 387), catchUp: 387 });
    const p = computePace(s, 0, NOW);
    expect(p.activeDays).toBe(10);
    expect(p.perStitchingDay).toBe(145);
  });
  test('only the last 28 days count; the cadence is never below one day a fortnight', () => {
    const s = [sess(dayStr(-60), 500), sess(dayStr(-40), 500), sess(dayStr(-30), 500), sess(dayStr(-2), 100)];
    const p = computePace(s, 0, NOW);
    expect(p.windowDays).toBe(28);
    expect(p.activeDays).toBe(1);
    expect(p.perStitchingDay).toBe(100);
    expect(p.frequency).toBeCloseTo(1 / 28 < 1 / 14 ? 1 / 14 : 1 / 28, 5);
  });
  test('a project younger than 4 weeks uses its own age as the window', () => {
    const s = [dayStr(-9), dayStr(-6), dayStr(-3), dayStr(0)].map(d => sess(d, 100));
    const p = computePace(s, 0, NOW);
    expect(p.windowDays).toBe(10);
    expect(p.frequency).toBeCloseTo(0.4, 5);
  });
  test('the day end moves "today" (and so the window) with the stitching calendar', () => {
    const s = [dayStr(-2), dayStr(-1), dayStr(0)].map(d => sess(d, 100));
    const early = new Date(2026, 9, 26, 0, 30, 0);        // 00:30 on the 26th is still the 25th with a 2 AM day end
    expect(computePace(s, 2, early).windowDays).toBe(3);
    expect(computePace(s, 0, early).windowDays).toBe(4);
  });
});

describe('milestone dates and the required pace use it too', () => {
  test('a milestone ahead is dated by the same estimate', () => {
    const sessions = historyProject();
    const o = computeOverviewStats(sessions, 1450, 5000, true);        // 29% done
    const ms = getMilestones(sessions, 1450, 5000, o.estimate);
    const next = ms.find(m => m.isNext);
    expect(next.percent).toBe(50);
    expect(next.estimatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  test('required pace is per stitching day at the usual cadence', () => {
    const target = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const everyDay = getRequiredPace(400, target);
    const fourDaysAWeek = getRequiredPace(400, target, 4 / 7);
    expect(fourDaysAWeek).toBeGreaterThan(everyDay);
  });
  test('the pace needed always gets there in time: whole stitching opportunities, rounded down', () => {
    const target = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const f = 4 / 7;
    const need = getRequiredPace(400, target, f);              // 11 whole stitching days in 20 calendar days
    const stitchingDays = Math.ceil(400 / need);
    expect(Math.ceil(stitchingDays / f)).toBeLessThanOrEqual(20);
  });
  test('the pace line says what it is', () => {
    const est = estimateCompletion(historyProject(), 250, { now: NOW, dayEndHour: 0, percent: 95 });
    expect(estPaceLine(est)).toBe('Your pace: 145 stitches per stitching day, 2.8 stitching days a week (last 25 days)');
  });
});

describe('home rows', () => {
  test('a row carrying the daily figures gives the same estimate as the sessions', () => {
    const sessions = historyProject();
    const m = dailyAddedMap(sessions);
    const pace = paceFromDaily(m.daily, m.first, TODAY, m.activeDays);
    const est = estimateFromPace(pace, 250, { today: TODAY, percent: 95 });
    expect(est.calendarDaysRemaining).toBe(5);
    expect(estFormatShort(est)).toBe('about 5 days');
  });
});
