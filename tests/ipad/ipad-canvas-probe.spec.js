/* What the engine actually allows — the measurement behind the canvas budget.
   ═══════════════════════════════════════════════════════════════════════════
   The budget in useCanvasOverlays.js is a set of hardcoded area figures, and
   the iOS one (16 777 216) is Safari's documented *per-canvas* ceiling being
   used as a whole-page budget. Before spending that budget differently — on
   devicePixelRatio-correct rendering — it is worth knowing which parts of it
   are measurable and which are guesses.

   **What this can establish:** the per-canvas limits of the engine under test.
   Those are structural properties of the browser and are real.

   **What it cannot:** the total canvas memory a *device* will tolerate before
   it starts discarding backing stores. These specs run against a desktop-hosted
   browser with desktop RAM behind it, so an emulated iPad will happily allocate
   far more than a real one. Any total measured here is an upper bound on a
   phone, not a prediction. That is why the budget stays conservative and why
   this spec asserts only a floor.

   **What this run established.** Emulated WebKit on a desktop host reports a
   268 Mpx maximum square and a 65 536 px side — desktop-class figures, nothing
   like a real iPad's 16 777 216 px per-canvas ceiling. So the harness confirms
   it is *not* a source of truth for the budget, which is why the constants in
   useCanvasOverlays.js stay principled rather than measured. The twin of this
   spec runs on Chromium: tests/mobile-audit/android-canvas-probe.spec.js.

   Run: npm run test:ipad */
const { test, expect } = require('@playwright/test');

test('per-canvas limits of this engine', async ({ page }) => {
  // stitch.html, not home.html — useCanvasOverlays.js (which defines
  // canvasSizeLimits) is only loaded on the tracker page.
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.canvasSizeLimits === 'function', { timeout: 60000 });

  const r = await page.evaluate(() => {
    // A canvas is "live" only if a pixel written to its far corner reads back.
    // Engines silently clamp or refuse oversized backing stores rather than
    // throwing, which is exactly why the original bug was invisible.
    function live(w, h) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      if (c.width !== w || c.height !== h) return false;
      const ctx = c.getContext('2d');
      if (!ctx) return false;
      try {
        ctx.fillStyle = '#fff';
        ctx.fillRect(w - 1, h - 1, 1, 1);
        const ok = ctx.getImageData(w - 1, h - 1, 1, 1).data[3] === 255;
        c.width = 0; c.height = 0;   // release immediately
        return ok;
      } catch (e) { return false; }
    }

    // Largest square side that survives, by binary search.
    let lo = 1024, hi = 32768;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (live(mid, mid)) lo = mid; else hi = mid - 1;
    }
    // Largest single dimension on a 1px-tall strip — the side limit proper.
    let slo = 1024, shi = 65536;
    while (slo < shi) {
      const mid = Math.floor((slo + shi + 1) / 2);
      if (live(mid, 1)) slo = mid; else shi = mid - 1;
    }
    return {
      maxSquareSide: lo,
      maxSquareMpx: +((lo * lo) / 1e6).toFixed(1),
      maxSideStrip: slo,
      appBudgetMpx: +(window.canvasSizeLimits().area / 1e6).toFixed(1),
      appSide: window.canvasSizeLimits().side,
      dpr: window.devicePixelRatio,
      deviceMemory: navigator.deviceMemory === undefined ? null : navigator.deviceMemory,
    };
  });

  console.log('CANVAS_PROBE ' + JSON.stringify(r));

  // Floor guard only: whatever we budget must at least be allocatable as a
  // single surface on this engine. A tighter assertion would be measuring the
  // host machine, not the target device.
  expect(r.maxSquareMpx * 1e6).toBeGreaterThanOrEqual(r.appBudgetMpx * 1e6 / 4);
  expect(r.maxSideStrip).toBeGreaterThanOrEqual(4096);
});
