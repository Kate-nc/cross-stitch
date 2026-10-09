// P0-1 (audit DRAW-01, first part): on touch screens a new pattern must not
// arm the Paint tool, so the first one-finger swipe scrolls the chart instead
// of painting it. Picking Paint still paints; desktop still arms Paint.
const path = require('path');
const { test, expect, devices } = require('@playwright/test');
const { dispatchTouchSequence, getLargestCanvas } = require('./touch-helpers');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');

function device(name) {
  if (name === 'desktop') return { viewport: { width: 1440, height: 900 } };
  const d = Object.assign({}, devices[name]);
  delete d.defaultBrowserType;
  return d;
}

async function quietOnboarding(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      });
    } catch (e) {}
  });
}

async function skipTourIfShown(page) {
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(function() { return false; })) await skip.click();
}

async function generateLogo(page) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel');
  await skipTourIfShown(page);
  await page.getByRole('button', { name: 'Generate pattern' }).first().click();
  await page.waitForSelector('.rpanel--edit', { timeout: 15000 });
  await page.waitForTimeout(300);
}

// Zoom in until the chart overflows its scroll container, so a swipe has
// somewhere to go.
async function zoomUntilScrollable(page, canvas) {
  const container = canvas.locator('xpath=..');
  for (let i = 0; i < 12; i++) {
    const overflows = await container.evaluate(function(el) {
      return el.scrollWidth > el.clientWidth + 40 && el.scrollHeight > el.clientHeight + 40;
    });
    if (overflows) break;
    await page.evaluate(function() {
      var btn = document.querySelector('[aria-label="Zoom in"]');
      if (btn) btn.click();
    });
    await page.waitForTimeout(80);
  }
  await container.evaluate(function(el) {
    el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
    el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
  });
  return container;
}

test.describe('Creator on a phone: no automatic Paint', function() {
  test.use(device('Pixel 5'));

  test('a one-finger swipe on a new pattern scrolls instead of painting', async function({ page }) {
    await generateLogo(page);
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeDisabled();

    const canvas = await getLargestCanvas(page);
    const container = await zoomUntilScrollable(page, canvas);
    const before = await container.evaluate(function(el) { return { l: el.scrollLeft, t: el.scrollTop }; });
    const box = await container.boundingBox();
    const x0 = box.x + box.width * 0.7, y0 = box.y + box.height * 0.6;

    const steps = [{ type: 'touchStart', touchPoints: [{ id: 1, x: x0, y: y0 }] }];
    for (let i = 1; i <= 12; i++) {
      steps.push({ type: 'touchMove', touchPoints: [{ id: 1, x: x0 - i * 12, y: y0 - i * 6 }] });
    }
    steps.push({ type: 'touchEnd', touchPoints: [] });
    await dispatchTouchSequence(page, steps);

    await expect.poll(async function() {
      const after = await container.evaluate(function(el) { return { l: el.scrollLeft, t: el.scrollTop }; });
      return after.l !== before.l || after.t !== before.t;
    }).toBe(true);
    await expect(undo).toBeDisabled();
    await expect(page.getByText('Panning', { exact: true })).toBeVisible();
  });

  test('tapping Paint then a cell paints', async function({ page }) {
    await generateLogo(page);
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeDisabled();

    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');

    // Pick a swatch that is not (near) white so the cell visibly changes.
    const swatches = page.locator('.swatch-scroll-inner button');
    const idx = await swatches.evaluateAll(function(els) {
      return els.findIndex(function(el) {
        const rgb = (getComputedStyle(el).backgroundColor.match(/\d+/g) || []).map(Number);
        return rgb.length >= 3 && (rgb[0] + rgb[1] + rgb[2]) < 600;
      });
    });
    expect(idx).toBeGreaterThanOrEqual(0);
    await swatches.nth(idx).tap();

    const canvas = await getLargestCanvas(page);
    const cbox = await canvas.boundingBox();
    // Try a handful of cells: a cell already in the chosen colour records no edit.
    for (const f of [[0.12, 0.12], [0.5, 0.5], [0.88, 0.2], [0.2, 0.85]]) {
      if (!(await undo.isDisabled())) break;
      await page.touchscreen.tap(cbox.x + cbox.width * f[0], cbox.y + cbox.height * f[1]);
      await page.waitForTimeout(150);
    }
    await expect(undo).toBeEnabled();

    // Tapping Paint again puts the tool down.
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Panning', { exact: true })).toBeVisible();
  });
});

test.describe('Creator on desktop: Paint armed after generating', function() {
  test.use(device('desktop'));

  test('Paint is active after generation', async function({ page }) {
    await generateLogo(page);
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
  });
});
