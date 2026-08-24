// INT-7 Phase B-2 — ProjectStorage.saveChecked() stale-read detection.
//
// Structural assertions guard the shape of the new API (discriminated result
// object, comparison rules, conflict reason). Behavioural assertions extract
// the function from source and exercise it against a fake `this` with mocked
// get/save + a controllable CrossTabCoord stub, so the conflict decision is
// covered end-to-end without spinning up IndexedDB.

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'project-storage.js'), 'utf8');

// ────────────────────────────────────────────────────────────────────────────
// Structural shape — keeps the public contract stable.
// ────────────────────────────────────────────────────────────────────────────

describe('INT-7 Phase B-2: saveChecked() structural shape', () => {
  test('declares an async saveChecked(project) method', () => {
    expect(SRC).toMatch(/async\s+saveChecked\(project\)\s*\{/);
  });
  test('short-circuits projects with no id (delegates to save → ok)', () => {
    expect(SRC).toMatch(/!project\.id[\s\S]{0,200}return\s*\{\s*ok:\s*true,\s*id:\s*id\s*\}/);
  });
  test('queries CrossTabCoord.getSeen for the baseline', () => {
    expect(SRC).toMatch(/window\.CrossTabCoord\.getSeen\(project\.id\)/);
  });
  test('only checks freshness when baseline is a numeric lastWriteAt', () => {
    expect(SRC).toMatch(/typeof seen\.lastWriteAt === 'number'/);
  });
  test('conflict requires (a) current.lastWriteAt > seen.lastWriteAt AND (b) different tab id', () => {
    expect(SRC).toMatch(/current\.lastWriteAt > seen\.lastWriteAt/);
    expect(SRC).toMatch(/current\.lastWriteTabId !== seen\.lastWriteTabId/);
  });
  test('conflict result carries reason="conflict" + id + remoteWriteAt + remoteWriteTabId', () => {
    expect(SRC).toMatch(/reason:\s*'conflict'[\s\S]{0,300}remoteWriteAt:\s*current\.lastWriteAt[\s\S]{0,200}remoteWriteTabId:\s*current\.lastWriteTabId/);
  });
  test('success path always returns { ok: true, id }', () => {
    // Two return-paths: short-circuit + fall-through. Both must yield ok:true.
    const okMatches = SRC.match(/return\s*\{\s*ok:\s*true,\s*id:\s*id\s*\}/g) || [];
    expect(okMatches.length).toBeGreaterThanOrEqual(2);
  });
  test('keeps save() call-compatible — project stays the first parameter', () => {
    // save() gained an optional trailing `options` bag (sync writes pass
    // { preserveUpdatedAt: true }). That is additive: every existing
    // single-argument call site behaves exactly as before. What must not
    // change is `project` remaining the first positional parameter.
    expect(SRC).toMatch(/async\s+save\(project(?:,\s*\w+)?\)\s*\{/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Behavioural — extract the function and exercise it.
// ────────────────────────────────────────────────────────────────────────────

function extractSaveChecked() {
  // Pull the method body out of project-storage.js by locating the
  // `async saveChecked(project) {` opener and brace-matching to its close.
  const start = SRC.indexOf('async saveChecked(project) {');
  expect(start).toBeGreaterThan(-1);
  let depth = 0, i = SRC.indexOf('{', start), end = -1;
  for (; i < SRC.length; i++) {
    const ch = SRC[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  expect(end).toBeGreaterThan(-1);
  const body = SRC.slice(SRC.indexOf('{', start) + 1, end);
  // Wrap it as a plain async function bound via .call(thisArg).
  // The body references `window` from outer scope, so we accept it as a
  // closure variable.
  return new Function('project', '__win', 'var window = __win; return (async () => {' + body + '})();');
}

function mkProject(overrides) {
  return Object.assign({
    id: 'proj_x',
    pattern: [],
    settings: { fabricCt: 14 }
  }, overrides || {});
}

describe('INT-7 Phase B-2: saveChecked() runtime decisions', () => {
  let fn;
  beforeAll(() => { fn = extractSaveChecked(); });

  function run(thisArg, project, win) {
    return fn.call(thisArg, project, win);
  }

  function mkThis(overrides) {
    return Object.assign({
      _deletedIds: new Set(),
      get: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue('proj_x')
    }, overrides || {});
  }

  test('no id → delegates to save() and returns { ok: true, id }', async () => {
    const ctx = mkThis({ save: jest.fn().mockResolvedValue('proj_new') });
    const res = await run(ctx, mkProject({ id: undefined }), { CrossTabCoord: { getSeen: () => null } });
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, id: 'proj_new' });
  });

  test('null project → throws explicit TypeError and does not call save()', async () => {
    const ctx = mkThis();
    await expect(run(ctx, null, { CrossTabCoord: { getSeen: () => null } }))
      .rejects.toThrow('ProjectStorage.saveChecked: project is required');
    expect(ctx.save).not.toHaveBeenCalled();
  });

  test('deleted-in-session id → delegates to save (which itself short-circuits)', async () => {
    const ctx = mkThis({
      _deletedIds: new Set(['proj_x']),
      save: jest.fn().mockResolvedValue('proj_x')
    });
    const res = await run(ctx, mkProject(), { CrossTabCoord: { getSeen: () => null } });
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  test('no baseline (never loaded) → saves through, no conflict possible', async () => {
    const ctx = mkThis();
    const res = await run(ctx, mkProject(), { CrossTabCoord: { getSeen: () => null } });
    expect(ctx.get).not.toHaveBeenCalled();
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, id: 'proj_x' });
  });

  test('baseline matches in-IDB lastWriteAt → no conflict, saves through', async () => {
    const ctx = mkThis({
      get: jest.fn().mockResolvedValue({ id: 'proj_x', lastWriteAt: 1000, lastWriteTabId: 'tab-other' })
    });
    const win = { CrossTabCoord: { getSeen: () => ({ lastWriteAt: 1000, lastWriteTabId: 'tab-other' }) } };
    const res = await run(ctx, mkProject(), win);
    expect(ctx.get).toHaveBeenCalledWith('proj_x');
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: true, id: 'proj_x' });
  });

  test('baseline older than IDB but same tab id → not a conflict (we wrote it ourselves)', async () => {
    const ctx = mkThis({
      get: jest.fn().mockResolvedValue({ id: 'proj_x', lastWriteAt: 2000, lastWriteTabId: 'tab-self' })
    });
    const win = { CrossTabCoord: { getSeen: () => ({ lastWriteAt: 1000, lastWriteTabId: 'tab-self' }) } };
    const res = await run(ctx, mkProject(), win);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  test('baseline older than IDB AND different tab id → CONFLICT, no save', async () => {
    const remote = { id: 'proj_x', lastWriteAt: 2000, lastWriteTabId: 'tab-other' };
    const ctx = mkThis({
      get: jest.fn().mockResolvedValue(remote),
      save: jest.fn().mockResolvedValue('proj_x')
    });
    const win = { CrossTabCoord: { getSeen: () => ({ lastWriteAt: 1000, lastWriteTabId: 'tab-self' }) } };
    const res = await run(ctx, mkProject(), win);
    expect(ctx.save).not.toHaveBeenCalled();
    expect(res).toEqual({
      ok: false,
      reason: 'conflict',
      id: 'proj_x',
      remoteWriteAt: 2000,
      remoteWriteTabId: 'tab-other'
    });
  });

  test('in-IDB record lacks lastWriteAt (legacy) → no conflict, saves through', async () => {
    const ctx = mkThis({
      get: jest.fn().mockResolvedValue({ id: 'proj_x' })
    });
    const win = { CrossTabCoord: { getSeen: () => ({ lastWriteAt: 1000, lastWriteTabId: 'tab-self' }) } };
    const res = await run(ctx, mkProject(), win);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  test('CrossTabCoord missing entirely → safe fallthrough, saves through', async () => {
    const ctx = mkThis();
    const res = await run(ctx, mkProject(), {}); // no CrossTabCoord on window
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });

  test('get() throwing is swallowed → falls through to save', async () => {
    const ctx = mkThis({
      get: jest.fn().mockRejectedValue(new Error('idb down'))
    });
    const win = { CrossTabCoord: { getSeen: () => ({ lastWriteAt: 1000, lastWriteTabId: 'tab-self' }) } };
    const res = await run(ctx, mkProject(), win);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });
});
