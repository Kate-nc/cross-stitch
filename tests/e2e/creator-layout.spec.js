// Creator layout on phones and tablets (audit B-01, B-02, B-14).
//
// B-01: the Creator's settings panel was hidden under 900px, so Convert had no
//       Size / Max colours / Fabric controls and a scratch grid had no way to
//       add a colour.
// B-02: on a touch tablet at 900px+ the drawer stayed full width and covered
//       the chart.
// B-14: Fit assumed a 750px-wide view.
const path = require('path');
const { test, expect, devices } = require('@playwright/test');

const LOGO = path.join(__dirname, '..', 'fixtures', 'logo.png');

// devices[] entries carry defaultBrowserType, which test.use() can't change
// inside a describe; the projects run Chromium anyway.
function device(name) {
  if (name === 'desktop') return { viewport: { width: 1440, height: 900 } };
  const d = Object.assign({}, devices[name]);
  delete d.defaultBrowserType;
  return d;
}

async function quietOnboarding(page) {
  await page.addInitScript(function() {
    try {
      ['tracker', 'creator', 'manager', 'home'].forEach(function(k) { localStorage.setItem('cs_welcome_' + k + '_done', '1'); });
      ['firstStitch_creator', 'toolsTab_unlocked', 'import', 'undo', 'progress', 'save'].forEach(function(k) {
        localStorage.setItem('cs_pref_onboarding.coached.' + k, 'true');
      });
    } catch (e) {}
  });
}

async function skipTourIfShown(page) {
  const skip = page.getByRole('button', { name: 'Skip tour' });
  if (await skip.isVisible().catch(function() { return false; })) await skip.click();
}

async function openConvertWithLogo(page) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles(LOGO);
  await page.waitForURL(/create\.html/);
  await page.waitForSelector('.rpanel');
  await skipTourIfShown(page);
}

async function generateAndDismissName(page) {
  await page.getByRole('button', { name: 'Generate pattern' }).first().click();
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.waitFor({ timeout: 15000 });
  await cancel.click();
  await page.waitForSelector('.rpanel--edit');
}

// Share of the viewport where the chart area is actually visible: the
// .canvas-area box clipped to the screen and to the top of the bottom drawer.
async function visibleCanvasFraction(page) {
  return page.evaluate(function() {
    const area = document.querySelector('.canvas-area').getBoundingClientRect();
    const panel = document.querySelector('.rpanel');
    let bottom = window.innerHeight;
    if (panel && getComputedStyle(panel).position === 'fixed') bottom = Math.min(bottom, panel.getBoundingClientRect().top);
    let right = window.innerWidth;
    if (panel && getComputedStyle(panel).position !== 'fixed') right = Math.min(right, panel.getBoundingClientRect().left);
    const w = Math.max(0, Math.min(area.right, right) - Math.max(area.left, 0));
    const h = Math.max(0, Math.min(area.bottom, bottom) - Math.max(area.top, 0));
    return (w * h) / (window.innerWidth * window.innerHeight);
  });
}

const CASES = [
  { name: 'Pixel 5', drawer: true, minCanvas: 0.35 },
  { name: 'iPad Mini', drawer: true, minCanvas: 0.5 },
  { name: 'iPad Pro 11 landscape', drawer: false, minCanvas: 0.5 },
  { name: 'desktop', drawer: false, minCanvas: 0.5 },
];

for (const c of CASES) {
  test.describe('Creator layout on ' + c.name, function() {
    test.use(device(c.name));

    test('Convert settings are reachable and the chart is not covered', async function({ page }) {
      await openConvertWithLogo(page);
      const maxColours = page.getByText('Max colours').first();
      const header = page.locator('.rpanel-drawer-header');
      if (c.drawer) {
        await expect(header).toBeVisible();
        const box = await header.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height + 0.5);
        await header.tap();
        await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
      } else {
        await expect(header).toBeHidden();
      }
      await expect(maxColours).toBeVisible();
      if (c.drawer) await header.tap();

      await generateAndDismissName(page);
      await page.waitForTimeout(400);
      expect(await visibleCanvasFraction(page)).toBeGreaterThanOrEqual(c.minCanvas);

      if (c.drawer) {
        // Collapsed, the Edit drawer peeks its whole tab strip.
        const tab = page.locator('.rpanel .creator-sidebar-tab[data-tab-id="palette"]');
        const tb = await tab.boundingBox();
        expect(tb.y + tb.height).toBeLessThanOrEqual(page.viewportSize().height + 0.5);
      }
    });
  });
}

test.describe('Fit on desktop', function() {
  test.use(device('desktop'));

  test('fills the chart viewport after generating', async function({ page }) {
    await openConvertWithLogo(page);
    await generateAndDismissName(page);
    await expect.poll(async function() {
      return page.evaluate(function() {
        const canvases = Array.from(document.querySelectorAll('canvas'));
        const chart = canvases.sort(function(a, b) { return b.width * b.height - a.width * a.height; })[0];
        let box = chart.parentElement;
        while (box && getComputedStyle(box).overflow.indexOf('auto') < 0) box = box.parentElement;
        const c = chart.getBoundingClientRect();
        return Math.max(c.width / box.clientWidth, c.height / box.clientHeight);
      });
    }).toBeGreaterThanOrEqual(0.9);
  });
});

test.describe('iPad Pro 11 landscape side panel', function() {
  test.use(device('iPad Pro 11 landscape'));

  test('tapping the chart paints', async function({ page }) {
    await openConvertWithLogo(page);
    await generateAndDismissName(page);
    const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
    await expect(undo).toBeDisabled();
    // A dark thread, so the tap changes the (red) centre of the logo.
    await page.locator('.swatch-scroll-inner button').nth(3).tap();
    const canvas = page.locator('.canvas-area canvas').first();
    const box = await canvas.boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(undo).toBeEnabled();
  });
});

test.describe('Scratch grid on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('can add DMC 310 and paint a stitch', async function({ page }) {
    await quietOnboarding(page);
    await page.goto('/create.html?action=new-blank');
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.waitFor({ timeout: 15000 });
    await cancel.click();

    const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
    await expect(undo).toBeDisabled();

    await page.locator('.rpanel .creator-sidebar-tab[data-tab-id="palette"]').tap();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
    await page.getByLabel('Search DMC palette').fill('310');
    await page.locator('.rpanel').getByText('310', { exact: true }).first().tap();
    // Close the drawer and paint.
    await page.locator('.rpanel-backdrop').tap({ position: { x: 20, y: 20 } });
    await expect(page.locator('.rpanel')).not.toHaveClass(/rpanel--open/);

    const canvas = page.locator('.canvas-area canvas').first();
    const box = await canvas.boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(undo).toBeEnabled();
  });
});
