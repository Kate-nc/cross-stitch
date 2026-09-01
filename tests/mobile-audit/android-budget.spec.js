/* Android phones and tablets — reports/mobile-freeze-large-patterns.md Part 8.
   ═══════════════════════════════════════════════════════════════════════════
   Runs on the `mobile-audit-tablet` project (Galaxy Tab S9, Chromium). Two
   gaps this closes:

     1. Nothing in the repo covered an Android **tablet**. The touch projects
        were a phone (Pixel 5) and an iPad, and a large viewport on a device
        that reports deviceMemory is exactly the combination that used to look
        like a desktop to the budget code.

     2. Playwright's device descriptors do not set `navigator.deviceMemory` —
        Chromium reports 8 whatever device is emulated — so every "phone" run
        in this repo has taken the branch meant for an 8 GB machine. The
        memory tiers are emulated explicitly here.

   The budget arms have unit coverage in tests/chartCanvasBudget.test.js;
   what only a running page can show is what the app then *allocates*. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, SIZES } = require('../_helpers/trackerFixture');
const {
  MEMORY, emulateDeviceMemory, canvasCensus, budgetReport, suppressOnboarding, SCROLLER_FN,
} = require('../_helpers/deviceEmulation');

const DESKTOP_BUDGET = 134217728;

async function openTracker(page, sizeName) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor(sizeName));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(3500);
  return errors;
}

test.describe('Android tablet — canvas budget', () => {
  for (const mem of [MEMORY.highEnd, MEMORY.midRange, MEMORY.lowEnd]) {
    test(`a tablet reporting ${mem} GB is budgeted as a handheld`, async ({ page }) => {
      await suppressOnboarding(page);
      await emulateDeviceMemory(page, mem);
      await openTracker(page, 'large');

      const b = await budgetReport(page);
      console.log(`ANDROID_BUDGET mem=${mem} ` + JSON.stringify(b));

      // The stub took, so the test is not silently measuring Chromium's 8.
      expect(b.deviceMemory).toBe(mem);
      expect(b.coarse, 'the tablet project must present a coarse pointer').toBe(true);
      // The fix: a touch device can no longer reach the desktop arm.
      expect(b.area).toBeLessThan(DESKTOP_BUDGET);
    });
  }

  test('a 600x800 pattern stays inside the budget on a tablet', async ({ page }) => {
    await suppressOnboarding(page);
    await emulateDeviceMemory(page, MEMORY.highEnd);
    const errors = await openTracker(page, 'huge');

    const [b, c] = [await budgetReport(page), await canvasCensus(page)];
    console.log('ANDROID_TABLET_HUGE ' + JSON.stringify({ budget: b, canvas: c }));

    expect(errors, 'the chart threw on the tablet').toEqual([]);
    expect(c.totalPx, 'total backing store exceeds the device budget').toBeLessThanOrEqual(b.area);
    expect(c.biggest.w).toBeLessThanOrEqual(b.side);
    expect(c.biggest.h).toBeLessThanOrEqual(b.side);
  });

  test('canvas memory is bounded by the viewport, not the pattern', async ({ page }) => {
    // The same O(viewport) claim the iPad spec makes, on a different engine
    // and a different screen — a tablet viewport is over twice a phone's.
    await suppressOnboarding(page);
    await emulateDeviceMemory(page, MEMORY.highEnd);
    const seen = [];
    for (const name of ['medium', 'large', 'huge']) {
      await openTracker(page, name);
      const c = await canvasCensus(page);
      seen.push({ pattern: `${SIZES[name].sW}x${SIZES[name].sH}`, ...c });
    }
    console.log('ANDROID_TABLET_SCALING ' + JSON.stringify(seen));

    // Asserted on the chart tile, not the running total. How many *optional*
    // overlays have mounted at the moment of the snapshot depends on load
    // timing — the 600x800 fixture is 13.8 MB and one run caught it an
    // overlay short, which is a race, not a property. The tile is the claim:
    // its size depends on the screen and nothing else.
    const dims = (c) => c.biggest.w + 'x' + c.biggest.h;
    expect(dims(seen[1])).toBe(dims(seen[0]));
    expect(dims(seen[2])).toBe(dims(seen[0]));

    // And whatever did mount stays inside the budget.
    const b = await budgetReport(page);
    for (const s of seen) expect(s.totalPx).toBeLessThanOrEqual(b.area);
  });

  test('a large pattern can still be zoomed until symbols render', async ({ page }) => {
    await suppressOnboarding(page);
    await emulateDeviceMemory(page, MEMORY.midRange);
    await openTracker(page, 'huge');
    const scs = await page.evaluate(() => window.maxChartCellSize(600, 800));
    console.log('ANDROID_ZOOM_CEILING 600x800 scs=' + scs);
    // 13 px is the Tier 3 threshold in computeDetailTier.
    expect(scs).toBeGreaterThanOrEqual(13);
  });

  test('the chart scroller uses the tablet\'s height', async ({ page }) => {
    // Task 3: the scroller was capped at an inline 600px on every device, so
    // a tablet with 1000+ CSS px of height showed the chart through the same
    // letterbox as a phone.
    await suppressOnboarding(page);
    await emulateDeviceMemory(page, MEMORY.highEnd);
    await openTracker(page, 'large');
    const r = await page.evaluate((fn) => {
      const el = eval('(' + fn + ')')();
      return el ? { clientH: el.clientHeight, innerH: window.innerHeight } : null;
    }, SCROLLER_FN.toString());
    console.log('ANDROID_SCROLLER_HEIGHT ' + JSON.stringify(r));
    expect(r).not.toBeNull();
    // Comfortably past the old fixed 600, and a real share of the screen.
    expect(r.clientH).toBeGreaterThan(600);
  });
});
