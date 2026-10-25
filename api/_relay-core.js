// Sync relay: a small blind store for stitchx's encrypted .csync files.
//
// Devices that pair share a "sync space". Each device keeps one file in it,
// encrypted on the device with a key the server never sees, and reads the
// other devices' files. The server only checks that a request carries the
// space's access token (derived from that key on the device) and keeps the
// bytes. Idle spaces expire after 30 days; any upload renews them.
//
// Storage is Redis-shaped (Upstash in production; an in-memory store that runs
// the same Lua scripts for tests and local development). Two keys per space:
//   rl:s:<space>  hash  _auth = sha256(token) hex, d:<device> = JSON {etag,size,at}
//   rl:d:<space>  hash  <device> = base64 of that device's file
// plus rl:p:<pairId> (a pairing bundle, 10 minutes) and rl:r:<kind>:<ip>
// (rate-limit counters).
//
// Every check-and-write runs as one Lua script, so two requests can never both
// pass the same condition (an ETag, the device limit) and overwrite each other.
// A poll costs one Redis command, which keeps the free Upstash tier usable.

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
const DEVICE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const PAIR_ID_RE = /^[0-9a-f]{64}$/;
const ETAG_HEADER_RE = /^"([0-9a-f]{64})"$/;

// KEYS: meta, data. ARGV: auth hash, device, if-match etag ('' = none),
// if-none-match ('1' = must not exist), entry JSON, base64 file, ttl, max devices.
const PUT_SCRIPT = `
local auth = redis.call('HGET', KEYS[1], '_auth')
if not auth then return 'space-missing' end
if auth ~= ARGV[1] then return 'forbidden' end
local field = 'd:' .. ARGV[2]
local cur = redis.call('HGET', KEYS[1], field)
if ARGV[4] == '1' and cur then return 'collision' end
if ARGV[3] ~= '' then
  if not cur then return 'collision' end
  if string.match(cur, '"etag":"(%x+)"') ~= ARGV[3] then return 'collision' end
end
if not cur then
  local n = 0
  for _, f in ipairs(redis.call('HKEYS', KEYS[1])) do
    if string.sub(f, 1, 2) == 'd:' then n = n + 1 end
  end
  if n >= tonumber(ARGV[8]) then return 'too-many-devices' end
end
redis.call('HSET', KEYS[2], ARGV[2], ARGV[6])
redis.call('HSET', KEYS[1], field, ARGV[5])
redis.call('EXPIRE', KEYS[1], ARGV[7])
redis.call('EXPIRE', KEYS[2], ARGV[7])
return 'ok'
`;

// KEYS: meta, data. ARGV: auth hash, device.
const LEAVE_SCRIPT = `
local auth = redis.call('HGET', KEYS[1], '_auth')
if not auth then return 'space-missing' end
if auth ~= ARGV[1] then return 'forbidden' end
redis.call('HDEL', KEYS[1], 'd:' .. ARGV[2])
redis.call('HDEL', KEYS[2], ARGV[2])
local left = 0
for _, f in ipairs(redis.call('HKEYS', KEYS[1])) do
  if string.sub(f, 1, 2) == 'd:' then left = left + 1 end
end
if left == 0 then redis.call('DEL', KEYS[1], KEYS[2]) end
return 'ok'
`;

// KEYS: meta. ARGV: auth hash, ttl. Only a new space gets an expiry here, so
// someone who knows a space ID but not its token cannot keep it alive.
const CREATE_SCRIPT = `
if redis.call('HSETNX', KEYS[1], '_auth', ARGV[1]) == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
  return 'created'
end
if redis.call('HGET', KEYS[1], '_auth') == ARGV[1] then return 'exists' end
return 'taken'
`;

