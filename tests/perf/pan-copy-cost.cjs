/* pan-copy-cost.cjs — what a pan costs once the Tracker's tile moves by
   copying itself (shiftChartTile), split into script, rendering, compositor,
   raster and GPU-process time, for the variants worth comparing first:
   normal, ?tileshift=0 (a full repaint per tile move), the overscan margin,
   the chart's backing resolution, and overlays on or off.
   ═══════════════════════════════════════════════════════════════════════════
   reports/track-pan-copy-cost.md is built from this.

     node tests/perf/pan-copy-cost.cjs                 every case
     ONLY=phone node tests/perf/pan-copy-cost.cjs      ids containing any of these
     OUT=reports/track-mode-baseline/x.json ...        where to write
     CHROME=/path/to/chromium ...                      another Chromium build
     REPEATS=3 ...                                     run each case n times (interleaved)
     PROFILE=1 ...                                     add a CPU profile of the pan: main-thread
                                                       samples split into app JavaScript, canvas
                                                       calls (native time under drawImage, fillRect,
                                                       fillText...), garbage collection and the rest

   Every case opens the same generated chart (400 x 500, 60 colours, 30% done)
   at the same zoom and scroll, then scrolls 24 px right and 12 px down per
   animation frame for 180 frames, as tests/mobile-audit/pan-large.spec.js
   and reports/track-pan-performance-audit.md do.

   Per case:
     frames      animation-frame intervals during the pan: median, p95, max,
                 how many over 50 ms
     loaf        Long Animation Frames in the window: total, script, and
                 rendering (from renderStart to the frame's end) time
     threads     busy time per thread from a Chrome trace (top-level tasks):
                 renderer main, renderer compositor, raster workers, GPU
                 process main, viz compositor
     counts      chart paints, tile moves that copied (chart and overlay
                 canvases), device pixels copied, from tests/_helpers/panProbes.js
     canvasMpx   backing store of every canvas in the chart layer at the end

   EMULATED. Headless Chromium draws canvases with SwiftShader (on the CPU);
   "phone" is Pixel 5 emulation (DPR 2.75, so the chart renders at 2x), with
   and without a 4x CPU throttle. A phone's or an iPad's GPU does the copy,
   the raster and the compositing very differently: nothing here measures a
   physical device, and the raster/GPU columns in particular say nothing
   about one. Counts and memory do not depend on the machine. */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { chromium, devices } = require('@playwright/test');
const { fixtureFor, fixturePalette } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installPanProbes, resetPanProbes, readPanProbes, fixtureWith, scrollFrames } = require('../_helpers/panProbes');

