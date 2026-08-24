/**
 * @jest-environment jsdom
 *
 * Tests for the audit-follow-up hardening
 * (reports/sync-import-visibility-analysis.md §5):
 *
 *   5.1  A live local project always overrides a tombstone (classification
 *        AND absorption of peer tombstones).
 *   5.2  executeImport re-merges the stash against its CURRENT state, keeps
 *        explicit gate resolutions, and takes the manager write-lock.
 *   5.3  cs_sync_lastExportAt is only stamped after an export verifiably
 *        left the app.
 *   5.4  scanFolder only decompresses files whose (size, lastModified)
 *        changed since the last scan.
 *   5.6  Typed-array `done` is normalised on export; object-form `done` is
 *        repaired on import.
 *
 * Same integration harness as syncImportFixes.test.js: the real
 * project-storage.js on fake-indexeddb underneath the real sync-engine.js.
 */
const fs = require('fs');
const path = require('path');
const pako = require('pako');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
window.indexedDB = global.indexedDB;
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
global.ensurePersistence = () => {};
global.structuredClone = global.structuredClone || (v => JSON.parse(JSON.stringify(v)));
global.pako = pako;
window.pako = pako;

const STORAGE_SRC = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');
const ENGINE_SRC = fs.readFileSync(path.join(__dirname, '..', 'sync-engine.js'), 'utf8');

eval(STORAGE_SRC);
window.ProjectStorage = ProjectStorage;
global.ProjectStorage = ProjectStorage;
eval(ENGINE_SRC);
const SE = window.SyncEngine;

const TOMBSTONE_KEY = 'cs_deleted_project_ids';
const LAST_EXPORT_KEY = 'cs_sync_lastExportAt';

function makeFakeManagerDB(state) {
  return {
    close() {},
    objectStoreNames: { contains: () => true },
    transaction() {
      const tx = { oncomplete: null, onerror: null, onabort: null };
      tx.objectStore = function () {
        return {
          put(value, key) { state[key] = value; },
          get(key) {
            const r = {};
            setTimeout(() => { r.result = state[key]; if (r.onsuccess) r.onsuccess(); }, 0);
            return r;
          },
          openCursor() {
            const r = {};
            const entries = Object.entries(state);
            let i = 0;
            function step() {
              const pair = entries[i];
              const cursor = pair
                ? { key: pair[0], value: pair[1], continue() { i++; setTimeout(step, 0); } }
                : null;
              if (r.onsuccess) r.onsuccess({ target: { result: cursor } });
            }
            setTimeout(step, 0);
            return r;
          }
        };
      };
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
}

function makeProject(id, updatedAt, overrides) {
  return Object.assign({
    id,
    name: 'Sampler ' + id,
    updatedAt,
    createdAt: '2026-08-01T00:00:00.000Z',
    settings: { sW: 2, sH: 2 },
    pattern: [{ id: '310' }, { id: '550' }, { id: '310' }, { id: '550' }],
    done: [0, 0, 0, 0]
  }, overrides || {});
}

function makeSyncObj(projects, extra) {
  return Object.assign({
    _format: SE.SYNC_FORMAT,
    _version: SE.SYNC_VERSION,
    _createdAt: '2026-08-15T12:00:00.000Z',
    _deviceId: 'device-A',
    _deviceName: 'Browser A',
    _mode: 'full',
    deletedProjectIds: [],
    deletedProjects: [],
    projects: projects.map(p => ({
      id: p.id,
      updatedAt: p.updatedAt,
      fingerprint: SE.computeFingerprint(p),
      data: p
    }))
  }, extra || {});
}

let managerState;
let toasts;

beforeEach(async () => {
  await ProjectStorage.clearAllProjects();
  localStorage.clear();
  ProjectStorage._deletedIds.clear();
  ProjectStorage._allFullCache = null;
  managerState = { threads: {}, patterns: [] };
  window.openManagerDB = () => Promise.resolve(makeFakeManagerDB(managerState));
  toasts = [];
  window.Toast = { show: t => toasts.push(t) };
  delete window.CrossTabLock;
  SE.triggerAutoExport && (SE.triggerAutoExport = () => {});
});

// ---------------------------------------------------------------------------
// 5.1 — live local projects override tombstones
// ---------------------------------------------------------------------------

describe('5.1a: a live local project overrides its tombstone in classification', () => {
  test('remote update to a live-but-tombstoned project classifies normally and releases the tombstone', async () => {
    const local = makeProject('proj_live', '2026-08-05T00:00:00.000Z');
    await ProjectStorage.save({ ...local }, { preserveUpdatedAt: true });
    // Stale absorbed tombstone: deletion "newer" than the remote edit, which
    // previously guaranteed the skip — but the project is alive here.
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([
      { id: 'proj_live', deletedAt: '2026-08-14T00:00:00.000Z' }
    ]));

    const remote = makeProject('proj_live', '2026-08-10T00:00:00.000Z', { done: [1, 1, 0, 0] });
    const plan = await SE.prepareImport(makeSyncObj([remote]));

    expect(plan.skippedTombstoned.length).toBe(0);
    expect(plan.mergeTracking.length).toBe(1); // same chart, differing updatedAt
    expect(plan.mergeTracking[0].releasedTombstone).toBe(true);

    await SE.executeImport(plan);
    expect(SE.getTombstones().map(t => t.id)).not.toContain('proj_live');
    // The peer's stitches merged in.
    const merged = await ProjectStorage.get('proj_live');
    expect(merged.done[0]).toBe(1);
  });

  test('identical classification also releases the stale tombstone', async () => {
    const local = makeProject('proj_same', '2026-08-10T00:00:00.000Z');
    await ProjectStorage.save({ ...local }, { preserveUpdatedAt: true });
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([
      { id: 'proj_same', deletedAt: '2026-08-14T00:00:00.000Z' }
    ]));

    const plan = await SE.prepareImport(makeSyncObj([makeProject('proj_same', '2026-08-10T00:00:00.000Z')]));
    expect(plan.skippedTombstoned.length).toBe(0);
    expect(plan.identical.length).toBe(1);

    await SE.executeImport(plan);
    expect(SE.getTombstones().map(t => t.id)).not.toContain('proj_same');
  });

  test('tombstones still decline projects that are genuinely absent locally', async () => {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify([
      { id: 'proj_gone', deletedAt: '2026-08-14T00:00:00.000Z' }
    ]));
    const plan = await SE.prepareImport(makeSyncObj([makeProject('proj_gone', '2026-08-10T00:00:00.000Z')]));
    expect(plan.skippedTombstoned.length).toBe(1);
    expect(plan.newRemote.length).toBe(0);
  });
});

