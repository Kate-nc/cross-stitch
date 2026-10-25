// Pairing sync through the relay (relay-sync.js + api/relay.js). serve.js runs
// the relay function with its in-memory store, so two browser contexts stand
// in for a laptop and an iPad.
const { test, expect } = require('@playwright/test');
const { installLocalCdn } = require('./local-cdn');

async function device(browser, name) {
  const context = await browser.newContext();
  await installLocalCdn(context);
  const page = await context.newPage();
  await page.addInitScript(n => { if (!localStorage.getItem('cs_sync_deviceName')) localStorage.setItem('cs_sync_deviceName', n); }, name);
  await page.goto('/home.html');
  await page.waitForFunction(() => window.SyncRelay && window.SyncRelayDialogs && window.ProjectStorage && window.PreferencesModal);
  return { context, page };
}
async function preferences(page) {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('button', { name: 'Preferences…', exact: true }).click();
  await page.getByRole('button', { name: 'Sync, backup & data', exact: true }).click();
}
const project = (id, name) => ({ id, version: 11, name, settings: { sW: 2, sH: 1 }, pattern: [{ id: '310' }, { id: '310' }], done: [0, 0] });
const names = page => page.evaluate(async () => (await ProjectStorage.listProjects()).map(p => p.name).sort());

test('pair with a typed code, then projects travel both ways, encrypted on the relay', async ({ browser }) => {
  const laptop = await device(browser, 'Laptop');
  const ipad = await device(browser, 'iPad');
  await laptop.page.evaluate(p => ProjectStorage.save(p), project('proj_laptop', 'From the laptop'));

  await preferences(laptop.page);
  await laptop.page.getByRole('button', { name: 'Show a pairing code' }).click();
  const code = (await laptop.page.locator('.relay-code').textContent()).trim();
  expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  await expect(laptop.page.locator('.relay-qr svg')).toBeVisible();

  await preferences(ipad.page);
  await ipad.page.getByRole('button', { name: 'Enter a pairing code' }).click();
  await ipad.page.getByLabel('Or type the code').fill(code.toLowerCase());
  await ipad.page.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(ipad.page.getByText('Paired. Your projects will sync while stitchx is open.')).toBeVisible();
  await expect(laptop.page.getByText('2 devices are paired.')).toBeVisible({ timeout: 20000 });

  // The laptop holds back its upload until another device joins.
  await laptop.page.evaluate(() => SyncRelay.syncNow());
  await ipad.page.evaluate(() => SyncRelay.syncNow());
  await expect.poll(() => names(ipad.page)).toContain('From the laptop');

  await ipad.page.evaluate(p => ProjectStorage.save(p), project('proj_ipad', 'From the iPad'));
  await ipad.page.evaluate(() => SyncRelay.syncNow());
  await laptop.page.evaluate(() => SyncRelay.syncNow());
  await expect.poll(() => names(laptop.page)).toEqual(['From the iPad', 'From the laptop']);

  // What the relay holds is ciphertext.
  const stored = await laptop.page.evaluate(async () => {
    const st = JSON.parse(localStorage.getItem('cs_relay_v1'));
    const auth = { Authorization: 'Bearer ' + await SyncRelay._test.accessToken(st) };
    const list = await (await fetch('api/relay?op=list&space=' + st.space, { headers: auth })).json();
    const out = [];
    for (const id of Object.keys(list.devices)) {
      const obj = SyncEngine.decompress(await (await fetch('api/relay?op=get&space=' + st.space + '&device=' + id, { headers: auth })).arrayBuffer());
      out.push({ encrypted: obj._encrypted === true, leaks: JSON.stringify(obj).includes('From the') });
    }
    return out;
  });
  expect(stored).toHaveLength(2);
  for (const f of stored) expect(f).toEqual({ encrypted: true, leaks: false });

  await laptop.context.close();
  await ipad.context.close();
});

test('a wrong code is refused, and unpairing keeps local projects', async ({ browser }) => {
  const laptop = await device(browser, 'Laptop');
  const ipad = await device(browser, 'iPad');
  await expect(ipad.page.evaluate(() => SyncRelay.joinWithCode('ABCD-EFGH-JKMN').then(() => 'joined', e => e.code))).resolves.toBe('pairing-missing');
  await expect(ipad.page.evaluate(() => SyncRelay.joinWithCode('not a code').then(() => 'joined', e => e.code))).resolves.toBe('bad-code');

  const pairing = await laptop.page.evaluate(() => SyncRelay.startPairing());
  // Showing a code alone uploads nothing.
  await laptop.page.evaluate(() => SyncRelay.syncNow());
  const alone = await laptop.page.evaluate(() => SyncRelay.getStatus());
  expect(alone.state).toBe('waiting');
  expect(alone.lastUploadAt).toBeNull();
  await ipad.page.evaluate(c => SyncRelay.joinWithCode(c), pairing.qrText);
  await ipad.page.evaluate(p => ProjectStorage.save(p), project('proj_keep', 'Kept after unpairing'));
  await ipad.page.evaluate(() => SyncRelay.syncNow());
  await ipad.page.evaluate(() => SyncRelay.unpair());
  expect(await ipad.page.evaluate(() => SyncRelay.isPaired())).toBe(false);
  expect(await names(ipad.page)).toContain('Kept after unpairing');
  // Only the iPad's copy left the relay; the laptop is still paired.
  expect(await laptop.page.evaluate(() => SyncRelay.deviceCount())).toBe(1);
  expect(await laptop.page.evaluate(() => SyncRelay.isPaired())).toBe(true);

  await laptop.context.close();
  await ipad.context.close();
});
