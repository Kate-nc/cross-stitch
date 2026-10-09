// Fabric saved with the pattern, in cm and inches (P2-2, audit COMMON-08).
const { test, expect } = require('@playwright/test');
const { device, generateLogo } = require('./creator-helpers');

const G = 28;

async function activeProject(page) {
  return page.evaluate(async function() {
    const p = await ProjectStorage.getActiveProject();
    return p ? { id: p.id, fabricColour: p.settings && p.settings.fabricColour, first: p.pattern[0] && p.pattern[0].id } : null;
  });
}

// Colour of the chart's top-left cell (the logo's corner is background, so
// it shows the fabric; the Creator lays a faint checker over it), as #RRGGBB.
async function cornerColour(page, selector) {
  return page.evaluate(function(args) {
    const canvases = Array.from(document.querySelectorAll(args.selector));
    canvases.sort(function(a, b) { return b.width * b.height - a.width * a.height; });
    // The largest canvas whose corner is painted (the Tracker stacks
    // transparent overlays on top of its chart).
    let d = null;
    for (const cv of canvases) {
      const px = cv.getContext('2d').getImageData(args.G + 3, args.G + 3, 1, 1).data;
      if (px[3] > 0) { d = px; break; }
    }
    if (!d) return '#000000';
    return '#' + [d[0], d[1], d[2]].map(function(v) { return v.toString(16).padStart(2, '0'); }).join('').toUpperCase();
  }, { selector: selector, G: G });
}

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

async function openProjectTab(page) {
  await page.locator('.creator-sidebar-tab[data-tab-id="project"]').click();
  await expect(page.locator('.fabric-block').first()).toBeVisible();
}

test.describe('Fabric per project on desktop', function() {
  test.use(device('desktop'));
  test.setTimeout(120000);

  test('two projects keep their own fabric colour, and the Tracker shows the same fabric', async function({ page }) {
    // Project A: black fabric.
    await generateLogo(page);
    await openProjectTab(page);
    await page.locator('.fabric-block').first().getByRole('button', { name: 'Black' }).click();
    await expect.poll(async function() { return (await activeProject(page) || {}).fabricColour; }, { timeout: 10000 }).toBe('#1A1A1A');
    const a = await activeProject(page);
    expect(a.first).toBe('__skip__');
    await expect.poll(async function() { return lum(await cornerColour(page, '.cs-chart-scroll canvas')); }).toBeLessThan(100);

    // Project B: the default, white.
    await generateLogo(page);
    await expect.poll(async function() { const p = await activeProject(page); return p && p.id !== a.id ? p.fabricColour : null; }, { timeout: 10000 }).toBe('#FFFFFF');
    const b = await activeProject(page);

    // Both survive a reload.
    await page.goto('/create.html?from=home&id=' + a.id);
    await page.waitForSelector('.cs-chart-scroll canvas', { timeout: 20000 });
    await expect.poll(async function() { return lum(await cornerColour(page, '.cs-chart-scroll canvas')); }).toBeLessThan(100);
    await openProjectTab(page);
    await expect(page.locator('.fabric-block').first().getByRole('button', { name: 'Black' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/create.html?from=home&id=' + b.id);
    await page.waitForSelector('.cs-chart-scroll canvas', { timeout: 20000 });
    await expect.poll(async function() { return lum(await cornerColour(page, '.cs-chart-scroll canvas')); }).toBeGreaterThan(230);

    // The Tracker draws project A on the same black fabric.
    await page.goto('/stitch.html?from=home&id=' + a.id);
    await page.waitForTimeout(2500);
    const dlg = page.getByRole('button', { name: "I don't have a fixed method" });
    if (await dlg.isVisible().catch(function() { return false; })) await dlg.click();
    await expect.poll(async function() { return lum(await cornerColour(page, 'canvas')); }, { timeout: 15000 }).toBeLessThan(100);
  });

  test('the Fabric block shows finished and cut size in both units', async function({ page }) {
    await page.addInitScript(function() { try { localStorage.setItem('cs_pref_units', JSON.stringify('metric')); } catch (_) {} });
    await generateLogo(page);
    await openProjectTab(page);
    const block = page.locator('.fabric-block').first();
    await block.locator('select').selectOption('28');
    await expect(block.locator('[data-fabric-finished]')).toHaveText(/^\d+\.\d × \d+\.\d cm \(\d+\.\d × \d+\.\d in\)$/);
    await expect(block.locator('[data-fabric-cut]')).toContainText('cm (');
    await expect(block.locator('optgroup[label="Evenweave / linen, over two"] option')).toHaveCount(3);
  });
});
