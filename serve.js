// Minimal static file server with one rewrite for /home (matches the
// vercel.json production rewrite so dev behaviour aligns with prod).
// Usage: node serve.js [port]
const http = require('http');
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const argvPort = parseInt(process.argv[2], 10);
const envPort = parseInt(process.env.PORT, 10);
const PORT = !Number.isNaN(argvPort) ? argvPort : !Number.isNaN(envPort) ? envPort : 8000;
const ROOT = __dirname;
function acceptsGzipValue(headerValue) {
  if (!headerValue) return false;
  for (const part of headerValue.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const sections = token.split(';');
    const encoding = (sections[0] || '').trim().toLowerCase();
    if (encoding !== 'gzip') continue;
    let q = 1;
    for (let i = 1; i < sections.length; i++) {
      const param = sections[i].trim();
      if (!param) continue;
      const eq = param.indexOf('=');
      if (eq === -1) continue;
      const key = param.slice(0, eq).trim().toLowerCase();
      if (key !== 'q') continue;
      const value = param.slice(eq + 1).trim();
      const n = Number(value);
      if (!Number.isNaN(n)) q = n;
    }
    if (q > 0) return true;
  }
  return false;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};
const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.map']);

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  let decoded;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }

  // Tier 2 of the homepage-predominance audit — mirror the vercel.json
  // rewrite so `GET /home` (or `/home/`) serves the canonical landing
  // page in development too. `GET /` is handled by the directory branch
  // below.
  if (decoded === '/home' || decoded === '/home/') {
    decoded = '/home.html';
  }
  // /create is the dedicated Creator entry-point. Mirrors the vercel.json
  // rewrite so dev hits the same URL shape as production.
  if (decoded === '/create' || decoded === '/create/') {
    decoded = '/create.html';
  }

  const resolvedRoot = path.resolve(ROOT);
  const filePathResolved = path.resolve(ROOT, decoded.replace(/^\//, ''));

  if (!filePathResolved.startsWith(resolvedRoot + path.sep) && filePathResolved !== resolvedRoot) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  let filePath = filePathResolved;

  // Directory → home.html (UX-12 Phase 7: /home is the new default landing).
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const homePath = path.join(filePath, 'home.html');
    filePath = fs.existsSync(homePath) ? homePath : path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  };

  // Compress text responses and send a validator, mirroring what the
  // production host does. Without these the dev server is a poor stand-in for
  // production and any performance measurement taken against it is wrong in
  // two directions at once: transfer sizes look ~4x larger than they really
  // are, and `Cache-Control: no-cache` degrades to a full re-download on a
  // repeat visit instead of a 304.
  const stat = fs.statSync(filePath);
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  headers.ETag = etag;
  headers['Last-Modified'] = stat.mtime.toUTCString();

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    res.end();
    return;
  }

  const acceptsGzip = acceptsGzipValue(req.headers['accept-encoding']);
  const useGzip = acceptsGzip && COMPRESSIBLE.has(ext);
  if (useGzip) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }

  const stream = fs.createReadStream(filePath);

  stream.on('open', () => {
    res.writeHead(200, headers);
    if (useGzip) stream.pipe(zlib.createGzip()).pipe(res);
    else stream.pipe(res);
  });

  stream.on('error', (err) => {
    if (!res.headersSent) {
      const statusCode = err && err.code === 'ENOENT' ? 404 : 500;
      res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
      res.end(statusCode === 404 ? '404 Not Found' : '500 Internal Server Error');
      return;
    }

    res.destroy(err);
  });
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
});
