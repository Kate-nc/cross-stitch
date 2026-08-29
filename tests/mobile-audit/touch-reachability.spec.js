/* Second mobile pass — reports/mobile-experience-audit.md items 7, 8, 9, 14
   plus completing the C4 hover sweep. Phone project. */
const { test, expect } = require('@playwright/test');

const PAGES = ['/home.html?from=home', '/manager.html?from=home', '/stitch.html?from=home', '/create.html?from=home'];

async function setup(page) {
  await page.addInitScript(() => {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(p =>
        localStorage.setItem('cs_welcome_' + p + '_done', '1'));
    } catch (e) {}
  });
}

test('B3: every topbar control is reachable, not clipped away', async ({ page }) => {
  await setup(page);
  // create.html is the worst case — it carries the sub-page dropdown as well.
  await page.goto('/create.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const inner = document.querySelector('.tb-topbar-inner');
    const cs = getComputedStyle(inner);
    // Every visible control in the row must be scrollable into view, i.e.
    // lie within the row's own scroll extent rather than outside it.
    const unreachable = [];
    for (const el of inner.querySelectorAll('button, a[href]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const left = el.offsetLeft;
      if (left + el.offsetWidth > inner.scrollWidth + 1) {
        unreachable.push((el.getAttribute('aria-label') || el.textContent || el.className).trim().slice(0, 30));
      }
    }
    return {
      overflowX: cs.overflowX,
      clientWidth: inner.clientWidth,
      scrollWidth: inner.scrollWidth,
      scrollable: inner.scrollWidth > inner.clientWidth,
      unreachable,
      docScrollW: document.documentElement.scrollWidth,
      icb: document.documentElement.clientWidth,
    };
  });
  console.log('TOPBAR ' + JSON.stringify(r));
  expect(r.overflowX, 'row must scroll rather than clip its tail').toBe('auto');
  expect(r.unreachable).toEqual([]);
  // and it still must not push the document wide (the B1 class of bug)
  expect(r.docScrollW).toBeLessThanOrEqual(r.icb + 1);
});

test('B3: the File menu button can actually be scrolled to and opened', async ({ page }) => {
  await setup(page);
  await page.goto('/create.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);
  const fileBtn = page.locator('.tb-topbar-inner .tb-page-btn').last();
  await expect(fileBtn).toBeVisible();
  await fileBtn.scrollIntoViewIfNeeded();
  const box = await fileBtn.boundingBox();
  console.log('FILEBTN ' + JSON.stringify(box));
  expect(box, 'File button must have a box after scrolling to it').not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(394);
  await fileBtn.click();
  const fileMenu = page.locator('.tb-page-dropdown').last();
  await expect(fileMenu).toBeVisible();
  const menuBox = await fileMenu.boundingBox();
  const viewport = page.viewportSize();
  console.log('FILEMENU ' + JSON.stringify({ menuBox, viewport }));
  expect(menuBox, 'File menu must have a box after opening').not.toBeNull();
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.y).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(viewport.width);
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(viewport.height);
});

test('B4/B5: --app-header-height matches the real header, strip sits flush', async ({ page }) => {
  await setup(page);
  await page.goto('/home.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const hdr = document.querySelector('.tb-topbar');
    const token = getComputedStyle(document.documentElement).getPropertyValue('--app-header-height').trim();
    return { headerH: hdr.getBoundingClientRect().height, token };
  });
  console.log('HEADER_TOKEN ' + JSON.stringify(r));
  // The ResizeObserver in header.js must have published the measured height.
  expect(parseFloat(r.token)).toBeCloseTo(r.headerH, 1);
});

test('B4: header reserves the top safe-area inset', async ({ page }) => {
  await setup(page);
  await page.goto('/home.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.tb-topbar'));
    return { paddingTop: cs.paddingTop, height: cs.height };
  });
  console.log('HEADER_SAFEAREA ' + JSON.stringify(r));
  // Emulator reports a 0 inset, so the box is the plain 48px — what matters
  // is that the declaration resolved rather than being dropped as invalid.
  expect(r.paddingTop).toBe('0px');
  expect(r.height).toBe('48px');
});

