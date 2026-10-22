// Replays seeded random sequences of sync lifecycle operations (saves, clock advances, slow/failed writes, permission
// loss and return, disconnect and reconnect, auto-sync toggling, watcher start/stop, tab visibility) against two
// revisions of the real sync scripts under the virtual clock, and requires the recorded traces to be identical.
//   node reports/cleanup-20/differential.cjs [base-ref] [sequences] [ops-per-sequence]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { createEnvironment } = require('../../tests/support/sync-scheduler-harness');
const root = path.join(__dirname, '..', '..');
const baseRef = process.argv[2] || 'ca971d4ca3e284eb1b6594615f052281ee795475';
const SEQUENCES = Number(process.argv[3] || 300), OPS = Number(process.argv[4] || 40);

const gitSource = f => { try { return execFileSync('git', ['show', baseRef + ':' + f], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } };
const treeSource = f => { const p = path.join(root, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
const sources = {};
for (const f of require('../../tests/support/sync-scheduler-harness').DEFAULT_FILES) sources[f] = { base: gitSource(f), head: treeSource(f) };
const reader = side => f => (sources[f] ? sources[f][side] : null);

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const ADVANCES = [50, 700, 1999, 2000, 5000, 9999, 10000, 25000, 29999, 30000, 31000, 61000];

async function play(side, seed) {
  const env = createEnvironment({ readSource: reader(side) });
  const r = rng(seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const ctl = env.handle.__control;
  let gate = null;
  const log = op => env.trace.push('## ' + op);
  await env.connect();
  for (let i = 0; i < OPS; i++) {
    const op = pick(['trigger', 'trigger', 'trigger', 'advance', 'advance', 'advance', 'next', 'gate', 'release', 'fail', 'permLoss', 'permBack',
      'disconnect', 'reconnect', 'autoOff', 'autoOn', 'watchStop', 'watchStart', 'hide', 'show', 'request']);
    log(op);
    try {
      if (op === 'trigger') env.SE.triggerAutoExport();
      else if (op === 'advance') { const ms = pick(ADVANCES); log('ms=' + ms); await env.clock.advance(ms); }
      else if (op === 'next') await env.clock.advanceToNext();
      else if (op === 'gate') { if (!gate) gate = env.gateWrites(); }
      else if (op === 'release') { if (gate) { gate.release(); gate = null; env.ungateWrites(); } }
      else if (op === 'fail') { if (gate) { gate.fail(new Error('boom')); gate = null; env.ungateWrites(); } }
      else if (op === 'permLoss') ctl.perm = 'prompt';
      else if (op === 'permBack') ctl.perm = 'granted';
      else if (op === 'disconnect') await env.SE.clearWatchDirectory();
      else if (op === 'reconnect') await env.SE.setWatchDirectory(env.handle);
      else if (op === 'autoOff') env.SE.setAutoSyncEnabled(false);
      else if (op === 'autoOn') env.SE.setAutoSyncEnabled(true);
      else if (op === 'watchStop') env.SE.stopWatching();
      else if (op === 'watchStart') env.SE.startWatching(pick([undefined, 3000]));
      else if (op === 'hide') env.setVisibility('hidden');
      else if (op === 'show') env.setVisibility('visible');
      else if (op === 'request') { ctl.requestResult = 'granted'; await env.SE.requestFolderPermission().catch(e => env.trace.push('request failed ' + e.message)); ctl.requestResult = null; }
    } catch (e) { env.trace.push('op threw ' + e.message); }
    await env.flush(3);
  }
  // Drain: release any held write and let every pending timer run, bounded.
  if (gate) { gate.release(); env.ungateWrites(); }
  ctl.perm = 'granted';
  env.SE.stopWatching();
  for (let i = 0; i < 12 && env.clock.pendingCount(); i++) { await env.clock.advanceToNext(); await env.flush(20); }
  await env.flush(20);
  env.trace.push('end pending=' + JSON.stringify(env.clock.pending()) + ' listeners=' + env.visListeners.length + ' diagnostics=' + JSON.stringify(env.SE.getDiagnostics()));
  env.dispose();
  return env.trace;
}

// The public facade (including the _test hooks) must be exactly the same set of names with the same types.
function facade(side) {
  const env = createEnvironment({ readSource: reader(side) });
  const shape = o => Object.keys(o).sort().map(k => k + ':' + typeof o[k] + (k === '_test' ? '{' + Object.keys(o[k]).sort().join(',') + '}' : '')).join(' ');
  const out = shape(env.SE) + ' | globals ' + Object.keys(env.ctx).filter(k => /^Sync/.test(k)).sort().join(',');
  env.dispose();
  return out;
}

(async () => {
  const fb = facade('base'), fh = facade('head');
  const names = s => s.split(' | ')[0].split(' ').length;
  console.log('SyncEngine facade: ' + names(fb) + ' members on base, ' + names(fh) + ' on head: ' + (fb.split(' | ')[0] === fh.split(' | ')[0] ? 'identical' : 'DIFFERENT'));
  console.log('Sync* globals  base: ' + fb.split(' | ')[1].replace('globals ', '') + '\n               head: ' + fh.split(' | ')[1].replace('globals ', ''));
  if (fb.split(' | ')[0] !== fh.split(' | ')[0]) process.exit(1);
  let bad = 0, lines = 0, writes = 0, followUps = 0;
  for (let seed = 1; seed <= SEQUENCES; seed++) {
    const a = await play('base', seed), b = await play('head', seed);
    lines += a.length; writes += a.filter(l => /handle\.write$/.test(l)).length;
    followUps += a.filter(l => /setTimeout (?!2000$)\d+$/.test(l)).length;
    const same = a.length === b.length && a.every((l, i) => l === b[i]);
    if (!same) {
      bad++;
      const i = a.findIndex((l, k) => l !== b[k]);
      console.log('seed ' + seed + ' differs at line ' + i + '\n  base: ' + a[i] + '\n  head: ' + b[i]);
      if (bad >= 5) break;
    }
  }
  console.log(SEQUENCES + ' sequences x ' + OPS + ' ops vs ' + baseRef.slice(0, 7) + ': ' + (SEQUENCES - bad) + ' identical, ' + bad + ' different (' + lines + ' trace lines, ' + writes + ' writes, ' + followUps + ' cooldown-delayed timers on the base side)');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
