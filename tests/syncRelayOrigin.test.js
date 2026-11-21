// Where relay requests go: the app's own origin normally, and the Vercel
// deployment named by REMOTE_RELAY_ORIGIN from a static host (GitHub Pages),
// which cannot run api/relay.js. Also checks the relay's CORS answers for
// that cross-origin use, and that every page's CSP allows the remote origin.
const fs = require('fs');
const path = require('path');
const { serve, allowedOrigins } = require('../api/relay');
const { memoryStore } = require('../api/_relay-memory-store');

global.window = global;
eval(fs.readFileSync('./relay-sync.js', 'utf8'));
const T = global.SyncRelay._test;

afterEach(() => { delete global.location; });

describe('relay endpoint', () => {
  test('a normal deployment uses its own api/relay', () => {
    global.location = { protocol: 'https:', hostname: 'stitchx.example', href: 'https://stitchx.example/stitch.html' };
    expect(T.endpointUrl().href).toBe('https://stitchx.example/api/relay');
    expect(global.SyncRelay.isAvailable()).toBe(true);
  });

  test('a static host uses the remote relay, or has none while it is unset', () => {
    global.location = { protocol: 'https:', hostname: 'kate-nc.github.io', href: 'https://kate-nc.github.io/cross-stitch/stitch.html' };
    if (T.REMOTE_RELAY_ORIGIN) {
      expect(T.endpointUrl().href).toBe(T.REMOTE_RELAY_ORIGIN + '/api/relay');
    } else {
      expect(T.endpointUrl()).toBeNull();
      expect(global.SyncRelay.isAvailable()).toBe(false);
    }
  });

  test('pairing on a copy with no relay fails with no-relay before any request', async () => {
    if (T.REMOTE_RELAY_ORIGIN) return;
    global.location = { protocol: 'https:', hostname: 'kate-nc.github.io', href: 'https://kate-nc.github.io/cross-stitch/' };
    global.fetch = jest.fn();
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    await expect(global.SyncRelay.startPairing()).rejects.toMatchObject({ code: 'no-relay' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a 405 or 404 page from a host with no relay reads as no-relay', async () => {
    global.location = { protocol: 'https:', hostname: 'stitchx.example', href: 'https://stitchx.example/' };
    global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    global.fetch = jest.fn(async () => ({ ok: false, status: 405, json: async () => { throw new Error('not json'); } }));
    await expect(global.SyncRelay.startPairing()).rejects.toMatchObject({ code: 'no-relay' });
  });
});

describe('pairing error messages', () => {
  test('name the failure instead of a bare "Something went wrong"', () => {
    expect(T.errorText({ code: 'no-relay' })).toMatch(/not available on this copy/);
    expect(T.errorText({ code: 'storage-full' })).toMatch(/full/);
    expect(T.errorText({ code: 'pairing-taken' })).toBe('Something went wrong (pairing-taken). Try again.');
  });
});

describe('every page that loads relay-sync.js allows the remote relay in its CSP', () => {
  const root = path.join(__dirname, '..');
  const pages = fs.readdirSync(root).filter(f => f.endsWith('.html') && fs.readFileSync(path.join(root, f), 'utf8').includes('relay-sync.js'));
  test('there are pages to check', () => { expect(pages.length).toBeGreaterThan(0); });
  test.each(pages)('%s', page => {
    if (!T.REMOTE_RELAY_ORIGIN) return;
    expect(T.REMOTE_RELAY_ORIGIN).toMatch(/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/);
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html);
    expect(csp).not.toBeNull();
    const connect = (/connect-src ([^;]*)/.exec(csp[1]) || [])[1] || '';
    expect(connect.split(/\s+/)).toContain(T.REMOTE_RELAY_ORIGIN);
  });
});

describe('relay CORS', () => {
  function request(method, url, headers) {
    const req = {
      method, url, headers: headers || {}, socket: { remoteAddress: '203.0.113.9' },
      async *[Symbol.asyncIterator]() {},
    };
    const res = { status: 0, headers: {}, body: null, writeHead(s, h) { this.status = s; this.headers = h || {}; }, end(b) { this.body = b; } };
    return serve(req, res, memoryStore(), {}).then(() => res);
  }
  const ID = '0'.repeat(64);

  test('the GitHub Pages origin is allowed by default; RELAY_ALLOWED_ORIGINS replaces the list', () => {
    expect(allowedOrigins({})).toEqual(['https://kate-nc.github.io']);
    expect(allowedOrigins({ RELAY_ALLOWED_ORIGINS: 'https://a.example, https://b.example' })).toEqual(['https://a.example', 'https://b.example']);
  });

  test('a preflight from an allowed origin is answered with the methods and headers the client uses', async () => {
    const res = await request('OPTIONS', '/api/relay?op=create', { origin: 'https://kate-nc.github.io' });
    expect(res.status).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://kate-nc.github.io');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE');
    expect(res.headers['Access-Control-Allow-Headers']).toMatch(/Authorization.*Content-Type.*If-Match.*If-None-Match/);
  });

  test('responses to an allowed origin carry its CORS headers and expose ETag', async () => {
    const res = await request('GET', '/api/relay?op=pair-get&id=' + ID, { origin: 'https://kate-nc.github.io' });
    expect(res.status).toBe(404);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://kate-nc.github.io');
    expect(res.headers['Access-Control-Expose-Headers']).toBe('ETag');
    expect(res.headers.Vary).toBe('Origin');
  });

  test('other origins get no CORS headers, so browsers block them', async () => {
    const pre = await request('OPTIONS', '/api/relay?op=create', { origin: 'https://evil.example' });
    expect(pre.headers['Access-Control-Allow-Origin']).toBeUndefined();
    const res = await request('GET', '/api/relay?op=pair-get&id=' + ID, { origin: 'https://evil.example' });
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  test('same-origin requests (no Origin header) are unchanged', async () => {
    const res = await request('GET', '/api/relay?op=pair-get&id=' + ID);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body.toString())).toEqual({ error: 'pairing-missing' });
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
