// Real-Chromium smoke of folder sync against a served copy of the app: connect a folder, save once (fast path), save in
// a burst (coalescing through the cooldown), save during a slow write (in-flight exclusion and one queued follow-up),
// speed up and stop the watcher, shut the browser down with an export still pending, reopen on the same profile and
// export again, and open a second tab.
//
// The "folder" is the origin-private file system: a real FileSystemDirectoryHandle, which the browser can persist in
// IndexedDB. It has no permission API, so queryPermission/requestPermission are patched to answer "granted"; file
// creation/writes are counted, and a write can be slowed so a save can arrive while it runs.
//
//   E2E_LOCAL_CDN=1 node reports/cleanup-20/browser-smoke.cjs <chromium-exe> <label> <base-url> <out.json>
// Run it once per revision (each served by `node serve.js <port>` from that revision's checkout).
const { chromium } = require('@playwright/test');
const { installLocalCdn } = require('../../tests/e2e/local-cdn');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [exe, label, baseUrl, outFile] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const INIT = () => {
  window.__writes = 0; window.__writeDelayMs = 0; window.__events = [];
  const orig = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = async function () {
    const w = await orig.apply(this, arguments);
    const write = w.write.bind(w);
    w.write = async function () { window.__writes++; if (window.__writeDelayMs) await new Promise(r => setTimeout(r, window.__writeDelayMs)); return write.apply(null, arguments); };
    return w;
  };
  FileSystemDirectoryHandle.prototype.queryPermission = async () => 'granted';
  FileSystemDirectoryHandle.prototype.requestPermission = async () => 'granted';
  ['cs:syncStatusChanged', 'cs:syncError', 'cs:syncPermissionNeeded', 'cs:syncUpdatesAvailable'].forEach(t => addEventListener(t, e => {
    window.__events.push({ at: Math.round(performance.now()), type: t, reason: (e.detail && e.detail.reason) || null, stage: (e.detail && e.detail.stage) || null });
  }));
};

const project = n => ({ id: 'proj_smoke', name: 'Smoke ' + n, version: 11, updatedAt: new Date().toISOString(), createdAt: '2026-01-01T00:00:00Z',
  settings: { sW: 2, sH: 2, fabricCt: 14 }, pattern: [{ id: '310', type: 'solid' }, { id: '310', type: 'solid' }, { id: '310', type: 'solid' }, { id: '310', type: 'solid' }],
  done: [0, 0, 0, 0], halfStitches: [], halfDone: [], partialStitches: [], parkMarkers: [], sessions: [], threadOwned: {} });

