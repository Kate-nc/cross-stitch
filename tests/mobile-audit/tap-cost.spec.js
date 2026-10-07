/* What one tap costs on a large chart — Phase 0 of
   reports/track-view-performance-plan.md (findings F2 and the Phase 2 gate).
   ═══════════════════════════════════════════════════════════════════════════
   Drawing a tapped stitch is already one cell (drawCellDirectly). What has
   never been measured is everything around it:

     immediate   the TrackerApp reconcile that setDone() triggers — counted in
                 the first 400 ms after the tap
     deferred    500 ms later, the analysis effect re-posts the pattern to its
                 worker (tracker-app.js "Re-run analysis whenever pattern or
                 progress changes"), and the worker's reply re-renders again —
                 counted from 400 ms to 1 500 ms
     post cost   the synchronous structured clone inside postMessage, which
                 copies one {id} object per stitch on the main thread

   Taps are spaced 1.5 s apart, a realistic tap-look-tap cadence that lets
   the 500 ms analysis debounce fire after each one. CPU is throttled 4x.

   This is a baseline, so it asserts that the measurement is real, not a
   budget. Phase 1 turns the numbers into ceilings. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, patternCells } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes, cpuThrottle, chartBox, tbt, stats, interactions } = require('../_helpers/perfProbes');

const TAPS = 8;
const IMMEDIATE_MS = 400;
const SPACING_MS = 1500;

async function openTracker(page, sizeName) {
  await suppressOnboarding(page);
  await installProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor(sizeName));
  await page.waitForSelector('canvas', { timeout: 120000 });
  // Let the load-time analysis run and settle before counting.
  await page.waitForTimeout(5000);
}

async function tap(cdp, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const size of ['large', 'huge']) {
  test(`tap cost on the ${size} fixture`, async ({ page }) => {
    test.setTimeout(300000);
    await openTracker(page, size);
    const box = await chartBox(page);
    expect(box, 'no chart scroller found — the harness is measuring the wrong element').not.toBeNull();

    const cdp = await cpuThrottle(page, 4);
    await resetProbes(page);

    const perTap = [];
    for (let i = 0; i < TAPS; i++) {
      // A different cell each time, well inside the visible chart, so no tap
      // toggles a stitch an earlier one marked.
      const x = Math.round(box.x + box.w * 0.3 + i * 23);
      const y = Math.round(box.y + box.h * 0.35 + i * 17);
      const before = await readProbes(page);
      await tap(cdp, x, y);
      await page.waitForTimeout(IMMEDIATE_MS);
      const mid = await readProbes(page);
      await page.waitForTimeout(SPACING_MS - IMMEDIATE_MS);
      const after = await readProbes(page);
      perTap.push({
        immediateElements: mid.elements - before.elements,
        deferredElements: after.elements - mid.elements,
        fills: after.fills - before.fills,
      });
    }
    await page.waitForTimeout(800);
    const r = await readProbes(page);
    await cdp.detach().catch(() => {});

    const analysePosts = r.posts.filter(p => p.type === 'analyse');
    const out = {
      cells: patternCells(size),
      taps: TAPS,
      immediateElements: stats(perTap.map(t => t.immediateElements)),
      deferredElements: stats(perTap.map(t => t.deferredElements)),
      fillsPerTap: stats(perTap.map(t => t.fills)),
      analysePosts: analysePosts.length,
      analysePostMs: stats(analysePosts.map(p => p.ms)),
      otherPosts: r.posts.length - analysePosts.length,
      longTasks: r.longTasks.length,
      totalBlockingMs: tbt(r.longTasks),
      interactionMs: stats(interactions(r.events)),
      topTypes: r.topTypes,
    };
    console.log(`TAP_COST_${size.toUpperCase()} ` + JSON.stringify(out));

    expect(r.reactWrapped, 'React.createElement was never wrapped — nothing was measured').toBe(true);
    // Each tap changes `done`, and every change re-posts the analysis after
    // the debounce. Fewer posts than taps means the taps did not mark — the
    // gesture went somewhere else and the figures describe an idle page.
    expect(analysePosts.length,
      'taps did not trigger analysis — they probably did not mark a stitch').toBeGreaterThanOrEqual(TAPS - 1);
    expect(stats(perTap.map(t => t.immediateElements)).median,
      'a tap re-rendered nothing — setDone did not run').toBeGreaterThan(0);
  });
}

/* The user-visible half of F2. Above, each tap is measured in isolation, so
   its own latency never overlaps the analysis post it causes. A stitcher
   working steadily does overlap them: a tap every ~650 ms lands just after
   the previous tap's 500 ms debounce has fired, i.e. while the main thread is
   busy cloning the pattern into the worker. The taps then wait. */
const RHYTHM_TAPS = 12;
const RHYTHM_MS = 650;

for (const size of ['large', 'huge']) {
  test(`steady tapping rhythm on the ${size} fixture`, async ({ page }) => {
    test.setTimeout(300000);
    await openTracker(page, size);
    const box = await chartBox(page);
    expect(box, 'no chart scroller found').not.toBeNull();

    const cdp = await cpuThrottle(page, 4);
    await resetProbes(page);
    for (let i = 0; i < RHYTHM_TAPS; i++) {
      await tap(cdp, Math.round(box.x + box.w * 0.25 + i * 19), Math.round(box.y + box.h * 0.3 + (i % 6) * 21));
      await page.waitForTimeout(RHYTHM_MS);
    }
    await page.waitForTimeout(1500);
    const r = await readProbes(page);
    await cdp.detach().catch(() => {});

    const taps = interactions(r.events);
    const out = {
      cells: patternCells(size), taps: RHYTHM_TAPS, spacingMs: RHYTHM_MS,
      interactionMs: stats(taps),
      over100ms: taps.filter(d => d > 100).length,
      over200ms: taps.filter(d => d > 200).length,
      analysePosts: r.posts.filter(p => p.type === 'analyse').length,
      totalBlockingMs: tbt(r.longTasks),
    };
    console.log(`TAP_RHYTHM_${size.toUpperCase()} ` + JSON.stringify(out));

    expect(r.reactWrapped, 'React.createElement was never wrapped').toBe(true);
    expect(out.analysePosts, 'no analysis posts — the taps did not mark').toBeGreaterThan(0);
    expect(taps.length, 'Event Timing saw no taps').toBeGreaterThan(0);
  });
}
