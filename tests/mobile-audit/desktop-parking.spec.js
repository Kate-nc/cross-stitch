/* Parking and the guide crosshair on desktop.

   Pins down the behaviour from the parking / Navigate-mode work:
     - right-click parks the stitch in its own colour; again removes; a done
       stitch is refused; Ctrl+Z / Ctrl+Y undo and redo it
     - marking a parked stitch hides its marker; undo brings it back
     - the palette's P badge goes to where a thread is parked, cycling
     - Navigate mode is a hand tool: drag pans, a click toggles the guide,
       Esc clears it; the bar under the chart describes it and can clear it
     - arrow keys move the guide; Shift+F10 parks at it
     - a partial repaint (one stitch, the guide, a park) draws exactly what a
       full repaint would — the old fast path cut gaps in every line through
       a marked stitch */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const G = 28;
const CANVAS = 'canvas[aria-label^="Cross stitch pattern grid"]';
const TMP = path.join(__dirname, '..', '.tmp');

function fixture() {
  const sW = 60, sH = 60, total = sW * sH;
  if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
  const pattern = Array.from({ length: total }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' }));
  const done = Array(total).fill(0);
  done[3 * sW + 20] = 1; // (20,3) already stitched
  const file = path.join(TMP, 'desktop-parking.json');
  fs.writeFileSync(file, JSON.stringify({
    version: 9, page: 'tracker', name: 'Parking Fixture',
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern, done, totalTime: 0, sessions: [],
    // Lines through the cells the repaint test marks.
    bsLines: [{ x1: 14, y1: 0, x2: 14, y2: 60, color: '#1a3cff' }, { x1: 0, y1: 9, x2: 60, y2: 12, color: '#aa22aa' }],
    parkMarkers: [], hlRow: -1, hlCol: -1, threadOwned: {}, singleStitchEdits: [], halfStitches: [], halfDone: [],
    statsSessions: [], statsSettings: {}, savedZoom: 1, savedScroll: { left: 0, top: 0 },
  }));
  return file;
}

async function openTracker(page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['tracker', 'creator', 'manager', 'home']) localStorage.setItem('cs_welcome_' + k + '_done', '1');
      localStorage.setItem('cs_stitchStyle', 'block');
      localStorage.setItem('cs_sessionOnboardingDone', '1');
      for (const k of ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'])
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
    } catch (e) {}
  });
  await page.goto('/stitch.html?from=home', { waitUntil: 'load' });
  await page.locator('input[type="file"]').first().setInputFiles(fixture());
  await page.waitForSelector(CANVAS);
  await page.waitForTimeout(2000);
}

// Client point inside cell (gx, gy). The canvas is a tile of the chart.
const cellPoint = (page, gx, gy) => page.evaluate(({ CANVAS, G, gx, gy }) => {
  const c = document.querySelector(CANVAS), r = c.getBoundingClientRect(), t = c.__chartTile;
  const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
  return { x: r.left - t.x + G + (gx + 0.5) * scs, y: r.top - t.y + G + (gy + 0.5) * scs };
}, { CANVAS, G, gx, gy });
// Is a park marker drawn in (gx, gy)? Black marker inside its triangle.
const hasMarker = (page, gx, gy) => page.evaluate(({ CANVAS, G, gx, gy }) => {
  const c = document.querySelector(CANVAS), t = c.__chartTile;
  const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
  const d = c.getContext('2d').getImageData(Math.round((G + gx * scs + 6 - t.x) * t.scale), Math.round((G + (gy + 1) * scs - 6 - t.y) * t.scale), 1, 1).data;
  return d[0] < 90 && d[1] < 90 && d[2] < 90;
}, { CANVAS, G, gx, gy });
const doneCount = page => page.evaluate(() => parseInt(document.querySelector('.info-strip-counts').textContent.replace(/,/g, ''), 10));
const statusText = page => page.evaluate(() => document.querySelector('.tracker-hover-bar').textContent.replace(/\s+/g, ' '));
const scroll = page => page.evaluate(() => { const el = document.querySelector('.tracker-chart-scroll'); return { left: el.scrollLeft, top: el.scrollTop }; });
const setScroll = (page, left, top) => page.evaluate(({ left, top }) => {
  const el = document.querySelector('.tracker-chart-scroll'); el.scrollLeft = left; el.scrollTop = top; el.dispatchEvent(new Event('scroll'));
}, { left, top });
async function click(page, gx, gy, opts) {
  const p = await cellPoint(page, gx, gy);
  await page.mouse.click(p.x, p.y, opts);
  await page.waitForTimeout(250);
}
const navMode = async page => { await page.locator('button[title="Navigate (N)"]').click(); await page.waitForTimeout(300); };

