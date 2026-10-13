/* Coming back to a project (tracking audit TRACK-05), on a 393x727 phone:
     the saved working context is restored (Navigate here: a tap marks nothing)
     the "welcome back" recap is a strip: the chart is usable under it, and the first mark clears it
     first run: a pattern on the chart retires the welcome tour, so the first tap marks a stitch */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint, trackerDoneCount, trackerTouchDriver, ensureTrackerProjectFixture } = require('./touch-helpers');

test.use({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true });
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, extra) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    localStorage.setItem('cs_pref_trackerFocusOnPhone', 'false');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async (extra) => {
    const W = 40, H = 40;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const day = new Date().toISOString().slice(0, 10);
    const statsSessions = [{ id: 's1', date: day, startTime: day + 'T10:00:00.000Z', endTime: day + 'T11:00:00.000Z', durationSeconds: 3600, durationMinutes: 60,
      stitchesCompleted: 120, stitchesUndone: 0, netStitches: 120, units: 120, unitsCompleted: 120, unitsUndone: 0, totalAtEnd: 120, percentAtEnd: 7, note: '', coloursWorked: ['310'] }];
    const id = await ProjectStorage.save(Object.assign({ id: 'proj_p4b4', name: 'Phase4b4', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), statsSessions,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 800, symbol: 'B' }] }, extra));
    ProjectStorage.setActiveProject(id);
    return id;
  }, extra || {});
}
const open = async (page, id) => { await page.goto('/stitch.html?id=' + id); await page.waitForSelector(TRACKER_CANVAS); await page.waitForTimeout(800); };
async function tapCell(page, gx, gy) {
  const touch = await trackerTouchDriver(page);
  const p = await trackerCellPoint(page, gx, gy);
  await touch('touchStart', [p]); await page.waitForTimeout(50); await touch('touchEnd', []); await page.waitForTimeout(400);
}

test('a project reopens in the mode it was left in', async ({ page }) => {
  const id = await seed(page, { workingContext: { colour: '666', mode: 'navigate', view: 'highlight', highlight: 'outline' } });
  await open(page, id);
  await tapCell(page, 5, 5);
  expect(await trackerDoneCount(page), 'Navigate: a tap does not mark').toBe(0);
});

test('without a saved context it opens in Mark, and a bad one is ignored', async ({ page }) => {
  const id = await seed(page, { workingContext: { colour: 'nope', mode: 'sideways', view: 'x' } });
  await open(page, id);
  await tapCell(page, 5, 5);
  expect(await trackerDoneCount(page)).toBe(1);
});

test('the recap is a strip: the chart works under it and the first mark clears it', async ({ page }) => {
  const id = await seed(page);
  await open(page, id);
  const banner = page.locator('.resume-recap-banner');
  await expect(banner).toBeVisible();
  expect(await page.locator('.resume-recap-overlay').count()).toBe(0);
  await tapCell(page, 8, 12);
  expect(await trackerDoneCount(page), 'the tap reached the chart').toBe(1);
  await expect(banner).toHaveCount(0);
});

test('first run: opening a pattern retires the tour and the first tap marks a stitch', async ({ page }) => {
  await page.addInitScript(() => { try { sessionStorage.setItem('cs_eviction_warned', '1'); } catch (_) {} });
  await page.goto('/stitch.html?from=home');
  await page.locator('input[type="file"]').first().setInputFiles(ensureTrackerProjectFixture());
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1500);
  expect(await page.locator('.onboarding-content').count(), 'no tour over the chart').toBe(0);
  await tapCell(page, 5, 5);
  expect(await trackerDoneCount(page)).toBe(1);
});

test('choosing Navigate is saved with the project and comes back after a reload', async ({ page }) => {
  const id = await seed(page);
  await open(page, id);
  await page.locator('.ppal-mode-btn', { hasText: /Nav/i }).click();
  await page.waitForTimeout(7000);                                  // past the autosave debounce
  const saved = await page.evaluate(async (i) => (await ProjectStorage.get(i)).workingContext, id);
  expect(saved).toEqual({ mode: 'navigate' });
  await open(page, id);
  await tapCell(page, 5, 5);
  expect(await trackerDoneCount(page)).toBe(0);
});
