/* Two tabs on one project keep each other's marks (tracking audit TRACK-03).

   Before: the tab that was not the one to save was asked to reload (losing its own
   marks) or keep its edits (overwriting the other tab's marks). */
const { test, expect } = require('@playwright/test');
const { loadTrackerFixture, trackerCellPoint, trackerDoneCount, TRACKER_CANVAS } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function markRow(page, row, from, to) {
  const a = await trackerCellPoint(page, from, row), b = await trackerCellPoint(page, to, row);
  await page.mouse.move(a.x - 3, a.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y);
  await page.mouse.up();
  await page.waitForTimeout(150);
}
async function openSecondTab(context, page) {
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  const other = await context.newPage();
  await other.addInitScript(() => { try { localStorage.setItem('cs_first_run_done', '1'); } catch (_) {} });
  await other.goto('/stitch.html?id=' + id);
  await other.waitForSelector(TRACKER_CANVAS);
  await other.waitForTimeout(800);
  const recap = other.locator('.resume-recap-overlay');
  if (await recap.count()) { await recap.getByRole('button', { name: /continue/i }).click(); await other.waitForTimeout(200); }
  return other;
}
const stored = page => page.evaluate(async () => {
  const id = localStorage.getItem('crossstitch_active_project');
  const db = await getDB();
  const p = await new Promise(r => { const q = db.transaction('projects').objectStore('projects').get(id); q.onsuccess = () => r(q.result); });
  return { done: p.done.filter(v => v === 1).length, name: p.name };
});
const dialogShown = page => page.getByText('Project changed in another tab').count();

test.describe('Two tabs, one project', () => {
  test('stitches marked in each tab end up in both, with no question asked', async ({ page, context }) => {
    await loadTrackerFixture(page);
    const other = await openSecondTab(context, page);
    await markRow(page, 3, 2, 11);                         // 10 here
    await markRow(other, 6, 2, 8);                         // 7 there
    await other.evaluate(() => window.__flushProjectToIDB());    // the other tab saves
    await page.waitForTimeout(1500);                       // the broadcast reaches this tab
    expect(await dialogShown(page)).toBe(0);
    expect(await trackerDoneCount(page)).toBe(17);
    await expect.poll(async () => (await stored(page)).done, { timeout: 20000 }).toBe(17);   // this tab saves the combined result
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(TRACKER_CANVAS);
    await page.waitForTimeout(800);
    expect(await trackerDoneCount(page)).toBe(17);
  });

  test('a stitch unpicked in the other tab is not brought back', async ({ page, context }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.evaluate(() => window.__flushProjectToIDB());
    const other = await openSecondTab(context, page);
    expect(await trackerDoneCount(other)).toBe(10);
    await markRow(other, 3, 2, 6);                         // dragging over done stitches unmarks them: 5 left
    expect(await trackerDoneCount(other)).toBe(5);
    await other.evaluate(() => window.__flushProjectToIDB());
    await page.waitForTimeout(1500);
    expect(await dialogShown(page)).toBe(0);
    expect(await trackerDoneCount(page)).toBe(5);
    await page.evaluate(() => window.__flushProjectToIDB());
    expect((await stored(page)).done).toBe(5);
  });

  test('a mark made here while the other tab unpicks elsewhere is kept', async ({ page, context }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 11);
    await page.evaluate(() => window.__flushProjectToIDB());
    const other = await openSecondTab(context, page);
    await markRow(page, 8, 2, 4);                          // 3 new here, unsaved
    await markRow(other, 3, 2, 6);                         // 5 unpicked there
    await other.evaluate(() => window.__flushProjectToIDB());
    await page.waitForTimeout(1500);
    expect(await trackerDoneCount(page)).toBe(5 + 3);
  });

  test('a change to more than marks still asks', async ({ page, context }) => {
    await loadTrackerFixture(page);
    const other = await openSecondTab(context, page);
    await other.evaluate(async () => {
      const id = localStorage.getItem('crossstitch_active_project');
      const p = await ProjectStorage.get(id);
      p.name = 'Renamed elsewhere';
      await ProjectStorage.save(p);
    });
    await expect(page.getByText('Project changed in another tab')).toBeVisible({ timeout: 4000 });
  });
});
