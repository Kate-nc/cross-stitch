// Stage 3: Edit's Chart / Stitched switch. Stitched shows the stitched view
// Convert uses (CreatorStitchedPreview) over the chart, at the chart's zoom
// and scroll position; painting is off there, with a note saying how to get
// back; S switches between the two.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, generateLogo, zoomUntilScrollable, pickDarkSwatch, chooseTool, undoButton } = require('./creator-helpers');

const switchBtn = (page, name) => page.locator('.chart-view-switch').getByRole('radio', { name: name, exact: true });

async function view(page) {
  return page.locator('.cs-chart-scroll').evaluate(function(el) {
    const canvas = el.querySelector('canvas');
    return { left: el.scrollLeft, top: el.scrollTop, w: canvas.width, h: canvas.height,
      zoom: (document.querySelector('.creator-optbar__zoom input[type=range], .tb-zoom-grp input[type=range]') || {}).value };
  });
}

test.describe('Chart / Stitched on a desktop', function() {
  test.use(device('desktop'));

  test('the switch is in the chart\'s bottom-right corner, clear of Your pattern is ready', async function({ page }) {
    await generateLogo(page);
    const sw = await page.locator('.chart-view-switch').boundingBox();
    const scroll = await page.locator('.cs-chart-scroll').boundingBox();
    expect(sw.y + sw.height).toBeGreaterThan(scroll.y + scroll.height - 60);
    expect(sw.x + sw.width).toBeGreaterThan(scroll.x + scroll.width - 60);
    await expect(switchBtn(page, 'Stitched')).toBeVisible();
    await switchBtn(page, 'Stitched').click({ trial: true });   // nothing covers it
  });

  test('switching keeps the zoom and the middle stitch, and Stitched shows Convert\'s stitched view', async function({ page }) {
    await generateLogo(page);
    const box = await zoomUntilScrollable(page);
    await box.evaluate(function(el) { el.scrollLeft = Math.floor(el.scrollLeft * 0.6); el.scrollTop = Math.floor(el.scrollTop * 1.3); });
    const before = await view(page);
    await expect(switchBtn(page, 'Chart')).toHaveAttribute('aria-checked', 'true');

    await switchBtn(page, 'Stitched').click();
    await expect(switchBtn(page, 'Stitched')).toHaveAttribute('aria-checked', 'true');
    const overlay = page.locator('[data-chart-stitched]');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('canvas.cvp-stitched__canvas')).toHaveCount(1);
    expect(await view(page)).toEqual(before);

    // The stitched picture covers exactly the chart's grid.
    const geo = await page.evaluate(function() {
      const o = document.querySelector('[data-chart-stitched]').getBoundingClientRect();
      const c = document.querySelector('.cs-chart-layer > canvas').getBoundingClientRect();
      return { right: c.right - o.right, bottom: c.bottom - o.bottom };
    });
    expect(Math.abs(geo.right - 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(geo.bottom - 2)).toBeLessThanOrEqual(1);

    await switchBtn(page, 'Chart').click();
    await expect(overlay).toHaveCount(0);
    expect(await view(page)).toEqual(before);
  });

  test('clicking the chart in Stitched changes no stitch; it paints again on the chart', async function({ page }) {
    await generateLogo(page);
    await pickDarkSwatch(page);
    await chooseTool(page, 'Paint tool');
    await switchBtn(page, 'Stitched').click();
    await expect(page.locator('.chart-stitched-hint')).toHaveText('Painting is off. Choose Chart, or press S, to edit.');

    const o = await page.locator('[data-chart-stitched]').boundingBox();
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.4], [0.7, 0.6]]) {
      await page.mouse.click(o.x + o.width * fx, o.y + o.height * fy);
    }
    await page.mouse.move(o.x + o.width * 0.2, o.y + o.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(o.x + o.width * 0.6, o.y + o.height * 0.6, { steps: 6 });
    await page.mouse.up();
    await expect(undoButton(page)).toBeDisabled();

    await switchBtn(page, 'Chart').click();
    await expect(page.locator('[data-chart-stitched]')).toHaveCount(0);
    const c = await page.locator('.cs-chart-layer > canvas').boundingBox();
    // Points in the red, yellow and navy parts of the logo, clear of the bar
    // over the chart's top: at least one is a different colour from the thread.
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.6], [0.5, 0.8]]) {
      await page.mouse.click(c.x + c.width * fx, c.y + c.height * fy);
    }
    await expect(undoButton(page)).toBeEnabled();
  });

  test('Flat and Realistic keep the zoom and the place on the chart too (X6)', async function({ page }) {
    await generateLogo(page);
    const box = await zoomUntilScrollable(page);
    await box.evaluate(function(el) { el.scrollLeft = Math.floor(el.scrollLeft * 0.6); el.scrollTop = Math.floor(el.scrollTop * 1.3); });
    // Flat adds a status line under its canvas, so only the position is compared.
    const at = await box.evaluate(function(el) { return [el.scrollLeft, el.scrollTop]; });
    await page.locator('.creator-sidebar-tab[data-tab-id="view"]').click();
    const showAs = page.getByRole('radiogroup', { name: 'Show the chart as' });
    for (const name of ['Flat', 'Realistic', 'Chart']) {
      await showAs.getByRole('radio', { name: name, exact: true }).click();
      await page.waitForTimeout(400);
      expect(await box.evaluate(function(el) { return [el.scrollLeft, el.scrollTop]; })).toEqual(at);
    }
  });

  test('in Stitched, a drag and a middle-button drag move the chart, and a right-click opens no menu', async function({ page }) {
    await generateLogo(page);
    await pickDarkSwatch(page);
    await chooseTool(page, 'Paint tool');
    const box = await zoomUntilScrollable(page);
    await switchBtn(page, 'Stitched').click();
    const o = await page.locator('[data-chart-stitched]').boundingBox();
    const scroll = await box.boundingBox();
    const cx = scroll.x + scroll.width / 2, cy = scroll.y + scroll.height / 2;
    const pos = () => box.evaluate(function(el) { return [el.scrollLeft, el.scrollTop]; });

    let before = await pos();
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy - 80, { steps: 8 });
    await page.mouse.up();
    let after = await pos();
    expect(after[0]).toBeGreaterThan(before[0] + 60);

    before = after;
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cx + 100, cy + 60, { steps: 8 });
    await page.mouse.up({ button: 'middle' });
    after = await pos();
    expect(after[0]).toBeLessThan(before[0] - 40);

    await page.mouse.click(cx, cy, { button: 'right' });
    await expect(page.locator('.cs-context-menu, [role="menu"]').filter({ hasText: 'Replace' })).toHaveCount(0);
    await expect(undoButton(page)).toBeDisabled();
    expect(o.width).toBeGreaterThan(0);
  });

  test('after Stitched, Flat then Chart is the editable chart again; S from Flat shows Stitched', async function({ page }) {
    await generateLogo(page);
    await page.locator('.cs-chart-scroll').hover();
    await page.keyboard.press('s');
    await expect(page.locator('[data-chart-stitched]')).toBeVisible();
    await page.locator('.creator-sidebar-tab[data-tab-id="view"]').click();
    const showAs = page.getByRole('radiogroup', { name: 'Show the chart as' });
    await showAs.getByRole('radio', { name: 'Flat', exact: true }).click();
    await showAs.getByRole('radio', { name: 'Chart', exact: true }).click();
    await expect(page.locator('[data-chart-stitched]')).toHaveCount(0);
    await expect(switchBtn(page, 'Chart')).toHaveAttribute('aria-checked', 'true');

    await showAs.getByRole('radio', { name: 'Flat', exact: true }).click();
    await page.locator('.cs-chart-scroll').hover();
    await page.keyboard.press('s');
    await expect(switchBtn(page, 'Stitched')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-chart-stitched]')).toBeVisible();
  });

  test('S switches between the chart and the stitched view', async function({ page }) {
    await generateLogo(page);
    await page.locator('.cs-chart-scroll').hover();
    await page.keyboard.press('s');
    await expect(switchBtn(page, 'Stitched')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-chart-stitched]')).toBeVisible();
    await page.keyboard.press('s');
    await expect(switchBtn(page, 'Chart')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-chart-stitched]')).toHaveCount(0);
  });
});

