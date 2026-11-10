/* Controlled cold/warm HTTP-cache startup experiment. Build dist first.
   ROOT=source selects checkout; CANDIDATE=1 adds an in-memory entry preload.
   CHROME optionally selects Chromium; REPEATS is a positive integer.
   Exact SRI-checked npm CDN mirror, gzip, simulated 80ms / 200000 bytes/s,
   CPU 1x, SwiftShader. Never a live-CDN or physical-device measurement.
   Service workers and first interactions require separate browser coverage. */
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const zlib = require('zlib'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const { makeTrackerFixture } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { trackProbeInit, readTrackProbes, summarise } = require('../_helpers/trackProbes');
const root = path.resolve(__dirname, '../..');
const mirror = { 'react.production.min.js': 'react/umd/react.production.min.js', 'react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js', 'pako.min.js': 'pako/dist/pako.min.js' };
const preload = '<link rel="preload" as="script" href="compiled/tracker-app.compiled.js">';
const SEED_SCRIPTS = ['constants.js', 'dmc-data.js', 'colour-utils.js', 'helpers.js', 'knots.js', 'backstitch.js', 'fractional.js', 'beads.js', 'progress-units.js', 'tracking-sync.js', 'project-storage.js'];

function config(env = process.env) {
  const repeats = Number(env.REPEATS ?? 3);
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error('REPEATS must be a positive integer');
  if (env.ROOT && env.ROOT !== 'source' && env.ROOT !== 'dist') throw new Error('ROOT must be source or dist');
  if (env.CANDIDATE && !['0', '1'].includes(env.CANDIDATE)) throw new Error('CANDIDATE must be 0 or 1');
  return { deployed: env.ROOT === 'source' ? root : path.join(root, 'dist'), candidate: env.CANDIDATE === '1', repeats,
    out: env.OUT || 'reports/perf-results/stitch-startup.json', chrome: env.CHROME };
}
function acceptsGzip(value = '') {
  return value.split(',').some(part => {
    const [name, ...params] = part.trim().split(';');
    const q = params.find(p => /^\s*q\s*=/.test(p));
    return name === 'gzip' && (!q || Number(q.split('=')[1]) > 0);
  });
}
function pageBytes(body, name, candidate) {
  if (!name.endsWith('.html')) return body;
  let html = body.toString().replace(/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/[^"']+\/(react(?:-dom)?\.production\.min\.js|pako\.min\.js)/g, '/__cdn/$1');
  if (candidate && name === 'stitch.html') html = html.replace('<head>', '<head>' + preload);
  return Buffer.from(html);
}
function createHandler({ deployed, candidate = false }) {
  return function serve(req, res) {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1);
    if (name === 'probe.html') { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'text/html'); res.end('<title>Seed</title>'); return; }
    const cdn = name.startsWith('__cdn/');
    const mapped = cdn && mirror[name.slice('__cdn/'.length)];
    const base = cdn ? path.join(root, 'node_modules') : deployed;
    const file = mapped ? path.join(base, mapped) : path.resolve(base, name);
    // Do not expose repo metadata, host files, or arbitrary npm files through the mirror.
    if ((cdn && !mapped) || /(^|\/)\./.test(name) || (!cdn && name.startsWith('node_modules/')) ||
        !file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile() ||
        !fs.realpathSync(file).startsWith(fs.realpathSync(base) + path.sep)) { res.writeHead(404); res.end(); return; }
    let body = pageBytes(fs.readFileSync(file), name, candidate);
    // Cacheable scripts model an immutable deployment, not Vercel's cache policy.
    res.setHeader('Cache-Control', name.endsWith('.html') ? 'no-cache' : 'max-age=3600');
    res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    res.setHeader('Vary', 'Accept-Encoding');
    if (acceptsGzip(req.headers['accept-encoding'])) { body = zlib.gzipSync(body); res.setHeader('Content-Encoding', 'gzip'); }
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}
// Union durations: nested/duplicate trace events must not be counted twice.
function duration(events, begin, end) {
  const ranges = events.map(e => [Math.max(begin, e.ts), Math.min(end, e.ts + e.dur)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, until = -Infinity;
  for (const [a, b] of ranges) { total += Math.max(0, b - Math.max(a, until)); until = Math.max(until, b); }
  return +(total / 1000).toFixed(2);
}
function traceSummary(events) {
  const begin = events.find(e => e.name === 'stitch-startup:begin' && /user_timing/.test(e.cat || ''));
  const end = events.find(e => e.name === 'stitch-startup:usable' && /user_timing/.test(e.cat || ''));
  if (!begin || !end || !Number.isFinite(begin.ts) || !(end.ts > begin.ts)) throw new Error('Startup trace window missing or invalid');
  const complete = events.filter(e => e.ph === 'X' && Number.isFinite(e.ts) && Number.isFinite(e.dur) && e.dur >= 0 && e.ts < end.ts && e.ts + e.dur > begin.ts);
  const entry = complete.find(e => e.name === 'EvaluateScript' && /\/compiled\/tracker-app\.compiled\.js(?:[?#]|$)/.test(e.args?.data?.url || '') && e.pid === begin.pid && e.tid === begin.tid);
  if (!entry || end.pid !== entry.pid || end.tid !== entry.tid) throw new Error('Tracker evaluation missing from startup trace thread');
  const main = complete.filter(e => e.pid === entry.pid && e.tid === entry.tid);
  const evals = main.filter(e => e.name === 'EvaluateScript');
  const ms = es => duration(es, begin.ts, end.ts);
  return { windowMs: +((end.ts - begin.ts) / 1000).toFixed(2), evaluateInclusiveMs: ms(evals),
    mainThreadCompileMs: ms(main.filter(e => /^(v8.compile|V8.CompileScript)$/.test(e.name))),
    renderingMs: ms(main.filter(e => /^(Layout|UpdateLayoutTree|Paint)$/.test(e.name))),
    scripts: evals.map(e => ({ url: e.args?.data?.url, ms: ms([e]) })) };
}
async function traceEnd(cdp, events) {
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  if ((await done).dataLossOccurred) throw new Error('Startup trace lost events');
  return traceSummary(events);
}
// Runs after trackProbeInit in the SAME init script: Playwright does not order
// separate init scripts. Readiness is still a proxy, never an interaction test.
function startupObserver() {
  if (!/\/stitch\.html$/.test(location.pathname)) return;
  performance.setResourceTimingBufferSize(1000);
  performance.mark('stitch-startup:begin');
  let fontRequested = false, fontReady = false;
  const loaded = () => {
    window.__tpWrapSpans?.();
    if (!fontRequested && window.SymbolGlyphs) {
      fontRequested = true;
      SymbolGlyphs.ensureFont().then(ok => { if (ok) fontReady = true; else window.__startupError = 'Symbol font failed to load'; }, e => { window.__startupError = String(e); });
    }
  };
  document.addEventListener('load', loaded, true);
  const ready = () => {
    const cv = document.querySelector('.tracker-chart-layer canvas');
    const b = cv?.getBoundingClientRect();
    if (cv?.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
    return fontReady && window.__tp?.fullPaints.length && typeof window.__flushProjectToIDB === 'function' &&
      b && b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth;
  };
  const frame = () => {
    if (window.__startupError) return;
    if (ready()) requestAnimationFrame(() => {
      if (!ready()) { requestAnimationFrame(frame); return; }
      performance.mark('stitch-startup:usable');
      window.__startupUsable = performance.now();
    });
    else requestAnimationFrame(frame);
  };
  loaded(); requestAnimationFrame(frame);
}
async function resetSeedStorage() {
  // Only used in the runner's disposable browser context, after leaving Tracker.
  const prefs = Object.entries(localStorage).filter(([k]) => /^cs_welcome_|^cs_pref_onboarding\.coached\.|^cs_stitchStyle$/.test(k));
  localStorage.clear(); sessionStorage.clear();
  prefs.forEach(([k, v]) => localStorage.setItem(k, v));
  for (const { name } of await indexedDB.databases()) if (name) await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = resolve; req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Seed database deletion blocked: ' + name));
  });
}
async function seed(page, base, fixture) {
  // Leaving Tracker completes its unload path BEFORE we restore the seed. Warm
  // HTTP loading must not inherit migrations, sessions or journals from cold.
  await page.goto(base + '/probe.html');
  await page.evaluate(resetSeedStorage);
  for (const s of SEED_SCRIPTS) await page.addScriptTag({ url: base + '/' + s });
  await page.evaluate(async p => { await ProjectStorage.save(p); ProjectStorage.setActiveProject(p.id); }, fixture);
}
function boundedProbes(probes, usable) {
  // Shared summarise() selects by start time. A snapshot taken after readiness
  // may already contain completions from outside the measured window.
  return { ...probes,
    spans: probes.spans.map(s => s.settled != null && s.t + s.settled > usable ? { ...s, settled: null } : s),
    tx: probes.tx.map(t => t.done != null && t.done > usable ? { ...t, done: null, ok: null } : t) };
}
function projectReadSummary(spans, usable) {
  const read = spans.find(s => s.name === 'ProjectStorage.get' && !s.failed && s.settled != null && s.t >= 0 && s.t + s.settled <= usable);
  return read ? { startMs: read.t, settledMs: read.t + read.settled, elapsedMs: read.settled, readToUsableMs: usable - read.t - read.settled } : null;
}
function median(xs) { const s = xs.slice().sort((a, b) => a - b), i = Math.floor(s.length / 2); return s.length ? s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2 : null; }
function buildInfo({ deployed, candidate }) {
  const hash = name => crypto.createHash('sha256').update(pageBytes(fs.readFileSync(path.join(deployed, name)), name, candidate)).digest('hex');
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
    sha256: Object.fromEntries(['stitch.html', 'compiled/tracker-app.compiled.js', 'sw.js'].map(n => [n, hash(n)])) };
}
async function run(options, browserType = chromium) {
  const build = buildInfo(options); // Fail before launching if dist is missing.
  const fixture = JSON.parse(fs.readFileSync(makeTrackerFixture({ sW: 100, sH: 100, nColours: 12, doneFraction: 0, id: 'proj_startup' })));
  fixture.id = 'proj_startup'; fixture.savedZoom = 1;
  const server = http.createServer(createHandler(options));
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await browserType.launch({ ...(options.chrome ? { executablePath: options.chrome } : {}), headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
    const runs = [];
    for (let i = 0; i < options.repeats; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      try {
        const page = await context.newPage(); let errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('requestfailed', r => errors.push('Request failed: ' + r.url()));
        page.on('response', r => { if (r.status() >= 400 && ['document', 'script', 'stylesheet', 'font'].includes(r.request().resourceType())) errors.push('HTTP ' + r.status() + ': ' + r.url()); });
        await suppressOnboarding(page);
        await page.addInitScript({ content: '(' + trackProbeInit.toString() + ')();(' + startupObserver.toString() + ')();' });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        for (const cache of ['cold', 'warm']) {
          // Seed without network shaping, consistently for both arms.
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
          await seed(page, base, fixture);
          assert.deepEqual(errors, [], 'Seed failed'); errors = [];
          if (cache === 'cold') await cdp.send('Network.clearBrowserCache');
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 200000, uploadThroughput: 100000 });
          const events = [], collect = ({ value }) => events.push(...value);
          cdp.on('Tracing.dataCollected', collect);
          await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing', transferMode: 'ReportEvents' });
          try {
            await page.goto(base + '/stitch.html?id=proj_startup', { waitUntil: 'load', timeout: 120000 });
            await page.waitForFunction(() => window.__startupUsable || window.__startupError, null, { timeout: 60000 });
            const usable = await page.evaluate(() => { if (window.__startupError) throw new Error(window.__startupError); return window.__startupUsable; });
            const probes = await readTrackProbes(page);
            const timings = await page.evaluate(t => ({ navigation: performance.getEntriesByType('navigation')[0].toJSON(), resources: performance.getEntriesByType('resource').filter(r => r.responseEnd <= t).map(r => r.toJSON()) }), usable);
            const trace = await traceEnd(cdp, events);
            assert.deepEqual(errors, []);
            runs.push({ repeat: i, cache, usableMs: +usable.toFixed(1), firstPaintStartMs: probes.fullPaints[0], counters: summarise(boundedProbes(probes, usable), { t1: usable }), projectRead: projectReadSummary(probes.spans, usable), trace, ...timings });
          } finally { cdp.off('Tracing.dataCollected', collect); }
        }
      } finally { await context.close(); }
    }
    assert.deepEqual(buildInfo(options), build, 'Build changed during startup experiment');
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, JSON.stringify({ ...build, root: path.relative(root, options.deployed) || 'source', candidate: options.candidate, browser: browser.version(), environment: 'headless SwiftShader; CPU 1x; HTTP mirror; latency 80ms; download 200000 bytes/s; no SW; HTTP-cache cold, not process cold', runs }, null, 2));
    for (const cache of ['cold', 'warm']) { const xs = runs.filter(r => r.cache === cache).map(r => r.usableMs); console.log(cache, xs, 'median', median(xs)); }
    console.log(options.out);
  } finally {
    try { if (browser) await browser.close(); }
    finally { if (server.listening) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  }
}
module.exports = { createHandler, traceSummary, config, acceptsGzip, startupObserver, resetSeedStorage, projectReadSummary, boundedProbes, median, buildInfo, run };
if (require.main === module) Promise.resolve().then(() => run(config())).catch(e => { console.error(e); process.exitCode = 1; });
