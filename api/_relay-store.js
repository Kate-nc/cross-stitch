// Storage for the sync relay in production: Upstash Redis over its REST API.
// Tests and local development use api/_relay-memory-store.js instead, which
// runs the same Lua scripts.
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
  async function command(cmd) {
    const out = await post('', cmd);
    if (out.error) throw new Error(out.error);
    return hashResult(cmd, out.result);
  }
  return {
    command,
    async multi(cmds) {
      const out = await post('/multi-exec', cmds);
      if (!Array.isArray(out)) throw new Error(out.error || 'Upstash transaction failed');
      return out.map((r, i) => { if (r.error) throw new Error(r.error); return hashResult(cmds[i], r.result); });
    },
    // A Lua script runs atomically on the server.
    eval(script, keys, args) {
      return command(['EVAL', script, String(keys.length)].concat(keys, args));
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

module.exports = { upstashStore, hashResult };
