// Loads a checkout's sync-engine.js (and, when the checkout has it, its merge-helper script) the way the pages do:
// classic scripts sharing one global scope, in index.html order. Works on the pre-extraction base too.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadEngine(root, extra) {
  const dom = {};
  const store = new Map();
  const ctx = Object.assign({
    console, structuredClone, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON,
    pako: require(path.join(process.cwd(), 'node_modules/pako')),
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    ProjectStorage: { listProjects: async () => [], get: async () => null, save: async p => p.id },
    addEventListener() {}, dispatchEvent() {}, CustomEvent: class {}, ensurePersistence() {}
  }, extra || {});
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const files = ['tracking-sync.js', 'sync-merge-helpers.js', 'sync-engine.js'];
  for (const f of files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  }
  return ctx.SyncEngine;
}
module.exports = { loadEngine };
