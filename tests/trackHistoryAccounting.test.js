const fs = require('fs');
const vm = require('vm');
const PU = require('../progress-units');
const source = fs.readFileSync('tracker-app.js', 'utf8');

function historyHarness(session) {
  const c = { Map, Set, Uint8Array, window: {}, TRACK_HISTORY_MAX: 50,
    trackHistoryRef: { current: [] }, redoStackRef: { current: [] },
    halfDoneRef: { current: new Map() }, halfStitches: new Map([[2, { fwd: { id: '310' }, bck: { id: '550' } }]]),
    doneRef: { current: new Uint8Array(6) }, pat: Array(6).fill({ id: '310' }),
    pendingColoursRef: { current: new Set() }, skipNextFullRedrawRef: {},
    lastBulkEntryRef: {}, paintDoneChanges() {}, renderStitch() {},
    applyHalfDoneDelta() {}, recomputeAllCounts() {}, applyDoneCountsDelta() {}, setDone(v) { c.doneRef.current = v; },
    correctHistoryActivity: session ? session.correctHistoryActivity : () => {},
    recordAutoActivity: session ? session.recordAutoActivity : () => {},
  };
  for (const name of ['TrackHistory', 'RedoStack', 'HalfDone']) {
    const ref = name[0].toLowerCase() + name.slice(1) + 'Ref';
    c['set' + name] = update => { c[ref].current = typeof update === 'function' ? update(c[ref].current) : update; };
  }
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function _historyChanges('), source.indexOf('// --- V2 Edit functions ---')), c);
  vm.runInContext(source.slice(source.indexOf('function setHalfHistoryState('), source.indexOf('function _markHalfDoneFromDisambig(')), c);
  return c;
}

test('QA-05: half is the latest undo, preserves its other direction, and invalidates redo', () => {
  const c = historyHarness();
  c.pushTrackHistory([{ idx: 0, oldVal: 0 }]); c.doneRef.current[0] = 1;
  c._toggleHalfDone(2, 'fwd'); c._toggleHalfDone(2, 'bck');
  c.undoTrack();
  expect(c.halfDoneRef.current.get(2)).toEqual({ fwd: 1, bck: 0 });
  expect(c.doneRef.current[0]).toBe(1);
  c.redoTrack(); expect(c.halfDoneRef.current.get(2).bck).toBe(1);
  c.undoTrack(); c._toggleHalfDone(2, 'fwd');
  expect(c.redoStackRef.current).toHaveLength(0);
  expect(c.halfDoneRef.current.size).toBe(0);
});

test('half history respects the shared limit; rapid operations use current marks and stacks', () => {
  const c = historyHarness();
  for (let i = 0; i < 60; i++) c._toggleHalfDone(2, 'fwd');
  expect(c.trackHistoryRef.current).toHaveLength(50);
  for (let i = 0; i < 50; i++) c.undoTrack();
  expect(c.trackHistoryRef.current).toHaveLength(0);
  for (let i = 0; i < 50; i++) c.redoTrack();
  expect(c.halfDoneRef.current.size).toBe(0);
  expect(c.redoStackRef.current).toHaveLength(0);
});

function sessionHarness() {
  const values = [];
  const React = {
    useRef: v => ({ current: v }), useEffect() {}, useMemo: fn => fn(),
    useState(v) { const i = values.length; values.push(typeof v === 'function' ? v() : v); return [values[i], u => { values[i] = typeof u === 'function' ? u(values[i]) : u; }]; }
  };
  const c = { window: { React, addEventListener() {} }, ProgressUnits: PU, Date, Math, Set, Map,
    navigator: {}, ProjectStorage: { saveSessionCheckpoint: () => Promise.resolve(), retireSessionCheckpoint: () => Promise.resolve() }, document: { hidden: false }, localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 1, clearTimeout() {}, getSessionSeconds: s => s.durationSeconds || 0 };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('helpers.js', 'utf8'), c);
  vm.runInContext(source.slice(source.indexOf('function normaliseTimingMode('), source.indexOf('// Derive current paused state')), c);
  vm.runInContext(fs.readFileSync('useAutoSession.js', 'utf8'), c);
  const projectIdRef = { current: 'proj_qa' };
  const api = c.window.useAutoSession({ projectIdRef, v3FieldsRef: { current: {} }, autoSaveDirtyRef: {}, statsSettings: { dayEndHour: 0 } });
  api.autoStatsRef.current = { doneUnits: 10, totalUnits: 100 };
  return { ...api, projectIdRef, saved: () => values[0], statistics: () => ({overview:c.computeOverviewStats(values[0],1,100),pace:c.computePace(values[0],0),streak:c.computeStreaks(values[0],0)}) };
}

beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-10-15T12:00:00Z') }); });
afterEach(() => jest.useRealTimers());

test('QA-13: repeated mark / Undo / Redo ends with exactly one addition, unchanged pace and streak activity', () => {
  const s = sessionHarness(), c = historyHarness(s);
  c.pushTrackHistory([{ idx: 0, oldVal: 0 }]); c.doneRef.current[0] = 1;
  for (let i = 0; i < 20; i++) { c.undoTrack(); c.redoTrack(); }
  jest.advanceTimersByTime(60000);
  s.finaliseAutoSessionRef.current();
  expect(s.saved()).toHaveLength(1);
  expect(s.saved()[0]).toMatchObject({ unitsCompleted: 1, unitsUndone: 0, units: 1 });
  expect(PU.sessionAdded(s.saved()[0])).toBe(1);
  expect(PU.sessionActive(s.saved()[0])).toBe(true);
  expect(s.saved()[0].durationSeconds).toBe(60);
  const stats=s.statistics();
  expect(stats.overview.stitchesPerHour).toBe(60);
  expect(stats.overview.activeDays).toBe(1);
  expect(stats.pace.perStitchingDay).toBe(1);
  expect(stats.streak).toEqual({current:1,longest:1});
});

test('bulk and catch-up contribution survives repeated history without becoming today\'s work', () => {
  const s = sessionHarness(), c = historyHarness(s);
  c.pushBulkToggleHistory([{ idx: 0, oldVal: 0 }, { idx: 1, oldVal: 0 }], 'range', true);
  c.doneRef.current[0] = c.doneRef.current[1] = 1;
  for (let i = 0; i < 5; i++) { c.undoTrack(); expect(Array.from(c.doneRef.current).reduce((a,b)=>a+b,0)).toBe(0); c.redoTrack(); }
  s.finaliseAutoSessionRef.current();
  expect(s.saved()[0]).toMatchObject({ unitsCompleted: 2, unitsUndone: 0, catchUp: 2, units: 2 });
  expect(PU.sessionAdded(s.saved()[0])).toBe(0);
  expect(PU.sessionActive(s.saved()[0])).toBe(false);
  const stats=s.statistics();
  expect(stats.overview.stitchesPerHour).toBe(0);
  expect(stats.overview.activeDays).toBe(0);
  expect(stats.pace.perStitchingDay).toBe(0);
  expect(stats.streak).toEqual({current:0,longest:0});
});

test('history corrects the original day in an open session, including unpick restoration', () => {
  const s = sessionHarness();
  const mark = s.recordAutoActivity(1, 0, 0.5, 0);
  const frog = s.recordAutoActivity(0, 1, 0, 0.5, 0, 'frog');
  jest.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  s.recordAutoActivity(1, 0);
  s.correctHistoryActivity(frog, false); // Putting work back cancels physical unpick, adds no stitching.
  s.correctHistoryActivity(mark, false);
  s.correctHistoryActivity(mark, true);
  s.finaliseAutoSessionRef.current();
  expect(s.saved()).toHaveLength(2);
  expect(s.saved()[0]).toMatchObject({ date: '2026-10-15', unitsCompleted: 0.5, unitsUndone: 0 });
  expect(s.saved()[1]).toMatchObject({ date: '2026-10-16', unitsCompleted: 1, unitsUndone: 0 });
});

test('history after finalisation updates only the original record; it never starts or charges another session', () => {
  const s = sessionHarness();
  const mark = s.recordAutoActivity(1, 0);
  s.finaliseAutoSessionRef.current();
  jest.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  s.recordAutoActivity(1, 0, 0.5, 0);
  s.correctHistoryActivity(mark, false);
  expect(s.saved()[0]).toMatchObject({ date: '2026-10-15', unitsCompleted: 0, units: 0 });
  expect(s.currentAutoSessionRef.current.unitsCompleted).toBe(0.5);
  s.correctHistoryActivity(mark, true);
  s.finaliseAutoSessionRef.current();
  expect(s.saved().map(x => x.unitsCompleted)).toEqual([1, 0.5]);
  expect(s.saved().map(PU.sessionAdded)).toEqual([1, 0.5]);
});

