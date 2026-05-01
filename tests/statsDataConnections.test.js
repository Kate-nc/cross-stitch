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
