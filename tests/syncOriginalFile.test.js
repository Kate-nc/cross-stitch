// An imported chart keeps the file it came from in project.meta.attachments.originalFile, with `bytes` a
// Uint8Array. JSON writes a Uint8Array as an object keyed by index, so a 6.8 MB PDF became a 92 MB
// {"0":120,"1":156,...} in every sync export. With automatic sync on, the Tracker ran that export every ~30 s while
// stitching, at close to a gigabyte of memory each time, and the tab ran out of memory. A device that imported the
// file stored the 6.8-million-key object and copied it on every save.

const fs = require('fs');
const pako = require('pako');

global.window = global.window || {};
global.localStorage = (() => {
  const store = {};
  return {
    getItem(k) { return store[k] !== undefined ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    clear() { Object.keys(store).forEach(k => delete store[k]); }
  };
})();
global.pako = pako;
global.indexedDB = new (require('fake-indexeddb').IDBFactory)();

const H = require('../sync-merge-helpers.js');

const FILE_BYTES = 200000;
function originalFile() {
  const bytes = new Uint8Array(FILE_BYTES);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31) & 255;
  return { name: 'chart.pdf', type: 'application/pdf', encoding: 'pako-deflate', bytes };
}
function mkProject(id) {
  const pattern = [];
  for (let i = 0; i < 400; i++) pattern.push({ id: String(310 + (i % 4)) });
  return {
    id, name: id, updatedAt: '2026-11-16T10:00:00.000Z',
    settings: { sW: 20, sH: 20 }, pattern, done: new Array(400).fill(0),
    meta: { source: 'pdf', attachments: { originalFile: originalFile() } }
  };
}

const PROJECTS = [mkProject('proj_1')];
global.ProjectStorage = {
  listProjects: async () => PROJECTS.map(p => ({ id: p.id, updatedAt: p.updatedAt })),
  get: async id => PROJECTS.find(p => p.id === id) || null,
  save: async p => p.id
};

eval(fs.readFileSync('./sync-engine.js', 'utf8'));
const SE = global.SyncEngine || global.window.SyncEngine;

const _origWarn = console.warn;
beforeAll(() => {
  console.warn = function () {
    if (String(arguments[0] || '').indexOf('SyncEngine:') === 0) return;
    _origWarn.apply(console, arguments);
  };
});
afterAll(() => { console.warn = _origWarn; });
beforeEach(() => localStorage.clear());

describe('sync exports leave the imported original file out', () => {
  test('the exported project has no original file and keeps the rest of meta', async () => {
    const syncObj = await SE.exportSync();
    const data = syncObj.projects[0].data;
    expect(data.meta).toEqual({ source: 'pdf' });
  });

  test('the project on this device keeps its file', async () => {
    await SE.exportSync();
    expect(PROJECTS[0].meta.attachments.originalFile.bytes).toBeInstanceOf(Uint8Array);
    expect(PROJECTS[0].meta.attachments.originalFile.bytes.length).toBe(FILE_BYTES);
  });

  test('the export is not inflated by the file', async () => {
    const syncObj = await SE.exportSync();
    const compressed = await SE.compressAsync(syncObj);
    // As an index-keyed object the 200 KB file alone was ~2.6 MB of JSON.
    expect(JSON.stringify(syncObj.projects).length).toBeLessThan(FILE_BYTES);
    expect(compressed.length).toBeLessThan(FILE_BYTES / 4);
  });
});

describe('withoutOriginalFile', () => {
  test('returns the same project when there is no file', () => {
    const p = { id: 'a', meta: { source: 'pdf' } };
    expect(H.withoutOriginalFile(p)).toBe(p);
    const q = { id: 'b' };
    expect(H.withoutOriginalFile(q)).toBe(q);
  });

  test('drops empty attachments and meta, without touching the input', () => {
    const p = { id: 'a', meta: { attachments: { originalFile: originalFile() } } };
    const out = H.withoutOriginalFile(p);
    expect(out).toEqual({ id: 'a' });
    expect(p.meta.attachments.originalFile.bytes.length).toBe(FILE_BYTES);
  });

  test('keeps other attachments', () => {
    const p = { meta: { attachments: { originalFile: originalFile(), other: { x: 1 } } } };
    expect(H.withoutOriginalFile(p).meta).toEqual({ attachments: { other: { x: 1 } } });
  });
});

