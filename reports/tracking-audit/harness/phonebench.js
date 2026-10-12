// Phone-emulated tap latency and load-to-chart time on the 300x300 fixture, CPU throttled 4x (CDP).
//   AUDIT_PORT=8000 node phonebench.js <label> [sessions] [taps]
// Each tap is a touch tap on a fresh cell; the time is until the progress strip's text changes (it may be hidden by
// Focus: it is still updated).
const T = require('./tk');
const label = process.argv[2] || 'phone', SESSIONS = Number(process.argv[3] || 3), TAPS = Number(process.argv[4] || 20);
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const INIT = () => { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); sessionStorage.setItem('cs_eviction_warned', '1'); };
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
(async () => {
  const taps = [], loads = [], strokes = [];
  for (let s = 0; s < SESSIONS; s++) {
    const { ctx, close } = await T.launch({ viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage(); await page.addInitScript(INIT);
    const id = await T.seed(page, 'large.json');
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 120000 });
    loads.push(Date.now() - t0); await page.waitForTimeout(2500);
    for (let i = 0; i < TAPS; i++) {
      const p = await T.cellPt(page, 3 + (i % 10), 3 + Math.floor(i / 10) * 2);
      await page.evaluate(() => { window.__t = new Promise(res => { const el = document.querySelector('.info-strip-counts'); if (!el) return res(-1); const before = el.textContent; const t0 = performance.now(); const mo = new MutationObserver(() => { if (el.textContent !== before) { mo.disconnect(); res(performance.now() - t0); } }); mo.observe(el, { childList: true, characterData: true, subtree: true }); setTimeout(() => { mo.disconnect(); res(-1); }, 3000); }); });
      await page.touchscreen.tap(p.x, p.y);
      const ms = await page.evaluate(() => window.__t); if (ms > 0) taps.push(ms);
      await page.waitForTimeout(150);
    }
    // Strokes: rest on a cell, drag across 8 cells with a real touch (CDP), and time from the lift to the strip changing.
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: (pts || []).map((q, i) => ({ x: Math.round(q.x), y: Math.round(q.y), id: i + 1, radiusX: 4, radiusY: 4, force: 1 })) });
    for (let k = 0; k < (Number(process.env.STROKES || 4)); k++) {
      const a = await T.cellPt(page, 3, 12 + k * 2);
      const cs = await page.evaluate(() => document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width);
      await touch('touchStart', [a]); await page.waitForTimeout(220);
      for (let i = 1; i <= 16; i++) { await touch('touchMove', [{ x: a.x + i * cs / 2, y: a.y }]); await page.waitForTimeout(10); }
      await page.evaluate(() => { window.__t = new Promise(res => { const el = document.querySelector('.info-strip-counts'); if (!el) return res(-1); const before = el.textContent; const t0 = performance.now(); const mo = new MutationObserver(() => { if (el.textContent !== before) { mo.disconnect(); res(performance.now() - t0); } }); mo.observe(el, { childList: true, characterData: true, subtree: true }); setTimeout(() => { mo.disconnect(); res(-1); }, 3000); }); });
      await touch('touchEnd', []);
      const ms = await page.evaluate(() => window.__t); if (ms > 0) strokes.push(ms);
      await page.waitForTimeout(400);
    }
    await close();
  }
  console.log(JSON.stringify({ label, strokes: strokes.length, strokeMedian: strokes.length ? +q(strokes, 0.5).toFixed(1) : null, taps: taps.length, tapMedian: +q(taps, 0.5).toFixed(1), tapP90: +q(taps, 0.9).toFixed(1), loadMedianMs: q(loads, 0.5), loads }));
})().catch(e => { console.error(e); process.exit(1); });
