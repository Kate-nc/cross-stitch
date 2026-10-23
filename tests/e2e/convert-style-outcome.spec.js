// The confetti count under Detail and tidiness ("In the preview") is for the
// preview on screen: while a new one is worked out it says Updating preview
// instead of showing the previous step's count, and a preview made smaller
// than the chart (no background worker) says its counts are estimates.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });
const { device, openConvertWithLogo: openLogo, convertStep } = require('./creator-helpers');

// The count is in Convert's Detail step; the width in its Size step.
async function openConvertWithLogo(page) { await openLogo(page); await convertStep(page, 'detail'); }

function outcome(page) { return page.locator('.stitch-style__outcome'); }
function step(page, label) {
  return page.getByRole('radiogroup', { name: 'Detail and tidiness' }).getByRole('radio', { name: label });
}
async function setWidth(page, n) {
  await convertStep(page, 'size');
  await page.getByLabel('Width in stitches', { exact: true }).fill(String(n));
  await page.keyboard.press('Tab');
  await convertStep(page, 'detail');
}

test.describe('The Detail and tidiness count', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('waits for the new preview instead of showing the last step\'s count', async function({ page }) {
    await openConvertWithLogo(page);
    await expect(outcome(page)).toHaveAttribute('data-outcome', 'count', { timeout: 20000 });
    await expect(outcome(page)).toHaveText(/^In the preview: \d[\d,]* confetti stitch(es)? \([\d.]+% of stitches\)\.$/);
    await step(page, 'More detail').click();
    // Inside the 400 ms debounce, before the new preview can exist.
    await expect(outcome(page)).toHaveAttribute('data-outcome', 'updating');
    await expect(outcome(page)).toHaveText('Updating preview…');
    await expect(outcome(page)).toHaveAttribute('data-outcome', 'count', { timeout: 20000 });
  });

  test('a large chart previewed on the page is labelled as an estimate', async function({ page }) {
    // No background worker (as on file://): large charts are previewed smaller.
    await page.addInitScript(function() { try { delete window.Worker; window.Worker = undefined; } catch (e) {} });
    await openConvertWithLogo(page);
    await setWidth(page, 260);
    await expect(outcome(page)).toHaveAttribute('data-outcome', 'estimate', { timeout: 30000 });
    await expect(outcome(page)).toHaveText(/^In the preview: about \d[\d,]* confetti stitch(es)? \([\d.]+% of stitches\), estimated from a smaller preview\.$/);
    // A chart small enough to preview at full size is an exact count again.
    await setWidth(page, 80);
    await expect(outcome(page)).toHaveAttribute('data-outcome', 'count', { timeout: 30000 });
  });

  test('with the worker, a large chart is previewed at full size and counted exactly', async function({ page }) {
    await openConvertWithLogo(page);
    await setWidth(page, 260);
    await expect(outcome(page)).toHaveAttribute('data-outcome', 'count', { timeout: 30000 });
    await expect(outcome(page)).not.toContainText('about');
  });
});