test('right-click parks, removes and undoes; a done stitch is refused', async ({ page }) => {
  await openTracker(page);
  await click(page, 5, 5, { button: 'right' });
  expect(await hasMarker(page, 5, 5)).toBe(true);
  expect(await doneCount(page), 'right-click must not mark').toBe(1);

  await page.mouse.move(2, 2);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  expect(await hasMarker(page, 5, 5), 'undo removes the new marker').toBe(false);
  await page.keyboard.press('Control+y'); await page.waitForTimeout(300);
  expect(await hasMarker(page, 5, 5), 'redo puts it back').toBe(true);

  await click(page, 5, 5, { button: 'right' });
  expect(await hasMarker(page, 5, 5), 'right-click again removes it').toBe(false);

  await click(page, 20, 3, { button: 'right' });
  await expect(page.getByText('That stitch is already done')).toBeVisible();
  expect(await hasMarker(page, 20, 3)).toBe(false);
});

test('marking a parked stitch hides its marker; undo brings it back', async ({ page }) => {
  await openTracker(page);
  await click(page, 7, 7, { button: 'right' });
  expect(await hasMarker(page, 7, 7)).toBe(true);
  await click(page, 7, 7);
  expect(await hasMarker(page, 7, 7), 'a marker on a done stitch is spent').toBe(false);
  await page.mouse.move(2, 2);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  expect(await hasMarker(page, 7, 7), 'undoing the mark shows it again').toBe(true);
});

test('the palette P badge goes to where the thread is parked, cycling', async ({ page }) => {
  await openTracker(page);
  await click(page, 4, 4, { button: 'right' });
  await setScroll(page, 0, 900); await page.waitForTimeout(600);
  await click(page, 12, 50, { button: 'right' });
  await setScroll(page, 0, 0); await page.waitForTimeout(600);

  const badge = page.locator('.ppal-tile-park-btn').first();
  await expect(badge).toHaveAttribute('title', /Go to where DMC 310 is parked/);
  await page.mouse.move(2, 2);
  const seen = [];
  for (let i = 0; i < 2; i++) {
    await badge.click(); await page.waitForTimeout(1200);
    seen.push((await statusText(page)).match(/Row: (\d+) Col: (\d+)/).slice(1).join(','));
  }
  // Row,col of the two parked stitches: (4,4) and (12,50), 1-based.
  expect(seen.sort()).toEqual(['5,5', '51,13']);
});

test('Navigate mode: drag pans, a click toggles the guide, Esc and Clear guide clear it', async ({ page }) => {
  await openTracker(page);
  await navMode(page);
  const cursor = await page.evaluate(() => getComputedStyle(document.querySelector('.tracker-chart-scroll')).cursor);
  expect(cursor).toBe('grab');

  const s0 = await scroll(page);
  const p = await cellPoint(page, 20, 15);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x - 120, p.y - 80, { steps: 8 });
  await page.mouse.up(); await page.waitForTimeout(300);
  const s1 = await scroll(page);
  expect(s1.left - s0.left).toBeGreaterThan(110);
  expect(s1.top - s0.top).toBeGreaterThan(70);
  await page.mouse.move(2, 2);
  expect(await statusText(page), 'a drag does not place the guide').not.toMatch(/Guide/);

  await click(page, 10, 6);
  await page.mouse.move(2, 2);
  expect(await statusText(page)).toMatch(/Guide Row: 7 Col: 11 — DMC 310/);
  await click(page, 10, 6);
  await page.mouse.move(2, 2);
  expect(await statusText(page), 'clicking the guide cell clears it').not.toMatch(/Guide/);

  await click(page, 10, 6);
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  await page.mouse.move(2, 2);
  expect(await statusText(page), 'Esc clears it').not.toMatch(/Guide/);

  await click(page, 10, 6);
  await page.locator('.tracker-hover-bar__clear').click();
  await expect(page.locator('.tracker-hover-bar__clear')).toHaveCount(0);
});

