// Fingerprint the deployed bytes. Run after all other generators; no runtime
// manifest fetch can accidentally pair a worker with another deployment.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
// --root <dir> fingerprints another copy of the site, e.g. the minified dist/
// built by scripts/build-dist.js. Defaults to the source checkout.
const rootFlag = process.argv.indexOf('--root');
const root = rootFlag === -1 ? __dirname : path.resolve(process.argv[rootFlag + 1]);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const file = path.join(root, 'sw.js');
const source = fs.readFileSync(file, 'utf8');
const begin = '// BEGIN GENERATED BUILD MANIFEST';
const end = '// END GENERATED BUILD MANIFEST';
const template = source.slice(0, source.indexOf(begin) + begin.length) + '\n' + source.slice(source.indexOf(end));
const context = {};
vm.runInNewContext(source.slice(0, source.indexOf(begin)), context);
const required = new Set(context.PRECACHE_URLS);
const pages = ['home.html', 'index.html', 'create.html', 'stitch.html', 'manager.html'];
const assets = {};
function addLocal(url) {
  assets[url] = { sha256: hash(fs.readFileSync(path.join(root, url))) };
}
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  // All eagerly loaded local scripts are required, including UX helpers. A page
  // that throws before mounting is not a working offline application.
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
    const url = match[1];
    if (!/^https?:/.test(url) && /\.(?:js|css)$/.test(url)) required.add('./' + url.replace(/^\.\//, ''));
    if (/^https:\/\/cdnjs/.test(url)) {
      const integrity = match[0].match(/integrity=["']([^"']+)["']/);
      if (integrity) { required.add(url); assets[url] = { integrity: integrity[1] }; }
    }
  }
}
for (const url of required) {
  if (url.startsWith('./')) addLocal(url);
  else if (!assets[url]) assets[url] = {}; // filled from pinned integrity below
}
// These features are not needed to open and edit/track a project. Still bind
// their bytes to this build so first use after a deployment cannot mix versions.
for (const url of ['./embroidery.html', './assets/fontkit.umd.min.js', './assets/qrcode-generator.js', './assets/jsqr.js', './pdf-export-worker.js', './creator/symbolFontSpec.js', './creator/pdfChartLayout.js']) addLocal(url);
// Optional PDF export library is pinned, separate from the core offline set.
const pinnedIntegrity = {
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.min.mjs': 'sha384-ZCFxELU1bvPx4evkYZ+4CxkApXPjaMxGVdWGuBjqwJe5aBdx8oSItpalx5V4e5Yh',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.mjs': 'sha384-VmWqohaIr0TG8Z7jJ6XGckbkf8x1MwGKHoL/4uTODvpnyUCDVNhQfrEmWTvzn0Os',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js': 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI',
};
for (const [url, integrity] of Object.entries(pinnedIntegrity)) assets[url] = { integrity };
for (const url of required) {
  if (!url.startsWith('./') && !assets[url].integrity) throw new Error('Missing pinned integrity: ' + url);
}
const manifest = JSON.stringify(assets, null, 2);
const build = hash(template + JSON.stringify([...required]) + manifest);
const output = template.replace(begin + '\n', begin + '\nvar BUILD_ID = ' + JSON.stringify(build) + ';\nvar REQUIRED_URLS = ' + JSON.stringify([...required], null, 2) + ';\nvar BUILD_ASSETS = ' + manifest + ';\n');
if (process.argv.includes('--check')) {
  if (source !== output) { console.error('sw.js fingerprints are stale. Run node build-sw.js after other build steps.'); process.exitCode = 1; }
} else if (source !== output) fs.writeFileSync(file, output);
