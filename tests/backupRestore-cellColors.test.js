/* tests/backupRestore-cellColors.test.js
 * Phase 2 §5 — cellColors round-trips through the backup format losslessly.
 *
 * Strategy: extract the encode/decode helpers from backup-restore.js via
 * regex+eval (no module system; window globals only).  Stub `pako` with
 * the real npm package which exposes deflate/inflate identical to the
 * browser global.
 */

const fs = require('fs');
const path = require('path');
const pako = require('pako');

// Provide the browser-only globals the file expects.
global.window = global.window || {};
global.window.PERF_FLAGS = {};
global.pako = pako;
global.btoa = global.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
global.atob = global.atob || ((s) => Buffer.from(s, 'base64').toString('binary'));
global.LOCAL_STORAGE_KEYS = global.LOCAL_STORAGE_KEYS || {
  activeProject: 'crossstitch_active_project',
  shortcutsHint: 'crossstitch_shortcuts_hint',
  globalGoals: 'crossstitch_global_goals',
  globalGoalsCompat: 'crossstitch_global_goals_compat',
};

const src = fs.readFileSync(path.resolve(__dirname, '..', 'backup-restore.js'), 'utf8');

// Pull the four helpers out via a controlled scope. We capture them by
// assigning to a module-scoped object after the IIFE returns.
function loadHelpers() {
  // Replace `const BackupRestore = (() => { ... })();` so we capture the
  // returned API instead of the original assignment side-effects (which
  // expect a real DOM).
  const captured = {};
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'window', 'pako', 'btoa', 'atob', 'LOCAL_STORAGE_KEYS', 'captured',
    src
      .replace(/^const\s+BackupRestore\s*=\s*/m, 'captured.api = ')
      // Strip the top-level `if (typeof window…)` block — already provided.
      .replace(/^if \(typeof window[\s\S]*?\n\}/m, '')
  );
  factory(global.window, pako, global.btoa, global.atob, global.LOCAL_STORAGE_KEYS, captured);
  return captured.api;
}

describe('BackupRestore cellColors round-trip', () => {
  const api = loadHelpers();

  test('exports the encode/decode helpers', () => {
    expect(typeof api.encodeCellColorsForExport).toBe('function');
    expect(typeof api.decodeCellColorsFromImport).toBe('function');
  });

  test('leaves projects without cellColors untouched', () => {
    const proj = { v: 8, w: 2, h: 1, name: 'X' };
    const out = api.encodeCellColorsForExport(proj);
    expect(out).toBe(proj);
  });

  test('encodes a Uint8Array into pako-deflate-b64 tagged shape', () => {
    const cellColors = new Uint8Array([10, 20, 30, 40, 50, 60]);
    const proj = { v: 8, w: 2, h: 1, cellColors };
    const out = api.encodeCellColorsForExport(proj);
    expect(out.cellColors).toBeUndefined();
    expect(out.cellColors_enc).toBe('pako-deflate-b64');
    expect(out.cellColors_len).toBe(6);
    expect(typeof out.cellColors_b64).toBe('string');
    expect(out.cellColors_b64.length).toBeGreaterThan(0);
  });

  test('round-trips a Uint8Array byte-for-byte', () => {
    // Use a varied 12 000-byte payload so the deflate path actually compresses.
    const cellColors = new Uint8Array(12000);
    for (let i = 0; i < cellColors.length; i++) cellColors[i] = (i * 37 + 11) & 0xff;
    const proj = { v: 8, w: 80, h: 50, cellColors, name: 'Round-trip' };

    const exported = api.encodeCellColorsForExport(proj);
    // Simulate JSON serialisation + parse (the actual file path)
    const json = JSON.stringify(exported);
    const reparsed = JSON.parse(json);
    const restored = api.decodeCellColorsFromImport(reparsed);

    expect(restored.cellColors).toBeInstanceOf(Uint8Array);
    expect(restored.cellColors.length).toBe(cellColors.length);
    // Byte-exact comparison
    let identical = true;
    for (let i = 0; i < cellColors.length; i++) {
      if (restored.cellColors[i] !== cellColors[i]) { identical = false; break; }
    }
    expect(identical).toBe(true);
    expect(restored.cellColors_enc).toBeUndefined();
    expect(restored.cellColors_b64).toBeUndefined();
    expect(restored.name).toBe('Round-trip');
  });

  test('decode is a no-op on already-decoded projects', () => {
    const proj = { v: 8, w: 1, h: 1, cellColors: new Uint8Array([1, 2, 3]) };
    const out = api.decodeCellColorsFromImport(proj);
    expect(out).toBe(proj);
  });
});
