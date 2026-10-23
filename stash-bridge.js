// stash-bridge.js
// Reads the global stash from stitch_manager_db without depending on manager-app.js state.
// Shared read layer used by Creator, Tracker, and Stash Manager pages.
//
// INT-5 lifetime invariant: StashBridge is a *module-level singleton* created
// at script load. It owns no persistent IndexedDB connection — every
// public call opens, reads, and closes a fresh connection via
// `_openManagerDB()`. This means:
//   • There is nothing to "init" or "tear down" — the bridge is safe to
//     reference at any point after stash-bridge.js has loaded.
//   • Callers may invoke `StashBridge.*` from React effects, event
//     handlers, or module top-level without coordinating ordering.
//   • Stash writes are now best-effort coordinated across tabs through
//     window.CrossTabLock.acquire(). Reads remain unlocked.
//   • The cached owned-counts (if any) live inside callers, not the
//     bridge — do not assume the bridge memoises reads.

// ─── Stash ownership helpers ─────────────────────────────────────────────────
// Module-level globals so every page loaded after stash-bridge.js uses a single
// canonical definition.  Exposed both as bare globals (for scripts in the page)
// and on the StashBridge return object (for explicit namespacing and tests).
//
// partialStatus enum → fractional skein remaining
var PARTIAL_STATUS_FRACTIONS = Object.freeze({
  'mostly-full': 0.75,
  'about-half':  0.50,
  'remnant':     0.25,
});

// Default fallback threshold (skeins) for the low-quantity advisory warning
// when the per-pattern skein estimator is unavailable.
var LOW_STASH_SKEIN_THRESHOLD = 1;

// Returns the effective skein quantity for a stash entry:
//   • integer full skeins (entry.owned) when positive and finite
//   • plus the fractional contribution of any partial (entry.partialStatus)
// Negative values and NaN in entry.owned are treated as 0.
// partialStatus "used-up" contributes 0 (skein is exhausted).
function stashEffectiveQty(entry) {
  if (!entry || typeof entry !== 'object') return 0;
  var full = typeof entry.owned === 'number' && Number.isFinite(entry.owned) && entry.owned > 0
    ? entry.owned : 0;
  return full + (PARTIAL_STATUS_FRACTIONS[entry.partialStatus] || 0);
}

// Returns true when the user owns any amount of this thread colour.
// Partial skeins (mostly-full / about-half / remnant) count as owned.
// null/undefined entries, negative owned, NaN, and "used-up" partials are not owned.
function isColorOwned(entry) {
  return stashEffectiveQty(entry) > 0;
}
// ─────────────────────────────────────────────────────────────────────────────

