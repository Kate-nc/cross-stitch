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
    const eff = block('// Keep the progress record\'s owner current', '// ── Zoom-adaptive tier helpers');
    expect(eff).toMatch(/uiSavedGenRef\.current = uiGenRef\.current;/);
    expect(eff).toMatch(/u\.error = null; u\.savedOnce = false; u\.inFlight = 0; u\.conflict = false; u\.epoch\+\+;/);
    expect(eff).toMatch(/setSavedAt\(null\);\s*\n\s*refreshSaveUi\(\);/);
  });
});

describe('writes report to the badge', () => {
  test('the autosave timer begins and ends a save, once, with failures reported', () => {
    const t = block('let _ended = false;', '}, _autoSaveDelay);');
    expect(t).toContain('beginSave();');
    expect(t).toMatch(/endOnce\(_ok \? true/);
    expect(t).toMatch(/\.catch\(err => \{ console\.error\("Tracker auto-save failed:", err\);[^}]*endOnce\(false, err\); \}\)/);
  });
  test('the flush (backup, sync, tab hidden, Retry) does too', () => {
    const f = block('window.__flushProjectToIDB = async function() {\n    if (isUnloadingRef', '// Save when the tab is hidden');
    expect(f).toContain('beginSave();');
    expect(f).toMatch(/endSave\(false, _uiGen, err, _epoch\); throw err;/);
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

describe('a write that finishes after switching project is ignored', () => {
  test('begin returns the epoch, end ignores a mismatched one before touching any state', () => {
    expect(block('function beginSave()', 'function endSave(')).toMatch(/return saveUiRef\.current\.epoch;/);
    const e = block('function endSave(', 'function retrySave()');
    expect(e.indexOf('if (epoch !== u.epoch) return;')).toBeGreaterThan(-1);
    expect(e.indexOf('if (epoch !== u.epoch) return;')).toBeLessThan(e.indexOf('u.inFlight'));
    expect(e.indexOf('if (epoch !== u.epoch) return;')).toBeLessThan(e.indexOf('setSavedAt'));
  });
  test('every caller passes the epoch it began with', () => {
    expect((src.match(/const _epoch = beginSave\(\);/g) || []).length).toBe(2);
    expect(src).toMatch(/endSave\(ok, _uiGen, err, _epoch\)/);
    expect(src).toMatch(/endSave\(_flushOk \? true[^\n]*_uiGen, saveResult && saveResult\.reason, _epoch\)/);
  });
});

describe('everything the snapshot persists is saved when it changes', () => {
  // The state variables buildSnapshot() writes into the project record. Each must be a dependency of the
  // autosave effect, or editing it alone is not saved until something unrelated changes.
  const PERSISTED = ['pat', 'pal', 'done', 'bsLines', 'parkMarkers', 'hlRow', 'hlCol', 'threadOwned', 'originalPaletteState',
    'singleStitchEdits', 'halfStitches', 'halfDone', 'partialStitches', 'knots', 'knotsDone', 'statsSessions', 'statsSettings',
    'achievedMilestones', 'doneSnapshots', 'projectName', 'projectDesigner', 'projectDescription', 'sW', 'sH', 'fabricCt',
    'skeinPrice', 'stitchSpeed', 'wastePrefs', 'projectFabricColour', 'threadBrand', 'breadcrumbs', 'stitchingStyle', 'blockW',
    'blockH', 'focusBlock', 'startCorner', 'colourSequence', 'workArea'];
  // Navigation (the zoom, the scroll and the working context) is persisted too, but a change to it is not an edit:
  // it goes to the navigation record, and the next full save carries it.
  const NAVIGATION = ['stitchZoom', 'focusColour', 'stitchMode', 'stitchView', 'highlightMode'];
  const deps = text => text.slice(text.lastIndexOf('[')).replace(/\/\/[^\n]*/g, '').split(/[\s,\[\]]+/).filter(Boolean);
  test('the autosave effect depends on all of them', () => {
    const eff = block('useEffect(() => {\n  if (!pat || !pal) return;\n  autoSaveDirtyRef', '// ═══ Navigation record ═══');
    const d = deps(eff.slice(eff.indexOf('}, [pat, pal, done')));
    for (const name of PERSISTED) expect(d).toContain(name);
    for (const name of NAVIGATION) expect(d).not.toContain(name);
  });
  test('navigation changes write the navigation record instead', () => {
    expect(src).toMatch(/useEffect\(\(\)=>\{if\(pat\)scheduleNavRecord\(\);\},\[stitchZoom,focusColour,stitchMode,stitchView,highlightMode\]\);/);
    // The scroll position too, which no save ever followed.
    expect(src).toMatch(/onScroll=\{\(\)=>\{scheduleNavRecord\(\);/);
  });
  test('the badge counts all of them as changes except the view-only ones (zoom, the guide, the spotlight block)', () => {
    const eff = block('// Count changes to data the project saves', '// A cross-tab conflict dialog is open');
    const d = deps(eff.slice(eff.indexOf('}, [pat, done')));
    for (const name of PERSISTED) {
      if (['stitchZoom', 'hlRow', 'hlCol', 'focusBlock', 'pal'].includes(name)) continue;
      expect(d).toContain(name);
    }
    expect(d).not.toContain('stitchZoom');
    expect(d).not.toContain('focusBlock');
  });
});
