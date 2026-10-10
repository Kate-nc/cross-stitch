// Line, rectangle and ellipse tools, and mirror drawing (P4-2, audit DRAW-04).
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding } = require('./creator-helpers');

const G = 28;
const SW = 30, SH = 30;

// A blank 30 × 30 design with DMC 310 and 666 in its palette (one stitch
// each, in the bottom corners).
function fixtureProject() {
  const pattern = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (x === 0 && y === 29) pattern.push({ id: '310', type: 'solid', rgb: [0, 0, 0] });
    else if (x === 29 && y === 29) pattern.push({ id: '666', type: 'solid', rgb: [227, 29, 66] });
    else pattern.push({ id: '__empty__', rgb: [255, 255, 255] });
  }
  return {
    version: 11, page: 'creator', name: 'Shapes fixture',
    settings: { sW: SW, sH: SH, fabricCt: 14, isScratchMode: true },
    pattern, bsLines: [], done: null, halfStitches: [], halfDone: [], partialStitches: [],
    parkMarkers: [], sessions: [], threadOwned: {},
  };
}

async function openFixture(page) {
  await quietOnboarding(page);
  await page.goto('/home.html');
  await page.evaluate(async function(project) {
    project.id = 'proj_shapetest';
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

async function cellPoint(page, gx, gy) {
  const geo = await page.evaluate(function() {
    const c = document.querySelector('.cs-chart-scroll canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width };
  });
  const cs = (geo.width - G - 2) / SW;
  return { x: geo.left + G + (gx + 0.5) * cs, y: geo.top + G + (gy + 0.5) * cs };
}

async function touchDrag(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), radiusX: 4, radiusY: 4, force: 1 }],
  });
  await send('touchStart', from.x, from.y);
  for (let i = 1; i <= 12; i++) await send('touchMove', from.x + (to.x - from.x) * i / 12, from.y + (to.y - from.y) * i / 12);
  await send('touchEnd', to.x, to.y);
  await cdp.detach();
}

async function railMore(page, name) {
  await page.locator('.creator-rail button[aria-label="More tools"]').tap();
  await page.getByRole('button', { name }).tap();
}

test.describe('Shapes and mirror on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('a rectangle outline is one drag and one undo step', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(2);
    await railMore(page, 'Rectangle tool');
    // A 10 × 10 box from (5, 5) to (14, 14): 36 stitches.
    await touchDrag(page, await cellPoint(page, 5, 5), await cellPoint(page, 14, 14));
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(38);
    const ids = await saved(page);
    expect(ids[5 * SW + 5]).not.toBe('__empty__');
    expect(ids[14 * SW + 9]).not.toBe('__empty__');
    expect(ids[9 * SW + 9]).toBe('__empty__');
    await page.getByRole('button', { name: 'Undo', exact: true }).first().tap();
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(2);
  });

  test('with mirror drawing on, a stroke on the left appears on the right, and one undo removes both', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(2);
    await railMore(page, 'Mirror drawing');
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    // Columns 3 to 8 of row 10; the axis is at the centre (15), so the mirror
    // image covers columns 21 to 26.
    await touchDrag(page, await cellPoint(page, 3, 10), await cellPoint(page, 8, 10));
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(14);
    const ids = await saved(page);
    for (let x = 3; x <= 8; x++) {
      expect(ids[10 * SW + x]).not.toBe('__empty__');
      expect(ids[10 * SW + (29 - x)]).toBe(ids[10 * SW + x]);
    }
    await expect(page.locator('.cs-mirror-grip')).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).first().tap();
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(2);
  });
});

test.describe('Shapes and mirror on a desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('a snapped line, a filled ellipse and a moved mirror axis', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(2);
    const drag = async (a, b) => {
      await page.mouse.move(a.x, a.y); await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
    };

    // Line with snapping on: (2, 2) to (12, 4) snaps to a straight row.
    await page.getByRole('tab', { name: /Tools/ }).click().catch(() => {});
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByRole('button', { name: 'Line tool' }).click();
    const snap = page.getByRole('checkbox', { name: /Keep lines straight/ });
    if (await snap.count()) { if (!(await snap.isChecked())) await snap.check(); }
    await drag(await cellPoint(page, 2, 2), await cellPoint(page, 12, 4));
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(13);
    let ids = await saved(page);
    for (let x = 2; x <= 12; x++) expect(ids[2 * SW + x]).not.toBe('__empty__');

    // Filled ellipse inside (2, 8)–(10, 12).
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByRole('button', { name: 'Ellipse tool' }).click();
    const filled = page.getByRole('radio', { name: 'Filled' });
    if (await filled.count()) await filled.click();
    await drag(await cellPoint(page, 2, 8), await cellPoint(page, 10, 12));
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBeGreaterThan(13 + 20);
    ids = await saved(page);
    expect(ids[10 * SW + 6]).not.toBe('__empty__');
    expect(ids[8 * SW + 2]).toBe('__empty__');

    // Mirror on, axis moved two stitches right with the keyboard.
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByRole('button', { name: 'Mirror drawing' }).click();
    const grip = page.getByRole('slider', { name: /mirror axis/ });
    await grip.focus();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(grip).toHaveAttribute('aria-valuenow', '17');
    // A 1 × 1 line at (20, 20) mirrors about 17 to (13, 20).
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByRole('button', { name: 'Line tool' }).click();
    const before = stitched(await saved(page));
    const p = await cellPoint(page, 20, 20);
    await drag(p, p);
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(before + 2);
    ids = await saved(page);
    expect(ids[20 * SW + 13]).not.toBe('__empty__');
  });
});
