/* Tracker touch gestures, driven through CDP so the page sees the real touch
   and pointer events a finger produces.

   The gesture model these pin down:
     Mark mode     one finger marks: tap, drag across stitches, long-press for
                   a rectangle (with a bar offering Park thread here / Cancel).
                   Two fingers pan and pinch-zoom; a second finger abandons the
                   one-finger gesture without marking anything.
     Navigate mode one finger pans (natively), a tap places or clears the
                   guide, press-and-hold parks a thread.

   Before this, a one-finger drag in Mark mode both marked and panned: the
   chart slid under the finger, so it panned erratically and left stray
   marks. */
const { test, expect } = require('@playwright/test');
const {
  loadTrackerFixture,
  trackerCellPoint,
  trackerDoneCount,
  trackerHasParkMarker,
  trackerScroll,
  trackerTouchDriver,
} = require('./touch-helpers');

const cellSize = page => page.evaluate(() =>
  document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
const scrollerBox = page => page.evaluate(() => {
  const r = document.querySelector('.tracker-chart-scroll').getBoundingClientRect();
  return { left: r.left, top: r.top };
});
// Chart cell (fractional) under a client point.
const cellUnder = (page, x, y) => page.evaluate(({ x, y }) => {
  const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]');
  const r = c.getBoundingClientRect(), t = c.__chartTile;
  const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
  return { cx: (x - r.left + t.x - 28) / scs, cy: (y - r.top + t.y - 28) / scs };
}, { x, y });

async function tap(page, touch, p) {
  await touch('touchStart', [p]);
  await page.waitForTimeout(50);
  await touch('touchEnd', []);
  await page.waitForTimeout(350);
}
async function hold(page, touch, p) {
  await touch('touchStart', [p]);
  await page.waitForTimeout(750);
  await touch('touchEnd', []);
  await page.waitForTimeout(350);
}

