// Phase 5 end-of-phase hunt: the chart before Phase 5 (8001, 93abc37) against now (8000), pixel for pixel, over views, zoom tiers and
// themes. Highlight view must not change at all; Symbol and Colour change only where a stitch is done (and the not-done look is paler).
//   AUDIT_PORT=8001 node phase5hunt.js before ; AUDIT_PORT=8000 node phase5hunt.js after ; node phase5hunt.js diff
const fs = require('fs'), path = require('path');
const T = require('./tk');
const OUT = path.join(__dirname, '..', 'screens', 'phase5', 'hunt2'); fs.mkdirSync(OUT, { recursive: true });
const ZOOMS = { 3: 0.15, 8: 0.4, 19: 0.95, 32: 1.6 };
const CASES = [];
for (const theme of ['light', 'dark']) for (const view of ['symbol', 'colour', 'highlight']) for (const cell of [3, 8, 19, 32]) CASES.push({ n: 'look-' + view + '-' + cell + '-' + theme, fx: 'look', view, cell, theme });
for (const theme of ['light', 'dark']) for (const view of ['symbol', 'colour', 'highlight']) for (const cell of [19, 32]) CASES.push({ n: 'special-' + view + '-' + cell + '-' + theme, fx: 'special', view, cell, theme });
const mode = process.argv[2];
function look(z, view) {
  const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
  return { pal, W, H };
}
(async () => {
  if (mode !== 'diff') {
    const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 160)));
    await page.addInitScript(() => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
    const base = 'http://127.0.0.1:' + process.env.AUDIT_PORT + '/';
    await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
    const special = JSON.parse(fs.readFileSync('/tmp/tracking-audit-work/fx/special.json', 'utf8'));
    for (let i = 0; i < special.done.length; i++) if (special.pattern[i] && special.pattern[i].id !== '__skip__' && (i % 3 === 0)) special.done[i] = 1;
    for (const c of CASES) {
      const z = ZOOMS[c.cell];
      const pid = await page.evaluate(async ({ fx, z, view, special, uid }) => {
        try { localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify(view)); } catch (e) {}
        let proj;
        if (fx === 'look') {
          const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
          const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
          const done = new Array(W * H).fill(0); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * W + x] = 1;
          proj = { id: 'proj_hunt5b_' + uid, name: 'Look', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: z, savedScroll: { left: 0, top: 0 }, originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) };
        } else { proj = special; proj.id = 'proj_hunt5s_' + uid; proj.savedZoom = z; proj.savedScroll = { left: 0, top: 0 }; }
        const id = await ProjectStorage.save(proj); ProjectStorage.setActiveProject(id); return id; }, { fx: c.fx, z, view: c.view, special, uid: c.n });   // one project per case: the page being left saves itself on the way out and would overwrite a shared one
      await page.goto(base + 'stitch.html?id=' + pid); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2200);
      await page.evaluate(t => { if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark'); else document.documentElement.removeAttribute('data-theme'); }, c.theme); await page.waitForTimeout(500);
      if (c.view === 'highlight') { await page.evaluate(() => { const el = [...document.querySelectorAll('.ppal-tile')].find(e => (e.getAttribute('aria-label') || '').includes('666')) || document.querySelector('.ppal-tile'); if (el) el.click(); }); await page.waitForTimeout(800); }
      const box = await page.locator(T.TRACKER_CANVAS).boundingBox();
      await page.screenshot({ path: path.join(OUT, mode + '-' + c.n + '.png'), clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(800, box.width), height: Math.min(500, box.height) } });
    }
    await close(); return;
  }
  const { ctx, close } = await T.launch({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage(); const results = [];
  for (const c of CASES) {
    const fa = path.join(OUT, 'before-' + c.n + '.png'), fb = path.join(OUT, 'after-' + c.n + '.png');
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) { results.push({ case: c.n, missing: true }); continue; }
    const a = 'data:image/png;base64,' + fs.readFileSync(fa).toString('base64'), b = 'data:image/png;base64,' + fs.readFileSync(fb).toString('base64');
    const r = await page.evaluate(async ([a, b]) => {
      const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = s; });
      const [x, y] = await Promise.all([load(a), load(b)]); if (x.width !== y.width || x.height !== y.height) return { size: [x.width, x.height, y.width, y.height] };
      const cv = document.createElement('canvas'); cv.width = x.width; cv.height = x.height; const g = cv.getContext('2d');
      g.drawImage(x, 0, 0); const d1 = g.getImageData(0, 0, cv.width, cv.height).data; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(y, 0, 0); const d2 = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0; for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 24) n++;
      return { pct: +(n / (d1.length / 4) * 100).toFixed(2) }; }, [a, b]);
    results.push({ case: c.n, ...r });
  }
  await close(); fs.writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(results, null, 1));
  for (const r of results) console.log(r.case.padEnd(34), r.missing ? 'MISSING' : r.size ? 'SIZE ' + r.size : r.pct + '%');
})();
