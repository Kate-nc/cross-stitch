// Vercel function for the sync relay. See api/_relay-core.js for what it
// stores and docs/sync-relay.md for setting up its Upstash Redis store.
'use strict';
const { handle, MAX_FILE_BYTES } = require('./_relay-core');
const { upstashStore } = require('./_relay-store');

let store = null;

// Copies of the app on a static host (GitHub Pages) call this relay from
// another origin. Only the origins listed here may: set RELAY_ALLOWED_ORIGINS
// (comma-separated origins) on the deployment to replace the default. Every
// request still needs the space's access token, and the browser sends no
// cookies (the app uses credentials: 'omit'), so allowing an origin lets its
// pages talk to the relay and nothing more.
const DEFAULT_ALLOWED_ORIGINS = ['https://kate-nc.github.io'];

function allowedOrigins(env) {
  const raw = String(env.RELAY_ALLOWED_ORIGINS || '').trim();
  return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(req, env) {
  const origin = req.headers.origin;
  const h = { Vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    // The client reads a downloaded file's version from its ETag.
    h['Access-Control-Expose-Headers'] = 'ETag';
  }
  return h;
}

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
async function serve(req, res, storeOverride, env) {
  env = env || process.env;
  const cors = corsHeaders(req, env);
  const send = (status, body, headers) => {
    const h = Object.assign({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, cors, headers || {});
    if (body && !Buffer.isBuffer(body)) { body = Buffer.from(JSON.stringify(body)); h['Content-Type'] = 'application/json'; }
    res.writeHead(status, h);
    res.end(body || undefined);
  };
  // CORS preflight. Answered for any origin; the browser only proceeds when
  // Access-Control-Allow-Origin (set above for allowed origins) matches.
  if (req.method === 'OPTIONS') {
    return send(204, null, cors['Access-Control-Allow-Origin'] ? {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match',
      'Access-Control-Max-Age': '600',
    } : null);
  }
  const s = storeOverride || store || (store = upstashStore(process.env));
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
module.exports.allowedOrigins = allowedOrigins;
