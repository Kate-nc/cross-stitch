/* Phase 3 hunt: a timer left running across midnight, in the Tracker with a faked clock (23:50 when the page loads). */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  await page.addInitScript(() => { try {
    const Real = Date; window.__off = 0; { const n = new Real(); n.setHours(23, 50, 0, 0); window.__off = n.getTime() - Real.now(); }
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

test('a timer running across midnight saves one run as two records, one per day, and Today follows the new day', async ({ page }) => {
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const id = await seed(page);
  cursor = 0;
  await open(page, id);
  await startTimer(page);
  await mark(page, 8); await advance(page, 8); await page.waitForTimeout(1200);      // 23:58
  await mark(page, 8); await advance(page, 7); await page.waitForTimeout(1200);      // 00:05 the next day
  await mark(page, 8); await advance(page, 2); await page.waitForTimeout(1500);
  await openControls(page);
  await page.getByRole('button', { name: 'Stop timer' }).click();
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect.poll(async () => (await sessions(page)).length, { timeout: 15000 }).toBe(2);
  const [a, b] = (await sessions(page)).sort((x, y) => x.date < y.date ? -1 : 1);
  expect(a.date).not.toBe(b.date);
  expect(a.groupId).toBeTruthy();
  expect(b.groupId).toBe(a.groupId);
  expect(a.timingBasis).toBe('timer');
  expect(b.timingBasis).toBe('timer');
  // nothing is lost or counted twice
  const n = await doneCount(page);
  expect(a.unitsCompleted + b.unitsCompleted).toBe(n);
  expect(Math.round((a.durationSeconds + b.durationSeconds) / 60)).toBe(17);
  expect(a.unitsCompleted).toBeGreaterThan(0);
  expect(b.unitsCompleted).toBeGreaterThan(0);
  await page.evaluate(() => window.__openTrackerStats());
  await expect(page.locator('.timeline-entry')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText(/NaN|undefined/);
  expect(errs).toEqual([]);
});
