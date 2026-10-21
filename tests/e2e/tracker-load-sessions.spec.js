const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');
test.use({ timezoneId: 'UTC' });

// F-011: the Tracker rebuilds a project's session list as it loads (legacy total-time migration, durationSeconds and
// totalAtEnd patching, recovery of a session backed up in localStorage). These run the real pages and scripts: seed a
// project, open it in stitch.html, flush the Tracker's own save and read back what it stored.

test.beforeEach(async ({ context, page }) => {
  page.on('pageerror', e => console.error('Tracker page error:', e.message));
  await installLocalCdn(context);
  await page.addInitScript(() => {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    localStorage.setItem('cs_pref_trackerResumeRecap', 'false');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
});

const seed = (page, extra) => page.evaluate(async (extra) => {
  const cell = { id: '310', type: 'solid', rgb: [0, 0, 0] };
  const pattern = Array.from({ length: 120 }, (_, i) => (i === 14 || i === 15 ? { id: '__skip__' } : i % 3 ? cell : { id: '310+550', type: 'blend' }));
  await ProjectStorage.save(Object.assign({ settings: { sW: 12, sH: 10, fabricCt: 14 }, pattern, done: Array(120).fill(0), savedZoom: 2 }, extra));
}, extra);

const open = async (page, id) => {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForFunction(() => typeof window.__flushProjectToIDB === 'function');
};
const saved = (page, id) => page.evaluate(async (id) => { await window.__flushProjectToIDB(); return ProjectStorage.get(id); }, id);

test('a project that only has total time gets one migrated session, and marking and undo still work', async ({ page }) => {
  const done = Array(120).fill(0); done[0] = done[1] = done[2] = 1;
  await seed(page, { id: 'proj_legacy', name: 'Legacy', totalTime: 5400, createdAt: '2025-12-24T12:00:00.000Z', done, statsSessions: [] });
  await open(page, 'proj_legacy');
  const p = await saved(page, 'proj_legacy');
  expect(p.statsSessions).toHaveLength(1);
  expect(p.statsSessions[0]).toMatchObject({
    id: 'sess_legacy', date: '2025-12-24', startTime: '2025-12-24T12:00:00.000Z',
    durationSeconds: 5400, durationMinutes: 90, stitchesCompleted: 3, totalAtEnd: 3, note: 'Migrated from legacy total time',
  });
  expect(p.done.filter(Boolean)).toHaveLength(3);
  const at = await trackerCellPoint(page, 4, 4);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await saved(page, 'proj_legacy')).done.filter(Boolean).length).toBe(4);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await saved(page, 'proj_legacy')).done.filter(Boolean).length).toBe(3);
});

test('sessions saved without totalAtEnd or durationSeconds are completed on load and survive a reopen', async ({ page }) => {
  const s = (id, day, net, extra) => Object.assign({ id, date: '2026-03-0' + day, startTime: '2026-03-0' + day + 'T09:00:00.000Z', endTime: '2026-03-0' + day + 'T10:00:00.000Z', netStitches: net, stitchesCompleted: Math.max(net, 0), stitchesUndone: 0, coloursWorked: [] }, extra || {});
  await seed(page, { id: 'proj_prev9', name: 'Pre-v9', statsSessions: [s('s2', 2, 7, { durationMinutes: 30 }), s('s1', 1, 5, { durationSeconds: 600 })] });
  await open(page, 'proj_prev9');
  const sessions = (await saved(page, 'proj_prev9')).statsSessions;
  const by = Object.fromEntries(sessions.map(x => [x.id, x]));
  expect(by.s1.totalAtEnd).toBe(5);
  expect(by.s2.totalAtEnd).toBe(12);
  expect(by.s2.durationSeconds).toBe(1800);
  expect(by.s1.durationSeconds).toBe(600);
  await page.reload();
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForFunction(() => typeof window.__flushProjectToIDB === 'function');
  const again = (await saved(page, 'proj_prev9')).statsSessions;
  expect(again.map(x => [x.id, x.totalAtEnd, x.durationSeconds])).toEqual(sessions.map(x => [x.id, x.totalAtEnd, x.durationSeconds]));
});

test('a session backed up in localStorage before the tab closed is recovered and saved', async ({ page }) => {
  const kept = { id: 'sess_kept', date: '2026-03-01', startTime: '2026-03-01T09:00:00.000Z', endTime: '2026-03-01T10:00:00.000Z', durationSeconds: 3600, netStitches: 4, totalAtEnd: 4, stitchesCompleted: 4, stitchesUndone: 0 };
  const lost = Object.assign({}, kept, { id: 'sess_lost', date: '2026-03-02', startTime: '2026-03-02T09:00:00.000Z', endTime: '2026-03-02T09:30:00.000Z', durationSeconds: 1800, netStitches: 2, totalAtEnd: 6, stitchesCompleted: 2 });
  await seed(page, { id: 'proj_pend', name: 'Pending', statsSessions: [kept] });
  await page.evaluate((lost) => localStorage.setItem('cs_pending_session_proj_pend', JSON.stringify([lost])), lost);
  await open(page, 'proj_pend');
  const p = await saved(page, 'proj_pend');
  expect(p.statsSessions.map(x => x.id)).toEqual(['sess_kept', 'sess_lost']);
});

test('an unreadable backup does not stop the project opening', async ({ page }) => {
  await seed(page, { id: 'proj_bad', name: 'Bad backup', statsSessions: [] });
  await page.evaluate(() => localStorage.setItem('cs_pending_session_proj_bad', '{not json'));
  await open(page, 'proj_bad');
  expect((await saved(page, 'proj_bad')).statsSessions).toEqual([]);
});
