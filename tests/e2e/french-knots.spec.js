// French knots (P4-4, audit DRAW-04 item 6): placed in the Creator, tracked
// in the Tracker.
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding } = require('./creator-helpers');

const G = 28;
const SW = 20, SH = 20;

// A 20 × 20 design: a row of DMC 310 along the top, one 666 in the corner.
function fixtureProject() {
  const pattern = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (y === 0) pattern.push({ id: '310', type: 'solid', rgb: [0, 0, 0] });
    else if (x === 19 && y === 19) pattern.push({ id: '666', type: 'solid', rgb: [227, 29, 66] });
    else pattern.push({ id: '__empty__', rgb: [255, 255, 255] });
  }
  return {
    version: 11, page: 'creator', name: 'Knot fixture',
    settings: { sW: SW, sH: SH, fabricCt: 14, isScratchMode: true },
    pattern, bsLines: [], done: null, halfStitches: [], halfDone: [], partialStitches: [],
    parkMarkers: [], sessions: [], threadOwned: {},
  };
}

async function openFixture(page, project) {
  await quietOnboarding(page);
  await page.goto('/home.html');
  await page.evaluate(async function(p) {
    p.id = 'proj_knottest';
    p.createdAt = p.updatedAt = new Date().toISOString();
    await window.ProjectStorage.save(p, { resurrect: true });
    window.ProjectStorage.setActiveProject(p.id);
  }, project || fixtureProject());
  await page.goto('/create.html');
  await page.waitForSelector('.cs-chart-scroll canvas', { timeout: 20000 });
  await page.waitForTimeout(500);
}

async function savedProject(page) {
  return page.evaluate(async function() { return ProjectStorage.getActiveProject(); });
}

// The screen point at (fx, fy) in cells: (3.5, 4.5) is the middle of cell
// (3, 4), (5, 5) the corner at the top left of cell (5, 5).
async function chartPoint(page, fx, fy) {
  const geo = await page.evaluate(function() {
    const c = document.querySelector('.cs-chart-scroll canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width };
  });
  const cs = (geo.width - G - 2) / SW;
  return { x: geo.left + G + fx * cs, y: geo.top + G + fy * cs };
}

async function touchTap(page, p) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(p.x), y: Math.round(p.y), radiusX: 4, radiusY: 4, force: 1 }],
  });
  await send('touchStart'); await send('touchEnd');
  await cdp.detach();
}

test.describe('French knots on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('knots are placed on a centre and a corner, and undone one at a time', async function({ page }) {
    await openFixture(page);
    await page.locator('.creator-rail button[aria-label="More tools"]').tap();
    await page.getByRole('button', { name: 'French knot stitch' }).tap();
    await touchTap(page, await chartPoint(page, 3.55, 4.45));
    await expect.poll(async () => ((await savedProject(page)).knots || []).length, { timeout: 10000 }).toBe(1);
    await touchTap(page, await chartPoint(page, 5.1, 4.9));
    await expect.poll(async () => ((await savedProject(page)).knots || []).length, { timeout: 10000 }).toBe(2);
    const knots = (await savedProject(page)).knots.map(k => [k.x, k.y]).sort();
    expect(knots).toEqual([[10, 10], [7, 9]].sort());

    await page.getByRole('button', { name: 'Undo', exact: true }).first().tap();
    await expect.poll(async () => ((await savedProject(page)).knots || []).length, { timeout: 10000 }).toBe(1);

    // The Tracker opens the same project with its knot: 21 stitches + 1 knot,
    // and marking the knot is 1 of 22.
    await page.addInitScript(function() {
      try {
        localStorage.setItem('cs_stitchStyle', 'block');
        localStorage.setItem('cs_sessionOnboardingDone', '1');
        ['firstStitch_tracker', 'rectSelect_tracker'].forEach(function(k) { localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'); });
      } catch (e) {}
    });
    await page.goto('/stitch.html');
    const canvas = 'canvas[aria-label^="Cross stitch pattern grid"]';
    await page.waitForSelector(canvas);
    await page.waitForTimeout(800);
    await expect(page.locator('.info-strip-pct')).toHaveText('0.0%');
    const k = (await savedProject(page)).knots[0];
    const p = await page.evaluate(function(a) {
      const c = document.querySelector(a.sel), r = c.getBoundingClientRect(), t = c.__chartTile || { x: 0, y: 0 };
      const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
      return { x: r.left - t.x + 28 + a.fx * scs, y: r.top - t.y + 28 + a.fy * scs };
    }, { sel: canvas, fx: k.x / 2, fy: k.y / 2 });
    await touchTap(page, p);
    await expect(page.locator('.info-strip-pct')).toHaveText('4.5%');
  });
});

// A Tracker project: 10 × 10 of DMC 310 with two knots in 666, one done.
function trackerProject() {
  const sW = 10, sH = 10;
  return {
    version: 11, page: 'tracker', name: 'Knot tracking',
    settings: { sW, sH, fabricCt: 14 },
    pattern: Array.from({ length: sW * sH }, () => ({ id: '310', type: 'solid', rgb: [0, 0, 0] })),
    done: Array(sW * sH).fill(0), bsLines: [], halfStitches: [], halfDone: [], partialStitches: [],
    parkMarkers: [], sessions: [], threadOwned: {}, statsSessions: [], statsSettings: {},
    knots: [{ x: 3, y: 3, id: '666', rgb: [227, 29, 66] }, { x: 8, y: 8, id: '666', rgb: [227, 29, 66] }],
    knotsDone: ['8,8'],
  };
}

test.describe('French knots in the Tracker', function() {
  test.setTimeout(90000);

  test('a tap on a knot marks it done, and progress counts it', async function({ page }) {
    await page.addInitScript(function() {
      try {
        ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
        localStorage.setItem('cs_stitchStyle', 'block');
        localStorage.setItem('cs_sessionOnboardingDone', '1');
        ['firstStitch_tracker', 'rectSelect_tracker', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
          localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
        });
      } catch (e) {}
    });
    await page.goto('/stitch.html?from=home');
    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'knots.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(trackerProject())),
    });
    const canvas = 'canvas[aria-label^="Cross stitch pattern grid"]';
    await page.waitForSelector(canvas);
    await page.waitForTimeout(800);
    // 100 stitches + 2 knots, one done: 1 / 102.
    await expect(page.locator('.info-strip-pct')).toHaveText('1.0%');

    // The knot at the middle of cell (1, 1).
    const p = await page.evaluate(function(sel) {
      const c = document.querySelector(sel), r = c.getBoundingClientRect(), t = c.__chartTile || { x: 0, y: 0 };
      const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
      return { x: r.left - t.x + 28 + 1.5 * scs, y: r.top - t.y + 28 + 1.5 * scs };
    }, canvas);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(q => ({ x: Math.round(q.x), y: Math.round(q.y), id: 1, radiusX: 4, radiusY: 4, force: 1 })) });
    await touch('touchStart', [p]); await page.waitForTimeout(50); await touch('touchEnd', []);

    // 2 / 102, and the stitch under the knot is still not done.
    await expect(page.locator('.info-strip-pct')).toHaveText('2.0%');
    await expect(page.locator('.info-strip-counts')).toContainText('0 done');
    await expect.poll(async () => page.evaluate(async () => {
      const proj = await ProjectStorage.getActiveProject();
      return proj && proj.knotsDone ? proj.knotsDone.slice().sort() : null;
    }), { timeout: 15000 }).toEqual(['3,3', '8,8']);

    // Undo takes the mark off again.
    await page.keyboard.press('Control+z');
    await expect(page.locator('.info-strip-pct')).toHaveText('1.0%');
  });
});
