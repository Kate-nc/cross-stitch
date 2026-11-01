/* offlineCdn.js — run the browser specs without internet access.
   ═══════════════════════════════════════════════════════════════════════════
   The app loads React, ReactDOM and pako from cdnjs. With PW_OFFLINE_CDN=1
   those requests are answered from node_modules (the same versions, so the
   pages' integrity hashes still match) and every other outside request is
   refused, so a spec runs in a sandbox with no network. Without the variable
   this does nothing and the specs behave exactly as before. */
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LOCAL = {
  'react.production.min.js': 'node_modules/react/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom/umd/react-dom.production.min.js',
  'pako.min.js': 'node_modules/pako/dist/pako.min.js',
};

async function routeCdnLocally(page) {
  if (process.env.PW_OFFLINE_CDN !== '1') return;
  await page.context().route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
    const url = route.request().url();
    const name = Object.keys(LOCAL).find((k) => url.endsWith('/' + k));
    if (!name) return route.abort();
    return route.fulfill({
      path: path.join(ROOT, LOCAL[name]),
      contentType: 'application/javascript',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

module.exports = { routeCdnLocally };
