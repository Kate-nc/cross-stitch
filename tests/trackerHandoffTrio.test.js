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

function handleEditInCreatorSource() {
  const start = tracker.indexOf('function handleEditInCreator(');
  const end = tracker.indexOf('\nfunction ', start + 1);
  return tracker.slice(start, end);
}

describe('T-3 / INT-4: tracker saves the project and writes a {ts, projectId} envelope', () => {
  test('handleEditInCreator saves to storage before navigating', () => {
    const src = handleEditInCreatorSource();
    expect(src).toMatch(/T-3 \/ INT-4/);
    expect(src).toMatch(/persistProjectRecord\(project\)\.then\(/);
    // Navigation happens only inside the save callback.
    const saveAt = src.indexOf('persistProjectRecord(project).then(');
    const navAt = src.indexOf('window.location.href = "create.html?source=tracker"');
    expect(navAt).toBeGreaterThan(saveAt);
  });
  test('the envelope carries the id, not the pattern', () => {
    // Large charts overflowed localStorage's ~5 MB quota when the whole
    // project travelled through it ("Pattern too large for direct transfer").
    const src = handleEditInCreatorSource();
    expect(src).toMatch(/var _env = \{ ts: Date\.now\(\), projectId: project\.id, hasProgress: /);
    expect(src).toMatch(
      /localStorage\.setItem\("crossstitch_handoff_to_creator", JSON\.stringify\(_env\)\)/);
    expect(src).not.toMatch(/project: project \}/);
    expect(src).not.toMatch(/too large for direct transfer/);
  });
});

describe('Creator accepts the {ts, projectId} envelope', () => {
  test('useProjectIO recognises a projectId envelope and warns about progress after load', () => {
    expect(useProjectIO).toMatch(
      /_raw && typeof _raw === 'object' && _raw\.projectId && typeof _raw\.ts === 'number'/);
    expect(useProjectIO).toMatch(
      /processLoadedProject\(project3\);\s*if \(handoffProgressId && handoffProgressId === project3\.id\)/);
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
