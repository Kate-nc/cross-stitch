const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const keys = ['stashConflictsCollapsed', 'stashLowStockNeededCollapsed', 'stashLowStockNotNeededCollapsed'];
const ids = ['stash-conflicts', 'stash-low-needed', 'stash-low-unused'];
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
  await page.goto('/manager.html?from=home');
  for (let i = 0; i < 3; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'true');
});

test('independent persistence, keyboard access, live counts and returning alerts', async ({ page }) => {
  const before = await readInventory(page);
  await toggle(page, 0).focus(); await page.keyboard.press('Enter');
  await expect(toggle(page, 0)).toBeFocused();
  await toggle(page, 2).focus(); await page.keyboard.press('Space');
  await expect(toggle(page, 1)).toHaveAttribute('aria-expanded', 'true');
  for (const i of [0, 2]) {
    await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#' + ids[i] + '-body')).toBeHidden();
    const aria = await toggle(page, i).locator('xpath=ancestor::section').ariaSnapshot();
    expect(aria).toContain('(1)');
    expect(aria).not.toContain('These threads');
    expect(aria).not.toContain('own 1');
    expect(aria).not.toContain('have 1');
  }
  expect(await readInventory(page)).toEqual(before);
  await page.reload();
  for (const i of [0, 2]) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page, 1)).toHaveAttribute('aria-expanded', 'true');
  await toggle(page, 1).click();
  // External inventory actions refresh the counts, without touching preferences.
  await page.evaluate(() => StashBridge.updateThreadOwned('dmc:550', 1));
  await expect(toggle(page, 2)).toContainText('(2)');
  await expect(toggle(page, 2)).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(async () => {
    for (const key of ['dmc:310', 'dmc:321', 'dmc:550']) await StashBridge.updateThreadOwned(key, 2);
  });
  for (let i = 0; i < 3; i++) await expect(toggle(page, i)).toHaveCount(0);
  expect(await page.evaluate(keys => keys.map(k => UserPrefs.get(k)), keys)).toEqual([true, true, true]);
  await page.evaluate(async () => {
    for (const key of ['dmc:310', 'dmc:321', 'dmc:550']) await StashBridge.updateThreadOwned(key, 1);
  });
  for (let i = 0; i < 3; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page, 2)).toContainText('(2)');
  // Visit the library and return to inventory, then leave the page and return.
  await page.getByRole('button', { name: /Pattern Library/i }).click();
  await expect(toggle(page, 0)).toHaveCount(0);
  await page.getByRole('button', { name: /Thread Stash/i }).click();
  for (let i = 0; i < 3; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/home.html'); await page.goto('/manager.html?from=home');
  for (let i = 0; i < 3; i++) await expect(toggle(page, i)).toHaveAttribute('aria-expanded', 'false');
  // Expand and use the existing thread card's inventory control.
  await toggle(page, 1).click();
  await page.locator('#stash-low-needed-body [title="Open thread card for DMC 310"]').click();
  const row = page.locator('.mgr-rpanel .td-row').filter({ hasText: 'Full skeins' });
  await row.getByRole('button', { name: '+', exact: true }).click();
  await expect(row.locator('.num')).toHaveText('2');
  await expect(toggle(page, 1)).toHaveCount(0);
  await row.getByRole('button', { name: '-', exact: true }).click();
  await expect(toggle(page, 1)).toHaveAttribute('aria-expanded', 'true');
  expect((await readInventory(page)).threads['dmc:310'].owned).toBe(1);
});

test('headings fit phones and keep usable targets in light and dark themes', async ({ page }) => {
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (let i = 0; i < 3; i++) {
        await toggle(page, i).click();
        const bounds = await toggle(page, i).boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        await expect(toggle(page, i)).toContainText('(1)');
        await page.keyboard.press('Tab');
        await toggle(page, i).focus();
        expect(await toggle(page, i).evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
        await toggle(page, i).click();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});
