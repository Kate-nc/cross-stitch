#!/usr/bin/env node
// scripts/install-hooks.js — Configure Git to use the repo-local Husky
// hook directory so the terminology lint runs automatically on every
// commit. Husky is a hard devDependency, so .husky/ is always present
// after `npm install`.
//
// Outside a Git working tree (e.g. CI tarballs that just unpack the
// package) we print a copy-pasteable one-liner the user can run later
// and exit 0 so `npm install` still succeeds.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HUSKY_DIR = '.husky';

function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

if (!isGitRepo()) {
  console.log('install-hooks: not inside a Git working tree — skipping hook install.');
  console.log(`             To enable hooks later (after \`git init\`), run:`);
  console.log(`             git config core.hooksPath ${HUSKY_DIR}`);
  process.exit(0);
}

if (!fs.existsSync(HUSKY_DIR)) {
  console.warn(`install-hooks: ${HUSKY_DIR}/ directory missing, skipping hook install`);
  process.exit(0);
}

try {
  execSync(`git config core.hooksPath ${HUSKY_DIR}`, { stdio: 'inherit' });
  // chmod the hooks so they execute on Unix shells. No-op on Windows.
  if (process.platform !== 'win32') {
    fs.readdirSync(HUSKY_DIR).forEach(function (name) {
      var p = path.join(HUSKY_DIR, name);
      try {
        if (fs.statSync(p).isFile()) fs.chmodSync(p, 0o755);
      } catch (_) {}
    });
  }
  console.log(`install-hooks: configured Git to use ${HUSKY_DIR}/ for hooks`);
} catch (e) {
  console.warn('install-hooks: failed to configure hooksPath —', e.message);
}
