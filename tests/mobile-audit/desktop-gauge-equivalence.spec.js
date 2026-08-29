/* Gauge equivalence at DPR 1, where there is no fractional device-pixel
   rounding. If the two renderings match exactly here, any difference on the
   phone project is sub-pixel antialiasing rather than a real visual change. */
const { test, expect } = require('@playwright/test');
const { compareLevels } = require('./gauge-compare');

test('one-element gauge is pixel-identical to the old four-div gauge at DPR 1', async ({ page }) => {
  const results = await compareLevels(page);
  console.log('GAUGE_DIFF_DPR1 ' + JSON.stringify(results));
  for (const r of results) {
    expect(r.mismatch, `level ${r.level}: ${r.mismatch}`).toBeUndefined();
    expect(r.pixels).toBeGreaterThan(100);
    expect(r.differing, `level ${r.level}: ${r.differing}/${r.pixels} px differ (max delta ${r.maxDelta})`).toBe(0);
  }
});
