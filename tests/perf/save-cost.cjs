/* save-cost.cjs — what a Stitch Tracker full save, a thread-usage commit and a
   sync folder export cost on the main thread, split by where the time goes.
   ═══════════════════════════════════════════════════════════════════════════
   reports/track-save-sync-cost.md is built from this. It opens a generated
   fixture in the Tracker (tests/_helpers/trackerFixture.js), lets the import
   settle, then times one operation at a time with a 0.5 ms CPU profile and
   reduces the samples to self time per app function, and the probes'
   (tests/_helpers/trackProbes.js) IndexedDB and long-task counters.

     node tests/perf/save-cost.cjs                       every case
     ONLY=save-,sync- node tests/perf/save-cost.cjs      ids containing any of these
     REPEATS=3 ...                                       repeat each case
     OUT=reports/track-mode-baseline/x.json ...          where to write

   Cases
     save-mark-*      one stitch marked, then __flushProjectToIDB (the tab-hidden,
                      sync and backup flush; the autosave does the same work
                      without the legacy auto_save copy)
     save-meta-*      a project rename only (no chart change), then the flush
     usage-*          one thread-usage batch committed (StashBridge.applyConsumptionEvents)
                      over a ledger of N events, most from other projects
     sync-*           SyncEngine.exportToFolder through a stand-in folder handle,
                      after one project changed (full and incremental)

   Emulated, like the Track Mode baseline: headless Chromium, canvases in
   software, "phone" is Pixel 5 emulation at 4x CPU throttle. Not a
   physical-device measurement. Counts (records read and written, bytes put)
   do not depend on the machine. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { chromium, devices } = require('@playwright/test');
const { fixtureFor, fixturePalette } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installTrackProbes, readTrackProbes } = require('../_helpers/trackProbes');

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
  phone: { device: devices['Pixel 5'], throttle: 4 },
  desktop: { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, throttle: 1 },
};

async function newCtx(browser, spec) {
  const prof = PROFILES[spec.profile || 'desktop'];
  const context = await browser.newContext({ ...prof.device, serviceWorkers: 'block' });
  await routeCdn(context);
  const page = await context.newPage();
  await suppressOnboarding(page);
  await installTrackProbes(page);
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, throttle: prof.throttle };
}

async function waitSaved(page, timeout) {
  await page.waitForFunction(() => {
    const b = document.querySelector('.tb-proj-badge-saved');
    return !!b && !/tb-proj-badge-saved--(saving|pending)/.test(b.className) && /^Saved\b/.test(b.textContent.trim());
  }, null, { timeout });
  await sleep(300);
}

async function seedCollection(page, n, side) {
  return page.evaluate(async ([n, side, ids]) => {
    const total = side * side, now = Date.now();
    for (let k = 0; k < n; k++) {
      const pattern = new Array(total), done = new Array(total);
      for (let i = 0; i < total; i++) { pattern[i] = { id: ids[(i + k) % ids.length], type: 'solid' }; done[i] = (i * 7 + k) % 10 < 3 ? 1 : 0; }
      const t = new Date(now - (n - k) * 3600e3).toISOString();
      await ProjectStorage.save({
        version: 11, id: 'proj_seed_' + k, page: 'tracker', name: 'Seed ' + k, createdAt: t, updatedAt: t,
        settings: { sW: side, sH: side, fabricCt: 14 }, pattern, done, bsLines: [], halfStitches: [], halfDone: [],
        partialStitches: [], parkMarkers: [], statsSessions: [], threadOwned: {},
      }, { preserveUpdatedAt: true });
    }
    return n;
  }, [n, side, fixturePalette(30).map((c) => c.id)]);
}

/* A thread-usage ledger of n events, spread over `projects` other projects. */
async function seedLedger(page, n, projects) {
  return page.evaluate(async ([n, projects]) => {
    const A = window.ThreadAccounting;
    const est = A.snapshot({ pattern: [{ id: '310', type: 'solid' }], done: [1], fabricCt: 14 }, {})['d:0'];
    const ledger = A.empty();
    const at = new Date().toISOString();
    for (let p = 0; p < projects; p++) A.baseline(ledger, 'proj_hist_' + p, {}, null, at);
    const ops = [];
    for (let i = 0; i < n; i++) ops.push({ projectId: 'proj_hist_' + (i % projects), unit: 'd:' + i, seq: 1, kind: 'mark', estimate: est, enabled: false });
    A.apply(ledger, {}, ops, at, {});
    // Stored as the app stores a ledger it did not write itself (a restore or an
    // older build): one record under the legacy key, read through the app after.
    const db = await openManagerDB();
    try {
      await new Promise((res, rej) => { const tx = db.transaction('manager_state', 'readwrite'); tx.objectStore('manager_state').put(ledger, A.KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } finally { db.close(); }
    return Object.keys(ledger.events).length;
  }, [n, projects]);
}

async function openFixture(page, base, spec) {
  await page.goto(base + '/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  if (spec.ledger) await seedLedger(page, spec.ledger.n, spec.ledger.projects);
  if (spec.collection) await seedCollection(page, spec.collection.n, spec.collection.side);
  const project = JSON.parse(fs.readFileSync(fixtureFor(spec.size, { doneFraction: 0.5 }), 'utf8'));
  Object.assign(project, { savedZoom: 1, savedScroll: { left: 1500, top: 1500 } });
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'cost.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 180000 });
  await waitSaved(page, 180000);
  await sleep(2500);
}

/* ── CPU profile: self time per function, app files only named ─────────── */
async function profileStart(cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
}
async function profileStop(cdp) {
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i]);
    if (!n) continue;
    const cf = n.callFrame;
    const file = (cf.url || '').split('/').pop().split('?')[0];
    const key = cf.functionName === '(idle)' || cf.functionName === '(program)' || cf.functionName === '(garbage collector)'
      ? cf.functionName : (cf.functionName || '(anonymous)') + ' ' + (file ? file + ':' + (cf.lineNumber + 1) : '(native)');
    self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000);
  }
  const top = [...self.entries()].filter(([k]) => k !== '(idle)').sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, ms]) => [k, Math.round(ms * 10) / 10]);
  const busy = [...self.entries()].filter(([k]) => k !== '(idle)').reduce((a, [, ms]) => a + ms, 0);
  return { busyMs: Math.round(busy), top };
}

