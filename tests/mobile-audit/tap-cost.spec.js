/* What one tap costs on a large chart — Phase 0 of
   reports/track-view-performance-plan.md (findings F2 and the Phase 2 gate).
   ═══════════════════════════════════════════════════════════════════════════
   Drawing a tapped stitch is already one cell (drawCellDirectly). What has
   never been measured is everything around it:

     immediate   the TrackerApp reconcile that setDone() triggers — counted in
                 the first 400 ms after the tap
     deferred    500 ms later, the analysis effect posts progress to its
                 worker (tracker-app.js "Re-run analysis whenever pattern or
                 progress changes"), and the worker's reply re-renders again —
                 counted from 400 ms to 1 500 ms
     post cost   the synchronous structured clone inside postMessage

   Taps are spaced 1.5 s apart, a realistic tap-look-tap cadence that lets
   the 500 ms analysis debounce fire after each one. CPU is throttled 4x.

   F2 (fixed): the analysis post used to carry the whole pattern as one {id}
   object per stitch — 352 ms of main-thread clone per tap on the huge
   fixture, and 11 of 12 steady-rhythm taps over 200 ms. The worker now holds
   the pattern (sent once, transferred) and a tap posts only `done`: 0.4 ms.
   The deterministic guards are that no analyse post carries a pattern and
   that no pattern is re-sent while tapping; the wall-time ceilings are set
   loose enough (this harness varies 4-5x) to catch only a return to cloning
   the pattern. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, patternCells } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes, cpuThrottle, chartBox, tbt, stats, interactions } = require('../_helpers/perfProbes');
const { installTrackProbes, readTrackProbes, summarise } = require('../_helpers/trackProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');

const TAPS = 8;
const IMMEDIATE_MS = 400;
const SPACING_MS = 1500;

async function openTracker(page, sizeName) {
  await routeCdnLocally(page);
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

    // F2 guards. Deterministic first: the pattern lives in the worker.
    expect(analysePosts.filter(p => p.keys.includes('pat')),
      'an analyse post carries the pattern again — every tap is cloning it on the main thread').toHaveLength(0);
    expect(r.posts.filter(p => p.type === 'setPattern'),
      'the pattern was re-sent while only progress changed').toHaveLength(0);
    // Then a loose ceiling on the clone itself. Was 124 ms (large) and
    // 352 ms (huge) median; now under 1 ms.
    expect(out.analysePostMs.max,
      `analysis post took ${out.analysePostMs.max} ms on the main thread`).toBeLessThan(25);
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
    // The user-visible F2 symptom: was 11 of 12 over 200 ms on the huge
    // fixture, 0 now. Two allowed for harness noise; a return of the
    // per-tap pattern clone puts nearly every tap back over.
    expect(out.over200ms,
      `${out.over200ms} of ${RHYTHM_TAPS} steady taps took over 200 ms`).toBeLessThanOrEqual(2);
  });
}

/* Taps on a chart that is already partly stitched (merged audit, fix #0).
   ═══════════════════════════════════════════════════════════════════════════
   Every spec above loads a fresh chart, and that hid the worst of the tap lag:
   much of the per-tap work is proportional to the stitches already marked,
   not to the chart. On the large fixture at 50% a tap took 1.2-1.8 s to show
   (4x CPU) against ~110 ms fresh, because each mark rebuilt the thread-usage
   estimate for every finished stitch before the browser could paint, and the
   progress save ~400 ms later rebuilt the sync record for all of them.

   Each case below taps eight cells, 1.5 s apart, at 4x CPU and reports:

     interactionMs   input to the next paint (Event Timing), per tap — what the
                     stitcher sees, including any wait behind work an earlier
                     tap started. Median and worst held to ceilings set from
                     repeated runs (see the budgets below).
     handlerMs       how long the tap's own event handlers ran (Event Timing
                     processing time, the slowest event of each tap). Before
                     fix #1 the whole Tracker re-render — with the thread-usage
                     rebuild — ran inside the release handler: ~1.2 s on the
                     large chart at 50%. It is now a few ms, and does not
                     depend on the progress, so it is the stable guard.
     snapshotCalls   whole-progress thread-usage snapshots built while tapping,
                     directly or as a fallback rebuild of the live marks.
                     Must be 0 since fix #6 (was one per tap, ~0.7 s each).
     perTapBlockingMs total blocking time divided by taps — main-thread work the
                     tap causes, whether or not it delays this tap's paint.
                     Logged: 0-20 ms now that the full autosave (fix #8) and the
                     ledger write (#9) wait for a pause.
     counted work    chart paints (full and clipped), React commits, full saves,
                     project-record writes, progress writes and whole-chart sync
                     records (trackProbes.js): asserted exactly or as ratchets.

   Cases: 50% and 90% done; 50% with a long thread-usage history (one ledger
   event per stitch ever marked, here 50 000 from another project); and a
   mixed chart with half stitches, backstitch, knots, beads and specialty
   stitches, which takes a different redraw path. */
