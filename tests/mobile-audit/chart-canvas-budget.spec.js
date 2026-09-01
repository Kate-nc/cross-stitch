/* Viewport-tiled chart rendering — reports/mobile-freeze-large-patterns.md.
   ═══════════════════════════════════════════════════════════════════════════
   The chart and its five overlays used to size their backing store to the
   whole pattern at the current zoom. This spec is the behavioural half of the
   fix; tests/chartCanvasBudget.test.js is the arithmetic half.

   Everything here needs a running page, because the three things that matter
   are not visible from a unit test:

     - what the canvases actually allocate, summed across all of them (§1.2 —
       the per-canvas budget was charged up to six times);
     - that the chart still *paints* after being made a moving tile;
     - that a tap still lands on the cell under the finger once the tile has
       slid away from the origin. That coordinate conversion is the whole risk
       of tiling, and no unit test can see it.

   Run with `npm run test:mobile-audit`. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, SIZES } = require('../_helpers/trackerFixture');

const IOS_TOTAL_BUDGET = 16777216;   // px, Safari's ceiling for all canvas memory

/* Both the stitching-style modal and the coachmark popover cover the chart and
   swallow synthetic taps — see the header of pan-cost.spec.js, which found
   this the hard way. The coachmark flags are individual localStorage entries
   under UserPrefs' cs_pref_ prefix, not one JSON blob. */
async function suppressOnboarding(page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['tracker', 'creator', 'manager', 'home']) localStorage.setItem('cs_welcome_' + k + '_done', '1');
      localStorage.setItem('cs_stitchStyle', 'block');
      for (const k of ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator',
        'import', 'undo', 'progress', 'save']) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      }
    } catch (e) {}
  });
}

/* Fail loudly rather than silently measuring a covered chart: every geometry
   assertion here is meaningless if a popover is on top of the tap point. */
async function expectChartUncovered(page, px, py) {
  const top = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? (el.tagName + ' ' + String(el.className || '')).trim().slice(0, 80) : 'none';
  }, [px, py]);
  expect(top, `something is covering the chart at ${px},${py}: ${top}`).toContain('CANVAS');
}

/* Emulate what Safari on an iPad actually reports: no deviceMemory, and a
   canvas that silently refuses anything past 4096 on a side. */
async function emulateIOSLimits(page) {
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'deviceMemory', { get: () => undefined, configurable: true }); } catch (e) {}
    const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      configurable: true,
      get() { return d.get.call(this); },
      set(v) { d.set.call(this, Math.min(v, 4096)); },
    });
  });
}

async function loadTracker(page, file) {
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(3000);
}

const canvasCensus = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].map(c => ({
    w: c.width, h: c.height, px: c.width * c.height,
  })).filter(c => c.px > 0);
  return {
    count: cs.length,
    totalPx: cs.reduce((s, c) => s + c.px, 0),
    biggest: cs.sort((a, b) => b.px - a.px)[0] || null,
  };
});

/* The chart scroller is an unclassed div inside .canvas-area — the one that
   actually overflows. Identified by geometry rather than by selector, which is
   how pan-cost.spec.js already finds it. */
const SCROLLER = () => {
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  return all.find(e => e.scrollWidth > e.clientWidth + 50 || e.scrollHeight > e.clientHeight + 50) || null;
};

