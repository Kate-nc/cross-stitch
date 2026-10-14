// Phase 6 backstitch benchmark: a 300x300 chart (20% done) with N backstitch lines.
//   AUDIT_PORT=8000 BS=5000 node p6bsbench.js <label> [sessions]
// zoom/pan: full repaints with N lines on screen (main and branch); tap/drag: marking lines (branch only).
const T = require('./tk');
const label = process.argv[2] || 'bs', SESSIONS = Number(process.argv[3] || 2), N = Number(process.env.BS || 5000), TAPS = Number(process.env.TAPS || 30);
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const metric = async (cdp, name) => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === name).value;
const task = cdp => metric(cdp, 'TaskDuration');
(async () => {
  const runs = [];
  for (let s = 0; s < SESSIONS; s++) {
    const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 160)));
    await page.addInitScript(() => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
    await page.goto(BASE + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
    const id = await page.evaluate(async (N) => {
      const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
      const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
      const done = new Array(W * H).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * W + x] = 1;
      let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const bsLines = [];
      for (let x = 1; x < 61; x++) bsLines.push({ x1: x, y1: 12, x2: x + 1, y2: 12, color: '#000000', colorId: '310' });   // a contiguous run to tap and drag
      while (bsLines.length < N) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H), hz = rnd() < 0.5, c = pal[Math.floor(rnd() * 5)]; bsLines.push(hz ? { x1: x, y1: y, x2: Math.min(W, x + 1), y2: y, color: '#' + c[1].map(v => v.toString(16).padStart(2, '0')).join(''), colorId: c[0] } : { x1: x, y1: y, x2: x, y2: Math.min(H, y + 1), color: '#' + c[1].map(v => v.toString(16).padStart(2, '0')).join(''), colorId: c[0] }); }
      const id = await ProjectStorage.save({ id: 'proj_bsb' + Date.now(), name: 'BS', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, bsLines, savedZoom: 1.0, savedScroll: { left: 0, top: 0 },
        originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) });
      ProjectStorage.setActiveProject(id); return id; }, N);
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 120000 }); await page.waitForTimeout(3000);
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    const r = {};
    await page.mouse.move(700, 400);
    let t0 = await task(cdp);
    for (let i = 0; i < 12; i++) { await page.keyboard.press(i % 2 ? '-' : '='); await page.waitForTimeout(220); }
    r.zoom = ((await task(cdp)) - t0) / 12 * 1000;
    await page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); el.scrollLeft = 0; el.scrollTop = 0; }); await page.waitForTimeout(500);
    t0 = await task(cdp);
    await page.evaluate(async () => { const el = document.querySelector('.tracker-chart-scroll'); await new Promise(res => { let n = 0; function f() { el.scrollLeft += 37; el.scrollTop += 29; if (++n < 60) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); }); });
    await page.waitForTimeout(300);
    r.pan = ((await task(cdp)) - t0) / 60 * 1000;
    await page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); el.scrollLeft = 0; el.scrollTop = 0; }); await page.waitForTimeout(600);
    if (process.env.MARK === '1') {
      // single taps on separate lines of the run (each toggles a line)
      t0 = await task(cdp);
      for (let i = 0; i < TAPS; i++) { const p = await T.cellPt(page, 2 + i, 12, 0.5, 0.0); p.y += 2; await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); }
      await page.waitForTimeout(300);
      r.tap = ((await task(cdp)) - t0) / TAPS * 1000;
      r.marked = await page.evaluate(() => (document.querySelector('.info-strip-breakdown') || {}).textContent || '');
      // drag along the whole run (unmarks then marks): one stroke
      const a = await T.cellPt(page, 2, 12, 0.5, 0.0), b = await T.cellPt(page, 34, 12, 0.5, 0.0);
      t0 = await task(cdp);
      await page.mouse.move(a.x, a.y + 2); await page.mouse.down();
      for (let i = 1; i <= 60; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 60, a.y + 2);
      await page.mouse.up(); await page.waitForTimeout(500);
      r.drag = ((await task(cdp)) - t0) * 1000;
      r.afterDrag = await page.evaluate(() => (document.querySelector('.info-strip-breakdown') || {}).textContent || '');
    }
    runs.push(r); console.log(JSON.stringify(r));
    await close();
  }
  const out = { label, lines: N, sessions: runs.length };
  for (const k of ['zoom', 'pan', 'tap', 'drag']) { const v = med(runs.map(r => r[k]).filter(x => x != null)); if (v != null) out[k] = +v.toFixed(2); }
  console.log('RESULT ' + JSON.stringify(out));
})();
