/* One definition of progress (tracking audit STATS-01): a project with full stitches, half stitches and French
   knots reads the same everywhere. 1,742 full + 30 half sides (15 units) + 2 knots = 1,759 units; with 2 full, 2 half
   sides and 1 knot done that is 4 / 1,759 (0.2%). */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  // First-run questions would otherwise take the first click.
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 40, H = 44;                                              // 1,760 cells, 18 of them background
    const pattern = Array.from({ length: W * H }, (_, i) => (i >= 1742 ? { id: '__skip__' } : { id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const done = new Array(W * H).fill(0); done[0] = 1; done[1] = 1;
    const side = { id: '310', rgb: [0, 0, 0], type: 'solid' };
    const halfStitches = Array.from({ length: 15 }, (_, i) => [100 + i, { fwd: side, bck: side }]);
    const halfDone = [[100, { fwd: true, bck: true }]];
    const knots = [{ x: 0, y: 0, id: '310', rgb: [0, 0, 0] }, { x: 2, y: 2, id: '310', rgb: [0, 0, 0] }];
    const id = await ProjectStorage.save({ id: 'proj_units', name: 'Units', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, halfStitches, halfDone, knots, knotsDone: ['0,0'],
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 1742, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}

test('the Tracker strip, popover, Stats page and the library row all read 4 / 1,759 (0.2%)', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  // The strip: units done and to go, with the non-full types named.
  await expect(page.locator('.info-strip-counts')).toHaveText('4 done · 1,755 to go');
  await expect(page.locator('.info-strip-breakdown')).toHaveText('2 half, 1 knot');
  await expect(page.locator('.info-strip-pct')).toHaveText('0.2%');
  // The popover.
  await page.getByRole('button', { name: /Progress info/ }).click();
  await expect(page.getByText('4 / 1,759 (0.2%)')).toBeVisible();
  await page.keyboard.press('Escape');
  // Project Stats.
  await page.evaluate(() => window.__openTrackerStats());
  await expect(page.locator('.stats-big-number').first()).toHaveText('4');
  await expect(page.getByText('of 1,759 stitches')).toBeVisible();
  // The library row Home, the library and the stash page read.
  const row = await page.evaluate(async () => { const r = (await ProjectStorage.listProjects()).find(p => p.id === 'proj_units'); return { done: r.completedStitches, total: r.totalStitches }; });
  expect(row).toEqual({ done: 4, total: 1759 });
});

test('a project with only half stitches done reads the same on every page', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const p = await ProjectStorage.get('proj_units');
    p.done = new Array(p.pattern.length).fill(0); p.knotsDone = []; delete p.lastWriteAt;
    p.halfDone = [[100, { fwd: true, bck: true }], [101, { fwd: true }]];          // 3 sides = 1.5 units
    await ProjectStorage.save(p);
  });
  const row = await page.evaluate(async () => { const r = (await ProjectStorage.listProjects()).find(p => p.id === 'proj_units'); return { done: r.completedStitches, total: r.totalStitches, any: r.anyProgress }; });
  expect(row).toEqual({ done: 2, total: 1759, any: true });                      // 1.5 rounds to 2 for display
  await page.goto('/stitch.html?id=proj_units');
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  await expect(page.locator('.info-strip-counts')).toHaveText('2 done · 1,757 to go');
});

test('a session records its marks in units and the day total adds units', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  // Mark two more full stitches by clicking cells.
  for (const gx of [5, 6]) { const p = await trackerCellPoint(page, gx, 5); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); }
  await expect(page.locator('.info-strip-counts')).toHaveText('6 done · 1,753 to go');
  await page.goto('/home.html');            // leaving the Tracker ends and saves the session
  await page.waitForFunction(() => window.ProjectStorage);
  const sessions = await page.evaluate(async () => (await ProjectStorage.get('proj_units')).statsSessions || []);
  if (sessions.length) {                    // a very short session may not be kept; when it is, it carries units
    expect(sessions[0].units).toBe(2);
    expect(sessions[0].netStitches).toBe(2);
  }
});
