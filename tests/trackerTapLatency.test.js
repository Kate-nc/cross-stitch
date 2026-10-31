/* Tap-lag audit, fixes #1 and #2 (source assertions — the Tracker is one
   large component, so these guard the wiring the way tests/dragMark.test.js
   does; the timing itself is covered by tests/mobile-audit/tap-cost.spec.js).

   #1  A tap or stroke paints its cells, updates every ref, then commits its
       React state as a transition, so the browser shows the stitch before the
       Tracker re-renders. `doneRef` must never be wound back by a render that
       runs before that commit.
   #2  Thread-usage events reach the stash ledger in batches, not one write
       per tap. */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const between = (from, to) => {
  const a = SRC.indexOf(from);
  if (a < 0) throw new Error('marker not found: ' + from);
  return SRC.slice(a, SRC.indexOf(to, a + from.length));
};

describe('tap commit (#1)', () => {
  test('doneRef is set with the state, never re-assigned from it during render', () => {
    expect(SRC).toMatch(/const\[done,_setDoneState\]=useState\(null\);/);
    expect(SRC).toMatch(/function setDone\(nd\)\{doneRef\.current=nd;_setDoneState\(nd\);\}/);
    expect(SRC).not.toMatch(/^doneRef\.current=done;/m);
    // Every write of the state goes through the wrapper.
    expect(SRC.match(/_setDoneState\(/g)).toHaveLength(1);
  });

  test('commitMarkState runs the updates as a transition when React has one', () => {
    const fn = between('function commitMarkState(fn){', '\n}');
    expect(fn).toMatch(/React\.startTransition\(fn\)/);
    expect(fn).toMatch(/else fn\(\)/);
  });

  test('a single tap paints first, then commits history, counts and done together', () => {
    const body = between('const _dragMarkOnToggle=useCallback(function(idx){', '},[pat,');
    const paint = body.indexOf('paintDoneChangesRef.current([{idx:idx}],nd)');
    const commit = body.indexOf('commitMarkState(function(){');
    expect(paint).toBeGreaterThan(0);
    expect(commit).toBeGreaterThan(paint);
    const inside = body.slice(commit);
    expect(inside).toMatch(/pushTrackHistory\(\[\{idx:idx,oldVal:oldVal\}\]\)/);
    expect(inside).toMatch(/applyDoneCountsDelta\(/);
    expect(inside).toMatch(/setDone\(nd\)/);
    expect(body.slice(0, commit)).not.toMatch(/setDone\(|pushTrackHistory\(|applyDoneCountsDelta\(/);
  });

  test('a stroke or rectangle commits the same way', () => {
    const body = between('const _commitBulk=useCallback(function(set,intent,source,asCatchUp){', '},[pat,');
    const paint = body.indexOf('paintDoneChangesRef.current(changes,nd)');
    const commit = body.indexOf('commitMarkState(function(){');
    expect(commit).toBeGreaterThan(paint);
    expect(body.slice(commit)).toMatch(/pushBulkToggleHistory\([\s\S]*setDone\(nd\)/);
    // The undo toast is bound to the entry pushed inside the commit, which runs synchronously.
    expect(body.indexOf('offerStepUndo(lastBulkEntryRef.current')).toBeGreaterThan(commit);
  });

  test('the gesture hook reads the live doneRef', () => {
    expect(SRC).toMatch(/window\.useDragMark\(\{\s*w:sW,h:sH,pattern:pat,done:done,doneRef:doneRef,/);
  });
});

describe('thread-usage batching (#2)', () => {
  test('a mark queues its event and schedules one batched write instead of writing at once', () => {
    const effect = between('const marked=ctx.live.sync(', '},[pat,done,fabricCt,');
    expect(effect).toMatch(/localStorage\.setItem\(ctx\.outboxKey/);    // crash safety first
    // Fix #9: written when marking pauses, and at least every RT_CAP_MS while it goes on.
    expect(effect).toMatch(/if\(ctx\.batchTimer\)clearTimeout\(ctx\.batchTimer\);\n  if\(!ctx\.batchSince\)ctx\.batchSince=Date\.now\(\);/);
    expect(effect).toMatch(/Math\.max\(0,Math\.min\(RT_IDLE_MS,RT_CAP_MS-\(Date\.now\(\)-ctx\.batchSince\)\)\)/);
    expect(effect).not.toMatch(/flushRtStashWriteRef\.current\(ctx\)\.catch\(\(\)=>\{\}\);\s*$/);
    expect(SRC).toMatch(/const RT_IDLE_MS=\d+;\nconst RT_CAP_MS=\d+;/);
  });

  test('any flush takes the pending batch with it', () => {
    const flush = between('const flushRtStashWrite=useCallback(', 'const flushRtStashWriteRef=');
    expect(flush).toMatch(/if\(ctx\.batchTimer\)\{clearTimeout\(ctx\.batchTimer\);ctx\.batchTimer=null;\}ctx\.batchSince=null;/);
  });

  test('hiding the tab and leaving the page still flush straight away', () => {
    expect(SRC).toMatch(/function onHidden\(\)\{if\(document\.hidden\)flushRtStashWriteRef\.current\(\)/);
    expect(SRC).toMatch(/const handleBeforeUnload = \(\) => \{[\s\S]*?flushRtStashWriteRef\.current\(\)\.catch/);
  });
});

describe('thread usage is kept up to date, not rebuilt per render (#6)', () => {
  test('no render rebuilds the snapshot; only load does', () => {
    expect(SRC.match(/ThreadAccounting\.snapshot\(/g)).toHaveLength(1);
    expect(SRC).toMatch(/const rtInitialMarks=window\.ThreadAccounting\.snapshot\(rtLoaded,loadedWaste\);/);
    expect(SRC).not.toMatch(/const rtMarks=|const rtAmounts=|lastMarks/);
  });

  test('load starts the live marks from what is already marked, reporting nothing', () => {
    expect(SRC).toMatch(/const rtLive=window\.ThreadAccounting\.live\(\);rtLive\.adopt\(rtLoaded,loadedWaste,rtInitialMarks\);/);
    expect(SRC).toMatch(/initialMarks:rtInitialMarks,live:rtLive,/);
  });

  test('the commit effect turns what live.sync reports into ledger operations', () => {
    const effect = between('const marked=ctx.live.sync(', '},[pat,done,fabricCt,');
    expect(effect).toMatch(/const intent=ctx\.intents\[unit\];delete ctx\.intents\[unit\];/);
    expect(effect).toMatch(/estimate:after\|\|before,kind:intent\|\|\(after\?'mark':'correction'\)/);
    expect(effect).toMatch(/setRtMarkedKeys\(/);
    // Every input the estimates read is a dependency, including the brand.
    expect(SRC).toMatch(/\},\[pat,done,fabricCt,halfStitches,halfDone,partialStitches,partialDone,knots,knotsDone,bsLines,bsDone,specialtyStitches,specialtyDone,wastePrefs,threadBrand\]\);/);
  });

  test('progress merged from another tab is adopted, not reported as stitching', () => {
    expect(SRC).toMatch(/rtContextRef\.current\.live\.adopt\(\{\.\.\.local,pattern:pat,done:nd,/);
  });

  test('the low-thread figures list the threads with marks', () => {
    expect(SRC).toMatch(/new Set\(\[\.\.\.rtMarkedKeys,\.\.\.Object\.keys\(used\)\]\)/);
  });
});

describe('marks-only full saves wait on large charts (#8)', () => {
  test('only large charts with nothing but marks unsaved, and a progress record that will be read back', () => {
    const effect = between('autoSaveGenRef.current++;\n  // Marks-only changes on a large chart.', 'const saveTimer = setTimeout(');
    expect(effect).toMatch(/const _deferMarks = pat\.length > 40000 && !autoSaveOtherDirtyRef\.current && progressRecordCovers\(\);/);
    expect(effect).toMatch(/if \(!_prevOther \|\| _other\.some\(\(v, i\) => !Object\.is\(v, _prevOther\[i\]\)\)\) autoSaveOtherDirtyRef\.current = true;/);
    expect(effect).toMatch(/Math\.min\(AUTOSAVE_MARKS_IDLE_MS, AUTOSAVE_MARKS_CAP_MS - /);
    // The non-mark inputs are every autosave dependency except the seven mark fields.
    const deps = between("}, [pat, pal, done, bsLines", ']);').replace(/\/\/[^\n]*/g, '');
    const all = ('pat, pal, done, bsLines' + deps.slice('}, [pat, pal, done, bsLines'.length)).split(',').map(x => x.trim()).filter(Boolean);
    const other = between('const _other = [', '];').slice('const _other = ['.length).split(',').map(x => x.trim()).filter(Boolean);
    const marks = ['done', 'halfDone', 'knotsDone', 'beadsDone', 'bsDone', 'partialDone', 'specialtyDone'];
    expect(all.filter(d => !marks.includes(d)).sort()).toEqual(other.sort());
  });

  test('a progress record counts only when it is based on the last full save and saving works', () => {
    const fn = between('function progressRecordCovers() {', '\n}');
    expect(fn).toMatch(/savesBlockedRef\.current \|\| saveUiRef\.current\.error \|\| saveUiRef\.current\.conflict/);
    expect(fn).toMatch(/typeof seen\.lastWriteAt === 'number'/);
  });

  test('a written progress record marks the badge saved only while nothing else is unsaved', () => {
    const write = between('function writeProgressNow() {', 'function scheduleProgressWrite()');
    expect(write).toMatch(/ok === true && !recovery && !autoSaveOtherDirtyRef\.current && epoch === saveUiRef\.current\.epoch/);
    expect(write).toMatch(/uiSavedGenRef\.current = Math\.max\(uiSavedGenRef\.current, uiGen\);/);
  });

  test('a full save or flush clears the deferral', () => {
    expect(SRC).toMatch(/autoSaveOtherDirtyRef\.current = false;   \/\/ the snapshot below holds everything/);
    expect(SRC).toMatch(/autoSaveOtherDirtyRef\.current=false;\n      autoSaveMarksSinceRef\.current=null;/);
  });
});
