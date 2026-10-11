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

  test('uses the synchronously updated done ref and applies an uncommitted drag', () => {
    expect(fn).toContain('doneRef.current');
    expect(fn).toContain('dragChangesRef.current');
  });

  test('does not mutate drag state', () => {
    expect(fn).not.toMatch(/dragChangesRef\.current\s*=/);
    expect(fn).not.toMatch(/isDragging\s*=/);
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

  test('the tab-hidden handler flushes only when there are unsaved changes', () => {
    const v = block('function onVisibility()', "document.addEventListener('visibilitychange', onVisibility)");
    expect(v).toContain("'hidden'");
    expect(v).toContain('autoSaveDirtyRef.current');
    expect(v).toContain('__flushProjectToIDB');
  });

  test('a bfcache restore clears the unloading flag', () => {
    expect(src).toMatch(/onPageShow[\s\S]{0,120}isUnloadingRef\.current = false/);
  });
});