describe('5.1b: absorbing peer tombstones never freezes a live local project', () => {
  async function importWithRemoteTombstone(record) {
    const plan = await SE.prepareImport(makeSyncObj([], {
      deletedProjectIds: [record.id],
      deletedProjects: [record]
    }));
    await SE.executeImport(plan);
    return SE.getTombstones().map(t => t.id);
  }

  test('peer deletion OLDER than our local edit is not absorbed', async () => {
    await ProjectStorage.save({ ...makeProject('proj_keep', '2026-08-20T00:00:00.000Z') }, { preserveUpdatedAt: true });
    const ids = await importWithRemoteTombstone({ id: 'proj_keep', deletedAt: '2026-08-10T00:00:00.000Z' });
    expect(ids).not.toContain('proj_keep');
  });

  test('peer deletion NEWER than our local edit still absorbs (peer intent stands)', async () => {
    await ProjectStorage.save({ ...makeProject('proj_stale', '2026-08-10T00:00:00.000Z') }, { preserveUpdatedAt: true });
    const ids = await importWithRemoteTombstone({ id: 'proj_stale', deletedAt: '2026-08-20T00:00:00.000Z' });
    expect(ids).toContain('proj_stale');
  });

  test('timestampless legacy tombstone never outranks a live record', async () => {
    await ProjectStorage.save({ ...makeProject('proj_legacy', '2026-08-10T00:00:00.000Z') }, { preserveUpdatedAt: true });
    const ids = await importWithRemoteTombstone({ id: 'proj_legacy', deletedAt: null });
    expect(ids).not.toContain('proj_legacy');
  });

  test('tombstones for unknown projects absorb as before', async () => {
    const ids = await importWithRemoteTombstone({ id: 'proj_unknown', deletedAt: '2026-08-10T00:00:00.000Z' });
    expect(ids).toContain('proj_unknown');
  });
});

