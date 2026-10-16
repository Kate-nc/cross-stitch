const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const source = fs.readFileSync('sw.js', 'utf8');
const build = {};
vm.runInNewContext(source.slice(0, source.indexOf('// Each build')), build);
test('committed fingerprints match all deployed application bytes', () => {
  for (const [url, asset] of Object.entries(build.BUILD_ASSETS)) {
    if (!url.startsWith('./')) continue;
    expect({ url, digest: crypto.createHash('sha256').update(fs.readFileSync(url)).digest('hex') }).toEqual({ url, digest: asset.sha256 });
  }
  execFileSync(process.execPath, ['build-sw.js', '--check']);
});
test('compiled entries, Stats and workers are part of the coherent offline application', () => {
  for (const url of ['compiled/creator-main.compiled.js', 'compiled/tracker-app.compiled.js', 'compiled/manager-app.compiled.js', 'stats-page.js', 'stats-activity.js', 'stats-insights.js', 'generate-worker.js', 'analysis-worker.js', 'import-engine/worker.js']) {
    expect(build.REQUIRED_URLS).toContain('./' + url);
  }
  expect(build.REQUIRED_URLS).not.toContain('./assets/fontkit.umd.min.js');
  expect(build.BUILD_ASSETS['./assets/fontkit.umd.min.js'].sha256).toMatch(/^[a-f0-9]{64}$/);
});
