/**
 * Source-level guards for the tracker's save paths (tracking audit TRACK-01).
 * Behavioural coverage (reload, hard close) is in tests/e2e/save-durability.spec.js.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

function block(startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  expect(a).toBeGreaterThan(-1);
  const b = src.indexOf(endMarker, a);
  expect(b).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe('__flushProjectToIDB', () => {
  const flush = block('window.__flushProjectToIDB = async function() {\n    if (isUnloadingRef', '// Save when the tab is hidden');

  test('saves a complete, current snapshot rather than a hand-built partial record', () => {
    expect(flush).toContain('snapshotNow()');
    // The old implementation listed fields by hand and left out pattern and done.
    expect(flush).not.toMatch(/\.\.\.\(lastSnapshotRef\.current \|\| \{\}\)/);
  });

  test('stands aside while the page is unloading', () => {
    expect(flush).toMatch(/if \(isUnloadingRef\.current\) return;/);
  });
});

describe('snapshotNow', () => {
  const fn = block('function snapshotNow()', 'useEffect(() => {\n  if (!pat || !pal) return;\n  autoSaveDirtyRef');

  test('uses the synchronously updated done ref', () => {
    expect(fn).toContain('doneRef.current');
  });

  test('reads the live drag gesture from useDragMark, not the unused legacy refs', () => {
    expect(fn).toContain('dragMarkGetStateRef.current');
    expect(fn).toContain("g.mode === 'drag'");
    // dragStateRef/dragChangesRef are never populated; relying on them was a no-op.
    expect(fn).not.toMatch(/dragChangesRef|dragStateRef/);
  });

  test('applies the same filters as the drag commit and does not change drag state', () => {
    expect(fn).toContain('dragCommitFilterRef.current');
    expect(src).toMatch(/dragCommitFilterRef\.current=function\(idx\)\{return !\(isColourLocked\(\)&&!fullStitchMatchesFocus\(idx\)\);\};/);
    expect(fn).not.toMatch(/\.reset\(|dragMarkReset/);
  });
});

describe('autosave debounce', () => {
  const eff = block('useEffect(() => {\n  if (!pat || !pal) return;\n  autoSaveDirtyRef', 'Save the freshest snapshot before the page unloads');

  test('has a maximum wait so continuous marking still saves', () => {
    expect(eff).toContain('autoSaveFirstDirtyRef');
    expect(eff).toMatch(/Math\.min\(5000, _autoSaveCap - /);
    expect(eff).toMatch(/pat\.length > 40000 \? 20000 : 10000/);
    expect(eff).toContain('}, _autoSaveDelay);');
  });
});

describe('unload and hidden saves', () => {
  test('the unload handler snapshots through snapshotNow', () => {
    const h = block('const handleBeforeUnload = () => {', 'pagehide covers iOS Safari');
    expect(h).toContain('snapshotNow()');
  });

  test('the tab-hidden handler flushes only when something changed since the last write', () => {
    const v = block('function onVisibility()', "document.addEventListener('visibilitychange', onVisibility)");
    expect(v).toContain("'hidden'");
    expect(v).toContain('autoSaveGenRef.current === flushedGenRef.current');
    expect(v).toContain('__flushProjectToIDB');
    // It must not touch the debounce's own dirty flags.
    expect(v).not.toMatch(/autoSaveDirtyRef|autoSaveFirstDirtyRef/);
  });

  test('both the flush and the autosave record the generation they wrote, only on success', () => {
    const flush = block('window.__flushProjectToIDB = async function() {\n    if (isUnloadingRef', '// Save when the tab is hidden');
    expect(flush).toMatch(/flushedGenRef\.current = Math\.max\(flushedGenRef\.current, _gen\)/);
    expect(flush).toContain('saveResult.ok !== false');
    expect(src).toMatch(/flushedGenRef\.current=Math\.max\(flushedGenRef\.current,_gen\)/);
  });

  test('a bfcache restore clears the unloading flag', () => {
    expect(src).toMatch(/onPageShow[\s\S]{0,120}isUnloadingRef\.current = false/);
  });
});
