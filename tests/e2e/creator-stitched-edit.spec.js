// UX-006: repainting cells that were stitched in the Tracker resets them to
// not done, in the same undo step, with a banner and a toast that says so.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, generateLogo, undoButton } = require('./creator-helpers');

// Mark the first `n` stitches of the saved project as done, as the Tracker would, then reopen it.
async function stitchFirst(page, n) {
  await page.waitForFunction(function() { return !!localStorage.getItem('crossstitch_active_project'); });
  await page.evaluate(async function(count) {
    var id = localStorage.getItem('crossstitch_active_project');
    var p = await window.ProjectStorage.get(id);
    var done = new Array(p.pattern.length).fill(0), marked = 0;
    for (var i = 0; i < p.pattern.length && marked < count; i++) {
      if (p.pattern[i].id !== '__skip__' && p.pattern[i].id !== '__empty__') { done[i] = 1; marked++; }
    }
    p.done = done;
    await window.ProjectStorage.save(p);
  }, n);
  await page.reload();
  await page.waitForSelector('.rpanel--edit', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(500);
}

test.describe('Editing a stitched pattern (desktop)', function() {
  test.use(device('desktop'));

  test('banner, Show stitched, repaint resets done, toast Undo restores it', async function({ page }) {
    await generateLogo(page);
    await expect(page.locator('.stitched-banner')).toHaveCount(0);   // nothing stitched yet

    await stitchFirst(page, 200);
    const banner = page.locator('.stitched-banner');
    await expect(banner).toContainText('stitched. Changing stitched cells resets them to not done.');
    await expect(banner).toContainText('% stitched');

    const toggle = banner.getByRole('button', { name: 'Show stitched' });
    await toggle.click();
    await expect(banner.getByRole('button', { name: 'Hide stitched' })).toHaveAttribute('aria-pressed', 'true');

    const info = await page.evaluate(async function() {
      var p = await window.ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
      var first = p.pattern.findIndex(function(c) { return c.id !== '__skip__' && c.id !== '__empty__'; });
      var at = first + 8;   // a stitched cell well inside the first stitched row
      return { done: p.done.filter(Boolean).length, w: p.settings.sW, x: at % p.settings.sW, y: Math.floor(at / p.settings.sW), id: p.pattern[at].id };
    });
    expect(info.done).toBe(200);

    // Fill that cell's colour region with another palette colour. The status bar's X / Y readout
    // tells where each cell is on the canvas, so click by cell rather than by guessing pixels.
    await page.getByRole('button', { name: 'Fill tool' }).click();
    const swatches = page.locator('.swatch-scroll-inner button');
    await swatches.last().click();
    const box = await page.locator('.cs-chart-scroll canvas').first().boundingBox();
    async function cellAt(px, py) {
      await page.mouse.move(px, py);
      await expect(page.locator('.tb-status')).toContainText('X: ');
      const m = (await page.locator('.tb-status').innerText()).match(/X: (\d+), Y: (\d+)/);
      return { x: +m[1] - 1, y: +m[2] - 1 };
    }
    const a = await cellAt(box.x + 200, box.y + 200), b = await cellAt(box.x + 400, box.y + 200);
    const cs = 200 / (b.x - a.x);
    await page.mouse.click(box.x + 200 + (info.x - a.x + 0.5) * cs, box.y + 200 + (info.y - a.y + 0.5) * cs);

    const toastEl = page.locator('.creator-toast-container > div').filter({ hasText: 'reset to not done' }).first();
    await expect(toastEl).toBeVisible({ timeout: 5000 });
    await expect(toastEl).toContainText('stitched cell');
    await expect(undoButton(page)).toBeEnabled();
    await expect(banner).toContainText('stitched.');
    const reset = await page.evaluate(function() { return document.body.innerText.match(/(\d[\d,]*) stitched cells? reset to not done/); });
    expect(reset).not.toBeNull();
    await expect(banner).not.toContainText('6% stitched');   // 200 of 3,290 stitches were 6%; fewer remain

    // Toast Undo restores the stitching along with the colours.
    await toastEl.getByRole('button', { name: 'Undo' }).click();
    await expect(undoButton(page)).toBeDisabled();
    await expect(banner).toContainText('6% stitched');   // the stitching is back with the colours
  });
});
