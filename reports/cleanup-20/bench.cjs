// Cost of the save-path entry point. triggerAutoExport runs after every project save; with a timer already pending it is
// the coalescing path (Promise.resolve + one comparison), which is where an extra call or allocation would show.
//   node reports/cleanup-20/bench.cjs [base-ref] [calls] [rounds]
const path = require('path'), fs = require('fs');
const { execFileSync } = require('child_process');
const { createEnvironment, DEFAULT_FILES } = require('../../tests/support/sync-scheduler-harness');
const root = path.join(__dirname, '..', '..');
const ref = process.argv[2] || 'ca971d4ca3e284eb1b6594615f052281ee795475', CALLS = Number(process.argv[3] || 200000), ROUNDS = Number(process.argv[4] || 7);
const src = {};
for (const f of DEFAULT_FILES) src[f] = {
  base: (() => { try { return execFileSync('git', ['show', ref + ':' + f], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } })(),
  head: fs.existsSync(path.join(root, f)) ? fs.readFileSync(path.join(root, f), 'utf8') : null };
async function round(side) {
  const env = createEnvironment({ readSource: f => src[f][side] });
  await env.connect(); env.SE.stopWatching();
  env.SE.triggerAutoExport(); await env.flush();           // arms the timer: everything after coalesces
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < CALLS; i++) env.SE.triggerAutoExport();
  await env.flush(2);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const timers = env.clock.pendingCount();
  env.dispose();
  return { ms, timers };
}
(async () => {
  const res = { base: [], head: [] };
  await round('base'); await round('head');                // warm-up
  for (let i = 0; i < ROUNDS; i++) for (const side of i % 2 ? ['head', 'base'] : ['base', 'head']) res[side].push(await round(side));
  const med = a => a.map(x => x.ms).sort((x, y) => x - y)[Math.floor(a.length / 2)];
  for (const s of ['base', 'head']) console.log(s.padEnd(5), 'median ' + med(res[s]).toFixed(1) + ' ms for ' + CALLS + ' coalesced saves; range ' + Math.min(...res[s].map(x => x.ms)).toFixed(1) + '-' + Math.max(...res[s].map(x => x.ms)).toFixed(1) + ' ms; timers pending after: ' + res[s][0].timers);
})();
