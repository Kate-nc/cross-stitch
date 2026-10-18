// UX-004: F is focus mode only; the layer toggles are Shift+F/H/K/L; a hidden layer shows a chip with one-click restore.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  });
});

async function seed(page) {
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async () => {
    const a = { id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0] };
    const b = { id: '666', type: 'solid', name: 'Red', rgb: [200, 20, 20] };
    const W = 30, H = 30;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ ...(i % 3 ? a : b) }));
    const p = {
      id: 'proj_focus_keys', name: 'Focus keys', settings: { sW: W, sH: H, fabricCt: 14 }, pattern,
      done: new Array(W * H).fill(0), halfStitches: [[1, { fwd: a }], [2, { fwd: b }]], halfDone: [],
      originalPaletteState: [{ ...a, count: 600, symbol: 'A' }, { ...b, count: 300, symbol: 'B' }]
    };
    await ProjectStorage.save(p);
    ProjectStorage.setActiveProject(p.id);
  });
  await page.goto('/stitch.html?id=proj_focus_keys');
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForSelector('.info-strip-wrap');
}

const layerVis = page => page.evaluate(() => JSON.parse(localStorage.getItem('cs_layerVis_proj_focus_keys') || 'null'));
const inFocus = page => page.evaluate(() => document.body.classList.contains('cs-focus'));

test('F toggles focus mode and nothing else, at several zoom levels', async ({ page }) => {
  await seed(page);
  for (const zoomPresses of [0, 3, 8]) {
    await page.keyboard.press('0');
    for (let i = 0; i < zoomPresses; i++) await page.keyboard.press('=');
    const before = await layerVis(page);
    await page.keyboard.press('f');
    expect(await inFocus(page)).toBe(true);
    expect(await layerVis(page)).toEqual(before);
    await expect(page.locator('.tracker-layers-chip')).toHaveCount(0);
    await page.keyboard.press('f');
    expect(await inFocus(page)).toBe(false);
    expect(await layerVis(page)).toEqual(before);
  }
});

test('Shift+F hides the full stitches without entering focus mode; the chip restores them', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('Shift+F');
  expect(await inFocus(page)).toBe(false);
  const chip = page.getByRole('button', { name: 'Full stitches hidden. Show hidden layers' });
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Full stitches hidden');
  expect((await layerVis(page)).full).toBe(false);
  await chip.click();
  await expect(page.locator('.tracker-layers-chip')).toHaveCount(0);
  expect((await layerVis(page)).full).toBe(true);
  await expect(page.locator(TRACKER_CANVAS)).toBeFocused();
});

test('Shift+H, Shift+A and the bare layer keys', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('h'); await page.keyboard.press('k'); await page.keyboard.press('l');
  await expect(page.locator('.tracker-layers-chip')).toHaveCount(0);
  await page.keyboard.press('Shift+H');
  await expect(page.locator('.tracker-layers-chip')).toContainText('Half stitches hidden');
  await page.keyboard.press('Shift+F');
  await expect(page.locator('.tracker-layers-chip')).toContainText('Full stitches and half stitches hidden');
  await page.keyboard.press('Shift+A');          // not every layer is visible, so this shows them all
  await expect(page.locator('.tracker-layers-chip')).toHaveCount(0);
});

test('a hidden layer is still signposted in focus mode, and Esc leaves focus mode', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('Shift+F');
  await page.keyboard.press('f');
  expect(await inFocus(page)).toBe(true);
  const chip = page.locator('.tracker-layers-chip--float');
  await expect(chip).toBeVisible();
  const box = await chip.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  await expect(page.locator('.cs-focus-exit')).toBeVisible();
  await chip.click();
  await expect(page.locator('.tracker-layers-chip')).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await inFocus(page)).toBe(false);
});
