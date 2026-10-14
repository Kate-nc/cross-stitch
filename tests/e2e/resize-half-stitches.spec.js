const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { quietOnboarding, device } = require('./creator-helpers');

test.use(device('desktop'));
test.beforeEach(async ({ context }) => installLocalCdn(context));
const thread = { id: '403', brand: 'anchor', type: 'solid', rgb: [0, 0, 0] };

async function openFixture(page, modern = true) {
  await quietOnboarding(page);
  await page.addInitScript(() => {
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    localStorage.setItem('cs_pref_onboarding.coached.firstStitch_tracker', 'true');
    localStorage.setItem('cs_pref_onboarding.coached.rectSelect_tracker', 'true');
    localStorage.setItem('cs_stitchStyle', 'block');
  });
  await page.goto('/home.html');
  await page.evaluate(async ({ thread, modern }) => {
    const pattern = Array.from({ length: 100 }, () => ({ id: '__empty__' }));
    pattern[88] = { id: '310', type: 'solid' };
    const p = {
      id: 'proj_resize_half', version: 11, page: 'creator', name: 'Resize half regression',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      settings: { sW: 10, sH: 10, fabricCt: 14, isScratchMode: true },
      pattern, done: Array(100).fill(0), bsLines: [], parkMarkers: [], sessions: [], threadOwned: {},
      halfStitches: [[22, { fwd: thread }]], halfDone: [[22, { fwd: true }]],
      ...(modern ? { partialStitches: [[22, { BL: thread, TR: thread }]], partialDone: [[22, ['BL', 'TR']]] } : {}),
    };
    await ProjectStorage.save(p, { resurrect: true });
    ProjectStorage.setActiveProject(p.id);
  }, { thread, modern });
  await page.goto('/create.html');
  await page.waitForSelector('.cs-chart-scroll canvas');
}
const saved = page => page.evaluate(() => ProjectStorage.getActiveProject());
async function resize(page, edge, amount) {
  await page.getByRole('tab', { name: 'Canvas', exact: true }).click();
  await page.getByRole('button', { name: /^Resize canvas/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Resize canvas', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(edge, { exact: true }).fill(String(amount));
  await dialog.getByRole('button', { name: /^Apply resize/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to drawing', exact: true }).click();
}
async function expectPosition(page, w, h, idx) {
  await expect.poll(async () => {
    const p = await saved(page);
    return [p.settings.sW, p.settings.sH, p.halfStitches || [], p.halfDone || []];
  }).toEqual([w, h, idx === null ? [] : [[idx, { fwd: thread }]], idx === null ? [] : [[idx, { fwd: true }]]]);
  const p = await saved(page);
  expect((p.partialStitches || []).map(e => e[0])).toEqual(idx === null ? [] : [idx]);
  expect((p.partialDone || []).map(e => [e[0], e[1].slice().sort()])).toEqual(idx === null ? [] : [[idx, ['BL', 'TR']]]);
}

for (const modern of [true, false]) {
  test(`left expansion saves and Tracker marks the moved completed half (${modern ? 'both formats' : 'legacy only'})`, async ({ page }) => {
    await openFixture(page, modern);
    await resize(page, 'Left', 1);
    await expectPosition(page, 11, 10, 25);
    await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
    await expect.poll(async () => (await saved(page)).halfStitches[0][0]).toBe(22);
    expect((await saved(page)).halfDone).toEqual([[22, { fwd: true }]]);
    await page.getByRole('button', { name: 'Redo', exact: true }).first().click();
    await expectPosition(page, 11, 10, 25);
    // Open the persisted Creator save in the actual Tracker. One completed
    // half plus one untouched full stitch is 0.5 / 1.5, never 1 / 2.
    await page.goto('/stitch.html');
    const canvas = 'canvas[aria-label^="Cross stitch pattern grid"]';
    await page.waitForSelector(canvas);
    await expect(page.locator('.info-strip-pct')).toHaveText('33.3%');
    const point = await page.evaluate(sel => {
      const c = document.querySelector(sel), r = c.getBoundingClientRect(), tile = c.__chartTile || { x: 0, y: 0 };
      const scs = document.querySelector('.tracker-chart-scroll > div').children[1].getBoundingClientRect().width;
      return { x: r.left - tile.x + 28 + 3.25 * scs, y: r.top - tile.y + 28 + 2.75 * scs };
    }, canvas);
    await page.mouse.click(point.x, point.y);
    await expect(page.locator('.info-strip-pct')).toHaveText('0.0%');
    await expect.poll(async () => (await saved(page)).halfDone || []).toEqual([]);
    expect((await saved(page)).halfStitches[0][0]).toBe(25);
    // Reload verifies the mark was changed at the moved position and saved.
    await page.reload();
    await expect(page.locator('.info-strip-pct')).toHaveText('0.0%');
  });
}

for (const [edge, amount, w, h] of [['Left', -3, 7, 10], ['Right', -8, 2, 10], ['Top', -3, 10, 7], ['Bottom', -8, 10, 2]]) {
  test(`crop ${edge.toLowerCase()} removes both encodings and Undo/Redo saves them together`, async ({ page }) => {
    await openFixture(page);
    await resize(page, edge, amount);
    await expectPosition(page, w, h, null);
    await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
    await expectPosition(page, 10, 10, 22);
    await page.getByRole('button', { name: 'Redo', exact: true }).first().click();
    await expectPosition(page, w, h, null);
    await page.reload();
    await page.waitForSelector('.cs-chart-scroll canvas');
    await expectPosition(page, w, h, null);
  });
}