test.describe('Tracker touch: Mark mode', function() {
  test('a tap marks one stitch; a one-finger drag marks what it crosses and does not pan', async function({ page }) {
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);

    await tap(page, touch, await trackerCellPoint(page, 5, 5));
    await expect.poll(() => trackerDoneCount(page)).toBe(1);

    const scrollBefore = await trackerScroll(page);
    // Leftwards: at scroll 0 a stray pan to the right would be clamped and
    // invisible, but this one would show.
    const a = await trackerCellPoint(page, 9, 8);
    const scs = await cellSize(page);
    await touch('touchStart', [a]);
    await page.waitForTimeout(60);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [{ x: a.x - i * scs / 2, y: a.y }]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    // From cell 9 to cell 5: five stitches, plus the earlier tap.
    await expect.poll(() => trackerDoneCount(page)).toBe(6);
    expect(await trackerScroll(page), 'a one-finger drag in Mark mode must not pan').toEqual(scrollBefore);
  });

  test('two fingers pan without marking, and a pinch zooms around the point between them', async function({ page }) {
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);
    const box = await scrollerBox(page);

    const s0 = await trackerScroll(page);
    const f1 = { x: box.left + 260, y: box.top + 300, id: 1 }, f2 = { x: box.left + 360, y: box.top + 300, id: 2 };
    await touch('touchStart', [f1]);
    await touch('touchStart', [f1, f2]);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [{ x: f1.x - i * 15, y: f1.y - i * 10, id: 1 }, { x: f2.x - i * 15, y: f2.y - i * 10, id: 2 }]);
      await page.waitForTimeout(20);
    }
    await touch('touchEnd', [{ x: f2.x - 150, y: f2.y - 100, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(400);
    const s1 = await trackerScroll(page);
    expect(Math.abs(s1.left - s0.left - 150), 'two fingers pan by their travel').toBeLessThanOrEqual(4);
    expect(Math.abs(s1.top - s0.top - 100)).toBeLessThanOrEqual(4);
    expect(await trackerDoneCount(page), 'a two-finger pan marks nothing').toBe(0);

    const mid = { x: box.left + 340, y: box.top + 320 };
    const before = await cellUnder(page, mid.x, mid.y);
    const z0 = await cellSize(page);
    await touch('touchStart', [{ x: mid.x - 40, y: mid.y, id: 1 }]);
    await touch('touchStart', [{ x: mid.x - 40, y: mid.y, id: 1 }, { x: mid.x + 40, y: mid.y, id: 2 }]);
    for (let i = 1; i <= 10; i++) {
      await touch('touchMove', [{ x: mid.x - 40 - i * 6, y: mid.y, id: 1 }, { x: mid.x + 40 + i * 6, y: mid.y, id: 2 }]);
      await page.waitForTimeout(30);
    }
    await touch('touchEnd', [{ x: mid.x + 100, y: mid.y, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(900);
    expect(await cellSize(page), 'pinching out zooms in').toBeGreaterThan(z0 * 1.4);
    const after = await cellUnder(page, mid.x, mid.y);
    expect(Math.abs(after.cx - before.cx), 'the point between the fingers stays put').toBeLessThan(0.5);
    expect(Math.abs(after.cy - before.cy)).toBeLessThan(0.5);
    expect(await trackerDoneCount(page), 'a pinch marks nothing').toBe(0);
  });

  test('a second finger landing mid-drag drops the drag without marking', async function({ page }) {
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);
    const a = { ...(await trackerCellPoint(page, 3, 6)), id: 1 };
    const scs = await cellSize(page);
    await touch('touchStart', [a]);
    await page.waitForTimeout(80);
    for (let i = 1; i <= 4; i++) {
      await touch('touchMove', [{ x: a.x + i * scs * 0.6, y: a.y, id: 1 }]);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(300); // well past any multi-touch grace period
    const end1 = { x: a.x + 4 * scs * 0.6, y: a.y, id: 1 }, b = { x: a.x + 60, y: a.y + 140, id: 2 };
    await touch('touchStart', [end1, b]);
    for (let i = 1; i <= 5; i++) {
      await touch('touchMove', [{ x: end1.x - i * 10, y: end1.y, id: 1 }, { x: b.x - i * 10, y: b.y, id: 2 }]);
      await page.waitForTimeout(20);
    }
    await touch('touchEnd', [{ x: b.x - 50, y: b.y, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(500);
    expect(await trackerDoneCount(page)).toBe(0);
  });

  test('long-press anchors a rectangle; the bar parks or cancels, and a corner tap fills it', async function({ page }) {
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);
    const bar = page.locator('.range-anchor-bar');

    // Park thread here: parks the anchor stitch, ends the rectangle, marks nothing.
    await hold(page, touch, await trackerCellPoint(page, 4, 4));
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('Tap the opposite corner to fill a rectangle');
    await bar.getByRole('button', { name: /Park thread here/ }).click();
    await expect(bar).toHaveCount(0);
    expect(await trackerHasParkMarker(page, 4, 4)).toBe(true);
    expect(await trackerDoneCount(page)).toBe(0);

    // Cancel: no rectangle; the next tap marks a single stitch.
    await hold(page, touch, await trackerCellPoint(page, 6, 8));
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: /Cancel/ }).click();
    await expect(bar).toHaveCount(0);
    await tap(page, touch, await trackerCellPoint(page, 9, 11));
    await expect.poll(() => trackerDoneCount(page)).toBe(1);

    // Long-press, then tap the opposite corner: a 3x3 rectangle.
    await hold(page, touch, await trackerCellPoint(page, 2, 13));
    await tap(page, touch, await trackerCellPoint(page, 4, 15));
    await expect.poll(() => trackerDoneCount(page)).toBe(10);
    await expect(bar).toHaveCount(0);
  });
});

// A quick two-finger fling, released while still moving.
async function fling(page, touch, box) {
  const f1 = { x: box.left + 420, y: box.top + 420 }, f2 = { x: box.left + 520, y: box.top + 420 };
  await touch('touchStart', [{ ...f1, id: 1 }]);
  await touch('touchStart', [{ ...f1, id: 1 }, { ...f2, id: 2 }]);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [{ x: f1.x - i * 30, y: f1.y - i * 20, id: 1 }, { x: f2.x - i * 30, y: f2.y - i * 20, id: 2 }]);
    await page.waitForTimeout(12);
  }
  await touch('touchEnd', [{ x: f2.x - 180, y: f2.y - 120, id: 2 }]);
  await touch('touchEnd', []);
}

