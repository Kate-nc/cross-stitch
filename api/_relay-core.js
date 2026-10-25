// Sync relay: a small blind store for stitchx's encrypted .csync files.
//
// Devices that pair share a "sync space". Each device keeps one file in it,
// encrypted on the device with a key the server never sees, and reads the
// other devices' files. The server only checks that a request carries the
// space's access token (derived from that key on the device) and keeps the
// bytes. Idle spaces expire after 30 days; any write renews them.
//
// Storage is Redis-shaped (Upstash in production, an in-memory store for tests
// and local development):
//   rl:s:<space>          hash  _auth = sha256(token) hex, d:<device> = JSON {etag,size,at}
//   rl:f:<space>:<device> string base64 of the file
//   rl:p:<pairId>         string pairing bundle (encrypted on the device), 10 minutes
//   rl:r:<kind>:<ip>      counter for rate limits
//
// Each request is one function call and, for a poll, one Redis command, which
// keeps the free Upstash tier (500,000 commands a month) usable.

'use strict';
const crypto = require('crypto');

const TTL_SECONDS = 30 * 24 * 60 * 60;
const PAIR_TTL_SECONDS = 10 * 60;
// Vercel functions accept at most 4.5 MB per request or response.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_DEVICES = 10;
const MAX_PAIR_BLOB = 4096;
const LIMITS = {
  create: { max: 20, window: 24 * 60 * 60 },
  pair: { max: 30, window: 10 * 60 },
};

const SPACE_RE = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PAIR_ID_RE = /^[0-9a-f]{64}$/;
const ETAG_RE = /^"[0-9a-f]{64}"$/;

function sha256hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function fail(status, code, extra) { return Object.assign({ status, body: { error: code } }, extra || {}); }
function json(status, body) { return { status, body }; }

function bearer(headers) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(headers.authorization || '');
  return m ? m[1] : null;
}

async function rateLimited(store, kind, ip) {
  const rule = LIMITS[kind];
  if (!rule || !ip) return false;
  const key = 'rl:r:' + kind + ':' + ip;
  const count = Number(await store.command(['INCR', key]));
  if (count === 1) await store.command(['EXPIRE', key, String(rule.window)]);
  return count > rule.max;
}

function parseSpace(raw) {
  const out = { auth: null, devices: {} };
  if (!raw) return out;
  for (const [field, value] of Object.entries(raw)) {
    if (field === '_auth') out.auth = value;
    else if (field.startsWith('d:')) {
      try { out.devices[field.slice(2)] = JSON.parse(value); } catch (_) { /* skip a damaged row */ }
    }
  }
  return out;
}

// Loads the space and checks the token. Returns { space } or { error }.
async function authorise(store, spaceId, token) {
  if (!SPACE_RE.test(spaceId || '')) return { error: fail(400, 'bad-space') };
  if (!token) return { error: fail(401, 'no-token') };
  const space = parseSpace(await store.command(['HGETALL', 'rl:s:' + spaceId]));
  if (!space.auth) return { error: fail(404, 'space-missing') };
  if (!same(space.auth, sha256hex(token))) return { error: fail(403, 'forbidden') };
  return { space };
}

