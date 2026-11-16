// tests/backupSizeLimit.test.js
// The backup size limit applies to the unpacked backup, which is many times
// the size of the compressed file. It used to be 64 MiB, which a few large
// charts well under way could pass while the file stayed small; it is now
// BACKUP_MAX_BYTES (constants.js, 256 MiB). A backup over the limit is not
// made (so every downloaded backup restores), and the error names what is
// taking the space. Tests set a small limit through window.BACKUP_MAX_BYTES.

const fs = require('fs');
const pako = require('pako');
const { IDBFactory } = require('fake-indexeddb');
const { load } = require('./setup/backup-harness');

const MiB = 1024 * 1024;

function compressed(obj) {
  const bytes = pako.deflate(JSON.stringify(obj));
  return 'CSB1\n' + Buffer.from(bytes).toString('base64');
}

async function seedProjects(idb, projects) {
  const db = await new Promise((resolve, reject) => {
    const req = idb.open('CrossStitchDB');
    req.onupgradeneeded = (e) => {
      ['projects', 'project_meta', 'stats_summaries', 'sync_snapshots', 'pendingImports'].forEach(s => e.target.result.createObjectStore(s));
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    projects.forEach(p => tx.objectStore('projects').put(p, p.id));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// A chart of `cells` stitches whose JSON is about 50 bytes a stitch.
function project(id, name, cells) {
  return { id, name, settings: { sW: cells, sH: 1 }, pattern: Array.from({ length: cells }, (_, i) => ({ id: String(300 + (i % 40)), type: 'solid', rgb: [i % 255, 100, 200] })) };
}

describe('backup size limit', () => {
  test('constants.js sets the limit to 256 MiB and the pages read it', () => {
    const consts = fs.readFileSync('./constants.js', 'utf8');
    expect(consts).toMatch(/const BACKUP_MAX_BYTES=256\*1024\*1024;/);
    expect(consts).toMatch(/window\.BACKUP_MAX_BYTES=BACKUP_MAX_BYTES/);
    for (const page of ['./header.js', './manager-app.js']) {
      const src = fs.readFileSync(page, 'utf8');
      expect(src).toMatch(/window\.BACKUP_MAX_BYTES/);
      expect(src).not.toMatch(/64 \* 1024 \* 1024/);
    }
  });

  test('defaults to 256 MiB when the page constant is absent', () => {
    expect(load().api.maxFileBytes).toBe(256 * MiB);
  });

  test('a backup under the limit unpacked is read, however small its file', () => {
    const api = load(undefined, { BACKUP_MAX_BYTES: MiB }).api;
    const backup = { _format: 'cross-stitch-backup', _version: 1, databases: {}, filler: 'x'.repeat(Math.floor(0.9 * MiB)) };
    const text = compressed(backup);
    expect(text.length).toBeLessThan(MiB / 50);
    expect(api.parseBackupText(text).filler.length).toBe(Math.floor(0.9 * MiB));
  });

  test('a backup that unpacks past the limit is refused with the limit in MB', () => {
    const api = load(undefined, { BACKUP_MAX_BYTES: MiB }).api;
    const text = compressed({ _format: 'cross-stitch-backup', filler: 'x'.repeat(Math.floor(1.1 * MiB)) });
    expect(() => api.parseBackupText(text)).toThrow(/unpacks to more than 1 MB, the most that can be restored safely/);
  });

  test('createBackup refuses a backup over the limit and names the largest projects', async () => {
    const idb = new IDBFactory();
    await seedProjects(idb, [project('proj_big', 'Rose garden', 30000), project('proj_small', 'Bookmark', 200)]);
    const api = load(idb, { BACKUP_MAX_BYTES: MiB }).api;
    let err;
    try { await api.createBackup(); } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect(err.message).toMatch(/^This backup would be [\d.]+ MB, over the 1 MB that can be restored safely\./);
    expect(err.message).toMatch(/Largest: "Rose garden" [\d.]+ MB\./);
    expect(err.message).not.toMatch(/Bookmark/); // under 1 MB: not worth naming
    expect(err.message).toMatch(/Delete progress photos or projects you no longer need/);
    expect(err.sizeReport.items[0]).toMatchObject({ id: 'proj_big', name: 'Rose garden' });
  });

  test('createBackup under the limit still succeeds', async () => {
    const idb = new IDBFactory();
    await seedProjects(idb, [project('proj_small', 'Bookmark', 200)]);
    const backup = await load(idb, { BACKUP_MAX_BYTES: MiB }).api.createBackup();
    expect(backup.databases.CrossStitchDB.projects.map(e => e.key)).toEqual(['proj_small']);
  });

  test('describeSize attributes photos to their project and sorts largest first', () => {
    const api = load().api;
    const photo = 'A'.repeat(3 * MiB);
    const backup = {
      databases: {
        CrossStitchDB: { projects: [
          { key: 'proj_a', value: { id: 'proj_a', name: 'Small chart', pattern: [] } },
          { key: 'proj_b', value: { id: 'proj_b', name: '', pattern: [] } },
          { key: 'auto_save', value: { id: 'proj_a', name: 'Small chart', pattern: [] } }
        ] },
        stitch_manager_db: { manager_state: [] }
      },
      attachments: [{ id: 'photo:proj_b:1', projectId: 'proj_b', data: photo }]
    };
    const report = api.describeSize(backup);
    expect(report.limit).toBe(256 * MiB);
    expect(report.items[0]).toMatchObject({ id: 'proj_b', name: 'Untitled project' });
    expect(report.items[0].attachmentBytes).toBeGreaterThanOrEqual(3 * MiB);
    // The legacy auto_save copy counts towards the project it copies.
    const a = report.items.find(it => it.id === 'proj_a');
    expect(a.bytes).toBe(2 * JSON.stringify(backup.databases.CrossStitchDB.projects[0].value).length);
    expect(report.items.some(it => it.id === 'stash')).toBe(true);
    expect(api.warnBytes).toBe(128 * MiB);
  });
});
