const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { installLocalCdn } = require('./local-cdn');
async function open(page) {
  page.on('pageerror', error => console.log('Browser error:', error.message));
  await page.goto('/home.html');
  await page.waitForFunction(() => window.UserPrefs && window.ProjectStorage && window.RecoveryStorage && window.loadBackupRestore);
}
async function seed(page) {
  await page.evaluate(async () => {
    const p = {
      version: 11, id: 'proj_recovery', name: 'Garden sampler', page: 'creator',
      createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-15T15:20:00.000Z',
      settings: { sW: 80, sH: 80, fabricCt: 16, strands: 2, isScratchMode: true, traceImage: true, overlayOpacity: 0.35 },
      pattern: Array.from({ length: 6400 }, (_, i) => ({ id: i % 3 ? '310' : '310+550', type: i % 3 ? 'solid' : 'blend' })),
      done: Uint8Array.from({ length: 6400 }, (_, i) => i < 500 ? 1 : 0),
      halfStitches: [[242, { fwd: { id: '550', type: 'solid' } }]], halfDone: [[242, { fwd: true }]],
      partialStitches: [[404, { TL: { id: '310', type: 'solid' } }]], partialDone: [[404, ['TL']]],
      bsLines: [{ x1: 1, y1: 1, x2: 5, y2: 5, colorId: '310' }], bsDone: ['1,1,5,5,310'],
      knots: [{ x: 7, y: 8, colorId: '550' }], knotsDone: ['7,8'], parkMarkers: [{ x: 6, y: 6, id: '310' }],
      notes: 'Blue flowers next. Keep the custom blend.', finishStatus: 'active',
      statsSessions: [{ id: 'session_saved', date: '2026-10-15', durationSeconds: 1200, stitchesCompleted: 500 }],
      stitchLog: [{ date: '2026-10-15', count: 500 }], threadOwned: { '310': true, '550': true },
      trackerLiveStash: { checkpoint: { 'dmc:310': 500 }, mode: 'live' },
      snapshots: [{ id: 'manual_1', name: 'First evening', done: [1, 0, 0] }]
    };
    await ProjectStorage.save(p, { preserveUpdatedAt: true });
    await BlobStore.put('trace:proj_recovery', { blob: new Blob(['tracing-image-\u00a3'], { type: 'image/png' }), name: 'garden.png', type: 'image/png' });
    await BlobStore.put('photo:proj_recovery:one', { projectId: p.id, blob: new Blob(['full-photo'], { type: 'image/jpeg' }), bytes: 10, type: 'image/jpeg', w: 1600, h: 900 });
    await BlobStore.put('photothumb:proj_recovery:one', { projectId: p.id, blob: new Blob(['thumbnail'], { type: 'image/jpeg' }), type: 'image/jpeg' });
    await BlobStore.put('session:proj_recovery:active', { v: 1, projectId: p.id, sessionId: 'active', checkpointAt: 1792076400000, records: [{ id: 'active', date: '2026-10-15', durationSeconds: 60, stitchesCompleted: 0 }] });
    const db = await window.openManagerDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('manager_state', 'readwrite'), store = tx.objectStore('manager_state');
      store.put({ 'dmc:310': { owned: 3, minStock: 1, history: [{ id: 'purchase_1', quantity: 3 }], addedAt: '2026-10-01', deductions: { proj_recovery: 0.25 } } }, 'threads');
      store.put([{ id: 'library_1', projectId: p.id, name: p.name, threadRequirements: { 'dmc:310': 1 } }], 'patterns');
      store.put({ version: 1, threads: { 'dmc:310': { observed: 500, deducted: 0.25 } }, migration: 'checkpoint-existing-consumption' }, 'rt_deduction:proj_recovery');
      store.put(3, 'schema_version');
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    });
    db.close();
    UserPrefs.set('designerName', 'Garden Studio');
  });
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const b = await (await window.loadBackupRestore()).createBackup();
    // Sync baselines are device-local derived state and may be refreshed on startup.
    b.databases.CrossStitchDB.sync_snapshots = [];
    return { databases: b.databases, attachments: b.attachments, preferences: b.preferences, localStorage: b.localStorage };
  });
}
async function archive(page) {
  const pending = page.waitForEvent('download');
  await page.evaluate(async () => (await window.loadBackupRestore()).downloadBackup());
  return fs.readFileSync(await (await pending).path(), 'utf8');
}
async function importText(page, text) {
  return page.evaluate(async text => (await window.loadBackupRestore()).restoreBackup(new File([text], 'backup.csb')), text);
}
test.beforeEach(async ({ context }) => { await installLocalCdn(context); });

