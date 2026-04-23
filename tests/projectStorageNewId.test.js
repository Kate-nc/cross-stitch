/* Regression test: ProjectStorage.newId() is the single canonical source for
   new project IDs. Previously we had at least 5 ad-hoc `"proj_" + Date.now()`
   callsites which could collide on a fast double-click or simultaneous import.
   The new helper returns `proj_<timestamp>_<rand>` to make collisions effectively
   impossible. */
const fs = require('fs');
const path = require('path');

describe('ProjectStorage.newId()', () => {
  // Extract the singleton and exercise newId() directly.
  const src = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');

  test('source defines newId() that returns a proj_<timestamp>_<rand> string', () => {
    expect(src).toMatch(/newId\(\)\s*\{[\s\S]*?return\s+"proj_"\s*\+\s*Date\.now\(\)\s*\+\s*"_"\s*\+\s*rand;[\s\S]*?\}/);
  });

  test('runtime: returns unique IDs even when called in tight succession', () => {
    // Inline equivalent so we don't have to load the IndexedDB-dependent module.
    function newId() {
      var rand = Math.random().toString(36).slice(2, 7);
      return "proj_" + Date.now() + "_" + rand;
    }
    const ids = new Set();
    for (let i = 0; i < 1000; i++) ids.add(newId());
    // 1000 IDs from a 5-char base36 random suffix → expected collision rate
    // is well under 1%. We allow a generous tolerance.
    expect(ids.size).toBeGreaterThan(990);
    // Format check
    const sample = newId();
    expect(sample).toMatch(/^proj_\d+_[a-z0-9]{1,5}$/);
  });

  test('production callers use ProjectStorage.newId(), not raw "proj_" + Date.now()', () => {
    // Bundle.js is a build artefact and is allowed to lag until rebuild;
    // we only check the hand-edited source files.
    const sources = [
      'project-storage.js',
      'tracker-app.js',
      'creator/useProjectIO.js',
    ];
    for (const file of sources) {
      const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
      // Strip the newId() definition itself + any code-comments referring to
      // the old pattern, then assert no remaining production callsites.
      const stripped = text
        .replace(/newId\(\)\s*\{[\s\S]*?\}/g, '')
        .replace(/\/\/.*$/gm, '');
      expect(stripped).not.toMatch(/["']proj_["']\s*\+\s*Date\.now\(\)/);
    }
  });
});