async function open(dir) {
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: exe, headless: true });
  await installLocalCdn(ctx);
  await ctx.addInitScript(INIT);
  return ctx;
}
const exportedCount = page => page.evaluate(() => window.__events.filter(e => e.reason === 'exported').length);
async function waitExported(page, n, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await exportedCount(page) >= n) return Date.now() - t0; await sleep(100); }
  throw new Error('export #' + n + ' did not happen within ' + ms + ' ms');
}
const save = (page, n) => page.evaluate(p => ProjectStorage.save(p), project(n));
const diag = page => page.evaluate(() => Object.assign({ watching: SyncEngine.isWatching() }, SyncEngine.getDiagnostics()));
const kinds = page => page.evaluate(() => window.__events.map(e => e.type + ':' + (e.reason || e.stage || '')));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-smoke-'));
  const out = { label, baseUrl, phases: {}, errors: [] };
  const watch = page => { page.on('pageerror', e => out.errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') out.errors.push(m.text()); }); };

  // ── Session 1 ──
  let ctx = await open(profile);
  let page = await ctx.newPage(); watch(page);
  await page.goto(baseUrl + '/stitch.html');
  await page.waitForFunction(() => window.SyncEngine && window.ProjectStorage);
  out.scheduler = await page.evaluate(() => typeof window.SyncExportScheduler);
  out.phases.connect = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const d = await root.getDirectoryHandle('sync-smoke', { create: true });
    await SyncEngine.setWatchDirectory(d);
    return { watching: SyncEngine.isWatching(), autoSync: SyncEngine.isAutoSyncEnabled(), hasDir: SyncEngine.getSyncStatus().hasWatchDir };
  });
  await sleep(500);

  // A. fast path
  await save(page, 1);
  out.phases.fastPath = { delayMs: await waitExported(page, 1, 8000), writes: await page.evaluate(() => window.__writes) };

  // B. burst inside the cooldown: one later write
  const b0 = Date.now();
  for (let i = 0; i < 5; i++) { await save(page, 10 + i); await sleep(250); }
  const bw = await page.evaluate(() => window.__writes);
  await waitExported(page, 2, 40000);
  const tB = Date.now();
  await sleep(2500);
  out.phases.burst = { delayFromFirstSaveMs: tB - b0, writesBefore: bw, writesAfter: await page.evaluate(() => window.__writes), exported: await exportedCount(page) };

  // C. saves during a slow write: held, then one follow-up
  await sleep(Math.max(0, 31500 - (Date.now() - tB))); // let the cooldown from the burst's write lapse
  await page.evaluate(() => { window.__writeDelayMs = 4000; });
  const w0 = await page.evaluate(() => window.__writes), e0 = await exportedCount(page);
  await save(page, 20);
  const started = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 8000) { if (await page.evaluate(() => window.__writes) > w0) return Date.now() - t0; await sleep(50); } return null; })();
  for (let i = 0; i < 3; i++) { await save(page, 30 + i); await sleep(300); }
  const inFlightExported = await exportedCount(page) - e0;
  await waitExported(page, e0 + 1, 15000);
  await page.evaluate(() => { window.__writeDelayMs = 0; });
  const c1 = Date.now();
  await waitExported(page, e0 + 2, 40000);
  const followUpDelay = Date.now() - c1;
  await sleep(3000);
  out.phases.inFlight = { writeStartedAfterMs: started, exportedWhileInFlight: inFlightExported, writes: (await page.evaluate(() => window.__writes)) - w0, exports: (await exportedCount(page)) - e0, followUpWaitedAtLeastMs: followUpDelay };

  // D. watcher speed-up and stop
  const d0 = (await diag(page)).tickCount;
  await page.evaluate(() => SyncEngine.startWatching(300));
  await sleep(1800);
  const d1 = (await diag(page)).tickCount;
  await page.evaluate(() => SyncEngine.stopWatching());
  const stoppedAt = (await diag(page)).tickCount;
  await sleep(1500);
  const d2 = await diag(page);
  out.phases.watcher = { ticksWhileFast: d1 - d0 >= 4, noTicksAfterStop: d2.tickCount === stoppedAt, watchingAfterStop: d2.watching, tickFailures: d2.tickFailures };

  // E. shutdown with an export still pending
  await page.evaluate(() => SyncEngine.startWatching());
  await save(page, 40);
  await sleep(300);
  out.phases.beforeShutdown = { exportedEvents: await exportedCount(page), pendingFileWrites: await page.evaluate(() => window.__writes) };
  await ctx.close();

  // ── Session 2: reopen on the same profile ──
  ctx = await open(profile);
  page = await ctx.newPage(); watch(page);
  await page.goto(baseUrl + '/stitch.html');
  await page.waitForFunction(() => window.SyncEngine && window.ProjectStorage);
  await page.waitForFunction(() => SyncEngine.isWatching(), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const r = await diag(page);
  out.phases.reopen = { watching: r.watching, hasWatchDir: r.hasWatchDir, ticked: r.tickCount >= 1, tickFailures: r.tickFailures, writesOnLoad: await page.evaluate(() => window.__writes) };
  await save(page, 50);
  out.phases.reopenExport = { delayMs: await waitExported(page, 1, 8000), writes: await page.evaluate(() => window.__writes) };

  // F. second tab, same profile: both watch; each export is its own write
  const tab2 = await ctx.newPage(); watch(tab2);
  await tab2.goto(baseUrl + '/home.html');
  await tab2.waitForFunction(() => window.SyncEngine);
  await tab2.waitForFunction(() => SyncEngine.isWatching(), null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  const d1b = await diag(page), d2b = await diag(tab2);
  out.phases.twoTabs = { bothWatching: d1b.watching && d2b.watching, bothHaveFolder: d1b.hasWatchDir && d2b.hasWatchDir, failures: d1b.tickFailures + d2b.tickFailures };
  await tab2.close();
  await page.evaluate(() => SyncEngine.stopWatching());
  out.phases.finalStop = { watching: (await diag(page)).watching };
  out.eventKinds = (await kinds(page)).filter(k => k !== 'cs:syncStatusChanged:');
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');
  console.log(JSON.stringify(out.phases));
  console.log(label + ': page errors: ' + (out.errors.length ? out.errors.join(' | ') : 'none'));
})().catch(e => { console.error(e); process.exit(1); });
