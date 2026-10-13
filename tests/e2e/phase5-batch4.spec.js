/* Accessibility fixes that are not about a screen reader (tracking audit COMMON-02): contrast on the Tracker and Stats in light and
   dark, an accent that follows the theme, a focus ring you can see, usable at 200% browser zoom, and state that is not colour alone.
   axe-core is not a dependency of this repository, so the contrast here is computed from the rendered colours. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.use({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
});
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function open(page, { theme = 'light', prefs = {}, W = 60, H = 60, doneFrac = 0.3, path = null } = {}) {
  await page.addInitScript(({ theme, prefs }) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_a11yDarkMode', JSON.stringify(theme));
    Object.keys(prefs).forEach(k => localStorage.setItem('cs_pref_' + k, JSON.stringify(prefs[k])));
    sessionStorage.setItem('cs_eviction_warned', '1');
  } catch (_) {} }, { theme, prefs });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async ({ W, H, doneFrac }) => {
    const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x + y) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const done = new Array(W * H).fill(0); for (let i = 0; i < Math.floor(W * H * doneFrac); i++) done[i] = 1;
    const id = await ProjectStorage.save({ id: 'proj_p5b4', name: 'Access', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: 0.5, savedScroll: { left: 0, top: 0 },
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: Math.floor(W * H / 4), symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id); return id; }, { W, H, doneFrac });
  await page.goto(path ? path.replace('{id}', id) : '/stitch.html?id=' + id);
  if (!path) await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(1800);
}

// WCAG contrast of an element's text on its effective background (alpha-blended up the tree), computed in the page.
const contrastOf = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el || !el.getBoundingClientRect().width) return null;
  const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  let chain = []; for (let e = el; e; e = e.parentElement) chain.push(parse(getComputedStyle(e).backgroundColor));
  let bg = { r: 255, g: 255, b: 255, a: 1 }; for (let i = chain.length - 1; i >= 0; i--) bg = over(chain[i], bg);
  let fg = parse(getComputedStyle(el).color); fg = over(fg, bg);
  const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const a = L(fg), b = L(bg); return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
}, selector);

const TRACKER_TEXT = ['.tb-app-tab:not(.tb-app-tab--active)', '.tb-app-tab--active', '.tb-proj-badge-name', '.tb-proj-badge-pct', '.tb-save-label', '.info-strip-pct', '.ppal-mode-btn--on .ppal-mode-btn-label'];
for (const theme of ['light', 'dark']) {
  test(`Tracker text meets 4.5:1 in the ${theme} theme`, async ({ page }) => {
    await open(page, { theme });
    const bad = [], seen = [];
    for (const sel of TRACKER_TEXT) { const r = await contrastOf(page, sel); if (r != null) { seen.push(sel); if (r < 4.5) bad.push(sel + ' ' + r); } }
    console.log('CONTRAST ' + theme + ' checked ' + seen.length + ' of ' + TRACKER_TEXT.length);
    expect(seen.length, 'most of the elements were on screen to check').toBeGreaterThanOrEqual(5);
    expect(bad).toEqual([]);
  });
}

test('the first-use hint banner meets 4.5:1', async ({ page }) => {
  await open(page, { doneFrac: 0, prefs: { trackerHintsSeen: false } });
  const r = await contrastOf(page, '.tracker-hint');
  expect(r, 'the hint is showing').not.toBeNull();
  expect(r).toBeGreaterThanOrEqual(4.5);
});

test('the dark theme gets its own accent; a chosen accent still wins', async ({ page }) => {
  await open(page, { theme: 'dark' });
  const acc = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase());
  expect(await acc()).toBe('#e2865b');
  await page.evaluate(() => { window.UserPrefs.set('appAccentColour', '#336699'); window.dispatchEvent(new Event('cs:prefsChanged')); });
  await page.waitForTimeout(300);
  expect(await acc()).toBe('#336699');
  await page.evaluate(() => { window.UserPrefs.set('appAccentColour', '#B85C38'); window.dispatchEvent(new Event('cs:prefsChanged')); });
  await page.waitForTimeout(300);
  expect(await acc(), 'back to the default hands the accent back to the theme').toBe('#e2865b');
});

test('Stats in the dark theme: the colour panel is a dark surface and its text meets 4.5:1', async ({ page }) => {
  await open(page, { theme: 'dark' });
  await page.evaluate(() => window.__openTrackerStats && window.__openTrackerStats()); await page.waitForTimeout(1800);
  const panel = page.locator('.colour-progress');
  expect(await panel.count(), 'the colour panel is on the Stats page').toBeGreaterThan(0);
  const bg = await panel.first().evaluate(e => getComputedStyle(e).backgroundColor);
  expect(bg).not.toBe('rgb(255, 255, 255)');
  for (const sel of ['.colour-id', '.colour-name', '.colour-remaining']) { const r = await contrastOf(page, sel); expect(r, sel).not.toBeNull(); expect(r, sel).toBeGreaterThanOrEqual(4.5); }
});

test('milestones: achieved is ticked, next says so, upcoming is dashed (not colour alone)', async ({ page }) => {
  await open(page, { doneFrac: 0.3 });
  await page.evaluate(() => window.__openTrackerStats && window.__openTrackerStats()); await page.waitForTimeout(1800);
  const states = await page.evaluate(() => {
    const q = c => document.querySelector('.milestone-badge.' + c);
    const info = e => e && { tick: !!e.querySelector('.milestone-mark svg'), word: ((e.querySelector('.milestone-state') || {}).textContent || ''), border: getComputedStyle(e).borderTopStyle, width: parseFloat(getComputedStyle(e).borderTopWidth) };
    return { achieved: info(q('achieved')), next: info(q('next')), future: info(q('future')) };
  });
  console.log('MILESTONES ' + JSON.stringify(states));
  expect(states.achieved && states.achieved.tick).toBe(true);
  expect(states.next && states.next.word).toBe('Next');
  expect(states.next.width).toBeGreaterThan(states.achieved.width);
  expect(states.future && states.future.border).toBe('dashed');
  for (const sel of ['.milestone-badge.achieved .milestone-percent', '.milestone-badge.next .milestone-percent', '.milestone-badge.future .milestone-percent']) {
    const r = await contrastOf(page, sel); expect(r, sel).not.toBeNull(); expect(r, sel).toBeGreaterThanOrEqual(4.5);
  }
});

test('a keyboard focus ring on a button is the accent, settled, at least 2 px', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); document.body.focus(); });
  let found = null;
  for (let i = 0; i < 25 && !found; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(350);
    found = await page.evaluate(() => { const e = document.activeElement; if (!e || e.tagName !== 'BUTTON') return null; const c = getComputedStyle(e); return { cls: String(e.className).slice(0, 30), style: c.outlineStyle, width: parseFloat(c.outlineWidth), color: c.outlineColor }; });
  }
  expect(found, 'a button took focus').not.toBeNull();
  console.log('RING ' + JSON.stringify(found));
  expect(found.style).toBe('solid'); expect(found.width).toBeGreaterThanOrEqual(2);
  expect(found.color, 'the accent, not the pale accent border').not.toBe('rgb(232, 184, 154)');
});

test('the selected colour in the legend has an edge bar as well as a tint', async ({ page }) => {
  await open(page);
  await page.locator('.ppal-tile').first().click(); await page.waitForTimeout(500);
  const sh = await page.evaluate(() => { const t = document.querySelector('.ppal-tile--on'); return t ? getComputedStyle(t).boxShadow : null; });
  expect(sh, 'a tile is selected').not.toBeNull();
  expect(sh).toMatch(/inset/);
});

for (const [name, path, wait] of [['Tracker', null, null], ['global Stats', '/index.html?mode=stats&from=home', 3500], ['Home', '/home.html', 1500]]) {
  test(`${name} at 200% browser zoom (720 by 450): no sideways page scroll and the main controls are on screen`, async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 450 });
    if (name === 'Tracker') await open(page); else { await page.goto(path); await page.waitForTimeout(wait); }
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(m.sw, 'no horizontal page scroll').toBeLessThanOrEqual(m.cw + 1);
    if (name === 'Tracker') {
      for (const sel of ['.tb-app-tab--active', '.ppal-mode-btn:has-text("More")']) {
        const box = await page.locator(sel).first().boundingBox(); expect(box, sel).not.toBeNull();
        expect(box.x, sel + ' inside the width').toBeGreaterThanOrEqual(0); expect(box.x + box.width, sel + ' inside the width').toBeLessThanOrEqual(721);
      }
      // First use at this width: the chart is what is on screen (the palette sheet used to open over it).
      const top = await page.evaluate(() => { const r = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 60)); return e ? e.tagName + ' ' + String(e.className).slice(0, 30) : null; });
      expect(top, 'the chart is not covered').toMatch(/^CANVAS|tracker-chart-scroll/);
      await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(500);
      const close = await page.locator('.ppal-more-close').boundingBox(); expect(close).not.toBeNull(); expect(close.x + close.width).toBeLessThanOrEqual(721);
    }
  });
}
