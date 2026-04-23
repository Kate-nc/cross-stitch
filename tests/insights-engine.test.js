/**
 * insights-engine.js — Brief E unit tests
 *
 * Pure-function tests for the narrative commentary engine. Loaded via require
 * (the file is a UMD-style IIFE that exports for CommonJS).
 */
const path = require('path');
const InsightsEngine = require(path.resolve(__dirname, '..', 'insights-engine.js'));

function makeSession(date, netStitches, hour, durSec) {
  return {
    date: date,
    startTime: date + 'T' + String(hour || 19).padStart(2, '0') + ':00:00.000Z',
    endTime: date + 'T' + String((hour || 19) + 1).padStart(2, '0') + ':00:00.000Z',
    durationSeconds: durSec || 3600,
    durationMinutes: Math.round((durSec || 3600) / 60),
    netStitches: netStitches || 0,
    coloursWorked: []
  };
}

describe('InsightsEngine.generateWeeklySummary', () => {
  test('encouraging message when no stitches this week', () => {
    const out = InsightsEngine.generateWeeklySummary({ stitches: 0 }, { stitches: 100 }, { seed: 0 });
    expect(out.length).toBeGreaterThan(0);
    expect(out.toLowerCase()).toMatch(/no stitches|quiet/);
  });

  test('positive delta produces "more than last week" phrasing', () => {
    const out = InsightsEngine.generateWeeklySummary(
      { stitches: 1000, seconds: 3600, speed: 200, activeDays: 3 },
      { stitches: 500, seconds: 1800, speed: 150, activeDays: 2 },
      { seed: 0 }
    );
    expect(out).toMatch(/1,000/);
    expect(out).toMatch(/100%/);
  });

  test('identical weeks produces "consistent" phrasing', () => {
    const out = InsightsEngine.generateWeeklySummary(
      { stitches: 500, speed: 150, activeDays: 3, seconds: 0 },
      { stitches: 500, speed: 150, activeDays: 3, seconds: 0 },
      { seed: 0 }
    );
    expect(out.toLowerCase()).toMatch(/same|consistent|identical/);
  });

  test('5+ active days mentioned as dedication', () => {
    const out = InsightsEngine.generateWeeklySummary(
      { stitches: 1000, speed: 150, activeDays: 6, seconds: 3600 },
      { stitches: 800,  speed: 150, activeDays: 4, seconds: 3600 },
      { seed: 0 }
    );
    expect(out).toMatch(/6 active days|impressive|habit/);
  });
});

describe('InsightsEngine.computeWeeklyStreak', () => {
  test('returns 0 for no sessions', () => {
    expect(InsightsEngine.computeWeeklyStreak([])).toBe(0);
  });

  test('counts a 3-week streak ending this week', () => {
    const today = new Date();
    const sessions = [
      makeSession(new Date(today.getTime() - 14 * 86400000).toISOString().slice(0, 10), 100),
      makeSession(new Date(today.getTime() -  7 * 86400000).toISOString().slice(0, 10), 100),
      makeSession(today.toISOString().slice(0, 10), 100),
    ];
    expect(InsightsEngine.computeWeeklyStreak(sessions, today)).toBe(3);
  });

  test('breaks streak at a missing week', () => {
    const today = new Date();
    const sessions = [
      makeSession(new Date(today.getTime() - 21 * 86400000).toISOString().slice(0, 10), 100),
      // skip 14 days ago
      makeSession(new Date(today.getTime() -  7 * 86400000).toISOString().slice(0, 10), 100),
      makeSession(today.toISOString().slice(0, 10), 100),
    ];
    expect(InsightsEngine.computeWeeklyStreak(sessions, today)).toBe(2);
  });
});

describe('InsightsEngine.generateProjections', () => {
  test('returns empty array for no projects', () => {
    expect(InsightsEngine.generateProjections([])).toEqual([]);
  });

  test('marks completed projects with status complete', () => {
    const out = InsightsEngine.generateProjections([
      { id: 'a', name: 'Done', totalStitches: 100, completedStitches: 100, statsSessions: [] }
    ]);
    expect(out[0].status).toBe('complete');
    expect(out[0].percent).toBe(100);
    expect(out[0].projectedText).toBe('Complete!');
  });

  test('returns "can\u2019t project" status when fewer than 3 active days', () => {
    const today = new Date();
    const ymd = today.toISOString().slice(0, 10);
    const out = InsightsEngine.generateProjections([{
      id: 'a', name: 'Paused', totalStitches: 1000, completedStitches: 100,
      statsSessions: [makeSession(ymd, 50)]
    }], { now: today });
    expect(out[0].status).toBe('paused');
    expect(out[0].projectedText).toMatch(/can.?t project/);
  });

  test('produces a future date when there is enough recent pace', () => {
    const today = new Date();
    const sessions = [];
    // 10 sessions across 10 different recent days, 100 stitches/hr
    for (let i = 0; i < 10; i++) {
      const d = new Date(today.getTime() - (i + 1) * 86400000).toISOString().slice(0, 10);
      sessions.push(makeSession(d, 100, 19, 3600));
    }
    const out = InsightsEngine.generateProjections([{
      id: 'a', name: 'Active', totalStitches: 10000, completedStitches: 1000, statsSessions: sessions
    }], { now: today });
    expect(out[0].status).toBe('projected');
    expect(out[0].completionDate).toBeInstanceOf(Date);
    expect(out[0].completionDate.getTime()).toBeGreaterThan(today.getTime());
    expect(out[0].stitchesPerHour).toBeGreaterThan(0);
  });
});

