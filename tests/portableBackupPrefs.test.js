/** @jest-environment node */
const fs = require('fs');
const { IDBFactory } = require('fake-indexeddb');
const prefsSrc = fs.readFileSync('./user-prefs.js', 'utf8');
const backupSrc = fs.readFileSync('./backup-restore.js', 'utf8');
const { MemoryStorage, load: harness } = require('./setup/backup-harness');
global.Storage = MemoryStorage;
global.localStorage = new MemoryStorage();
function load() { return harness(new IDBFactory(), { storage: localStorage }); }
const oldBackup = () => ({ _format: 'cross-stitch-backup', _version: 1, databases: {}, localStorage: {} });
beforeEach(() => { global.localStorage = new MemoryStorage(); });
afterEach(() => jest.useRealTimers());

test('branding, timing, export defaults and valid falsy values survive a compressed or JSON backup into an empty profile', async () => {
  const { prefs, api } = load();
  const selected = { designerName: 'Needle Studio', designerCopyright: '', designerContact: 'hello@example.test',
    designerLogo: 'data:image/png;base64,iVBORw0KGgo=', designerLogoPosition: 'top-left',
    trackerTimingMode: 'manual', trackerActiveGapCapSec: 120, trackerIdleMinutes: 0,
    exportPreset: 'homePrinting', exportPageSize: 'letter', exportMarginsMm: 0, exportChartModeBw: false,
    exportCustomCols: 88, exportCustomRows: 99, 'creator.pdfWorkshopTheme': true,
    a11yHighContrast: true, a11yReducedMotion: false, statsDayEndHour: 0, creatorReferenceOpacity: 0 };
  Object.entries(selected).forEach(([k,v]) => prefs.set(k,v));
  prefs.set('sync.includePrefs', true);
  localStorage.setItem('cs_pview_pattern', '{"scrollTop":999}');
  localStorage.setItem('cs_pref_deprecated', 'true');
  localStorage.setItem('credential', 'secret');
  const backup = await api.createBackup();
  expect(backup.preferences.version).toBe(1);
  expect(Object.keys(backup.preferences.values).sort()).toEqual([...prefs.PORTABLE_KEYS]);
  expect(backup.preferences.values).toMatchObject(selected);
  expect(JSON.stringify(backup)).not.toMatch(/credential|cs_pview_|sync.includePrefs|deprecated/);
  for (const compressed of [false, true]) {
    global.pako = require('pako');
    const parsed = api.parseBackupText(api.serializeBackupFile(backup, { compressed }).text);
    localStorage.clear();
    const dest = load();
    await dest.api.restore(parsed);
    Object.entries(selected).forEach(([k,v]) => expect(dest.prefs.get(k)).toEqual(v));
    expect(dest.prefs.get('sync.includePrefs')).toBe(false);
    expect(dest.prefs.exportPortable()).toEqual(backup.preferences);
    // Reload reads exactly the same values, independent of destination defaults.
    expect(load().prefs.exportPortable()).toEqual(backup.preferences);
  }
  delete global.pako;
});

test('all portable defaults validate, and invalid stored values export as defaults', () => {
  const { prefs } = load();
  const snapshot = prefs.exportPortable();
  prefs.PORTABLE_KEYS.forEach(k => expect(snapshot.values[k]).toEqual(prefs.DEFAULTS[k]));
  localStorage.setItem('cs_pref_designerName', '{broken');
  localStorage.setItem('cs_pref_trackerTimingMode', '"obsolete"');
  localStorage.setItem('cs_pref_exportMarginsMm', '"0"');
  expect(prefs.exportPortable()).toEqual(snapshot);
});

test('malformed, missing, unknown and deprecated values are filtered; destination values cannot mask missing or invalid fields', async () => {
  const { prefs, api } = load();
  prefs.set('designerName', 'destination');
  prefs.set('trackerIdleMinutes', 30);
  const backup = oldBackup();
  backup.preferences = { version: 1, stateSchemaVersion: 1, values: {
    designerName: {}, designerLogo: 'https://example.test/logo.svg', trackerTimingMode: 'oldMode',
    trackerActiveGapCapSec: -1, trackerIdleMinutes: null, exportMarginsMm: '12',
    exportChartModeBw: 0, exportCustomCols: 1.5, a11yHighContrast: [],
    trackerTintColour: 'red', previewFabricBg: true, trackerProjectRailCollapsed: true,
    'sync.includePrefs': true, unknown: 'value', '__proto__': { polluted: true }
  }};
  backup.localStorage.cs_pref_designerName = '"bypass"';
  await api.restore(backup);
  expect(prefs.exportPortable().values).toEqual(Object.fromEntries(prefs.PORTABLE_KEYS.map(k => [k, prefs.DEFAULTS[k]])));
  expect(localStorage.getItem('cs_pref_unknown')).toBeNull();
  expect(localStorage.getItem('cs_pref_previewFabricBg')).toBeNull();
  expect(prefs.get('sync.includePrefs')).toBe(false);
  expect({}.polluted).toBeUndefined();
});

