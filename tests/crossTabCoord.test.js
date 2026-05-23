// INT-7 (visibility tier) — structural assertions for the cross-tab
// coordination module and its wire-up across the entry HTMLs.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const coord = read('cross-tab-coord.js');
const storage = read('project-storage.js');
const sw = read('sw.js');
const plan = read('reports/integration-audit/INT-7-plan.md');

describe('INT-7: cross-tab-coord.js shape', () => {
  test('declares the channel + idempotent install + tab id', () => {
    expect(coord).toMatch(/cs-project-changed/);
    expect(coord).toMatch(/if \(window\.CrossTabCoord\) return/);
    expect(coord).toMatch(/window\.CrossTabCoord\s*=\s*\{/);
    expect(coord).toMatch(/tabId:\s*TAB_ID/);
  });
  test('feature-detects BroadcastChannel and degrades silently', () => {
    expect(coord).toMatch(/typeof BroadcastChannel !== 'undefined'/);
  });
  test('ignores own broadcasts via sourceTabId guard', () => {
    expect(coord).toMatch(/data\.sourceTabId === TAB_ID/);
  });
  test('only nags when active project matches incoming projectId', () => {
    expect(coord).toMatch(/active !== data\.projectId/);
  });
  test('throttles repeated toasts (>=8s)', () => {
    expect(coord).toMatch(/_toastShownAt/);
    expect(coord).toMatch(/8000/);
  });
});

describe('INT-7: ProjectStorage broadcasts after save', () => {
  test('save() calls CrossTabCoord.broadcastProjectSaved', () => {
    expect(storage).toMatch(/CrossTabCoord\.broadcastProjectSaved/);
    expect(storage).toMatch(/project\.id\.indexOf\("proj_"\) === 0/);
  });
});

describe('INT-7: every HTML entry loads cross-tab-coord.js before project-storage.js', () => {
  ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html'].forEach(function (file) {
    test(file + ' loads cross-tab-coord.js before project-storage.js', () => {
      var html = read(file);
      var coordIdx = html.indexOf('cross-tab-coord.js');
      var psIdx = html.indexOf('project-storage.js');
      expect(coordIdx).toBeGreaterThan(-1);
      expect(psIdx).toBeGreaterThan(-1);
      expect(coordIdx).toBeLessThan(psIdx);
    });
  });
});

describe('INT-7: service worker precaches the new module', () => {
  test('sw.js includes cross-tab-coord.js in PRECACHE_URLS and bumps cache version', () => {
    expect(sw).toMatch(/'\.\/cross-tab-coord\.js'/);
    expect(sw).toMatch(/CACHE_NAME\s*=\s*'cross-stitch-cache-v46'/);
  });
});

