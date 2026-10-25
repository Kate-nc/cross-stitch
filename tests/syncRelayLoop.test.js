// The relay-sync.js sync loop, run for real against the relay's request
// handler and in-memory store, with Jest's fake timers. Each simulated device
// has its own storage, device identity and stand-in SyncEngine.
const fs = require('fs');
const nodeCrypto = require('crypto');
const { handle, TTL_SECONDS, PUT_SCRIPT } = require('../api/_relay-core');
const { memoryStore } = require('../api/_relay-memory-store');

const SOURCE = fs.readFileSync('./relay-sync.js', 'utf8');
const MIN = 60 * 1000;

// WebCrypto with a digest that settles through promises only, so fake timers
// can drive whole cycles. Real random values.
const testCrypto = {
  getRandomValues: a => nodeCrypto.getRandomValues(a),
  subtle: { digest: async (_alg, data) => { const h = nodeCrypto.createHash('sha256').update(Buffer.from(data)).digest(); return h.buffer.slice(h.byteOffset, h.byteOffset + h.length); } },
};

let store, storeOffset, requests;
function relayFetch(dev) {
  return async (url, init) => {
    const u = new URL(url), q = Object.fromEntries(u.searchParams);
    const headers = {};
    Object.entries((init && init.headers) || {}).forEach(([k, v]) => { headers[k.toLowerCase()] = v; });
    const body = init && init.body != null ? Buffer.from(init.body) : null;
    const out = await handle(store, { method: (init && init.method) || 'GET', op: q.op, query: q, headers, body, ip: '192.0.2.1' });
    requests.push({ device: dev.name, op: q.op, status: out.status, at: Date.now() });
    if (dev.dropNextPutAnswer && q.op === 'put') { dev.dropNextPutAnswer = false; throw new TypeError('network'); }
    const resHeaders = out.headers || {};
    return {
      ok: out.status >= 200 && out.status < 300, status: out.status,
      headers: { get: k => resHeaders[k] || resHeaders[k.toLowerCase()] || null },
      json: async () => Buffer.isBuffer(out.body) ? JSON.parse(out.body.toString()) : out.body,
      arrayBuffer: async () => { const b = Buffer.isBuffer(out.body) ? out.body : Buffer.from(JSON.stringify(out.body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); },
    };
  };
}

function engine(dev) {
  let rev = 0;
  dev.received = [];
  return {
    getDeviceId: () => dev.id,
    regenerateDeviceId: () => { dev.id = dev.id + '_fresh'; return dev.id; },
    getPendingPlan: () => null,
    setPendingPlan: () => {},
    getLocalChangeRev: () => rev,
    edit: () => { rev = Math.max(rev + 1, Date.now()); },
    exportSync: async () => ({ _version: 2, _deliveryId: nodeCrypto.randomUUID(), _deviceId: dev.id, work: dev.name + '@' + rev, _coversChangeRev: rev }),
    compress: obj => new TextEncoder().encode(JSON.stringify(obj)),
    decompress: buf => JSON.parse(new TextDecoder().decode(new Uint8Array(buf))),
    decryptSyncObj: async obj => obj,
    receiveAutomatic: async obj => { dev.received.push(obj.work); return 'applied'; },
    markDelivered: () => {},
  };
}

// Starts relay-sync.js for a device. Passing the same `storage` again models
// reloading the page.
function device(name, id, opts = {}) {
  const dev = { name, id, storage: opts.storage || new Map() };
  const localStorage = {
    getItem: k => (dev.storage.has(k) ? dev.storage.get(k) : null),
    setItem: (k, v) => dev.storage.set(k, String(v)),
    removeItem: k => dev.storage.delete(k),
  };
  dev.engine = opts.engine || engine(dev);
  const listeners = {};
  const win = { SyncEngine: dev.engine, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, dispatchEvent: () => true };
  const doc = { visibilityState: 'visible', addEventListener: (t, f) => { (listeners['doc:' + t] = listeners['doc:' + t] || []).push(f); } };
  new Function('window', 'document', 'navigator', 'localStorage', 'location', 'fetch', 'SyncEngine', 'crypto', SOURCE)(
    win, doc, { onLine: true }, localStorage, { href: 'http://localhost/home.html' }, relayFetch(dev), dev.engine, testCrypto);
  dev.relay = win.SyncRelay;
  return dev;
}

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// Puts devices in one sync space, as pairing would.
function pairState(...devs) {
  const state = JSON.stringify({ space: b64url(nodeCrypto.randomBytes(16)), key: b64url(nodeCrypto.randomBytes(32)) });
  for (const d of devs) {
    d.storage.set('cs_relay_v1', state);
    d.storage.set('cs_relay_progress_v1', JSON.stringify({ space: JSON.parse(state).space, sentRev: 0, seen: {}, lastUploadAt: null, lastDownloadAt: null, hadPartner: true }));
  }
}
const progress = d => JSON.parse(d.storage.get('cs_relay_progress_v1'));
const ops = (dev, op, after = 0) => requests.filter(r => r.device === dev.name && r.op === op && r.at >= after);
async function listDevices(dev) {
  const st = JSON.parse(dev.storage.get('cs_relay_v1'));
  const token = await dev.relay._test.accessToken(st);
  const out = await handle(store, { method: 'GET', op: 'list', query: { space: st.space }, headers: { authorization: 'Bearer ' + token }, body: null });
  return out.status === 200 ? Object.keys(out.body.devices).sort() : out.body.error;
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-10-25T10:00:00Z') });
  storeOffset = 0;
  store = memoryStore(() => Date.now() + storeOffset, { yieldBetween: false });
  requests = [];
});
afterEach(() => { jest.useRealTimers(); });

