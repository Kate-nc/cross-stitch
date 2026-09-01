/* deviceEmulation.js — make a Playwright context actually look like the phone
   or tablet it claims to be.
   ═══════════════════════════════════════════════════════════════════════════
   Playwright's `devices[...]` descriptors set the viewport, user agent, touch
   support and device scale factor. They do **not** set
   `navigator.deviceMemory`, and Chromium reports 8 regardless — so every
   "phone" run in this repo has been taking the branch meant for an 8 GB
   machine. mobile-experience-audit.md §F flagged this, and it is why the
   phone and low-end arms of the canvas budget have never been exercised
   end-to-end despite having unit coverage.

   These helpers close that gap. Apply them before `page.goto`.

   Why it matters for the canvas budget specifically: the arms in
   useCanvasOverlays.js key on deviceMemory *and* on whether the device looks
   like a handheld, and the interesting failures live in the combinations —
   an Android tablet reporting 8 GB used to be indistinguishable from a
   desktop.
*/

/** Reported memory tiers. deviceMemory is spec-capped at 8 to limit
 *  fingerprinting, so 8 covers everything from an 8 GB phone upward. */
const MEMORY = {
  lowEnd: 1,      // budget Android
  midRange: 4,    // mid-tier Android
  highEnd: 8,     // flagship phone or tablet — and every desktop
  absent: undefined, // iOS Safari reports nothing
};

/**
 * Make navigator.deviceMemory report `gb` (or be absent when undefined).
 * @param {import('@playwright/test').Page} page
 * @param {number|undefined} gb
 */
async function emulateDeviceMemory(page, gb) {
  await page.addInitScript((value) => {
    try {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => value === null ? undefined : value,
        configurable: true,
      });
    } catch (e) {}
  }, gb === undefined ? null : gb);
}

/**
 * Emulate iOS Safari's canvas ceiling: a backing store wider than `maxSide`
 * is silently clamped rather than refused, which is what makes the failure
 * invisible on a real device.
 */
async function emulateCanvasSideLimit(page, maxSide) {
  await page.addInitScript((limit) => {
    for (const prop of ['width', 'height']) {
      const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, prop);
      Object.defineProperty(HTMLCanvasElement.prototype, prop, {
        configurable: true,
        get() { return d.get.call(this); },
        set(v) { d.set.call(this, Math.min(v, limit)); },
      });
    }
  }, maxSide);
}

/** Count every byte of canvas backing store the page has allocated. */
const canvasCensus = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')]
    .map(c => ({ w: c.width, h: c.height, px: c.width * c.height }))
    .filter(c => c.px > 0);
  return {
    count: cs.length,
    totalPx: cs.reduce((s, c) => s + c.px, 0),
    totalMB: +(cs.reduce((s, c) => s + c.px, 0) * 4 / 1048576).toFixed(1),
    biggest: cs.sort((a, b) => b.px - a.px)[0] || null,
  };
});

/** What the app decided about this device. */
const budgetReport = (page) => page.evaluate(() => ({
  area: window.canvasSizeLimits ? window.canvasSizeLimits().area : null,
  side: window.canvasSizeLimits ? window.canvasSizeLimits().side : null,
  perCanvas: window.chartPerCanvasBudget ? window.chartPerCanvasBudget() : null,
  deviceMemory: navigator.deviceMemory === undefined ? null : navigator.deviceMemory,
  coarse: matchMedia('(pointer: coarse)').matches,
  dpr: window.devicePixelRatio,
  viewport: [window.innerWidth, window.innerHeight],
}));

/** Suppress the onboarding modal and coachmarks that cover the chart. */
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

/** The innermost element that actually overflows — the chart scroller. */
const SCROLLER_FN = function () {
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  return all.find(e => e.scrollWidth > e.clientWidth + 50 || e.scrollHeight > e.clientHeight + 50) || null;
};

module.exports = {
  MEMORY,
  emulateDeviceMemory,
  emulateCanvasSideLimit,
  canvasCensus,
  budgetReport,
  suppressOnboarding,
  SCROLLER_FN,
};
