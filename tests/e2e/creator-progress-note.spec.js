// Stage 3: for a reopened project with marked stitches, a note above the
// chart says how much is stitched and that changing a marked stitch clears
// its mark, with how far the chosen tool reaches. Recolouring a marked
// stitch clears its mark and Undo brings back both. Replace colour and
// Regenerate say how far they reach before they run.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, generateLogo, undoButton, chooseTool, pickDarkSwatch, backToConvert } = require('./creator-helpers');

const stored = (page) => page.evaluate(async function() {
  var p = await window.ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
  return { done: Array.from(p.done || []), ids: p.pattern.map(function(c) { return c.id; }), w: p.settings.sW };
});

// Mark the first `n` stitches done, as the Tracker would, then reopen the
// project (written from Home, after the Creator's unload save).
async function stitchFirst(page, n) {
  await page.waitForFunction(function() { return !!localStorage.getItem('crossstitch_active_project'); });
  await expect(page.getByText('All changes saved').first()).toBeVisible({ timeout: 20000 });
  const creatorUrl = page.url();
  await page.goto('/home.html');
  await page.waitForFunction(function() { return !!window.ProjectStorage; });
  await page.waitForTimeout(1000);
  await page.evaluate(async function(count) {
    var p = await window.ProjectStorage.get(localStorage.getItem('crossstitch_active_project'));
    var done = new Array(p.pattern.length).fill(0), marked = 0;
    for (var i = 0; i < p.pattern.length && marked < count; i++) {
      if (p.pattern[i].id !== '__skip__' && p.pattern[i].id !== '__empty__') { done[i] = 1; marked++; }
    }
    p.done = done;
    await window.ProjectStorage.save(p);
  }, n);
  await page.goto(creatorUrl);
  await page.waitForSelector('.rpanel--edit', { state: 'attached', timeout: 20000 });
  await page.waitForTimeout(500);
}

// Screen position of a cell, from the status bar's X / Y readout.
async function cellPoint(page, x, y) {
  const box = await page.locator('.cs-chart-layer > canvas').boundingBox();
  async function at(px, py) {
    await page.mouse.move(px, py);
    await expect(page.locator('.tb-status')).toContainText('X: ');
    const m = (await page.locator('.tb-status').innerText()).match(/X: (\d+), Y: (\d+)/);
    return { x: +m[1] - 1, y: +m[2] - 1 };
  }
  // Two readouts far apart, both inside the part of the chart on screen.
  const view = await page.locator('.cs-chart-scroll').boundingBox();
  const left = Math.max(box.x, view.x) + 60, top = Math.max(box.y, view.y) + 60;
  const right = Math.min(box.x + box.width, view.x + view.width) - 80, bottom = Math.min(box.y + box.height, view.y + view.height) - 80;
  const a = await at(left, top), b = await at(right, bottom);
  const csx = (right - left) / (b.x - a.x), csy = (bottom - top) / (b.y - a.y);
  return { x: left + (x - a.x + 0.5) * csx, y: top + (y - a.y + 0.5) * csy };
}

test.describe('Progress note on a desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(120000);

  test('the note, the reach of the tool, a recoloured marked stitch and Undo', async function({ page }) {
    await generateLogo(page);
    await expect(page.locator('.stitched-banner')).toHaveCount(0);
    await stitchFirst(page, 200);

    const note = page.locator('.stitched-banner');
    await expect(note).toContainText('6% stitched. Changing a marked stitch clears its mark.');

    await pickDarkSwatch(page);
    await chooseTool(page, 'Paint tool');
    await expect(note.locator('[data-reach]')).toHaveText(' Paint changes one stitch at a time.');
    await chooseTool(page, 'Fill tool');
    await expect(note.locator('[data-reach]')).toHaveText(' Fill changes every joined stitch of the colour you click.');
    await chooseTool(page, 'Paint tool');

    // Paint one marked stitch whose colour differs from the working thread.
    const before = await stored(page);
    const working = await page.locator('.pal-row[aria-pressed="true"]').getAttribute('data-colour-id');
    // A marked stitch inside a patch of its own colour, so a click a little
    // off still lands on the same colour.
    const w = before.w;
    const idx = before.done.findIndex(function(d, i) {
      const id = before.ids[i];
      return d === 1 && id !== working && [i - 1, i + 1, i - w, i + w].every(function(j) { return before.ids[j] === id; }) &&
        [i - 2, i + 2].every(function(j) { return before.ids[j] === id; });
    });
    expect(idx).toBeGreaterThanOrEqual(0);
    const p = await cellPoint(page, idx % before.w, Math.floor(idx / before.w));
    await page.mouse.move(p.x, p.y);
    await expect(page.locator('.tb-status')).toContainText('X: ' + (idx % w + 1) + ', Y: ' + (Math.floor(idx / w) + 1));
    await page.mouse.click(p.x, p.y);
    await expect.poll(async function() { const s = await stored(page); return [s.ids[idx], s.done[idx]]; }, { timeout: 10000 }).toEqual([working, 0]);
    expect((await stored(page)).done.filter(Boolean).length).toBe(199);

    // One Undo brings back the colour and the mark.
    await undoButton(page).click();
    await expect.poll(async function() { const s = await stored(page); return [s.ids[idx], s.done[idx], s.done.filter(Boolean).length]; }, { timeout: 10000 })
      .toEqual([before.ids[idx], 1, 200]);
  });

  test('Replace colour and Regenerate say how far they reach before they run', async function({ page }) {
    await generateLogo(page);
    await stitchFirst(page, 200);
    const s = await stored(page);
    const id = s.ids[s.done.indexOf(1)];
    const marked = s.done.filter(function(d, i) { return d === 1 && s.ids[i] === id; }).length;

    await page.locator('[data-colour-id="' + id + '"] button[aria-label^="Replace "]').click();
    const dlg = page.getByRole('dialog').first();
    const reach = dlg.locator('[data-reach]');
    await expect(reach).toContainText('This changes every DMC ' + id + ' stitch in the whole pattern.');
    await expect(reach).toContainText(marked.toLocaleString('en-GB') + ' of them ' + (marked === 1 ? 'is' : 'are') + ' marked as stitched');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);

    await backToConvert(page);
    await page.locator('.cc-generate:visible, .cv-generate:visible').first().click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Regenerate will clear your progress' });
    await expect(confirm).toContainText('so it can change every stitch in the chart');
    await expect(confirm).toContainText('It clears the marks on all 200 marked stitches');
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    expect((await stored(page)).done.filter(Boolean).length).toBe(200);
  });
});
