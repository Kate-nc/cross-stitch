/* Regression test: ProjectStorage.setActiveProject must remain synchronous and
   return undefined. The Tracker project picker (and Stats panel) call it without
   awaiting and historically chained `.catch()` on the return value, which threw
   "Cannot read properties of undefined (reading 'catch')" when a user picked a
   project from the modal. See the Phase A modal bug fix in tracker-app.js. */
const fs = require('fs');
const path = require('path');

describe('ProjectStorage.setActiveProject', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');

  test('source defines setActiveProject as a synchronous wrapper around localStorage.setItem', () => {
    // Locate the function block.
    const m = src.match(/setActiveProject\(id\)\s*\{[\s\S]*?\n\s{4}\}/);
    expect(m).not.toBeNull();
    const body = m[0];
    // Must NOT be async, must NOT return a promise.
    expect(/async\s+setActiveProject/.test(src)).toBe(false);
    expect(/setActiveProject\([^)]*\)\s*\{[^}]*return\s+\w+\.then/.test(src)).toBe(false);
    // Must call localStorage.setItem.
    expect(body).toMatch(/localStorage\.setItem/);
  });

  test('runtime: returns undefined (cannot be chained with .catch)', () => {
    // Stub localStorage and ACTIVE_KEY constant; build a minimal harness.
    global.localStorage = { _v: {}, getItem(k){return this._v[k]||null;}, setItem(k,v){this._v[k]=v;}, removeItem(k){delete this._v[k];} };
    const setActiveProject = function(id) {
      try { localStorage.setItem('crossstitch_active_project', id); } catch (e) {}
    };
    const result = setActiveProject('proj_test');
    expect(result).toBeUndefined();
    expect(localStorage.getItem('crossstitch_active_project')).toBe('proj_test');
  });

  test('tracker-app.js no longer chains .catch on setActiveProject', () => {
    const tracker = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
    expect(tracker).not.toMatch(/setActiveProject\([^)]+\)\.catch/);
  });
});
