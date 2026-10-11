// A project in Anchor numbering (P4-5, audit IMG-04): settings.threadBrand
// 'anchor' keeps Anchor names and numbers in the Creator, its Materials
// legend, its saves and the Tracker.
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding } = require('./creator-helpers');

const SW = 10, SH = 10;

// Anchor 10 is Pale Rose; DMC 10 is Very Light Tender Green. Anchor 403
// (Black) isn't a DMC number at all. The last column is DMC 11 (Light
// Tender Green, where Anchor 11 is Salmon), added to the Anchor pattern: on
// disk it names its own brand. The cells carry no rgb, so names and colours
// must come from the right catalogue.
function anchorProject() {
  const pattern = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    pattern.push(x === 9 ? { id: '11', type: 'solid', brand: 'dmc' } : { id: x < 5 ? '10' : '403', type: 'solid' });
  }
  return {
    version: 11, page: 'creator', name: 'Anchor fixture',
    settings: { sW: SW, sH: SH, fabricCt: 14, isScratchMode: true, threadBrand: 'anchor' },
    pattern, bsLines: [], done: null, halfStitches: [], halfDone: [], partialStitches: [],
    parkMarkers: [], sessions: [], threadOwned: {},
  };
}

async function seed(page) {
  await quietOnboarding(page);
  await page.goto('/home.html');
  await page.evaluate(async function(p) {
    p.id = 'proj_anchortest';
    p.createdAt = p.updatedAt = new Date().toISOString();
    await window.ProjectStorage.save(p, { resurrect: true });
    window.ProjectStorage.setActiveProject(p.id);
  }, anchorProject());
}

test.describe('Anchor project on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(90000);

  test('the Creator and the Tracker show Anchor numbers and names', async function({ page }) {
    await seed(page);
    await page.goto('/create.html');
    await page.waitForSelector('.cs-chart-scroll canvas', { timeout: 20000 });

    // Palette rows are Anchor threads, by Anchor name.
    const rows = page.locator('.pal-rows .pal-row');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('.pal-row[aria-label^="Anchor 10 "]')).toHaveCount(1);
    await expect(page.locator('.pal-row[aria-label^="Anchor 403 "]')).toHaveCount(1);
    await expect(page.locator('.pal-row[aria-label*="Pale Rose"]')).toHaveCount(1);
    // The DMC colour stays DMC.
    await expect(page.locator('.pal-row[aria-label^="DMC 11 "]')).toHaveCount(1);
    await expect(page.locator('.pal-row[aria-label*="Light Tender Green"]')).toHaveCount(1);
    await expect(page.locator('.pal-row[aria-label*="Salmon"]')).toHaveCount(0);
    await expect(page.locator('.pal-row[aria-label*="Very Light Tender Green"]')).toHaveCount(0);

    // Materials: the key's column says Anchor, and names are Anchor names.
    await page.getByRole('tab', { name: 'Materials' }).first().click();
    await expect(page.locator('th', { hasText: /^Anchor$/ }).first()).toBeVisible();
    await expect(page.locator('td', { hasText: /^Pale Rose$/ }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Very Light Tender Green');
    await expect(page.locator('body')).not.toContainText('Salmon');

    // A save keeps the brand, and the Anchor cells keep their colour.
    await page.keyboard.press('Control+s');
    await expect.poll(async function() {
      const p = await page.evaluate(function() { return ProjectStorage.getActiveProject(); });
      return p && p.settings && [p.settings.threadBrand, !!(p.pattern[0] && p.pattern[0].rgb), p.pattern[0].brand, p.pattern[9].brand].join(':');
    }, { timeout: 15000 }).toBe('anchor:true::dmc');

    // The Tracker reads the same project in Anchor numbering.
    await page.goto('/stitch.html');
    await page.waitForSelector('canvas[aria-label^="Cross stitch pattern grid"]', { timeout: 20000 });
    await expect(page.locator('[aria-label="Select Anchor 10"]').first()).toBeAttached();
    await expect(page.locator('[aria-label="Select Anchor 403"]').first()).toBeAttached();
    await expect(page.locator('[aria-label="Select DMC 11"]').first()).toBeAttached();
    await expect(page.locator('[aria-label^="Select DMC"]')).toHaveCount(1);
  });
});
