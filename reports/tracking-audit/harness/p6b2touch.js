// Phase 6 batch 2: marking quarter stitches on the chart (mouse), legend, progress, undo/redo, reload.
const T = require('./tk');
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 820, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 10, H = 10, th = { id: '912', rgb: [27, 145, 90] }, k = { id: '310', rgb: [0, 0, 0] };
    const pattern = Array.from({ length: W * H }, () => ({ id: '__skip__' }));
    pattern[5 * W + 5] = { id: '310', type: 'solid', rgb: [0, 0, 0] };
    const proj = { id: 'proj_p6b2t' + Date.now(), name: 'P6B2', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0),
      partialStitches: [[2 * W + 2, { TL: th, BR: th }], [2 * W + 3, { TL: th }], [5 * W + 5, { TL: k }]], savedZoom: 1.5, savedScroll: { left: 0, top: 0 } };
    const id = await ProjectStorage.save(proj); ProjectStorage.setActiveProject(id); return id;
  });
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1500);
  const tile = () => page.evaluate(() => [...document.querySelectorAll('.ppal-tile')].map(t => t.querySelector('.ppal-tile-id').textContent + ': ' + t.querySelector('.ppal-tile-count').textContent));
  const strip = () => page.evaluate(() => (document.querySelector('.info-strip-counts') || {}).textContent || '');
  console.log('start', JSON.stringify(await tile()), '|', await strip());
  const click = async (x, y, fx, fy) => { const p = await T.cellPt(page, x, y, fx, fy); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(120); };
  await click(2, 2, 0.2, 0.2);          // TL of the 912 cell
  console.log('after TL    ', JSON.stringify(await tile()));
  await click(2, 2, 0.8, 0.8);          // BR
  await click(3, 2, 0.5, 0.5);          // the neighbour (single quarter: tap anywhere)
  console.log('after 3 marks', JSON.stringify(await tile()), '|', await strip());
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /undo/i.test((x.getAttribute('aria-label') || '') + x.textContent) && x.closest('.tracker-rail,[class*=rail],[class*=toolbar],body')); b && b.click(); });
  await page.waitForTimeout(200);
  console.log('after undo  ', JSON.stringify(await tile()));
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /redo/i.test((x.getAttribute('aria-label') || '') + x.textContent)); b && b.click(); });
  await page.waitForTimeout(200);
  console.log('after redo  ', JSON.stringify(await tile()));
  // A cell with a whole stitch: the first tap marks the whole stitch, the next tap marks the quarter.
  await click(5, 5, 0.5, 0.5); console.log('whole stitch tap 1', JSON.stringify(await tile()));
  await click(5, 5, 0.2, 0.2); console.log('whole stitch tap 2', JSON.stringify(await tile()));
  await page.screenshot({ path: '/tmp/p6b2.png' });
  await page.waitForTimeout(7000);
  const saved = await page.evaluate(async id => { const p = await ProjectStorage.get(id); return { partialDone: p.partialDone, done: Array.from(p.done).reduce((a, b) => a + b, 0) }; }, id);
  console.log('saved', JSON.stringify(saved));
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1800);
  console.log('after reload', JSON.stringify(await tile()));
  const meta = await page.evaluate(async id => { const l = await ProjectStorage.listProjects(); const m = l.find(x => x.id === id); return m && { pct: m.progress != null ? m.progress : m.percent, completed: m.completedStitches, total: m.totalStitches }; }, id);
  console.log('library', JSON.stringify(meta));
  console.log('errors', JSON.stringify(errs));
  await close();
})();
