// Tests for computeActiveMs (event-log timing engine) and deriveIsLogPaused.
// Extracts the pure functions from tracker-app.js using regex + eval so there
// is no dependency on React, the DOM, or any browser global.

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.resolve(__dirname, '../tracker-app.js'),
  'utf8'
);

// Extract everything from the section header through TrackerApp's opening line
// (both functions live in the small block between the header comment and TrackerApp)
const blockMatch = src.match(
  /\/\/ \u2500+ Event-log timing engine \u2500+[\s\S]*?(?=function TrackerApp)/
);
if (!blockMatch) throw new Error('Could not locate computeActiveMs block in tracker-app.js');
eval(blockMatch[0]);  // defines computeActiveMs and deriveIsLogPaused

const CAP = 90_000; // 90 s default cap in ms

// ─── computeActiveMs ─────────────────────────────────────────────────────────

describe('computeActiveMs – basic', () => {
  it('returns 0 for empty / null log', () => {
    expect(computeActiveMs([], Date.now(), CAP)).toBe(0);
    expect(computeActiveMs(null, Date.now(), CAP)).toBe(0);
  });

  it('returns 0 if upToTime equals the only start event', () => {
    const T = 1_000_000;
    const log = [{ kind: 'start', t: T }];
    expect(computeActiveMs(log, T, CAP)).toBe(0);
  });

  it('credits a short gap fully (under cap)', () => {
    const T = 1_000_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 5_000 },  // 5 s gap
    ];
    expect(computeActiveMs(log, T + 5_000, CAP)).toBe(5_000);
  });

  it('caps a gap that exceeds capMs', () => {
    const T = 1_000_000;
    const cap = 30_000; // 30 s cap
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 120_000 }, // 120 s gap — well over cap
    ];
    expect(computeActiveMs(log, T + 120_000, cap)).toBe(30_000);
  });

  it('accumulates multiple sub-cap gaps correctly', () => {
    const T = 1_000_000;
    const cap = 60_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 10_000 }, // 10 s
      { kind: 'stitch', t: T + 25_000 }, // 15 s
      { kind: 'stitch', t: T + 40_000 }, // 15 s
    ];
    expect(computeActiveMs(log, T + 40_000, cap)).toBe(40_000);
  });

  it('credits the tail up to upToTime', () => {
    const T = 1_000_000;
    const cap = 60_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 5_000 },
    ];
    // 5 s gap to last stitch, then 10 s more tail
    expect(computeActiveMs(log, T + 15_000, cap)).toBe(15_000);
  });

  it('caps the tail when upToTime is far ahead', () => {
    const T = 1_000_000;
    const cap = 30_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 5_000 },
    ];
    // Tail = 600 s, cap 30 s
    expect(computeActiveMs(log, T + 605_000, cap)).toBe(5_000 + 30_000);
  });
});

describe('computeActiveMs – hidden/visible spans excluded', () => {
  it('excludes a hidden span entirely', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',   t: T },
      { kind: 'stitch',  t: T + 5_000  }, // +5 s active
      { kind: 'hidden',  t: T + 5_000  }, // tab hides
      { kind: 'stitch',  t: T + 35_000 }, // stitch while hidden (excluded)
      { kind: 'visible', t: T + 35_000 }, // tab back
      { kind: 'stitch',  t: T + 40_000 }, // +5 s active
    ];
    expect(computeActiveMs(log, T + 40_000, cap)).toBe(10_000);
  });

  it('does not credit walk-away time after hidden-then-visible', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',   t: T },
      { kind: 'hidden',  t: T + 1_000  },
      { kind: 'visible', t: T + 60_000 }, // 59 s hidden (excluded)
      { kind: 'stitch',  t: T + 65_000 }, // 5 s from visible (active)
    ];
    // gap before hidden = 1 s, then 5 s after visible
    expect(computeActiveMs(log, T + 65_000, cap)).toBe(1_000 + 5_000);
  });
});

describe('computeActiveMs – manualPause/Resume excluded', () => {
  it('excludes the manual-pause span', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',        t: T },
      { kind: 'stitch',       t: T + 5_000  }, // 5 s active
      { kind: 'manualPause',  t: T + 5_000  }, // user pauses
      { kind: 'stitch',       t: T + 65_000 }, // ignored (paused)
      { kind: 'manualResume', t: T + 65_000 }, // user resumes
      { kind: 'stitch',       t: T + 70_000 }, // 5 s active
    ];
    expect(computeActiveMs(log, T + 70_000, cap)).toBe(10_000);
  });

  it('an unresolved manualPause prevents tail crediting', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',       t: T },
      { kind: 'stitch',      t: T + 5_000  }, // 5 s active
      { kind: 'manualPause', t: T + 5_000  }, // pause with no resume
    ];
    // upToTime is 10 s later — tail excluded because still paused
    expect(computeActiveMs(log, T + 15_000, cap)).toBe(5_000);
  });
});

