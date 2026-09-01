/* Desktop-side regression checks for the mobile fixes: the canvas clamp and
   the transition/hover changes must not alter desktop behaviour. Runs at
   1440x900 with a fine pointer, where the zoom buttons actually exist. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '..', '.tmp');
function fixture(sW, sH) {
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `desk-${sW}x${sH}.json`);
  const total = sW * sH;
  const col = { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
  fs.writeFileSync(file, JSON.stringify({
    version: 9, page: 'tracker', name: `D ${sW}x${sH}`,
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern: new Array(total).fill(col), bsLines: [], done: new Array(total).fill(0),
    parkMarkers: [], totalTime: 0, sessions: [], hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: [{ ...col, name: 'Black', lab: [0, 0, 0], count: total }],
    singleStitchEdits: [], halfStitches: [], halfDone: [], statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  }), 'utf8');
  return file;
}

async function setup(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('cs_welcome_tracker_done', '1');
      localStorage.setItem('cs_welcome_manager_done', '1');
    } catch (e) {}
  });
}
async function loadTracker(page, file) {
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(2000);
}
const chart = (page) => page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')].map(c => ({ w: c.width, h: c.height, mpx: c.width * c.height }));
  return cs.sort((a, b) => b.mpx - a.mpx)[0] || null;
});

/* Effective cell size, read from the chart's scroll extent.
   The canvas is a viewport-sized tile now, so its `width` no longer tells you
   what zoom is applied — but the scroller still spans the whole chart, and its
   scrollWidth is `G + sW*scs + 2`. That is the invariant these tests are
   really about: how big the chart is, not how big its backing store is. */
const chartScs = (page, sW, sH) => page.evaluate(([w, h]) => {
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  const el = all.find(e => e.scrollWidth > e.clientWidth + 10 || e.scrollHeight > e.clientHeight + 10)
          || document.querySelector('.canvas-area');
  if (!el) return null;
  const G = 28;
  return {
    scrollW: el.scrollWidth, scrollH: el.scrollHeight,
    scsW: (el.scrollWidth - G - 2) / w, scsH: (el.scrollHeight - G - 2) / h,
  };
}, [sW, sH]);
const zoomPct = (page) => page.evaluate(() => {
  const el = document.querySelector('.tb-zoom-pct');
  return el ? el.textContent.trim() : null;
});

// There are no zoom buttons in the current tracker chrome; zoom is
// ctrl+wheel, pinch, or the "=" / "-" shortcuts. The shortcuts are the only
// input this harness can drive reliably, and they run through setStitchZoom —
// the wrapper the clamp lives in.
async function zoomKey(page, key, times) {
  await page.locator('canvas').first().click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
  for (let i = 0; i < times; i++) { await page.keyboard.press(key); await page.waitForTimeout(60); }
  await page.waitForTimeout(900);
}

test('desktop still reaches 400% zoom on a small pattern (clamp is inert)', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(60, 60));
  await zoomKey(page, '=', 40);             // zoom all the way in
  const s = await chartScs(page, 60, 60);
  console.log('DESK_MAXZOOM ' + JSON.stringify(s));
  // 60x60 is far inside every budget, so the pre-existing zoom ceiling of 4
  // (scs 80) must still be reachable.
  expect(s.scsW).toBe(80);
});

test('desktop zoom out still works', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(60, 60));
  await zoomKey(page, '=', 8);
  const before = (await chartScs(page, 60, 60)).scsW;
  await zoomKey(page, '-', 5);
  const after = (await chartScs(page, 60, 60)).scsW;
  console.log('DESK_ZOOMOUT ' + JSON.stringify({ before, after }));
  expect(after).toBeLessThan(before);
});

test('desktop: zoom-in on a large pattern is no longer capped by pattern size', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(200, 250));
  await zoomKey(page, '=', 40);
  const s = await chartScs(page, 200, 250);
  const c = await chart(page);
  console.log('DESK_LARGE_ZOOMED ' + JSON.stringify({ scs: s, canvas: c }));
  // The surface is viewport-sized, so a 200x250 chart reaches the same 400%
  // ceiling a 60x60 one does — it used to saturate at scs 51.
  expect(s.scsW).toBe(80);
  // ...and the backing store stays small while it does so, which is the whole
  // point: this used to be 130 Mpx.
  expect(c.w * c.h).toBeLessThanOrEqual(16777216);
});

