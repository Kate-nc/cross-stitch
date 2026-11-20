// Stage 3 (D7): every visible button in Edit is at least 32px tall with a
// mouse at 1440 x 900, and the tool rail, options bar and side-panel tab row
// are at least 44px on a touch screen. Undo and Redo name their shortcuts.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });   // serves the CDN libraries locally when E2E_LOCAL_CDN=1; does nothing otherwise
const { device, generateLogo, chooseTool, pickDarkSwatch, isCompact } = require('./creator-helpers');

// Every visible, enabled-or-not button-like control on screen shorter than min.
function tooSmall(page, min, scope) {
  return page.evaluate(function(args) {
    const root = args.scope ? document.querySelector(args.scope) : document;
    if (!root) return ['(no ' + args.scope + ')'];
    const els = root.querySelectorAll('button, [role="button"], [role="tab"], [role="radio"], summary, a.btn');
    return Array.from(els).filter(function(el) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') return false;
      if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
      // Covered by something else (a menu or sheet on top): not visible.
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(x, y);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) return false;
      return Math.round(r.height) < args.min;
    }).map(function(el) {
      return Math.round(el.getBoundingClientRect().height) + 'px ' + (el.className || el.tagName) + ' "' + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40)) + '"';
    });
  }, { min: min, scope: scope || null });
}

test.describe('Edit on a 1440 x 900 desktop', function() {
  test.use(device('desktop'));

  test('every visible button is at least 32px tall', async function({ page }) {
    await generateLogo(page);
    const report = {};
    for (const tab of ['palette', 'view', 'project']) {
      await page.locator('.creator-sidebar-tab[data-tab-id="' + tab + '"]').click();
      await page.waitForTimeout(200);
      report[tab] = await tooSmall(page, 32);
    }
    await page.locator('.creator-sidebar-tab[data-tab-id="palette"]').click();
    await page.locator('summary', { hasText: 'Shift colours' }).click();
    report.recolour = await tooSmall(page, 32);

    await pickDarkSwatch(page);
    await chooseTool(page, 'Paint tool');
    report.paint = await tooSmall(page, 32);
    await chooseTool(page, 'Magic wand');
    await page.locator('.cs-chart-scroll').hover();
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(200);
    report.selection = await tooSmall(page, 32);
    await page.keyboard.press('Escape');
    await page.locator('.chart-view-switch [data-view="stitched"]').click();
    report.stitched = await tooSmall(page, 32);

    for (const k of Object.keys(report)) expect(report[k], k).toEqual([]);
  });

  test('Undo and Redo tooltips name their shortcuts', async function({ page }) {
    await generateLogo(page);
    await expect(page.getByRole('button', { name: 'Undo', exact: true }).first()).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    await expect(page.getByRole('button', { name: 'Redo', exact: true }).first()).toHaveAttribute('title', 'Redo (Ctrl+Y)');
  });
});

test.describe('Edit on a Pixel 5', function() {
  test.use(device('Pixel 5'));

  test('the tool rail and the side-panel tab row are at least 44px tall', async function({ page }) {
    await generateLogo(page);
    expect(await isCompact(page)).toBe(true);
    expect(await tooSmall(page, 44, '.creator-rail')).toEqual([]);
    await page.locator('.creator-rail__colour').click();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
    expect(await tooSmall(page, 44, '.creator-sidebar-tabs')).toEqual([]);
  });
});
