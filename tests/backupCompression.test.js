// tests/backupCompression.test.js
// Tests for the compressed-backup format helpers added to backup-restore.js.
// Verifies round-trip integrity for the magic-header format, backward
// compatibility with legacy uncompressed JSON files, and the PERF_FLAGS
// kill-switch.

const fs = require('fs');
const pako = require('pako');

const backupSrc = fs.readFileSync('./backup-restore.js', 'utf8');

// Mock the browser globals BackupRestore touches at parse time.
const mockGlobals = `
  var window = { PERF_FLAGS: {}, pako: pako };
  var pako = window.pako;
  var btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  var atob = (s) => Buffer.from(s, 'base64').toString('binary');
  var indexedDB = undefined;
  var localStorage = { getItem: () => null, setItem: () => {} };
  var LOCAL_STORAGE_KEYS = { activeProject: 'a', shortcutsHint: 'b', globalGoals: 'c', globalGoalsCompat: 'd' };
`;

// Wire pako and the mocks then evaluate the IIFE module.
function loadBackupRestore(opts) {
  opts = opts || {};
  return (function () {
    const window = { PERF_FLAGS: opts.flags || {}, pako: pako };
    const localStorage = { getItem: () => null, setItem: () => {} };
    const LOCAL_STORAGE_KEYS = { activeProject: 'a', shortcutsHint: 'b', globalGoals: 'c', globalGoalsCompat: 'd' };
    const btoa = (s) => Buffer.from(s, 'binary').toString('base64');
    const atob = (s) => Buffer.from(s, 'base64').toString('binary');
    // Re-bind the IIFE result into a non-const so the outer scope can reach it.
    const patched = backupSrc.replace('const BackupRestore =', 'BackupRestore =');
    var BackupRestore;
    eval(patched); // eslint-disable-line no-eval
    return BackupRestore;
  })();
}

function makeSampleBackup(extra) {
  return {
    _format: 'cross-stitch-backup',
    _version: 1,
    _createdAt: '2026-01-01T00:00:00.000Z',
    databases: {
      CrossStitchDB: {
        projects: [{ key: 'proj_1', value: { id: 'proj_1', name: 'Test', pattern: [{ id: '310', type: 'solid' }] } }],
        project_meta: [{ key: 'proj_1', value: { id: 'proj_1', name: 'Test' } }],
        stats_summaries: []
      },
      stitch_manager_db: {
        manager_state: [
          { key: 'threads', value: { 'dmc:310': { owned: 1 } } },
          { key: 'patterns', value: [] }
        ]
      }
    },
    localStorage: { ...(extra || {}) }
  };
}

describe('parseBackupText — backward compatibility', () => {
  test('parses legacy uncompressed JSON identically', () => {
    const BR = loadBackupRestore();
    const backup = makeSampleBackup();
    const text = JSON.stringify(backup);
    const parsed = BR.parseBackupText(text);
    expect(parsed).toEqual(backup);
  });

  test('throws on invalid JSON (callers depend on this for the error toast)', () => {
    const BR = loadBackupRestore();
    expect(() => BR.parseBackupText('not json')).toThrow();
  });
});

describe('serializeBackupFile + parseBackupText — round trip with flag ON', () => {
  test('magic header is "CSB1\\n" at offset 0', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: true } });
    const out = BR.serializeBackupFile(makeSampleBackup(), { compressed: true });
    expect(out.text.startsWith('CSB1\n')).toBe(true);
    expect(out.format).toBe('compressed');
    expect(out.extension).toBe('csb');
  });

  test('round-trip preserves nested structure', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: true } });
    const original = makeSampleBackup({ key1: 'value1', emoji: 'colour: \u00e9' });
    const out = BR.serializeBackupFile(original, { compressed: true });
    const restored = BR.parseBackupText(out.text);
    expect(restored).toEqual(original);
  });

  test('round-trip with realistic 40 000-cell pattern matches byte-for-byte', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: true } });
    const big = makeSampleBackup();
    const pat = [];
    for (let i = 0; i < 40000; i++) pat.push({ id: i % 20 === 0 ? '__skip__' : '310', type: 'solid' });
    big.databases.CrossStitchDB.projects[0].value.pattern = pat;
    const out = BR.serializeBackupFile(big, { compressed: true });
    expect(out.text.length).toBeLessThan(JSON.stringify(big).length); // we actually compressed
    const restored = BR.parseBackupText(out.text);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(big));
  });

  test('mid-file "CSB1\\n" substring is not treated as a compressed file', () => {
    const BR = loadBackupRestore();
    // A valid JSON that happens to contain CSB1\n as a value.
    const json = JSON.stringify({ note: 'CSB1\nin the middle', _format: 'cross-stitch-backup', _version: 1 });
    const parsed = BR.parseBackupText(json);
    expect(parsed.note).toBe('CSB1\nin the middle');
  });

  test('truncated compressed body throws (caught by existing handler)', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: true } });
    const out = BR.serializeBackupFile(makeSampleBackup(), { compressed: true });
    const truncated = out.text.slice(0, out.text.length - 50);
    expect(() => BR.parseBackupText(truncated)).toThrow();
  });

  test('non-base64 garbage after the magic header throws', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: true } });
    expect(() => BR.parseBackupText('CSB1\nthis is not base64 at all !!!@@@'))
      .toThrow();
  });
});

describe('serializeBackupFile — flag OFF (legacy fallback)', () => {
  test('emits uncompressed JSON byte-for-byte', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: false } });
    const backup = makeSampleBackup();
    const out = BR.serializeBackupFile(backup);
    expect(out.format).toBe('json');
    expect(out.extension).toBe('json');
    expect(out.text).toBe(JSON.stringify(backup));
  });

  test('flag-OFF output round-trips through parseBackupText', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: false } });
    const backup = makeSampleBackup();
    const out = BR.serializeBackupFile(backup);
    expect(BR.parseBackupText(out.text)).toEqual(backup);
  });

  test('explicit opts.compressed=false beats flag=true', () => {
    const BR = loadBackupRestore({ flags: { compressedBackups: true } });
    const out = BR.serializeBackupFile(makeSampleBackup(), { compressed: false });
    expect(out.format).toBe('json');
  });
});
