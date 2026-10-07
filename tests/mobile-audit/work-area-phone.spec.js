/* Work area on a phone: the picker is a bottom sheet whose confirm button is
   on screen, and the area bar's controls are reachable. The rest of the
   behaviour is covered by desktop-work-area.spec.js. */
const { test, expect } = require('@playwright/test');
const { fixtureFor } = require('../_helpers/trackerFixture');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');

test('picker fits the phone screen and confirms; the bar is usable', async ({ page }) => {
  await suppressOnboarding(page);
  await page.goto('/stitch.html?from=home', { waitUntil: 'load', timeout: 120000 });
  await page.locator('input[type="file"]').first().setInputFiles(fixtureFor('large'));
  await page.waitForSelector('canvas', { timeout: 90000 });
  await page.waitForFunction(() => !!window.__workArea, null, { timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.__workArea.openPicker());
  const confirm = page.getByRole('button', { name: /Work on this area/ });
  await expect(confirm).toBeVisible();
  const vp = page.viewportSize();
  const b = await confirm.boundingBox();
  expect(b.y + b.height, 'confirm button is below the bottom of the screen').toBeLessThanOrEqual(vp.height);
  await confirm.tap();
  await expect(page.locator('.work-area-bar')).toBeVisible();
  expect(await page.evaluate(() => window.__workArea.get().active)).toBe(true);

  // Every bar control is inside the screen width.
  const outside = await page.evaluate((w) => [...document.querySelectorAll('.work-area-bar button')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.right > w + 1 || r.left < -1; }).length, vp.width);
  expect(outside).toBe(0);
});