const StashBridge = (() => {
  // The stash key of a library pattern's thread ({id, brand: "DMC" |
  // "Anchor"}): a bare id is in the thread's own brand (P4-5), DMC when it
  // names none.
  function _libraryKey(t) {
    if (typeof libraryThreadKey === 'function') return libraryThreadKey(t);
    return _normaliseKey(t && t.id);
  }

  // Normalise a bare DMC id like '310' to the composite key 'dmc:310'.
  // Composite keys already containing ':' are returned unchanged.
  function _normaliseKey(keyOrId) {
    if (typeof keyOrId !== 'string') keyOrId = String(keyOrId);
    return keyOrId.indexOf(':') < 0 ? 'dmc:' + keyOrId : keyOrId;
  }

  function _getOwnedCount(threadsData, key, fallbackId) {
    var byKey = stashEffectiveQty(threadsData[key]);
    if (byKey > 0) return byKey;
    return key.indexOf('dmc:') === 0 ? stashEffectiveQty(threadsData[fallbackId]) : 0;
  }

  function _parseThreadKey(key) {
    if (key.indexOf(':') < 0) return { brand: 'dmc', id: key };
    const parts = key.split(':');
    const brand = parts[0];
    const id = parts.slice(1).join(':');
    if (!id) return { brand: 'dmc', id: key };
    return { brand: brand, id: id };
  }

  function _getThreadInfoByKey(key) {
    if (typeof getThreadByKey === "function") return getThreadByKey(key);
    const parsed = _parseThreadKey(key);
    // PERF (perf-2 #3): prefer cached id-maps from helpers.js (O(1)) over O(n)
    // Array.find scans across the full DMC/ANCHOR palettes.
    if (parsed.brand === "anchor") {
      if (typeof _getAnchorById === "function") {
        const m = _getAnchorById();
        if (m) return m[parsed.id] || null;
      }
      return typeof ANCHOR !== "undefined" ? ANCHOR.find(x => x.id === parsed.id) : null;
    }
    if (parsed.brand !== "dmc") return null;
    if (typeof _getDmcById === "function") {
      const m = _getDmcById();
      if (m) return m[parsed.id] || null;
    }
    return typeof DMC !== "undefined" ? DMC.find(x => x.id === parsed.id) : null;
  }

  let _migrationDone = false;
  // Schema version tracked in stash data. V2 = composite keys, V3 = addedAt/history fields,
  // V4 = tobuy_qty / tobuy_added_at fields on each entry (lazy: defaults to 0/null when absent).
  let _schemaVersion = 0;
  const _seenThreadVersions = Object.create(null);
  const _managerWriteResource = 'manager_state';

  // Fires the cross-app 'cs:stashChanged' event so listeners (Home, Manager,
  // Tracker, Creator) reload from the live DB. Guarded for non-browser test
  // environments where window/CustomEvent are unavailable.
  //
  // Also pokes SyncEngine.triggerAutoExport so stash mutations actually
  // propagate to the sync folder. Previously every stash write
  // (updateThreadOwned, setToBuyQty, markBought, etc.) committed to
  // stitch_manager_db and stopped there: an export was only ever queued by
  // ProjectStorage.save, so a user who only updated thread inventory or the
  // pattern library on Device A would never see those changes reach the
  // .csync file, and Device B stayed stale forever.
  function _dispatchStashChanged() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    try { window.dispatchEvent(new CustomEvent('cs:stashChanged')); } catch (_) { /* swallow */ }
    try {
      if (window.SyncEngine && typeof window.SyncEngine.triggerAutoExport === 'function') {
        window.SyncEngine.triggerAutoExport();
      }
    } catch (_) { /* swallow */ }
  }

  // Mirror of the above for the patterns store. Fired after the manager-side
  // pattern library is mutated (auto-sync from the Creator, manual unlink, or
  // any other writer) so any open Manager / Home / Shopping view rebuilds in
  // place rather than waiting for the next visibilitychange.
  function _dispatchPatternsChanged() {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    if (typeof CustomEvent !== 'function') return;
    try { window.dispatchEvent(new CustomEvent('cs:patternsChanged')); } catch (_) { /* swallow */ }
    try {
      if (window.SyncEngine && typeof window.SyncEngine.triggerAutoExport === 'function') {
        window.SyncEngine.triggerAutoExport();
      }
    } catch (_) { /* swallow */ }
  }

  // Queue both requests without yielding; settle on requests, not transaction completion.
  // Migration and connection lifetime belong to the callers.
  function _queryThreadsAndPatterns(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("manager_state", "readonly");
      const store = tx.objectStore("manager_state");
      let threads = null, patterns = null, settled = 0;
      function check() { if (++settled === 2) resolve([threads, patterns]); }
      const q1 = store.get("threads");
      q1.onsuccess = () => { threads = q1.result || {}; check(); };
      q1.onerror = () => reject(q1.error);
      const q2 = store.get("patterns");
      q2.onsuccess = () => { patterns = q2.result || []; check(); };
      q2.onerror = () => reject(q2.error);
    });
  }

  // Reads the stash threads and the pattern library in one transaction. Both
  // requests are queued synchronously inside a single Promise so no await ever
  // yields while the transaction is open (Safari auto-commits on yield).
  async function _readThreadsAndPatterns() {
    await migrateSchemaToV2();
    const db = await openManagerDB();
    try {
      return await _queryThreadsAndPatterns(db);
    } finally {
      try { db.close(); } catch (_) { /* swallow */ }
    }
  }

  // Pure helper: builds the sorted shopping-list rows from a raw threads dict.
  // Exposed for unit tests via window.StashBridge._buildShoppingListRows.
  // infoLookup(brand, id) -> { name, rgb } | null. Defaults to a stub when
  // catalog globals aren't available (Node tests).
  function _buildShoppingListRows(threadsDict, infoLookup) {
    const lookup = typeof infoLookup === 'function' ? infoLookup : function(brand, id) {
      if (typeof findThreadInCatalog === 'function') return findThreadInCatalog(brand, id);
      return null;
    };
    const rows = [];
    if (!threadsDict || typeof threadsDict !== 'object') return rows;
    for (const key of Object.keys(threadsDict)) {
      const entry = threadsDict[key];
      if (!entry || !entry.tobuy) continue;
      const colon = key.indexOf(':');
      const brand = colon < 0 ? 'dmc' : key.slice(0, colon);
      const id = colon < 0 ? key : key.slice(colon + 1);
      const info = lookup(brand, id) || null;
      rows.push({
        key: key,
        brand: brand,
        id: id,
        name: info ? info.name : id,
        rgb: info ? info.rgb : [200, 200, 200],
        owned: entry.owned || 0,
        tobuyQty: Number(entry.tobuy_qty) > 0 ? Number(entry.tobuy_qty) : 0,
        tobuyAddedAt: entry.tobuy_added_at || null,
      });
    }
    rows.sort(_compareShoppingRows);
    return rows;
  }

  // Most recently added first; ties broken by brand then numeric id.
  function _compareShoppingRows(a, b) {
    const at = a.tobuyAddedAt || '';
    const bt = b.tobuyAddedAt || '';
    if (at !== bt) return bt.localeCompare(at);
    return _compareThreadRows(a, b);
  }

  function _compareThreadRows(a, b) {
    if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
    const an = /^\d+$/.test(a.id) ? Number(a.id) : Infinity;
    const bn = /^\d+$/.test(b.id) ? Number(b.id) : Infinity;
    if (an !== bn) return an - bn;
    return String(a.id).localeCompare(String(b.id));
  }

  // ── Demand, conflicts and "to buy" ──────────────────────────────────────────
  // One demand table feeds both views, so they cannot disagree:
  //   conflicts  two or more active patterns competing for the same thread
  //              that the stash cannot cover together;
  //   to buy     what the stash is short of, for each pattern on its own and
  //              for all active patterns together (Home's shopping list).
  // A shortfall for a single pattern is a to-buy item, never a conflict.

  function _planningRows(pat, stash) {
    if (typeof threadDemandRows !== 'function') return null;
    const o=pat.project_overrides||{};
    const entries=(pat.threads||[]).map(t=>{const k=_libraryKey(t),i=k.indexOf(':');return {...t,id:k.slice(i+1),brand:k.slice(0,i),unit:t.unit||'skeins',count:t.qty};});
    return threadDemandRows(entries,{fabricCount:o.fabric_count??pat.fabricCt??14,
      strandsUsed:o.strands_used??2,wasteFactor:o.waste_factor??.20,stash:stash||{}});
  }

  // Skeins a pattern's thread row asks for.
  function _skeinsNeeded(t, fabricCt) {
    if (t.unit === "stitches") {
      return typeof skeinEst === "function" ? skeinEst(t.qty, fabricCt) : Math.ceil(t.qty / 200);
    }
    return t.qty;
  }

  // { [threadKey]: { total, patterns: [{ id, title, qty }] } } across active
  // (not completed) patterns. A pattern that lists a thread twice is one
  // pattern; two patterns sharing a title are still two.
  function _buildDemand(patternsData) {
    const demand = {};
    const active = (Array.isArray(patternsData) ? patternsData : []).filter(function(p) { return p && p.status !== "completed"; });
    active.forEach(function(pat, index) {
      if (!Array.isArray(pat.threads)) return;
      const pid = pat.id != null ? String(pat.id) : "#" + index;
      const fc = pat.fabricCt || 14;
      const planned = _planningRows(pat);
      for (const t of planned || pat.threads) {
        const skeins = planned ? t.estimatedNeeded : Number(_skeinsNeeded(t, fc)) || 0;
        const key = planned ? t.key : _libraryKey(t);
        const d = demand[key] || (demand[key] = { total: 0, patterns: [] });
        d.total += skeins;
        const share = d.patterns.find(function(p) { return p.id === pid; });
        if (share) share.qty += skeins;
        else d.patterns.push({ id: pid, title: pat.title, qty: skeins });
      }
    });
    return demand;
  }

  function _threadRow(key, threadsData) {
    const parsed = _parseThreadKey(key);
    const info = _getThreadInfoByKey(key);
    return {
      key: key,
      brand: parsed.brand,
      id: parsed.id,
      name: info ? info.name : parsed.id,
      rgb: info ? info.rgb : [128, 128, 128],
      owned: _getOwnedCount(threadsData, key, parsed.id)
    };
  }

  // Whole skeins missing, rounding a part-skein shortfall up.
  function _wholeShortfall(need, owned) {
    return Math.max(0, Math.ceil(need - owned - 1e-9));
  }

  function _findConflicts(demand, threadsData) {
    const conflicts = [];
    for (const key of Object.keys(demand)) {
      const d = demand[key];
      if (d.patterns.length < 2) continue;
      const row = _threadRow(key, threadsData);
      if (d.total > row.owned) {
        conflicts.push(Object.assign(row, { totalNeeded: d.total, deficit: d.total - row.owned, patterns: d.patterns }));
      }
    }
    conflicts.sort(function(a, b) { return b.deficit - a.deficit; });
    return conflicts;
  }

  // { projects: [{ id, title, threads: [row] }], total: [row] }; a row is a
  // thread with { need, owned, toBuy }. Each project is measured against the
  // stash on its own, so its list is what it would take to stitch it alone;
  // the total is measured against the combined demand, so a thread two
  // patterns share appears once, at the combined shortfall.
  function _buildToBuy(demand, threadsData) {
    const total = [];
    const byProject = new Map();
    for (const key of Object.keys(demand)) {
      const d = demand[key];
      const row = _threadRow(key, threadsData);
      const short = _wholeShortfall(d.total, row.owned);
      if (short > 0) total.push(Object.assign({}, row, { need: d.total, toBuy: short }));
      for (const share of d.patterns) {
        const own = _wholeShortfall(share.qty, row.owned);
        if (own <= 0) continue;
        if (!byProject.has(share.id)) byProject.set(share.id, { id: share.id, title: share.title, threads: [] });
        byProject.get(share.id).threads.push(Object.assign({}, row, { need: share.qty, toBuy: own }));
      }
    }
    total.sort(_compareThreadRows);
    const projects = Array.from(byProject.values());
    projects.forEach(function(p) { p.threads.sort(_compareThreadRows); });
    return { projects: projects, total: total };
  }

  // The shopping list: threads flagged by hand plus everything the active
  // patterns leave the stash short of. A thread on both keeps the larger quantity.
  function _mergeShoppingList(threadsData, toBuyTotal) {
    const rows = _buildShoppingListRows(threadsData);
    const byKey = new Map(rows.map(function(r) { return [r.key, r]; }));
    for (const t of toBuyTotal) {
      const flagged = byKey.get(t.key);
      if (flagged) {
        flagged.tobuyQty = Math.max(flagged.tobuyQty, t.toBuy);
      } else {
        const row = { key: t.key, brand: t.brand, id: t.id, name: t.name, rgb: t.rgb, owned: t.owned, tobuyQty: t.toBuy, tobuyAddedAt: null };
        rows.push(row);
        byKey.set(t.key, row);
      }
    }
    rows.sort(_compareShoppingRows);
    return rows;
  }

  // Legacy epoch: used for stash entries that existed before tracking was added.
  // Deliberately set to a fixed past date so the UI can show 'before tracking'
  // rather than misleadingly showing 'added today' on the migration date.
  const LEGACY_EPOCH = '2020-01-01T00:00:00Z';

  function _migrateThreadsToV2(threads) {
    const migrated = {};
    let changed = false;
    for (const [key, val] of Object.entries(threads || {})) {
      if (key.indexOf(':') < 0) {
        migrated['dmc:' + key] = val;
        changed = true;
      } else {
        migrated[key] = val;
      }
    }
    return { threads: changed ? migrated : (threads || {}), changed: changed };
  }

  function _migrateThreadsToV3(threads) {
    const migrated = {};
    for (const [key, entry] of Object.entries(threads || {})) {
      if (entry && !entry.addedAt) {
        migrated[key] = Object.assign({}, entry, {
          addedAt: LEGACY_EPOCH,
          lastAdjustedAt: LEGACY_EPOCH,
          acquisitionSource: 'legacy',
          history: [],
        });
      } else {
        migrated[key] = entry;
      }
    }
    return migrated;
  }

  // Pure migration for isolated restore staging. No live database is touched.
  function prepareBackupState(rows) {
    const version = rows.find(e => e.key === 'schema_version');
    const legacy = !version || Number(version.value) < 3;
    const result = rows.filter(e => e.key !== 'schema_version').map(e => {
      if (e.key !== 'threads') return e;
      const v2 = _migrateThreadsToV2(e.value).threads;
      return { key: e.key, value: legacy ? _migrateThreadsToV3(v2) : v2 };
    });
    result.push({ key: 'schema_version', value: version && Number(version.value) > 3 ? version.value : 3 });
    return result;
  }

  async function migrateToLatest(targetVersion) {
    const desiredVersion = targetVersion == null ? 3 : (targetVersion >= 3 ? 3 : 2);
    if (desiredVersion <= 2 && _migrationDone) return;
    if (desiredVersion >= 3 && _migrationDone && _schemaVersion >= 3) return;
    try {
      await _withManagerWriteLock('migrate-stash-schema', async function () {
        const db = await openManagerDB();
        try {
          await new Promise((resolve, reject) => {
            const tx = db.transaction('manager_state', 'readwrite');
            const store = tx.objectStore('manager_state');
            let storedVersion=0, nextThreads={}, changed=false, notify=false;
            const vr=store.get('schema_version');
            vr.onsuccess=()=>{storedVersion=Number(vr.result)||0;};
            const tr=store.get('threads');
            tr.onsuccess=()=>{
              const v2=_migrateThreadsToV2(tr.result||{});
              const needV3=desiredVersion>=3&&storedVersion<3;
              nextThreads=needV3?_migrateThreadsToV3(v2.threads):v2.threads;
              changed=v2.changed||needV3;notify=needV3;
              if(changed)store.put(nextThreads,'threads');
              if(needV3){storedVersion=3;store.put(3,'schema_version');}
            };
            tx.oncomplete=()=>{
              _migrationDone=true;_schemaVersion=storedVersion;
              _noteSeenThreadVersions(nextThreads);
              if(notify)_dispatchStashChanged();
              resolve();
            };
            tx.onerror=()=>reject(tx.error);
            tx.onabort=()=>reject(tx.error||new Error('Migration aborted'));
          });
        } finally {
          try { db.close(); } catch (_) { /* swallow */ }
        }
      });
    } catch (e) {
      console.warn(desiredVersion >= 3 ? 'StashBridge: v3 migration failed' : 'StashBridge: schema migration failed', e);
    }
  }

  // One-time migration: converts legacy bare DMC keys (e.g. "310") in the
  // "threads" store to composite keys (e.g. "dmc:310").
  async function migrateSchemaToV2() {
    await migrateToLatest(2);
  }

  // V3 migration: adds addedAt, lastAdjustedAt, acquisitionSource, history to every stash entry.
  // Must run after V2 migration completes.
  async function migrateSchemaToV3() {
    await migrateToLatest(3);
  }

  // Delegates to the canonical opener in helpers.js, which opens without a
  // version and repairs a database left storeless by a versionless open. The
  // old hard-coded open(name, 1) here could not create manager_state on a
  // database that already existed at version 1 without it — onupgradeneeded
  // never fires — so every transaction threw NotFoundError.
  function openManagerDB() {
    if (typeof ensurePersistence === 'function') ensurePersistence();
    if (typeof window !== 'undefined' && typeof window.openManagerDB === 'function') {
      return window.openManagerDB();
    }
    // Fallback for contexts where helpers.js isn't present (tests, workers).
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("stitch_manager_db");
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("manager_state")) db.createObjectStore("manager_state");
      };
      req.onsuccess = () => {
        const db = req.result;
        if (db.objectStoreNames.contains("manager_state")) { resolve(db); return; }
        const next = db.version + 1;
        db.close();
        const up = indexedDB.open("stitch_manager_db", next);
        up.onupgradeneeded = (e) => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains("manager_state")) d.createObjectStore("manager_state");
        };
        up.onsuccess = () => resolve(up.result);
        up.onerror = () => reject(up.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function _normaliseVersion(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  function _getEntryVersion(entry) {
    return _normaliseVersion(entry && entry._v);
  }

  function _noteSeenVersion(key, version) {
    if (!key) return;
    _seenThreadVersions[key] = _normaliseVersion(version);
  }

  function _noteSeenThreadVersions(threads) {
    for (const key of Object.keys(threads || {})) {
      _noteSeenVersion(key, _getEntryVersion(threads[key]));
    }
  }

  function _noteSeenThreadKeys(threads, keys) {
    for (const key of keys || []) {
      if (threads && threads[key]) _noteSeenVersion(key, _getEntryVersion(threads[key]));
    }
  }

  function _warnIfVersionAdvanced(key, entry) {
    const seen = _seenThreadVersions[key];
    const current = _getEntryVersion(entry);
    if (typeof seen === 'number' && current > seen) {
      console.warn('StashBridge: observed newer stash entry version before write', {
        key: key,
        seenVersion: seen,
        currentVersion: current
      });
    }
  }

  function _bumpEntryVersion(key, entry) {
    const next = _getEntryVersion(entry) + 1;
    entry._v = next;
    _noteSeenVersion(key, next);
    return next;
  }

  function _makeThreadEntry(now, isV3, acquisitionSource) {
    const entry = { owned: 0, tobuy: false, partialStatus: null };
    if (isV3) {
      entry.addedAt = now;
      entry.lastAdjustedAt = null;
      entry.acquisitionSource = acquisitionSource === undefined ? null : acquisitionSource;
      entry.history = [];
    }
    return entry;
  }

  function _ensureThreadEntry(threads, key, ctx, options) {
    const opts = options || {};
    let entry = threads[key];
    let created = false;
    let touchedDefaults = false;
    if (!entry || typeof entry !== 'object') {
      entry = _makeThreadEntry(ctx.now, ctx.isV3, opts.acquisitionSource);
      threads[key] = entry;
      created = true;
      touchedDefaults = true;
    }
    _warnIfVersionAdvanced(key, entry);
    if (ctx.isV3) {
      if (entry.addedAt === undefined) { entry.addedAt = ctx.now; touchedDefaults = true; }
      if (entry.lastAdjustedAt === undefined) { entry.lastAdjustedAt = null; touchedDefaults = true; }
      if (entry.acquisitionSource === undefined) { entry.acquisitionSource = opts.acquisitionSource === undefined ? null : opts.acquisitionSource; touchedDefaults = true; }
      if (!Array.isArray(entry.history)) { entry.history = []; touchedDefaults = true; }
    }
    return { entry: entry, created: created, touchedDefaults: touchedDefaults };
  }

  function _appendHistory(entry, delta, now) {
    if (!delta) return;
    if (!Array.isArray(entry.history)) entry.history = [];
    entry.history.push({ date: now, delta: delta });
    if (entry.history.length > 500) {
      entry.history = entry.history.slice(entry.history.length - 500);
    }
  }

  async function _acquireManagerWriteLock(opLabel) {
    try {
      if (typeof window === 'undefined' || !window.CrossTabLock || typeof window.CrossTabLock.acquire !== 'function') {
        console.warn('StashBridge: cross-tab lock unavailable; proceeding without write lock for ' + opLabel);
        return { ok: true, degraded: true, release: async function () { return false; } };
      }
      const lease = await window.CrossTabLock.acquire(_managerWriteResource, opLabel, { timeoutMs: 1500 });
      if (!lease || lease.ok !== true) {
        console.warn('StashBridge: cross-tab lock timed out; proceeding without write lock for ' + opLabel);
        return { ok: false, degraded: true, release: async function () { return false; } };
      }
      if (lease.degraded) {
        console.warn('StashBridge: cross-tab lock degraded; proceeding without strict exclusion for ' + opLabel);
      }
      return lease;
    } catch (err) {
      console.warn('StashBridge: cross-tab lock failed; proceeding without write lock for ' + opLabel, err);
      return { ok: false, degraded: true, release: async function () { return false; } };
    }
  }

  async function _withManagerWriteLock(opLabel, work) {
    const lease = await _acquireManagerWriteLock(opLabel);
    try {
      return await work(lease);
    } finally {
      try {
        if (lease && typeof lease.release === 'function') await lease.release();
      } catch (_) { /* swallow */ }
    }
  }

  async function _withThreadsWrite(opLabel, mutate, options) {
    const opts = options || {};
    await migrateToLatest(3);
    return _withManagerWriteLock(opLabel, async function () {
      const db = await openManagerDB();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readwrite");
          const store = tx.objectStore("manager_state");
          let settled = false;
          let completionValue;
          let changedKeys = [];
          function resolveOnce(value) { if (!settled) { settled = true; resolve(value); } }
          function rejectOnce(err) { if (!settled) { settled = true; reject(err); } }
          tx.onerror = () => rejectOnce(tx.error || new Error('Transaction failed'));
          tx.onabort = () => rejectOnce(tx.error || new Error('Transaction aborted'));
          // Both reads and both writes belong to the same IDB transaction.
          let record, legacy, reservations;
          const reservationsReq=store.get("thread_reservations_v1");
          reservationsReq.onsuccess=()=>{reservations=reservationsReq.result;};
          if (opts.legacyKey) {
            const legacyReq=store.get(opts.legacyKey);
            legacyReq.onsuccess=()=>{legacy=legacyReq.result;};
          }
          if (opts.recordKey) {
            const recordReq = store.get(opts.recordKey);
            recordReq.onsuccess = () => { record = recordReq.result; };
          }
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            const ctx = { now: new Date().toISOString(), isV3: _schemaVersion >= 3, record: record, legacy: legacy, reservations: reservations };
            let outcome;
            try {
              outcome = mutate(threads, ctx) || {};
              completionValue = Object.prototype.hasOwnProperty.call(outcome, 'value') ? outcome.value : outcome;
              changedKeys = Array.isArray(outcome.changedKeys) ? outcome.changedKeys.slice() : [];
            } catch (err) {
              tx.abort();
              rejectOnce(err);
              return;
            }
            try {
              if (opts.recordKey && outcome.record) store.put(outcome.record, opts.recordKey);
              const putReq = store.put(threads, "threads");
              putReq.onerror = () => rejectOnce(putReq.error);
            } catch (err) {
              try { tx.abort(); } catch (_) {}
              rejectOnce(err);
              return;
            }
            tx.oncomplete = () => {
              if (opts.invalidateStats && typeof invalidateStatsCache === 'function') invalidateStatsCache();
              _noteSeenThreadKeys(threads, changedKeys);
              if (opts.dispatch !== false) _dispatchStashChanged();
              resolveOnce(completionValue);
            };
          };
          req.onerror = () => rejectOnce(req.error);
        });
      } finally {
        try { db.close(); } catch (_) { /* swallow */ }
      }
    });
  }

  return {
    migrateToLatest,
    migrateSchemaToV2,

    // Returns { [compositeKey]: { owned: number, tobuy: bool, partialStatus: string|null } }
    async getGlobalStash() {
      await migrateSchemaToV2();
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const store = tx.objectStore("manager_state");
          const req = store.get("threads");
          req.onsuccess = () => {
            const threads = req.result || {};
            _noteSeenThreadVersions(threads);
            resolve(threads);
          };
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.getGlobalStash failed:", e);
        return {};
      }
    },

    // Reads the manager_state.patterns array (the Stash Manager pattern library).
    // Used by the Shopping tab so manager-only patterns (added via the Manager's
    // Add Pattern modal, or wishlist entries with no live ProjectStorage row)
    // are still considered when computing thread deficits.
    async getManagerPatterns() {
      try {
        const db = await openManagerDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const store = tx.objectStore("manager_state");
          const req = store.get("patterns");
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.error("StashBridge.getManagerPatterns failed:", e);
        return [];
      }
    },

    // Returns threads filtered by brand from the composite-keyed stash.
    // brand: 'dmc' | 'anchor' | undefined (all)
    async getStashByBrand(brand) {
      const all = await StashBridge.getGlobalStash();
      if (!brand) return all;
      const result = {};
      for (const [key, val] of Object.entries(all)) {
        const colon = key.indexOf(':');
        const keyBrand = colon < 0 ? 'dmc' : key.slice(0, colon);
        if (keyBrand === brand) result[key] = val;
      }
      return result;
    },

    // Updates a single thread's owned count in the global stash.
    // Accepts composite keys ('dmc:310') or bare legacy IDs ('310').
    // Tracks history of owned-count changes for stats.
    async updateThreadOwned(dmcId, newCount) {
      if(!Number.isFinite(newCount)||newCount<0)throw new Error('Owned quantity must be finite and non-negative');
      const key = _normaliseKey(dmcId);
      try {
        return await _withThreadsWrite('updateThreadOwned', function (threads, ctx) {
          const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
          const entry = ensured.entry;
          const oldCount = entry.owned || 0;
          if (ctx.isV3 && oldCount === 0 && newCount > 0 && entry.addedAt === LEGACY_EPOCH) {
            entry.addedAt = ctx.now;
            entry.acquisitionSource = null;
          }
          const delta = newCount - oldCount;
          entry.owned = newCount;
          if (delta !== 0 && ctx.isV3) {
            entry.lastAdjustedAt = ctx.now;
            _appendHistory(entry, delta, ctx.now);
          }
          _bumpEntryVersion(key, entry);
          return { changedKeys: [key] };
        }, { invalidateStats: true });
      } catch (e) {
        console.error("StashBridge.updateThreadOwned failed:", e);
      }
    },

    // Merge only edits made since the Manager's last displayed baseline.
    // Quantity edits are deltas, so stale autosave/unload cannot erase RT usage.
    // A bulk stash import is one transaction, never a sequence of count writes.
    async bulkEnsureOwned(keys) {
      if(!Array.isArray(keys)||keys.some(function(key){return typeof key!=='string'||!/^(dmc|anchor):[^:]+$/.test(key);}))throw Error('Invalid bulk stash identity');
      return _withThreadsWrite('bulkEnsureOwned',function(threads,ctx){
        var changed=[];
        Array.from(new Set(keys)).forEach(function(key){
          var current=threads[key];
          if(current&&(current.owned||current.tobuy||current.partialStatus))return;
          var entry=_ensureThreadEntry(threads,key,ctx,{now:ctx.now}).entry;
          entry.owned=1;entry.lastAdjustedAt=ctx.now;
          _appendHistory(entry,1,ctx.now);_bumpEntryVersion(key,entry);changed.push(key);
        });
        return {changedKeys:changed};
      },{invalidateStats:true});
    },

    async saveThreadEdits(next, baseline) {
      return _withThreadsWrite('saveThreadEdits', function(threads, ctx) {
        const changedKeys=[];
        for(const key of Object.keys(next||{})) {
          const before=(baseline||{})[key]||{};
          const after=next[key]||{};
          const fields=Object.keys(after).filter(f=>!['_v','history','lastAdjustedAt'].includes(f)&&JSON.stringify(after[f])!==JSON.stringify(before[f]));
          if(!fields.length)continue;
          const entry=_ensureThreadEntry(threads,_normaliseKey(key),ctx).entry;
          fields.forEach(f=>{
            if(f==='owned') {
              if(!Number.isFinite(after.owned)||after.owned<0)throw new Error('Owned quantity must be finite and non-negative');
              const oldOwned=Number(entry.owned)||0;
              const delta=(Number(after.owned)||0)-(Number(before.owned)||0);
              entry.owned=after.owned===0?0:Math.max(0,oldOwned+delta);
              entry.lastAdjustedAt=ctx.now;
              _appendHistory(entry,entry.owned-oldOwned,ctx.now);
            } else { entry[f]=after[f]; }
          });
          if(fields.includes('partialStatus')&&after.partialStatus==='used-up'&&entry.owned) {
            _appendHistory(entry,-entry.owned,ctx.now);entry.owned=0;entry.lastAdjustedAt=ctx.now;
          }
          _bumpEntryVersion(key,entry);changedKeys.push(key);
        }
        return { changedKeys: changedKeys, value: threads };
      }, { invalidateStats: true });
    },

    async materialProjects(ids) {
      if(!window.ProjectStorage)throw new Error('Project storage is required for material planning');
      const S=window.ProjectStorage;
      const projects=S.listMaterialProjects?await S.listMaterialProjects(ids):await Promise.all((await S.listProjects()).map(p=>S.get(p.id)));
      const states=S.getProjectStates?S.getProjectStates():{};
      return projects.filter(p=>p&&(!ids||ids.includes(p.id))).map(p=>({...p,materialState:states[p.id]}));
    },
    async projectMaterials(projectId, request) {
      const R=window.MaterialReservations;
      const projects=await this.materialProjects();
      const prefs=window.UserPrefs?window.UserPrefs.get('rtWastePrefs')||{}:{};
      return _withThreadsWrite('project-materials',function(threads,ctx){
        const record=ctx.record||R.empty();R.validate(record);
        if(projectId){
          if(!projects.some(p=>p.id===projectId&&R.active(p)))throw new Error('Choose an active saved project');
          const old=record.projects[projectId];
          if((request.revision||0)!==((old&&old.revision)||0))throw new Error('Reservation changed in another tab. Refresh and try again.');
          record.projects[projectId]={...request,revision:(request.revision||0)+1};R.validate(record);
        }
        Object.entries(record.projects).forEach(([id,r])=>{if(!projects.some(p=>p.id===id&&R.active(p)))r.enabled=false;});
        return {record,value:R.plan(threads,record,projects,prefs)};
      },{recordKey:R.KEY,dispatch:!!projectId});
    },

    async getMaterialReservationRequests() {
      const db=await openManagerDB();
      try{return await new Promise((resolve,reject)=>{
        const tx=db.transaction('manager_state','readonly');
        const req=tx.objectStore('manager_state').get(window.MaterialReservations.KEY);
        req.onsuccess=()=>{try{resolve(window.MaterialReservations.validate(req.result||window.MaterialReservations.empty()));}catch(e){reject(e);}};
        req.onerror=()=>reject(req.error);
      });}finally{db.close();}
    },

    async getConsumptionAccounting() {
      const db=await openManagerDB();
      try{return await new Promise((resolve,reject)=>{
        const tx=db.transaction('manager_state','readonly');
        const req=tx.objectStore('manager_state').get(window.ThreadAccounting.KEY);
        req.onsuccess=()=>resolve(req.result||window.ThreadAccounting.empty());
        req.onerror=()=>reject(req.error);
      });}finally{db.close();}
    },

    // Consumption history and inventory are one atomic manager_state write.
    async applyConsumptionEvents(projectId, initialMarks, operations) {
      if(!projectId)throw new Error('A saved project id is required');
      const A=window.ThreadAccounting;
      const R=window.MaterialReservations;
      const intent=R?await this.getMaterialReservationRequests():null;
      const ids=intent?Object.keys(intent.projects).filter(id=>intent.projects[id].enabled):[];
      const projects=R&&ids.length?await this.materialProjects(ids):[];
      const prefs=window.UserPrefs?window.UserPrefs.get('rtWastePrefs')||{}:{};
      if(window.__restoringBackup>Date.now())throw new Error('Consumption saving is paused during restore');
      return _withThreadsWrite('consumption-events',function(threads,ctx){
        if(window.__restoringBackup>Date.now())throw new Error('Consumption saving is paused during restore');
        const ledger=ctx.record||A.empty();
        A.baseline(ledger,projectId,initialMarks,ctx.legacy,ctx.now);
        const requests=ctx.reservations||(R&&R.empty());
        if(R&&Object.keys(requests.projects).some(id=>requests.projects[id].enabled&&!ids.includes(id)))throw new Error('Reservations changed while saving consumption. Retry the pending save.');
        const plan=R?R.plan(threads,requests,projects.filter(p=>requests.projects[p.id]&&requests.projects[p.id].enabled),prefs):null;
        const own=plan&&plan.groups.find(p=>p.id===projectId);
        const protectedStock={};
        if(plan)Object.entries(plan.reserved).forEach(([k,n])=>{protectedStock[k]=Math.max(0,n-((own&&own.rows.find(r=>r.key===k)||{}).reserved||0));});
        const mapped=(operations||[]).map(op=>{
          const request=requests&&requests.projects[projectId];
          if(!R||!op.estimate||!request)return op;
          return {...op,estimate:{...op.estimate,amounts:R.remap(op.estimate.amounts,request),substitutions:request.substitutions}};
        });
        const changed=A.apply(ledger,threads,mapped,ctx.now,protectedStock);
        return {record:ledger,value:{accounting:ledger,threads},changedKeys:changed};
      },{recordKey:A.KEY,legacyKey:'rt_deduction:'+projectId,invalidateStats:true});
    },

    // Absolute cumulative consumption, keyed by brand:id. The checkpoint and
    // inventory delta commit together; IDB serialises writers even without a
    // Web Lock. initial is the loaded project's consumption, NEVER live stock.
    // Unknown history is checkpointed without charging it a second time.
    async applyProjectConsumption(projectId, consumption, initial, options) {
      if (!projectId) throw new Error('A saved project id is required for stash deductions');
      function validate(amounts) {
        for (const key of Object.keys(amounts || {})) {
          if (!/^[a-z]+:.+/.test(key) || !Number.isFinite(amounts[key]) || amounts[key] < 0) {
            throw new Error('Invalid project consumption: ' + key);
          }
        }
      }
      validate(consumption); validate(initial);
      const restore = !!(options && options.restore);
      return _withThreadsWrite('applyProjectConsumption', function(threads, ctx) {
        const record = ctx.record || { version: 1, threads: {}, migration: 'checkpoint-existing-consumption' };
        if (record.version !== 1) throw new Error('Unsupported deduction accounting version');
        const keys = new Set([...Object.keys(initial || {}), ...Object.keys(consumption || {}), ...Object.keys(record.threads)]);
        const changedKeys = [];
        for (const key of keys) {
          const prior = record.threads[key] || { observed: (initial && initial[key]) || 0, deducted: 0 };
          const now = (consumption && consumption[key]) || 0;
          const initialise = !!(options && options.initialise);
          const delta = restore || initialise ? 0 : Math.max(0, now - prior.observed);
          const entry = threads[key];
          // Missing/empty stock is not a debt to collect from future purchases.
          const available = stashEffectiveQty(entry);
          const debit = Math.min(available, delta);
          const credit = restore ? prior.deducted : 0;
          if (debit || credit) {
            const next = _ensureThreadEntry(threads, key, ctx).entry;
            next.owned = Math.max(0, available - debit + credit);
            // Fold a qualitative partial skein into exact fractional owned once.
            next.partialStatus = null;
            next.lastAdjustedAt = ctx.now;
            _appendHistory(next, credit - debit, ctx.now);
            _bumpEntryVersion(key, next);
            changedKeys.push(key);
          }
          record.threads[key] = {
            observed: initialise ? prior.observed : Math.max(prior.observed, now),
            deducted: restore ? 0 : prior.deducted + debit
          };
        }
        record.updatedAt = ctx.now;
        return { record: record, value: { accounting: record, threads: threads }, changedKeys: changedKeys };
      }, { recordKey: 'rt_deduction:' + projectId, invalidateStats: true });
    },

    // Returns array of projects that use a given DMC thread ID
    // Scans ProjectStorage metadata + manager pattern library
    async getProjectsUsingThread(dmcId) {
      const projects = [];
      // 1. Check ProjectStorage (generated patterns from Creator/Tracker)
      try {
        const allMeta = await ProjectStorage.listProjects();
        // PERF (perf-5 #3): parallel fetch instead of N sequential awaits.
        const fulls = await Promise.all(allMeta.map(m => ProjectStorage.get(m.id).catch(() => null)));
        for (let i = 0; i < allMeta.length; i++) {
          const meta = allMeta[i];
          const full = fulls[i];
          if (!full || !full.pattern) continue;
          const uses = full.pattern.some(cell =>
            cell && cell.id === dmcId
          );
          if (uses) projects.push({
            source: "project",
            id: meta.id,
            name: meta.name,
            type: "generated"
          });
        }
      } catch (e) { /* ProjectStorage may not be loaded */ }
      // 2. Check manager pattern library
      try {
        const db = await openManagerDB();
        const patterns = await new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const req = tx.objectStore("manager_state").get("patterns");
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        for (const pat of patterns) {
          if (pat.threads && pat.threads.some(t => t.id === dmcId && _libraryKey(t) === 'dmc:' + dmcId)) {
            projects.push({
              source: "library",
              id: pat.id,
              name: pat.title,
              type: "manual"
            });
          }
        }
      } catch (e) { /* silent */ }
      return projects;
    },

    // Syncs a generated project's thread requirements into the manager's pattern library.
    // Called after pattern generation and on project save.
    // skeinData: array of { id, name, stitches, skeins, rgb }
    // fabricCt: the project's fabric count (e.g. 14, 18, 28) — stored so conflict
    //           detection can convert stitches to skeins using the correct count.
    async syncProjectToLibrary(projectId, projectName, skeinData, status, fabricCt) {
      try {
        return await _withManagerWriteLock('syncProjectToLibrary', async function () {
          const db = await openManagerDB();
          try {
            return await new Promise((resolve, reject) => {
              const tx = db.transaction("manager_state", "readwrite");
              const store = tx.objectStore("manager_state");
              const req = store.get("patterns");
              req.onsuccess = () => {
                const patterns = req.result || [];
                const existingIdx = patterns.findIndex(p => p.linkedProjectId === projectId);
                const existing = existingIdx >= 0 ? patterns[existingIdx] : null;
                const entry = {
                  id: existing ? existing.id : Date.now().toString(),
                  linkedProjectId: projectId,
                  title: projectName,
                  designer: existing ? existing.designer : "",
                  status: status || (existing ? existing.status : "inprogress"),
                  tags: existing ? existing.tags : ["auto-synced"],
                  fabricCt: fabricCt || 14,
                  project_overrides: existing ? existing.project_overrides : undefined,
                  threads: skeinData.map(d => ({
                    id: d.id,
                    name: d.name,
                    qty: d.stitches,
                    unit: "stitches",
                    // The project's thread brand (P4-5): "DMC" or "Anchor".
                    brand: typeof threadBrandLabel === "function" ? threadBrandLabel(d.brand) : "DMC"
                  }))
                };
                if (existingIdx >= 0) patterns[existingIdx] = entry;
                else patterns.push(entry);
                store.put(patterns, "patterns");
                tx.oncomplete = () => { _dispatchPatternsChanged(); resolve(); };
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
              };
              req.onerror = () => reject(req.error);
            });
          } finally {
            try { db.close(); } catch (_) { /* swallow */ }
          }
        });
      } catch (e) {
        console.error("StashBridge.syncProjectToLibrary failed:", e);
      }
    },

    // Brief D — remove the auto-synced pattern library entry linked to a deleted project.
    // No-op when nothing is linked. Safe to call on every project delete.
    async unlinkProjectFromLibrary(projectId) {
      try {
        return await _withManagerWriteLock('unlinkProjectFromLibrary', async function () {
          const db = await openManagerDB();
          try {
            return await new Promise((resolve, reject) => {
              const tx = db.transaction("manager_state", "readwrite");
              const store = tx.objectStore("manager_state");
              const req = store.get("patterns");
              req.onsuccess = () => {
                const patterns = req.result || [];
                const filtered = patterns.filter(p => p.linkedProjectId !== projectId);
                const changed = filtered.length !== patterns.length;
                if (changed) store.put(filtered, "patterns");
                tx.oncomplete = () => {
                  if (changed) _dispatchPatternsChanged();
                  resolve();
                };
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
              };
              req.onerror = () => reject(req.error);
            });
          } finally {
            try { db.close(); } catch (_) { /* swallow */ }
          }
        });
      } catch (e) {
        console.error("StashBridge.unlinkProjectFromLibrary failed:", e);
      }
    },

    // Bulk form of unlinkProjectFromLibrary, for "delete every pattern".
    // Doing it one id at a time would take the manager write lock N times and
    // fire N cs:patternsChanged events; this takes the lock once and fires one.
    async unlinkProjectsFromLibrary(projectIds) {
      const ids = Array.isArray(projectIds) ? projectIds : [];
      if (!ids.length) return;
      const doomed = new Set(ids);
      try {
        return await _withManagerWriteLock('unlinkProjectsFromLibrary', async function () {
          const db = await openManagerDB();
          try {
            return await new Promise((resolve, reject) => {
              const tx = db.transaction("manager_state", "readwrite");
              const store = tx.objectStore("manager_state");
              const req = store.get("patterns");
              req.onsuccess = () => {
                const patterns = req.result || [];
                const filtered = patterns.filter(p => !doomed.has(p.linkedProjectId));
                const changed = filtered.length !== patterns.length;
                if (changed) store.put(filtered, "patterns");
                tx.oncomplete = () => {
                  if (changed) _dispatchPatternsChanged();
                  resolve();
                };
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
              };
              req.onerror = () => reject(req.error);
            });
          } finally {
            try { db.close(); } catch (_) { /* swallow */ }
          }
        });
      } catch (e) {
        console.error("StashBridge.unlinkProjectsFromLibrary failed:", e);
      }
    },

    // Detects conflicts: threads two or more active patterns need that the
    // stash cannot cover between them. One pattern's shortfall is not a
    // conflict; see getToBuy().
    // Returns [ { key, brand, id, name, rgb, owned, totalNeeded, deficit,
    //             patterns: [{ id, title, qty }] } ], biggest deficit first.
    async detectConflicts() {
      try {
        const [threadsData, patternsData] = await _readThreadsAndPatterns();
        return _findConflicts(_buildDemand(patternsData), threadsData);
      } catch (e) {
        console.error("StashBridge.detectConflicts failed:", e);
        return [];
      }
    },

    // What the stash is short of for the active patterns: per project (each on
    // its own) and in total. Rows are threads with { need, owned, toBuy }.
    // `shopping` is the shopping list (getShoppingList()), so callers that
    // already hold this result need not read the stash twice.
    // Returns { projects: [{ id, title, threads }], total, shopping }.
    async getToBuy() {
      try {
        const [threadsData, patternsData] = await _readThreadsAndPatterns();
        const toBuy = _buildToBuy(_buildDemand(patternsData), threadsData);
        toBuy.shopping = _mergeShoppingList(threadsData, toBuy.total);
        return toBuy;
      } catch (e) {
        console.error("StashBridge.getToBuy failed:", e);
        return { projects: [], total: [], shopping: [] };
      }
    },

    // Returns patterns you can fully start with your current stash.
    // Each result: { id, title, status, totalThreads, coveredThreads, missing }
    async whatCanIStart() {
      try {
        const db = await openManagerDB();
        const [threadsData, patternsData] = await _queryThreadsAndPatterns(db);
        const notStarted = patternsData.filter(p => p.status !== "completed" && p.status !== "inprogress");
        const results = [];
        for (const pat of notStarted) {
          if (!pat.threads || pat.threads.length === 0) continue;
          const fc = pat.fabricCt || 14;
          let covered = 0, missing = [];
          const planned = _planningRows(pat,threadsData);
          for (const t of planned || pat.threads) {
            const skeins = planned ? t.estimatedNeeded : t.unit === "stitches" ? (typeof skeinEst === "function" ? skeinEst(t.qty, fc) : Math.ceil(t.qty / 200)) : t.qty;
            const key = planned ? t.key : _libraryKey(t);
            const owned = _getOwnedCount(threadsData, key, t.id);
            if (owned >= skeins) covered++;
            else missing.push({ id: planned ? t.p.id : t.id, name: t.name, need: skeins, have: owned });
          }
          results.push({ id: pat.id, title: pat.title, status: pat.status, totalThreads: (planned || pat.threads).length, coveredThreads: covered, missing, pct: Math.round(covered / (planned || pat.threads).length * 100) });
        }
        results.sort((a, b) => b.pct - a.pct);
        return results;
      } catch (e) {
        console.error("StashBridge.whatCanIStart failed:", e);
        return [];
      }
    },

    // Add a thread to the stash (increment owned count, default +1).
    // Accepts composite keys ('dmc:310') or bare legacy IDs ('310').
    // options.acquisitionSource: 'purchased' | 'inherited' | 'gifted' | 'swapped' | 'unknown'
    // Returns a Promise resolving to the new owned count.
    async addToStash(id, count, options) {
      const key = _normaliseKey(id);
      const increment = count == null ? 1 : Number(count);
      if (!Number.isFinite(increment) || !Number.isInteger(increment) || increment < 1) {
        throw new Error("addToStash count must be a finite integer greater than or equal to 1");
      }
      try {
        return await _withThreadsWrite('addToStash', function (threads, ctx) {
          const src = (options && options.acquisitionSource) || 'purchased';
          const current = (threads[key] && threads[key].owned) || 0;
          const isNew = !threads[key] || current === 0;
          const ensured = _ensureThreadEntry(threads, key, ctx, { acquisitionSource: isNew ? src : null, now: ctx.now });
          const entry = ensured.entry;
          if (isNew && ctx.isV3) {
            if (!entry.addedAt) entry.addedAt = ctx.now;
            if (entry.lastAdjustedAt == null) entry.lastAdjustedAt = ctx.now;
            if (entry.acquisitionSource == null) entry.acquisitionSource = src;
            if (!Array.isArray(entry.history)) entry.history = [];
          }
          const next = current + increment;
          const delta = next - current;
          entry.owned = next;
          if (delta !== 0 && ctx.isV3) {
            entry.lastAdjustedAt = ctx.now;
            _appendHistory(entry, delta, ctx.now);
          }
          _bumpEntryVersion(key, entry);
          return { value: next, changedKeys: [key] };
        }, { invalidateStats: true });
      } catch (e) {
        console.error("StashBridge.addToStash failed:", e);
        throw e;
      }
    },

    // Finds similar threads to a given thread key from your owned stash.
    // threadKeyOrId: composite key ('dmc:310') or bare DMC id ('310').
    // Compares using CIEDE2000 (dE2000) when available, falls back to dE.
    // Searches across all owned brands (DMC + Anchor).
    suggestAlternatives(threadKeyOrId, maxResults = 5, ownedThreads = {}) {
      const normKey = _normaliseKey(threadKeyOrId);
      const colon = normKey.indexOf(':');
      const srcBrand = colon < 0 ? 'dmc' : normKey.slice(0, colon);
      const srcId = colon < 0 ? normKey : normKey.slice(colon + 1);
      // Resolve source thread
      const target = (typeof findThreadInCatalog === 'function')
        ? findThreadInCatalog(srcBrand, srcId)
        : null;
      if (!target || typeof rgbToLab !== 'function') return [];
      const targetLab = target.lab || rgbToLab(target.rgb[0], target.rgb[1], target.rgb[2]);
      const distFn = typeof dE2000 === 'function' ? dE2000 : (typeof dE === 'function' ? dE : null);
      if (!distFn) return [];
      const candidates = [];
      for (const [key, state] of Object.entries(ownedThreads)) {
        if (key === normKey || !state.owned || state.owned <= 0) continue;
        const c2 = key.indexOf(':');
        const brand = c2 < 0 ? 'dmc' : key.slice(0, c2);
        const id = c2 < 0 ? key : key.slice(c2 + 1);
        const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(brand, id) : null;
        if (!info) continue;
        const lab = info.lab || rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]);
        const dist = distFn(targetLab, lab);
        candidates.push({ key, brand, id, name: info.name, rgb: info.rgb, owned: state.owned, deltaE: Math.round(dist * 10) / 10 });
      }
      candidates.sort((a, b) => a.deltaE - b.deltaE);
      return candidates.slice(0, maxResults);
    },

    // Updates a single thread's tobuy flag in the global stash.
    // Accepts composite keys ('dmc:310') or bare legacy IDs ('310').
    async updateThreadToBuy(keyOrId, toBuy) {
      const key = _normaliseKey(keyOrId);
      try {
        return await _withThreadsWrite('updateThreadToBuy', function (threads, ctx) {
          const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
          const entry = ensured.entry;
          entry.tobuy = toBuy;
          if (!toBuy) {
            entry.tobuy_qty = 0;
            entry.tobuy_added_at = null;
          }
          _bumpEntryVersion(key, entry);
          return { changedKeys: [key] };
        });
      } catch (e) {
        console.error("StashBridge.updateThreadToBuy failed:", e);
      }
    },

    // A1 (UX Phase 5) — batched tobuy flag update. Accepts an array of
    // composite keys or bare legacy IDs and flips the tobuy flag on each in a
    // single transaction. Returns the number of entries actually changed
    // (i.e. ones whose tobuy flag was different from `toBuy` beforehand) so
    // callers can show "X added, Y already on the list" style toasts.
    //
    // Optional 3rd arg `qtyMap`: { [keyOrId]: number } — when adding (toBuy=true)
    // any key that has a positive qty in the map seeds tobuy_qty and bumps
    // tobuy_added_at to now if the entry wasn't already on the list. Existing
    // tobuy_qty values are preserved if the key is omitted from qtyMap.
    async markManyToBuy(keysOrIds, toBuy, qtyMap) {
      if (!Array.isArray(keysOrIds) || keysOrIds.length === 0) return 0;
      const flag = !!toBuy;
      const keys = keysOrIds.map(_normaliseKey);
      const qtyByKey = {};
      if (qtyMap && typeof qtyMap === 'object') {
        for (const k of Object.keys(qtyMap)) qtyByKey[_normaliseKey(k)] = Number(qtyMap[k]) || 0;
      }
      try {
        return await _withThreadsWrite('markManyToBuy', function (threads, ctx) {
          let changed = 0;
          const changedKeys = [];
          for (const key of keys) {
            const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
            const entry = ensured.entry;
            const wasOn = !!entry.tobuy;
            let touched = false;
            if (wasOn !== flag) {
              entry.tobuy = flag;
              changed++;
              touched = true;
            }
            if (flag) {
              const qty = qtyByKey[key];
              if (qty > 0 && Number(entry.tobuy_qty) !== qty) {
                entry.tobuy_qty = qty;
                touched = true;
              }
              if (!wasOn && !entry.tobuy_added_at) {
                entry.tobuy_added_at = ctx.now;
                touched = true;
              }
            } else {
              if ((Number(entry.tobuy_qty) || 0) !== 0 || entry.tobuy_added_at) touched = true;
              entry.tobuy_qty = 0;
              entry.tobuy_added_at = null;
            }
            if (touched) {
              _bumpEntryVersion(key, entry);
              changedKeys.push(key);
            }
          }
          return { value: changed, changedKeys: changedKeys };
        });
      } catch (e) {
        console.error("StashBridge.markManyToBuy failed:", e);
        return 0;
      }
    },

    // Schema v4 (Shopping List rebuild) — sets the desired purchase quantity
    // on a single thread. qty <= 0 clears the row from the shopping list
    // (tobuy=false). Otherwise tobuy is forced true and tobuy_added_at is
    // stamped to now if the row wasn't already on the list.
    async setToBuyQty(keyOrId, qty) {
      const key = _normaliseKey(keyOrId);
      const n = Math.max(0, Math.floor(Number(qty) || 0));
      try {
        return await _withThreadsWrite('setToBuyQty', function (threads, ctx) {
          const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
          const entry = ensured.entry;
          const wasOn = !!entry.tobuy;
          if (n <= 0) {
            entry.tobuy = false;
            entry.tobuy_qty = 0;
            entry.tobuy_added_at = null;
          } else {
            entry.tobuy = true;
            entry.tobuy_qty = n;
            if (!wasOn || !entry.tobuy_added_at) entry.tobuy_added_at = ctx.now;
          }
          _bumpEntryVersion(key, entry);
          return { value: n, changedKeys: [key] };
        });
      } catch (e) {
        console.error("StashBridge.setToBuyQty failed:", e);
        return 0;
      }
    },

    // Schema v4 (Shopping List rebuild) — bulk version of setToBuyQty.
    // qtyMap: { [keyOrId]: number }. Returns count of rows whose state changed.
    async setToBuyQtyMany(qtyMap) {
      if (!qtyMap || typeof qtyMap !== 'object') return 0;
      const entries = Object.keys(qtyMap).map(function(k) {
        return { key: _normaliseKey(k), qty: Math.max(0, Math.floor(Number(qtyMap[k]) || 0)) };
      });
      if (entries.length === 0) return 0;
      try {
        return await _withThreadsWrite('setToBuyQtyMany', function (threads, ctx) {
          let changed = 0;
          const changedKeys = [];
          for (const { key, qty } of entries) {
            const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
            const entry = ensured.entry;
            const wasOn = !!entry.tobuy;
            const wasQty = Number(entry.tobuy_qty) || 0;
            let touched = false;
            if (qty <= 0) {
              if (wasOn || wasQty > 0 || entry.tobuy_added_at) {
                entry.tobuy = false;
                entry.tobuy_qty = 0;
                entry.tobuy_added_at = null;
                changed++;
                touched = true;
              }
            } else {
              if (!wasOn || wasQty !== qty || !entry.tobuy_added_at) {
                changed++;
                touched = true;
              }
              entry.tobuy = true;
              entry.tobuy_qty = qty;
              if (!wasOn || !entry.tobuy_added_at) entry.tobuy_added_at = ctx.now;
            }
            if (touched) {
              _bumpEntryVersion(key, entry);
              changedKeys.push(key);
            }
          }
          return { value: changed, changedKeys: changedKeys };
        });
      } catch (e) {
        console.error("StashBridge.setToBuyQtyMany failed:", e);
        return 0;
      }
    },

    // Schema v4 (Shopping List rebuild) — closes the loop: the user has bought
    // `qty` skeins of `keyOrId`. Adds qty to owned (recording V3 history) AND
    // clears the shopping-list flags in a single transaction so a concurrent
    // writer (e.g. another setToBuyQty in flight) cannot land between the two
    // mutations and leave the row in an inconsistent state.
    // qty defaults to the row's current tobuy_qty (or 1 if the row had no qty).
    async markBought(keyOrId, qty) {
      const key = _normaliseKey(keyOrId);
      try {
        return await _withThreadsWrite('markBought', function (threads, ctx) {
          const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
          const entry = ensured.entry;
          let n = Number(qty);
          if (!Number.isFinite(n) || n <= 0) {
            n = Number(entry.tobuy_qty) > 0 ? Number(entry.tobuy_qty) : 1;
          }
          n = Math.max(1, Math.floor(n));
          const newOwned = (entry.owned || 0) + n;
          entry.owned = newOwned;
          if (ctx.isV3) {
            entry.lastAdjustedAt = ctx.now;
            if (entry.addedAt === undefined) entry.addedAt = ctx.now;
            if (entry.acquisitionSource === undefined) entry.acquisitionSource = null;
            _appendHistory(entry, n, ctx.now);
          }
          entry.tobuy = false;
          entry.tobuy_qty = 0;
          entry.tobuy_added_at = null;
          _bumpEntryVersion(key, entry);
          return { value: { key: key, addedSkeins: n, newOwned: newOwned }, changedKeys: [key] };
        }, { invalidateStats: true });
      } catch (e) {
        console.error("StashBridge.markBought failed:", e);
        return null;
      }
    },

    // Schema v4 (Shopping List rebuild) — bulk version of markBought used by
    // the "Mark all bought" header action. Single tx, single dispatch.
    // qtyMap: { [keyOrId]: number } (qty defaults to current tobuy_qty when
    // the value is missing, 0 or negative).
    async markBoughtMany(qtyMap) {
      if (!qtyMap || typeof qtyMap !== 'object') return [];
      const entries = Object.keys(qtyMap).map(function (k) {
        return { key: _normaliseKey(k), qty: Number(qtyMap[k]) };
      });
      if (entries.length === 0) return [];
      try {
        return await _withThreadsWrite('markBoughtMany', function (threads, ctx) {
          const results = [];
          const changedKeys = [];
          for (const { key, qty } of entries) {
            const ensured = _ensureThreadEntry(threads, key, ctx, { now: ctx.now });
            const entry = ensured.entry;
            let n = qty;
            if (!Number.isFinite(n) || n <= 0) {
              n = Number(entry.tobuy_qty) > 0 ? Number(entry.tobuy_qty) : 1;
            }
            n = Math.max(1, Math.floor(n));
            const newOwned = (entry.owned || 0) + n;
            entry.owned = newOwned;
            if (ctx.isV3) {
              entry.lastAdjustedAt = ctx.now;
              if (entry.addedAt === undefined) entry.addedAt = ctx.now;
              if (entry.acquisitionSource === undefined) entry.acquisitionSource = null;
              _appendHistory(entry, n, ctx.now);
            }
            entry.tobuy = false;
            entry.tobuy_qty = 0;
            entry.tobuy_added_at = null;
            _bumpEntryVersion(key, entry);
            changedKeys.push(key);
            results.push({ key: key, addedSkeins: n, newOwned: newOwned });
          }
          return { value: results, changedKeys: changedKeys };
        }, { invalidateStats: true });
      } catch (e) {
        console.error("StashBridge.markBoughtMany failed:", e);
        return [];
      }
    },

    // Schema v4 (Shopping List rebuild) — returns the user's current shopping
    // list as sorted rows: threads flagged by hand plus everything the active
    // patterns leave the stash short of (getToBuy().shopping), so Home and the
    // Stash Manager read one list.
    async getShoppingList() {
      try {
        return (await StashBridge.getToBuy()).shopping;
      } catch (e) {
        console.error("StashBridge.getShoppingList failed:", e);
        return [];
      }
    },

    // Schema v4 (Shopping List rebuild) — clears every tobuy flag/qty in one
    // transaction. Returns the number of rows cleared.
    async clearShoppingList() {
      try {
        return await _withThreadsWrite('clearShoppingList', function (threads) {
          let cleared = 0;
          const changedKeys = [];
          for (const key of Object.keys(threads)) {
            const entry = threads[key];
            if (entry && (entry.tobuy || (Number(entry.tobuy_qty) || 0) > 0)) {
              entry.tobuy = false;
              entry.tobuy_qty = 0;
              entry.tobuy_added_at = null;
              _bumpEntryVersion(key, entry);
              cleared++;
              changedKeys.push(key);
            }
          }
          return { value: cleared, changedKeys: changedKeys };
        });
      } catch (e) {
        console.error("StashBridge.clearShoppingList failed:", e);
        return 0;
      }
    },

    // A1 (UX Phase 5) — pure helper. Given a Creator displayPal (palette
    // entries with `.id`, `.type`, `.count`) and the current globalStash dict,
    // returns the composite keys of palette threads that are NOT sufficiently
    // owned (status === 'needed'). Mirrors the per-chip logic in
    // creator/Sidebar.js so the warning panel and the chip dots agree.
    //
    // Pure (no IndexedDB, no DOM). Safe to unit test. Caller supplies the
    // catalog lookups so this can be exercised under Node without DMC/ANCHOR
    // globals.
    //
    // options:
    //   fabricCt (number)             — defaults to 14
    //   skeinEst(stitches, fabricCt)  — defaults to a Math.ceil(stitches/1800) fallback
    //   resolveBrand(id)              — required: returns 'dmc' | 'anchor' for a given id
    //   splitBlendId(id)              — required: returns [a,b] for a 'A+B' blend id
    computeUnownedPaletteIds(displayPal, globalStash, options) {
      if (!Array.isArray(displayPal) || displayPal.length === 0) return [];
      const stash = globalStash || {};
      const opts = options || {};
      const fabricCt = opts.fabricCt || 14;
      if (typeof threadDemandRows === 'function') return threadDemandRows(displayPal, {fabricCount:fabricCt,stash:stash}).filter(r=>r.missing>0).map(r=>r.key);
      const estimator = typeof opts.skeinEst === 'function'
        ? opts.skeinEst
        : function(stitches) { return Math.max(1, Math.ceil((stitches || 0) / 1800)); };
      const resolveBrand = typeof opts.resolveBrand === 'function'
        ? opts.resolveBrand
        : function() { return 'dmc'; };
      const splitBlend = typeof opts.splitBlendId === 'function'
        ? opts.splitBlendId
        : function(id) { return String(id || '').split('+'); };
      const requiredByKey = Object.create(null);
      const order = [];
      for (const p of displayPal) {
        if (!p || !p.id || p.id === '__skip__' || p.id === '__empty__') continue;
        const ids = (p.type === 'blend' && typeof p.id === 'string' && p.id.indexOf('+') !== -1)
          ? splitBlend(p.id)
          : [p.id];
        const needed = (p.count != null) ? estimator(p.count, fabricCt) : 1;
        for (const id of ids) {
          if (!id || id === '__skip__' || id === '__empty__') continue;
          const brand = p.brand || resolveBrand(id);
          const key = brand + ':' + id;
          if (requiredByKey[key] == null) {
            requiredByKey[key] = 0;
            order.push(key);
          }
          requiredByKey[key] += needed;
        }
      }
      const unowned = [];
      for (const key of order) {
        const fallbackId = key.indexOf(':') >= 0 ? key.split(':').slice(1).join(':') : key;
        const entry = stash[key] || stash[fallbackId];
        const owned = stashEffectiveQty(entry);
        if (owned < requiredByKey[key]) unowned.push(key);
      }
      return unowned;
    },

    // Returns stash age distribution for the age chart.
    // Buckets: under1Yr, 1to3Yr, 3to5Yr, over5Yr, legacy (before tracking).
    async getStashAgeDistribution() {
      const stash = await StashBridge.getGlobalStash();
      const now = Date.now();
      const DAY = 86400000;
      const result = { bucketUnder1Yr: 0, bucket1to3Yr: 0, bucket3to5Yr: 0, bucketOver5Yr: 0, legacy: 0, oldest: null };
      for (const [key, entry] of Object.entries(stash)) {
        if (!isColorOwned(entry)) continue;
        if (!entry.addedAt || entry.acquisitionSource === 'legacy') {
          result.legacy++;
          continue;
        }
        const ageDays = (now - new Date(entry.addedAt).getTime()) / DAY;
        if (ageDays < 365) result.bucketUnder1Yr++;
        else if (ageDays < 1095) result.bucket1to3Yr++;
        else if (ageDays < 1825) result.bucket3to5Yr++;
        else result.bucketOver5Yr++;
        // Track oldest non-legacy thread
        if (!result.oldest || entry.addedAt < result.oldest.addedAt) {
          const info = _getThreadInfoByKey(key);
          result.oldest = { key: key, addedAt: entry.addedAt, name: info ? info.name : key, id: key };
        }
      }
      return result;
    },

    // Returns monthly acquisition vs. usage timeseries for the SABLE chart.
    // months: number of months to include (default 12).
    async getAcquisitionTimeseries(months) {
      months = months || 12;
      const stash = await StashBridge.getGlobalStash();
      const now = new Date();
      const points = [];
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        points.push({ month: monthStr, added: 0, used: 0 });
      }
      const monthSet = new Set(points.map(p => p.month));
      const monthMap = {};
      points.forEach(p => { monthMap[p.month] = p; });

      // Count stash additions per month from history arrays
      for (const [, entry] of Object.entries(stash)) {
        if (!entry.history || entry.acquisitionSource === 'legacy') continue;
        for (const evt of entry.history) {
          if (evt.delta > 0) {
            const m = evt.date.slice(0, 7); // 'YYYY-MM'
            if (monthMap[m]) monthMap[m].added += evt.delta;
          }
        }
        // Also count the initial addedAt if it's a non-legacy entry
        if (entry.addedAt && entry.addedAt !== LEGACY_EPOCH) {
          const m = entry.addedAt.slice(0, 7);
          // Only count if not already captured in history
          if (monthMap[m] && (!entry.history || entry.history.length === 0 || entry.history[0].date !== entry.addedAt)) {
            // The addedAt thread was created — its first history entry should already capture this
          }
        }
      }

      // Count stitchLog usage per month (converted to skeins)
      // ~1800 stitches per skein at 14-count Aida
      const STITCHES_PER_SKEIN = 1800;
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.listProjects) {
        try {
          const projects = await ProjectStorage.listProjects();
          // PERF (perf-5 #4): parallel fetch.
          const fulls = await Promise.all(projects.map(m => ProjectStorage.get(m.id).catch(() => null)));
          for (const proj of fulls) {
            if (!proj) continue;
            // Prefer stitchLog (derived from statsSessions by buildSnapshot on save).
            // Fall back to iterating statsSessions directly for projects that were
            // last saved before the derivation was added to buildSnapshot.
            if (proj.stitchLog && proj.stitchLog.length > 0) {
              for (const log of proj.stitchLog) {
                const m = log.date.slice(0, 7);
                if (monthMap[m]) monthMap[m].used += log.count / STITCHES_PER_SKEIN;
              }
            } else if (proj.statsSessions && proj.statsSessions.length > 0) {
              for (const s of proj.statsSessions) {
                if (!s || !s.date) continue;
                const m = s.date.slice(0, 7);
                if (monthMap[m]) monthMap[m].used += (ProgressUnits.sessionNet(s) || 0) / STITCHES_PER_SKEIN;
              }
            }
          }
        } catch (e) { /* ProjectStorage may not be loaded */ }
      }

      // Round 'used' to 1 decimal
      points.forEach(p => { p.used = Math.round(p.used * 10) / 10; });
      return points;
    },

    // Expose ownership helpers for external callers and tests
    isColorOwned: isColorOwned,
    stashEffectiveQty: stashEffectiveQty,
    PARTIAL_STATUS_FRACTIONS: PARTIAL_STATUS_FRACTIONS,
    LOW_STASH_SKEIN_THRESHOLD: LOW_STASH_SKEIN_THRESHOLD,

    // Returns the legacy epoch constant for external use
    get LEGACY_EPOCH() { return LEGACY_EPOCH; },

    // Expose migration functions
    migrateSchemaToV3,
    prepareBackupState,

    // Test surface for the Shopping List rebuild (Schema v4). Pure helper —
    // exposes the row-shaping logic without requiring IndexedDB.
    _buildShoppingListRows: _buildShoppingListRows,
  };
})();

// Auto-run migrations on script load (best-effort; errors are swallowed internally).
StashBridge.migrateToLatest()
  .catch(function() { /* migrations log internally */ });

// Top-level `const` in a classic <script> creates a global binding but does
// NOT attach to `window`. Several callers (BulkAddModal.js, ShoppingListModal.js,
// creator-main.js, home-app.js) feature-test via `window.StashBridge`, so
// without this assignment they silently fail or show the
// "StashBridge is not available" error. Mirror onto window explicitly.
try { if (typeof window !== 'undefined') window.StashBridge = StashBridge; } catch (_) {}