test('populated downloaded archive restores semantic data and all attachment bytes in a fresh profile; repeated import is a no-op', async ({ page, browser }) => {
  await open(page); await seed(page);
  const before = await snapshot(page), text = await archive(page);
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await installLocalCdn(context);
  try {
    const clean = await context.newPage(); await open(clean);
    const result = await importText(clean, text);
    expect(result.requiresReload).toBe(true);
    await clean.reload(); await clean.waitForFunction(() => window.UserPrefs && window.ProjectStorage);
    expect(await snapshot(clean)).toEqual(before);
    const pointer = await clean.evaluate(() => RecoveryStorage.current());
    expect((await importText(clean, text)).unchanged).toBe(true);
    expect(await clean.evaluate(() => RecoveryStorage.current())).toBe(pointer);
    expect(await snapshot(clean)).toEqual(before);
  } finally { await context.close(); }
});

test('corruption, missing attachment, future version and colliding IDs leave destination unchanged', async ({ page }) => {
  await open(page); await seed(page);
  const before = await snapshot(page);
  const outcomes = await page.evaluate(async () => {
    const api = await window.loadBackupRestore(), b = await api.createBackup(), results = [];
    const corrupt = structuredClone(b); corrupt.databases.CrossStitchDB.projects[0].value.notes += 'corrupt';
    const missing = structuredClone(b); missing.attachments.pop();
    const future = { ...b, _version: 999 };
    const legacyCollision = structuredClone(b); legacyCollision._version = 1; legacyCollision.databases.CrossStitchDB.projects.find(e => e.key === 'proj_recovery').value.notes = 'different project version';
    for (const candidate of [corrupt, missing, future, legacyCollision]) {
      try { await api.restore(candidate); results.push('unexpected success'); } catch (e) { results.push(e.message); }
    }
    return results;
  });
  expect(outcomes[0]).toMatch(/integrity/);
  expect(outcomes[1]).toMatch(/manifest|photo|attachment|tracing/i);
  expect(outcomes[2]).toMatch(/Unsupported/);
  expect(outcomes[3]).toMatch(/Identifier collision/);
  expect(await snapshot(page)).toEqual(before);
});

