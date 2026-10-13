// Phase 5 / TRACK-09: how far apart do done and not-done look, at 3, 8 and 19 px cells, in colour and in greyscale?
//   AUDIT_PORT=8000 node look.js [label] [view]      view: symbol (default) | colour
// Marks about 20% of the 300x300 fixture as done in 10x10 blocks, opens it at each zoom, saves screenshots to
// ../screens/phase5/<label>-<view>-<cell>px[-grey].png and prints the mean-luminance gap between a done block and
// a not-done block of the same view (the acceptance threshold is stated in the phase report).
const fs = require('fs'), path = require('path');
const T = require('./tk');
const LABEL = process.argv[2] || 'baseline', VIEW = process.argv[3] || 'symbol';
const OUT = path.join(__dirname, '..', 'screens', 'phase5'); fs.mkdirSync(OUT, { recursive: true });
const ZOOMS = [{ cell: 3, z: 0.15 }, { cell: 8, z: 0.4 }, { cell: 19, z: 0.95 }];
const BASE = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
(async () => {
  const results = [];
  for (const zz of ZOOMS) {
    const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 200)));
    await page.addInitScript((view) => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify(view)); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} }, VIEW);
    await page.goto(BASE + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
    const id = await page.evaluate(async (zoom) => {
      const W = 300, H = 300; const pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]], ['798', [40, 80, 160]], ['typ', [230, 200, 60]], ['3790', [120, 90, 70]], ['white', [245, 245, 240]]];
      const pattern = Array.from({ length: W * H }, (_, i) => { const x = i % W, y = (i - x) / W; const p = pal[(x * 3 + y * 7 + (x >> 3)) % pal.length]; return { id: p[0], type: 'solid', rgb: p[1] }; });
      const done = new Array(W * H).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x / 10 | 0) + (y / 10 | 0)) % 5 === 0) done[y * W + x] = 1;
      const id = await ProjectStorage.save({ id: 'proj_look', name: 'Look', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, savedZoom: zoom, savedScroll: { left: 0, top: 0 },
        originalPaletteState: pal.map((p, i) => ({ id: p[0], type: 'solid', name: p[0], rgb: p[1], lab: [i * 10, 0, 0], count: 15000, symbol: String.fromCharCode(65 + i) })) });
      ProjectStorage.setActiveProject(id); return id; }, zz.z);
    await page.goto(BASE + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2500);
    const m = await page.evaluate(() => {
      const c = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]'); const t = c.__chartTile || { x: 0, y: 0, scale: 1 }; const s = t.scale > 0 ? t.scale : 1;
      const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width / 1; const G = 28;
      const g = c.getContext('2d');
      const lum = (bx, by) => { // mean luminance of the 10x10 block at cell (bx*10, by*10), inner cells only
        const x0 = G + (bx * 10 + 1) * scs, y0 = G + (by * 10 + 1) * scs, w = 8 * scs, h = 8 * scs;
        const px = Math.round((x0 - t.x) * s), py = Math.round((y0 - t.y) * s), pw = Math.max(1, Math.round(w * s)), ph = Math.max(1, Math.round(h * s));
        const d = g.getImageData(Math.max(0, px), Math.max(0, py), pw, ph).data; let sum = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
        return n ? sum / n : null; };
      // block (0,0) is done; (1,0) is not; (0,1) is not; (1,1) is not; (2,3)... is done: ((2)+(3))%5===0
      return { cell: Math.round(scs), tile: { x: t.x, y: t.y, scale: s }, done: lum(0, 0), notDone: lum(1, 0), notDone2: lum(0, 1) }; });
    const gap = m.done == null || m.notDone == null ? null : Math.abs(m.done - m.notDone);
    results.push({ cell: m.cell, view: VIEW, done: m.done && +m.done.toFixed(1), notDone: m.notDone && +m.notDone.toFixed(1), gap: gap && +gap.toFixed(1) });
    console.log(JSON.stringify(results[results.length - 1]));
    const f = path.join(OUT, LABEL + '-' + VIEW + '-' + zz.cell + 'px');
    await page.screenshot({ path: f + '.png' });
    await page.addStyleTag({ content: 'canvas{filter:grayscale(1)!important}' }); await page.waitForTimeout(200);
    await page.screenshot({ path: f + '-grey.png' });
    await close();
  }
  fs.writeFileSync(path.join(OUT, LABEL + '-' + VIEW + '.json'), JSON.stringify(results, null, 1));
})();
