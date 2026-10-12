/* Phase 3 end-of-phase hunt: history edits at the edges (first, last, all sessions; a run across midnight; two tabs;
   a project saved before the new fields), and that Home and the global Stats follow. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, { legacy = false, split = false } = {}) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_showStreaksAndGoals', 'true');
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async ({ legacy, split }) => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const mk = (id, o, hh, n, m, at, extra) => {
      const s = { id, date: day(o), startTime: day(o) + 'T' + hh + ':00:00', endTime: day(o) + 'T' + hh + ':30:00', durationSeconds: m * 60, durationMinutes: m,
        stitchesCompleted: n, stitchesUndone: 0, netStitches: n, totalAtEnd: at, percentAtEnd: Math.round(at / 4) / 10, note: '', coloursWorked: ['310'] };
      if (!legacy) Object.assign(s, { units: n, unitsCompleted: n, unitsUndone: 0 });
      return Object.assign(s, extra || {});
    };
    const statsSessions = split
      ? [mk('r_a', -3, '23', 30, 20, 30, { groupId: 'r' }), mk('r_b', -2, '00', 20, 15, 50, { groupId: 'r' }), mk('s_z', -1, '10', 40, 30, 90)]
      : [mk('s_a', -5, '10', 100, 40, 100), mk('s_b', -3, '10', 140, 45, 240), mk('s_c', -1, '09', 30, 15, 270)];
    const total = statsSessions[statsSessions.length - 1].totalAtEnd;
    const done = new Array(W * H).fill(0); for (let i = 0; i < total; i++) done[i] = 1;
    const id = await ProjectStorage.save({ id: 'proj_hunt', name: 'Hunt', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, statsSessions,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  }, { legacy, split });
}
async function openStats(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__openTrackerStats());
  await page.locator('.stats-dashboard').waitFor();
}
const saved = (page) => page.evaluate(async () => { const p = await ProjectStorage.get('proj_hunt'); return { sessions: p.statsSessions || [], deleted: p.deletedSessionIds || [] }; });
const row = (page) => page.evaluate(async () => { const r = (await ProjectStorage.listProjects()).find(x => x.id === 'proj_hunt'); return { days: r.activeDaysTotal, sessions: r.sessionCount, done: r.completedStitches }; });
function watchErrors(page) { const errs = []; page.on('pageerror', e => errs.push(String(e))); return errs; }
async function cleanText(page, where) {
  const t = await page.locator('body').innerText();
  expect(t, where + ' shows NaN/undefined/Infinity').not.toMatch(/\bNaN\b|undefined|Infinity/);
}
const entries = (page) => page.locator('.timeline-entry');

test('deleting the first, then the last, then every session leaves honest empty pages everywhere', async ({ page }) => {
  const errs = watchErrors(page);
  const id = await seed(page);
  await openStats(page, id);
  await expect(entries(page)).toHaveCount(3);
  await entries(page).filter({ hasText: '100 stitches' }).getByRole('button', { name: 'Delete session' }).click();       // the first
  await expect(entries(page)).toHaveCount(2);
  await cleanText(page, 'after deleting the first');
  await entries(page).filter({ hasText: '30 stitches' }).getByRole('button', { name: 'Delete session' }).click();        // the last
  await expect(entries(page)).toHaveCount(1);
  await cleanText(page, 'after deleting the last');
  await entries(page).filter({ hasText: '140 stitches' }).getByRole('button', { name: 'Delete session' }).click();       // all
  await expect(entries(page)).toHaveCount(0);
  await expect(page.getByText('No sessions recorded yet')).toBeVisible();
  await cleanText(page, 'the empty project Stats');
  await expect.poll(async () => (await saved(page)).sessions.length, { timeout: 15000 }).toBe(0);
  expect((await saved(page)).deleted.sort()).toEqual(['s_a', 's_b', 's_c']);
  expect(await row(page)).toMatchObject({ days: 0, sessions: 0 });
  // the stitches themselves are untouched: deleting the journal does not unmark anything
  expect((await row(page)).done).toBe(270);
  // the other pages, reached after the edits, agree and do not break on a project with no history
  await page.goto('/create.html?mode=stats');
  await page.locator('.stats-dashboard').waitFor();
  await page.waitForTimeout(500);
  await cleanText(page, 'global Stats');
  await page.goto('/home.html?tab=stats');
  await page.waitForTimeout(800);
  await cleanText(page, 'Home Stats');
  await page.goto('/home.html');
  await page.waitForTimeout(800);
  await cleanText(page, 'Home');
  await expect(page.locator('body')).toContainText('Hunt');
  await openStats(page, id);
  await expect(page.getByText('No sessions recorded yet')).toBeVisible();
  expect(errs).toEqual([]);
});

test('a run across midnight is two records of one run: deleting one removes both, and Undo brings both back', async ({ page }) => {
  const errs = watchErrors(page);
  const id = await seed(page, { split: true });
  await openStats(page, id);
  await expect(entries(page)).toHaveCount(3);
  await entries(page).filter({ hasText: '30 stitches' }).getByRole('button', { name: 'Delete session' }).click();
  await expect(entries(page)).toHaveCount(1);
  await expect.poll(async () => (await saved(page)).sessions.length, { timeout: 15000 }).toBe(1);
  expect((await saved(page)).deleted.sort()).toEqual(['r_a', 'r_b']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(entries(page)).toHaveCount(3);
  await expect.poll(async () => (await saved(page)).sessions.length, { timeout: 15000 }).toBe(3);
  expect((await saved(page)).deleted).toEqual([]);
  expect(errs).toEqual([]);
});

test('a project saved before the new fields can be read, edited, deleted and shows its times as estimated', async ({ page }) => {
  const errs = watchErrors(page);
  const id = await seed(page, { legacy: true });
  await openStats(page, id);
  await cleanText(page, 'a legacy project');
  await expect(entries(page)).toHaveCount(3);
  await entries(page).filter({ hasText: '140 stitches' }).getByRole('button', { name: 'Edit session' }).click();
  await page.getByLabel('Stitches', { exact: true }).fill('120');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(entries(page).filter({ hasText: '120 stitches' })).toContainText('edited');
  await entries(page).filter({ hasText: '100 stitches' }).getByRole('button', { name: 'Delete session' }).click();
  await expect(entries(page)).toHaveCount(2);
  await expect.poll(async () => (await saved(page)).sessions.length, { timeout: 15000 }).toBe(2);
  const s = (await saved(page)).sessions;
  expect(s.find(x => x.id === 's_b')).toMatchObject({ edited: true, units: 120 });
  expect(s.find(x => x.id === 's_c').totalAtEnd).toBe(270 - 100 - 20);
  expect(errs).toEqual([]);
});

test('two tabs deleting different sessions: both stay deleted and neither tab brings the other back', async ({ page, context }) => {
  const errs = watchErrors(page);
  const id = await seed(page);
  await openStats(page, id);
  const other = await context.newPage();
  await other.addInitScript(() => { try { localStorage.setItem('cs_first_run_done', '1'); } catch (_) {} });
  await openStats(other, id);
  await entries(page).filter({ hasText: '100 stitches' }).getByRole('button', { name: 'Delete session' }).click();
  await expect.poll(async () => (await saved(page)).deleted.length, { timeout: 15000 }).toBe(1);
  await entries(other).filter({ hasText: '30 stitches' }).getByRole('button', { name: 'Delete session' }).click();
  // whatever order the two saves landed in, a delete that was made must not be undone by the other tab's stale copy
  await expect.poll(async () => { const s = await saved(page); return JSON.stringify([s.deleted.slice().sort(), s.sessions.map(x => x.id)]); }, { timeout: 30000 })
    .toBe(JSON.stringify([['s_a', 's_c'], ['s_b']]));
  expect(errs).toEqual([]);
});

test('editing one day of a run that crossed midnight changes that day only, and the later totals follow', async ({ page }) => {
  const errs = watchErrors(page);
  const id = await seed(page, { split: true });
  await openStats(page, id);
  await entries(page).filter({ hasText: '30 stitches' }).getByRole('button', { name: 'Edit session' }).click();
  await page.getByLabel('Stitches', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(entries(page).filter({ hasText: '25 stitches' })).toContainText('edited');
  await expect.poll(async () => (await saved(page)).sessions.find(x => x.id === 'r_a').unitsCompleted, { timeout: 15000 }).toBe(25);
  const s = (await saved(page)).sessions;
  expect(s.find(x => x.id === 'r_b')).toMatchObject({ unitsCompleted: 20, groupId: 'r' });
  expect(s.find(x => x.id === 'r_a').groupId).toBe('r');
  expect(s.find(x => x.id === 'r_b').totalAtEnd).toBe(50 - 5);
  expect(s.find(x => x.id === 's_z').totalAtEnd).toBe(90 - 5);
  await cleanText(page, 'after editing one day of a split run');
  expect(errs).toEqual([]);
});

test('two tabs: an Undo in the tab that deleted is picked up by the other tab, and is not deleted again by its next save', async ({ page, context }) => {
  const errs = watchErrors(page);
  const id = await seed(page);
  await openStats(page, id);
  const other = await context.newPage();
  await other.addInitScript(() => { try { localStorage.setItem('cs_first_run_done', '1'); } catch (_) {} });
  await openStats(other, id);
  await entries(page).filter({ hasText: '100 stitches' }).getByRole('button', { name: 'Delete session' }).click();
  await expect.poll(async () => (await saved(page)).deleted.length, { timeout: 15000 }).toBe(1);
  await expect(entries(other)).toHaveCount(2, { timeout: 20000 });          // the other tab absorbed the deletion
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await saved(page)).deleted.length, { timeout: 15000 }).toBe(0);
  await expect(entries(other)).toHaveCount(3, { timeout: 20000 });          // and the Undo
  // the other tab saves something of its own: the deletion must not come back
  await entries(other).filter({ hasText: '30 stitches' }).getByRole('button', { name: 'Add note' }).click();
  await other.getByRole('textbox').last().fill('a note');
  await other.getByRole('button', { name: /^Save/ }).last().click().catch(() => {});
  await other.evaluate(() => window.__flushProjectToIDB());
  await expect.poll(async () => { const s = await saved(page); return JSON.stringify([s.deleted, s.sessions.length]); }, { timeout: 30000 }).toBe(JSON.stringify([[], 3]));
  expect(errs).toEqual([]);
});
