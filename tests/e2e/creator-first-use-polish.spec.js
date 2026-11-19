// A first-use review of creating from a picture (PR 425 follow-up): small
// pictures are visible in Frame, dark mode keeps the chosen option and the
// main button in the accent, notices come one at a time after Generate, tips
// only name what is on screen, and an empty stash is explained up front.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, openConvertWithLogo, continueFromFrame, clickGenerate, waitForEdit, convertStep } = require('./creator-helpers');

const PIXEL = path.join(__dirname, '..', 'fixtures', 'pixel-art-crisp.png');   // 9 × 7

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function openFrameWith(page, file, opts) {
  if (!(opts && opts.tips)) await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await page.locator('input.home-create-file-input').setInputFiles(file);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('[data-frame-view]');
}

// Only the welcome tours are skipped: the one-off editing tips stay on.
async function welcomeDoneTipsOn(page) {
  await page.addInitScript(function() {
    try { ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); }); } catch (e) {}
  });
}

test.describe('First use on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('a 9 × 7 sprite is shown large, with hard edges, and a square crop of it is exact', async function({ page }) {
    await openFrameWith(page, PIXEL);
    const img = page.locator('.fr-picture__img');
    const box = await img.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(300);
    expect(Math.abs(box.width / box.height - 9 / 7)).toBeLessThan(0.02);
    await expect(img).toHaveCSS('image-rendering', 'pixelated');
    await page.getByRole('radio', { name: 'Square' }).click();
    await page.getByRole('button', { name: 'Apply crop' }).click();
    await expect(page.locator('.fr-cropbar__size')).toHaveText('7×7px');
  });

  test('in dark mode, Continue, Generate and the chosen option keep the accent', async function({ page }) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(function() { try { localStorage.setItem('cs_pref_theme', JSON.stringify('dark')); } catch (e) {} });
    await openConvertWithLogo(page, { frame: true });
    const accent = await page.evaluate(function() {
      const probe = document.createElement('div'); probe.style.color = 'var(--accent)'; document.body.appendChild(probe);
      const c = getComputedStyle(probe).color; probe.remove(); return c;
    });
    const bg = (sel) => page.locator(sel).first().evaluate(function(el) { return getComputedStyle(el).backgroundColor; });
    expect(await bg('.fr-continue')).toBe(accent);
    expect(await bg('.fr-panel .lp-seg--on')).toBe(accent);
    expect(await bg('.fr-panel .lp-seg:not(.lp-seg--on)')).not.toBe(accent);
    await continueFromFrame(page);
    expect(await bg('.cv-generate')).toBe(accent);
  });

  test('after Generate the notices come one at a time', async function({ page }) {
    await welcomeDoneTipsOn(page);
    await openFrameWith(page, path.join(__dirname, '..', 'fixtures', 'logo.png'), { tips: true });
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    const hint = page.getByText('for keyboard shortcuts');
    const review = page.locator('.ready-review-note');
    const tip = page.getByText('Tools and View are now unlocked');
    await expect(bar).toBeVisible();
    await expect(tip).toHaveCount(0);
    await bar.getByRole('button', { name: 'Close: keep editing' }).click();
    // The tip, on its own.
    await expect(tip).toBeVisible();
    await expect(page.getByText('Palette and View are beside it.')).toBeVisible();
    await expect(hint).toHaveCount(0);
    await expect(review).toHaveCount(0);
    // Once the tips are dismissed, the keyboard hint comes back (the duplicate review note was removed).
    await page.getByRole('button', { name: 'Skip tips' }).click();
    await expect(hint).toBeVisible();
    await expect(review).toHaveCount(0);
  });

  test('with an empty stash, Use only stash threads says so instead of letting Generate stop', async function({ page }) {
    await openConvertWithLogo(page);
    await convertStep(page, 'threads');
    const box = page.getByRole('checkbox', { name: 'Use only stash threads' });
    await expect(box).toBeDisabled();
    await expect(page.locator('[data-stash-empty]')).toContainText('Stash Manager');
    // No stray "0" from the thread-limit hint.
    const stray = await page.locator('[data-cv-section="count"]').evaluate(function(sec) {
      return Array.from(sec.childNodes).some(function(n) { return n.nodeType === 3 && n.textContent.trim() === '0'; });
    });
    expect(stray).toBe(false);
  });

  test('while the stash is still loading, Use only stash threads is not called empty', async function({ page }) {
    // A stash with threads that takes a while to read.
    await page.addInitScript(function() {
      let v;
      Object.defineProperty(window, 'StashBridge', { configurable: true, get: function() { return v; }, set: function(x) {
        v = x;
        if (x && x.getGlobalStash) x.getGlobalStash = function() {
          return new Promise(function(r) { setTimeout(function() { r({ 'dmc:310': { owned: 2 }, 'dmc:321': { owned: 1 }, 'dmc:3865': { owned: 1 } }); }, 3000); });
        };
      } });
    });
    await openConvertWithLogo(page);
    await convertStep(page, 'threads');
    const box = page.getByRole('checkbox', { name: 'Use only stash threads' });
    await expect(box).toBeEnabled();
    await expect(page.locator('[data-stash-empty]')).toHaveCount(0);
    await page.waitForTimeout(3500);
    await expect(box).toBeEnabled();
    await expect(page.locator('[data-stash-empty]')).toHaveCount(0);
  });

  test('Undo in Frame never brings back a different picture', async function({ page }) {
    await openFrameWith(page, path.join(__dirname, '..', 'fixtures', 'panorama.jpg'));
    await page.getByRole('radio', { name: 'Square' }).click();
    await page.getByRole('button', { name: 'Apply crop' }).click();
    await expect(page.locator('.fr-cropbar__size')).toHaveText('300×300px');
    const undo = page.getByRole('button', { name: 'Undo crop or turn' });
    await expect(undo).toBeEnabled();
    // Change picture starts a new Undo list.
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Change picture' }).click()
    ]);
    await chooser.setFiles(path.join(__dirname, '..', 'fixtures', 'logo.png'));
    await expect(page.locator('.fr-cropbar__size')).toHaveText('400×400px');
    await expect(undo).toBeDisabled();
  });

  test('reframing a picture that already has a chart says the chart is kept until Regenerate', async function({ page }) {
    await openConvertWithLogo(page, { frame: true });
    await expect(page.locator('[data-frame-chart-note]')).toHaveCount(0);
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.getByRole('tab', { name: 'Convert' }).first().click();
    await page.locator('[data-reframe]').click();
    await expect(page.locator('[data-frame-chart-note]')).toContainText('until you Regenerate');
  });

  test('Escape in a dialog over Frame belongs to the dialog', async function({ page }) {
    await openFrameWith(page, path.join(__dirname, '..', 'fixtures', 'panorama.jpg'));
    await page.getByRole('radio', { name: 'Square' }).click();
    await expect(page.locator('[data-crop-rect]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Change picture' }).focus();
    await page.keyboard.press('Shift+Slash');
    const help = page.getByRole('dialog');
    await expect(help).toHaveCount(1);
    await help.locator('button').first().focus();
    await page.keyboard.press('Escape');
    await expect(help).toHaveCount(0);
    await expect(page.locator('[data-crop-rect]')).toHaveCount(1);
  });
});

