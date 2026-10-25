// Storage for the sync relay: Upstash Redis over its REST API in production,
// or an in-memory store for tests and local development (node serve.js).
// Only the handful of Redis commands the relay uses are needed.
'use strict';

// Upstash REST: POST a command as a JSON array; /multi-exec runs several
// atomically. The Vercel Marketplace integration sets either naming scheme.
function upstashStore(env) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  if (!url || !token) return null;
  async function post(path, payload) {
    const res = await fetch(url + path, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out) throw new Error((out && out.error) || ('Upstash HTTP ' + res.status));
    return out;
  }
  return {
    async command(cmd) {
      const out = await post('', cmd);
      if (out.error) throw new Error(out.error);
      return hashResult(cmd, out.result);
    },
    async multi(cmds) {
      const out = await post('/multi-exec', cmds);
      if (!Array.isArray(out)) throw new Error(out.error || 'Upstash transaction failed');
      return out.map((r, i) => { if (r.error) throw new Error(r.error); return hashResult(cmds[i], r.result); });
    },
  };
}

// The REST API returns HGETALL as a flat [field, value, ...] array.
function hashResult(cmd, result) {
  if (String(cmd[0]).toUpperCase() !== 'HGETALL' || !Array.isArray(result)) return result;
  const out = {};
  for (let i = 0; i + 1 < result.length; i += 2) out[result[i]] = result[i + 1];
  return out;
}

// In-memory Redis subset with expiry, for tests and local development.
function memoryStore(clock) {
  const now = clock || (() => Date.now());
  const data = new Map(); // key -> { value, expiresAt }
  function live(key) {
    const row = data.get(key);
    if (row && row.expiresAt && row.expiresAt <= now()) { data.delete(key); return null; }
    return row || null;
  }
  function run(cmd) {
    const op = String(cmd[0]).toUpperCase(), key = cmd[1];
    const row = live(key);
    switch (op) {
      case 'GET': return row && typeof row.value === 'string' ? row.value : null;
      case 'SET': {
        let nx = false, ex = null;
        for (let i = 3; i < cmd.length; i++) {
          const flag = String(cmd[i]).toUpperCase();
          if (flag === 'NX') nx = true;
          else if (flag === 'EX') ex = Number(cmd[++i]);
        }
        if (nx && row) return null;
        data.set(key, { value: String(cmd[2]), expiresAt: ex ? now() + ex * 1000 : 0 });
        return 'OK';
      }
      case 'DEL': return data.delete(key) && row ? 1 : 0;
      case 'EXPIRE': if (!row) return 0; row.expiresAt = now() + Number(cmd[2]) * 1000; return 1;
      case 'TTL': return row ? (row.expiresAt ? Math.ceil((row.expiresAt - now()) / 1000) : -1) : -2;
      case 'INCR': {
        const n = (row ? Number(row.value) : 0) + 1;
        if (row) row.value = String(n); else data.set(key, { value: String(n), expiresAt: 0 });
        return n;
      }
      case 'HSET': case 'HSETNX': {
        const h = row ? row.value : {};
        if (!row) data.set(key, { value: h, expiresAt: 0 });
        if (op === 'HSETNX' && Object.prototype.hasOwnProperty.call(h, cmd[2])) return 0;
        const isNew = !Object.prototype.hasOwnProperty.call(h, cmd[2]);
        h[cmd[2]] = String(cmd[3]);
        return isNew ? 1 : 0;
      }
      case 'HGET': return row && row.value[cmd[2]] !== undefined ? row.value[cmd[2]] : null;
      case 'HDEL': {
        if (!row || row.value[cmd[2]] === undefined) return 0;
        delete row.value[cmd[2]];
        if (!Object.keys(row.value).length) data.delete(key);
        return 1;
      }
      case 'HGETALL': return row ? Object.assign({}, row.value) : {};
      default: throw new Error('Unsupported command ' + op);
    }
  }
  return {
    async command(cmd) { return run(cmd); },
    async multi(cmds) { return cmds.map(run); },
    _data: data,
  };
}

module.exports = { upstashStore, memoryStore, hashResult };
