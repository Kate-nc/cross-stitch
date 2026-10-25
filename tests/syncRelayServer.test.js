// The sync relay's server side (api/_relay-core.js): access tokens, one file
// per device with collision detection, size limits, expiry, pairing bundles
// and rate limits. Runs against the in-memory store that local development uses.
const crypto = require('crypto');
const { handle, TTL_SECONDS, MAX_FILE_BYTES, MAX_DEVICES } = require('../api/_relay-core');
const { hashResult } = require('../api/_relay-store');
const { memoryStore } = require('../api/_relay-memory-store');

const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newSpace = () => b64url(crypto.randomBytes(16));
const newToken = () => b64url(crypto.randomBytes(32));

let clock, store;
beforeEach(() => { clock = 1_800_000_000_000; store = memoryStore(() => clock); });

function call(op, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (opts.token) headers.authorization = 'Bearer ' + opts.token;
  return handle(store, {
    method: opts.method || 'GET', op, query: Object.assign({ op }, opts.query || {}),
    headers, body: opts.body === undefined ? null : opts.body, ip: opts.ip || '203.0.113.1'
  });
}
async function makeSpace() {
  const space = newSpace(), token = newToken();
  expect((await call('create', { method: 'POST', token, query: { space } })).status).toBe(201);
  return { space, token };
}
const put = (s, device, body, headers) => call('put', { method: 'PUT', token: s.token, query: { space: s.space, device }, body: Buffer.from(body), headers: headers || { 'if-none-match': '*' } });

describe('spaces and access', () => {
  test('creating twice with the same token is fine; a different token is refused', async () => {
    const s = await makeSpace();
    expect((await call('create', { method: 'POST', token: s.token, query: { space: s.space } })).status).toBe(200);
    expect((await call('create', { method: 'POST', token: newToken(), query: { space: s.space } })).status).toBe(409);
  });

  test('every read and write needs the right token', async () => {
    const s = await makeSpace();
    expect((await call('list', { query: { space: s.space } })).status).toBe(401);
    expect((await call('list', { token: newToken(), query: { space: s.space } })).status).toBe(403);
    expect((await call('list', { token: s.token, query: { space: s.space } })).status).toBe(200);
    expect((await call('list', { token: s.token, query: { space: newSpace() } })).status).toBe(404);
  });

  test('malformed identifiers are rejected before touching storage', async () => {
    const s = await makeSpace();
    expect((await call('list', { token: s.token, query: { space: '../x' } })).status).toBe(400);
    expect((await call('get', { token: s.token, query: { space: s.space, device: 'a/b' } })).status).toBe(400);
  });

  test('the server stores a hash of the token, never the token', async () => {
    const s = await makeSpace();
    const dump = JSON.stringify([...store._data.values()].map(r => r.value));
    expect(dump).not.toContain(s.token);
  });
});

describe('device files', () => {
  test('a device writes its file and another device lists and reads it', async () => {
    const s = await makeSpace();
    const w = await put(s, 'dev_A', 'hello');
    expect(w.status).toBe(200);
    const list = await call('list', { token: s.token, query: { space: s.space } });
    expect(Object.keys(list.body.devices)).toEqual(['dev_A']);
    expect(list.body.devices.dev_A.size).toBe(5);
    const read = await call('get', { token: s.token, query: { space: s.space, device: 'dev_A' } });
    expect(read.status).toBe(200);
    expect(read.body.toString()).toBe('hello');
    expect(read.headers.ETag).toBe('"' + w.body.etag + '"');
    const again = await call('get', { token: s.token, query: { space: s.space, device: 'dev_A' }, headers: { 'if-none-match': read.headers.ETag } });
    expect(again.status).toBe(304);
  });

  test('writes must be conditional, and a stale condition is a collision', async () => {
    const s = await makeSpace();
    expect((await put(s, 'dev_A', 'one', {})).status).toBe(428);
    const first = await put(s, 'dev_A', 'one');
    expect((await put(s, 'dev_A', 'two')).status).toBe(412); // If-None-Match: * but it exists
    const second = await put(s, 'dev_A', 'two', { 'if-match': '"' + first.body.etag + '"' });
    expect(second.status).toBe(200);
    expect((await put(s, 'dev_A', 'three', { 'if-match': '"' + first.body.etag + '"' })).status).toBe(412);
  });

  test('files over the limit are refused', async () => {
    const s = await makeSpace();
    const big = Buffer.alloc(MAX_FILE_BYTES + 1, 1);
    expect((await call('put', { method: 'PUT', token: s.token, query: { space: s.space, device: 'dev_A' }, body: big, headers: { 'if-none-match': '*' } })).status).toBe(413);
  });

  test('a space holds a limited number of devices', async () => {
    const s = await makeSpace();
    for (let i = 0; i < MAX_DEVICES; i++) expect((await put(s, 'dev_' + i, 'x')).status).toBe(200);
    expect((await put(s, 'dev_extra', 'x')).status).toBe(409);
  });

  test('leaving removes the device file; the last device out removes the space', async () => {
    const s = await makeSpace();
    await put(s, 'dev_A', 'a');
    await put(s, 'dev_B', 'b');
    expect((await call('leave', { method: 'DELETE', token: s.token, query: { space: s.space, device: 'dev_A' } })).status).toBe(200);
    expect(Object.keys((await call('list', { token: s.token, query: { space: s.space } })).body.devices)).toEqual(['dev_B']);
    await call('leave', { method: 'DELETE', token: s.token, query: { space: s.space, device: 'dev_B' } });
    expect((await call('list', { token: s.token, query: { space: s.space } })).status).toBe(404);
  });
});

