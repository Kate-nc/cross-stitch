/* zoom-settle.cjs — what the Stitch Tracker's chart costs when a zoom settles
   (reports/track-zoom-settle.md).
   ═══════════════════════════════════════════════════════════════════════════
     node tests/perf/zoom-settle.cjs                      every case
     ONLY=phone,desktop-dpr2 ...                          cases whose id contains any of these
     OUT=path.json ...                                    where to write (default: tests/.tmp/zoom-settle-<time>.json)
     CHROME=/path/to/chrome ...                           browser binary (default: Playwright's)
     REPEATS=n ...                                        paints per breakdown (default 5)

   For each profile (phone: Pixel 5, DPR 2.75, 4x CPU; desktop at DPR 1 and 2,
   no throttle), chart (400 x 500, 60 colours; the same with half stitches,
   backstitch, knots, beads and specialty stitches; the same in a work area)
   and starting zoom (30%, 6 px stitches; 100%, 20 px stitches with symbols):

   1. Paint breakdown. Repeats a full repaint of the chart tile (the page's own
      return-from-hidden repaint) with window.__chartPaintPhases set, so
      drawStitch times its phases: setup, backgrounds (the one-pixel-per-cell
      image), the cell loop (with the symbols' fillText timed on their own),
      outlines, texture, grid lines, specialty objects (backstitch, knots,
      beads, quarter/petite/long), markers (border, work area, park) and the
      overlay canvases. Then a 1-pixel getImageData forces the canvas to
      raster what was recorded: "raster" is that flush. Medians.
   2. Gestures. Pinch out and in (30 moves), a spread that reverses within the
      gesture, two pinches back to back, and on desktop a run of Ctrl + wheel
      events. Counted: full tile paints (each rebase and the commit), the
      cells they covered; timed: the longest task and Long Animation Frames.
      Checked after each: no unpainted (transparent) canvas pixel inside the
      visible chart one frame after the commit, and once settled, the canvas
      matches a fresh full paint of the same view (no stale pixels).

   Times are emulated: headless Chromium rasters canvases on the CPU
   (SwiftShader), and the phone profile throttles script 4x but not raster.
   Neither is a physical-device measurement. Counts are deterministic. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn, execFileSync } = require('child_process');
const { chromium, devices } = require('@playwright/test');
const { fixtureFor, fixturePalette, SIZES } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { fixtureWith } = require('../_helpers/panProbes');
const { blankInView, panCheckingBlank, alignedFreshPaint: settledMatchesFreshPaint, pinch, ctrlWheel: wheel } = require('../_helpers/zoomSettleProbes');

const ROOT = path.join(__dirname, '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REPEATS = +process.env.REPEATS || 5;

function freePort() { return new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); }); }
async function startServer() {
  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(port)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/version.js`); return { port, proc }; } catch (_) { await sleep(100); } }
  proc.kill(); throw new Error('server did not start');
}
const git = (a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch (_) { return null; } };
const CDN_LOCAL = {
  'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'pako.min.js': 'node_modules/pako/dist/pako.min.js',
};
async function routeCdn(context) {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const name = Object.keys(CDN_LOCAL).find((k) => route.request().url().endsWith('/' + k));
    return name ? route.fulfill({ path: path.join(ROOT, CDN_LOCAL[name]), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } }) : route.abort();
  });
}

const PROFILES = {
  phone: { device: devices['Pixel 5'], throttle: 4, touch: true },
  'desktop-dpr1': { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, throttle: 1, touch: false },
  'desktop-dpr2': { device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, throttle: 1, touch: false },
};
const AREA = { blockW: 10, blockH: 10, workArea: { active: true, x0: 100, y0: 100, x1: 300, y1: 400, bw: 20, bh: 30, setAt: 1 } };
// Highlight view with the outline style, counting aids and Spotlight on: the
// overlay canvases redrawn whenever the tile changes (as track-baseline.cjs's
// overlay scenario).
const OVERLAYS = { workingContext: { view: 'highlight', colour: fixturePalette(SIZES.large.nColours)[3].id, highlight: 'outline' }, focusBlock: { bx: 3, by: 3 } };
const CHARTS = {
  full: () => fixtureFor('large', { doneFraction: 0.3 }),
  mixed: () => fixtureFor('large', { doneFraction: 0.3, mixed: true }),
  area: () => fixtureFor('large', { doneFraction: 0.3 }),
  overlays: () => fixtureFor('large', { doneFraction: 0.3 }),
};

/* In-page probes: long tasks, Long Animation Frames, frame times. */
async function installProbes(page) {
  await page.addInitScript(() => {
    const Z = window.__zs = { longTasks: [], loafs: [], frames: [] };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) Z.longTasks.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch (_) {}
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const script = (e.scripts || []).reduce((n, s) => n + s.duration, 0);
          const render = e.renderStart > 0 ? e.startTime + e.duration - e.renderStart : 0;
          Z.loafs.push({ t: e.startTime, d: e.duration, script, render });
        }
      }).observe({ type: 'long-animation-frame', buffered: false });
    } catch (_) {}
    (function tick(t) { Z.frames.push(t); requestAnimationFrame(tick); })(performance.now());
  });
}

