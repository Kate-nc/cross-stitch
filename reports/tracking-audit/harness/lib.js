const PORT = process.env.AUDIT_PORT || '8000';
const WORK = process.env.AUDIT_WORK || (require('os').tmpdir() + '/tracking-audit-work/');
const { chromium, devices } = require('playwright');
const fs = require('fs');
const S = WORK;
const L = S + 'libs/node_modules/';
const MAP = {
  'react.production.min.js': L + 'react/umd/react.production.min.js',
  'react-dom.production.min.js': L + 'react-dom/umd/react-dom.production.min.js',
  'pako.min.js': L + 'pako/dist/pako.min.js',
};
const SHOTS = process.env.AUDIT_SHOTS||WORK+'shots/';
async function launch(opts = {}, profile) {
  const o = Object.assign({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] }, opts);
  let browser = null, ctx;
  if (profile) { ctx = await chromium.launchPersistentContext(S + 'profiles/' + profile, o); }
  else { browser = await chromium.launch({ executablePath: o.executablePath, args: o.args }); delete o.executablePath; delete o.args; ctx = await browser.newContext(o); }
  await ctx.route(/cdnjs\.cloudflare\.com/, route => {
    const name = route.request().url().split('/').pop();
    if (MAP[name]) return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(MAP[name]) });
    return route.abort();
  });
  await ctx.route(new RegExp('127\\.0\\.0\\.1:' + PORT + '/[^?]*\\.html'), async route => {
    const resp = await route.fetch();
    let body = await resp.text();
    body = body.replace(/ integrity="[^"]*"/g, '');
    route.fulfill({ response: resp, body, headers: Object.assign({}, resp.headers(), { 'content-type': 'text/html; charset=utf-8' }) });
  });
  return { browser, ctx, close: async () => { await ctx.close(); if (browser) await browser.close(); } };
}
async function seed(page, file) {
  const proj = JSON.parse(fs.readFileSync(S + 'fx/' + file, 'utf8'));
  await page.goto('http://127.0.0.1:' + PORT + '/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  const id = await page.evaluate(async p => { const id = await ProjectStorage.save(p); ProjectStorage.setActiveProject(id); return id; }, proj);
  return id;
}
module.exports = { launch, devices, seed, SHOTS, S };