const PROGRESS_TAPS = 8;
/* Budgets (reports/track-mode-performance-baseline.md, "Budgets").
   The tap-to-paint ceiling was 5 s, set while taps still queued behind the
   progress write and the full autosave (medians 0.1-1.9 s then). Those are
   gone. On build 1.0.240, three runs of each case (Pixel 5, 4x CPU): full-cross
   medians 72-104 ms and worst taps 96-216 ms; the mixed chart's medians 72-88
   ms and worst taps 232-256 ms (most of its taps repaint the whole tile);
   handler medians 4-7 ms everywhere. The time ceilings sit at ~2.5x the worst
   median and ~5x the worst single tap seen, so harness noise does not trip
   them but a tap that waits behind a save again (historically 1-7 s) or a
   Tracker re-render back inside the handler (historically ~1.2 s) does. The
   counted work below carries the weight: it was identical in every run. */
const PROGRESS_TAP_MEDIAN_CEILING_MS = 250;
const PROGRESS_TAP_MAX_CEILING_MS = 1200;
const PROGRESS_HANDLER_CEILING_MS = 100;
// React commits per tap: 67-70 for 8 taps in every run (~8.7 a tap, including
// the 1 Hz clock over the 13 s window); a render loop goes far past this.
const COMMITS_PER_TAP_CEILING = 12;
// Event Timing with processing times (perfProbes keeps only durations), and a
// count of whole-progress thread-usage snapshots (fix #6: only load builds one).
async function installHandlerProbe(page) {
  await page.addInitScript(() => {
    const H = window.__handlerProbe = [];
    window.__snapshotCalls = 0;
    const iv = setInterval(() => {
      const A = window.ThreadAccounting;
      if (!A || A.__counted) return;
      const orig = A.snapshot, origLive = A.live;
      A.snapshot = function () { window.__snapshotCalls++; return orig.apply(this, arguments); };
      // The live marks fall back to a rebuild when something every estimate
      // depends on changes; a tap must never need one.
      window.__lives = [];
      A.live = function () { const l = origLive.apply(this, arguments); window.__lives.push(l); return l; };
      A.__counted = true; clearInterval(iv);
    }, 10);
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.interactionId) H.push({ id: e.interactionId, run: e.processingEnd - e.processingStart });
      }).observe({ type: 'event', durationThreshold: 16 });
    } catch (_) {}
  });
}
function handlerTimes(entries) {
  const by = new Map();
  for (const e of entries) by.set(e.id, Math.max(by.get(e.id) || 0, e.run));
  return [...by.values()].map(Math.round);
}

