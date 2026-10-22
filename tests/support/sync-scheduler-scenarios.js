// Scenarios for the sync engine's scheduling and lifecycle behaviour, written against the public SyncEngine facade
// only. Each takes `make(opts)` (see sync-scheduler-harness.js) and returns the recorded trace lines. The Jest suite
// compares them with tests/fixtures/syncScheduler.golden.json, which was captured from the engine BEFORE the export
// scheduler was extracted; reports/cleanup-20/differential.cjs replays them against any two revisions.
const { createLocks } = require('./sync-scheduler-harness');

const exported = env => env.count(/event cs:syncStatusChanged \{"reason":"exported"\}/);
async function untilExported(env, n) { await env.until(() => exported(env) >= n, 'export #' + n); await env.flush(); }
async function untilWriting(env, n) { await env.until(() => env.handle.__control.writes >= n, 'write #' + n); }
const summary = env => 'diagnostics ' + JSON.stringify(env.SE.getDiagnostics()) + ' status.watching=' + env.SE.getSyncStatus().watching;
const pending = env => 'pending-timers ' + JSON.stringify(env.clock.pending()) + ' visibility-listeners=' + env.visListeners.length;

const scenarios = {
  // One save after a quiet period: debounce, permission probe, write, completion event.
  async 'single save exports once after the fast delay'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching(); env.trace.push('-- trigger');
    env.SE.triggerAutoExport();
    await env.flush(); await env.clock.advance(1999); env.trace.push('-- not yet');
    await env.clock.advance(1); await untilExported(env, 1);
    await env.clock.advance(120000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // A paint stroke: many saves before the timer fires collapse into one timer and one write.
  async 'a burst of saves coalesces into one write'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching(); env.trace.push('-- burst');
    for (let i = 0; i < 6; i++) { env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(100); }
    await env.clock.advance(1400); await untilExported(env, 1);
    await env.clock.advance(60000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // Saves while a write is running are held back, then become exactly one follow-up once the cooldown has passed.
  async 'saves during a write queue exactly one follow-up measured from the write start'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    const gate = env.gateWrites();
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilWriting(env, 1);
    env.trace.push('-- saves while in flight');
    for (let i = 0; i < 4; i++) { env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(1000); }
    env.trace.push('-- release'); gate.release(); await untilExported(env, 1);
    env.ungateWrites();
    await env.clock.advanceToNext(); await untilExported(env, 2);
    await env.clock.advance(60000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // A slow write that outlasts the cooldown: the queued save is rescheduled on the fast path.
  async 'a write slower than the cooldown reschedules on the fast delay'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    const gate = env.gateWrites();
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilWriting(env, 1);
    env.SE.triggerAutoExport(); await env.flush();
    await env.clock.advance(45000);
    env.trace.push('-- release'); gate.release(); await untilExported(env, 1);
    env.ungateWrites();
    await env.clock.advance(2000); await untilExported(env, 2);
    await env.clock.advance(60000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // A save a long time after the previous write starts on the fast path again.
  async 'a save after the cooldown uses the fast delay'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilExported(env, 1);
    await env.clock.advance(10000); env.trace.push('-- save inside the cooldown');
    env.SE.triggerAutoExport(); await env.flush();
    await env.clock.advance(20000); await untilExported(env, 2);
    await env.clock.advance(31000); env.trace.push('-- save after the cooldown');
    env.SE.triggerAutoExport(); await env.flush();
    await env.clock.advance(2000); await untilExported(env, 3);
    await env.clock.advance(60000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // A failed write reports through the error channel, still settles, and still counts towards the cooldown.
  async 'a failed write reports, settles and keeps the cooldown'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    const gate = env.gateWrites();
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilWriting(env, 1);
    env.SE.triggerAutoExport(); await env.flush();
    env.trace.push('-- fail'); gate.fail(new Error('disk full'));
    await env.until(() => env.count(/event cs:syncError/) >= 1, 'syncError'); await env.flush();
    env.ungateWrites();
    await env.clock.advance(29999); env.trace.push('-- not yet');
    await env.clock.advance(1); await untilExported(env, 1);
    env.trace.push('status.lastError=' + JSON.stringify(env.SE.getSyncStatus().lastError && env.SE.getSyncStatus().lastError.message));
    env.trace.push(pending(env));
    return env.trace;
  },

  // Revoked write permission: warned once per minute, never consumes the cooldown, never writes.
  async 'revoked permission warns at most once a minute and keeps the fast delay'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    env.handle.__control.perm = 'prompt';
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await env.flush();
    env.trace.push('-- second attempt inside the minute');
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await env.flush();
    await env.clock.advance(58000); env.trace.push('-- after the minute');
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await env.flush();
    env.trace.push('-- permission back');
    env.handle.__control.perm = 'granted';
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilExported(env, 1);
    env.trace.push('writes=' + env.handle.__control.writes);
    env.trace.push(pending(env));
    return env.trace;
  },

  // Disconnecting before the timer fires: the timer is not cancelled, it finds no folder and ends quietly.
  async 'disconnecting before the timer fires leaves no work and no timers'(make) {
    const env = make();
    await env.connect();
    env.SE.triggerAutoExport(); await env.flush();
    env.trace.push('-- disconnect'); await env.SE.clearWatchDirectory(); await env.flush();
    await env.clock.advance(2000); await env.flush();
    env.trace.push('-- save while disconnected');
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(60000); await env.flush();
    env.trace.push('writes=' + env.handle.__control.writes + ' autoSync=' + env.SE.isAutoSyncEnabled());
    env.trace.push(pending(env));
    return env.trace;
  },

  // Auto-sync switched off: nothing is scheduled, but a pending timer and a queued save still run (no re-check).
  async 'switching auto-sync off schedules nothing new but does not cancel what is pending'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    env.SE.setAutoSyncEnabled(false);
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(5000); await env.flush();
    env.trace.push('-- enabled'); env.SE.setAutoSyncEnabled(true);
    env.SE.triggerAutoExport(); await env.flush();
    env.trace.push('-- disabled while the timer is pending'); env.SE.setAutoSyncEnabled(false);
    await env.clock.advance(2000); await untilExported(env, 1);
    env.trace.push('-- queued save then disable while in flight'); env.SE.setAutoSyncEnabled(true);
    const gate = env.gateWrites();
    await env.clock.advance(30000);
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilWriting(env, 2);
    env.SE.triggerAutoExport(); await env.flush(); env.SE.setAutoSyncEnabled(false);
    gate.release(); await untilExported(env, 2); env.ungateWrites();
    await env.clock.advanceToNext(); await untilExported(env, 3);
    await env.clock.advance(60000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // Changing the folder while a write is running: the running write keeps its handle, the follow-up uses the new one.
  async 'changing folder mid-write keeps the running handle and queues the follow-up on the new one'(make) {
    const env = make();
    await env.connect(); env.SE.stopWatching();
    const gate = env.gateWrites();
    env.SE.triggerAutoExport(); await env.flush(); await env.clock.advance(2000); await untilWriting(env, 1);
    env.SE.triggerAutoExport(); await env.flush();
    env.trace.push('-- second folder');
    const other = Object.create(Object.getPrototypeOf(env.handle), {}); // shares the recording methods
    other.name = 'Other'; other.kind = 'directory';
    Object.defineProperty(other, '__control', { value: env.handle.__control, enumerable: false });
    await env.SE.setWatchDirectory(other); env.SE.stopWatching(); await env.flush();
    gate.release(); await untilExported(env, 1); env.ungateWrites();
    await env.clock.advanceToNext(); await untilExported(env, 2);
    env.trace.push('watchDirName=' + env.SE.getSyncStatus().watchDirName);
    await env.clock.advance(60000); await env.flush();
    env.trace.push(pending(env));
    return env.trace;
  },

  // Start, stop, restart: one interval, one visibility listener, an immediate tick each time.
  async 'watcher start stop and restart keep exactly one interval and listener'(make) {
    const env = make();
    await env.connect();
    await env.clock.advance(25000); await env.flush();
    env.trace.push('-- restart twice'); env.SE.startWatching(); await env.flush(); env.SE.startWatching(); await env.flush();
    env.trace.push('isWatching=' + env.SE.isWatching() + ' ' + pending(env));
    await env.clock.advance(10000); await env.flush();
    env.trace.push('-- hidden'); env.setVisibility('hidden'); await env.clock.advance(20000); await env.flush();
    env.trace.push('-- visible again'); env.setVisibility('visible'); await env.flush();
    env.trace.push('-- stop'); env.SE.stopWatching(); env.SE.stopWatching(); await env.flush();
    await env.clock.advance(60000); await env.flush();
    env.trace.push('isWatching=' + env.SE.isWatching() + ' ' + pending(env));
    env.trace.push(summary(env));
    env.trace.push('-- custom interval');
    env.SE.startWatching(3000); await env.flush(); await env.clock.advance(6000); await env.flush();
    env.SE.stopWatching();
    env.trace.push(pending(env));
    return env.trace;
  },

  // A tick that is still scanning when the next interval arrives (and when the user returns to the tab) is dropped.
  async 'an overlapping watcher tick is dropped while one is scanning'(make) {
    const env = make();
    const gate = env.gateScans();
    await env.connect(); env.trace.push('-- ticks while scanning');
    await env.clock.advance(30000); env.setVisibility('hidden'); env.setVisibility('visible'); await env.flush();
    env.trace.push('-- finish'); gate.release(); await env.flush();
    env.handle.__control.valuesGate = null;
    await env.clock.advance(10000); await env.flush();
    env.SE.stopWatching();
    env.trace.push(summary(env)); env.trace.push(pending(env));
    return env.trace;
  },

  // Permission loss is announced once per loss, and re-granting restarts the watcher and re-arms the announcement.
  async 'permission loss is announced once and reconnect restarts the watcher'(make) {
    const env = make();
    await env.connect();
    env.handle.__control.perm = 'prompt';
    await env.clock.advance(30000); await env.flush();
    env.trace.push('-- reconnect'); env.handle.__control.requestResult = 'granted';
    const result = await env.SE.requestFolderPermission(); await env.flush();
    env.trace.push('result=' + result + ' isWatching=' + env.SE.isWatching());
    await env.clock.advance(10000); await env.flush();
    env.trace.push('-- lost again'); env.handle.__control.perm = 'prompt'; env.handle.__control.requestResult = null;
    await env.clock.advance(20000); await env.flush();
    env.SE.stopWatching();
    env.trace.push(summary(env)); env.trace.push(pending(env));
    return env.trace;
  },

  // A scan error is reported through the same channel, once per failing tick, without stopping the interval.
  async 'a failing watcher tick reports and keeps polling'(make) {
    const env = make();
    await env.connect();
    env.handle.__control.valuesGate = () => Promise.reject(new Error('listing failed'));
    await env.clock.advance(20000); await env.flush();
    env.handle.__control.valuesGate = null;
    await env.clock.advance(10000); await env.flush();
    env.SE.stopWatching();
    env.trace.push(summary(env)); env.trace.push(pending(env));
    return env.trace;
  },

  // Two tabs on one origin: the import lock lets only one scan at a time; export has no lock and both may write.
  async 'two tabs share the import lock while both can schedule exports'(make) {
    const locks = createLocks();
    const a = make({ locks, deviceId: 'device_A', handleName: 'Shared' });
    const b = make({ locks, deviceId: 'device_A', handleName: 'Shared' });
    const gate = a.gateScans();
    await a.connect(); await b.connect();
    a.trace.push('-- tab A is scanning'); b.trace.push('-- tab A is scanning');
    await a.clock.advance(10000); await b.clock.advance(10000); await a.flush();
    a.trace.push('lock requests=' + locks.state.requests);
    gate.release(); await a.flush();
    a.SE.stopWatching(); b.SE.stopWatching();
    a.trace.push('-- both tabs save');
    a.SE.triggerAutoExport(); b.SE.triggerAutoExport(); await a.flush();
    await a.clock.advance(2000); await b.clock.advance(2000); await untilExported(a, 1); await untilExported(b, 1);
    a.trace.push(summary(a)); b.trace.push(summary(b));
    return ['[A]'].concat(a.trace, ['[B]'], b.trace);
  }
};

module.exports = scenarios;
