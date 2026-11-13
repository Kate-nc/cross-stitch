const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
// The panels live on the Shopping list tab. "Low stash: not currently
// needed" is gone; the Thread Stash's Running low filter lists those threads.
const keys = ['stashConflictsCollapsed', 'stashLowStockNeededCollapsed'];
const ids = ['stash-conflicts', 'stash-low-needed'];
const SHOP = '/manager.html?from=home&tab=shopping';
const patterns = ['First', 'Second'].map((title, i) => ({ id: 'fixture-' + i, title, status: 'inprogress', threads: [{ id: '310', brand: 'DMC', qty: 1, unit: 'skeins' }] }));
const threads = { 'dmc:310': { owned: 1, min_stock: 2 }, 'dmc:321': { owned: 1, min_stock: 2 }, 'dmc:550': { owned: 2, min_stock: 2 } };
const toggle = (page, i) => page.locator('#' + ids[i] + '-heading button');
async function readInventory(page) {
  return page.evaluate(async () => {
    const db = await window.openManagerDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readonly'); const store = tx.objectStore('manager_state');
      const t = store.get('threads'), p = store.get('patterns');
      tx.oncomplete = () => resolve({ threads: t.result, patterns: p.result }); tx.onerror = () => reject(tx.error);
    });
  });
}
test.beforeEach(async ({ page, context }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
  });
  // Seed before mounting Manager so its autosave cannot race the fixture.
  await page.goto('/home.html');
  await page.evaluate(async ({ threads, patterns }) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('stitch_manager_db');
      req.onupgradeneeded = () => req.result.createObjectStore('manager_state');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readwrite'); const store = tx.objectStore('manager_state');
      store.put(threads, 'threads'); store.put(patterns, 'patterns'); store.put(4, 'stashDataVersion');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
  }, { threads, patterns });
  await page.goto(SHOP);
  for (let i = 0; i < ids.length; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'true');
});

test('independent persistence, keyboard access, live counts and returning alerts', async ({ page }) => {
  const before = await readInventory(page);
  await toggle(page, 0).focus(); await page.keyboard.press('Enter');
  await expect(toggle(page, 0)).toBeFocused();
  await expect(toggle(page, 0)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page, 1)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#' + ids[0] + '-body')).toBeHidden();
  const aria = await toggle(page, 0).locator('xpath=ancestor::section').ariaSnapshot();
  expect(aria).toContain('(1 thread)');
  expect(aria).not.toContain('own 1');
  expect(await readInventory(page)).toEqual(before);
  await page.reload();
  await expect(toggle(page, 0)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page, 1)).toHaveAttribute('aria-expanded', 'true');
  await toggle(page, 1).focus(); await page.keyboard.press('Space');
  await expect(toggle(page, 1)).toHaveAttribute('aria-expanded', 'false');
  // External inventory actions refresh the counts, without touching preferences.
  await page.evaluate(() => StashBridge.updateThreadOwned('dmc:310', 2));
  for (let i = 0; i < ids.length; i++) await expect(toggle(page, i)).toHaveCount(0);
  expect(await page.evaluate(keys => keys.map(k => UserPrefs.get(k)), keys)).toEqual([true, true]);
  await page.evaluate(() => StashBridge.updateThreadOwned('dmc:310', 1));
  for (let i = 0; i < ids.length; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  // Visit the library and return, then leave the page and return.
  await page.getByRole('link', { name: /Pattern Library/i }).click();
  await expect(toggle(page, 0)).toHaveCount(0);
  await page.getByRole('link', { name: /Shopping list/i }).click();
  for (let i = 0; i < ids.length; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/home.html'); await page.goto(SHOP);
  for (let i = 0; i < ids.length; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  // A panel row opens the thread in Thread Stash, editable in place.
  await toggle(page, 1).click();
  await page.locator('#stash-low-needed-body [title="Show DMC 310 in Thread Stash"]').click();
  const row = page.locator('.stash-row.is-open');
  await expect(row).toContainText('Black');
  await expect(row.locator('.stash-pill--low')).toBeVisible();
  await row.getByRole('button', { name: 'One more: Full skeins of DMC 310' }).click();
  await expect(row.getByRole('spinbutton', { name: 'Full skeins of DMC 310' })).toHaveValue('2');
  await expect(row.locator('.stash-pill--low')).toHaveCount(0);
  await row.getByRole('button', { name: 'One fewer: Full skeins of DMC 310' }).click();
  await expect(row.locator('.stash-pill--low')).toBeVisible();
  await expect.poll(async () => (await readInventory(page)).threads['dmc:310'].owned).toBe(1);
});

test('headings fit phones and keep usable targets in light and dark themes', async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (let i = 0; i < ids.length; i++) {
        await toggle(page, i).click();
        const bounds = await toggle(page, i).boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await expect(toggle(page, i)).toContainText('(1');
        await page.keyboard.press('Tab');
        await toggle(page, i).focus();
        expect(await toggle(page, i).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
        await toggle(page, i).click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