async function seedConsumptionHistory(page, events) {
  // Built with the app's own accounting so every event is valid.
  await page.evaluate(async (n) => {
    const A = window.ThreadAccounting;
    const pid = 'proj_history_seed';
    const est = A.snapshot({ pattern: [{ id: '310', type: 'solid' }], done: [1], fabricCt: 14 }, {})['d:0'];
    const ledger = A.empty();
    A.baseline(ledger, pid, {}, null, new Date().toISOString());
    const ops = [];
    for (let i = 0; i < n; i++) ops.push({ projectId: pid, unit: 'd:' + i, seq: 1, kind: 'mark', estimate: est, enabled: false });
    A.apply(ledger, {}, ops, new Date().toISOString(), {});
    const db = await openManagerDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('manager_state', 'readwrite');
        tx.objectStore('manager_state').put(ledger, A.KEY);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  }, events);
}

const PROGRESS_CASES = [
  { name: 'large, 50% done', size: 'large', fixture: { doneFraction: 0.5 } },
  { name: 'large, 90% done', size: 'large', fixture: { doneFraction: 0.9 } },
  { name: 'large, 50% done, long thread-usage history', size: 'large', fixture: { doneFraction: 0.5 }, history: 50000 },
  { name: 'medium, 50% done, mixed stitches', size: 'medium', fixture: { doneFraction: 0.5, mixed: true } },
];