// req: { method, op, query, headers, body (Buffer|null), ip }
// Returns { status, body (object|Buffer), headers? }.
async function handle(store, req) {
  const q = req.query || {};
  const token = bearer(req.headers || {});
  try {
    switch (req.op) {
      case 'create': {
        if (req.method !== 'POST') return fail(405, 'method');
        if (!SPACE_RE.test(q.space || '')) return fail(400, 'bad-space');
        if (!token) return fail(401, 'no-token');
        if (await rateLimited(store, 'create', req.ip)) return fail(429, 'rate-limited');
        const key = 'rl:s:' + q.space, hash = sha256hex(token);
        const [created] = await store.multi([['HSETNX', key, '_auth', hash], ['EXPIRE', key, String(TTL_SECONDS)]]);
        if (Number(created) === 1) return json(201, { ok: true });
        // Already there: the same token is a harmless repeat (or a device
        // recreating an expired space); anything else is someone else's space.
        const existing = await store.command(['HGET', key, '_auth']);
        return same(existing, hash) ? json(200, { ok: true }) : fail(409, 'space-taken');
      }
      case 'list': {
        if (req.method !== 'GET') return fail(405, 'method');
        const a = await authorise(store, q.space, token);
        if (a.error) return a.error;
        return json(200, { devices: a.space.devices });
      }
      case 'get': {
        if (req.method !== 'GET') return fail(405, 'method');
        if (!DEVICE_RE.test(q.device || '')) return fail(400, 'bad-device');
        const a = await authorise(store, q.space, token);
        if (a.error) return a.error;
        const entry = a.space.devices[q.device];
        if (!entry) return fail(404, 'no-file');
        const etag = '"' + entry.etag + '"';
        if (req.headers['if-none-match'] === etag) return { status: 304, body: null, headers: { ETag: etag } };
        const data = await store.command(['GET', 'rl:f:' + q.space + ':' + q.device]);
        if (data == null) return fail(404, 'no-file');
        return { status: 200, body: Buffer.from(data, 'base64'), headers: { ETag: etag, 'Content-Type': 'application/octet-stream' } };
      }
      case 'put': {
        if (req.method !== 'PUT') return fail(405, 'method');
        if (!DEVICE_RE.test(q.device || '')) return fail(400, 'bad-device');
        const body = req.body;
        if (!Buffer.isBuffer(body) || !body.length) return fail(400, 'empty');
        if (body.length > MAX_FILE_BYTES) return fail(413, 'too-large');
        const a = await authorise(store, q.space, token);
        if (a.error) return a.error;
        const current = a.space.devices[q.device];
        // One writer per device file. The condition catches a copied device
        // identity (two browsers writing the same file), as WebDAV sync does.
        const ifMatch = req.headers['if-match'], ifNone = req.headers['if-none-match'];
        if (ifNone === '*' && current) return fail(412, 'collision');
        if (ifMatch && (!current || ifMatch !== '"' + current.etag + '"')) return fail(412, 'collision');
        if (!ifMatch && ifNone !== '*') return fail(428, 'precondition-required');
        if (!current && Object.keys(a.space.devices).length >= MAX_DEVICES) return fail(409, 'too-many-devices');
        const etag = sha256hex(body);
        const entry = { etag, size: body.length, at: new Date().toISOString() };
        const ttl = String(TTL_SECONDS);
        const cmds = [
          ['SET', 'rl:f:' + q.space + ':' + q.device, body.toString('base64'), 'EX', ttl],
          ['HSET', 'rl:s:' + q.space, 'd:' + q.device, JSON.stringify(entry)],
          ['EXPIRE', 'rl:s:' + q.space, ttl],
        ];
        // Activity by any device keeps every device's file alive.
        for (const other of Object.keys(a.space.devices)) {
          if (other !== q.device) cmds.push(['EXPIRE', 'rl:f:' + q.space + ':' + other, ttl]);
        }
        await store.multi(cmds);
        return { status: 200, body: { etag }, headers: { ETag: '"' + etag + '"' } };
      }
      case 'leave': {
        if (req.method !== 'DELETE') return fail(405, 'method');
        if (!DEVICE_RE.test(q.device || '')) return fail(400, 'bad-device');
        const a = await authorise(store, q.space, token);
        if (a.error) return a.error;
        const cmds = [['HDEL', 'rl:s:' + q.space, 'd:' + q.device], ['DEL', 'rl:f:' + q.space + ':' + q.device]];
        // The last device out takes the space with it.
        if (Object.keys(a.space.devices).filter(d => d !== q.device).length === 0) cmds.push(['DEL', 'rl:s:' + q.space]);
        await store.multi(cmds);
        return json(200, { ok: true });
      }
      case 'pair-put': {
        if (req.method !== 'POST') return fail(405, 'method');
        let input;
        try { input = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : ''); } catch (_) { return fail(400, 'bad-json'); }
        if (!input || !PAIR_ID_RE.test(input.id || '') || typeof input.blob !== 'string' || !input.blob || input.blob.length > MAX_PAIR_BLOB || !/^[A-Za-z0-9+/=]+$/.test(input.blob)) return fail(400, 'bad-pairing');
        if (await rateLimited(store, 'pair', req.ip)) return fail(429, 'rate-limited');
        const ok = await store.command(['SET', 'rl:p:' + input.id, input.blob, 'NX', 'EX', String(PAIR_TTL_SECONDS)]);
        return ok ? json(201, { ok: true, expiresIn: PAIR_TTL_SECONDS }) : fail(409, 'pairing-taken');
      }
      case 'pair-get': {
        if (req.method !== 'GET') return fail(405, 'method');
        if (!PAIR_ID_RE.test(q.id || '')) return fail(400, 'bad-pairing');
        if (await rateLimited(store, 'pair', req.ip)) return fail(429, 'rate-limited');
        const blob = await store.command(['GET', 'rl:p:' + q.id]);
        return blob ? json(200, { blob }) : fail(404, 'pairing-missing');
      }
      default:
        return fail(404, 'unknown-op');
    }
  } catch (e) {
    if (e && /OOM|maxmemory|max.*size/i.test(String(e.message))) return fail(507, 'storage-full');
    return fail(503, 'store-unavailable');
  }
}

module.exports = { handle, TTL_SECONDS, PAIR_TTL_SECONDS, MAX_FILE_BYTES, MAX_DEVICES, ETAG_RE };
