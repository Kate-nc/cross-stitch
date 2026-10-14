// Phase 6 batch 5: notes and photos in the Tracker's Session tab.
const T = require('./tk');
const fs = require('fs');
(async () => {
  const { ctx, close } = await T.launch({ viewport: { width: 1300, height: 900 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); localStorage.setItem('cs_sessionOnboardingDone', '1'); ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true')); localStorage.setItem('cs_pref_trackerMinimap', 'false'); localStorage.setItem('cs_stitchStyle', 'block'); sessionStorage.setItem('cs_eviction_warned', '1'); } catch (e) {} });
  const base = 'http://127.0.0.1:' + (process.env.AUDIT_PORT || '8000') + '/';
  await page.goto(base + 'home.html'); await page.waitForFunction(() => window.ProjectStorage);
  // A big picture, made in the page and written out for the file chooser.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const x = c.getContext('2d');
    for (let i = 0; i < 4000; i += 20) for (let j = 0; j < 3000; j += 20) { x.fillStyle = 'rgb(' + ((i * 7 + j * 3) % 256) + ',' + ((i + j * 5) % 256) + ',' + ((i * 3 + j) % 256) + ')'; x.fillRect(i, j, 20, 20); }
    const b = await new Promise(r => c.toBlob(r, 'image/png')); const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s);
  });
  fs.writeFileSync('/tmp/p6b5.png', Buffer.from(png, 'base64')); console.log('source picture bytes', fs.statSync('/tmp/p6b5.png').size);
  const id = await page.evaluate(async () => {
    const W = 20, H = 20, pattern = Array.from({ length: W * H }, (_, i) => (i % 3 ? { id: '310', type: 'solid', rgb: [0, 0, 0] } : { id: '__skip__' }));
    const id = await ProjectStorage.save({ id: 'proj_p6b5' + Date.now(), name: 'P6B5', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done: new Array(W * H).fill(0), savedZoom: 1.2, savedScroll: { left: 0, top: 0 } });
    ProjectStorage.setActiveProject(id); return id;
  });
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2500);
  // Photos must not be touched on the chart path: count BlobStore reads from here on.
  await page.evaluate(() => { window.__bsCalls = []; ['keys', 'get', 'list'].forEach(k => { const o = BlobStore[k]; BlobStore[k] = function (a) { window.__bsCalls.push(k + ':' + a); return o.apply(this, arguments); }; }); });
  await page.evaluate(() => document.querySelector('.ppal-mode-btn[aria-controls="ppal-more-panel"]').click()); await page.waitForTimeout(300);
  console.log('BlobStore reads with the panel open on another tab', JSON.stringify(await page.evaluate(() => window.__bsCalls.filter(c => /photo/.test(c)))));
  await page.evaluate(() => [...document.querySelectorAll('.ppal-more-tab')].find(b => b.textContent === 'Session').click()); await page.waitForTimeout(500);
  console.log('after opening the Session tab', JSON.stringify(await page.evaluate(() => window.__bsCalls.filter(c => /photo/.test(c)))));
  await page.fill('#tracker-notes-text', 'Stopped at row 12. Changed to the pale green skein.'); await page.waitForTimeout(800);
  await page.setInputFiles('input[aria-label="Choose photos to add"]', '/tmp/p6b5.png'); await page.waitForTimeout(3500);
  const info = async () => page.evaluate(async id => {
    const db = await new Promise(r => { const q = indexedDB.open('CrossStitchDB'); q.onsuccess = () => r(q.result); });
    const all = await new Promise(r => { const q = db.transaction('pendingImports').objectStore('pendingImports').getAll(); q.onsuccess = () => r(q.result); });
    return all.filter(x => x.id.indexOf('photo') === 0).map(x => ({ id: x.id.slice(0, 22), bytes: x.blob && x.blob.size, w: x.w, h: x.h, type: x.type }));
  }, id);
  console.log('stored', JSON.stringify(await info()));
  console.log('thumbnails shown', await page.evaluate(() => document.querySelectorAll('.tracker-photo-thumb img').length));
  await page.screenshot({ path: '/tmp/p6b5.png.shot.png' });
  await page.click('.tracker-photo-thumb'); await page.waitForTimeout(600);
  console.log('viewer open', await page.evaluate(() => !!document.querySelector('.tracker-photo-viewer img')));
  await page.screenshot({ path: '/tmp/p6b5-viewer.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('viewer closed by Esc', await page.evaluate(() => !document.querySelector('.tracker-photo-viewer')));
  await page.waitForTimeout(7000);
  console.log('notes saved', JSON.stringify(await page.evaluate(async id => (await ProjectStorage.get(id)).notes, id)));
  // Reload: notes and photos are still there.
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(2000);
  await page.evaluate(() => document.querySelector('.ppal-mode-btn[aria-controls="ppal-more-panel"]').click()); await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('.ppal-more-tab')].find(b => b.textContent === 'Session').click()); await page.waitForTimeout(800);
  console.log('after reload: notes', JSON.stringify(await page.inputValue('#tracker-notes-text')), 'thumbnails', await page.evaluate(() => document.querySelectorAll('.tracker-photo-thumb img').length));
  // A backup carries the photo; deleting the photo removes it; deleting the project removes the rest.
  await page.goto(base + 'home.html'); await page.waitForFunction(() => typeof window.loadBackupRestore === 'function'); await page.waitForTimeout(500);
  const backup = await page.evaluate(async () => { const BR = await window.loadBackupRestore(); const b = await BR.createBackup(); return (b.photos || []).map(p => p.id.slice(0, 10) + ' ' + p.data.length); });
  console.log('backup photos', JSON.stringify(backup));
  await page.goto(base + 'stitch.html?id=' + id); await page.waitForSelector(T.TRACKER_CANVAS, { timeout: 90000 }); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('.ppal-mode-btn[aria-controls="ppal-more-panel"]').click()); await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('.ppal-more-tab')].find(b => b.textContent === 'Session').click()); await page.waitForTimeout(800);
  await page.click('.tracker-photo-thumb'); await page.waitForTimeout(500);
  await page.click('button:has-text("Delete")'); await page.waitForTimeout(200); await page.click('button:has-text("Delete this photo")'); await page.waitForTimeout(700);
  console.log('after delete: thumbnails', await page.evaluate(() => document.querySelectorAll('.tracker-photo-thumb').length), 'stored', JSON.stringify(await info()));
  await page.setInputFiles('input[aria-label="Choose photos to add"]', '/tmp/p6b5.png'); await page.waitForTimeout(3500);
  console.log('re-added', JSON.stringify((await info()).length));
  await page.evaluate(async id => { await ProjectStorage.delete(id); }, id); await page.waitForTimeout(500);
  console.log('after deleting the project, photo records', JSON.stringify((await info()).length));
  console.log('errors', JSON.stringify(errs));
  await close();
})();
