/* Cost of panning the chart on a phone — §E item 12 / A4.
 *
 * The earlier "tracker-pan-interaction" figure in the audit was retracted
 * because the gesture never reached the pan path. Two things were wrong and
 * are fixed here:
 *
 *   1. A "How do you usually work through a pattern?" modal covers the chart
 *      on first load, so every touch landed on .modal-content. Pre-seeding
 *      cs_stitchStyle skips it.
 *   2. The scroller is NOT .canvas-area (which reports scrollWidth ==
 *      clientWidth). It is an inner unclassed div holding the canvas, the one
 *      that actually overflows.
 *
 * A pan is only counted as real if scrollLeft/scrollTop actually moved.
 */
const { test, expect } = require('@playwright/test');

const FIXTURE = (sW, sH) => {
  const total = sW * sH;
  const col = { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
  return JSON.stringify({
    version: 9, page: 'tracker', name: `pan ${sW}x${sH}`,
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern: new Array(total).fill(col), bsLines: [], done: new Array(total).fill(0),
    parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: [{ ...col, name: 'Black', lab: [0, 0, 0], count: total }],
    singleStitchEdits: [], halfStitches: [], halfDone: [], statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  });
};

async function openTracker(page, sW, sH) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cs_welcome_tracker_done', '1');
      // Skips the stitching-style modal that otherwise covers the chart.
      localStorage.setItem('cs_stitchStyle', 'block');
      // ...and the coachmark popover, which covers it after the modal goes.
      // (UserPrefs persists to localStorage under the cs_pref_ prefix.)
      for (const k of ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator',
        'import', 'undo', 'progress', 'save']) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      }
    } catch (e) {}
    window.__lt = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); })
        .observe({ entryTypes: ['longtask'] });
    } catch (e) {}
    window.__paints = 0; window.__clears = 0; window.__clearPx = 0; window.__rafs = 0;
    const of = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...a) { window.__paints++; return of.apply(this, a); };
    const oc = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (x, y, w, h) { window.__clears++; window.__clearPx += Math.abs(w * h); return oc.call(this, x, y, w, h); };
    const oraf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) { window.__rafs++; return oraf.call(window, cb); };
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'pan.json', mimeType: 'application/json', buffer: Buffer.from(FIXTURE(sW, sH)),
  });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(3000);
}

/** The innermost ancestor of the canvas that actually overflows. */
const scrollerInfo = (page) => page.evaluate(() => {
  const cv = document.querySelector('canvas');
  let p = cv && cv.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if (/auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY)
        && (p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight)) {
      const b = p.getBoundingClientRect();
      window.__scroller = p;
      return { x: b.x, y: b.y, w: b.width, h: b.height, scrollLeft: p.scrollLeft, scrollTop: p.scrollTop };
    }
    p = p.parentElement;
  }
  return null;
});

async function pan(page, box, gestures) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { window.__lt = []; window.__paints = 0; window.__clears = 0; window.__clearPx = 0; window.__rafs = 0; });

  const x0 = Math.round(box.x + box.w * 0.6);
  const y0 = Math.round(box.y + box.h * 0.5);
  for (let g = 0; g < gestures; g++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
    for (let k = 1; k <= 10; k++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 - k * 14, y: y0 - k * 9, id: 1, radiusX: 6, radiusY: 6, force: 1 }],
      });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1200);

  const out = await page.evaluate(() => {
    const sc = window.__scroller;
    const lt = (window.__lt || []).filter(d => d > 50);
    return {
      scrollLeft: sc ? sc.scrollLeft : null,
      scrollTop: sc ? sc.scrollTop : null,
      longTasks: lt.length,
      longestMs: Math.round(lt.reduce((m, d) => Math.max(m, d), 0)),
      totalBlockingMs: Math.round(lt.reduce((s, d) => s + (d - 50), 0)),
      canvasPaints: window.__paints,
      clearRects: window.__clears,
      clearedMpx: +(window.__clearPx / 1e6).toFixed(1),
      rafs: window.__rafs,
    };
  });
  await cdp.detach().catch(() => {});
  return out;
}

for (const [sW, sH] of [[100, 100], [200, 250]]) {
  test(`pan cost on a ${sW}x${sH} chart`, async ({ page }) => {
    await openTracker(page, sW, sH);
    const box = await scrollerInfo(page);
    expect(box, 'no overflowing scroller found — the harness is measuring the wrong element').not.toBeNull();

    const r = await pan(page, box, 8);
    console.log(`PAN_${sW}x${sH} ` + JSON.stringify({ scroller: { w: Math.round(box.w), h: Math.round(box.h) }, ...r }));

    // The whole point: prove the gesture actually panned. Without this the
    // numbers describe an idle page, which is exactly how the first attempt
    // produced a figure that had to be retracted.
    expect(r.scrollLeft + r.scrollTop,
      'the gesture did not move the scroller — this is not a pan measurement').toBeGreaterThan(0);
    expect(r.canvasPaints, 'panning should repaint the chart').toBeGreaterThan(0);

    // Budgets are on COUNTED work, not elapsed time. Blocking time on this
    // harness varies by 4-5x between identical runs, which is wider than any
    // effect worth asserting; paint and clear counts are deterministic.
    //
    // Before the scroll-skip fix: 285,513 fillRects for these 8 gestures,
    // because every touchmove repainted the visible slice from scratch even
    // though drawStitch already paints a 20-cell margin around it.
    expect(r.canvasPaints,
      `${r.canvasPaints} fillRects for 8 pan gestures — the scroll handler is repainting when it does not need to`
    ).toBeLessThan(50000);

    // Before the partial-clear fix: 4,176 Mpx, because the chart-sized
    // recommendation overlay was fully cleared on every animation frame.
    expect(r.clearedMpx,
      `${r.clearedMpx} Mpx cleared during 8 pan gestures — an overlay is clearing its whole canvas per frame`
    ).toBeLessThan(200);
  });
}
