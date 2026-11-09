/* Sync exports that scale with what changed (sync-engine.js _exportEntry,
   _syncJson, compressAsync). A project unchanged since the last export is not
   read, fingerprinted or serialised again; every change the export promises to
   cover is in the file; the file is the same text JSON.stringify would make. */
const fs = require('fs');
const vm = require('vm');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');
const crypto = require('crypto').webcrypto;
const pako = require('pako');

function device(id) {
  const values = new Map();
  const c = { console, indexedDB: new IDBFactory(), IDBKeyRange, Blob, crypto, pako, TextEncoder, TextDecoder,
    structuredClone, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k),
      key: i => [...values.keys()][i] || null, get length() { return values.size; } },
    ensurePersistence() {}, dispatchEvent() {}, addEventListener() {}, CustomEvent: class {},
    Beads: require('../beads'), ProgressUnits: require('../progress-units') };
  c.window = c; c.globalThis = c;
  vm.createContext(c);
  for (const file of ['tracking-sync.js', 'thread-accounting.js', 'project-storage.js', 'sync-merge-helpers.js', 'sync-attachment-codec.js', 'sync-export-scheduler.js', 'sync-engine.js', 'blob-store.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8') + (file === 'project-storage.js' ? '\nthis.ProjectStorage=ProjectStorage;' : ''), c);
  }
  c.BlobStore._setOpener(() => new Promise((r, j) => { const q = c.indexedDB.open('CrossStitchDB', 5); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); }));
  c.localStorage.setItem('cs_sync_deviceId', id);
  return c;
}
const project = (id, over) => Object.assign({ id, name: id, version: 11, updatedAt: '2026-01-01T00:00:00Z',
  settings: { sW: 3, sH: 2 }, pattern: Array.from({ length: 6 }, () => ({ id: '310', type: 'solid' })), done: [0, 0, 0, 0, 0, 0],
  halfDone: [], partialDone: [], knotsDone: [], bsDone: [], specialtyDone: [], beadsDone: [] }, over);
const json = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(r => setTimeout(r, 3));
// Count project reads (ProjectStorage.get) from here on.
function countGets(c) {
  const orig = c.ProjectStorage.get, ids = [];
  c.ProjectStorage.get = function (id) { ids.push(id); return orig.apply(this, arguments); };
  return { ids, restore() { c.ProjectStorage.get = orig; } };
}
async function library(c, n) {
  for (let i = 0; i < n; i++) await c.ProjectStorage.save(project('proj_' + i));
}

test('a second export reads only the project that changed, and the file is the same as a fresh build', async () => {
  const a = device('A');
  await library(a, 6);
  const first = await a.SyncEngine.exportSync();
  expect(first.projects).toHaveLength(6);
  await tick();
  // A Tracker-style overlay save of one project, then a progress-only write of another.
  const p2 = await a.ProjectStorage.get('proj_2');
  p2.done = [1, 1, 0, 0, 0, 0]; p2.name = 'Changed';
  await a.ProjectStorage.save(p2, { overlay: true });
  const p4 = await a.ProjectStorage.get('proj_4');
  await a.ProjectStorage.saveProgress('proj_4', { done: Uint8Array.from([0, 0, 0, 1, 0, 0]), baseWriteAt: p4.lastWriteAt });
  const gets = countGets(a);
  let second;
  try { second = await a.SyncEngine.exportSync(); } finally { gets.restore(); }
  expect(gets.ids.sort()).toEqual(['proj_2', 'proj_4']);
  const byId = Object.fromEntries(json(second).projects.map(e => [e.id, e]));
  expect(byId.proj_2.data.name).toBe('Changed');
  expect(byId.proj_2.data.done).toEqual([1, 1, 0, 0, 0, 0]);
  expect(byId.proj_4.data.done).toEqual([0, 0, 0, 1, 0, 0]);
  // The compressed file is exactly what serialising the whole object gives.
  const text = new TextDecoder().decode(pako.inflate(a.SyncEngine.compress(second)));
  expect(text).toBe(JSON.stringify(second));
  // And what an export with nothing cached gives.
  const b = device('A2');
  for (const e of json(second).projects) await b.ProjectStorage.save(e.data, { preserveUpdatedAt: true });
  const fresh = json(await b.SyncEngine.exportSync());
  const strip = f => f.projects.map(e => ({ id: e.id, fingerprint: e.fingerprint, name: e.data.name, done: e.data.done })).sort((x, y) => x.id < y.id ? -1 : 1);
  expect(strip(json(second))).toEqual(strip(fresh));
});

