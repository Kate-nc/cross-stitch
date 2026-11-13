// Phone shopping checklist (hub plan, Phase 5).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

test.use({ viewport: { width: 390, height: 844 } });

const threads = {
  'dmc:310': { owned: 1, partialStatus: null, min_stock: 0, tobuy: false },
  'dmc:3753': { owned: 2, partialStatus: null, min_stock: 0, tobuy: true, tobuy_qty: 1 },
};
const patterns = [
  { id: 'p1', title: 'Meadow', status: 'inprogress', threads: [{ id: '310', brand: 'DMC', qty: 3, unit: 'skeins' }, { id: '720', brand: 'DMC', qty: 2, unit: 'skeins' }] },
  { id: 'p2', title: 'Harbour', status: 'wishlist', threads: [{ id: '3865', brand: 'DMC', qty: 1, unit: 'skeins' }] },
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
  await page.goto('/manager.html?from=home&tab=shopping');
  await expect(page.locator('.stash-shop-row')).toHaveCount(4);
});

test('rows are grouped by pattern, with threads added by hand last', async ({ page }) => {
  const titles = await page.locator('.stash-shop-group-title').allTextContents();
  expect(titles).toEqual(['Meadow', 'Harbour', 'Added by you']);
  await expect(page.locator('.stash-shop-group').first().locator('.stash-code')).toHaveText(['DMC 310', 'DMC 720']);
});

test('ticks survive a reload, and Done adds them and forgets them', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Bought DMC 720' }).check();
  await page.getByRole('checkbox', { name: 'Bought DMC 3753' }).check();
  const done = page.locator('.stash-shop-footer').getByRole('button', { name: 'Done: add 3 skeins' });
  await expect(done).toBeVisible();

  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Bought DMC 720' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Bought DMC 3753' })).toBeChecked();

  // The footer stays on screen while the page scrolls.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
  const box = await page.locator('.stash-shop-footer').boundingBox();
  expect(Math.round(box.y + box.height)).toBe(844);

  await done.click();
  await expect(page.locator('.stash-shop-row')).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('cs_stash_bought_v1'))).toBeNull();
  expect(await page.evaluate(async () => (await StashBridge.getGlobalStash())['dmc:720'].owned)).toBe(2);
});

test('ticks for threads that leave the list are forgotten', async ({ page }) => {
  await page.getByRole('checkbox', { name: 'Bought DMC 3865' }).check();
  await page.evaluate(() => StashBridge.updateThreadOwned('dmc:3865', 1)); // bought elsewhere
  await expect(page.locator('.stash-shop-row')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cs_stash_bought_v1'))).toBeNull();
});
