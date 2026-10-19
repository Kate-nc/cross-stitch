/* Calm motivation (tracking audit STATS-09): streaks, goals and celebrations can be turned off everywhere; the weekly
   streak is the default; someone who already has a history or goals keeps everything, a new person starts calm. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

// prefs: { show, daily } stored before the page loads; undefined = leave it for the app to decide
async function seed(page, { prefs, withHistory = true, goal } = {}) {
  await page.addInitScript((p) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    if (p && p.show !== undefined) localStorage.setItem('cs_pref_showStreaksAndGoals', JSON.stringify(p.show));
    if (p && p.daily !== undefined) localStorage.setItem('cs_pref_showDailyStreak', JSON.stringify(p.daily));
  } catch (_) {} }, prefs || null);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async ({ withHistory, goal }) => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    let total = 0;
    const statsSessions = withHistory ? [-15, -9, -2, -1, 0].map((o, i) => { const n = 20 + i * 5; total += n; return { id: 's' + i, date: day(o), startTime: day(o) + 'T10:00:00', endTime: day(o) + 'T10:40:00', durationSeconds: 2400, durationMinutes: 40,
      stitchesCompleted: n, stitchesUndone: 0, netStitches: n, units: n, unitsCompleted: n, unitsUndone: 0, totalAtEnd: total, percentAtEnd: Math.round(total / 4) / 10, note: '', coloursWorked: ['310'] }; }) : [];
    const done = new Array(W * H).fill(0); for (let i = 0; i < total; i++) done[i] = 1;
    const id = await ProjectStorage.save({ id: 'proj_p3b4', name: 'Phase3 batch4', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, statsSessions,
      statsSettings: goal ? { dailyGoal: goal } : undefined,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  }, { withHistory, goal }).then(async (id) => {
    // Nothing decided yet, as for someone who had this data before the update (the first load above, with no projects,
    // had decided it for a new person).
    if (!prefs) await page.evaluate(() => { localStorage.removeItem('cs_pref_showStreaksAndGoals'); localStorage.removeItem('cs_pref_showDailyStreak'); });
    return id;
  });
}
async function openTracker(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  // The "welcome back" recap is a strip since Phase 4 (nothing to click), and waiting for it would outlast the goal message.
  await page.waitForTimeout(500);
}
async function openStats(page, id) {
  await openTracker(page, id);
  await page.evaluate(() => window.__openTrackerStats());
  await page.locator('.stats-dashboard').waitFor();
  await page.waitForTimeout(400);
}
const stored = (page, k) => page.evaluate((key) => window.UserPrefs.get(key), k);

test('someone with a history keeps everything: the preference is decided on, and the weekly and daily streaks both show', async ({ page }) => {
  const id = await seed(page);                       // nothing stored: the app decides from the history
  await openStats(page, id);
  await expect.poll(() => stored(page, 'showStreaksAndGoals')).toBe(true);
  expect(await stored(page, 'showDailyStreak')).toBe(true);
  await expect(page.locator('.streaks-panel')).toContainText('Weeks in a row');
  await expect(page.locator('.streaks-panel')).toContainText('Days in a row');
  await expect(page.locator('.goal-tracker-panel')).toBeVisible();
});

test('a new person starts calm: no streaks, no goals, and the choice stays when they begin stitching', async ({ page }) => {
  const id = await seed(page, { withHistory: false });
  await openStats(page, id);
  await expect.poll(() => stored(page, 'showStreaksAndGoals')).toBe(false);
  await expect(page.locator('.goal-tracker-panel')).toHaveCount(0);
  await expect(page.locator('.streaks-panel')).not.toContainText('in a row');
  await expect(page.locator('.streaks-panel h3')).toHaveText('Sessions');             // best day and average session are still there
  // Day ends at is still reachable (it lives in Settings without the goals card)
  await page.locator('details.stats-accordion summary', { hasText: 'Settings' }).click();
  await expect(page.getByLabel('Day ends at')).toBeVisible();
  // a first session does not turn it on
  await page.getByRole('button', { name: /Back to (projects|chart)|Close/ }).first().click().catch(() => {});
  expect(await stored(page, 'showStreaksAndGoals')).toBe(false);
});

test('the weekly streak is the default; the daily streak shows only when it is on', async ({ page }) => {
  const id = await seed(page, { prefs: { show: true, daily: false } });
  await openStats(page, id);
  await expect(page.locator('.streaks-panel')).toContainText('Weeks in a row');
  await expect(page.locator('.streaks-panel')).not.toContainText('Days in a row');
  await expect(page.locator('.streaks-panel')).not.toContainText(/keep it (going|up)/i);
});

test('turned off, nothing about streaks or goals shows in the Stats pages, and the charts have no goal line', async ({ page }) => {
  const id = await seed(page, { prefs: { show: false, daily: false }, goal: 30 });
  await openStats(page, id);
  await expect(page.locator('.goal-tracker-panel')).toHaveCount(0);
  await expect(page.locator('.streaks-panel')).not.toContainText('in a row');
  await page.getByRole('button', { name: 'Daily', exact: true }).click();
  await expect(page.locator('.chart-section svg text', { hasText: 'Goal:' })).toHaveCount(0);
  // the all-projects page: no streak card, no goals
  await page.goto('/create.html?mode=stats');
  await page.locator('.stats-dashboard').waitFor();
  await expect(page.locator('.gsd-streak')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Goals' })).toHaveCount(0);
  // the Stats page with the widgets
  await page.goto('/home.html?tab=stats');
  await page.waitForTimeout(2500);
  await expect(page.locator('#stats-streak')).toHaveCount(0);
});

test('turned on, the goal line, the goals card and the streak card are there', async ({ page }) => {
  const id = await seed(page, { prefs: { show: true, daily: false }, goal: 30 });
  await openStats(page, id);
  await expect(page.locator('.goal-tracker-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Daily', exact: true }).click();
  await expect(page.locator('.chart-section svg text', { hasText: 'Goal: 30' })).toHaveCount(1);
  await page.goto('/create.html?mode=stats');
  await page.locator('.stats-dashboard').waitFor();
  await expect(page.locator('.gsd-streak')).toContainText(/\d+ weeks?/);
  await expect(page.locator('.gsd-streak')).not.toContainText(/keep it going/i);
});

test('the Preferences switch turns it off and on straight away, and the daily switch turns on streaks too', async ({ page }) => {
  const id = await seed(page, { prefs: { show: true, daily: true } });
  await openStats(page, id);
  await expect(page.locator('.goal-tracker-panel')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('cs:openPreferences')));
  await page.getByRole('button', { name: /Stitch Tracker/ }).first().click();
  const sw = page.getByRole('switch', { name: /Show streaks and goals/ });
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await sw.click();
  await expect.poll(() => stored(page, 'showStreaksAndGoals')).toBe(false);
  await expect(page.getByRole('switch', { name: /daily streak/ })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('switch', { name: /daily streak/ }).click();                  // turning the daily streak on turns streaks on
  await expect.poll(() => stored(page, 'showStreaksAndGoals')).toBe(true);
  expect(await stored(page, 'showDailyStreak')).toBe(true);
});

test('a goal reached says so only when goals are shown', async ({ page }) => {
  for (const show of [false, true]) {
    const id = await seed(page, { prefs: { show, daily: false }, goal: 3 });
    await openTracker(page, id);
    for (let i = 0; i < 6; i++) { const p = await trackerCellPoint(page, 10 + (i % 5), 10 + Math.floor(i / 5)); await page.mouse.click(p.x, p.y); await page.waitForTimeout(160); }
    await page.waitForTimeout(600);
    if (show) await expect(page.locator('.milestone-celebration')).toContainText(/goal reached/i);
    else await expect(page.locator('.milestone-celebration')).toHaveCount(0);
  }
});