test('every write path changes what the next export holds: no stale entry is ever sent', async () => {
  const a = device('A');
  await library(a, 2);
  await a.SyncEngine.exportSync();
  const read = async () => Object.fromEntries(json(await a.SyncEngine.exportSync()).projects.map(e => [e.id, e.data]));
  // Full save.
  await tick(); let p = await a.ProjectStorage.get('proj_0'); p.notes = 'full'; await a.ProjectStorage.save(p);
  expect((await read()).proj_0.notes).toBe('full');
  // Overlay save.
  await tick(); p = await a.ProjectStorage.get('proj_0'); p.notes = 'overlay'; await a.ProjectStorage.save(p, { overlay: true });
  expect((await read()).proj_0.notes).toBe('overlay');
  // Progress record only.
  p = await a.ProjectStorage.get('proj_0');
  await a.ProjectStorage.saveProgress('proj_0', { done: Uint8Array.from([1, 1, 1, 0, 0, 0]), baseWriteAt: p.lastWriteAt });
  expect((await read()).proj_0.done).toEqual([1, 1, 1, 0, 0, 0]);
  // Sync status.
  await a.ProjectStorage.markSynced(['proj_0'], '2026-11-09T00:00:00.000Z');
  expect((await read()).proj_0.syncMeta.lastSyncedAt).toBe('2026-11-09T00:00:00.000Z');
  // A navigation journal recovered on read.
  p = await a.ProjectStorage.get('proj_1');
  a.ProjectStorage.saveProgressRecovery('proj_1', { done: [0, 0, 0, 0, 0, 1], baseWriteAt: p.lastWriteAt });
  await a.ProjectStorage.get('proj_1');
  expect((await read()).proj_1.done).toEqual([0, 0, 0, 0, 0, 1]);
  // Deleted: gone from the file, in the deletion records.
  await a.ProjectStorage.delete('proj_1');
  const after = json(await a.SyncEngine.exportSync());
  expect(after.projects.map(e => e.id)).toEqual(['proj_0']);
  expect(after.deletedProjectIds).toContain('proj_1');
});

test('incremental exports choose changed projects from metadata before reading any', async () => {
  const a = device('A');
  await library(a, 5);
  const first = await a.SyncEngine.exportSync({ mode: 'full' });
  a.localStorage.setItem('cs_sync_lastExportAt', first._createdAt);
  await tick();
  const p = await a.ProjectStorage.get('proj_3'); p.name = 'New name'; await a.ProjectStorage.save(p);
  // Nothing cached here (a fresh page): only proj_3 may be read.
  const b = device('B');
  await library(b, 0);
  const gets = countGets(a);
  let inc;
  try { inc = await a.SyncEngine.exportSync({ mode: 'incremental' }); } finally { gets.restore(); }
  expect(inc.projects.map(e => e.id)).toEqual(['proj_3']);
  expect(gets.ids).toEqual(['proj_3']);
  expect(inc._projectCountTotal).toBe(5);
  void b;
});

test('a change committed while an export reads is not acknowledged by it', async () => {
  const a = device('A');
  await library(a, 1);
  await a.SyncEngine.exportSync();
  // A save lands between the export's metadata read and its project read.
  const list = a.ProjectStorage.listProjects;
  a.ProjectStorage.listProjects = async function () {
    const rows = await list.apply(this, arguments);
    await tick();
    const p = await a.ProjectStorage.get('proj_0'); p.notes = 'during'; await a.ProjectStorage.save(p);
    a.ProjectStorage.listProjects = list;
    return rows;
  };
  const rev0 = Number(a.localStorage.getItem('cs_sync_localChangeRev') || 0);
  const file = await a.SyncEngine.exportSync();
  // Covered revision was read before the reads: the save after it is still unsent.
  expect(file._coversChangeRev).toBe(rev0);
  // The next export carries it (the metadata moved on, so the cache was not used).
  const next = json(await a.SyncEngine.exportSync());
  expect(next.projects[0].data.notes).toBe('during');
});

