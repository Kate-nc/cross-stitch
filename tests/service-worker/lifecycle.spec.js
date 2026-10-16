// Real Chromium lifecycle with actual local application bytes. CDN transport is
// mirrored through this server so failures are reproducible without Internet.
// React/DOM/Pako are the exact npm production bytes (same SRI as the pages).
// JSZip and PDF.js are mirrored from their exact versioned CDN URLs.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const hash = body => crypto.createHash('sha256').update(body).digest('hex');
const original = {};
vm.runInNewContext(source.slice(0, source.indexOf('// Each build')), original);
const cdn = new Map();
for (const url of Object.keys(original.BUILD_ASSETS).filter(x => x.startsWith('https:'))) {
  const name = url.includes('/react-dom/') ? 'react-dom/umd/react-dom.production.min.js' : url.includes('/react/') ? 'react/umd/react.production.min.js' : url.includes('/pako/') ? 'pako/dist/pako.min.js' : null;
  if (name) cdn.set(url, fs.readFileSync(path.join(root, 'node_modules', name)));
  else {
    const directory = path.join(root, 'work/sw-browser-cdn');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, hash(url));
    if (!fs.existsSync(file)) execFileSync('curl', ['--fail', '--silent', '--show-error', url, '-o', file]);
    cdn.set(url, fs.readFileSync(file));
  }
}
function build(label) {
  const files = new Map();
  const assets = structuredClone(original.BUILD_ASSETS);
  for (const [url, entry] of Object.entries(assets)) {
    if (!url.startsWith('./')) continue;
    let body = fs.readFileSync(path.join(root, url));
    if (url === './version.js') body = Buffer.from(body.toString().replace(/1\.0\.159/g, label));
    files.set(url.slice(2), body);
    entry.sha256 = hash(body);
  }
  const id = hash(source + label + JSON.stringify(assets));
  let worker = source.replace(/var BUILD_ID = "[^"]+";/, `var BUILD_ID = "${id}";`)
    .replace(/var BUILD_ASSETS = [\s\S]*?\n};/, 'var BUILD_ASSETS = ' + JSON.stringify(assets) + ';');
  worker = `const transport = self.fetch.bind(self); self.fetch = request => request.url.startsWith('https://cdnjs.cloudflare.com/') ? transport(new Request(new URL('/__cdn?url=' + encodeURIComponent(request.url), self.registration.scope), { integrity: request.integrity })) : transport(request);\n` + worker;
  return { files, worker, cache: original.CACHE_NAME + '-' + id };
}
let server, base, deployed, failure, held, serverOffline;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (serverOffline) { req.socket.destroy(); return; }
    const url = new URL(req.url, 'http://localhost');
    const name = url.pathname.slice(1);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/__cdn') { res.setHeader('Content-Type', 'application/javascript'); res.end(failure?.kind === 'cdn-mismatch' ? Buffer.from('wrong CDN bytes') : cdn.get(url.searchParams.get('url'))); return; }
    if (name === 'sw.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(deployed.worker); return; }
    if (name === 'probe.html') { res.setHeader('Content-Type', 'text/html'); res.end('<title>Lifecycle probe</title>'); return; }
    if (name === failure?.asset) {
      if (failure.kind === '404') { res.writeHead(404); res.end('missing'); return; }
      if (failure.kind === 'disconnect') { req.socket.destroy(); return; }
      if (failure.kind === 'hold') { held = res; return; }
      if (failure.kind === 'mismatch') { res.end('another build'); return; }
    }
    const route = { '': 'home.html', home: 'home.html', create: 'create.html', stitch: 'stitch.html', manager: 'manager.html' }[name] || name;
    const data = deployed.files.get(route);
    if (!data) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', route.endsWith('.html') ? 'text/html' : route.endsWith('.css') ? 'text/css' : route.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
    res.end(data);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { held?.destroy(); await new Promise(resolve => server.close(resolve)); });