for (const mode of ['project-quota', 'stash-quota', 'settings-quota', 'publication-quota', 'interrupted']) {
  test(`${mode}: publication never exposes partial data and original data survives reload`, async ({ page }) => {
    await open(page); await seed(page);
    const before = await snapshot(page);
    await page.evaluate(async mode => {
      const api = await window.loadBackupRestore(), b = await api.createBackup();
      b._version = 1;
      const original = b.databases.CrossStitchDB.projects.find(e => e.key === 'proj_recovery');
      const extra = structuredClone(original); extra.key = extra.value.id = 'proj_imported';
      b.databases.CrossStitchDB.projects.push(extra);
      window.restoreInput = b;
      if (mode === 'settings-quota') RecoveryStorage.stageSetting = () => { throw new DOMException('settings quota', 'QuotaExceededError'); };
      if (mode === 'publication-quota') RecoveryStorage.publish = () => { throw new DOMException('pointer quota', 'QuotaExceededError'); };
      if (mode === 'project-quota' || mode === 'stash-quota') {
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
          if (this.transaction.db.name.includes('_restore_') && this.name === (mode === 'project-quota' ? 'projects' : 'manager_state')) throw new DOMException('staging quota', 'QuotaExceededError');
          return add.apply(this, args);
        };
      }

    }, mode);
    if (mode === 'interrupted') {
      // Hold just before the synchronous publication boundary, then discard the page.
      await page.evaluate(() => {
        const open = RecoveryStorage.openPhysical;
        RecoveryStorage.openPhysical = (...args) => {
          if (String(args[0]).startsWith('stitch_manager_db_restore_')) { window.stageReached = true; return { set onsuccess(v) {}, set onerror(v) {}, set onupgradeneeded(v) {} }; }
          return open(...args);
        };
        (window.loadBackupRestore().then(api => api.restore(window.restoreInput))).catch(() => {});
      });
      await page.waitForFunction(() => window.stageReached);
      await page.reload(); await page.waitForFunction(() => window.ProjectStorage && window.UserPrefs);
    } else {
      const error = await page.evaluate(async () => { try { await (await window.loadBackupRestore()).restore(window.restoreInput); return ''; } catch (e) { return e.message; } });
      expect(error).toMatch(/quota/);
      await page.reload(); await page.waitForFunction(() => window.ProjectStorage && window.UserPrefs);
    }
    expect(await snapshot(page)).toEqual(before);
    await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).filter(db => db.name.includes('_restore_')).length)).toBe(0);
  });
}

test('oversized compressed payload is bounded and oversized file is rejected before reading', async ({ page }) => {
  await open(page);
  const results = await page.evaluate(async () => {
    const api = await window.loadBackupRestore(), results = [];
    const bytes = pako.deflate(' '.repeat(api.maxFileBytes + 1));
    let bin = ''; for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    try { api.parseBackupText('CSB1\n' + btoa(bin)); } catch (e) { results.push(e.message); }
    try { await api.restoreBackup({ size: api.maxFileBytes + 1 }); } catch (e) { results.push(e.message); }
    return results;
  });
  expect(results).toHaveLength(2); results.forEach(result => expect(result).toMatch(/limit|oversized/));
});

for (const extension of ['json', 'csb']) {
  test(`legacy v1 ${extension} fixture preserves compact charts, photos, references and migrates old inventory`, async ({ page }) => {
    await open(page);
    const text = fs.readFileSync(`tests/fixtures/recovery-v1.${extension}`, 'utf8');
    const result = await importText(page, text);
    expect(result.warnings.join(' ')).toMatch(/Legacy or partial/);
    await page.reload(); await page.waitForFunction(() => window.ProjectStorage && window.UserPrefs);
    const b = await snapshot(page);
    expect(b.databases.CrossStitchDB.projects.find(e => e.key === 'proj_legacy').value).toMatchObject({ v: 8, notes: 'Original compact chart', done: [1, 0, 0, 1], p: [['310'], ['550'], ['310', 'k'], ['310+550', 'b']] });
    expect(b.attachments.map(a => a.data).sort()).toEqual(['bGVnYWN5LWZ1bGw=', 'bGVnYWN5LXRodW1i'].sort());
    const state = Object.fromEntries(b.databases.stitch_manager_db.manager_state.map(e => [e.key, e.value]));
    expect(state.threads['dmc:310']).toMatchObject({ owned: 2, acquisitionSource: 'legacy', history: [] });
    expect(state['rt_deduction:proj_legacy'].threads['dmc:310'].deducted).toBe(0.1);
    expect(state.patterns[0].projectId).toBe('proj_legacy');
  });
}

