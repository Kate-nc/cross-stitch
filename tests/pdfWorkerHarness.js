// Execute the production worker with local copies of its browser dependencies.
const fs = require('fs');
const path = require('path');
const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const ROOT = path.join(__dirname, '..');
function loadWorker(overrides = {}) {
  const scope = { PDFLib, fontkit, postMessage() {}, ...overrides };
  const importScripts = (...files) => files.forEach(file => {
    if (!file.startsWith('https:') && !file.includes('fontkit.umd')) {
      new Function('self', fs.readFileSync(path.join(ROOT, file), 'utf8'))(scope);
    }
  });
  return new Function('self', 'importScripts', 'atob',
    fs.readFileSync(path.join(ROOT, 'pdf-export-worker.js'), 'utf8') +
    ';return { buildPdf, get FONT_SPEC() {return FONT_SPEC;}, set FONT_SPEC(s) {FONT_SPEC=s;} };'
  )(scope, importScripts, atob);
}
function fixture(n, extras = {}) {
  const palette = Array.from({length:n}, (_, i) => ({ id:String(1000+i), type:'solid', name:'Thread '+i, rgb:[(i*61)%256,(i*97)%256,(i*131)%256] }));
  return {name:'Symbol capacity '+n, w:10, h:Math.ceil(n/10), pattern:palette.slice(), palette, ...extras};
}
module.exports = {loadWorker, fixture};
