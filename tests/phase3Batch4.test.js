/**
 * @jest-environment jsdom
 *
 * Phase 3 batch 4 (tracking audit STATS-09): calm motivation. The weekly streak is the default, the preference that
 * hides streaks, goals and celebrations is decided once from what is already there, and a new person starts calm.
 */
const fs = require('fs');
const path = require('path');
const PU = require('../progress-units.js');
window.ProgressUnits = PU; global.ProgressUnits = PU;
(0, eval)(fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8'));
const prefsSrc = fs.readFileSync(path.resolve(__dirname, '..', 'user-prefs.js'), 'utf8');
function loadPrefs() { delete window.UserPrefs; (0, eval)(prefsSrc); return window.UserPrefs; }

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dayAgo = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return ymd(d); };
const sess = (date, n) => ({ id: 's' + date, date, units: n == null ? 10 : n, unitsCompleted: n == null ? 10 : n, unitsUndone: 0, netStitches: n == null ? 10 : n, stitchesCompleted: n == null ? 10 : n, stitchesUndone: 0, durationSeconds: 1800 });

describe('weekly streak (the default)', () => {
  test('counts weeks in a row; a gap of days inside a week costs nothing', () => {
    // one session in each of the last 4 weeks, on a different weekday each time (whatever today is, none are consecutive days)
    const dow = (new Date().getDay() + 6) % 7;                            // 0 = Monday
    const list = [dayAgo(dow), dayAgo(dow + 7 - 2), dayAgo(dow + 14 - 4), dayAgo(dow + 21 - 1)].map(d => sess(d));
    const r = computeWeeklyStreaks(list, 0);
    expect(r.current).toBeGreaterThanOrEqual(3);          // the current week may be the first or second back, depending on the weekday
    expect(r.longest).toBeGreaterThanOrEqual(r.current);
  });
  test('this week having no stitching yet does not break the run', () => {
    const today = new Date(); const dow = (today.getDay() + 6) % 7;      // 0 = Monday
    const lastWeekDay = dayAgo(dow + 3);                                   // Thursday-ish of last week
    const prevWeekDay = dayAgo(dow + 10);
    const r = computeWeeklyStreaks([sess(lastWeekDay), sess(prevWeekDay)], 0);
    expect(r.current).toBe(2);
  });
  test('a missed week ends the run, and the longest run is kept', () => {
    const today = new Date(); const dow = (today.getDay() + 6) % 7;
    const days = [dow + 1, dow + 8, dow + 15, dow + 36, dow + 43].map(dayAgo);       // weeks -1,-2,-3 then -5,-6
    const r = computeWeeklyStreaks(days.map(d => sess(d)), 0);
    expect(r.current).toBe(3);
    expect(r.longest).toBe(3);
  });
  test('unpicking only, or nothing, is not a stitching week', () => {
    expect(computeWeeklyStreaks([], 0)).toEqual({ current: 0, longest: 0 });
    const u = Object.assign(sess(dayAgo(1)), { unitsCompleted: 0, units: -5, unitsUndone: 5, netStitches: -5, stitchesCompleted: 0, stitchesUndone: 5 });
    expect(computeWeeklyStreaks([u], 0)).toEqual({ current: 0, longest: 0 });
  });
  test('wording', () => { expect(weeksText(1)).toBe('1 week'); expect(weeksText(3)).toBe('3 weeks'); expect(weeksText(0)).toBe('0 weeks'); });
});

