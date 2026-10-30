#!/usr/bin/env node
// scripts/build-dist.js — builds the deployable site into dist/.
//
//   node scripts/build-dist.js [outDir]      (default: dist)
//
// 1. Copies the files the app serves, leaving out tests, reports, docs,
//    build tools and the JSX sources of compiled/ (browsers never load them).
// 2. Minifies every JavaScript and CSS file with esbuild. The readable
//    sources stay in git; only the deployed copy is minified. Each minified
//    script gets an external source map so devtools still show the source.
// 3. Re-runs build-sw.js against the output, because the service worker
//    checks every cached file against a SHA-256 of its deployed bytes.
//
// Pattern Keeper-compatible PDF export must stay bit-stable, so its three
// files are copied byte-for-byte, including where creator/extras-bundle.js
// concatenates two of them (that bundle is minified section by section).
// assets/ (vendored libraries with licence headers, the symbol font) and
// sw.js are copied unchanged too.
//
// Vercel runs this as the build command and serves dist/ (vercel.json).
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

// JS: the syntax level the source already uses (optional chaining and ??),
// so the minifier never emits anything newer than what ships today. (Adding
// safari14 here makes esbuild refuse destructuring the source already uses.)
const JS_TARGET = 'es2020';
// CSS: keep shorthands such as `inset` from being introduced for older Safari.
const CSS_TARGET = ['chrome87', 'edge88', 'firefox78', 'safari14'];

// Top-level folders that are not part of the site.
const EXCLUDE_DIRS = new Set([
  'api',            // Vercel deploys api/ as functions from the project root
  'dist',
  'node_modules',
  'reports',
  'TestUploads',
  'tests',
  'proposals',
  'docs',
  'wiki',
  'scripts',
  'coverage',
  'playwright-report',
  'test-results',
]);

// Top-level files that are build tools or JSX sources compiled into compiled/.
const EXCLUDE_ROOT_FILES = new Set([
  'build-creator-bundle.js',
  'build-import-bundle.js',
  'build-runtime-js.js',
  'build-sw.js',
  'build-symbol-font.js',
  'run-build-and-tests.js',
  'serve.js',
  'package.json',
  'package-lock.json',
  'vercel.json',
  'tracker-app.js',
  'creator-main.js',
  'manager-app.js',
  'embroidery.js',
]);

const EXCLUDE_PATTERNS = [
  /\.(md|bat|log|tmp|bak|swp|swo)$/i,
  /^playwright.*\.config\.js$/,
  /^(test|debug|dump|run|inspect)_.*\.js$/, // ad-hoc scripts (.gitignore)
];

// Pattern Keeper PDF export: never altered (see AGENTS.md).
const VERBATIM_FILES = new Set([
  'pdf-export-worker.js',
  'creator/pdfChartLayout.js',
  'creator/pdfExport.js',
]);
// Section names, as written in build-creator-bundle.js markers, of those files.
const VERBATIM_SECTIONS = new Set(['pdfChartLayout.js', 'pdfExport.js']);
// Files that must stay byte-identical for other reasons.
//   sw.js: build-sw.js rewrites it between its BUILD MANIFEST markers.
const COPY_ONLY = new Set(['sw.js']);
// assets/ holds vendored libraries whose licence notices are plain comments
// (minifying would strip them) and the symbol font the PDF worker loads.
const COPY_ONLY_DIRS = ['assets/'];

const SECTION_MARKER = /^\/\* ─── (.+?) ─── \*\/$/m;

