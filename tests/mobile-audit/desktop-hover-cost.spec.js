/* What moving the mouse across the chart costs — finding F4 of
   reports/track-view-performance-plan.md.
   ═══════════════════════════════════════════════════════════════════════════
   The hover crosshair is drawn with direct DOM writes, but each new cell the
   pointer enters also calls setHoverInfoCell() to update the bottom bar, and
   that re-renders TrackerApp. Sweeping across a wide chart is one full
   reconcile per stitch crossed.

   The sweep is 600 px in 60 steps at the default 20 px cell size: 30 cells.
   Reported as elements per cell crossed.

   F4 (fixed): measured 1 176 elements per cell (35 287 for the sweep). The
   bar's text is now written directly from refs, so the sweep must not
   re-render at all — and, since "renders nothing" would also be true of a
   bar that stopped updating, the bar must still name the cell and thread
   under the pointer. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes, chartBox } = require('../_helpers/perfProbes');

const STEPS = 60;
const SWEEP_PX = 600;

test('hover sweep across the large chart', async ({ page }) => {
  test.setTimeout(240000);
  await suppressOnboarding(page);
  await installProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(4000);

  const box = await chartBox(page);
  expect(box, 'no chart scroller found').not.toBeNull();
  const y = Math.round(box.y + box.h * 0.5);
  const x0 = Math.round(box.x + 80);
  await page.mouse.move(x0, y);
  await page.waitForTimeout(500);

  await resetProbes(page);
  for (let i = 1; i <= STEPS; i++) {
    await page.mouse.move(x0 + Math.round(SWEEP_PX * i / STEPS), y);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(500);
  const r = await readProbes(page);

  const cellPx = await page.evaluate(() => {
    const ruler = document.querySelector('.tracker-chart-scroll > div');
    const cell = ruler && ruler.children[1];
    return cell ? Math.round(cell.getBoundingClientRect().width) : null;
  });
  const cells = cellPx ? Math.floor(SWEEP_PX / cellPx) : null;
  const out = {
    sweepPx: SWEEP_PX, steps: STEPS, cellPx, cellsCrossed: cells,
    elements: r.elements,
    elementsPerCell: cells ? Math.round(r.elements / cells) : null,
    fills: r.fills,
    topTypes: r.topTypes.slice(0, 6),
  };
  console.log('HOVER_SWEEP ' + JSON.stringify(out));

  expect(r.reactWrapped, 'React.createElement was never wrapped').toBe(true);
  expect(cellPx, 'could not read the cell size from the ruler').toBeGreaterThan(0);
  // Was 35 287. Anything per-cell would be thousands; a little headroom for
  // unrelated timers.
  expect(r.elements, 'hovering re-rendered the tracker').toBeLessThan(200);

  // The bar names the stitch under the pointer: the last position of the
  // sweep, converted through the chart's own geometry.
  const expected = await page.evaluate(({ x, y }) => {
    const chart = document.querySelector('canvas[aria-label^="Cross stitch pattern grid"]');
    const ruler = document.querySelector('.tracker-chart-scroll > div');
    const cell = ruler.children[1].getBoundingClientRect();
    const col = Math.floor((x - cell.left) / cell.width) + 1;
    const rowCell = document.querySelector('.tracker-chart-scroll > div:nth-child(2)').firstElementChild.children[0].getBoundingClientRect();
    const row = Math.floor((y - rowCell.top) / rowCell.height) + 1;
    return { row, col, chart: !!chart };
  }, { x: x0 + SWEEP_PX, y });
  const bar = (await page.locator('.tracker-hover-bar').textContent()).replace(/ /g, ' ');
  console.log('HOVER_BAR ' + JSON.stringify({ bar, expected }));
  expect(bar).toContain(`Row: ${expected.row} `);
  expect(bar).toContain(`Col: ${expected.col}`);
  expect(bar).toMatch(/DMC \S+/);

  // Leaving the chart clears it.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  expect(await page.locator('.tracker-hover-bar').textContent()).toBe('—');
});
