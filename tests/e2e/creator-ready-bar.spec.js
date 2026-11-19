// "Your pattern is ready" (creator/ReadyBar.js): after Generate, one bar says
// what was made and offers the next steps, instead of a toast arriving with
// the editing tips (reports/create-from-image-workflow, decision 3).
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, generateLogo, openConvertWithLogo, clickGenerate, waitForEdit, reframe, zoomUntilScrollable } = require('./creator-helpers');

test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test.describe('After Generate on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('one bar says what was made, guides first edit, and leaves Print PDF / Open in Tracker in the action bar only', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await expect(bar).toBeVisible();
    await expect(bar.locator('[data-ready-summary]')).toContainText('stitches');
    await expect(bar.locator('[data-ready-summary]')).toContainText('Saved on this device');
    await expect(bar.locator('[data-ready-next]')).toContainText('Choose a thread, then select Paint');
    await expect(bar.getByRole('button', { name: 'Choose a thread' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Threads to buy' })).toBeVisible();
    // Desktop leaves Print PDF and Open in Tracker in the action bar only: exactly one of each visible.
    await expect(bar.getByRole('button', { name: 'Print PDF' })).toHaveCount(0);
    await expect(bar.getByRole('button', { name: 'Open in Tracker' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Print PDF' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Open in Tracker' })).toHaveCount(1);
    // Nothing else competes with it.
    await expect(page.getByText(/Pattern generated and saved/)).toHaveCount(0);
    await expect(page.getByText('Tools and View are now unlocked')).toHaveCount(0);
    await expect(page.locator('.ready-review-note')).toHaveCount(0);

    // Clicking Choose a thread opens the Palette tab and focuses the first thread row.
    await page.locator('.creator-sidebar-tab[data-tab-id="view"]').click();
    await bar.getByRole('button', { name: 'Choose a thread' }).click();
    await expect(page.locator('.creator-sidebar-tab[data-tab-id="palette"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.pal-rows .pal-row').first()).toBeFocused();
  });

  test('Threads to buy opens Materials and returning to Edit restores the chart scroll', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    const chart = await zoomUntilScrollable(page);
    const savedScroll = await chart.evaluate(el => {
      el.scrollLeft = 35;
      el.scrollTop = 35;
      return [el.scrollLeft, el.scrollTop];
    });
    expect(savedScroll).toEqual([35, 35]);
    await bar.getByRole('button', { name: 'Threads to buy' }).click();
    await expect(page.getByRole('tab', { name: /Threads/, selected: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Edit' }).first().click();
    await expect(bar).toHaveCount(0);
    await expect.poll(() => chart.evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual(savedScroll);
  });

  test('closing the bar does not show a duplicate review note', async function({ page }) {
    await generateLogo(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await bar.getByRole('button', { name: 'Close: keep editing' }).click();
    await expect(bar).toHaveCount(0);
    await expect(page.locator('.ready-review-note')).toHaveCount(0);
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

test.describe('After Generate on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('no Convert toast covers the Ready bar, which keeps Print PDF and Open in Tracker and uses tap wording', async function({ page }) {
    // Do NOT dismiss the plain-background offer toast before clicking Generate.
    await openConvertWithLogo(page);
    await expect(page.locator('.creator-toast-container > *')).toHaveCount(1);
    await clickGenerate(page);
    await waitForEdit(page);
    const bar = page.getByRole('region', { name: 'Your pattern is ready' });
    await expect(bar).toBeVisible();
    // Convert's toast was dismissed so nothing covers the Ready bar.
    await expect(page.locator('.creator-toast-container > *')).toHaveCount(0);
    await expect(bar.locator('[data-ready-next]')).toContainText('Choose a thread, then select Paint');
    for (const name of ['Choose a thread', 'Print PDF', 'Open in Tracker', 'Threads to buy']) {
      await expect(bar.getByRole('button', { name })).toBeVisible();
    }
    await bar.getByRole('button', { name: 'Choose a thread' }).click();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
    await expect(page.locator('.pal-rows .pal-row').first()).toBeFocused();
    await page.locator('.pal-rows .pal-row').first().click();
    await expect(bar.locator('[data-ready-next]')).toContainText('Choose a thread, then select Paint');
    await page.locator('.creator-sidebar-tab[data-tab-id="palette"]').click();
    await page.getByRole('button', { name: 'Paint tool' }).click();
    await expect(bar.locator('[data-ready-next]')).toContainText('Tap a square to change it');
  });

  test('Reframe keeps Edit and Materials available after Generate', async function({ page }) {
    await generateLogo(page);
    const bar = page.locator('.cc-modes');
    await bar.getByRole('tab', { name: 'Convert' }).click();
    await reframe(page);
    await expect(bar.getByRole('tab', { name: 'Materials' })).toBeEnabled();
    await expect(page.locator('[data-frame-view] [data-onboard="frame-continue"]')).toBeVisible();
    await bar.getByRole('tab', { name: 'Edit' }).click();
    await expect(page.locator('.cs-chart-scroll')).toBeVisible();
    await expect(page.locator('[data-frame-view]')).toHaveCount(0);
  });
});