describe('INT-7: plan-of-action document exists and lists the phases', () => {
  test('plan covers detection, resolution, locks, storage-event fallback, stash unification', () => {
    expect(plan).toMatch(/Phase A.*Detection/);
    expect(plan).toMatch(/Phase B.*Resolution/);
    expect(plan).toMatch(/Phase C.*Locks/);
    expect(plan).toMatch(/Phase D.*Storage-event fallback/);
    expect(plan).toMatch(/Phase E.*Stash channel unification/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase A — onProjectChanged subscriber hook.
// Behavioural tests exercise the module under jsdom with a stubbed
// BroadcastChannel so we can post a message and assert subscribers run.
// `suppressOnce` was intentionally not re-added in Phase A: the existing
// `sourceTabId === TAB_ID` guard already filters self-broadcasts, and the
// removed boolean API had no callers (see commit 02b8136).
// ────────────────────────────────────────────────────────────────────────────

describe('INT-7 Phase A: cross-tab-coord.js structural surface', () => {
  test('public surface exposes onProjectChanged + tabId + broadcastProjectSaved', () => {
    expect(coord).toMatch(/window\.CrossTabCoord\s*=\s*\{[\s\S]*?onProjectChanged:\s*onProjectChanged[\s\S]*?\}/);
    expect(coord).toMatch(/broadcastProjectSaved:\s*broadcastProjectSaved/);
  });
  test('subscriber fanout is wrapped in try/catch per callback', () => {
    expect(coord).toMatch(/function _fanout/);
    expect(coord).toMatch(/\[cross-tab\] subscriber threw/);
  });
  test('subscribers fire before the default toast in the message handler', () => {
    var msgBody = coord.match(/channel\.onmessage\s*=\s*function[\s\S]*?\};/);
    expect(msgBody).not.toBeNull();
    var body = msgBody[0];
    var fanoutIdx = body.indexOf('_fanout(data)');
    var toastIdx = body.indexOf('_showToast(data.projectId)');
    expect(fanoutIdx).toBeGreaterThan(-1);
    expect(toastIdx).toBeGreaterThan(-1);
    expect(fanoutIdx).toBeLessThan(toastIdx);
  });
  test('module-level constants are extracted (channel name, throttle, msg type)', () => {
    expect(coord).toMatch(/var CHANNEL_NAME\s*=\s*'cs-project-changed'/);
    expect(coord).toMatch(/var TOAST_THROTTLE_MS\s*=\s*8000/);
    expect(coord).toMatch(/var MSG_TYPE_PROJECT_SAVED\s*=\s*'project-saved'/);
  });
});

describe('INT-7 Phase A: cross-tab-coord.js runtime behaviour (jsdom)', () => {
  // Each test reloads the module into a fresh global so the IIFE re-runs
  // against a freshly-stubbed BroadcastChannel.
  function loadInto(globalObj) {
    var src = coord;
    var fn = new Function('window', 'BroadcastChannel', 'localStorage', 'console', 'Date', 'Math',
      'try { ' + src + ' } catch (e) { throw e; }');
    fn(globalObj, globalObj.BroadcastChannel, globalObj.localStorage, globalObj.console || console, Date, Math);
    return globalObj.CrossTabCoord;
  }

  function mkChannelStub() {
    var registry = {};
    function BC(name) {
      this.name = name;
      this.onmessage = null;
      this._closed = false;
      registry[name] = registry[name] || [];
      registry[name].push(this);
    }
    BC.prototype.postMessage = function (data) {
      var peers = registry[this.name] || [];
      var self = this;
      peers.forEach(function (peer) {
        if (peer === self || peer._closed) return;
        if (typeof peer.onmessage === 'function') {
          setTimeout(function () { peer.onmessage({ data: data }); }, 0);
        }
      });
    };
    BC.prototype.close = function () { this._closed = true; };
    return BC;
  }

  function mkGlobal(BC) {
    var store = {};
    return {
      BroadcastChannel: BC,
      localStorage: {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem: function (k, v) { store[k] = String(v); },
        removeItem: function (k) { delete store[k]; }
      },
      crypto: { randomUUID: function () { return 'tab-' + Math.random().toString(36).slice(2); } },
      Toast: null,
      CrossTabCoord: undefined
    };
  }

  function waitTick() { return new Promise(function (r) { setTimeout(r, 5); }); }

  test('onProjectChanged registers subscribers and returns an unsubscribe', async () => {
    var BC = mkChannelStub();
    var gA = mkGlobal(BC), gB = mkGlobal(BC);
    var coordA = loadInto(gA);
    var coordB = loadInto(gB);

    var seen = [];
    var unsub = coordB.onProjectChanged(function (p) { seen.push(p); });
    expect(typeof unsub).toBe('function');

    coordA.broadcastProjectSaved('proj_x', 12345);
    await waitTick();
    expect(seen.length).toBe(1);
    expect(seen[0].projectId).toBe('proj_x');
    expect(seen[0].updatedAt).toBe(12345);
    expect(seen[0].sourceTabId).toBe(coordA.tabId);

    unsub();
    coordA.broadcastProjectSaved('proj_x', 99999);
    await waitTick();
    expect(seen.length).toBe(1); // no new delivery after unsub
  });

  test('multiple subscribers all fire; one throwing does not break the others', async () => {
    var BC = mkChannelStub();
    var gA = mkGlobal(BC), gB = mkGlobal(BC);
    var coordA = loadInto(gA);
    var coordB = loadInto(gB);

    var s1 = 0, s3 = 0;
    coordB.onProjectChanged(function () { s1++; });
    coordB.onProjectChanged(function () { throw new Error('boom'); });
    coordB.onProjectChanged(function () { s3++; });

    var origErr = console.error;
    console.error = function () {};
    try {
      coordA.broadcastProjectSaved('proj_y');
      await waitTick();
    } finally {
      console.error = origErr;
    }
    expect(s1).toBe(1);
    expect(s3).toBe(1);
  });

  test('own broadcasts never reach own subscribers (sourceTabId guard)', async () => {
    var BC = mkChannelStub();
    var g = mkGlobal(BC);
    var c = loadInto(g);
    var seen = 0;
    c.onProjectChanged(function () { seen++; });
    c.broadcastProjectSaved('proj_self');
    await waitTick();
    expect(seen).toBe(0);
  });

  test('non-function arg to onProjectChanged is ignored, returns a no-op unsubscribe', () => {
    var BC = mkChannelStub();
    var g = mkGlobal(BC);
    var c = loadInto(g);
    var unsub = c.onProjectChanged(null);
    expect(typeof unsub).toBe('function');
    expect(function () { unsub(); }).not.toThrow();
  });

  test('Safari fallback: BroadcastChannel undefined ⇒ public surface still works, subscribers never fire', async () => {
    var g = mkGlobal(undefined);
    g.BroadcastChannel = undefined;
    var c = loadInto(g);
    expect(typeof c.tabId).toBe('string');
    expect(typeof c.broadcastProjectSaved).toBe('function');
    expect(typeof c.onProjectChanged).toBe('function');

    var fired = 0;
    var unsub = c.onProjectChanged(function () { fired++; });
    expect(typeof unsub).toBe('function');

    expect(function () { c.broadcastProjectSaved('proj_q'); }).not.toThrow();
    expect(function () { unsub(); }).not.toThrow();
    await waitTick();
    expect(fired).toBe(0);
  });
});
