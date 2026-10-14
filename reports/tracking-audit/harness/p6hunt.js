// Phase 6 end-of-phase hunt: all stitch types together, undo across types, colour lock, a pattern edited after tracking.
const T = require('./tk');
const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const PREFS = () => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} };
const out = [];
const say = (n, ok, detail) => { out.push((ok ? 'PASS ' : 'FAIL ') + n + (detail ? ' :: ' + detail : '')); console.log(out[out.length - 1]); };
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(PREFS);
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const th = (id, rgb) => ({ id, rgb });
  async function seed(extra) {
    return page.evaluate(async (extra) => {
      const W = 12, H = 12, a = { id: '310', type: 'solid', rgb: [0, 0, 0] }, b = { id: '666', type: 'solid', rgb: [200, 0, 0] };
      const pattern = Array.from({ length: W * H }, (_, i) => (i === 5 * W + 5 ? a : (i % 7 === 0 ? b : { id: '__skip__' })));
      pattern[5 * W + 5] = a; pattern[8 * W + 8] = b;
      const proj = Object.assign({ id: 'proj_hunt' + Date.now() + Math.random().toString(36).slice(2, 5), name: 'Hunt', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), savedZoom: 1.8, savedScroll: { left: 0, top: 0 },
        // cell (5,5): a whole stitch plus a quarter (TL, 310), a knot on its bottom-right corner, a backstitch along its top edge
        partialStitches: [[5 * W + 5, { TL: { id: '310', rgb: [0, 0, 0] } }], [8 * W + 8, { BR: { id: '666', rgb: [200, 0, 0] } }]],
        knots: [{ x: 12, y: 12, id: '310', rgb: [0, 0, 0] }],
        bsLines: [{ x1: 5, y1: 5, x2: 6, y2: 5, color: '#000000', colorId: '310' }, { x1: 8, y1: 9, x2: 9, y2: 9, color: '#c80000', colorId: '666' }] }, extra || {});
      const id = await ProjectStorage.save(proj); ProjectStorage.setActiveProject(id); return id;
    }, extra);
  }
  const open = async (id) => { await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1800); };
  const read = () => page.evaluate(() => ({ counts: (document.querySelector('.info-strip-counts') || {}).textContent || '', bd: (document.querySelector('.info-strip-breakdown') || {}).textContent || '', tiles: [...document.querySelectorAll('.ppal-tile')].map(t => t.querySelector('.ppal-tile-id').textContent + ' ' + t.querySelector('.ppal-tile-count').textContent) }));
  const click = async (x, y, fx, fy, dy) => { const p = await T.cellPt(page, x, y, fx, fy); await page.mouse.click(p.x, p.y + (dy || 0)); await page.waitForTimeout(150); };

  // A. Every type in one cell, marked in turn, undone in turn, redone in turn.
  let id = await seed(); await open(id);
  const s0 = await read(); say('A0 start', /0\/1/.test(s0.tiles[0]) && /0\/1 knots/.test(s0.tiles[0]) && /0\/1 fractional/.test(s0.tiles[0]) && /0\/1 lines/.test(s0.tiles[0]), s0.tiles[0]);
  const step = async (label, fn) => { await fn(); const r = await read(); console.log('  ' + label + ' -> ' + r.tiles[0] + ' | ' + r.counts); };
  await step('tap centre (whole stitch)', () => click(5, 5, 0.5, 0.5));
  await step('tap just inside TL (quarter, whole stitch done)', () => click(5, 5, 0.38, 0.38));
  const lp = await T.cellPt(page, 5, 5, 0.5, 0.0);
  await step('tap the top-edge line', async () => { await page.mouse.click(lp.x, lp.y); await page.waitForTimeout(150); });
  const kp = await T.cellPt(page, 5, 5, 1.0, 1.0);
  await step('tap the knot (cell corner)', async () => { await page.mouse.click(kp.x, kp.y); await page.waitForTimeout(150); });
  const s2 = await read();
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(150); }
  const s3 = await read(); say('A1 four undos return to nothing marked', /^310 0\/1 · 0\/1 knots · 0\/1 fractional · 0\/1 lines$/.test(s3.tiles[0]), s3.tiles[0] + ' | ' + s3.counts);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(150); }
  const s4 = await read(); say('A2 all four marked after the taps, and redo restores the same marks', /^310 1\/1 · 1\/1 knots · 1\/1 fractional · 1\/1 lines$/.test(s2.tiles[0]) && JSON.stringify(s4.tiles) === JSON.stringify(s2.tiles) && s4.counts === s2.counts, s4.tiles[0] + ' | ' + s4.counts);

  // B. The colour lock (highlight view, colour 310 selected): a 666 quarter and a 666 line are refused, 310's work.
  id = await seed(); await open(id);
  await page.evaluate(() => [...document.querySelectorAll('.ppal-tile')].find(t => t.textContent.indexOf('310') >= 0).click()); await page.waitForTimeout(400);
  await click(8, 8, 0.5, 0.5);                       // the 666 stitch (locked out)
  const bl = await T.cellPt(page, 8, 9, 0.5, 0.0); await page.mouse.click(bl.x, bl.y); await page.waitForTimeout(200);   // the 666 line (locked out)
  const b1 = await read(); const t666 = b1.tiles.find(t => t.indexOf('666') >= 0);
  say('B1 locked: nothing of 666 is marked', /0\/1/.test(t666) && /0\/1 lines/.test(t666) && !/1\/1/.test(t666), t666);
  const l310 = await T.cellPt(page, 5, 5, 0.5, 0.0); await page.mouse.click(l310.x, l310.y); await page.waitForTimeout(200);
  const b2 = await read(); say('B2 locked: a 310 line can be marked', /1\/1 lines/.test(b2.tiles.find(t => t.indexOf('310') >= 0)), b2.tiles.find(t => t.indexOf('310') >= 0));

  // C. A pattern edited after tracking: marks no longer fit the pattern's size; the quarter marks follow when the earlier marks are kept.
  const W = 10, H = 10;
  id = await page.evaluate(async () => {
    const W = 10, H = 10, k = { id: '310', type: 'solid', rgb: [0, 0, 0] };
    const pattern = Array.from({ length: W * H }, () => k);
    const done = new Array(9 * 10).fill(0); done[3] = 1;                          // an older 9-column pattern
    const id = await ProjectStorage.save({ id: 'proj_huntc' + Date.now(), name: 'Edited', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done,
      partialStitches: [[2 * W + 2, { TL: { id: '310', rgb: [0, 0, 0] } }]], partialDone: [[2 * 9 + 2, ['TL']]], savedZoom: 1.5, savedScroll: { left: 0, top: 0 } });
    ProjectStorage.setActiveProject(id); return id;
  });
  await open(id);
  const dlg = await page.evaluate(() => [...document.querySelectorAll('.resume-recap-btn')].map(b => b.textContent.trim().slice(0, 60)));
  say('C0 the pattern-changed question is asked', dlg.length >= 2, JSON.stringify(dlg));
  // Pick the reading with 9 columns (the old shape).
  const idx = await page.evaluate(() => { const bs = [...document.querySelectorAll('.resume-recap-btn')]; const i = bs.findIndex(b => /9/.test(b.textContent) && /column/i.test(b.textContent)); if (i >= 0) bs[i].click(); return i; });
  await page.waitForTimeout(800);
  const c1 = await read();
  say('C1 the quarter mark was carried to its new cell (shows 1 of 1 fractional done)', /1\/1 fractional/.test(c1.tiles[0]), idx + ' ' + c1.tiles[0]);

  console.log('errors', JSON.stringify(errs));
  console.log('\nSUMMARY ' + out.filter(l => l.startsWith('PASS')).length + ' pass, ' + out.filter(l => l.startsWith('FAIL')).length + ' fail');
  await close();
})();