test.each([null, {}, { version: 99, stateSchemaVersion: 1, values: {} }, { version: 1, stateSchemaVersion: 99, values: {} },
  { version: 1, stateSchemaVersion: 1, values: [] }])('unsupported preference sections reject before modifying storage: %p', async preferences => {
  const { prefs, api } = load();
  prefs.set('designerName', 'keep');
  const backup = { ...oldBackup(), preferences };
  expect(api.validate(backup).valid).toBe(false);
  await expect(api.restore(backup)).rejects.toThrow(/preferences/);
  expect(prefs.get('designerName')).toBe('keep');
});

test('old backups still restore; existing globals stay and an empty profile uses defaults', async () => {
  const { prefs, api } = load();
  prefs.set('designerName', 'existing');
  await api.restore(oldBackup());
  expect(prefs.get('designerName')).toBe('existing');
  localStorage.clear();
  await api.restore(oldBackup());
  expect(prefs.get('designerName')).toBe('');
  expect(prefs.get('trackerTimingMode')).toBe('classic');
});

test('device, Sync and per-pattern state are neither exported nor overwritten', async () => {
  const { prefs, api } = load();
  const excluded = Object.keys(prefs.DEFAULTS).filter(k => !prefs.PORTABLE_KEYS.includes(k));
  const before = {};
  excluded.forEach(k => { prefs.set(k, 'destination'); before[k] = prefs.get(k); });
  localStorage.setItem('cs_pview_test', 'destination view');
  const backup = { ...oldBackup(), preferences: prefs.exportPortable() };
  excluded.forEach(k => { backup.preferences.values[k] = 'source'; });
  await api.restore(backup);
  excluded.forEach(k => expect(prefs.get(k)).toEqual(before[k]));
  expect(localStorage.getItem('cs_pview_test')).toBe('destination view');
});

test('pending slider writes are exported and cancelled on restore; immediate edits win over pending edits', () => {
  jest.useFakeTimers();
  const { prefs } = load();
  prefs.setDebounced('exportMarginsMm', 0);
  const backup = prefs.exportPortable();
  expect(backup.values.exportMarginsMm).toBe(0);
  prefs.setDebounced('exportMarginsMm', 44);
  prefs.restorePortable(backup);
  jest.advanceTimersByTime(600);
  expect(prefs.get('exportMarginsMm')).toBe(0);
  prefs.setDebounced('exportMarginsMm', 44);
  prefs.set('exportMarginsMm', 20);
  jest.advanceTimersByTime(600);
  expect(prefs.get('exportMarginsMm')).toBe(20);
});

test('preference write failures reject restore instead of reporting success', async () => {
  const { prefs, api, win } = load();
  const backup = { ...oldBackup(), preferences: { ...prefs.exportPortable(), values: { designerName: 'changed' } } };
  const spy = jest.spyOn(win.RecoveryStorage, 'stageSetting').mockImplementation(() => { throw new Error('quota'); });
  await expect(api.restore(backup)).rejects.toThrow('quota');
  spy.mockRestore();
});

test('future persisted-state schema breaks apply to imported preferences without wiping local excluded settings', () => {
  const win = {};
  const future = prefsSrc.replace('var STATE_SCHEMA_VERSION = 1;', 'var STATE_SCHEMA_VERSION = 2;')
    .replace('var SCHEMA_BREAKS = {', 'var SCHEMA_BREAKS = { 2: { wipe: ["cs_pref_export*", "cs_pref_designerName"] },');
  new Function('window', 'localStorage', future)(win, localStorage);
  const prefs = win.UserPrefs;
  prefs.set('sync.includePrefs', true);
  prefs.restorePortable({ version: 1, stateSchemaVersion: 1, values: { designerName: 'obsolete', exportMarginsMm: 44, trackerTimingMode: 'manual' } });
  expect(prefs.get('designerName')).toBe('');
  expect(prefs.get('exportMarginsMm')).toBe(12);
  expect(prefs.get('trackerTimingMode')).toBe('manual');
  expect(prefs.get('sync.includePrefs')).toBe(true);
  expect(localStorage.getItem('cs_state_schema_version')).toBe('2');
});

test('bug hunt: arbitrary JSON cannot introduce objects, arrays, invalid numbers or unknown keys into portable storage', () => {
  const fc = require('fast-check');
  const { prefs } = load();
  fc.assert(fc.property(fc.jsonValue(), value => {
    const values = Object.fromEntries(prefs.PORTABLE_KEYS.map(k => [k, value]));
    prefs.restorePortable({ version: 1, stateSchemaVersion: 1, values });
    const out = prefs.exportPortable();
    expect(Object.keys(out.values).sort()).toEqual([...prefs.PORTABLE_KEYS]);
    Object.entries(out.values).forEach(([k,v]) => {
      if (k === 'exportNamedPresets') { expect(v).toEqual([]); }
      else expect(v === null || ['boolean', 'number', 'string'].includes(typeof v)).toBe(true);
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      expect(prefs.get(k)).toEqual(v);
    });
  }), { numRuns: 100 });
});

test('the published portable allowlist matches the versioned implementation', () => {
  const { prefs } = load();
  const docs = fs.readFileSync('./docs/portable-backup-preferences.md', 'utf8').split('## Portable allowlist')[1].split('## Exclusions')[0];
  expect([...docs.matchAll(/^- `cs_pref_(.+)`$/gm)].map(m => m[1]).sort()).toEqual([...prefs.PORTABLE_KEYS]);
});
