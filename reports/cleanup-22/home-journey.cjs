/* Cleanup 22 — the full Home import journey for a MacStitch chart whose symbols are pictures (so pictureRgba runs),
 * on the base page and the head page: drop the PDF on the import tile, wait for the review, compare its text.
 *   BASE=... HEAD=... E2E_LOCAL_CDN=1 node reports/cleanup-22/home-journey.cjs
 */
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { installLocalCdn } = require('../../tests/e2e/local-cdn');
const PDF = path.join(__dirname, '..', '..', 'TestUploads', 'lord-libidan-pokemon-gen-1-epic-pokemon-extended.pdf');
const SIDES = { base: process.env.BASE || 'http://127.0.0.1:8001', head: process.env.HEAD || 'http://127.0.0.1:8000' };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  const out = {};
  for (const side of ['base', 'head']) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await installLocalCdn(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message || e)));
    await page.addInitScript(() => { try { ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1')); } catch (_) {} });
    await page.goto(SIDES[side] + '/home.html?tab=create');
    const t0 = Date.now();
    await page.locator('input.home-import-file-input').setInputFiles(PDF);
    await page.waitForSelector('.import-review-modal', { timeout: 240000 });
    const text = await page.locator('.import-review-modal').first().innerText();
    out[side] = { ms: Date.now() - t0, sha: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16), head: text.slice(0, 160).replace(/\s+/g, ' '), pageErrors: errors };
    await context.close();
  }
  await browser.close();
  const same = out.base.sha === out.head.sha && !out.base.pageErrors.length && !out.head.pageErrors.length;
  console.log(same ? 'SAME' : 'DIFF', JSON.stringify(out, null, 1));
  process.exit(same ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
