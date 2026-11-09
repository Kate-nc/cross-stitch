/* The first seconds after opening a project that has not changed — the top
   item in reports/track-mode-performance-baseline.md.
   ═══════════════════════════════════════════════════════════════════════════
   A project opened in the Tracker, saved, and opened again (a reload, as when
   a stitcher comes back to the tab, or Home > Continue) has nothing new to
   load. On the large fixture at 4x CPU the chart nonetheless first paints
   ~12 s after navigation (huge: ~42 s), because before anything is drawn:

     - every Tracker unload writes a recovery journal and a progress record,
       whether or not anything changed, and ProjectStorage.get() used to
       materialise that journal into the stored project (a full-record put)
       even when it held exactly the stored marks; it now drops such a journal
       without writing (desktop-open-save.spec.js);
     - the header asks for the same project through getActiveProject() at the
       same time, so the read and the progress overlay run twice;
     - the whole-chart TrackingSync.merge in processLoadedProject.

   These are ratchets on counted work, not targets: they pin today's figures so
   a change that adds another read or a full write fails, and they are to be
   lowered as the rest is fixed. Time to first paint is logged and held to a
   loose ceiling (about 2x the measured figure) only. See trackProbes.js for
   what is counted and why counts, not times, carry the weight here. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { waitForSaved, cpuThrottle } = require('../_helpers/perfProbes');
const { installTrackProbes, readTrackProbes, summarise } = require('../_helpers/trackProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');

// Large 400 x 500 at 50%, Pixel 5 at 4x. Build 1.0.240: 2 reads, 2 full puts,
// first paint 12.2-14.4 s. With the unchanged-open fix: 2 reads, 0 puts, ~9.2 s.
const GETS_ON_OPEN = 2;           // the Tracker's load and the header's badge
const FULL_PUTS_ON_OPEN = 0;      // nothing changed, so nothing is written
const FIRST_PAINT_CEILING_MS = 20000;

test('reopening an unchanged large project: reads, writes and time to first paint', async ({ page }) => {
  test.setTimeout(300000);
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await installTrackProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large', { doneFraction: 0.5 }));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 120000 });
  await waitForSaved(page, 120000);
  await page.waitForTimeout(2000);

  const cdp = await cpuThrottle(page, 4);
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__tp.fullPaints.length > 0, null, { timeout: 120000, polling: 250 });
  const r = await readTrackProbes(page, 0);
  await cdp.detach().catch(() => {});

  const firstPaint = Math.round(r.fullPaints[0]);
  const before = (a) => a.filter((x) => x.t < firstPaint);
  const gets = before(r.spans).filter((s) => s.name === 'ProjectStorage.get').length;
  const fullPuts = before(r.idb).filter((e) => e.store === 'projects' && e.op === 'put').length;
  const s = summarise(r, { t0: 0, t1: firstPaint });
  console.log('OPEN_COST ' + JSON.stringify({ firstPaint, gets, fullPuts, longTasks: s.longTasks, storageMs: s.storage.mainThreadMs, withDelta: (s.spans['TrackingSync.withDelta'] || {}).n || 0 }));

  expect(r.reactWrapped, 'the probes did not install — nothing was measured').toBe(true);
  expect(gets, 'the project was not read on open — is this measuring the right page?').toBeGreaterThan(0);
  expect(gets, `${gets} full project reads before the chart first painted`).toBeLessThanOrEqual(GETS_ON_OPEN);
  expect(fullPuts, `${fullPuts} full project writes before the chart first painted, for a project nobody changed`).toBeLessThanOrEqual(FULL_PUTS_ON_OPEN);
  expect(firstPaint, `the chart first painted ${firstPaint} ms after navigation`).toBeLessThan(FIRST_PAINT_CEILING_MS);
});