async function open(page, base, chart, zoom) {
  await suppressOnboarding(page);
  if (chart === 'overlays') await page.addInitScript(() => { localStorage.setItem('cs_countAids', '1'); localStorage.setItem('cs_focusEnabled', '1'); });
  await installProbes(page);
  await page.goto(base + '/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  const fields = { savedZoom: zoom, savedScroll: { left: 2400 * zoom, top: 3000 * zoom } };
  if (chart === 'area') Object.assign(fields, AREA);
  if (chart === 'overlays') Object.assign(fields, OVERLAYS);
  await page.locator('input[type="file"]').first().setInputFiles(fixtureWith(CHARTS[chart](), fields));
  await page.waitForSelector('.tracker-chart-layer canvas', { timeout: 180000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('.tb-proj-badge-saved');
    return !!b && !/tb-proj-badge-saved--(saving|pending)/.test(b.className) && /^Saved\b/.test(b.textContent.trim());
  }, null, { timeout: 180000 });
  await sleep(1500);
}

/* A full repaint with the phases timed, then a forced raster flush. */
const breakdown = (page, n) => page.evaluate(async (n) => {
  const cv = document.querySelector('.tracker-chart-layer canvas');
  const out = [];
  for (let i = 0; i < n; i++) {
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    window.__chartPaintPhases = { paints: [] };
    const t0 = performance.now();
    document.dispatchEvent(new Event('visibilitychange'));     // the page's own full repaint, when visible
    const t1 = performance.now();
    cv.getContext('2d').getImageData(0, 0, 1, 1);
    const t2 = performance.now();
    const p = window.__chartPaintPhases.paints.find((x) => x.cells > 0) || {};
    window.__chartPaintPhases = null;
    out.push({ ...p, totalMs: t1 - t0, rasterMs: t2 - t1, canvasPx: cv.width * cv.height, tileCss: [parseFloat(cv.style.width), parseFloat(cv.style.height)] });
  }
  return out;
}, n);

/* The settle itself, without rebases: SETTLES zooms that stay under the 1.6x
   rebase (pinch 140 to 200 px and back; Ctrl + wheel 4 events in, then out),
   each followed by a pause. For each, the task that ends the gesture (the
   touchend, or the wheel's idle commit) and the frame it is in, then the
   longest task in the second after it (the strips that finish the tile).
   Medians. */
const SETTLES = +process.env.SETTLES || 8;
async function settles(ctx, touch, box, zoom) {
  const { page, cdp } = ctx;
  const rows = [];
  for (let i = 0; i < SETTLES; i++) {
    const out = i % 2 === 0;
    let tEnd;
    if (touch) {
      const a = out ? 140 : 200, b = out ? 200 : 140, moves = 20;
      const at = (d) => [{ x: box.x - d / 2, y: box.y, id: 1, radiusX: 6, radiusY: 6, force: 1 }, { x: box.x + d / 2, y: box.y, id: 2, radiusX: 6, radiusY: 6, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(a) });
      for (let k = 1; k <= moves; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(a + (b - a) * k / moves) }); await sleep(16); }
      await sleep(300);   // let the last move's frame finish, so the next task is the commit
      tEnd = await page.evaluate(() => performance.now());
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(box.x, box.y);
      await page.keyboard.down('Control');
      // About x1.5 in four events (a zoom step is 0.005 per wheel unit).
      const dy = Math.round(25 * zoom);
      for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, out ? -dy : dy); await sleep(16); }
      await page.keyboard.up('Control');
      tEnd = await page.evaluate(() => performance.now()) + 100;   // the commit runs 160 ms after the last event
    }
    await sleep(1500);
    rows.push(await page.evaluate((tEnd) => {
      const Z = window.__zs;
      const lt = Z.longTasks.filter((l) => l.t >= tEnd - 1).sort((a, b) => a.t - b.t);
      const lo = Z.loafs.filter((l) => l.t + l.d >= tEnd).sort((a, b) => a.t - b.t);
      const fr = Z.frames.filter((f) => f >= tEnd - 1);
      const gaps = []; for (let i = 1; i < fr.length; i++) gaps.push(fr[i] - fr[i - 1]);
      const first = lt[0] && lt[0].t < tEnd + 400 ? lt[0] : null;
      return {
        commitTaskMs: first ? Math.round(first.d) : 0,
        commitFrameMs: Math.round(gaps[0] || 0),
        laterTaskMs: Math.round(lt.slice(first ? 1 : 0).reduce((m, l) => Math.max(m, l.d), 0)),
        worstFrameMs: Math.round(gaps.reduce((m, g) => Math.max(m, g), 0)),
        loafMs: Math.round(lo.reduce((a, l) => a + l.d, 0)),
      };
    }, tEnd));
  }
  const m = (k) => med(rows.map((r) => r[k]));
  return { n: rows.length, commitTaskMs: m('commitTaskMs'), commitFrameMs: m('commitFrameMs'), laterTaskMs: m('laterTaskMs'), worstFrameMs: m('worstFrameMs'), loafMs: m('loafMs'), rows };
}

