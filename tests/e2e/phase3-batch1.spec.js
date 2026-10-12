/* Edit, delete and merge sessions (tracking audit STATS-06), in the project Stats journal. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const done = new Array(W * H).fill(0); for (let i = 0; i < 290; i++) done[i] = 1;
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const mk = (id, o, hh, n, m, at) => ({ id, date: day(o), startTime: day(o) + 'T' + hh + ':00:00', endTime: day(o) + 'T' + hh + ':30:00', durationSeconds: m * 60, durationMinutes: m,
      stitchesCompleted: n, stitchesUndone: 0, netStitches: n, units: n, unitsCompleted: n, unitsUndone: 0, totalAtEnd: at, percentAtEnd: Math.round(at / 4) / 10, note: '', coloursWorked: ['310'] });
    const statsSessions = [mk('s_a', -5, '10', 100, 40, 100), mk('s_b', -3, '10', 140, 45, 240), mk('s_c', -1, '09', 30, 15, 270), mk('s_d', -1, '18', 20, 10, 290)];
    const id = await ProjectStorage.save({ id: 'proj_p3', name: 'Phase3', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, statsSessions,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
async function openStats(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__openTrackerStats());
  await page.locator('.session-timeline').waitFor();
}
const saved = (page) => page.evaluate(async () => { const p = await ProjectStorage.get('proj_p3'); return { sessions: p.statsSessions, deleted: p.deletedSessionIds || [] }; });
const entry = (page, text) => page.locator('.timeline-entry').filter({ hasText: text });

test('deleting a session lowers the totals, survives a reload, and Undo brings it back exactly', async ({ page }) => {
  const id = await seed(page);
  const original = (await saved(page)).sessions;
  await openStats(page, id);
  await expect(page.locator('.timeline-entry')).toHaveCount(4);
  await entry(page, '140 stitches').getByRole('button', { name: 'Delete session' }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(3);
  await expect(page.getByText('Session deleted')).toBeVisible();
  await expect.poll(async () => (await saved(page)).sessions.length, { timeout: 15000 }).toBe(3);
  let s = await saved(page);
  expect(s.deleted).toEqual(['s_b']);
  expect(s.sessions.find(x => x.id === 's_c').totalAtEnd).toBe(270 - 140);          // later totals fall with it
  // Home and global Stats read the summary row, which the same save rewrites: one stitching day fewer, 140 fewer stitches
  const row = await page.evaluate(async () => { const l = await ProjectStorage.listProjects(); const r = l.find(x => x.id === 'proj_p3'); return { days: r.activeDaysTotal }; });
  expect(row).toEqual({ days: 2 });
  // still gone after a reload
  await openStats(page, id);
  await expect(page.locator('.timeline-entry')).toHaveCount(3);
  // Undo (the toast is gone after a reload, so delete again and undo straight away)
  await entry(page, '100 stitches').getByRole('button', { name: 'Delete session' }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(3);
  await expect.poll(async () => (await saved(page)).sessions.length, { timeout: 15000 }).toBe(3);
  s = await saved(page);
  expect(s.deleted).toEqual(['s_b']);
  expect(original.filter(x => x.id !== 's_b').map(x => x.id)).toEqual(s.sessions.map(x => x.id));
});

test('editing a session changes its figures, is marked edited, and is saved', async ({ page }) => {
  const id = await seed(page);
  await openStats(page, id);
  await entry(page, '140 stitches').getByRole('button', { name: 'Edit session' }).click();
  await page.getByLabel('Minutes').fill('20');
  await page.getByLabel('Stitches').fill('120');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(entry(page, '120 stitches')).toContainText('edited');
  await expect(entry(page, '120 stitches')).toContainText('Active time 20m');
  await expect.poll(async () => { const x = (await saved(page)).sessions.find(q => q.id === 's_b'); return x && x.editedAt ? x.durationSeconds : null; }, { timeout: 15000 }).toBe(1200);
  const s = await saved(page);
  expect(s.sessions.find(q => q.id === 's_b').timingBasis).toBe('edited');
  expect(s.sessions.find(q => q.id === 's_c').totalAtEnd).toBe(270 - 20);
});

test('a bad value is refused with a message and nothing changes', async ({ page }) => {
  const id = await seed(page);
  await openStats(page, id);
  await entry(page, '140 stitches').getByRole('button', { name: 'Edit session' }).click();
  await page.getByLabel('Minutes').fill('-4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/minutes/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(4);
});

test('two sessions on one day can be merged, and Undo splits them again', async ({ page }) => {
  const id = await seed(page);
  await openStats(page, id);
  await expect(entry(page, '30 stitches').getByRole('button', { name: 'Merge with next' })).toBeVisible();
  await expect(entry(page, '140 stitches').getByRole('button', { name: 'Merge with next' })).toHaveCount(0);   // next one is another day
  await entry(page, '30 stitches').getByRole('button', { name: 'Merge with next' }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(3);
  await expect(entry(page, '50 stitches')).toContainText('Active time 25m');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.timeline-entry')).toHaveCount(4);
});
