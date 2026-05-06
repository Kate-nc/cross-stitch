// Shared test helper for the regex+eval source-loading pattern used
// throughout this Jest suite (action plan §2D.5).
//
// The repo has no module system at runtime — production code lives in
// classic <script> tag globals. Most tests therefore extract a function
// from a source file by reading the raw JS, slicing it with a regex,
// and `eval()`-ing the result. The boilerplate `fs.readFileSync(path.join(
// __dirname, '..', '<file>'), 'utf8')` lives in 100+ test files; this
// helper centralises it.
//
// Usage:
//   const { loadSource, repoPath } = require('./_helpers/loadSource');
//   const src = loadSource('helpers.js');
//   const ihtml = loadSource('index.html');
//   const p = repoPath('creator', 'bundle.js');
//
// Notes:
//   - Path segments are joined relative to the repo root.
//   - `loadSource` always reads as UTF-8.
//   - The helper itself has no external dependencies and is excluded
//     from Jest's collectCoverage glob via the `_helpers/` underscore
//     prefix (Jest treats `_*` files as private by default).

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');

function repoPath(...segments) {
  return path.join(REPO_ROOT, ...segments);
}

function loadSource(relativePath) {
  return fs.readFileSync(repoPath(relativePath), 'utf8');
}

module.exports = { loadSource, repoPath, REPO_ROOT };
