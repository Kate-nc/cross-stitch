// Phase 6 batch 3: backstitch marking (tap, drag, undo, legend, keyboard, reload).
const T = require('./tk');
(async () => {
  const touch = process.env.TOUCH === '1';
  const { ctx, close } = await T.launch(touch ? { viewport: { width: 820, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1300, height: 850 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 20, H = 20, k = { id: '310', type: 'solid', rgb: [0, 0, 0] };
    const pattern = Array.from({ length: W * H }, () => ({ id: '__skip__' }));
    pattern[10 * W + 3] = k; pattern[15 * W + 15] = k;                                   // a stitch right under a line
    const bsLines = [];
    for (let i = 0; i < 8; i++) bsLines.push({ x1: 2 + i, y1: 5, x2: 3 + i, y2: 5, color: '#000000', colorId: '310' });
    const id0 = 'proj_p6b3' + Date.now() + Math.random().toString(36).slice(2, 5);
    const proj = { id: id0, name: 'P6B3', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), bsLines, savedZoom: 1.6, savedScroll: { left: 0, top: 0 } };
    const id = await ProjectStorage.save(proj); ProjectStorage.setActiveProject(id); return id;
  });
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1800);
  const tile = () => page.evaluate(() => [...document.querySelectorAll('.ppal-tile')].map(t => t.querySelector('.ppal-tile-id').textContent + ': ' + t.querySelector('.ppal-tile-count').textContent));
  const strip = () => page.evaluate(() => (document.querySelector('.info-strip-breakdown') || {}).textContent || '');
  const act = async (x, y) => { const p = await T.cellPt(page, x, y, 0, 0); return p; };
  const tap = async (p) => { if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
  console.log('start', JSON.stringify(await tile()), '|', await strip());
  // taps on the middle of lines 0, 1, 2 (mid-point (2.5,5), ...), 3px off the line
  for (let i = 0; i < 3; i++) { const p = await T.cellPt(page, 2 + i, 5, 0.5, 0.0); p.y += 3; await tap(p); }
  if (touch) { /* loupe check below */ }
  console.log('after 3 taps', JSON.stringify(await tile()), '|', await strip());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  console.log('after undo', JSON.stringify(await tile()));
  await page.keyboard.press('Control+y'); await page.waitForTimeout(200);
  console.log('after redo', JSON.stringify(await tile()));
  // the stitch under a line: tap its centre marks the stitch, not a line
  const c = await T.cellPt(page, 3, 10, 0.5, 0.5); await tap(c);
  console.log('stitch tap  ', JSON.stringify(await tile()));
  // drag along lines 3..7 (mouse only)
  if (!touch) {
    const a = await T.cellPt(page, 5, 5, 0.5, 0.0), b = await T.cellPt(page, 9, 5, 0.5, 0.0);
    await page.mouse.move(a.x, a.y + 2); await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 20, a.y + 2);
    await page.mouse.up(); await page.waitForTimeout(250);
    console.log('after drag  ', JSON.stringify(await tile()));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    console.log('undo drag (one step)', JSON.stringify(await tile()));
  }
  // legend: mark all lines of this colour
  await page.evaluate(() => document.querySelector('.ppal-tile-bs-btn').click()); await page.waitForTimeout(250);
  console.log('mark all    ', JSON.stringify(await tile()));
  await page.evaluate(() => document.querySelector('.ppal-tile-bs-btn').click()); await page.waitForTimeout(250);
  console.log('clear all   ', JSON.stringify(await tile()));
  // keyboard: the guide to cell (4,5), B selects the lines touching it, Enter marks the selected one
  await page.keyboard.press('n'); await page.waitForTimeout(150);
  const gp = await T.cellPt(page, 6, 4, 0.5, 0.5); await page.mouse.click(gp.x, gp.y); await page.waitForTimeout(200);   // Navigate: a click places the guide
  await page.keyboard.press('t'); await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('canvas[role=application]').focus());
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);   // first Enter: the keyboard takes the guide
  await page.keyboard.press('b'); await page.waitForTimeout(150); await page.screenshot({ path: '/tmp/p6b3sel.png' });
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  console.log('keyboard B+Enter', JSON.stringify(await tile()));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  console.log('keyboard undo   ', JSON.stringify(await tile()));
  await page.keyboard.press('b'); await page.keyboard.press('b'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  console.log('keyboard B,B,Enter (next line)', JSON.stringify(await tile()));
  await page.screenshot({ path: '/tmp/p6b3.png' });
  await page.waitForTimeout(7000);
  const saved = await page.evaluate(async id => { const p = await ProjectStorage.get(id); return { bsDone: p.bsDone, done: Array.from(p.done).reduce((a, b) => a + b, 0) }; }, id);
  console.log('saved', JSON.stringify(saved));
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1800);
  console.log('after reload', JSON.stringify(await tile()));
  console.log('errors', JSON.stringify(errs));
  await close();
})();
