/* Phone and touch layout (UX-018, UX-020): the Tracker's first-run notices queue into one banner, and the
   Creator's phone bars are labelled, reachable and 44px.

   Measured at 360x640, 393x851 (Pixel 5 portrait), 768x1024 and 1024x768, and the phone landscapes 640x360 and
   851x393. Run with `npm run test:mobile-audit` (phone project); set E2E_LOCAL_CDN=1 where cdnjs is unreachable. */
const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('../e2e/local-cdn');
const { TRACKER_CANVAS, trackerCellPoint, trackerTouchDriver } = require('../e2e/touch-helpers');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');
const SIZES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '393x851 (Pixel 5)', width: 393, height: 851 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '640x360 landscape', width: 640, height: 360 },
  { name: '851x393 landscape', width: 851, height: 393 }
];
const PHONES = SIZES.filter(s => s.width <= 393 || s.height <= 393);

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function quiet(page) {
  await page.addInitScript(() => {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    } catch (e) {}
  });
}

async function openCreatorEdit(page) {
  await quiet(page);
  await page.goto('/home.html?tab=create');
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel', { state: 'attached' });
  await page.locator('.cc-generate:visible, .creator-actionbar [aria-label="Generate pattern"]:visible').first().click();
  await page.waitForSelector('.rpanel--edit', { state: 'attached', timeout: 30000 });
  await page.waitForSelector('.creator-rail, .toolbar-row', { timeout: 30000 });
  await page.waitForTimeout(600);
}

for (const size of SIZES) {
  test.describe('Creator at ' + size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    const compact = size.width < 900;

    test('bars are labelled, inside the screen, and every control is 44px', async ({ page }) => {
      await openCreatorEdit(page);
      if (!compact) {
        await expect(page.locator('.creator-rail')).toHaveCount(0);   // wider than 900px keeps the desktop chrome
        return;
      }
      const m = await page.evaluate(() => {
        const box = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
        const ctl = [...document.querySelectorAll('.creator-rail button, .creator-compact-top button, .creator-compact-top a')]
          .filter(e => e.getBoundingClientRect().width > 0);
        return {
          vw: innerWidth, vh: innerHeight,
          small: ctl.filter(e => { const r = e.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; })
            .map(e => (e.getAttribute('aria-label') || e.textContent) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)),
          outside: ctl.filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5; }).map(e => e.getAttribute('aria-label') || e.textContent),
          railLabels: [...document.querySelectorAll('.creator-rail .creator-rail__label, .creator-rail .mode-toggle__label')].map(e => e.textContent.trim()),
          railLabelsVisible: [...document.querySelectorAll('.creator-rail .creator-rail__label, .creator-rail .mode-toggle__label')].every(e => e.getBoundingClientRect().width > 8),
          switcher: [...document.querySelectorAll('.cc-mode__label')].map(e => e.textContent.trim()),
          switcherVisible: [...document.querySelectorAll('.cc-mode__label')].every(e => e.getBoundingClientRect().width > 8),
          fillIcon: !!document.querySelector('.creator-rail [aria-label="Fill tool"] svg path[d^="M10.5 4L18 11.5"]'),
          rail: box(document.querySelector('.creator-rail')),
          status: (() => { const s = document.querySelector('.tb-status'); return s && getComputedStyle(s).display !== 'none' ? box(s) : null; })(),
          scrollBeyond: document.documentElement.scrollHeight - innerHeight
        };
      });
      expect(m.small, 'controls under 44px').toEqual([]);
      expect(m.outside, 'controls off the screen edge').toEqual([]);
      expect(m.railLabels).toEqual(expect.arrayContaining(['Navigate', 'Draw', 'Paint', 'Fill', 'Erase', 'Colour', 'Undo', 'More']));
      expect(m.railLabelsVisible).toBe(true);
      expect(m.switcher).toEqual(['Convert', 'Edit', 'Materials']);
      expect(m.switcherVisible).toBe(true);
      expect(m.fillIcon, 'the pour icon is on the Fill tool').toBe(true);
      expect(m.rail.b).toBeLessThanOrEqual(m.vh + 0.5);
      expect(m.scrollBeyond, 'the page scrolls past the screen').toBeLessThanOrEqual(1);
      if (size.height > 500) {
        expect(m.status, 'the hint is on screen in portrait').not.toBeNull();
        expect(m.status.b, 'the hint is under the rail').toBeLessThanOrEqual(m.rail.t + 0.5);
        expect(m.status.l).toBeGreaterThanOrEqual(0);
        expect(m.status.r).toBeLessThanOrEqual(m.vw + 0.5);
      } else {
        expect(m.status, 'landscape drops the hint rather than hiding it under the rail').toBeNull();
      }
    });

    test('notices come one at a time and leave the hint readable', async ({ page }) => {
      if (!compact) test.skip();
      await openCreatorEdit(page);
      const probe = await page.evaluate(() => ({
        containers: document.querySelectorAll('.creator-toast-container').length,
        cards: document.querySelectorAll('.creator-toast-container > div').length
      }));
      expect(probe.cards).toBeLessThanOrEqual(1);
      const toast = page.locator('.creator-toast-container > div').first();
      if (await toast.count()) {
        const t = await toast.boundingBox();
        const rail = await page.locator('.creator-rail').boundingBox();
        expect(t.y + t.height, 'the banner sits above the rail').toBeLessThanOrEqual(rail.y + 0.5);
        const status = page.locator('.tb-status:visible').first();
        if (await status.count()) {
          const s = await status.boundingBox();
          expect(t.y + t.height, 'the banner covers the hint').toBeLessThanOrEqual(s.y + 1);
        }
      }
    });
  });
}

