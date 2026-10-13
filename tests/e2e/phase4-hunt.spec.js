/* Phase 4 end-of-phase hunt: the cases the batch specs did not cover.
     browser zoom 200% (the CSS viewport halves), on-screen keyboard, rotation with a selection, mouse and
     trackpad (wheel, Ctrl+wheel), stylus, palm (many fingers). Logs what it finds with HUNT lines. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS, trackerCellPoint, trackerDoneCount, trackerScroll, trackerTouchDriver, dispatchPointerSequence } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function openProject(page, { focusOnPhone = false, extra } = {}) {
  await page.addInitScript((focusOnPhone) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    localStorage.setItem('cs_pref_trackerFocusOnPhone', JSON.stringify(focusOnPhone));
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerHintsSeen', 'true');
  } catch (_) {} }, focusOnPhone);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 60, H = 60;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const id = await ProjectStorage.save({ id: 'proj_hunt', name: 'Hunt project', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 1800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 1800, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(900);
  return id;
}
const errors = [];
test.beforeEach(async ({ page }) => { errors.length = 0; page.on('pageerror', e => errors.push(String(e))); });

const pageFits = page => page.evaluate(() => ({
  sw: document.documentElement.scrollWidth, iw: window.innerWidth, bsw: document.body.scrollWidth,
  canvas: (() => { const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; })(),
}));
// What is on top at the centre of a visible control with this label: it, or something inside it, means it can be pressed.
const reachableByName = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const els = [...document.querySelectorAll('button, [role=button]')].filter(b => rx.test((b.getAttribute('aria-label') || '') + ' ' + b.textContent) && b.getBoundingClientRect().width > 0);
  return els.map(el => { el.scrollIntoView({ block: 'nearest', inline: 'nearest' });          // a person scrolls a strip that does not fit
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy); return { text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20), inView: cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight, ok: !!top && (el === top || el.contains(top)) }; });
}, re.source);

for (const vp of [{ name: 'phone at 200% (196x364)', w: 196, h: 364, touch: true }, { name: 'tablet at 200% (384x512)', w: 384, h: 512, touch: true }, { name: 'desktop at 200% (720x450)', w: 720, h: 450, touch: false }]) {
  test('browser zoom 200%: ' + vp.name, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch }); await installLocalCdn(context);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
    await openProject(page);
    // At this width the colour panel opens as an overlay over the controls (as it did before Phase 4); a tap outside closes it.
    const backdrop = page.locator('.lpanel-backdrop');
    if (await backdrop.count()) { await backdrop.first().click({ position: { x: 5, y: 5 } }); await page.waitForTimeout(400); }
    const fit = await pageFits(page);
    console.log('HUNT zoom200 ' + vp.name + ' ' + JSON.stringify(fit));
    expect(fit.sw, 'no sideways scroll of the page').toBeLessThanOrEqual(fit.iw + 1);
    expect(fit.canvas, 'the chart is there').not.toBeNull();
    expect(fit.canvas.h, 'the chart has height').toBeGreaterThan(80);
    const ctl = await reachableByName(page, /^\s*(mark|undo|more|colours|nav)\s*$/i);
    console.log('HUNT zoom200 controls ' + JSON.stringify(ctl));
    for (const c of ctl) expect(c.ok, c.text + ' is not covered').toBe(true);
    // And a tap marks.
    if (vp.touch) { const touch = await trackerTouchDriver(page); const p = await trackerCellPoint(page, 3, 3); await touch('touchStart', [p]); await page.waitForTimeout(50); await touch('touchEnd', []); await page.waitForTimeout(400); expect(await trackerDoneCount(page)).toBe(1); }
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('on-screen keyboard: with the viewport halved, the More panel stays inside it and can be closed', async ({ browser }) => {
  // Renaming is not offered in the Tracker below desktop widths in either build (the project switcher names the
  // project; probed on the build before Phase 4 too), so a keyboard over a Tracker field does not arise there. What a
  // keyboard (or a split-screen window) does do is halve the viewport while a panel is open: the panel must still fit.
  const context = await browser.newContext({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true }); await installLocalCdn(context);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await openProject(page, { focusOnPhone: false });
  console.log('HUNT keyboard: rename control on a 393 px phone: ' + (await page.locator('button[aria-label="Rename project"]:visible').count()));
  await page.locator('.ppal-mode-btn', { hasText: /More/i }).click(); await page.waitForTimeout(400);
  await page.setViewportSize({ width: 393, height: 380 }); await page.waitForTimeout(500);
  const box = await page.evaluate(() => { const p = document.getElementById('ppal-more-panel'); const r = p.getBoundingClientRect(); const c = document.querySelector('.ppal-more-close').getBoundingClientRect(); const sh = document.scrollingElement.scrollHeight; window.scrollTo(0, 9999); const r2 = p.getBoundingClientRect(); const out = { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, closeTop: Math.round(c.top), closeBottom: Math.round(c.bottom), pageScrollHeight: sh, bottomAfterScroll: Math.round(r2.bottom) }; window.scrollTo(0, 0); return out; });
  console.log('HUNT keyboard More panel ' + JSON.stringify(box));
  expect(Math.min(box.bottom, box.bottomAfterScroll), 'the whole panel can be brought into the visible part (it fits, or the page scrolls to it)').toBeLessThanOrEqual(box.vh + 1);
  expect(box.closeTop >= 0 && box.closeBottom <= box.vh, 'its close button is on screen').toBe(true);
  await page.locator('.ppal-more-close').click(); await page.waitForTimeout(300);
  await page.setViewportSize({ width: 393, height: 727 }); await page.waitForTimeout(500);
  const fit = await pageFits(page);
  expect(fit.canvas.h, 'the chart comes back to its size').toBeGreaterThan(300);
  expect(errors).toEqual([]);
  await context.close();
});

test('rotation mid-session keeps the marks, and a tap after the turn lands on the cell under the finger', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true }); await installLocalCdn(context);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await openProject(page);
  const touch = await trackerTouchDriver(page);
  for (const [x, y] of [[3, 3], [4, 3], [5, 3]]) { const p = await trackerCellPoint(page, x, y); await touch('touchStart', [p]); await page.waitForTimeout(40); await touch('touchEnd', []); await page.waitForTimeout(250); }
  expect(await trackerDoneCount(page)).toBe(3);
  await page.setViewportSize({ width: 851, height: 393 }); await page.waitForTimeout(700);
  expect(await trackerDoneCount(page), 'marks survive a turn').toBe(3);
  const land = await pageFits(page);
  console.log('HUNT rotation landscape ' + JSON.stringify(land));
  expect(land.sw).toBeLessThanOrEqual(land.iw + 1);
  const p = await trackerCellPoint(page, 6, 3);
  const t2 = await trackerTouchDriver(page); await t2('touchStart', [p]); await page.waitForTimeout(40); await t2('touchEnd', []); await page.waitForTimeout(300);
  expect(await trackerDoneCount(page), 'a tap after the turn lands on the cell under it').toBe(4);
  await page.setViewportSize({ width: 393, height: 727 }); await page.waitForTimeout(700);
  expect(await trackerDoneCount(page)).toBe(4);
  expect(errors).toEqual([]);
  await context.close();
});

test('mouse and trackpad: the wheel scrolls the chart and marks nothing; Ctrl+wheel zooms it', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await installLocalCdn(context);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await openProject(page);
  const p = await trackerCellPoint(page, 10, 10);
  await page.mouse.move(p.x, p.y);
  const s0 = await trackerScroll(page);
  await page.mouse.wheel(0, 240); await page.waitForTimeout(300);   // a trackpad two-finger scroll arrives as wheel events
  await page.mouse.wheel(60, 0); await page.waitForTimeout(300);
  const s1 = await trackerScroll(page);
  console.log('HUNT wheel ' + JSON.stringify({ s0, s1 }));
  expect(s1.top, 'the wheel scrolls down').toBeGreaterThan(s0.top);
  expect(await trackerDoneCount(page), 'and marks nothing').toBe(0);
  const z0 = await page.evaluate(() => document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await page.waitForTimeout(400);
  const z1 = await page.evaluate(() => document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
  console.log('HUNT ctrl+wheel cell size ' + z0 + ' -> ' + z1);
  expect(z1, 'Ctrl+wheel zooms the chart, not the page').toBeGreaterThan(z0);
  const pageZoom = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);
  expect(pageZoom).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

test('stylus: a tap marks, a quick swipe does not, a rest then a drag paints', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true }); await installLocalCdn(context);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await openProject(page);
  const canvas = page.locator(TRACKER_CANVAS);
  const cell = async (x, y) => trackerCellPoint(page, x, y);
  const seq = (pts, type = 'pen') => pts.map((q, i) => ({ type: i === 0 ? 'pointerdown' : (i === pts.length - 1 ? 'pointerup' : 'pointermove'), x: q.x, y: q.y, pointerId: 7, pointerType: type }));
  const a = await cell(4, 4);
  await dispatchPointerSequence(canvas, seq([a, a])); await page.waitForTimeout(300);
  console.log('HUNT pen tap marked ' + (await trackerDoneCount(page)));
  const swipePts = []; for (let i = 0; i <= 6; i++) swipePts.push(await cell(4 + i, 8));
  await dispatchPointerSequence(canvas, seq(swipePts)); await page.waitForTimeout(300);
  console.log('HUNT pen quick swipe, total marked ' + (await trackerDoneCount(page)));
  const done = await trackerDoneCount(page);
  expect(done, 'a tap marks one and a quick swipe adds nothing').toBe(1);
  // Rest the pen on a stitch for longer than the hold, then drag five cells along the row: it paints what it crosses.
  const rest = await cell(4, 12);
  await dispatchPointerSequence(canvas, [{ type: 'pointerdown', x: rest.x, y: rest.y, pointerId: 7, pointerType: 'pen' }]);
  await page.waitForTimeout(250);
  const drag = []; for (let i = 1; i <= 5; i++) drag.push(await cell(4 + i, 12));
  const last = drag[drag.length - 1];
  await dispatchPointerSequence(canvas, drag.map(q => ({ type: 'pointermove', x: q.x, y: q.y, pointerId: 7, pointerType: 'pen' })).concat([{ type: 'pointerup', x: last.x, y: last.y, pointerId: 7, pointerType: 'pen' }]));
  await page.waitForTimeout(400);
  console.log('HUNT pen rest-then-drag, total marked ' + (await trackerDoneCount(page)));
  expect(await trackerDoneCount(page), 'the rested drag paints the cell it rested on and five more').toBe(1 + 6);
  expect(errors).toEqual([]);
  await context.close();
});

test('palm: three fingers on the chart mark nothing and do not break the next tap', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true }); await installLocalCdn(context);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(String(e)));
  await openProject(page);
  const touch = await trackerTouchDriver(page);
  const pts = []; for (const [x, y] of [[3, 3], [4, 6], [6, 4]]) { const p = await trackerCellPoint(page, x, y); pts.push({ ...p, id: pts.length + 1 }); }
  await touch('touchStart', pts); await page.waitForTimeout(200);
  await touch('touchMove', pts.map(p => ({ ...p, x: p.x + 5, y: p.y + 5 }))); await page.waitForTimeout(100);
  await touch('touchEnd', []); await page.waitForTimeout(400);
  console.log('HUNT palm marked ' + (await trackerDoneCount(page)));
  expect(await trackerDoneCount(page)).toBe(0);
  const p = await trackerCellPoint(page, 8, 8);
  await touch('touchStart', [p]); await page.waitForTimeout(50); await touch('touchEnd', []); await page.waitForTimeout(400);
  expect(await trackerDoneCount(page), 'the next tap works').toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});