describe('simultaneous requests', () => {
  // The in-memory store yields between commands like a network round trip, so
  // a check made outside the write would let both requests through.
  test('two writes from the same version: exactly one wins', async () => {
    const s = await makeSpace();
    const first = await put(s, 'dev_A', 'one');
    const cond = { 'if-match': '"' + first.body.etag + '"' };
    const results = await Promise.all([put(s, 'dev_A', 'two', cond), put(s, 'dev_A', 'three', cond)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 412]);
    const read = await call('get', { token: s.token, query: { space: s.space, device: 'dev_A' } });
    const winner = results.find(r => r.status === 200);
    expect(read.headers.ETag).toBe('"' + winner.body.etag + '"');
  });

  test('two first writes for one device: exactly one wins', async () => {
    const s = await makeSpace();
    const results = await Promise.all([put(s, 'dev_A', 'one'), put(s, 'dev_A', 'two')]);
    expect(results.map(r => r.status).sort()).toEqual([200, 412]);
  });

  test('many devices joining at once cannot pass the device limit', async () => {
    const s = await makeSpace();
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => put(s, 'dev_' + i, 'x' + i)));
    expect(results.filter(r => r.status === 200)).toHaveLength(MAX_DEVICES);
    expect(results.filter(r => r.status === 409)).toHaveLength(15 - MAX_DEVICES);
    const list = await call('list', { token: s.token, query: { space: s.space } });
    expect(Object.keys(list.body.devices)).toHaveLength(MAX_DEVICES);
  });

  test('a wrong token cannot renew someone else\'s space', async () => {
    const s = await makeSpace();
    clock += (TTL_SECONDS - 10) * 1000;
    expect((await call('create', { method: 'POST', token: newToken(), query: { space: s.space } })).status).toBe(409);
    clock += 20 * 1000;
    expect((await call('list', { token: s.token, query: { space: s.space } })).status).toBe(404);
  });
});

describe('expiry', () => {
  test('an idle space disappears after 30 days and can be recreated with its token', async () => {
    const s = await makeSpace();
    await put(s, 'dev_A', 'a');
    clock += (TTL_SECONDS + 1) * 1000;
    expect((await call('list', { token: s.token, query: { space: s.space } })).status).toBe(404);
    expect((await call('create', { method: 'POST', token: s.token, query: { space: s.space } })).status).toBe(201);
  });

  test("a write by any device keeps every device's file alive", async () => {
    const s = await makeSpace();
    await put(s, 'dev_A', 'a');
    const b = await put(s, 'dev_B', 'b');
    clock += (TTL_SECONDS - 60) * 1000;
    await put(s, 'dev_B', 'b2', { 'if-match': '"' + b.body.etag + '"' });
    clock += 120 * 1000; // past dev_A's original expiry
    const read = await call('get', { token: s.token, query: { space: s.space, device: 'dev_A' } });
    expect(read.status).toBe(200);
  });
});

describe('pairing bundles', () => {
  const id = 'a'.repeat(64);
  test('a bundle can be read for 10 minutes, then is gone', async () => {
    expect((await call('pair-put', { method: 'POST', body: Buffer.from(JSON.stringify({ id, blob: 'QUJD' })) })).status).toBe(201);
    expect((await call('pair-put', { method: 'POST', body: Buffer.from(JSON.stringify({ id, blob: 'REVG' })) })).status).toBe(409);
    expect((await call('pair-get', { query: { id } })).body.blob).toBe('QUJD');
    clock += 11 * 60 * 1000;
    expect((await call('pair-get', { query: { id } })).status).toBe(404);
  });

  test('guessing codes is rate limited per address', async () => {
    let last;
    for (let i = 0; i < 31; i++) last = await call('pair-get', { query: { id: crypto.randomBytes(32).toString('hex') }, ip: '198.51.100.7' });
    expect(last.status).toBe(429);
    expect((await call('pair-get', { query: { id }, ip: '198.51.100.8' })).status).toBe(404);
  });

  test('oversized or malformed bundles are refused', async () => {
    expect((await call('pair-put', { method: 'POST', body: Buffer.from(JSON.stringify({ id, blob: 'A'.repeat(5000) })) })).status).toBe(400);
    expect((await call('pair-put', { method: 'POST', body: Buffer.from('not json') })).status).toBe(400);
  });
});

test('Upstash HGETALL replies are turned into objects', () => {
  expect(hashResult(['HGETALL', 'k'], ['_auth', 'x', 'd:A', '{}'])).toEqual({ _auth: 'x', 'd:A': '{}' });
  expect(hashResult(['GET', 'k'], 'v')).toBe('v');
});

test('a store failure is reported, not thrown', async () => {
  const broken = { command: async () => { throw new Error('down'); }, multi: async () => { throw new Error('down'); } };
  const out = await handle(broken, { method: 'GET', op: 'list', query: { space: newSpace() }, headers: { authorization: 'Bearer ' + newToken() }, body: null });
  expect(out.status).toBe(503);
});