for (const c of PROGRESS_CASES) {
  test(`tap cost with progress: ${c.name}`, async ({ page }) => {
    test.setTimeout(300000);
    await routeCdnLocally(page);
    await suppressOnboarding(page);
    await installProbes(page);
    await installTrackProbes(page);
    await installHandlerProbe(page);
    await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
    if (c.history) await seedConsumptionHistory(page, c.history);
    await page.locator('input[type="file"]').first().setInputFiles(fixtureFor(c.size, c.fixture));
    await page.waitForSelector('canvas', { timeout: 120000 });
    // Load-time analysis, the first autosave and the accounting baseline settle.
    await page.waitForTimeout(8000);
    const box = await chartBox(page);
    expect(box, 'no chart scroller found').not.toBeNull();

    const cdp = await cpuThrottle(page, 4);
    await resetProbes(page);
    await page.evaluate(() => { window.__handlerProbe.length = 0; window.__snapshotCalls = 0; });
    const rebuildsBefore = await page.evaluate(() => window.__lives.reduce((n, l) => n + l.rebuilds(), 0));
    const t0 = await page.evaluate(() => performance.now());
    for (let i = 0; i < PROGRESS_TAPS; i++) {
      await tap(cdp, Math.round(box.x + box.w * 0.3 + i * 23), Math.round(box.y + box.h * 0.55 + i * 17));
      await page.waitForTimeout(SPACING_MS);
    }
    await page.waitForTimeout(1000);
    const r = await readProbes(page);
    const w = summarise(await readTrackProbes(page, t0), { t0 });
    await cdp.detach().catch(() => {});

    const taps = interactions(r.events);
    const handlers = handlerTimes(await page.evaluate(() => window.__handlerProbe.slice()));
    const snapshotCalls = await page.evaluate(() => window.__snapshotCalls)
      + await page.evaluate(() => window.__lives.reduce((n, l) => n + l.rebuilds(), 0)) - rebuildsBefore;
    const out = {
      case: c.name, cells: patternCells(c.size), taps: PROGRESS_TAPS,
      interactionMs: stats(taps),
      handlerMs: stats(handlers),
      snapshotCalls,
      perTapBlockingMs: Math.round(tbt(r.longTasks) / PROGRESS_TAPS),
      longTasks: r.longTasks.length,
      longestTaskMs: Math.round(Math.max(0, ...r.longTasks.map(l => l.d))),
      fills: r.fills,
      analysePosts: r.posts.filter(p => p.type === 'analyse').length,
      interactionP: { p50: w.interactions.p50, p95: w.interactions.p95, max: w.interactions.max },
      paints: w.paints,
      commits: w.react.commits,
      fullSaves: (w.spans['ProjectStorage.save'] || { n: 0 }).n,
      progressWrites: (w.spans['ProjectStorage.saveProgress'] || { n: 0 }).n,
      syncRecords: (w.spans['TrackingSync.record'] || { n: 0 }).n,
      projectPuts: (w.storage.byStore['projects.put'] || { n: 0 }).n,
    };
    console.log('TAP_PROGRESS ' + JSON.stringify(out));

    expect(r.reactWrapped, 'React.createElement was never wrapped').toBe(true);
    // Each tap paints its cell directly. (The analysis post is not used as the
    // proof of a mark here: on a busy main thread its 500 ms debounce merges
    // taps, so fewer posts than taps does not mean a tap was lost.)
    expect(r.fills, 'the taps painted nothing — they probably did not mark a stitch')
      .toBeGreaterThanOrEqual(PROGRESS_TAPS);
    expect(out.analysePosts, 'no analysis posts — the taps did not change progress').toBeGreaterThan(0);
    expect(taps.length, 'Event Timing saw no taps').toBeGreaterThan(0);

    // ── Counted work: the same on any machine ────────────────────────────
    // Fix #6: a mark re-estimates only what changed (ThreadAccounting.live).
    // Each tap used to rebuild the estimate for every finished stitch.
    expect(snapshotCalls, 'a tap rebuilt the whole thread-usage snapshot').toBe(0);
    if (c.fixture.mixed) {
      // A tap that marks a full stitch repaints just that stitch (with every bead,
      // petite and long stitch over it, whole) even though the chart has them:
      // was 9 full and 7 clipped paints for 8 taps. Two of these taps land on a
      // half stitch or a knot, whose marks repaint the tile on any chart; that is
      // all the full repaints left (2 in every run). A ratchet.
      expect(out.paints.full + out.paints.partial, 'fewer chart paints than taps — the taps did not all mark').toBeGreaterThanOrEqual(PROGRESS_TAPS);
      expect(out.paints.full, `${out.paints.full} full chart repaints for ${PROGRESS_TAPS} taps`).toBeLessThanOrEqual(2);
    } else {
      // A tap paints its own stitch (one clipped repaint) and nothing else.
      expect(out.paints.partial, `${out.paints.partial} stitch repaints for ${PROGRESS_TAPS} taps (one each expected) — did every tap mark?`).toBe(PROGRESS_TAPS);
      expect(out.paints.full, `${out.paints.full} full chart repaints while tapping a full-cross chart`).toBe(0);
    }
    expect(out.commits, `${out.commits} React commits for ${PROGRESS_TAPS} taps`).toBeLessThanOrEqual(PROGRESS_TAPS * COMMITS_PER_TAP_CEILING);
    // Every case is over 40 000 stitches: marks go to the progress record and
    // the full save waits for a pause (fix #8); a progress write never
    // rebuilds the whole sync record (progress delta) and never rewrites the
    // project record.
    expect(out.fullSaves, 'a full project save ran while tapping').toBe(0);
    expect(out.projectPuts, 'the whole project record was written while tapping').toBe(0);
    expect(out.syncRecords, 'TrackingSync.record ran over the whole chart while tapping').toBe(0);
    expect(out.progressWrites, 'no progress write — marks were not made durable').toBeGreaterThan(0);
    expect(out.progressWrites, `${out.progressWrites} progress writes for ${PROGRESS_TAPS} taps`).toBeLessThanOrEqual(PROGRESS_TAPS);

    // ── Time, emulated: loose enough for this harness's noise ────────────
    expect(out.handlerMs.median,
      `the tap handlers on ${c.name} ran for ${out.handlerMs.median} ms (median) — is the Tracker re-render back inside them?`)
      .toBeLessThan(PROGRESS_HANDLER_CEILING_MS);
    expect(out.interactionMs.median,
      `a tap on ${c.name} took ${out.interactionMs.median} ms to show (median)`).toBeLessThan(PROGRESS_TAP_MEDIAN_CEILING_MS);
    expect(out.interactionMs.max,
      `the slowest tap on ${c.name} took ${out.interactionMs.max} ms to show`).toBeLessThan(PROGRESS_TAP_MAX_CEILING_MS);
  });
}
