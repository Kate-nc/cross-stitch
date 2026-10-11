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

describe('progress record writer', () => {
  test('writes only through ProjectStorage.saveProgress, from a consistent id and state pair', () => {
    const fn = block('function writeProgressNow()', 'function scheduleProgressWrite()');
    expect(fn).toContain('ProjectStorage.saveProgress(o.id');
    // Marks may be taken from doneRef only when the project id still matches the owner's.
    expect(fn).toMatch(/projectIdRef\.current === o\.id && live\.length === o\.done\.length/);
    expect(fn).toContain('baseWriteAt');
  });

  test('is throttled, not debounced', () => {
    const fn = block('function scheduleProgressWrite()', 'const writeProgressNowRef');
    expect(fn).toMatch(/if \(!progressTimerRef\.current\) progressTimerRef\.current = setTimeout\(writeProgressNow, 400\)/);
  });

  test('the unload and tab-hidden handlers write it first', () => {
    const unload = block('const handleBeforeUnload = () => {', 'pagehide covers iOS Safari');
    expect(unload.indexOf('writeProgressNowRef.current()')).toBeGreaterThan(-1);
    expect(unload.indexOf('writeProgressNowRef.current()')).toBeLessThan(unload.indexOf('snapshotNow()'));
    const hidden = block('function onVisibility()', "document.addEventListener('visibilitychange', onVisibility)");
    expect(hidden.indexOf('writeProgressNowRef.current()')).toBeLessThan(hidden.indexOf('__flushProjectToIDB'));
  });

  test('a project that has just loaded or switched is not rewritten', () => {
    const eff = block('// Keep the progress record\'s owner current', '// ── Zoom-adaptive tier helpers');
    expect(eff).toContain('b.id !== id');
    expect(eff).toMatch(/\[done, halfDone, knotsDone\]/);
  });

  test('a full save that finishes while marks arrive triggers a fresh progress write', () => {
    expect(src).toMatch(/autoSaveGenRef\.current!==_gen\)scheduleProgressWriteRef\.current\(\)/);
  });
});
