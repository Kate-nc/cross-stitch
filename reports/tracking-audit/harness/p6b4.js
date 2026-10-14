// Phase 6 batch 4: Unpick area on mouse (Shift+Alt+drag), keyboard (Ctrl+Shift+Enter) and touch (long-press, Unpick area).
const T = require('./tk');
const MODE = process.env.MODE || 'mouse';
(async () => {
  const touch = MODE === 'touch';
  const { ctx, close } = await T.launch(touch ? { viewport: { width: 1000, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1300, height: 850 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); localStorage.setItem('cs_pref_trackerMarkAllAs', JSON.stringify('mark')); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 20, H = 20, k = { id: '310', type: 'solid', rgb: [0, 0, 0] }, rgb = [0, 0, 0];
    const pattern = Array.from({ length: W * H }, () => ({ id: '__skip__' }));
    const done = new Array(W * H).fill(0);
    for (let x = 2; x <= 5; x++) { pattern[2 * W + x] = k; done[2 * W + x] = 1; }       // 4 whole stitches done
    pattern[10 * W + 10] = k; done[10 * W + 10] = 1;                                      // one outside the rectangle, done
    pattern[4 * W + 5] = k; pattern[12 * W + 12] = k;                                                             // and one not done, so the project is not complete
    const halfStitches = [[3 * W + 2, { fwd: { id: '310', rgb } }], [3 * W + 3, { fwd: { id: '310', rgb } }]];
    const halfDone = [[3 * W + 2, { fwd: 1 }], [3 * W + 3, { fwd: 1 }]];
    const partialStitches = [[3 * W + 4, { TL: { id: '310', rgb }, BR: { id: '310', rgb } }]];
    const partialDone = [[3 * W + 4, ['TL', 'BR']]];
    const knots = [{ x: 11, y: 7, id: '310', rgb }];                                      // the middle of cell (5,3)
    const bsLines = [{ x1: 2, y1: 4, x2: 3, y2: 4, color: '#000000', colorId: '310' }, { x1: 8, y1: 8, x2: 9, y2: 8, color: '#000000', colorId: '310' }];
    const bsDone = ['2,4,3,4,310', '8,8,9,8,310'];
    const id = await ProjectStorage.save({ id: 'proj_p6b4' + Date.now(), name: 'P6B4', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, halfStitches, halfDone, partialStitches, partialDone, knots, knotsDone: ['11,7'], bsLines, bsDone, savedZoom: 1.6, savedScroll: { left: 0, top: 0 } });
    ProjectStorage.setActiveProject(id); return id;
  });
  page.on('console', m => { if (/UPDBG/.test(m.text())) console.log('  ', m.text()); if (m.type() === 'error') console.log('console.error', m.text().slice(0, 300)); }); await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 30000 }).catch(async e => { console.log('errs', JSON.stringify(errs)); console.log((await page.evaluate(() => document.body.innerText)).slice(0, 400)); throw e; }); await page.waitForTimeout(1800);
  const read = () => page.evaluate(() => ({
    counts: (document.querySelector('.info-strip-counts') || {}).textContent || '', breakdown: (document.querySelector('.info-strip-breakdown') || {}).textContent || '',
    toast: (document.querySelector('.toast, [class*=toast]') || {}).textContent || ''
  }));
  console.log('start', JSON.stringify(await read()));
  const pt = (x, y) => T.cellPt(page, x, y, 0.5, 0.5);
  if (MODE === 'mouse') {
    const a = await pt(2, 2), b = await pt(5, 4);
    await page.mouse.click(a.x, a.y); await page.waitForTimeout(200);                  // the anchor: marks or unmarks the stitch at (2,2)
    console.log('after anchor click', JSON.stringify(await read()));
    await page.keyboard.down('Shift');
    await page.mouse.move(b.x - 20, b.y - 20); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.keyboard.down('Alt');                                                    // Alt at release: unpick instead of fill
    await page.mouse.up(); await page.keyboard.up('Alt'); await page.keyboard.up('Shift'); await page.waitForTimeout(400);
  } else if (MODE === 'keyboard') {
    await page.keyboard.press('n'); await page.waitForTimeout(150);
    const g = await pt(2, 2); await page.mouse.click(g.x, g.y); await page.waitForTimeout(200);
    await page.keyboard.press('t'); await page.waitForTimeout(150);
    await page.evaluate(() => document.querySelector('canvas[role=application]').focus());
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);                 // takes the guide
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);                 // marks (unmarks) the stitch at (2,2): sets the anchor
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80); }
    for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); }
    console.log('before keyboard unpick', JSON.stringify(await read()));
    await page.keyboard.press('Control+Shift+Enter'); await page.waitForTimeout(400);
  } else {
    const a = await pt(2, 2), b = await pt(5, 4);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/p6b4bar.png' });
    const btn = await page.$('.range-anchor-bar__btn:has-text("Unpick area")');
    console.log('bar button', !!btn);
    if (btn) { await btn.click(); await page.waitForTimeout(200); await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(500); }
  }
  console.log('after unpick', JSON.stringify(await read()));
  await page.screenshot({ path: '/tmp/p6b4.png' });
  if (process.env.SKIPUNDO !== '1') {
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  console.log('after undo  ', JSON.stringify(await read()));
  await page.keyboard.press('Control+y'); await page.waitForTimeout(300);
  console.log('after redo  ', JSON.stringify(await read()));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  }
  await page.waitForTimeout(7000);
  const saved = await page.evaluate(async id => { const p = await ProjectStorage.get(id); return { done: Array.from(p.done).reduce((a, b) => a + b, 0), halfDone: p.halfDone, partialDone: p.partialDone, knotsDone: p.knotsDone, bsDone: p.bsDone, sessions: (p.statsSessions || []).map(s => ({ u: s.unitsCompleted, uu: s.unitsUndone, net: s.units })) }; }, id);
  console.log('saved (after undo)', JSON.stringify(saved));
  // End the session by leaving the page, then read what was recorded.
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage); await page.waitForTimeout(1500);
  const after = await page.evaluate(async id => { const p = await ProjectStorage.get(id); return (p.statsSessions || []).map(s => ({ added: s.unitsCompleted, unpicked: s.unitsUndone, net: s.units, stitches: s.stitchesCompleted, stitchesUndone: s.stitchesUndone })); }, id);
  console.log('sessions after leaving', JSON.stringify(after));
  console.log('errors', JSON.stringify(errs));
  await close();
})();