describe('computeActiveMs – upToTime before end of log', () => {
  it('ignores events after upToTime', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 10_000 }, // included
      { kind: 'stitch', t: T + 200_000 }, // after upToTime — ignored
    ];
    const upTo = T + 50_000; // 50 s after start
    // gap from start(T) to stitch(T+10s) = 10 s
    // tail from T+10s to T+50s = 40 s (< 90 s cap)
    expect(computeActiveMs(log, upTo, cap)).toBe(50_000);
  });
});

describe('computeActiveMs – combined hidden + manualPause', () => {
  it('no double-counting when both are active simultaneously', () => {
    const T = 1_000_000;
    const cap = 90_000;
    // Pause then hide while still paused — resume should clear manualPause
    const log = [
      { kind: 'start',        t: T },
      { kind: 'manualPause',  t: T + 2_000 },
      { kind: 'hidden',       t: T + 3_000 },  // hidden while paused
      { kind: 'visible',      t: T + 10_000 }, // visible but still paused
      { kind: 'manualResume', t: T + 12_000 }, // now both clear
      { kind: 'stitch',       t: T + 17_000 }, // 5 s active
    ];
    // Active: 2 s (start→manualPause) + 5 s (manualResume→stitch)
    expect(computeActiveMs(log, T + 17_000, cap)).toBe(7_000);
  });
});

describe('computeActiveMs – cap sensitivity', () => {
  it('same log yields different durations with different caps', () => {
    const T = 1_000_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 120_000 }, // 120 s gap
    ];
    const short = computeActiveMs(log, T + 120_000, 30_000);
    const tall  = computeActiveMs(log, T + 120_000, 180_000);
    expect(short).toBe(30_000);
    expect(tall).toBe(120_000);
    expect(short).toBeLessThan(tall);
  });

  it('defaults to classic timing mode when none is supplied', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 240_000, delta: 12 },
    ];
    expect(computeActiveMs(log, T + 240_000, cap)).toBe(90_000);
  });

  it('extends the cap for bulk stitch events in batchAware mode', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 240_000, delta: 12 },
    ];
    expect(computeActiveMs(log, T + 240_000, cap, 'batchAware')).toBe(240_000);
  });

  it('keeps the base cap for single-stitch events and tail time in batchAware mode', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 240_000, delta: 1 },
    ];
    expect(computeActiveMs(log, T + 240_000, cap, 'batchAware')).toBe(90_000);
    expect(computeActiveMs(log, T + 480_000, cap, 'batchAware')).toBe(180_000);
  });

  it('manual mode credits the full active interval without a gap cap', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start',  t: T },
      { kind: 'stitch', t: T + 240_000, delta: 1 },
    ];
    expect(computeActiveMs(log, T + 240_000, cap, 'manual')).toBe(240_000);
    expect(computeActiveMs(log, T + 480_000, cap, 'manual')).toBe(480_000);
  });

  it('manual mode still excludes hidden and paused intervals', () => {
    const T = 1_000_000;
    const cap = 90_000;
    const log = [
      { kind: 'start', t: T },
      { kind: 'hidden', t: T + 30_000 },
      { kind: 'visible', t: T + 150_000 },
      { kind: 'manualPause', t: T + 180_000 },
      { kind: 'manualResume', t: T + 240_000 },
    ];
    expect(computeActiveMs(log, T + 300_000, cap, 'manual')).toBe(30_000 + 30_000 + 60_000);
  });
});

// ─── deriveIsLogPaused ────────────────────────────────────────────────────────

describe('deriveIsLogPaused', () => {
  it('returns false for empty log', () => {
    expect(deriveIsLogPaused([])).toBe(false);
    expect(deriveIsLogPaused(null)).toBe(false);
  });

  it('returns false after start with no pause events', () => {
    expect(deriveIsLogPaused([{ kind: 'start', t: 1 }, { kind: 'stitch', t: 2 }])).toBe(false);
  });

  it('returns true after hidden event', () => {
    expect(deriveIsLogPaused([{ kind: 'start', t: 1 }, { kind: 'hidden', t: 2 }])).toBe(true);
  });

  it('returns false after hidden then visible', () => {
    expect(deriveIsLogPaused([
      { kind: 'start',   t: 1 },
      { kind: 'hidden',  t: 2 },
      { kind: 'visible', t: 3 },
    ])).toBe(false);
  });

  it('returns true after manualPause', () => {
    expect(deriveIsLogPaused([
      { kind: 'start',       t: 1 },
      { kind: 'manualPause', t: 2 },
    ])).toBe(true);
  });

  it('returns false after manualResume', () => {
    expect(deriveIsLogPaused([
      { kind: 'start',        t: 1 },
      { kind: 'manualPause',  t: 2 },
      { kind: 'manualResume', t: 3 },
    ])).toBe(false);
  });

  it('returns true if hidden and manually paused', () => {
    expect(deriveIsLogPaused([
      { kind: 'start',       t: 1 },
      { kind: 'hidden',      t: 2 },
      { kind: 'manualPause', t: 3 },
    ])).toBe(true);
  });
});
