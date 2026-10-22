// Characterises the sync engine's scheduling and lifecycle: auto-export debounce/cooldown/in-flight exclusion, the
// folder watcher's interval and visibility handling, permission loss and reconnect, cancellation, settings changes
// and two tabs. The scenarios run the real sync scripts under a virtual clock (tests/support/sync-scheduler-*.js);
// the golden traces in tests/fixtures/syncScheduler.golden.json were captured from the engine before the export
// scheduler was moved into sync-export-scheduler.js, so these tests fail on any change to timing or ordering.
const golden = require('./fixtures/syncScheduler.golden.json');
const { runScenario, scenarioNames } = require('./support/sync-scheduler-run');
const fs = require('fs');
const path = require('path');

const read = f => { const p = path.join(__dirname, '..', f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const names = scenarioNames();
const traces = {};

beforeAll(async () => { for (const n of names) traces[n] = await runScenario(n, read); }, 60000);

test('the golden file and the scenario list agree', () => {
  expect(Object.keys(golden).sort()).toEqual(names.slice().sort());
});

describe('trace equals the recorded behaviour', () => {
  test.each(names)('%s', n => { expect(traces[n]).toEqual(golden[n]); });
});

const lines = (n, re) => traces[n].filter(l => re.test(l));
const after = (n, marker) => traces[n].slice(traces[n].indexOf(marker) + 1);

describe('invariants the traces rely on', () => {
  test('one save, one timer, one write', () => {
    const n = 'single save exports once after the fast delay';
    expect(lines(n, /setTimeout 2000$/)).toHaveLength(1);
    expect(lines(n, /handle\.write$/)).toHaveLength(1);
    expect(lines(n, /fire timeout/)).toEqual(['t+2000 fire timeout']);
  });

  test('a burst of saves arms one timer and writes once', () => {
    const n = 'a burst of saves coalesces into one write';
    expect(lines(n, /webdav\.changed/)).toHaveLength(6);
    expect(lines(n, /setTimeout/)).toHaveLength(1);
    expect(lines(n, /handle\.write$/)).toHaveLength(1);
  });

  test('saves during a write are held, then one follow-up is timed from the write start', () => {
    const n = 'saves during a write queue exactly one follow-up measured from the write start';
    expect(lines(n, /handle\.write$/)).toHaveLength(2);
    // Write started at 2000, completed at 6000: cooldown ends at 32000, so 26000 from completion.
    expect(lines(n, /setTimeout/).map(l => l.replace(/^t\+\d+ /, ''))).toEqual(['setTimeout 2000', 'setTimeout 26000']);
    expect(after(n, '-- saves while in flight').filter(l => /setTimeout/.test(l))).toHaveLength(1);
  });

  test('a queued save after a write that outlasted the cooldown is rescheduled on the fast delay', () => {
    const n = 'a write slower than the cooldown reschedules on the fast delay';
    expect(after(n, '-- release').filter(l => /setTimeout/.test(l)).map(l => l.replace(/^t\+\d+ /, ''))).toEqual(['setTimeout 2000']);
  });

  test('a failed write reports once, still settles, and the next attempt waits out the cooldown', () => {
    const n = 'a failed write reports, settles and keeps the cooldown';
    expect(lines(n, /event cs:syncError/)).toHaveLength(1);
    expect(after(n, '-- fail').filter(l => /setTimeout/.test(l)).map(l => l.replace(/^t\+\d+ /, ''))).toEqual(['setTimeout 30000']);
    expect(lines(n, /handle\.write$/)).toHaveLength(2);
  });

  test('revoked permission warns once a minute, never writes and never consumes the cooldown', () => {
    const n = 'revoked permission warns at most once a minute and keeps the fast delay';
    expect(lines(n, /warn SyncEngine\[auto-export\]: Write permission not granted/)).toHaveLength(2);
    expect(lines(n, /toast warning/)).toHaveLength(2);
    expect(lines(n, /setTimeout/).every(l => /setTimeout 2000$/.test(l))).toBe(true);
    expect(lines(n, /handle\.write$/)).toHaveLength(1);
  });

  test('a timer pending when the folder is disconnected fires, finds nothing to do and leaves nothing behind', () => {
    const n = 'disconnecting before the timer fires leaves no work and no timers';
    expect(lines(n, /handle\.write$/)).toHaveLength(0);
    expect(lines(n, /fire timeout/).length).toBeGreaterThanOrEqual(1);
    expect(traces[n]).toContain('writes=0 autoSync=false');
  });

  test('turning auto-sync off schedules nothing new but does not cancel what is already pending or queued', () => {
    const n = 'switching auto-sync off schedules nothing new but does not cancel what is pending';
    expect(lines(n, /handle\.write$/)).toHaveLength(3);
  });

  test('a folder change mid-write lets the running write finish and runs the follow-up', () => {
    const n = 'changing folder mid-write keeps the running handle and queues the follow-up on the new one';
    expect(lines(n, /handle\.write$/)).toHaveLength(2);
    expect(traces[n]).toContain('watchDirName=Other');
  });

  test('restarting the watcher never stacks intervals or visibility listeners', () => {
    const n = 'watcher start stop and restart keep exactly one interval and listener';
    expect(lines(n, /setInterval \d+$/).length).toBe(lines(n, /clearInterval$/).length);
    const added = lines(n, /document\.addEventListener/).length;
    const removed = lines(n, /document\.removeEventListener/).length;
    expect(added).toBe(removed);
    expect(traces[n]).toContain('isWatching=false pending-timers [] visibility-listeners=0');
  });

  test('an overlapping tick is dropped, not queued', () => {
    const n = 'an overlapping watcher tick is dropped while one is scanning';
    expect(lines(n, /handle\.values/)).toHaveLength(2);
  });

  test('permission loss is announced once per loss', () => {
    const n = 'permission loss is announced once and reconnect restarts the watcher';
    expect(lines(n, /event cs:syncPermissionNeeded/)).toHaveLength(2);
    expect(lines(n, /toast warning/)).toHaveLength(2);
  });

  test('two tabs: the second skips the import lock, both may export', () => {
    const n = 'two tabs share the import lock while both can schedule exports';
    expect(traces[n].filter(l => /handle\.write$/.test(l))).toHaveLength(2);
    expect(traces[n].some(l => /skipsLockHeld":2/.test(l))).toBe(true);
  });

  test('no scenario leaves a timer or a visibility listener behind', () => {
    for (const n of names) {
      const ends = traces[n].filter(l => /^pending-timers /.test(l));
      if (!ends.length) continue;
      expect(ends[ends.length - 1]).toBe('pending-timers [] visibility-listeners=0');
    }
  });
});
