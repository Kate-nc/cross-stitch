// DOM changes per second while a session clock is running and nothing else happens.
//   AUDIT_PORT=8000 node idlebench.js <label> [seconds]
const T = require('./tk');
const label = process.argv[2] || 'idle', SECS = Number(process.argv[3] || 6);
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
const INIT = () => { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); };
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage(); await page.addInitScript(INIT);
  const id = await T.seed(page, 'large.json');
  await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1500);
  const p = await T.cellPt(page, 5, 5); await page.mouse.click(p.x, p.y);          // starts a session (and its clock)
  await page.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
  const metric = async (n) => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === n).value;
  const s0 = await metric('ScriptDuration'), t0 = await metric('TaskDuration');
  const r = await page.evaluate(async (secs) => {
    let records = 0, nodes = 0;
    const mo = new MutationObserver(list => { records += list.length; list.forEach(m => { nodes += m.addedNodes.length + m.removedNodes.length; }); });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    await new Promise(r => setTimeout(r, secs * 1000)); mo.disconnect();
    return { recordsPerSec: +(records / secs).toFixed(1), nodesPerSec: +(nodes / secs).toFixed(1) };
  }, SECS);
  r.scriptMsPerSec = +(((await metric('ScriptDuration')) - s0) * 1000 / SECS).toFixed(2);
  r.taskMsPerSec = +(((await metric('TaskDuration')) - t0) * 1000 / SECS).toFixed(2);
  console.log(JSON.stringify(Object.assign({ label }, r)));
  await close();
})();
