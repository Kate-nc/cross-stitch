/* Large charts: marks alone do not trigger the full autosave (tap-lag audit, fix #8).
   ═══════════════════════════════════════════════════════════════════════════
   On a chart over 40 000 stitches the full save rewrites the whole chart, which
   on a phone blocked taps for seconds every time marking paused for 5 s. Marks
   are already on disk through the small progress record within a few seconds,
   and reloading applies it, so for marks alone the full save now waits for a
   longer pause. This checks the three things that makes safe:

     - the marks survive a reload even if no full save ran (as after a crash),
     - the save badge says Saved once the progress record is written,
     - hiding the tab still writes everything at once.

   Any other change (and every change on a smaller chart) saves as before; the
   other save specs cover those. */
const { test, expect } = require('@playwright/test');
const { makeTrackerFixture } = require('../_helpers/trackerFixture');
const { installLocalCdn } = require('./local-cdn');

const W = 210, H = 200;                     // 42 000 stitches: just over the threshold
const fixture = () => makeTrackerFixture({ sW: W, sH: H, nColours: 20, doneFraction: 0.5, name: 'Deferral fixture' });
const badge = page => page.locator('.tb-proj-badge-saved');
const doneCount = page => page.evaluate(() => {
  const el = document.querySelector('.info-strip-counts');
  return el ? parseInt(el.textContent.replace(/,/g, ''), 10) : NaN;
});

async function open(page) {
  await installLocalCdn(page.context());
  await page.addInitScript(() => {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
      localStorage.setItem('cs_stitchStyle', 'block');
      localStorage.setItem('cs_sessionOnboardingDone', '1');
      ['firstStitch_tracker', 'rectSelect_tracker', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    } catch (e) {}
  });
  await page.goto('/stitch.html?from=home');
  await page.locator('input[type="file"]').first().setInputFiles(fixture());
  await page.waitForSelector('canvas[aria-label^="Cross stitch pattern grid"]');
  // The import's own full save, and the first progress write, settle.
  await expect(badge(page)).toHaveText(/saved/i, { timeout: 30000 });
  await page.waitForTimeout(6000);
}
async function countFullSaves(page) {
  await page.evaluate(() => {
    window.__fullSaves = 0;
    const save = ProjectStorage.save.bind(ProjectStorage);
    ProjectStorage.save = function () { window.__fullSaves++; return save.apply(null, arguments); };
  });
}
// Five clicks on separate stitches near the chart's top-left. The fixture has
// every other stitch marked, so some clicks mark and some unmark; only the total
// matters.
async function markSome(page) {
  const box = await page.locator('canvas[aria-label^="Cross stitch pattern grid"]').boundingBox();
  const before = await doneCount(page);
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(box.x + 60 + i * 23, box.y + 80 + i * 17);
    await page.waitForTimeout(250);
  }
  await expect.poll(() => doneCount(page)).not.toBe(before);
  return doneCount(page);
}

test('marks alone are written by the progress record, not a full save, and survive a reload', async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await countFullSaves(page);
  const marked = await markSome(page);
  await expect(badge(page)).toHaveText(/Saved/, { timeout: 15000 });      // the progress record is on disk
  await page.waitForTimeout(7000);                                         // past the old 5 s debounce
  expect(await page.evaluate(() => window.__fullSaves)).toBe(0);
  // As if the page died now: no unload save gets through.
  await page.evaluate(() => {
    ProjectStorage.save = () => new Promise(() => {});
    window.saveProjectToDB = () => new Promise(() => {});
  });
  await page.reload();
  await page.waitForSelector('canvas[aria-label^="Cross stitch pattern grid"]');
  await expect.poll(() => doneCount(page), { timeout: 30000 }).toBe(marked);
});

test('hiding the tab writes the full project at once', async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await countFullSaves(page);
  await markSome(page);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__fullSaves)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__fullSaves), { timeout: 15000 }).toBeGreaterThan(0);
});

test('any other change still saves within the normal few seconds', async ({ page }) => {
  test.setTimeout(180000);
  await open(page);
  await countFullSaves(page);
  await markSome(page);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__fullSaves)).toBe(0);
  await page.keyboard.press('v');                      // the chart view is saved, and is not a mark
  await expect.poll(() => page.evaluate(() => window.__fullSaves), { timeout: 15000 }).toBeGreaterThan(0);
});
