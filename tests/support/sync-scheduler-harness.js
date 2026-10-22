// Deterministic harness for the sync engine's scheduling behaviour.
//
// It runs the real, unmodified browser scripts in a vm context with a virtual clock (setTimeout, setInterval and Date
// all follow `advance()`), a recording folder handle whose permission and write completion the test controls, and a
// recording window/document/Toast/navigator.locks. Every observable step is appended to `env.trace` as a plain string,
// so a scenario's whole timing/ordering story can be compared line by line, and the same scenario can be replayed
// against another revision of the sources through `readSource`.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const pako = require('pako');

const ROOT = path.join(__dirname, '..', '..');
const START = Date.UTC(2026, 0, 1, 12, 0, 0);
const DEFAULT_FILES = ['tracking-sync.js', 'thread-accounting.js', 'sync-merge-helpers.js', 'sync-attachment-codec.js',
  'sync-export-scheduler.js', 'sync-engine.js'];

const realTick = () => new Promise(r => setImmediate(r));

function createLocks() {
  const state = { held: false, requests: 0 };
  return {
    state,
    request(name, opts, cb) {
      state.requests++;
      if (state.held && opts && opts.ifAvailable) return Promise.resolve().then(() => cb(null));
      state.held = true;
      return Promise.resolve().then(() => cb({ name })).finally(() => { state.held = false; });
    }
  };
}

function createClock(trace) {
  let now = START, nextId = 1, seq = 0;
  const timers = new Map();
  const stamp = () => 't+' + (now - START);
  const clock = {
    now: () => now,
    pending: () => Array.from(timers.values()).map(t => ({ at: t.at - START, interval: t.interval || null })),
    pendingCount: () => timers.size,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + (ms || 0), fn, seq: seq++ });
      trace.push(stamp() + ' setTimeout ' + (ms || 0));
      return id;
    },
    clearTimeout(id) { if (timers.delete(id)) trace.push(stamp() + ' clearTimeout'); },
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn, seq: seq++, interval: ms });
      trace.push(stamp() + ' setInterval ' + ms);
      return id;
    },
    clearInterval(id) { if (timers.delete(id)) trace.push(stamp() + ' clearInterval'); },
    // Advance to the earliest pending timer only (no-op when none), so a test waits for exactly one scheduled step.
    async advanceToNext() {
      let first = null;
      for (const t of timers.values()) if (first === null || t.at < first) first = t.at;
      if (first !== null) await clock.advance(Math.max(0, first - now));
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        let next = null, nextKey = null;
        for (const [key, t] of timers) {
          if (t.at <= target && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq))) { next = t; nextKey = key; }
        }
        if (!next) break;
        now = next.at;
        if (next.interval) { next.at = now + next.interval; next.seq = seq++; } else timers.delete(nextKey);
        trace.push(stamp() + ' fire' + (next.interval ? ' interval' : ' timeout'));
        next.fn();
        await realTick();
        await realTick();
      }
      now = target;
      await realTick();
    }
  };
  return clock;
}

// A folder handle whose methods live on the prototype: structuredClone (used when the engine persists the handle)
// keeps only enumerable own data, so none of the controls below leak into IndexedDB.
function createHandle(trace, clock, name) {
  const control = { perm: 'granted', requestResult: null, writeGate: null, valuesGate: null, writes: 0, files: [] };
  class Handle {
    constructor() { this.name = name || 'Sync'; this.kind = 'directory'; }
    async queryPermission(o) { trace.push(stampOf(clock) + ' handle.queryPermission ' + o.mode + ' -> ' + control.perm); return control.perm; }
    async requestPermission(o) { const r = control.requestResult || control.perm; trace.push(stampOf(clock) + ' handle.requestPermission ' + o.mode + ' -> ' + r); control.perm = r; return r; }
    async getFileHandle(fileName, o) {
      trace.push(stampOf(clock) + ' handle.getFileHandle create=' + !!(o && o.create));
      return {
        async createWritable() {
          return {
            async write() { control.writes++; trace.push(stampOf(clock) + ' handle.write'); if (control.writeGate) await control.writeGate(); },
            async close() { trace.push(stampOf(clock) + ' handle.close'); }
          };
        }
      };
    }
    async *values() { trace.push(stampOf(clock) + ' handle.values'); if (control.valuesGate) await control.valuesGate(); for (const f of control.files) yield f; }
  }
  const handle = new Handle();
  Object.defineProperty(handle, '__control', { value: control, enumerable: false });
  return handle;
}
function stampOf(clock) { return 't+' + (clock.now() - START); }

