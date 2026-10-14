// A finger held on a backstitch line shows the loupe; lifting marks the line; the loupe goes away.
const T = require('./tk');
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 820, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 20, H = 20, pattern = Array.from({ length: W * H }, () => ({ id: '__skip__' }));
    pattern[15 * W + 15] = { id: '310', type: 'solid', rgb: [0, 0, 0] };
    const bsLines = []; for (let i = 0; i < 8; i++) bsLines.push({ x1: 2 + i, y1: 5, x2: 3 + i, y2: 5, color: '#000000', colorId: '310' });
    const id = await ProjectStorage.save({ id: 'proj_p6loupe' + Date.now(), name: 'Loupe', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), bsLines, savedZoom: 1.6, savedScroll: { left: 0, top: 0 } });
    ProjectStorage.setActiveProject(id); return id;
  });
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1800);
  const cdp = await ctx.newCDPSession(page);
  const p = await T.cellPt(page, 4, 5, 0.5, 0.0); p.y += 3;
  const loupe = () => page.evaluate(() => !!document.querySelector('.creator-loupe'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
  await page.waitForTimeout(250);
  console.log('loupe while held', await loupe());
  await page.screenshot({ path: '/tmp/p6loupe.png' });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  console.log('loupe after lift', await loupe());
  const marked = await page.evaluate(() => (document.querySelector('.info-strip-breakdown') || {}).textContent || '');
  console.log('strip', marked);
  console.log('errors', JSON.stringify(errs));
  await close();
})();
