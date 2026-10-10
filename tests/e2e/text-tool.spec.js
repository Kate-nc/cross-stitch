// Text tool (P4-3, audit DRAW-04 item 5).
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
    version: 11, page: 'creator', name: 'Text fixture',
    settings: { sW: SW, sH: SH, fabricCt: 14, isScratchMode: true },
    pattern, bsLines: [], done: null, halfStitches: [], halfDone: [], partialStitches: [],
    parkMarkers: [], sessions: [], threadOwned: {},
  };
}

async function openFixture(page) {
  await quietOnboarding(page);
  await page.goto('/home.html');
  await page.evaluate(async function(project) {
    project.id = 'proj_texttest';
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

async function touchTap(page, p) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(p.x), y: Math.round(p.y), radiusX: 4, radiusY: 4, force: 1 }],
  });
  await send('touchStart'); await send('touchEnd');
  await cdp.detach();
}

// The number of stitches the Block font uses for a piece of text.
async function fontStitches(page, text, font) {
  return page.evaluate(function(a) { return window.StitchFonts.renderText(a[0], a[1], {}).cells.length; }, [text, font]);
}

test.describe('Text tool on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('ANNA is typed, placed and undone in one step', async function({ page }) {
    await openFixture(page);
    await expect.poll(async () => stitched(await saved(page) || []), { timeout: 10000 }).toBe(2);
    await page.locator('.creator-rail button[aria-label="More tools"]').tap();
    await page.getByRole('button', { name: 'Text tool' }).tap();
    await touchTap(page, await cellPoint(page, 3, 4));

    const sheet = page.getByRole('dialog', { name: 'Add text' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('textbox', { name: 'Text' }).fill('ANNA');
    await expect(sheet).toContainText('stitches');
    const expected = await fontStitches(page, 'ANNA', 'block');
    await sheet.getByRole('button', { name: 'Place' }).tap();
    await expect(sheet).toHaveCount(0);

    const bar = page.locator('.cs-selbar[data-float="true"]');
    await expect(bar).toBeVisible();
    await expect.poll(async () => {
      const a = await bar.boundingBox(); await page.waitForTimeout(100); const b = await bar.boundingBox();
      return a && b && a.x === b.x && a.y === b.y;
    }).toBe(true);
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(page.locator('.cs-selbar[data-float="true"]')).toHaveCount(0);

    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(2 + expected);
    const ids = await saved(page);
    // The A's top-left stroke starts one stitch in: (4, 4) is stitched, (3, 4) isn't.
    expect(ids[4 * SW + 4]).not.toBe('__empty__');
    expect(ids[4 * SW + 3]).toBe('__empty__');

    await page.getByRole('button', { name: 'Undo', exact: true }).first().tap();
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(2);
  });
});

test.describe('Text tool on a desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('text wider than the pattern is flagged, and a smaller font offered', async function({ page }) {
    await openFixture(page);
    await page.getByRole('button', { name: 'More tools' }).click();
    await page.getByRole('button', { name: 'Text tool' }).click();
    const p = await cellPoint(page, 0, 0);
    await page.mouse.click(p.x, p.y);
    const sheet = page.getByRole('dialog', { name: 'Add text' });
    await sheet.getByRole('radio', { name: 'Serif' }).click();
    await sheet.getByRole('textbox', { name: 'Text' }).fill('Grandma');
    const wide = await page.evaluate(() => window.StitchFonts.textWidth('Grandma', 'serif', {}));
    expect(wide).toBeGreaterThan(30);
    await expect(sheet).toContainText('This text is ' + wide + ' stitches wide; your pattern is 30.');
    await expect(sheet.getByRole('button', { name: 'Resize canvas' })).toBeVisible();
    await sheet.getByRole('button', { name: 'Use a smaller font' }).click();
    await expect(sheet.getByRole('radio', { name: 'Block' })).toHaveAttribute('aria-checked', 'true');
    // Cancel takes the floating text away.
    await sheet.getByRole('button', { name: 'Cancel' }).last().click();
    await expect(page.locator('.cs-selbar[data-float="true"]')).toHaveCount(0);
    await expect.poll(async () => stitched(await saved(page)), { timeout: 10000 }).toBe(2);
  });
});