// opts: { files, readSource(file) -> string|null, locks, deviceId, visibility }
function createEnvironment(opts) {
  opts = opts || {};
  const trace = [];
  const clock = createClock(trace);
  const readSource = opts.readSource || (f => { const p = path.join(ROOT, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; });
  const listeners = new Map();
  const visListeners = [];
  const store = new Map();
  const locks = opts.locks || createLocks();
  const doc = {
    visibilityState: opts.visibility || 'visible',
    addEventListener(type, fn) { if (type === 'visibilitychange') { visListeners.push(fn); trace.push(stampOf(clock) + ' document.addEventListener visibilitychange'); } },
    removeEventListener(type, fn) {
      if (type !== 'visibilitychange') return;
      const i = visListeners.indexOf(fn);
      if (i >= 0) { visListeners.splice(i, 1); trace.push(stampOf(clock) + ' document.removeEventListener visibilitychange'); }
    }
  };
  const win = {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { const l = listeners.get(type) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    dispatchEvent(e) {
      if (/^cs:sync/.test(e.type)) trace.push(stampOf(clock) + ' event ' + e.type + ' ' + JSON.stringify(e.detail === undefined ? null : e.detail, (k, v) => (k === 'at' ? undefined : (k === 'id' && typeof v === 'string' && /^ev_/.test(v) ? 'ev_*' : v))));
      (listeners.get(e.type) || []).slice().forEach(fn => fn(e));
      return true;
    },
    Toast: { show(o) { trace.push(stampOf(clock) + ' toast ' + o.type + ' ' + o.message); } },
    WebDAVSync: { changed() { trace.push(stampOf(clock) + ' webdav.changed'); } }
  };
  const cons = {
    log() {}, error() {}, info() {},
    warn() { trace.push(stampOf(clock) + ' warn ' + Array.prototype.map.call(arguments, a => (a && a.message) || String(a)).join(' ')); }
  };
  const ctx = {
    console: cons, indexedDB: new IDBFactory(), IDBKeyRange, pako, TextEncoder, TextDecoder, structuredClone, Blob,
    Uint8Array, ArrayBuffer, Promise, URL, crypto: require('crypto').webcrypto,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    navigator: { onLine: true, locks: opts.noLocks ? undefined : locks },
    document: doc, ensurePersistence() {},
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    ProjectStorage: { listProjects: async () => [], get: async () => null, save: async p => p.id },
    Beads: require('../../beads'), ProgressUnits: require('../../progress-units')
  };
  // Date follows the virtual clock; everything else is the real Date.
  ctx.Date = class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now()); }
    static now() { return clock.now(); }
  };
  Object.assign(ctx, win);
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  store.set('cs_sync_deviceId', opts.deviceId || 'device_A');
  for (const file of (opts.files || DEFAULT_FILES)) {
    const src = readSource(file);
    if (src == null) continue;
    vm.runInContext(src, ctx, { filename: file });
  }
  const env = {
    ctx, SE: ctx.SyncEngine, trace, clock, locks, visListeners, store,
    handle: createHandle(trace, clock, opts.handleName),
    setVisibility(state) {
      doc.visibilityState = state;
      trace.push(stampOf(clock) + ' visibility ' + state);
      visListeners.slice().forEach(fn => fn());
    },
    // Hold every folder write open until the returned object is resolved or rejected.
    gateWrites() {
      let release, fail;
      const p = new Promise((res, rej) => { release = res; fail = rej; });
      p.catch(() => {}); // a failure with no write waiting yet is not an unhandled rejection; a waiting write still sees it
      env.handle.__control.writeGate = () => p;
      return { release, fail: err => fail(err) };
    },
    ungateWrites() { env.handle.__control.writeGate = null; },
    // Same, for folder scans (the watcher tick's read).
    gateScans() {
      let release;
      const p = new Promise(res => { release = res; });
      env.handle.__control.valuesGate = () => p;
      return { release };
    },
    flush: async function (n) { for (let i = 0; i < (n || 8); i++) await realTick(); },
    // Wait (real time, bounded) for a condition that depends on engine promises settling.
    async until(cond, label) {
      for (let i = 0; i < 400; i++) { if (cond()) return; await realTick(); }
      throw new Error('condition never held: ' + (label || cond));
    },
    async connect() { await env.SE.setWatchDirectory(env.handle); await env.flush(); },
    count(re) { return env.trace.filter(l => re.test(l)).length; },
    dispose() { try { env.SE.stopWatching(); } catch (e) {} }
  };
  return env;
}

module.exports = { createEnvironment, createLocks, START, DEFAULT_FILES, ROOT };
