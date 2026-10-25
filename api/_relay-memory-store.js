// In-memory stand-in for the relay's Upstash Redis, for tests and local
// development (node serve.js). It implements the few commands the relay uses
// and runs the relay's Lua scripts with fengari, a Lua VM in JavaScript, so
// tests exercise the same scripts production runs. Not used on Vercel.
'use strict';
const { lua, lauxlib, lualib, to_luastring } = require('fengari');

// opts.yieldBetween (default true): each call waits one event-loop turn first.
// Fake-timer tests turn it off so everything settles through promises.
function memoryStore(clock, opts) {
  const yieldBetween = !(opts && opts.yieldBetween === false);
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
      case 'DEL': {
        let n = 0;
        for (const k of cmd.slice(1)) if (live(k)) { data.delete(k); n++; }
        return n;
      }
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
        const exists = Object.prototype.hasOwnProperty.call(h, cmd[2]);
        if (op === 'HSETNX' && exists) return 0;
        h[cmd[2]] = String(cmd[3]);
        return exists ? 0 : 1;
      }
      case 'HGET': return row && row.value[cmd[2]] !== undefined ? row.value[cmd[2]] : null;
      case 'HDEL': {
        if (!row || row.value[cmd[2]] === undefined) return 0;
        delete row.value[cmd[2]];
        if (!Object.keys(row.value).length) data.delete(key);
        return 1;
      }
      case 'HKEYS': return row ? Object.keys(row.value) : [];
      case 'HGETALL': return row ? Object.assign({}, row.value) : {};
      default: throw new Error('Unsupported command ' + op);
    }
  }

  // Runs a script the way Redis does: KEYS and ARGV tables, redis.call, nil
  // replies as false, integers as numbers. Synchronous, so it is atomic here
  // just as a script is on the server.
  function evalScript(script, keys, args) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    function pushTable(list) {
      lua.lua_createtable(L, list.length, 0);
      list.forEach((v, i) => { lua.lua_pushstring(L, to_luastring(String(v))); lua.lua_rawseti(L, -2, i + 1); });
    }
    function pushReply(v) {
      if (v === null || v === undefined) lua.lua_pushboolean(L, false);
      else if (typeof v === 'number') lua.lua_pushinteger(L, v);
      else if (Array.isArray(v)) pushTable(v);
      else lua.lua_pushstring(L, to_luastring(String(v)));
    }
    pushTable(keys); lua.lua_setglobal(L, to_luastring('KEYS'));
    pushTable(args); lua.lua_setglobal(L, to_luastring('ARGV'));
    lua.lua_createtable(L, 0, 1);
    lua.lua_pushjsfunction(L, function (L2) {
      const n = lua.lua_gettop(L2), cmd = [];
      for (let i = 1; i <= n; i++) cmd.push(lua.lua_tojsstring(L2, i));
      pushReply(run(cmd));
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('call'));
    lua.lua_setglobal(L, to_luastring('redis'));
    if (lauxlib.luaL_loadstring(L, to_luastring(script)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
      throw new Error('Lua error: ' + lua.lua_tojsstring(L, -1));
    }
    if (lua.lua_isinteger(L, -1)) return Number(lua.lua_tointeger(L, -1));
    if (lua.lua_isboolean(L, -1)) return lua.lua_toboolean(L, -1) ? 1 : null;
    return lua.lua_isnil(L, -1) ? null : lua.lua_tojsstring(L, -1);
  }

  // Each call yields once before running, as a network round trip would, so
  // concurrent requests interleave between commands the way they do in
  // production.
  const tick = () => yieldBetween ? new Promise(resolve => setImmediate(resolve)) : Promise.resolve();
  return {
    async command(cmd) { await tick(); return run(cmd); },
    async multi(cmds) { await tick(); return cmds.map(run); },
    async eval(script, keys, args) { await tick(); return evalScript(script, keys, args); },
    _data: data,
  };
}

module.exports = { memoryStore };
