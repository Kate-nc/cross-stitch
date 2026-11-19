// Frame the picture follow-ups (reports/create-from-image-workflow, section 9):
// the crop box can be moved and resized, the background Generate leaves out
// is striped on the picture, and a step bar shows Frame, Size, Threads,
// Detail and Generate across the top of Frame and Convert.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, openConvertWithLogo, continueFromFrame, clickGenerate, waitForEdit } = require('./creator-helpers');

const PANORAMA = path.join(__dirname, '..', 'fixtures', 'panorama.jpg');   // 2400 × 300

test.beforeEach(async ({ page, context }) => {
  await installLocalCdn(context);
  // Observe the real state hook, without a production debug interface.
  await page.addInitScript(() => {
    let hook;
    Object.defineProperty(window, 'useCreatorState', { configurable: true, get: () => hook, set: fn => {
      hook = function () { const s = fn(); window.__frameState = s; return s; };
    } });
  });
});

async function openFrame(page, file) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await page.locator('input.home-create-file-input').setInputFiles(file);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('[data-frame-view]');
}

const rectOf = (page) => page.evaluate(() => {
  const r = window.__frameState.cropRect; return r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
});

test.describe('Frame on desktop', function () {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('the crop box moves when dragged and resizes from its handles, keeping a square square', async function ({ page }) {
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    // The logo's white border is guessed as background; once that has been
    // worked out, nothing moves the picture.
    await expect(page.locator('[data-bg-count]')).toHaveCount(1);
    const img = await page.locator('.fr-picture__img').boundingBox();
    // Draw a free box.
    await page.mouse.move(img.x + 40, img.y + 40); await page.mouse.down();
    await page.mouse.move(img.x + 160, img.y + 140, { steps: 6 }); await page.mouse.up();
    expect(await rectOf(page)).toEqual({ x: 40, y: 40, w: 120, h: 100 });
    // A free box has corner and edge handles.
    await expect(page.locator('[data-crop-handle]')).toHaveCount(8);
    // Drag from inside it: it moves, the same size.
    await page.mouse.move(img.x + 100, img.y + 90); await page.mouse.down();
    await page.mouse.move(img.x + 150, img.y + 120, { steps: 6 }); await page.mouse.up();
    expect(await rectOf(page)).toEqual({ x: 90, y: 70, w: 120, h: 100 });
    // The east edge moves only that side.
    const e = await page.locator('[data-crop-handle="e"]').boundingBox();
    await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2); await page.mouse.down();
    await page.mouse.move(img.x + 250, e.y + e.height / 2 + 40, { steps: 6 }); await page.mouse.up();
    expect(await rectOf(page)).toEqual({ x: 90, y: 70, w: 160, h: 100 });

    // Square: corners only, and dragging one keeps it square.
    await page.getByRole('radio', { name: 'Square' }).click();
    await expect(page.locator('[data-crop-handle]')).toHaveCount(4);
    const before = await rectOf(page);
    const se = await page.locator('[data-crop-handle="se"]').boundingBox();
    await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2); await page.mouse.down();
    await page.mouse.move(se.x - 100, se.y - 60, { steps: 6 }); await page.mouse.up();
    const after = await rectOf(page);
    expect(after.w).toBe(after.h);
    expect(after.w).toBeLessThan(before.w);
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    await page.getByRole('button', { name: 'Apply crop' }).click();
    await expect(page.locator('.fr-cropbar__size')).toHaveText(new RegExp('^' + after.w + '×' + after.w + 'px$'));
  });

  test('arrow keys move the focused crop box; Alt and arrows resize it; a click inside does not start a new box', async function ({ page }) {
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    await page.getByRole('radio', { name: '4:3' }).click();
    const start = await rectOf(page);
    // A click inside keeps the box.
    const box = page.locator('[data-crop-rect]');
    await box.click();
    expect(await rectOf(page)).toEqual(start);
    await box.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowUp');
    expect(await rectOf(page)).toEqual({ x: start.x, y: start.y - 12, w: start.w, h: start.h });
    await page.keyboard.press('Alt+ArrowLeft');
    const smaller = await rectOf(page);
    expect(smaller.w).toBe(start.w - 2);
    expect(Math.abs(smaller.w / smaller.h - 4 / 3)).toBeLessThan(0.03);
    // Escape still clears it.
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-crop-rect]')).toHaveCount(0);
  });

  test('the background Generate leaves out is striped on the picture, and the count is what Generate leaves out', async function ({ page }) {
    // The logo is taken for a graphic, with its white border left out.
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    await expect(page.getByRole('checkbox', { name: 'Leave background unstitched' })).toBeChecked();
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(1);
    const key = page.locator('[data-bg-key]');
    await expect(key).toContainText('stitches left unstitched as background');
    const striped = Number(await page.locator('[data-bg-count]').getAttribute('data-bg-count'));
    expect(striped).toBeGreaterThan(1000);

    // Hide and show the stripes.
    await key.getByRole('button', { name: 'Hide stripes' }).click();
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(0);
    await key.getByRole('button', { name: 'Show stripes' }).click();
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(1);

    // Generate leaves out exactly the striped stitches.
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const skipped = await page.evaluate(() => window.__frameState.pat.filter(c => c.id === '__skip__').length);
    expect(skipped).toBe(striped);
  });

  test('with Sharpen details on, the striped count is still what Generate leaves out', async function ({ page }) {
    await openFrame(page, PANORAMA);
    // A sky-blue background on a photo: sharpening moves the edge of the match.
    await page.evaluate(() => {
      const s = window.__frameState;
      s.setSkipBg(true); s.setBgCol([107, 145, 196]); s.setBgTh(12);
      s.setPreSharpen(true); s.setPreSharpenAmount(2);
    });
    await expect(page.locator('[data-bg-count]')).toHaveCount(1);
    await page.waitForTimeout(400);
    const striped = Number(await page.locator('[data-bg-count]').getAttribute('data-bg-count'));
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const skipped = await page.evaluate(() => window.__frameState.pat.filter(c => c.id === '__skip__').length);
    expect(skipped).toBeGreaterThan(0);
    expect(striped).toBe(skipped);
  });

  test('the stripes step aside while you pick the background colour', async function ({ page }) {
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Pick from picture' }).click();
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(1);
  });

  test('exact pixel art has no stripes, and the hint does not promise them', async function ({ page }) {
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'pixel-art-crisp.png'));
    await page.getByRole('checkbox', { name: 'Exact pixel-art import', exact: true }).check();
    await page.evaluate(() => window.__frameState.setSkipBg(true));
    await expect(page.getByText('Only plain areas that touch the picture\'s edge are left unstitched.', { exact: true })).toBeVisible();
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(0);
    await expect(page.locator('[data-bg-key]')).toHaveCount(0);
  });

  test('a looser or stricter match changes the stripes, and turning it off removes them', async function ({ page }) {
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    const count = () => page.locator('[data-bg-count]').getAttribute('data-bg-count').then(Number);
    await expect(page.locator('[data-bg-count]')).toHaveCount(1);
    const first = await count();
    // A background colour nothing at the edge matches: every stitch is kept.
    await page.evaluate(() => window.__frameState.setBgCol([10, 200, 30]));
    await expect(page.locator('[data-bg-key]')).toContainText('every stitch is kept');
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(1);
    expect(await count()).toBe(0);
    await page.evaluate(() => window.__frameState.setBgCol([255, 255, 255]));
    await expect.poll(count).toBe(first);
    await page.getByRole('checkbox', { name: 'Leave background unstitched' }).uncheck();
    await expect(page.locator('[data-bg-key]')).toHaveCount(0);
    await expect(page.locator('[data-bg-overlay]')).toHaveCount(0);
  });

  test('the step bar shows where you are, ticks steps opened, and goes to any of them', async function ({ page }) {
    await openFrame(page, PANORAMA);
    const bar = page.getByRole('navigation', { name: 'Steps to your pattern' });
    const states = () => bar.locator('li').evaluateAll(ls => ls.map(l => l.dataset.step + ':' + l.dataset.stepState).join(' '));
    expect(await states()).toBe('frame:current size:todo threads:todo detail:todo generate:todo');
    await expect(bar.locator('[aria-current="step"]')).toContainText('Frame');
    await expect(bar).toContainText('Step 1 of 5');

    // A box drawn on Frame is applied on the way to a step, as Continue does.
    await page.getByRole('radio', { name: 'Square' }).click();
    await bar.getByRole('button', { name: /Threads/ }).click();
    await expect(page.locator('[data-frame-view]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Threads' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => [window.__frameState.origW, window.__frameState.origH])).toEqual([300, 300]);
    expect(await states()).toBe('frame:done size:todo threads:current detail:todo generate:todo');
    await expect(bar).toContainText('Step 3 of 5');

    // The tabs and the bar agree.
    await page.getByRole('tab', { name: 'Detail' }).click();
    expect(await states()).toBe('frame:done size:todo threads:done detail:current generate:todo');
    await bar.getByRole('button', { name: /Size/ }).click();
    await expect(page.getByRole('tab', { name: 'Size' })).toHaveAttribute('aria-selected', 'true');

    // After Generate, Generate is ticked (back in Convert).
    await clickGenerate(page);
    await waitForEdit(page);
    await page.getByRole('tab', { name: 'Convert' }).first().click();
    expect(await states()).toBe('frame:done size:current threads:done detail:done generate:done');
    await expect(bar).toContainText('Regenerate');

    // Frame goes back to Frame the picture.
    await bar.getByRole('button', { name: /Frame/ }).click();
    await expect(page.locator('[data-frame-view]')).toHaveCount(1);
  });

  test('with Frame the picture turned off, Frame is not ticked as done', async function ({ page }) {
    await page.addInitScript(() => { try { localStorage.setItem('cs_pref_creatorShowFrameStep', 'false'); } catch (e) {} });
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await page.locator('input.home-create-file-input').setInputFiles(PANORAMA);
    await page.waitForURL(/create\.html/);
    await page.waitForSelector('.rpanel', { state: 'attached' });
    const bar = page.getByRole('navigation', { name: 'Steps to your pattern' });
    await expect(bar.locator('[data-step="size"]')).toHaveAttribute('data-step-state', 'current');
    await expect(bar.locator('[data-step="frame"]')).toHaveAttribute('data-step-state', 'todo');
    await bar.getByRole('button', { name: /Frame/ }).click();
    await page.waitForSelector('[data-frame-view]');
    await continueFromFrame(page);
    await expect(bar.locator('[data-step="frame"]')).toHaveAttribute('data-step-state', 'done');
  });

  test('a new picture starts the steps again', async function ({ page }) {
    await openConvertWithLogo(page);
    const bar = page.getByRole('navigation', { name: 'Steps to your pattern' });
    await page.getByRole('tab', { name: 'Detail' }).click();
    await expect(bar.locator('[data-step="detail"]')).toHaveAttribute('data-step-state', 'current');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Change', exact: true }).click()
    ]);
    await chooser.setFiles(PANORAMA);
    await page.waitForSelector('[data-frame-view]');
    expect(await bar.locator('li').evaluateAll(ls => ls.map(l => l.dataset.stepState).join(' '))).toBe('current todo todo todo todo');
  });
});

