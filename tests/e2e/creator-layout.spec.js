// Creator layout on phones and tablets (audit B-01, B-02, B-14, COMMON-03).
//
// B-01: the Creator's settings panel was hidden under 900px, so Convert had no
//       Size / Threads (max) / Fabric controls and a scratch grid had no way to
//       add a colour.
// B-02: on a touch tablet at 900px+ the drawer stayed full width and covered
//       the chart.
// B-14: Fit assumed a 750px-wide view.
// COMMON-03 (P1-2): under 900px one 48px top bar and a bottom tool rail
//       replace the header, action bar and tool strip, so the chart gets most
//       of the screen.
const { test, expect } = require('@playwright/test');
const {
  device, quietOnboarding, openConvertWithLogo, clickGenerate, waitForEdit, pickDarkSwatch, undoButton, startBlankGrid,
} = require('./creator-helpers');

// Share of the viewport where the chart's scroll box is actually visible:
// clipped to the screen, below the top bars and above the bottom rail or a
// fixed bottom drawer.
async function visibleCanvasFraction(page) {
  return page.evaluate(function() {
    // Phones: the chart's scroll box. Wider screens: the whole canvas area,
    // as this test measured before the compact layout.
    const compact = document.body.classList.contains('creator-compact');
    const box = (compact && document.querySelector('.cs-chart-scroll')) || document.querySelector('.canvas-area');
    const r = box.getBoundingClientRect();
    let top = 0;
    const bar = document.querySelector('.creator-compact-top');
    if (bar && bar.offsetParent !== null) top = bar.getBoundingClientRect().bottom;
    let bottom = window.innerHeight;
    const rail = document.querySelector('.creator-rail');
    if (rail) bottom = Math.min(bottom, rail.getBoundingClientRect().top);
    const panel = document.querySelector('.rpanel');
    if (panel && getComputedStyle(panel).position === 'fixed' && panel.offsetParent !== null) bottom = Math.min(bottom, panel.getBoundingClientRect().top);
    let right = window.innerWidth;
    if (panel && getComputedStyle(panel).position !== 'fixed') right = Math.min(right, panel.getBoundingClientRect().left);
    const w = Math.max(0, Math.min(r.right, right) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top));
    return (w * h) / (window.innerWidth * window.innerHeight);
  });
}

const CASES = [
  { name: 'Pixel 5', drawer: true, compact: true, minCanvas: 0.65 },
  { name: 'Pixel 5 landscape', drawer: true, compact: true, minCanvas: 0.5 },
  { name: 'iPad Mini', drawer: true, compact: true, minCanvas: 0.65 },
  { name: 'iPad Pro 11 landscape', drawer: false, compact: false, minCanvas: 0.5 },
  { name: 'desktop', drawer: false, compact: false, minCanvas: 0.5 },
];

for (const c of CASES) {
  test.describe('Creator layout on ' + c.name, function() {
    test.use(device(c.name));

    test('Convert settings are reachable and the chart is not covered', async function({ page }) {
      await openConvertWithLogo(page);
      const maxColours = page.getByText('Threads (max)').first();
      const header = page.locator('.rpanel-drawer-header');
      if (c.drawer) {
        await expect(header).toBeVisible();
        // The drawer slides into place, so wait for it to settle.
        await expect.poll(async function() { const b = await header.boundingBox(); return b.y + b.height; })
          .toBeLessThanOrEqual(page.viewportSize().height + 0.5);
        const box = await header.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        await header.tap();
        await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
      } else {
        await expect(header).toBeHidden();
      }
      await expect(maxColours).toBeVisible();
      if (c.drawer) await header.tap();

      await clickGenerate(page);
      await waitForEdit(page);
      await page.waitForTimeout(400);
      expect(await visibleCanvasFraction(page)).toBeGreaterThanOrEqual(c.minCanvas);
      expect(await page.evaluate(function() { return document.documentElement.scrollWidth - window.innerWidth; })).toBe(0);
    });

    if (c.compact) {
      test('compact chrome: one top bar, a rail of 44px controls, Print and Track in two taps', async function({ page }) {
        await openConvertWithLogo(page);
        await clickGenerate(page);
        await waitForEdit(page);
        await expect(page.locator('.tb-topbar')).toBeHidden();
        await expect(page.locator('.creator-actionbar')).toHaveCount(0);
        const top = await page.locator('.creator-compact-top').boundingBox();
        expect(top.height).toBeLessThanOrEqual(49);

        const sizes = await page.locator('.creator-rail__row button').evaluateAll(function(btns) {
          return btns.map(function(b) { const r = b.getBoundingClientRect(); return { l: b.getAttribute('aria-label') || b.textContent, w: r.width, h: r.height }; });
        });
        expect(sizes.length).toBeGreaterThanOrEqual(8);
        for (const s of sizes) {
          expect(s.w, s.l).toBeGreaterThanOrEqual(44);
          expect(s.h, s.l).toBeGreaterThanOrEqual(44);
        }

        // The settings drawer is hidden until asked for, then opens above the rail.
        await expect(page.locator('.rpanel')).toBeHidden();
        await page.locator('.creator-rail__colour').click();
        await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
        const drawer = await page.locator('.rpanel').boundingBox();
        const rail = await page.locator('.creator-rail').boundingBox();
        expect(drawer.y + drawer.height).toBeLessThanOrEqual(rail.y + 1);
        await page.locator('.rpanel-backdrop').click({ position: { x: 10, y: 10 } });

        // Print PDF and Open in Tracker: More, then the action.
        await page.locator('.cc-more').click();
        await expect(page.getByRole('dialog', { name: 'Pattern actions' }).getByRole('button', { name: 'Print PDF' })).toBeVisible();
        await expect(page.getByRole('dialog', { name: 'Pattern actions' }).getByRole('button', { name: 'Open in Tracker' })).toBeVisible();
      });
    }
  });
}