const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function freePort() {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function startServer() {
  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/version.js`); return { port, proc }; } catch (_) { await sleep(100); }
  }
  proc.kill();
  throw new Error('server did not start');
}
const CDN_LOCAL = {
  'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'pako.min.js': 'node_modules/pako/dist/pako.min.js',
};
async function routeCdn(context) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const url = route.request().url();
    const name = Object.keys(CDN_LOCAL).find((k) => url.endsWith('/' + k));
    if (!name) return route.abort();
    return route.fulfill({ path: path.join(ROOT, CDN_LOCAL[name]), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
}
function git(args) { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return null; } }

const PROFILES = {
  phone4x: { device: devices['Pixel 5'], throttle: 4 },
  phone1x: { device: devices['Pixel 5'], throttle: 1 },
  desktop: { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, throttle: 1 },
};
// Overlays: an outline highlight of one colour, a focus block and counting aids, as the
// Track Mode baseline's overlay case (tests/perf/track-baseline.cjs, OUTLINE).
const OVERLAYS = { storage: { cs_countAids: '1', cs_focusEnabled: '1' },
  fields: { workingContext: { view: 'highlight', colour: fixturePalette(60)[3].id, highlight: 'outline' }, focusBlock: { bx: 3, by: 3 } } };
const VARIANTS = {
  normal: {},
  tileshift0: { query: '&tileshift=0' },
  // The device-check settings in useCanvasOverlays.js, so the budget sees the same figures.
  overscan150: { query: '&overscan=150' },
  overscan600: { query: '&overscan=600' },
  scale1: { query: '&chartscale=1' },
  overlays: OVERLAYS,
  'overlays-tileshift0': Object.assign({ query: '&tileshift=0' }, OVERLAYS),
  // Zoomed out (6 px cells): many more cells per tile, where a full repaint costs most.
  zoom30: { zoom: 0.3 },
  'zoom30-tileshift0': { zoom: 0.3, query: '&tileshift=0' },
};
const CASES = [];
for (const prof of ['phone4x', 'phone1x', 'desktop']) {
  for (const v of Object.keys(VARIANTS)) {
    if (v === 'scale1' && prof === 'desktop') continue;                  // DPR 1 already
    CASES.push({ id: `${prof}-${v}`, profile: prof, variant: v });
  }
}

async function runCase(browser, port, spec) {
  const prof = PROFILES[spec.profile], v = VARIANTS[spec.variant];
  const context = await browser.newContext({ ...prof.device, serviceWorkers: 'block' });
  await routeCdn(context);
  const page = await context.newPage();
  await suppressOnboarding(page);
  await installPanProbes(page);
  await page.addInitScript(([storage]) => {
    try { Object.keys(storage || {}).forEach((k) => localStorage.setItem(k, storage[k])); } catch (_) {}
    // Device pixels drawn by a canvas onto itself (a kept tile move).
    window.__copiedPx = 0;
    const di = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (src) {
      if (src === this.canvas && arguments.length >= 9) window.__copiedPx += arguments[3] * arguments[4];
      return di.apply(this, arguments);
    };
    window.__loaf = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__loaf.push({ t: e.startTime, d: e.duration, renderStart: e.renderStart, script: (e.scripts || []).reduce((a, s) => a + s.duration, 0) }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch (_) {}
  }, [v.storage || null]);
  await page.goto(`http://127.0.0.1:${port}/stitch.html?from=home${v.query || ''}`, { waitUntil: 'load', timeout: 120000 });
  const fields = Object.assign({ savedZoom: v.zoom || 1, savedScroll: { left: 2000 * (v.zoom || 1), top: 2000 * (v.zoom || 1) } }, v.fields || {});
  await page.locator('input[type="file"]').first().setInputFiles(fixtureWith(fixtureFor('large', { doneFraction: 0.3 }), fields));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 120000 });
  await sleep(12000);
  const cdp = await context.newCDPSession(page);
  await page.evaluate((z) => { const s = document.querySelector('.tracker-chart-scroll'); s.scrollLeft = 2000 * z; s.scrollTop = 2000 * z; }, v.zoom || 1);
  await sleep(1500);
  await resetPanProbes(page);
  await page.evaluate(() => { window.__copiedPx = 0; window.__loaf = []; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });
  await cdp.send('Tracing.start', {
    transferMode: 'ReturnAsStream',
    traceConfig: { includedCategories: ['toplevel', '__metadata'], recordMode: 'recordContinuously' },
  });
  if (process.env.PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
  const t0 = await page.evaluate(() => performance.now());
  const frames = await page.evaluate(([dx, dy, n]) => new Promise((done) => {
    const sc = document.querySelector('.tracker-chart-scroll');
    const out = []; let i = 0, last = null;
    (function step(ts) {
      if (last != null) out.push(ts - last);
      last = ts;
      if (i++ >= n) { requestAnimationFrame(() => done(out)); return; }
      sc.scrollLeft += dx; sc.scrollTop += dy;
      requestAnimationFrame(step);
    })(performance.now());
  }), [24, 12, 180]);
  const cpuProfile = process.env.PROFILE ? splitProfile((await cdp.send('Profiler.stop')).profile) : undefined;
  await sleep(500);
  const t1 = await page.evaluate(() => performance.now());
  const stream = await new Promise((resolve) => { cdp.once('Tracing.tracingComplete', (e) => resolve(e.stream)); cdp.send('Tracing.end'); });
  let text = '';
  for (;;) { const r = await cdp.send('IO.read', { handle: stream }); text += r.base64Encoded ? Buffer.from(r.data, 'base64').toString() : r.data; if (r.eof) break; }
  await cdp.send('IO.close', { handle: stream });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const threads = threadBusy(JSON.parse(text));
  const counts = await readPanProbes(page);
  const extra = await page.evaluate(([a, b]) => ({
    copiedMpx: +(window.__copiedPx / 1e6).toFixed(1),
    loaf: window.__loaf.filter((e) => e.t >= a && e.t <= b),
    canvases: Array.from(document.querySelectorAll('.tracker-chart-layer canvas')).map((c) => ({ w: c.width, h: c.height, shown: getComputedStyle(c).display !== 'none' && getComputedStyle(c).visibility !== 'hidden' })),
    scale: (document.querySelector('.tracker-chart-layer canvas').__chartTile || {}).scale || 1,
  }), [t0, t1]);
  await context.close();
  const sorted = frames.slice().sort((a, b) => a - b);
  const q = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(1);
  const loaf = extra.loaf.reduce((o, e) => { o.n++; o.ms += e.d; o.script += e.script; o.render += e.renderStart ? e.t + e.d - e.renderStart : 0; return o; }, { n: 0, ms: 0, script: 0, render: 0 });
  Object.keys(loaf).forEach((k) => { loaf[k] = Math.round(loaf[k]); });
  return {
    id: spec.id, profile: spec.profile, variant: spec.variant,
    frames: { n: frames.length, median: q(0.5), p95: q(0.95), max: +sorted[sorted.length - 1].toFixed(1), over50: frames.filter((f) => f > 50).length, totalMs: Math.round(frames.reduce((a, b) => a + b, 0)) },
    loaf, threads,
    counts: { paints: counts.paints, chartCopies: counts.chartCopies, overlayCopies: counts.overlayCopies, copiedMpx: extra.copiedMpx },
    canvasMpx: +(extra.canvases.reduce((a, c) => a + c.w * c.h, 0) / 1e6).toFixed(2),
    canvases: extra.canvases, chartScale: extra.scale, cpuProfile,
  };
}

