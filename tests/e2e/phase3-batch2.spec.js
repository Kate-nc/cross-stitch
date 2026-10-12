/* Explicit timer, labelled estimates and forgot-to-stop (tracking audit STATS-03), in the Tracker with a faked clock. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  await page.addInitScript(() => { try {
    const Real = Date; window.__off = 0;
    window.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(Real.now() + window.__off); else super(...a); }
      static now() { return Real.now() + window.__off; }
    };
    window.__advance = (min) => { window.__off += min * 60000; };
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
    const id = await ProjectStorage.save({ id: 'proj_p3b2', name: 'Phase3b2', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
async function open(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
}
let cursor = 0;
const mark = async (page, n) => { for (let i = 0; i < n; i++, cursor++) { const p = await trackerCellPoint(page, cursor % 20, Math.floor(cursor / 20)); await page.mouse.click(p.x, p.y); await page.waitForTimeout(140); } };
const doneCount = (page) => page.evaluate(async () => { await window.__flushProjectToIDB(); const p = await ProjectStorage.get('proj_p3b2'); return (p.done || []).filter(v => v === 1).length; });
const advance = (page, min) => page.evaluate((m) => window.__advance(m), min);
const sessions = (page) => page.evaluate(async () => { await window.__flushProjectToIDB(); return (await ProjectStorage.get('proj_p3b2')).statsSessions || []; });
async function startTimer(page) {
  // the chip sits in the colour palette header; open the palette first when it is collapsed
  for (let i = 0; i < 5; i++) {
    if (await page.getByRole('button', { name: 'Start timer' }).first().isVisible().catch(() => false)) break;
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Open colour palette panel"]'); if (b) b.click(); });
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: 'Start timer' }).first().click();
  await page.waitForTimeout(300);
}

const openControls = async (page) => { await page.locator('.info-strip-timer').click(); };

test('timer: 20 minutes of stitching is saved as a timed session of 20 min, with its speed', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await expect(page.locator('.info-strip-timer')).toContainText('Timer');
  await mark(page, 10); await advance(page, 9); await page.waitForTimeout(1200);
  await mark(page, 10); await advance(page, 9); await page.waitForTimeout(1200);
  await mark(page, 10); await advance(page, 2); await page.waitForTimeout(1500);
  await expect(page.getByText('Forgot to stop?')).toHaveCount(0);        // never 10 minutes without a stitch
  await openControls(page);
  await page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(page.getByText(/You stitched for 20 min/)).toBeVisible();
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(1);
  const s = (await sessions(page))[0];
  const n = await doneCount(page);
  expect(n).toBeGreaterThanOrEqual(28);
  expect(s.timingBasis).toBe('timer');
  expect(Math.abs(s.durationSeconds - 1200)).toBeLessThan(30);
  expect(s.unitsCompleted).toBe(n);
  await page.evaluate(() => window.__openTrackerStats());
  const entry = page.locator('.timeline-entry').first();
  await expect(entry).toContainText('(timed)');
  await expect(entry).toContainText('Active time 20m');
  await expect(entry).toContainText('Speed ' + Math.round(n / (s.durationSeconds / 3600)) + ' st/hr');
});

test('the same activity without the timer is labelled estimated', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await mark(page, 30);
  await openControls(page);
  await page.getByRole('button', { name: 'End session' }).click();
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(1);
  expect((await sessions(page))[0].timingBasis).toBe('auto');
  await page.getByRole('button', { name: /Progress info/ }).click();
  await expect(page.locator('.app-info-popover')).toContainText('Time spent (estimated)');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__openTrackerStats());
  await expect(page.locator('.timeline-entry').first()).toContainText('(estimated)');
});

test('stopping lets the minutes be corrected, and the session is then marked edited', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await mark(page, 5);
  await advance(page, 46);
  await expect(page.getByText('Forgot to stop?')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Stop now' }).click();
  await expect(page.getByText(/You stitched for 4\d min/)).toBeVisible();
  await page.getByLabel('Minutes').fill('40');
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(1);
  const s = (await sessions(page))[0];
  expect(s.timingBasis).toBe('edited');
  expect(s.durationSeconds).toBe(2400);
});

test('forgot to stop: trim to the last stitch changes the stored duration', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await mark(page, 4);
  await advance(page, 30);
  await expect(page.getByText('Forgot to stop?')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/since your last stitch/)).toBeVisible();
  await page.getByRole('button', { name: 'Trim to my last stitch' }).click();
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(1);
  const s = (await sessions(page))[0];
  expect(s.timingBasis).toBe('timer');
  expect(s.durationSeconds).toBeLessThan(60);          // not 30 minutes
  expect(s.unitsCompleted).toBe(await doneCount(page));
  await expect(page.getByText('Forgot to stop?')).toHaveCount(0);
});

test('forgot to stop with nothing marked: stopping saves no session', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await advance(page, 30);
  await expect(page.getByText('Forgot to stop?')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/nothing has been marked/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop without saving' }).click();
  await expect(page.getByText('Forgot to stop?')).toHaveCount(0);
  expect((await sessions(page)).length).toBe(0);
  await expect(page.getByRole('button', { name: 'Start timer' }).first()).toBeVisible();
});

test('Keep going closes the prompt and does not ask again straight away', async ({ page }) => {
  const id = await seed(page);
  await open(page, id);
  cursor = 0;
  await startTimer(page);
  await mark(page, 2);
  await advance(page, 30);
  await expect(page.getByText('Forgot to stop?')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Keep going' }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByText('Forgot to stop?')).toHaveCount(0);
});

test('switching project while a timer runs keeps the session on the project it belonged to', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await page.evaluate(async () => {
    const W = 20, H = 20;
    await ProjectStorage.save({ id: 'proj_other', name: 'Other project', settings: { sW: W, sH: H, fabricCt: 14 },
      pattern: Array.from({ length: W * H }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] })), done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 400, symbol: 'A' }] });
    ProjectStorage.setActiveProject('proj_p3b2');
  });
  await open(page, id);
  await startTimer(page);
  await mark(page, 6);
  await advance(page, 5);
  // the project picker (Header: open another project)
  await page.getByRole('button', { name: 'Switch project' }).first().click();
  await page.getByRole('menuitem', { name: /All projects/ }).click();
  await page.getByRole('button', { name: /Other project/ }).first().click();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => localStorage.getItem('cs_pending_session_proj_p3b2'))).not.toBeNull();
  // the other project did not get it
  const other = await page.evaluate(async () => { await window.__flushProjectToIDB(); return ((await ProjectStorage.get('proj_other')).statsSessions || []).length; });
  expect(other).toBe(0);
  // back on the first project the session is there
  await page.goto('/stitch.html?id=proj_p3b2');
  await page.waitForSelector(TRACKER_CANVAS);
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(1);
  const s = (await sessions(page))[0];
  expect(s.timingBasis).toBe('timer');
  expect(s.unitsCompleted).toBeGreaterThanOrEqual(5);
});

test('leaving the page with a timer left idle ends it at the last stitch, not 30 minutes later', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await mark(page, 4);
  await advance(page, 30);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.waitForFunction(() => localStorage.getItem('cs_pending_session_proj_p3b2'), null, { timeout: 10000 }).catch(() => {});
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('cs_pending_session_proj_p3b2') || 'null'));
  const rec = Array.isArray(pending) ? pending[0] : pending;
  expect(rec).not.toBeNull();
  expect(rec.timingBasis).toBe('timer');
  expect(rec.durationSeconds).toBeLessThan(60);
});

test('Stop freezes the timer: time spent in the dialog is not added, and an unchanged figure is not "edited"', async ({ page }) => {
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await mark(page, 5); await advance(page, 8); await page.waitForTimeout(1200);
  await expect(page.locator('.info-strip-timer')).toHaveAttribute('aria-live', 'off');   // the ticking clock is not announced
  await openControls(page);
  await page.getByRole('button', { name: 'Stop timer' }).click();
  await expect(page.getByText(/You stitched for 8 min/)).toBeVisible();
  await advance(page, 5);                                   // the dialog sits open for five more minutes
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(1);
  const s = (await sessions(page))[0];
  expect(s.timingBasis).toBe('timer');
  expect(Math.abs(s.durationSeconds - 480)).toBeLessThan(30);
});
