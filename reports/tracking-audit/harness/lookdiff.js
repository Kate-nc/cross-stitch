// Phase 5 hunt: what else changed when the done look changed? Before (main, 8001) against after (branch, 8000), pixel diff.
//   AUDIT_PORT=8001 node lookdiff.js before ; AUDIT_PORT=8000 node lookdiff.js after ; node lookdiff.js diff
// Cases: highlight view (a colour focused) at 19, 8 and 3 px; the special-stitches fixture (half stitches, partials, knots,
// backstitch) at 19 px with some of it done; the dark theme in Symbol view. Writes ../screens/phase5/hunt-<side>-<case>.png.
const fs = require('fs'), path = require('path');
const T = require('./tk');
const OUT = path.join(__dirname, '..', 'screens', 'phase5'); fs.mkdirSync(OUT, { recursive: true });
const CASES = [
  { n: 'highlight-19', fx: 'look', z: 0.95, view: 'highlight', focus: '666' },
  { n: 'highlight-8', fx: 'look', z: 0.4, view: 'highlight', focus: '666' },
  { n: 'highlight-3', fx: 'look', z: 0.15, view: 'highlight', focus: '666' },
  { n: 'special-19', fx: 'special', z: 0.95, view: 'symbol' },
  { n: 'special-colour-19', fx: 'special', z: 0.95, view: 'colour' },
  { n: 'dark-symbol-19', fx: 'look', z: 0.95, view: 'symbol', theme: 'dark' },
];
const mode = process.argv[2];
(async () => {
  if (mode !== 'diff') {
    for (const c of CASES) {
      const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.addInitScript((c) => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); sessionStorage.setItem('cs_eviction_warned', '1'); localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify(c.view)); if (c.theme) { localStorage.setItem('cs_pref_theme', JSON.stringify(c.theme)); localStorage.setItem('cs_theme', c.theme); } } catch (e) {} if (c.theme) document.addEventListener('DOMContentLoaded', () => document.documentElement.setAttribute('data-theme', c.theme)); }, c);
      await page.goto('http://127.0.0.1:' + process.env.AUDIT_PORT + '/home.html'); await page.waitForFunction(() => window.ProjectStorage);
      const id = await page.evaluate(async ({ fx, z }) => {
        let proj;
        if (fx === 'look') {
          const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
          const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
          const done = new Array(W * H).fill(0); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * W + x] = 1;
          proj = { id: 'proj_hunt5', name: 'Look', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: z, savedScroll: { left: 0, top: 0 }, originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) };
        } else {
          proj = await (await fetch('/__special.json')).json().catch(() => null);
        }
        return proj; }, { fx: c.fx, z: c.z });
      let pid = id && id.id;
      if (c.fx === 'special') {
        const proj = JSON.parse(fs.readFileSync('/tmp/tracking-audit-work/fx/special.json', 'utf8'));
        for (let i = 0; i < proj.done.length; i++) if (proj.pattern[i] && proj.pattern[i].id !== '__skip__' && (i % 3 === 0)) proj.done[i] = 1;   // every third stitch done
        proj.savedZoom = c.z; proj.savedScroll = { left: 0, top: 0 };
        pid = await page.evaluate(async p => { const id = await ProjectStorage.save(p); ProjectStorage.setActiveProject(id); return id; }, proj);
      } else {
        pid = await page.evaluate(async p => { const id = await ProjectStorage.save(p); ProjectStorage.setActiveProject(id); return id; }, id);
      }
      await page.goto('http://127.0.0.1:' + process.env.AUDIT_PORT + '/stitch.html?id=' + pid); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2500);
      if (c.theme) { await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), c.theme); await page.waitForTimeout(500); }
      if (c.focus) {   // click the colour's row in the legend to focus it
        await page.evaluate(f => { const el = [...document.querySelectorAll('[aria-label^="Select DMC"], .ppal-tile, .lpanel [role=button]')].find(e => (e.textContent || '').includes(f) || (e.getAttribute('aria-label') || '').includes(f)); if (el) el.click(); }, c.focus);
        await page.waitForTimeout(800);
      }
      const box = await page.locator(T.TRACKER_CANVAS).boundingBox();
      await page.screenshot({ path: path.join(OUT, 'hunt-' + mode + '-' + c.n + '.png'), clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(900, box.width), height: Math.min(560, box.height) } });
      await close();
    }
    return;
  }
  const { ctx, close } = await T.launch({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage(); const results = [];
  for (const c of CASES) {
    const a = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'hunt-before-' + c.n + '.png')).toString('base64');
    const b = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'hunt-after-' + c.n + '.png')).toString('base64');
    const r = await page.evaluate(async ([a, b]) => {
      const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = s; });
      const [x, y] = await Promise.all([load(a), load(b)]); if (x.width !== y.width || x.height !== y.height) return { size: [x.width, x.height, y.width, y.height] };
      const cv = document.createElement('canvas'); cv.width = x.width; cv.height = x.height; const g = cv.getContext('2d');
      g.drawImage(x, 0, 0); const d1 = g.getImageData(0, 0, cv.width, cv.height).data; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(y, 0, 0); const d2 = g.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0; for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 24) n++;
      return { differing: n, of: d1.length / 4, pct: +(n / (d1.length / 4) * 100).toFixed(2) }; }, [a, b]);
    results.push({ case: c.n, ...r }); console.log(JSON.stringify({ case: c.n, ...r }));
  }
  await close(); fs.writeFileSync(path.join(OUT, 'hunt-diff.json'), JSON.stringify(results, null, 1));
})();
