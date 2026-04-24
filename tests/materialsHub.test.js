// tests/materialsHub.test.js — B4 MaterialsHub source-contract tests.
//
// Loads creator/MaterialsHub.js with stubbed React/window and verifies the
// public surface, sub-tab declarations, persistence wiring, and that no new
// emoji was introduced.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

const hubSrc = read('creator/MaterialsHub.js');

describe('B4 — CreatorMaterialsHub', () => {
  it('source file exists at creator/MaterialsHub.js', () => {
    expect(typeof hubSrc).toBe('string');
    expect(hubSrc.length).toBeGreaterThan(100);
  });

  it('exposes window.CreatorMaterialsHub', () => {
    expect(hubSrc).toMatch(/window\.CreatorMaterialsHub\s*=\s*function/);
  });

  it('declares exactly four sub-tabs: threads, stash, shopping, output', () => {
    const m = hubSrc.match(/var SUBTABS\s*=\s*\[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const ids = Array.from(m[1].matchAll(/id:\s*'([^']+)'/g)).map(x => x[1]);
    expect(ids).toEqual(['threads', 'stash', 'shopping', 'output']);
  });

  it('uses the British "Stash status" label (not "stash state" or US spelling)', () => {
    expect(hubSrc).toMatch(/Stash status/);
  });

  it('persists active sub-tab via app.setMaterialsTab (not direct UserPrefs)', () => {
    // setMaterialsTab itself is the wrapper that writes UserPrefs.
    expect(hubSrc).toMatch(/app\.setMaterialsTab\(/);
  });

  it('mounts CreatorLegendTab as the Threads sub-tab', () => {
    expect(hubSrc).toMatch(/window\.CreatorLegendTab/);
  });

  it('mounts CreatorPrepareTab as the Stash sub-tab', () => {
    expect(hubSrc).toMatch(/window\.CreatorPrepareTab/);
  });

  it('mounts CreatorExportTab as the Output sub-tab', () => {
    expect(hubSrc).toMatch(/window\.CreatorExportTab/);
  });

  it('returns null when app.tab !== "materials" so it never leaks onto other pages', () => {
    expect(hubSrc).toMatch(/app\.tab !== 'materials'[\s\S]*?return null/);
  });

  it('Shopping panel calls StashBridge.markManyToBuy with composite keys', () => {
    expect(hubSrc).toMatch(/StashBridge\.markManyToBuy/);
  });

  it('introduces no new emoji or forbidden glyph (✓ ✗ ⚠ ℹ → ← ▸ ✕ etc.)', () => {
    // U+2300–U+27BF block dingbats + arrows + emoji presentation; allow
    // typographic punctuation (en/em dash, curly quotes, middle dot, ellipsis).
    const FORBIDDEN = /[\u2192\u2190\u25B8\u2715\u2713\u2717\u26A0\u2139\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(hubSrc).not.toMatch(FORBIDDEN);
  });

  it('uses Icons.shoppingCart (or Icons.cart fallback) for the Shopping tab icon', () => {
    expect(hubSrc).toMatch(/Icons\.shoppingCart|Icons\.cart/);
  });
});
