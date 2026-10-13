/* Keep the screen on, and plainer words (tracking audit TRACK-11, COMMON-01), on a 393x727 phone:
     the first mark takes the wake lock (mocked), says so once, and Never stops it
     the chip reads Keep screen on; the Highlight tab holds the chart view (Colour + symbol, no Realistic)
     Use up stash thread as I stitch replaces Live tracking (RT) */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint, trackerDoneCount, trackerTouchDriver } = require('./touch-helpers');

test.use({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true });
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function open(page, prefs) {
  await page.addInitScript((prefs) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    localStorage.setItem('cs_pref_trackerFocusOnPhone', 'false');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    Object.keys(prefs || {}).forEach(k => localStorage.setItem('cs_pref_' + k, JSON.stringify(prefs[k])));
    // A Wake Lock that counts requests (headless Chromium has none over http).
    window.__wl = { requests: 0, released: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      window.__wl.requests++;
      return { addEventListener() {}, release: async () => { window.__wl.released++; } };
    } } });
  } catch (_) {} }, prefs);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 40, H = 40;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const id = await ProjectStorage.save({ id: 'proj_p4b5', name: 'Phase4b5', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 800, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
}
async function tapCell(page, gx, gy) {
  const touch = await trackerTouchDriver(page);
  const p = await trackerCellPoint(page, gx, gy);
  await touch('touchStart', [p]); await page.waitForTimeout(50); await touch('touchEnd', []); await page.waitForTimeout(500);
}
const wl = page => page.evaluate(() => window.__wl);
const openMore = async (page) => { await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(300); };

test('the first mark keeps the screen on and says so once', async ({ page }) => {
  await open(page);
  expect((await wl(page)).requests, 'nothing is held before a mark').toBe(0);
  await tapCell(page, 5, 5);
  expect((await wl(page)).requests).toBe(1);
  await expect(page.locator('[data-toast-container]')).toContainText(/Keeping the screen on/i);
  await tapCell(page, 6, 5); await tapCell(page, 7, 5);
  expect((await wl(page)).requests, 'one lock for the session').toBe(1);
});

test('Never: marking does not take the lock', async ({ page }) => {
  await open(page, { trackerWakeLock: 'never' });
  await tapCell(page, 5, 5);
  expect(await trackerDoneCount(page)).toBe(1);
  expect((await wl(page)).requests).toBe(0);
});

test('the chip says Keep screen on, shows it is held, and lets go on a tap (remembering Never)', async ({ page }) => {
  await open(page);
  await tapCell(page, 5, 5);
  await openMore(page);
  const chip = page.locator('.ppal-utility-chip', { hasText: 'Keep screen on' });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.ppal-utility-chip', { hasText: /^\s*(Sleep|Awake)\s*$/ }).count()).toBe(0);
  await chip.click(); await page.waitForTimeout(300);
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  expect((await wl(page)).released).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.UserPrefs.get('trackerWakeLock'))).toBe('never');
});

test('the Highlight tab holds the chart view, with Colour + symbol and no Realistic', async ({ page }) => {
  await open(page);
  await openMore(page);
  await page.locator('.ppal-more-tab', { hasText: 'Highlight' }).click();
  const panel = page.locator('.ppal-more-content');
  await expect(panel).toContainText('Chart view');
  await expect(panel.getByRole('button', { name: 'Colour + symbol' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Isolate' })).toBeVisible();
  expect(await panel.getByText('Realistic').count()).toBe(0);
  await panel.getByRole('button', { name: 'Colour + symbol' }).click();
  expect(await page.evaluate(() => window.UserPrefs.get('trackerDefaultView'))).toBe('colour');
});

test('the stash option has its plain name', async ({ page }) => {
  await open(page);
  await openMore(page);
  await page.locator('.ppal-more-tab', { hasText: 'Tools' }).click();
  await expect(page.locator('.ppal-more-content')).toContainText('Use up stash thread as I stitch');
  expect(await page.locator('.ppal-more-content').getByText(/Live tracking/).count()).toBe(0);
});