describe('InsightsEngine.buildRhythmMatrix', () => {
  test('returns 7x24 zero grid for no sessions', () => {
    const m = InsightsEngine.buildRhythmMatrix([]);
    expect(m.grid).toHaveLength(7);
    expect(m.grid[0]).toHaveLength(24);
    expect(m.max).toBe(0);
  });

  test('places sessions in correct day/hour cell', () => {
    // 2026-04-23 is a Thursday (dow=3 Mon-based)
    const m = InsightsEngine.buildRhythmMatrix([{
      date: '2026-04-23', startTime: '2026-04-23T19:00:00.000', netStitches: 50
    }]);
    const dt = new Date('2026-04-23T19:00:00.000');
    const dow = dt.getDay() === 0 ? 6 : dt.getDay() - 1;
    expect(m.grid[dow][dt.getHours()]).toBe(50);
    expect(m.max).toBe(50);
  });
});

describe('InsightsEngine.generateInsights', () => {
  test('returns empty array when no data and no fallback applies', () => {
    expect(InsightsEngine.generateInsights({})).toEqual([]);
  });

  test('emits a streak insight after 4+ weeks', () => {
    const today = new Date();
    const sessions = [];
    for (let w = 0; w < 5; w++) {
      const d = new Date(today.getTime() - w * 7 * 86400000).toISOString().slice(0, 10);
      sessions.push(makeSession(d, 100));
    }
    const out = InsightsEngine.generateInsights({ allSessions: sessions, now: today });
    const streak = out.find(i => i.id.startsWith('streak'));
    expect(streak).toBeDefined();
    expect(streak.iconName).toBe('fire');
  });

  test('respects dismissed insights', () => {
    const today = new Date();
    const sessions = [];
    for (let w = 0; w < 5; w++) {
      const d = new Date(today.getTime() - w * 7 * 86400000).toISOString().slice(0, 10);
      sessions.push(makeSession(d, 100));
    }
    const all = InsightsEngine.generateInsights({ allSessions: sessions, now: today });
    const streakIds = all.filter(i => i.id.startsWith('streak')).map(i => i.id);
    expect(streakIds.length).toBeGreaterThan(0);
    const filtered = InsightsEngine.generateInsights({
      allSessions: sessions, now: today, dismissed: streakIds
    });
    expect(filtered.find(i => streakIds.includes(i.id))).toBeUndefined();
  });

  test('emits stash utilisation insight when many owned threads are unused', () => {
    const stash = {};
    for (let i = 0; i < 30; i++) stash['dmc:' + (100 + i)] = { owned: 1 };
    const summaries = [{ id: 'p1', name: 'P', palette: [{ id: '310' }, { id: '321' }] }];
    const out = InsightsEngine.generateInsights({ stash: stash, summaries: summaries });
    const ins = out.find(i => i.id === 'stash_unused');
    expect(ins).toBeDefined();
    expect(ins.text).toMatch(/aren.?t used/);
  });

  test('skips stash utilisation when stash is absent (Brief D not loaded)', () => {
    const out = InsightsEngine.generateInsights({ summaries: [{ id: 'p1', name: 'P', palette: [{ id: '310' }] }] });
    expect(out.find(i => i.id === 'stash_unused')).toBeUndefined();
  });

  test('emits week-over-week insight on +20% or more', () => {
    const out = InsightsEngine.generateInsights({
      thisWeek: { stitches: 1500 }, lastWeek: { stitches: 1000 }
    });
    const ins = out.find(i => i.id === 'wow_up');
    expect(ins).toBeDefined();
    expect(ins.text).toMatch(/500/);
  });

  test('falls back to fun fact when only sessions exist', () => {
    const today = new Date();
    const sessions = [makeSession(today.toISOString().slice(0, 10), 50000)];
    const out = InsightsEngine.generateInsights({ allSessions: sessions, now: today });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].id).toMatch(/fun_thread|streak|wow|colour|stash/);
  });
});

describe('InsightsEngine.fmtHour', () => {
  test.each([
    [0, '12am'],
    [1, '1am'],
    [11, '11am'],
    [12, '12pm'],
    [13, '1pm'],
    [23, '11pm'],
  ])('formats hour %i as %s', (h, exp) => {
    expect(InsightsEngine.fmtHour(h)).toBe(exp);
  });
});
