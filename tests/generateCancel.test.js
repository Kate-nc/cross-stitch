/**
 * Cancellable generation with progress (P2-8, audit IMG-07).
 */
const { loadSource } = require('./_helpers/loadSource');

const src = loadSource('creator/useCreatorState.js');

function extract(re) {
  const m = src.match(re);
  if (!m) throw new Error('not found: ' + re);
  return m[1];
}

// The real handlers, run against a mocked worker and mocked state setters.
const cancelBody = extract(/var cancelGenerate = useCallback\(function\(\) \{([\s\S]*?)\n {2}\}, \[\]\);/);
const onMessageBody = extract(/w\.onmessage = function\(e\) \{([\s\S]*?)\n {8}\};\n {8}w\.onerror/);
// eslint-disable-next-line no-new-func
const retireGenerateWorker = new Function(extract(/(function retireGenerateWorker\(w\) \{[\s\S]*?\n\})/) + '\nreturn retireGenerateWorker;')();
const applyGuard = extract(/applyResultRef\.current = function\(result\) \{\s*(?:\/\/[^\n]*\n\s*)*(if \(result\.reqId !== genReqIdRef\.current\) \{ setBusy\(false\); return; \})/);

function makeEnv() {
  const env = {
    genReqIdRef: { current: 0 },
    workerRef: { current: null },
    calls: { stage: [], message: [], busy: [], applied: [], setPat: 0 },
  };
  const worker = { terminated: false, terminate() { this.terminated = true; } };
  env.worker = worker;
  env.workerRef.current = worker;
  env.setProgressMessage = (v) => env.calls.message.push(v);
  env.setProgressStage = (v) => env.calls.stage.push(v);
  env.setBusy = (v) => env.calls.busy.push(v);
  env.setPat = () => { env.calls.setPat++; };
  // applyResult: the real stale-result guard, then "apply".
  // eslint-disable-next-line no-new-func
  const guard = new Function('genReqIdRef', 'setBusy', 'setPat', 'result', applyGuard + '\nsetPat(result.mapped);');
  env.applyResultRef = { current: (result) => { env.calls.applied.push(result.reqId); guard(env.genReqIdRef, env.setBusy, env.setPat, result); } };
  // eslint-disable-next-line no-new-func
  env.cancel = new Function('genReqIdRef', 'workerRef', 'setProgressMessage', 'setProgressStage', 'setBusy', 'retireGenerateWorker', cancelBody)
    .bind(null, env.genReqIdRef, env.workerRef, env.setProgressMessage, env.setProgressStage, env.setBusy, retireGenerateWorker);
  // eslint-disable-next-line no-new-func
  const onMessage = new Function('e', 'w', 'genReqIdRef', 'workerRef', 'setProgressMessage', 'setProgressStage', 'setBusy',
    'applyResultRef', 'setPat', 'setPal', 'setCmap', 'setDisambigData', 'buildPalette', onMessageBody);
  env.deliver = (msg) => onMessage({ data: msg }, worker, env.genReqIdRef, env.workerRef, env.setProgressMessage, env.setProgressStage,
    env.setBusy, env.applyResultRef, env.setPat, () => {}, () => {}, () => {}, () => ({ pal: [], cmap: {} }));
  return env;
}

describe('cancel', () => {
  test('makes the running request stale, stops the worker and clears busy', () => {
    const env = makeEnv();
    env.genReqIdRef.current = 1;   // a generation is running as request 1
    env.cancel();
    expect(env.genReqIdRef.current).toBe(2);
    expect(env.worker.terminated).toBe(true);
    expect(env.workerRef.current).toBeNull();
    expect(env.calls.busy).toEqual([false]);
    expect(env.calls.stage).toEqual([null]);
    // Its handlers are detached first, so an error from a worker stopped
    // mid-load is swallowed instead of reaching the page.
    expect(env.worker.onmessage).toBeNull();
    let prevented = false;
    env.worker.onerror({ preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
  });

  test('progress and the result of a cancelled request are ignored; the pattern is untouched', () => {
    const env = makeEnv();
    env.genReqIdRef.current = 1;
    env.deliver({ type: 'progress', reqId: 1, stage: 'quantizing', message: 'Choosing colours…' });
    expect(env.calls.stage).toEqual(['quantizing']);
    env.cancel();
    env.deliver({ type: 'progress', reqId: 1, stage: 'cleanup', message: 'Cleaning up stitches…' });
    expect(env.calls.stage).toEqual(['quantizing', null]);
    env.deliver({ type: 'result', reqId: 1, mapped: [] });
    expect(env.calls.setPat).toBe(0);
  });

  test('a later generation\'s result still applies', () => {
    const env = makeEnv();
    env.genReqIdRef.current = 1;
    env.cancel();
    env.genReqIdRef.current = 3;   // the next Generate
    env.deliver({ type: 'result', reqId: 3, mapped: [] });
    expect(env.calls.setPat).toBe(1);
  });

  test('a generation cancelled before its first frame never starts', () => {
    expect(src).toMatch(/var startGeneration = function\(\) \{\s*\/\/ Cancelled before the first frame: don't start at all\.\s*if \(reqId !== genReqIdRef\.current\) return;/);
  });
});

describe('progress', () => {
  // eslint-disable-next-line no-new-func
  const stages = new Function(extract(/(var GENERATE_STAGES = \{[\s\S]*?\n\};)/) + '\n' +
    extract(/(function generateStageInfo\(stage\) \{[\s\S]*?\n\})/) + '\nreturn { GENERATE_STAGES, generateStageInfo };')();

  test('every stage the worker reports has stitcher-facing text', () => {
    const worker = loadSource('generate-worker.js');
    const reported = Array.from(worker.matchAll(/postProgress\((?:dith \? )?'([a-z]+)'(?: : '([a-z]+)')?/g)).flatMap((m) => [m[1], m[2]]).filter(Boolean);
    expect(reported.length).toBeGreaterThan(5);
    for (const st of reported) expect(stages.GENERATE_STAGES[st]).toBeDefined();
  });

  test('the brief\'s wording, and the bar only moves forward', () => {
    const g = stages.GENERATE_STAGES;
    expect(g.mapping.label).toBe('Matching colours…');
    expect(g.cleanup.label).toBe('Cleaning up stray stitches…');
    expect(g.finalizing.label).toBe('Building the chart…');
    const order = ['preparing', 'smoothing', 'quantizing', 'mapping', 'rarity', 'cleanup', 'disambiguating', 'finalizing'];
    for (let i = 1; i < order.length; i++) expect(g[order[i]].pct).toBeGreaterThan(g[order[i - 1]].pct);
    expect(stages.generateStageInfo('unknown')).toEqual({ label: 'Generating pattern…', pct: null });
  });

  test('the Creator shows the progress card with Cancel instead of the old overlay', () => {
    const main = loadSource('creator-main.js');
    expect(main).toMatch(/\{state\.busy&&window\.CreatorGenerateProgress&&<window\.CreatorGenerateProgress stage=\{state\.progressStage\} onCancel=\{state\.cancelGenerate\} cancellable=\{state\.generateCancellable\}\/>\}/);
    expect(main).not.toMatch(/Generating pattern\\u2026<\/div>/);
    const card = loadSource('creator/GenerateProgress.js');
    expect(card).toMatch(/"Cancel"/);
    expect(card).toMatch(/role: "status", "aria-live": "polite"/);
  });

  test('the card is a modal dialog: focus moves to Cancel, Tab stays inside, focus is restored', () => {
    const card = loadSource('creator/GenerateProgress.js');
    expect(card).toMatch(/role: "dialog", "aria-modal": "true",\s*"aria-labelledby": "generate-busy-title"/);
    expect(card).toMatch(/"data-autofocus": ""/);
    expect(card).toMatch(/if \(e\.key !== "Tab"\) return;/);
    expect(card).toMatch(/prev\.focus\(/);
  });

  test('Escape cancels through the shared window.useEscape stack, not its own document listener', () => {
    const card = loadSource('creator/GenerateProgress.js');
    expect(card).toMatch(/window\.useEscape\(canCancel \? cancel : function \(\) \{\}\);/);
    expect(card).not.toMatch(/addEventListener\("keydown", function[^)]*Escape/);
    expect(card).not.toMatch(/document\.addEventListener/);
  });

  test('no Cancel when generation runs on the page, where it can\'t be interrupted', () => {
    expect(src).toMatch(/if \(!worker\) \{\s*\/\/ Fallback: run synchronously on main thread[\s\S]{0,160}setGenerateCancellable\(false\);/);
    expect(src).toMatch(/setProgressStage\("preparing"\); setGenerateCancellable\(true\);/);
    expect(loadSource('creator/GenerateProgress.js')).toMatch(/var canCancel = props\.cancellable !== false && typeof props\.onCancel === "function";/);
  });

  test('leaving the Creator stops the worker the same safe way', () => {
    expect(src).toMatch(/useEffect\(function\(\) \{\s*return function\(\) \{\s*if \(workerRef\.current && workerRef\.current !== 'unavailable'\) \{\s*retireGenerateWorker\(workerRef\.current\);/);
    expect(src).not.toMatch(/workerRef\.current\.terminate\(\)/);
  });
});
