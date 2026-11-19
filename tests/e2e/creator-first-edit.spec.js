// Stage 1 / Task 8 (X8): End-to-end release check for the first minute after Generate.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const {
  LOGO, device, quietOnboarding, continueFromFrame, clickGenerate, waitForEdit,
  generateLogo, isCompact, isRailLayout, undoButton, zoomUntilScrollable,
} = require('./creator-helpers');

test.beforeEach(async ({ context, page }) => {
  await installLocalCdn(context);
  await page.addInitScript(() => {
    let hook;
    Object.defineProperty(window, 'useCreatorState', {
      configurable: true,
      get: () => hook,
      set: (fn) => {
        hook = function () {
          const state = fn();
          window.__cs = state;
          return state;
        };
      },
    });
  });
});

async function readPaletteCount(page, code) {
  const compact = await isCompact(page);
  if (compact) {
    await page.locator('.creator-rail__colour').click();
    await expect(page.locator('.rpanel')).toHaveClass(/rpanel--open/);
  }
  const row = page.locator('.pal-rows .pal-row[data-colour-id="' + code + '"]');
  await expect(row).toBeVisible();
  const text = (await row.locator('.pal-row__count').textContent()).trim();
  if (compact) {
    await page.locator('.rpanel-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.rpanel')).not.toHaveClass(/rpanel--open/);
  }
  return Number(text.replace(/,/g, ''));
}

async function findVisibleNonMatchingCell(page, code) {
  return page.locator('.cs-chart-scroll canvas').first().evaluate((el, activeCode) => {
    const s = window.__cs;
    const r = el.getBoundingClientRect();
    const box = document.querySelector('.cs-chart-scroll').getBoundingClientRect();
    const readyBar = document.querySelector('.ready-bar');
    const rb = readyBar ? readyBar.getBoundingClientRect() : null;
    for (let gy = 0; gy < s.sH; gy++) {
      for (let gx = 0; gx < s.sW; gx++) {
        const cell = s.pat[gy * s.sW + gx];
        if (!cell || cell.id !== activeCode) {
          const cx = r.left + s.G + (gx + 0.5) * s.cs;
          const cy = r.top + s.G + (gy + 0.5) * s.cs;
          const inBox = cx > Math.max(box.left, r.left + s.G) + 12 && cx < Math.min(box.right, r.right) - 12 &&
                        cy > Math.max(box.top, r.top + s.G) + 12 && cy < Math.min(box.bottom, r.bottom) - 12;
          const underReadyBar = rb && cy >= rb.top - 8 && cy <= rb.bottom + 8 && cx >= rb.left && cx <= rb.right;
          if (inBox && !underReadyBar) {
            return { x: cx, y: cy, gx, gy };
          }
        }
      }
    }
    return null;
  }, code);
}

