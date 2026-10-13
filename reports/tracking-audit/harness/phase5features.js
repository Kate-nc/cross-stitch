// Phase 5 end-of-phase hunt: do counting aids, the spotlight, a work area, a parking marker, half stitches and knots still draw correctly
// with the new done look? After-only screenshots of the special-stitches fixture (some of it done), looked at by eye.
//   AUDIT_PORT=8000 node phase5features.js [reduced|forced]
const fs = require('fs'), path = require('path');
const T = require('./tk');
const OUT = path.join(__dirname, '..', 'screens', 'phase5', 'features'); fs.mkdirSync(OUT, { recursive: true });
const EMU = process.argv[2] || '';
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: EMU === 'reduced' ? 'reduce' : undefined, forcedColors: EMU === 'forced' ? 'active' : undefined });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message.slice(0, 160)));
  await page.addInitScript(() => { try { localStorage.setItem('cs_stitchStyle', 'block'); ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_pref_trackerDefaultView', JSON.stringify('symbol')); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  const special = JSON.parse(fs.readFileSync('/tmp/tracking-audit-work/fx/special.json', 'utf8'));
  for (let i = 0; i < special.done.length; i++) if (special.pattern[i] && special.pattern[i].id !== '__skip__' && (i % 3 === 0)) special.done[i] = 1;
  const open = async (name, zoom) => {
    const pid = await page.evaluate(async ({ special, name, zoom }) => { const p = JSON.parse(JSON.stringify(special)); p.id = 'proj_feat_' + name; p.savedZoom = zoom; p.savedScroll = { left: 0, top: 0 }; const id = await ProjectStorage.save(p); ProjectStorage.setActiveProject(id); return id; }, { special, name, zoom });
    await page.goto(base + 'stitch.html?id=' + pid); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2200);
  };
  const shot = async (name) => { const box = await page.locator('.tracker-chart-scroll').boundingBox(); await page.screenshot({ path: path.join(OUT, (EMU ? EMU + '-' : '') + name + '.png'), clip: { x: box.x, y: box.y, width: Math.min(900, box.width), height: Math.min(520, box.height) } }); };
  await open('plain', 0.95); await shot('plain');
  await open('counting', 0.95); await page.keyboard.press('c'); await page.waitForTimeout(700); await shot('counting-aids');
  await open('spotlight', 0.95); await page.keyboard.press('s'); await page.waitForTimeout(900); await shot('spotlight');
  await open('parking', 0.95); await page.keyboard.press('n'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]').focus());
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+F10'); await page.waitForTimeout(700); await shot('parking-marker');
  await open('area', 0.95); await page.keyboard.press('w'); await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, (EMU ? EMU + '-' : '') + 'area-picker.png') });
  const btn = page.locator('button', { hasText: /Work on this area/i }).first();
  if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(1200); await shot('work-area'); }
  await close();
})();