test.describe('Tracker touch: two-finger pan momentum', function() {
  test('a two-finger fling coasts after release, and a touch stops it', async function({ page }) {
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);
    const box = await scrollerBox(page);
    await fling(page, touch, box);
    const atRelease = await trackerScroll(page);
    await page.waitForTimeout(150);
    const coasting = await trackerScroll(page);
    expect(coasting.left, 'still moving after the fingers lift').toBeGreaterThan(atRelease.left + 5);
    // A new touch stops it where it is.
    await touch('touchStart', [{ x: box.left + 200, y: box.top + 200, id: 1 }]);
    await page.waitForTimeout(50);
    const stopped = await trackerScroll(page);
    await page.waitForTimeout(300);
    expect(await trackerScroll(page), 'a touch stops the coast').toEqual(stopped);
    await touch('touchEnd', []);
    expect(await trackerDoneCount(page), 'nothing marked').toBe(0);
  });

  test('a pinch does not coast', async function({ page }) {
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);
    const box = await scrollerBox(page);
    const mid = { x: box.left + 340, y: box.top + 320 };
    await touch('touchStart', [{ x: mid.x - 40, y: mid.y, id: 1 }]);
    await touch('touchStart', [{ x: mid.x - 40, y: mid.y, id: 1 }, { x: mid.x + 40, y: mid.y, id: 2 }]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [{ x: mid.x - 40 - i * 12 - i * 20, y: mid.y, id: 1 }, { x: mid.x + 40 + i * 12 - i * 20, y: mid.y, id: 2 }]);
      await page.waitForTimeout(12);
    }
    await touch('touchEnd', [{ x: mid.x - 80, y: mid.y, id: 2 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(700);
    const a = await trackerScroll(page);
    await page.waitForTimeout(300);
    expect(await trackerScroll(page)).toEqual(a);
  });

  test('no momentum when the system asks for reduced motion', async function({ page }) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadTrackerFixture(page);
    const touch = await trackerTouchDriver(page);
    await fling(page, touch, await scrollerBox(page));
    await page.waitForTimeout(100);
    const a = await trackerScroll(page);
    await page.waitForTimeout(300);
    expect(await trackerScroll(page)).toEqual(a);
  });
});

test.describe('Tracker touch: Navigate mode', function() {
  test('one finger pans; a tap places and clears the guide; press-and-hold parks', async function({ page }) {
    await loadTrackerFixture(page);
    await page.locator('button[title="Navigate (N)"]').click();
    await page.waitForTimeout(300);
    const touch = await trackerTouchDriver(page);
    const box = await scrollerBox(page);

    const s0 = await trackerScroll(page);
    const a = { x: box.left + 300, y: box.top + 300 };
    await touch('touchStart', [a]);
    for (let i = 1; i <= 8; i++) {
      await touch('touchMove', [{ x: a.x - i * 15, y: a.y - i * 10 }]);
      await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(500);
    const s1 = await trackerScroll(page);
    expect(s1.left, 'a one-finger drag pans in Navigate mode').toBeGreaterThan(s0.left + 50);
    expect(await trackerDoneCount(page)).toBe(0);

    const status = page.locator('.tracker-hover-bar');
    const clear = page.locator('.tracker-hover-bar__clear');
    const p = await trackerCellPoint(page, 8, 7);
    await tap(page, touch, p);
    await expect(status).toContainText('Guide');
    await expect(clear).toBeVisible();
    await tap(page, touch, p);
    await expect(clear).toHaveCount(0);

    await tap(page, touch, p);
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(clear).toHaveCount(0);

    await hold(page, touch, await trackerCellPoint(page, 9, 9));
    expect(await trackerHasParkMarker(page, 9, 9)).toBe(true);
    expect(await trackerDoneCount(page)).toBe(0);
  });
});
