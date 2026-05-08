// Handshake tests (Tier-2 cross-device pairing).
//
// Covers:
//   1. Token generation produces a Base64url string and a 6-digit
//      shortcode derived from the SHA-256 checksum.
//   2. validateHandshakeToken accepts the full token and resolves a
//      cached shortcode to the same bundle.
//   3. Self-pairing (same device id) and stale-folder (>7d) warnings
//      surface as non-fatal warnings.
//   4. Tampered tokens (bit-flipped checksum) are rejected.
//   5. Shortcode lookup misses → {needsToken:true} hint so the UI
//      can fall through to the paste path.
//   6. The cache is bounded to HANDSHAKE_TOKEN_CACHE_MAX (5).
//   7. suggestDeviceName proposes a non-colliding sibling name.

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
    constructor(type, init) { this.type = type; this.detail = (init && init.detail) || null; }
  };
}
global.window.dispatchEvent = function () { return true; };
if (typeof global.crypto === 'undefined' || !global.crypto.subtle) {
  global.crypto = require('crypto').webcrypto;
}
// btoa / atob shims (Node 16+ has them; defensive).
if (typeof global.btoa === 'undefined') global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
if (typeof global.atob === 'undefined') global.atob = (s) => Buffer.from(s, 'base64').toString('binary');

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
  SE.clearHandshakeCache();
});

describe('generateHandshakeToken', () => {
  test('produces a Base64url token and a 6-digit shortcode', async () => {
    SE.setDeviceName('Katie iMac');
    const out = await SE.generateHandshakeToken({
      folderHint: { displayName: 'Dropbox/Cross Stitch', estimatedFileCount: 12, lastSyncAt: new Date().toISOString() }
    });
    expect(typeof out.token).toBe('string');
    expect(out.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.shortcode).toMatch(/^\d{6}$/);
    expect(out.bundle.deviceName).toBe('Katie iMac');
    expect(out.bundle.checksum).toBe(out.checksum);
  });

  test('two calls with the same metadata produce the same shortcode (deterministic on bundle)', async () => {
    SE.setDeviceName('A');
    const a = await SE.generateHandshakeToken({ folderHint: null });
    const b = await SE.generateHandshakeToken({ folderHint: null });
    expect(a.shortcode).toBe(b.shortcode);
  });
});

describe('validateHandshakeToken', () => {
  test('accepts the full token and returns the original bundle', async () => {
    SE.setDeviceName('A');
    const gen = await SE.generateHandshakeToken({ folderHint: null });
    // Pretend we are a different device.
    global.localStorage.setItem('cs_device_id', 'dev_other');
    const v = await SE.validateHandshakeToken(gen.token);
    expect(v.valid).toBe(true);
    expect(v.bundle.deviceName).toBe('A');
    expect(v.warnings).toEqual(expect.arrayContaining([]));
  });

  test('resolves a cached 6-digit shortcode to the same bundle', async () => {
    SE.setDeviceName('A');
    const gen = await SE.generateHandshakeToken({ folderHint: null });
    const v = await SE.validateHandshakeToken(gen.shortcode);
    expect(v.valid).toBe(true);
    expect(v.bundle.deviceId).toBe(gen.bundle.deviceId);
  });

  test('shortcode miss returns needsToken so the UI can prompt for paste', async () => {
    const v = await SE.validateHandshakeToken('482917');
    expect(v.valid).toBe(false);
    expect(v.needsToken).toBe(true);
    expect(v.shortcode).toBe('482917');
  });

  test('flips a checksum byte in the encoded token → rejected', async () => {
    const gen = await SE.generateHandshakeToken({ folderHint: null });
    // Mutate the checksum field directly inside the bundle, re-pack
    // without recomputing the checksum: validate must catch it.
    const broken = Object.assign({}, gen.bundle, { checksum: '0'.repeat(64) });
    const json = JSON.stringify(broken);
    const compressed = pako.deflate(json);
    let bin = '';
    for (let i = 0; i < compressed.length; i++) bin += String.fromCharCode(compressed[i]);
    const tampered = global.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const v = await SE.validateHandshakeToken(tampered);
    expect(v.valid).toBe(false);
    expect(v.error).toMatch(/checksum/i);
  });

  test('warns on self-pairing (same deviceId)', async () => {
    SE.setDeviceName('A');
    const gen = await SE.generateHandshakeToken({ folderHint: null });
    const v = await SE.validateHandshakeToken(gen.token);
    expect(v.valid).toBe(true);
    const codes = v.warnings.map(w => w.code);
    expect(codes).toContain('self_pairing');
  });

  test('warns on stale folder hint (>7d)', async () => {
    SE.setDeviceName('A');
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const gen = await SE.generateHandshakeToken({ folderHint: { lastSyncAt: oldDate } });
    global.localStorage.setItem('cs_device_id', 'dev_other');
    const v = await SE.validateHandshakeToken(gen.token);
    const codes = v.warnings.map(w => w.code);
    expect(codes).toContain('stale_folder');
  });

  test('returns valid:false on garbled input', async () => {
    const v = await SE.validateHandshakeToken('not-a-real-token');
    expect(v.valid).toBe(false);
  });
});

describe('handshake cache', () => {
  test('cache is bounded to 5 entries', async () => {
    for (let i = 0; i < 8; i++) {
      // Mutate device id between generations so each token is unique
      // and lands in the cache as a separate entry.
      global.localStorage.setItem('cs_device_id', 'dev_' + i);
      await SE.generateHandshakeToken({ folderHint: null });
    }
    const raw = JSON.parse(global.localStorage.getItem('cs_handshake_tokens'));
    expect(raw.length).toBeLessThanOrEqual(5);
  });
});

describe('suggestDeviceName', () => {
  test('proposes a sibling name when local matches remote', () => {
    SE.setDeviceName('Katie iMac');
    expect(SE.suggestDeviceName('Katie iMac')).toBe('Katie iMac (other)');
  });

  test('keeps existing local name when it differs', () => {
    SE.setDeviceName('Phone');
    expect(SE.suggestDeviceName('Katie iMac')).toBe('Phone');
  });
});
