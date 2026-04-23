#!/usr/bin/env node
// scripts/install-hooks.js — Configure Git to use the repo-local hook
// directory so the terminology lint runs automatically on every commit.
//
// Phase 5: prefers Husky (when installed as a devDependency) and falls back
// to the bundled .githooks/ directory when Husky is not available. Outside a
// Git working tree (e.g. CI tarballs) the script prints a copy-pasteable
// one-liner the user can run themselves and then exits 0 so `npm install`
// still succeeds.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FALLBACK_HOOK_PATH = '.githooks';
const HUSKY_DIR = '.husky';

function isGitRepo() {
  try {
    execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

function huskyAvailable() {
  try {
    require.resolve('husky');
    return true;
  } catch (_) { return false; }
}

if (!isGitRepo()) {
  // npm install can run anywhere (e.g. CI tarball); print a recovery hint and
  // exit 0 so install never fails just because hooks couldn't be wired up.
  console.log('install-hooks: not inside a Git working tree — skipping hook install.');
  console.log('             To enable hooks later (after `git init`), run:');
  console.log(huskyAvailable()
    ? `             git config core.hooksPath ${HUSKY_DIR}`
    : `             git config core.hooksPath ${FALLBACK_HOOK_PATH}`);
  process.exit(0);
}

// Prefer Husky when present so future hooks can be added under .husky/ and
// share Husky's bypass / debugging conventions. We don't actually need to run
// the `husky` binary — its only job at install time is to set core.hooksPath
// and chmod the hook scripts. Doing that ourselves avoids fragility around
// Husky's CLI changing between versions (v8 used `husky install`, v9 changed
// to a bare `husky` invocation, etc.).
if (huskyAvailable() && fs.existsSync(HUSKY_DIR)) {
  try {
    execSync(`git config core.hooksPath ${HUSKY_DIR}`, { stdio: 'inherit' });
    if (process.platform !== 'win32') {
      fs.readdirSync(HUSKY_DIR).forEach(function (name) {
        var p = path.join(HUSKY_DIR, name);
        try {
          if (fs.statSync(p).isFile()) fs.chmodSync(p, 0o755);
        } catch (_) {}
      });
    }
    console.log(`install-hooks: configured Git to use ${HUSKY_DIR}/ for hooks (Husky)`);
    process.exit(0);
  } catch (e) {
    console.warn('install-hooks: husky setup failed, falling back to .githooks/ —', e.message);
  }
}

if (!fs.existsSync(FALLBACK_HOOK_PATH)) {
  console.warn(`install-hooks: ${FALLBACK_HOOK_PATH} directory missing, skipping`);
  process.exit(0);
}

try {
  execSync(`git config core.hooksPath ${FALLBACK_HOOK_PATH}`, { stdio: 'inherit' });
  // chmod the hooks so they execute on Unix shells. No-op on Windows.
  if (process.platform !== 'win32') {
    fs.readdirSync(FALLBACK_HOOK_PATH).forEach(function (name) {
      try { fs.chmodSync(path.join(FALLBACK_HOOK_PATH, name), 0o755); } catch (_) {}
    });
  }
  console.log(`install-hooks: configured Git to use ${FALLBACK_HOOK_PATH}/ for hooks`);
} catch (e) {
  console.warn('install-hooks: failed to configure hooksPath —', e.message);
}