test.describe('Frame on a phone', function () {
  test.use(device('Pixel 7'));
  test.setTimeout(90000);

  test('a step in the bar opens the settings sheet on it; only the step on screen is named', async function ({ page }) {
    await openFrame(page, PANORAMA);
    const bar = page.getByRole('navigation', { name: 'Steps to your pattern' });
    await expect(bar.locator('[data-step="frame"] .cv-progress__label')).toBeVisible();
    await expect(bar.locator('[data-step="size"] .cv-progress__label')).not.toBeInViewport();
    await page.locator('.cc-continue').tap();
    await expect(page.locator('.rpanel--open')).toHaveCount(0);
    await bar.locator('[data-step="detail"] button').tap();
    await expect(page.locator('.rpanel--open')).toHaveCount(1);
    await expect(page.getByRole('tab', { name: 'Detail' })).toHaveAttribute('aria-selected', 'true');
  });

  test('the crop box handles are big enough to drag with a finger', async function ({ page }) {
    await openFrame(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    await page.getByRole('radio', { name: 'Square' }).tap();
    const size = await page.locator('[data-crop-handle="se"]').evaluate(el => {
      const r = el.getBoundingClientRect(), after = getComputedStyle(el, '::after');
      return { w: r.width, inset: parseFloat(after.left) };
    });
    // 20 px drawn, 44 px to touch.
    expect(size.w).toBeGreaterThanOrEqual(20);
    expect(size.w - 2 * size.inset).toBeGreaterThanOrEqual(44);
  });
});
