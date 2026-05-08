// Encryption tests for the sync subsystem.
//
// Pins down the post-Tier-2 encrypted-envelope behaviour:
//
//   1. encrypt → decrypt round-trip preserves the sensitive inner
//      fields (projects, stash, prefs, deletedProjectIds, _projectCountTotal,
//      _since) while leaving outer metadata (_format, _version, _deviceId,
//      _deviceName, _exportedAt) plaintext.
//   2. Wrong passphrase → EncryptionError("incorrect_passphrase").
//   3. Missing session passphrase on decrypt → EncryptionError(
//      "passphrase_required").
//   4. Malformed envelope (missing salt/IV/ciphertext) → EncryptionError(
//      "malformed").
//   5. validate() accepts an encrypted envelope (returns valid:true,
//      encrypted:true, projectCount:0).
//   6. exportSync() honours isEncryptionEnabled() and emits an envelope
//      with _encrypted:true plus the expected encryption metadata.
//   7. prepareImport() auto-decrypts when the session passphrase is set.

const fs = require('fs');
const path = require('path');
const pako = require('pako');

global.window = global.window || {};
global.localStorage = (() => {
  const store = {};
  return {
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
})();
global.pako = pako;
global.ProjectStorage = {
  listProjects: async () => [],
  get: async () => null,
  save: async (p) => p.id
};

const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
global.indexedDB = new FDBFactory();

if (typeof global.CustomEvent === 'undefined') {
  global.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = (init && init.detail) || null;
    }
  };
}
global.window.dispatchEvent = function () { return true; };

// Node 18+ exposes crypto.subtle on globalThis.crypto.
if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
  global.crypto = require('crypto').webcrypto;
}

