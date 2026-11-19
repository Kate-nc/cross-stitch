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
});
