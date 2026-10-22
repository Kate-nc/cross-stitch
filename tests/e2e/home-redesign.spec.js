// Home, "Ask what they have" layout (reports/home-redesign-proposals.md, Option 1).
// Returning users: a Continue card, project cards that show progress, one main
// action each with the rest in a More menu, filters and Show all past 12.
// A dropped picture asks whether it is a printed chart.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const { device, quietOnboarding, LOGO } = require('./creator-helpers');
const fs = require('fs');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

async function seed(page, projects) {
  await page.goto('/home.html');
  await page.waitForFunction(() => window.ProjectStorage);
  await page.evaluate(async (projects) => {
    for (const p of projects) {
      const n = p.w * p.h;
      const pattern = Array.from({ length: n }, (_, i) => ({ id: i % 2 ? '310' : '666', type: 'solid', rgb: i % 2 ? [0, 0, 0] : [200, 0, 0] }));
      const done = Array.from({ length: n }, (_, i) => (i < Math.round(n * p.frac) ? 1 : 0));
      await ProjectStorage.save({ id: p.id, name: p.name, settings: { sW: p.w, sH: p.h, fabricCt: 14 }, pattern, done });
    }
    if (projects.length) ProjectStorage.setActiveProject(projects[0].id);
  }, projects);
}

for (const name of ['desktop', 'Pixel 5']) {
  test.describe('Returning to Home on ' + name, () => {
    test.use(device(name));

    test('cards show progress and size, one main action, and the rest in a More menu', async ({ page }) => {
      await quietOnboarding(page);
      await seed(page, [
        { id: 'proj_wip', name: 'Autumn fox', w: 20, h: 10, frac: 0.5 },
        { id: 'proj_new', name: 'Seaside cottage', w: 30, h: 20, frac: 0 },
        { id: 'proj_done', name: 'Little robin', w: 10, h: 10, frac: 1 },
      ]);
      await page.goto('/home.html');
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      // The open project leads, with one primary action; no header switcher on Home.
      const cont = page.locator('.home-continue');
      await expect(cont).toContainText('Autumn fox');
      await expect(cont.getByRole('button', { name: /Continue stitching/ })).toBeVisible();
      await expect(page.locator('.tb-proj-switcher__btn')).toHaveCount(0);
      // Progress and size come from the library rows (walkthrough F13).
      const fox = page.locator('.home-pcard', { hasText: 'Autumn fox' });
      await expect(fox).toContainText('20 × 10');
      await expect(fox).toContainText('50%');
      await expect(page.locator('.home-pcard', { hasText: 'Little robin' })).toContainText('Finished');
      await expect(page.locator('.home-pcard', { hasText: 'Seaside cottage' })).toContainText('Not started');
      // Export and Update chart are in the More menu, labelled for the project's state.
      await page.getByRole('button', { name: 'More actions for Seaside cottage' }).click();
      const menu = page.getByRole('menu', { name: 'More actions for Seaside cottage' });
      await expect(menu.getByRole('menuitem', { name: 'Start stitching' })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: /Update chart/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      // Filters.
      await page.getByRole('button', { name: /^Finished/ }).click();
      await expect(page.locator('.home-pcard')).toHaveCount(1);
      await page.getByRole('button', { name: /^All/ }).click();
      await expect(page.locator('.home-pcard')).toHaveCount(3);
      // Nothing is cut off on a phone (walkthrough F15).
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const name = await fox.locator('.home-pcard__name').boundingBox();
      const more = await fox.locator('.home-menu__btn').boundingBox();
      expect(name.y, 'the menu button sits above the name, not on it').toBeGreaterThan(more.y + more.height - 1);
      // A card opens the project in the Tracker.
      await fox.locator('.home-pcard__main').click();
      await page.waitForURL(/stitch\.html\?from=home&id=proj_wip/);
    });
  });
}

test.describe('More than 12 projects', () => {
  test.use(device('desktop'));
  test('Show all lists every project instead of stopping silently', async ({ page }) => {
    await quietOnboarding(page);
    await seed(page, Array.from({ length: 14 }, (_, i) => ({ id: 'proj_n' + i, name: 'Project ' + i, w: 4, h: 4, frac: 0.25 })));
    await page.goto('/home.html');
    await expect(page.locator('.home-pcard')).toHaveCount(12);
    await page.getByRole('button', { name: 'Show all 14 projects' }).click();
    await expect(page.locator('.home-pcard')).toHaveCount(14);
  });

  test('Project details reads the library row', async ({ page }) => {
    await quietOnboarding(page);
    await seed(page, [{ id: 'proj_d', name: 'Details please', w: 12, h: 8, frac: 0.5 }]);
    await page.goto('/home.html');
    await page.locator('.home-pcard').getByRole('button', { name: 'More actions for Details please' }).click();
    await page.getByRole('menuitem', { name: 'Project details' }).click();
    const dialog = page.getByRole('dialog', { name: 'Details please' });
    await expect(dialog).toContainText('12 × 8 stitches');
    await expect(dialog).toContainText('50%');
  });
});

test.describe('Dropping a picture on Home', () => {
  test.use(device('desktop'));
  test('asks what it is; a printed chart is pointed at the chart picker, a picture goes to Convert', async ({ page }) => {
    await quietOnboarding(page);
    await page.goto('/home.html');
    await page.waitForSelector('.home-intent');
    const bytes = fs.readFileSync(LOGO).toString('base64');
    const drop = () => page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], 'IMG_2041.png', { type: 'image/png' }));
      document.querySelector('.home-page').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, bytes);
    await drop();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('What’s in this picture?');
    await expect(dialog).toContainText('IMG_2041.png');
    await dialog.getByRole('button', { name: /A printed chart/ }).click();
    await expect(dialog.getByRole('button', { name: 'Choose a chart file' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toMatch(/home\.html/);
    await drop();
    await page.getByRole('dialog').getByRole('button', { name: /Something to turn into a pattern/ }).click();
    await page.waitForURL(/create\.html\?action=home-image-pending/);
  });

  test('?tab=create from other pages lands on the start cards', async ({ page }) => {
    await quietOnboarding(page);
    await seed(page, [{ id: 'proj_t', name: 'Something', w: 4, h: 4, frac: 0 }]);
    await page.goto('/home.html?tab=create');
    await expect(page.locator('#home-start-title')).toBeFocused();
    await expect(page.locator('#home-start-title')).toHaveText('Start something new');
  });
});
