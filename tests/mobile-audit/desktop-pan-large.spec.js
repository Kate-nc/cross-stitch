/* Panning and zooming the large chart with a mouse — the desktop half of the
   gaps in reports/track-pan-performance-audit.md.
   ═══════════════════════════════════════════════════════════════════════════
     1. Mouse pans (a drag in Navigate mode, the middle button, Space + drag)
        set React state when they started and ended: two full TrackerApp
        renders per drag (~3 500 elements in Navigate mode).
     2. Ctrl + wheel (and trackpad pinch, which arrives as wheel events)
        re-rendered and repainted per event; it now previews with a CSS
        transform and commits once when the events pause.
     3. Overlays (counting aids, focus dimming, ...) were redrawn over the
        whole tile on every tile move; they now keep their pixels as the
        chart does.
     4. Zooming or picking a colour scheduled a full save of the project
        (seconds of main thread on a phone for a large chart), and re-rendered
        the tracker around it; they now go to a small navigation record.

   On the 400 x 500, 60-colour fixture at 4x CPU, asserting on counts. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, fixturePalette } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes, chartBox, cpuThrottle, waitForSaved } = require('../_helpers/perfProbes');
const { installPanProbes, resetPanProbes, readPanProbes, fixtureWith, zoomPercent, cellAt, scrollFrames } = require('../_helpers/panProbes');
const { routeCdnLocally } = require('../_helpers/offlineCdn');

async function openLarge(page, fields, storage) {
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  if (storage) await page.addInitScript((kv) => { for (const k in kv) { try { localStorage.setItem(k, kv[k]); } catch (_) {} } }, storage);
  await installProbes(page);
  await installPanProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixtureFor('large', { doneFraction: 0.3 }), Object.assign({ savedZoom: 1, savedScroll: { left: 2000, top: 2000 } }, fields)));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(10000);  // The import is saved in full a few seconds after it opens, which re-renders the tracker: let that finish first.
  await waitForSaved(page);
}

const scrollPos = (page) => page.evaluate(() => { const s = document.querySelector('.tracker-chart-scroll'); return [s.scrollLeft, s.scrollTop]; });
const chartCursor = (page) => page.evaluate(() => getComputedStyle(document.querySelector('.tracker-chart-scroll')).cursor);

for (const how of ['navigate', 'middle', 'space']) {
  test(`a mouse pan (${how}) does not re-render the tracker`, async ({ page }) => {
    test.setTimeout(240000);
    await openLarge(page, how === 'navigate' ? { workingContext: { mode: 'navigate' } } : {});
    const box = await chartBox(page);
    const x = Math.round(box.x + box.w / 2), y = Math.round(box.y + box.h / 2);
    const cdp = await cpuThrottle(page, 4);
    await resetProbes(page);
    const s0 = await scrollPos(page);
    const cursors = [];
    for (let g = 0; g < 3; g++) {
      await page.mouse.move(x, y);
      if (how === 'space') await page.keyboard.down('Space');
      await page.mouse.down({ button: how === 'middle' ? 'middle' : 'left' });
      for (let k = 1; k <= 12; k++) {
        await page.mouse.move(x - k * 15, y - k * 8);
        if (k === 6) cursors.push(await chartCursor(page));
      }
      await page.mouse.up({ button: how === 'middle' ? 'middle' : 'left' });
      if (how === 'space') { cursors.push('held ' + await chartCursor(page)); await page.keyboard.up('Space'); }
      cursors.push('after ' + await chartCursor(page));
      await page.waitForTimeout(150);
    }
    const s1 = await scrollPos(page);
    const r = await readProbes(page);
    console.log('MOUSE_PAN ' + JSON.stringify({ how, scrolled: [s1[0] - s0[0], s1[1] - s0[1]], elements: r.elements, cursors }));

    expect(s1[0] - s0[0], 'the drags did not pan the chart').toBeGreaterThan(300);
    expect(r.reactWrapped, 'React.createElement was not wrapped — this measures nothing').toBe(true);
    expect(r.elements, `${r.elements} React elements for 3 ${how} pans`).toBe(0);
    // The cursor is still right without the re-render that used to set it.
    for (const c of cursors.filter((c) => !c.includes(' '))) expect(c).toBe('grabbing');
    if (how === 'space') for (const c of cursors.filter((c) => c.startsWith('held'))) expect(c).toBe('held grab');
    const resting = how === 'navigate' ? 'grab' : 'crosshair';
    for (const c of cursors.filter((c) => c.startsWith('after'))) expect(c).toBe('after ' + resting);
    await cdp.detach().catch(() => {});
  });
}

test('Ctrl + wheel zoom previews, then commits once, keeping the point under the pointer', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page);
  const box = await chartBox(page);
  const x = Math.round(box.x + box.w * 0.4), y = Math.round(box.y + box.h / 2);
  await page.mouse.move(x, y);
  const before = await cellAt(page, x, y);
  const zoom0 = await zoomPercent(page);
  const cdp = await cpuThrottle(page, 4);
  await resetProbes(page); await resetPanProbes(page);
  await page.keyboard.down('Control');
  for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(16); }
  await page.keyboard.up('Control');
  await page.waitForTimeout(800);
  const r = await readProbes(page), p = await readPanProbes(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const after = await cellAt(page, x, y);
  const zoom1 = await zoomPercent(page);
  const transform = await page.evaluate(() => document.querySelector('.tracker-chart-layer').style.transform);
  console.log('WHEEL_ZOOM ' + JSON.stringify({ zoom0, zoom1, before, after, elements: r.elements, ...p }));

  expect(zoom1, 'the wheel did not zoom in').toBeGreaterThan(zoom0 * 2);
  expect(transform, 'the zoom preview transform was left on the chart').toBe('');
  expect(Math.abs(after.cx - before.cx)).toBeLessThan(1);
  expect(Math.abs(after.cy - before.cy)).toBeLessThan(1);
  // Before: every one of the 25 events re-rendered and, as the cell size
  // grew, repainted the tile. Now: a commit per 1.6x rebase and one at the end.
  expect(p.paints, `${p.paints} chart paints for 25 wheel events`).toBeLessThanOrEqual(6);
  await cdp.detach().catch(() => {});
});

test('overlays keep their pixels when the tile moves', async ({ page }) => {
  test.setTimeout(240000);
  // Counting aids and Spotlight focus dimming on, in Highlight view.
  await openLarge(page,
    { workingContext: { view: 'highlight', colour: fixturePalette(60)[3].id, highlight: 'isolate' }, focusBlock: { bx: 11, by: 11 } },
    { cs_countAids: '1', cs_focusEnabled: '1' });
  const overlays = await page.evaluate(() => [...document.querySelectorAll('.tracker-chart-layer canvas')].filter((c) => c.style.zIndex !== '2' && c.width > 300).length);
  const cdp = await cpuThrottle(page, 4);
  await resetPanProbes(page);
  await scrollFrames(page, 24, 12, 150);
  const p = await readPanProbes(page);
  console.log('OVERLAY_MOVES ' + JSON.stringify({ overlays, ...p }));

  expect(overlays, 'no overlay canvases are showing — this measures nothing').toBeGreaterThanOrEqual(2);
  expect(p.chartCopies, 'the chart tile did not move').toBeGreaterThanOrEqual(5);
  // Each tile move copies each tile-sized overlay along with the chart, rather
  // than redrawing it over the whole tile.
  expect(p.overlayCopies, `${p.overlayCopies} overlay copies for ${p.chartCopies} tile moves`).toBeGreaterThanOrEqual(p.chartCopies * overlays);
  await cdp.detach().catch(() => {});
});

test('zooming and picking a colour do not save the project, and come back after a reload', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page);
  const box = await chartBox(page);
  await page.mouse.move(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
  await resetProbes(page); await resetPanProbes(page);
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(16); }
  await page.keyboard.up('Control');
  await page.locator('.ppal-tile').first().click();
  // Longer than the autosave's 5 s wait.
  await page.waitForTimeout(7000);
  const p = await readPanProbes(page);
  const zoom = await zoomPercent(page);
  const focused = await page.locator('.ppal-tile--on').count();
  console.log('NAV_NO_SAVE ' + JSON.stringify({ zoom, focused, saves: p.saves }));
  expect(focused, 'the colour click missed').toBe(1);
  expect(zoom, 'the wheel did not zoom').toBeGreaterThan(120);
  expect(p.saves, 'zooming or picking a colour started a full save').toBe(0);

  // The navigation record brings both back.
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(4000);
  expect(await zoomPercent(page), 'the zoom did not come back after a reload').toBe(zoom);
  expect(await page.locator('.ppal-tile--on').count(), 'the colour did not come back after a reload').toBe(1);
});

test('during a wheel zoom preview, hover names the stitch under the pointer and a plain wheel scroll stays put', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page);
  const box = await chartBox(page);
  const x = Math.round(box.x + box.w * 0.4), y = Math.round(box.y + box.h / 2);
  await page.mouse.move(x, y);
  const hoverCell = () => page.evaluate(() => {
    const m = /Row: (\d+)\s+Col: (\d+)/.exec(document.body.innerText);
    return m ? { row: +m[1], col: +m[2] } : null;
  });

  // Zoom in with Ctrl + wheel, then move the pointer while the preview is still showing (it commits 160 ms
  // after the last wheel event).
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(16); }
  await page.keyboard.up('Control');
  const preview = await page.evaluate(() => document.querySelector('.tracker-chart-layer').style.transform);
  await page.mouse.move(x + 37, y + 23);
  const hover = await hoverCell();
  const under = await cellAt(page, x + 37, y + 23);
  console.log('PREVIEW_HOVER ' + JSON.stringify({ preview, hover, under }));
  expect(preview, 'no zoom preview was showing — this measures nothing').toMatch(/scale/);
  // The hover bar's row and column are 1-based.
  expect(hover).toEqual({ row: Math.floor(under.cy) + 1, col: Math.floor(under.cx) + 1 });

  // Zoom again, and scroll with a plain wheel before the preview commits: the scroll must stick.
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(16); }
  await page.keyboard.up('Control');
  const beforeScroll = await cellAt(page, x + 37, y + 23);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(800);
  const settled = await cellAt(page, x + 37, y + 23);
  const cellPx = await page.evaluate(() => {
    const layer = document.querySelector('.tracker-chart-layer');
    const sW = +/(\d+) columns/.exec(document.getElementById('tracker-chart-summary').textContent)[1];
    return (parseFloat(layer.style.width) - 2) / sW;
  });
  console.log('PLAIN_WHEEL ' + JSON.stringify({ beforeScroll, settled, cellPx }));
  expect(await page.evaluate(() => document.querySelector('.tracker-chart-layer').style.transform)).toBe('');
  // The 300 px scroll moved the rows under the pointer. Before: the idle commit put the anchor from before the
  // scroll back, so the same stitch ended up under the pointer again.
  const rows = settled.cy - beforeScroll.cy;
  expect(rows, `the rows under the pointer moved ${rows.toFixed(2)}, not about ${(300 / cellPx).toFixed(2)}`).toBeGreaterThan(0.5 * 300 / cellPx);
  expect(rows).toBeLessThan(1.5 * 300 / cellPx);
});

test('navigation changed while a full save is queued is what that save stores', async ({ page }) => {
  test.setTimeout(240000);
  // Opening the fixture queues its first full save about 5 s later. Zoom and pick a colour before it runs.
  await routeCdnLocally(page);
  await suppressOnboarding(page);
  await installPanProbes(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(
    fixtureWith(fixtureFor('large', { doneFraction: 0.3 }), { savedZoom: 1, savedScroll: { left: 2000, top: 2000 } }));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(1500);
  const badge = () => page.evaluate(() => (document.querySelector('.tb-proj-badge-saved') || {}).textContent || '');
  expect(await badge(), 'the first save already ran — the test cannot queue navigation behind it').not.toMatch(/^Saved/);
  const box = await chartBox(page);
  await page.mouse.move(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(16); }
  await page.keyboard.up('Control');
  // The wheel preview commits 160 ms after the last event (a click on the colour list does not land it).
  await page.waitForTimeout(500);
  await page.locator('.ppal-tile').first().click();
  const zoom = await zoomPercent(page);
  // The queued save runs, after the navigation record was written.
  await waitForSaved(page);
  expect(zoom).toBeGreaterThan(120);

  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForTimeout(4000);
  const after = { zoom: await zoomPercent(page), focused: await page.locator('.ppal-tile--on').count() };
  console.log('QUEUED_SAVE_NAV ' + JSON.stringify({ zoom, after }));
  // Before: the queued save stored the zoom and context from when it was queued, with a newer time than the
  // navigation record, so the reload came back at 100% with no colour.
  expect(after.zoom, 'the zoom from before the queued save came back').toBe(zoom);
  expect(after.focused, 'the colour picked before the queued save did not come back').toBe(1);
});

test('hiding the page writes navigation still waiting for its second, without a full save', async ({ page }) => {
  test.setTimeout(240000);
  await openLarge(page);
  const id = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('cs_nav_')));
  expect(id, 'no navigation record after opening').toBeTruthy();
  const readNav = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), id);
  const before = await readNav();
  await resetPanProbes(page);
  const box = await chartBox(page);
  await page.mouse.move(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
  await page.keyboard.down('Control');
  for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -20); await page.waitForTimeout(16); }
  await page.keyboard.up('Control');
  // The wheel preview commits after 160 ms; the record would be written a second after that. Hide the page in
  // between, stopping timers first as a suspended page would.
  await page.waitForTimeout(300);
  const zoom = await zoomPercent(page);
  const written = await page.evaluate((k) => {
    const hi = setTimeout(() => {}, 0);
    for (let t = 0; t <= hi; t++) clearTimeout(t);   // a suspended page runs no timers
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    return JSON.parse(localStorage.getItem(k) || 'null');
  }, id);
  await page.waitForTimeout(1500);
  const p = await readPanProbes(page);
  console.log('HIDE_FLUSH ' + JSON.stringify({ zoom, before: before && before.zoom, written: written && written.zoom, saves: p.saves }));
  expect(written.at, 'hiding the page did not write the navigation record').toBeGreaterThan(before.at);
  expect(Math.round(written.zoom * 100)).toBe(zoom);
  expect(p.saves, 'hiding the page after a navigation change started a full save').toBe(0);
});