function isExcluded(rel) {
  const parts = rel.split('/');
  if (parts.some(p => p.startsWith('.'))) return true;
  if (parts.length > 1 && EXCLUDE_DIRS.has(parts[0])) return true;
  if (parts.length === 1 && (EXCLUDE_ROOT_FILES.has(rel) || EXCLUDE_DIRS.has(rel))) return true;
  const base = parts[parts.length - 1];
  if (EXCLUDE_PATTERNS.some(re => re.test(base))) return true;
  return false;
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? dir + '/' + entry.name : entry.name;
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function minifyJs(code, rel, withMap) {
  const result = esbuild.transformSync(code, {
    loader: 'js',
    minify: true,
    target: JS_TARGET,
    // Default ASCII output: non-ASCII characters stay as \u escapes, so the
    // minified files don't depend on the charset they are served with.
    legalComments: 'inline',
    sourcefile: path.basename(rel),
    sourcemap: withMap ? 'external' : false,
  });
  return result;
}

// creator/extras-bundle.js concatenates whole files behind marker comments.
// Minify each section on its own and copy protected sections untouched.
function minifyBundleSections(code, rel) {
  const pieces = code.split(SECTION_MARKER);
  // split() with a capture group: [banner, name1, body1, name2, body2, ...]
  let out = '';
  for (let i = 1; i < pieces.length; i += 2) {
    const name = pieces[i];
    const body = pieces[i + 1];
    if (VERBATIM_SECTIONS.has(name)) out += '/* ─── ' + name + ' ─── */' + body.replace(/\n+$/, '') + '\n';
    // Leading ';' so a section that starts with '(' can't run on from the one before.
    else out += (out ? ';' : '') + minifyJs(body, rel + ' (' + name + ')', false).code;
  }
  return out;
}

function hasVerbatimSection(code) {
  const re = new RegExp(SECTION_MARKER.source, 'gm');
  let m;
  while ((m = re.exec(code))) if (VERBATIM_SECTIONS.has(m[1])) return true;
  return false;
}

function build(outDir) {
  const out = path.resolve(ROOT, outDir || 'dist');
  if (out === ROOT || ROOT.startsWith(out + path.sep)) throw new Error('Refusing to build into ' + out);
  fs.rmSync(out, { recursive: true, force: true });

  const files = walk('', []);
  const stats = { files: 0, minified: 0, before: 0, after: 0, beforeGz: 0, afterGz: 0 };

  for (const rel of files) {
    const src = path.join(ROOT, rel);
    const dest = path.join(out, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const bytes = fs.readFileSync(src);
    let output = bytes;

    const isJs = /\.(m?js)$/.test(rel);
    const isCss = /\.css$/.test(rel);
    const alreadyMin = /\.min\.(m?js|css)$/.test(rel);
    const copyOnly = COPY_ONLY.has(rel) || COPY_ONLY_DIRS.some(dir => rel.startsWith(dir));
    if ((isJs || isCss) && !alreadyMin && !VERBATIM_FILES.has(rel) && !copyOnly) {
      const code = bytes.toString('utf8');
      try {
        if (isCss) {
          output = Buffer.from(esbuild.transformSync(code, { loader: 'css', minify: true, target: CSS_TARGET }).code);
        } else if (hasVerbatimSection(code)) {
          output = Buffer.from(minifyBundleSections(code, rel));
        } else {
          const result = minifyJs(code, rel, true);
          const mapName = path.basename(rel) + '.map';
          fs.writeFileSync(dest + '.map', result.map);
          output = Buffer.from(result.code + '//# sourceMappingURL=' + mapName + '\n');
        }
      } catch (err) {
        throw new Error('Could not minify ' + rel + ': ' + err.message);
      }
      stats.minified++;
      stats.before += bytes.length;
      stats.after += output.length;
      stats.beforeGz += zlib.gzipSync(bytes).length;
      stats.afterGz += zlib.gzipSync(output).length;
    }
    fs.writeFileSync(dest, output);
    stats.files++;
  }

  // Fingerprint the minified bytes into dist/sw.js.
  execFileSync(process.execPath, [path.join(ROOT, 'build-sw.js'), '--root', out], { stdio: 'inherit' });

  return { out, stats };
}

if (require.main === module) {
  const { out, stats } = build(process.argv[2]);
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`${path.relative(ROOT, out) || out}: ${stats.files} files, ${stats.minified} minified`);
  console.log(`  JS + CSS: ${kb(stats.before)} -> ${kb(stats.after)} raw, ${kb(stats.beforeGz)} -> ${kb(stats.afterGz)} gzipped`);
}

module.exports = { build, isExcluded, VERBATIM_FILES, VERBATIM_SECTIONS };
