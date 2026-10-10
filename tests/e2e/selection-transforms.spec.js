// Copy, paste, duplicate, flip and rotate a selection (P4-1, audit DRAW-04).
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding } = require('./creator-helpers');

const G = 28;
const SW = 30, SH = 30;

// A 30 × 30 pattern with one 4 × 3 block of DMC 310 at (3, 3) and a single
// DMC 666 stitch at (20, 3) to its right.
function fixtureProject() {
  const pattern = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (x >= 3 && x <= 6 && y >= 3 && y <= 5) pattern.push({ id: '310', type: 'solid', rgb: [0, 0, 0] });
    else if (x === 20 && y === 3) pattern.push({ id: '666', type: 'solid', rgb: [227, 29, 66] });
    else pattern.push({ id: '__empty__', rgb: [255, 255, 255] });
  }
  return {
    version: 11, page: 'creator', name: 'Selection fixture',
    settings: { sW: SW, sH: SH, fabricCt: 14, isScratchMode: true },
    pattern, bsLines: [], done: null, halfStitches: [], halfDone: [], partialStitches: [],
    parkMarkers: [], sessions: [], threadOwned: {},
  };
}

async function openFixture(page) {
  await quietOnboarding(page);
  await page.goto('/home.html');
  await page.evaluate(async function(project) {
    project.id = 'proj_seltest';
    project.createdAt = project.updatedAt = new Date().toISOString();
    await window.ProjectStorage.save(project, { resurrect: true });
    window.ProjectStorage.setActiveProject(project.id);
  }, fixtureProject());
  await page.goto('/create.html');
  await page.waitForSelector('.cs-chart-scroll canvas', { timeout: 20000 });
  await page.waitForTimeout(500);
}

async function saved(page) {
  return page.evaluate(async function() {
    const p = await ProjectStorage.getActiveProject();
    return p ? p.pattern.map(function(c) { return c.id; }) : null;
  });
}
const stitched = (ids) => ids.filter(id => id !== '__skip__' && id !== '__empty__').length;

// Viewport point at the centre of a cell.
async function cellPoint(page, gx, gy) {
  const geo = await page.evaluate(function() {
    const c = document.querySelector('.cs-chart-scroll canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width };
  });
  const cs = (geo.width - G - 2) / SW;
  return { x: geo.left + G + (gx + 0.5) * cs, y: geo.top + G + (gy + 0.5) * cs, cs };
}

async function touch(cdp, type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), radiusX: 4, radiusY: 4, force: 1 }],
  });
}

test.describe('Selection actions on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('a motif is duplicated, dragged into place and undone in one step', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(13);

    // Wand: More › Wand, in Draw mode.
    await page.locator('.creator-rail button[aria-label="More tools"]').tap();
    await page.getByRole('button', { name: 'Magic wand' }).tap();
    await page.locator('.creator-rail button[data-mode="draw"]').tap();
    const cdp = await page.context().newCDPSession(page);
    const p = await cellPoint(page, 4, 4);
    await touch(cdp, 'touchStart', p.x, p.y);
    await touch(cdp, 'touchEnd', p.x, p.y);

    // The bar over the selection: Duplicate floats a copy 2 stitches down and right.
    const bar = page.locator('.cs-selbar');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('data-float', 'false');
    await bar.getByRole('button', { name: 'Duplicate' }).tap();
    await expect(bar).toHaveAttribute('data-float', 'true');

    // Drag it from (6, 6), inside the copy, to (16, 16): ten stitches each way.
    const from = await cellPoint(page, 6, 6), to = await cellPoint(page, 16, 16);
    await touch(cdp, 'touchStart', from.x, from.y);
    for (let i = 1; i <= 10; i++) {
      await touch(cdp, 'touchMove', from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10);
    }
    await touch(cdp, 'touchEnd', to.x, to.y);
    // The bar follows the selection; let it settle before tapping it.
    await expect.poll(async () => {
      const a = await bar.boundingBox(); await page.waitForTimeout(100); const b = await bar.boundingBox();
      return a && b && a.x === b.x && a.y === b.y;
    }).toBe(true);
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(page.locator('.cs-selbar[data-float="true"]')).toHaveCount(0);

    // 12 more stitches: the copy started at (5, 5) and moved ten stitches
    // each way, to (15..18, 15..17).
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(25);
    const ids = await saved(page);
    expect(ids[15 * SW + 15]).toBe('310');
    expect(ids[17 * SW + 18]).toBe('310');
    expect(ids[14 * SW + 15]).toBe('__empty__');
    expect(ids[3 * SW + 3]).toBe('310');

    // One Undo takes the whole duplicate away.
    await page.getByRole('button', { name: 'Undo', exact: true }).first().tap();
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(13);
  });
});

test.describe('Selection shortcuts on a desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('Ctrl+C and Ctrl+V copy and paste, and Shift+H flips', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(13);

    // Select every stitch, copy, and paste: the copy floats over the
    // original until it is dragged down 10 stitches and placed.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    const bar = page.locator('.cs-selbar[data-float="true"]');
    await expect(bar).toBeVisible();
    const from = await cellPoint(page, 4, 4), to = await cellPoint(page, 4, 14);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await bar.getByRole('button', { name: 'Done' }).click();
    await expect.poll(async () => {
      const ids = await saved(page);
      return [ids[13 * SW + 3], ids[13 * SW + 20], stitched(ids)].join(',');
    }, { timeout: 10000 }).toBe('310,666,26');
    await page.keyboard.press('Control+z');
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(13);

    // Shift+H flips the selection where it is: the block (columns 3-6) and
    // the stitch (column 20) swap ends of the box.
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Shift+H');
    await page.locator('.cs-selbar[data-float="true"]').getByRole('button', { name: 'Done' }).click();
    await expect.poll(async () => {
      const ids = await saved(page);
      return [ids[3 * SW + 3], ids[3 * SW + 17], ids[3 * SW + 20], stitched(ids)].join(',');
    }, { timeout: 10000 }).toBe('666,310,310,13');

    // Undo puts the original back.
    await page.keyboard.press('Control+z');
    await expect.poll(async () => {
      const ids = await saved(page);
      return [ids[3 * SW + 3], ids[3 * SW + 20]].join(',');
    }, { timeout: 10000 }).toBe('310,666');
  });

  test('rotating a selection turns it about its centre', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(13);
    // Wand-select the block, rotate clockwise, place by clicking outside.
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByRole('button', { name: 'Magic wand' }).click();
    const p = await cellPoint(page, 4, 4);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('.');
    await expect(page.locator('.cs-selbar[data-float="true"]')).toBeVisible();
    const out = await cellPoint(page, 25, 25);
    await page.mouse.click(out.x, out.y);
    await expect(page.locator('.cs-selbar[data-float="true"]')).toHaveCount(0);
    // 4 wide × 3 tall at (3..6, 3..5) turns about its centre into 3 wide ×
    // 4 tall at (4..6, 3..6).
    await expect.poll(async () => {
      const ids = await saved(page);
      const cells = [];
      ids.forEach((id, i) => { if (id === '310') cells.push((i % SW) + ':' + Math.floor(i / SW)); });
      return cells.join(' ');
    }, { timeout: 10000 }).toBe('4:3 5:3 6:3 4:4 5:4 6:4 4:5 5:5 6:5 4:6 5:6 6:6');
  });
});
