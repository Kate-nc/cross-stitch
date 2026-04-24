// tests/useCreatorStateMaterialsTabReset.test.js — fix-3.8
// Source-contract: useCreatorState.js installs an effect that resets the
// MaterialsHub sub-tab to 'threads' when the active project id changes.

const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

describe('fix-3.8 — MaterialsHub sub-tab resets on project change', () => {
  it('declares prevMaterialsProjectIdRef alongside projectIdRef', () => {
    expect(src).toMatch(/prevMaterialsProjectIdRef\s*=\s*useRef\(null\)/);
  });

  it('compares projectIdRef.current against the previous id and resets', () => {
    // Be permissive about whitespace; just look for the key tokens together.
    expect(src).toMatch(/prevMaterialsProjectIdRef\.current/);
    expect(src).toMatch(/setMaterialsTabRaw\(['"]threads['"]\)/);
  });

  it('uses the raw setter (no UserPrefs persistence) for the reset', () => {
    // Confirm the reset block does NOT call UserPrefs.set — the raw setter
    // skips the per-key persistence on purpose.
    const block = src.match(/prevMaterialsProjectIdRef\.current\s*=\s*pid;\s*setMaterialsTabRaw[\s\S]{0,80}/);
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/UserPrefs\.set/);
  });
});
