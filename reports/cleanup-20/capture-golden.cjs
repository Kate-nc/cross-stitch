// Captures tests/fixtures/syncScheduler.golden.json from a revision of the sync scripts.
//   node reports/cleanup-20/capture-golden.cjs [git-ref]
// Without a ref the working tree is used. The committed golden was captured from the base commit
// ca971d4ca3e284eb1b6594615f052281ee795475, before the export scheduler was extracted.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runAll } = require('../../tests/support/sync-scheduler-run');
const root = path.join(__dirname, '..', '..');
const ref = process.argv[2];
const readSource = ref
  ? f => { try { return execFileSync('git', ['show', ref + ':' + f], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return null; } }
  : f => { const p = path.join(root, f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
runAll(readSource).then(result => {
  const out = path.join(root, 'tests', 'fixtures', 'syncScheduler.golden.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 1) + '\n');
  console.log('wrote ' + out + ' (' + Object.keys(result).length + ' scenarios)');
}).catch(e => { console.error(e); process.exit(1); });
