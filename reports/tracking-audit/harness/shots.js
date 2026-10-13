// Home, Creator and Manager before / after Phase 4 (shared CSS must not have moved them).
//   AUDIT_PORT=8002 node shots.js before ; AUDIT_PORT=8000 node shots.js after ; node shots.js diff
//   (8002 = before Phase 4, 8000 = now). Writes ../screens/phase4/*.png and prints the pixel difference.
const fs = require('fs'), path = require('path');
const T = require('./tk');
const OUT = path.join(__dirname, '..', 'screens', 'phase4'); fs.mkdirSync(OUT, { recursive: true });
const VPS = [{ n: 'phone', w: 393, h: 727, touch: true }, { n: 'desktop', w: 1440, h: 900, touch: false }];
(async () => {
  const results = [];
  const mode = process.argv[2];
  for (const side of (mode === 'diff' ? [] : [[mode, process.env.AUDIT_PORT]])) {
    for (const vp of VPS) {
      const { ctx, close } = await T.launch({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
      const base = 'http://127.0.0.1:' + side[1] + '/';
      await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
      const id = await page.evaluate(async () => {
        const W = 40, H = 40;
        const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
        const done = new Array(W * H).fill(0); for (let i = 0; i < 300; i++) done[i] = 1;
        const id = await ProjectStorage.save({ id: 'proj_shots', name: 'Shots project', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done,
          originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 800, symbol: 'A' }, { id: '666', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 800, symbol: 'B' }] });
        ProjectStorage.setActiveProject(id); return id; });
      for (const pg of [['home', 'home.html'], ['creator', 'create.html?id=' + id], ['manager', 'manager.html?from=home']]) {
        await page.goto(base + pg[1]); await page.waitForTimeout(2500);
        await page.addStyleTag({ content: '*{animation:none!important;transition:none!important;caret-color:transparent!important}' });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, side[0] + '-' + pg[0] + '-' + vp.n + '.png') });
      }
      await close();
    }
  }
  // Pixel difference, in a page (no image library in the repo).
  const { ctx, close } = await T.launch({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  for (const pg of ['home', 'creator', 'manager']) for (const vp of VPS) {
    const a = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'before-' + pg + '-' + vp.n + '.png')).toString('base64');
    const b = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, 'after-' + pg + '-' + vp.n + '.png')).toString('base64');
    const r = await page.evaluate(async ([a, b]) => {
      const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = s; });
      const [x, y] = await Promise.all([load(a), load(b)]);
      if (x.width !== y.width || x.height !== y.height) return { size: [x.width, x.height, y.width, y.height] };
      const c = document.createElement('canvas'); c.width = x.width; c.height = x.height; const g = c.getContext('2d');
      g.drawImage(x, 0, 0); const d1 = g.getImageData(0, 0, c.width, c.height).data; g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const d2 = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0; for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 24) n++;
      return { differing: n, of: d1.length / 4, pct: +(n / (d1.length / 4) * 100).toFixed(3) };
    }, [a, b]);
    results.push({ page: pg, viewport: vp.n, ...r }); console.log(JSON.stringify({ page: pg, viewport: vp.n, ...r }));
  }
  await close();
  fs.writeFileSync(path.join(OUT, 'diff.json'), JSON.stringify(results, null, 1));
})();
