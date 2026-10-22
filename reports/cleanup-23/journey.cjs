/* Cleanup 23 — the whole import journey in Chromium for real charts, on the base page and the head page:
 * drop the PDF on Home's import tile, read the review (summary, Palette tab, notes), then one of
 *   confirm-stitch  Start stitching  -> Tracker, project saved
 *   confirm-edit    Edit first       -> Creator, project saved
 *   review-cancel   Cancel in the review -> nothing saved
 *   progress-cancel Cancel on the progress card while the file is being read -> no review, nothing saved
 * and for saved projects reload the destination page (reopen) and read the project back from IndexedDB.
 * A bad file (not a PDF) is dropped as the failure case.
 *
 *   BASE=http://127.0.0.1:8001 HEAD=http://127.0.0.1:8000 E2E_LOCAL_CDN=1 [CHROMIUM=...] node reports/cleanup-23/journey.cjs [pdf ...]
 *
 * Compared per scenario between base and head: SHA-256 of the review text, of the Palette tab text, of the stored
 * project (minus ids, timestamps, the last-write stamp and the per-tab clock names) before and after reopening, the destination URL kind, page errors.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { installLocalCdn } = require('../../tests/e2e/local-cdn');
const UP = path.join(__dirname, '..', '..', 'TestUploads');
const SIDES = { base: process.env.BASE || 'http://127.0.0.1:8001', head: process.env.HEAD || 'http://127.0.0.1:8000' };
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);
const pdfs = (process.argv.length > 2 ? process.argv.slice(2) : ['PAT2171_2.pdf', 'PAT1968_2.pdf', 'gen1.pdf', 'Books and Blossoms.pdf', 'lord-libidan-pokemon-gen-1-epic-pokemon-extended.pdf', 'gen-3-extended-pattern-colour.pdf'].map(f => path.join(UP, f)));

async function storedProjects(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('CrossStitchDB');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const r = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      r.onsuccess = () => {
        db.close();
        const strip = (k, v) => (['id', 'createdAt', 'updatedAt', 'lastModified', 'savedAt', 'importedAt', 'lastWriteAt', 'lastWriteTabId'].includes(k) ? undefined : v);
        resolve(r.result.map(p => JSON.stringify(p, (k, v) => (v && v.constructor && /Array$/.test(v.constructor.name) && !Array.isArray(v)) ? Array.from(v) : strip(k, v)).replace(/tab-[0-9a-f-]{36}/g, 'tab-N')));
      };
      r.onerror = () => reject(r.error);
    };
  }));
}

async function scenario(browser, side, file, mode) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await installLocalCdn(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  await page.addInitScript(() => { try {
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  const out = { mode };
  const t0 = Date.now();
  await page.goto(SIDES[side] + '/home.html?tab=create');
  const input = page.locator('input.home-import-file-input');
  if (mode === 'bad-file') {
    await input.setInputFiles({ name: 'not-really.pdf', mimeType: 'application/pdf', buffer: Buffer.from('this is not a pdf at all') });
    await page.waitForTimeout(6000);
    out.review = await page.locator('.import-review-modal').count();
    out.toast = await page.locator('.toast, [role=alert], .import-error, .import-friendly-error').allInnerTexts().then(t => sha(t.join('|')) + ':' + t.join('|').slice(0, 140).replace(/\s+/g, ' '));
    out.stored = (await storedProjects(page)).length;
  } else if (mode === 'progress-cancel') {
    await input.setInputFiles(file);
    await page.waitForSelector('.import-busy-cancel', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.locator('.import-busy-cancel').click();
    await page.waitForSelector('.import-busy', { state: 'detached', timeout: 120000 });
    await page.waitForTimeout(2500);
    out.review = await page.locator('.import-review-modal').count();
    out.stored = (await storedProjects(page)).length;
    out.url = page.url().replace(SIDES[side], '');
  } else {
    await input.setInputFiles(file);
    await page.waitForSelector('.import-review-modal', { timeout: 300000 });
    out.importMs = Date.now() - t0;
    const modal = page.locator('.import-review-modal').first();
    const text = await modal.innerText();
    out.review = sha(text); out.reviewHead = text.slice(0, 140).replace(/\s+/g, ' ');
    await modal.getByRole('tab', { name: /Palette/ }).first().click().catch(() => modal.getByText('Palette', { exact: true }).first().click());
    await page.waitForTimeout(400);
    const pal = await modal.innerText();
    out.palette = sha(pal);
    out.notes = await page.locator('.import-warnings, .import-review-warnings').allInnerTexts().then(t => sha(t.join('|')));
    if (mode === 'review-cancel') {
      await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForTimeout(1500);
      out.stored = (await storedProjects(page)).length;
      out.url = page.url().replace(SIDES[side], '').split('?')[0];
    } else {
      await modal.locator(mode === 'confirm-edit' ? '.import-review-edit' : '.import-review-stitch').click();
      await page.waitForURL(mode === 'confirm-edit' ? /create\.html/ : /stitch\.html/, { timeout: 60000 });
      await page.waitForTimeout(2500);
      out.url = page.url().replace(SIDES[side], '').split('?')[0];
      const before = await storedProjects(page);
      out.stored = before.length; out.project = sha(before.join('\n'));
      await page.reload();
      await page.waitForTimeout(3500);
      const after = await storedProjects(page);
      out.reopened = sha(after.join('\n')); out.reopenSame = before.join('\n') === after.join('\n');
      out.title = (await page.title());
      out.bodyHasError = await page.locator('text=/could not|failed to load|error/i').count();
    }
  }
  out.pageErrors = errors;
  await context.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  let bad = 0;
  const plan = [];
  for (const f of pdfs) {
    const big = /lord-libidan|gen-3/.test(f);
    plan.push([f, 'confirm-stitch']);
    if (!big) plan.push([f, 'confirm-edit'], [f, 'review-cancel']);
  }
  plan.push([pdfs.find(f => /gen1/.test(f)) || pdfs[0], 'progress-cancel'], [null, 'bad-file']);
  for (const [f, mode] of plan) {
    const r = {};
    for (const side of ['base', 'head']) r[side] = await scenario(browser, side, f, mode);
    const strip = (o) => JSON.stringify(Object.assign({}, o, { importMs: undefined }));
    const same = strip(r.base) === strip(r.head) && !r.base.pageErrors.length && !r.head.pageErrors.length;
    if (!same) bad++;
    console.log(same ? 'SAME' : 'DIFF', f ? path.basename(f) : '(bad file)', mode, JSON.stringify(r.head), same ? `importMs base=${r.base.importMs} head=${r.head.importMs}` : '\n   base ' + JSON.stringify(r.base));
  }
  await browser.close();
  console.log(bad ? `${bad} scenarios differ` : 'all scenarios identical');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
