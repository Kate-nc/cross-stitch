// Performance bench for the tracking work. Runs each measure N times in a fresh browser context and
// prints median / min / max; writes JSON to $BENCH_OUT (default reports/tracking-audit/perf/<label>.json).
//   node bench.js <label> [runs]
// Measures: load to drawn chart (300x300), tap latency (click to counts text change), drag of 60 moves
// (wall time and p95 frame gap while it runs), project Stats open time (500 sessions), global Stats open time.
const T = require('./tk');
const fs = require('fs'); const path = require('path');
const label = process.argv[2] || 'run'; const RUNS = Number(process.argv[3] || 5);
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sum = a => ({ median: Math.round(med(a)), min: Math.round(Math.min(...a)), max: Math.round(Math.max(...a)), runs: a.map(Math.round) });
const INIT = () => { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); };
async function fresh() { const { browser, ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage(); await page.addInitScript(INIT); return { page, close }; }
(async () => {
  const out = { label, runs: RUNS, at: new Date().toISOString(), load: [], tap: [], drag: [], dragP95: [], statsProject: [], statsGlobal: [], mark60: [] };
  for (let r = 0; r < RUNS; r++) {
    // 1. large pattern: load, tap, drag
    { const { page, close } = await fresh();
      const id = await T.seed(page, 'large.json');
      const t0 = Date.now(); await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 });
      out.load.push(Date.now() - t0); await page.waitForTimeout(1500);
      // tap latency: time from click to the counts text changing, measured in the page
      const p = await T.cellPt(page, 5, 5);
      await page.evaluate(() => { window.__tap = new Promise(res => { const el = document.querySelector('.info-strip-counts'); const before = el && el.textContent; const t0 = performance.now(); const mo = new MutationObserver(() => { if (el.textContent !== before) { mo.disconnect(); res(performance.now() - t0); } }); mo.observe(el, { childList: true, characterData: true, subtree: true }); window.__tapStart = t0; setTimeout(() => res(-1), 3000); }); });
      await page.mouse.click(p.x, p.y);
      out.tap.push(await page.evaluate(() => window.__tap)); await page.waitForTimeout(600);
      // drag of 60 moves with a frame-gap recorder
      await page.evaluate(() => { window.__gaps = []; window.__run = true; let last = performance.now(); (function f(t) { window.__gaps.push(t - last); last = t; if (window.__run) requestAnimationFrame(f); })(performance.now()); });
      const a = await T.cellPt(page, 2, 8), b = await T.cellPt(page, 24, 8);
      const t1 = Date.now(); await page.mouse.move(a.x, a.y); await page.mouse.move(a.x + 1, a.y); await page.mouse.down();
      for (let i = 1; i <= 60; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 60, a.y);
      await page.mouse.up(); out.drag.push(Date.now() - t1);
      const gaps = await page.evaluate(() => { window.__run = false; return window.__gaps.slice(); });
      gaps.sort((x, y) => x - y); out.dragP95.push(gaps[Math.floor(gaps.length * 0.95)] || 0);
      await close(); }
    // 2. 500-session project: project Stats open time, then global Stats
    { const { page, close } = await fresh();
      const id = await T.seed(page, 'history500.json');
      await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 60000 }); await page.waitForTimeout(1500);
      const t0 = Date.now(); await page.evaluate(() => window.__openTrackerStats()); await page.waitForSelector('.stats-section-title', { timeout: 30000 });
      out.statsProject.push(Date.now() - t0);
      const t1 = Date.now(); await page.goto(BASE + 'index.html?mode=stats'); await page.waitForSelector('.stats-section-title, .stats-empty', { timeout: 60000 });
      out.statsGlobal.push(Date.now() - t1);
      await close(); }
    console.log('run', r + 1, 'of', RUNS, 'done');
  }
  const res = { label, runs: RUNS, at: out.at, loadToCanvasMs: sum(out.load), tapLatencyMs: sum(out.tap), drag60Ms: sum(out.drag), dragFrameGapP95Ms: sum(out.dragP95), projectStatsOpenMs: sum(out.statsProject), globalStatsOpenMs: sum(out.statsGlobal) };
  const dir = process.env.BENCH_OUT || path.join(__dirname, '..', 'perf'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, label + '.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
