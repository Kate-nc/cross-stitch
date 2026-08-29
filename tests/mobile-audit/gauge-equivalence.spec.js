/* The thread gauge went from four <div> segments to one element painted with
   box-shadow copies, to cut 4,892 DOM nodes from the manager. That is a
   rendering change, so it is proved rather than assumed.

   This file runs on the phone project (DPR 2.75). Flexbox and box-shadow round
   fractional device pixels differently, so the antialiased pill edges are not
   bit-identical there — what must match is the structure. The exact-match
   proof is in desktop-gauge-equivalence.spec.js, which runs at DPR 1 and
   asserts a zero-pixel difference. */
const { test, expect } = require('@playwright/test');
const { compareLevels } = require('./gauge-compare');

test('the one-element gauge matches the old four-div gauge structurally', async ({ page }) => {
  const results = await compareLevels(page);
  console.log('GAUGE_DIFF ' + JSON.stringify(results));

  for (const r of results) {
    expect(r.mismatch, `level ${r.level}: ${r.mismatch}`).toBeUndefined();
    expect(r.pixels, `level ${r.level}: harness captured nothing`).toBeGreaterThan(100);

    // The centre of each of the four pills and each of the three gaps must be
    // exactly the same colour — those points are deep inside solid fill, so
    // only a genuine change in position or colour would move them.
    expect(r.centreMismatches,
      `level ${r.level}: ${r.centreMismatches}/7 pill+gap centres differ — this is a real visual change, not antialiasing`
    ).toBe(0);

    // Edges may differ by a sub-pixel sliver. Anything beyond a fifth of the
    // box means the geometry moved, not just the antialiasing.
    expect(r.differing / r.pixels,
      `level ${r.level}: ${r.differing}/${r.pixels} px differ (max channel delta ${r.maxDelta})`
    ).toBeLessThan(0.2);
  }
});
