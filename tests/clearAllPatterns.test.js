/**
 * @jest-environment jsdom
 *
 * Settings ▸ Start over ▸ "Delete all patterns".
 *
 * The button used to run a bare indexedDB.deleteDatabase("CrossStitchDB"),
 * which deleted the records but skipped every safeguard a per-pattern delete
 * has — so the patterns came back (sync re-import, in-flight autosave) or
 * simply never left the screen (no refresh event). These tests pin the
 * behaviour of the bulk path it now uses.
 */
const fs = require('fs');
const path = require('path');
const { IDBFactory } = require('fake-indexeddb');

global.indexedDB = new IDBFactory();
global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange');
window.indexedDB = global.indexedDB;
// project-storage.js expects these from helpers.js / the browser.
global.ensurePersistence = () => {};
global.structuredClone = global.structuredClone || (v => JSON.parse(JSON.stringify(v)));

const STORAGE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'project-storage.js'), 'utf8');
const PREFS_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'preferences-modal.js'), 'utf8');
const BRIDGE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');

eval(STORAGE_SRC);
window.ProjectStorage = ProjectStorage;

const TOMBSTONE_KEY = 'cs_deleted_project_ids';

async function seed(names) {
  const ids = [];
  for (const name of names) {
    ids.push(await ProjectStorage.save({
      name, width: 2, height: 2,
      pattern: [{ id: '310' }, { id: '310' }, { id: '310' }, { id: '310' }],
      settings: { sW: 2, sH: 2 }
    }));
  }
  return ids;
}

async function reset() {
  await ProjectStorage.clearAllProjects();
  localStorage.clear();
  ProjectStorage._deletedIds.clear();
}

describe('ProjectStorage.clearAllProjects({ tombstone: true })', () => {
  beforeEach(reset);

  test('removes every project record', async () => {
    await seed(['Alpha', 'Beta']);
    expect((await ProjectStorage.listProjects()).length).toBe(2);

    const removed = await ProjectStorage.clearAllProjects({ tombstone: true });

    expect(removed).toBe(2);
    expect(await ProjectStorage.listProjects()).toEqual([]);
  });

  test('tombstones every id so a connected sync folder cannot re-import them', async () => {
    const ids = await seed(['Alpha', 'Beta']);

    await ProjectStorage.clearAllProjects({ tombstone: true });

    const tombstones = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '[]');
    expect(tombstones.map(t => t.id).sort()).toEqual([...ids].sort());
    // Timestamped records, not bare strings — SyncEngine needs deletedAt to
    // tell a stale deletion from a live one.
    for (const t of tombstones) expect(typeof t.deletedAt).toBe('string');
  });

  test('an autosave already in flight cannot resurrect a wiped pattern', async () => {
    const ids = await seed(['Alpha']);

    await ProjectStorage.clearAllProjects({ tombstone: true });
    expect(ProjectStorage.isDeleted(ids[0])).toBe(true);
    await ProjectStorage.save({ id: ids[0], name: 'Alpha', pattern: [], settings: {} });

    expect(await ProjectStorage.listProjects()).toEqual([]);
  });

  test('fires cs:projectsChanged so open UIs stop listing the patterns', async () => {
    await seed(['Alpha', 'Beta']);
    const seen = [];
    const onChange = e => seen.push(e.detail);
    window.addEventListener('cs:projectsChanged', onChange);

    await ProjectStorage.clearAllProjects({ tombstone: true });
    window.removeEventListener('cs:projectsChanged', onChange);

    expect(seen).toContainEqual({ reason: 'clearAll', count: 2 });
  });

  test('clears the active-project pointer', async () => {
    const ids = await seed(['Alpha']);
    ProjectStorage.setActiveProject(ids[0]);

    await ProjectStorage.clearAllProjects({ tombstone: true });

    expect(ProjectStorage.getActiveProjectId()).toBeFalsy();
  });
});

describe('ProjectStorage.clearAllProjects() — resync rebuild path is unchanged', () => {
  beforeEach(reset);

  test('writes no tombstones and releases the session-delete guard', async () => {
    const ids = await seed(['Alpha']);
    ProjectStorage._deletedIds.add('proj_deleted_earlier');

    await ProjectStorage.clearAllProjects();

    expect(localStorage.getItem(TOMBSTONE_KEY)).toBeNull();
    expect(ProjectStorage.isDeleted(ids[0])).toBe(false);
    expect(ProjectStorage.isDeleted('proj_deleted_earlier')).toBe(false);
  });

  test('a re-imported project saves normally afterwards', async () => {
    const ids = await seed(['Alpha']);

    await ProjectStorage.clearAllProjects();
    await ProjectStorage.save({ id: ids[0], name: 'Alpha', pattern: [], settings: {} });

    expect((await ProjectStorage.listProjects()).length).toBe(1);
  });
});

describe('Settings ▸ Start over wiring', () => {
  test('clearProjects() goes through ProjectStorage, not a raw deleteDatabase', () => {
    const body = PREFS_SRC.match(/function clearProjects\(\)[\s\S]*?\n    \}/)[0];
    expect(body).toContain('ProjectStorage.clearAllProjects({ tombstone: true })');
    // The fallback for a page without ProjectStorage is allowed, but the
    // primary path must not be a bare database drop.
    expect(body).not.toMatch(/indexedDB\.deleteDatabase\(/);
  });

  test('deleteDatabase callers handle `blocked`, which fires instead of error', () => {
    const body = PREFS_SRC.match(/function deleteWholeDatabase\([\s\S]*?\n    \}/)[0];
    expect(body).toMatch(/req\.onblocked\s*=/);
    expect(body).toMatch(/req\.onerror\s*=/);
    expect(body).toMatch(/req\.onsuccess\s*=/);
  });

  test('clearStash() refreshes the stash and pattern-library views', () => {
    const body = PREFS_SRC.match(/function clearStash\(\)[\s\S]*?\n    \}/)[0];
    expect(body).toContain('cs:stashChanged');
    expect(body).toContain('cs:patternsChanged');
  });

  test('StashBridge exposes the bulk unlink the wipe uses', () => {
    expect(BRIDGE_SRC).toMatch(/async unlinkProjectsFromLibrary\(projectIds\)/);
    expect(STORAGE_SRC).toContain('StashBridge.unlinkProjectsFromLibrary');
  });
});