describe('the preference', () => {
  beforeEach(() => { localStorage.clear(); delete window.ProjectStorage; });
  test('a new person is calm, and stays so until they turn it on', () => {
    const P = loadPrefs();
    expect(P.motivation()).toEqual({ show: false, daily: false });
    const seen = [];
    window.ProjectStorage = { listProjects: () => Promise.resolve([]) };
    return new Promise(res => P.resolveMotivation(v => { seen.push(v); res(); })).then(() => {
      expect(seen).toEqual([false]);
      expect(P.motivation()).toEqual({ show: false, daily: false });
      expect(P.get('showStreaksAndGoals')).toBe(false);
      P.set('showStreaksAndGoals', true);
      expect(P.motivation()).toEqual({ show: true, daily: false });       // daily is its own opt-in
      P.set('showDailyStreak', true);
      expect(P.motivation()).toEqual({ show: true, daily: true });
    });
  });
  test('someone with a stitching history keeps everything (the daily streak too)', () => {
    const P = loadPrefs();
    window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', unitsV: 2, activeDaysTotal: 6, completedStitches: 900 }]) };
    return new Promise(res => P.resolveMotivation(res)).then(v => {
      expect(v).toBe(true);
      expect(P.motivation()).toEqual({ show: true, daily: true });
    });
  });
  test('a row from before the units existed, with progress, counts as a history', () => {
    const P = loadPrefs();
    window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', completedStitches: 40 }]) };
    return new Promise(res => P.resolveMotivation(res)).then(v => expect(v).toBe(true));
  });
  test('goals set, even with no sessions yet, count (global goals, or goals saved with a project)', () => {
    let P = loadPrefs();
    localStorage.setItem('cs_global_goals', JSON.stringify({ weeklyGoal: 500 }));
    return new Promise(res => P.resolveMotivation(res)).then(v => {
      expect(v).toBe(true);
      localStorage.clear(); P = loadPrefs();
      window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', unitsV: 2, activeDaysTotal: 0, statsSettings: { dailyGoal: 100 } }]) };
      return new Promise(res => P.resolveMotivation(res));
    }).then(v => expect(v).toBe(true));
  });
  test('an empty project with no goals is still a new person', () => {
    const P = loadPrefs();
    window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', unitsV: 2, activeDaysTotal: 0, completedStitches: 0 }]) };
    return new Promise(res => P.resolveMotivation(res)).then(v => expect(v).toBe(false));
  });
  test('goals in the older settings key count as existing goals', () => {
    localStorage.setItem('cs_stats_settings', JSON.stringify({ dailyGoal: 100 }));
    const P = loadPrefs();
    return new Promise(res => P.resolveMotivation(res)).then(v => expect(v).toBe(true));
  });
  test('a goal that is only inside an otherwise empty project (the list rows do not carry it) counts', () => {
    const P = loadPrefs();
    const projects = { a: { id: 'a' }, b: { id: 'b', statsSettings: { weeklyGoal: 500 } } };
    window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', unitsV: 2 }, { id: 'b', unitsV: 2 }]), get: id => Promise.resolve(projects[id]) };
    return new Promise(res => P.resolveMotivation(res)).then(v => expect(v).toBe(true));
  });
  test('empty projects with no goals anywhere stay calm', () => {
    const P = loadPrefs();
    window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', unitsV: 2 }]), get: () => Promise.resolve({ id: 'a' }) };
    return new Promise(res => P.resolveMotivation(res)).then(v => expect(v).toBe(false));
  });
  test('a decision already made is never overridden', () => {
    const P = loadPrefs();
    P.set('showStreaksAndGoals', false);
    window.ProjectStorage = { listProjects: () => Promise.resolve([{ id: 'a', unitsV: 2, activeDaysTotal: 50 }]) };
    return new Promise(res => P.resolveMotivation(res)).then(v => {
      expect(v).toBe(false);
      expect(P.motivation().show).toBe(false);
    });
  });
  test('without storage to look at, it stays undecided (and calm)', () => {
    const P = loadPrefs();
    P.resolveMotivation();
    expect(P.get('showStreaksAndGoals')).toBeNull();
    expect(P.motivation().show).toBe(false);
  });
  test('the page-side reader: without the preferences module everything shows, as before', () => {
    delete window.UserPrefs;
    expect(getMotivationPrefs()).toEqual({ show: true, daily: true });
    const P = loadPrefs();
    expect(getMotivationPrefs()).toEqual({ show: false, daily: false });
    P.set('showStreaksAndGoals', true);
    expect(getMotivationPrefs().show).toBe(true);
  });
});
