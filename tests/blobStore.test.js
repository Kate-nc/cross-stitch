/**
 * Large photos from Home, and Convert drafts that survive a reload
 * (P2-3, audit COMMON-07).
 */
const { IDBFactory } = require('fake-indexeddb');
const { loadSource } = require('./_helpers/loadSource');

let BlobStore;

function openTestDb() {
  return new Promise((resolve, reject) => {
    const req = global.indexedDB.open('CrossStitchDB', 5);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('pendingImports')) db.createObjectStore('pendingImports', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

beforeEach(() => {
  global.indexedDB = new IDBFactory();
  jest.resetModules();
  BlobStore = require('../blob-store.js');
  let dbp = null;
  BlobStore._setOpener(() => (dbp = dbp || openTestDb()));
});

describe('BlobStore', () => {
  test('put, get, delete', async () => {
    await BlobStore.put('handoff:a', { name: 'IMG_2041.jpg', blob: 'x' });
    const r = await BlobStore.get('handoff:a');
    expect(r.id).toBe('handoff:a');
    expect(r.name).toBe('IMG_2041.jpg');
    expect(typeof r.createdAt).toBe('number');
    await BlobStore.delete('handoff:a');
    expect(await BlobStore.get('handoff:a')).toBeNull();
  });

  test('list filters by kind, newest first', async () => {
    await BlobStore.put('draft:1', { name: 'one', createdAt: 1, blob: 'x' });
    await BlobStore.put('handoff:2', { name: 'two', blob: 'x' });
    await new Promise((r) => setTimeout(r, 5));
    await BlobStore.put('draft:3', { name: 'three', blob: 'x' });
    const drafts = await BlobStore.list('draft:');
    expect(drafts.map((d) => d.id)).toEqual(['draft:3', 'draft:1']);
    expect((await BlobStore.list('')).length).toBe(3);
  });

  test('the 30-minute sweep removes stale handoffs only', async () => {
    const now = Date.now();
    await BlobStore.put('handoff:old', { createdAt: now - 31 * 60 * 1000, blob: 'x' });
    await BlobStore.put('handoff:new', { createdAt: now - 5 * 60 * 1000, blob: 'x' });
    await BlobStore.put('draft:old', { createdAt: now - 31 * 60 * 1000, blob: 'x' });
    expect(BlobStore.HANDOFF_TTL_MS).toBe(30 * 60 * 1000);
    expect(await BlobStore.sweep('handoff:', BlobStore.HANDOFF_TTL_MS, now)).toBe(1);
    expect(await BlobStore.get('handoff:old')).toBeNull();
    expect(await BlobStore.get('handoff:new')).not.toBeNull();
    expect(await BlobStore.get('draft:old')).not.toBeNull();
  });

  test('ids carry their kind', () => {
    expect(BlobStore.newId('draft')).toMatch(/^draft:[a-z0-9]+$/);
    expect(BlobStore.newId('handoff')).not.toBe(BlobStore.newId('handoff'));
  });
});

describe('drafts stay out of projects, stats, backups and sync', () => {
  test('they live in pendingImports, which backups do not export', () => {
    const backup = loadSource('backup-restore.js');
    expect(backup).toMatch(/openDB\("CrossStitchDB", 4, \["projects", "project_meta", "stats_summaries", "sync_snapshots"\]\)/);
    expect(backup).not.toMatch(/pendingImports/);
  });

  test('sync only creates the store; it never reads it', () => {
    const sync = loadSource('sync-engine.js');
    expect((sync.match(/pendingImports/g) || []).length).toBe(2);
    expect(sync).toMatch(/if \(!db\.objectStoreNames\.contains\("pendingImports"\)\) db\.createObjectStore\("pendingImports"/);
  });

  test('the project list and stats read the projects store, not pendingImports', () => {
    const storage = loadSource('project-storage.js');
    expect((storage.match(/pendingImports/g) || []).length).toBe(2);
  });
});

describe('wiring', () => {
  const home = loadSource('home-app.js');
  const io = loadSource('creator/useProjectIO.js');
  const main = loadSource('creator-main.js');

  test('Home hands pictures over through IndexedDB, keeping sessionStorage as a fallback', () => {
    expect(home).toMatch(/BS\.put\(id, \{ blob: blob, name: file\.name/);
    expect(home).toMatch(/create\.html\?action=home-image-pending&from=home&handoff=/);
    expect(home).toMatch(/function handOffViaSession\(file\)/);
    expect(home).toMatch(/var MAX_HANDOFF_PX = 4000;/);
  });

  test('the Creator reads the handoff, then deletes it', () => {
    expect(main).toMatch(/window\.__pendingCreatorHandoffId = handoffId/);
    expect(io).toMatch(/BS\.get\(handoffId\)[\s\S]{0,600}BS\.delete\(handoffId\)/);
    expect(io).toMatch(/BS\.sweep\('handoff:', BS\.HANDOFF_TTL_MS\)/);
  });

  test('drafts are saved a second after a change and deleted on first generation', () => {
    expect(io).toMatch(/\}, 1000\);\s*return function\(\) \{ clearTimeout\(t\); \};\s*\}, \[draftSettingsKey\]\);/);
    expect(io).toMatch(/if \(!state\.pat \|\| !d \|\| !d\.id\) return;\s*if \(window\.BlobStore\) window\.BlobStore\.delete\(d\.id\)/);
  });

  test('draft settings are the conversion settings', () => {
    const keys = loadSource('creator/useCreatorState.js').match(/var CONVERSION_STATE_KEYS = \[([\s\S]*?)\];/)[1];
    const conv = keys.match(/'([^']+)'/g).map((k) => k.slice(1, -1))
      .filter((k) => ['globalStash', 'variationSeed', 'variationSubset'].indexOf(k) < 0);
    const draft = io.match(/var DRAFT_SETTING_KEYS = \[([\s\S]*?)\];/)[1];
    for (const k of conv) expect(draft).toContain("'" + k + "'");
  });
});