async function gesture(ctx, name, run) {
  const { page } = ctx;
  await page.evaluate(() => { window.__chartPaintPhases = { paints: [] }; });
  const t0 = await page.evaluate(() => performance.now());
  ctx.panBlank = null;
  await run();
  // One frame after the gesture ended: the commit has painted (or not).
  const blankAfterCommit = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const edge = await blankInView(page);
  await sleep(1500);
  const t1 = await page.evaluate(() => performance.now());
  const rec = await page.evaluate(([t0, t1]) => {
    const Z = window.__zs, inW = (t) => t >= t0 && t < t1;
    const fr = Z.frames.filter(inW), gaps = []; for (let i = 1; i < fr.length; i++) gaps.push(fr[i] - fr[i - 1]);
    const paints = window.__chartPaintPhases.paints; window.__chartPaintPhases = null;
    const lt = Z.longTasks.filter((l) => inW(l.t)), lo = Z.loafs.filter((l) => inW(l.t));
    return {
      paints: paints.map((p) => ({ cSz: p.cSz, cells: p.cells, glyphs: p.glyphs })),
      longestTaskMs: Math.round(lt.reduce((m, l) => Math.max(m, l.d), 0)), longTasks: lt.length,
      worstFrameMs: Math.round(gaps.reduce((m, g) => Math.max(m, g), 0)), framesOver50: gaps.filter((g) => g > 50).length,
      loafMs: Math.round(lo.reduce((a, l) => a + l.d, 0)), loafScriptMs: Math.round(lo.reduce((a, l) => a + l.script, 0)), loafRenderMs: Math.round(lo.reduce((a, l) => a + l.render, 0)),
      zoom: +(/(\d+)% zoom/.exec(document.getElementById('tracker-chart-summary').textContent) || [])[1],
    };
  }, [t0, t1]);
  const fresh = await settledMatchesFreshPaint(page);
  void blankAfterCommit;
  return { gesture: name, ...rec, blankAfterCommit: edge.blank, blankWhilePanning: ctx.panBlank, stalePixels: fresh.diff, staleMax: fresh.max, compared: fresh.compared, tileShift: fresh.shift };
}

const med = (a) => { const s = a.filter((v) => typeof v === 'number').sort((x, y) => x - y); return s.length ? Math.round(s[s.length >> 1] * 10) / 10 : null; };
const PHASES = ['setup', 'backgrounds', 'cellLoop', 'glyphMs', 'outlines', 'texture', 'gridLines', 'specialty', 'markers', 'overlays', 'totalMs', 'rasterMs'];

