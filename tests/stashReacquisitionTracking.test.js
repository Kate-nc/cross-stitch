// tests/stashReacquisitionTracking.test.js
//
// Regression tests for the "re-acquisition" bug in stash-bridge.js:
//
// ROOT CAUSE: When V3 migration runs it stamps every existing thread that
// has no `addedAt` with addedAt = LEGACY_EPOCH and acquisitionSource = 'legacy'.
// After that, when a user sets `owned > 0` for a previously-unowned thread via
// updateThreadOwned(), the `else if (isV3)` branch only fills in *undefined*
// fields — it does not overwrite the already-set legacy values.  Result: the
// thread stays tagged as legacy and the Stash Age card continues to show
// "Most of your stash was added before tracking started. Newly-added threads
// will appear here" even though the user clearly just acquired the thread today.
//
// FIX: In the `else if (isV3)` block, when prevOwned === 0 AND newCount > 0
// AND addedAt === LEGACY_EPOCH, reset addedAt to now and clear acquisitionSource.

const fs = require('fs');
const path = require('path');

const SB_SRC = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');

describe('stash-bridge.js — re-acquisition tracking', () => {
  test('updateThreadOwned has re-acquisition reset when prevOwned === 0 and addedAt is LEGACY_EPOCH', () => {
    // The fix must contain the LEGACY_EPOCH sentinel check inside updateThreadOwned.
    const fnStart = SB_SRC.indexOf('async updateThreadOwned(');
    const fnEnd   = SB_SRC.indexOf('\n    },', fnStart); // next method boundary
    const fnBody  = SB_SRC.slice(fnStart, fnEnd);

    expect(fnBody).toMatch(/prevOwned\s*===\s*0/);
    expect(fnBody).toMatch(/LEGACY_EPOCH/);
    expect(fnBody).toMatch(/acquisitionSource\s*=\s*null/);
  });

  test('re-acquisition block runs before the oldCount assignment so prevOwned captures the original value', () => {
    // prevOwned must be assigned BEFORE `const oldCount = threads[key].owned`.
    const fnStart = SB_SRC.indexOf('async updateThreadOwned(');
    const fnEnd   = SB_SRC.indexOf('\n    },', fnStart);
    const fnBody  = SB_SRC.slice(fnStart, fnEnd);

    const prevIdx = fnBody.indexOf('prevOwned');
    const oldCountIdx = fnBody.indexOf('const oldCount = threads[key].owned');
    expect(prevIdx).toBeGreaterThan(-1);
    expect(oldCountIdx).toBeGreaterThan(-1);
    expect(prevIdx).toBeLessThan(oldCountIdx);
  });

  test('LEGACY_EPOCH constant is defined in stash-bridge.js', () => {
    expect(SB_SRC).toMatch(/const LEGACY_EPOCH\s*=\s*['"][^'"]+['"]/);
  });

  test('getStashAgeDistribution buckets a legacy-tagged thread with owned > 0 to legacy', () => {
    // The age distribution function should still bucket a thread that has
    // acquisitionSource === 'legacy' (e.g. a really old entry) into legacy.
    const fnStart = SB_SRC.indexOf('async getStashAgeDistribution()');
    const fnEnd   = SB_SRC.indexOf('\n    },', fnStart);
    const fnBody  = SB_SRC.slice(fnStart, fnEnd);

    // The function must check acquisitionSource === 'legacy'
    expect(fnBody).toMatch(/acquisitionSource\s*===\s*['"]legacy['"]/);
    // And !entry.addedAt
    expect(fnBody).toMatch(/!entry\.addedAt/);
  });

  test('getStashAgeDistribution buckets a re-acquired thread (addedAt = today, source = null) into a tracked bucket', () => {
    // Verifies the distribution function does NOT route threads with a real addedAt
    // and null acquisitionSource to the legacy bucket.
    const fnStart = SB_SRC.indexOf('async getStashAgeDistribution()');
    const fnEnd   = SB_SRC.indexOf('\n    },', fnStart);
    const fnBody  = SB_SRC.slice(fnStart, fnEnd);

    // There must be bucketUnder1Yr logic
    expect(fnBody).toMatch(/bucketUnder1Yr/);
    // The continue must follow the legacy check, not wrap the whole else path
    // (i.e., the legacy block is an early continue, non-legacy falls through to age buckets)
    const legacyIdx = fnBody.indexOf('result.legacy++');
    const continueIdx = fnBody.indexOf('continue', legacyIdx);
    const bucket1Idx = fnBody.indexOf('bucketUnder1Yr', legacyIdx);
    expect(continueIdx).toBeLessThan(bucket1Idx);
  });
});

describe('components-stats.js — activity chart removed from All Projects view', () => {
  // GlobalStatsDashboard moved from components.js to components-stats.js as
  // part of the H1 split (action plan 2A.1). Read whichever file the symbol
  // currently lives in so this guard keeps working through future moves.
  const STATS_PATH = path.join(__dirname, '..', 'components-stats.js');
  const CORE_PATH  = path.join(__dirname, '..', 'components.js');
  const COMP_SRC   = fs.existsSync(STATS_PATH) && fs.readFileSync(STATS_PATH, 'utf8').includes('function GlobalStatsDashboard(')
    ? fs.readFileSync(STATS_PATH, 'utf8')
    : fs.readFileSync(CORE_PATH, 'utf8');

  test('GlobalStatsDashboard no longer renders the gsd-heatmap section', () => {
    // After removing sections 6 & 7, the gsd-heatmap class should not appear
    // inside GlobalStatsDashboard. (It may still exist in per-project StatsDashboard.)
    const gsdStart = COMP_SRC.indexOf('function GlobalStatsDashboard(');
    const gsdEnd   = COMP_SRC.indexOf('\n}', gsdStart + 100); // rough end
    const gsdBody  = COMP_SRC.slice(gsdStart, gsdEnd + 200);

    expect(gsdBody).not.toMatch(/gsd-heatmap/);
  });

  test('GlobalStatsDashboard no longer renders gsd-bars-wrap (daily activity chart)', () => {
    const gsdStart = COMP_SRC.indexOf('function GlobalStatsDashboard(');
    const gsdEnd   = COMP_SRC.indexOf('\n}', gsdStart + 100);
    const gsdBody  = COMP_SRC.slice(gsdStart, gsdEnd + 200);

    expect(gsdBody).not.toMatch(/gsd-bars-wrap/);
  });

  test('GlobalStatsDashboard no longer uses timeRange state', () => {
    const gsdStart = COMP_SRC.indexOf('function GlobalStatsDashboard(');
    const gsdEnd   = COMP_SRC.indexOf('\n}', gsdStart + 100);
    const gsdBody  = COMP_SRC.slice(gsdStart, gsdEnd + 200);

    expect(gsdBody).not.toMatch(/timeRange/);
  });
});
