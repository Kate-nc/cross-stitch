// Stage 2: the tool-rail layout for Edit with a mouse (creator.desktopRail).
// A tool rail down the left, one options bar above the chart, and the
// pattern actions in the header row. Touch layouts don't change.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, generateLogo, zoomUntilScrollable } = require('./creator-helpers');

function railPref(page, on) {
  return page.addInitScript(function(v) {
    try { localStorage.setItem('cs_pref_creator.desktopRail', JSON.stringify(v)); } catch (e) {}
  }, on);
}

test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    let hook;
    Object.defineProperty(window, 'useCreatorState', {
      configurable: true,
      get: () => hook,
      set: (fn) => { hook = function () { const s = fn(); window.__cs = s; return s; }; },
    });
  });
});

// Viewport point at the centre of chart cell (gx, gy).
async function cellPoint(page, gx, gy) {
  return page.locator('.cs-chart-scroll canvas').first().evaluate((el, at) => {
    const s = window.__cs, r = el.getBoundingClientRect();
    return { x: r.left + s.G + (at[0] + 0.5) * s.cs, y: r.top + s.G + (at[1] + 0.5) * s.cs };
  }, [gx, gy]);
}
const cellId = (page, gx, gy) => page.evaluate((at) => { const s = window.__cs; return s.pat[at[1] * s.sW + at[0]].id; }, [gx, gy]);
const selected = (page) => page.evaluate(() => window.__cs.selectedColorId);
const edits = (page) => page.evaluate(() => window.__cs.editHistory.length);
const railBtn = (page, id) => page.locator('.creator-drail [data-tool="' + id + '"]');

// A cell of a colour other than the working thread, away from the edges.
async function otherColourCell(page) {
  return page.evaluate(() => {
    const s = window.__cs;
    for (let gy = 20; gy < s.sH - 10; gy++) for (let gx = 20; gx < s.sW - 10; gx++) {
      const id = s.pat[gy * s.sW + gx].id;
      if (id !== s.selectedColorId && id !== '__skip__' && id !== '__empty__') return { gx, gy, id };
    }
    return null;
  });
}

// The "Your pattern is ready" card lies over the top of the chart; close it.
async function closeReadyBar(page) {
  const close = page.locator('.ready-bar button[aria-label*="Close"], .ready-bar button[aria-label*="Dismiss"]').first();
  if (await close.count()) await close.click();
}