test.describe('First use on a phone', function() {
  test.use(device('Pixel 7'));
  test.setTimeout(90000);

  test('no Tools tab tip (the tabs are in the closed sheet), and Help is named, not "?"', async function({ page }) {
    await welcomeDoneTipsOn(page);
    await openFrameWith(page, path.join(__dirname, '..', 'fixtures', 'logo.png'), { tips: true });
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.getByRole('region', { name: 'Your pattern is ready' }).getByRole('button', { name: 'Close: keep editing' }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('Tools and View are now unlocked')).toHaveCount(0);
    const words = await page.evaluate(function() {
      const W = window.WelcomeWizard; return JSON.stringify(W.CREATOR_TOURS.convert(W.creatorDeviceWords(true, true)));
    });
    expect(words).toContain('Help is in the More menu at the top.');
    expect(words).not.toContain('Press ?');
  });

  test('the settings drawer opens over "Your pattern is ready", not under it', async function({ page }) {
    await quietOnboarding(page);
    await openFrameWith(page, path.join(__dirname, '..', 'fixtures', 'logo.png'));
    await continueFromFrame(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await expect(page.locator('.ready-bar')).toBeVisible();
    await page.locator('.creator-rail button', { hasText: 'Colour' }).first().tap();
    await expect(page.locator('.rpanel--open')).toHaveCount(1);
    const top = await page.locator('.ready-bar').evaluate(function(bar) {
      const r = bar.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && el.closest('.ready-bar') ? 'ready-bar' : 'other';
    });
    expect(top).toBe('other');
  });
});
