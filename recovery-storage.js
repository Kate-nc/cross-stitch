/* Recovery generations. Load before any storage consumer on every app page.
 * A restore writes only new database names and settings keys. One localStorage
 * pointer publishes both databases and the portable settings together. Existing
 * tabs stay pinned to their generation; the previous generation is never deleted.
 */
(function (root) {
  'use strict';
  const POINTER = 'cs_recovery_generation', PREFIX = 'cs_recovery_setting:', STAGING = 'cs_recovery_staging:';
  let storage, idb;
  try { storage = root.localStorage; idb = root.indexedDB; storage.getItem(POINTER); }
  catch (_) { return; } // retain the app's existing storage-unavailable handling
  if (!idb) return;
  const get = storage.getItem.bind(storage), set = storage.setItem.bind(storage), remove = storage.removeItem.bind(storage);
  const open = idb.open.bind(idb), del = idb.deleteDatabase.bind(idb);
  let activeRaw = get(POINTER), active = JSON.parse(activeRaw || 'null');
  function physical(key) { return active && active.keys.includes(String(key)) ? PREFIX + active.id + ':' + key : key; }
  function database(name) { return active && active.databases[name] || name; }
  // Route every existing opener, including cached application modules and Sync.
  idb.open = function (name, version) { return version === undefined ? open(database(name)) : open(database(name), version); };
  idb.deleteDatabase = function (name) { return del(database(name)); };
  const pinnedNames = new Set([database('CrossStitchDB'), database('stitch_manager_db')]);
  if (root.IDBDatabase) {
    const transaction = root.IDBDatabase.prototype.transaction;
    root.IDBDatabase.prototype.transaction = function (names, mode, options) {
      if (mode === 'readwrite' && root.__restoringBackup > Date.now() && pinnedNames.has(this.name)) throw new DOMException('Reload the page to finish restoring before saving.', 'InvalidStateError');
      return transaction.call(this, names, mode, options);
    };
  }
  const proto = root.Storage && root.Storage.prototype;
  const target = proto || storage;
  const nativeMethods = proto ? { get: proto.getItem, set: proto.setItem, remove: proto.removeItem } : null;
  const originalKey = storage.key && storage.key.bind(storage);
  const lengthDescriptor = proto && Object.getOwnPropertyDescriptor(proto, 'length');
  function keys() {
    const out = [], length = lengthDescriptor ? lengthDescriptor.get.call(storage) : storage.length;
    for (let i = 0; i < length; i++) {
      const key = originalKey(i);
      if (key && !key.startsWith(PREFIX) && !(active && active.keys.includes(key))) out.push(key);
    }
    if (active) active.keys.forEach(key => { if (get(physical(key)) !== null) out.push(key); });
    return out;
  }
  target.getItem = function (key) { return this === storage ? get(physical(key)) : nativeMethods.get.call(this, key); };
  target.setItem = function (key, value) { if (this === storage) set(physical(key), value); else nativeMethods.set.call(this, key, value); };
  target.removeItem = function (key) { if (this === storage) remove(physical(key)); else nativeMethods.remove.call(this, key); };
  // Preserve logical enumeration for preference resets and schema migrations.
  if (lengthDescriptor && lengthDescriptor.configurable) {
    const nativeKey = proto.key;
    proto.key = function (i) { return this === storage ? keys()[i] || null : nativeKey.call(this, i); };
    Object.defineProperty(proto, 'length', { configurable: true, get: function () { return this === storage ? keys().length : lengthDescriptor.get.call(this); } });
  }
  root.RecoveryStorage = {
    pointer: POINTER,
    current() { if (get(POINTER) !== activeRaw) throw new Error('Another tab restored data. Reload this page before continuing.'); return activeRaw; },
    openPhysical: open,
    deletePhysical: del,
    // No await between the comparison and the single publication write.
    publish(generation, expected) {
      if (get(POINTER) !== expected) throw new Error('Another tab restored data. Reload this page before retrying.');
      set(POINTER, JSON.stringify(generation));
      active = generation; activeRaw = JSON.stringify(generation);
      Object.values(generation.databases).forEach(name => pinnedNames.add(name));
    },
    markStaging(generation) { set(STAGING + generation.id, JSON.stringify({ databases: generation.databases, keys: generation.keys })); },
    unmarkStaging(id) { try { remove(STAGING + id); } catch (_) {} },
    async cleanup() {
      if (!originalKey) return;
      const length = lengthDescriptor ? lengthDescriptor.get.call(storage) : storage.length;
      const pending = [];
      for (let i = 0; i < length; i++) { const key = originalKey(i); if (key && key.startsWith(STAGING)) pending.push(key); }
      const published = JSON.parse(get(POINTER) || 'null');
      for (const key of pending) {
        const id = key.slice(STAGING.length), stage = JSON.parse(get(key));
        let complete = true;
        if (!published || (published.id !== id && (!published.previous || published.previous.id !== id))) {
          for (const name of Object.values(stage.databases)) {
            if (!/^(CrossStitchDB|stitch_manager_db)_restore_[a-zA-Z0-9_-]+$/.test(name)) continue;
            const deleted = await new Promise(resolve => { const req = del(name); req.onsuccess = () => resolve(true); req.onerror = req.onblocked = () => resolve(false); });
            if (!deleted) complete = false;
          }
          stage.keys.forEach(k => remove(PREFIX + id + ':' + k));
        }
        if (complete) remove(key);
      }
    },
    stageSetting(id, key, value) { if (value !== null) set(PREFIX + id + ':' + key, value); },
    discardSettings(id, list) { list.forEach(key => remove(PREFIX + id + ':' + key)); }
  };
  if (root.addEventListener) root.addEventListener('storage', event => {
    if (event.key !== POINTER || event.newValue === activeRaw) return;
    root.__restoringBackup = Number.MAX_SAFE_INTEGER;
    if (root.SyncEngine && root.SyncEngine.stopWatching) root.SyncEngine.stopWatching();
    if (root.Toast) root.Toast.show({ message: 'A backup was restored in another tab. Reload this page before editing.', type: 'info', duration: 0 });
  });
  // Abandoned staging data is collectible only while no restore is running.
  if (root.navigator && root.navigator.locks) root.navigator.locks.request('stitchx-restore', () => root.RecoveryStorage.cleanup()).catch(() => {});
})(window);
