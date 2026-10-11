// The Tracker's save badge tells the truth (tracking audit TRACK-02, BUG-07).
// Interaction coverage is in tests/e2e/save-badge.spec.js.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const header = fs.readFileSync(path.join(__dirname, '..', 'header.js'), 'utf8');

function block(a, b) {
  const i = src.indexOf(a); expect(i).toBeGreaterThan(-1);
  const j = src.indexOf(b, i); expect(j).toBeGreaterThan(i);
  return src.slice(i, j);
}

test('the tracker hands the header a real save status, not the static default', () => {
  expect(src).toMatch(/<Header page="tracker"[^\n]*saveStatus=\{saveStatus\} savedAt=\{savedAt\} saveError=\{saveError\} onRetrySave=\{retrySave\}/);
});

describe('status derivation', () => {
  const fn = block('function refreshSaveUi()', 'function beginSave()');
  test('error beats conflict beats saving beats saved', () => {
    const iError = fn.indexOf("u.error ? 'error'"), iConf = fn.indexOf("u.conflict ? 'conflict'"),
          iSave = fn.indexOf("'saving'"), iSaved = fn.indexOf("'saved'");
    expect(iError).toBeGreaterThan(-1);
    expect(iError).toBeLessThan(iConf);
    expect(iConf).toBeLessThan(iSave);
    expect(iSave).toBeLessThan(iSaved);
  });
  test('"saving" covers both a write in flight and changes not yet written', () => {
    expect(fn).toMatch(/u\.inFlight > 0 \|\| unsaved/);
    expect(fn).toMatch(/uiGenRef\.current > uiSavedGenRef\.current/);
  });
  test('it only sets state, so an unchanged status costs no render on the mark path', () => {
    expect(fn).toMatch(/setSaveStatus\(next\)/);
    expect(fn).not.toMatch(/useRef|useState|useEffect/);
  });
});

describe('what counts as an unsaved change', () => {
  const eff = block('// Count changes to data the project saves', '// A cross-tab conflict dialog is open');
  test('zoom and the guide do not turn the badge to "saving"', () => {
    expect(eff).not.toMatch(/stitchZoom|hlRow|hlCol/);
  });
  test('marks, history, name and settings do', () => {
    for (const dep of ['done', 'halfDone', 'knotsDone', 'statsSessions', 'projectName', 'parkMarkers', 'threadOwned']) {
      expect(eff).toContain(dep);
    }
  });
  test('a freshly loaded or switched-to project counts as saved and starts with its own save state', () => {
    expect(src).toMatch(/uiSavedGenRef\.current = uiGenRef\.current;[^\n]*\n\s*saveUiRef\.current\.error = null; saveUiRef\.current\.savedOnce = false; setSavedAt\(null\);[^\n]*\n\s*refreshSaveUi\(\);/);
  });
});

describe('writes report to the badge', () => {
  test('the autosave timer begins and ends a save, once, with failures reported', () => {
    const t = block('let _ended = false;', '}, _autoSaveDelay);');
    expect(t).toContain('beginSave();');
    expect(t).toMatch(/endOnce\(_ok \? true/);
    expect(t).toMatch(/\.catch\(err => \{ console\.error\("Tracker auto-save failed:", err\); endOnce\(false, err\); \}\)/);
  });
  test('the flush (backup, sync, tab hidden, Retry) does too', () => {
    const f = block('window.__flushProjectToIDB = async function() {\n    if (isUnloadingRef', '// Save when the tab is hidden');
    expect(f).toContain('beginSave();');
    expect(f).toMatch(/endSave\(false, _uiGen, err\); throw err;/);
    expect(f).toMatch(/endSave\(_flushOk \? true/);
  });
  test('a failed save keeps its error until a save succeeds', () => {
    const e = block('function endSave(', 'function retrySave()');
    expect(e).toMatch(/ok === true\) \{\s*u\.error = null/);
    expect(e).toMatch(/ok === false\) \{\s*u\.error =/);
  });
  test('Retry clears the error and flushes', () => {
    const r = block('function retrySave()', '// ── Progress record writer ──');
    expect(r).toContain('saveUiRef.current.error = null');
    expect(r).toContain('__flushProjectToIDB');
  });
  test('the conflict dialog drives the "conflict" status', () => {
    expect(src).toMatch(/addEventListener\('cs:conflictState', onConflict\)/);
    expect(src).toMatch(/saveUiRef\.current\.conflict = !!\(e && e\.detail && e\.detail\.open\)/);
  });
});

describe('the badge itself (header.js)', () => {
  test('has a conflict state that says the changes are not saved', () => {
    expect(header).toMatch(/effective === 'conflict'[\s\S]{0,400}label = 'Not saved yet'/);
  });
  test('problems are announced to screen readers, the ticking relative time is not', () => {
    expect(header).toMatch(/\(effective === 'error' \|\| effective === 'conflict'\) \? \{ role: 'status' \} : \{\}/);
  });
});