/* Probe counters since t0: IndexedDB ops by store, long tasks, spans. */
function counters(r) {
  const idb = {};
  for (const x of r.idb) { const k = x.op + ' ' + x.store; idb[k] = idb[k] || { n: 0, syncMs: 0 }; idb[k].n++; idb[k].syncMs = Math.round((idb[k].syncMs + x.ms) * 10) / 10; }
  const lt = r.longTasks;
  const spans = {};
  for (const s of r.spans) { spans[s.name] = spans[s.name] || { n: 0, syncMs: 0, settleMs: 0 }; spans[s.name].n++; spans[s.name].syncMs += s.sync || 0; spans[s.name].settleMs += s.settle || 0; }
  for (const k of Object.keys(spans)) { spans[k].syncMs = Math.round(spans[k].syncMs); spans[k].settleMs = Math.round(spans[k].settleMs); }
  return {
    idb, spans,
    longTasks: lt.length, longestTaskMs: Math.round(lt.reduce((a, l) => Math.max(a, l.d), 0)),
    tbtMs: Math.round(lt.reduce((a, l) => a + Math.max(0, l.d - 50), 0)),
    blockedMs: Math.round(lt.reduce((a, l) => a + l.d, 0)),
    projectsPut: r.idb.filter((x) => x.op === 'put' && x.store === 'projects').length,
  };
}

async function measure(ctx, fn, arg) {
  await ctx.cdp.send('Emulation.setCPUThrottlingRate', { rate: ctx.throttle });
  await profileStart(ctx.cdp);
  const t0 = await ctx.page.evaluate(() => performance.now());
  let out;
  try { out = await ctx.page.evaluate(fn, arg); }
  finally { /* keep the profile running until the tail settles */ }
  await sleep(1500);
  const prof = await profileStop(ctx.cdp);
  await ctx.cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const r = await readTrackProbes(ctx.page, t0);
  return { ...out, ...counters(r), cpu: prof };
}

/* ── Cases ─────────────────────────────────────────────────────────────── */

