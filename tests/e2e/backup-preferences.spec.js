const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { installLocalCdn } = require('./local-cdn');
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });
async function open(page) {
  await page.goto('/home.html');
  await page.waitForFunction(() => window.UserPrefs && window.loadBackupRestore && window.PreferencesModal);
}

test('downloaded full backup restores portable preferences in a separate empty browser profile', async ({ page, browser }) => {
  await open(page);
  const selected = { designerName: 'Needle Studio', designerCopyright: '', designerContact: 'studio@example.test',
    trackerTimingMode: 'batchAware', exportPreset: 'homePrinting', exportPageSize: 'letter',
    exportMarginsMm: 0, exportChartModeBw: false, a11yHighContrast: true, trackerIdleMinutes: 0 };
  await page.evaluate(values => {
    Object.entries(values).forEach(([k,v]) => UserPrefs.set(k,v));
    UserPrefs.set('sync.includePrefs', true);
    localStorage.setItem('cs_pview_example', '{"scrollTop":999}');
    localStorage.setItem('cs_pref_unknown', '"secret"');
  }, selected);
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => (await window.loadBackupRestore()).downloadBackup());
  const download = await downloadPromise;
  const text = fs.readFileSync(await download.path(), 'utf8');
  const dest = await browser.newContext({ serviceWorkers: 'block' });
  try {
    await installLocalCdn(dest);
    const clean = await dest.newPage();
    await open(clean);
    expect(await clean.evaluate(() => UserPrefs.get('designerName'))).toBe('');
    await clean.evaluate(async text => (await window.loadBackupRestore()).restoreBackup(new File([text], 'backup.csb')), text);
    await clean.reload();
    await clean.waitForFunction(() => window.UserPrefs);
    expect(await clean.evaluate(keys => Object.fromEntries(keys.map(k => [k, UserPrefs.get(k)])), Object.keys(selected))).toEqual(selected);
    expect(await clean.evaluate(() => UserPrefs.get('sync.includePrefs'))).toBe(false);
    expect(await clean.evaluate(() => localStorage.getItem('cs_pview_example'))).toBeNull();
    expect(await clean.evaluate(() => localStorage.getItem('cs_pref_unknown'))).toBeNull();
    await clean.waitForFunction(() => window.PreferencesModal);
    await clean.getByRole('button', { name: 'File', exact: true }).click();
    await clean.getByRole('button', { name: 'Preferences…', exact: true }).click();
    await clean.getByRole('button', { name: 'Profile & branding', exact: true }).click();
    await expect(clean.getByPlaceholder("e.g. Katie's Stitches")).toHaveValue('Needle Studio');
  } finally { await dest.close(); }
});

test('malformed values default deterministically and old backups preserve local preferences', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const api = await window.loadBackupRestore();
    const old = { _format: 'cross-stitch-backup', _version: 1, databases: {}, localStorage: {} };
    UserPrefs.set('designerName', 'local studio');
    await api.restore(old);
    const oldName = UserPrefs.get('designerName');
    await api.restore({ ...old, preferences: { version: 1, stateSchemaVersion: 1, values: {
      trackerTimingMode: 'obsolete', exportMarginsMm: '0', a11yHighContrast: {}, unknown: true
    } } });
    return { oldName, name: UserPrefs.get('designerName'), timing: UserPrefs.get('trackerTimingMode'),
      margins: UserPrefs.get('exportMarginsMm'), contrast: UserPrefs.get('a11yHighContrast'), unknown: localStorage.getItem('cs_pref_unknown') };
  });
  expect(result).toEqual({ oldName: 'local studio', name: '', timing: 'classic', margins: 12, contrast: false, unknown: null });
});
