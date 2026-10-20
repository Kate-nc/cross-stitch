#!/usr/bin/env node
// Run the existing concatenators in private copies of their inputs. Creator
// resolves paths from cwd; import-engine resolves them from the script directory.
// Keeping both together preserves those semantics without a new generator CLI.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BUNDLES = [
  {
    script: 'build-creator-bundle.js',
    directory: 'creator',
    outputs: ['creator/bundle.js', 'creator/extras-bundle.js', 'creator/import-wizard-bundle.js'],
  },
  {
    script: 'build-import-bundle.js',
    directory: 'import-engine',
    outputs: ['import-engine/bundle.js'],
  },
];

function checkBundle(bundle, root = ROOT) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchx-bundle-check-'));
  try {
    fs.copyFileSync(path.join(root, bundle.script), path.join(temporary, bundle.script));
    // Do not copy outputs: a generated-output symlink must never give the child
    // a route back into the checkout. Copy source symlinks as private contents.
    const outputs = new Set(bundle.outputs.map(file => path.resolve(root, file)));
    fs.cpSync(path.join(root, bundle.directory), path.join(temporary, bundle.directory), {
      recursive: true,
      dereference: true,
      filter: source => !outputs.has(path.resolve(source)),
    });
    execFileSync(process.execPath, [bundle.script], { cwd: temporary, stdio: 'pipe' });
    return bundle.outputs.filter(file => {
      const current = path.join(root, file);
      return !fs.existsSync(current) || !fs.readFileSync(current).equals(fs.readFileSync(path.join(temporary, file)));
    });
  } finally {
    // Only remove the root allocated above, never an input or caller destination.
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) {
  for (const bundle of BUNDLES) {
    const stale = checkBundle(bundle);
    if (stale.length) {
      stale.forEach(file => console.error(file + ' is stale'));
      console.error('Run: node ' + bundle.script);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log('Generated bundles are up to date');
}

module.exports = { BUNDLES, checkBundle };
