// F-011: what the Tracker rebuilds from a loaded project's sessions (legacy total-time migration, durationSeconds and
// totalAtEnd patching, recovery of a pending session), now in helpers.js (rebuildLoadedSessions, readPendingSessions).
// The expectations in tests/_helpers/trackerLoadSessions.golden.json were recorded from the block while it was still
// written inline in processLoadedProject, and have not changed since: the same 26 observations hold for the moved code.
process.env.TZ = 'Europe/London';
const golden = require('./_helpers/trackerLoadSessions.golden.json');
const { CASES, NOW, observe } = require('./_helpers/trackerLoadSessionsObserve');
const { browserScripts } = require('./_helpers/browserScripts');
const { loadSource } = require('./_helpers/loadSource');

const scope = browserScripts(['helpers.js'], {
  addEventListener() {}, console, document: { addEventListener() {} }, navigator: {}, localStorage: { getItem: () => null },
});
const { rebuildLoadedSessions, readPendingSessions } = scope;
const fixedNow = () => new Date(NOW);

// What processLoadedProject does around the call: read the backup, tolerate a bad one, rebuild.
function load(project, pattern, pending, key) {
  const store = {};
  if (pending !== undefined) store[key !== undefined ? key : 'cs_pending_session_' + (project.id || '')] = pending;
  const storage = { getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) };
  let pendingSessions = null;
  try { pendingSessions = readPendingSessions(storage, project.id); } catch (_) {}
  return rebuildLoadedSessions(project, { pattern, pendingSessions, now: fixedNow });
}

describe('session rebuild on project load', () => {
  CASES.forEach((c) => {
    test(c.name, () => {
      expect(observe(c, load)).toEqual(golden[c.name]);
    });
  });
  test('every recorded case is still exercised', () => {
    expect(Object.keys(golden)).toEqual(CASES.map((c) => c.name));
  });
});

describe('rebuildLoadedSessions', () => {
  const session = (over) => Object.assign({ id: 'a', startTime: '2026-03-01T09:00:00.000Z', netStitches: 2, totalAtEnd: 2 }, over);

  test('does not read the pattern unless a session lacks totalAtEnd', () => {
    const trap = { filter() { throw new Error('pattern read'); } };
    expect(() => rebuildLoadedSessions({ statsSessions: [session()] }, { pattern: trap })).not.toThrow();
    expect(() => rebuildLoadedSessions({ statsSessions: [session({ totalAtEnd: undefined })] }, { pattern: trap })).toThrow('pattern read');
  });

  test('returns a new array and leaves project.statsSessions alone, but patches its session objects', () => {
    const s = session({ totalAtEnd: undefined, durationMinutes: 3 });
    const project = { statsSessions: [s] };
    const out = rebuildLoadedSessions(project, { pattern: [{ id: '310' }] });
    expect(out).not.toBe(project.statsSessions);
    expect(project.statsSessions).toEqual([s]);
    expect(out[0]).toBe(s);
    expect(s.totalAtEnd).toBe(1);
    expect(s.durationSeconds).toBe(180);
  });

  test('appending a pending session does not touch the project array', () => {
    const project = { statsSessions: [session()] };
    const out = rebuildLoadedSessions(project, { pattern: [], pendingSessions: [session({ id: 'b' })] });
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
    expect(project.statsSessions.length).toBe(1);
  });

  test('defaults the clock to the real one', () => {
    const before = Date.now(), hour = 3600 * 1000;
    const [legacy] = rebuildLoadedSessions({ totalTime: 60 }, { pattern: [] });
    // With no usable dates the session is dated a calendar day back (23 to 25 hours, across a clock change).
    expect(Date.parse(legacy.startTime)).toBeGreaterThanOrEqual(before - 25 * hour - 5000);
    expect(Date.parse(legacy.startTime)).toBeLessThanOrEqual(before - 23 * hour + 5000);
  });
});

describe('readPendingSessions', () => {
  const at = (value) => ({ getItem: (k) => (k === 'cs_pending_session_p1' ? value : null) });
  test('null when there is no backup', () => {
    expect(readPendingSessions(at(null), 'p1')).toBeNull();
    expect(readPendingSessions(at(''), 'p1')).toBeNull();
    expect(readPendingSessions(at('[]'), 'other')).toBeNull();
  });
  test('an array is returned as it was parsed, a lone object is wrapped', () => {
    expect(readPendingSessions(at('[{"id":"a"}]'), 'p1')).toEqual([{ id: 'a' }]);
    expect(readPendingSessions(at('{"id":"a"}'), 'p1')).toEqual([{ id: 'a' }]);
  });
  test('an entry that is not JSON throws for the caller to swallow', () => {
    expect(() => readPendingSessions(at('{nope'), 'p1')).toThrow();
  });
  test('a project without an id uses the bare key', () => {
    expect(readPendingSessions({ getItem: (k) => (k === 'cs_pending_session_' ? '[1]' : null) }, undefined)).toEqual([1]);
  });
});

describe('processLoadedProject uses them', () => {
  const src = loadSource('tracker-app.js');
  test('the inline block is gone and the call keeps its place between the work-area setters and the deleted-session filter', () => {
    expect(src).not.toContain('sess_legacy');
    expect(src).not.toContain('Migrated from legacy total time');
    const call = src.indexOf('var rawStatsSessions=rebuildLoadedSessions(project,{pattern:restored,pendingSessions:pendingSessions});');
    expect(call).toBeGreaterThan(src.indexOf('if(project.colourSequence)setColourSequence(project.colourSequence);'));
    expect(call).toBeLessThan(src.indexOf('deletedSessionIdsRef.current=Array.isArray(project.deletedSessionIds)'));
    expect(call).toBeLessThan(src.indexOf('setStatsSessions(rawStatsSessions);'));
  });
  test('a backup that cannot be read is swallowed, as it was when the read sat inside the block', () => {
    expect(src).toContain('try{pendingSessions=readPendingSessions(localStorage,project.id);}catch(_){}');
  });
});
