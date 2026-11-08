/* track-baseline.cjs — Track Mode performance baseline (reports/track-mode-performance-baseline.md).
   ═══════════════════════════════════════════════════════════════════════════
   Runs a matrix of Stitch Tracker scenarios in headless Chromium and writes
   one JSON file of results, with the build, browser and host it ran on.

     node tests/perf/track-baseline.cjs                     every scenario
     ONLY=open-,mark-large node tests/perf/track-baseline.cjs   ids containing any of these
     PROFILE=1 ...                                          also attribute long frames with a CPU profile
     REPEATS=3 ...                                          run each scenario 3 times
     OUT=reports/perf-results/x.json ...                    where to write (default: by date)
     CHROME=/path/to/chrome ...                             browser binary (default: Playwright's)
     CDN=online ...                                         load React/pako from cdnjs instead of node_modules

   It starts its own server on a free port from this checkout, so the build
   measured is the working tree (the version, commit and dirty state are
   recorded). Service workers are blocked, as in every Playwright config here,
   so no cached build can stand in for it. Each scenario runs in a fresh
   browser context: its IndexedDB and localStorage are created for the run and
   thrown away with it. Nothing touches a real profile.

   What is measured, and how to read it, is in trackProbes.js. In short: the
   counts (React commits, chart paints, storage operations, saves) are
   deterministic; the times are emulated. "phone" is Pixel 5 emulation at 4x
   CPU throttle and "desktop" 1440 x 900 at no throttle, both drawing canvases
   in software (SwiftShader). Neither is a physical-device measurement. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { chromium, devices } = require('@playwright/test');
const { fixtureFor, makeTrackerFixture, SIZES, fixturePalette } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installTrackProbes, readTrackProbes, summarise, dist } = require('../_helpers/trackProbes');

const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── Environment ─────────────────────────────────────────────────────────── */

