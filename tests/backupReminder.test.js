// "Last backed up" line and the backup reminder (tracking audit TRACK-03, recommendation 3).
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const HELPERS = read('helpers.js');
const DAY = 86400000;

function load(store = {}, session = {}) {
  const shown = [];
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const ss = { getItem: k => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); } };
  const win = { Toast: { show: o => shown.push(o) }, BackupRestore: { downloadBackup: jest.fn(() => Promise.resolve()) } };
  const start = HELPERS.indexOf('// ── Backup reminder');
  const end = HELPERS.indexOf('var _helpersCachedDB = null;');
  const src = HELPERS.slice(start, end);
  new Function('window', 'localStorage', 'sessionStorage', src + '; window.__BR = BackupReminder;')(win, ls, ss);
  return { api: win.__BR, shown, store, session, win };
}

describe('due()', () => {
  const { api } = load();
  const now = 100 * DAY;
  test('not due before 14 days, due at 14', () => {
    expect(api.due(now, now - 13 * DAY, 0, 0)).toBe(false);
    expect(api.due(now, now - 14 * DAY, 0, 0)).toBe(true);
  });
  test('never backed up: counted from when marking started', () => {
    expect(api.due(now, 0, now - 3 * DAY, 0)).toBe(false);
    expect(api.due(now, 0, now - 15 * DAY, 0)).toBe(true);
    expect(api.due(now, 0, 0, 0)).toBe(false);
  });
  test('a snooze holds it back until it ends', () => {
    expect(api.due(now, now - 30 * DAY, 0, now + DAY)).toBe(false);
    expect(api.due(now, now - 30 * DAY, 0, now - 1)).toBe(true);
  });
});

describe('label()', () => {
  test('never, today, yesterday, N days', () => {
    const noon = new Date(2026, 9, 11, 12).getTime();
    expect(load({}).api.label(noon)).toBe('Not backed up yet');
    expect(load({ cs_last_backup_at: String(noon - 3600000) }).api.label(noon)).toBe('Last backed up today');
    expect(load({ cs_last_backup_at: String(noon - DAY) }).api.label(noon)).toBe('Last backed up yesterday');
    expect(load({ cs_last_backup_at: String(noon - 5 * DAY) }).api.label(noon)).toBe('Last backed up 5 days ago');
  });
});

describe('maybeRemind()', () => {
  test('a first run only starts the clock and shows nothing', () => {
    const t = load({});
    t.api.maybeRemind();
    expect(t.shown).toEqual([]);
    expect(Number(t.store.cs_backup_clock_start)).toBeGreaterThan(0);
  });
  test('after 14 days it offers a backup, once per session, with two actions', () => {
    const t = load({ cs_last_backup_at: String(Date.now() - 20 * DAY) });
    t.api.maybeRemind(); t.api.maybeRemind();
    expect(t.shown.length).toBe(1);
    expect(t.shown[0].actions.map(a => a.label)).toEqual(['Back up now', 'Not now']);
  });
  test('Not now snoozes for a week; Back up now starts a backup', () => {
    const t = load({ cs_last_backup_at: String(Date.now() - 20 * DAY) });
    t.api.maybeRemind();
    t.shown[0].actions[1].onClick();
    expect(Number(t.store.cs_backup_snooze_until)).toBeGreaterThan(Date.now() + 6 * DAY);
    const t2 = load(t.store);
    t2.api.maybeRemind();
    expect(t2.shown).toEqual([]);
    t.shown[0].actions[0].onClick();
    expect(t.win.BackupRestore.downloadBackup).toHaveBeenCalled();
  });
  test('a recent backup shows nothing', () => {
    const t = load({ cs_last_backup_at: String(Date.now() - 2 * DAY) });
    t.api.maybeRemind();
    expect(t.shown).toEqual([]);
  });
});

describe('wiring', () => {
  test('a downloaded backup records its time', () => {
    expect(read('backup-restore.js')).toMatch(/localStorage\.setItem\("cs_last_backup_at", String\(Date\.now\(\)\)\)/);
  });
  test('the File menu shows the line under Export Backup', () => {
    expect(read('header.js')).toMatch(/' Export Backup'\),\s*window\.BackupReminder && React\.createElement\('div'/);
  });
  test('the Tracker offers the reminder once there are marks, only while active', () => {
    expect(read('tracker-app.js')).toMatch(/if\(!_hasMarks\|\|!isActive\)return;[\s\S]{0,200}BackupReminder\.maybeRemind\(\)/);
  });
});
