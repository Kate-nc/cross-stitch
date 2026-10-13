// Phase 5 end-of-phase hunt: the pattern overview at 300x300, 500x500 and 800x800: time to build, long tasks while it builds, JS heap and
// canvas size with the overview on against off, and what is left after switching to another project.
//   AUDIT_PORT=8000 node mapstress.js
const T = require('./tk');
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const heap = async (cdp) => { await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage'); return +((await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'JSHeapUsedSize').value / 1048576).toFixed(1); };
(async () => {
  const rows = [];
  for (const N of [300, 500, 800]) for (const on of [false, true]) {
    const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    await page.addInitScript((on) => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', JSON.stringify(on)); sessionStorage.setItem('cs_eviction_warned', '1'); window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {} } catch (e) {} }, on);
    await page.goto(BASE + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
    const id = await page.evaluate(async (N) => {
      const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
      const pattern = Array.from({ length: N * N }, (_, i) => { const x = i % N, y = (i - x) / N; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
      const done = new Array(N * N).fill(0); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * N + x] = 1;
      const id = await ProjectStorage.save({ id: 'proj_stress' + N, name: 'Stress', settings: { sW: N, sH: N, fabricCt: 14 }, pattern, done, savedZoom: 0.3, savedScroll: { left: 0, top: 0 }, originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) });
      ProjectStorage.setActiveProject(id); return id; }, N);
    const t0 = Date.now();
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 120000 });
    let built = null;
    if (on) { for (let i = 0; i < 400 && built == null; i++) { built = await page.evaluate(() => { const c = document.querySelector('[data-testid="tracker-minimap"] canvas'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(1, 1, 1, 1).data; return (d[3] > 0) ? c.width + 'x' + c.height : null; }); if (built == null) await page.waitForTimeout(50); } }
    const tBuilt = Date.now() - t0; await page.waitForTimeout(2500);
    const lt = await page.evaluate(() => window.__lt.slice());
    const h = await heap(cdp);
    const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height + (c.closest('[data-testid=tracker-minimap]') ? ' (map)' : '')));
    rows.push({ N, overview: on, loadToBuiltMs: on ? tBuilt : null, map: built, longTasks: lt.join(',') || 'none', heapMB: h, canvases: canvases.join(' ') });
    console.log(JSON.stringify(rows[rows.length - 1]));
    await close();
  }
})();
