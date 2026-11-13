// Stock-take (hub plan, Phase 4): count threads, then Undo all.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

const threads = {
  'dmc:310': { owned: 4, partialStatus: null, min_stock: 0, tobuy: false },
  'dmc:798': { owned: 3, partialStatus: null, min_stock: 0, tobuy: false },
  'anchor:403': { owned: 1, partialStatus: null, min_stock: 0, tobuy: false },
};

async function stash(page) {
  return page.evaluate(async () => {
    const t = await StashBridge.getGlobalStash();
    const v = k => t[k] ? [t[k].owned || 0, t[k].partialStatus || null] : [0, null];
    return { 310: v('dmc:310'), 798: v('dmc:798'), 720: v('dmc:720'), 403: v('anchor:403') };
  });
}

test.beforeEach(async ({ page, context }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    ['tracker', 'creator', 'manager', 'home'].forEach(k => localStorage.setItem('cs_welcome_' + k + '_done', '1'));
  });
  await page.goto('/home.html');
  await page.evaluate(async threads => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('stitch_manager_db');
      req.onupgradeneeded = () => req.result.createObjectStore('manager_state');
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readwrite'); const store = tx.objectStore('manager_state');
      store.put(threads, 'threads'); store.put([], 'patterns'); store.put(4, 'stashDataVersion');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    }); db.close();
  }, threads);
  await page.goto('/manager.html?from=home&tab=inventory');
  await page.getByRole('button', { name: 'Add threads', exact: true }).click();
  await page.getByRole('button', { name: /^Stock-take/ }).click();
  await expect(page.getByRole('dialog', { name: 'Stock-take' })).toBeVisible();
});

test('count three threads, then Undo all', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Stock-take' });
  const next = dialog.getByRole('textbox', { name: 'Next thread' });
  const saveNext = dialog.getByRole('button', { name: 'Save, next' });

  await next.fill('310');
  await expect(dialog.locator('#stash-st-match')).toHaveText('DMC 310 Black');
  await saveNext.click();
  await expect(dialog.getByText('Was 4 full skeins')).toBeVisible();
  await dialog.getByRole('button', { name: 'One more: Full skeins of DMC 310' }).click();

  await next.fill('798');
  await saveNext.click();
  await dialog.getByRole('radio', { name: '½' }).click();

  await next.fill('720'); // not in the stash yet
  await saveNext.click();
  await dialog.getByRole('button', { name: 'One more: Full skeins of DMC 720' }).click();
  await dialog.getByRole('button', { name: 'One more: Full skeins of DMC 720' }).click();

  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog.locator('.stash-st-sum')).toHaveText('Counted 3 threads: 0 unchanged, 2 changed, 1 new.');
  await expect.poll(() => stash(page)).toEqual({ 310: [5, null], 798: [3, 'about-half'], 720: [2, null], 403: [1, null] });

  await dialog.getByRole('button', { name: 'Undo all' }).click();
  await expect(dialog.locator('.stash-st-sum')).toContainText('3 threads back to how they were');
  await expect.poll(() => stash(page)).toEqual({ 310: [4, null], 798: [3, null], 720: [0, null], 403: [1, null] });
});

test('an unknown number is refused and nothing changes', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Stock-take' });
  await dialog.getByRole('textbox', { name: 'Next thread' }).fill('999');
  await expect(dialog.getByRole('button', { name: 'Save, next' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Next thread' }).press('Enter');
  await expect(dialog.locator('#stash-st-match')).toHaveText('No DMC thread 999');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await stash(page)).toEqual({ 310: [4, null], 798: [3, null], 720: [0, null], 403: [1, null] });
});

test('marking uncounted threads used up asks first and can be undone', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Stock-take' });
  await dialog.getByRole('textbox', { name: 'Next thread' }).fill('310');
  await dialog.getByRole('button', { name: 'Save, next' }).click();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await dialog.getByRole('button', { name: "Mark the 2 threads I didn't count as used up" }).click();
  await expect(dialog.getByText(/DMC 798 and Anchor 403|Anchor 403 and DMC 798/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Mark 2 threads as used up' }).click();
  await expect(dialog.locator('.stash-st-sum')).toHaveText('Counted 3 threads: 1 unchanged, 2 changed, 0 new.');
  await expect.poll(() => stash(page)).toEqual({ 310: [4, null], 798: [0, 'used-up'], 720: [0, null], 403: [0, 'used-up'] });
  await dialog.getByRole('button', { name: 'Undo all' }).click();
  await expect.poll(() => stash(page)).toEqual({ 310: [4, null], 798: [3, null], 720: [0, null], 403: [1, null] });
});
