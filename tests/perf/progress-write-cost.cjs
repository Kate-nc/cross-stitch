/* progress-write-cost.cjs — what one Stitch Tracker progress write
   (ProjectStorage.saveProgress) costs, split by where the time goes, apart
   from full saves and thread-usage accounting.
   ═══════════════════════════════════════════════════════════════════════════
   reports/track-progress-write-cost.md is built from this. A bare page on
   serve.js loads the storage scripts only (no Tracker, no canvas), saves a
   chart of the given size and progress in full, then makes progress writes
   the way the Tracker does: each one a new done array with a few stitches
   changed, after `since` changes already written since the full save.

     node tests/perf/progress-write-cost.cjs            every case
     ONLY=huge node tests/perf/progress-write-cost.cjs  ids containing any of these
     OUT=reports/track-mode-baseline/x.json ...         where to write
     CHROME=/path/to/chromium ...                       another Chromium build
     MODE=full ...                                      never name the changed cells
                                                        (every write compares every cell)

   Per write it records, all on the main thread:
     total      saveProgress call to its promise settling (includes IndexedDB's
                own threads; the write transaction is inside it)
     copy       building the stored done array from the caller's
     diff       TrackingSync.recordDelta (compares the marks, writes registers)
     clean      TrackingSync's normalisation of the stored delta (inside diff)
     idbGet     synchronous time of IndexedDB get() calls (request setup)
     idbPut     synchronous time of put() (the structured clone runs here)
     cellsRead  done cells compared by recordDelta (TrackingSync.stats; counted,
                machine-independent)
     since      whether the write named its changed cells and storage used them

   Emulated: headless Chromium; "phone" is Pixel 5 emulation at 4x CPU
   throttle. Not a physical-device measurement. Counts do not depend on the
   machine. */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { chromium, devices } = require('@playwright/test');

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
function git(args) { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return null; } }

const SCRIPTS = ['constants.js', 'dmc-data.js', 'colour-utils.js', 'helpers.js', 'knots.js', 'backstitch.js', 'fractional.js',
  'beads.js', 'progress-units.js', 'tracking-sync.js', 'project-storage.js'];
const PROFILES = {
  phone: { device: devices['Pixel 5'], throttle: 4 },
  desktop: { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, throttle: 1 },
};
// side: chart w x h; fraction done; since: changed marks already in the record
// before the measured writes; per: stitches changed per measured write.
const CASES = [
  { id: 'large-50-since0', w: 400, h: 500, fraction: 0.5, since: 0, per: 3 },
  { id: 'large-50-since2000', w: 400, h: 500, fraction: 0.5, since: 2000, per: 3 },
  { id: 'huge-50-since0', w: 600, h: 800, fraction: 0.5, since: 0, per: 3 },
  { id: 'huge-50-since2000', w: 600, h: 800, fraction: 0.5, since: 2000, per: 3 },
  { id: 'huge-50-since0-phone', w: 600, h: 800, fraction: 0.5, since: 0, per: 3, profile: 'phone' },
  { id: 'huge-50-since2000-phone', w: 600, h: 800, fraction: 0.5, since: 2000, per: 3, profile: 'phone' },
  { id: 'large-50-since2000-phone', w: 400, h: 500, fraction: 0.5, since: 2000, per: 3, profile: 'phone' },
];
const WRITES = 12;