test.describe('Chart / Stitched on a Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('the switch is in the chart\'s corner and Stitched works', async function({ page }) {
    await generateLogo(page);
    await switchBtn(page, 'Stitched').click();
    await expect(page.locator('[data-chart-stitched]')).toBeVisible();
    await expect(page.locator('.chart-stitched-hint')).toHaveText('Painting is off. Choose Chart to edit.');
    const sw = await page.locator('.chart-view-switch').boundingBox();
    const scroll = await page.locator('.cs-chart-scroll').boundingBox();
    expect(sw.y).toBeLessThan(scroll.y + 60);
    expect(sw.x + sw.width).toBeGreaterThan(scroll.x + scroll.width - 60);
    for (const r of await page.locator('.chart-view-switch .lp-seg').all()) {
      expect((await r.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('two fingers zoom the stitched view, and a tap paints nothing', async function({ page }) {
    await generateLogo(page);
    await page.locator('.creator-rail button[aria-label="Paint tool"], .creator-rail [data-tool="paint"]').first().click();
    await switchBtn(page, 'Stitched').click();
    const o = await page.locator('[data-chart-stitched]').boundingBox();
    const widthBefore = o.width;
    const cdp = await page.context().newCDPSession(page);
    const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
    const pts = (d) => [{ x: cx - d, y: cy, radiusX: 4, radiusY: 4, force: 1, id: 1 }, { x: cx + d, y: cy, radiusX: 4, radiusY: 4, force: 1, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(30) });
    for (const d of [45, 60, 80, 100]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async function() { return (await page.locator('[data-chart-stitched]').boundingBox()).width; }, { timeout: 5000 }).toBeGreaterThan(widthBefore + 20);

    const n = await page.locator('[data-chart-stitched]').boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: n.x + n.width / 2, y: n.y + n.height / 2, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);
    await expect(page.locator('.creator-rail').getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  });
});
