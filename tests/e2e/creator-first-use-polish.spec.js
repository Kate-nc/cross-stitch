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
    // Once the tips are dismissed, the standing notes come back.
    await page.getByRole('button', { name: 'Skip tips' }).click();
    await expect(hint).toBeVisible();
    await expect(review).toBeVisible();
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
});
