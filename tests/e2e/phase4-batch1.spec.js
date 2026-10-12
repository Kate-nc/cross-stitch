/* Legend panel, touch targets and the save badge (tracking audit TRACK-06 and the small targets of TRACK-07). */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 40, H = 40;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const id = await ProjectStorage.save({ id: 'proj_p4', name: 'Phase4', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 800, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
async function openTracker(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(500);
}
// What is on top at the middle of an element: the element itself (or inside it) means it can be clicked.
const reachable = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return 'missing';
  const r = el.getBoundingClientRect(); if (!r.width) return 'hidden';
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return top && (el === top || el.contains(top) || top.contains(el)) ? 'ok' : 'covered by ' + (top && (top.className || top.tagName));
}, sel);

for (const vp of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
  test.describe('desktop ' + vp.width + 'x' + vp.height, () => {
    test.use({ viewport: vp, hasTouch: false, isMobile: false });
    test('with the colour panel open, the logo and the Create, Edit and Track tabs are reachable', async ({ page }) => {
      const id = await seed(page);
      await openTracker(page, id);
      await expect(page.locator('.lpanel--open')).toBeVisible();
      const logo = page.locator('.tb-topbar a[href*="home"], .tb-logo, .tb-brand').first();
      const tabs = page.locator('.tb-app-tab');
      expect(await tabs.count()).toBeGreaterThanOrEqual(3);
      for (let i = 0; i < Math.min(3, await tabs.count()); i++) {
        const r = await tabs.nth(i).evaluate((el) => { const b = el.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { w: b.width, ok: !!t && (el === t || el.contains(t) || t.contains(el)), label: el.textContent.trim() }; });
        expect(r.ok, 'tab "' + r.label + '" is covered').toBe(true);
      }
      const l = await logo.evaluate((el) => { const b = el.getBoundingClientRect(); const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!t && (el === t || el.contains(t) || t.contains(el)); });
      expect(l, 'the logo is covered').toBe(true);
    });
  });
}

// Every visible control, with its size (CSS px), for the phone and tablet audits.
const smallControls = (page) => page.evaluate(() => {
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  document.querySelectorAll('button, [role="button"], a[href], input:not([type=hidden]), select, summary, [role="tab"], [role="switch"]').forEach((el) => {
    if (!vis(el)) return;
    if (el.closest('[aria-hidden="true"]') || el.closest('.cs-hidden-input')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) out.push({ name: (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).trim().slice(0, 40), cls: String(el.className).slice(0, 50), w: Math.round(r.width), h: Math.round(r.height) });
  });
  return out;
});

for (const vp of [{ width: 393, height: 727, label: 'phone portrait' }, { width: 851, height: 393, label: 'phone landscape' }]) {
  test.describe(vp.label, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
    test('every visible control is at least 44 px, and the save status is a whole icon, not a sliver', async ({ page }) => {
      const id = await seed(page);
      await openTracker(page, id);
      expect(await smallControls(page)).toEqual([]);
      const badge = await page.evaluate(() => {
        const b = document.querySelector('.tb-proj-badge'); if (!b) return null;
        const r = b.getBoundingClientRect(); const l = b.querySelector('.tb-save-label'); const ic = b.querySelector('.tb-proj-badge-saved svg');
        const ir = ic && ic.getBoundingClientRect();
        return { w: r.width, inside: r.left >= 0 && r.right <= innerWidth, icon: ir ? Math.round(ir.width) : 0, label: l ? l.textContent : '' };
      });
      expect(badge).not.toBeNull();
      expect(badge.inside).toBe(true);
      expect(badge.icon).toBeGreaterThanOrEqual(16);
      expect(badge.label).toMatch(/saved/i);          // still there for screen readers
      // the text is not on screen (an icon only)
      const labelBox = await page.locator('.tb-save-label').first().boundingBox();
      expect(labelBox.width).toBeLessThanOrEqual(2);
    });
  });
}

test.describe('shared header on other pages (phone)', () => {
  test.use({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true });
  for (const url of ['/create.html?id=proj_p4', '/home.html', '/manager.html?from=home']) {
    test('no sideways scroll and the header fits: ' + url, async ({ page }) => {
      await seed(page);
      await page.goto(url);
      await page.waitForTimeout(1500);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      expect(m.sw).toBeLessThanOrEqual(m.iw);
    });
  }
});
