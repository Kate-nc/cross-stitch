// A3 (UX Phase 5) — pure-helper tests for lastSessionSummary.
// helpers.js is plain JS (no module system), so we eval it the same way the
// existing tests/helpers.test.js does.

const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'helpers.js'), 'utf8');
// helpers.js touches indexedDB / IDBKeyRange at module load via getDB(), but
// only inside function bodies — top-level evaluation is safe.
// Stub out browser-only globals just in case future helpers run them eagerly.
global.indexedDB = global.indexedDB || { open: () => ({}) };
global.IDBKeyRange = global.IDBKeyRange || {};
// eslint-disable-next-line no-eval
eval(code);

describe('lastSessionSummary', () => {
  test('returns null when project is null', () => {
    expect(lastSessionSummary(null)).toBeNull();
  });

  test('returns null when sessions array is empty', () => {
    expect(lastSessionSummary({ statsSessions: [] })).toBeNull();
    expect(lastSessionSummary({ sessions: [] })).toBeNull();
    expect(lastSessionSummary({})).toBeNull();
  });

  test('summarises a single session using netStitches/durationSeconds', () => {
    const result = lastSessionSummary({
      statsSessions: [{ netStitches: 247, durationSeconds: 1920 }] // 32 min
    });
    expect(result).not.toBeNull();
    expect(result.count).toBe(247);
    expect(result.ms).toBe(1920 * 1000);
    // 247 stitches / (1920/3600) hours ≈ 463.125 → rounded to 463
    expect(result.perHour).toBe(463);
    expect(result.perHourAvg).toBeNull();
    expect(result.dominantThreadId).toBeNull();
    expect(result.dominantThreadCount).toBeNull();
  });

  test('falls back to stitchesCompleted/durationMinutes for older session shapes', () => {
    const result = lastSessionSummary({
      sessions: [{ stitchesCompleted: 100, durationMinutes: 30 }]
    });
    expect(result.count).toBe(100);
    expect(result.ms).toBe(30 * 60 * 1000);
    expect(result.perHour).toBe(200);
  });

  test('uses the most recent session as the "last" one', () => {
    const result = lastSessionSummary({
      statsSessions: [
        { netStitches: 50,  durationSeconds: 600 },
        { netStitches: 80,  durationSeconds: 600 },
        { netStitches: 120, durationSeconds: 1200 }
      ]
    });
    expect(result.count).toBe(120);
    expect(result.ms).toBe(1200 * 1000);
  });

  test('perHour is null when duration is zero', () => {
    const result = lastSessionSummary({
      statsSessions: [{ netStitches: 100, durationSeconds: 0 }]
    });
    expect(result.perHour).toBeNull();
  });

  test('perHourAvg stays null until there are 3+ prior sessions', () => {
    // 1 prior session → no average
    let r = lastSessionSummary({
      statsSessions: [
        { netStitches: 100, durationSeconds: 600 },
        { netStitches: 200, durationSeconds: 600 }
      ]
    });
    expect(r.perHourAvg).toBeNull();
    // 2 prior sessions → still no average
    r = lastSessionSummary({
      statsSessions: [
        { netStitches: 100, durationSeconds: 600 },
        { netStitches: 200, durationSeconds: 600 },
        { netStitches: 300, durationSeconds: 600 }
      ]
    });
    expect(r.perHourAvg).toBeNull();
    // 3 prior + 1 last = 4 total → average is computed
    r = lastSessionSummary({
      statsSessions: [
        { netStitches: 600, durationSeconds: 3600 }, // 600/hr
        { netStitches: 600, durationSeconds: 3600 }, // 600/hr
        { netStitches: 600, durationSeconds: 3600 }, // 600/hr
        { netStitches: 1000, durationSeconds: 3600 } // last session, 1000/hr
      ]
    });
    expect(r.perHourAvg).toBe(600);
    expect(r.perHour).toBe(1000);
  });

  test('handles a degenerate session (no stitches, no time)', () => {
    const result = lastSessionSummary({
      statsSessions: [{}]
    });
    expect(result.count).toBe(0);
    expect(result.ms).toBe(0);
    expect(result.perHour).toBeNull();
  });

  test('dominantThread* is reserved for a future schema bump', () => {
    const result = lastSessionSummary({
      statsSessions: [{ netStitches: 247, durationSeconds: 1920 }]
    });
    expect(result.dominantThreadId).toBeNull();
    expect(result.dominantThreadCount).toBeNull();
  });
});
