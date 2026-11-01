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

   On the 400 x 500, 60-colour fixture at 4x CPU, asserting on counts. */
const { test, expect } = require('@playwright/test');
const { fixtureFor, fixturePalette } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');
const { installProbes, resetProbes, readProbes, chartBox, cpuThrottle } = require('../_helpers/perfProbes');
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
  await page.waitForTimeout(10000);
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
