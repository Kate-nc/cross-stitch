// CI rejects a pull request whose generated bundles are stale ("Run node build-creator-bundle.js locally and
// commit the result"), but `npm test` did not, so a Creator source edit could pass here and fail there
// (this happened on the first Phase 2 pull request). This runs the same builds and fails, without leaving
// anything changed, if a committed bundle would differ.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUNDLES = {
  'build-creator-bundle.js': ['creator/bundle.js', 'creator/extras-bundle.js', 'creator/import-wizard-bundle.js'],
  'build-import-bundle.js': ['import-engine/bundle.js']
};

for (const [script, outputs] of Object.entries(BUNDLES)) {
  test(`${outputs.join(', ')} match what ${script} produces`, () => {
    const before = outputs.map(f => fs.readFileSync(path.join(ROOT, f)));
    let stale = [];
    try {
      execFileSync('node', [script], { cwd: ROOT, stdio: 'ignore' });
      outputs.forEach((f, i) => { if (!fs.readFileSync(path.join(ROOT, f)).equals(before[i])) stale.push(f); });
    } finally {
      outputs.forEach((f, i) => fs.writeFileSync(path.join(ROOT, f), before[i]));   // leave the tree as it was
    }
    expect(stale).toEqual([]);   // if this fails: run `node ' + script + '` and commit the result
  });
}
