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
    const effect = between('const before=ctx.lastMarks;ctx.lastMarks=rtMarks;', '},[rtMarks,wastePrefs.enabled]);');
    expect(effect).toMatch(/localStorage\.setItem\(ctx\.outboxKey/);    // crash safety first
    expect(effect).toMatch(/if\(!ctx\.batchTimer\)ctx\.batchTimer=setTimeout\(/);
    expect(effect).toMatch(/RT_BATCH_MS\)/);
    expect(effect).not.toMatch(/flushRtStashWriteRef\.current\(ctx\)\.catch\(\(\)=>\{\}\);\s*$/);
    expect(SRC).toMatch(/const RT_BATCH_MS=\d+;/);
  });

  test('any flush takes the pending batch with it', () => {
    const flush = between('const flushRtStashWrite=useCallback(', 'const flushRtStashWriteRef=');
    expect(flush).toMatch(/if\(ctx\.batchTimer\)\{clearTimeout\(ctx\.batchTimer\);ctx\.batchTimer=null;\}/);
  });

  test('hiding the tab and leaving the page still flush straight away', () => {
    expect(SRC).toMatch(/function onHidden\(\)\{if\(document\.hidden\)flushRtStashWriteRef\.current\(\)/);
    expect(SRC).toMatch(/const handleBeforeUnload = \(\) => \{[\s\S]*?flushRtStashWriteRef\.current\(\)\.catch/);
  });
});

describe('whole-progress memos survive a restarted transition', () => {
  const src = between('function useKeptMemo(fn,deps){', '\n}') + '\n}';
  const make = () => {
    const ref = { current: [] };
    // eslint-disable-next-line no-new-func
    return new Function('useRef', src + '\nreturn useKeptMemo;')(() => ref);
  };

  test('reuses the value for the same inputs, including after an interrupting render with the old ones', () => {
    const useKeptMemo = make(), fn = jest.fn(x => ({ x }));
    const oldDone = [0], newDone = [1];
    const a = useKeptMemo(() => fn(oldDone), [oldDone, 1]);
    const b = useKeptMemo(() => fn(newDone), [newDone, 2]);   // the transition
    const c = useKeptMemo(() => fn(oldDone), [oldDone, 1]);   // a sync render before it commits
    const d = useKeptMemo(() => fn(newDone), [newDone, 2]);   // the transition restarts
    expect(fn).toHaveBeenCalledTimes(2);
    expect(c).toBe(a);
    expect(d).toBe(b);
  });

  test('recomputes when any input changes', () => {
    const useKeptMemo = make(), fn = jest.fn(() => ({}));
    const p = {};
    useKeptMemo(fn, [p, 1]); useKeptMemo(fn, [p, 2]); useKeptMemo(fn, [{}, 2]);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('the thread-usage snapshot and its totals use it', () => {
    expect(SRC).toMatch(/const rtMarks=useKeptMemo\(\(\)=>window\.ThreadAccounting\.snapshot\(/);
    expect(SRC).toMatch(/const rtAmounts=useKeptMemo\(/);
  });
});
