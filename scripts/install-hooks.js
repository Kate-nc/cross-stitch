#!/usr/bin/env node
// scripts/install-hooks.js — Configure Git to use the repo-local .githooks
// directory so the terminology lint pre-commit hook runs automatically.
// Safe to run multiple times. Idempotent. Skips silently outside a Git repo.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = '.githooks';

function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

if (!isGitRepo()) {
  // npm install can run anywhere (e.g. CI tarball); silently skip.
  process.exit(0);
}

if (!fs.existsSync(HOOK_PATH)) {
  console.warn('install-hooks: .githooks directory missing, skipping');
  process.exit(0);
}

try {
  execSync(`git config core.hooksPath ${HOOK_PATH}`, { stdio: 'inherit' });
  // chmod the hooks so they execute on Unix shells. No-op on Windows.
  if (process.platform !== 'win32') {
    fs.readdirSync(HOOK_PATH).forEach(function (name) {
      try { fs.chmodSync(path.join(HOOK_PATH, name), 0o755); } catch (_) {}
    });
  }
  console.log(`install-hooks: configured Git to use ${HOOK_PATH}/ for hooks`);
} catch (e) {
  console.warn('install-hooks: failed to configure hooksPath —', e.message);
}
