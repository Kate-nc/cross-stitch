// Stage 1 / Task 1 (X5): Convert <-> Edit / Materials round trip preserves
// the chart object, edit history, zoom, and scroll position without showing a
// "Switch to Convert?" confirmation dialog.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');
const {
  device, generateLogo, isCompact, pickDarkSwatch, zoomUntilScrollable,
  undoButton, convertStep,
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

// Paint two distinct cells on the chart canvas using real pointer interactions.
async function paintTwoStitches(page) {
  await pickDarkSwatch(page);
  const paintBtn = page.getByRole('button', { name: 'Paint tool' });
  if ((await paintBtn.getAttribute('aria-pressed')) !== 'true') {
    await paintBtn.click();
  }
  const canvas = page.locator('.cs-chart-scroll canvas').first();
  await expect(canvas).toBeVisible();
  // Pick two cells that are currently visible inside .cs-chart-scroll and do not
  // already have selectedColorId so each click/tap produces an edit.
  const pts = await canvas.evaluate((el) => {
    const s = window.__cs;
    const r = el.getBoundingClientRect();
    const box = document.querySelector('.cs-chart-scroll').getBoundingClientRect();
    const sel = s.selectedColorId;
    const found = [];
    for (let gy = 0; gy < s.sH && found.length < 2; gy++) {
      for (let gx = 0; gx < s.sW && found.length < 2; gx++) {
        const cell = s.pat[gy * s.sW + gx];
        if (!cell || cell.id !== sel) {
          const cx = r.left + s.G + (gx + 0.5) * s.cs;
          const cy = r.top + s.G + (gy + 0.5) * s.cs;
          if (cx > Math.max(box.left, r.left + s.G) + 8 && cx < Math.min(box.right, r.right) - 8 &&
              cy > Math.max(box.top, r.top + s.G) + 8 && cy < Math.min(box.bottom, r.bottom) - 8) {
            found.push({ x: cx, y: cy, gx, gy });
            break;
          }
        }
      }
    }
    return found;
  });
  expect(pts.length).toBe(2);
  const touch = await isCompact(page);
  for (const pt of pts) {
    if (touch) await page.touchscreen.tap(pt.x, pt.y);
    else await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(100);
  }
}

for (const target of ['desktop', 'Pixel 5']) {
  test.describe(`Convert round trip (${target})`, function () {
    test.use(device(target));
    test.setTimeout(90000);

    test('Edit tab returns from Convert with the same chart, history, zoom and scroll', async function ({ page }) {
      await generateLogo(page);
      const closeReady = page.locator('.ready-bar__close');
      if (await closeReady.isVisible().catch(() => false)) await closeReady.click();

      // Zoom in and scroll to a non-zero position, then paint two stitches.
      const box = await zoomUntilScrollable(page);
      await expect.poll(() => box.evaluate((el) => el.scrollWidth > el.clientWidth + 40 && el.scrollHeight > el.clientHeight + 40)).toBe(true);
      await box.evaluate((el) => {
        el.scrollLeft = Math.floor((el.scrollWidth - el.clientWidth) / 2);
        el.scrollTop = Math.floor((el.scrollHeight - el.clientHeight) / 2);
      });
      await paintTwoStitches(page);
      await expect.poll(() => page.evaluate(() => window.__cs.editHistory.length)).toBe(2);

      const before = await page.evaluate(() => {
        const s = window.__cs;
        const el = document.querySelector('.cs-chart-scroll');
        window.__patBefore = s.pat;
        return {
          sW: s.sW,
          sH: s.sH,
          zoom: s.zoom,
          scrollLeft: el ? el.scrollLeft : 0,
          scrollTop: el ? el.scrollTop : 0,
          historyLen: s.editHistory.length,
        };
      });
      expect(before.historyLen).toBe(2);
      expect(before.scrollLeft).toBeGreaterThan(0);

      // Go to Convert — no confirmation dialog should appear.
      await page.getByRole('tab', { name: 'Convert' }).first().click();
      await expect(page.getByRole('dialog', { name: 'Switch to Convert?' })).toHaveCount(0);
      await expect(page.locator('.cvp')).toBeVisible({ timeout: 15000 });

      // Change the width in Convert without regenerating.
      await convertStep(page, 'size');
      const widthInput = page.locator('.size-field').getByLabel('Width in stitches');
      await widthInput.fill('60');
      await widthInput.press('Enter');
      await expect.poll(() => page.evaluate(() => window.__cs.convertW)).toBe(60);

      // Close the settings drawer on phones so the top bar is reachable.
      const drawerHeader = page.locator('.rpanel-drawer-header');
      if (await drawerHeader.isVisible().catch(() => false)) {
        if ((await drawerHeader.getAttribute('aria-expanded')) === 'true') await drawerHeader.click();
      }
      // Return through the Edit tab.
      await page.getByRole('tab', { name: 'Edit' }).first().click();
      await expect(page.locator('.cs-chart-scroll')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(200);

      const after = await page.evaluate(() => {
        const s = window.__cs;
        const el = document.querySelector('.cs-chart-scroll');
        return {
          samePat: s.pat === window.__patBefore,
          appMode: s.appMode,
          tab: s.tab,
          sW: s.sW,
          sH: s.sH,
          convertW: s.convertW,
          zoom: s.zoom,
          scrollLeft: el ? el.scrollLeft : 0,
          scrollTop: el ? el.scrollTop : 0,
          historyLen: s.editHistory.length,
        };
      });
      expect(after.samePat).toBe(true);
      expect(after.appMode).toBe('edit');
      expect(after.tab).toBe('pattern');
      expect(after.sW).toBe(before.sW);
      expect(after.sH).toBe(before.sH);
      expect(after.convertW).toBe(60);
      expect(after.historyLen).toBe(2);
      expect(after.zoom).toBe(before.zoom);
      expect(Math.abs(after.scrollLeft - before.scrollLeft)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(2);
      await expect(undoButton(page)).toBeEnabled();

      // Revisiting Convert shows the changed width (60) was preserved.
      await page.getByRole('tab', { name: 'Convert' }).first().click();
      await convertStep(page, 'size');
      await expect(page.locator('.size-field').getByLabel('Width in stitches')).toHaveValue('60');
    });

    test('Materials tab returns from Convert with the same chart and history', async function ({ page }) {
      await generateLogo(page);
      const closeReady = page.locator('.ready-bar__close');
      if (await closeReady.isVisible().catch(() => false)) await closeReady.click();

      await zoomUntilScrollable(page);
      await paintTwoStitches(page);
      await expect.poll(() => page.evaluate(() => window.__cs.editHistory.length)).toBe(2);
      const origZoom = await page.evaluate(() => {
        window.__patBefore = window.__cs.pat;
        return window.__cs.zoom;
      });

      await page.getByRole('tab', { name: 'Convert' }).first().click();
      await expect(page.locator('.cvp')).toBeVisible({ timeout: 15000 });

      // Leave Convert through Materials.
      await page.getByRole('tab', { name: 'Materials' }).first().click();
      await expect(page.locator('.cvp')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => ({
        samePat: window.__cs.pat === window.__patBefore,
        appMode: window.__cs.appMode,
        tab: window.__cs.tab,
        historyLen: window.__cs.editHistory.length,
        zoom: window.__cs.zoom,
      }))).toEqual({
        samePat: true,
        appMode: 'edit',
        tab: 'materials',
        historyLen: 2,
        zoom: origZoom,
      });

      // Then switch to Edit and confirm Undo is still enabled.
      await page.getByRole('tab', { name: 'Edit' }).first().click();
      await expect(page.locator('.cs-chart-scroll')).toBeVisible({ timeout: 15000 });
      await expect(undoButton(page)).toBeEnabled();
      expect(await page.evaluate(() => window.__cs.pat === window.__patBefore)).toBe(true);
    });
  });
}