/* ── Tracker: first-run notices ────────────────────────────────────────────────────────────────────────────── */

async function openTrackerFirstRun(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cs_stitchStyle', 'block');
      ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
      // A Wake Lock to take (headless Chromium has none over http): its notice is the first-run one.
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => ({ addEventListener() {}, release: async () => {} }) } });
    } catch (e) {}
  });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 40, H = 40;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const id = await ProjectStorage.save({ id: 'proj_phone_layout', name: 'Phone layout', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 800, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1200);
}

for (const size of PHONES.filter(s => s.height > 500)) {
  test.describe('Tracker first run at ' + size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true });

    test('the first mark brings one full-width banner, never a stack, and never over a coachmark', async ({ page }) => {
      await openTrackerFirstRun(page);
      const touch = await trackerTouchDriver(page);
      const p = await trackerCellPoint(page, 5, 5);
      await touch('touchStart', [p]); await page.waitForTimeout(60); await touch('touchEnd', []);
      await page.waitForTimeout(900);

      const snap = () => page.evaluate(() => {
        const toasts = [...document.querySelectorAll('[data-toast-id]')].map(e => { const r = e.getBoundingClientRect(); return { text: e.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; });
        const coach = document.querySelector('.cs-coachmark-popover');
        const bar = document.querySelector('.cs-focus-bar');
        return { toasts, coach: !!coach, focusBarTop: bar ? bar.getBoundingClientRect().top : null, vw: innerWidth, vh: innerHeight };
      });
      const a = await snap();
      expect(a.toasts.length, 'more than one notice at once').toBe(1);
      expect(a.coach, 'a coachmark over the banner').toBe(false);
      const t = a.toasts[0];
      expect(t.l).toBeLessThanOrEqual(12);
      expect(t.r).toBeGreaterThanOrEqual(a.vw - 12);
      expect(t.h, 'the banner is taller than 30% of the screen').toBeLessThan(a.vh * 0.3);
      expect(t.b).toBeLessThanOrEqual(a.vh);
      if (a.focusBarTop != null) expect(t.b, 'the banner sits over the Focus bar').toBeLessThanOrEqual(a.focusBarTop + 0.5);

      // The second first-run notice follows once the first has gone; the queue never shows both.
      const seen = new Set([t.text]);
      for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(1000);
        const s = await snap();
        expect(s.toasts.length).toBeLessThanOrEqual(1);
        s.toasts.forEach(x => seen.add(x.text));
      }
      expect([...seen].some(x => /Keeping the screen on/.test(x))).toBe(true);
      expect([...seen].some(x => /Sessions are tracked/.test(x))).toBe(true);
      expect((await snap()).toasts.length, 'informational notices clear themselves').toBe(0);
    });

    test('the banner buttons and dismiss control are 44px', async ({ page }) => {
      await openTrackerFirstRun(page);
      const touch = await trackerTouchDriver(page);
      const p = await trackerCellPoint(page, 5, 5);
      await touch('touchStart', [p]); await page.waitForTimeout(60); await touch('touchEnd', []);
      await page.waitForTimeout(900);
      const small = await page.evaluate(() => [...document.querySelectorAll('[data-toast-id] button')]
        .map(b => { const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5 ? (b.textContent || b.className) + ':' + Math.round(r.width) + 'x' + Math.round(r.height) : null; }).filter(Boolean));
      expect(small).toEqual([]);
    });
  });
}
