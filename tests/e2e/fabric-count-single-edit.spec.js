// UX-032: the fabric count had three editable controls and the Convert card clipped its select at 1366x900.
// Convert, Canvas and Edit > Project share one component on one setting; Materials shows the count read-only
// with an Edit link to Edit > Project > Fabric.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, openConvertWithLogo, clickGenerate, waitForEdit, convertStep } = require('./creator-helpers');
test.use(Object.assign({}, device('desktop'), { viewport: { width: 1366, height: 900 }, launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} }));
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test('the Convert Size step shows all of the fabric block at 1366x900 (not clipped)', async ({ page }) => {
  await openConvertWithLogo(page);
  await convertStep(page, 'size');
  const clipped = await page.evaluate(() => {
    const sec = document.querySelector('[data-cv-section="fabric"]');
    return { scrollHeight: sec.scrollHeight, clientHeight: sec.clientHeight };
  });
  expect(clipped.clientHeight).toBeGreaterThanOrEqual(clipped.scrollHeight - 1);
  const select = page.locator('.fabric-block__select').first();
  await select.scrollIntoViewIfNeeded();
  await expect(select).toBeVisible();
});

test('one count: edited in Convert and Project, read-only with an Edit link in Materials', async ({ page }) => {
  await openConvertWithLogo(page);
  await convertStep(page, 'size');
  await page.locator('.fabric-block__select').first().selectOption('18');
  await clickGenerate(page);
  await waitForEdit(page);

  await page.getByRole('tab', { name: 'Materials', exact: true }).click();
  await page.getByRole('tab', { name: 'Threads', exact: true }).click();
  const summary = page.locator('.fabric-summary');
  await expect(summary.locator('[data-fabric-count]')).toHaveText('18ct');
  await expect(page.getByLabel('Fabric count', { exact: true })).toHaveCount(0);

  await summary.getByRole('button', { name: 'Edit fabric count in Edit, Project' }).click();
  await expect(page.locator('.creator-sidebar-tab[data-tab-id="project"]')).toHaveAttribute('aria-selected', 'true');
  const projectSelect = page.locator('.fabric-block__select');
  await expect(projectSelect).toHaveValue('18');
  await projectSelect.selectOption('14');

  await page.getByRole('tab', { name: 'Materials', exact: true }).click();
  await page.getByRole('tab', { name: 'Threads', exact: true }).click();
  await expect(page.locator('.fabric-summary [data-fabric-count]')).toHaveText('14ct');
});
