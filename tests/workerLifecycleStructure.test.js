/**
 * tests/workerLifecycleStructure.test.js
 *
 * Structural regressions for the audit-4B worker-lifecycle fixes
 * (integration-audit findings C-1, CL-1, CL-5). These bugs were
 * silent: a stale-error path forgot to null the worker ref, the
 * cleanup hook never terminated its worker on unmount, and the
 * cleanup worker's late result could overwrite a fresh manual
 * selection after the user switched away from the Auto sub-tool.
 *
 * We don't spin up a React renderer here — the existing cleanupMode
 * tests deliberately stick to pure functions. Instead we assert the
 * source files contain the specific guards we added, so anyone
 * removing them later trips a test.
 */
const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

describe('audit-4B — worker lifecycle guards', () => {
  const creatorSrc = read('creator/useCreatorState.js');
  const cleanupSrc = read('creator/useCleanupMode.js');

  test('C-1: stale-error path nulls workerRef.current after terminate', () => {
    // The stale-error branch must terminate AND clear the ref, otherwise
    // getOrCreateWorker re-uses a dead Worker handle that will never
    // respond and leaves the UI stuck in busy state.
    const blockMatch = creatorSrc.match(
      /msg\.reqId !== undefined && msg\.reqId !== genReqIdRef\.current\) \{[\s\S]{0,400}?\}/
    );
    expect(blockMatch).not.toBeNull();
    const block = blockMatch[0];
    expect(block).toMatch(/w\.terminate\(\)/);
    // The fix: workerRef must be cleared in this branch.
    expect(block).toMatch(/workerRef\.current\s*=\s*null/);
  });

  test('C-2: generate worker has an unmount cleanup effect', () => {
    // Already in the file from an earlier change — guarded so future
    // refactors don't regress it.
    expect(creatorSrc).toMatch(
      /Terminate the worker when the component unmounts/
    );
    expect(creatorSrc).toMatch(
      /workerRef\.current && workerRef\.current !== 'unavailable'/
    );
  });

  test('CL-1: cleanup worker has an unmount cleanup effect', () => {
    // Block must (a) return a cleanup fn from useEffect, and (b) call
    // terminate on workerRef.current inside it.
    expect(cleanupSrc).toMatch(/CL-1/);
    // The effect returns a teardown fn that terminates the worker.
    const cl1Idx = cleanupSrc.indexOf('CL-1');
    const after = cleanupSrc.slice(cl1Idx, cl1Idx + 600);
    expect(after).toMatch(/useEffect\(function\(\)\s*\{/);
    expect(after).toMatch(/return function\(\)\s*\{/);
    expect(after).toMatch(/workerRef\.current\.terminate\(\)/);
    expect(after).toMatch(/workerRef\.current\s*=\s*null/);
  });

  test('CL-5: sub-tool switch terminates in-flight cleanup worker', () => {
    expect(cleanupSrc).toMatch(/CL-5/);
    const cl5Idx = cleanupSrc.indexOf('CL-5');
    const after = cleanupSrc.slice(cl5Idx, cl5Idx + 900);
    // Guard returns early when still in cleanup + auto sub-tool.
    expect(after).toMatch(
      /state\.activeTool === 'cleanup'\s*&&\s*state\.cleanupSelTool === 'auto'/
    );
    // Otherwise terminate and clear running flag.
    expect(after).toMatch(/workerRef\.current\.terminate\(\)/);
    expect(after).toMatch(/setCleanupAutoRunning\(false\)/);
  });
});
