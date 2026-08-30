// tests/ipad/ipad-roundtrip.spec.js
//
// The functional question the rest of the iPad work only implies: can a sync
// file made on this device actually be read back in on this device?
//
// On iPad the whole workflow is export-a-file / import-a-file, so a break
// anywhere along it — the share/download path, the filename, the mis-pick
// guard, the picker's accept attribute — leaves the user with no sync at all.
// This drives the real UI on real WebKit, end to end.

const { test, expect } = require('@playwright/test');

// A minimal but structurally valid project. The sync engine's shape gate
// (_isProjectShapeValid) rejects anything without dimensions and a pattern.
function makeProject(name) {
  const w = 4;
  const h = 4;
  return {
    id: 'ipad-roundtrip-' + name,
    name,
    sW: w,
    sH: h,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pattern: Array.from({ length: h }, () => Array.from({ length: w }, () => 0)),
    palette: [{ id: '310', name: 'Black', hex: '#000000' }],
    done: Array.from({ length: w * h }, () => false),
  };
}

test.describe('iPad (WebKit) sync round trip', () => {
  test('a project exported to .csync imports back through the picker', async ({ page }, testInfo) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/home.html');
    await page.waitForFunction(() => !!window.ProjectStorage && !!window.SyncEngine);

    // Seed a project so the export has something to carry.
    await page.evaluate(async (project) => {
      await window.ProjectStorage.save(project, { resurrect: true });
    }, makeProject('Round Trip Sampler'));

    // --- Send leg -----------------------------------------------------------
    // Playwright's WebKit does not implement navigator.share, so
    // shareOrDownload takes its download fallback. That is the same code path
    // an iPad uses when the user picks "Save to Files" from the share sheet:
    // either way a .csync file lands on disk.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.evaluate(() => window.SyncEngine.downloadSync()),
    ]);

    const filename = download.suggestedFilename();
    expect(filename, 'exported file must be a .csync').toMatch(/\.csync$/);

    const savedTo = testInfo.outputPath(filename);
    await download.saveAs(savedTo);

    // The export must record that it happened, or the sync status would keep
    // claiming this device has never sent anything.
    const lastExport = await page.evaluate(() => window.SyncEngine.getSyncStatus().lastExportAt);
    expect(lastExport, 'downloadSync did not stamp the export').toBeTruthy();

    // --- Receive leg --------------------------------------------------------
    await page.reload();
    await page.locator('.sync-popover-wrap button').first().click();
    await page.getByRole('button', { name: 'Import file' }).click();

    const input = page.locator('input[type=file]').last();
    await expect(input).toBeAttached();
    // No accept filter, so the iOS Files picker actually offers the file.
    expect(await input.getAttribute('accept')).toBeNull();

    await input.setInputFiles(savedTo);

    // The engine parsed it and built a plan: the round trip works.
    await expect(page.getByText(/Ready to import/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();

    expect(pageErrors, 'the round trip threw').toEqual([]);
  });

  test('a cancelled share leaves the export timestamp alone', async ({ page }) => {
    await page.goto('/home.html');
    await page.waitForFunction(() => !!window.SyncEngine);

    // Reporting "exported" for a sheet the user dismissed would hide the fact
    // that the other device is still stale — the failure mode this guards.
    const result = await page.evaluate(async () => {
      const before = window.SyncEngine.getSyncStatus().lastExportAt || null;
      navigator.canShare = () => true;
      navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }));
      const syncObj = await window.SyncEngine.downloadSync();
      return {
        delivery: syncObj._delivery,
        before,
        after: window.SyncEngine.getSyncStatus().lastExportAt || null,
      };
    });

    expect(result.delivery).toBe('cancelled');
    expect(result.after).toBe(result.before);
  });
});
