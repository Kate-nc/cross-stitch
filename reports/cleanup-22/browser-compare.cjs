/* Cleanup 22 — the same real PDFs through the base page and the head page in Chromium, where pdf.js hands
 * pictures over as ImageBitmaps (Node gets raw bytes), so the canvas branch of pictureRgba is exercised.
 *
 *   BASE=http://127.0.0.1:8001 HEAD=http://127.0.0.1:8000 E2E_LOCAL_CDN=1 node reports/cleanup-22/browser-compare.cjs [pdf ...]
 *
 * For each page and PDF it runs window.loadPdfStack(), records what decodePicture returns (raw bytes or a
 * bitmap) and how long pictureRgba takes in total, imports with the importer that page built, and hashes the
 * built project. Base and head must hash the same.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { installLocalCdn } = require('../../tests/e2e/local-cdn');
const BASES = { base: process.env.BASE || 'http://127.0.0.1:8001', head: process.env.HEAD || 'http://127.0.0.1:8000' };
const UP = path.join(__dirname, '..', '..', 'TestUploads');
const pdfs = process.argv.length > 2 ? process.argv.slice(2) : ['PAT1968_2.pdf', 'lord-libidan-pokemon-gen-1-epic-pokemon-extended.pdf'].map(f => path.join(UP, f));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  let bad = 0;
  for (const pdf of pdfs) {
    const bytes = fs.readFileSync(pdf).toString('base64');
    const results = {};
    for (const side of ['base', 'head']) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await installLocalCdn(context);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message || e)));
      await page.goto(BASES[side] + '/create.html?action=new-blank');
      await page.waitForFunction(() => typeof window.loadPdfStack === 'function', null, { timeout: 20000 });
      const t0 = Date.now();
      results[side] = await page.evaluate(async (b64) => {
        await window.loadPdfStack();
        const Ctor = (0, eval)('PatternKeeperImporter');
        const stats = { decoded: 0, bitmap: 0, raw: 0, none: 0, rgbaMs: 0, rgbaCalls: 0 };
        const dp = Ctor.prototype.decodePicture, pr = Ctor.prototype.pictureRgba;
        Ctor.prototype.decodePicture = async function () { const r = await dp.apply(this, arguments); stats.decoded++; if (!r) stats.none++; else if (r.bitmap) stats.bitmap++; else if (r.data) stats.raw++; return r; };
        Ctor.prototype.pictureRgba = function () { const t = performance.now(); try { return pr.apply(this, arguments); } finally { stats.rgbaMs += performance.now() - t; stats.rgbaCalls++; } };
        const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const warnings = [], progress = [];
        const imp = new Ctor({ onProgress: (p) => progress.push(p) });
        const project = await imp.import(new File([bin], 'x.pdf', { type: 'application/pdf' }));
        const text = JSON.stringify(project, (k, v) => (v && v.constructor && /Array$/.test(v.constructor.name) && !Array.isArray(v)) ? Array.from(v) : v);
        const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text + JSON.stringify(progress)));
        return { stats, size: [project.settings && project.settings.sW, project.settings && project.settings.sH],
          stitches: project.pattern.filter(c => c && c.id !== '__skip__' && c.id !== '__empty__').length,
          hash: Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16), progressEvents: progress.length };
      }, bytes);
      results[side].ms = Date.now() - t0; results[side].pageErrors = errors;
      await context.close();
    }
    const same = results.base.hash === results.head.hash && results.base.stitches === results.head.stitches && !results.base.pageErrors.length && !results.head.pageErrors.length;
    if (!same) bad++;
    console.log(same ? 'SAME' : 'DIFF', path.basename(pdf), JSON.stringify(results));
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
