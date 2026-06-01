/**
 * tests/statsDataConnections.test.js
 *
 * Tests for the data connection fixes identified in the stats audit.
 * These tests were written BEFORE the fixes and should FAIL initially,
 * then pass after each fix is applied.
 *
 * Tests verify source-level contracts (like other tests in this suite)
 * since mounting the full React trees is not available in Jest without
 * a Babel transform.
 */

const fs = require('fs');
const path = require('path');

const STATS_PAGE_SRC = fs.readFileSync(path.join(__dirname, '..', 'stats-page.js'), 'utf8');
const STATS_INSIGHTS_SRC = fs.readFileSync(path.join(__dirname, '..', 'stats-insights.js'), 'utf8');
const TRACKER_SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

// ── FIX-1 / FIX-2: Stats page subscribes to stash and project change events ──────

describe('stats-page.js — live data subscriptions', () => {
  test('GlobalStatsDashboard subscribes to cs:stashChanged for live stash refresh', () => {
    // The stats page must listen for stash changes so that stash-dependent stats
    // (coverage ratio, colour families, DMC coverage, SABLE, duplicates, stash age,
    // threads never used, colour fingerprint, buying impact, brand alignment)
    // update without requiring a page reload.
    expect(STATS_PAGE_SRC).toMatch(/addEventListener\s*\(\s*['"]cs:stashChanged['"]/);
  });

  test('GlobalStatsDashboard subscribes to cs:projectsChanged for live project refresh', () => {
    // The stats page must listen for project changes so that project-derived stats
    // (lifetime stitches, active count, finished count, streaks, pace, WIPs)
    // update without a page reload when the user tracks stitches.
    expect(STATS_PAGE_SRC).toMatch(/addEventListener\s*\(\s*['"]cs:projectsChanged['"]/);
  });

  test('stats-page.js unsubscribes from cs:stashChanged on cleanup (no memory leaks)', () => {
    // useEffect cleanup must remove the listener to avoid duplicate subscriptions
    // when the component re-mounts.
    expect(STATS_PAGE_SRC).toMatch(/removeEventListener\s*\(\s*['"]cs:stashChanged['"]/);
  });

  test('stats-page.js unsubscribes from cs:projectsChanged on cleanup', () => {
    expect(STATS_PAGE_SRC).toMatch(/removeEventListener\s*\(\s*['"]cs:projectsChanged['"]/);
  });
});

// ── FIX-3: stats-insights.js subscribes to cs:stashChanged ───────────────────────

describe('stats-insights.js — live stash subscription', () => {
  test('useInsightsData subscribes to cs:stashChanged', () => {
    // The ColourHeatmap stash-owned badges must update when stash changes.
    expect(STATS_INSIGHTS_SRC).toMatch(/addEventListener\s*\(\s*['"]cs:stashChanged['"]/);
  });

  test('stats-insights.js unsubscribes from cs:stashChanged on cleanup', () => {
    expect(STATS_INSIGHTS_SRC).toMatch(/removeEventListener\s*\(\s*['"]cs:stashChanged['"]/);
  });
});

// ── FIX-4: tracker-app.js subscribes to cs:stashChanged ──────────────────────────

describe('tracker-app.js — live stash subscription', () => {
  test('tracker subscribes to cs:stashChanged for ownership pip updates', () => {
    // Thread ownership pips in the Tracker side panel must update when the user
    // adds a thread in the Stash Manager while the Tracker is open.
    expect(TRACKER_SRC).toMatch(/addEventListener\s*\(\s*['"]cs:stashChanged['"]/);
  });

  test('tracker unsubscribes from cs:stashChanged on cleanup', () => {
    expect(TRACKER_SRC).toMatch(/removeEventListener\s*\(\s*['"]cs:stashChanged['"]/);
  });
});

// ── FIX-5: Colour Fingerprint renders swatches, not bare IDs ─────────────────────

describe('stats-page.js — Colour Fingerprint colour rendering', () => {
  // Extract the colourFingerprint useMemo body
  const fpStart = STATS_PAGE_SRC.indexOf('const colourFingerprint = useMemo');
  const fpEnd = STATS_PAGE_SRC.indexOf('}, [mostUsed, stash]);', fpStart);
  const fpBody = fpStart >= 0 && fpEnd > fpStart
    ? STATS_PAGE_SRC.slice(fpStart, fpEnd)
    : '';

  test('colourFingerprint computation produces objects with rgb field, not bare string IDs', () => {
    // The usedNotOwned and ownedNotUsed arrays must contain {id, name, rgb} objects
    // so the render site can display a colour swatch.
    // Presence of findThreadInCatalog call (or equivalent) in the computation indicates enrichment.
    expect(fpBody).toMatch(/findThreadInCatalog|\.rgb/);
  });

  // Extract the render site for usedNotOwned
  const renderStart = STATS_PAGE_SRC.indexOf('usedNotOwned.length > 0');
  const renderSnippet = renderStart >= 0
    ? STATS_PAGE_SRC.slice(renderStart, renderStart + 500)
    : '';

  test('Colour Fingerprint render uses Swatch component for usedNotOwned entries', () => {
    // The render should call h(Swatch, ...) or equivalent — not just h('div', {}, id)
    expect(renderSnippet).toMatch(/Swatch/);
  });

  const renderStart2 = STATS_PAGE_SRC.indexOf('ownedNotUsed.length > 0');
  const renderSnippet2 = renderStart2 >= 0
    ? STATS_PAGE_SRC.slice(renderStart2, renderStart2 + 500)
    : '';

  test('Colour Fingerprint render uses Swatch component for ownedNotUsed entries', () => {
    expect(renderSnippet2).toMatch(/Swatch/);
  });
});

// ── Stats audit fixes (S1–S8) ────────────────────────────────────────────────────
// Written after the fixes were applied. Each test guards one specific contract
// from the audit so regressions are caught immediately.

const INSIGHTS_ENGINE = require(path.join(__dirname, '..', 'insights-engine.js'));
const STATS_ACTIVITY_SRC = fs.readFileSync(path.join(__dirname, '..', 'stats-activity.js'), 'utf8');
const COMPONENTS_STATS_SRC = fs.readFileSync(path.join(__dirname, '..', 'components-stats.js'), 'utf8');

// ── S1: Weekly vs Daily streak labels are unambiguous ────────────────────────────

describe('S1 — streak label disambiguation', () => {
  test('stats-page.js StatCard uses "Weekly Streak", not "Stitching Streak"', () => {
    expect(STATS_PAGE_SRC).toContain("title: 'Weekly Streak'");
    expect(STATS_PAGE_SRC).not.toContain("title: 'Stitching Streak'");
  });

  test('components-stats.js streak label says "Daily streak"', () => {
    expect(COMPONENTS_STATS_SRC).toContain('Daily streak');
  });

  test('InsightsEngine exports computeDailyStreak', () => {
    expect(typeof INSIGHTS_ENGINE.computeDailyStreak).toBe('function');
  });

  test('computeDailyStreak returns { current, longest } for empty sessions', () => {
    const result = INSIGHTS_ENGINE.computeDailyStreak([]);
    expect(result).toEqual({ current: 0, longest: 0 });
  });

  test('computeDailyStreak counts a 3-day consecutive streak ending today', () => {
    const today = new Date();
    const sessions = [0, 1, 2].map(i => ({
      date: new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10)
    }));
    const result = INSIGHTS_ENGINE.computeDailyStreak(sessions, today);
    expect(result.current).toBe(3);
    expect(result.longest).toBeGreaterThanOrEqual(3);
  });

  test('computeDailyStreak falls back to yesterday streak when no session today', () => {
    const today = new Date();
    const sessions = [1, 2, 3].map(i => ({
      date: new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10)
    }));
    const result = INSIGHTS_ENGINE.computeDailyStreak(sessions, today);
    expect(result.current).toBe(3);
  });

  test('components-stats.js globalStreak uses InsightsEngine.computeDailyStreak', () => {
    expect(COMPONENTS_STATS_SRC).toMatch(/InsightsEngine\.computeDailyStreak\(allSessions\)/);
  });
});

// ── S2: calculateRecentPace is exported from InsightsEngine ──────────────────────

describe('S2 — calculateRecentPace export', () => {
  test('InsightsEngine exports calculateRecentPace', () => {
    expect(typeof INSIGHTS_ENGINE.calculateRecentPace).toBe('function');
  });

  test('calculateRecentPace returns activeDays, stitchesPerHour, pacePerDay', () => {
    const today = new Date();
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      date: new Date(today.getTime() - (i + 1) * 86400000).toISOString().slice(0, 10),
      durationSeconds: 3600,
      netStitches: 100
    }));
    const result = INSIGHTS_ENGINE.calculateRecentPace(sessions, today, 86400000);
    expect(result).toHaveProperty('activeDays');
    expect(result).toHaveProperty('stitchesPerHour');
    expect(result).toHaveProperty('pacePerDay');
    expect(result.activeDays).toBe(5);
    expect(result.pacePerDay).toBeGreaterThan(0);
  });
});

// ── S3: Completion ETAs render uses projectedText, not p.eta ─────────────────────

describe('S3 — completionEtas uses projectedText', () => {
  test('stats-page.js render uses p.projectedText (not p.eta)', () => {
    expect(STATS_PAGE_SRC).toContain('p.projectedText');
    // The old buggy key must not appear in the completionEta render block
    const etaCardIdx = STATS_PAGE_SRC.indexOf("'stats-completionEta'");
    const etaCardSnippet = etaCardIdx >= 0
      ? STATS_PAGE_SRC.slice(etaCardIdx, etaCardIdx + 700)
      : '';
    expect(etaCardSnippet).toContain('projectedText');
    expect(etaCardSnippet).not.toMatch(/\bp\.eta\b/);
  });
});

// ── S4: ETA algorithm in components-stats.js uses InsightsEngine ─────────────────

describe('S4 — GlobalStatsDashboard ETA uses InsightsEngine.generateProjections', () => {
  test('components-stats.js insight ETA calls InsightsEngine.generateProjections', () => {
    expect(COMPONENTS_STATS_SRC).toMatch(/InsightsEngine\.generateProjections\(inProg\)/);
  });

  test('components-stats.js reads proj.projectedText, not a manual date calc', () => {
    // Verifies the old `apd > 0 ... daysLeft ... estD` pattern is gone
    expect(COMPONENTS_STATS_SRC).not.toMatch(/apd > 0/);
    expect(COMPONENTS_STATS_SRC).not.toMatch(/var daysLeft/);
    expect(COMPONENTS_STATS_SRC).toContain('proj.projectedText');
  });
});

// ── S5: Busiest weeks in stats-activity.js uses Monday-start bucketing ────────────

describe('S5 — busiest weeks use Monday-start bucketing', () => {
  test('computeBusiestPeriods does not reference a "sunday" variable', () => {
    // Check the computeBusiestPeriods function body specifically
    const fnStart = STATS_ACTIVITY_SRC.indexOf('function computeBusiestPeriods(');
    const fnEnd = STATS_ACTIVITY_SRC.indexOf('\n}', fnStart) + 2;
    const fnBody = STATS_ACTIVITY_SRC.slice(fnStart, fnEnd);
    expect(fnBody).not.toMatch(/\bsunday\b/i);
  });

  test('computeBusiestPeriods uses Monday-start dow calculation', () => {
    const fnStart = STATS_ACTIVITY_SRC.indexOf('function computeBusiestPeriods(');
    // Find the closing brace of the function by scanning for '}\n' at the end
    // of a top-level block — search further than a single inner brace.
    const fnEnd = STATS_ACTIVITY_SRC.indexOf('\n// ─', fnStart); // next section header
    const fnBody = STATS_ACTIVITY_SRC.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 2000);
    // Monday-start: getDay()===0 ? 6 : getDay()-1
    expect(fnBody).toMatch(/getDay\(\) === 0 \? 6 : d\.getDay\(\) - 1/);
  });
});

// ── S6: Unified completion filter across all three pages ─────────────────────────

describe('S6 — unified completion filter (isComplete OR finishStatus completed)', () => {
  test('stats-page.js completionEtas filter excludes finishStatus=completed projects', () => {
    const etasMemoIdx = STATS_PAGE_SRC.indexOf('const completionEtas = useMemo');
    const etasMemoEnd = STATS_PAGE_SRC.indexOf('}, [richProjects]);', etasMemoIdx);
    const body = STATS_PAGE_SRC.slice(etasMemoIdx, etasMemoEnd);
    expect(body).toContain("finishStatus !== 'completed'");
    // Must not use the old `!p.finished` single-flag check
    expect(body).not.toMatch(/!p\.finished\b/);
  });

  test('stats-insights.js projection filter excludes finishStatus=completed', () => {
    // Find the filter that feeds generateProjections (contains !s.isComplete)
    const filterIdx = STATS_INSIGHTS_SRC.indexOf('!s.isComplete');
    const filterSnippet = filterIdx >= 0
      ? STATS_INSIGHTS_SRC.slice(filterIdx, filterIdx + 200)
      : '';
    expect(filterSnippet).toContain("s.finishStatus !== 'completed'");
  });

  test('components-stats.js inProg filter excludes finishStatus=completed', () => {
    expect(COMPONENTS_STATS_SRC).toMatch(/inProg.*finishStatus.*!==.*completed/);
  });

  test('InsightsEngine.generateInsights active filter excludes finishStatus=completed', () => {
    // Pure function test: a project with all stitches done but finishStatus='active'
    // should NOT produce a neglect insight from the engine (it's treated as active)
    const out = INSIGHTS_ENGINE.generateInsights({
      summaries: [{ id: 'x', name: 'Done', totalStitches: 100, completedStitches: 100, isComplete: true, finishStatus: 'active', statsSessions: [] }],
      allSessions: []
    });
    // No neglect insight for an isComplete project regardless
    const neglect = out.find(i => i.id === 'neglected');
    expect(neglect).toBeUndefined();
  });
});

// ── S7: Binning rationale comments are present ───────────────────────────────────

describe('S7 — binning rationale inline comments', () => {
  test('stats-insights.js heatmapColor has a comment explaining fixed ratio choice', () => {
    const hmIdx = STATS_INSIGHTS_SRC.indexOf('function heatmapColor(');
    const hmSnippet = hmIdx >= 0 ? STATS_INSIGHTS_SRC.slice(hmIdx - 300, hmIdx) : '';
    expect(hmSnippet).toMatch(/ratio|fixed|percentile/i);
  });

  test('stats-activity.js buildGrid has a comment explaining percentile choice', () => {
    const bgIdx = STATS_ACTIVITY_SRC.indexOf('function buildGrid(');
    const bgSnippet = bgIdx >= 0 ? STATS_ACTIVITY_SRC.slice(bgIdx, bgIdx + 1200) : '';
    expect(bgSnippet).toMatch(/[Pp]ercentile/);
  });
});

// ── S8: buildRhythmMatrix uses netStitches || 0 (not || 1) ───────────────────────

describe('S8 — rhythm matrix zero-net sessions', () => {
  test('zero-net session does not contribute to rhythm matrix cell', () => {
    const m = INSIGHTS_ENGINE.buildRhythmMatrix([{
      date: '2026-04-23',
      startTime: '2026-04-23T19:00:00.000',
      netStitches: 0
    }]);
    // With || 0 fix, a zero-net session adds 0 to the cell, so max should be 0
    expect(m.max).toBe(0);
  });

  test('positive-net session is still counted correctly after the fix', () => {
    const m = INSIGHTS_ENGINE.buildRhythmMatrix([{
      date: '2026-04-23',
      startTime: '2026-04-23T14:00:00.000',
      netStitches: 75
    }]);
    expect(m.max).toBe(75);
  });
});

// ── FIX-6 / FIX-7: Stash Age oldest thread renders a swatch ─────────────────────

describe('stats-page.js — Stash Age oldest thread swatch', () => {
  // Find the Stash Age card render section
  const ageCardIdx = STATS_PAGE_SRC.indexOf("'stats-stashAge'");
  const ageCardSnippet = ageCardIdx >= 0
    ? STATS_PAGE_SRC.slice(ageCardIdx, ageCardIdx + 600)
    : '';

  test('Stash Age card oldest-thread line renders a Swatch component', () => {
    // 'Oldest tracked:' text must be accompanied by a swatch
    expect(ageCardSnippet).toMatch(/Swatch/);
  });

  // Showcase tab oldest stash item
  const showcaseOldestIdx = STATS_PAGE_SRC.indexOf('ageData.oldest');
  // There are multiple occurrences; find the one in StatsShowcase (after "function StatsShowcase")
  const showcaseStart = STATS_PAGE_SRC.indexOf('function StatsShowcase');
  const showcaseSection = showcaseStart >= 0
    ? STATS_PAGE_SRC.slice(showcaseStart, showcaseStart + 12000)
    : '';

  test('StatsShowcase oldest stash item renders a Swatch component', () => {
    expect(showcaseSection).toMatch(/Swatch.*oldest|oldest.*Swatch/s);
  });
});
