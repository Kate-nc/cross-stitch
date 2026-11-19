// Palette that starts from the pattern; symbols you can change (P1-4, audit DRAW-05).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, generateLogo, isCompact, undoButton, zoomUntilScrollable } = require('./creator-helpers');
const { dispatchTouchSequence } = require('./touch-helpers');

async function openPaletteTab(page) {
  if (await isCompact(page)) {
    await page.locator('.creator-rail__colour').click();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
  }
  const tab = page.locator('.creator-sidebar-tab[data-tab-id="palette"]');
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

// The thread's symbol in Materials › Threads. That tab now opens with an
// Estimated use and purchases table, so look in the legend table (Sym column).
async function legendSymbol(page, id) {
  const legend = page.locator('table').filter({ has: page.locator('th', { hasText: /^Sym$/ }) }).first();
  const row = legend.locator('tr').filter({ has: page.locator('td', { hasText: new RegExp('^DMC ' + id + '$') }) }).first();
  return (await row.locator('td').first().textContent()).trim();
}

for (const name of ['desktop', 'Pixel 5']) {
  test.describe('Palette on ' + name, function() {
    test.use(device(name));

    test('shows only the pattern\'s colours until Add colour is tapped', async function({ page }) {
      await generateLogo(page);
      await openPaletteTab(page);
      const rows = page.locator('.pal-rows .pal-row');
      await expect(rows.first()).toBeVisible();
      const n = await rows.count();
      expect(n).toBeGreaterThan(1);
      expect(n).toBeLessThanOrEqual(15);
      // Each row is a colour in use, with its symbol on the swatch and a count.
      for (let i = 0; i < n; i++) {
        await expect(rows.nth(i).locator('.pal-row__swatch')).not.toHaveText('');
        expect(Number((await rows.nth(i).locator('.pal-row__count').textContent()).replace(/,/g, ''))).toBeGreaterThan(0);
      }
      // No catalogue yet.
      await expect(page.locator('.pal-pick-row')).toHaveCount(0);
      await expect(page.getByLabel('Search DMC palette')).toHaveCount(0);

      await page.getByRole('button', { name: 'Add colour' }).click();
      const picker = page.getByRole('region', { name: 'Add colour' });
      await expect(picker.getByRole('tab', { name: 'Suggested' })).toBeVisible();
      await expect(picker.getByRole('tab', { name: 'All DMC' })).toBeVisible();
      // Suggested opens first (no stash yet) with threads close to a pattern colour.
      await expect(picker.getByRole('tab', { name: 'Suggested' })).toHaveAttribute('aria-selected', 'true');
      await expect(picker.locator('.pal-pick-row').first()).toBeVisible();

      // All DMC: search plus colour-family chips.
      await picker.getByRole('tab', { name: 'All DMC' }).click();
      await picker.getByRole('button', { name: 'Blues' }).click();
      const blueCount = await picker.locator('.pal-pick-row').count();
      expect(blueCount).toBeGreaterThan(5);
      await picker.getByLabel('Search DMC palette').fill('797');
      await expect(picker.locator('.pal-pick-row')).toHaveCount(1);

      // Adding it puts it in the pattern's list.
      await picker.locator('.pal-pick-row').first().click();
      await expect(page.locator('.pal-rows .pal-row[data-colour-id="797"]')).toBeVisible();
      expect(await page.locator('.pal-rows .pal-row').count()).toBe(n + 1);
    });

    test('changing a symbol updates the Materials legend, and Undo puts it back', async function({ page }) {
      await generateLogo(page);
      await openPaletteTab(page);
      const first = page.locator('.pal-rows .pal-row').first();
      const ids = await page.locator('.pal-rows .pal-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-colour-id')));
      const id = ids.indexOf('310') >= 0 ? '310' : await first.getAttribute('data-colour-id');
      const row = page.locator('.pal-rows .pal-row[data-colour-id="' + id + '"]');
      const before = (await row.locator('.pal-row__swatch').textContent()).trim();

      await row.getByRole('button', { name: 'Change symbol for DMC ' + id }).click();
      const grid = page.getByRole('group', { name: 'Choose a symbol for DMC ' + id });
      await expect(grid).toBeVisible();
      // Only unused symbols are offered.
      const offered = await grid.locator('.pal-symbols__btn').allTextContents();
      const inUse = await page.locator('.pal-rows .pal-row__swatch').allTextContents();
      for (const s of inUse) expect(offered).not.toContain(s.trim());
      const pick = offered[offered.length - 1];
      await grid.getByRole('button', { name: 'Use symbol ' + pick }).click();
      await expect(grid).toHaveCount(0);
      await expect(row.locator('.pal-row__swatch')).toHaveText(pick);

      // Materials › Threads legend shows the new symbol.
      if (await isCompact(page)) await page.locator('.rpanel-backdrop').click({ position: { x: 10, y: 10 } });
      await page.getByRole('tab', { name: 'Materials' }).first().click();
      await page.getByRole('tab', { name: 'Threads', exact: true }).click();
      await expect.poll(() => legendSymbol(page, id)).toBe(pick);

      // Undo restores the old symbol.
      await page.getByRole('tab', { name: 'Edit' }).first().click();
      await undoButton(page).click();
      await page.getByRole('tab', { name: 'Materials' }).first().click();
      await page.getByRole('tab', { name: 'Threads', exact: true }).click();
      await expect.poll(() => legendSymbol(page, id)).toBe(before);
    });
  });
}

