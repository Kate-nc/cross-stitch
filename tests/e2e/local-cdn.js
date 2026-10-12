// Optional: serve the CDN libraries (React, ReactDOM, pako, pdf-lib, pdf.js) from node_modules so
// the e2e specs run where cdnjs is unreachable (sandboxes, offline CI).
// Enabled by E2E_LOCAL_CDN=1; does nothing otherwise.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'node_modules');
const FILES = {
  'react.production.min.js': path.join(ROOT, 'react/umd/react.production.min.js'),
  'react-dom.production.min.js': path.join(ROOT, 'react-dom/umd/react-dom.production.min.js'),
  'pako.min.js': path.join(ROOT, 'pako/dist/pako.min.js'),
  // PDF import and print (loaded on demand). pdfjs-dist is the version the pages pin (4.2.67).
  'pdf-lib.min.js': path.join(ROOT, 'pdf-lib/dist/pdf-lib.min.js'),
  'pdf.min.mjs': path.join(ROOT, 'pdfjs-dist/build/pdf.min.mjs'),
  'pdf.worker.min.mjs': path.join(ROOT, 'pdfjs-dist/build/pdf.worker.min.mjs'),
};

async function installLocalCdn(context) {
  if (process.env.E2E_LOCAL_CDN !== '1') return;
  await context.route(/cdnjs\.cloudflare\.com/, route => {
    const file = FILES[route.request().url().split('/').pop()];
    if (file) return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) });
    return route.abort();
  });
  // The local copies are not byte-identical to the CDN's, so drop the SRI hashes.
  await context.route(/\/[^/?]*\.html(\?.*)?$/, async route => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace(/ integrity="[^"]*"/g, '');
    route.fulfill({ response: resp, body, headers: Object.assign({}, resp.headers(), { 'content-type': 'text/html; charset=utf-8' }) });
  });
}

module.exports = { installLocalCdn };
