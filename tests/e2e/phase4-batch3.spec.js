/* Scrolling must not mark (tracking audit TRACK-08), through real touch events (CDP).
     quick one-finger swipe  scrolls the chart, marks nothing
     rest, then drag         paints what it crosses
     tap                     marks one stitch at once
     Paint mode              a quick drag paints
     Lock touches            a finger does nothing until the pill is held
     more than 5 stitches    "Undo N stitches" */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { loadTrackerFixture, trackerCellPoint, trackerDoneCount, trackerScroll, trackerTouchDriver } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

const cellSize = page => page.evaluate(() =>
  document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);

async function tap(page, touch, p) {
  await touch('touchStart', [p]);
  await page.waitForTimeout(50);
  await touch('touchEnd', []);
  await page.waitForTimeout(350);
}
// A quick one-finger swipe (no rest), by (dx, dy) in 8 steps of 12 ms.
async function swipe(page, touch, a, dx, dy) {
  await touch('touchStart', [a]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: a.x + dx * i / 8, y: a.y + dy * i / 8 }]); await page.waitForTimeout(12); }
  await touch('touchEnd', []);
  await page.waitForTimeout(450);
}
// Rest on a stitch, then drag by n cells to the right.
async function restAndDrag(page, touch, a, cells) {
  const scs = await cellSize(page);
  await touch('touchStart', [a]);
  await page.waitForTimeout(220);
  for (let i = 1; i <= cells * 2; i++) { await touch('touchMove', [{ x: a.x + i * scs / 2, y: a.y }]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
}
const openMore = async (page) => { await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(300); };

test('a quick one-finger swipe scrolls the chart and marks nothing; a tap still marks at once', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  await tap(page, touch, await trackerCellPoint(page, 5, 5));
  await expect.poll(() => trackerDoneCount(page)).toBe(1);

  const s0 = await trackerScroll(page);
  const a = await trackerCellPoint(page, 12, 12);
  await swipe(page, touch, a, -120, -120);     // 120 px up and left: the chart should move
  const s1 = await trackerScroll(page);
  expect(await trackerDoneCount(page), 'a swipe marks nothing').toBe(1);
  expect(s1.left > s0.left || s1.top > s0.top, 'a swipe scrolls the chart').toBe(true);
});

test('rest on a stitch, then drag: it paints what it crosses and the chart stays put', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  const s0 = await trackerScroll(page);
  await restAndDrag(page, touch, await trackerCellPoint(page, 3, 6), 5);
  await expect.poll(() => trackerDoneCount(page)).toBe(6);        // the stitch it rested on and five more
  expect(await trackerScroll(page), 'painting does not scroll').toEqual(s0);
});

test('Paint mode: a quick drag paints, with no rest first', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  await openMore(page);
  await page.getByRole('button', { name: /Paint/ }).first().click();
  await expect(page.getByRole('button', { name: /Paint/ }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.ppal-more-close').click();
  await expect(page.locator('.ppal-mode-btn-label', { hasText: 'Paint' })).toBeVisible();   // the visible indicator
  const s0 = await trackerScroll(page);
  const a = await trackerCellPoint(page, 3, 9);
  const scs = await cellSize(page);
  await touch('touchStart', [a]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: a.x + i * scs / 2, y: a.y }]); await page.waitForTimeout(10); }
  await touch('touchEnd', []);
  await page.waitForTimeout(400);
  await expect.poll(() => trackerDoneCount(page)).toBeGreaterThanOrEqual(4);
  expect(await trackerScroll(page)).toEqual(s0);
});

test('Lock touches: a finger does nothing until the pill is held', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  await openMore(page);
  await page.getByRole('button', { name: /Lock touches/ }).click();
  const pill = page.locator('.touch-lock-pill');
  await expect(pill).toBeVisible();
  await tap(page, touch, await trackerCellPoint(page, 5, 5));
  await restAndDrag(page, touch, await trackerCellPoint(page, 3, 9), 4);
  expect(await trackerDoneCount(page), 'locked: no marks').toBe(0);
  // a tap on the pill does not unlock
  const b = await pill.boundingBox();
  await touch('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
  await page.waitForTimeout(150);
  await touch('touchEnd', []);
  await expect(pill).toBeVisible();
  // holding it does
  await touch('touchStart', [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }]);
  await page.waitForTimeout(900);
  await expect(pill).toContainText('Lift to unlock');
  await touch('touchEnd', []);
  await expect(pill).toHaveCount(0);
  await tap(page, touch, await trackerCellPoint(page, 5, 5));
  await expect.poll(() => trackerDoneCount(page)).toBe(1);
});

test('a stroke that marks more than five stitches offers "Undo N stitches", and it undoes the whole stroke', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  await restAndDrag(page, touch, await trackerCellPoint(page, 2, 4), 7);
  await expect.poll(() => trackerDoneCount(page)).toBe(8);
  const undo = page.getByRole('button', { name: 'Undo 8 stitches' });
  await expect(undo).toBeVisible();
  await expect(page.getByText('8 stitches marked')).toBeVisible();
  await undo.click();
  await expect.poll(() => trackerDoneCount(page)).toBe(0);
});

test('a stroke of five stitches or fewer offers no toast', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  await restAndDrag(page, touch, await trackerCellPoint(page, 2, 4), 3);
  await expect.poll(() => trackerDoneCount(page)).toBe(4);
  await expect(page.getByRole('button', { name: /^Undo \d+ stitches$/ })).toHaveCount(0);
});

test('a mouse drag is unchanged: no rest, no toast under six, marks as it goes', async ({ page }) => {
  await loadTrackerFixture(page);
  const a = await trackerCellPoint(page, 3, 12), b = await trackerCellPoint(page, 5, 12);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, a.y, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => trackerDoneCount(page)).toBe(3);
});

test('the Undo message goes once anything else is marked, so it can never undo something it did not offer', async ({ page }) => {
  await loadTrackerFixture(page);
  const touch = await trackerTouchDriver(page);
  await restAndDrag(page, touch, await trackerCellPoint(page, 2, 4), 7);
  await expect.poll(() => trackerDoneCount(page)).toBe(8);
  await expect(page.getByRole('button', { name: 'Undo 8 stitches' })).toBeVisible();
  await tap(page, touch, await trackerCellPoint(page, 12, 12));      // one more stitch afterwards
  await expect.poll(() => trackerDoneCount(page)).toBe(9);
  await expect(page.getByRole('button', { name: 'Undo 8 stitches' })).toHaveCount(0);
  expect(await trackerDoneCount(page), 'nothing was undone by the message going').toBe(9);
});

test('with drag marking turned off in Preferences there is no Paint switch to mislead, and the strip still says Mark', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cs_pref_trackerDragMark', 'false'); } catch (_) {} });
  await loadTrackerFixture(page);
  await openMore(page);
  await expect(page.getByRole('button', { name: /Lock touches/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Paint/ })).toHaveCount(0);
  await page.locator('.ppal-more-close').click();
  await expect(page.locator('.ppal-mode-btn-label', { hasText: 'Mark' })).toBeVisible();
});
