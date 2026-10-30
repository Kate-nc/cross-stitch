// The Creator keeps one PDF export worker, however the exporter arrives: Print
// PDF loads creator/pdfExport.js on demand, and Materials & Output later loads
// creator/extras-bundle.js, which contains the same file. A second copy used to
// replace window.PdfExport and spawn a second worker on the next export.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, generateLogo, isCompact } = require('./creator-helpers');

test.use(device('Pixel 5'));
test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await quietOnboarding(page);
  await page.addInitScript(() => {
    const Real = window.Worker;
    window.__pdfWorkers = 0;
    window.Worker = function (url, opts) {
      if (/pdf-export-worker\.js/.test(String(url))) window.__pdfWorkers++;
      return new Real(url, opts);
    };
    window.Worker.prototype = Real.prototype;
  });
});

async function printPdf(page) {
  const download = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('.cc-more').click();
  await page.getByRole('dialog', { name: 'Pattern actions' }).getByRole('button', { name: 'Print PDF' }).click();
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click();
  return download;
}

test('Print PDF, then Materials & Output, then Print PDF again uses one worker', async ({ page }) => {
  await generateLogo(page);
  if (await isCompact(page)) {
    const backdrop = page.locator('.rpanel-backdrop');
    if (await backdrop.isVisible().catch(() => false)) await backdrop.click({ position: { x: 10, y: 10 } });
  }
  await printPdf(page);
  expect(await page.evaluate(() => window.__pdfWorkers)).toBe(1);
  const facade = await page.evaluateHandle(() => window.PdfExport);

  await page.getByRole('tab', { name: 'Materials' }).first().click();
  await expect(page.getByRole('tab', { name: 'Threads', exact: true })).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(f => window.PdfExport === f, facade)).toBe(true);

  await page.getByRole('tab', { name: 'Edit' }).first().click();
  await printPdf(page);
  expect(await page.evaluate(() => window.__pdfWorkers)).toBe(1);
});
