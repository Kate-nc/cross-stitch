// Phase 5 draw-path benchmark on the 300x300 fixture with about 20% done (10x10 blocks).
//   AUDIT_PORT=8000 [THROTTLE=4] node drawbench.js <label> [sessions]
// Per session (a fresh browser), using Chrome's own task time (CDP Performance.getMetrics, TaskDuration) so that
// paint work is counted wherever it runs:
//   zoom     12 zoom steps (+ and - alternately), each a full repaint of the tile:    ms of task time per step
//   pan      60 scroll steps of 37 px across the chart:                               ms per step, p95 frame gap
//   drag60   one mouse drag across 60 cells (mark, with commit):                      ms of task time for the whole stroke
//   tap      30 single marks:                                                         ms of task time per mark
//   heap     JS heap after a GC, before and after the scenarios:                      MB
const T = require('./tk');
const label = process.argv[2] || 'draw', SESSIONS = Number(process.argv[3] || 3), THROTTLE = Number(process.env.THROTTLE || 1);
const TAPS = Number(process.env.TAPS || 30), TAP_ONLY = process.env.TAP_ONLY === '1';   // TAP_ONLY: skip zoom, pan and drag; many marks
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
    await page.addInitScript(() => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
    await page.goto(BASE + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
    const id = await page.evaluate(async () => {
      const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
      const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
      const done = new Array(W * H).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * W + x] = 1;
      const id = await ProjectStorage.save({ id: 'proj_draw', name: 'Draw', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: 0.5, savedScroll: { left: 0, top: 0 },
        originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) });
      ProjectStorage.setActiveProject(id); return id; });
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2500);
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    const heap = async () => { await cdp.send('HeapProfiler.enable').catch(() => {}); await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); return (await metric(cdp, 'JSHeapUsedSize')) / 1048576; };
    const heap0 = await heap();
    const r = { heap0 };
    if (!TAP_ONLY) {
    // zoom: full repaints
    await page.mouse.move(700, 400);
    let t0 = await task(cdp);
    for (let i = 0; i < 12; i++) { await page.keyboard.press(i % 2 ? '-' : '='); await page.waitForTimeout(220); }
    r.zoom = ((await task(cdp)) - t0) / 12 * 1000; r.zoomSteps = 12;
    await page.waitForTimeout(400);
    // pan
    const pan = await page.evaluate(async () => {
      const el = document.querySelector('.tracker-chart-scroll'); const gaps = []; let last = performance.now();
      await new Promise(res => { let n = 0; function f(t) { gaps.push(t - last); last = t; el.scrollLeft += 37; el.scrollTop += 29; if (++n < 60) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
      gaps.sort((a, b) => a - b); return { p95: gaps[Math.floor(gaps.length * 0.95)], med: gaps[Math.floor(gaps.length / 2)] }; });
    r.panP95 = pan.p95; r.panMed = pan.med;
    t0 = await task(cdp);
    await page.evaluate(async () => { const el = document.querySelector('.tracker-chart-scroll'); el.scrollLeft = 0; el.scrollTop = 0; });
    await page.waitForTimeout(500);
    t0 = await task(cdp);
    await page.evaluate(async () => { const el = document.querySelector('.tracker-chart-scroll'); await new Promise(res => { let n = 0; function f() { el.scrollLeft += 37; el.scrollTop += 29; if (++n < 60) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); }); });
    await page.waitForTimeout(300);
    r.pan = ((await task(cdp)) - t0) / 60 * 1000;
    await page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); el.scrollLeft = 0; el.scrollTop = 0; }); await page.waitForTimeout(500);
    // drag 60 cells
    const a = await T.cellPt(page, 1, 12), b = await T.cellPt(page, 60, 12);
    t0 = await task(cdp);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    for (let i = 1; i <= 60; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 60, a.y);
    await page.mouse.up(); await page.waitForTimeout(500);
    r.drag60 = ((await task(cdp)) - t0) * 1000;
    }
    // taps
    t0 = await task(cdp);
    for (let i = 0; i < TAPS; i++) { const p = await T.cellPt(page, 3 + (i % 25), 20 + Math.floor(i / 25) * 2); await page.mouse.click(p.x, p.y); await page.waitForTimeout(90); }
    await page.waitForTimeout(300);
    r.tap = ((await task(cdp)) - t0) / TAPS * 1000;
    r.heap1 = await heap();
    runs.push(r); console.log(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k, v]) => typeof v === 'number').map(([k, v]) => [k, +v.toFixed(2)]))));
    await close();
  }
  const out = { label, throttle: THROTTLE, sessions: runs.length };
  for (const k of ['zoom', 'pan', 'panP95', 'drag60', 'tap', 'heap0', 'heap1']) { const v = med(runs.map(r => r[k]).filter(x => x != null)); if (v != null) out[k] = +v.toFixed(2); }
  console.log('RESULT ' + JSON.stringify(out));
})();
