/* The save badge in the Tracker header tells the truth (tracking audit TRACK-02, BUG-07).
   Before: it was a fixed "All changes saved", also while changes were unsaved, a save had
   failed, or a conflict question was open. */
const { test, expect } = require('@playwright/test');
const { loadTrackerFixture, trackerCellPoint, TRACKER_CANVAS } = require('./touch-helpers');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

const badge = page => page.locator('.tb-proj-badge-saved');
async function markRow(page, row, from, to) {
  const a = await trackerCellPoint(page, from, row), b = await trackerCellPoint(page, to, row);
  await page.mouse.move(a.x - 3, a.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y);
  await page.mouse.up();
  await page.waitForTimeout(100);
}

test.describe('Tracker save badge', () => {
  test('says nothing is unsaved until something changes, then saving, then saved', async ({ page }) => {
    await loadTrackerFixture(page);
    await expect(badge(page)).toHaveText(/All changes saved/);
    await markRow(page, 3, 2, 8);
    await expect(badge(page)).toHaveText(/Saving/);            // changes not yet written
    await expect(badge(page)).toHaveText(/Saved (just now|\d+ s ago)/, { timeout: 12000 });
  });

  test('zooming alone does not claim there is something to save', async ({ page }) => {
    await loadTrackerFixture(page);
    await markRow(page, 3, 2, 8);
    await expect(badge(page)).toHaveText(/Saved/, { timeout: 12000 });
    await page.keyboard.press('=');
    await page.waitForTimeout(400);
    await expect(badge(page)).toHaveText(/Saved/);
  });

  test('says so when a save fails, offers Retry, and recovers', async ({ page }) => {
    await loadTrackerFixture(page);
    await page.evaluate(() => {
      window.__save = ProjectStorage.save.bind(ProjectStorage);
      window.__saveChecked = ProjectStorage.saveChecked.bind(ProjectStorage);
      const fail = () => Promise.reject(new Error('Disk is full'));
      ProjectStorage.save = fail; ProjectStorage.saveChecked = fail;
    });
    await markRow(page, 3, 2, 8);
    await expect(badge(page)).toHaveText(/Save failed/, { timeout: 12000 });
    await expect(badge(page).getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(badge(page)).toHaveAttribute('role', 'status');
    await page.evaluate(() => { ProjectStorage.save = window.__save; ProjectStorage.saveChecked = window.__saveChecked; });
    await badge(page).getByRole('button', { name: 'Retry' }).click();
    await expect(badge(page)).toHaveText(/Saved/, { timeout: 5000 });
  });

  test('a failed save does not follow you to another project', async ({ page }) => {
    await loadTrackerFixture(page);
    await page.evaluate(async () => {
      const id = localStorage.getItem('crossstitch_active_project');
      const p = JSON.parse(JSON.stringify(await ProjectStorage.get(id)));
      p.id = 'proj_badge_other'; p.name = 'Badge other'; delete p.lastWriteAt;
      await ProjectStorage.save(p);
      window.__save = ProjectStorage.save.bind(ProjectStorage);
      window.__saveChecked = ProjectStorage.saveChecked.bind(ProjectStorage);
      const fail = () => Promise.reject(new Error('Disk is full'));
      ProjectStorage.save = fail; ProjectStorage.saveChecked = fail;
    });
    await markRow(page, 3, 2, 8);
    await expect(badge(page)).toHaveText(/Save failed/, { timeout: 12000 });
    await page.evaluate(() => { ProjectStorage.save = window.__save; ProjectStorage.saveChecked = window.__saveChecked; });
    await page.getByRole('button', { name: /^File/ }).first().click();
    await page.getByText(/Switch Project/i).first().click();
    await page.getByText('Badge other').last().click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('crossstitch_active_project'))).toBe('proj_badge_other');
    await expect(badge(page)).toHaveText(/All changes saved/, { timeout: 5000 });
  });

  test('says "Not saved yet" while the changed-in-another-tab question is open, then saved', async ({ page, context }) => {
    await loadTrackerFixture(page);
    const id = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
    const other = await context.newPage();
    await other.goto('/stitch.html?id=' + id);
    await other.waitForSelector(TRACKER_CANVAS);
    await other.waitForTimeout(800);
    // The other tab saves first...
    await other.bringToFront();
    await markRow(other, 3, 2, 8);
    await other.waitForTimeout(6500);
    // ...then this one changes the same project.
    await page.bringToFront();
    await markRow(page, 5, 2, 6);
    await expect(page.locator('.overlay-panel--dialog')).toBeVisible({ timeout: 12000 });
    await expect(badge(page)).toHaveText(/Not saved yet/);
    await page.getByRole('button', { name: 'Keep my edits' }).click();
    await expect(badge(page)).toHaveText(/Saved/, { timeout: 5000 });
  });
});
