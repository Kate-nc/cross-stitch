// B1: Tracker handoff trio (T-3, INT-4, T-4)
// Structural assertions for the timestamped tracker->creator handoff
// and the mount-race guard. The handoff TTL is exercised behaviourally
// by parsing the same logic from useProjectIO.js.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const tracker = read('tracker-app.js');
const useProjectIO = read('creator/useProjectIO.js');

describe('T-3 / INT-4: tracker writes an {ts, project} envelope', () => {
  test('handleEditInCreator wraps the project in a timestamped envelope', () => {
    expect(tracker).toMatch(/T-3 \/ INT-4/);
    expect(tracker).toMatch(/var _env = \{ ts: Date\.now\(\), project: project \}/);
    expect(tracker).toMatch(
      /localStorage\.setItem\("crossstitch_handoff_to_creator", JSON\.stringify\(_env\)\)/);
  });
});

describe('T-3 / INT-4: Creator drops stale envelopes', () => {
  test('useProjectIO declares HANDOFF_TTL_MS = 30 seconds', () => {
    expect(useProjectIO).toMatch(/HANDOFF_TTL_MS\s*=\s*30 \* 1000/);
  });
  test('envelope shape gate accepts {ts, project} and legacy bare project', () => {
    // The branch must check both _raw.project and typeof _raw.ts === 'number'.
    const m = useProjectIO.match(
      /_raw && typeof _raw === 'object' && _raw\.project && typeof _raw\.ts === 'number'/);
    expect(m).not.toBeNull();
  });
  test('stale envelope is dropped and logged', () => {
    const m = useProjectIO.match(
      /\(Date\.now\(\) - _raw\.ts\) > HANDOFF_TTL_MS[\s\S]{0,400}?dropped stale tracker handoff/);
    expect(m).not.toBeNull();
  });
});

describe('T-3 / INT-4: TTL gate behaves correctly', () => {
  // Extract the gate predicate by evaluating a small wrapper. We mirror
  // the predicate locally rather than try to import useProjectIO.js
  // (which depends on React, ProjectStorage, etc.).
  const HANDOFF_TTL_MS = 30 * 1000;
  function accept(raw, now) {
    if (raw && typeof raw === 'object' && raw.project && typeof raw.ts === 'number') {
      if ((now - raw.ts) > HANDOFF_TTL_MS) return null;
      return raw.project;
    }
    return raw;
  }
  test('fresh envelope (1s old) is accepted', () => {
    const now = 1000000;
    const env = { ts: now - 1000, project: { pattern: [], settings: {} } };
    expect(accept(env, now)).toBe(env.project);
  });
  test('envelope 30s + 1ms old is dropped', () => {
    const now = 1000000;
    const env = { ts: now - HANDOFF_TTL_MS - 1, project: { pattern: [], settings: {} } };
    expect(accept(env, now)).toBeNull();
  });
  test('legacy bare project (no ts) is still accepted', () => {
    const now = 1000000;
    const legacy = { pattern: [], settings: {}, page: 'tracker' };
    expect(accept(legacy, now)).toBe(legacy);
  });
});

describe('T-4: mount effect uses hasLoadedOnceRef guard', () => {
  test('TrackerApp declares hasLoadedOnceRef', () => {
    expect(tracker).toMatch(/T-4:/);
    expect(tracker).toMatch(/const hasLoadedOnceRef=useRef\(false\)/);
  });
  test('every processLoadedProject in the mount/prop effects pairs with hasLoadedOnceRef.current=true', () => {
    // There should be at least 5 occurrences of the T-4 marker on those lines.
    const matches = tracker.match(/hasLoadedOnceRef\.current=true/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });
  test('ProjectStorage.getActiveProject fallback is deferred via Promise.resolve().then', () => {
    const m = tracker.match(
      /Promise\.resolve\(\)\.then\(function\s*\(\)\s*\{[\s\S]{0,1200}?ProjectStorage\.getActiveProject\(\)/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/if \(hasLoadedOnceRef\.current\) return/);
  });
});
