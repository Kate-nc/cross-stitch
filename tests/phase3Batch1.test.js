/**
 * Phase 3 batch 1 (tracking audit STATS-06): sessions can be edited, deleted and merged, every dependent figure follows
 * from the corrected list, Undo is exact, and a sync neither resurrects a deletion nor loses the later edit.
 */
process.env.TZ = 'Europe/London';
const fs = require('fs');
const path = require('path');
const PU = require('../progress-units.js');
global.ProgressUnits = PU;
eval(fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8'));
global.window = global.window || {};
global.pako = require('pako');
global.indexedDB = undefined;
global.ProjectStorage = { listProjects: async () => [], get: async () => null, save: async p => p.id };
const SE = require('../sync-engine.js');

const TOTAL = 1600;
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
// days ago: [stitches, minutes]
const PLAN = { 24: [100, 40], 23: [120, 45], 22: [90, 30], 17: [200, 70], 10: [80, 30], 3: [300, 100], 1: [140, 45] };
function fixture() {
  let total = 50;                                   // 50 stitches were done before the first session
  return Object.keys(PLAN).map(Number).sort((a, b) => b - a).map(k => {
    const [n, m] = PLAN[k];
    const d = new Date(2026, 9, 11 - k, 20, 0, 0);
    total += n;
    return { id: 'sess_h' + k, date: ymd(d), startTime: d.toISOString(), endTime: new Date(d.getTime() + m * 60000).toISOString(),
      durationSeconds: m * 60, durationMinutes: m, stitchesCompleted: n, stitchesUndone: 0, netStitches: n,
      totalAtEnd: total, percentAtEnd: Math.round(total / TOTAL * 1000) / 10, note: '', coloursWorked: [] };
  });
}
const sum = list => list.reduce((a, s) => a + PU.sessionAdded(s), 0);
const find = (list, id) => list.find(s => s.id === id);

describe('delete', () => {
  test('removes the session and lowers every later total by its stitches; the starting point is kept', () => {
    const before = fixture();
    const r = deleteSessionRun(before, 'sess_h10', TOTAL);
    expect(r.removedIds).toEqual(['sess_h10']);
    expect(r.sessions).toHaveLength(6);
    expect(find(r.sessions, 'sess_h17').totalAtEnd).toBe(find(before, 'sess_h17').totalAtEnd);   // earlier: unchanged
    expect(find(r.sessions, 'sess_h3').totalAtEnd).toBe(find(before, 'sess_h3').totalAtEnd - 80);
    expect(find(r.sessions, 'sess_h1').totalAtEnd).toBe(find(before, 'sess_h1').totalAtEnd - 80);
    expect(find(r.sessions, 'sess_h1').percentAtEnd).toBe(Math.round(find(r.sessions, 'sess_h1').totalAtEnd / TOTAL * 1000) / 10);
    expect(sum(r.sessions)).toBe(sum(before) - 80);
  });
  test('does not change the list it was given (Undo is exact)', () => {
    const before = fixture();
    const copy = JSON.stringify(before);
    deleteSessionRun(before, 'sess_h10', TOTAL);
    editSessionRecord(before, 'sess_h10', { minutes: 5 }, TOTAL);
    mergeSessionRecords(before, 'sess_h23', TOTAL);
    expect(JSON.stringify(before)).toBe(copy);
  });
  test('first, last and every session; an empty list still reads sensibly', () => {
    let list = fixture();
    list = deleteSessionRun(list, 'sess_h24', TOTAL).sessions;           // the first
    expect(list[0].id).toBe('sess_h23');
    expect(list[0].totalAtEnd).toBe(50 + 120);                           // the starting point (50) is still there
    list = deleteSessionRun(list, 'sess_h1', TOTAL).sessions;            // the last
    expect(list[list.length - 1].id).toBe('sess_h3');
    for (const id of list.map(s => s.id)) list = deleteSessionRun(list, id, TOTAL).sessions;
    expect(list).toEqual([]);
    expect(computeStreaks(list, 0)).toEqual({ current: 0, longest: 0 });
    expect(getMilestones(list, 0, TOTAL).every(m => !m.achievedDate)).toBe(true);
  });
  test('a run that crossed the day end is deleted as one run (all its day records)', () => {
    const list = fixture();
    list.push({ id: 'sess_x', groupId: 'sess_x', date: '2026-10-09', startTime: new Date(2026, 9, 9, 23, 0).toISOString(), endTime: new Date(2026, 9, 9, 23, 59).toISOString(), durationSeconds: 3000, stitchesCompleted: 30, stitchesUndone: 0, netStitches: 30, totalAtEnd: 1000, percentAtEnd: 0 });
    list.push({ id: 'sess_x_d2', groupId: 'sess_x', date: '2026-10-10', startTime: new Date(2026, 9, 10, 0, 0).toISOString(), endTime: new Date(2026, 9, 10, 0, 30).toISOString(), durationSeconds: 1800, stitchesCompleted: 20, stitchesUndone: 0, netStitches: 20, totalAtEnd: 1020, percentAtEnd: 0 });
    const r = deleteSessionRun(list, 'sess_x_d2', TOTAL);
    expect(r.removedIds.sort()).toEqual(['sess_x', 'sess_x_d2']);
    expect(r.sessions.find(s => s.groupId === 'sess_x')).toBeUndefined();
  });
  test('week total, best day, milestones and the streak follow the corrected list', () => {
    const before = fixture();
    const after = deleteSessionRun(before, 'sess_h3', TOTAL).sessions;             // the 300-stitch day
    const best = list => Math.max(...Object.values(list.reduce((m, s) => (m[s.date] = (m[s.date] || 0) + PU.sessionAdded(s), m), {})));
    expect(best(before)).toBe(300);
    expect(best(after)).toBe(200);
    // the day a milestone was reached moves: 25% of 1600 is 400
    const at = list => getMilestones(list, 1000, TOTAL).find(m => m.percent === 25).achievedDate;
    expect(at(before)).toBe(find(before, 'sess_h17').date);                        // 50+100+120+90+200 = 560 >= 400 on day 17
    expect(at(after)).toBe(at(before));
    expect(getMilestones(after, 1000, TOTAL).find(m => m.percent === 50).achievedDate).not.toBe(getMilestones(before, 1000, TOTAL).find(m => m.percent === 50).achievedDate);
    expect(computeStreaks(after, 0).longest).toBeLessThanOrEqual(computeStreaks(before, 0).longest);
  });
});

describe('edit', () => {
  test('moving the date moves its stitches between days and everything is rebuilt', () => {
    const before = fixture();
    const r = editSessionRecord(before, 'sess_h10', { date: '2026-10-02' }, TOTAL, '2026-10-12T09:00:00.000Z');
    const s = find(r.sessions, 'sess_h10');
    expect(s.date).toBe('2026-10-02');
    expect(s.edited).toBe(true);
    expect(s.editedAt).toBe('2026-10-12T09:00:00.000Z');
    expect(new Date(s.startTime).getDate()).toBe(2);
    expect(r.sessions.filter(x => x.date === '2026-10-01')).toHaveLength(0);
    // moved earlier than the 17-days-ago session? No: the 10-days-ago one stays after day 17 (24 Sep), so order holds
    expect(sum(r.sessions)).toBe(sum(before));
  });
  test('changing minutes and stitches updates the duration, the basis and every later total', () => {
    const before = fixture();
    const r = editSessionRecord(before, 'sess_h17', { minutes: 20, stitches: 150 }, TOTAL);
    const s = find(r.sessions, 'sess_h17');
    expect(s.durationSeconds).toBe(1200);
    expect(s.timingBasis).toBe('edited');
    expect(PU.sessionNet(s)).toBe(150);
    expect(find(r.sessions, 'sess_h1').totalAtEnd).toBe(find(before, 'sess_h1').totalAtEnd - 50);
    expect(getSessionSeconds(s)).toBe(1200);
  });
  test('editing only the stitches leaves the time basis alone', () => {
    const r = editSessionRecord(fixture(), 'sess_h17', { stitches: 150 }, TOTAL);
    expect(find(r.sessions, 'sess_h17').timingBasis).toBeUndefined();
  });
  test('refuses values that are not usable', () => {
    const l = fixture();
    expect(editSessionRecord(l, 'sess_h17', { date: '10/10/2026' }, TOTAL).error).toMatch(/date/i);
    expect(editSessionRecord(l, 'sess_h17', { minutes: -3 }, TOTAL).error).toMatch(/minutes/i);
    expect(editSessionRecord(l, 'sess_h17', { minutes: NaN }, TOTAL).error).toMatch(/minutes/i);
    expect(editSessionRecord(l, 'sess_h17', { stitches: 2.3 }, TOTAL).error).toMatch(/stitches/i);
    expect(editSessionRecord(l, 'sess_h17', { start: '25:00' }, TOTAL).error).toMatch(/time/i);
    expect(editSessionRecord(l, 'nope', {}, TOTAL).error).toBeTruthy();
  });
  test('catch-up stays no larger than the stitches', () => {
    const l = fixture(); l[2] = Object.assign({}, l[2], { unitsCompleted: 90, units: 90, catchUp: 60 });
    const s = find(editSessionRecord(l, l[2].id, { stitches: 40 }, TOTAL).sessions, l[2].id);
    expect(PU.sessionCatchUp(s)).toBe(40);
    expect(PU.sessionAdded(s)).toBe(0);
  });
});

describe('merge', () => {
  function sameDay() {
    const l = fixture();
    l.push({ id: 'sess_b', date: l[l.length - 1].date, startTime: new Date(2026, 9, 10, 21, 30).toISOString(), endTime: new Date(2026, 9, 10, 22, 0).toISOString(), durationSeconds: 1800, durationMinutes: 30, stitchesCompleted: 40, stitchesUndone: 5, netStitches: 35, totalAtEnd: l[l.length - 1].totalAtEnd + 35, percentAtEnd: 0, note: 'later', coloursWorked: ['310'], catchUp: 10, unitsCompleted: 40, unitsUndone: 5, units: 35 });
    return l;
  }
  test('folds the next session of the same day into this one', () => {
    const before = sameDay();
    const r = mergeSessionRecords(before, 'sess_h1', TOTAL);
    expect(r.removedIds).toEqual(['sess_b']);
    const m = find(r.sessions, 'sess_h1');
    expect(PU.sessionNet(m)).toBe(140 + 35);
    expect(PU.sessionUnpicked(m)).toBe(5);
    expect(PU.sessionCatchUp(m)).toBe(10);
    expect(PU.sessionAdded(m)).toBe(140 + 40 - 10);
    expect(getSessionSeconds(m)).toBe(45 * 60 + 1800);
    expect(m.note).toBe('later');
    expect(m.coloursWorked).toEqual(['310']);
    expect(r.sessions.some(s => s.id === 'sess_b')).toBe(false);
    expect(sum(r.sessions)).toBe(sum(before));
  });
  test('offers nothing when the next session is on another day', () => {
    expect(sessionMergeTarget(fixture(), 'sess_h24')).toBeNull();
    expect(mergeSessionRecords(fixture(), 'sess_h24', TOTAL).error).toBeTruthy();
    expect(sessionMergeTarget(sameDay(), 'sess_h1').id).toBe('sess_b');
  });
});

describe('tombstones', () => {
  test('withoutDeletedSessions drops them, including a stale copy that comes back', () => {
    const l = fixture();
    expect(withoutDeletedSessions(l, ['sess_h10', 'sess_h3']).map(s => s.id)).not.toContain('sess_h10');
    expect(withoutDeletedSessions(l, [])).toBe(l);
  });
});

describe('sync merge', () => {
  test('a deletion on one device is not undone by the other', () => {
    const base = fixture();
    const deleted = deleteSessionRun(base, 'sess_h10', TOTAL);
    const mine = { statsSessions: deleted.sessions, deletedSessionIds: deleted.removedIds, stitchLog: [] };
    const theirs = { statsSessions: base, stitchLog: [{ date: base[4].date, count: 80 }] };
    const merged = SE.mergeTrackingProgress(Object.assign({ done: [], halfDone: {}, sessions: [] }, mine), Object.assign({ done: [], halfDone: {}, sessions: [] }, theirs));
    expect(merged.statsSessions.map(s => s.id)).not.toContain('sess_h10');
    expect(merged.deletedSessionIds).toEqual(['sess_h10']);
    expect(merged.stitchLog.find(e => e.date === base[4].date)).toBeUndefined();
    // and the other way round, and merging again changes nothing
    const back = SE.mergeTrackingProgress(Object.assign({ done: [], halfDone: {}, sessions: [] }, theirs), Object.assign({ done: [], halfDone: {}, sessions: [] }, mine));
    expect(back.statsSessions.map(s => s.id)).not.toContain('sess_h10');
    const again = SE.mergeTrackingProgress(merged, mine);
    expect(again.statsSessions).toHaveLength(merged.statsSessions.length);
  });
  test('the later edit wins whichever side it is on, and an unedited record keeps the local one', () => {
    const base = fixture();
    const a = editSessionRecord(base, 'sess_h17', { minutes: 20 }, TOTAL, '2026-10-12T09:00:00.000Z').sessions;
    const b = editSessionRecord(base, 'sess_h17', { minutes: 99 }, TOTAL, '2026-10-12T10:00:00.000Z').sessions;
    expect(getSessionSeconds(find(SE.mergeSessions(a, b), 'sess_h17'))).toBe(99 * 60);
    expect(getSessionSeconds(find(SE.mergeSessions(b, a), 'sess_h17'))).toBe(99 * 60);
    expect(SE.mergeSessions(base, base)).toHaveLength(base.length);
  });
  test('two different sessions with the same figures are both kept (they have different ids)', () => {
    const x = { id: 'a', date: '2026-10-01', durationMinutes: 30, netStitches: 10, startTime: '2026-10-01T10:00:00Z' };
    const y = { id: 'b', date: '2026-10-01', durationMinutes: 30, netStitches: 10, startTime: '2026-10-01T18:00:00Z' };
    expect(SE.mergeSessions([x], [y])).toHaveLength(2);
  });
});

describe('edit keeps the real start when only the minutes or stitches change', () => {
  test('a session after midnight that belongs to the day before stays where it was', () => {
    const l = fixture();
    const late = { id: 'sess_late', date: '2026-10-09', startTime: new Date(2026, 9, 10, 1, 30).toISOString(), endTime: new Date(2026, 9, 10, 2, 0).toISOString(), durationSeconds: 1800, stitchesCompleted: 10, stitchesUndone: 0, netStitches: 10, totalAtEnd: 999, percentAtEnd: 0 };
    l.push(late);
    const r = editSessionRecord(l, 'sess_late', { date: '2026-10-09', start: '01:30', minutes: 45, stitches: 10 }, TOTAL);
    const s = find(r.sessions, 'sess_late');
    expect(s.startTime).toBe(late.startTime);
    expect(s.endTime).toBe(new Date(2026, 9, 10, 2, 15).toISOString());
    expect(s.date).toBe('2026-10-09');
  });
});
