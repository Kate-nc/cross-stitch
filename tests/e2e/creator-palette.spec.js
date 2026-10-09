// Palette that starts from the pattern; symbols you can change (P1-4, audit DRAW-05).
const { test, expect } = require('@playwright/test');
const { device, generateLogo, isCompact, undoButton } = require('./creator-helpers');

async function openPaletteTab(page) {
  if (await isCompact(page)) {
    await page.locator('.creator-rail__colour').click();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
  }
  const tab = page.locator('.creator-sidebar-tab[data-tab-id="palette"]');
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
}

async function legendSymbol(page, id) {
  const row = page.locator('tr').filter({ has: page.locator('td', { hasText: new RegExp('^' + id + '$') }) }).first();
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
      await expect.poll(() => legendSymbol(page, id)).toBe(pick);

      // Undo restores the old symbol.
      await page.getByRole('tab', { name: 'Edit' }).first().click();
      await undoButton(page).click();
      await page.getByRole('tab', { name: 'Materials' }).first().click();
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
    await expect(page.getByRole('tooltip')).toHaveText(/^DMC \S+ · .+ · [\d,]+ stitch(es)?$/, { timeout: 2000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // The long-press didn't also select the colour.
    await page.waitForTimeout(300);
    await expect(sw).toHaveAttribute('aria-pressed', pressedBefore);
  });
});
