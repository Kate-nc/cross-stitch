/* Mobile audit harness + regression tripwires for
   reports/mobile-experience-audit.md. Run with `npm run test:mobile-audit`
   (this project plus its desktop counterpart, which proves the mobile fixes
   did not change desktop behaviour). Set AUDIT_OUT=<path> to dump the raw
   measurements as JSON for before/after comparison. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = [];
function log(o) { OUT.push(o); console.log('RESULT ' + JSON.stringify(o)); }

const TMP = path.join(__dirname, '..', '.tmp');
function ensureTmp() { if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true }); }

// A realistically-sized pattern. Real users routinely work at 200x250+.
function makeTrackerFixture(sW, sH, nColours) {
  ensureTmp();
  const file = path.join(TMP, `tracker-${sW}x${sH}.json`);
  const total = sW * sH;
  const cols = [];
  for (let i = 0; i < nColours; i++) {
    cols.push({ id: String(300 + i), type: 'solid', rgb: [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256], symbol: String.fromCharCode(65 + (i % 26)) });
  }
  const pattern = new Array(total);
  for (let i = 0; i < total; i++) pattern[i] = cols[i % nColours];
  const done = new Array(total).fill(0);
  const project = {
    version: 9, page: 'tracker', name: `Perf ${sW}x${sH}`,
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern, bsLines: [], done, parkMarkers: [], totalTime: 0, sessions: [],
    hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: cols.map(c => ({ ...c, name: 'C' + c.id, lab: [0, 0, 0], count: total / nColours })),
    singleStitchEdits: [], halfStitches: [], halfDone: [], statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  };
  fs.writeFileSync(file, JSON.stringify(project), 'utf8');
  return file;
}

async function throttle(page, rate) {
  const s = await page.context().newCDPSession(page);
  await s.send('Emulation.setCPUThrottlingRate', { rate });
  return s;
}

const OBSERVE = () => {
  window.__lt = [];
  window.__marks = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: Math.round(e.startTime), d: Math.round(e.duration) }); })
      .observe({ entryTypes: ['longtask'] });
  } catch (e) {}
};

const PROBE = () => {
  const out = {};
  const nav = performance.getEntriesByType('navigation')[0] || {};
  out.domInteractive = Math.round(nav.domInteractive || 0);
  out.loadEvent = Math.round(nav.loadEventEnd || 0);
  const lt = (window.__lt || []).filter(t => t.d > 50);
  out.longTaskCount = lt.length;
  out.longestTaskMs = lt.reduce((m, t) => Math.max(m, t.d), 0);
  out.totalBlockingMs = lt.reduce((s, t) => s + (t.d - 50), 0);
  out.top5Tasks = lt.sort((a, b) => b.d - a.d).slice(0, 5);

  const rs = performance.getEntriesByType('resource');
  let js = 0, n = 0, css = 0;
  for (const r of rs) {
    const sz = r.decodedBodySize || r.transferSize || 0;
    if (/\.js(\?|$)/.test(r.name)) { js += sz; n++; } else if (/\.css(\?|$)/.test(r.name)) css += sz;
  }
  out.jsKB = Math.round(js / 1024); out.jsFiles = n; out.cssKB = Math.round(css / 1024);

  out.domNodes = document.querySelectorAll('*').length;
  out.viewportW = window.innerWidth;
  out.docScrollW = document.documentElement.scrollWidth;
  out.hasHScroll = document.documentElement.scrollWidth > window.innerWidth + 1;

  out.overflowers = [];
  if (out.hasHScroll) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || getComputedStyle(el).position === 'fixed') continue;
      if (r.right > window.innerWidth + 1) {
        out.overflowers.push({ sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''), right: Math.round(r.right), w: Math.round(r.width) });
        if (out.overflowers.length > 12) break;
      }
    }
  }

  const pinned = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight) continue;
    pinned.push({ el, sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), pos: cs.position, z: cs.zIndex, rect: { t: Math.round(r.top), l: Math.round(r.left), b: Math.round(r.bottom), r: Math.round(r.right) } });
  }
  out.pinned = pinned.map(p => ({ sel: p.sel, pos: p.pos, z: p.z, rect: p.rect }));
  out.pinnedOverlaps = [];
  for (let i = 0; i < pinned.length; i++) for (let j = i + 1; j < pinned.length; j++) {
    const a = pinned[i], b = pinned[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ox = Math.min(a.rect.r, b.rect.r) - Math.max(a.rect.l, b.rect.l);
    const oy = Math.min(a.rect.b, b.rect.b) - Math.max(a.rect.t, b.rect.t);
    if (ox > 8 && oy > 8) out.pinnedOverlaps.push({ a: `${a.sel}(z${a.z})`, b: `${b.sel}(z${b.z})`, area: `${ox}x${oy}` });
  }

  // Does a pinned element cover an interactive control underneath it?
  out.coveredControls = [];
  for (const btn of document.querySelectorAll('button, a[href], input, select')) {
    const r = btn.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) continue;
    if (hit !== btn && !btn.contains(hit) && !hit.contains(btn)) {
      out.coveredControls.push({
        control: btn.tagName.toLowerCase() + (typeof btn.className === 'string' && btn.className ? '.' + btn.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        text: (btn.textContent || btn.value || '').trim().slice(0, 24),
        coveredBy: hit.tagName.toLowerCase() + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
      });
      if (out.coveredControls.length > 12) break;
    }
  }

  out.smallTargets = [];
  for (const el of document.querySelectorAll('button, a[href], [role=button], input[type=checkbox], select')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
    if (r.width < 40 || r.height < 40) out.smallTargets.push({ sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''), size: `${Math.round(r.width)}x${Math.round(r.height)}`, txt: (el.textContent || '').trim().slice(0, 16) });
  }
  out.smallTargetCount = out.smallTargets.length;
  out.smallTargets = out.smallTargets.slice(0, 15);

  out.smallFontInputs = [];
  for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')) {
    const fsz = parseFloat(getComputedStyle(el).fontSize);
    if (fsz && fsz < 16) out.smallFontInputs.push({ sel: el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : ''), fs: fsz });
  }
  out.smallFontInputCount = out.smallFontInputs.length;
  out.smallFontInputs = out.smallFontInputs.slice(0, 8);

  out.canvases = [];
  for (const c of document.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect();
    out.canvases.push({ backing: `${c.width}x${c.height}`, cssSize: `${Math.round(r.width)}x${Math.round(r.height)}`, mpx: +(c.width * c.height / 1e6).toFixed(2) });
  }
  out.totalCanvasMpx = +out.canvases.reduce((s, c) => s + c.mpx, 0).toFixed(2);

  return out;
};

// ── 1. Cold load of every page, at 4x CPU throttle (mid-range Android) ──
for (const p of ['/home.html?from=home', '/manager.html?from=home', '/stitch.html?from=home', '/create.html?from=home']) {
  test(`cold load ${p}`, async ({ page }) => {
    await page.addInitScript(OBSERVE);
    const s = await throttle(page, 4);
    const t0 = Date.now();
    await page.goto(p, { waitUntil: 'load', timeout: 120000 });
    const wall = Date.now() - t0;
    await page.waitForTimeout(4000);
    const res = await page.evaluate(PROBE);
    log({ scenario: 'cold-load', page: p, cpuThrottle: '4x', wallLoadMs: wall, ...res });
    await s.detach().catch(() => {});
  });
}

// ── 2. Tracker with a realistic pattern: load + interaction cost ──
for (const [w, h, cols] of [[100, 100, 12], [200, 250, 40]]) {
  test(`tracker ${w}x${h} (${cols} colours)`, async ({ page }) => {
    const fixture = makeTrackerFixture(w, h, cols);
    await page.addInitScript(OBSERVE);
    const s = await throttle(page, 4);
    await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(1500);

    const t0 = Date.now();
    await page.locator('input[type="file"]').first().setInputFiles(fixture);
    try { await page.waitForSelector('canvas', { timeout: 60000 }); } catch (e) {}
    await page.waitForTimeout(4000);
    const openMs = Date.now() - t0;

    const afterOpen = await page.evaluate(PROBE);
    log({ scenario: 'tracker-open', pattern: `${w}x${h}`, colours: cols, cpuThrottle: '4x', openMs, ...afterOpen });

    // Interaction: pan + tap on the chart, measure long tasks generated.
    await page.evaluate(() => { window.__lt = []; });
    const box = await page.locator('canvas').first().boundingBox().catch(() => null);
    if (box) {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const cdp = await page.context().newCDPSession(page);
      for (let i = 0; i < 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(cx), y: Math.round(cy), id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
        for (let k = 1; k <= 6; k++) {
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(cx - k * 8), y: Math.round(cy - k * 5), id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await cdp.detach().catch(() => {});
      await page.waitForTimeout(2000);
      const interact = await page.evaluate(() => {
        const lt = (window.__lt || []).filter(t => t.d > 50);
        return { longTaskCount: lt.length, longestTaskMs: lt.reduce((m, t) => Math.max(m, t.d), 0), totalBlockingMs: lt.reduce((s, t) => s + (t.d - 50), 0) };
      });
      // WARNING: this scenario does NOT currently measure panning. A CDP
      // touch drag over the chart leaves scrollLeft/scrollTop untouched —
      // verified by counting scroll events (0) and canvas fillRect calls (0)
      // across the whole gesture sequence. Whatever it records is the
      // tracker settling after load, not pan cost. Do not quote these
      // numbers as a pan measurement until the gesture actually drives the
      // scroller; see reports/mobile-experience-audit.md §F.
      log({ scenario: 'tracker-post-load-idle (NOT a pan measurement)', pattern: `${w}x${h}`, cpuThrottle: '4x', ...interact });
    }
    await s.detach().catch(() => {});

    // Tripwires, not targets. These are deliberately slack so they survive
    // slower CI hardware — they exist to catch a *regression* of the audit's
    // findings, not to police the numbers. Tighten them only alongside the
    // remaining §E items.
    expect(afterOpen.hasHScroll, 'tracker page must not scroll horizontally').toBe(false);

    // Every chart canvas must respect the budget this device reports. Note
    // Playwright's Pixel 5 does not emulate navigator.deviceMemory (it reports
    // 8), so this run gets the *desktop* budget and the canvas is legitimately
    // larger than a real phone's would be. The hard 4096/16.7 Mpx phone limits
    // are asserted in verify-fixes.spec.js, which emulates iOS properly. What
    // is checked here is the invariant that holds on any device: the canvas
    // never exceeds what the app itself decided the device can take.
    const budget = await page.evaluate(() => (window.canvasSizeLimits ? window.canvasSizeLimits() : null));
    expect(budget, 'canvasSizeLimits must be exposed for the guard to mean anything').not.toBeNull();
    for (const c of afterOpen.canvases) {
      const [cw, ch] = c.backing.split('x').map(Number);
      expect(cw, `canvas ${c.backing} wider than the device side limit`).toBeLessThanOrEqual(budget.side);
      expect(ch, `canvas ${c.backing} taller than the device side limit`).toBeLessThanOrEqual(budget.side);
      expect(cw * ch, `canvas ${c.backing} over the device area budget`).toBeLessThanOrEqual(budget.area);
    }
    // 200x250 measured ~2.3s after the first-pass fixes; 100x100 ~0.35s.
    expect(afterOpen.totalBlockingMs).toBeLessThan(w * h > 20000 ? 6000 : 2000);
  });
}

test.afterAll(() => {
  // Opt-in JSON dump for before/after comparisons: AUDIT_OUT=path npx playwright test ...
  if (process.env.AUDIT_OUT) fs.writeFileSync(process.env.AUDIT_OUT, JSON.stringify(OUT, null, 2));
});
