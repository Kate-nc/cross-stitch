/* tests/e2e/import-pages-touch.spec.js — arranging a PDF chart's pages with a
 * finger, in the import review's Pages tab.
 *
 * A browser's drag and drop does not start from a touch, so on a tablet the
 * tab only took taps. Holding a page now picks it up; it follows the finger
 * and drops where the finger lifts. A quick swipe still scrolls, and a tap
 * still selects.
 */
const { test, expect } = require('@playwright/test');
const { PDFDocument, rgb } = require('pdf-lib');

/* Four 12 x 10 pages with no row or column numbers, each one colour, so the
 * importer lays them out by guess or in page order and the stitcher arranges
 * them. */
async function fourPageChart() {
  const pdf = await PDFDocument.create();
  const colours = [rgb(0.8, 0.1, 0.1), rgb(0.1, 0.6, 0.1), rgb(0.1, 0.2, 0.8), rgb(0.8, 0.7, 0.1)];
  const pitch = 12, x0 = 100, y0 = 200, cols = 20, rows = 16;
  for (let p = 0; p < 4; p++) {
    const page = pdf.addPage([612, 792]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      page.drawRectangle({ x: x0 + c * pitch, y: y0 + r * pitch, width: pitch, height: pitch, color: colours[p] });
    }
    for (let c = 0; c <= cols; c++) page.drawLine({ start: { x: x0 + c * pitch, y: y0 }, end: { x: x0 + c * pitch, y: y0 + rows * pitch }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
    for (let r = 0; r <= rows; r++) page.drawLine({ start: { x: x0, y: y0 + r * pitch }, end: { x: x0 + cols * pitch, y: y0 + r * pitch }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });
  }
  return Buffer.from(await pdf.save()).toString('base64');
}

test.describe('Import review: arranging pages by touch', function() {
  test('a held page follows the finger and drops where it lifts', async function({ page }) {
    test.setTimeout(120000);
    await page.goto('/home.html');
    const pdf = await fourPageChart();
    await page.evaluate(function(b64) {
      const bytes = Uint8Array.from(atob(b64), function(ch) { return ch.charCodeAt(0); });
      window.ImportEngine.importAndReview(new File([bytes], 'four.pdf', { type: 'application/pdf' }), { navigate: false });
    }, pdf);
    await expect(page.locator('.page-layout')).toBeVisible({ timeout: 90000 });

    const order = function() {
      return page.$$eval('.page-layout-slot', function(els) {
        return els.map(function(e) { const l = e.querySelector('.page-layout-label'); return l ? l.textContent.replace('Page ', '') : '-'; }).join(' ');
      });
    };
    const centre = async function(selector) {
      const b = await page.locator(selector).first().boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const session = await page.context().newCDPSession(page);
    const touch = function(type, pt) {
      return session.send('Input.dispatchTouchEvent', { type, touchPoints: pt ? [{ x: Math.round(pt.x), y: Math.round(pt.y), id: 1 }] : [] });
    };
    const carry = async function(from, to) {
      await touch('touchStart', from);
      await page.waitForTimeout(500);                      // hold to pick up
      for (let i = 1; i <= 8; i++) {
        await touch('touchMove', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 });
        await page.waitForTimeout(30);
      }
      await touch('touchEnd');
      await page.waitForTimeout(300);
    };

    // Not draggable the browser's way on a touch screen: Safari's own
    // long-press drag would fight the hold.
    await expect(page.locator('.page-layout-tile:not(.empty)').first()).toHaveJSProperty('draggable', false);

    const before = (await order()).split(' ');
    await carry(await centre('[data-slot="0"] .page-layout-tile'), await centre('[data-slot="1"] .page-layout-tile'));
    const after = (await order()).split(' ');
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);

    // A quick swipe is a scroll, not a pick-up.
    const p = await centre('[data-slot="2"] .page-layout-tile');
    await touch('touchStart', p);
    for (let i = 1; i <= 5; i++) await touch('touchMove', { x: p.x, y: p.y - 20 * i });
    await touch('touchEnd');
    await page.waitForTimeout(500);
    expect(await order()).toBe(after.join(' '));
    await expect(page.locator('.page-layout-ghost')).toHaveCount(0);

    // Dropped on the tray, a page is left out of the chart.
    const out = after[2];
    await touch('touchStart', await centre('[data-slot="2"] .page-layout-tile'));
    await page.waitForTimeout(500);
    const tray = await centre('.page-layout-tray');
    await touch('touchMove', tray);
    await touch('touchEnd');
    await page.waitForTimeout(300);
    await expect(page.locator('.page-layout-tray .page-layout-label')).toHaveText(['Page ' + out]);

    // A tap still selects.
    await page.locator('[data-slot="0"] .page-layout-tile').tap();
    await expect(page.locator('.page-layout-tile.selected')).toHaveCount(1);
    await session.detach();
  });
});