function freePort() {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function startServer() {
  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/version.js`); return { port, proc }; } catch (_) { await sleep(100); }
  }
  throw new Error('server did not start');
}
function git(args) { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return null; } }
function buildInfo() {
  const version = (/APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8')) || [])[1];
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  return {
    appVersion: version,
    commit: git(['rev-parse', 'HEAD']),
    dirtyFiles: (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length,
    swCache: (/CACHE_NAME = '([^']+)'/.exec(sw) || [])[1],
    swBuildId: (/BUILD_ID = '([^']+)'/.exec(sw) || /BUILD_ID = "([^"]+)"/.exec(sw) || [])[1] || null,
    served: 'working tree via serve.js (not dist/); service workers blocked',
  };
}

const CDN_LOCAL = {
  'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'pako.min.js': 'node_modules/pako/dist/pako.min.js',
};
async function routeCdn(context) {
  if (process.env.CDN === 'online') return;
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const url = route.request().url();
    const name = Object.keys(CDN_LOCAL).find((k) => url.endsWith('/' + k));
    if (!name) return route.abort();
    return route.fulfill({ path: path.join(ROOT, CDN_LOCAL[name]), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
}

/* Source line for a LoAF script position (character offset into the file). */
const lineCache = new Map();
function lineOf(url, ch) {
  if (!url || ch == null || ch < 0) return '?';
  const file = path.join(ROOT, url.split('?')[0]);
  if (!lineCache.has(file)) { try { lineCache.set(file, fs.readFileSync(file, 'utf8')); } catch (_) { lineCache.set(file, null); } }
  const src = lineCache.get(file);
  if (!src) return '?';
  let n = 1; for (let i = 0; i < ch && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

const PROFILES = {
  phone: { device: devices['Pixel 5'], throttle: 4, input: 'touch' },
  desktop: { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, throttle: 1, input: 'mouse' },
};

/* ── Page helpers ────────────────────────────────────────────────────────── */

function fixtureFile(spec) {
  const f = spec.fixture;
  return f.custom ? makeTrackerFixture(f.custom) : fixtureFor(f.size, { doneFraction: f.done, mixed: !!f.mixed });
}
function fixtureInput(spec) {
  const project = JSON.parse(fs.readFileSync(fixtureFile(spec), 'utf8'));
  Object.assign(project, { savedZoom: spec.zoom || 1, savedScroll: { left: 1500, top: 1500 } }, spec.fields || {});
  return { name: 'baseline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) };
}

async function seedHistory(page, n) {
  await page.evaluate(async (n) => {
    const A = window.ThreadAccounting, pid = 'proj_history_seed';
    const est = A.snapshot({ pattern: [{ id: '310', type: 'solid' }], done: [1], fabricCt: 14 }, {})['d:0'];
    const ledger = A.empty();
    A.baseline(ledger, pid, {}, null, new Date().toISOString());
    const ops = [];
    for (let i = 0; i < n; i++) ops.push({ projectId: pid, unit: 'd:' + i, seq: 1, kind: 'mark', estimate: est, enabled: false });
    A.apply(ledger, {}, ops, new Date().toISOString(), {});
    const db = await openManagerDB();
    try {
      await new Promise((res, rej) => { const tx = db.transaction('manager_state', 'readwrite'); tx.objectStore('manager_state').put(ledger, A.KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } finally { db.close(); }
  }, n);
}

/* A collection of other projects, saved through ProjectStorage so their
   metadata rows and listings are what the app builds. */
async function seedCollection(page, n, side) {
  return page.evaluate(async ([n, side, ids]) => {
    const total = side * side, now = Date.now();
    let saved = 0;
    for (let k = 0; k < n; k++) {
      const pattern = new Array(total), done = new Array(total);
      for (let i = 0; i < total; i++) { pattern[i] = { id: ids[(i + k) % ids.length], type: 'solid' }; done[i] = (i * 7 + k) % 10 < 3 ? 1 : 0; }
      const t = new Date(now - (n - k) * 3600e3).toISOString();
      await ProjectStorage.save({
        version: 11, id: 'proj_seed_' + k, page: 'tracker', name: 'Seed ' + k, createdAt: t, updatedAt: t,
        settings: { sW: side, sH: side, fabricCt: 14 }, pattern, done, bsLines: [], halfStitches: [], halfDone: [],
        partialStitches: [], parkMarkers: [], sessions: [{ id: 's' + k, startTime: t, endTime: t, durationMinutes: 30, stitchesCompleted: 100 }], threadOwned: {},
      });
      saved++;
    }
    return saved;
  }, [n, side, fixturePalette(30).map((c) => c.id)]);
}

/** Open the tracker on the scenario's fixture and wait for the import's own
 *  save and the load-time work to finish. */
async function openFixture(page, spec) {
  await page.goto(spec.base + '/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  if (spec.history) await seedHistory(page, spec.history);
  if (spec.collection) await seedCollection(page, spec.collection.n, spec.collection.side);
  await page.locator('input[type="file"]').first().setInputFiles(fixtureInput(spec));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 180000 });
  await waitSaved(page, 180000);
  await sleep(spec.settleMs || 2000);
}
async function waitSaved(page, timeout) {
  await page.waitForFunction(() => {
    const b = document.querySelector('.tb-proj-badge-saved');
    return !!b && !/tb-proj-badge-saved--(saving|pending)/.test(b.className) && /^Saved\b/.test(b.textContent.trim());
  }, null, { timeout });
  await sleep(300);
}

async function chartBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.tracker-chart-scroll');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
}
/** Remember the stored project's marks, so doneChanged() can count the
 *  stitches a run changed (taps on a part-done chart mark and unmark). */
const doneSnapshot = (page) => page.evaluate(async () => {
  const id = window.ProjectStorage && ProjectStorage.getActiveProjectId();
  const p = id && await ProjectStorage.get(id);
  window.__done0 = p && p.done ? Uint8Array.from(p.done, (v) => (v ? 1 : 0)) : null;
  return window.__done0 ? window.__done0.reduce((n, v) => n + v, 0) : null;
});
/** Stitches whose mark differs from the snapshot in the stored project, after
 *  the tracker writes everything (only ever after a measured window closes). */
const doneChanged = (page) => page.evaluate(async () => {
  if (typeof window.__flushProjectToIDB === 'function') { try { await window.__flushProjectToIDB(); } catch (_) {} }
  const id = window.ProjectStorage && ProjectStorage.getActiveProjectId();
  const p = id && await ProjectStorage.get(id);
  const a = window.__done0;
  if (!p || !p.done || !a) return null;
  let n = 0; for (let i = 0; i < a.length; i++) if ((p.done[i] ? 1 : 0) !== a[i]) n++;
  return n;
});
/** Main-thread time for a fixed amount of script, to confirm the CPU throttle
 *  is in force (about 4x the desktop figure on the phone profile). */
const cpuProbe = (page) => page.evaluate(() => { const t = performance.now(); let x = 0; for (let i = 0; i < 3e6; i++) x += Math.sqrt(i); return Math.round(performance.now() - t + (x < 0 ? 1 : 0)); });

async function tapAt(ctx, x, y) {
  if (ctx.input === 'touch') {
    await ctx.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
    await ctx.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await ctx.page.mouse.click(x, y);
  }
}
/** The i-th tap position: spread over the middle of the visible chart so no
 *  two taps of one run land on the same stitch. */
function tapPoint(box, i) {
  const fx = 0.2 + 0.6 * (((i * 37) % 97) / 97), fy = 0.2 + 0.6 * (((i * 53) % 89) / 89);
  return [Math.round(box.x + box.w * fx), Math.round(box.y + box.h * fy)];
}
/** Client points over visible stitches of palette colour `ci` (cell i has
 *  colour i % nColours in every fixture), for views where only the
 *  highlighted colour can be marked. Same geometry as panProbes.cellAt. */
const colourPoints = (page, ci, nColours, count) => page.evaluate(([ci, nC, count]) => {
  const cv = document.querySelector('.tracker-chart-layer canvas'), layer = document.querySelector('.tracker-chart-layer');
  const sc = document.querySelector('.tracker-chart-scroll').getBoundingClientRect();
  const sW = +/(\d+) columns/.exec(document.getElementById('tracker-chart-summary').textContent)[1];
  const scs = (parseFloat(layer.style.width) - 2) / sW;
  const r = cv.getBoundingClientRect(), k = r.width / parseFloat(cv.style.width);
  const toCell = (px, py) => [Math.floor((px - r.left) / k / scs + parseFloat(cv.style.left) / scs), Math.floor((py - r.top) / k / scs + parseFloat(cv.style.top) / scs)];
  const [x0, y0] = toCell(sc.left + sc.width * 0.25, sc.top + sc.height * 0.25), [x1, y1] = toCell(sc.left + sc.width * 0.75, sc.top + sc.height * 0.75);
  const out = [];
  for (let y = y0; y <= y1 && out.length < count; y += 2) for (let x = x0; x <= x1 && out.length < count; x++) {
    if ((y * sW + x) % nC !== ci || out.some((p) => Math.abs(p.cy - y) < 2)) continue;
    out.push({ cy: y, x: Math.round(r.left + ((x + 0.5) * scs - parseFloat(cv.style.left)) * k), y: Math.round(r.top + ((y + 0.5) * scs - parseFloat(cv.style.top)) * k) });
  }
  return out.map((p) => [p.x, p.y]);
}, [ci, nColours, count]);
const scrollFrames = (page, dx, dy, frames) => page.evaluate(([dx, dy, n]) => new Promise((done) => {
  const sc = document.querySelector('.tracker-chart-scroll');
  let i = 0;
  (function step() { if (i++ >= n) { requestAnimationFrame(() => done([sc.scrollLeft, sc.scrollTop])); return; } sc.scrollLeft += dx; sc.scrollTop += dy; requestAnimationFrame(step); })();
}), [dx, dy, frames]);

async function heap(cdp, gc) {
  try {
    if (gc) await cdp.send('HeapProfiler.collectGarbage');
    const h = await cdp.send('Runtime.getHeapUsage');
    return Math.round(h.usedSize / 1048576 * 10) / 10;
  } catch (_) { return null; }
}

/* ── CPU profile attribution ─────────────────────────────────────────────── */

async function beginProfile(ctx) {
  if (!process.env.PROFILE) return;
  await ctx.cdp.send('Profiler.enable');
  await ctx.cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await ctx.cdp.send('Profiler.start');
}
// Align the profile's clock with page time: a 30 ms busy loop at a known
// performance.now(), found again in the samples by its function name.
async function anchorProfile(ctx) {
  if (!process.env.PROFILE) return;
  ctx.anchorT = await ctx.page.evaluate(() => window.__tpAnchor(30));
}
async function startProfile(ctx) { await beginProfile(ctx); await anchorProfile(ctx); }
const APP_URL = /127\.0\.0\.1:\d+\/(?!.*react)/;
async function stopProfile(ctx, loafs) {
  if (!process.env.PROFILE) return null;
  const { profile } = await ctx.cdp.send('Profiler.stop');
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const times = []; let t = profile.startTime;
  for (const d of profile.timeDeltas) { t += d; times.push(t / 1000); }
  const anchorIdx = profile.samples.findIndex((s) => nodes.get(s).callFrame.functionName === '__tpAnchor');
  if (anchorIdx < 0) return { error: 'anchor not found' };
  const offset = times[anchorIdx] - ctx.anchorT;   // profile ms - page ms
  const stackOf = (id) => {
    const out = [];
    for (let n = nodes.get(id); n; n = nodes.get(parent.get(n.id))) {
      const f = n.callFrame;
      if (f.url && APP_URL.test(f.url) && f.functionName) out.push(f.functionName + ' (' + f.url.replace(/^.*\/\/[^/]+\//, '') + ':' + (f.lineNumber + 1) + ')');
    }
    return out;   // innermost first
  };
  const dt = (i) => (i + 1 < times.length ? times[i + 1] - times[i] : 0);
  const longest = loafs.slice().sort((a, b) => b.d - a.d).slice(0, 6);
  const perFrame = longest.map((f) => {
    const a = f.t + offset, b = f.t + f.d + offset;
    const self = new Map(), chains = new Map(); let total = 0;
    for (let i = 0; i < profile.samples.length; i++) {
      if (times[i] < a || times[i] > b) continue;
      const node = nodes.get(profile.samples[i]);
      const name = node.callFrame.functionName || '(' + (node.callFrame.url ? 'anonymous' : node.callFrame.functionName || 'native') + ')';
      const ms = dt(i); total += ms;
      self.set(name, (self.get(name) || 0) + ms);
      const st = stackOf(profile.samples[i]);
      if (st.length) { const k = st.slice(0, 3).reverse().join(' > '); chains.set(k, (chains.get(k) || 0) + ms); }
    }
    const top = (m, n) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, n).map(([k, v]) => [k, Math.round(v)]);
    return { t: Math.round(f.t), d: Math.round(f.d), sampledMs: Math.round(total), selfTop: top(self, 6), appCallers: top(chains, 5) };
  });
  return { offsetMs: Math.round(offset), frames: perFrame };
}

/* ── Scenarios ───────────────────────────────────────────────────────────── */

async function newCtx(browser, spec) {
  const prof = PROFILES[spec.profile || 'phone'];
  const context = await browser.newContext({ ...prof.device, serviceWorkers: 'block' });
  await routeCdn(context);
  const page = await context.newPage();
  await suppressOnboarding(page);
  if (spec.storage) await page.addInitScript((kv) => { for (const k of Object.keys(kv)) localStorage.setItem(k, kv[k]); }, spec.storage);
  await installTrackProbes(page);
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, input: prof.input, throttle: prof.throttle };
}
const throttle = (ctx, rate) => ctx.cdp.send('Emulation.setCPUThrottlingRate', { rate });

/** Opening a project that has not changed since its last save: reload the
 *  tracker on it and watch the first 10 s. */
async function runOpen(ctx, spec) {
  await openFixture(ctx.page, spec);
  await throttle(ctx, ctx.throttle);
  await beginProfile(ctx);
  const t0 = Date.now();
  await ctx.page.reload({ waitUntil: 'load', timeout: 180000 });
  await anchorProfile(ctx);
  await ctx.page.waitForSelector('.tracker-chart-layer canvas', { timeout: 180000 });
  const sinceNav = Date.now() - t0;
  await sleep(Math.max(0, 10000 - sinceNav));
  const r = await readTrackProbes(ctx.page, 0);
  const prof = await stopProfile(ctx, r.loafs.filter((f) => f.t <= 10000));
  const nav = await ctx.page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; });
  const s = summarise(r, { lineOf, t0: 0, t1: 10000 });
  // The chart may not have painted inside the window: keep waiting (up to a
  // minute) so the report can say when it did, and what ran until then.
  let firstPaint = r.fullPaints.length ? r.fullPaints[0] : null, untilPaint = null;
  if (firstPaint == null) {
    try {
      await ctx.page.waitForFunction(() => window.__tp.fullPaints.length > 0, null, { timeout: 60000, polling: 250 });
      const r2 = await readTrackProbes(ctx.page, 0);
      firstPaint = r2.fullPaints[0];
      const lt = r2.longTasks.filter((l) => l.t < firstPaint);
      untilPaint = { longTasks: lt.length, blockedMs: Math.round(lt.reduce((a, l) => a + l.d, 0)), saveStartedMs: (r2.spans.find((x) => x.name === 'ProjectStorage.save') || {}).t || null };
    } catch (_) { /* still not painted after a minute: reported as null */ }
  }
  return {
    ...s,
    nav,
    firstFullPaintMs: firstPaint == null ? null : Math.round(firstPaint),
    untilFirstPaint: untilPaint,
    fullSavesStarted: (s.spans['ProjectStorage.save'] || { n: 0 }).n,
    heapMb: await heap(ctx.cdp, false), heapAfterGcMb: await heap(ctx.cdp, true),
    cpuProfile: prof,
    cpuProbeMs: await cpuProbe(ctx.page),
  };
}

/** Taps at a fixed spacing, optionally panning between groups of them. */
async function runMarking(ctx, spec) {
  await openFixture(ctx.page, spec);
  if (spec.setup) await spec.setup(ctx);
  const box = await chartBox(ctx.page);
  await doneSnapshot(ctx.page);
  const heap0 = await heap(ctx.cdp, true);
  await throttle(ctx, ctx.throttle);
  await startProfile(ctx);
  const t0 = await ctx.page.evaluate(() => performance.now());
  const plan = spec.plan || { taps: 12, spacingMs: 1000 };
  let tap = 0;
  const groups = plan.groups || 1;
  for (let g = 0; g < groups; g++) {
    if (plan.panFrames) await scrollFrames(ctx.page, plan.pan[0] * (g % 2 ? -1 : 1), plan.pan[1], plan.panFrames);
    const pts = spec.focusColour != null ? await colourPoints(ctx.page, spec.focusColour, SIZES[spec.fixture.size].nColours, plan.taps) : null;
    for (let i = 0; i < plan.taps; i++, tap++) {
      const [x, y] = pts && pts[i] ? pts[i] : tapPoint(box, tap);
      await tapAt(ctx, x, y);
      await sleep(plan.spacingMs);
    }
  }
  if (plan.panFrames && plan.panAfter) await scrollFrames(ctx.page, plan.pan[0], plan.pan[1], plan.panFrames);
  await sleep(plan.tailMs || 2000);
  const t1 = await ctx.page.evaluate(() => performance.now());
  const r = await readTrackProbes(ctx.page, t0);
  const prof = await stopProfile(ctx, r.loafs);
  const cpuProbeMs = await cpuProbe(ctx.page);
  await throttle(ctx, 1);
  const s = summarise(r, { lineOf, t0, t1 });
  return {
    ...s, taps: tap, windowMs: Math.round(t1 - t0), cpuProbeMs,
    marked: await doneChanged(ctx.page),
    perTap: { commits: +(s.react.commits / tap).toFixed(2), fullPaints: +(s.paints.full / tap).toFixed(2), partialPaints: +(s.paints.partial / tap).toFixed(2) },
    chartCopies: r.chartCopies, heapBeforeMb: heap0, heapAfterGcMb: await heap(ctx.cdp, true),
    cpuProfile: prof,
  };
}

/** Zoom steps through the detail-tier thresholds and back, by keyboard. */
async function runZoom(ctx, spec) {
  await openFixture(ctx.page, spec);
  await ctx.page.mouse.move(5, 5);
  await throttle(ctx, ctx.throttle);
  await startProfile(ctx);
  const t0 = await ctx.page.evaluate(() => performance.now());
  const zooms = [];
  const zoomNow = () => ctx.page.evaluate(() => { const m = /(\d+)% zoom/.exec((document.getElementById('tracker-chart-summary') || {}).textContent || ''); return m ? +m[1] : null; });
  zooms.push(await zoomNow());
  for (const key of spec.keys) { await ctx.page.keyboard.press(key); await sleep(900); zooms.push(await zoomNow()); }
  await sleep(1000);
  const t1 = await ctx.page.evaluate(() => performance.now());
  const r = await readTrackProbes(ctx.page, t0);
  const prof = await stopProfile(ctx, r.loafs);
  await throttle(ctx, 1);
  return { ...summarise(r, { lineOf, t0, t1 }), zooms, steps: spec.keys.length, cpuProfile: prof };
}

/** One automatic folder export (what a save triggers at most every 30 s
 *  with a sync folder connected), through a stand-in folder handle. */
async function runSyncExport(ctx, spec) {
  await openFixture(ctx.page, spec);
  await throttle(ctx, ctx.throttle);
  await startProfile(ctx);
  const t0 = await ctx.page.evaluate(() => performance.now());
  const out = await ctx.page.evaluate(async () => {
    let bytes = 0;
    const fake = {
      name: 'baseline', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getFileHandle: async () => ({ createWritable: async () => ({ write: async (b) => { bytes = b.byteLength || b.size || b.length || 0; }, close: async () => {} }) }),
    };
    const t = performance.now();
    await window.SyncEngine.exportToFolder(fake);
    return { ms: Math.round(performance.now() - t), bytes };
  });
  await sleep(1500);
  const t1 = await ctx.page.evaluate(() => performance.now());
  const r = await readTrackProbes(ctx.page, t0);
  const prof = await stopProfile(ctx, r.loafs);
  await throttle(ctx, 1);
  return { ...summarise(r, { lineOf, t0, t1 }), exportMs: out.ms, fileBytes: out.bytes, cpuProfile: prof };
}

/** Two tabs on one project: tab A marks, tab B is watched. */
async function runCrossTab(ctx, spec) {
  await openFixture(ctx.page, spec);
  const pageB = await ctx.context.newPage();
  await installTrackProbes(pageB);
  await pageB.goto(spec.base + '/stitch.html', { waitUntil: 'load', timeout: 120000 });
  await pageB.waitForSelector('.tracker-chart-layer canvas', { timeout: 180000 });
  await sleep(8000);
  const cdpB = await ctx.context.newCDPSession(pageB);
  await throttle(ctx, ctx.throttle);
  await cdpB.send('Emulation.setCPUThrottlingRate', { rate: ctx.throttle });
  await ctx.page.bringToFront();
  const box = await chartBox(ctx.page);
  await doneSnapshot(ctx.page);
  const tA = await ctx.page.evaluate(() => performance.now());
  const tB = await pageB.evaluate(() => performance.now());
  for (let i = 0; i < spec.plan.taps; i++) { const [x, y] = tapPoint(box, i); await tapAt(ctx, x, y); await sleep(spec.plan.spacingMs); }
  await sleep(spec.plan.tailMs || 4000);
  const rA = await readTrackProbes(ctx.page, tA), rB = await readTrackProbes(pageB, tB);
  // A hidden tab hands its marks over when it pauses, hides or leaves (see
  // the autosave and progress-record notes in tracker-app.js).
  await throttle(ctx, 1);
  return { tabA: summarise(rA, { lineOf, t0: tA }), tabB: summarise(rB, { lineOf, t0: tB }), marked: await doneChanged(ctx.page) };
}

/* ── Matrix ─────────────────────────────────────────────────────────────── */

const L50 = { size: 'large', done: 0.5 }, L90 = { size: 'large', done: 0.9 }, H50 = { size: 'huge', done: 0.5 };
const H90 = { size: 'huge', done: 0.9 }, S50 = { size: 'small', done: 0.5 }, LM50 = { size: 'large', done: 0.5, mixed: true };
const STEADY = { taps: 12, spacingMs: 1000, tailMs: 2500 };
const RAPID = { taps: 20, spacingMs: 400, tailMs: 3000 };
const PMP = { groups: 4, taps: 3, spacingMs: 600, panFrames: 60, pan: [18, 10], panAfter: true, tailMs: 2500 };
const OUTLINE = (size) => ({ workingContext: { view: 'highlight', colour: fixturePalette(SIZES[size].nColours)[3].id, highlight: 'outline' }, focusBlock: { bx: 3, by: 3 } });

const SCENARIOS = [
  // First 10 s after opening an unchanged project.
  { id: 'open-small-50', run: runOpen, fixture: S50 },
  { id: 'open-large-50', run: runOpen, fixture: L50 },
  { id: 'open-large-90', run: runOpen, fixture: L90 },
  { id: 'open-huge-50', run: runOpen, fixture: H50 },
  { id: 'open-large-mixed-50', run: runOpen, fixture: LM50 },
  { id: 'open-large-50-history', run: runOpen, fixture: L50, history: 50000 },
  { id: 'open-large-50-collection', run: runOpen, fixture: L50, collection: { n: 150, side: 120 } },
  { id: 'open-huge-50-desktop', run: runOpen, fixture: H50, profile: 'desktop' },
  { id: 'open-large-50-desktop', run: runOpen, fixture: L50, profile: 'desktop' },
  // Steady marking, normal (100%) and low (30%) zoom.
  { id: 'mark-small-50', run: runMarking, fixture: S50, plan: STEADY },
  { id: 'mark-large-50', run: runMarking, fixture: L50, plan: STEADY },
  { id: 'mark-large-90', run: runMarking, fixture: L90, plan: STEADY },
  { id: 'mark-huge-50', run: runMarking, fixture: H50, plan: STEADY },
  { id: 'mark-huge-90', run: runMarking, fixture: H90, plan: STEADY },
  { id: 'mark-large-mixed-50', run: runMarking, fixture: LM50, plan: STEADY },
  { id: 'mark-large-50-history', run: runMarking, fixture: L50, history: 50000, plan: STEADY },
  { id: 'mark-large-50-collection', run: runMarking, fixture: L50, collection: { n: 150, side: 120 }, plan: STEADY },
  { id: 'mark-large-50-lowzoom', run: runMarking, fixture: L50, zoom: 0.3, plan: STEADY },
  { id: 'mark-huge-50-lowzoom', run: runMarking, fixture: H50, zoom: 0.3, plan: STEADY },
  { id: 'mark-huge-50-desktop', run: runMarking, fixture: H50, profile: 'desktop', plan: STEADY },
  { id: 'rapid-huge-50', run: runMarking, fixture: H50, plan: RAPID },
  { id: 'rapid-large-90', run: runMarking, fixture: L90, plan: RAPID },
  // Pan, mark, pan.
  { id: 'pmp-large-50', run: runMarking, fixture: L50, plan: PMP },
  { id: 'pmp-huge-50-lowzoom', run: runMarking, fixture: H50, zoom: 0.3, plan: PMP },
  { id: 'pmp-large-mixed-50', run: runMarking, fixture: LM50, plan: PMP },
  { id: 'pmp-huge-90-desktop', run: runMarking, fixture: H90, profile: 'desktop', plan: PMP },
  // Zoom across the detail tiers: 8 steps up from 20% (to 100%) and back.
  { id: 'zoom-large-50', run: runZoom, fixture: L50, zoom: 0.2, keys: ['=', '=', '=', '=', '=', '=', '=', '=', '-', '-', '-', '-', '-', '-', '-', '-'] },
  { id: 'zoom-huge-50', run: runZoom, fixture: H50, zoom: 0.2, keys: ['=', '=', '=', '=', '=', '=', '=', '=', '-', '-', '-', '-', '-', '-', '-', '-'] },
  // Work area, and overlays (outline highlight, counting aids, Spotlight).
  { id: 'pmp-huge-50-workarea', run: runMarking, fixture: H50, plan: PMP,
    fields: { blockW: 10, blockH: 10, workArea: { active: true, x0: 200, y0: 300, x1: 300, y1: 400, bw: 10, bh: 10, setAt: Date.now() } } },
  // In Highlight view only the highlighted colour marks: tap stitches of it.
  { id: 'pmp-large-50-overlays', run: runMarking, fixture: L50, plan: PMP, fields: OUTLINE('large'), focusColour: 3, storage: { cs_countAids: '1', cs_focusEnabled: '1' } },
  // Sync.
  { id: 'sync-export-huge-50', run: runSyncExport, fixture: H50 },
  { id: 'sync-export-large-50-collection', run: runSyncExport, fixture: L50, collection: { n: 150, side: 120 } },
  { id: 'sync-export-huge-50-desktop', run: runSyncExport, fixture: H50, profile: 'desktop' },
  { id: 'sync-export-large-50-collection-desktop', run: runSyncExport, fixture: L50, collection: { n: 150, side: 120 }, profile: 'desktop' },
  { id: 'crosstab-large-50', run: runCrossTab, fixture: L50, plan: { taps: 8, spacingMs: 1000, tailMs: 5000 } },
];

/* ── Main ───────────────────────────────────────────────────────────────── */

(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const list = SCENARIOS.filter((s) => !only.length || only.some((o) => s.id.includes(o)));
  const repeats = +process.env.REPEATS || 1;
  const server = await startServer();
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--enable-precise-memory-info'] });
  const probe = await browser.newPage();
  const gpu = await probe.evaluate(() => {
    try { const gl = document.createElement('canvas').getContext('webgl'); const d = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(d.UNMASKED_RENDERER_WEBGL); } catch (e) { return 'unavailable: ' + e.message; }
  });
  await probe.close();
  const result = {
    kind: 'track-mode-baseline', startedAt: new Date().toISOString(),
    build: buildInfo(),
    environment: {
      browser: 'Chromium ' + browser.version() + ' (headless)', renderer: gpu,
      host: `${os.type()} ${os.release()}, ${os.cpus().length} x ${os.cpus()[0] && os.cpus()[0].model}, ${Math.round(os.totalmem() / 1073741824)} GB`,
      node: process.version, profiling: !!process.env.PROFILE,
      profiles: { phone: 'Pixel 5 emulation (393 x 851, DPR 2.75, touch), 4x CPU throttle', desktop: '1440 x 900, DPR 1, no throttle' },
      caveat: 'Emulated. Canvases are drawn in software; CPU throttling scales script, not GPU or raster. Not a physical-device measurement.',
    },
    scenarios: {},
  };
  const out = process.env.OUT || path.join(ROOT, 'reports', 'perf-results', `track-baseline-${result.startedAt.slice(0, 10)}${process.env.PROFILE ? '-profiled' : ''}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    for (const spec of list) {
      for (let rep = 0; rep < repeats; rep++) {
        const t = Date.now();
        let ctx;
        try {
          ctx = await newCtx(browser, spec);
          const res = await spec.run(ctx, { ...spec, base });
          const entry = { profile: spec.profile || 'phone', fixture: spec.fixture, zoom: spec.zoom || 1, history: spec.history || 0, collection: spec.collection || null, wallS: Math.round((Date.now() - t) / 1000), ...res };
          (result.scenarios[spec.id] = result.scenarios[spec.id] || []).push(entry);
          const i = res.interactions || (res.tabA && res.tabA.interactions) || {};
          console.log(`${spec.id} #${rep + 1}: ${entry.wallS}s  INP p50/p95/max ${i.p50}/${i.p95}/${i.max} ms  longest task ${(res.longTasks || res.tabB.longTasks).longestMs} ms  TBT ${(res.longTasks || res.tabB.longTasks).tbtMs} ms  commits ${(res.react || res.tabA.react).commits}  paints ${JSON.stringify(res.paints || res.tabA.paints)}`);
        } catch (e) {
          console.log(`${spec.id} #${rep + 1}: FAILED ${e.message.split('\n')[0]}`);
          (result.scenarios[spec.id] = result.scenarios[spec.id] || []).push({ error: e.message.split('\n')[0] });
        } finally {
          if (ctx) await ctx.context.close().catch(() => {});
        }
        fs.writeFileSync(out, JSON.stringify(result, null, 1));
      }
    }
  } finally {
    await browser.close();
    server.proc.kill();
  }
  console.log('wrote ' + path.relative(ROOT, out));
})().catch((e) => { console.error(e); process.exit(1); });

module.exports = { dist };
