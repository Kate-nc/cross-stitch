// INT-7 Phase B-3 — cross-tab-resolution.js + UserPrefs default + sw + HTML wiring.
//
// Structural assertions guard the public contract; jsdom-runtime tests
// exercise the policy decisions against a stub ConfirmDialog / UserPrefs /
// CrossTabCoord environment.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const RES_SRC   = read('cross-tab-resolution.js');
const COORD_SRC = read('cross-tab-coord.js');
const PREFS_SRC = read('user-prefs.js');
const SW_SRC    = read('sw.js');

// ────────────────────────────────────────────────────────────────────────────
// Structural shape — public contract.
// ────────────────────────────────────────────────────────────────────────────

describe('INT-7 Phase B-3: cross-tab-resolution.js public surface', () => {
  test('idempotent install guard', () => {
    expect(RES_SRC).toMatch(/if \(window\.CrossTabResolution\) return/);
  });
  test('exposes handle + _getPolicy on window.CrossTabResolution', () => {
    expect(RES_SRC).toMatch(/window\.CrossTabResolution\s*=\s*\{[\s\S]{0,200}handle:\s*handle/);
    expect(RES_SRC).toMatch(/_getPolicy:\s*getPolicy/);
  });
  test('defines the three policy values + default', () => {
    expect(RES_SRC).toMatch(/VALID_POLICIES\s*=\s*\{\s*prompt:\s*1,\s*reload:\s*1,\s*keep:\s*1\s*\}/);
    expect(RES_SRC).toMatch(/DEFAULT_POLICY\s*=\s*"prompt"/);
  });
  test('reads the policy from UserPrefs under crossTabConflictPolicy', () => {
    expect(RES_SRC).toMatch(/POLICY_KEY\s*=\s*"crossTabConflictPolicy"/);
    expect(RES_SRC).toMatch(/UserPrefs\.get\(POLICY_KEY\)/);
  });
  test('uses ConfirmDialog for the prompt and degrades safely if absent', () => {
    expect(RES_SRC).toMatch(/window\.ConfirmDialog\.show\(/);
    expect(RES_SRC).toMatch(/typeof window\.ConfirmDialog\.show !== "function"[\s\S]{0,100}return Promise\.resolve\("keep"\)/);
  });
  test('subscribes via CrossTabCoord.onProjectChanged and silences the default toast', () => {
    expect(RES_SRC).toMatch(/CrossTabCoord\.onProjectChanged\(onBroadcast\)/);
    expect(RES_SRC).toMatch(/_suppressActiveToast\s*=\s*true/);
  });
});

describe('INT-7 Phase B-3: cross-tab-coord.js honours _suppressActiveToast', () => {
  test('coord checks the flag before showing its default warning toast', () => {
    expect(COORD_SRC).toMatch(/_suppressActiveToast/);
    // The check must come BEFORE _showToast(...).
    var idxCheck = COORD_SRC.indexOf('_suppressActiveToast');
    var idxToast = COORD_SRC.indexOf('_showToast(data.projectId)');
    expect(idxCheck).toBeGreaterThan(-1);
    expect(idxToast).toBeGreaterThan(-1);
    expect(idxCheck).toBeLessThan(idxToast);
  });
});

describe('INT-7 Phase B-3: UserPrefs default', () => {
  test('declares crossTabConflictPolicy default = "prompt"', () => {
    expect(PREFS_SRC).toMatch(/crossTabConflictPolicy:\s*"prompt"/);
  });
});

describe('INT-7 Phase B-3: service worker precaches the new module', () => {
  test('sw.js includes cross-tab-resolution.js in PRECACHE_URLS', () => {
    expect(SW_SRC).toMatch(/'\.\/cross-tab-resolution\.js'/);
  });
});

describe('INT-7 Phase B-3: HTML entries load cross-tab-resolution.js after cross-tab-coord.js', () => {
  ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html'].forEach(function (file) {
    test(file + ' loads resolution after coord and before project-storage', () => {
      var html = read(file);
      var coordIdx = html.indexOf('cross-tab-coord.js');
      var resIdx   = html.indexOf('cross-tab-resolution.js');
      var psIdx    = html.indexOf('project-storage.js');
      expect(coordIdx).toBeGreaterThan(-1);
      expect(resIdx).toBeGreaterThan(-1);
      expect(psIdx).toBeGreaterThan(-1);
      expect(coordIdx).toBeLessThan(resIdx);
      expect(resIdx).toBeLessThan(psIdx);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Runtime behaviour — load the module into a controlled environment and
// drive its decisions through stub UserPrefs / ConfirmDialog / CrossTabCoord.
// ────────────────────────────────────────────────────────────────────────────

function loadResolutionInto(globalObj) {
  var fn = new Function(
    'window', 'localStorage', 'document', 'console',
    'try { ' + RES_SRC + ' } catch (e) { throw e; }'
  );
  // Resolution module accesses `localStorage` and `document` as bare globals.
  fn(globalObj, globalObj.localStorage, globalObj.document, console);
  return globalObj.CrossTabResolution;
}

function mkLocalStorage() {
  var store = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
}

function mkGlobal(opts) {
  opts = opts || {};
  var ls = opts.localStorage || mkLocalStorage();
  if (opts.activeProjectId) ls.setItem('crossstitch_active_project', opts.activeProjectId);
  var prefs = opts.prefValue !== undefined
    ? { get: function (k) { return k === 'crossTabConflictPolicy' ? opts.prefValue : null; } }
    : null;
  var coordSubscribers = [];
  var coord = opts.coord !== undefined ? opts.coord : {
    onProjectChanged: function (cb) {
      coordSubscribers.push(cb);
      return function () { /* unsub */ };
    }
  };
  var reloadCalls = 0;
  return {
    UserPrefs: prefs,
    ConfirmDialog: opts.confirmDialog || null,
    CrossTabCoord: coord,
    _coordSubscribers: coordSubscribers,
    localStorage: ls,
    document: { readyState: 'complete' },
    location: { reload: function () { reloadCalls++; } },
    _reloadCalls: function () { return reloadCalls; }
  };
}

function waitMicro() {
  return new Promise(function (r) { setTimeout(r, 0); });
}

describe('INT-7 Phase B-3: resolution module runtime — init wiring', () => {
  test('init() subscribes to CrossTabCoord.onProjectChanged when available', () => {
    var g = mkGlobal();
    loadResolutionInto(g);
    expect(g._coordSubscribers.length).toBe(1);
  });
  test('init() sets _suppressActiveToast = true on CrossTabCoord', () => {
    var g = mkGlobal();
    loadResolutionInto(g);
    expect(g.CrossTabCoord._suppressActiveToast).toBe(true);
  });
  test('init() is safe when CrossTabCoord is missing (Safari with no BC)', () => {
    var g = mkGlobal({ coord: null });
    expect(function () { loadResolutionInto(g); }).not.toThrow();
    expect(g.CrossTabResolution).toBeDefined();
    expect(typeof g.CrossTabResolution.handle).toBe('function');
  });
});

describe('INT-7 Phase B-3: handle() policy decisions', () => {
  test('policy="reload" → reloads immediately and resolves "reload"', async () => {
    var g = mkGlobal({ prefValue: 'reload' });
    var R = loadResolutionInto(g);
    var dec = await R.handle({ projectId: 'proj_x' });
    expect(dec).toBe('reload');
    expect(g._reloadCalls()).toBe(1);
  });
  test('policy="keep" → resolves "keep" with no reload, no modal', async () => {
    var dialogCalls = 0;
    var g = mkGlobal({
      prefValue: 'keep',
      confirmDialog: { show: function () { dialogCalls++; return Promise.resolve(true); } }
    });
    var R = loadResolutionInto(g);
    var dec = await R.handle({ projectId: 'proj_x' });
    expect(dec).toBe('keep');
    expect(g._reloadCalls()).toBe(0);
    expect(dialogCalls).toBe(0);
  });
  test('policy="prompt" + user clicks Reload → reloads, resolves "reload"', async () => {
    var g = mkGlobal({
      prefValue: 'prompt',
      confirmDialog: { show: function () { return Promise.resolve(true); } }
    });
    var R = loadResolutionInto(g);
    var dec = await R.handle({ projectId: 'proj_x' });
    expect(dec).toBe('reload');
    expect(g._reloadCalls()).toBe(1);
  });
  test('policy="prompt" + user clicks Keep → no reload, resolves "keep"', async () => {
    var g = mkGlobal({
      prefValue: 'prompt',
      confirmDialog: { show: function () { return Promise.resolve(false); } }
    });
    var R = loadResolutionInto(g);
    var dec = await R.handle({ projectId: 'proj_x' });
    expect(dec).toBe('keep');
    expect(g._reloadCalls()).toBe(0);
  });
  test('policy="prompt" + ConfirmDialog missing → resolves "keep" (safe fallback)', async () => {
    var g = mkGlobal({ prefValue: 'prompt' /* no confirmDialog */ });
    var R = loadResolutionInto(g);
    var dec = await R.handle({ projectId: 'proj_x' });
    expect(dec).toBe('keep');
    expect(g._reloadCalls()).toBe(0);
  });
  test('policy="prompt" + ConfirmDialog.show throws sync → resolves "keep" and next call can prompt again', async () => {
    var calls = 0;
    var g = mkGlobal({
      prefValue: 'prompt',
      confirmDialog: {
        show: function () {
          calls++;
          if (calls === 1) throw new Error('boom');
          return Promise.resolve(false);
        }
      }
    });
    var R = loadResolutionInto(g);
    var dec1 = await R.handle({ projectId: 'proj_x' });
    var dec2 = await R.handle({ projectId: 'proj_x' });
    expect(dec1).toBe('keep');
    expect(dec2).toBe('keep');
    expect(calls).toBe(2);
  });
  test('invalid pref value falls back to "prompt" default', async () => {
    var calls = 0;
    var g = mkGlobal({
      prefValue: 'gibberish',
      confirmDialog: { show: function () { calls++; return Promise.resolve(false); } }
    });
    var R = loadResolutionInto(g);
    await R.handle({ projectId: 'proj_x' });
    expect(calls).toBe(1);
  });
  test('UserPrefs missing entirely → falls back to "prompt" default', async () => {
    var calls = 0;
    var g = mkGlobal({
      confirmDialog: { show: function () { calls++; return Promise.resolve(false); } }
    });
    // No UserPrefs at all
    g.UserPrefs = null;
    var R = loadResolutionInto(g);
    await R.handle({ projectId: 'proj_x' });
    expect(calls).toBe(1);
  });
  test('concurrent handle() calls during open modal → second resolves "keep" (no double-prompt)', async () => {
    var openCalls = 0;
    var resolveFirst;
    var g = mkGlobal({
      prefValue: 'prompt',
      confirmDialog: {
        show: function () {
          openCalls++;
          return new Promise(function (r) { resolveFirst = r; });
        }
      }
    });
    var R = loadResolutionInto(g);
    var p1 = R.handle({ projectId: 'proj_x' });
    var p2 = R.handle({ projectId: 'proj_x' });
    // Second call is gated → resolves immediately as 'keep' without re-opening.
    var d2 = await p2;
    expect(d2).toBe('keep');
    expect(openCalls).toBe(1);
    // Resolve the first modal — user picks Reload.
    resolveFirst(true);
    var d1 = await p1;
    expect(d1).toBe('reload');
  });
});

describe('INT-7 Phase B-3: broadcast subscriber gates on active project', () => {
  test('peer save of the ACTIVE project → triggers handle()', async () => {
    var calls = 0;
    var g = mkGlobal({
      activeProjectId: 'proj_active',
      prefValue: 'prompt',
      confirmDialog: { show: function () { calls++; return Promise.resolve(false); } }
    });
    loadResolutionInto(g);
    // Simulate the broadcast.
    g._coordSubscribers[0]({ projectId: 'proj_active', lastWriteAt: 1, lastWriteTabId: 't' });
    await waitMicro();
    expect(calls).toBe(1);
  });
  test('peer save of a DIFFERENT project → no modal', async () => {
    var calls = 0;
    var g = mkGlobal({
      activeProjectId: 'proj_active',
      prefValue: 'prompt',
      confirmDialog: { show: function () { calls++; return Promise.resolve(false); } }
    });
    loadResolutionInto(g);
    g._coordSubscribers[0]({ projectId: 'proj_other', lastWriteAt: 1, lastWriteTabId: 't' });
    await waitMicro();
    expect(calls).toBe(0);
  });
  test('peer save when no project is active → no modal', async () => {
    var calls = 0;
    var g = mkGlobal({
      prefValue: 'prompt',
      confirmDialog: { show: function () { calls++; return Promise.resolve(false); } }
    });
    loadResolutionInto(g);
    g._coordSubscribers[0]({ projectId: 'proj_active', lastWriteAt: 1, lastWriteTabId: 't' });
    await waitMicro();
    expect(calls).toBe(0);
  });
  test('payload without projectId → ignored', async () => {
    var calls = 0;
    var g = mkGlobal({
      activeProjectId: 'proj_active',
      prefValue: 'prompt',
      confirmDialog: { show: function () { calls++; return Promise.resolve(false); } }
    });
    loadResolutionInto(g);
    g._coordSubscribers[0](null);
    g._coordSubscribers[0]({});
    await waitMicro();
    expect(calls).toBe(0);
  });
});
