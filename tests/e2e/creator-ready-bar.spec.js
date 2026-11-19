// "Your pattern is ready" (creator/ReadyBar.js): after Generate, one bar says
// what was made and offers the next steps, instead of a toast arriving with
// the editing tips (reports/create-from-image-workflow, decision 3).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, generateLogo } = require('./creator-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test.describe('After Generate on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('one bar says what was made, with Print PDF, Open in Tracker and Threads to buy', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-ready-summary]')).toContainText('stitches');
    await expect(bar.locator('[data-ready-summary]')).toContainText('Saved on this device');
    for (const name of ['Print PDF', 'Open in Tracker', 'Threads to buy']) {
      await expect(bar.getByRole('button', { name })).toBeVisible();
    }
    // Nothing else competes with it.
    await expect(page.getByText(/Pattern generated and saved/)).toHaveCount(0);
    await expect(page.getByText('Tools and View are now unlocked')).toHaveCount(0);
    await expect(page.locator('.ready-review-note')).toHaveCount(0);
  });

  test('Threads to buy opens Materials on its Threads list and closes the bar', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await bar.getByRole('button', { name: 'Threads to buy' }).click();
    await expect(page.getByRole('tab', { name: /Threads/, selected: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Edit' }).first().click();
    await expect(bar).toHaveCount(0);
  });

  test('closing the bar brings back the review note', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await bar.getByRole('button', { name: 'Close: keep editing' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.locator('.ready-review-note')).toBeVisible();
  });

  test('when storage save fails, Ready bar shows the error with Retry and Download project (.json) and chart stays usable', async function({ page }) {
    await page.addInitScript(() => {
      window.__failProjectSave = true;
      let realPS;
      Object.defineProperty(window, 'ProjectStorage', {
        configurable: true,
        get: () => realPS,
        set: (val) => {
          if (val && typeof val.save === 'function' && !val.__wrappedForTest) {
            const origSave = val.save.bind(val);
            val.save = function (...args) {
              if (window.__failProjectSave) return Promise.reject(new Error('Simulated storage failure'));
              return origSave(...args);
            };
            val.__wrappedForTest = true;
          }
          realPS = val;
        },
      });
    });

    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText("Couldn't save on this device");
    await expect(bar).not.toContainText('Saved on this device');
    await expect(bar.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Download project (.json)' })).toBeVisible();
    // Chart remains mounted and usable even while save is in error state.
    await expect(page.locator('.cs-chart-scroll canvas').first()).toBeVisible();

    // Restoring storage and clicking Retry succeeds and updates the Ready bar.
    await page.evaluate(() => { window.__failProjectSave = false; });
    await bar.getByRole('button', { name: 'Retry' }).click();
    await expect(bar).toContainText('Saved on this device');
    await expect(bar.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });
});
