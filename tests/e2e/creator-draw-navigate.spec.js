// P1-1 (audit DRAW-01): Navigate | Draw in the Creator, matching the
// Tracker's Mark | Navigate.
const path = require('path');
const { test, expect, devices } = require('@playwright/test');
const { dispatchTouchSequence, getLargestCanvas } = require('./touch-helpers');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');
const pixel5 = Object.assign({}, devices['Pixel 5']);
delete pixel5.defaultBrowserType;

async function generateLogo(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      });
    } catch (e) {}
  });
  await page.goto('/home.html?tab=create');
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(function() { return false; })) await skip.click();
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel');
  await page.getByRole('button', { name: 'Generate pattern' }).first().click();
  await page.waitForSelector('.rpanel--edit', { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function zoomUntilScrollable(page, canvas) {
  const container = canvas.locator('xpath=..');
  for (let i = 0; i < 12; i++) {
    const overflows = await container.evaluate(function(el) {
      return el.scrollWidth > el.clientWidth + 40 && el.scrollHeight > el.clientHeight + 40;
    });
    if (overflows) break;
    await page.evaluate(function() { var b = document.querySelector('[aria-label="Zoom in"]'); if (b) b.click(); });
    await page.waitForTimeout(80);
  }
  await container.evaluate(function(el) {
    el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
  });
  return container;
}

async function swipe(page, container) {
  const box = await container.boundingBox();
  const x0 = box.x + box.width * 0.7, y0 = box.y + box.height * 0.6;
  const steps = [{ type: 'touchStart', touchPoints: [{ id: 1, x: x0, y: y0 }] }];
  for (let i = 1; i <= 12; i++) steps.push({ type: 'touchMove', touchPoints: [{ id: 1, x: x0 - i * 12, y: y0 - i * 6 }] });
  steps.push({ type: 'touchEnd', touchPoints: [] });
  await dispatchTouchSequence(page, steps);
}

const toggle = (page, mode) => page.locator('.tb-mode-toggle [data-mode="' + mode + '"]');

test.describe('Navigate | Draw on Pixel 5', function() {
  test.use(pixel5);

  test('opens in Navigate; a swipe scrolls without an edit', async function({ page }) {
    await generateLogo(page);
    await expect(toggle(page, 'navigate')).toHaveAttribute('aria-pressed', 'true');
    const box = await toggle(page, 'navigate').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    const container = await zoomUntilScrollable(page, await getLargestCanvas(page));
    const before = await container.evaluate(function(el) { return el.scrollLeft + ',' + el.scrollTop; });
    await swipe(page, container);
    await expect.poll(function() { return container.evaluate(function(el) { return el.scrollLeft + ',' + el.scrollTop; }); }).not.toBe(before);
    await expect(undo).toBeDisabled();
  });

  test('tapping Paint switches to Draw and a tap paints; Navigate then scrolls again', async function({ page }) {
    await generateLogo(page);
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(toggle(page, 'draw')).toHaveAttribute('aria-pressed', 'true');

    const swatches = page.locator('.swatch-scroll-inner button');
    const idx = await swatches.evaluateAll(function(els) {
      return els.findIndex(function(el) {
        const rgb = (getComputedStyle(el).backgroundColor.match(/\d+/g) || []).map(Number);
        return rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) < 600;
      });
    });
    await swatches.nth(idx).tap();
    const cbox = await (await getLargestCanvas(page)).boundingBox();
    for (const f of [[0.12, 0.12], [0.5, 0.5], [0.88, 0.2], [0.2, 0.85]]) {
      if (!(await undo.isDisabled())) break;
      await page.touchscreen.tap(cbox.x + cbox.width * f[0], cbox.y + cbox.height * f[1]);
      await page.waitForTimeout(150);
    }
    await expect(undo).toBeEnabled();
    const edits = await page.evaluate(function() { return document.querySelector('[aria-label="Undo"]').disabled; });
    expect(edits).toBe(false);

    await toggle(page, 'navigate').tap();
    await expect(toggle(page, 'navigate')).toHaveAttribute('aria-pressed', 'true');
    const container = await zoomUntilScrollable(page, await getLargestCanvas(page));
    const before = await container.evaluate(function(el) { return el.scrollLeft + ',' + el.scrollTop; });
    await swipe(page, container);
    await expect.poll(function() { return container.evaluate(function(el) { return el.scrollLeft + ',' + el.scrollTop; }); }).not.toBe(before);
  });
});

test.describe('Desktop', function() {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('starts in Draw with Paint armed; the toggle is in the Tools tab', async function({ page }) {
    await generateLogo(page);
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tb-mode-toggle')).toHaveCount(0);
    await page.locator('.creator-sidebar-tab[data-tab-id="tools"]').click();
    await expect(page.getByRole('group', { name: 'Chart mode' }).locator('[data-mode="draw"]')).toHaveAttribute('aria-pressed', 'true');
  });
});
