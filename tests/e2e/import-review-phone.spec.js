// Import review on a phone, and "Start stitching" (P1-5, audit IMPORT-06, IMPORT-07).
const path = require('path');
const { test, expect } = require('@playwright/test');
const { device, quietOnboarding, skipTourIfShown } = require('./creator-helpers');

const PDF = path.join(__dirname, '..', '..', 'TestUploads', 'PAT1968_2.pdf');

async function importFromHome(page) {
  await quietOnboarding(page);
  await page.goto('/home.html?tab=create');
  await skipTourIfShown(page);
  await page.locator('input.home-create-file-input').setInputFiles(PDF);
  await page.waitForSelector('.import-review-modal', { timeout: 90000 });
}

// Elements of the review that reach past the right edge of the screen.
function overflowing(page) {
  return page.evaluate(function() {
    const W = window.innerWidth;
    return Array.from(document.querySelectorAll('.import-review-modal, .import-review-modal *'))
      .filter(function(e) { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W + 0.5; })
      .map(function(e) { return e.tagName + '.' + (typeof e.className === 'string' ? e.className : '') + ' right=' + Math.round(e.getBoundingClientRect().right); });
  });
}

test.describe('Import review on Pixel 5', function() {
  test.use(device('Pixel 5'));
  test.setTimeout(150000);

  test('fits the screen on every tab, with labelled tabs, folded notes and a placeholder swatch', async function({ page }) {
    await importFromHome(page);
    const tabs = page.locator('.import-review-tab');
    const labels = await tabs.allTextContents();
    expect(labels).toEqual(expect.arrayContaining(['Preview', 'Palette', 'Details', 'Compare']));
    for (let i = 0; i < labels.length; i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(300);
      expect(await overflowing(page), 'tab ' + labels[i]).toEqual([]);
    }
    // Header, footer and both confirm buttons on screen.
    await expect(page.locator('.import-review-coverage')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Start stitching' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Edit first' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Start stitching' })).toHaveClass(/primary/);

    // Notes fold into one line; none of this chart's is high severity, so closed.
    const notes = page.locator('details.import-review-notes');
    await expect(notes.locator('summary')).toHaveText(/^\d+ notes?$/);
    await expect(notes).not.toHaveAttribute('open', /.*/);

    // The symbol missing from the key shows as unassigned, not as a colour.
    await page.locator('.import-review-tab', { hasText: 'Palette' }).click();
    await expect(page.locator('.import-palette-row.pending .thread-placeholder-swatch').first()).toBeVisible();
  });

  test('Start stitching opens the pattern in the Tracker at 0%', async function({ page }) {
    await importFromHome(page);
    await page.getByRole('button', { name: 'Start stitching' }).click();
    await page.waitForURL(/stitch\.html/, { timeout: 30000 });
    expect(page.url()).toMatch(/from=home&id=proj_/);
    const project = await expect.poll(async function() {
      return page.evaluate(async function() {
        const p = await ProjectStorage.getActiveProject();
        return p ? { name: p.name, cells: p.pattern.length, done: (p.done || []).filter(Boolean).length } : null;
      });
    }, { timeout: 20000 }).not.toBeNull();
    void project;
    const p = await page.evaluate(async function() {
      const pr = await ProjectStorage.getActiveProject();
      return { cells: pr.pattern.length, done: (pr.done || []).filter(Boolean).length };
    });
    expect(p.cells).toBeGreaterThan(1000);
    expect(p.done).toBe(0);
    // The Tracker has the chart up.
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/\b0%/).first()).toBeVisible({ timeout: 20000 });
  });

  test('Edit first opens the pattern in the Creator', async function({ page }) {
    await importFromHome(page);
    await page.getByRole('button', { name: 'Edit first' }).click();
    await page.waitForURL(/create\.html/, { timeout: 30000 });
    await page.waitForSelector('.creator-rail', { timeout: 30000 });
    await expect(page.locator('.cs-chart-scroll canvas').first()).toBeVisible();
  });
});
