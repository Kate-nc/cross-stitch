// Vercel function for the sync relay. See api/_relay-core.js for what it
// stores and docs/sync-relay.md for setting up its Upstash Redis store.
'use strict';
const { handle, MAX_FILE_BYTES } = require('./_relay-core');
const { upstashStore } = require('./_relay-store');

let store = null;

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || '';
}

// Shared by the Vercel function and the local dev server.
async function serve(req, res, storeOverride) {
  const s = storeOverride || store || (store = upstashStore(process.env));
  const send = (status, body, headers) => {
    const h = Object.assign({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, headers || {});
    if (body && !Buffer.isBuffer(body)) { body = Buffer.from(JSON.stringify(body)); h['Content-Type'] = 'application/json'; }
    res.writeHead(status, h);
    res.end(body || undefined);
  };
  if (!s) return send(503, { error: 'not-configured' });
  const url = new URL(req.url, 'http://relay.local');
  const query = Object.fromEntries(url.searchParams);
  let body = null;
  if (req.method === 'PUT' || req.method === 'POST') {
    body = await readBody(req, MAX_FILE_BYTES + 1);
    if (body === null) return send(413, { error: 'too-large' });
  }
  const out = await handle(s, { method: req.method, op: query.op, query, headers: req.headers, body, ip: clientIp(req) });
  send(out.status, out.body, out.headers);
}

module.exports = (req, res) => serve(req, res);
module.exports.serve = serve;