test.describe('viewport-tiled chart', () => {
  for (const name of ['medium', 'large', 'huge']) {
    const { sW, sH } = SIZES[name];

    test(`${sW}x${sH}: every canvas together stays inside the iOS budget`, async ({ page }) => {
      await suppressOnboarding(page); await emulateIOSLimits(page);
      await loadTracker(page, fixtureFor(name));

      // Turn on the overlays a real highlight session would have, so the
      // census measures the configuration that used to allocate 4x the cap.
      await page.evaluate(() => {
        try {
          localStorage.setItem('cs_countAids', '1');
          document.dispatchEvent(new CustomEvent('cs:prefsChanged', { detail: { key: 'trackerCanvasTexture', value: false } }));
        } catch (e) {}
      });
      await page.waitForTimeout(500);

      const c = await canvasCensus(page);
      console.log(`CENSUS ${sW}x${sH} ` + JSON.stringify(c));
      expect(c.biggest.w).toBeLessThanOrEqual(4096);
      expect(c.biggest.h).toBeLessThanOrEqual(4096);
      // The point of the fix: the *sum*, not just the largest.
      expect(c.totalPx).toBeLessThanOrEqual(IOS_TOTAL_BUDGET);
    });

    test(`${sW}x${sH}: the chart actually paints`, async ({ page }) => {
      await suppressOnboarding(page); await emulateIOSLimits(page);
      await loadTracker(page, fixtureFor(name));
      // A tile that was allocated but never painted, or painted at the wrong
      // origin, reads back as uniform blank. Sample the middle of the chart
      // canvas and require some variety.
      const variety = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        const ctx = c.getContext('2d');
        const w = Math.min(200, c.width), h = Math.min(200, c.height);
        const d = ctx.getImageData(Math.floor(c.width / 2 - w / 2), Math.floor(c.height / 2 - h / 2), w, h).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        return seen.size;
      });
      console.log(`PAINTED ${sW}x${sH} distinctColours=${variety}`);
      expect(variety).toBeGreaterThan(2);
    });
  }

  test('the tile follows the scroller and keeps painting', async ({ page }) => {
    await suppressOnboarding(page); await emulateIOSLimits(page);
    await loadTracker(page, fixtureFor('large'));

    const before = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      return { left: c.style.left, top: c.style.top, w: c.width, h: c.height };
    });

    // Scroll a long way — much further than the overscan margin, so the tile
    // has to move rather than being reused.
    await page.evaluate((fn) => {
      const el = eval('(' + fn + ')')();
      el.scrollLeft = 2000; el.scrollTop = 2500;
      el.dispatchEvent(new Event('scroll'));
    }, SCROLLER.toString());
    await page.waitForTimeout(1200);

    const after = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 40, 40).data;
      const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
      return { left: c.style.left, top: c.style.top, w: c.width, h: c.height, distinct: seen.size };
    });
    console.log('TILE_MOVE ' + JSON.stringify({ before, after }));

    // The tile moved with the scroll...
    expect(after.left).not.toBe(before.left);
    // ...stayed the same size (it is viewport-bound, not content-bound)...
    expect(after.w).toBe(before.w);
    expect(after.h).toBe(before.h);
    // ...and painted the newly-exposed region rather than leaving it blank.
    expect(after.distinct).toBeGreaterThan(1);
  });

  test('a tap lands on the cell under it after the tile has moved', async ({ page }) => {
    // The coordinate conversion is the whole risk of tiling: the canvas's
    // pixel 0 is no longer chart pixel 0, so every screen->cell path has to
    // add the tile origin back. If that is missed, marking silently hits a
    // cell hundreds of stitches away — which no source-pattern test can see.
    await suppressOnboarding(page); await emulateIOSLimits(page);
    await loadTracker(page, fixtureFor('large'));

    await page.evaluate((fn) => {
      const el = eval('(' + fn + ')')();
      el.scrollLeft = 1500; el.scrollTop = 1800;
      el.dispatchEvent(new Event('scroll'));
    }, SCROLLER.toString());
    await page.waitForTimeout(1200);

    // Work out, independently of the canvas element, which cell is under a
    // chosen screen point. This oracle uses only the scroller's scroll offset
    // and rect, so it stays correct however the tile is positioned — that is
    // what makes it able to catch a dropped tile origin.
    const target = await page.evaluate((fn) => {
      const el = eval('(' + fn + ')')();
      const sr = el.getBoundingClientRect();
      const px = Math.round(sr.left + sr.width * 0.6);
      const py = Math.round(sr.top + sr.height * 0.6);
      const G = 28;
      const scs = Math.round(20 * (window.__zoomForTest || 1));
      const contentX = el.scrollLeft + (px - sr.left);
      const contentY = el.scrollTop + (py - sr.top);
      return {
        px, py, scs,
        gx: Math.floor((contentX - G) / scs),
        gy: Math.floor((contentY - G) / scs),
        tileLeft: document.querySelector('canvas').style.left,
      };
    }, SCROLLER.toString());

    await expectChartUncovered(page, target.px, target.py);
    // The test only says anything if the tile has actually left the origin —
    // at origin 0,0 the conversion is the identity and a dropped offset would
    // be invisible. -28px is `-G`, i.e. an unmoved tile.
    expect(target.tileLeft, 'tile never moved, so this test proves nothing').not.toBe('-28px');

    await page.mouse.click(target.px, target.py);
    // Past the tracker's 5 s autosave debounce, so `done` is on disk.
    await page.waitForTimeout(7000);

    // Read back what the app actually recorded. The saved `done` array is the
    // app's own answer to "which cell did that tap mark?", with no shared
    // arithmetic between it and the oracle above.
    const marked = await page.evaluate(() => new Promise((resolve) => {
      const req = indexedDB.open('CrossStitchDB');
      req.onerror = () => resolve({ error: 'open failed' });
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('projects', 'readonly');
        const all = tx.objectStore('projects').getAll();
        all.onsuccess = () => {
          const rows = (all.result || []).filter(p => p && p.done && p.settings);
          if (!rows.length) return resolve({ error: 'no saved project' });
          const p = rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
          const idx = [];
          for (let i = 0; i < p.done.length && idx.length < 8; i++) if (p.done[i]) idx.push(i);
          resolve({ sW: p.settings.sW, marked: idx, total: p.done.reduce((s, v) => s + (v ? 1 : 0), 0) });
        };
        all.onerror = () => resolve({ error: 'read failed' });
      };
    }));
    console.log('TAP_AFTER_SCROLL ' + JSON.stringify({ target, marked }));

    expect(marked.error, 'could not read the saved project back').toBeUndefined();
    expect(marked.marked.length, 'the tap marked nothing at all').toBeGreaterThan(0);
    // The cell the app marked must be the cell the oracle says was under the
    // finger. Without the tile origin this is out by tile.x/scs cells — 85 on
    // this fixture — so the assertion genuinely bites.
    const gotGx = marked.marked[0] % marked.sW;
    const gotGy = Math.floor(marked.marked[0] / marked.sW);
    expect({ gx: gotGx, gy: gotGy }).toEqual({ gx: target.gx, gy: target.gy });
  });

  test('the phone chart viewport is unchanged by the tablet height rule', async ({ page }) => {
    // The chart's max-height moved from inline 600px into CSS so tablets stop
    // showing the chart through a phone-sized letterbox. A phone is below the
    // 800px height breakpoint, so it must still resolve to 600px — the rule is
    // additive on tall screens and inert everywhere else.
    await suppressOnboarding(page); await emulateIOSLimits(page);
    await loadTracker(page, fixtureFor('large'));
    const r = await page.evaluate(() => {
      const el = document.querySelector('.tracker-chart-scroll');
      return el ? { maxHeight: getComputedStyle(el).maxHeight, innerH: window.innerHeight } : null;
    });
    console.log('PHONE_CHART_HEIGHT ' + JSON.stringify(r));
    expect(r).not.toBeNull();
    expect(r.maxHeight).toBe('600px');
  });

  test('a large pattern can be zoomed far enough to show symbols', async ({ page }) => {
    // §1.1 — the old clamp held a 400x500 chart at scs 9, below the 13 px
    // Tier 3 threshold, so symbols could never appear at any zoom.
    await suppressOnboarding(page); await emulateIOSLimits(page);
    await loadTracker(page, fixtureFor('large'));
    const ceiling = await page.evaluate(() => window.maxChartCellSize(400, 500));
    console.log('ZOOM_CEILING 400x500 scs=' + ceiling);
    expect(ceiling).toBeGreaterThanOrEqual(13);
  });
});