test('encrypted exports and cached entries: the inner payload is the same text', async () => {
  const a = device('A');
  await library(a, 3);
  await a.SyncEngine.exportSync();
  const second = await a.SyncEngine.exportSync();
  // Cached entries still expose their data (parsed on demand) to anything that asks.
  expect(second.projects[0].data.pattern).toHaveLength(6);
  const inner = {}; ['projects', 'deletedProjectIds'].forEach(k => { inner[k] = second[k]; });
  expect(a.SyncEngine.compress(inner)).toEqual(pako.deflate(new TextEncoder().encode(JSON.stringify(inner))));
});

test('compressAsync falls back to the main thread when no worker can run, with the same bytes', async () => {
  const a = device('A');
  await library(a, 2);
  const file = await a.SyncEngine.exportSync();
  const bytes = await a.SyncEngine.compressAsync(file);      // no Worker in this context
  expect(new TextDecoder().decode(pako.inflate(bytes))).toBe(JSON.stringify(file));
});

test('the compression worker writes a zlib stream the import side reads', async () => {
  const src = fs.readFileSync('sync-compress-worker.js', 'utf8');
  const posted = [];
  const self = { postMessage: (m) => posted.push(m) };
  new Function('self', 'CompressionStream', 'Blob', 'Response', 'TextEncoder', src)(self, globalThis.CompressionStream, Blob, Response, TextEncoder);
  const text = JSON.stringify({ hello: 'world', n: Array.from({ length: 2000 }, (_, i) => i) });
  self.onmessage({ data: { id: 7, json: text } });
  await new Promise(r => setTimeout(r, 50));
  expect(posted[0].id).toBe(7);
  expect(posted[0].ok).toBe(true);
  expect(new TextDecoder().decode(pako.inflate(new Uint8Array(posted[0].bytes)))).toBe(text);
  self.onmessage({ data: { id: 8 } });
  await new Promise(r => setTimeout(r, 10));
  expect(posted[1]).toMatchObject({ id: 8, ok: false });
});

test('a navigation journal written between exports reaches the next one, with no read in between', async () => {
  const a = device('A');
  await library(a, 2);
  const p = await a.ProjectStorage.get('proj_1');
  await a.SyncEngine.exportSync();                           // proj_1 is now cached
  // Another tab closed after journalling its marks, before its IndexedDB writes finished.
  a.localStorage.setItem('crossstitch_progress_recovery:proj_1', JSON.stringify({ projectId: 'proj_1', v: 1, done: [1, 1, 0, 0, 0, 1], baseWriteAt: p.lastWriteAt, updatedAt: Date.now() }));
  const gets = countGets(a);
  let file;
  try { file = json(await a.SyncEngine.exportSync()); } finally { gets.restore(); }
  expect(gets.ids).toEqual(['proj_1']);                      // read through get(), which recovers it
  expect(file.projects.find(e => e.id === 'proj_1').data.done).toEqual([1, 1, 0, 0, 0, 1]);
  // Recovered into the record: later exports are cached again, and still carry it.
  const again = json(await a.SyncEngine.exportSync());
  expect(again.projects.find(e => e.id === 'proj_1').data.done).toEqual([1, 1, 0, 0, 0, 1]);
});

test('an open session checkpoint is exported as get() lists it, before and after it closes', async () => {
  const a = device('A');
  await library(a, 2);
  await a.SyncEngine.exportSync();                           // both cached, no checkpoints
  const cp = { v: 1, projectId: 'proj_0', sessionId: 'sess_live', checkpointAt: Date.now(), revision: 1,
    records: [{ id: 'sess_live', date: '2026-11-09', durationSeconds: 120 }] };
  await a.ProjectStorage.saveSessionCheckpoint('proj_0', cp);
  const fresh = await a.ProjectStorage.get('proj_0');
  expect(fresh.sessionCheckpoints).toHaveLength(1);
  let file = json(await a.SyncEngine.exportSync());
  expect(file.projects.find(e => e.id === 'proj_0').data.sessionCheckpoints).toEqual(json(fresh.sessionCheckpoints));
  await a.ProjectStorage.retireSessionCheckpoint('proj_0', 'sess_live');
  file = json(await a.SyncEngine.exportSync());
  expect(file.projects.find(e => e.id === 'proj_0').data.sessionCheckpoints).toEqual([]);
});