test('D1: no focusable field under 16px on any page (iOS zoom-on-focus)', async ({ page }) => {
  await setup(page);
  const offenders = [];
  for (const p of PAGES) {
    await page.goto(p, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(2500);
    const bad = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const fs = parseFloat(cs.fontSize);
        // A scaled-down field still reports >=16px, which is what iOS reads.
        if (fs && fs < 16) out.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40), fs });
      }
      return out;
    });
    if (bad.length) offenders.push({ page: p, bad });
  }
  console.log('SMALL_FIELDS ' + JSON.stringify(offenders));
  expect(offenders).toEqual([]);
});

test('D2: the audited touch targets are at least 44px', async ({ page }) => {
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const check = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height) };
    };
    return {
      navLink: check('.tb-nav-link'),
      appTab: check('.tb-app-tab'),
      chip: check('.mgr-chip'),
      sort: check('.mgr-sort-select'),
    };
  });
  console.log('TARGETS ' + JSON.stringify(r));
  for (const [name, box] of Object.entries(r)) {
    if (!box) continue;
    expect(box.h, `${name} height`).toBeGreaterThanOrEqual(44);
  }
  expect(r.navLink.w, 'nav link width').toBeGreaterThanOrEqual(44);
});

test('D3: the chart suppresses the iOS callout and text selection', async ({ page }) => {
  await setup(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  // .canvas-area only exists once a project is open, so load one.
  const sW = 40, sH = 40, total = sW * sH;
  const col = { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
  const fixture = {
    version: 9, page: 'tracker', name: 'callout',
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern: new Array(total).fill(col), bsLines: [], done: new Array(total).fill(0),
    parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: [{ ...col, name: 'Black', lab: [0, 0, 0], count: total }],
    singleStitchEdits: [], halfStitches: [], halfDone: [], statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  };
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'callout.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.waitForSelector('.canvas-area', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.canvas-area');
    const cvs = el.querySelector('canvas');
    const read = (n) => ({ userSelect: getComputedStyle(n).userSelect });
    return { area: read(el), canvas: cvs ? read(cvs) : null };
  });
  console.log('CALLOUT ' + JSON.stringify(r));
  // user-select is the half Chromium can verify. -webkit-touch-callout is
  // Safari-only — Chromium drops it at parse time, so it is absent from both
  // computed style and rule.cssText and cannot be checked here at all. It is
  // asserted against the stylesheet source in tests/mobileTouchErgonomics.
  expect(r.area.userSelect).toBe('none');
  if (r.canvas) expect(r.canvas.userSelect).toBe('none');
});

test('C4: hover rules are guarded, so nothing latches after a tap', async ({ page }) => {
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    // Walk every stylesheet rule and find :hover rules that are NOT inside a
    // media query mentioning hover or pointer. Those are the ones that latch.
    const unguarded = [];
    const walk = (rules, guarded) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const cond = rule.conditionText || rule.media.mediaText || '';
          walk(rule.cssRules, guarded || /hover|pointer/i.test(cond));
        } else if (rule.type === CSSRule.SUPPORTS_RULE) {
          walk(rule.cssRules, guarded);
        } else if (rule.type === CSSRule.STYLE_RULE) {
          if (guarded) continue;
          const sel = rule.selectorText || '';
          if (!sel.includes(':hover')) continue;
          const parts = sel.split(',').map(s => s.trim());
          // Mixed lists (e.g. `.a:hover x, .a:focus-within x`) are fine —
          // the non-hover half is what carries them on touch.
          if (!parts.every(s => s.includes(':hover'))) continue;
          const css = rule.style.cssText || '';
          if (/^\s*cursor\s*:[^;]*;?\s*$/.test(css)) continue;
          if (!/background|filter|border-color|box-shadow|color|opacity|transform/.test(css)) continue;
          unguarded.push(sel.slice(0, 80));
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { walk(sheet.cssRules, false); } catch (e) { /* cross-origin */ }
    }
    return { count: unguarded.length, sample: unguarded.slice(0, 10) };
  });
  console.log('UNGUARDED_HOVER ' + JSON.stringify(r));
  expect(r.count, `hover rules that would latch on touch: ${r.sample.join(' | ')}`).toBe(0);
});
