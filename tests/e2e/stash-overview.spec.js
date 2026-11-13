// The Stash Manager's Overview (hub plan, Phase 2).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

const threads = {
  'dmc:310': { owned: 1, min_stock: 2, partialStatus: null, tobuy: false },
  'dmc:798': { owned: 2, partialStatus: 'about-half', min_stock: 0, tobuy: false },
  'anchor:403': { owned: 1, partialStatus: null, min_stock: 0, tobuy: false },
};
const patterns = [
  { id: 'p-short', title: 'Meadow', status: 'wishlist', threads: [{ id: '310', brand: 'DMC', qty: 3, unit: 'skeins' }, { id: '720', brand: 'DMC', qty: 2, unit: 'skeins' }] },
  { id: 'p-ready', title: 'Delft Tile', status: 'wishlist', threads: [{ id: '798', brand: 'DMC', qty: 1, unit: 'skeins' }] },
];

test.beforeEach(async ({ page, context }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
  });
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
});

const tile = (page, name) => page.locator('.stash-tile').filter({ has: page.locator('.stash-tile-k', { hasText: new RegExp('^' + name + '$') }) });

test('opens on the Overview with totals from the stash', async ({ page }) => {
  await expect(page.getByRole('link', { name: /^Overview/ })).toHaveAttribute('aria-current', 'page');
  await expect(tile(page, 'Threads')).toContainText('3');
  await expect(tile(page, 'Threads')).toContainText('2 DMC, 1 Anchor');
  await expect(tile(page, 'Full skeins')).toContainText('4');
  await expect(tile(page, 'Full skeins')).toContainText('plus 1 opened skein');
  await expect(tile(page, 'To buy')).toContainText('4'); // 310 x2, 720 x2
  await expect(tile(page, 'Running low')).toContainText('1'); // 310: 1 of 2
  await expect(page.locator('.stash-ready-row').first()).toContainText('Delft Tile');
  await expect(page.locator('.stash-ready-row').first()).toContainText('100%');
});

test('tiles open the matching view', async ({ page }) => {
  for (const [name, filter] of [['Running low', /Running low/], ['Full skeins', /Opened/], ['Threads', /Owned/]]) {
    await page.getByRole('link', { name: /^Overview/ }).click();
    await tile(page, name).click();
    await expect(page.getByRole('radio', { name: filter })).toHaveAttribute('aria-checked', 'true');
  }
  await page.getByRole('link', { name: /^Overview/ }).click();
  await tile(page, 'To buy').click();
  await expect(page.getByRole('link', { name: /Shopping list/ })).toHaveAttribute('aria-current', 'page');
});

test('Buy next adds ticked threads to the stash', async ({ page }) => {
  await page.locator('.stash-overview').getByRole('checkbox', { name: 'Bought DMC 720' }).check();
  await page.locator('.stash-overview').getByRole('button', { name: 'Add 2 skeins to stash' }).click();
  await expect(page.locator('.stash-overview .stash-shop-row')).toHaveCount(1);
  expect(await page.evaluate(async () => (await StashBridge.getGlobalStash())['dmc:720'].owned)).toBe(2);
  await expect(tile(page, 'Threads')).toContainText('4');
});

test('typing in the Overview search carries on in Thread Stash', async ({ page }) => {
  await page.getByRole('searchbox', { name: 'Find a thread' }).pressSequentially('72');
  const box = page.getByRole('searchbox', { name: 'Search threads' });
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('72');
  await expect(page.getByText('Not in your stash')).toBeVisible();
});

test('Ready to start opens the pattern in the Pattern Library', async ({ page }) => {
  await page.locator('.stash-ready-row', { hasText: 'Delft Tile' }).click();
  await expect(page.getByRole('link', { name: /Pattern Library/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.mgr-rpanel')).toContainText('Delft Tile');
});