// KEYS: counter. ARGV: window seconds. Counts and starts the window together.
const COUNT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n
`;

function sha256hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function fail(status, code) { return { status, body: { error: code } }; }
function json(status, body) { return { status, body }; }
const SCRIPT_ERRORS = { 'space-missing': 404, forbidden: 403, collision: 412, 'too-many-devices': 409 };

function bearer(headers) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(headers.authorization || '');
  return m ? m[1] : null;
}
const metaKey = space => 'rl:s:' + space;
const dataKey = space => 'rl:d:' + space;

async function rateLimited(store, kind, ip) {
  const rule = LIMITS[kind];
  if (!rule || !ip) return false;
  const count = Number(await store.eval(COUNT_SCRIPT, ['rl:r:' + kind + ':' + ip], [String(rule.window)]));
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
  const space = parseSpace(await store.command(['HGETALL', metaKey(spaceId)]));
  if (!space.auth) return { error: fail(404, 'space-missing') };
  if (!same(space.auth, sha256hex(token))) return { error: fail(403, 'forbidden') };
  return { space };
}

// req: { method, op, query, headers, body (Buffer|null), ip }
// Returns { status, body (object|Buffer|null), headers? }.
async function handle(store, req) {
  const q = req.query || {};
  const headers = req.headers || {};
  const token = bearer(headers);
  try {
    switch (req.op) {
      case 'create': {
        if (req.method !== 'POST') return fail(405, 'method');
        if (!SPACE_RE.test(q.space || '')) return fail(400, 'bad-space');
        if (!token) return fail(401, 'no-token');
        if (await rateLimited(store, 'create', req.ip)) return fail(429, 'rate-limited');
        // Already there with the same token: a harmless repeat. Anything else
        // is someone else's space.
        const result = await store.eval(CREATE_SCRIPT, [metaKey(q.space)], [sha256hex(token), String(TTL_SECONDS)]);
        if (result === 'created') return json(201, { ok: true });
        if (result === 'exists') return json(200, { ok: true });
        return fail(409, 'space-taken');
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
        const data = await store.command(['HGET', dataKey(q.space), q.device]);
        if (data == null) return fail(404, 'no-file');
        const body = Buffer.from(data, 'base64');
        // The ETag describes the bytes returned, even if the device wrote
        // again between the listing and this read.
        const etag = '"' + sha256hex(body) + '"';
        if (headers['if-none-match'] === etag) return { status: 304, body: null, headers: { ETag: etag } };
        return { status: 200, body, headers: { ETag: etag, 'Content-Type': 'application/octet-stream' } };
      }
      case 'put': {
        if (req.method !== 'PUT') return fail(405, 'method');
        if (!SPACE_RE.test(q.space || '')) return fail(400, 'bad-space');
        if (!DEVICE_RE.test(q.device || '')) return fail(400, 'bad-device');
        if (!token) return fail(401, 'no-token');
        const body = req.body;
        if (!Buffer.isBuffer(body) || !body.length) return fail(400, 'empty');
        if (body.length > MAX_FILE_BYTES) return fail(413, 'too-large');
        // One writer per device file: the condition catches a copied device
        // identity (two browsers writing the same file).
        const ifMatch = headers['if-match'], ifNone = headers['if-none-match'];
        const m = ifMatch ? ETAG_HEADER_RE.exec(ifMatch) : null;
        if (ifMatch && !m) return fail(412, 'collision');
        if (!m && ifNone !== '*') return fail(428, 'precondition-required');
        const etag = sha256hex(body);
        const entry = JSON.stringify({ etag, size: body.length, at: new Date().toISOString() });
        const result = await store.eval(PUT_SCRIPT, [metaKey(q.space), dataKey(q.space)], [
          sha256hex(token), q.device, m ? m[1] : '', m ? '' : '1', entry, body.toString('base64'), String(TTL_SECONDS), String(MAX_DEVICES),
        ]);
        if (result !== 'ok') return fail(SCRIPT_ERRORS[result] || 503, SCRIPT_ERRORS[result] ? result : 'store-unavailable');
        return { status: 200, body: { etag }, headers: { ETag: '"' + etag + '"' } };
      }
      case 'leave': {
        if (req.method !== 'DELETE') return fail(405, 'method');
        if (!SPACE_RE.test(q.space || '')) return fail(400, 'bad-space');
        if (!DEVICE_RE.test(q.device || '')) return fail(400, 'bad-device');
        if (!token) return fail(401, 'no-token');
        // The last device out takes the space with it.
        const result = await store.eval(LEAVE_SCRIPT, [metaKey(q.space), dataKey(q.space)], [sha256hex(token), q.device]);
        if (result !== 'ok') return fail(SCRIPT_ERRORS[result] || 503, SCRIPT_ERRORS[result] ? result : 'store-unavailable');
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

module.exports = { handle, TTL_SECONDS, PAIR_TTL_SECONDS, MAX_FILE_BYTES, MAX_DEVICES, PUT_SCRIPT, LEAVE_SCRIPT, COUNT_SCRIPT, CREATE_SCRIPT };
