/* One estimator (tracking audit STATS-02): the audit's history project (10 stitching days in the last 25, 145 per
   stitching day, 250 stitches left) reads "about 5 days" in the Tracker strip, Progress info, project Stats and on
   the Home card, each with what it is based on; a project with too little history says so everywhere. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, offsets) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    localStorage.setItem('cs_pref_showStreaksAndGoals', 'true');       // these tests look at the goals and the streak (a person with a history has them on)
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async (offs) => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const done = new Array(W * H).fill(0); for (let i = 0; i < 150; i++) done[i] = 1;      // 150 of 400 done, 250 left
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const statsSessions = offs.map(o => ({ id: 's' + o, date: day(o), startTime: day(o) + 'T10:00:00.000Z', endTime: day(o) + 'T11:00:00.000Z', durationSeconds: 3600, durationMinutes: 60,
      stitchesCompleted: 145, stitchesUndone: 0, netStitches: 145, units: 145, unitsCompleted: 145, unitsUndone: 0, totalAtEnd: 150, percentAtEnd: 37.5, note: '', coloursWorked: ['310'] }));
    const id = await ProjectStorage.save({ id: 'proj_b5', name: 'Batch5', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, statsSessions,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  }, offsets);
}
async function openTracker(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });          // the "welcome back" recap
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(500);
}
const HISTORY = [-24, -22, -19, -17, -14, -11, -8, -5, -2, 0];
const BASIS = 'Based on your last 25 days: 2.8 stitching days a week, 145 stitches per stitching day';

test('the history project says "about 5 days" in the strip, Progress info, Stats and Home, with its basis', async ({ page }) => {
  const id = await seed(page, HISTORY);
  // Home card
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await expect(page.getByText('Est. about 5 days').first()).toBeVisible({ timeout: 15000 });
  // Tracker strip
  await openTracker(page, id);
  const strip = page.locator('.completion-projection-bar');
  await expect(strip).toContainText(/Estimated finish: about 5 days \(around /);
  await expect(strip).toContainText(BASIS);
  // Progress info
  await page.getByRole('button', { name: /Progress info/ }).click();
  const pop = page.locator('.app-info-popover');
  await expect(pop).toContainText(/Estimated finish\s*about 5 days/);
  await expect(pop).toContainText('145 per stitching day');
  await expect(pop).toContainText(BASIS);
  await page.keyboard.press('Escape');
  // Project Stats
  await page.evaluate(() => window.__openTrackerStats());
  const est = page.locator('.stats-estimate');
  await expect(est).toContainText(/Between .* and /);
  await expect(est).toContainText(BASIS);
  // the same date in the strip and in Stats
  const stripDate = (await strip.innerText()).match(/around ([^)]+)\)/)[1];
  const statsDate = (await est.locator('.stats-value').innerText()).trim();
  expect(statsDate.replace(/,? 20\d\d$/, '')).toBe(stripDate.replace(/,? 20\d\d$/, ''));
});

test('a project with too little history says so everywhere', async ({ page }) => {
  const id = await seed(page, [-1, 0]);
  await openTracker(page, id);
  await expect(page.locator('.completion-projection-bar')).toContainText('Not enough history yet');
  await page.getByRole('button', { name: /Progress info/ }).click();
  await expect(page.locator('.app-info-popover')).toContainText('Not enough history yet');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__openTrackerStats());
  await expect(page.locator('.stats-estimate')).toContainText('Not enough history yet');
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.waitForTimeout(1500);
  await expect(page.getByText(/Est\. about/)).toHaveCount(0);
});

test('the what-if slider converts stitching days to calendar days at the usual cadence', async ({ page }) => {
  const id = await seed(page, HISTORY);
  await openTracker(page, id);
  await page.evaluate(() => window.__openTrackerStats());
  await page.getByRole('button', { name: 'Cumulative' }).click();
  // 250 left at 145 per stitching day = 2 stitching days, at 2.8 stitching days a week = about 5 days
  await expect(page.getByText(/145 per stitching day: about 5 days at 2\.8 stitching days a week/)).toBeVisible();
});

test('global Stats: the goals pace line comes from the same estimator', async ({ page }) => {
  await seed(page, HISTORY);
  await page.goto('/create.html?mode=stats');
  await expect(page.getByText('Your pace: 145 stitches per stitching day, 2.8 stitching days a week (last 25 days)')).toBeVisible({ timeout: 20000 });
});

test('Home fills in the estimate for a row saved before this update (the one-time refresh)', async ({ page }) => {
  await seed(page, HISTORY);
  // Make the project's summary row look as it did before: version 1, no pace figures.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('CrossStitchDB');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['project_meta', 'stats_summaries'], 'readwrite');
      ['project_meta', 'stats_summaries'].forEach(n => {
        const st = tx.objectStore(n);
        const q = st.get('proj_b5');
        q.onsuccess = () => { const v = q.result; v.unitsV = 1; delete v.paceDaily; delete v.firstActiveDate; delete v.activeDaysTotal; st.put(v, 'proj_b5'); };
      });
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.goto('/home.html');
  await expect(page.getByText('Est. about 5 days').first()).toBeVisible({ timeout: 20000 });
});