test('saving every 10 seconds for 10 minutes still uploads and keeps checking', async () => {
  const a = device('A', 'dev_A');
  pairState(a);
  await a.relay.syncNow();
  const start = Date.now();
  for (let t = 0; t < 10 * MIN; t += 10000) {
    a.engine.edit();
    a.relay.changed();
    await jest.advanceTimersByTimeAsync(10000);
  }
  // Polls never stop, and uploads keep going at the 5-minute pace, including
  // after the first cooldown ends.
  expect(ops(a, 'list', start + 6 * MIN).length).toBeGreaterThanOrEqual(2);
  expect(ops(a, 'put', start + 1000).length).toBeGreaterThanOrEqual(2);
  expect(ops(a, 'put', start + 5 * MIN).length).toBeGreaterThanOrEqual(1);
  expect(ops(a, 'put', start + 1000).length).toBeLessThanOrEqual(3);
});

test('a copied browser using the same device identity is stopped, not allowed to overwrite', async () => {
  const original = device('original', 'dev_same');
  const copy = device('copy', 'dev_same');
  pairState(original, copy);
  await original.relay.syncNow();
  await copy.relay.syncNow();
  expect(copy.relay.getStatus().state).toBe('identity-clash');
  expect(ops(copy, 'put')).toHaveLength(0);

  // The original carries on; the copy stays stopped until it is fixed.
  original.engine.edit();
  await original.relay.syncNow();
  expect(original.relay.getStatus().state).toBe('idle');
  await jest.advanceTimersByTimeAsync(10 * MIN);
  expect(ops(copy, 'put')).toHaveLength(0);

  // Fixed: the copy becomes its own device and picks up the original's work.
  await copy.relay.fixIdentity();
  expect(copy.relay.getStatus().state).toBe('idle');
  expect(await listDevices(original)).toEqual(['dev_same', 'dev_same_fresh']);
  expect(copy.received.length).toBeGreaterThan(0);
});

test('an upload whose answer is lost is recognised, not mistaken for a copy', async () => {
  const a = device('A', 'dev_A');
  pairState(a);
  await a.relay.syncNow();
  a.engine.edit();
  a.dropNextPutAnswer = true;
  await a.relay.syncNow();
  expect(a.relay.getStatus().state).toBe('retrying');
  await a.relay.syncNow();
  expect(a.relay.getStatus().state).toBe('idle');
  expect(progress(a).pendingEtag).toBeNull();
});

test('after the space expires, every returning device restores its file', async () => {
  const a = device('A', 'dev_A');
  const b = device('B', 'dev_B');
  pairState(a, b);
  await a.relay.syncNow();
  await b.relay.syncNow();
  expect(await listDevices(a)).toEqual(['dev_A', 'dev_B']);

  storeOffset += (TTL_SECONDS + 60) * 1000; // a month passes with nobody syncing
  expect(await listDevices(a)).toBe('space-missing');

  // A comes back first and recreates the space; B returns later with no new
  // local changes, and its first attempt fails mid-upload. After a reload it
  // must still restore its file.
  await a.relay._test.run();
  expect(await listDevices(a)).toEqual(['dev_A']);
  const realEval = store.eval;
  store.eval = async (script, keys, args) => {
    if (script === PUT_SCRIPT && args[1] === 'dev_B') throw new Error('store down');
    return realEval(script, keys, args);
  };
  await b.relay._test.run();
  expect(b.relay.getStatus().state).toBe('retrying');
  store.eval = realEval;
  expect(await listDevices(a)).toEqual(['dev_A']);
  const reloaded = device('B', 'dev_B', { storage: b.storage, engine: b.engine });
  await reloaded.relay._test.run();
  expect(await listDevices(a)).toEqual(['dev_A', 'dev_B']);
});

test('a device that has not met a partner yet uploads nothing', async () => {
  const a = device('A', 'dev_A');
  pairState(a);
  const p = progress(a); p.hadPartner = false; a.storage.set('cs_relay_progress_v1', JSON.stringify(p));
  a.engine.edit();
  await a.relay.syncNow();
  await jest.advanceTimersByTimeAsync(10 * MIN);
  expect(ops(a, 'put')).toHaveLength(0);
  expect(a.relay.getStatus().state).toBe('waiting');
});
