const fs = require('fs');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(k) { return this.values.has(k) ? this.values.get(k) : null; }
  setItem(k, v) { this.values.set(k, String(v)); }
  removeItem(k) { this.values.delete(k); }
  clear() { this.values.clear(); }
  key(i) { return [...this.values.keys()][i] || null; }
  get length() { return this.values.size; }
}
function load(idb = new IDBFactory(), options = {}) {
  if (!idb.deleteDatabase) idb.deleteDatabase = () => {};
  const storage = options.storage || new MemoryStorage();
  if (!storage.removeItem) storage.removeItem = () => {};
  const win = { navigator: { locks: { request: async (name, callback) => callback() } }, indexedDB: idb, localStorage: storage, PERF_FLAGS: options.flags || {}, ...options };
  new Function('window', fs.readFileSync('./recovery-storage.js', 'utf8'))(win);
  new Function('window', 'localStorage', fs.readFileSync('./user-prefs.js', 'utf8'))(win, storage);
  const api = new Function('window', 'localStorage', 'indexedDB', 'LOCAL_STORAGE_KEYS', 'pako', 'IDBKeyRange', 'TextDecoder', 'Blob', 'isColorOwned', fs.readFileSync('./backup-restore.js', 'utf8') + '; return BackupRestore;')(
    win, storage, idb, { activeProject: 'a', shortcutsHint: 'b', globalGoals: 'c', globalGoalsCompat: 'd' }, require('pako'), IDBKeyRange, require('util').TextDecoder, require('buffer').Blob, entry => !!(entry && (entry.owned > 0 || entry.partialStatus)));
  return { api, prefs: win.UserPrefs, win, storage, idb };
}
module.exports = { load, MemoryStorage };
