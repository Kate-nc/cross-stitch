/* Whole-colour "Mark all done" in the Stitch Tracker colour list: named for what it does, confirmed in the styled dialog
   with the exact count, reversible from the toast and from step Undo, and kept apart from selecting the colour. */
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { TRACKER_CANVAS } = require('./touch-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, opts = {}) {
  await page.addInitScript((o) => { try {
    localStorage.setItem('cs_stitchStyle', 'block');
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
    localStorage.setItem('cs_sessionOnboardingDone', '1');
    ['firstStitch_tracker', 'rectSelect_tracker', 'firstStitch_creator', 'import', 'undo', 'progress', 'save'].forEach(k => localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true'));
    localStorage.setItem('cs_pref_trackerMarkAllAs', JSON.stringify('today'));   // skip the catch-up question; it has its own spec
    if (o.parkLayers) localStorage.setItem('cs_parkLayers_proj_mcs', JSON.stringify(o.parkLayers));
  } catch (_) {} }, opts);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  return page.evaluate(async (o) => {
    const W = 20, H = 20;
    const pattern = Array.from({ length: W * H }, (_, i) => ({ id: i < 200 ? '310' : '321', type: 'solid', rgb: i < 200 ? [0, 0, 0] : [200, 0, 0] }));
    const done = new Array(W * H).fill(0);
    for (let i = 0; i < 20; i++) done[300 + i] = 1;            // 20 of the red stitches are already done
    if (o.blackFullDone) for (let i = 0; i < 200; i++) done[i] = 1;
    const side = { id: '310', rgb: [0, 0, 0], type: 'solid' };
    const halfStitches = o.halfs ? Array.from({ length: 4 }, (_, i) => [10 + i, { fwd: side, bck: side }]) : [];
    const bsLines = o.lines ? [{ x1: 0, y1: 5, x2: 3, y2: 5, colorId: '310' }, { x1: 0, y1: 6, x2: 3, y2: 6, colorId: '310' }, { x1: 0, y1: 7, x2: 3, y2: 7, colorId: '310' }] : [];
    const id = await ProjectStorage.save({ id: 'proj_mcs', name: 'MarkColour', settings: { sW: W, sH: H, fabricCt: 14 }, pattern, done, halfStitches, halfDone: [], bsLines,
      parkMarkers: [{ x: 3, y: 3, colorId: '310', rgb: [0, 0, 0], corner: 'BL' }, { x: 5, y: 3, colorId: '321', rgb: [200, 0, 0], corner: 'BL' }],
      originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: 200, symbol: 'A' }, { id: '321', type: 'solid', name: 'Red', rgb: [200, 0, 0], lab: [40, 60, 40], count: 200, symbol: 'B' }] });
    ProjectStorage.setActiveProject(id);
    return id;
  }, opts);
}
async function openTracker(page, opts) {
  const id = await seed(page, opts);
  await page.goto('/stitch.html?id=' + id);
  await page.waitForSelector(TRACKER_CANVAS);
  await page.waitForTimeout(800);
  await openPalette(page);
}
// The phone-sized palette chip cycles closed, narrow and open; press it until the colour list is there.
async function openPalette(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.locator('.ppal-tile-done-btn').count()) break;
    await page.evaluate(() => { const b = document.querySelector('button[aria-label="Open colour palette panel"]'); if (b) b.click(); });
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
}
const tile = (page, id) => page.locator('.ppal-tile', { has: page.locator('.ppal-tile-id', { hasText: new RegExp('^' + id + '$') }) });
const count = async (page, id) => (await tile(page, id).locator('.ppal-tile-count').textContent()).trim();
const dialog = (page) => page.getByRole('dialog');

test('the chip says what it does, and asks with the colour and the exact count', async ({ page }) => {
  await openTracker(page);
  const chip = tile(page, '310').locator('.ppal-tile-done-btn');
  await expect(chip).toHaveText('Mark all done');
  await expect(chip).toHaveAttribute('aria-label', 'Mark all done: DMC 310 Black');
  await chip.click();
  await expect(dialog(page)).toContainText('Mark all 200 stitches of DMC 310 Black as done?');
  // Cancel changes nothing.
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await count(page, '310')).toMatch(/^0\/200/);
});

