// Unpick area cost on a large chart: 300x300 with 20% done, N backstitch lines (a quarter of them done), a 100x100 rectangle.
const T = require('./tk');
const N = Number(process.env.BS || 10000);
const metric = async (cdp, name) => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === name).value;
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async (N) => {
    const W = 300, H = 300, pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const done = new Array(W * H).fill(0); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0 || (x < 100 && y < 100 && (x + y) % 3)) done[y * W + x] = 1;
    let seed = 777; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const bsLines = [], bsDone = [];
    while (bsLines.length < N) { const x = Math.floor(rnd() * (W - 1)), y = Math.floor(rnd() * (H - 1)); const ln = { x1: x, y1: y, x2: x + 1, y2: y, color: '#000000', colorId: '310' }; bsLines.push(ln); if (rnd() < 0.25) bsDone.push(x + ',' + y + ',' + (x + 1) + ',' + y + ',310'); }
    const halfStitches = [], halfDone = [], partialStitches = [], partialDone = [];
    for (let i = 0; i < 400; i++) { const x = Math.floor(rnd() * 100), y = Math.floor(rnd() * 100), idx = y * W + x; halfStitches.push([idx, { fwd: { id: '310', rgb: [0, 0, 0] } }]); halfDone.push([idx, { fwd: 1 }]); }
    const id = await ProjectStorage.save({ id: 'proj_unb' + Date.now(), name: 'UB', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, bsLines, bsDone: Array.from(new Set(bsDone)), halfStitches, halfDone, savedZoom: 1.0, savedScroll: { left: 0, top: 0 },
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 30000, symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id); return id; }, N);
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 120000 }); await page.waitForTimeout(3500);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  const read = () => page.evaluate(() => ({ counts: (document.querySelector('.info-strip-counts') || {}).textContent, breakdown: (document.querySelector('.info-strip-breakdown') || {}).textContent }));
  console.log('start', JSON.stringify(await read()));
  await page.keyboard.press('n'); await page.waitForTimeout(150);
  const g = await T.cellPt(page, 1, 1, 0.5, 0.5); await page.mouse.click(g.x, g.y); await page.waitForTimeout(200);
  await page.keyboard.press('t'); await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('canvas[role=application]').focus());
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);                 // anchor at (1,1)
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(120); }
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(120); }
  const t0 = await metric(cdp, 'TaskDuration');
  const w0 = Date.now();
  await page.keyboard.press('Control+Shift+Enter'); await page.waitForTimeout(800);
  const t1 = await metric(cdp, 'TaskDuration');
  console.log('after unpick', JSON.stringify(await read()), 'task ms', ((t1 - t0) * 1000).toFixed(1));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
  const t2 = await metric(cdp, 'TaskDuration');
  console.log('after undo', JSON.stringify(await read()), 'task ms (undo)', ((t2 - t1) * 1000 - 500 * 0).toFixed(1));
  console.log('errors', JSON.stringify(errs));
  await close();
})();
