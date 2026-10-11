// Tap latency, measured many times per session so a millisecond is visible above the noise.
//   AUDIT_PORT=8000 node tapbench.js <label> [sessions] [taps]
// Each tap: click on a fresh cell, time until the progress strip's text changes (React render and commit included).
const T = require('./tk');
const label = process.argv[2] || 'tap', SESSIONS = Number(process.argv[3] || 4), TAPS = Number(process.argv[4] || 30);
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const INIT = () => { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); };
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
(async () => {
  const all = [];
  for (let s = 0; s < SESSIONS; s++) {
    const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage(); await page.addInitScript(INIT);
    const id = await T.seed(page, 'large.json');
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1500);
    for (let i = 0; i < TAPS; i++) {
      const p = await T.cellPt(page, 3 + (i % 20), 3 + Math.floor(i / 20) * 2);
      await page.evaluate(() => { window.__t = new Promise(res => { const el = document.querySelector('.info-strip-counts'); const before = el.textContent; const t0 = performance.now(); const mo = new MutationObserver(() => { if (el.textContent !== before) { mo.disconnect(); res(performance.now() - t0); } }); mo.observe(el, { childList: true, characterData: true, subtree: true }); setTimeout(() => res(-1), 3000); }); });
      await page.mouse.click(p.x, p.y);
      const ms = await page.evaluate(() => window.__t); if (ms > 0) all.push(ms);
      await page.waitForTimeout(120);
    }
    await close();
  }
  console.log(JSON.stringify({ label, n: all.length, median: +q(all, 0.5).toFixed(2), p90: +q(all, 0.9).toFixed(2), mean: +(all.reduce((a, b) => a + b, 0) / all.length).toFixed(2) }));
})().catch(e => { console.error(e); process.exit(1); });
