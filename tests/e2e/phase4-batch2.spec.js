/* Give the chart the screen (tracking audit TRACK-07): chart height from the viewport, Focus by default on a phone,
   hint banners that go away once they have done their job, a rail that does not cover the last column. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, { prefs } = {}) {
  await page.addInitScript((p) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    sessionStorage.setItem('cs_eviction_warned', '1');
    Object.keys(p || {}).forEach(k => localStorage.setItem('cs_pref_' + k, JSON.stringify(p[k])));
  } catch (_) {} }, prefs || {});
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 60, H = 60;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const id = await ProjectStorage.save({ id: 'proj_p4b2', name: 'Phase4b2', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 1800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 1800, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
async function openTracker(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(700);
}
const chartBox = (page) => page.evaluate(() => { const r = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); return { top: r.top, h: r.height, bottom: r.bottom, vh: innerHeight, vw: innerWidth, right: r.right }; });
const overlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
const rectOf = (page, sel) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null; }, sel);


// Every visible control and its size (CSS px), as in phase4-batch1.
const smallControls = (page) => page.evaluate(() => {
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  document.querySelectorAll('button, [role="button"], a[href], input:not([type=hidden]), select, summary, [role="tab"], [role="switch"]').forEach((el) => {
    if (!vis(el) || el.closest('[aria-hidden="true"]')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.push({ name: (el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
});
const pageFits = (page) => page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
const railAndView = (page) => page.evaluate(() => {
  const rail = document.querySelector('.ppal-mode-strip').getBoundingClientRect();
  const view = document.querySelector('.tracker-chart-view').getBoundingClientRect();
  const sc = document.querySelector('.tracker-chart-scroll').getBoundingClientRect();
  return { railLeft: rail.left, railRight: rail.right, viewLeft: view.left, viewRight: view.right, scLeft: sc.left };
});
const scrollChart = (page, x) => page.evaluate((v) => { const s = document.querySelector('.tracker-chart-scroll'); s.scrollLeft = v === 'end' ? s.scrollWidth : 0; }, x).then(() => page.waitForTimeout(250));
const bodyClass = (page) => page.evaluate(() => document.body.className);
const mark = async (page, c, r) => { const p = await trackerCellPoint(page, c, r); await page.mouse.click(p.x, p.y); await page.waitForTimeout(400); };

test.describe('phone portrait 393x727', () => {
  test.use({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true });
  test('Focus is the default: the chart fills the screen, nothing scrolls, and a thin progress line shows where you are', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    expect(await bodyClass(page)).toContain('cs-focus');
    const b = await chartBox(page);
    expect(b.h / b.vh).toBeGreaterThanOrEqual(0.65);
    expect(b.bottom).toBeLessThanOrEqual(b.vh);
    const f = await pageFits(page);
    expect(f.sh).toBeLessThanOrEqual(f.ih + 1);
    expect(f.sw).toBeLessThanOrEqual(f.iw);
    await expect(page.locator('.cs-focus-progress')).toContainText('0.0%');
    await expect(page.locator('.tb-topbar')).toBeHidden();
    // the how-to banners exist (nothing has been marked yet) but Focus keeps them out of sight
    expect(await page.locator('.tracker-hint').count()).toBeGreaterThan(0);
    await expect(page.locator('.tracker-hint').first()).toBeHidden();
  });
  test('in Focus every visible control is at least 44 px', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    expect(await smallControls(page)).toEqual([]);
  });
  test('the way back out of Focus shows the top bar again and the chart still fits the screen', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    await page.getByRole('button', { name: 'Exit focus mode' }).click();
    await page.waitForTimeout(500);
    expect(await bodyClass(page)).not.toContain('cs-focus');
    await expect(page.locator('.tb-topbar')).toBeVisible();
    const b = await chartBox(page);
    expect(b.bottom).toBeLessThanOrEqual(b.vh + 1);
    expect(b.h / b.vh).toBeGreaterThanOrEqual(0.5);
    const f = await pageFits(page);
    expect(f.sh).toBeLessThanOrEqual(f.ih + 1);
  });
  test('the controls strip never covers the last column, and the Palette pill is gone from the banner', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    await scrollChart(page, 'end');
    const m = await railAndView(page);
    expect(m.viewRight).toBeLessThanOrEqual(m.railLeft + 1);
    await expect(page.locator('.ppal-phone-chip')).toBeHidden();
  });
  test('in Focus the Colours button still opens the colour panel, and the strip then shows the colour you chose', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    expect(await bodyClass(page)).toContain('cs-focus');
    await expect(page.locator('.ppal-mode-btn-label').first()).toHaveText('Colours');
    await page.locator('.ppal-mode-btn').first().click();
    await page.waitForTimeout(300);
    if (!(await page.locator('.lpanel--open').count())) await page.locator('.ppal-mode-btn').first().click();   // hidden, then the collapsed strip, then open
    await expect(page.locator('.lpanel--open')).toBeVisible();
    await page.locator('.lpanel--open').getByText('310', { exact: false }).first().click();
    await page.waitForTimeout(400);
    if (await page.locator('.lpanel--open').count()) await page.locator('.lpanel--open .ppal-close').click();   // it may close itself once a colour is chosen
    await expect(page.locator('.lpanel--open')).toHaveCount(0);
    await expect(page.locator('.ppal-mode-btn-label').first()).toHaveText('310');
    await expect(page.locator('.ppal-mode-swatch')).toBeVisible();
  });
  test('in Focus a placed guide brings back its bar, with Clear guide', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    await expect(page.locator('.tracker-hover-wrap')).toBeHidden();
    await page.locator('.ppal-mode-btn', { hasText: /Nav/i }).click();
    const p = await trackerCellPoint(page, 4, 4);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
    await expect(page.getByRole('button', { name: 'Clear the guide crosshair' })).toBeVisible();
    const b = await chartBox(page);
    expect(b.bottom).toBeLessThanOrEqual(b.vh);
  });
  test('turning the phone default off in Preferences opens the Tracker the old way, with the chart still filling what is left', async ({ page }) => {
    const id = await seed(page, { prefs: { trackerFocusOnPhone: false } }); await openTracker(page, id);
    expect(await bodyClass(page)).not.toContain('cs-focus');
    await expect(page.locator('.tb-topbar')).toBeVisible();
    const b = await chartBox(page);
    expect(b.bottom).toBeLessThanOrEqual(b.vh + 1);
    expect(b.h / b.vh).toBeGreaterThanOrEqual(0.5);
  });
  test('turning the phone while stitching re-measures the chart', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    await page.setViewportSize({ width: 851, height: 393 });
    await page.waitForTimeout(800);
    const b = await chartBox(page);
    expect(b.bottom).toBeLessThanOrEqual(b.vh + 1);
    expect(b.h / b.vh).toBeGreaterThanOrEqual(0.5);
    await page.setViewportSize({ width: 393, height: 727 });
    await page.waitForTimeout(800);
    const b2 = await chartBox(page);
    expect(b2.bottom).toBeLessThanOrEqual(b2.vh + 1);
    expect(b2.h / b2.vh).toBeGreaterThanOrEqual(0.65);
  });
  test('left-handed: the controls sit on the left and the chart makes room for them', async ({ page }) => {
    const id = await seed(page, { prefs: { trackerHandedness: 'left' } }); await openTracker(page, id);
    await scrollChart(page, 'start');
    const m = await railAndView(page);
    expect(m.railLeft).toBeLessThan(40);
    expect(m.railRight).toBeLessThanOrEqual(m.scLeft + 1);
  });
});

test.describe('phone landscape 851x393', () => {
  test.use({ viewport: { width: 851, height: 393 }, hasTouch: true, isMobile: true });
  test('in Focus every visible control is at least 44 px', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    expect(await smallControls(page)).toEqual([]);
  });
  test('with Focus on (the default) the chart takes at least half the screen, and nothing scrolls', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    expect(await bodyClass(page)).toContain('cs-focus');
    const b = await chartBox(page);
    expect(b.h / b.vh).toBeGreaterThanOrEqual(0.5);
    expect(b.bottom).toBeLessThanOrEqual(b.vh);
    const f = await pageFits(page);
    expect(f.sh).toBeLessThanOrEqual(f.ih + 1);
    await scrollChart(page, 'end');
    const m = await railAndView(page);
    expect(m.viewRight).toBeLessThanOrEqual(m.railLeft + 1);
  });
});

test.describe('tablet 768x1024', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true });
  test('the top bar keeps its percentage on a tablet', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    await expect(page.locator('.tb-proj-badge .tb-proj-badge-pct:not(.tb-proj-badge-saved)')).toBeVisible();
  });
  test('not a phone: no Focus by default, the chart still fits the screen, and the how-to banners go after the first stitch for good', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    expect(await bodyClass(page)).not.toContain('cs-focus');
    const b = await chartBox(page);
    expect(b.bottom).toBeLessThanOrEqual(b.vh + 1);
    const f = await pageFits(page);
    expect(f.sh).toBeLessThanOrEqual(f.ih + 1);
    await expect(page.locator('.tracker-hint').first()).toBeVisible();
    await mark(page, 3, 3);
    await expect(page.locator('.tracker-hint')).toHaveCount(0);
    expect(await page.evaluate(() => window.UserPrefs.get('trackerHintsSeen'))).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector(TRACKER_CANVAS);
    await page.waitForTimeout(800);
    await expect(page.locator('.tracker-hint')).toHaveCount(0);
  });
});

test.describe('desktop 1440x900 (unchanged)', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
  test('the chart box keeps its size and nothing new is applied', async ({ page }) => {
    const id = await seed(page); await openTracker(page, id);
    const b = await chartBox(page);
    expect(b.h).toBe(600);
    expect(await page.evaluate(() => document.querySelector('.tracker-chart-scroll').style.getPropertyValue('--tracker-chart-h'))).toBe('');
    expect(await bodyClass(page)).not.toContain('cs-focus');
  });
});