test('desktop: a large pattern is not clamped on a high-memory device', async ({ page }) => {
  await setup(page);
  await loadTracker(page, fixture(200, 250));
  const s = await chartScs(page, 200, 250);
  console.log('DESK_LARGE ' + JSON.stringify(s));
  // Default zoom 1 must still mean scs 20 — no silent clamp on load.
  expect(s.scsW).toBe(20);
  // The vertical extent carries one extra pixel from the column ruler's
  // bottom border, so assert the raw extent rather than a derived cell size.
  expect(s.scrollH).toBe(250 * 20 + 28 + 2 + 1);
});

test('desktop: the chart viewport height is unchanged', async ({ page }) => {
  // The chart's max-height moved from an inline 600px to CSS so tablets could
  // use their screen. At this viewport (900px tall) the new rule evaluates to
  // max(600px, min(900-300, 1000)) = 600px — i.e. exactly what it was. This
  // pins that: the change adds height on tall screens and touches nothing
  // else.
  await setup(page);
  await loadTracker(page, fixture(200, 250));
  const r = await page.evaluate(() => {
    const el = document.querySelector('.tracker-chart-scroll');
    return el ? { maxHeight: getComputedStyle(el).maxHeight, clientH: el.clientHeight } : null;
  });
  console.log('DESK_CHART_HEIGHT ' + JSON.stringify(r));
  expect(r).not.toBeNull();
  expect(r.maxHeight).toBe('600px');
});

test('desktop: the mass hover-wrap did not disable hover', async ({ page }) => {
  // 144 hover rules were wrapped in @media (hover: hover) to stop them
  // latching on touch. On a fine pointer they must all still resolve — a
  // mis-wrap would silently kill every hover affordance in the app.
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  // .mgr-chip:hover changes colour, not background — read the property the
  // rule actually sets.
  const chip = page.locator('.mgr-chip:not(.on)').first();
  await expect(chip).toBeVisible();
  const read = () => chip.evaluate(el => getComputedStyle(el).color);
  const before = await read();
  await chip.hover();
  await page.waitForTimeout(400);
  const after = await read();
  console.log('DESK_HOVER_LIVE ' + JSON.stringify({ before, after }));
  expect(after, '.mgr-chip:hover must still resolve on a fine pointer').not.toBe(before);
});

test('desktop hover styling still applies', async ({ page }) => {
  await setup(page);
  await page.goto('/home.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    hoverMQ: matchMedia('(hover: hover) and (pointer: fine)').matches,
    transitionProp: getComputedStyle(document.querySelector('button')).transitionProperty,
  }));
  console.log('DESK_HOVER ' + JSON.stringify(r));
  expect(r.hoverMQ).toBe(true);          // hover rules are live on desktop
  expect(r.transitionProp).not.toBe('all');
});

test('desktop manager keeps its 280px side panel', async ({ page }) => {
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const el = document.querySelector('.mgr-rpanel');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { width: cs.width, position: cs.position, borderLeft: cs.borderLeftWidth };
  });
  console.log('DESK_MGR_PANEL ' + JSON.stringify(r));
  expect(r.position).toBe('relative');
  expect(r.width).toBe('280px');
  expect(r.borderLeft).not.toBe('0px');
});

test('desktop manager filter bar does not overflow the page', async ({ page }) => {
  await setup(page);
  await page.goto('/manager.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.mgr-filter-bar');
    const input = bar && bar.querySelector('input');
    return {
      icb: document.documentElement.clientWidth,
      scrollW: document.documentElement.scrollWidth,
      barScrollW: bar ? bar.scrollWidth : null,
      barClientW: bar ? bar.clientWidth : null,
      inputW: input ? Math.round(input.getBoundingClientRect().width) : null,
    };
  });
  console.log('DESK_FILTERBAR ' + JSON.stringify(r));
  expect(r.scrollW).toBeLessThanOrEqual(r.icb + 1);
  expect(r.inputW).toBeGreaterThan(150);      // search box did not collapse
});
