// tests/crossTabLock.test.js
// INT-7 Phase C — cross-tab-lock.js + BackupRestore.restore() gating + HTML/sw wiring.
//
// Structural tests guard the public contract and the integration points;
// behavioural tests exercise the request/auto-deny mechanism against a
// stub BroadcastChannel.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const LOCK_SRC   = read('cross-tab-lock.js');
const BACKUP_SRC = read('backup-restore.js');
const SW_SRC     = read('sw.js');

// ────────────────────────────────────────────────────────────────────────────
// Structural shape — public contract.
// ────────────────────────────────────────────────────────────────────────────

describe('INT-7 Phase C: cross-tab-lock.js public surface', () => {
  test('idempotent install guard', () => {
    expect(LOCK_SRC).toMatch(/if \(window\.CrossTabLock\) return/);
  });
  test('exposes requestLock + tabId on window.CrossTabLock', () => {
    expect(LOCK_SRC).toMatch(/window\.CrossTabLock\s*=\s*\{[\s\S]{0,400}requestLock:\s*requestLock/);
    expect(LOCK_SRC).toMatch(/tabId:\s*TAB_ID/);
  });
  test('uses BroadcastChannel name cs-project-lock', () => {
    expect(LOCK_SRC).toMatch(/CHANNEL_NAME\s*=\s*'cs-project-lock'/);
  });
  test('defines wildcard projectId and default 250 ms timeout', () => {
    expect(LOCK_SRC).toMatch(/WILDCARD_PROJECT\s*=\s*'\*'/);
    expect(LOCK_SRC).toMatch(/DEFAULT_TIMEOUT_MS\s*=\s*250/);
  });
  test('uses cs-project-lock message types lock-request / lock-deny', () => {
    expect(LOCK_SRC).toMatch(/MSG_LOCK_REQUEST\s*=\s*'lock-request'/);
    expect(LOCK_SRC).toMatch(/MSG_LOCK_DENY\s*=\s*'lock-deny'/);
  });
  test('reuses CrossTabCoord.tabId when available', () => {
    expect(LOCK_SRC).toMatch(/window\.CrossTabCoord\s*&&\s*window\.CrossTabCoord\.tabId/);
  });
  test('graceful no-op when BroadcastChannel is undefined (Safari < 15.4)', () => {
    expect(LOCK_SRC).toMatch(/typeof BroadcastChannel !== 'undefined'/);
    // requestLock with no channel resolves {ok:true, denials:[]}.
    expect(LOCK_SRC).toMatch(/if \(!channel\)[\s\S]{0,80}ok:\s*true,\s*denials:\s*\[\]/);
  });
  test('auto-deny matches on wildcard OR exact project id', () => {
    expect(LOCK_SRC).toMatch(/requestedProjectId === WILDCARD_PROJECT/);
    expect(LOCK_SRC).toMatch(/requestedProjectId === active/);
  });
  test('timeout is clamped 50-2000 ms', () => {
    expect(LOCK_SRC).toMatch(/MIN_TIMEOUT_MS\s*=\s*50/);
    expect(LOCK_SRC).toMatch(/MAX_TIMEOUT_MS\s*=\s*2000/);
    expect(LOCK_SRC).toMatch(/if \(timeoutMs < MIN_TIMEOUT_MS\)/);
    expect(LOCK_SRC).toMatch(/if \(timeoutMs > MAX_TIMEOUT_MS\)/);
  });
});

describe('INT-7 Phase C: backup-restore.js integration', () => {
  test('BackupRestore.restore awaits CrossTabLock.requestLock with wildcard', () => {
    expect(BACKUP_SRC).toMatch(/window\.CrossTabLock\.requestLock\('\*',\s*'restore-backup'\)/);
  });
  test('prompts via ConfirmDialog with a destructive (danger:true) confirm button', () => {
    expect(BACKUP_SRC).toMatch(/window\.ConfirmDialog\.show\(\{[\s\S]{0,400}danger:\s*true/);
  });
  test('throws a Restore cancelled error when the user refuses', () => {
    expect(BACKUP_SRC).toMatch(/throw new Error\('Restore cancelled[^']*'/);
  });
  test('lock check is wrapped so internal errors do not block restore', () => {
    expect(BACKUP_SRC).toMatch(/Restore cancelled[^]*?throw e/);
  });
  test('the lock gate fires BEFORE the CrossStitchDB write loop', () => {
    var lockIdx = BACKUP_SRC.indexOf("CrossTabLock.requestLock('*'");
    var dbIdx = BACKUP_SRC.indexOf("if (backup.databases.CrossStitchDB)");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(dbIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeLessThan(dbIdx);
  });
});

describe('INT-7 Phase C: service-worker precache', () => {
  test('sw.js precaches ./cross-tab-lock.js', () => {
    expect(SW_SRC).toMatch(/'\.\/cross-tab-lock\.js'/);
  });
  test('cache name bumped to v51', () => {
    expect(SW_SRC).toMatch(/CACHE_NAME\s*=\s*'cross-stitch-cache-v51'/);
  });
});

describe('INT-7 Phase C: HTML load order', () => {
  ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html'].forEach(function (file) {
    test(file + ' loads cross-tab-lock.js after cross-tab-resolution.js and before project-storage.js', () => {
      var html = read(file);
      var resIdx  = html.indexOf('cross-tab-resolution.js');
      var lockIdx = html.indexOf('cross-tab-lock.js');
      var psIdx   = html.indexOf('project-storage.js');
      expect(resIdx).toBeGreaterThan(-1);
      expect(lockIdx).toBeGreaterThan(-1);
      expect(psIdx).toBeGreaterThan(-1);
      expect(resIdx).toBeLessThan(lockIdx);
      expect(lockIdx).toBeLessThan(psIdx);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Behavioural — load the IIFE into a jsdom window with a stub
// BroadcastChannel and exercise the request / auto-deny flow.
// ────────────────────────────────────────────────────────────────────────────

/**
 * @jest-environment jsdom
 */
describe('INT-7 Phase C: cross-tab-lock.js runtime behaviour', () => {
  // A minimal BroadcastChannel stub that fans messages to every other
  // instance with the same name (simulating cross-tab delivery). We don't
  // need MessageEvent — the module reads ev.data only.
  function installChannelStub() {
    var registry = Object.create(null);
    function Chan(name) {
      this.name = name;
      this.onmessage = null;
      this._closed = false;
      registry[name] = registry[name] || [];
      registry[name].push(this);
    }
    Chan.prototype.postMessage = function (data) {
      var peers = registry[this.name] || [];
      var self = this;
      // Async delivery to mirror real BroadcastChannel semantics; tests
      // await via setTimeout so the dispatch wins the race.
      peers.forEach(function (peer) {
        if (peer === self || peer._closed) return;
        Promise.resolve().then(function () {
          if (peer.onmessage) peer.onmessage({ data: data });
        });
      });
    };
    Chan.prototype.close = function () { this._closed = true; };
    global.BroadcastChannel = Chan;
    return { registry: registry, reset: function () { Object.keys(registry).forEach(function (k) { delete registry[k]; }); } };
  }

  function freshWindow() {
    // Each "tab" needs its OWN localStorage so peer state stays isolated.
    // The IIFE reads bare `localStorage` and `BroadcastChannel` — supply
    // both as locals via Function-arg shadowing. The IIFE also references
    // `window` (for the install guard / property assignment).
    var ls = {
      _store: {},
      getItem: function (k) { return this._store[k] != null ? this._store[k] : null; },
      setItem: function (k, v) { this._store[k] = String(v); }
    };
    var win = {
      crypto: { randomUUID: function () { return 'test-uuid-' + Math.random().toString(36).slice(2, 8); } },
      CrossTabCoord: null
    };
    // Shadow the globals the IIFE reaches for. Pass `undefined` for
    // BroadcastChannel to simulate Safari < 15.4 when global.BroadcastChannel
    // is also undefined; otherwise pass the stub.
    var BC = (typeof global.BroadcastChannel !== 'undefined') ? global.BroadcastChannel : undefined;
    new Function(
      'window', 'localStorage', 'BroadcastChannel', 'setTimeout',
      LOCK_SRC + '\n;'
    )(win, ls, BC, setTimeout);
    win.localStorage = ls;
    return win;
  }

  beforeEach(() => {
    installChannelStub();
  });

  test('requestLock resolves ok:true when no peers exist', async () => {
    var win = freshWindow();
    var result = await win.CrossTabLock.requestLock('proj_abc', 'test', { timeoutMs: 50 });
    expect(result.ok).toBe(true);
    expect(result.denials).toEqual([]);
  });

  test('peer with matching active project denies the lock', async () => {
    var peer = freshWindow();
    peer.localStorage.setItem('crossstitch_active_project', 'proj_abc');
    var requester = freshWindow();
    var result = await requester.CrossTabLock.requestLock('proj_abc', 'regenerate', { timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.denials.length).toBe(1);
    expect(result.denials[0].projectId).toBe('proj_abc');
    expect(result.denials[0].tabId).toBe(peer.CrossTabLock.tabId);
  });

  test('peer with a DIFFERENT active project does not deny', async () => {
    var peer = freshWindow();
    peer.localStorage.setItem('crossstitch_active_project', 'proj_other');
    var requester = freshWindow();
    var result = await requester.CrossTabLock.requestLock('proj_abc', 'regenerate', { timeoutMs: 100 });
    expect(result.ok).toBe(true);
    expect(result.denials).toEqual([]);
  });

  test('wildcard request is denied by any peer with ANY active project', async () => {
    var peer = freshWindow();
    peer.localStorage.setItem('crossstitch_active_project', 'proj_unrelated');
    var requester = freshWindow();
    var result = await requester.CrossTabLock.requestLock('*', 'restore-backup', { timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.denials.length).toBe(1);
    expect(result.denials[0].projectId).toBe('proj_unrelated');
  });

  test('wildcard request is NOT denied when peer has no active project', async () => {
    var peer = freshWindow();
    // peer has no localStorage active key
    var requester = freshWindow();
    var result = await requester.CrossTabLock.requestLock('*', 'restore-backup', { timeoutMs: 100 });
    expect(result.ok).toBe(true);
  });

  test('multiple peers each contribute a denial', async () => {
    var p1 = freshWindow(); p1.localStorage.setItem('crossstitch_active_project', 'proj_abc');
    var p2 = freshWindow(); p2.localStorage.setItem('crossstitch_active_project', 'proj_abc');
    var requester = freshWindow();
    var result = await requester.CrossTabLock.requestLock('proj_abc', 'regenerate', { timeoutMs: 120 });
    expect(result.ok).toBe(false);
    expect(result.denials.length).toBe(2);
  });

  test('requestLock with no projectId resolves immediately as ok', async () => {
    var win = freshWindow();
    var result = await win.CrossTabLock.requestLock('', 'noop');
    expect(result.ok).toBe(true);
  });

  test('requester does not deny its own request', async () => {
    var requester = freshWindow();
    requester.localStorage.setItem('crossstitch_active_project', 'proj_abc');
    var result = await requester.CrossTabLock.requestLock('proj_abc', 'regenerate', { timeoutMs: 80 });
    expect(result.ok).toBe(true);
    expect(result.denials).toEqual([]);
  });

  test('timeout is clamped below MIN (50 ms) — still resolves', async () => {
    var win = freshWindow();
    var t0 = Date.now();
    var result = await win.CrossTabLock.requestLock('proj_abc', 'test', { timeoutMs: 5 });
    var elapsed = Date.now() - t0;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(45); // ~50 ms minimum
  });

  test('graceful no-op when BroadcastChannel is undefined', async () => {
    delete global.BroadcastChannel;
    var win = freshWindow();
    var result = await win.CrossTabLock.requestLock('proj_abc', 'test', { timeoutMs: 50 });
    expect(result.ok).toBe(true);
    expect(result.denials).toEqual([]);
  });
});
