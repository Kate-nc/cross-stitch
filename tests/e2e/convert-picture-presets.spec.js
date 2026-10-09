// Picture-type presets, and "threads" vs "symbols" (P2-5, audits IMG-01, IMG-02).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { device, openConvertWithLogo, quietOnboarding, skipTourIfShown, clickGenerate, waitForEdit } = require('./creator-helpers');

const TINY = path.join(__dirname, '..', 'fixtures', 'tiny.png');

// The saved pattern: its size, distinct threads (blends split), isolated
// stitches as a share of stitched cells, and stitches in a near-white thread.
async function patternStats(page) {
  return page.evaluate(async function() {
    const p = await ProjectStorage.getActiveProject();
    if (!p) return null;
    const w = p.settings.sW, h = p.settings.sH, cells = p.pattern;
    const threads = new Set();
    let stitched = 0, isolated = 0, white = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = cells[y * w + x];
      if (!c || c.id === '__skip__' || c.id === '__empty__') continue;
      stitched++;
      String(c.id).split('+').forEach(function(id) { threads.add(id); });
      const same = function(xx, yy) { const n = xx >= 0 && yy >= 0 && xx < w && yy < h ? cells[yy * w + xx] : null; return n && n.id === c.id; };
      if (!same(x - 1, y) && !same(x + 1, y) && !same(x, y - 1) && !same(x, y + 1)) isolated++;
      const t = window.findThreadInCatalog ? window.findThreadInCatalog('dmc', String(c.id).split('+')[0]) : null;
      if (t && t.rgb[0] > 235 && t.rgb[1] > 235 && t.rgb[2] > 235) white++;
    }
    return { w: w, h: h, threads: threads.size, confettiPct: stitched ? isolated / stitched * 100 : 0, white: white, stitched: stitched };
  });
}

function pictureType(page, label) {
  return page.locator('.picture-type').getByRole('radio', { name: label });
}

test.describe('Picture-type presets on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('a logo is guessed as a graphic and makes a clean pattern', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(page.locator('.picture-type')).toContainText('What kind of picture is this?');
    await expect(pictureType(page, 'Graphic or logo')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Threads (max)')).toBeVisible();

    await clickGenerate(page);
    await waitForEdit(page);
    const s = await expect.poll(function() { return patternStats(page); }, { timeout: 15000 }).not.toBeNull().then(function() { return patternStats(page); });
    expect(s.threads).toBeLessThanOrEqual(5);
    expect(s.confettiPct).toBeLessThan(1);
    expect(s.white).toBe(0);
    expect(s.stitched).toBeGreaterThan(0);

    // Counts say threads and symbols, never colours.
    await expect(page.locator('.creator-toast-container').filter({ hasText: 'Pattern generated' }).first())
      .toContainText(/\d+ threads?[).,]/);
    await expect(page.locator('.palette-counts').first()).toHaveText(/^\d+ threads? · \d+ symbols?$/);
  });

  test('changing a value shows Custom; choosing a type applies its preset', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(pictureType(page, 'Graphic or logo')).toHaveAttribute('aria-checked', 'true');
    await pictureType(page, 'Photo').click();
    await expect(pictureType(page, 'Photo')).toHaveAttribute('aria-checked', 'true');
    const slider = page.locator('xpath=//span[normalize-space(text())="Threads (max)"]/ancestor::div[2]//input[@type="range"]').first();
    await expect(slider).toHaveValue('20');
    await slider.fill('14');
    await expect(pictureType(page, 'Custom')).toHaveAttribute('aria-checked', 'true');
    await pictureType(page, 'Graphic or logo').click();
    await expect(slider).toHaveValue('8');
    await expect(pictureType(page, 'Graphic or logo')).toHaveAttribute('aria-checked', 'true');
  });

  test('with guessing turned off in Preferences, a picture starts from the Preferences defaults', async function({ page }) {
    await page.addInitScript(function() {
      try { localStorage.setItem('cs_pref_creatorGuessPictureType', 'false'); localStorage.setItem('cs_pref_creatorDefaultPaletteSize', '12'); } catch (e) {}
    });
    await openConvertWithLogo(page);
    await expect(pictureType(page, 'Custom')).toHaveAttribute('aria-checked', 'true');
    const slider = page.locator('xpath=//span[normalize-space(text())="Threads (max)"]/ancestor::div[2]//input[@type="range"]').first();
    await expect(slider).toHaveValue('12');
    // Arrow keys still choose a type.
    await pictureType(page, 'Graphic or logo').focus();
    await page.keyboard.press('ArrowRight');
    await expect(pictureType(page, 'Photo')).toHaveAttribute('aria-checked', 'true');
    await expect(pictureType(page, 'Photo')).toBeFocused();
    await expect(slider).toHaveValue('20');
  });

  test('a tiny picture is guessed as pixel art and generates at its own size', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.locator('input.home-create-file-input').setInputFiles(TINY);
    await page.waitForURL(/create\.html/);
    await page.waitForSelector('.rpanel', { state: 'attached' });
    await skipTourIfShown(page);
    await expect(pictureType(page, 'Pixel art')).toHaveAttribute('aria-checked', 'true');
    await clickGenerate(page);
    await waitForEdit(page);
    await expect.poll(async function() { const s = await patternStats(page); return s && s.w + ' x ' + s.h; }, { timeout: 15000 }).toBe('24 x 24');
    const s = await patternStats(page);
    expect(s.threads).toBeLessThanOrEqual(6);
  });
});