test('End session while undone still allows Redo to restore the original day without new activity', () => {
  const s = sessionHarness();
  const mark = s.recordAutoActivity(1, 0);
  s.correctHistoryActivity(mark, false);
  s.finaliseAutoSessionRef.current();
  jest.advanceTimersByTime(86400000);
  s.correctHistoryActivity(mark, true);
  expect(s.currentAutoSessionRef.current).toBeNull();
  expect(s.saved()[0]).toMatchObject({ date: '2026-10-15', unitsCompleted: 1, unitsUndone: 0 });
});

test('project switching and explicit journal edits cannot charge a different project or resurrect a deleted row', () => {
  const s = sessionHarness();
  const mark = s.recordAutoActivity(1, 0);
  s.finaliseAutoSessionRef.current();
  s.setStatsSessions([]);
  s.correctHistoryActivity(mark, false); s.correctHistoryActivity(mark, true);
  expect(s.saved()).toEqual([]);
  s.projectIdRef.current = 'proj_other';
  expect(s.correctHistoryActivity(mark, false)).toBe(false);
  expect(s.currentAutoSessionRef.current).toBeNull();
});

module.exports = { historyHarness, sessionHarness };

test('same-tick mark / Undo / new mark preserves both sides of activity instead of batching them away',()=>{
  const s=sessionHarness(),c=historyHarness(s);
  c._toggleHalfDone(2,'fwd');c.undoTrack();c._toggleHalfDone(2,'bck');
  s.finaliseAutoSessionRef.current();
  expect(s.saved()[0]).toMatchObject({unitsCompleted:0.5,unitsUndone:0,units:0.5});
  expect(c.redoStackRef.current).toHaveLength(0);
  expect(c.halfDoneRef.current.get(2)).toEqual({bck:1});
});

test('correcting a finalised physical unpick restores its original removal contribution without adding work',()=>{
  const s=sessionHarness();s.recordAutoActivity(2,0,1.5,0);
  const frog=s.recordAutoActivity(0,2,0,1.5,0,'frog');
  s.finaliseAutoSessionRef.current();const duration=s.saved()[0].durationSeconds;
  jest.advanceTimersByTime(86400000);
  s.correctHistoryActivity(frog,false);
  expect(s.saved()[0]).toMatchObject({unitsCompleted:1.5,unitsUndone:0,units:1.5,durationSeconds:duration});
  s.correctHistoryActivity(frog,true);s.correctHistoryActivity(frog,false);
  expect(s.saved()[0].unitsCompleted).toBe(1.5);expect(s.currentAutoSessionRef.current).toBeNull();
});

test('undoing an explicit journal edit cannot reattach an already skipped chart correction and double its additions',()=>{
  const s=sessionHarness();const mark=s.recordAutoActivity(1,0);s.finaliseAutoSessionRef.current();
  const original=s.saved()[0];
  s.setStatsSessions([{...original,note:'Explicit journal edit'}]);
  s.correctHistoryActivity(mark,false);
  expect(s.saved()[0].unitsCompleted).toBe(1);
  s.setStatsSessions([original]); // Undo that journal edit restores the old row object.
  s.correctHistoryActivity(mark,true);
  expect(s.saved()[0].unitsCompleted).toBe(1);
});

test('a correction updates cumulative progress in later day fragments without changing their additions',()=>{
  const s=sessionHarness();const mark=s.recordAutoActivity(1,0);
  jest.setSystemTime(new Date('2026-10-16T12:00:00Z'));s.recordAutoActivity(1,0,0.5,0);s.finaliseAutoSessionRef.current();
  const totals=s.saved().map(r=>r.totalAtEnd);
  s.correctHistoryActivity(mark,false);
  expect(s.saved().map(r=>r.totalAtEnd)).toEqual(totals.map(n=>n-1));
  expect(s.saved().map(r=>r.unitsCompleted)).toEqual([0,0.5]);
  s.correctHistoryActivity(mark,true);
  expect(s.saved().map(r=>r.totalAtEnd)).toEqual(totals);
  expect(s.saved().map(r=>r.unitsCompleted)).toEqual([1,0.5]);
});
