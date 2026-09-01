/* What an idle tracker costs per second — R9 in
   reports/mobile-freeze-large-patterns.md.
   ═══════════════════════════════════════════════════════════════════════════
   `setLiveAutoElapsed` fires once a second while a stitching session is
   active (useAutoSession.js). TrackerApp is a single component with ~130
   useState, ~80 useEffect and no React.memo, so the claim in §1.4 is that the
   entire tree — palette rail, legend, toolbar — reconciles every second while
   the user is doing nothing at all.

   That claim was made from reading the code. This measures it.

   `React.createElement` calls are the metric: they count the element tree
   React builds on each render, they are deterministic, and unlike wall time
   they do not vary 4-5x between runs on this harness (see §H of
   mobile-experience-audit.md). The page is left strictly idle — no input, no
   scrolling — so anything counted is work the app did to itself. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');

const IDLE_MS = 10000;

async function openTracker(page, sizeName) {
  await page.addInitScript(() => {
    // Wrap createElement before any app script runs. Counting only starts
    // when __ceCount is zeroed after load, so mount cost is excluded.
    window.__ceCount = 0;
    window.__ceByType = {};
    const install = () => {
      if (!window.React || window.__cePatched) return false;
      window.__cePatched = true;
      const orig = window.React.createElement;
      window.React.createElement = function (type) {
        window.__ceCount++;
        // Attribute each element to a tag or component name, so the hot
        // subtree can be identified rather than guessed at.
        const k = typeof type === 'string' ? type
          : (type && (type.displayName || type.name)) || 'anon';
        window.__ceByType[k] = (window.__ceByType[k] || 0) + 1;
        return orig.apply(this, arguments);
      };
      return true;
    };
    if (!install()) {
      // React arrives via a plain <script>; poll briefly until it does.
      const iv = setInterval(() => { if (install()) clearInterval(iv); }, 10);
      setTimeout(() => clearInterval(iv), 15000);
    }
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor(sizeName));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(4000);
}

const SCROLLER_BOX = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('.canvas-area div, .canvas-area')];
  const el = all.find(e => e.scrollWidth > e.clientWidth + 50 || e.scrollHeight > e.clientHeight + 50);
  const b = el.getBoundingClientRect();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
});

test('a tracker sitting idle with no session started', async ({ page }) => {
  // The baseline the case below is measured against. The 1 Hz display timer
  // early-returns unless a session is running (useAutoSession.js), so a
  // freshly-opened chart nobody has touched should cost essentially nothing.
  await suppressOnboarding(page);
  await openTracker(page, 'large');
  expect(await page.evaluate(() => !!window.__cePatched),
    'React.createElement was never wrapped — nothing was measured').toBe(true);

  await page.evaluate(() => { window.__ceCount = 0; });
  await page.waitForTimeout(IDLE_MS);
  const elements = await page.evaluate(() => window.__ceCount);
  console.log('IDLE_RENDER_NO_SESSION ' + JSON.stringify({ elements, idleMs: IDLE_MS }));
  expect(elements).toBeLessThan(1000);
});

test('a tracker sitting idle *with* a live session', async ({ page }) => {
  // The case §1.4 is about: someone has stitched, so the session timer is
  // ticking, and they pause to look at the chart. Nothing is happening except
  // the clock — anything counted here is the app re-rendering itself.
  await suppressOnboarding(page);
  await openTracker(page, 'large');

  // Marking a stitch is what starts a session.
  const box = await SCROLLER_BOX(page);
  await page.mouse.click(Math.round(box.x + box.w * 0.4), Math.round(box.y + box.h * 0.4));
  await page.waitForTimeout(2500);

  await page.evaluate(() => { window.__ceCount = 0; window.__ceByType = {}; });
  await page.waitForTimeout(IDLE_MS);

  const r = await page.evaluate(() => ({
    elements: window.__ceCount,
    // fmtTime renders "0m", not "0:00", so the clock is identified by its
    // element rather than by a text pattern. It only mounts once a stitch has
    // been marked, which is also what starts the session.
    sessionVisible: !!document.querySelector('.info-strip-timer'),
    top: Object.entries(window.__ceByType).sort((a, b) => b[1] - a[1]).slice(0, 12),
  }));
  const perSecond = Math.round(r.elements / (IDLE_MS / 1000));
  console.log('IDLE_RENDER_SESSION ' + JSON.stringify({
    elements: r.elements, perSecond, idleMs: IDLE_MS, sessionVisible: r.sessionVisible,
  }));
  console.log('IDLE_RENDER_BREAKDOWN ' + JSON.stringify(r.top));

  expect(r.sessionVisible, 'no session clock — the 1 Hz timer is not running, so this measures nothing').toBe(true);
  // Measured 1 210/s before the chart rulers were memoised and 220/s after,
  // on this 400x500 fixture. 600/s leaves generous headroom for unrelated
  // churn while still catching a return to rebuilding the rulers every tick —
  // which would put this back over 1 000 immediately, and worse on a larger
  // pattern, since the rulers scale with the chart's dimensions.
  expect(perSecond).toBeLessThan(600);
});

test('the rulers are correct, and still track zoom', async ({ page }) => {
  // Memoising them is only safe if they still say the right thing. The chart
  // is 400x500, so the rulers must have exactly that many cells, be labelled
  // at the right interval, and re-render when the cell size changes.
  await suppressOnboarding(page);
  await openTracker(page, 'large');

  const read = () => page.evaluate(() => {
    const sticky = [...document.querySelectorAll('.tracker-chart-scroll > div')];
    const header = sticky[0];
    const body = sticky[1];
    const colCells = [...header.children].slice(1);          // first child is the corner box
    const rowCells = [...body.firstElementChild.children];
    const labelled = (cells) => cells.filter(c => (c.textContent || '').trim() !== '').length;
    return {
      cols: colCells.length,
      rows: rowCells.length,
      colLabelled: labelled(colCells),
      rowLabelled: labelled(rowCells),
      firstCol: (colCells[0].textContent || '').trim(),
      lastCol: (colCells[colCells.length - 1].textContent || '').trim(),
      cellW: Math.round(colCells[0].getBoundingClientRect().width),
    };
  });

  const before = await read();
  console.log('RULERS_BEFORE ' + JSON.stringify(before));
  expect(before.cols).toBe(400);
  expect(before.rows).toBe(500);
  // At scs 20 the step is 1, so every column carries a number.
  expect(before.colLabelled).toBe(400);
  expect(before.firstCol).toBe('1');
  expect(before.lastCol).toBe('400');
  expect(before.cellW).toBe(20);

  // Zoom out: the cell size changes, so the memo must recompute — both the
  // cell width and the labelling interval.
  await page.locator('canvas').first().click({ position: { x: 20, y: 20 }, force: true }).catch(() => {});
  for (let i = 0; i < 6; i++) { await page.keyboard.press('-'); await page.waitForTimeout(60); }
  await page.waitForTimeout(900);

  const after = await read();
  console.log('RULERS_AFTER ' + JSON.stringify(after));
  expect(after.cols).toBe(400);                     // still the whole chart
  expect(after.cellW).toBeLessThan(before.cellW);   // ...at a smaller cell size
  expect(after.colLabelled).toBeLessThan(before.colLabelled);  // ...and a sparser interval
});