test('marking a colour: toast Undo puts back exactly what was there', async ({ page }) => {
  await openTracker(page);
  const redBefore = await count(page, '321');
  await tile(page, '310').locator('.ppal-tile-done-btn').click();
  await dialog(page).getByRole('button', { name: 'Mark all done', exact: true }).click();
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: '200 stitches of DMC 310 Black marked as done' }).first()).toBeVisible();
  expect(await count(page, '310')).toMatch(/^200\/200/);
  // Now complete, the chip offers the reverse and is named for it. It never says Undo.
  await expect(tile(page, '310').locator('.ppal-tile-done-btn')).toHaveText('Mark all not done');
  await page.getByRole('button', { name: 'Undo 200 stitches' }).last().click();   // the newest toast (a dismissed one fades out first)
  await expect(tile(page, '310').locator('.ppal-tile-done-btn')).toHaveText('Mark all done');
  expect(await count(page, '310')).toMatch(/^0\/200/);
  expect(await count(page, '321')).toBe(redBefore);            // the other colour was never touched
});

test('marking a colour is one step: ordinary Undo reverses it, and unmarking asks as well', async ({ page }) => {
  await openTracker(page);
  await tile(page, '310').locator('.ppal-tile-done-btn').click();
  await dialog(page).getByRole('button', { name: 'Mark all done', exact: true }).click();
  expect(await count(page, '310')).toMatch(/^200\/200/);
  await page.keyboard.press('Control+z');                                    // the step Undo
  expect(await count(page, '310')).toMatch(/^0\/200/);
  // Mark again, then unmark through the chip.
  await tile(page, '310').locator('.ppal-tile-done-btn').click();
  await dialog(page).getByRole('button', { name: 'Mark all done', exact: true }).click();
  expect(await count(page, '310')).toMatch(/^200\/200/);
  await tile(page, '310').locator('.ppal-tile-done-btn').click();
  await expect(dialog(page)).toContainText('Mark all 200 stitches of DMC 310 Black as not done?');
  await dialog(page).getByRole('button', { name: 'Mark all not done', exact: true }).click();
  expect(await count(page, '310')).toMatch(/^0\/200/);
  await page.getByRole('button', { name: 'Undo 200 stitches' }).last().click();   // the newest toast (a dismissed one fades out first)
  expect(await count(page, '310')).toMatch(/^200\/200/);
});

test('the chip is its own 44 px target; tapping the row only selects the colour', async ({ page }) => {
  await openTracker(page);
  const t = tile(page, '310');           // the first row: a phone's floating Focus bar can cover the ones below
  const box = await t.locator('.ppal-tile-done-btn').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  expect(box.width).toBeGreaterThanOrEqual(43.5);
  // A tap on the row body (the colour name) selects the colour and opens no dialog.
  await t.locator('.ppal-tile-name').click();
  await expect(dialog(page)).toHaveCount(0);
  // On a narrow screen choosing a colour closes the list; open it again to see what was chosen.
  await openPalette(page);
  await expect(tile(page, '310')).toHaveClass(/ppal-tile--on/);
  // The selection marked nothing.
  expect(await count(page, '310')).toMatch(/^0\/200/);
});

test('the key explains the done and not-done look', async ({ page }) => {
  await openTracker(page);
  const key = page.getByRole('group', { name: 'Key to stitch colours' });
  await expect(key).toContainText('To stitch');
  await expect(key).toContainText('Stitched');
});