// Main-thread CPU samples of the pan, by kind. A canvas call's own work (the
// software raster here) is sampled as the native function itself.
const CANVAS_CALLS = /^(drawImage|fillRect|fillText|strokeRect|stroke|fill|clearRect|putImageData|clip|getImageData|createImageData|setTransform|save|restore|measureText|beginPath|rect|moveTo|lineTo|arc)$/;
function splitProfile(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const counts = new Map();
  for (const id of p.samples) counts.set(id, (counts.get(id) || 0) + 1);
  const dt = (p.endTime - p.startTime) / 1000 / Math.max(1, p.samples.length);
  const out = { canvasMs: 0, appJsMs: 0, gcMs: 0, idleMs: 0, otherMs: 0, topCanvas: {} };
  for (const [id, n] of counts) {
    const f = byId.get(id).callFrame, ms = n * dt, name = f.functionName;
    if (name === '(idle)') out.idleMs += ms;
    else if (name === '(garbage collector)') out.gcMs += ms;
    else if (CANVAS_CALLS.test(name) && !f.url) { out.canvasMs += ms; out.topCanvas[name] = (out.topCanvas[name] || 0) + ms; }
    else if (f.url && /127\.0\.0\.1/.test(f.url)) out.appJsMs += ms;
    else out.otherMs += ms;
  }
  for (const k of Object.keys(out)) if (typeof out[k] === 'number') out[k] = Math.round(out[k]);
  for (const k of Object.keys(out.topCanvas)) out.topCanvas[k] = Math.round(out.topCanvas[k]);
  return out;
}

// Busy time of top-level tasks per thread, grouped.
function threadBusy(trace) {
  const events = trace.traceEvents || trace;
  const names = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name);
  const busy = {};
  const group = (n) => {
    if (!n) return 'other';
    if (n === 'CrRendererMain') return 'rendererMain';
    if (n === 'Compositor') return 'rendererCompositor';
    if (/^CompositorTileWorker/.test(n)) return 'rasterWorkers';
    if (n === 'CrGpuMain') return 'gpuMain';
    if (n === 'VizCompositorThread') return 'vizCompositor';
    return 'other';
  };
  const other = {};
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur || !/toplevel/.test(e.cat || '')) continue;
    const n = names.get(e.pid + ':' + e.tid), g = group(n);
    busy[g] = (busy[g] || 0) + e.dur / 1000;
    if (g === 'other') { const k = String(n || 'unnamed').replace(/\d+$/, ''); other[k] = (other[k] || 0) + e.dur / 1000; }
  }
  Object.keys(busy).forEach((k) => { busy[k] = Math.round(busy[k]); });
  // The threads in "other" over 50 ms, by name (numbered pools merged).
  busy.otherByName = {};
  Object.keys(other).filter((k) => other[k] >= 50).forEach((k) => { busy.otherByName[k] = Math.round(other[k]); });
  return busy;
}

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const cases = CASES.filter((c) => !only || only.some((o) => c.id.includes(o)));
  const { port, proc } = await startServer();
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const results = [];
  const repeats = Math.max(1, +process.env.REPEATS || 1);
  try {
    for (let k = 0; k < repeats; k++) for (const c of cases) {
      const r = await runCase(browser, port, c);
      r.run = k + 1;
      results.push(r);
      console.log(`${(c.id + ' #' + r.run).padEnd(32)} frames p50/p95/max ${r.frames.median}/${r.frames.p95}/${r.frames.max} >50:${r.frames.over50}  loaf ${r.loaf.ms} (script ${r.loaf.script}, render ${r.loaf.render})  threads ${JSON.stringify(r.threads)}  paints ${r.counts.paints} copies ${r.counts.chartCopies}/${r.counts.overlayCopies} ${r.counts.copiedMpx} Mpx  canvas ${r.canvasMpx} Mpx x${r.chartScale}${r.cpuProfile ? '  cpu ' + JSON.stringify(r.cpuProfile) : ''}`);
    }
  } finally {
    await browser.close();
    proc.kill();
  }
  if (process.env.OUT) {
    fs.writeFileSync(path.join(ROOT, process.env.OUT), JSON.stringify({
      commit: git(['rev-parse', '--short', 'HEAD']), dirty: (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length,
      browser: browser.version(), environment: 'headless Chromium, SwiftShader canvas, 4-core VM; emulated, not a physical device', results,
    }, null, 1));
  }
})().catch((e) => { console.error(e); process.exit(1); });
