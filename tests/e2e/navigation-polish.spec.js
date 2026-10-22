/* Navigation, dark mode and first-run polish (UX-015, UX-017, UX-022, UX-028).
   The header lists tools only (Create, Track, Stash, Stats); the Creator's own steps (Convert, Edit, Materials) are
   not header tabs and the header stays on Create through all of them. Dark inactive tabs are not the accent colour.
   At 768, 1024 and 1366 px the project, progress and save state fit with the File menu on screen. Shortcuts opens on the
   current tool. An empty Home has no Continue card and no project switcher; elsewhere an empty switcher is a plain
   "No project" chip. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.use({
  deviceScaleFactor: 1, hasTouch: false, isMobile: false,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function quiet(page, theme) {
  await page.addInitScript((theme) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerHintsSeen', 'true');
    localStorage.setItem('cs_pref_a11yDarkMode', JSON.stringify(theme));
    sessionStorage.setItem('cs_eviction_warned', '1');
  } catch (_) {} }, theme);
}

async function seed(page) {
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 40, H = 40, pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]]];
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: pal[i % 2][0], type: 'solid', rgb: pal[i % 2][1] }));
    const done = new Array(W * H).fill(0).map((_, i) => (i < 300 ? 1 : 0));
    const id = await ProjectStorage.save({ id: 'proj_navpolish', name: 'My long project name here', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done,
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: W * H / 2, symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}

async function openTracker(page, theme, vp) {
  await page.setViewportSize(vp);
  await quiet(page, theme);
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1200);
  return id;
}

const tabLabels = (page) => page.locator('.tb-app-tab').allInnerTexts();

test.describe('the header lists tools, not steps', () => {
  test.use({ viewport: { width: 1366, height: 800 } });

  test('Tracker: Create, Track, Stash, Stats, with Track current and no "Edit" tab', async ({ page }) => {
    await openTracker(page, 'light', { width: 1366, height: 800 });
    expect(await tabLabels(page)).toEqual(['Create', 'Track', 'Stash', 'Stats']);
    await expect(page.locator('.tb-app-tab--active')).toHaveText('Track');
    await expect(page.locator('.tb-app-tab[aria-current="page"]')).toHaveCount(1);
  });

  test('Create from the Tracker opens the open project in the Creator', async ({ page }) => {
    await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.locator('.tb-app-tab', { hasText: 'Create' }).click();
    await page.waitForURL(/create\.html/, { timeout: 15000 });
    await expect(page.locator('.tb-app-tab--active')).toHaveText('Create');
    await expect(page.locator('.tb-proj-switcher__name')).toContainText('My long project name here', { timeout: 15000 });
  });

  test('Creator: the highlight stays on Create through Convert and Edit', async ({ page }) => {
    const id = await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.goto('/create.html?from=home&id=' + id);
    await page.waitForSelector('.tb-app-nav');
    await page.waitForFunction(() => typeof window.__setCreatorAppMode === 'function');
    for (const mode of ['edit', 'create', 'edit']) {
      await page.evaluate((m) => window.__setCreatorAppMode(m), mode);
      await page.waitForTimeout(250);
      expect(await tabLabels(page), 'no step is a header tab').toEqual(['Create', 'Track', 'Stash', 'Stats']);
      await expect(page.locator('.tb-app-tab--active')).toHaveText('Create');
    }
  });

  test('clicking Create inside the Creator leaves the step alone', async ({ page }) => {
    const id = await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.goto('/create.html?from=home&id=' + id);
    await page.waitForFunction(() => typeof window.__setCreatorAppMode === 'function');
    await page.evaluate(() => window.__setCreatorAppMode('edit'));
    await page.waitForTimeout(250);
    const before = page.url();
    await page.locator('.tb-app-tab--active').click();
    await page.waitForTimeout(300);
    expect(page.url()).toBe(before);
    await expect(page.locator('.tb-app-tab--active')).toHaveText('Create');
  });
});

for (const theme of ['light', 'dark']) {
  test(`${theme}: inactive tabs are --text-secondary and the active one has an underline`, async ({ page }) => {
    await openTracker(page, theme, { width: 1366, height: 800 });
    const r = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span'); probe.style.color = 'var(--text-secondary)'; document.body.appendChild(probe);
      const secondary = getComputedStyle(probe).color; probe.remove();
      const inactive = [...document.querySelectorAll('.tb-app-tab:not(.tb-app-tab--active)')].map(a => getComputedStyle(a).color);
      const active = document.querySelector('.tb-app-tab--active');
      const after = getComputedStyle(active, '::after');
      const nav = document.querySelector('.tb-topbar').getBoundingClientRect(), a = active.getBoundingClientRect();
      return { secondary, inactive, activeColour: getComputedStyle(active).color, accent: root.getPropertyValue('--accent').trim(),
        underline: after.content !== 'none' && after.height === '2px', activeBottom: Math.round(a.bottom), barBottom: Math.round(nav.bottom) };
    });
    expect(r.inactive.length).toBe(3);
    r.inactive.forEach(c => expect(c).toBe(r.secondary));
    expect(r.activeColour).not.toBe(r.secondary);
    expect(r.underline, 'the active tab is underlined').toBe(true);
    expect(Math.abs(r.activeBottom - r.barBottom), 'the underline sits on the bar edge').toBeLessThanOrEqual(2);
  });
}

for (const theme of ['light', 'dark']) {
  for (const width of [768, 1024, 1366]) {
    test(`${theme} ${width}px: the row fits, File is on screen, and the project is one chip below 1200px`, async ({ page }) => {
      await openTracker(page, theme, { width, height: 800 });
      const r = await page.evaluate(() => {
        const inner = document.querySelector('.tb-topbar-inner');
        const file = [...document.querySelectorAll('.tb-topbar .tb-page-btn')].find(b => /File/.test(b.textContent)).getBoundingClientRect();
        return { overflow: inner.scrollWidth - inner.clientWidth, fileRight: file.right, vw: innerWidth,
          merged: document.querySelectorAll('.tb-proj-switcher--merged').length, badge: document.querySelectorAll('.tb-proj-badge').length,
          mergedText: (document.querySelector('.tb-proj-switcher--merged') || {}).textContent || '' };
      });
      expect(r.overflow, 'nothing clips').toBeLessThanOrEqual(0);
      expect(r.fileRight, 'File is on screen').toBeLessThanOrEqual(r.vw);
      if (width < 1200) {
        expect(r.merged).toBe(1);
        expect(r.badge).toBe(0);
        expect(r.mergedText, 'the chip carries the progress').toMatch(/\d+%/);
      } else {
        expect(r.merged).toBe(0);
        expect(r.badge).toBe(1);
      }
    });
  }
}

test.describe('Shortcuts opens on the current tool', () => {
  test.use({ viewport: { width: 1366, height: 800 } });
  const groups = (page) => page.evaluate(() => [...document.querySelectorAll('.cs-help-shortcut-group')].map(d => ({ name: d.querySelector('summary').textContent.replace(/\s*\(\d+\)$/, ''), open: d.open })));

  test('? in the Tracker opens Stitch Tracker, with every other section collapsed', async ({ page }) => {
    await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.keyboard.press('?');
    await page.waitForSelector('.cs-help-shortcut-group', { timeout: 15000 });
    const g = await groups(page);
    expect(g[0].name).toBe('Stitch Tracker');
    expect(g.filter(x => x.open).map(x => x.name)).toEqual(['Stitch Tracker']);
    expect(g.length).toBeGreaterThanOrEqual(3);
  });

  test('the header keyboard button does the same, and a section opens on click', async ({ page }) => {
    await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await page.waitForSelector('.cs-help-shortcut-group');
    expect((await groups(page))[0]).toEqual({ name: 'Stitch Tracker', open: true });
    await page.locator('.cs-help-shortcut-group summary', { hasText: 'Pattern Creator' }).click();
    expect((await groups(page)).find(x => x.name === 'Pattern Creator').open).toBe(true);
  });

  test('? in the Creator opens Pattern Creator first', async ({ page }) => {
    const id = await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.goto('/create.html?from=home&id=' + id);
    await page.waitForSelector('.tb-app-nav');
    await page.waitForTimeout(800);
    await page.keyboard.press('?');
    await page.waitForSelector('.cs-help-shortcut-group', { timeout: 15000 });
    const g = await groups(page);
    expect(g[0]).toEqual({ name: 'Pattern Creator', open: true });
    expect(g.filter(x => x.open).length).toBe(1);
  });

  test('searching opens every section that matches', async ({ page }) => {
    await openTracker(page, 'light', { width: 1366, height: 800 });
    await page.keyboard.press('?');
    await page.waitForSelector('.cs-help-shortcut-group');
    await page.getByRole('searchbox').or(page.locator('input[aria-label="Search help and shortcuts"]')).first().fill('undo');
    await page.waitForTimeout(400);
    const g = await groups(page);
    expect(g.length).toBeGreaterThan(0);
    expect(g.every(x => x.open)).toBe(true);
  });
});

test.describe('first run on Home', () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test('no projects: no Continue card, three start cards, Home / Stash / Stats, and no switcher', async ({ page }) => {
    await quiet(page, 'light');
    await page.goto('/home.html');
    await page.waitForSelector('.home-intent');
    await expect(page.locator('.home-intent')).toHaveCount(3);
    await expect(page.locator('.home-continue')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText(/no active project/i);
    expect(await tabLabels(page)).toEqual(['Home', 'Stash', 'Stats']);
    await expect(page.locator('.tb-proj-switcher__btn')).toHaveCount(0);
  });

  test('elsewhere, no project is a plain "No project" chip', async ({ page }) => {
    await quiet(page, 'light');
    await page.goto('/manager.html?from=home');
    const chip = page.locator('.tb-proj-switcher__btn');
    await expect(chip).toContainText('No project');
    await expect(chip.locator('.tb-proj-switcher__avatar')).toHaveCount(0);
    await expect(chip).not.toContainText(/\bNP\b/);
  });

  test('a project shows its initials again', async ({ page }) => {
    await quiet(page, 'light');
    await seed(page);
    await page.goto('/manager.html?from=home');
    await expect(page.locator('.tb-proj-switcher__avatar').first()).toHaveText('ML');
  });
});

test.describe('Stats back button', () => {
  test.use({ viewport: { width: 1366, height: 800 } });
  test('the Stats page offers Back to projects, not Back to grid', async ({ page }) => {
    await quiet(page, 'light');
    await seed(page);
    await page.goto('/index.html?mode=stats');
    await expect(page.getByRole('button', { name: /Back to projects/ }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /Back to grid/ })).toHaveCount(0);
  });
});
