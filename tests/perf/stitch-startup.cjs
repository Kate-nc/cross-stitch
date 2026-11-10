/* Reproducible startup request-chain experiment. Run after build:dist:
   CHROME=/usr/bin/chromium REPEATS=3 OUT=reports/perf-results/startup-before.json node tests/perf/stitch-startup.cjs
   ROOT=source selects checkout instead of dist. CANDIDATE=1 adds only the entry preload in memory.
   Local HTTP CDN mirror uses exact SRI-checked npm bytes. HTTP cache remains enabled
   (no Playwright routes). Simulated 80ms latency, 1.6Mbps, unthrottled CPU, software
   rendering: never a physical-device or Internet/CDN measurement. SW tested separately. */
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert'), zlib = require('zlib');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const { makeTrackerFixture } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installTrackProbes, readTrackProbes, summarise } = require('../_helpers/trackProbes');
const root = path.resolve(__dirname, '../..'), deployed = process.env.ROOT === 'source' ? root : path.join(root, 'dist');
const mirror = { 'react.production.min.js': 'react/umd/react.production.min.js', 'react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js', 'pako.min.js': 'pako/dist/pako.min.js' };

const preload = '<link rel="preload" as="script" href="compiled/tracker-app.compiled.js">';
function serve(req, res) {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (name === 'probe.html') { res.end('<title>Seed</title>'); return; }
  let file = name.startsWith('__cdn/') ? path.join(root, 'node_modules', mirror[name.split('/').pop()] || 'missing') : path.join(deployed, name);
  if (!file.startsWith(root + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(file);
  if (name.endsWith('.html')) {
    let html = body.toString().replace(/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/[^"']+\/(react(?:-dom)?\.production\.min\.js|pako\.min\.js)/g, '/__cdn/$1');
    if (process.env.CANDIDATE && name === 'stitch.html') html = html.replace('<head>', '<head>' + preload);
    body = Buffer.from(html);
  }
  // Cacheable scripts emulate an immutable deployment; HTML is revalidated.
  res.setHeader('Cache-Control', name.endsWith('.html') ? 'no-cache' : 'max-age=3600');
  res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream');
  if (/gzip/.test(req.headers['accept-encoding'] || '')) { body = zlib.gzipSync(body); res.setHeader('Content-Encoding', 'gzip'); }
  res.setHeader('Content-Length', body.length);
  res.end(body);
}
const server = http.createServer(serve);
async function traceEnd(cdp, events) {
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end'); await done;
  return traceSummary(events);
}
function traceSummary(events) {
  const allEvals = events.filter(e => e.name === 'EvaluateScript' && e.ph === 'X');
  const tid = allEvals.find(e => /tracker-app/.test(e.args?.data?.url || ''))?.tid;
  if (tid == null) throw new Error('Tracker evaluation missing from startup trace');
  const evals = allEvals.filter(e => e.tid === tid);
  const sum = a => +(a.reduce((s, e) => s + (e.dur || 0), 0) / 1000).toFixed(2);
  return { evaluateInclusiveMs: sum(evals), mainThreadCompileMs: sum(events.filter(e => e.tid === tid && /^(v8.compile|V8.CompileScript)$/.test(e.name) && e.ph === 'X')),
    renderingMs: sum(events.filter(e => e.tid === tid && /^(Layout|UpdateLayoutTree|Paint)$/.test(e.name) && e.ph === 'X')),
    scripts: evals.map(e => ({ url: e.args?.data?.url, ms: +(e.dur / 1000).toFixed(2) })) };
}
async function main() {
  const fixture = JSON.parse(fs.readFileSync(makeTrackerFixture({ sW: 100, sH: 100, nColours: 12, doneFraction: 0, id: 'proj_startup' })));
  fixture.id = 'proj_startup'; fixture.savedZoom = 1;
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  const runs = [];
  try {
    for (let i = 0; i < (+process.env.REPEATS || 3); i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
      await suppressOnboarding(page); await installTrackProbes(page);
      await page.addInitScript(() => {
        document.addEventListener('load', () => window.__tpWrapSpans?.(), true);
        const frame = () => {
          if (window.__tp?.fullPaints.length && window.__flushProjectToIDB) {
            requestAnimationFrame(() => { window.__startupUsable = performance.now(); });
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await page.goto(base + '/probe.html');
      for (const s of ['constants.js', 'dmc-data.js', 'colour-utils.js', 'helpers.js', 'project-storage.js']) await page.addScriptTag({ url: base + '/' + s });
      await page.evaluate(async p => { await ProjectStorage.save(p); ProjectStorage.setActiveProject(p.id); }, fixture);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable'); await cdp.send('Network.clearBrowserCache');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 200000, uploadThroughput: 100000 });
      for (const cache of ['cold', 'warm']) {
        const events = []; const collect = ({ value }) => events.push(...value); cdp.on('Tracing.dataCollected', collect);
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8', transferMode: 'ReportEvents' });
        await page.goto(base + '/stitch.html?id=proj_startup', { waitUntil: 'load', timeout: 120000 });
        await page.waitForFunction(() => window.__startupUsable, null, { timeout: 60000 });
        // Two frames after the first real chart drawing task: usable on-screen, not just canvas mounted.
        const usable = await page.evaluate(() => window.__startupUsable);
        const probes = await readTrackProbes(page);
        const timings = await page.evaluate(() => ({ navigation: performance.getEntriesByType('navigation')[0].toJSON(), resources: performance.getEntriesByType('resource').map(r => r.toJSON()) }));
        const trace = await traceEnd(cdp, events); cdp.off('Tracing.dataCollected', collect);
        const counters = summarise(probes, { t1: usable });
        const read = probes.spans.find(s => s.name === 'ProjectStorage.get' && s.settled != null);
        const projectRead = read ? { startMs: read.t, settledMs: read.t + read.settled, elapsedMs: read.settled,
          // Includes hydration, React and drawing; do not label this JS-only hydration.
          readToUsableMs: usable - read.t - read.settled } : null;
        runs.push({ repeat: i, cache, usableMs: +usable.toFixed(1), firstPaintStartMs: probes.fullPaints[0], counters, projectRead, trace, ...timings });
        // Verify first-interaction helpers really exist; no startup errors masked by drawing.
        assert.deepEqual(errors, []);
        assert(await page.evaluate(() => typeof ProjectStorage.get === 'function' && typeof TrackingSync.merge === 'function' && !!window.WelcomeWizard));
      }
      await context.close();
    }
    const out = process.env.OUT || 'reports/perf-results/stitch-startup.json';
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), root: path.relative(root, deployed) || 'source', candidate: !!process.env.CANDIDATE, browser: browser.version(), environment: 'headless SwiftShader; CPU 1x; HTTP mirror; latency 80ms; download 200000 bytes/s; no SW', runs }, null, 2));
    for (const cache of ['cold', 'warm']) { const xs = runs.filter(r => r.cache === cache).map(r => r.usableMs).sort((a,b)=>a-b); console.log(cache, xs, 'median', xs[Math.floor(xs.length/2)]); }
    console.log(out);
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
}
module.exports = { serve, traceSummary };
if (require.main === module) main().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
