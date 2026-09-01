/* Guards for the lazily-loaded situational modules (audit §C1 / Part 10).
   ═══════════════════════════════════════════════════════════════════════════
   help-drawer.js and backup-restore.js are no longer <script> tags on any entry
   page; lazy-modules.js pulls them in on first use. The failure mode this
   guards against is somebody re-adding a static tag — which would restore the
   old behaviour silently, with every functional test still passing.

   So each module is asserted BOTH ways: absent from the document at load, and
   present after the action that needs it. Asserting only the second half would
   pass against a statically-loaded module, which is the whole regression.

   Assertions are on counted work — scripts in the DOM, decoded bytes — not on
   timings. Blocking time on this harness varies several-fold between identical
   runs (mobile-experience-audit.md §H), so a time-based assertion here would
   flake rather than bite. */
const { test, expect } = require('@playwright/test');
const { suppressOnboarding } = require('../_helpers/deviceEmulation');

const PAGES = ['home.html', 'manager.html', 'stitch.html', 'create.html', 'index.html'];
const LAZY = ['help-drawer.js', 'backup-restore.js'];

const scriptPresent = (page, src) =>
  page.evaluate((s) => !!document.querySelector('script[src="' + s + '"]'), src);

/** Decoded bytes actually fetched for a given script, per the resource timeline. */
const decodedKBFor = (page, src) => page.evaluate((s) => {
  const e = performance.getEntriesByType('resource').filter(r => r.name.endsWith('/' + s));
  return Math.round(e.reduce((sum, r) => sum + (r.decodedBodySize || 0), 0) / 1024);
}, src);

async function open(page, p) {
  await suppressOnboarding(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
  await page.goto('/' + p + '?from=home', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.loadScript === 'function', { timeout: 15000 });
  return errors;
}

for (const p of PAGES) {
  test(`${p} — lazy modules are absent at load`, async ({ page }) => {
    const errors = await open(page, p);
    await page.waitForTimeout(1200);

    for (const m of LAZY) {
      expect(await scriptPresent(page, m), `${m} must not be a <script> on ${p} at load`).toBe(false);
      expect(await decodedKBFor(page, m), `${m} must not be fetched on ${p} at load`).toBe(0);
    }
    // The shim itself must be there, or nothing can load them later.
    expect(await scriptPresent(page, 'lazy-modules.js')).toBe(true);
    expect(errors, 'no page errors on load').toEqual([]);
  });
}

/* These three run on home.html deliberately.
   ────────────────────────────────────────────
   The tracker, manager and creator each register their OWN cs:openHelp /
   cs:openShortcuts listener which calls setModal("help"), and that renders
   window.HelpCentre — a shim inside help-drawer.js that opens the drawer from a
   useEffect. So on stitch.html the drawer opens whether or not the stub replays
   the event, and an earlier version of this test passed against a stub with the
   replay deleted. home-app.js and home-screen.js register no such listener and
   never render HelpCentre, so there the replay is the only thing that can open
   the drawer, and deleting it fails the test. */
test('cs:openHelp loads the drawer and opens it', async ({ page }) => {
  const errors = await open(page, 'home.html');
  expect(await scriptPresent(page, 'help-drawer.js')).toBe(false);
  // Before load the global is a stub, so nothing that calls it throws.
  expect(await page.evaluate(() => !!(window.HelpDrawer && window.HelpDrawer.__stub))).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cs:openHelp')));
  await page.waitForFunction(() => !!(window.HelpDrawer && window.HelpDrawer.__real), { timeout: 15000 });

  expect(await scriptPresent(page, 'help-drawer.js'), 'the real module arrived').toBe(true);
  // The event must be replayed to the real listener, not merely swallowed by
  // the stub — otherwise the first click on Help would do nothing.
  await expect.poll(() => page.evaluate(() => window.HelpDrawer.isOpen()), { timeout: 8000 })
    .toBe(true);
  await expect(page.locator('#cs-help-drawer-root')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the "?" key loads the drawer and opens it on Shortcuts', async ({ page }) => {
  const errors = await open(page, 'home.html');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');

  await page.waitForFunction(() => !!(window.HelpDrawer && window.HelpDrawer.__real), { timeout: 15000 });
  expect(await scriptPresent(page, 'help-drawer.js')).toBe(true);
  await expect.poll(() => page.evaluate(() => window.HelpDrawer.isOpen()), { timeout: 8000 })
    .toBe(true);
  expect(errors).toEqual([]);
});

test('HelpDrawer.open() on the stub loads the module and opens it', async ({ page }) => {
  // coaching.js ("Learn more") calls this directly with no event and no
  // fallback, so the stub has to honour the call rather than just exist.
  const errors = await open(page, 'home.html');
  await page.evaluate(() => window.HelpDrawer.open({ tab: 'help', query: 'backstitch' }));
  await page.waitForFunction(() => !!(window.HelpDrawer && window.HelpDrawer.__real), { timeout: 15000 });
  await expect.poll(() => page.evaluate(() => window.HelpDrawer.isOpen()), { timeout: 8000 })
    .toBe(true);
  expect(errors).toEqual([]);
});

test('backup-restore loads on demand and exposes its synchronous API', async ({ page }) => {
  const errors = await open(page, 'manager.html');
  expect(await scriptPresent(page, 'backup-restore.js')).toBe(false);
  // The stub must satisfy the feature tests command-palette.js and
  // preferences-modal.js make before the module exists.
  expect(await page.evaluate(() => typeof window.BackupRestore.downloadBackup)).toBe('function');

  const api = await page.evaluate(async () => {
    const m = await window.loadBackupRestore();
    return {
      parse: typeof m.parseBackupText,
      validate: typeof m.validate,
      restore: typeof m.restore,
      stubGone: !window.BackupRestore.__stub,
      // The round trip that header.js and manager-app.js actually perform.
      roundTrip: (() => {
        try { return m.validate(m.parseBackupText('{"_format":"cross-stitch-backup"}')).valid; }
        catch (e) { return 'threw: ' + e.message; }
      })(),
    };
  });

  expect(await scriptPresent(page, 'backup-restore.js'), 'module arrived').toBe(true);
  expect(api.parse).toBe('function');
  expect(api.validate).toBe('function');
  expect(api.restore).toBe('function');
  expect(api.stubGone, 'the real module replaced the stub on window').toBe(true);
  expect(errors).toEqual([]);
});

test('a second trigger does not fetch the module twice', async ({ page }) => {
  await open(page, 'stitch.html');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cs:openHelp')));
  await page.waitForFunction(() => !!(window.HelpDrawer && window.HelpDrawer.__real), { timeout: 15000 });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('cs:openHelp'));
    window.dispatchEvent(new CustomEvent('cs:openShortcuts'));
  });
  await page.waitForTimeout(800);

  const tags = await page.evaluate(() => document.querySelectorAll('script[src="help-drawer.js"]').length);
  expect(tags, 'loadScript must dedupe repeat triggers').toBe(1);
});