test.describe('Swatch symbols on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('tool-strip swatches show their symbol, and a long-press names the thread', async function({ page }) {
    await generateLogo(page);
    await page.locator('.creator-rail button[aria-label="More tools"]').click();
    const strip = page.getByRole('checkbox', { name: 'Show colour strip' });
    if (!(await strip.isChecked())) await strip.check();
    await page.locator('.tb-overflow-wrap > button[aria-label="More tools"]').click();
    // Let the post-generate toasts clear; they sit over the strip.
    await expect(page.locator('.creator-toast-container > *')).toHaveCount(0, { timeout: 15000 });
    const sw = page.locator('.swatch-scroll-inner button').first();
    await expect(sw.locator('.tb-swatch-sym')).not.toHaveText('');
    const pressedBefore = await sw.getAttribute('aria-pressed');
    const box = await sw.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await expect(page.getByRole('tooltip')).toHaveText(/^DMC \S+ .+ · [\d,]+ stitch(es)?$/, { timeout: 2000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // The long-press didn't also select the colour.
    await page.waitForTimeout(300);
    await expect(sw).toHaveAttribute('aria-pressed', pressedBefore);
  });

  test('choosing a thread on touch leaves Navigate on and a drag still pans (X2)', async function({ page }) {
    await generateLogo(page);
    const closeReady = page.locator('.ready-bar__close');
    if (await closeReady.isVisible().catch(() => false)) await closeReady.click();

    await expect(page.locator('.tb-mode-toggle [data-mode="navigate"]')).toHaveAttribute('aria-pressed', 'true');
    // Pick a different thread from the Palette drawer.
    await openPaletteTab(page);
    const secondRow = page.locator('.pal-rows .pal-row').nth(1);
    const secondId = await secondRow.getAttribute('data-colour-id');
    await secondRow.click();
    await expect(secondRow).toHaveAttribute('aria-pressed', 'true');
    // Choosing the selected thread again keeps it selected.
    await secondRow.click();
    await expect(secondRow).toHaveAttribute('aria-pressed', 'true');
    // Close the palette drawer.
    await page.locator('.rpanel-backdrop').click({ position: { x: 10, y: 10 } });
    // Navigate is still active; Paint is not pressed.
    await expect(page.locator('.tb-mode-toggle [data-mode="navigate"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.creator-rail__colour')).toHaveAttribute('aria-label', new RegExp('DMC ' + secondId + '\\b'));

    // A one-finger drag still pans the chart without making an edit.
    const box = await zoomUntilScrollable(page);
    const before = await box.evaluate((el) => el.scrollLeft + ',' + el.scrollTop);
    const b = await box.boundingBox();
    const x0 = b.x + b.width * 0.7, y0 = b.y + b.height * 0.6;
    const steps = [{ type: 'touchStart', touchPoints: [{ id: 1, x: x0, y: y0 }] }];
    for (let i = 1; i <= 12; i++) steps.push({ type: 'touchMove', touchPoints: [{ id: 1, x: x0 - i * 12, y: y0 - i * 6 }] });
    steps.push({ type: 'touchEnd', touchPoints: [] });
    await dispatchTouchSequence(page, steps);
    await expect.poll(() => box.evaluate((el) => el.scrollLeft + ',' + el.scrollTop)).not.toBe(before);
    await expect(undoButton(page)).toBeDisabled();
  });
});

test.describe('Choosing a thread on desktop (X2)', function() {
  test.use(device('desktop'));

  test('choosing a Palette row in Navigate selects working colour and Paint without highlighting; Show on chart highlights independently', async function({ page }) {
    await generateLogo(page);
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'false');

    const rows = page.locator('.pal-rows .pal-row');
    const row0 = rows.nth(0);
    const row1 = rows.nth(1);
    const id1 = await row1.getAttribute('data-colour-id');

    // Choose the second Palette row while in Navigate.
    await row1.click();
    await expect(row1).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Paint tool' })).toHaveAttribute('aria-pressed', 'true');
    // No highlight appears when choosing a thread.
    await expect(page.locator('.pal-row--hi')).toHaveCount(0);

    // Choosing the same row again keeps it selected.
    await row1.click();
    await expect(row1).toHaveAttribute('aria-pressed', 'true');

    // "Show on chart" on the first row toggles highlight without changing the working colour.
    const showBtn = row0.getByRole('button', { name: /Show on chart/i });
    await showBtn.click();
    await expect(showBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(row0).toHaveClass(/pal-row--hi/);
    await expect(row1).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.swatch-scroll-inner button[aria-pressed="true"]')).toHaveAttribute('aria-label', new RegExp('DMC ' + id1 + '\\b'));

    // Toggling "Show on chart" again clears highlight while keeping working colour.
    await showBtn.click();
    await expect(showBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.pal-row--hi')).toHaveCount(0);
    await expect(row1).toHaveAttribute('aria-pressed', 'true');
  });
});
