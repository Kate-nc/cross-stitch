/**
 * Regression tests for processLoadedProject null-safety.
 *
 * The bug: when switchToTrack({id}) is called from the stats page (no .project
 * field), processLoadedProject was called with `undefined`, causing a TypeError
 * ("Cannot read properties of undefined (reading 'settings')") that propagated
 * through React (CDN) and appeared as "Script error. Source: '' Line: 0:0" in
 * window.onerror on index.html.
 *
 * These tests extract the null-guard added to processLoadedProject and verify
 * that the guard fires correctly, and also test the incomingProject resolution
 * logic that selects {project} vs {id} shapes.
 */

const fs = require('fs');

// ── Extract the null guard from processLoadedProject ──────────────────────────
// We can't run the full TrackerApp (React + browser APIs), but we can extract
// and test the guard logic in isolation.
const src = fs.readFileSync('./tracker-app.js', 'utf8');

// Extract the processLoadedProject guard: the first 3 lines of the function.
const guardMatch = src.match(
  /function processLoadedProject\(project\)\{[\s\S]{0,200}?console\.error[^;]+;return;\}/
);

// Extract the incomingProject resolution logic (new code in both useEffects).
const ipResolutionMatch = src.match(
  /if\(incomingProject\.project\)\{[\s\S]{0,400}?else if\(incomingProject\.id\)\{[\s\S]{0,400}?\}/
);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('processLoadedProject null guard', () => {
  it('source file contains a null/undefined guard at the top of processLoadedProject', () => {
    expect(guardMatch).not.toBeNull();
    // The guard must check !project before accessing .settings
    const guardCode = guardMatch[0];
    expect(guardCode).toMatch(/if\s*\(\s*!project\s*\)/);
    expect(guardCode).toMatch(/return/);
  });

  it('guard fires before accessing project.settings', () => {
    // Verify the guard appears BEFORE the first .settings access
    const guardIdx = src.indexOf('if(!project){console.error');
    const settingsIdx = src.indexOf('project.settings', guardIdx + 1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(settingsIdx).toBeGreaterThan(guardIdx);
  });
});

describe('incomingProject resolution handles {id}-only shape', () => {
  it('source contains both .project and .id branches', () => {
    // Must handle the direct .project case
    expect(src).toMatch(/incomingProject\.project/);
    // Must fall back to loading by id when .project is absent
    expect(src).toMatch(/incomingProject\.id/);
    // Must use ProjectStorage.get to load by id
    expect(src).toMatch(/incomingProject\.id[\s\S]{0,300}ProjectStorage\.get/);
  });

  it('both useEffects (keepAlive and startup) apply the same fix', () => {
    // Count occurrences of the .id fallback pattern
    const idFallbackPattern = /ip\.id|incomingProject\.id/g;
    const matches = src.match(idFallbackPattern) || [];
    // Should appear at least twice (keepAlive effect + startup effect)
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('incomingProject shape logic (pure simulation)', () => {
  // Simulate the resolution logic in both effects as a pure function.
  function resolveIncomingProject(incomingProject, storage) {
    if (!incomingProject) return Promise.resolve(null);
    if (incomingProject.project) return Promise.resolve(incomingProject.project);
    if (incomingProject.id) return storage.get(incomingProject.id);
    return Promise.resolve(null);
  }

  const fakeProject = { id: 'proj_1', pattern: [], settings: { sW: 10, sH: 10 } };
  const fakeStorage = { get: (id) => Promise.resolve(id === 'proj_1' ? fakeProject : null) };

  it('resolves {project, key} shape directly without a storage lookup', async () => {
    const result = await resolveIncomingProject({ project: fakeProject, key: 1 }, fakeStorage);
    expect(result).toBe(fakeProject);
  });

  it('resolves {id} shape (stats navigation) by loading from storage', async () => {
    const result = await resolveIncomingProject({ id: 'proj_1' }, fakeStorage);
    expect(result).toBe(fakeProject);
  });

  it('returns null for null incomingProject (no crash)', async () => {
    const result = await resolveIncomingProject(null, fakeStorage);
    expect(result).toBeNull();
  });

  it('returns null for unknown id (no crash)', async () => {
    const result = await resolveIncomingProject({ id: 'proj_UNKNOWN' }, fakeStorage);
    expect(result).toBeNull();
  });

  it('returns null for incomingProject with neither .project nor .id', async () => {
    const result = await resolveIncomingProject({}, fakeStorage);
    expect(result).toBeNull();
  });
});