async function runCase(browser, base, c) {
  const prof = PROFILES[c.profile];
  const context = await browser.newContext({ ...prof.device, serviceWorkers: 'block' });
  await routeCdn(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  try {
    await open(page, base, c.chart, c.zoom);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.throttle });
    const bd = await breakdown(page, REPEATS);
    const phases = {}; for (const k of PHASES) phases[k] = med(bd.map((p) => p[k] || 0));
    phases.symbolsDrawn = med(bd.map((p) => p.glyphs)); phases.cells = bd[0] && bd[0].cells; phases.tier = bd[0] && bd[0].tier;
    phases.canvasPx = bd[0] && bd[0].canvasPx; phases.tileCss = bd[0] && bd[0].tileCss;
    const box = await page.evaluate(() => { const b = document.querySelector('.tracker-chart-scroll').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    const ctx = { page, cdp };
    const settle = await settles(ctx, prof.touch, box, c.zoom);
    const gestures = [];
    if (!process.env.SETTLE_ONLY) {
    if (prof.touch) {
      gestures.push(await gesture(ctx, 'spread x2', () => pinch(cdp, box.x, box.y, 120, 240)));
      gestures.push(await gesture(ctx, 'pinch x0.5', () => pinch(cdp, box.x, box.y, 240, 120)));
      gestures.push(await gesture(ctx, 'spread then back', () => pinch(cdp, box.x, box.y, 140, 280, 150)));
      gestures.push(await gesture(ctx, 'two pinches back to back', async () => { await pinch(cdp, box.x, box.y, 240, 140, null, 15); await sleep(40); await pinch(cdp, box.x, box.y, 140, 240, null, 15); }));
      gestures.push(await gesture(ctx, 'spread, then pan at once', async () => { await pinch(cdp, box.x, box.y, 140, 200); ctx.panBlank = await panCheckingBlank(page); }));
    } else {
      gestures.push(await gesture(ctx, 'ctrl+wheel in', () => wheel(page, box.x, box.y, -40, 20)));
      gestures.push(await gesture(ctx, 'ctrl+wheel out', () => wheel(page, box.x, box.y, 40, 20)));
      gestures.push(await gesture(ctx, 'ctrl+wheel in then out', async () => { await wheel(page, box.x, box.y, -40, 10); await wheel(page, box.x, box.y, 40, 10); }));
      gestures.push(await gesture(ctx, 'ctrl+wheel in, then pan at once', async () => { await wheel(page, box.x, box.y, -40, 6); await sleep(200); ctx.panBlank = await panCheckingBlank(page); }));
    }
    }
    const mem = await page.evaluate(() => [...document.querySelectorAll('.tracker-chart-layer canvas')].reduce((n, c) => n + c.width * c.height * 4, 0));
    return { phases, settle, gestures, canvasMb: Math.round(mem / 1048576 * 10) / 10 };
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
    await context.close().catch(() => {});
  }
}

(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const cases = [];
  for (const profile of Object.keys(PROFILES)) for (const chart of Object.keys(CHARTS)) for (const zoom of [0.3, 1]) {
    if (chart !== 'full' && profile === 'desktop-dpr2') continue;
    if (chart === 'overlays' && profile !== 'phone') continue;
    const id = `${profile}-${chart}-${Math.round(zoom * 100)}`;
    if (!only.length || only.some((o) => id.includes(o))) cases.push({ id, profile, chart, zoom });
  }
  const server = await startServer();
  const base = `http://127.0.0.1:${server.port}`;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const result = {
    kind: 'zoom-settle', startedAt: new Date().toISOString(),
    build: { commit: git(['rev-parse', 'HEAD']), dirtyFiles: (git(['status', '--porcelain']) || '').split('\n').filter(Boolean).length },
    environment: { browser: 'Chromium ' + browser.version() + ' (headless, software raster)', host: `${os.type()} ${os.release()}, ${os.cpus().length} x ${os.cpus()[0] && os.cpus()[0].model}`,
      caveat: 'Emulated. Canvases raster on the CPU; the phone profile throttles script 4x but not raster. Not a physical-device measurement.' },
    cases: {},
  };
  const out = process.env.OUT || path.join(ROOT, 'tests', '.tmp', `zoom-settle-${result.startedAt.slice(0, 19).replace(/:/g, '')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    for (const c of cases) {
      const t = Date.now();
      try {
        result.cases[c.id] = await runCase(browser, base, c);
        const r = result.cases[c.id], p = r.phases;
        console.log(`${c.id} (${Math.round((Date.now() - t) / 1000)} s): paint ${p.totalMs} ms + raster ${p.rasterMs} ms [bg ${p.backgrounds}, loop ${p.cellLoop} (glyphs ${p.glyphMs}, ${p.symbolsDrawn}), outlines ${p.outlines}, grid ${p.gridLines}, specialty ${p.specialty}, markers ${p.markers}, overlays ${p.overlays}] cells ${p.cells} tier ${p.tier}`);
        console.log(`   settle x${r.settle.n} (median): commit task ${r.settle.commitTaskMs} ms, its frame ${r.settle.commitFrameMs} ms, later tasks ${r.settle.laterTaskMs} ms, worst frame ${r.settle.worstFrameMs} ms`);
        for (const g of r.gestures) console.log(`   ${g.gesture}: ${g.paints.length} full paints (${g.paints.map((x) => x.cells).join('/')} cells), longest task ${g.longestTaskMs} ms, worst frame ${g.worstFrameMs} ms, zoom ${g.zoom}%, blank ${g.blankAfterCommit}${g.blankWhilePanning == null ? '' : '/' + g.blankWhilePanning}, stale ${g.stalePixels} (max ${g.staleMax}, shift ${g.tileShift})`);
      } catch (e) {
        console.log(`${c.id}: FAILED ${e.message.split('\n')[0]}`);
        result.cases[c.id] = { error: e.message.split('\n')[0] };
      }
      fs.writeFileSync(out, JSON.stringify(result, null, 1));
    }
  } finally { await browser.close(); server.proc.kill(); }
  console.log('wrote ' + path.relative(ROOT, out));
})().catch((e) => { console.error(e); process.exit(1); });
