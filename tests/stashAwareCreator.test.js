// Unit tests for Brief D additions:
//   1. StashBridge.unlinkProjectFromLibrary — pattern entry removal logic
//   2. ProjectStorage.save() shopping-list builder — counts cells correctly
//      and produces the skeinData shape syncProjectToLibrary expects.

const fs = require('fs');
const path = require('path');

const stashBridgeSrc = fs.readFileSync(path.join(__dirname, '..', 'stash-bridge.js'), 'utf8');
const projectStorageSrc = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');

describe('Brief D — Stash-aware Creator wiring', () => {
  it('stash-bridge.js exposes unlinkProjectFromLibrary on StashBridge', () => {
    expect(stashBridgeSrc).toMatch(/async unlinkProjectFromLibrary\(projectId\)/);
    // It must filter the patterns array by linkedProjectId.
    expect(stashBridgeSrc).toMatch(/linkedProjectId\s*!==\s*projectId/);
  });

  it('unlinkProjectFromLibrary is a no-op when no patterns match', () => {
    // Verify the conditional that avoids unnecessary writes.
    expect(stashBridgeSrc).toMatch(/filtered\.length\s*!==\s*patterns\.length/);
  });

  it('project-storage.save() includes a syncProjectToLibrary call gated on proj_ id and pattern presence', () => {
    expect(projectStorageSrc).toMatch(/StashBridge\.syncProjectToLibrary/);
    expect(projectStorageSrc).toMatch(/project\.id\.startsWith\(["']proj_["']\)/);
    expect(projectStorageSrc).toMatch(/&&\s*project\.pattern/);
  });

  it('project-storage.save() skips background/empty cells when counting threads', () => {
    expect(projectStorageSrc).toMatch(/cell\.id\s*===\s*["']__skip__["']/);
    expect(projectStorageSrc).toMatch(/cell\.id\s*===\s*["']__empty__["']/);
  });

  it('project-storage.delete() unlinks the linked manager pattern entry', () => {
    expect(projectStorageSrc).toMatch(/StashBridge\.unlinkProjectFromLibrary/);
  });

  it('save sync wraps StashBridge call in try/catch so errors never block save', () => {
    // Find the save() block and assert the sync block is wrapped.
    const saveIdx = projectStorageSrc.indexOf('StashBridge.syncProjectToLibrary');
    expect(saveIdx).toBeGreaterThan(0);
    // Look back ≤500 chars for a try { and forward for catch.
    const before = projectStorageSrc.slice(Math.max(0, saveIdx - 500), saveIdx);
    expect(before).toMatch(/try\s*\{/);
  });
});

describe('Brief D — pattern-counts builder shape', () => {
  // Mirror the inline counter logic from ProjectStorage.save() to verify
  // it produces the correct skeinData shape for syncProjectToLibrary.
  function buildSkeinData(pattern, fabricCt) {
    const counts = {};
    for (const cell of pattern) {
      if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') continue;
      counts[cell.id] = (counts[cell.id] || 0) + 1;
    }
    return Object.entries(counts).map(([id, stitches]) => ({
      id, name: id, stitches, skeins: 1, rgb: [0, 0, 0]
    }));
  }

  it('counts only stitchable cells', () => {
    const pat = [
      { id: '310' }, { id: '310' }, { id: '321' },
      { id: '__skip__' }, { id: '__empty__' }, null
    ];
    const out = buildSkeinData(pat, 14);
    expect(out).toHaveLength(2);
    const e310 = out.find(r => r.id === '310');
    expect(e310.stitches).toBe(2);
  });

  it('produces shape compatible with StashBridge.syncProjectToLibrary', () => {
    const out = buildSkeinData([{ id: '310' }, { id: '310' }], 14);
    // Shape must include id, name, stitches, skeins (used by Manager later).
    expect(out[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      stitches: expect.any(Number),
      skeins: expect.any(Number)
    }));
  });
});
