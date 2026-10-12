/* Project Stats page on a phone (tracking audit STATS-08): no sideways scroll at 360, 393 and 430 px, the headline first,
   groups collapsed, charts readable without hover. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page) {
  await page.addInitScript(() => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
  } catch (_) {} });
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async () => {
    const W = 40, H = 40;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i % 2 ? '310' : '321', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
    const day = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    let total = 0;
    const offs = [-24, -22, -19, -17, -14, -11, -8, -5, -2, 0];
    const statsSessions = offs.map((o, i) => { const n = 60 + i * 15; total += n; return { id: 's' + i, date: day(o), startTime: day(o) + 'T10:00:00', endTime: day(o) + 'T10:40:00', durationSeconds: 2400, durationMinutes: 40, timingBasis: i % 3 === 0 ? 'timer' : undefined,
      stitchesCompleted: n, stitchesUndone: 0, netStitches: n, units: n, unitsCompleted: n, unitsUndone: 0, totalAtEnd: total, percentAtEnd: Math.round(total / 16) / 10, note: '', coloursWorked: ['310', '321'] }; });
    const done = new Array(W * H).fill(0); for (let i = 0; i < total; i++) done[i] = 1;
    const id = await ProjectStorage.save({ id: 'proj_p3b3', name: 'Phase3 batch3 with a fairly long project name', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, statsSessions,
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 800, symbol: 'A' }, { id: '321', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 800, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  });
}
async function openStats(page, id) {
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__openTrackerStats());
  await page.locator('.stats-dashboard').waitFor();
  await page.waitForTimeout(500);
}
async function overflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll('.stats-dashboard *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) out.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    });
    const dash = document.querySelector('.stats-dashboard');
    return { vw, docScroll: document.documentElement.scrollWidth, dashScroll: dash.scrollWidth, dashClient: dash.clientWidth, height: Math.round(dash.getBoundingClientRect().height), offenders: out.slice(0, 12) };
  });
}

for (const w of [360, 393, 430]) {
  test('width ' + w + ': the Stats page does not scroll sideways, and the headline is on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    const id = await seed(page);
    await openStats(page, id);
    const o = await overflow(page);
    expect(await page.evaluate(() => window.innerWidth)).toBe(w);          // nothing widened the page
    expect(o.docScroll).toBeLessThanOrEqual(o.vw);
    expect(o.dashScroll).toBeLessThanOrEqual(o.dashClient);
    expect(o.offenders).toEqual([]);
    // percent, today and the estimate with its basis are all above the fold
    const head = page.locator('.stats-overview');
    await expect(head).toContainText('Today');
    await expect(head).toContainText('This week');
    await expect(head.locator('.stats-estimate--headline')).toContainText(/Based on your last/);
    const box = await head.locator('.stats-estimate--headline').boundingBox();
    expect(box.y + box.height).toBeLessThan(800);
  });
}

test('the groups that are seldom needed start closed, open from the keyboard, and are remembered', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 });
  const id = await seed(page);
  await openStats(page, id);
  for (const t of ['Colour timeline', 'Sections', 'Comparison', 'Settings']) {
    const d = page.locator('details.stats-accordion', { hasText: t }).first();
    await expect(d).not.toHaveAttribute('open', '');
  }
  const sum = page.locator('details.stats-accordion summary', { hasText: 'Settings' });
  await sum.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Session timing for this project')).toBeVisible();
  // the page is shorter than before (about 4,000 px) with these closed
  const h = await page.evaluate(() => Math.round(document.querySelector('.stats-dashboard').getBoundingClientRect().height));
  expect(h).toBeLessThan(3400);
  // remembered
  await openStats(page, id);
  await expect(page.getByLabel('Session timing for this project')).toBeVisible();
});

test('charts can be read without hovering: a tap, or the slider from the keyboard, writes the value; and there is a table', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const id = await seed(page);
  await openStats(page, id);
  const readout = page.locator('.chart-section .chart-readout');
  await expect(readout).toContainText('Tap the chart');
  // cumulative: tap the chart
  const svg = page.locator('.chart-section svg').first();
  await expect(svg).toHaveAttribute('aria-label', /Progress over time: \d+(\.\d)?% done by/);
  await svg.scrollIntoViewIfNeeded();
  const b = await svg.boundingBox();
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
  await expect(readout).toContainText(/\d+ \w+: [\d,]+ of 1,600 stitches \(\d+(\.\d)?%\)/);
  const first = await readout.innerText();
  // the slider moves it, by keyboard
  const slider = page.locator('.chart-section .chart-scrub-range');
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(readout).not.toHaveText(first);
  await expect(slider).toHaveAttribute('aria-valuetext', /stitches/);
  // the same data as a table
  await page.locator('.chart-section details.chart-table summary').click();
  await expect(page.locator('.chart-section .chart-table table')).toBeVisible();
  await expect(page.locator('.chart-section .chart-table tbody tr').first()).toContainText('%');
  // daily bars
  await page.getByRole('button', { name: 'Daily', exact: true }).click();
  const dsvg = page.locator('.chart-section svg').first();
  await dsvg.scrollIntoViewIfNeeded();
  const db = await dsvg.boundingBox();
  await page.mouse.click(db.x + db.width * 0.97, db.y + db.height * 0.8);
  await expect(page.locator('.chart-section .chart-readout')).toContainText(/Today: \d+ stitches|\d+ \w+: \d+ stitches/);
  // speed
  await page.getByRole('button', { name: 'Speed', exact: true }).click();
  await page.locator('.chart-section .chart-scrub-range').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.chart-section .chart-readout')).toContainText(/stitches an hour/);
  // calendar: a day can be tapped
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.locator('.chart-section [role="button"][aria-label$="stitches"]').nth(5).click();
  await expect(page.locator('.chart-section .chart-readout')).toContainText(/stitches$/);
  // and the month as a table (every chart view has one)
  await page.locator('.chart-section details.chart-table summary').click();
  await expect(page.locator('.chart-section .chart-table caption')).toContainText('Stitches per day in');
  expect(await page.locator('.chart-section .chart-table tbody tr').count()).toBeGreaterThanOrEqual(28);
});

test('Progress info has a link to the Stats page', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const id = await seed(page);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  const cont = page.getByRole('button', { name: 'Continue stitching' });
  await cont.waitFor({ timeout: 4000 }).then(() => cont.click()).catch(() => {});
  await page.getByRole('button', { name: /Progress info/ }).click();
  await page.getByRole('button', { name: 'Open Stats', exact: true }).click();
  // this project's own page, the first time (the page starts on the all-projects tab)
  await expect(page.locator('.gsd-tab--on')).toContainText('Phase3 batch3');
  await expect(page.locator('.stats-overview')).toContainText('of 1,600 stitches');
});

test('a project with no colour data says so once, not on every colour', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  const id = await seed(page);
  await page.evaluate(async () => {
    const p = await ProjectStorage.get('proj_p3b3');
    p.statsSessions = p.statsSessions.map(s => Object.assign({}, s, { coloursWorked: [] }));
    await ProjectStorage.save(p);
  });
  await openStats(page, id);
  await page.locator('details.stats-accordion summary', { hasText: 'Colour timeline' }).click();
  const acc = page.locator('details.stats-accordion', { hasText: 'Colour timeline' });
  await expect(acc).toContainText('Which colours you worked on is recorded as you stitch');
  expect(await page.locator('.stats-dashboard').innerText()).not.toContain('No session data');
});
