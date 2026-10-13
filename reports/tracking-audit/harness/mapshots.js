// Phase 5 batch 2: screenshots of the pattern overview (light, dark, phone Focus closed/open).
//   AUDIT_PORT=8000 node mapshots.js
const fs = require('fs'), path = require('path');
const T = require('./tk');
const OUT = path.join(__dirname, '..', 'screens', 'phase5'); fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
async function run(name, opts, steps) {
  const { ctx, close } = await T.launch(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 200)));
  await page.addInitScript((theme) => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify('colour')); sessionStorage.setItem('cs_eviction_warned', '1'); if (theme) localStorage.setItem('cs_theme', theme); } catch (e) {} }, opts.theme || '');
  await page.goto(BASE + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 300, H = 300; const pal = [['310', [20, 20, 30]], ['666', [200, 30, 40]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]], ['grn', [60, 150, 80]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const d = Math.hypot(x - 150, y - 150); const k = d < 40 ? 1 : d < 90 ? 3 : (x + y) % 90 < 45 ? 2 : 6; const p = pal[k]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const done = new Array(W * H).fill(0); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y < 120 || (x < 100 && y < 200)) done[y * W + x] = 1;
    const id = await ProjectStorage.save({ id: 'proj_map', name: 'Map', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: 0.5, savedScroll: { left: 700, top: 500 },
      originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 12000, symbol: String.fromCharCode(65 + i) })) });
    ProjectStorage.setActiveProject(id); return id; });
  await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2500);
  if (steps) await steps(page);
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  await close();
}
(async () => {
  await run('map-light', { viewport: { width: 1440, height: 900 } });
  await run('map-dark', { viewport: { width: 1440, height: 900 }, theme: 'dark' }, async p => { await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await p.waitForTimeout(500); });
  await run('map-phone', { viewport: { width: 393, height: 727 }, hasTouch: true, isMobile: true });
})();
