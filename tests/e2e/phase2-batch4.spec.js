/* Day boundaries (tracking audit STATS-05), in the Tracker with a faked clock: 10 stitches before the day end and
   20 after belong to different days (here 3 and 2); with a later day end they are one day; "Today" is the same
   live and once the session is saved. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, dayEnd) {
  await page.addInitScript((deh) => { try {
    const Real = Date; window.__off = 0;
    window.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + window.__off); else super(...a); }
      static now() { return Real.now() + window.__off; }
    };
    window.__setClock = (y, mo, d, h, mi, s) => { window.__off = new Real(y, mo, d, h, mi, s).getTime() - Real.now(); };
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    localStorage.setItem('cs_pref_showStreaksAndGoals', 'true');       // these tests look at the goals and the streak (a person with a history has them on)
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerIdleMinutes', JSON.stringify(0.05));        // the session closes after about 3 seconds
    if (deh) localStorage.setItem('cs_pref_statsDayEndHour', JSON.stringify(deh));
  } catch (_) {} }, dayEnd || 0);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const id = await ProjectStorage.save({ id: 'proj_b4', name: 'Batch4', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
const mark = async (page, gx, gy) => { const p = await trackerCellPoint(page, gx, gy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
const sessionsOf = (page) => page.evaluate(async () => {
  await window.__flushProjectToIDB();
  return ((await ProjectStorage.get('proj_b4')).statsSessions || []).map(s => ({ id: s.id, groupId: s.groupId || null, date: s.date, added: s.unitsCompleted - (s.catchUp || 0) }));
});

test('a session across midnight is saved as one record per day, and Today does not change when it is saved', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.evaluate(() => window.__setClock(2026, 9, 10, 23, 58, 30));
  for (const gx of [1, 2, 3]) await mark(page, gx, 1);
  await page.evaluate(() => window.__setClock(2026, 9, 11, 0, 1, 0));
  for (const gx of [4, 5]) await mark(page, gx, 1);
  // Live: today (the 11th) is the 2 made after midnight.
  await page.evaluate(() => { const c = document.querySelector('.ppal-close'); if (c) c.click(); });
  await page.getByRole('button', { name: /Progress info/ }).click();
  await expect(page.locator('.app-info-popover')).toContainText(/Today\s*2(?!\d)/);
  await page.keyboard.press('Escape');
  // The session closes on its own after the idle time; the saved records put 3 on the 10th and 2 on the 11th.
  await expect.poll(async () => (await sessionsOf(page)).length, { timeout: 20000 }).toBe(2);
  const sessions = await sessionsOf(page);
  expect(sessions.map(s => [s.date, s.added])).toEqual([['2026-10-10', 3], ['2026-10-11', 2]]);
  expect(new Set(sessions.map(s => s.id)).size).toBe(2);
  expect(sessions[0].groupId).toBe(sessions[1].groupId);
  // ...and Today is still 2 once saved.
  await page.getByRole('button', { name: /Progress info/ }).click();
  await expect(page.locator('.app-info-popover')).toContainText(/Today\s*2(?!\d)/);
});

test('with the day ending at 2:00 AM the same marks are one day', async ({ page }) => {
  const id = await seed(page, 2);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.evaluate(() => window.__setClock(2026, 9, 10, 23, 58, 30));
  for (const gx of [1, 2, 3]) await mark(page, gx, 1);
  await page.evaluate(() => window.__setClock(2026, 9, 11, 0, 1, 0));
  for (const gx of [4, 5]) await mark(page, gx, 1);
  await expect.poll(async () => (await sessionsOf(page)).length, { timeout: 20000 }).toBe(1);
  const sessions = await sessionsOf(page);
  expect(sessions.map(s => [s.date, s.added])).toEqual([['2026-10-10', 5]]);
});

test('Day ends at is beside the goals and in Preferences, and is one setting', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.evaluate(() => window.__openTrackerStats());
  const sel = page.locator('#day-ends-at');
  await expect(sel).toBeVisible();
  await expect(page.getByText('Late-night stitching counts for the previous day until this hour.').first()).toBeVisible();
  await sel.selectOption('3');
  await expect.poll(() => page.evaluate(() => window.UserPrefs.get('statsDayEndHour'))).toBe(3);
});

test('Preferences has Day ends at, with its one-line explanation', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.evaluate(() => window.dispatchEvent(new Event('cs:openPreferences')));
  await page.getByRole('button', { name: /Stitch Tracker/ }).first().click();
  await expect(page.getByText('Late-night stitching counts for the previous day until this hour.')).toBeVisible();
  await page.getByLabel('Day ends at').selectOption('2');
  await expect.poll(() => page.evaluate(() => window.UserPrefs.get('statsDayEndHour'))).toBe(2);
});

test('changing Day ends at closes the running session, so earlier marks keep their day', async ({ page }) => {
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.evaluate(() => window.__setClock(2026, 9, 11, 0, 30, 0));
  for (const gx of [1, 2]) await mark(page, gx, 1);
  await page.evaluate(() => window.UserPrefs.set('statsDayEndHour', 2));       // a 00:30 mark now belongs to the 10th
  await expect.poll(async () => (await sessionsOf(page)).length, { timeout: 8000 }).toBe(1);
  expect((await sessionsOf(page))[0].date).toBe('2026-10-11');                 // what was marked kept the day it had
  await mark(page, 3, 1);                                                      // the next mark starts a session under the new setting
  await expect.poll(async () => (await sessionsOf(page)).map(s => s.date).join(), { timeout: 20000 }).toBe('2026-10-11,2026-10-10');
});
