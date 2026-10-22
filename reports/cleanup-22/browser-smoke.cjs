/* Cleanup 22 — real-page smoke of the lazy-load chains that load pdf-importer.js.
 *   E2E_LOCAL_CDN=1 node reports/cleanup-22/browser-smoke.cjs
 * (needs `node serve.js 8000` running, and Chromium; set CHROMIUM=/path/to/chrome if Playwright's own is absent)
 * For create.html, index.html and stitch.html it runs window.loadPdfStack() and records the order in which
 * the PDF scripts were requested, checks window.PdfPicturePixels, then imports a real chart with the importer
 * those pages built. For Home it drops the same chart on the import tile, which goes through the import
 * engine's strategy and its own loader chain, and records the same request order.
 */
const path = require('path');
const { chromium } = require('playwright');
const { installLocalCdn } = require('../../tests/e2e/local-cdn');
const PDF = path.join(__dirname, '..', '..', 'TestUploads', 'PAT1968_2.pdf');
const NAMES = ['pdf-axis-labels.js', 'pdf-raster-chart.js', 'pdf-chart-geometry.js', 'pdf-picture-pixels.js', 'pdf-importer.js'];
const BASE = process.env.BASE || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  const out = [];
  let failed = false;
  for (const pageName of ['create.html?action=new-blank', 'index.html?mode=stats', 'stitch.html', 'home.html?tab=create']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await installLocalCdn(context);
    const page = await context.newPage();
    const errors = [], seen = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    page.on('response', r => { const n = r.url().split('/').pop().split('?')[0]; if (NAMES.includes(n)) seen.push(n + ':' + r.status()); });
    await page.addInitScript(() => {
      try {
        ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
        ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
      } catch (_) {}
    });
    let result = { page: pageName };
    if (pageName === 'stitch.html' || pageName.startsWith('index.html')) {
      // These pages send you Home with no active project, so make one the way a user does: import a chart, Start stitching.
      await page.goto(BASE + '/home.html?tab=create');
      await page.locator('input.home-import-file-input').setInputFiles(PDF);
      await page.waitForSelector('.import-review-modal', { timeout: 90000 });
      await page.getByRole('button', { name: 'Start stitching' }).click();
      await page.waitForURL(/stitch\.html/, { timeout: 30000 });
      await page.waitForTimeout(1500);
      seen.length = 0;
      if (pageName !== 'stitch.html') { await page.goto(BASE + '/' + pageName); }
      else { await page.reload(); }
    } else {
      await page.goto(BASE + '/' + pageName);
    }
    if (pageName.startsWith('home')) {
      await page.locator('input.home-import-file-input').setInputFiles(PDF);
      await page.waitForSelector('.import-review-modal', { timeout: 90000 });
      result.reviewShown = true;
      result.reviewTitle = await page.locator('.import-review-modal').first().innerText().then(t => t.slice(0, 80).replace(/\s+/g, ' '));
    } else {
      await page.waitForFunction(() => typeof window.loadPdfStack === 'function', null, { timeout: 15000 }).catch(() => {});
      result.finalUrl = page.url().replace(BASE, '');
      const bytes = require('fs').readFileSync(PDF).toString('base64');
      result = Object.assign(result, await page.evaluate(async (b64) => {
        if (typeof window.loadPdfStack !== 'function') return { loadPdfStack: 'missing' };
        await window.loadPdfStack();
        const geometry = typeof window.PdfPicturePixels;
        const Ctor = (0, eval)('PatternKeeperImporter');
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const project = await new Ctor().import(new File([bin], 'PAT1968_2.pdf', { type: 'application/pdf' }));
        return { picturePixels: geometry, size: [project.settings && project.settings.sW, project.settings && project.settings.sH], stitches: project.pattern.filter(c => c && c.id !== '__skip__' && c.id !== '__empty__').length };
      }, bytes));
    }
    result.requests = seen; result.pageErrors = errors;
    const order = seen.map(s => s.split(':')[0]);
    result.orderOk = NAMES.every(n => order.includes(n)) && NAMES.map(n => order.indexOf(n)).every((v, i, a) => i === 0 || v > a[i - 1]);
    if (result.loadPdfStack === 'missing' || !result.orderOk || errors.length || seen.some(s => !s.endsWith(':200'))) failed = true;
    out.push(result);
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