// ---------------------------------------------------------------------------
// 5.2 — stash write: fresh re-merge, kept resolutions, write-lock
// ---------------------------------------------------------------------------

describe('5.2: executeImport stash write', () => {
  function stashSyncObj(threads) {
    return makeSyncObj([], { stash: { threads: threads, patterns: [] } });
  }

  test('changes made between prepare and execute survive the import', async () => {
    managerState.threads = { 'dmc:310': { owned: 1, tobuy: false } };
    const plan = await SE.prepareImport(stashSyncObj({ 'dmc:550': { owned: 2, tobuy: false } }));

    // Another tab buys thread 666 while the review gate is open.
    managerState.threads = {
      'dmc:310': { owned: 1, tobuy: false },
      'dmc:666': { owned: 5, tobuy: false }
    };

    await SE.executeImport(plan);
    // The prepare-time merge knew nothing about 666; a wholesale write of it
    // would have erased the purchase.
    expect(managerState.threads['dmc:666'].owned).toBe(5);
    expect(managerState.threads['dmc:550'].owned).toBe(2); // remote contribution applied
    expect(managerState.threads['dmc:310'].owned).toBe(1);
  });

  test('explicit gate resolutions (owned reductions) are carried into the fresh merge', async () => {
    managerState.threads = { 'dmc:310': { owned: 4, tobuy: false } };
    const plan = await SE.prepareImport(stashSyncObj({ 'dmc:310': { owned: 9, tobuy: false } }));
    // mergeStash's default is max() = 9; simulate the gate resolving the
    // conflict to "keep local" (4) by overriding the planned merge — exactly
    // what analyseConflicts/modals.js do.
    expect(plan.stashMerge.threads['dmc:310'].owned).toBe(9);
    plan.stashMerge.threads['dmc:310'].owned = 4;

    await SE.executeImport(plan);
    // A naive fresh re-merge would resurrect max()=9; the override must win.
    expect(managerState.threads['dmc:310'].owned).toBe(4);
  });

  test('takes and releases the manager_state cross-tab lock when available', async () => {
    const release = jest.fn(async () => true);
    const acquire = jest.fn(async () => ({ ok: true, release }));
    window.CrossTabLock = { acquire };

    const plan = await SE.prepareImport(stashSyncObj({ 'dmc:550': { owned: 1, tobuy: false } }));
    await SE.executeImport(plan);

    expect(acquire).toHaveBeenCalledWith('manager_state', 'sync-import-stash', expect.any(Object));
    expect(release).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5.3 — lastExportAt only after a real export
// ---------------------------------------------------------------------------

describe('5.3: lastExportAt bookkeeping', () => {
  function makeFakeDirHandle(written, opts) {
    opts = opts || {};
    return {
      name: 'SyncFolder',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      async getFileHandle(name) {
        return {
          name,
          async createWritable() {
            return {
              async write(buf) {
                if (opts.failWrite) throw new Error('disk full');
                written[name] = buf;
              },
              async close() {}
            };
          }
        };
      }
    };
  }

  test('building the sync object does not stamp lastExportAt', async () => {
    await SE.exportSync();
    expect(localStorage.getItem(LAST_EXPORT_KEY)).toBe(null);
  });

  test('a successful folder export stamps it', async () => {
    const written = {};
    const result = await SE.exportToFolder(makeFakeDirHandle(written));
    expect(Object.keys(written)).toContain(result.fileName);
    expect(localStorage.getItem(LAST_EXPORT_KEY)).toBe(result.syncObj._createdAt);
  });

  test('a failed folder write leaves it unset', async () => {
    await expect(SE.exportToFolder(makeFakeDirHandle({}, { failWrite: true })))
      .rejects.toThrow('disk full');
    expect(localStorage.getItem(LAST_EXPORT_KEY)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// 5.4 — scanFolder parse cache
// ---------------------------------------------------------------------------

describe('5.4: scanFolder decompresses only changed files', () => {
  function makeFileEntry(name, bytes, lastModified, counters) {
    return {
      kind: 'file',
      name,
      async getFile() {
        return {
          size: bytes.length,
          lastModified,
          async arrayBuffer() {
            counters.reads++;
            return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          }
        };
      }
    };
  }

  function makeDirHandle(entries) {
    return {
      name: 'SyncFolder',
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; },
      values: async function* () { for (const e of entries) yield e; }
    };
  }

  test('second scan of an unchanged file skips decompression; a change re-parses', async () => {
    const bytes = SE.compress(makeSyncObj([makeProject('proj_scan', '2026-08-10T00:00:00.000Z')]));
    const counters = { reads: 0 };
    // Unique name per test run — the cache is module-level.
    const name = 'peer-cache-test.csync';
    const dir = makeDirHandle([makeFileEntry(name, bytes, 1000, counters)]);

    const first = await SE.scanFolder(dir);
    expect(first.length).toBe(1);
    expect(counters.reads).toBe(1);

    const second = await SE.scanFolder(dir);
    expect(second.length).toBe(1);
    expect(second[0].projectCount).toBe(1);
    expect(counters.reads).toBe(1); // cache hit — no second decompress

    // Same name, new mtime → must re-parse.
    const dir2 = makeDirHandle([makeFileEntry(name, bytes, 2000, counters)]);
    const third = await SE.scanFolder(dir2);
    expect(third.length).toBe(1);
    expect(counters.reads).toBe(2);
  });

  test('invalid files are cached too and not re-parsed every tick', async () => {
    const junk = pako.gzip(JSON.stringify({ not: 'a sync file' }));
    const counters = { reads: 0 };
    const dir = makeDirHandle([makeFileEntry('junk-cache-test.csync', junk, 1000, counters)]);

    expect((await SE.scanFolder(dir)).length).toBe(0);
    expect((await SE.scanFolder(dir)).length).toBe(0);
    expect(counters.reads).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5.6 — done serialisation hardening
// ---------------------------------------------------------------------------

describe('5.6: done arrays survive the wire in both directions', () => {
  test('exportSync converts a legacy typed-array done to a plain array', async () => {
    // Fed through stubbed reads rather than fake-indexeddb: this jsdom
    // environment lacks native structuredClone, so the harness's JSON
    // polyfill makes fake-indexeddb degrade Uint8Array to a plain object
    // before export would ever see it. Real browser IDB preserves typed
    // arrays — the stub reproduces that.
    const p = makeProject('proj_typed', '2026-08-10T00:00:00.000Z');
    p.done = new Uint8Array([1, 0, 1, 0]);
    const listSpy = jest.spyOn(ProjectStorage, 'listProjects')
      .mockResolvedValue([{ id: 'proj_typed', updatedAt: p.updatedAt }]);
    const getSpy = jest.spyOn(ProjectStorage, 'get').mockResolvedValue(p);
    try {
      const syncObj = await SE.exportSync();
      const entry = syncObj.projects.find(e => e.id === 'proj_typed');
      expect(Array.isArray(entry.data.done)).toBe(true);
      expect(entry.data.done).toEqual([1, 0, 1, 0]);
      // Round-trips through JSON intact.
      const wire = JSON.parse(JSON.stringify(entry.data));
      expect(wire.done).toEqual([1, 0, 1, 0]);
      // The in-memory project object was not mutated by the export.
      expect(ArrayBuffer.isView(p.done)).toBe(true);
    } finally {
      listSpy.mockRestore();
      getSpy.mockRestore();
    }
  });

  test('prepareImport repairs object-form done from old files', async () => {
    const broken = makeProject('proj_objdone', '2026-08-10T00:00:00.000Z');
    broken.done = { 0: 1, 1: 0, 2: 1, 3: 0 }; // JSON.stringify(Uint8Array) shape
    const plan = await SE.prepareImport(makeSyncObj([broken]));

    expect(plan.newRemote.length).toBe(1);
    expect(Array.isArray(plan.newRemote[0].remote.data.done)).toBe(true);
    expect(plan.newRemote[0].remote.data.done).toEqual([1, 0, 1, 0]);

    // And the import lands with countable progress.
    await SE.executeImport(plan);
    const metas = await ProjectStorage.listProjects();
    const meta = metas.find(m => m.id === 'proj_objdone');
    expect(meta.completedStitches).toBe(2);
  });
});
