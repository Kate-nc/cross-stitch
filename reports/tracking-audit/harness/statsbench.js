// Project Stats open time on the 500-session project, many opens per run so a few milliseconds show.
//   AUDIT_PORT=8000 node statsbench.js <label> [opens]
const T = require('./tk');
const label = process.argv[2] || 'stats', OPENS = Number(process.argv[3] || 8);
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const INIT = () => { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); };
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); await page.addInitScript(INIT);
  const id = await T.seed(page, 'history500.json');
  await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 60000 }); await page.waitForTimeout(1500);
  const t = [];
  for (let i = 0; i < OPENS; i++) {
    const ms = await page.evaluate(async () => {
      const t0 = performance.now(); window.__openTrackerStats();
      await new Promise(r => { const iv = setInterval(() => { if (document.querySelector('.session-timeline')) { clearInterval(iv); r(); } }, 1); });
      const dt = performance.now() - t0;
      const c = document.querySelector('.stats-close, [aria-label="Close"]'); if (c) c.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await new Promise(r => setTimeout(r, 250));
      return dt;
    });
    t.push(ms);
  }
  t.sort((a, b) => a - b);
  console.log(JSON.stringify({ label, n: t.length, median: +t[Math.floor(t.length / 2)].toFixed(1), min: +t[0].toFixed(1), max: +t[t.length - 1].toFixed(1) }));
  await close();
})();