test('park markers: Clear all asks first, then Undo brings them back', async ({ page }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'Close palette panel' }).click();      // the open palette covers the toolbar on a narrow screen
  await page.waitForTimeout(400);
  await page.locator('button[title="More controls"]').click();
  await page.locator('.ppal-more-tab', { hasText: 'Layers' }).click();
  const clear = () => page.locator('#ppal-more-panel').getByRole('button', { name: 'Clear all', exact: true });
  // The More panel is itself a dialog, so find the confirmation by what it says.
  const confirm = () => page.getByRole('dialog').filter({ hasText: 'Remove all 2 park markers from the chart?' });
  await clear().click();
  await expect(confirm()).toBeVisible();
  await confirm().getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm()).toHaveCount(0);
  await expect(clear()).toBeVisible();                                 // cancelled: the markers are still there
  await clear().click();
  await confirm().getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(clear()).toHaveCount(0);                                // cleared: no park markers left to clear
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();   // the toast's Undo
  await expect(clear()).toBeVisible();                                 // and they are back
});

test('a key press behind the dialog is ignored, and a danger dialog starts on Cancel', async ({ page }) => {
  await openTracker(page);
  await tile(page, '310').locator('.ppal-tile-done-btn').click();
  await dialog(page).getByRole('button', { name: 'Mark all done', exact: true }).click();
  expect(await count(page, '310')).toMatch(/^200\/200/);
  // Unmarking is a danger dialog: it opens on Cancel, so Enter does not confirm it.
  await tile(page, '310').locator('.ppal-tile-done-btn').click();
  await expect(dialog(page)).toContainText('as not done?');
  await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  // Ctrl+Z with the question open must not undo the chart behind it.
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  await expect(dialog(page)).toHaveCount(1);
  await page.keyboard.press('Enter');                                   // Enter on Cancel closes it without confirming
  await expect(dialog(page)).toHaveCount(0);
  expect(await count(page, '310')).toMatch(/^200\/200/);               // neither the shortcut nor Enter changed anything
});

test('a colour with only half stitches left does not claim "every stitch" is done', async ({ page }) => {
  await openTracker(page, { blackFullDone: true, halfs: true });
  const chip = tile(page, '310').locator('.ppal-tile-done-btn');
  await expect(chip).toHaveText('Mark all done');                       // halves remain, so the colour is not complete
  await chip.click();
  await expect(dialog(page)).toHaveCount(0);                            // nothing to ask: no full stitch would change
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'Every full stitch of DMC 310 Black is already marked done.' }).first()).toBeVisible();
});

test('the Lines chip asks first, then Undo puts the lines back', async ({ page }) => {
  await openTracker(page, { lines: true });
  const chip = tile(page, '310').locator('.ppal-tile-bs-btn');
  await expect(chip).toHaveText('Mark all lines done');
  await expect(chip).toHaveAttribute('aria-label', 'Mark all lines done: DMC 310 Black');
  await chip.click();
  await expect(dialog(page)).toContainText('Mark all 3 backstitch lines of DMC 310 Black as done?');
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(chip).toHaveText('Mark all lines done');                 // cancelled: unchanged
  await chip.click();
  await dialog(page).getByRole('button', { name: 'Mark all lines done', exact: true }).click();
  await expect(chip).toHaveText('Mark all lines not done');
  await page.getByRole('button', { name: 'Undo 3 lines' }).last().click();
  await expect(chip).toHaveText('Mark all lines done');                 // exactly as before
});

test('park Clear all: Undo brings back which colours were hidden', async ({ page }) => {
  await openTracker(page, { parkLayers: { '321': false } });
  await page.getByRole('button', { name: 'Close palette panel' }).click();
  await page.waitForTimeout(400);
  await page.locator('button[title="More controls"]').click();
  await page.locator('.ppal-more-tab', { hasText: 'Layers' }).click();
  const panel = page.locator('#ppal-more-panel');
  const redLayer = panel.locator('label', { hasText: /^321/ }).locator('input');
  await expect(redLayer).not.toBeChecked();                             // hidden before
  await panel.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByRole('dialog').filter({ hasText: 'park markers from the chart?' }).getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(redLayer).not.toBeChecked();                             // and hidden again after Undo, not reset to visible
});
