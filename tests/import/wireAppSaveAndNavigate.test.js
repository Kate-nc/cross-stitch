/* tests/import/wireAppSaveAndNavigate.test.js
 *
 * Regression tests for the "Use this pattern" import action:
 *   - Pattern is saved to ProjectStorage before resolving.
 *   - When the destination URL matches the page the user is already on,
 *     no window.location navigation is triggered (this was the
 *     full-page-reload bug that hid the import success).
 *   - When the destination is a different page, navigation does fire.
 *   - A success toast is shown either way.
 */

const path = require('path');

function loadWireApp(href) {
  jest.resetModules();
  const win = {};
  // location stub — assignments to .href are recorded but do nothing.
  let assigned = null;
  win.location = {
    pathname: '/' + (href || 'home.html'),
    href: 'http://localhost/' + (href || 'home.html'),
  };
  Object.defineProperty(win.location, 'href', {
    configurable: true,
    get() { return this._href; },
    set(v) { assigned = v; this._href = v; },
  });
  win.location._href = 'http://localhost/' + (href || 'home.html');

  const toastCalls = [];
  win.Toast = { show: (opts) => { toastCalls.push(opts); } };

  const saved = [];
  win.ProjectStorage = {
    save: jest.fn((p) => { saved.push(p); return Promise.resolve(p.id); }),
    setActiveProject: jest.fn(),
    clearActiveProject: jest.fn(),
    newId: () => 'proj_test_' + Math.random().toString(36).slice(2, 7),
  };
  win.ImportEngine = {};

  global.window = win;
  global.document = { createElement: () => ({ appendChild() {}, addEventListener() {}, click() {} }), body: { appendChild() {} } };
  global.localStorage = { setItem: () => {}, getItem: () => null };

  // Load the file under test (clean require cache via resetModules above).
  require(path.resolve(__dirname, '..', '..', 'import-engine', 'wireApp.js'));

  return { win, toastCalls, saved, getAssigned: () => assigned };
}

describe('wireApp.saveAndNavigate', () => {
  const baseProject = () => ({
    v: 8, w: 10, h: 10, name: 'Test pattern',
    pattern: [], settings: { fabricCt: 14 },
  });

  it('saves the pattern via ProjectStorage and resolves with its id', async () => {
    const ctx = loadWireApp('home.html');
    const out = await ctx.win.ImportEngine.saveAndNavigate(baseProject(), {});
    expect(ctx.win.ProjectStorage.save).toHaveBeenCalledTimes(1);
    expect(out.action).toBe('confirm');
    expect(out.id).toMatch(/^proj_/);
    expect(ctx.saved[0].id).toBe(out.id);
  });

  it('does NOT navigate when destination is the current page (home → home)', async () => {
    const ctx = loadWireApp('home.html');
    await ctx.win.ImportEngine.saveAndNavigate(baseProject(), {});
    // navigateTo defaults to home.html; user is already on home.html
    // → must not assign window.location.href
    expect(ctx.getAssigned()).toBeNull();
  });

  it('shows a success toast on save', async () => {
    const ctx = loadWireApp('home.html');
    await ctx.win.ImportEngine.saveAndNavigate(baseProject(), {});
    expect(ctx.toastCalls.length).toBe(1);
    expect(ctx.toastCalls[0].type).toBe('success');
    expect(ctx.toastCalls[0].message).toContain('Test pattern');
  });

  it('does navigate when destination differs from the current page', async () => {
    const ctx = loadWireApp('home.html');
    await ctx.win.ImportEngine.saveAndNavigate(baseProject(), { navigateTo: 'stitch.html' });
    expect(ctx.getAssigned()).toBe('stitch.html');
  });

  it('respects opts.navigate=false', async () => {
    const ctx = loadWireApp('stitch.html');
    await ctx.win.ImportEngine.saveAndNavigate(baseProject(), { navigateTo: 'home.html', navigate: false });
    expect(ctx.getAssigned()).toBeNull();
  });

  it('isCurrentPage handles trailing slashes and query strings', () => {
    const ctx = loadWireApp('home.html');
    const fn = ctx.win.ImportEngine._isCurrentPage;
    expect(fn('home.html')).toBe(true);
    expect(fn('home.html?x=1')).toBe(true);
    expect(fn('/home.html')).toBe(true);
    expect(fn('stitch.html')).toBe(false);
  });

  it('shows an error toast if ProjectStorage.save rejects', async () => {
    const ctx = loadWireApp('home.html');
    ctx.win.ProjectStorage.save = jest.fn(() => Promise.reject(new Error('disk full')));
    await expect(
      ctx.win.ImportEngine.saveAndNavigate(baseProject(), {})
    ).rejects.toThrow('disk full');
    expect(ctx.toastCalls.length).toBe(1);
    expect(ctx.toastCalls[0].type).toBe('error');
    expect(ctx.toastCalls[0].message).toContain('disk full');
    expect(ctx.win.ProjectStorage.clearActiveProject).toHaveBeenCalled();
  });
});