for (const target of ['desktop', 'Pixel 5']) {
  test.describe(`First edit release check (${target})`, function () {
    test.use(device(target));
    test.setTimeout(90000);

    test('read active thread code from screen, edit one square, undo, and Print PDF starts an export', async function ({ page }) {
      await generateLogo(page);

      // No dialog is present or dismissed before the first edit.
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Read the active thread's code directly from the screen.
      const compact = await isCompact(page);
      let activeCode;
      if (compact) {
        activeCode = (await page.locator('.creator-rail__colour .creator-rail__label').textContent()).trim();
        expect(activeCode).not.toBe('');
        expect(activeCode).not.toBe('Colour');
      } else if (await isRailLayout(page)) {
        // The tool rail: the working thread's code is under its swatch.
        activeCode = (await page.locator('.creator-drail__colour .creator-drail__label').textContent()).trim();
        expect(activeCode).not.toBe('');
        expect(activeCode).not.toBe('Thread');
        await expect(page.locator('.pal-rows .pal-row--selected')).toHaveAttribute('data-colour-id', activeCode);
      } else {
        // Read the active thread's code directly from the swatch strip's active chip.
        const shortText = (await page.locator('.swatch-strip-row > span').nth(1).locator('span').nth(1).textContent()).trim();
        const match = shortText.match(/(?:DMC|Anchor)\s+(\S+)/i);
        expect(match).not.toBeNull();
        activeCode = match[1];
        await expect(page.locator('.pal-rows .pal-row--selected')).toHaveAttribute('data-colour-id', activeCode);
      }

      const countBefore = await readPaletteCount(page, activeCode);
      expect(countBefore).toBeGreaterThan(0);

      // Zoom so cells are comfortably clickable/tappable on both desktop and Pixel 5.
      await zoomUntilScrollable(page);
      const paintBtn = page.getByRole('button', { name: 'Paint tool' });
      await paintBtn.click();
      await expect(paintBtn).toHaveAttribute('aria-pressed', 'true');

      // Still no dialog before the first edit.
      await expect(page.getByRole('dialog')).toHaveCount(0);

      const cellPt = await findVisibleNonMatchingCell(page, activeCode);
      expect(cellPt).not.toBeNull();
      if (compact) {
        await page.touchscreen.tap(cellPt.x, cellPt.y);
      } else {
        await page.mouse.click(cellPt.x, cellPt.y);
      }
      await expect(undoButton(page)).toBeEnabled();

      // Active thread count increased by exactly 1.
      const countAfter = await readPaletteCount(page, activeCode);
      expect(countAfter).toBe(countBefore + 1);

      // Undo restores the exact original count.
      await undoButton(page).click();
      await expect(undoButton(page)).toBeDisabled();
      const countUndone = await readPaletteCount(page, activeCode);
      expect(countUndone).toBe(countBefore);

      // Print PDF starts an export (produces a PDF download).
      const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
      if (compact) {
        await page.locator('.cc-more').click();
        await page.getByRole('dialog', { name: 'Pattern actions' }).getByRole('button', { name: 'Print PDF' }).click();
      } else {
        await page.getByRole('button', { name: 'Print PDF' }).click();
      }
      const skip = page.getByRole('button', { name: 'Skip', exact: true });
      if (await skip.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) await skip.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    });

    test('Tracker-originated picture: Open in Tracker opens the same project', async function ({ page }) {
      await quietOnboarding(page);
      await page.goto('/stitch.html?from=home');
      await page.locator('input[type=file]').first().setInputFiles(LOGO);
      await page.waitForURL(/create\.html\?action=home-image-pending&from=tracker&handoff=/);
      await page.waitForSelector('[data-frame-view]', { timeout: 15000 });
      await continueFromFrame(page);
      await clickGenerate(page);
      await waitForEdit(page);

      // No dialog before acting.
      await expect(page.getByRole('dialog')).toHaveCount(0);

      // Wait for initial auto-save to commit an active project id.
      await expect.poll(() => page.evaluate(() => localStorage.getItem('crossstitch_active_project'))).toBeTruthy();
      const projectId = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));

      const compact = await isCompact(page);
      if (compact) {
        const barBtns = page.getByRole('region', { name: 'Your pattern is ready' }).locator('.ready-bar__actions button');
        await expect(barBtns.first()).toHaveText('Open in Tracker');
        await expect(barBtns.first()).toHaveClass(/btn-primary/);
        await barBtns.first().click();
      } else {
        const actionBtns = page.locator('.creator-actionbar__primary button');
        await expect(actionBtns.first()).toHaveText('Open in Tracker');
        await expect(actionBtns.first()).toHaveClass(/creator-actionbar__btn--primary/);
        await actionBtns.first().click();
      }

      const skip = page.getByRole('button', { name: 'Skip', exact: true });
      if (await skip.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) await skip.click();

      // Open in Tracker either switches UnifiedApp into embedded Tracker mode
      // (.cs-design-root hidden, __csActiveTool === 'tracker') or navigates to stitch.html.
      await expect.poll(() => page.evaluate(() => {
        if (/stitch\.html/.test(location.pathname)) return true;
        const designRoot = document.querySelector('.cs-design-root');
        const designHidden = !!designRoot && getComputedStyle(designRoot).display === 'none';
        return designHidden && window.__csActiveTool === 'tracker';
      }), { timeout: 25000 }).toBe(true);
      await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 20000 });
      const trackerProjectId = await page.evaluate(() => localStorage.getItem('crossstitch_active_project'));
      expect(trackerProjectId).toBe(projectId);
    });
  });
}
