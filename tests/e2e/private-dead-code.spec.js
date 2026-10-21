const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

test.beforeEach(async ({ context }) => {
  await installLocalCdn(context);
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await context.addInitScript(() => {
    ['home', 'creator', 'tracker', 'manager'].forEach(kind => localStorage.setItem('cs_welcome_' + kind + '_done', '1'));
    sessionStorage.setItem('cs_eviction_warned', '1');
  });
});

test('palette preserves hints, keyboard selection, focus, live navigation and current ranking', async ({ page }) => {
  await page.goto('/home.html');
  await page.waitForFunction(() => window.CommandPalette);
  // Characterise the existing zero-valued recent-section fallback. Fixing
  // that ranking issue is outside the private-dead-code cleanup.
  expect(await page.evaluate(() => CommandPalette._filterAndSort([
    { id: 'recent', label: 'Same', section: 'recent' },
    { id: 'navigate', label: 'Same', section: 'navigate' },
    { id: 'action', label: 'Same', section: 'action' }
  ], '').map(action => action.id))).toEqual(['navigate', 'action', 'recent']);
  await page.evaluate(() => {
    const trigger = document.createElement('button');
    trigger.id = 'palette-focus-test'; trigger.textContent = 'Palette focus test';
    document.body.appendChild(trigger); trigger.focus();
    CommandPalette.register([
      { id: 'probe-a', label: 'Probe Alpha', keywords: ['probe'], section: 'action', action() { document.body.dataset.paletteChoice = 'alpha'; } },
      { id: 'probe-b', label: 'Probe Beta', keywords: ['probe'], section: 'action', action() { document.body.dataset.paletteChoice = 'beta'; } }
    ]);
  });
  await page.keyboard.press('Control+k');
  const input = page.getByRole('textbox', { name: 'Search actions' });
  await expect(input).toBeFocused();
  await expect(page.locator('.cs-cmdp-hint')).toHaveText('↑ ↓ navigate · ↵ selectEsc close');
  await input.fill('probe');
  const selected = page.locator('.cs-cmdp-row[aria-selected="true"]');
  await expect(selected).toContainText('Probe Alpha');
  await input.press('ArrowUp'); await expect(selected).toContainText('Probe Beta');
  await input.press('ArrowDown'); await expect(selected).toContainText('Probe Alpha');
  await input.press('ArrowDown'); await expect(selected).toContainText('Probe Beta');
  await input.press('Tab'); await expect(input).toBeFocused();
  await input.press('Shift+Tab'); await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-palette-choice', 'beta');
  await expect(page.locator('#palette-focus-test')).toBeFocused();
  await page.keyboard.press('Meta+k'); await input.press('Escape');
  await expect(page.locator('#palette-focus-test')).toBeFocused();
  await page.keyboard.press('Control+k');
  await input.fill('stash');
  // The existing static action uses manager.html without from=home, so an
  // active project is required to avoid the legacy landing redirect.
  await page.evaluate(async () => {
    await ProjectStorage.save({ id: 'proj_palette_nav', name: 'Palette navigation', settings: { sW: 1, sH: 1 }, pattern: [{ id: '310', type: 'solid' }] });
    ProjectStorage.setActiveProject('proj_palette_nav');
  });
  await page.locator('.cs-cmdp-row').filter({ hasText: 'Open Stash Manager' }).click();
  await expect(page).toHaveURL(/manager\.html$/);
  await page.waitForFunction(() => typeof window.MultiProjectDashboard === 'function');
});

test('Stats uses the live colour-family wheel and preserves Customise interactions', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage && window.openManagerDB);
  await page.evaluate(async () => {
    await ProjectStorage.save({ id: 'proj_wheel_stats', name: 'Colour family fixture', settings: { sW: 2, sH: 1, fabricCt: 14 }, pattern: [{ id: '310', type: 'solid' }, { id: '321', type: 'solid' }], done: [1, 0] });
    const db = await openManagerDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('manager_state', 'readwrite');
        tx.objectStore('manager_state').put({ 'dmc:310': { owned: 2 }, 'dmc:321': { owned: 1 } }, 'threads');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
    localStorage.setItem('cs_stats_visibility', JSON.stringify({ stashComposition: true }));
  });
  await page.goto('/index.html?mode=stats&tab=stash&from=home');
  await page.locator('.gsd-tabs-inner').getByRole('button', { name: 'Stash', exact: true }).click();
  const wheel = page.locator('svg[aria-label="Stash colour families"]');
  await expect(wheel).toBeVisible();
  await expect(wheel.locator('path')).toHaveCount(2);
  await expect(wheel.locator('text').first()).toHaveText('2');
  const card = page.locator('#stats-stashComposition');
  await expect(card).toContainText('Blacks 1');
  await expect(card).toContainText('Pinks 1');
  await wheel.hover();
  await page.getByRole('button', { name: 'Customise', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Colour Families', exact: true }).uncheck();
  await expect(wheel).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Colour Families', exact: true }).check();
  await expect(wheel).toHaveCount(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cs_stats_visibility')).stashComposition)).toBe(true);
  expect(errors).toEqual([]);
});
