// Phase 6 batch 1 hunt: backstitch/quarter marks and beads survive the Tracker's saves, a reload, the Creator and a backup.
const T = require('./tk');
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async () => {
    const W = 10, H = 10, pal = [['310', [0, 0, 0]], ['666', [200, 0, 0]]];
    const pattern = Array.from({ length: W * H }, (_, i) => { const p = pal[i % 2]; return { id: p[0], type: 'solid', rgb: p[1] }; });
    const bsLines = [0, 1, 2].map(i => ({ x1: i, y1: 0, x2: i + 1, y2: 0, colorId: '310' }));
    const proj = { id: 'proj_p6b1', name: 'P6B1', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), bsLines,
      bsDone: ['0,0,1,0,310', 'ghost,key'], partialStitches: [[5, { TL: { id: '310', rgb: [0, 0, 0] }, BR: { id: '310', rgb: [0, 0, 0] } }]],
      partialDone: [[5, ['TL', 'TR']]], beads: [{ x: 3, y: 3, label: 'Seed bead', rgb: [200, 180, 40] }] };
    const id = await ProjectStorage.save(proj); ProjectStorage.setActiveProject(id); return id;
  });
  const read = () => page.evaluate(async id => { const p = await ProjectStorage.get(id); return { bsDone: p.bsDone, partialDone: p.partialDone, beads: p.beads, done: Array.from(p.done || []).reduce((a, b) => a + b, 0) }; }, id);
  console.log('seeded', JSON.stringify(await read()));
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1500);
  await T.clickCell(page, 4, 4); await page.waitForTimeout(1500);       // a stitch mark -> progress record
  console.log('after mark (progress record applied by get):', JSON.stringify(await read()));
  await page.waitForTimeout(7000);                                       // full autosave
  console.log('after autosave:', JSON.stringify(await read()));
  await page.goto(base + 'index.html?id=' + id); await page.waitForTimeout(4000);
  console.log('after Creator open:', JSON.stringify(await read()));
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1500);
  await T.clickCell(page, 5, 4); await page.waitForTimeout(8000);
  console.log('after second Tracker visit:', JSON.stringify(await read()));
  const meta = await page.evaluate(async id => { const l = await ProjectStorage.listProjects(); const m = l.find(x => x.id === id); return m && { anyProgress: m.anyProgress }; }, id);
  console.log('library meta', JSON.stringify(meta));
  console.log('errors', JSON.stringify(errs));
  await close();
})();
