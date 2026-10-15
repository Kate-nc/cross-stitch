/* Phase 2, batch 1: the Activity tab opens, Fit contains both axes, the daily snapshot is saved,
   and the Home page offers the backup reminder (tracking audit BUG-01, BUG-04, daily snapshot, TRACK-03). */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loadTrackerFixture, trackerDoneCount, trackerCellPoint, TRACKER_CANVAS } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test('the Activity tab opens and draws, with no page error', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async () => {
    const today = new Date();
    const day = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const sessions = [3, 2, 1].map((n, i) => ({ id: 'sess_' + i, date: day(n), startTime: day(n) + 'T19:00:00.000Z', endTime: day(n) + 'T20:00:00.000Z', durationSeconds: 3600, durationMinutes: 60, stitchesCompleted: 40, stitchesUndone: 0, netStitches: 40, totalAtEnd: 40 * (i + 1), coloursWorked: [] }));
    const pattern = Array.from({ length: 100 }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    await ProjectStorage.save({ id: 'proj_act', name: 'Activity', settings: { sW: 10, sH: 10 }, pattern, done: new Array(100).fill(0).map((_, i) => (i < 120 ? 1 : 0)), statsSessions: sessions });
    ProjectStorage.setActiveProject('proj_act');
  });
  await page.goto('/index.html?mode=stats');
  await page.getByRole('button', { name: /Activity/ }).click();
  await expect(page.getByText('Avg. per Session')).toBeVisible({ timeout: 15000 });
  expect(errors.filter(m => /already been declared/.test(m))).toEqual([]);
});

test('Fit puts a tall pattern wholly in the box (it used to look at the width alone)', async ({ page }) => {
  // 40 wide, 160 tall: a width-only fit leaves most of it below the fold.
  await loadTrackerFixture(page);
  await page.evaluate(async () => {
    const id = localStorage.getItem('crossstitch_active_project');
    const p = await ProjectStorage.get(id);
    const W = 40, H = 160;
    p.settings.sW = W; p.settings.sH = H;
    p.pattern = Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' }));
    p.done = new Array(W * H).fill(0); delete p.lastWriteAt; p.id = id;
    await ProjectStorage.save(p);
  });
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  const recap = page.locator('.resume-recap-overlay');
  if (await recap.count()) { await recap.getByRole('button', { name: /continue/i }).click(); }
  await page.keyboard.press('0');
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => { const e = document.querySelector('.tracker-chart-scroll'); return { sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }; });
  expect(m.sh).toBeLessThanOrEqual(m.ch + 2);
  expect(m.sw).toBeLessThanOrEqual(m.cw + 2);
});

test('a new stitching day saves a daily snapshot of the marks, with the pattern size', async ({ page }) => {
  // Move the page's clock forward a day on demand.
  await page.addInitScript(() => {
    const Real = Date; window.__off = 0;
    window.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + window.__off); else super(...a); }
      static now() { return Real.now() + window.__off; }
    };
  });
  await loadTrackerFixture(page);
  const mark = async (gx, gy) => { const p = await trackerCellPoint(page, gx, gy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
  await page.evaluate(() => UserPrefs.set('trackerAutomaticSnapshots', true));
  await mark(3, 3);                                         // day one: the snapshot date is noted
  await page.evaluate(() => { window.__off = 36 * 3600 * 1000; });   // the next stitching day
  await mark(4, 3);                                         // first mark of day two: yesterday is snapshotted
  await expect.poll(async () => {
    await page.evaluate(() => window.__flushProjectToIDB());
    return page.evaluate(async () => {
      const p = await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
      return JSON.stringify((p.doneSnapshots || []).map(s => ({ label: s.label, w: s.w, h: s.h })));
    });
  }, { timeout: 15000 }).toBe(JSON.stringify([{ label: 'auto', w: 60, h: 60 }]));
});

test('Home offers the backup reminder after 14 days when something has been stitched', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cs_last_backup_at', String(Date.now() - 20 * 86400000)); } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async () => {
    const pattern = Array.from({ length: 6 }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    await ProjectStorage.save({ id: 'proj_home_bk', name: 'Has marks', settings: { sW: 3, sH: 2 }, pattern, done: [1, 1, 0, 0, 0, 0] });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/Your last backup was 20 days ago/)).toBeVisible({ timeout: 15000 });
});

test('Home offers nothing when nothing has been stitched yet', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cs_last_backup_at', String(Date.now() - 20 * 86400000)); } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async () => {
    const pattern = Array.from({ length: 6 }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] }));
    await ProjectStorage.save({ id: 'proj_home_nobk', name: 'No marks', settings: { sW: 3, sH: 2 }, pattern, done: [0, 0, 0, 0, 0, 0] });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  await expect(page.getByText(/Your last backup was/)).toHaveCount(0);
});

test('the daily snapshot also works when the Tracker is closed and reopened between the two days', async ({ page }) => {
  // The clock offset survives reloads, so day two starts in a freshly loaded page.
  await page.addInitScript(() => {
    const Real = Date;
    const off = () => { try { return Number(localStorage.getItem('__off') || 0); } catch (_) { return 0; } };
    window.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + off()); else super(...a); }
      static now() { return Real.now() + off(); }
    };
  });
  await loadTrackerFixture(page);
  const mark = async (gx, gy) => { const p = await trackerCellPoint(page, gx, gy); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
  await page.evaluate(() => UserPrefs.set('trackerAutomaticSnapshots', true));
  await mark(3, 3);                                          // day one
  await page.evaluate(() => window.__flushProjectToIDB());
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  await page.goto('/home.html');                             // leave: the session ends and is saved
  await page.evaluate(() => localStorage.setItem('__off', String(36 * 3600 * 1000)));   // next stitching day
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  const recap = page.locator('.resume-recap-overlay');
  if (await recap.count()) { await recap.getByRole('button', { name: /continue/i }).click(); await page.waitForTimeout(200); }
  await mark(4, 3);                                          // first mark of day two, in a fresh page
  await expect.poll(async () => {
    await page.evaluate(() => window.__flushProjectToIDB());
    return page.evaluate(async () => {
      const p = await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
      return (p.doneSnapshots || []).filter(s => s.label === 'auto').length;
    });
  }, { timeout: 15000 }).toBe(1);
});