test.describe('Tool rail on a 1440 x 900 desktop', () => {
  test.use(device('desktop'));

  test('the chart starts within 110px of the top and the bars are in place', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    const rail = page.locator('.creator-drail');
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox()).width).toBe(56);
    const bar = page.locator('.creator-optbar');
    expect(Math.round((await bar.boundingBox()).height)).toBe(44);
    const chart = await page.locator('.cs-chart-scroll').boundingBox();
    expect(chart.y).toBeLessThanOrEqual(110);
    // The pill, the colour row and the old action bar row are gone.
    await expect(page.locator('.toolbar-row')).toHaveCount(0);
    await expect(page.locator('.swatch-strip-row')).toHaveCount(0);
    await expect(page.locator('.creator-actionbar:not(.creator-actionbar--inline)')).toBeHidden();
    // Zoom and Fit at the options bar's right end, at least 32px tall.
    for (const name of ['Zoom in', 'Zoom out', 'Fit']) {
      const b = await bar.getByRole('button', { name, exact: name !== 'Fit' }).first().boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(32);
    }
    // The rail's order and its foot.
    const ids = await rail.locator('.creator-drail__tools [data-tool]').evaluateAll(els => els.map(e => e.dataset.tool));
    expect(ids).toEqual(['paint', 'fill', 'erase', 'pick', 'wand', 'lasso', 'shapes', 'text', 'hand']);
    await expect(rail.locator('[data-tool="undo"]')).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    await expect(rail.locator('[data-tool="redo"]')).toHaveAttribute('title', 'Redo (Ctrl+Y)');
  });

  test('each rail button switches tool in one click, and the next chart click uses it', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    await closeReadyBar(page);
    const working = await selected(page);
    expect(working).toBeTruthy();

    // Paint
    await railBtn(page, 'paint').click();
    await expect(railBtn(page, 'paint')).toHaveAttribute('aria-pressed', 'true');
    let p = await cellPoint(page, 5, 5);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => cellId(page, 5, 5)).toBe(working);

    // Erase
    await railBtn(page, 'erase').click();
    await expect(railBtn(page, 'erase')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => cellId(page, 5, 5)).not.toBe(working);

    // Fill: the patch around the cell takes the working thread.
    await railBtn(page, 'fill').click();
    await expect(railBtn(page, 'fill')).toHaveAttribute('aria-pressed', 'true');
    const f = await cellPoint(page, 8, 8);
    expect(await cellId(page, 9, 8)).toBe(await cellId(page, 8, 8));
    await page.mouse.click(f.x, f.y);
    await expect.poll(() => cellId(page, 8, 8)).toBe(working);
    await expect.poll(() => cellId(page, 9, 8)).toBe(working);

    // Pick: the clicked stitch's thread becomes the working thread.
    const other = await otherColourCell(page);
    expect(other).toBeTruthy();
    await railBtn(page, 'pick').click();
    await expect(railBtn(page, 'pick')).toHaveAttribute('aria-pressed', 'true');
    p = await cellPoint(page, other.gx, other.gy);
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => selected(page)).toBe(other.id);

    // Wand: one click selects.
    await railBtn(page, 'wand').click();
    await expect(railBtn(page, 'wand')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.click(p.x, p.y);
    await expect(page.locator('.creator-optbar__count')).toContainText('selected');
    await page.locator('.creator-optbar').getByRole('button', { name: 'Deselect' }).click();
    await expect(page.locator('.creator-optbar__count')).toHaveCount(0);

    // Lasso: a freehand loop selects what it encloses.
    await railBtn(page, 'lasso').click();
    await expect(railBtn(page, 'lasso')).toHaveAttribute('aria-pressed', 'true');
    const a = await cellPoint(page, 30, 30), b = await cellPoint(page, 60, 60);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, a.y, { steps: 8 });
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.move(a.x, b.y, { steps: 8 });
    await page.mouse.move(a.x, a.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('.creator-optbar__count')).toContainText('selected');
    await page.keyboard.press('Escape');
    await expect(page.locator('.creator-optbar__count')).toHaveCount(0);

    // Shapes: one button; the menu offers Line, Rectangle and Ellipse.
    await railBtn(page, 'shapes').click();
    await expect(railBtn(page, 'shapes')).toHaveAttribute('aria-pressed', 'true');
    const menu = page.getByRole('menu', { name: 'Shapes' });
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Line', 'Rectangle', 'Ellipse']);
    await menu.getByRole('menuitemradio', { name: 'Line' }).click();
    await expect(menu).toHaveCount(0);
    const before = await edits(page);
    const l0 = await cellPoint(page, 2, 2), l1 = await cellPoint(page, 12, 2);
    await page.mouse.move(l0.x, l0.y);
    await page.mouse.down();
    await page.mouse.move(l1.x, l1.y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => edits(page)).toBe(before + 1);

    // Text: a click opens the text sheet.
    await railBtn(page, 'text').click();
    await expect(railBtn(page, 'text')).toHaveAttribute('aria-pressed', 'true');
    const t = await cellPoint(page, 10, 90);
    await page.mouse.click(t.x, t.y);
    await expect(page.locator('.cs-textsheet')).toBeVisible();
    await page.keyboard.press('Escape');

    // Hand: a drag moves the chart and changes nothing.
    await railBtn(page, 'hand').click();
    await expect(railBtn(page, 'hand')).toHaveAttribute('aria-pressed', 'true');
    const box = await zoomUntilScrollable(page);
    const startScroll = await box.evaluate(el => el.scrollLeft);
    const editsBefore = await edits(page);
    const bb = await box.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 - 120, bb.y + bb.height / 2, { steps: 6 });
    await page.mouse.up();
    expect(await box.evaluate(el => el.scrollLeft)).toBeGreaterThan(startScroll + 60);
    expect(await edits(page)).toBe(editsBefore);
  });

  test('Space and drag, or a middle-button drag, pans with Paint chosen and paints nothing', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    await closeReadyBar(page);
    await railBtn(page, 'paint').click();
    const box = await zoomUntilScrollable(page);
    const bb = await box.boundingBox();
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    const editsBefore = await edits(page);

    let start = await box.evaluate(el => el.scrollLeft);
    await page.mouse.move(cx, cy);
    await page.keyboard.down('Space');
    await page.mouse.down();
    await page.mouse.move(cx - 150, cy, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    expect(await box.evaluate(el => el.scrollLeft)).toBeGreaterThan(start + 80);

    start = await box.evaluate(el => el.scrollLeft);
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx - 150, cy, { steps: 6 });
    await page.mouse.up({ button: 'middle' });
    expect(await box.evaluate(el => el.scrollLeft)).toBeGreaterThan(start + 80);

    expect(await edits(page)).toBe(editsBefore);
    // Paint is still the tool.
    await expect(railBtn(page, 'paint')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the options bar follows the tool', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    await closeReadyBar(page);
    const bar = page.locator('.creator-optbar');

    await railBtn(page, 'paint').click();
    await expect(bar.getByRole('combobox', { name: 'Stitch type' })).toBeVisible();
    await expect(bar.getByRole('combobox', { name: 'Brush size' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Mirror' })).toBeVisible();

    await railBtn(page, 'erase').click();
    await expect(bar.getByRole('combobox', { name: 'Brush size' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Mirror' })).toBeVisible();

    await railBtn(page, 'fill').click();
    await expect(bar.getByRole('combobox', { name: 'Stitch type' })).toBeVisible();
    await expect(bar).toContainText('this patch');

    await railBtn(page, 'wand').click();
    await expect(bar.getByRole('slider', { name: 'Tolerance' })).toBeVisible();
    for (const name of ['Connected only', 'All matching', 'New', 'Add', 'Subtract', 'Intersect']) {
      await expect(bar.getByRole('radio', { name, exact: true })).toBeVisible();
    }

    // A selection: its size, Deselect, Invert, Select all and the Selection menu.
    await page.keyboard.press('Control+a');
    await expect(bar.locator('.creator-optbar__count')).toContainText('selected');
    for (const name of ['Deselect', 'Invert', 'Select all']) {
      await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await bar.getByRole('button', { name: 'Selection menu' }).click();
    const selMenu = page.getByRole('menu', { name: 'Selection' });
    for (const name of ['Reduce confetti…', 'Reduce colours…', 'Replace colour…', 'Stitch info…', 'Outline…']) {
      await expect(selMenu.getByRole('menuitem', { name })).toBeVisible();
    }
    await page.keyboard.press('Escape');
    await bar.getByRole('button', { name: 'Deselect' }).click();

    // A highlighted thread: Palette > Show on chart.
    const show = page.getByRole('button', { name: /^Show on chart/ }).first();
    await show.click();
    await expect(bar.locator('.creator-optbar__hi')).toContainText(/Showing .+ on chart/);
    await bar.getByRole('button', { name: 'Clear the highlighted thread' }).click();
    await expect(bar.locator('.creator-optbar__hi')).toHaveCount(0);
  });

  test('More lists no tool that is on the rail', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    await page.locator('.creator-optbar button[aria-label="More tools"]').click();
    const more = page.locator('.tb-more-panel');
    await expect(more).toBeVisible();
    const listed = await more.locator('[data-tool]').evaluateAll(els => els.map(e => e.dataset.tool));
    for (const id of ['paint', 'fill', 'erase', 'pick', 'wand', 'lasso', 'shapes', 'line', 'rect', 'ellipse', 'text', 'hand']) {
      expect(listed).not.toContain(id);
    }
  });

  test('with the preference off, the toolbar pill and action bar are as before', async ({ page }) => {
    await railPref(page, false);
    await generateLogo(page);
    await expect(page.locator('.toolbar-row')).toBeVisible();
    await expect(page.locator('.creator-actionbar')).toBeVisible();
    await expect(page.locator('.creator-drail')).toHaveCount(0);
    await expect(page.locator('.creator-optbar')).toHaveCount(0);
  });
});

test.describe('Tool rail on a 1280 x 720 desktop', () => {
  test.use(Object.assign({}, device('desktop'), { viewport: { width: 1280, height: 720 } }));

  test('the canvas area is at least 75% of the window height', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    const area = await page.locator('.canvas-area').boundingBox();
    expect(area.height).toBeGreaterThanOrEqual(720 * 0.75);
    expect((await page.locator('.cs-chart-scroll').boundingBox()).y).toBeLessThanOrEqual(110);
  });
});

test.describe('Tool rail preference on a phone', () => {
  test.use(device('Pixel 5'));

  test('a touch screen keeps the bottom rail', async ({ page }) => {
    await railPref(page, true);
    await generateLogo(page);
    await expect(page.locator('.creator-rail')).toBeVisible();
    await expect(page.locator('.creator-drail')).toHaveCount(0);
  });
});
