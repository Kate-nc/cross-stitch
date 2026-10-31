/* A tap paints its stitch at once and commits React state as a transition
   (tap-lag audit, fix #1). If another update commits in between — here a view
   change — its full redraw must not erase the new mark, and the tap's own
   commit must not then skip the repaint that restores it.

   The transition is held back on purpose (React.startTransition delayed by
   400 ms) so the view change reliably commits first; the check is that the
   chart then matches a fresh redraw of the same state. */
const { test, expect } = require('@playwright/test');
const H = require('./touch-helpers');

// The pixels of the chart canvas over one stitch, as a string to compare.
const cellPixels = (page, gx, gy) => page.evaluate(async ({ sel, gx, gy }) => {
  const c = document.querySelector(sel), r = c.getBoundingClientRect(), t = c.__chartTile || { x: 0, y: 0 };
  const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
  const G = 28, k = c.width / r.width;
  const x = Math.floor((G - t.x + gx * scs) * k), y = Math.floor((G - t.y + gy * scs) * k), w = Math.max(1, Math.floor(scs * k));
  return Array.from(c.getContext('2d').getImageData(x, y, w, w).data).join(',');
}, { sel: H.TRACKER_CANVAS, gx, gy });

test('a view change committing before a tap does not leave the stitch undrawn', async ({ page }) => {
  await H.loadTrackerFixture(page);
  // Into the three-view cycle first (the opening view is not part of it), so
  // three presses later the chart is back in the same view.
  for (let i = 0; i < 2; i++) { await page.keyboard.press('v'); await page.waitForTimeout(150); }
  const p = await H.trackerCellPoint(page, 4, 4);
  const before = await H.trackerDoneCount(page);
  const unmarked = await cellPixels(page, 4, 4);
  await page.evaluate(() => {
    const start = React.startTransition;
    React.startTransition = fn => setTimeout(() => start(fn), 400);
  });
  await page.mouse.click(p.x, p.y);              // painted now, committed 400 ms later
  await page.keyboard.press('v');                 // commits first, with a full redraw
  await expect.poll(() => H.trackerDoneCount(page)).toBe(before + 1);
  await page.waitForTimeout(300);
  const shown = await cellPixels(page, 4, 4);
  // Two more presses complete the cycle back to the view the tap happened in,
  // and one more returns to the view the race ended in: each is a full redraw
  // of the current state, which is what the chart must already show.
  for (let i = 0; i < 3; i++) { await page.keyboard.press('v'); await page.waitForTimeout(150); }
  expect(await cellPixels(page, 4, 4)).toBe(shown);
  // And the stitch really is drawn as marked in the view the tap happened in.
  for (let i = 0; i < 2; i++) { await page.keyboard.press('v'); await page.waitForTimeout(150); }
  expect(await cellPixels(page, 4, 4)).not.toBe(unmarked);
});
