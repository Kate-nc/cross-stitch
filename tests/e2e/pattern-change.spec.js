/* A pattern whose size changed after stitching never silently loses its marks
   (tracking audit TRACK-12, BUG-06). */
const { test, expect } = require('@playwright/test');
const { loadTrackerFixture, trackerCellPoint, trackerDoneCount, TRACKER_CANVAS } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function markRow(page, row, from, to) {
  const a = await trackerCellPoint(page, from, row), b = await trackerCellPoint(page, to, row);
  await page.mouse.move(a.x - 3, a.y); await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 12, a.y);
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const dialog = page => page.locator('.reconcile-overlay');
const storedDone = page => page.evaluate(async () => {
  const id = localStorage.getItem('crossstitch_active_project');
  const db = await getDB();
  const p = await new Promise(r => { const q = db.transaction('projects').objectStore('projects').get(id); q.onsuccess = () => r(q.result); });
  return { len: p.done.length, marks: p.done.filter(v => v === 1).length, snaps: (p.doneSnapshots || []).map(s => s.label + ':' + s.doneCount) };
});
async function openTracker(page) {
  const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
}
// Mark 10 stitches, save, then rewrite the stored marks as if the pattern had been another shape.
async function setUp(page, shape) {
  await loadTrackerFixture(page);
  await markRow(page, 3, 2, 11);
  expect(await trackerDoneCount(page)).toBe(10);
  await page.evaluate(() => window.__flushProjectToIDB());
  // Leave the Tracker first: it saves its own copy as the page unloads, which would overwrite the rewrite below.
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async shape => {
    const id = localStorage.getItem('crossstitch_active_project');
    const p = await ProjectStorage.get(id);
    const W = p.settings.sW, H = p.settings.sH;
    const [ow, oh] = new Function('W', 'H', 'return ' + shape)(W, H);
    const old = new Array(ow * oh).fill(0);
    for (let x = 2; x <= 11; x++) old[3 * ow + x] = 1;     // the 10 marks, row 3, columns 2 to 11
    p.done = old; delete p.lastWriteAt;
    await ProjectStorage.save(p);
  }, shape.toString().replace(/^\(W, H\) => /, ''));
  await openTracker(page);
}

test.describe('Pattern changed after stitching', () => {
  test('a row added at the bottom: Keep progress keeps every mark, with a snapshot of the old ones', async ({ page }) => {
    await setUp(page, (W, H) => [W, H - 1]);               // the saved marks are one row shorter than the pattern
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('.resume-recap-overlay')).toHaveCount(0);   // no stale recap behind it
    await page.getByRole('button', { name: /^Rows changed/ }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await trackerDoneCount(page)).toBe(10);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__flushProjectToIDB());
    const s = await storedDone(page);
    expect(s.marks).toBe(10);
    expect(s.snaps).toContain('Before pattern change:10');
    const len = await page.evaluate(async () => (await ProjectStorage.get(localStorage.getItem('crossstitch_active_project'))).pattern.length);
    expect(s.len).toBe(len);
  });

  test('a column removed: only the marks in the removed column are lost', async ({ page }) => {
    await setUp(page, (W, H) => [W + 1, H]);               // one column wider before: the column W was cropped away
    await page.goto('/home.html');
    await page.waitForFunction(() => window.ProjectStorage);
    await page.evaluate(async () => {
      const id = localStorage.getItem('crossstitch_active_project');
      const p = await ProjectStorage.get(id);
      const W = p.settings.sW; p.done[5 * (W + 1) + W] = 1; delete p.lastWriteAt;
      await ProjectStorage.save(p);
    });
    await openTracker(page);
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText('11 stitches you marked');
    await page.getByRole('button', { name: /^Columns changed/ }).click();
    expect(await trackerDoneCount(page)).toBe(10);
  });

  test('Start progress again clears the marks but keeps a snapshot', async ({ page }) => {
    await setUp(page, (W, H) => [W, H - 1]);
    await page.getByRole('button', { name: 'Start progress again' }).click();
    expect(await trackerDoneCount(page)).toBe(0);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__flushProjectToIDB());
    const s = await storedDone(page);
    expect(s.marks).toBe(0);
    expect(s.snaps).toContain('Before pattern change:10');
  });

  test('nothing is written while the question is open, even after waiting and closing', async ({ page }) => {
    await setUp(page, (W, H) => [W, H - 1]);
    const before = await storedDone(page);
    await expect(dialog(page)).toBeVisible();
    await page.waitForTimeout(12000);                      // longer than the autosave
    expect(await storedDone(page)).toEqual(before);
    await page.close({ runBeforeUnload: true });
  });

  test('Leave it as it is and go back writes nothing either', async ({ page }) => {
    await setUp(page, (W, H) => [W, H - 1]);
    const before = await storedDone(page);
    await page.getByRole('button', { name: 'Leave it as it is and go back' }).click();
    await page.waitForTimeout(800);
    expect(await storedDone(page)).toEqual(before);
  });
});