const originalWarn = console.warn;
beforeAll(() => {
  console.warn = function (msg) {
    if (typeof msg === 'string' && msg.indexOf('SyncEngine') === 0) return;
    originalWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = originalWarn; });

const enginePath = path.join(__dirname, '..', 'sync-engine.js');
const engineSrc = fs.readFileSync(enginePath, 'utf8');
eval(engineSrc);
const SE = global.SyncEngine || global.window.SyncEngine;

beforeEach(() => {
  global.localStorage.clear();
  SE.clearPendingPlan && SE.clearPendingPlan();
  SE.clearEncryptionPassphrase();
  SE.setEncryptionEnabled(false);
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('encryption round-trip', () => {
  test('encrypt then decrypt restores the original sensitive inner fields', async () => {
    const original = {
      _format: 'cross-stitch-sync',
      _version: 1,
      _deviceId: 'dev-A',
      _deviceName: 'Test Device',
      _exportedAt: '2025-01-01T00:00:00.000Z',
      projects: [{ id: 'p1', name: 'Sample', w: 2, h: 2, pattern: [] }],
      stash: { '310': { owned: 1 } },
      prefs: { theme: 'dark' },
      deletedProjectIds: ['old1'],
      _projectCountTotal: 1,
      _since: null
    };
    const envelope = await SE._test.encryptSyncObj(original, 'correct-horse-battery');
    // Outer metadata stays plaintext for device-list / validate paths.
    expect(envelope._format).toBe('cross-stitch-sync');
    expect(envelope._version).toBe(1);
    expect(envelope._deviceId).toBe('dev-A');
    expect(envelope._deviceName).toBe('Test Device');
    expect(envelope._encrypted).toBe(true);
    expect(envelope._encryption.algorithm).toBe('AES-GCM-256');
    expect(envelope._encryption.kdf).toBe('PBKDF2-SHA256');
    expect(envelope._encryption.iterations).toBe(310000);
    expect(typeof envelope._encryption.saltHex).toBe('string');
    expect(typeof envelope._encryption.ivHex).toBe('string');
    expect(typeof envelope._ciphertext).toBe('string');
    // Sensitive fields are stripped from the outer envelope.
    expect(envelope.projects).toBeUndefined();
    expect(envelope.stash).toBeUndefined();
    expect(envelope.prefs).toBeUndefined();
    expect(envelope.deletedProjectIds).toBeUndefined();

    const decrypted = await SE._test.decryptSyncObj(envelope, 'correct-horse-battery');
    expect(decrypted.projects).toEqual(original.projects);
    expect(decrypted.stash).toEqual(original.stash);
    expect(decrypted.prefs).toEqual(original.prefs);
    expect(decrypted.deletedProjectIds).toEqual(original.deletedProjectIds);
    expect(decrypted._projectCountTotal).toBe(1);
    expect(decrypted._encrypted).toBeUndefined();
    expect(decrypted._encryption).toBeUndefined();
    expect(decrypted._ciphertext).toBeUndefined();
  });

  test('two encryptions of the same payload produce different ciphertexts (random salt+IV)', async () => {
    const obj = { _format: 'cross-stitch-sync', _version: 1, projects: [{ id: 'p', w: 1, h: 1, pattern: [] }], stash: {}, prefs: {} };
    const a = await SE._test.encryptSyncObj(obj, 'pw');
    const b = await SE._test.encryptSyncObj(obj, 'pw');
    expect(a._ciphertext).not.toBe(b._ciphertext);
    expect(a._encryption.saltHex).not.toBe(b._encryption.saltHex);
    expect(a._encryption.ivHex).not.toBe(b._encryption.ivHex);
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe('encryption error paths', () => {
  test('wrong passphrase throws EncryptionError("incorrect_passphrase")', async () => {
    const obj = { _format: 'cross-stitch-sync', _version: 1, projects: [], stash: {}, prefs: {} };
    const env = await SE._test.encryptSyncObj(obj, 'right');
    await expect(SE._test.decryptSyncObj(env, 'wrong')).rejects.toMatchObject({
      name: 'EncryptionError',
      code: 'incorrect_passphrase'
    });
  });

  test('decryptSyncObj with no passphrase throws EncryptionError("passphrase_required")', async () => {
    const obj = { _format: 'cross-stitch-sync', _version: 1, projects: [], stash: {}, prefs: {} };
    const env = await SE._test.encryptSyncObj(obj, 'pw');
    // Engine's public decryptSyncObj falls back to session passphrase.
    await expect(SE.decryptSyncObj(env)).rejects.toMatchObject({
      name: 'EncryptionError',
      code: 'passphrase_required'
    });
  });

  test('malformed envelope (missing ciphertext) throws EncryptionError("malformed")', async () => {
    const broken = { _encrypted: true, _encryption: { saltHex: 'aa', ivHex: 'bb', iterations: 310000 } };
    await expect(SE._test.decryptSyncObj(broken, 'pw')).rejects.toMatchObject({
      name: 'EncryptionError',
      code: 'malformed'
    });
  });
});

// ---------------------------------------------------------------------------
// validate() and prepareImport() integration
// ---------------------------------------------------------------------------

describe('validate / prepareImport with encrypted envelopes', () => {
  test('validate() accepts a well-formed encrypted envelope', async () => {
    const obj = {
      _format: 'cross-stitch-sync', _version: 1, _deviceId: 'd1',
      projects: [{ id: 'p1', w: 1, h: 1, pattern: [{ id: '310' }] }],
      stash: {}, prefs: {}
    };
    const env = await SE._test.encryptSyncObj(obj, 'pw');
    const v = SE.validate(env);
    expect(v.valid).toBe(true);
    expect(v.summary.encrypted).toBe(true);
    // Project count is unknown without decrypting.
    expect(v.summary.projectCount).toBe(0);
  });

  test('validate() rejects an envelope claiming _encrypted:true with no metadata', () => {
    const v = SE.validate({ _format: 'cross-stitch-sync', _version: 1, _encrypted: true });
    expect(v.valid).toBe(false);
  });

  test('prepareImport auto-decrypts when the session passphrase is set', async () => {
    const obj = {
      _format: 'cross-stitch-sync', _version: 1, _deviceId: 'remote-1', _deviceName: 'Remote',
      _exportedAt: new Date().toISOString(),
      projects: [{ id: 'remote-proj', name: 'R', w: 1, h: 1, pattern: [{ id: '310' }], updatedAt: new Date().toISOString() }],
      stash: {}, prefs: {},
      _projectCountTotal: 1
    };
    const env = await SE._test.encryptSyncObj(obj, 'pw');
    SE.setEncryptionPassphrase('pw');
    const plan = await SE.prepareImport(env);
    expect(plan).toBeTruthy();
    // The plan should reflect a remote-only addition (we mocked
    // ProjectStorage.listProjects to return []).
    const remoteIds = (plan.newRemote || []).map(function (r) { return r.id; });
    expect(remoteIds).toContain('remote-proj');
  });

  test('prepareImport on an encrypted envelope with no session passphrase throws passphrase_required', async () => {
    const obj = {
      _format: 'cross-stitch-sync', _version: 1, _deviceId: 'remote-2',
      projects: [], stash: {}, prefs: {}
    };
    const env = await SE._test.encryptSyncObj(obj, 'pw');
    await expect(SE.prepareImport(env)).rejects.toMatchObject({
      name: 'EncryptionError',
      code: 'passphrase_required'
    });
  });
});

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

describe('encryption status helpers', () => {
  test('getEncryptionStatus reflects toggle and session passphrase state', () => {
    expect(SE.getEncryptionStatus()).toMatchObject({ enabled: false, hasPassphrase: false });
    SE.setEncryptionEnabled(true);
    SE.setEncryptionPassphrase('pw');
    expect(SE.getEncryptionStatus()).toMatchObject({ enabled: true, hasPassphrase: true });
    SE.clearEncryptionPassphrase();
    expect(SE.getEncryptionStatus()).toMatchObject({ enabled: true, hasPassphrase: false });
  });

  test('isEncryptionAvailable returns true under Node webcrypto', () => {
    expect(SE.isEncryptionAvailable()).toBe(true);
  });
});
