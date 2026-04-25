// Minimal static file server — no clean-URL rewrites, no SPA fallback.
// Usage: node serve.js [port]
const http = require('http');
const fs   = require('fs');
const path = require('path');

const argvPort = parseInt(process.argv[2], 10);
const envPort = parseInt(process.env.PORT, 10);
const PORT = !Number.isNaN(argvPort) ? argvPort : !Number.isNaN(envPort) ? envPort : 8000;
const ROOT = __dirname;

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
  const stream = fs.createReadStream(filePath);

  stream.on('open', () => {
    res.writeHead(200, headers);
    stream.pipe(res);
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
