/* compiled/*.compiled.js must match its source.

   The pages load the compiled bundles, so a source edit committed without
   `node build-runtime-js.js` ships stale code. main once carried a
   tracker-app.compiled.js 48 lines behind tracker-app.js. The build's
   --check mode compiles in memory and compares, ignoring line endings. */
const path = require('path');
const { spawnSync } = require('child_process');

test('compiled/ is up to date with its sources', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'build-runtime-js.js'), '--check'], { encoding: 'utf8' });
  expect(r.stderr + r.stdout).toMatch(/compiled\/ is up to date/);
  expect(r.status).toBe(0);
}, 60000);