test('unsafe record keys, unsupported stores and malformed specialised marks are rejected before publication', async ({ page }) => {
  await open(page);
  const results = await page.evaluate(async () => {
    const api = await window.loadBackupRestore(), base = { _format: 'cross-stitch-backup', _version: 1, databases: {} };
    const poison = JSON.parse('{"_format":"cross-stitch-backup","_version":1,"databases":{},"__proto__":{"polluted":true}}');
    const store = { ...base, databases: { CrossStitchDB: { arbitrary_store: [] } } };
    const malformed = { ...base, databases: { CrossStitchDB: { projects: [{ key: 'proj_bad', value: { id: 'proj_bad', pattern: [], halfDone: [1] } }] } } };
    const name = { ...base, databases: { CrossStitchDB: { projects: [{ key: 'proj_bad', value: { id: 'proj_bad', name: { corrupt: true }, pattern: [] } }] } } };
    const results = [];
    for (const b of [poison, store, malformed, name]) { try { await api.restore(b); results.push('unexpected success'); } catch (e) { results.push(e.message); } }
    return results;
  });
  expect(results[0]).toMatch(/unsafe/);
  expect(results[1]).toMatch(/unsupported|malformed/i);
  expect(results[2]).toMatch(/specialised stitch/i);
  expect(results[3]).toMatch(/project name/i);
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
  expect(await page.evaluate(() => RecoveryStorage.current())).toBeNull();
});

test('pending preference timers cannot overwrite published settings; enumeration and sessionStorage keep their meanings', async ({ page }) => {
  await open(page);
  const outcome = await page.evaluate(async () => {
    const api = await window.loadBackupRestore(), preferences = UserPrefs.exportPortable();
    preferences.values.exportMarginsMm = 7;
    preferences.values.trackerAutomaticSnapshots = true;
    UserPrefs.setDebounced('exportMarginsMm', 44);
    sessionStorage.setItem('cs_pref_exportMarginsMm', 'session only');
    await api.restore({ _format: 'cross-stitch-backup', _version: 1, databases: {}, preferences });
    await new Promise(resolve => setTimeout(resolve, 600));
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    const value = UserPrefs.get('exportMarginsMm');
    const duplicate = await api.restore({ _format: 'cross-stitch-backup', _version: 1, databases: {}, preferences });
    localStorage.removeItem('cs_pref_exportMarginsMm');
    return { value, keys, unchanged: duplicate.unchanged, removed: localStorage.getItem('cs_pref_exportMarginsMm'), session: sessionStorage.getItem('cs_pref_exportMarginsMm') };
  });
  expect(outcome.value).toBe(7); expect(outcome.unchanged).toBe(true);
  expect(outcome.keys).toContain('cs_pref_exportMarginsMm');
  expect(outcome.keys.some(key => key.startsWith('cs_recovery_setting:'))).toBe(false);
  expect(outcome.removed).toBeNull(); expect(outcome.session).toBe('session only');
});

test('publication pauses a stale tab and its next export/restore requires reload', async ({ page, context }) => {
  await open(page);
  const peer = await context.newPage(); await open(peer);
  await page.evaluate(async () => {
    const api = await window.loadBackupRestore(), preferences = UserPrefs.exportPortable();
    preferences.values.designerName = 'Published studio';
    await api.restore({ _format: 'cross-stitch-backup', _version: 1, databases: {}, preferences });
  });
  await peer.waitForFunction(() => window.__restoringBackup > Date.now());
  const errors = await peer.evaluate(async () => {
    const api = await window.loadBackupRestore(), out = [];
    try { await api.createBackup(); } catch (e) { out.push(e.message); }
    try { await api.restore({ _format: 'cross-stitch-backup', _version: 1, databases: {} }); } catch (e) { out.push(e.message); }
    return out;
  });
  expect(errors).toHaveLength(2); errors.forEach(error => expect(error).toMatch(/Reload/));
  expect(await peer.evaluate(() => window.__restoringBackup > Date.now())).toBe(true);
  await peer.reload(); await peer.waitForFunction(() => window.UserPrefs);
  expect(await peer.evaluate(() => UserPrefs.get('designerName'))).toBe('Published studio');
});