// One stitch marked in the open project, then the flush every sync, backup
// and tab-hidden save runs. Measured twice: the first save after opening, then
// a second (steady state: what every later save costs).
async function caseSaveMark(ctx, spec) {
  const box = await ctx.page.evaluate(() => { const r = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const one = async (k) => {
    await ctx.page.mouse.click(Math.round(box.x + box.w * (0.3 + 0.1 * k)), Math.round(box.y + box.h * (0.3 + 0.1 * k)));
    await sleep(800);
    return measure(ctx, async () => {
      const id = ProjectStorage.getActiveProjectId();
      const t = performance.now();
      const r = await window.__flushProjectToIDB();
      return { id, flushMs: Math.round(performance.now() - t), clean: !!(r && r.clean) };
    });
  };
  const first = await one(0);
  await sleep(1000);
  const second = await one(1);
  return { ...second, first };
}
// A rename only: the chart did not change. Saved as the Tracker saves
// ({ overlay: true }; builds without the overlay save ignore the option), with
// one project object throughout, as the Tracker keeps one pattern array.
// Twice, as above.
async function caseSaveMeta(ctx) {
  await ctx.page.evaluate(async () => { window.__metaProject = await ProjectStorage.get(ProjectStorage.getActiveProjectId()); });
  const one = () => measure(ctx, async () => {
    const p = window.__metaProject;
    const t = performance.now();
    p.name = 'Renamed ' + Date.now();
    p.navigationAt = Date.now();
    await ProjectStorage.save(p, { overlay: true });
    return { id: p.id, saveMs: Math.round(performance.now() - t) };
  });
  const first = await one();
  await sleep(1000);
  const second = await one();
  return { ...second, first };
}
// A flush with nothing changed since the last save (what a sync export or a
// backup runs right after the autosave that triggered it).
async function caseCleanFlush(ctx) {
  await ctx.page.evaluate(() => window.__flushProjectToIDB());
  await sleep(1000);
  return measure(ctx, async () => {
    const t = performance.now();
    await window.__flushProjectToIDB();
    return { flushMs: Math.round(performance.now() - t) };
  });
}
// One small usage batch committed against a long ledger.
async function caseUsage(ctx) {
  return measure(ctx, async () => {
    const id = ProjectStorage.getActiveProjectId();
    const A = window.ThreadAccounting;
    const est = A.snapshot({ pattern: [{ id: '310', type: 'solid' }], done: [1], fabricCt: 14 }, {})['d:0'];
    const ops = [];
    for (let i = 0; i < 5; i++) ops.push({ projectId: id, unit: 'd:new' + i + ':' + Date.now(), seq: 1, kind: 'mark', estimate: est, enabled: false });
    const t = performance.now();
    await StashBridge.applyConsumptionEvents(id, {}, ops);
    return { id, commitMs: Math.round(performance.now() - t) };
  });
}
// One project changed since the last export, then an export. Folder: the
// automatic folder export (always the full file, one per device). Incremental:
// exportSync({ mode: 'incremental' }) and compression, which no transport
// uses today but the engine offers.
async function caseSync(ctx, spec) {
  // A first export, as the folder already had one (and the session its cache).
  await ctx.page.evaluate(async () => {
    const fake = { name: 'cost', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getFileHandle: async () => ({ createWritable: async () => ({ write: async () => {}, close: async () => {} }) }) };
    await window.SyncEngine.exportToFolder(fake);
    localStorage.setItem('cs_sync_lastExportAt', new Date().toISOString());
  });
  await sleep(500);
  const box = await ctx.page.evaluate(() => { const r = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await ctx.page.mouse.click(Math.round(box.x + box.w * 0.45), Math.round(box.y + box.h * 0.55));
  await sleep(800);
  return measure(ctx, async (incremental) => {
    const id = ProjectStorage.getActiveProjectId();
    let bytes = 0, projects = null;
    const t = performance.now();
    if (incremental) {
      const obj = await window.SyncEngine.exportSync({ mode: 'incremental' });
      const out = window.SyncEngine.compressAsync ? await window.SyncEngine.compressAsync(obj) : window.SyncEngine.compress(obj);
      bytes = out.length; projects = obj.projects.length;
    } else {
      const fake = { name: 'cost', queryPermission: async () => 'granted', requestPermission: async () => 'granted',
        getFileHandle: async () => ({ createWritable: async () => ({ write: async (bl) => { bytes = bl.byteLength || bl.size || bl.length || 0; }, close: async () => {} }) }) };
      const res = await window.SyncEngine.exportToFolder(fake);
      projects = res && res.syncObj ? res.syncObj.projects.length : null;
    }
    return { id, exportMs: Math.round(performance.now() - t), bytes, projects };
  }, !!spec.incremental);
}

const CASES = [
  { id: 'save-mark-large', run: caseSaveMark, size: 'large' },
  { id: 'save-mark-huge', run: caseSaveMark, size: 'huge' },
  { id: 'save-mark-huge-phone', run: caseSaveMark, size: 'huge', profile: 'phone' },
  { id: 'save-meta-huge', run: caseSaveMeta, size: 'huge' },
  { id: 'save-meta-huge-phone', run: caseSaveMeta, size: 'huge', profile: 'phone' },
  { id: 'save-clean-huge', run: caseCleanFlush, size: 'huge' },
  { id: 'save-clean-huge-phone', run: caseCleanFlush, size: 'huge', profile: 'phone' },
  { id: 'usage-short', run: caseUsage, size: 'small', ledger: { n: 200, projects: 2 } },
  { id: 'usage-50k', run: caseUsage, size: 'small', ledger: { n: 50000, projects: 40 } },
  { id: 'usage-200k', run: caseUsage, size: 'small', ledger: { n: 200000, projects: 150 } },
  { id: 'usage-50k-phone', run: caseUsage, size: 'small', ledger: { n: 50000, projects: 40 }, profile: 'phone' },
  { id: 'sync-folder-small-10', run: caseSync, size: 'small', collection: { n: 10, side: 120 } },
  { id: 'sync-folder-small-150', run: caseSync, size: 'small', collection: { n: 150, side: 120 } },
  { id: 'sync-folder-large-150', run: caseSync, size: 'large', collection: { n: 150, side: 120 } },
  { id: 'sync-folder-large-150-phone', run: caseSync, size: 'large', collection: { n: 150, side: 120 }, profile: 'phone' },
  { id: 'sync-folder-huge', run: caseSync, size: 'huge' },
  { id: 'sync-folder-small-50k-ledger', run: caseSync, size: 'small', ledger: { n: 50000, projects: 40 } },
  { id: 'sync-incr-small-150', run: caseSync, size: 'small', collection: { n: 150, side: 120 }, incremental: true },
  { id: 'sync-incr-large-150', run: caseSync, size: 'large', collection: { n: 150, side: 120 }, incremental: true },
];

(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const list = CASES.filter((c) => !only.length || only.some((o) => c.id.includes(o)));
  const repeats = +process.env.REPEATS || 1;
  const server = await startServer();
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const result = {
    kind: 'save-sync-cost', startedAt: new Date().toISOString(),
    build: { commit: git(['rev-parse', 'HEAD']), dirtyFiles: (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length },
    environment: { browser: 'Chromium ' + browser.version() + ' (headless)', host: `${os.type()} ${os.release()}, ${os.cpus().length} x ${os.cpus()[0] && os.cpus()[0].model}`,
      caveat: 'Emulated: software canvas, phone = Pixel 5 emulation at 4x CPU throttle. Not a physical-device measurement.' },
    cases: {},
  };
  const out = process.env.OUT || path.join(ROOT, 'reports', 'perf-results', `save-cost-${result.startedAt.slice(0, 19).replace(/:/g, '')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    for (const spec of list) {
      for (let rep = 0; rep < repeats; rep++) {
        let ctx;
        try {
          ctx = await newCtx(browser, spec);
          await openFixture(ctx.page, base, spec);
          const res = await spec.run(ctx, spec);
          (result.cases[spec.id] = result.cases[spec.id] || []).push({ profile: spec.profile || 'desktop', ...res });
          const main = res.flushMs != null ? 'flush ' + (res.first ? res.first.flushMs + ' then ' : '') + res.flushMs + (res.clean ? ' (clean)' : '') : res.saveMs != null ? 'save ' + (res.first ? res.first.saveMs + ' then ' : '') + res.saveMs : res.commitMs != null ? 'commit ' + res.commitMs : 'export ' + res.exportMs;
          console.log(`${spec.id} #${rep + 1}: ${main} ms  busy ${res.cpu.busyMs} ms  longest ${res.longestTaskMs} ms  projects put ${res.projectsPut}`);
          console.log('   top: ' + res.cpu.top.slice(0, 8).map(([k, ms]) => k + ' ' + ms).join(' | '));
        } catch (e) {
          console.log(`${spec.id} #${rep + 1}: FAILED ${e.message.split('\n')[0]}`);
          (result.cases[spec.id] = result.cases[spec.id] || []).push({ error: e.message.split('\n')[0] });
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
