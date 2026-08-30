// tests/ipad/ipad-sync.spec.js
//
// Runs against real WebKit at an iPad viewport (project `ipad-webkit`), which
// is the only harness in the repo that reproduces an actual iPad: the existing
// `touch-tablet-chromium` project uses the iPad Mini viewport on *Chromium*,
// so it still has showDirectoryPicker and cannot observe any of this.
//
// What these guard:
//   1. Folder-watch sync is genuinely unavailable, and the app says so in
//      terms the user can act on — not "install Chrome", which on iOS is
//      advice that changes nothing because Chrome there is WebKit too.
//   2. The .csync and .oxs file pickers do not carry an accept filter that
//      iOS resolves to no UTI, which greys out every file in the Files
//      picker and makes import impossible.
//   3. A PNG apple-touch-icon is present, so a Home Screen install — the only
//      way to stop iPadOS evicting the pattern library after ~7 days — does
//      not show a page screenshot as its icon.

const { test, expect } = require('@playwright/test');

test.describe('iPad (WebKit) sync workflow', () => {
  test('the File System Access API really is absent on this engine', async ({ page }) => {
    await page.goto('/home.html');
    // If this ever becomes true, the fallback copy below is wrong and the
    // whole file-based workflow can be revisited.
    const hasPicker = await page.evaluate(() => typeof window.showDirectoryPicker === 'function');
    expect(hasPicker).toBe(false);

    const engineAgrees = await page.evaluate(() => window.SyncEngine.hasFolderWatchSupport());
    expect(engineAgrees).toBe(false);
  });

  test('Platform detects iOS and reports the right capabilities', async ({ page }) => {
    await page.goto('/home.html');
    const caps = await page.evaluate(() => ({
      isIOS: window.Platform.isIOS(),
      isWebKit: window.Platform.isWebKit(),
      hasFolderSync: window.Platform.hasFolderSync(),
      csyncAccept: window.Platform.fileAccept('.csync'),
      oxsAccept: window.Platform.fileAccept('.oxs,.pdf'),
      imageAccept: window.Platform.fileAccept('image/*'),
    }));

    expect(caps.isIOS).toBe(true);
    expect(caps.isWebKit).toBe(true);
    expect(caps.hasFolderSync).toBe(false);
    // Unregistered extensions must be dropped...
    expect(caps.csyncAccept).toBeUndefined();
    expect(caps.oxsAccept).toBeUndefined();
    // ...but MIME specs still work and give the nicer photo picker.
    expect(caps.imageAccept).toBe('image/*');
  });

  // The sync surface on /home.html is the header pill, not a panel on the
  // page: home-app.js renders the tabbed home and does not use the sync panel
  // in home-screen.js (that one is still reached from manager.html).
  test('the header sync popover describes the file workflow, not "install Chrome"', async ({ page }) => {
    await page.goto('/home.html');
    await page.locator('.sync-popover-wrap button').first().click();

    const popover = page.locator('.sync-popover');
    await expect(popover).toBeVisible();

    const text = await popover.innerText();
    expect(text).toMatch(/syncs by file/i);
    // Telling an iPad user to set up a folder is an instruction they cannot
    // carry out — no browser on iOS can do it.
    expect(text).not.toMatch(/Set one up on the Home page/i);
    expect(text).not.toMatch(/Chromium|Brave|Opera/i);
  });

  test('both legs of the workflow are reachable from the sync popover', async ({ page }) => {
    await page.goto('/home.html');
    await page.locator('.sync-popover-wrap button').first().click();
    await expect(page.locator('.sync-popover')).toBeVisible();

    // Send: labelled "Share" because downloadSync opens the share sheet here.
    await expect(page.getByRole('button', { name: 'Share sync file' })).toBeVisible();
    // Receive.
    await expect(page.getByRole('button', { name: 'Import file' })).toBeVisible();
  });

  test('the .csync import picker is selectable and rejects an obvious mis-pick', async ({ page }) => {
    await page.goto('/home.html');
    await page.locator('.sync-popover-wrap button').first().click();
    await page.getByRole('button', { name: 'Import file' }).click();

    const input = page.locator('input[type=file]').last();
    await expect(input).toBeAttached();
    // The whole point: no accept attribute, so the Files picker offers files
    // instead of greying every one of them out.
    expect(await input.getAttribute('accept')).toBeNull();

    // With the filter gone the user can pick anything, so a wrong pick must
    // produce a comprehensible message rather than "the file may be corrupted".
    await input.setInputFiles({
      name: 'holiday.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    });
    await expect(page.getByText(/is not a sync file/i)).toBeVisible();
  });

  test('no file picker on any page advertises an extension iOS cannot resolve', async ({ page }) => {
    for (const url of ['/home.html', '/create.html', '/stitch.html', '/manager.html']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');

      const accepts = await page.$$eval('input[type=file]', (inputs) =>
        inputs.map((i) => i.getAttribute('accept'))
      );

      for (const accept of accepts) {
        if (!accept) continue;
        // An accept filter that matches no UTI greys out every file in the
        // Files picker, so the user cannot open anything at all. ".xml" is
        // deliberately not listed: it maps to public.xml and works on iOS.
        expect(accept, `${url} has an unusable accept filter: ${accept}`).not.toMatch(/\.oxs|\.csync/);
      }
    }
  });

  test('every entry page serves a PNG apple-touch-icon', async ({ page }) => {
    for (const url of ['/home.html', '/index.html', '/create.html', '/stitch.html', '/manager.html']) {
      await page.goto(url);
      const href = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
      expect(href, `${url} has no apple-touch-icon`).toBe('./assets/icons/app-icon-180.png');
    }
    // And it must actually resolve — a 404 here is invisible until install.
    const res = await page.request.get('/assets/icons/app-icon-180.png');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  });

  // This panel is built entirely from conditionals on Platform.isIOS(), so a
  // scoping or typo mistake shows up as a blank/crashed panel rather than as
  // wrong text. Render it for real.
  test('the Preferences data panel renders and carries the iPad guidance', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto('/home.html');
    // The cs:openPreferences listener is registered in a React useEffect, so
    // an event dispatched before the app mounts fires into the void. Retry
    // the dispatch until the modal answers rather than guessing at a marker.
    await expect(page.locator('.home-tabs')).toBeVisible();
    const prefsNav = page.getByRole('button', { name: /Sync, backup & data/i });
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('cs:openPreferences')));
      await expect(prefsNav).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });

    await prefsNav.click();
    await expect(page.getByRole('heading', { name: 'Sync, backup & data' })).toBeVisible();

    const panel = page.locator('.prefs-modal, [role=dialog]').first();
    const text = await panel.innerText();

    // The folder row must explain iOS, not recommend an impossible browser.
    expect(text).toMatch(/iPad and iPhone cannot watch a folder/i);
    expect(text).not.toMatch(/needs a Chromium-based browser/i);
    // The workflow that does work, named with the user's actual cloud drive.
    expect(text).toMatch(/How to sync this iPad/i);
    expect(text).toMatch(/OneDrive/i);
    // The storage section, which is how the library survives on iPad at all.
    expect(text).toMatch(/Add to Home Screen/i);
    expect(text).toMatch(/Not installed/i);

    expect(pageErrors, 'preferences panel threw').toEqual([]);
  });
});