async function runCase(browser, port, spec) {
  const prof = PROFILES[spec.profile || 'desktop'];
  const context = await browser.newContext({ ...prof.device, serviceWorkers: 'block' });
  const page = await context.newPage();
  const html = '<!doctype html><meta charset="utf-8"><title>bench</title>' + SCRIPTS.map((s) => `<script src="/${s}"></script>`).join('');
  await page.route(`http://127.0.0.1:${port}/__progress-bench.html`, (r) => r.fulfill({ body: html, contentType: 'text/html' }));
  await page.goto(`http://127.0.0.1:${port}/__progress-bench.html`);
  await page.waitForFunction(() => typeof ProjectStorage !== 'undefined' && typeof TrackingSync !== 'undefined');
  const cdp = await context.newCDPSession(page);
  const seeded = await page.evaluate(async ([w, h, fraction, since, mode]) => {
    const n = w * h, pattern = new Array(n), done = new Array(n);
    for (let i = 0; i < n; i++) { pattern[i] = { id: String(300 + (i % 60)), type: 'solid' }; done[i] = (i * 7919) % 1000 < fraction * 1000 ? 1 : 0; }
    const id = 'proj_bench';
    await ProjectStorage.save({ version: 11, id, page: 'tracker', name: 'Bench', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      settings: { sW: w, sH: h, fabricCt: 14 }, pattern, done, bsLines: [], halfStitches: [], halfDone: [], partialStitches: [], parkMarkers: [], statsSessions: [], threadOwned: {} });
    const p = await ProjectStorage.get(id);
    window.__bench = { id, base: p.lastWriteAt, done: Uint8Array.from(p.done), next: 0, n };
    // `since` changes written before measuring, in batches as the Tracker would.
    const b = window.__bench;
    // The Tracker's own journal (ProjectStorage.progressChanges), when this build has one.
    b.pc = (mode !== 'full' && ProjectStorage.progressChanges) ? ProjectStorage.progressChanges() : null;
    b.write = async (d, changed) => {
      if (b.pc) b.pc.link(b.done, d, changed);
      b.done = d;
      const data = { done: d, baseWriteAt: b.base, tabId: 'bench' };
      const w = b.pc ? b.pc.begin(id, d) : null;
      if (w) { data.writeId = w.writeId; if (w.since) data.since = w.since; }
      const ok = await ProjectStorage.saveProgress(id, data);
      if (ok === true && w) b.pc.confirm(w);
      return { ok, since: !!(w && w.since) };
    };
    for (let k = 0; k < since; k += 200) {
      const d = new Uint8Array(b.done), changed = [];
      for (let j = 0; j < 200 && k + j < since; j++) { const i = (b.next++ * 104729) % n; d[i] = d[i] ? 0 : 1; changed.push(i); }
      await b.write(d, changed);
    }
    return { n, since };
  }, [spec.w, spec.h, spec.fraction, spec.since, process.env.MODE || 'since']);

  // Instrument: TrackingSync.recordDelta / cleanDelta, IDB get/put sync time, Uint8Array.from.
  await page.evaluate(() => {
    const T = window.__t = { copy: 0, diff: 0, idbGet: 0, idbPut: 0, cellsRead: 0 };
    const wrap = (obj, name, key) => { const f = obj[name]; obj[name] = function () { const t0 = performance.now(); try { return f.apply(this, arguments); } finally { T[key] += performance.now() - t0; } }; };
    wrap(TrackingSync, 'recordDelta', 'diff');
    wrap(IDBObjectStore.prototype, 'get', 'idbGet');
    wrap(IDBObjectStore.prototype, 'put', 'idbPut');
    const from = Uint8Array.from;
    Uint8Array.from = function (src) { const t0 = performance.now(); try { return from.apply(this, arguments); } finally { if (src && src.length > 1000) T.copy += performance.now() - t0; } };
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });
  const writes = [];
  for (let w = 0; w < WRITES; w++) {
    const r = await page.evaluate(async (per) => {
      const b = window.__bench, T = window.__t;
      Object.keys(T).forEach((k) => { T[k] = 0; });
      const d = new Uint8Array(b.done);
      const changed = [];
      for (let j = 0; j < per; j++) { const i = (b.next++ * 104729) % b.n; d[i] = d[i] ? 0 : 1; changed.push(i); }
      const c0 = TrackingSync.stats ? TrackingSync.stats.cellsCompared : null;
      const t0 = performance.now();
      const r = await b.write(d, changed);
      const total = performance.now() - t0;
      return Object.assign({ ok: r.ok, since: r.since, total }, T, c0 == null ? {} : { cellsRead: TrackingSync.stats.cellsCompared - c0 });
    }, spec.per);
    writes.push(r);
    await sleep(50);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  // Correctness: what get() reads back equals the in-memory marks.
  const check = await page.evaluate(async () => {
    const b = window.__bench, p = await ProjectStorage.get(b.id);
    let diff = 0; for (let i = 0; i < b.n; i++) if ((p.done[i] ? 1 : 0) !== b.done[i]) diff++;
    return { diff, regs: Object.keys(p.trackingSync.marks).length };
  });
  await context.close();
  const med = (k) => { const v = writes.slice(2).map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const summary = {};
  ['total', 'copy', 'diff', 'idbGet', 'idbPut', 'cellsRead'].forEach((k) => { summary[k] = med(k); });
  return { id: spec.id, spec, mode: process.env.MODE || 'since', seeded, summary, allOk: writes.every((x) => x.ok === true), sinceUsed: writes.filter((x) => x.since).length, check, writes };
}

(async () => {
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const cases = CASES.filter((c) => !only || only.some((o) => c.id.includes(o)));
  const { port, proc } = await startServer();
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const results = [];
  try {
    for (const c of cases) {
      const r = await runCase(browser, port, c);
      results.push(r);
      const s = r.summary;
      console.log(`${c.id.padEnd(26)} total ${s.total.toFixed(1)} ms  copy ${s.copy.toFixed(2)}  diff ${s.diff.toFixed(2)}  idbGet ${s.idbGet.toFixed(2)}  idbPut ${s.idbPut.toFixed(2)}  cells ${s.cellsRead == null ? '-' : s.cellsRead}  named ${r.sinceUsed}/${r.writes.length}  ok ${r.allOk}  readBackDiff ${r.check.diff}`);
    }
  } finally {
    await browser.close();
    proc.kill();
  }
  const out = process.env.OUT;
  if (out) fs.writeFileSync(path.join(ROOT, out), JSON.stringify({ commit: git(['rev-parse', '--short', 'HEAD']), dirty: (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length, browser: browser.version ? browser.version() : null, results }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
