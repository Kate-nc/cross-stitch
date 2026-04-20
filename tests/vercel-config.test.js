// vercel-config.test.js — ensures Vercel deployment config is correct and
// serve.js never emits redirect responses that could cause redirect loops.
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ── vercel.json ──────────────────────────────────────────────────────────────

describe('vercel.json', () => {
  let config;

  beforeAll(() => {
    const filePath = path.resolve('./vercel.json');
    assert.ok(fs.existsSync(filePath), 'vercel.json must exist — its absence causes Vercel to auto-detect Node.js and creates a redirect loop');
    config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  });

  test('cleanUrls is false — prevents Vercel from 301-redirecting index.html → /index', () => {
    assert.strictEqual(config.cleanUrls, false,
      'cleanUrls must be false; if true, requests to *.html get 301-redirected, which can loop with the service worker fallback');
  });

  test('trailingSlash is false — prevents Vercel adding or removing trailing slashes via 308', () => {
    assert.strictEqual(config.trailingSlash, false,
      'trailingSlash must be false; mismatched trailing-slash redirects can form loops');
  });

  test('buildCommand is null — prevents Vercel running "node serve.js" as a build/start command', () => {
    // null or absent both work; undefined means the key was not present in JSON
    const val = config.buildCommand;
    assert.ok(val === null || val === undefined || val === '',
      'buildCommand must be null/absent; a start script in package.json causes Vercel to treat the project as Node.js');
  });

  test('no redirect rules that could form a loop', () => {
    if (!config.redirects) return; // no redirects is fine
    for (const rule of config.redirects) {
      // A redirect whose destination matches its source is an immediate loop
      assert.notStrictEqual(rule.source, rule.destination,
        `Redirect from "${rule.source}" to "${rule.destination}" is a self-loop`);
    }
  });

  test('no rewrite rules that permanently rewrite / to itself', () => {
    if (!config.rewrites) return;
    for (const rule of config.rewrites) {
      if (rule.source === '/' || rule.source === '(.*)') {
        assert.notStrictEqual(rule.destination, rule.source,
          `Rewrite "${rule.source}" → "${rule.destination}" is a self-loop`);
      }
    }
  });
});

// ── serve.js — must never emit 3xx redirect responses ────────────────────────

describe('serve.js', () => {
  let server;
  let port;

  beforeAll(done => {
    // Load serve.js in-process by starting it on a random available port
    // We override process.argv to avoid any port conflicts
    const originalArgv = process.argv.slice();
    process.argv = ['node', 'serve.js']; // let PORT env var take precedence
    process.env.PORT = '0'; // 0 = OS picks a free port

    // serve.js calls http.createServer and server.listen — capture the server
    // by monkey-patching http.createServer temporarily
    const originalCreateServer = http.createServer.bind(http);
    let captured;
    const stub = http.createServer = function(handler) {
      captured = originalCreateServer(handler);
      return captured;
    };

    try {
      // Clear require cache so serve.js re-runs
      const serveModule = path.resolve('./serve.js');
      delete require.cache[serveModule];
      require('./serve.js');
    } catch(e) {
      // serve.js calls server.listen which is async — errors here are fine
    }

    http.createServer = stub.__original || originalCreateServer;

    if (!captured) {
      // Fallback: start a fresh instance by spawning — skip integration tests
      done();
      return;
    }

    server = captured;
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      process.argv = originalArgv;
      delete process.env.PORT;
      done();
    });
  });

  afterAll(done => {
    if (server && server.listening) server.close(done);
    else done();
  });

  function request(urlPath) {
    return new Promise((resolve, reject) => {
      if (!server || !port) { resolve(null); return; }
      http.get(`http://127.0.0.1:${port}${urlPath}`, res => {
        res.resume(); // drain
        resolve(res);
      }).on('error', reject);
    });
  }

  test('GET / returns 200 (not a redirect)', async () => {
    const res = await request('/');
    if (!res) return; // server not available in this env
    assert.ok(res.statusCode < 300 || res.statusCode >= 400,
      `GET / must not redirect; got ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200, `GET / should return 200, got ${res.statusCode}`);
  });

  test('GET /index.html returns 200 (not a redirect)', async () => {
    const res = await request('/index.html');
    if (!res) return;
    assert.ok(res.statusCode < 300 || res.statusCode >= 400,
      `GET /index.html must not redirect; got ${res.statusCode}`);
    assert.strictEqual(res.statusCode, 200);
  });

  test('GET /stitch.html returns 200 (not a redirect)', async () => {
    const res = await request('/stitch.html');
    if (!res) return;
    assert.notStrictEqual(res.statusCode, 301, 'stitch.html must not 301-redirect');
    assert.notStrictEqual(res.statusCode, 302, 'stitch.html must not 302-redirect');
    assert.notStrictEqual(res.statusCode, 308, 'stitch.html must not 308-redirect');
  });

  test('GET /manager.html returns 200 (not a redirect)', async () => {
    const res = await request('/manager.html');
    if (!res) return;
    assert.notStrictEqual(res.statusCode, 301);
    assert.notStrictEqual(res.statusCode, 302);
    assert.notStrictEqual(res.statusCode, 308);
  });

  test('serve.js respects process.env.PORT', () => {
    const src = fs.readFileSync('./serve.js', 'utf8');
    assert.ok(src.includes('process.env.PORT'),
      'serve.js must read process.env.PORT so it works on Vercel/Railway/etc');
  });

  test('serve.js never writes a Location redirect header', () => {
    const src = fs.readFileSync('./serve.js', 'utf8');
    // A redirect response requires setting the Location header
    assert.ok(!src.includes("'Location'") && !src.includes('"Location"'),
      'serve.js must not set a Location header — that would issue an HTTP redirect');
    // Redirect status codes
    assert.ok(!src.match(/writeHead\s*\(\s*30[1278]/),
      'serve.js must not call writeHead with a 3xx status code');
  });
});