test.describe('Long project names on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('the top bar keeps every control on screen', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await page.evaluate(function() { window.dispatchEvent(new CustomEvent('cs:openRename')); });
    await page.locator('.name-prompt-input').fill('A very long project name for a sampler with roses and a cottage');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.cc-name__text')).toContainText('A very long');
    const right = await page.locator('.cc-more').boundingBox();
    expect(right.x + right.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(await page.evaluate(function() { return document.documentElement.scrollWidth - window.innerWidth; })).toBe(0);
  });
});

test.describe('Desktop keeps the action bar', function() {
  test.use(device('desktop'));

  test('header, action bar and tool strip are unchanged; no rail', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    await expect(page.locator('.tb-topbar')).toBeVisible();
    await expect(page.locator('.creator-actionbar')).toBeVisible();
    await expect(page.locator('.creator-actionbar').getByRole('button', { name: /Print PDF/ })).toBeVisible();
    await expect(page.locator('.toolbar-row')).toBeVisible();
    await expect(page.locator('.creator-rail')).toHaveCount(0);
    await expect(page.locator('.creator-compact-top')).toHaveCount(0);
  });
});

test.describe('Fit on desktop', function() {
  test.use(device('desktop'));

  test('fills the chart viewport after generating', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
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

  test('tapping the chart paints once Paint is chosen', async function({ page }) {
    await openConvertWithLogo(page);
    await clickGenerate(page);
    await waitForEdit(page);
    const undo = undoButton(page);
    await expect(undo).toBeDisabled();
    // Touch screens open in Navigate (P1-1).
    await page.getByRole('button', { name: 'Paint tool' }).tap();
    await pickDarkSwatch(page);
    const canvas = page.locator('.cs-chart-scroll canvas').first();
    const box = await canvas.boundingBox();
    for (const f of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.7]]) {
      if (!(await undo.isDisabled())) break;
      await page.touchscreen.tap(box.x + box.width * f[0], box.y + box.height * f[1]);
      await page.waitForTimeout(150);
    }
    await expect(undo).toBeEnabled();
  });
});

test.describe('Scratch grid on Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('can add DMC 310 and paint a stitch', async function({ page }) {
    await quietOnboarding(page);
    await startBlankGrid(page);
    await page.waitForSelector('.creator-rail', { timeout: 15000 });

    const undo = undoButton(page);
    await expect(undo).toBeDisabled();

    // The rail's colour button opens the palette drawer.
    await page.locator('.creator-rail__colour').tap();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
    await page.getByLabel('Search DMC palette').fill('310');
    await page.locator('.rpanel').getByText('310', { exact: true }).first().tap();
    // Close the drawer, pick Paint and paint.
    await page.locator('.rpanel-backdrop').tap({ position: { x: 20, y: 20 } });
    await expect(page.locator('.rpanel')).not.toHaveClass(/rpanel--open/);
    await page.getByRole('button', { name: 'Paint tool' }).tap();

    const canvas = page.locator('.cs-chart-scroll canvas').first();
    const box = await canvas.boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(undo).toBeEnabled();
  });
});
