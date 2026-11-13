// Shopping list "Bought" ticks: tick, adjust, add to stash, Undo.
// docs/stash-redesign/hub-and-stock-take-plan.md, Phase 1.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

const threads = {
  'dmc:310': { owned: 1, tobuy: false, partialStatus: null, min_stock: 0 },
  'dmc:3753': { owned: 2, tobuy: true, tobuy_qty: 1, partialStatus: null, min_stock: 0 },
};
const patterns = [{ id: 'fixture-0', title: 'Meadow', status: 'inprogress', threads: [{ id: '310', brand: 'DMC', qty: 3, unit: 'skeins' }, { id: '720', brand: 'DMC', qty: 2, unit: 'skeins' }] }];

async function stash(page) {
  return page.evaluate(async () => {
    const t = await StashBridge.getGlobalStash();
    return { 310: t['dmc:310'].owned, 720: (t['dmc:720'] || {}).owned || 0, 3753: t['dmc:3753'].owned, onList: !!t['dmc:3753'].tobuy };
  });
}

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
  await expect(page.locator('.stash-shop-row')).toHaveCount(3);
});

test('tick, adjust, add to stash and undo', async ({ page }) => {
  const add = page.locator('.stash-card-head').getByRole('button', { name: /to stash$/ });
  await expect(add).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Bought DMC 720' }).check();
  await page.getByRole('checkbox', { name: 'Bought DMC 3753' }).check();
  await page.getByRole('button', { name: 'One more: Skeins bought of DMC 3753' }).click();
  await expect(add).toHaveText('Add 4 skeins to stash');

  await add.click();
  await expect(page.locator('.stash-shop-row')).toHaveCount(1); // 310 is still short
  expect(await stash(page)).toEqual({ 310: 1, 720: 2, 3753: 4, onList: false });

  await page.getByRole('button', { name: /^Undo/ }).first().click();
  await expect(page.locator('.stash-shop-row')).toHaveCount(3);
  expect(await stash(page)).toEqual({ 310: 1, 720: 0, 3753: 2, onList: true });
});

test('unticking leaves the stash alone', async ({ page }) => {
  const box = page.getByRole('checkbox', { name: 'Bought DMC 310' });
  await box.check(); await box.uncheck();
  await expect(page.locator('.stash-card-head').getByRole('button', { name: 'Add ticked to stash' })).toBeDisabled();
  expect(await stash(page)).toEqual({ 310: 1, 720: 0, 3753: 2, onList: true });
});