test.beforeEach(async ({ context }) => {
  failure = null; held = null; serverOffline = false; deployed = build('old-build');
  await context.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ body: cdn.get(route.request().url()) || Buffer.from(''), contentType: 'application/javascript' }));
});
async function register(page) {
  await page.goto(base + '/probe.html');
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }));
  await page.evaluate(() => navigator.serviceWorker.ready);
}
async function update(page) {
  return page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const finished = new Promise(resolve => reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'redundant') resolve(worker.state);
      });
    }, { once: true }));
    await reg.update();
    return finished;
  });
}
async function saveProject(page) {
  await page.evaluate(() => window.ProjectStorage.save({ id: 'sw-sentinel', name: 'Preserved project', settings: { sW: 1, sH: 1 }, pattern: [{ id: '310', type: 'solid' }] }));
}
async function assertProject(page) {
  expect(await page.evaluate(async () => (await window.ProjectStorage.get('sw-sentinel')).name)).toBe('Preserved project');
}
async function version(page) { return page.evaluate(async () => (await fetch('/version.js')).text()); }
for (const kind of ['404', 'disconnect', 'mismatch', 'cdn-mismatch']) {
  test(`failed ${kind} upgrade leaves old version offline`, async ({ page, context }) => {
    await register(page);
    await page.goto(base + '/home');
    const old = deployed.cache;
    await saveProject(page);
    await page.evaluate(async () => { await caches.open('user-project-exports'); localStorage.setItem('project-sentinel', 'preserved'); });
    deployed = build('new-build'); failure = { asset: 'stitch.html', kind };
    expect(await update(page)).toBe('redundant');
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining([old, 'user-project-exports']));
    expect(await page.evaluate(() => caches.keys())).not.toContain(deployed.cache);
    serverOffline = true;
    await context.setOffline(true);
    await page.reload();
    expect(await version(page)).toContain('old-build');
    expect(await page.evaluate(() => localStorage.getItem('project-sentinel'))).toBe('preserved');
    await expect(page.locator('#root')).not.toBeEmpty();
    await assertProject(page);
  });
}
test('uncontrolled first visit, two tabs, successful upgrade, offline routes and bounded caches', async ({ page, context }) => {
  await register(page);
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  await page.goto(base + '/home');
  const second = await context.newPage(); await second.goto(base + '/manager');
  await saveProject(page);
  await page.evaluate(() => window.__unsavedSession = 'still editing');
  const oldCache = deployed.cache;
  deployed = build('new-build');
  expect(await update(page)).toBe('installed');
  expect(await version(page)).toContain('old-build');
  expect(await version(second)).toContain('old-build');
  expect(await page.evaluate(() => window.__unsavedSession)).toBe('still editing');
  await page.close();
  expect(await version(second)).toContain('old-build');
  expect(await second.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(true);
  // No app clients remain. A new out-of-scope probe can observe activation.
  await second.close();
  const probe = await context.newPage(); await probe.goto(base + '/probe.html');
  await expect.poll(() => probe.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active?.state)).toBe('activated');
  serverOffline = true;
    await context.setOffline(true);
  for (const route of ['/home', '/home/', '/create', '/create/', '/stitch?project=x', '/manager', '/index.html?mode=stats']) {
    await probe.goto(base + route);
    expect(await version(probe)).toContain('new-build');
    await expect(probe.locator('#root')).not.toBeEmpty();
  }
  await assertProject(probe);
  const names = await probe.evaluate(() => caches.keys());
  expect(names.filter(x => x.startsWith('cross-stitch-cache-')).sort()).toEqual([oldCache, deployed.cache].sort());
  // A third release must discard the oldest complete cache and keep only one
  // predecessor. Repeated checks for identical bytes must not reinstall.
  serverOffline = false;
  await context.setOffline(false);
  const previous = deployed.cache;
  deployed = build('third-build');
  expect(await update(probe)).toBe('installed');
  await probe.close();
  const third = await context.newPage(); await third.goto(base + '/probe.html');
  await expect.poll(() => third.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active?.state)).toBe('activated');
  await third.goto(base + '/home');
  expect(await version(third)).toContain('third-build');
  await third.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  expect(await third.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).installing)).toBe(false);
  expect((await third.evaluate(() => caches.keys())).filter(x => x.startsWith('cross-stitch-cache-')).sort()).toEqual([previous, deployed.cache].sort());
  await assertProject(third);
});
test('terminated installation leaves a partial candidate; retry commits and later activation cleans it', async ({ page, context }) => {
  await register(page); await page.goto(base + '/home');
  const old = deployed.cache;
  deployed = build('interrupted-build'); failure = { asset: 'stitch.html', kind: 'hold' };
  const updating = update(page).catch(() => 'terminated');
  await expect.poll(() => !!held).toBe(true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  await cdp.send('ServiceWorker.stopAllWorkers');
  held.destroy(); failure = null;
  // Termination may reject install or resume it; deploy a distinct candidate to
  // prove either outcome leaves the active build untouched and can recover.
  expect(await version(page)).toContain('old-build');
  deployed = build('retry-build');
  expect(await update(page)).toBe('installed');
  expect(await page.evaluate(() => caches.keys())).toContain(old);
  await page.close(); await updating;
  const next = await context.newPage(); await next.goto(base + '/probe.html');
  await expect.poll(() => next.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active?.state)).toBe('activated');
  await next.goto(base + '/home');
  expect(await version(next)).toContain('retry-build');
  expect((await next.evaluate(() => caches.keys())).filter(x => x.startsWith('cross-stitch-cache-'))).toHaveLength(2);
});

test('legacy v69 migration failure preserves its offline cache', async ({ page, context }) => {
  const legacy = fs.readFileSync(path.join(__dirname, 'legacy-v69.js.txt'), 'utf8');
  const transport = deployed.worker.slice(0, deployed.worker.indexOf('\n') + 1);
  deployed.worker = transport + legacy;
  await register(page);
  await page.goto(base + '/home');
  deployed = build('new-build'); failure = { asset: 'stitch.html', kind: '404' };
  expect(await update(page)).toBe('redundant');
  serverOffline = true;
    await context.setOffline(true);
  await page.reload();
  expect(await version(page)).toContain('old-build');
  await expect(page.locator('#root')).not.toBeEmpty();
  expect(await page.evaluate(() => caches.keys())).toContain('cross-stitch-cache-v69');
});