describe('repairOriginalFile', () => {
  const fileOf = p => p.meta.attachments.originalFile;

  test('turns the index-keyed object older sync files carried back into bytes, in a copy', () => {
    const file = originalFile();
    const p = JSON.parse(JSON.stringify({ id: 'a', meta: { source: 'pdf', attachments: { originalFile: file } } }));
    const damaged = fileOf(p).bytes;
    const out = H.repairOriginalFile(p);
    expect(out).not.toBe(p);
    expect(fileOf(out).bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(fileOf(out).bytes)).toEqual(Array.from(file.bytes));
    expect(fileOf(out).name).toBe('chart.pdf');
    expect(out.meta.source).toBe('pdf');
    expect(out.id).toBe('a');
    // The input is untouched: storage may share its meta with the record it compares saves against.
    expect(fileOf(p).bytes).toBe(damaged);
    expect(out.meta).not.toBe(p.meta);
  });

  test('turns a plain array (a backup) into bytes', () => {
    const p = { meta: { attachments: { originalFile: { name: 'a', bytes: [1, 2, 255] } } } };
    expect(fileOf(H.repairOriginalFile(p)).bytes).toEqual(new Uint8Array([1, 2, 255]));
  });

  test('returns the project itself when there is nothing to repair', () => {
    const p = { meta: { attachments: { originalFile: originalFile() } } };
    expect(H.repairOriginalFile(p)).toBe(p);
    const q = {};
    expect(H.repairOriginalFile(q)).toBe(q);
    expect(H.repairOriginalFile(null)).toBe(null);
  });

  test('leaves other binary alone instead of emptying it', () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const a = { meta: { attachments: { originalFile: { bytes: buffer } } } };
    expect(H.repairOriginalFile(a)).toBe(a);
    expect(fileOf(a).bytes).toBe(buffer);
    const b = { meta: { attachments: { originalFile: { bytes: new Uint16Array([1]) } } } };
    expect(H.repairOriginalFile(b)).toBe(b);
    if (typeof Blob === 'function') {
      const c = { meta: { attachments: { originalFile: { bytes: new Blob(['x']) } } } };
      expect(H.repairOriginalFile(c)).toBe(c);
    }
    const d = { meta: { attachments: { originalFile: { name: 'no bytes' } } } };
    expect(H.repairOriginalFile(d)).toBe(d);
  });

  test('drops content that cannot be the file', () => {
    const p = { meta: { attachments: { originalFile: { bytes: { 0: 1, 1: 'x' } } } } };
    const out = H.repairOriginalFile(p);
    expect(out.meta).toEqual({});
    expect(fileOf(p).bytes).toEqual({ 0: 1, 1: 'x' });
    const q = { meta: { attachments: { originalFile: { bytes: [1, 300] }, other: 1 } } };
    expect(H.repairOriginalFile(q).meta).toEqual({ attachments: { other: 1 } });
  });
});

describe('importing a sync file from an older build', () => {
  test('drops the index-keyed original file before the project is compared or saved', async () => {
    const syncObj = await SE.exportSync();
    const entry = syncObj.projects[0];
    // What an older build wrote: the file's bytes as an object keyed by index.
    entry.data = Object.assign({}, entry.data, { meta: JSON.parse(JSON.stringify(PROJECTS[0].meta)) });
    expect(Object.keys(entry.data.meta.attachments.originalFile.bytes).length).toBe(FILE_BYTES);
    await SE.prepareImport(syncObj);
    expect(syncObj.projects[0].data.meta).toEqual({ source: 'pdf' });
    // The local project keeps its own file.
    expect(PROJECTS[0].meta.attachments.originalFile.bytes).toBeInstanceOf(Uint8Array);
  });
});

describe('keepLocalOriginalFile', () => {
  test('a replacing copy without the file keeps the local one', () => {
    const local = mkProject('proj_9');
    const incoming = { id: 'proj_9', name: 'new', meta: { source: 'pdf' } };
    const out = H.keepLocalOriginalFile(incoming, local);
    expect(out.meta.attachments.originalFile).toBe(local.meta.attachments.originalFile);
    expect(out.meta.source).toBe('pdf');
    expect(out.name).toBe('new');
    expect(incoming.meta.attachments).toBeUndefined();
  });

  test('an incoming file, or no local one, is left as it is', () => {
    const local = mkProject('proj_9');
    const incoming = mkProject('proj_9');
    expect(H.keepLocalOriginalFile(incoming, local)).toBe(incoming);
    const bare = { id: 'proj_9' };
    expect(H.keepLocalOriginalFile(bare, { id: 'proj_9' })).toBe(bare);
    expect(H.keepLocalOriginalFile(bare, null)).toBe(bare);
  });
});
