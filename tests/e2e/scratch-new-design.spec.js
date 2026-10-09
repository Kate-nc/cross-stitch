// New design sheet for designs drawn from scratch (P2-4, audit DRAW-02).
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding, skipTourIfShown, LOGO } = require('./creator-helpers');

async function activeProject(page) {
  return page.evaluate(async function() {
    const p = await ProjectStorage.getActiveProject();
    if (!p) return null;
    const rec = await BlobStore.get('trace:' + p.id);
    return {
      id: p.id, w: p.settings.sW, h: p.settings.sH, fabricCt: p.settings.fabricCt, fabricColour: p.settings.fabricColour,
      traceImage: !!p.settings.traceImage, overlayOpacity: p.settings.overlayOpacity, traceBlob: !!(rec && rec.blob),
    };
  });
}

async function openCanvasPanel(page) {
  await page.getByRole('tab', { name: 'Canvas' }).click();
  const header = page.locator('.rpanel-drawer-header');
  if (await header.isVisible()) {
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  }
  await expect(page.locator('.creator-canvas-panel')).toBeVisible();
}

test.describe('New design sheet on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(90000);

  test('size and fabric are chosen before the grid is made', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/home.html?tab=create');
    await skipTourIfShown(page);
    await page.getByRole('link', { name: /Draw on a blank grid/ }).click();

    const sheet = page.getByRole('dialog', { name: 'New design' });
    await expect(sheet).toBeVisible({ timeout: 15000 });
    // Full screen on a phone.
    const box = await sheet.boundingBox();
    expect(box.width).toBeGreaterThan(380);
    await expect(sheet.getByRole('radio', { name: /Medium/ })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('radio', { name: /Small motif/ }).click();
    await expect(sheet.locator('[data-new-design-size]')).toContainText('30 × 30 stitches');
    await sheet.locator('.fabric-block__select').selectOption('14');
    await sheet.getByRole('button', { name: 'Black' }).click();
    await sheet.getByRole('button', { name: 'Start drawing' }).click();
    await expect(sheet).toHaveCount(0);
    await page.waitForSelector('.creator-rail', { timeout: 15000 });

    await openCanvasPanel(page);
    await expect(page.locator('.creator-canvas-panel')).toContainText('30 × 30 stitches');
    await expect.poll(function() { return activeProject(page); }, { timeout: 15000 })
      .toMatchObject({ w: 30, h: 30, fabricCt: 14, fabricColour: '#1A1A1A', traceImage: false });
  });

  test('a tracing picture is kept with the design and comes back after a reload', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/create.html?action=new-blank');
    const sheet = page.getByRole('dialog', { name: 'New design' });
    await expect(sheet).toBeVisible({ timeout: 15000 });
    await sheet.getByLabel('Choose a picture to trace').setInputFiles(LOGO);
    await expect(sheet.getByLabel('Tracing picture opacity')).toHaveValue('30');
    await sheet.getByRole('button', { name: 'Start drawing' }).click();
    await page.waitForSelector('.creator-rail', { timeout: 15000 });

    // Drawn over, never converted: no Convert tab and no Generate.
    await expect(page.getByRole('tab', { name: 'Convert' })).toHaveCount(0);
    await expect(page.locator('.cc-generate')).toHaveCount(0);

    await expect.poll(function() { return activeProject(page); }, { timeout: 15000 })
      .toMatchObject({ w: 100, h: 100, traceImage: true, overlayOpacity: 0.3, traceBlob: true });

    await page.reload();
    await page.waitForSelector('.creator-rail', { timeout: 15000 });
    await expect(page.getByRole('dialog', { name: 'New design' })).toHaveCount(0);
    await openCanvasPanel(page);
    await expect(page.locator('.creator-canvas-panel').getByRole('img', { name: 'Tracing picture' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.creator-canvas-panel').getByLabel('Show under the grid')).toBeChecked();

    // Remove it: the project forgets it and the stored picture goes.
    await page.locator('.creator-canvas-panel').getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.creator-canvas-panel').getByRole('button', { name: /Add a tracing picture/ })).toBeVisible();
    await expect.poll(function() { return activeProject(page); }, { timeout: 15000 })
      .toMatchObject({ traceImage: false, traceBlob: false });
  });
});