test('arrow keys move the guide; Shift+F10 parks at it', async ({ page }) => {
  await openTracker(page);
  await navMode(page);
  await click(page, 6, 6);
  await page.locator(CANVAS).focus();
  await page.mouse.move(2, 2);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(300);
  expect(await statusText(page)).toMatch(/Guide Row: 17 Col: 9/);
  await expect(page.locator('.tracker-sr-only')).toHaveText(/Guide at row 17, column 9/);
  await page.keyboard.press('Shift+F10'); await page.waitForTimeout(300);
  expect(await hasMarker(page, 8, 16)).toBe(true);
});

test('partial repaints draw what a full repaint would', async ({ page }) => {
  await openTracker(page);
  // Start from a full repaint (the first paint after load can still be
  // fading in): toggling the backstitch layer off and on forces one without
  // moving the view.
  const fullRepaint = async () => { await page.keyboard.press('l'); await page.waitForTimeout(400); await page.keyboard.press('l'); await page.waitForTimeout(600); };
  await fullRepaint();
  await navMode(page);
  await click(page, 14, 10);                    // guide through the marked cells below
  await page.locator('button[title="Mark stitches (T)"]').click(); await page.waitForTimeout(300);
  for (const [x, y] of [[14, 4], [13, 10], [14, 10], [20, 10], [5, 9], [30, 10]]) await click(page, x, y);
  await click(page, 22, 6, { button: 'right' });
  await page.mouse.move(2, 2);

  await page.evaluate(CANVAS => {
    const c = document.querySelector(CANVAS);
    window.__fast = { d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, tile: JSON.stringify(c.__chartTile) };
  }, CANVAS);
  await fullRepaint();
  const d = await page.evaluate(CANVAS => {
    const c = document.querySelector(CANVAS), a = window.__fast;
    if (a.tile !== JSON.stringify(c.__chartTile)) return { moved: true };
    const b = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    // Chrome anti-aliases a line drawn through a clip up to ~40/255
    // differently; a gap or stale paint differs by 70+.
    let n = 0, max = 0;
    for (let i = 0; i < b.length; i++) { const v = Math.abs(a.d[i] - b[i]); if (v > 45) n++; if (v > max) max = v; }
    return { n, max };
  }, CANVAS);
  console.log('PARTIAL_REPAINT ' + JSON.stringify(d));
  expect(d.moved, 'the view moved between the two captures').toBeUndefined();
  expect(d.n, 'pixels where the fast path differs from a full repaint').toBe(0);
});

test('Esc closes the colour palette on a narrow window', async ({ page }) => {
  // Esc reads leftSidebarOpen, which the tracker's old hand-kept shortcut
  // deps list did not include; shortcuts now always run against the latest
  // render. Guards the behaviour either way.
  await page.setViewportSize({ width: 900, height: 900 });
  await openTracker(page);
  const backdrop = page.locator('.lpanel-backdrop');
  if (await backdrop.count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await expect(backdrop).toHaveCount(0);
  await page.getByRole('button', { name: /colour palette/i }).first().click();
  await page.waitForTimeout(400);
  // Cycle until the full palette is open (rail → open on some widths).
  for (let i = 0; i < 3 && !(await backdrop.count()); i++) {
    await page.getByRole('button', { name: /colour palette/i }).first().click();
    await page.waitForTimeout(400);
  }
  await expect(backdrop).toHaveCount(1);
  await page.mouse.move(2, 2);
  await page.keyboard.press('Escape');
  await expect(backdrop).toHaveCount(0);
});
