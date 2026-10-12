/* Phase 2 end of phase: the figure-consistency matrix. For each fixture, every place a figure appears yields the
   same value: the Tracker strip, header chip, Progress info, project Stats, the share text, the project row Home and
   the library read, and the global dashboard. Then the clock changing (25 October 2026, the clocks go back) and a
   project that has only the old `totalTime` and no sessions. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.use({ timezoneId: 'Europe/London' });
test.beforeEach(async ({ context }) => { await installLocalCdn(context); await context.grantPermissions(['clipboard-read', 'clipboard-write']); });

async function init(page) {
  await page.addInitScript(() => { try {
    const Real = Date; window.__off = 0;
    window.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + window.__off); else super(...a); }
      static now() { return Real.now() + window.__off; }
    };
    window.__setClock = (y, mo, d, h, mi, s) => { window.__off = new Real(y, mo, d, h, mi, s).getTime() - Real.now(); };
    window.__setClockUTC = (ms) => { window.__off = ms - Real.now(); };
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerIdleMinutes', JSON.stringify(0.05));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
}
async function openTracker(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 3000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(600);
}
const popoverText = async (page) => {
  await page.getByRole('button', { name: /Progress info/ }).click();
  const t = await page.locator('.app-info-popover').innerText();
  await page.keyboard.press('Escape');
  return t;
};
const shareText = async (page) => {
  await page.evaluate(() => window.__openTrackerStats());
  await page.getByRole('button', { name: /Copy progress summary/ }).click();
  return page.evaluate(() => navigator.clipboard.readText());
};

// 1,742 full + 30 half sides (15 units) + 2 knots = 1,759 units.
async function saveUnitsProject(page, id, { fullDone, halfDone, knotsDone }) {
  await page.evaluate(async ({ id, fullDone, halfDone, knotsDone }) => {
    const W = 40, H = 44;
    const pattern = Array.from({ length: W * H }, (_, i) => (i >= 1742 ? { id: '__skip__' } : { id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const done = new Array(W * H).fill(0); for (let i = 0; i < fullDone; i++) done[i] = 1;
    const side = { id: '310', rgb: [0, 0, 0], type: 'solid' };
    const halfStitches = Array.from({ length: 15 }, (_, i) => [100 + i, { fwd: side, bck: side }]);
    const hd = []; let sides = halfDone; for (let i = 0; i < 15 && sides > 0; i++) { const both = sides >= 2; hd.push([100 + i, both ? { fwd: true, bck: true } : { fwd: true }]); sides -= both ? 2 : 1; }
    const knots = [{ x: 0, y: 0, id: '310', rgb: [0, 0, 0] }, { x: 2, y: 2, id: '310', rgb: [0, 0, 0] }];
    await ProjectStorage.save({ id, name: 'Matrix', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, halfStitches, halfDone: hd, knots, knotsDone: knots.slice(0, knotsDone).map(k => k.x + ',' + k.y),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 1742, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
  }, { id, fullDone, halfDone, knotsDone });
  return id;
}

async function checkFigures(page, id, f) {
  // Home / library row
  const row = await page.evaluate(async (id) => { const r = (await ProjectStorage.listProjects()).find(p => p.id === id); return { done: r.completedStitches, total: r.totalStitches, pct: r.pct }; }, id);
  expect(row).toEqual({ done: f.done, total: 1759, pct: f.pct });
  await openTracker(page, id);
  // strip and header chip
  await expect(page.locator('.info-strip-counts')).toHaveText(`${f.done} done · ${(1759 - f.done).toLocaleString('en-GB')} to go`);
  await expect(page.locator('.info-strip-pct')).toHaveText(f.pct.toFixed(1) + '%');
  // Progress info
  expect(await popoverText(page)).toContain(`${f.done} / 1,759 (${f.pct.toFixed(1)}%)`);
  // project Stats and its share text
  const text = await shareText(page);
  expect(text).toContain(`[x] ${f.done} / 1,759 stitches (${f.pct.toFixed(1)}%)`);
  await expect(page.locator('.stats-big-number').first()).toHaveText(String(f.done));
  await expect(page.getByText('of 1,759 stitches')).toBeVisible();
  // global dashboard
  await page.goto('/create.html?mode=stats');
  await expect(page.getByText(`${(1759 - f.done).toLocaleString('en-GB')} left`).first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(new RegExp('^' + Math.round(f.pct) + '%$')).filter({ visible: true }).first()).toBeVisible();
}

test('matrix: 2 full, 2 half sides and 1 knot done reads 4 / 1,759 (0.2%) everywhere', async ({ page }) => {
  await init(page);
  const id = await saveUnitsProject(page, 'proj_m1', { fullDone: 2, halfDone: 2, knotsDone: 1 });
  await checkFigures(page, id, { done: 4, pct: 0.2 });
});

test('matrix: only half stitches done (3 sides = 1.5 units) reads 2 / 1,759 (0.1%) everywhere', async ({ page }) => {
  await init(page);
  const id = await saveUnitsProject(page, 'proj_m2', { fullDone: 0, halfDone: 3, knotsDone: 0 });
  await checkFigures(page, id, { done: 2, pct: 0.1 });
});

// The audit's history project, dated from the real clock: 10 stitching days in the last 25, 250 of 400 left.
const HISTORY = [[-24, 100], [-22, 120], [-19, 90], [-17, 200], [-14, 150], [-11, 80], [-8, 110], [-5, 60], [-2, 300], [0, 140]];
test('matrix: the history project reads one estimate, one pace and one week everywhere', async ({ page }) => {
  await init(page);
  const exp = await page.evaluate(async (hist) => {
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    let running = 0;
    const statsSessions = hist.map(([o, n]) => { running += n; return { id: 's' + o, date: day(o), startTime: day(o) + 'T10:00:00.000Z', endTime: day(o) + 'T11:00:00.000Z', durationSeconds: 3600, durationMinutes: 60,
      stitchesCompleted: n, stitchesUndone: 0, netStitches: n, units: n, unitsCompleted: n, unitsUndone: 0, totalAtEnd: running, percentAtEnd: 0, note: '', coloursWorked: ['310'] }; });
    const W = 40, H = 40;                                           // 1,600 stitches, 1,350 done
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const done = new Array(W * H).fill(0); for (let i = 0; i < 1350; i++) done[i] = 1;
    await ProjectStorage.save({ id: 'proj_m3', name: 'MatrixH', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, statsSessions,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 1600, symbol: 'A' }] });
    ProjectStorage.setActiveProject('proj_m3');
    // this week (Monday to today) from the sessions, the way the Stats pages define it
    const now = new Date(); const dow = now.getDay() === 0 ? 6 : now.getDay() - 1; const mon = new Date(now); mon.setDate(now.getDate() - dow);
    const monStr = mon.getFullYear() + '-' + String(mon.getMonth() + 1).padStart(2, '0') + '-' + String(mon.getDate()).padStart(2, '0');
    return { week: statsSessions.filter(s => s.date >= monStr).reduce((a, s) => a + s.unitsCompleted, 0), todayAdded: statsSessions.filter(s => s.date === day(0)).reduce((a, s) => a + s.unitsCompleted, 0) };
  }, HISTORY);
  await openTracker(page, 'proj_m3');
  const strip = await page.locator('.completion-projection-bar').innerText();
  const pop = await popoverText(page);
  const share = await shareText(page);
  const stats = await page.locator('.stats-estimate').innerText();
  const finish = strip.match(/around ([^)]+)\)/)[1];
  // the same finish date, the same words and the same basis in every place
  expect(pop).toContain('about 5 days');
  expect(share).toContain('Est. finish: about 5 days (around ' + finish + ')');
  expect(stats.replace(/\s+/g, ' ')).toContain(finish.replace(/,? 20\d\d$/, ''));
  for (const t of [strip, pop, share, stats]) expect(t).toMatch(/Based on your last 2\d days: 2\.\d stitching days a week, 135 stitches per stitching day/);
  // the same week and the same Today in Progress info and on the global dashboard
  expect(pop).toMatch(new RegExp('This week\\s*' + exp.week.toLocaleString('en-GB')));
  expect(pop).toMatch(new RegExp('Today\\s*' + exp.todayAdded));
  await page.goto('/create.html?mode=stats');
  await expect(page.getByText(/Your pace: 135 stitches per stitching day/)).toBeVisible({ timeout: 20000 });
  const global = await page.locator('body').innerText();
  expect(global).toContain(exp.week.toLocaleString('en-GB'));
  expect(global).toMatch(/Your pace: 135 stitches per stitching day/);
});

// ── the clocks going back (25 October 2026: 02:00 BST becomes 01:00 GMT, so 01:30 happens twice) ──
async function saveSimple(page, id) {
  await page.evaluate(async (id) => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    await ProjectStorage.save({ id, name: 'Dst', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
  }, id);
}
const { trackerCellPoint } = require('./touch-helpers');
const mark = async (page, gx, gy) => { const p = await trackerCellPoint(page, gx, gy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
const sessionsOf = (page, id) => page.evaluate(async (id) => { await window.__flushProjectToIDB(); return ((await ProjectStorage.get(id)).statsSessions || []).map(s => ({ date: s.date, added: s.unitsCompleted - (s.catchUp || 0) })); }, id);

test('clock change: with the day ending at midnight, 23:58 on the 24th and 00:01 on the 25th (the 25-hour day) are two days', async ({ page }) => {
  await init(page);
  await saveSimple(page, 'proj_dst1');
  await openTracker(page, 'proj_dst1');
  await page.evaluate(() => window.__setClockUTC(Date.UTC(2026, 9, 24, 22, 58, 30)));      // 23:58:30 BST on the 24th
  for (const gx of [1, 2, 3]) await mark(page, gx, 1);
  await page.evaluate(() => window.__setClockUTC(Date.UTC(2026, 9, 24, 23, 1, 0)));        // 00:01 BST on the 25th
  for (const gx of [4, 5]) await mark(page, gx, 1);
  await expect.poll(async () => (await sessionsOf(page, 'proj_dst1')).length, { timeout: 20000 }).toBe(2);
  expect((await sessionsOf(page, 'proj_dst1')).map(s => [s.date, s.added])).toEqual([['2026-10-24', 3], ['2026-10-25', 2]]);
});

test('clock change: with the day ending at 2:00 AM, both 01:30s (BST, then GMT) belong to the 24th', async ({ page }) => {
  await init(page);
  await page.evaluate(() => localStorage.setItem('cs_pref_statsDayEndHour', JSON.stringify(2)));
  await saveSimple(page, 'proj_dst2');
  await openTracker(page, 'proj_dst2');
  await page.evaluate(() => window.__setClockUTC(Date.UTC(2026, 9, 25, 0, 30, 0)));         // 01:30 BST
  for (const gx of [1, 2, 3]) await mark(page, gx, 1);
  await page.evaluate(() => window.__setClockUTC(Date.UTC(2026, 9, 25, 1, 30, 0)));         // 01:30 GMT, an hour later by the wall clock's own count
  for (const gx of [4, 5]) await mark(page, gx, 1);
  await expect.poll(async () => (await sessionsOf(page, 'proj_dst2')).length, { timeout: 20000 }).toBe(1);
  expect((await sessionsOf(page, 'proj_dst2')).map(s => [s.date, s.added])).toEqual([['2026-10-24', 5]]);
});

// ── a project from before sessions were recorded: it has only `totalTime` (seconds) and no `statsSessions` ──
test('legacy project with only totalTime: Home, global Stats and the Tracker show sensible figures', async ({ page }) => {
  await init(page);
  await page.evaluate(async () => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    const done = new Array(W * H).fill(0); for (let i = 0; i < 100; i++) done[i] = 1;
    await ProjectStorage.save({ id: 'proj_legacy', name: 'Legacy', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, totalTime: 7200,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject('proj_legacy');
  });
  const bad = /NaN|undefined|Infinity|\[object/;
  // Home: the project is listed with its progress and nothing broken
  await page.goto('/home.html');
  await expect(page.getByText('Legacy').first()).toBeVisible({ timeout: 15000 });
  expect(await page.locator('body').innerText()).not.toMatch(bad);
  await page.goto('/home.html?tab=stats');
  await page.waitForTimeout(1500);
  expect(await page.locator('body').innerText()).not.toMatch(bad);
  // global dashboard: listed, progress right, no broken numbers, no invented estimate
  await page.goto('/create.html?mode=stats');
  await expect(page.getByText('300 left').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('25%').filter({ visible: true }).first()).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(bad);
  // Tracker: strip, Progress info (the old time is kept) and Stats
  await openTracker(page, 'proj_legacy');
  await expect(page.locator('.info-strip-counts')).toHaveText('100 done · 300 to go');
  const pop = await popoverText(page);
  expect(pop).toContain('100 / 400 (25.0%)');
  // the old time was never measured, so it is labelled as an estimate (Phase 3)
  expect(pop).toMatch(/Time spent \(estimated\)\s*2 hrs 0 min/);
  expect(pop).toMatch(/Speed \(estimated\)\s*50 st\/hr/);
  expect(pop).not.toMatch(bad);
  await expect(page.locator('.completion-projection-bar')).toContainText('Not enough history yet');
});

// What Home and the Manager actually display, where the old full-stitches-only count and the shared definition
// disagree: 100 full stitches (none done) and 100 half-stitch cells (both sides done) is 100 of 200 units, 50%; the
// old count read 0 of 100, 0%.
test('Home card, project row and header chip show 50% when only half stitches are done (and so does the Manager)', async ({ page }) => {
  await init(page);
  await page.evaluate(async () => {
    const W = 20, H = 10;
    const pattern = Array.from({ length: W * H }, (_, i) => (i < 100 ? { id: '310', type: 'solid', rgb: [0, 0, 0] } : { id: '__skip__' }));
    const side = { id: '310', rgb: [0, 0, 0], type: 'solid' };
    const halfStitches = Array.from({ length: 100 }, (_, i) => [100 + i, { fwd: side, bck: side }]);
    const halfDone = Array.from({ length: 100 }, (_, i) => [100 + i, { fwd: true, bck: true }]);
    await ProjectStorage.save({ id: 'proj_m5', name: 'HalvesOnly', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), halfStitches, halfDone,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 100, symbol: 'A' }] });
    ProjectStorage.setActiveProject('proj_m5');
  });
  await page.goto('/home.html');
  await expect(page.getByText('20×10 · Updated just now · 50% complete')).toBeVisible({ timeout: 15000 });   // the active project's card
  await expect(page.getByText('50%', { exact: true }).filter({ visible: true }).first()).toBeVisible();     // the project row and the header chip
  await page.goto('/manager.html?from=home');
  await expect(page.getByText('50%', { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15000 });
});
